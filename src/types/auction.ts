export interface BlizzardAuctionItem {
  id: number;
  item: {
    id: number;
    context?: number;
    modifiers?: Array<{ type: number; value: number }>;
    pet_breed_id?: number;
    pet_level?: number;
    pet_quality_id?: number;
    pet_species_id?: number;
  };
  quantity: number;
  unit_price?: number; // In copper (for commodities)
  buyout?: number;     // In copper (for standard auctions)
  bid?: number;        // In copper
  time_left: 'SHORT' | 'MEDIUM' | 'LONG' | 'VERY_LONG';
}

export interface BlizzardAuctionSnapshot {
  _links?: {
    self: { href: string };
  };
  connected_realm?: {
    href: string;
  };
  auctions: BlizzardAuctionItem[];
  lastModified?: string;
}

export type TimeLeftCode = 1 | 2 | 3 | 4;

export const TIME_LEFT_MAP: Record<string, TimeLeftCode> = {
  SHORT: 1,      // < 30 mins
  MEDIUM: 2,     // 30 mins - 2 hours
  LONG: 3,       // 2 hours - 12 hours
  VERY_LONG: 4,  // 12 hours - 48 hours
};

export const TIME_LEFT_LABELS: Record<TimeLeftCode, string> = {
  1: '< 30m',
  2: '30m - 2h',
  3: '2h - 12h',
  4: '12h - 48h',
};

export type ItemQuality = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface WowItemMetadata {
  id: number;
  name: string;
  icon: string;
  quality: ItemQuality;
  itemClass: string;
  subclass: string;
  itemLevel: number;
  requiredLevel: number;
}

export interface ActiveAuctionLot {
  auctionId: number;
  quantity: number;
  unitPrice: number; // In copper
  buyout: number;    // In copper
  bid: number;       // In copper
  timeLeft: TimeLeftCode;
  sellerRealmId: number;
}

export interface HistoryPoint {
  timestamp: number; // Unix epoch seconds
  minPrice: number;  // In copper
  medianPrice: number;
  meanPrice: number;
  quantity: number;
  numAuctions: number;
}

export interface HourlyDelta {
  timestamp: number;
  minPrice: number;
  medianPrice: number;
  quantity: number;
}

export interface DecodedItemBin {
  magic: number; // 0x554E4452 ('UNDR')
  version: number;
  itemId: number;
  connectedRealmId: number;
  lastUpdated: number;
  totalQuantity: number;
  numAuctions: number;
  minBuyout: number;
  medianPrice: number;
  meanPrice: number;
  marketCap: number; // BigInt or number in copper
  priceDelta24h: number; // percentage (-100 to +500)
  quantityDelta24h: number; // percentage
  dailyHistory: HistoryPoint[];
  hourlyDeltas: HourlyDelta[];
  activeLots: ActiveAuctionLot[];
}

export interface StateItemSummary {
  itemId: number;
  minPrice: number;
  medianPrice: number;
  meanPrice: number;
  quantity: number;
  numAuctions: number;
  priceDelta24h: number; // percentage float (e.g. 5.4 = +5.4%)
  quantityDelta24h: number;
}

export interface DecodedStateBin {
  magic: number;
  version: number;
  connectedRealmId: number;
  generatedAt: number;
  totalAuctionsCount: number;
  totalItemsCount: number;
  items: StateItemSummary[];
}

export interface ConnectedRealmInfo {
  id: number;
  name: string;
  region: 'eu' | 'us';
  slug: string;
  timezone: string;
  isForeverClassic?: boolean;
}
