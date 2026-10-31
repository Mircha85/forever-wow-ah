import { R2Service } from './r2';
import {
  decodeHistory,
  decodeRealmArchive,
  type HistoryIndex,
  type RealmArchiveIndex,
} from './realmArchive';

/**
 * A small cache of decoded per-realm archives.
 *
 * Decoding an archive means decompressing a few megabytes and walking its
 * records to index them. Doing that on every item click would add a
 * noticeable pause, so the decoded index is kept for a short while.
 *
 * The TTL matters as much as the cache: without it, an instance that
 * served a realm once would keep serving that snapshot for the rest of
 * its life, and the dashboard would show prices from whenever the instance
 * happened to start.
 */

/** How long a decoded archive is reused before it is fetched again. */
const TTL_MS = 60_000;

/** How many realms are kept decoded at once. */
const MAX_ENTRIES = 3;

export interface LoadedRealm {
  realm: RealmArchiveIndex;
  history: HistoryIndex | null;
}

interface CacheEntry extends LoadedRealm {
  loadedAt: number;
}

const CACHE = new Map<string, CacheEntry>();

function cacheKey(
  product: 'retail' | 'forever',
  region: 'eu' | 'us',
  realmId: number
): string {
  return `${product}/${region}/${realmId}`;
}

/** Empties the decoded-archive cache. Test helper. */
export function clearRealmCache(): void {
  CACHE.clear();
}

/**
 * Loads (or reuses) the canonical archives of one realm.
 *
 * Returns `null` when the realm has not been ingested at all — there is no
 * realm archive to serve.
 */
export async function loadRealmArchives(
  r2: R2Service,
  product: 'retail' | 'forever',
  region: 'eu' | 'us',
  realmId: number
): Promise<LoadedRealm | null> {
  const key = cacheKey(product, region, realmId);
  const cached = CACHE.get(key);
  const now = Date.now();
  if (cached && now - cached.loadedAt < TTL_MS) {
    // Refresh recency so the least recently used realm is the one evicted.
    CACHE.delete(key);
    CACHE.set(key, cached);
    return { realm: cached.realm, history: cached.history };
  }

  const [realmRaw, historyRaw] = await Promise.all([
    r2.getBin(R2Service.generateRealmKey(product, region, realmId)),
    r2.getBin(R2Service.generateHistoryKey(product, region, realmId)),
  ]);

  if (!realmRaw) return null;

  const realm = decodeRealmArchive(realmRaw);
  let history: HistoryIndex | null = null;
  if (historyRaw) {
    try {
      history = decodeHistory(historyRaw);
    } catch {
      // A history we cannot read is not fatal: the item view still works,
      // it just has no measured series or delta to show.
      history = null;
    }
  }

  CACHE.set(key, { realm, history, loadedAt: now });
  while (CACHE.size > MAX_ENTRIES) {
    const oldest = CACHE.keys().next();
    if (oldest.done) break;
    CACHE.delete(oldest.value);
  }

  return { realm, history };
}
