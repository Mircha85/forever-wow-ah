import {
  type DecodedStateBin,
  type DecodedItemBin,
  type StateItemSummary,
  type HistoryPoint,
  type HourlyDelta,
  type ActiveAuctionLot,
  type TimeLeftCode,
} from '../types/auction';

export const MAGIC_UNDR = 0x554e4452; // 'UNDR'

export class BinaryDecoder {
  /**
   * Decodes a state.bin ArrayBuffer into structured TypeScript data.
   */
  public static decodeState(buffer: ArrayBuffer): DecodedStateBin {
    const view = new DataView(buffer);

    if (view.byteLength < 24) {
      throw new Error(`Invalid state.bin: buffer too small (${view.byteLength} bytes)`);
    }

    let offset = 0;
    const magic = view.getUint32(offset, true); offset += 4;
    if (magic !== MAGIC_UNDR) {
      throw new Error(`Invalid state.bin magic: expected 0x554E4452, got 0x${magic.toString(16)}`);
    }

    const version = view.getUint16(offset, true); offset += 2;
    offset += 2; // skip reserved
    const connectedRealmId = view.getUint32(offset, true); offset += 4;
    const generatedAt = view.getUint32(offset, true); offset += 4;
    const totalAuctionsCount = view.getUint32(offset, true); offset += 4;
    const totalItemsCount = view.getUint32(offset, true); offset += 4;

    const items: StateItemSummary[] = [];
    const itemRecordSize = 28;

    for (let i = 0; i < totalItemsCount; i++) {
      if (offset + itemRecordSize > view.byteLength) {
        break;
      }

      const itemId = view.getUint32(offset, true); offset += 4;
      const minPrice = view.getUint32(offset, true); offset += 4;
      const medianPrice = view.getUint32(offset, true); offset += 4;
      const meanPrice = view.getUint32(offset, true); offset += 4;
      const quantity = view.getUint32(offset, true); offset += 4;
      const numAuctions = view.getUint32(offset, true); offset += 4;
      const priceDeltaScaled = view.getInt16(offset, true); offset += 2;
      const quantityDeltaScaled = view.getInt16(offset, true); offset += 2;

      items.push({
        itemId,
        minPrice,
        medianPrice,
        meanPrice,
        quantity,
        numAuctions,
        priceDelta24h: Math.round(priceDeltaScaled) / 100,
        quantityDelta24h: Math.round(quantityDeltaScaled) / 100,
      });
    }

    return {
      magic,
      version,
      connectedRealmId,
      generatedAt,
      totalAuctionsCount,
      totalItemsCount,
      items,
    };
  }

  /**
   * Decodes an {itemId}.bin ArrayBuffer into complete item analytics,
   * daily history, hourly deltas, and active auction lots.
   */
  public static decodeItem(buffer: ArrayBuffer): DecodedItemBin {
    const view = new DataView(buffer);

    if (view.byteLength < 60) {
      throw new Error(`Invalid item.bin: buffer too small (${view.byteLength} bytes)`);
    }

    let offset = 0;
    const magic = view.getUint32(offset, true); offset += 4;
    if (magic !== MAGIC_UNDR) {
      throw new Error(`Invalid item.bin magic: expected 0x554E4452, got 0x${magic.toString(16)}`);
    }

    const version = view.getUint16(offset, true); offset += 2;
    offset += 2; // skip reserved

    const itemId = view.getUint32(offset, true); offset += 4;
    const connectedRealmId = view.getUint32(offset, true); offset += 4;
    const lastUpdated = view.getUint32(offset, true); offset += 4;
    const totalQuantity = view.getUint32(offset, true); offset += 4;
    const numAuctions = view.getUint32(offset, true); offset += 4;
    const minBuyout = view.getUint32(offset, true); offset += 4;
    const medianPrice = view.getUint32(offset, true); offset += 4;
    const meanPrice = view.getUint32(offset, true); offset += 4;

    const capLow = view.getUint32(offset, true); offset += 4;
    const capHigh = view.getUint32(offset, true); offset += 4;
    const marketCap = Number(BigInt(capLow) | (BigInt(capHigh) << BigInt(32)));

    const priceDeltaScaled = view.getInt16(offset, true); offset += 2;
    const quantityDeltaScaled = view.getInt16(offset, true); offset += 2;

    const dailyCount = view.getUint16(offset, true); offset += 2;
    const hourlyCount = view.getUint16(offset, true); offset += 2;
    const activeLotsCount = view.getUint16(offset, true); offset += 2;
    offset += 2; // skip padding / alignment

    // Section 1: Daily History (22 bytes per entry)
    const dailyHistory: HistoryPoint[] = [];
    for (let i = 0; i < dailyCount; i++) {
      if (offset + 22 > view.byteLength) break;
      const timestamp = view.getUint32(offset, true); offset += 4;
      const minPrice = view.getUint32(offset, true); offset += 4;
      const medianPrice = view.getUint32(offset, true); offset += 4;
      const meanPrice = view.getUint32(offset, true); offset += 4;
      const quantity = view.getUint32(offset, true); offset += 4;
      const numAuctions = view.getUint16(offset, true); offset += 2;

      dailyHistory.push({
        timestamp,
        minPrice,
        medianPrice,
        meanPrice,
        quantity,
        numAuctions,
      });
    }

    // Section 2: Hourly Deltas (16 bytes per entry)
    const hourlyDeltas: HourlyDelta[] = [];
    for (let i = 0; i < hourlyCount; i++) {
      if (offset + 16 > view.byteLength) break;
      const timestamp = view.getUint32(offset, true); offset += 4;
      const minPrice = view.getUint32(offset, true); offset += 4;
      const medianPrice = view.getUint32(offset, true); offset += 4;
      const quantity = view.getUint32(offset, true); offset += 4;

      hourlyDeltas.push({
        timestamp,
        minPrice,
        medianPrice,
        quantity,
      });
    }

    // Section 3: Active Auction Lots (24 bytes per entry)
    const activeLots: ActiveAuctionLot[] = [];
    for (let i = 0; i < activeLotsCount; i++) {
      if (offset + 24 > view.byteLength) break;
      const auctionId = view.getUint32(offset, true); offset += 4;
      const quantity = view.getUint32(offset, true); offset += 4;
      const unitPrice = view.getUint32(offset, true); offset += 4;
      const buyout = view.getUint32(offset, true); offset += 4;
      const bid = view.getUint32(offset, true); offset += 4;
      const timeLeft = view.getUint8(offset) as TimeLeftCode; offset += 1;
      const sellerRealmId = view.getUint16(offset, true); offset += 2;
      offset += 1; // skip flags / reserved

      activeLots.push({
        auctionId,
        quantity,
        unitPrice,
        buyout,
        bid,
        timeLeft,
        sellerRealmId,
      });
    }

    return {
      magic,
      version,
      itemId,
      connectedRealmId,
      lastUpdated,
      totalQuantity,
      numAuctions,
      minBuyout,
      medianPrice,
      meanPrice,
      marketCap,
      priceDelta24h: Math.round(priceDeltaScaled) / 100,
      quantityDelta24h: Math.round(quantityDeltaScaled) / 100,
      dailyHistory,
      hourlyDeltas,
      activeLots,
    };
  }
}
