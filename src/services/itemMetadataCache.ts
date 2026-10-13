import { type WowItemMetadata } from '../types/auction';

/**
 * HMR-safe in-memory cache of `WowItemMetadata` keyed by itemId.
 *
 * Lives on `globalThis` so Next.js dev hot reloads do not wipe a session's
 * accumulated Blizzard lookups; clear with `clearMetadataCache()` from a
 * REPL / smoke test instead of reaching for a server restart.
 */
const META_CACHE = (globalThis as {
  __wowForeverMetaCache?: Map<number, WowItemMetadata>;
}).__wowForeverMetaCache ??= new Map<number, WowItemMetadata>();

/** Default upper bound on concurrent Blizzard item requests. */
const DEFAULT_CONCURRENCY = 5;

/** Default retry budget per itemId on transient Blizzard failures. */
const DEFAULT_MAX_RETRIES = 2;

/** Base wait between retries; doubled on each attempt up to a small cap. */
const RETRY_BASE_MS = 250;

/** Drop a single entry from the cache. Returns true if an entry was removed. */
export function deleteCachedMetadata(itemId: number): boolean {
  return META_CACHE.delete(itemId);
}

/** Wipe the entire cache. Useful for tests and emergency invalidation. */
export function clearMetadataCache(): void {
  META_CACHE.clear();
}

/** Read metadata that has already been warmed. */
export function getCachedMetadata(itemId: number): WowItemMetadata | undefined {
  return META_CACHE.get(itemId);
}

/** Inject a known-good metadata entry without a Blizzard round trip. */
export function setCachedMetadata(meta: WowItemMetadata): void {
  META_CACHE.set(meta.id, meta);
}

/** How many entries are currently cached. Test helper. */
export function metadataCacheSize(): number {
  return META_CACHE.size;
}

export interface WarmResult {
  /** Newly fetched metadata that succeeded and was inserted into the cache. */
  fetched: number;
  /** ItemIds that were already cached and skipped. */
  skipped: number;
  /** Permanent failures (404, no-credentials) — caller may want to log these. */
  failed: number;
  /** Retries that did not succeed within the budget. */
  retriedOut: number;
}

/**
 * Bulk-warm metadata for a list of itemIds with bounded concurrency and
 * retry-on-failure. The fetch function is injected so tests can swap it
 * without touching BlizzardService.
 *
 * Returns counts — the caller decides whether to surface a toast, a banner,
 * or just log the summary. The function NEVER throws on per-item failure;
 * any throwable is swallowed into `failed` / `retriedOut`.
 */
export async function warmMetadataForIds(
  fetchOne: (itemId: number) => Promise<WowItemMetadata | null>,
  itemIds: readonly number[],
  options: { concurrency?: number; maxRetries?: number } = {}
): Promise<WarmResult> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);

  const unique = Array.from(new Set(itemIds.filter((id) => Number.isFinite(id) && id > 0)));
  const result: WarmResult = { fetched: 0, skipped: 0, failed: 0, retriedOut: 0 };

  if (unique.length === 0) return result;

  let cursor = 0;
  const total = unique.length;

  const workers = Array.from({ length: concurrency }, async () => {
    while (cursor < total) {
      const idx = cursor++;
      const itemId = unique[idx];
      if (itemId === undefined) return;

      if (META_CACHE.has(itemId)) {
        result.skipped += 1;
        continue;
      }

      let attempt = 0;
      while (attempt <= maxRetries) {
        try {
          const meta = await fetchOne(itemId);
          if (meta) {
            META_CACHE.set(itemId, meta);
            result.fetched += 1;
            break;
          }
          // 404 / null is a permanent failure; do not retry.
          result.failed += 1;
          break;
        } catch {
          attempt += 1;
          if (attempt > maxRetries) {
            result.retriedOut += 1;
            break;
          }
          await sleep(RETRY_BASE_MS * 2 ** (attempt - 1));
        }
      }
    }
  });

  await Promise.all(workers);
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
