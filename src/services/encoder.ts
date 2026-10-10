import {
  type StateItemSummary,
  type HistoryPoint,
  type HourlyDelta,
  type ActiveAuctionLot,
} from '../types/auction';

export const MAGIC_UNDR = 0x554e4452; // 'UNDR' in ASCII
export const BIN_VERSION = 1;

export class BinaryEncoder {
  /**
   * Encodes the global market state into a compact binary Buffer.
   * Format:
   * [Header: 24 bytes]
   *   - 0..3:   Magic (0x554E4452) [Uint32 LE]
   *   - 4..5:   Version (1)        [Uint16 LE]
   *   - 6..7:   Reserved (0)       [Uint16 LE]
   *   - 8..11:  Realm ID           [Uint32 LE]
   *   - 12..15: GeneratedAt        [Uint32 LE]
   *   - 16..19: Total Auctions     [Uint32 LE]
   *   - 20..23: Total Items Count  [Uint32 LE]
   * [Items Records: count * 28 bytes]
   *   - 0..3:   ItemId             [Uint32 LE]
   *   - 4..7:   MinPrice           [Uint32 LE]
   *   - 8..11:  MedianPrice        [Uint32 LE]
   *   - 12..15: MeanPrice          [Uint32 LE]
   *   - 16..19: Quantity           [Uint32 LE]
   *   - 20..23: NumAuctions        [Uint32 LE]
   *   - 24..25: PriceDelta24h      [Int16 LE, scaled by 100]
   *   - 26..27: QuantityDelta24h   [Int16 LE, scaled by 100]
   */
  public static encodeState(state: {
    connectedRealmId: number;
    generatedAt: number;
    totalAuctionsCount: number;
    items: StateItemSummary[];
  }): Buffer {
    const headerSize = 24;
    const recordSize = 28;
    const totalSize = headerSize + state.items.length * recordSize;
    const buffer = Buffer.alloc(totalSize);

    let offset = 0;

    // Header
    buffer.writeUInt32LE(MAGIC_UNDR, offset); offset += 4;
    buffer.writeUInt16LE(BIN_VERSION, offset); offset += 2;
    buffer.writeUInt16LE(0, offset); offset += 2;
    buffer.writeUInt32LE(state.connectedRealmId, offset); offset += 4;
    buffer.writeUInt32LE(state.generatedAt, offset); offset += 4;
    buffer.writeUInt32LE(state.totalAuctionsCount, offset); offset += 4;
    buffer.writeUInt32LE(state.items.length, offset); offset += 4;

    // Item Records
    for (const item of state.items) {
      buffer.writeUInt32LE(item.itemId, offset); offset += 4;
      buffer.writeUInt32LE(Math.max(0, Math.floor(item.minPrice)), offset); offset += 4;
      buffer.writeUInt32LE(Math.max(0, Math.floor(item.medianPrice)), offset); offset += 4;
      buffer.writeUInt32LE(Math.max(0, Math.floor(item.meanPrice)), offset); offset += 4;
      buffer.writeUInt32LE(Math.max(0, Math.floor(item.quantity)), offset); offset += 4;
      buffer.writeUInt32LE(Math.max(0, Math.floor(item.numAuctions)), offset); offset += 4;

      // Scale floats to int16 (e.g. 5.25% -> 525, clamped to [-32700, 32700])
      const pDelta = Math.min(32700, Math.max(-32700, Math.round(item.priceDelta24h * 100)));
      const qDelta = Math.min(32700, Math.max(-32700, Math.round(item.quantityDelta24h * 100)));
      buffer.writeInt16LE(pDelta, offset); offset += 2;
      buffer.writeInt16LE(qDelta, offset); offset += 2;
    }

    return buffer;
  }

  /**
   * Encodes a single item's comprehensive auction state, price history,
   * hourly deltas, and current active auction lots.
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
    priceDelta24h: number;
    quantityDelta24h: number;
    dailyHistory: HistoryPoint[];
    hourlyDeltas: HourlyDelta[];
    activeLots: ActiveAuctionLot[];
  }): Buffer {
    const headerSize = 60;
    const dailyEntrySize = 22;
    const hourlyEntrySize = 16;
    const activeLotSize = 24;

    const totalSize =
      headerSize +
      data.dailyHistory.length * dailyEntrySize +
      data.hourlyDeltas.length * hourlyEntrySize +
      data.activeLots.length * activeLotSize;

    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Header (60 bytes)
    buffer.writeUInt32LE(MAGIC_UNDR, offset); offset += 4;
    buffer.writeUInt16LE(BIN_VERSION, offset); offset += 2;
    buffer.writeUInt16LE(0, offset); offset += 2; // Reserved
    buffer.writeUInt32LE(data.itemId, offset); offset += 4;
    buffer.writeUInt32LE(data.connectedRealmId, offset); offset += 4;
    buffer.writeUInt32LE(data.lastUpdated, offset); offset += 4;
    buffer.writeUInt32LE(data.totalQuantity, offset); offset += 4;
    buffer.writeUInt32LE(data.numAuctions, offset); offset += 4;
    buffer.writeUInt32LE(Math.max(0, Math.floor(data.minBuyout)), offset); offset += 4;
    buffer.writeUInt32LE(Math.max(0, Math.floor(data.medianPrice)), offset); offset += 4;
    buffer.writeUInt32LE(Math.max(0, Math.floor(data.meanPrice)), offset); offset += 4;

    // Split 64-bit marketCap into high and low uint32
    const bigCap = BigInt(Math.max(0, Math.floor(data.marketCap)));
    const capLow = Number(bigCap & BigInt(0xffffffff));
    const capHigh = Number((bigCap >> BigInt(32)) & BigInt(0xffffffff));
    buffer.writeUInt32LE(capLow, offset); offset += 4;
    buffer.writeUInt32LE(capHigh, offset); offset += 4;

    const pDelta = Math.min(32700, Math.max(-32700, Math.round(data.priceDelta24h * 100)));
    const qDelta = Math.min(32700, Math.max(-32700, Math.round(data.quantityDelta24h * 100)));
    buffer.writeInt16LE(pDelta, offset); offset += 2;
    buffer.writeInt16LE(qDelta, offset); offset += 2;

    buffer.writeUInt16LE(data.dailyHistory.length, offset); offset += 2;
    buffer.writeUInt16LE(data.hourlyDeltas.length, offset); offset += 2;
    buffer.writeUInt16LE(data.activeLots.length, offset); offset += 2;
    buffer.writeUInt16LE(0, offset); offset += 2; // Padding / alignment

    // Section 1: Daily History
    for (const point of data.dailyHistory) {
      buffer.writeUInt32LE(point.timestamp, offset); offset += 4;
      buffer.writeUInt32LE(Math.min(0xffffffff, Math.max(0, Math.floor(point.minPrice))), offset); offset += 4;
      buffer.writeUInt32LE(Math.min(0xffffffff, Math.max(0, Math.floor(point.medianPrice))), offset); offset += 4;
      buffer.writeUInt32LE(Math.min(0xffffffff, Math.max(0, Math.floor(point.meanPrice))), offset); offset += 4;
      buffer.writeUInt32LE(Math.min(0xffffffff, Math.max(0, Math.floor(point.quantity))), offset); offset += 4;
      buffer.writeUInt16LE(Math.min(65535, point.numAuctions), offset); offset += 2;
    }

    // Section 2: Hourly Deltas
    for (const delta of data.hourlyDeltas) {
      buffer.writeUInt32LE(delta.timestamp, offset); offset += 4;
      buffer.writeUInt32LE(Math.min(0xffffffff, Math.max(0, Math.floor(delta.minPrice))), offset); offset += 4;
      buffer.writeUInt32LE(Math.min(0xffffffff, Math.max(0, Math.floor(delta.medianPrice))), offset); offset += 4;
      buffer.writeUInt32LE(Math.min(0xffffffff, Math.max(0, Math.floor(delta.quantity))), offset); offset += 4;
    }

    // Section 3: Active Auction Lots
    for (const lot of data.activeLots) {
      buffer.writeUInt32LE(lot.auctionId, offset); offset += 4;
      buffer.writeUInt32LE(lot.quantity, offset); offset += 4;
      buffer.writeUInt32LE(Math.max(0, Math.floor(lot.unitPrice)), offset); offset += 4;
      buffer.writeUInt32LE(Math.max(0, Math.floor(lot.buyout)), offset); offset += 4;
      buffer.writeUInt32LE(Math.max(0, Math.floor(lot.bid)), offset); offset += 4;
      buffer.writeUInt8(lot.timeLeft, offset); offset += 1;
      buffer.writeUInt16LE(lot.sellerRealmId, offset); offset += 2;
      buffer.writeUInt8(0, offset); offset += 1; // Flags / reserved
    }

    return buffer;
  }
}
