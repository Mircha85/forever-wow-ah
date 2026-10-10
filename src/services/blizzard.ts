import { type BlizzardAuctionSnapshot, type BlizzardAuctionItem } from '../types/auction';

export interface BlizzardConfig {
  clientId?: string;
  clientSecret?: string;
  region?: 'eu' | 'us' | 'kr' | 'tw';
  namespace?: string;
}

export class BlizzardService {
  private clientId: string;
  private clientSecret: string;
  private region: string;
  private token: string | null = null;
  private tokenExpiresAt: number = 0;
  private lastModifiedCache: Map<number, string> = new Map();

  constructor(config?: BlizzardConfig) {
    this.clientId = config?.clientId || process.env.BLIZZARD_CLIENT_ID || '';
    this.clientSecret = config?.clientSecret || process.env.BLIZZARD_CLIENT_SECRET || '';
    this.region = config?.region || process.env.BLIZZARD_REGION || 'eu';
  }

  /**
   * Check whether real API credentials are configured in the environment.
   */
  public hasCredentials(): boolean {
    return Boolean(this.clientId && this.clientSecret);
  }

  /**
   * Acquire or auto-refresh an OAuth2 client_credentials access token
   * via Blizzard's OAuth endpoint.
   */
  public async getAccessToken(): Promise<string> {
    const now = Date.now();
    // Use cached token if valid with 60 seconds buffer
    if (this.token && this.tokenExpiresAt > now + 60000) {
      return this.token;
    }

    if (!this.hasCredentials()) {
      throw new Error(
        'BLIZZARD_CLIENT_ID or BLIZZARD_CLIENT_SECRET is missing. Cannot acquire OAuth token from Battle.net.'
      );
    }

    const tokenUrl = `https://oauth.battle.net/token`;
    const basicAuth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to obtain Blizzard access token (${response.status}): ${errText}`);
    }

    const data = await response.json();
    this.token = data.access_token;
    // expires_in is in seconds
    this.tokenExpiresAt = now + (data.expires_in || 86400) * 1000;
    return this.token!;
  }

  /**
   * Check if a connected realm's auction house data has been updated since last check
   * using HTTP HEAD request with If-Modified-Since.
   */
  public async checkLastModified(
    connectedRealmId: number
  ): Promise<{ hasNewData: boolean; lastModified: string | null }> {
    if (!this.hasCredentials()) {
      return { hasNewData: true, lastModified: new Date().toUTCString() };
    }

    const token = await this.getAccessToken();
    const url = `https://${this.region}.api.blizzard.com/data/wow/connected-realm/${connectedRealmId}/auctions?namespace=dynamic-${this.region}&locale=en_US`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    const cachedHeader = this.lastModifiedCache.get(connectedRealmId);
    if (cachedHeader) {
      headers['If-Modified-Since'] = cachedHeader;
    }

    const headRes = await fetch(url, {
      method: 'HEAD',
      headers,
    });

    if (headRes.status === 304) {
      return { hasNewData: false, lastModified: cachedHeader || null };
    }

    const newLastModified = headRes.headers.get('last-modified');
    if (newLastModified) {
      this.lastModifiedCache.set(connectedRealmId, newLastModified);
    }

    return { hasNewData: true, lastModified: newLastModified };
  }

  /**
   * Fetch the complete auction snapshot for a connected realm.
   * If real API credentials aren't set, falls back cleanly to generating a realistic
   * WoW: Forever snapshot with typical commodities, materials, rare recipes, and epics.
   */
  public async fetchAuctionSnapshot(
    connectedRealmId: number,
    forceFetch: boolean = false
  ): Promise<{ snapshot: BlizzardAuctionSnapshot; source: 'blizzard_api' | 'synthetic_forever' }> {
    if (!this.hasCredentials()) {
      return {
        snapshot: this.generateSyntheticWoWForeverSnapshot(connectedRealmId),
        source: 'synthetic_forever',
      };
    }

    try {
      const token = await this.getAccessToken();
      const url = `https://${this.region}.api.blizzard.com/data/wow/connected-realm/${connectedRealmId}/auctions?namespace=dynamic-${this.region}&locale=en_US`;

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
      };

      const cachedHeader = this.lastModifiedCache.get(connectedRealmId);
      if (cachedHeader && !forceFetch) {
        headers['If-Modified-Since'] = cachedHeader;
      }

      const response = await fetch(url, { headers });

      if (response.status === 304 && cachedHeader) {
        throw new Error('304 Not Modified: Remote auctions unchanged');
      }

      if (!response.ok) {
        throw new Error(`Blizzard API returned status ${response.status}: ${await response.text()}`);
      }

      const lastModified = response.headers.get('last-modified');
      if (lastModified) {
        this.lastModifiedCache.set(connectedRealmId, lastModified);
      }

      const snapshot: BlizzardAuctionSnapshot = await response.json();
      snapshot.lastModified = lastModified || new Date().toISOString();

      return { snapshot, source: 'blizzard_api' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[BlizzardService] Live fetch failed (${message}), falling back to synthetic snapshot.`);
      return {
        snapshot: this.generateSyntheticWoWForeverSnapshot(connectedRealmId),
        source: 'synthetic_forever',
      };
    }
  }

  /**
   * Generates a high-fidelity synthetic auction snapshot for WoW: Forever.
   * Includes typical herbs, ores, gems, flasks, crafting materials, and weapons.
   */
  public generateSyntheticWoWForeverSnapshot(connectedRealmId: number): BlizzardAuctionSnapshot {
    const auctions: BlizzardAuctionItem[] = [];
    let auctionIdCounter = 100000;

    // Standard WoW items pool
    const catalog = [
      { id: 13464, name: 'Golden Sansam', basePrice: 4200, count: 45, isCommodity: true },
      { id: 13465, name: 'Mountain Silversage', basePrice: 18500, count: 60, isCommodity: true },
      { id: 13466, name: 'Plaguebloom', basePrice: 24500, count: 70, isCommodity: true },
      { id: 13467, name: 'Icecap', basePrice: 12000, count: 50, isCommodity: true },
      { id: 13468, name: 'Black Lotus', basePrice: 1450000, count: 18, isCommodity: true }, // ~145g
      { id: 12360, name: 'Arcanite Bar', basePrice: 850000, count: 35, isCommodity: true },  // ~85g
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
      { id: 7078,  name: 'Essence of Fire', basePrice: 110000, count: 50, isCommodity: true },
      { id: 7076,  name: 'Essence of Earth', basePrice: 92000, count: 45, isCommodity: true },
      { id: 7080,  name: 'Essence of Water', basePrice: 185000, count: 55, isCommodity: true },
      { id: 7082,  name: 'Essence of Air', basePrice: 220000, count: 40, isCommodity: true },
      // Weapons
      { id: 811,   name: 'Axe of the Deep Woods', basePrice: 7500000, count: 5, isCommodity: false },
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
      // Armor
      { id: 14154, name: 'Robes of the Archmage', basePrice: 9500000, count: 4, isCommodity: false },
      { id: 16908, name: 'Bloodfang Hood', basePrice: 24000000, count: 3, isCommodity: false },
      { id: 7938,  name: 'Truesilver Breastplate', basePrice: 3800000, count: 6, isCommodity: false },
      { id: 12639, name: 'Stronghold Gauntlets', basePrice: 11000000, count: 4, isCommodity: false },
      { id: 7997,  name: 'Red Defias Mask', basePrice: 850000, count: 12, isCommodity: false },
      // Container
      { id: 4500,  name: "Traveler's Backpack", basePrice: 1800000, count: 10, isCommodity: false },
      { id: 22251, name: 'Cenarion Herb Bag', basePrice: 4200000, count: 8, isCommodity: false },
      { id: 22248, name: 'Mining Sack', basePrice: 3500000, count: 8, isCommodity: false },
      // Consumables
      { id: 13446, name: 'Major Healing Potion', basePrice: 25000, count: 80, isCommodity: true },
      { id: 13444, name: 'Major Mana Potion', basePrice: 42000, count: 90, isCommodity: true },
      { id: 13452, name: 'Elixir of the Mongoose', basePrice: 65000, count: 70, isCommodity: true },
      { id: 20452, name: 'Smoked Desert Dumplings', basePrice: 15000, count: 60, isCommodity: true },
      { id: 12662, name: 'Demonic Rune', basePrice: 120000, count: 35, isCommodity: true },
      { id: 194700, name: 'Vantus Rune: Mythic Vault', basePrice: 350000, count: 25, isCommodity: true },
      // Trade Goods
      { id: 14256, name: 'Felcloth', basePrice: 85000, count: 50, isCommodity: true },
      { id: 11370, name: 'Dark Iron Ore', basePrice: 45000, count: 60, isCommodity: true },
      { id: 129032, name: 'Sallow Pigment', basePrice: 60000, count: 40, isCommodity: true },
      { id: 13759, name: 'Raw Nightfin Snapper', basePrice: 18000, count: 75, isCommodity: true },
      // Gems
      { id: 23095, name: 'Bold Ruby', basePrice: 680000, count: 20, isCommodity: true },
      { id: 23097, name: 'Delicate Living Ruby', basePrice: 720000, count: 18, isCommodity: true },
      { id: 12363, name: 'Arcane Crystal', basePrice: 480000, count: 35, isCommodity: true },
      // Item Enhancement
      { id: 18251, name: 'Core Armor Kit', basePrice: 950000, count: 15, isCommodity: false },
      { id: 10546, name: 'Sniper Scope', basePrice: 320000, count: 12, isCommodity: false },
      { id: 12404, name: 'Dense Sharpening Stone', basePrice: 45000, count: 40, isCommodity: true },
      // Recipes
      { id: 13518, name: 'Recipe: Flask of the Titans', basePrice: 85000000, count: 2, isCommodity: false },
      { id: 12717, name: 'Plans: Arcanite Reaper', basePrice: 45000000, count: 3, isCommodity: false },
      { id: 14488, name: 'Pattern: Robe of the Archmage', basePrice: 28000000, count: 3, isCommodity: false },
      { id: 6661,  name: 'Recipe: Savory Deviate Delight', basePrice: 6500000, count: 6, isCommodity: false },
      // Glyphs
      { id: 44928, name: 'Glyph of Stars', basePrice: 450000, count: 15, isCommodity: false },
      { id: 43339, name: 'Glyph of Polymorph: Penguin', basePrice: 650000, count: 12, isCommodity: false },
      { id: 43425, name: 'Glyph of Shield Wall', basePrice: 380000, count: 14, isCommodity: false },
      // Battle Pets
      { id: 20769, name: 'Disgusting Oozeling', basePrice: 18500000, count: 3, isCommodity: false },
      { id: 10822, name: 'Dark Whelpling', basePrice: 12000000, count: 4, isCommodity: false },
      { id: 8494,  name: 'Hyacinth Macaw', basePrice: 35000000, count: 2, isCommodity: false },
      { id: 8491,  name: 'Ancona Chicken', basePrice: 450000, count: 10, isCommodity: false },
      // Mounts
      { id: 13335, name: "Deathcharger's Reins", basePrice: 95000000, count: 1, isCommodity: false },
      { id: 13086, name: 'Reins of Winterspring Frostsaber', basePrice: 80000000, count: 2, isCommodity: false },
      { id: 34060, name: 'Flying Machine Control', basePrice: 15000000, count: 3, isCommodity: false },
      // Miscellaneous
      { id: 18422, name: 'Head of Onyxia', basePrice: 5000000, count: 4, isCommodity: false },
      { id: 21524, name: 'Red Winter Hat', basePrice: 650000, count: 15, isCommodity: false },
      { id: 1978,  name: 'Orb of Deception', basePrice: 22000000, count: 3, isCommodity: false },
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
        // Add realistic price variation (+/- 25%)
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
        href: `https://eu.api.blizzard.com/data/wow/connected-realm/${connectedRealmId}`,
      },
      auctions,
      lastModified: new Date().toISOString(),
    };
  }
}
