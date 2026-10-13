import { type BlizzardAuctionSnapshot, type BlizzardAuctionItem, type WowItemMetadata, type ItemQuality } from '../types/auction';

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

/** Generic icon used when we have not fetched a media asset for the item. */
const PLACEHOLDER_ICON =
  'https://wow.zamimg.com/images/wow/icons/large/inv_misc_questionmark.jpg';

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
 * `synthetic_forever` is only ever produced when credentials are absent —
 * that is the offline demo mode. It is never used to paper over a failed
 * live request, because a dashboard full of plausible invented numbers is
 * far harder to notice than an error.
 */
export type AuctionFetchResult = {
  snapshot: BlizzardAuctionSnapshot;
  source: 'blizzard_api' | 'synthetic_forever';
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
    if (!this.hasCredentials()) {
      return {
        snapshot: this.generateSyntheticWoWForeverSnapshot(connectedRealmId),
        source: 'synthetic_forever',
        lastModified: new Date().toISOString(),
      };
    }

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
    if (!this.hasCredentials()) {
      return null;
    }
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
    //     item_subclass: { id: 1, name: "Cloth" } }
    const data = (await response.json()) as Record<string, unknown>;
    const qualityObj = data.quality as { type?: string; name?: string } | undefined;
    const itemClassObj = data.item_class as { name?: string } | undefined;
    const itemSubclassObj = data.item_subclass as { name?: string } | undefined;

    const qualityRaw = qualityObj?.type?.toUpperCase();
    const quality: ItemQuality = qualityRaw
      ? QUALITY_TYPE_TO_NUMBER[qualityRaw] ?? 1
      : 1;

    return {
      id: typeof data.id === 'number' ? data.id : itemId,
      name: typeof data.name === 'string' ? data.name : `Item #${itemId}`,
      icon: PLACEHOLDER_ICON,
      quality,
      itemClass: itemClassObj?.name ?? 'Miscellaneous',
      subclass: itemSubclassObj?.name ?? 'Junk',
      itemLevel: typeof data.level === 'number' ? data.level : 0,
      requiredLevel: typeof data.required_level === 'number' ? data.required_level : 0,
    };
  }

  /**
   * Generates a high-fidelity synthetic auction snapshot for WoW: Forever.
   *
   * Only reachable when no credentials are configured. It is a demo
   * fixture, not a fallback: nothing on a live code path should reach here.
   */
  public generateSyntheticWoWForeverSnapshot(connectedRealmId: number): BlizzardAuctionSnapshot {
    const auctions: BlizzardAuctionItem[] = [];
    let auctionIdCounter = 100000;

    const catalog = [
      { id: 13464, name: 'Golden Sansam', basePrice: 4200, count: 45, isCommodity: true },
      { id: 13465, name: 'Mountain Silversage', basePrice: 18500, count: 60, isCommodity: true },
      { id: 13466, name: 'Plaguebloom', basePrice: 24500, count: 70, isCommodity: true },
      { id: 13467, name: 'Icecap', basePrice: 12000, count: 50, isCommodity: true },
      { id: 13468, name: 'Black Lotus', basePrice: 1450000, count: 18, isCommodity: true },
      { id: 12360, name: 'Arcanite Bar', basePrice: 850000, count: 35, isCommodity: true },
      { id: 12359, name: 'Thorium Ore', basePrice: 3200, count: 85, isCommodity: true },
      { id: 14344, name: 'Large Brilliant Shard', basePrice: 48000, count: 40, isCommodity: true },
      { id: 14343, name: 'Small Brilliant Shard', basePrice: 15000, count: 30, isCommodity: true },
      { id: 16204, name: 'Illusion Dust', basePrice: 1800, count: 220, isCommodity: true },
      { id: 13511, name: 'Flask of the Titans', basePrice: 1850000, count: 22, isCommodity: false },
      { id: 13512, name: 'Flask of Supreme Power', basePrice: 2150000, count: 28, isCommodity: false },
      { id: 13513, name: 'Flask of Distilled Wisdom', basePrice: 1950000, count: 20, isCommodity: false },
      { id: 19019, name: 'Thunderfury, Blessed Blade', basePrice: 95000000, count: 2, isCommodity: false },
      { id: 11684, name: 'Ironfoe', basePrice: 12500000, count: 4, isCommodity: false },
      { id: 12640, name: 'Lionheart Helm', basePrice: 14200000, count: 6, isCommodity: false },
      { id: 14552, name: 'Stockade Pauldrons', basePrice: 280000, count: 12, isCommodity: false },
      { id: 20725, name: 'Nexus Crystal', basePrice: 165000, count: 32, isCommodity: true },
      { id: 17203, name: 'Sulfuron Ingot', basePrice: 8800000, count: 8, isCommodity: false },
      { id: 14155, name: 'Mooncloth', basePrice: 320000, count: 25, isCommodity: true },
      { id: 12800, name: 'Azerothian Diamond', basePrice: 98000, count: 35, isCommodity: true },
      { id: 12799, name: 'Large Opal', basePrice: 75000, count: 40, isCommodity: true },
      { id: 7078, name: 'Essence of Fire', basePrice: 110000, count: 50, isCommodity: true },
      { id: 7076, name: 'Essence of Earth', basePrice: 92000, count: 45, isCommodity: true },
      { id: 7080, name: 'Essence of Water', basePrice: 185000, count: 55, isCommodity: true },
      { id: 7082, name: 'Essence of Air', basePrice: 220000, count: 40, isCommodity: true },
      { id: 811, name: 'Axe of the Deep Woods', basePrice: 7500000, count: 5, isCommodity: false },
      { id: 17071, name: 'Gutgore Ripper', basePrice: 14000000, count: 4, isCommodity: false },
      { id: 12784, name: 'Arcanite Reaper', basePrice: 18000000, count: 6, isCommodity: false },
      { id: 17076, name: "Bonereaver's Edge", basePrice: 45000000, count: 2, isCommodity: false },
      { id: 18842, name: 'Staff of Dominance', basePrice: 22000000, count: 3, isCommodity: false },
      { id: 12583, name: 'Blackhand Doomsaw', basePrice: 6500000, count: 5, isCommodity: false },
      { id: 18713, name: "Rhok'delar, Longbow", basePrice: 38000000, count: 2, isCommodity: false },
      { id: 17072, name: 'Blastershot Launcher', basePrice: 16000000, count: 3, isCommodity: false },
      { id: 17077, name: 'Crimson Shocker', basePrice: 12000000, count: 4, isCommodity: false },
      { id: 19315, name: "Therazane's Touch", basePrice: 8500000, count: 4, isCommodity: false },
      { id: 19349, name: 'Elementium Reinforced Bulwark', basePrice: 26000000, count: 3, isCommodity: false },
      { id: 14154, name: 'Robes of the Archmage', basePrice: 9500000, count: 4, isCommodity: false },
      { id: 16908, name: 'Bloodfang Hood', basePrice: 24000000, count: 3, isCommodity: false },
      { id: 7938, name: 'Truesilver Breastplate', basePrice: 3800000, count: 6, isCommodity: false },
      { id: 12639, name: 'Stronghold Gauntlets', basePrice: 11000000, count: 4, isCommodity: false },
      { id: 7997, name: 'Red Defias Mask', basePrice: 850000, count: 12, isCommodity: false },
      { id: 4500, name: "Traveler's Backpack", basePrice: 1800000, count: 10, isCommodity: false },
      { id: 22251, name: 'Cenarion Herb Bag', basePrice: 4200000, count: 8, isCommodity: false },
      { id: 22248, name: 'Mining Sack', basePrice: 3500000, count: 8, isCommodity: false },
      { id: 13446, name: 'Major Healing Potion', basePrice: 25000, count: 80, isCommodity: true },
      { id: 13444, name: 'Major Mana Potion', basePrice: 42000, count: 90, isCommodity: true },
      { id: 13452, name: 'Elixir of the Mongoose', basePrice: 65000, count: 70, isCommodity: true },
      { id: 20452, name: 'Smoked Desert Dumplings', basePrice: 15000, count: 60, isCommodity: true },
      { id: 12662, name: 'Demonic Rune', basePrice: 120000, count: 35, isCommodity: true },
      { id: 194700, name: 'Vantus Rune: Mythic Vault', basePrice: 350000, count: 25, isCommodity: true },
      { id: 14256, name: 'Felcloth', basePrice: 85000, count: 50, isCommodity: true },
      { id: 11370, name: 'Dark Iron Ore', basePrice: 45000, count: 60, isCommodity: true },
      { id: 129032, name: 'Sallow Pigment', basePrice: 60000, count: 40, isCommodity: true },
      { id: 13759, name: 'Raw Nightfin Snapper', basePrice: 18000, count: 75, isCommodity: true },
      { id: 23095, name: 'Bold Ruby', basePrice: 680000, count: 20, isCommodity: true },
      { id: 23097, name: 'Delicate Living Ruby', basePrice: 720000, count: 18, isCommodity: true },
      { id: 12363, name: 'Arcane Crystal', basePrice: 480000, count: 35, isCommodity: true },
      { id: 18251, name: 'Core Armor Kit', basePrice: 950000, count: 15, isCommodity: false },
      { id: 10546, name: 'Sniper Scope', basePrice: 320000, count: 12, isCommodity: false },
      { id: 12404, name: 'Dense Sharpening Stone', basePrice: 45000, count: 40, isCommodity: true },
      { id: 13518, name: 'Recipe: Flask of the Titans', basePrice: 85000000, count: 2, isCommodity: false },
      { id: 12717, name: 'Plans: Arcanite Reaper', basePrice: 45000000, count: 3, isCommodity: false },
      { id: 14488, name: 'Pattern: Robe of the Archmage', basePrice: 28000000, count: 3, isCommodity: false },
      { id: 6661, name: 'Recipe: Savory Deviate Delight', basePrice: 6500000, count: 6, isCommodity: false },
      { id: 44928, name: 'Glyph of Stars', basePrice: 450000, count: 15, isCommodity: false },
      { id: 43339, name: 'Glyph of Polymorph: Penguin', basePrice: 650000, count: 12, isCommodity: false },
      { id: 43425, name: 'Glyph of Shield Wall', basePrice: 380000, count: 14, isCommodity: false },
      { id: 20769, name: 'Disgusting Oozeling', basePrice: 18500000, count: 3, isCommodity: false },
      { id: 10822, name: 'Dark Whelpling', basePrice: 12000000, count: 4, isCommodity: false },
      { id: 8494, name: 'Hyacinth Macaw', basePrice: 35000000, count: 2, isCommodity: false },
      { id: 8491, name: 'Ancona Chicken', basePrice: 450000, count: 10, isCommodity: false },
      { id: 13335, name: "Deathcharger's Reins", basePrice: 95000000, count: 1, isCommodity: false },
      { id: 13086, name: 'Reins of Winterspring Frostsaber', basePrice: 80000000, count: 2, isCommodity: false },
      { id: 34060, name: 'Flying Machine Control', basePrice: 15000000, count: 3, isCommodity: false },
      { id: 18422, name: 'Head of Onyxia', basePrice: 5000000, count: 4, isCommodity: false },
      { id: 21524, name: 'Red Winter Hat', basePrice: 650000, count: 15, isCommodity: false },
      { id: 1978, name: 'Orb of Deception', basePrice: 22000000, count: 3, isCommodity: false },
    ];

    const timeOptions: Array<'SHORT' | 'MEDIUM' | 'LONG' | 'VERY_LONG'> = [
      'SHORT',
      'MEDIUM',
      'LONG',
      'VERY_LONG',
    ];

    for (const item of catalog) {
      for (let i = 0; i < item.count; i++) {
        auctionIdCounter++;
        const priceVariance = 0.75 + Math.random() * 0.5;
        const currentUnitPrice = Math.round(item.basePrice * priceVariance);

        const quantity = item.isCommodity
          ? [1, 5, 10, 20][Math.floor(Math.random() * 4)]
          : 1;
        const timeLeft = timeOptions[Math.floor(Math.random() * timeOptions.length)];

        if (item.isCommodity) {
          auctions.push({
            id: auctionIdCounter,
            item: { id: item.id },
            quantity,
            unit_price: currentUnitPrice,
            time_left: timeLeft,
          });
        } else {
          const buyout = currentUnitPrice * quantity;
          const bid = Math.round(buyout * (0.8 + Math.random() * 0.15));
          auctions.push({
            id: auctionIdCounter,
            item: { id: item.id },
            quantity,
            buyout,
            bid,
            time_left: timeLeft,
          });
        }
      }
    }

    return {
      connected_realm: {
        href: `https://${this.region}.api.blizzard.com/data/wow/connected-realm/${connectedRealmId}`,
      },
      auctions,
      lastModified: new Date().toISOString(),
    };
  }
}

async function safeText(response: Response): Promise<string> {
  return response.text().catch(() => '');
}
