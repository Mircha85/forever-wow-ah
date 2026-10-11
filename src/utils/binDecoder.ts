import {
  type DecodedStateBin,
  type DecodedItemBin,
  type StateItemSummary,
  type HistoryPoint,
  type HourlyDelta,
  type ActiveAuctionLot,
  type TimeLeftCode,
} from '../types/auction';
import {
  BIN_VERSION,
  ITEM_FORMAT,
  MAGIC_UNDR,
  STATE_FORMAT,
  itemSectionStart,
} from './binaryFormat';

export { MAGIC_UNDR };

/**
 * A cache blob that is shorter than the counts in its own header is
 * truncated: a partial R2 write, a cut CDN response, or a payload from a
 * newer format version.
 *
 * The decoder used to `break` out of the section loops and still return
 * the count read from the header, so `items.length` silently disagreed
 * with `totalItemsCount` and the dashboard rendered a short list with no
 * error anywhere. Throwing makes a truncated blob a loud, attributable
 * failure instead of a plausible-looking wrong answer.
 */
function assertAvailable(
  offset: number,
  recordSize: number,
  byteLength: number,
  what: string
): void {
  if (offset + recordSize > byteLength) {
    throw new Error(
      `Truncated ${what}: need ${recordSize} bytes at offset ${offset} but the buffer is ` +
        `${byteLength} bytes. The cached payload is incomplete or was written by a different ` +
        'format version — drop the cache entry and re-run the pipeline.'
    );
  }
}

export class BinaryDecoder {
  /**
   * Decodes a state.bin ArrayBuffer into structured TypeScript data.
   */
  public static decodeState(buffer: ArrayBuffer): DecodedStateBin {
    const view = new DataView(buffer);
    const { headerSize, itemRecordSize, field, item: itemField } = STATE_FORMAT;

    if (view.byteLength < headerSize) {
      throw new Error(`Invalid state.bin: buffer too small (${view.byteLength} bytes)`);
    }

    const magic = view.getUint32(field.magic, true);
    if (magic !== MAGIC_UNDR) {
      throw new Error(
        `Invalid state.bin magic: expected 0x554E4452, got 0x${magic.toString(16)}`
      );
    }

    const version = view.getUint16(field.version, true);
    if (version !== BIN_VERSION) {
      throw new Error(
        `Unsupported state.bin version ${version}; this build reads version ${BIN_VERSION}. ` +
          'Re-run the pipeline to regenerate the cache.'
      );
    }

    const connectedRealmId = view.getUint32(field.connectedRealmId, true);
    const generatedAt = view.getUint32(field.generatedAt, true);
    const totalAuctionsCount = view.getUint32(field.totalAuctionsCount, true);
    const totalItemsCount = view.getUint32(field.totalItemsCount, true);

    // The header can legitimately be read while the body is short only if
    // the payload was cut mid-write, so verify the body up front.
    assertAvailable(
      headerSize,
      totalItemsCount * itemRecordSize,
      view.byteLength,
      'state.bin body'
    );

    const items: StateItemSummary[] = [];
    let offset = headerSize;

    for (let i = 0; i < totalItemsCount; i++) {
      assertAvailable(offset, itemRecordSize, view.byteLength, 'state.bin item record');

      const itemId = view.getUint32(offset + itemField.itemId, true);
      const minPrice = view.getUint32(offset + itemField.minPrice, true);
      const medianPrice = view.getUint32(offset + itemField.medianPrice, true);
      const meanPrice = view.getUint32(offset + itemField.meanPrice, true);
      const quantity = view.getUint32(offset + itemField.quantity, true);
      const numAuctions = view.getUint32(offset + itemField.numAuctions, true);
      const priceDeltaScaled = view.getInt16(offset + itemField.priceDelta24h, true);
      const quantityDeltaScaled = view.getInt16(offset + itemField.quantityDelta24h, true);
      offset += itemRecordSize;

      items.push({
        itemId,
        minPrice,
        medianPrice,
        meanPrice,
        quantity,
        numAuctions,
        priceDelta24h: priceDeltaScaled / 100,
        quantityDelta24h: quantityDeltaScaled / 100,
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
   * Decodes a {itemId}.bin ArrayBuffer into complete item analytics,
   * daily history, hourly deltas, and active auction lots.
   */
  public static decodeItem(buffer: ArrayBuffer): DecodedItemBin {
    const view = new DataView(buffer);
    const { headerSize, field } = ITEM_FORMAT;

    if (view.byteLength < headerSize) {
      throw new Error(`Invalid item.bin: buffer too small (${view.byteLength} bytes)`);
    }

    const magic = view.getUint32(field.magic, true);
    if (magic !== MAGIC_UNDR) {
      throw new Error(
        `Invalid item.bin magic: expected 0x554E4452, got 0x${magic.toString(16)}`
      );
    }

    const version = view.getUint16(field.version, true);
    if (version !== BIN_VERSION) {
      throw new Error(
        `Unsupported item.bin version ${version}; this build reads version ${BIN_VERSION}. ` +
          'Re-run the pipeline to regenerate the cache.'
      );
    }

    const itemId = view.getUint32(field.itemId, true);
    const connectedRealmId = view.getUint32(field.connectedRealmId, true);
    const lastUpdated = view.getUint32(field.lastUpdated, true);
    const totalQuantity = view.getUint32(field.totalQuantity, true);
    const numAuctions = view.getUint32(field.numAuctions, true);
    const minBuyout = view.getUint32(field.minBuyout, true);
    const medianPrice = view.getUint32(field.medianPrice, true);
    const meanPrice = view.getUint32(field.meanPrice, true);

    const capLow = view.getUint32(field.marketCapLow, true);
    const capHigh = view.getUint32(field.marketCapHigh, true);
    const marketCap = Number(BigInt(capLow) + (BigInt(capHigh) << BigInt(32)));

    const priceDeltaScaled = view.getInt16(field.priceDelta24h, true);
    const quantityDeltaScaled = view.getInt16(field.quantityDelta24h, true);

    const dailyCount = view.getUint16(field.dailyHistoryCount, true);
    const hourlyCount = view.getUint16(field.hourlyDeltasCount, true);
    const activeLotsCount = view.getUint16(field.activeLotsCount, true);

    // The three variable-length sections are contiguous, so the required
    // size follows from the counts alone.
    const required =
      itemSectionStart({ dailyHistoryCount: dailyCount, hourlyDeltasCount: hourlyCount }) +
      activeLotsCount * ITEM_FORMAT.activeLotSize;
    if (view.byteLength < required) {
      throw new Error(
        `Truncated item.bin: header declares ${dailyCount} daily, ${hourlyCount} hourly and ` +
          `${activeLotsCount} lot entries (${required} bytes) but the buffer is ${view.byteLength} ` +
          'bytes. The cached payload is incomplete or was written by a different format version — ' +
          'drop the cache entry and re-run the pipeline.'
      );
    }

    const dailyHistory: HistoryPoint[] = [];
    let offset = headerSize;

    for (let i = 0; i < dailyCount; i++) {
      assertAvailable(offset, ITEM_FORMAT.dailyEntrySize, view.byteLength, 'item.bin daily entry');
      dailyHistory.push({
        timestamp: view.getUint32(offset + ITEM_FORMAT.daily.timestamp, true),
        minPrice: view.getUint32(offset + ITEM_FORMAT.daily.minPrice, true),
        medianPrice: view.getUint32(offset + ITEM_FORMAT.daily.medianPrice, true),
        meanPrice: view.getUint32(offset + ITEM_FORMAT.daily.meanPrice, true),
        quantity: view.getUint32(offset + ITEM_FORMAT.daily.quantity, true),
        numAuctions: view.getUint16(offset + ITEM_FORMAT.daily.numAuctions, true),
      });
      offset += ITEM_FORMAT.dailyEntrySize;
    }

    const hourlyDeltas: HourlyDelta[] = [];
    for (let i = 0; i < hourlyCount; i++) {
      assertAvailable(offset, ITEM_FORMAT.hourlyEntrySize, view.byteLength, 'item.bin hourly entry');
      hourlyDeltas.push({
        timestamp: view.getUint32(offset + ITEM_FORMAT.hourly.timestamp, true),
        minPrice: view.getUint32(offset + ITEM_FORMAT.hourly.minPrice, true),
        medianPrice: view.getUint32(offset + ITEM_FORMAT.hourly.medianPrice, true),
        quantity: view.getUint32(offset + ITEM_FORMAT.hourly.quantity, true),
      });
      offset += ITEM_FORMAT.hourlyEntrySize;
    }

    const activeLots: ActiveAuctionLot[] = [];
    for (let i = 0; i < activeLotsCount; i++) {
      assertAvailable(offset, ITEM_FORMAT.activeLotSize, view.byteLength, 'item.bin lot entry');
      activeLots.push({
        auctionId: view.getUint32(offset + ITEM_FORMAT.lot.auctionId, true),
        quantity: view.getUint32(offset + ITEM_FORMAT.lot.quantity, true),
        unitPrice: view.getUint32(offset + ITEM_FORMAT.lot.unitPrice, true),
        buyout: view.getUint32(offset + ITEM_FORMAT.lot.buyout, true),
        bid: view.getUint32(offset + ITEM_FORMAT.lot.bid, true),
        timeLeft: view.getUint8(offset + ITEM_FORMAT.lot.timeLeft) as TimeLeftCode,
        sellerRealmId: view.getUint16(offset + ITEM_FORMAT.lot.sellerRealmId, true),
      });
      offset += ITEM_FORMAT.activeLotSize;
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
      priceDelta24h: priceDeltaScaled / 100,
      quantityDelta24h: quantityDeltaScaled / 100,
      dailyHistory,
      hourlyDeltas,
      activeLots,
    };
  }
}
