/**
 * Single source of truth for the `UNDR v1` binary layout.
 *
 * Every size and field offset used by the server-side encoder and the
 * browser-side decoder lives here. Previously the two sides each carried
 * their own copy of these numbers as bare literals (28 / 22 / 16 / 24),
 * so changing the encoder and forgetting the decoder produced silently
 * corrupted payloads rather than a failure. The round-trip tests in
 * `src/services/__tests__/binaryFormat.test.ts` guard against that
 * regression, but the shared constants remove the opportunity entirely.
 *
 * All multi-byte integers are little-endian, matching the DataView calls
 * the decoder uses (`littleEndian = true`).
 */

/** 'UNDR' in ASCII, stored little-endian. */
export const MAGIC_UNDR = 0x554e4452;

export const BIN_VERSION = 1;

/** Percentages are stored as scaled integers (5.25% -> 525). */
export const DELTA_SCALE = 100;

/**
 * Int16 range after scaling. A +400% spike is representable as 40000 and
 * simply does not fit, so it clamps. Note this is narrower than the
 * `-100..+500` range the `priceDelta24h` doc comments once claimed;
 * raising the ceiling needs a format bump, not a wider clamp.
 */
export const MAX_DELTA_SCALED = 32700;

export const MAX_UINT32 = 0xffffffff;
export const MAX_UINT16 = 0xffff;

/** `sellerRealmId` is packed as uint16. */
export const MAX_SELLER_REALM_ID = MAX_UINT16;

export const clampDelta = (percent: number): number => {
  const scaled = Math.round((Number.isFinite(percent) ? percent : 0) * DELTA_SCALE);
  return Math.min(MAX_DELTA_SCALED, Math.max(-MAX_DELTA_SCALED, scaled));
};

/** state.bin — one record per item, used for the realm overview. */
export const STATE_FORMAT = {
  headerSize: 24,
  itemRecordSize: 28,
  field: {
    magic: 0,
    version: 4,
    reserved: 6,
    connectedRealmId: 8,
    generatedAt: 12,
    totalAuctionsCount: 16,
    totalItemsCount: 20,
  },
  item: {
    itemId: 0,
    minPrice: 4,
    medianPrice: 8,
    meanPrice: 12,
    quantity: 16,
    numAuctions: 20,
    priceDelta24h: 24,
    quantityDelta24h: 26,
  },
} as const;

/** {itemId}.bin — full analytics plus history and active lots. */
export const ITEM_FORMAT = {
  headerSize: 60,
  dailyEntrySize: 22,
  hourlyEntrySize: 16,
  activeLotSize: 24,
  field: {
    magic: 0,
    version: 4,
    reserved: 6,
    itemId: 8,
    connectedRealmId: 12,
    lastUpdated: 16,
    totalQuantity: 20,
    numAuctions: 24,
    minBuyout: 28,
    medianPrice: 32,
    meanPrice: 36,
    marketCapLow: 40,
    marketCapHigh: 44,
    priceDelta24h: 48,
    quantityDelta24h: 50,
    dailyHistoryCount: 52,
    hourlyDeltasCount: 54,
    activeLotsCount: 56,
    padding: 58,
  },
  daily: {
    timestamp: 0,
    minPrice: 4,
    medianPrice: 8,
    meanPrice: 12,
    quantity: 16,
    numAuctions: 20,
  },
  hourly: {
    timestamp: 0,
    minPrice: 4,
    medianPrice: 8,
    quantity: 12,
  },
  lot: {
    auctionId: 0,
    quantity: 4,
    unitPrice: 8,
    buyout: 12,
    bid: 16,
    timeLeft: 20,
    sellerRealmId: 21,
    flags: 23,
  },
} as const;

/** Byte offset where the first variable-length section starts. */
export const itemSectionStart = (data: {
  dailyHistoryCount: number;
  hourlyDeltasCount: number;
}): number =>
  ITEM_FORMAT.headerSize +
  data.dailyHistoryCount * ITEM_FORMAT.dailyEntrySize +
  data.hourlyDeltasCount * ITEM_FORMAT.hourlyEntrySize;
