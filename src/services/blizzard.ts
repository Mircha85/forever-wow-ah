import { type BlizzardAuctionSnapshot, type WowItemMetadata, type ItemQuality } from '../types/auction';

/**
 * Map Blizzard `quality.type` strings to the numeric quality code the
 * existing `getQualityColor` family expects. Anything we don't recognise
 * lands on common (1) so the UI still renders something legible.
 */
const QUALITY_TYPE_TO_NUMBER: Record<string, ItemQuality> = {
  POOR: 0,
  COMMON: 1,
  UNCOMMON: 2,
  RARE: 3,
  EPIC: 4,
  LEGENDARY: 5,
  ARTIFACT: 6,
  HEIRLOOM: 7,
};

/** Generic icon used when we have not fetched a media asset for the item.
 *  Picked a neutral gold-coin icon rather than the literal "?" icon so
 *  the dashboard doesn't render as a wall of question marks during cold
 *  cache states.
 */
const PLACEHOLDER_ICON =
  'https://wow.zamimg.com/images/wow/icons/large/inv_misc_coin_01.jpg';

export interface BlizzardConfig {
  clientId?: string;
  clientSecret?: string;
  region?: 'eu' | 'us' | 'kr' | 'tw';
  namespace?: string;
  locale?: string;
}

/**
 * Outcome of a live fetch attempt.
 *
 * The `source` field is always `'blizzard_api'`; a missing-credentials
 * fetch fails loud via `BlizzardApiError` rather than silently returning
 * demo data.
 */
export type AuctionFetchResult = {
  snapshot: BlizzardAuctionSnapshot;
  source: 'blizzard_api';
  lastModified: string | null;
};

/**
 * A live Battle.net call that failed. Carries the HTTP status and any
 * server-provided retry hint so the API layer can answer with something
 * actionable instead of a generic 500.
 */
export class BlizzardApiError extends Error {
  public readonly status: number | undefined;
  public readonly retryAfterMs: number | undefined;
  public readonly realmId: number | undefined;
  public readonly detail: string | undefined;

  constructor(
    message: string,
    options: {
      status?: number;
      retryAfterMs?: number;
      realmId?: number;
      detail?: string;
    } = {}
  ) {
    super(message);
    this.name = 'BlizzardApiError';
    this.status = options.status;
    this.retryAfterMs = options.retryAfterMs;
    this.realmId = options.realmId;
    this.detail = options.detail;
  }
}

/** Longest we will sit on a 429 before giving up and reporting it. */
const MAX_RETRY_AFTER_MS = 10_000;
const RETRY_AFTER_CAP_MS = 3_000;
const REQUEST_TIMEOUT_MS = 15_000;
const TOKEN_REFRESH_SKEW_MS = 60_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `Retry-After` is either delta-seconds or an HTTP date. */
function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - Date.now());
}

export class BlizzardService {
  private clientId: string;
  private clientSecret: string;
  private region: string;
  private namespace: string;
  private itemNamespace: string;
  private locale: string;
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private lastModifiedCache = new Map<number, string>();

  constructor(config?: BlizzardConfig) {
    this.clientId = config?.clientId || process.env.BLIZZARD_CLIENT_ID || '';
    this.clientSecret = config?.clientSecret || process.env.BLIZZARD_CLIENT_SECRET || '';
    this.region = config?.region || process.env.BLIZZARD_REGION || 'eu';
    this.locale = config?.locale || process.env.BLIZZARD_LOCALE || 'en_US';

    // Auction namespace (live data, mutations). WoW: Forever is the
    // Anniversary line, served from `dynamic-classicann-{region}`. The
    // previous default was `dynamic-{region}` — the Retail namespace —
    // a request that succeeds against the wrong game rather than
    // failing, which is the worse outcome.
    this.namespace =
      config?.namespace ||
      process.env.BLIZZARD_NAMESPACE ||
      `dynamic-classicann-${this.region}`;

    // Item metadata namespace (static catalog). Lives separately from
    // the auction namespace because the auction API only ships items
    // currently in the live AH — many of which the static catalog still
    // knows about but the dynamic one returns 404 for.
    this.itemNamespace =
      (config as unknown as { itemNamespace?: string } | undefined)?.itemNamespace ||
      process.env.BLIZZARD_ITEM_NAMESPACE ||
      `static-${this.region}`;
  }

  /**
   * Check whether real API credentials are configured in the environment.
   */
  public hasCredentials(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /** Namespace this instance will query, for diagnostics and the status route. */
  public getNamespace(): string {
    return this.namespace;
  }

  public getRegion(): string {
    return this.region;
  }

  /**
   * Resolve a connected-realm id to its display name. Returns null when
   * Blizzard 404s or the call fails for any reason — callers fall back to
   * the numeric id as a label. Best-effort, never throws.
   */
  public async fetchConnectedRealmName(connectedRealmId: number): Promise<string | null> {
    if (!this.hasCredentials()) return null;
    const url =
      `https://${this.region}.api.blizzard.com/data/wow/connected-realm/${connectedRealmId}` +
      `?namespace=dynamic-${this.region}&locale=${this.locale}`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${await this.getAccessToken()}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { name?: string };
      return typeof data.name === 'string' ? data.name : null;
    } catch {
      return null;
    }
  }

  /**
   * Acquire or auto-refresh an OAuth2 client_credentials access token.
   */
  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.tokenExpiresAt > now + TOKEN_REFRESH_SKEW_MS) {
      return this.token;
    }

    if (!this.hasCredentials()) {
      throw new BlizzardApiError(
        'BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET is not set, so no OAuth token can be acquired.'
      );
    }

    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    let response: Response;
    try {
      response = await fetch('https://oauth.battle.net/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err: unknown) {
      throw new BlizzardApiError(
        `Could not reach the Battle.net OAuth endpoint: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new BlizzardApiError(
        `Battle.net rejected the client credentials (HTTP ${response.status}). ` +
          'Check BLIZZARD_CLIENT_ID / BLIZZARD_CLIENT_SECRET.',
        { status: response.status, detail }
      );
    }

    const data = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!data.access_token) {
      throw new BlizzardApiError('Battle.net returned a token response without an access_token.');
    }

    this.token = data.access_token;
    this.tokenExpiresAt = now + (data.expires_in ?? 86_400) * 1000;
    return this.token;
  }

  private auctionsUrl(connectedRealmId: number): string {
    return (
      `https://${this.region}.api.blizzard.com/data/wow/connected-realm/` +
      `${connectedRealmId}/auctions?namespace=${this.namespace}&locale=${this.locale}`
    );
  }

  /**
   * Fetch the complete auction snapshot for a connected realm.
   *
   * Throws `BlizzardApiError` on any live failure. The previous version
   * caught every error — including a 404 from an unavailable namespace or
   * an exhausted quota — and returned a synthetic snapshot with only a
   * server-side `console.warn`, so a completely broken live integration
   * rendered as a healthy-looking dashboard full of invented numbers.
   *
   * A synthetic snapshot is returned only when credentials are absent,
   * which is the documented offline demo path.
   */
  public async fetchAuctionSnapshot(
    connectedRealmId: number,
    forceFetch = true
  ): Promise<AuctionFetchResult> {
    // No synthetic path on missing creds. `getAccessToken` throws
    // `BlizzardApiError` if creds are absent; the route's error handler
    // surfaces that as a 500 with the actionable message.
    const url = this.auctionsUrl(connectedRealmId);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.getAccessToken()}`,
    };

    const cachedHeader = this.lastModifiedCache.get(connectedRealmId);
    if (cachedHeader && !forceFetch) {
      headers['If-Modified-Since'] = cachedHeader;
    }

    const send = (attemptHeaders: Record<string, string>) =>
      fetch(url, { headers: attemptHeaders, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

    let response: Response;
    try {
      response = await send(headers);
    } catch (err: unknown) {
      throw new BlizzardApiError(
        `Could not reach ${this.namespace} for connected realm ${connectedRealmId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        { realmId: connectedRealmId }
      );
    }

    // A revoked or expired mid-run token: re-authenticate once, then give up.
    if (response.status === 401) {
      this.token = null;
      this.tokenExpiresAt = 0;
      try {
        response = await send({ Authorization: `Bearer ${await this.getAccessToken()}` });
      } catch (err: unknown) {
        throw err instanceof BlizzardApiError
          ? err
          : new BlizzardApiError(`Re-authentication failed: ${String(err)}`, { realmId: connectedRealmId });
      }
    }

    // Rate limited: honour the server's hint, a bounded number of times.
    for (let attempt = 0; response.status === 429 && attempt < 2; attempt++) {
      const hinted = parseRetryAfter(
        response.headers.get('retry-after') ?? response.headers.get('x-ratelimit-reset-after')
      );
      const wait = Math.min(hinted ?? RETRY_AFTER_CAP_MS, MAX_RETRY_AFTER_MS);
      await sleep(wait);
      response = await send(headers).catch((err: unknown) => {
        throw new BlizzardApiError(
          `Retry after rate limiting failed: ${err instanceof Error ? err.message : String(err)}`,
          { realmId: connectedRealmId }
        );
      });
    }

    if (response.status === 304) {
      throw new BlizzardApiError(
        'Battle.net reported the auction house as unchanged (304). No snapshot was returned, ' +
          'so there is nothing to aggregate. Force a full fetch instead of using ' +
          'If-Modified-Since.',
        { status: 304, realmId: connectedRealmId }
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new BlizzardApiError(
        `Battle.net refused the request (HTTP ${response.status}) for namespace ` +
          `${this.namespace}, connected realm ${connectedRealmId}. The credentials may be ` +
          'invalid, or this namespace may not be entitled for them yet.',
        { status: response.status, realmId: connectedRealmId, detail: await safeText(response) }
      );
    }

    if (response.status === 429) {
      throw new BlizzardApiError(
        'Battle.net is rate limiting this client (HTTP 429) and the wait did not clear in time.',
        {
          status: 429,
          realmId: connectedRealmId,
          retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
        }
      );
    }

    if (!response.ok) {
      throw new BlizzardApiError(
        `Battle.net returned HTTP ${response.status} for ${this.namespace}, connected realm ` +
          `${connectedRealmId}.`,
        { status: response.status, realmId: connectedRealmId, detail: await safeText(response) }
      );
    }

    const lastModified = response.headers.get('last-modified');
    if (lastModified) {
      this.lastModifiedCache.set(connectedRealmId, lastModified);
    }

    const snapshot = (await response.json()) as BlizzardAuctionSnapshot;
    if (!Array.isArray(snapshot.auctions)) {
      throw new BlizzardApiError(
        `Battle.net returned a 200 for connected realm ${connectedRealmId} but the payload has ` +
          'no "auctions" array. This usually means the namespace is wrong for the requested realm.',
        { realmId: connectedRealmId }
      );
    }

    snapshot.lastModified = lastModified ?? new Date().toISOString();
    return { snapshot, source: 'blizzard_api', lastModified: snapshot.lastModified };
  }

  /**
   * Fetch item metadata (name, class, subclass, level, quality) for one
   * itemId from Blizzard. Returns null on 404 (item missing or private
   * namespace), throws `BlizzardApiError` on anything else. Icon is left
   * as a placeholder; the dedicated `/data/wow/media/item/{id}` call costs
   * an extra round-trip per item and is deferred until needed.
   */
  public async fetchItemMetadata(itemId: number): Promise<WowItemMetadata | null> {
    // Missing creds surfaces as BlizzardApiError via getAccessToken. Caller
    // (e.g. /api/items-meta) is responsible for pre-checking credentials.
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      return null;
    }

    const url =
      `https://${this.region}.api.blizzard.com/data/wow/item/${itemId}` +
      `?namespace=${this.itemNamespace}&locale=${this.locale}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await this.getAccessToken()}`,
    };

    const send = (h: Record<string, string>) =>
      fetch(url, { headers: h, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });

    let response: Response;
    try {
      response = await send(headers);
    } catch (err: unknown) {
      throw new BlizzardApiError(
        `Could not reach ${this.namespace} for item ${itemId}: ` +
          `${err instanceof Error ? err.message : String(err)}`,
        { realmId: itemId }
      );
    }

    if (response.status === 404) {
      return null;
    }

    // Token can expire mid-session; one retry on 401.
    if (response.status === 401) {
      this.token = null;
      this.tokenExpiresAt = 0;
      try {
        response = await send({ Authorization: `Bearer ${await this.getAccessToken()}` });
      } catch (err: unknown) {
        throw err instanceof BlizzardApiError
          ? err
          : new BlizzardApiError(`Re-authentication failed: ${String(err)}`, { realmId: itemId });
      }
    }

    if (response.status === 429) {
      throw new BlizzardApiError(
        `Battle.net is rate limiting item ${itemId} (HTTP 429).`,
        {
          status: 429,
          realmId: itemId,
          retryAfterMs: parseRetryAfter(response.headers.get('retry-after')),
        }
      );
    }

    if (!response.ok) {
      const detail = await safeText(response).catch(() => '');
      throw new BlizzardApiError(
        `Battle.net returned HTTP ${response.status} for item ${itemId} in ${this.itemNamespace}.`,
        { status: response.status, realmId: itemId, detail }
      );
    }

    // Blizzard response shape (en_US locale):
    //   { id, name, level, required_level,
    //     quality: { type: "EPIC", name: "Epic" },
    //     item_class:    { id: 4, name: "Armor" },
    //     item_subclass: { id: 1, name: "Cloth" },
    //     media: { id: 12345 }  ← resolve via /data/wow/media/item/{id} for icon URL }
    const data = (await response.json()) as Record<string, unknown>;
    const qualityObj = data.quality as { type?: string; name?: string } | undefined;
    const itemClassObj = data.item_class as { name?: string } | undefined;
    const itemSubclassObj = data.item_subclass as { name?: string } | undefined;

    const qualityRaw = qualityObj?.type?.toUpperCase();
    const quality: ItemQuality = qualityRaw
      ? QUALITY_TYPE_TO_NUMBER[qualityRaw] ?? 1
      : 1;

    // Resolve icon URL via the media endpoint. Best-effort — failure
    // (rate-limit, network blip) keeps the placeholder rather than failing
    // the whole metadata fetch.
    let icon = PLACEHOLDER_ICON;
    try {
      const mediaRes = await fetch(
        `https://${this.region}.api.blizzard.com/data/wow/media/item/${itemId}?namespace=${this.itemNamespace}&locale=${this.locale}`,
        {
          headers: { Authorization: `Bearer ${await this.getAccessToken()}` },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
      if (mediaRes.ok) {
        const mediaJson = (await mediaRes.json()) as { assets?: Array<{ key: string; value: string }> };
        const iconAsset = mediaJson.assets?.find((a) => a.key === 'icon');
        if (iconAsset?.value) {
          // Blizzard's media asset value is either a relative path
          // (`icons/INV_Misc_QuestionMark`) — converted to the wow.zamimg.com
          // CDN — or already a full URL (`https://render.worldofwarcraft.com/...`).
          // Detect the scheme; don't double-prefix.
          if (iconAsset.value.startsWith('http')) {
            icon = iconAsset.value;
          } else {
            icon = `https://wow.zamimg.com/images/wow/icons/large/${iconAsset.value.toLowerCase()}.jpg`;
          }
        }
      }
    } catch {
      // Swallow — keep placeholder.
    }

    return {
      id: typeof data.id === 'number' ? data.id : itemId,
      name: typeof data.name === 'string' ? data.name : `Item #${itemId}`,
      icon,
      quality,
      itemClass: itemClassObj?.name ?? 'Miscellaneous',
      subclass: itemSubclassObj?.name ?? 'Junk',
      itemLevel: typeof data.level === 'number' ? data.level : 0,
      requiredLevel: typeof data.required_level === 'number' ? data.required_level : 0,
    };
  }
}

async function safeText(response: Response): Promise<string> {
  return response.text().catch(() => '');
}
