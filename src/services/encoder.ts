import {
  type StateItemSummary,
  type HistoryPoint,
  type HourlyDelta,
  type ActiveAuctionLot,
} from '../types/auction';
import {
  ARCHIVE_VERSION,
  BIN_VERSION,
  HISTORY_FORMAT,
  ITEM_FORMAT,
  MAGIC_HISTORY,
  MAGIC_REALM,
  MAGIC_UNDR,
  MAX_DELTA_SCALED,
  MAX_SELLER_REALM_ID,
  MAX_UINT16,
  MAX_UINT32,
  REALM_FORMAT,
  STATE_FORMAT,
  encodeDelta,
  itemSectionStart,
} from '../utils/binaryFormat';

export { MAGIC_UNDR, BIN_VERSION };

/**
 * Guard a value that must fit an unsigned integer field.
 *
 * The previous encoder clamped with `Math.min(0xffffffff, ...)` and moved
 * on, so an out-of-range input produced a plausible-looking but wrong
 * number in the dashboard. Throwing keeps the failure at the boundary
 * where the bad value can still be named.
 */
function assertFitsUint32(value: number, field: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot encode ${field}: value is not a finite number (${String(value)})`);
  }
  if (value < 0) return 0; // Prices and counts are unsigned; a negative is meaningless.
  if (value > MAX_UINT32) {
    throw new Error(
      `Cannot encode ${field}: ${value} exceeds the uint32 field range (max ${MAX_UINT32}). ` +
        'Raise the binary format version instead of silently truncating.'
    );
  }
  return Math.floor(value);
}

function assertFitsUint16(value: number, field: string): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (value > MAX_UINT16) {
    throw new Error(
      `Cannot encode ${field}: ${value} exceeds the uint16 field range (max ${MAX_UINT16}).`
    );
  }
  return Math.floor(value);
}

function encodeSectionCounts(data: {
  dailyHistory: HistoryPoint[];
  hourlyDeltas: HourlyDelta[];
  activeLots: ActiveAuctionLot[];
}): {
  dailyHistoryCount: number;
  hourlyDeltasCount: number;
  activeLotsCount: number;
} {
  return {
    dailyHistoryCount: assertFitsUint16(data.dailyHistory.length, 'dailyHistory.length'),
    hourlyDeltasCount: assertFitsUint16(data.hourlyDeltas.length, 'hourlyDeltas.length'),
    activeLotsCount: assertFitsUint16(data.activeLots.length, 'activeLots.length'),
  };
}

export class BinaryEncoder {
  /**
   * Encodes the global market state into a compact binary Buffer.
   * Layout: 24-byte header, then `itemRecordSize` bytes per item.
   * See `binaryFormat.ts` for the field map.
   */
  public static encodeState(state: {
    connectedRealmId: number;
    generatedAt: number;
    totalAuctionsCount: number;
    items: StateItemSummary[];
  }): Buffer {
    const { headerSize, itemRecordSize, field } = STATE_FORMAT;
    const totalSize = headerSize + state.items.length * itemRecordSize;
    const buffer = Buffer.alloc(totalSize);

    let offset = 0;
    buffer.writeUInt32LE(MAGIC_UNDR, offset); offset += 4;
    buffer.writeUInt16LE(BIN_VERSION, offset); offset += 2;
    buffer.writeUInt16LE(0, offset); offset += 2;
    buffer.writeUInt32LE(assertFitsUint32(state.connectedRealmId, 'connectedRealmId'), offset); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(state.generatedAt, 'generatedAt'), offset); offset += 4;
    buffer.writeUInt32LE(
      assertFitsUint32(state.totalAuctionsCount, 'totalAuctionsCount'), offset
    ); offset += 4;
    buffer.writeUInt32LE(
      assertFitsUint16(state.items.length, 'items.length'), offset
    ); offset += 4;

    for (const item of state.items) {
      buffer.writeUInt32LE(assertFitsUint32(item.itemId, 'itemId'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.minPrice, 'minPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.medianPrice, 'medianPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.meanPrice, 'meanPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.quantity, 'quantity'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.numAuctions, 'numAuctions'), offset); offset += 4;
      buffer.writeInt16LE(encodeDelta(item.priceDelta24h), offset); offset += 2;
      buffer.writeInt16LE(encodeDelta(item.quantityDelta24h), offset); offset += 2;
    }

    // Referenced so a future edit to the field map cannot drift from the
    // offsets actually written above without the compiler noticing.
    void field;
    void itemRecordSize;

    return buffer;
  }

  /**
   * Encodes a single item's comprehensive auction state, price history,
   * hourly deltas, and current active auction lots.
   * Layout: 60-byte header, then daily / hourly / lot sections.
   */
  public static encodeItem(data: {
    itemId: number;
    connectedRealmId: number;
    lastUpdated: number;
    totalQuantity: number;
    numAuctions: number;
    minBuyout: number;
    medianPrice: number;
    meanPrice: number;
    marketCap: number;
    /** Percentage, or `null` when the change has not been measured yet. */
    priceDelta24h: number | null;
    /** Percentage, or `null` when the change has not been measured yet. */
    quantityDelta24h: number | null;
    dailyHistory: HistoryPoint[];
    hourlyDeltas: HourlyDelta[];
    activeLots: ActiveAuctionLot[];
  }): Buffer {
    const counts = encodeSectionCounts(data);

    const totalSize = itemSectionStart(counts) + data.activeLots.length * ITEM_FORMAT.activeLotSize;
    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Header
    buffer.writeUInt32LE(MAGIC_UNDR, offset); offset += 4;
    buffer.writeUInt16LE(BIN_VERSION, offset); offset += 2;
    buffer.writeUInt16LE(0, offset); offset += 2; // Reserved
    buffer.writeUInt32LE(assertFitsUint32(data.itemId, 'itemId'), offset); offset += 4;
    buffer.writeUInt32LE(
      assertFitsUint32(data.connectedRealmId, 'connectedRealmId'), offset
    ); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.lastUpdated, 'lastUpdated'), offset); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.totalQuantity, 'totalQuantity'), offset); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.numAuctions, 'numAuctions'), offset); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.minBuyout, 'minBuyout'), offset); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.medianPrice, 'medianPrice'), offset); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.meanPrice, 'meanPrice'), offset); offset += 4;

    // 64-bit market cap, split into two uint32 halves.
    if (!Number.isFinite(data.marketCap) || data.marketCap < 0) {
      throw new Error(`Cannot encode marketCap: invalid value (${String(data.marketCap)})`);
    }
    // Math.floor on a float above 2^53 yields a value BigInt() rejects, so
    // the ceiling is checked explicitly rather than surfacing as a cryptic
    // "cannot be converted to a BigInt" from inside the encoder.
    if (data.marketCap > Number.MAX_SAFE_INTEGER) {
      throw new Error(
        `Cannot encode marketCap: ${data.marketCap} exceeds Number.MAX_SAFE_INTEGER. ` +
          'Compute the split halves from a BigInt instead of a JS number.'
      );
    }
    const bigCap = BigInt(Math.floor(data.marketCap));
    const capLow = Number(bigCap & BigInt(MAX_UINT32));
    const capHigh = Number((bigCap >> BigInt(32)) & BigInt(MAX_UINT32));
    buffer.writeUInt32LE(capLow, offset); offset += 4;
    buffer.writeUInt32LE(capHigh, offset); offset += 4;

    buffer.writeInt16LE(encodeDelta(data.priceDelta24h), offset); offset += 2;
    buffer.writeInt16LE(encodeDelta(data.quantityDelta24h), offset); offset += 2;

    buffer.writeUInt16LE(counts.dailyHistoryCount, offset); offset += 2;
    buffer.writeUInt16LE(counts.hourlyDeltasCount, offset); offset += 2;
    buffer.writeUInt16LE(counts.activeLotsCount, offset); offset += 2;
    buffer.writeUInt16LE(0, offset); offset += 2; // Padding / alignment

    // Section 1: Daily history
    for (const point of data.dailyHistory) {
      buffer.writeUInt32LE(assertFitsUint32(point.timestamp, 'daily.timestamp'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(point.minPrice, 'daily.minPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(point.medianPrice, 'daily.medianPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(point.meanPrice, 'daily.meanPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(point.quantity, 'daily.quantity'), offset); offset += 4;
      buffer.writeUInt16LE(
        assertFitsUint16(point.numAuctions, 'daily.numAuctions'), offset
      ); offset += 2;
    }

    // Section 2: Hourly deltas
    for (const delta of data.hourlyDeltas) {
      buffer.writeUInt32LE(assertFitsUint32(delta.timestamp, 'hourly.timestamp'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(delta.minPrice, 'hourly.minPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(delta.medianPrice, 'hourly.medianPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(delta.quantity, 'hourly.quantity'), offset); offset += 4;
    }

    // Section 3: Active auction lots
    for (const lot of data.activeLots) {
      if (lot.sellerRealmId > MAX_SELLER_REALM_ID) {
        throw new Error(
          `Cannot encode sellerRealmId: ${lot.sellerRealmId} exceeds the uint16 field range ` +
            `(max ${MAX_SELLER_REALM_ID}). Widen lot.sellerRealmId to uint32 in a format bump.`
        );
      }
      buffer.writeUInt32LE(assertFitsUint32(lot.auctionId, 'lot.auctionId'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(lot.quantity, 'lot.quantity'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(lot.unitPrice, 'lot.unitPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(lot.buyout, 'lot.buyout'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(lot.bid, 'lot.bid'), offset); offset += 4;
      buffer.writeUInt8(lot.timeLeft, offset); offset += 1;
      buffer.writeUInt16LE(lot.sellerRealmId, offset); offset += 2;
      buffer.writeUInt8(0, offset); offset += 1; // Flags / reserved
    }

    void ITEM_FORMAT;
    void MAX_DELTA_SCALED;

    return buffer;
  }

  /**
   * Encodes the canonical per-realm item archive (`realm.bin`).
   *
   * One object per realm per run, holding every item's aggregate and its
   * live auction lots. This replaced one object per item: at 15.7 k items
   * per realm across 175 realms on a 30-minute schedule, the per-item shape
   * cost ~3.96 billion R2 requests a month.
   *
   * Records are variable length — an item stores only the lots it has.
   */
  public static encodeRealmArchive(data: {
    connectedRealmId: number;
    generatedAt: number;
    totalAuctionsCount: number;
    items: Array<{
      itemId: number;
      minPrice: number;
      medianPrice: number;
      meanPrice: number;
      quantity: number;
      numAuctions: number;
      marketCap: number;
      lots: ActiveAuctionLot[];
    }>;
  }): Buffer {
    const totalSize =
      REALM_FORMAT.headerSize +
      data.items.reduce(
        (sum, item) => sum + REALM_FORMAT.itemHeaderSize + item.lots.length * REALM_FORMAT.activeLotSize,
        0
      );
    const buffer = Buffer.alloc(totalSize);

    let offset = 0;
    buffer.writeUInt32LE(MAGIC_REALM, offset); offset += 4;
    buffer.writeUInt16LE(ARCHIVE_VERSION, offset); offset += 2;
    buffer.writeUInt16LE(0, offset); offset += 2; // Reserved
    buffer.writeUInt32LE(
      assertFitsUint32(data.connectedRealmId, 'connectedRealmId'),
      offset
    ); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.generatedAt, 'generatedAt'), offset); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.items.length, 'items.length'), offset); offset += 4;
    buffer.writeUInt32LE(0, offset); offset += 4; // Reserved
    buffer.writeUInt32LE(
      assertFitsUint32(data.totalAuctionsCount, 'totalAuctionsCount'),
      offset
    ); offset += 4;
    buffer.writeUInt32LE(0, offset); offset += 4; // Reserved

    for (const item of data.items) {
      buffer.writeUInt32LE(assertFitsUint32(item.itemId, 'itemId'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.minPrice, 'minPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.medianPrice, 'medianPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.meanPrice, 'meanPrice'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.quantity, 'quantity'), offset); offset += 4;
      buffer.writeUInt32LE(assertFitsUint32(item.numAuctions, 'numAuctions'), offset); offset += 4;

      const cap = splitMarketCap(item.marketCap, item.itemId);
      buffer.writeUInt32LE(cap.low, offset); offset += 4;
      buffer.writeUInt32LE(cap.high, offset); offset += 4;

      buffer.writeUInt16LE(
        assertFitsUint16(item.lots.length, 'lots.length'),
        offset
      ); offset += 2;
      buffer.writeUInt16LE(0, offset); offset += 2; // Reserved

      for (const lot of item.lots) {
        if (lot.sellerRealmId > MAX_SELLER_REALM_ID) {
          throw new Error(
            `Cannot encode sellerRealmId: ${lot.sellerRealmId} exceeds the uint16 field range ` +
              `(max ${MAX_SELLER_REALM_ID}).`
          );
        }
        buffer.writeUInt32LE(assertFitsUint32(lot.auctionId, 'lot.auctionId'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(lot.quantity, 'lot.quantity'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(lot.unitPrice, 'lot.unitPrice'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(lot.buyout, 'lot.buyout'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(lot.bid, 'lot.bid'), offset); offset += 4;
        buffer.writeUInt8(lot.timeLeft, offset); offset += 1;
        buffer.writeUInt16LE(lot.sellerRealmId, offset); offset += 2;
        buffer.writeUInt8(0, offset); offset += 1; // Flags / reserved
      }
    }

    return buffer;
  }

  /**
   * Encodes the rolling observation history (`history.bin`).
   *
   * Every item carries its own observations, each with the timestamp it was
   * taken at. Nothing here is modelled or sampled: a point exists only
   * because a run observed it.
   */
  public static encodeHistory(data: {
    connectedRealmId: number;
    generatedAt: number;
    hourlyIntervalSec: number;
    dailyIntervalSec: number;
    maxHourlyPerItem: number;
    maxDailyPerItem: number;
    items: Array<{
      itemId: number;
      hourly: Array<{
        timestamp: number;
        minPrice: number;
        medianPrice: number;
        quantity: number;
      }>;
      daily: Array<{
        timestamp: number;
        minPrice: number;
        medianPrice: number;
        meanPrice: number;
        quantity: number;
        numAuctions: number;
      }>;
    }>;
  }): Buffer {
    const totalSize =
      HISTORY_FORMAT.headerSize +
      data.items.reduce(
        (sum, item) =>
          sum +
          HISTORY_FORMAT.item.hourlyBase +
          item.hourly.length * HISTORY_FORMAT.hourlyEntrySize +
          item.daily.length * HISTORY_FORMAT.dailyEntrySize,
        0
      );
    const buffer = Buffer.alloc(totalSize);

    let offset = 0;
    buffer.writeUInt32LE(MAGIC_HISTORY, offset); offset += 4;
    buffer.writeUInt16LE(ARCHIVE_VERSION, offset); offset += 2;
    buffer.writeUInt16LE(0, offset); offset += 2; // Reserved
    buffer.writeUInt32LE(
      assertFitsUint32(data.connectedRealmId, 'connectedRealmId'),
      offset
    ); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.generatedAt, 'generatedAt'), offset); offset += 4;
    buffer.writeUInt32LE(assertFitsUint32(data.items.length, 'items.length'), offset); offset += 4;
    buffer.writeUInt32LE(0, offset); offset += 4; // Reserved
    buffer.writeUInt32LE(
      assertFitsUint32(data.hourlyIntervalSec, 'hourlyIntervalSec'),
      offset
    ); offset += 4;
    buffer.writeUInt32LE(
      assertFitsUint32(data.dailyIntervalSec, 'dailyIntervalSec'),
      offset
    ); offset += 4;
    buffer.writeUInt32LE(
      assertFitsUint32(data.maxHourlyPerItem, 'maxHourlyPerItem'),
      offset
    ); offset += 4;
    buffer.writeUInt32LE(
      assertFitsUint32(data.maxDailyPerItem, 'maxDailyPerItem'),
      offset
    ); offset += 4;
    buffer.writeUInt32LE(0, offset); offset += 4; // Reserved
    buffer.writeUInt32LE(0, offset); offset += 4; // Reserved

    for (const item of data.items) {
      buffer.writeUInt32LE(assertFitsUint32(item.itemId, 'itemId'), offset); offset += 4;
      buffer.writeUInt16LE(
        assertFitsUint16(item.hourly.length, 'hourly.length'),
        offset
      ); offset += 2;
      buffer.writeUInt16LE(
        assertFitsUint16(item.daily.length, 'daily.length'),
        offset
      ); offset += 2;

      for (const point of item.hourly) {
        buffer.writeUInt32LE(assertFitsUint32(point.timestamp, 'hourly.timestamp'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(point.minPrice, 'hourly.minPrice'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(point.medianPrice, 'hourly.medianPrice'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(point.quantity, 'hourly.quantity'), offset); offset += 4;
      }

      for (const point of item.daily) {
        buffer.writeUInt32LE(assertFitsUint32(point.timestamp, 'daily.timestamp'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(point.minPrice, 'daily.minPrice'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(point.medianPrice, 'daily.medianPrice'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(point.meanPrice, 'daily.meanPrice'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(point.quantity, 'daily.quantity'), offset); offset += 4;
        buffer.writeUInt32LE(assertFitsUint32(point.numAuctions, 'daily.numAuctions'), offset); offset += 4;
      }
    }

    return buffer;
  }
}

/**
 * Splits a 64-bit market cap into the two uint32 halves the format stores.
 *
 * Done with BigInt because `Math.floor` on a float above 2^53 yields a
 * value BigInt() rejects, and a silent truncation would put a wrong
 * number on the dashboard.
 */
function splitMarketCap(
  marketCap: number,
  itemId: number
): { low: number; high: number } {
  if (!Number.isFinite(marketCap) || marketCap < 0) {
    throw new Error(
      `Cannot encode marketCap for item ${itemId}: invalid value (${String(marketCap)})`
    );
  }
  if (marketCap > Number.MAX_SAFE_INTEGER) {
    throw new Error(
      `Cannot encode marketCap for item ${itemId}: ${marketCap} exceeds Number.MAX_SAFE_INTEGER.`
    );
  }
  const big = BigInt(Math.floor(marketCap));
  return {
    low: Number(big & BigInt(MAX_UINT32)),
    high: Number((big >> BigInt(32)) & BigInt(MAX_UINT32)),
  };
}
