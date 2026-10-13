/**
 * Pure helpers used by the cached-data API routes to detect stale entries
 * left behind by the synthetic snapshot fallback.
 *
 * `R2Service.localMemoryCache` is a process-wide Map. When Blizzard OAuth
 * credentials are added to `.env.local` after the server has already booted
 * and populated the cache with synthetic data, every cache hit silently
 * serves the wrong numbers. Tracking the moment credentials were first
 * observed in this process lets us drop entries that pre-date it.
 */

/** Subset of an `R2Service` memory-cache entry the staleness predicate needs. */
export interface CacheEntryMeta {
  lastModified: Date;
}

/**
 * True if a cached entry was placed BEFORE credentials were first observed.
 *
 * Once Blizzard credentials are configured, any cache entry with
 * `lastModified` strictly older than `credsFirstSeenAt` is almost certainly
 * the synthetic snapshot filled in by the no-creds fallback path, so the
 * caller should treat it as a cache miss and refresh from Blizzard.
 */
export function isCacheEntryPreCreds(
  meta: CacheEntryMeta,
  credsFirstSeenAt: number
): boolean {
  return meta.lastModified.getTime() < credsFirstSeenAt;
}
