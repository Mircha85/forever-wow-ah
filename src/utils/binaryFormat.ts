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

/**
 * 'REAL' in ASCII, stored little-endian (the bytes on disk read R-E-A-L).
 *
 * Used by `realm.bin`, the canonical per-realm item archive that replaced
 * the 15.7 k per-item blobs the pipeline used to write.
 */
export const MAGIC_REALM = 0x4c414552;

/**
 * 'HIST' in ASCII, stored little-endian (the bytes on disk read H-I-S-T).
 *
 * Used by `history.bin`, the rolling store of observed per-item values.
 */
export const MAGIC_HISTORY = 0x54534948;

export const BIN_VERSION = 1;

/**
 * The archive formats are versioned separately from the client-facing
 * `UNDR v1` blobs. They are server-internal — the browser never sees them,
 * it sees a composed `UNDR v1` item blob — so they can move independently.
 */
export const ARCHIVE_VERSION = 1;

/** Percentages are stored as scaled integers (5.25% -> 525). */
export const DELTA_SCALE = 100;

/**
 * Raw scaled value that means "this delta was not measured".
 *
 * A delta is stored as an int16 holding percent × 100, and `clampDelta`
 * keeps every real delta inside ±32700. The raw value -32768 lies outside
 * that range, so it is free to carry the one meaning a real delta cannot:
 * there is not yet a second observation far enough apart to compare against.
 *
 * The dashboard renders "not enough data yet" for it instead of a number.
 */
export const DELTA_UNKNOWN_SCALED = -32768;

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

/**
 * Encodes a delta for storage, preserving "not measured" as a distinct value.
 *
 * `clampDelta` maps every real delta into ±32700, which leaves the raw
 * int16 value -32768 free to mean "there was no second observation to
 * compare against yet". Passing `null` writes that sentinel; passing a
 * number writes the clamped scaled value.
 */
export const encodeDelta = (percent: number | null): number =>
  percent === null ? DELTA_UNKNOWN_SCALED : clampDelta(percent);

/** Reverses `encodeDelta`: the sentinel becomes `null`. */
export const decodeDelta = (scaled: number): number | null =>
  scaled === DELTA_UNKNOWN_SCALED ? null : scaled / DELTA_SCALE;

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

/**
 * realm.bin — the canonical per-realm item archive.
 *
 * One object per realm per ingestion run, holding every item's aggregate
 * and its live auction lots. It replaced the per-item blob the pipeline
 * used to write: at 15.7 k items per realm and 175 realms on a 30-minute
 * schedule, one object per item was ~3.96 billion R2 requests a month.
 * One archive per realm is ~25 000.
 *
 * Records are variable length: an item with three auction lots occupies
 * three lot slots, not the maximum. A fixed-width record would spend
 * twenty-four slots on every item regardless of how many listings it
 * actually has.
 *
 * Layout: a 32-byte header, then `itemCount` item records, each a
 * 36-byte fixed part followed by its auction lots.
 */
export const REALM_FORMAT = {
  headerSize: 32,
  /** Fixed part of an item record, before its lots array. */
  itemHeaderSize: 36,
  activeLotSize: 24,
  field: {
    magic: 0,
    version: 4,
    flags: 6,
    connectedRealmId: 8,
    generatedAt: 12,
    itemCount: 16,
    reserved: 20,
    totalAuctions: 24,
    reserved2: 28,
  },
  item: {
    itemId: 0,
    minPrice: 4,
    medianPrice: 8,
    meanPrice: 12,
    quantity: 16,
    numAuctions: 20,
    marketCapLow: 24,
    marketCapHigh: 28,
    lotsCount: 32,
    reserved: 34,
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

/**
 * history.bin — the rolling store of observed per-item values.
 *
 * Every ingestion run observes each listed item once. This archive keeps
 * those observations so the dashboard can show a price series that was
 * actually measured, and so the 24 h delta compares two real observations
 * instead of two invented ones.
 *
 * Records are variable length and carry their own timestamps. Most items
 * on a realm are listed by only a handful of auctions, so a fixed-width
 * record — one slot per hour of the last week — would spend gigabytes
 * storing zeroes.
 *
 * Layout: a 48-byte header, then `itemCount` item records, each an
 * 8-byte fixed part followed by its hourly and daily observations.
 */
export const HISTORY_FORMAT = {
  headerSize: 48,
  /** timestamp, min, median, quantity — all uint32. */
  hourlyEntrySize: 16,
  /** timestamp, min, median, mean, quantity, auction count — all uint32. */
  dailyEntrySize: 24,
  field: {
    magic: 0,
    version: 4,
    flags: 6,
    connectedRealmId: 8,
    generatedAt: 12,
    itemCount: 16,
    reserved: 20,
    hourlyIntervalSec: 24,
    dailyIntervalSec: 28,
    maxHourlyPerItem: 32,
    maxDailyPerItem: 36,
    reserved2: 40,
    reserved3: 44,
  },
  item: {
    itemId: 0,
    hourlyCount: 4,
    dailyCount: 6,
    /** Offset of the first hourly observation within the record. */
    hourlyBase: 8,
  },
} as const;
