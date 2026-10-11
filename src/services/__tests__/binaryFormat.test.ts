import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { BinaryEncoder } from '../encoder';
import { BinaryDecoder } from '../../utils/binDecoder';
import {
  ITEM_FORMAT,
  MAGIC_UNDR,
  MAX_UINT32,
  STATE_FORMAT,
  clampDelta,
} from '../../utils/binaryFormat';
import type {
  ActiveAuctionLot,
  HistoryPoint,
  HourlyDelta,
  StateItemSummary,
} from '../../types/auction';

/** BinaryEncoder writes Node Buffers; BinaryDecoder reads browser ArrayBuffers. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
}

const stateFixture = (items: StateItemSummary[]) => ({
  connectedRealmId: 6412,
  generatedAt: 1_789_000_000,
  totalAuctionsCount: 12_345,
  items,
});

const itemFixture = (over: Partial<Parameters<typeof BinaryEncoder.encodeItem>[0]> = {}) => ({
  itemId: 16204,
  connectedRealmId: 6412,
  lastUpdated: 1_789_000_000,
  totalQuantity: 800_000,
  numAuctions: 25,
  minBuyout: 10_000_000,
  medianPrice: 10_500_000,
  meanPrice: 10_200_000,
  marketCap: 8_400_000_000_000,
  priceDelta24h: 5.25,
  quantityDelta24h: -2.5,
  dailyHistory: [] as HistoryPoint[],
  hourlyDeltas: [] as HourlyDelta[],
  activeLots: [] as ActiveAuctionLot[],
  ...over,
});

describe('UNDR v1 layout contract', () => {
  it('sizes the state header and record exactly as documented', () => {
    const empty = BinaryEncoder.encodeState(stateFixture([]));
    assert.equal(empty.length, STATE_FORMAT.headerSize);
    assert.equal(empty.length, 24);

    const one = BinaryEncoder.encodeState(
      stateFixture([{ itemId: 1, minPrice: 1, medianPrice: 1, meanPrice: 1, quantity: 1, numAuctions: 1, priceDelta24h: 0, quantityDelta24h: 0 }])
    );
    assert.equal(one.length - empty.length, STATE_FORMAT.itemRecordSize);
    assert.equal(one.length - empty.length, 28);
  });

  it('sizes the item header and each section exactly as documented', () => {
    const bare = BinaryEncoder.encodeItem(itemFixture());
    assert.equal(bare.length, ITEM_FORMAT.headerSize);
    assert.equal(bare.length, 60);

    const withDaily = BinaryEncoder.encodeItem(
      itemFixture({ dailyHistory: [{ timestamp: 1, minPrice: 1, medianPrice: 1, meanPrice: 1, quantity: 1, numAuctions: 1 }] })
    );
    assert.equal(withDaily.length - bare.length, ITEM_FORMAT.dailyEntrySize);
    assert.equal(withDaily.length - bare.length, 22);

    const withHourly = BinaryEncoder.encodeItem(
      itemFixture({ hourlyDeltas: [{ timestamp: 1, minPrice: 1, medianPrice: 1, quantity: 1 }] })
    );
    assert.equal(withHourly.length - bare.length, ITEM_FORMAT.hourlyEntrySize);
    assert.equal(withHourly.length - bare.length, 16);

    const withLots = BinaryEncoder.encodeItem(
      itemFixture({ activeLots: [{ auctionId: 1, quantity: 1, unitPrice: 1, buyout: 1, bid: 1, timeLeft: 1, sellerRealmId: 1 }] })
    );
    assert.equal(withLots.length - bare.length, ITEM_FORMAT.activeLotSize);
    assert.equal(withLots.length - bare.length, 24);
  });

  it('writes the magic and version at the offsets the decoder reads', () => {
    const buffer = BinaryEncoder.encodeState(stateFixture([]));
    const view = new DataView(toArrayBuffer(buffer));
    assert.equal(view.getUint32(STATE_FORMAT.field.magic, true), MAGIC_UNDR);
    assert.equal(view.getUint16(STATE_FORMAT.field.version, true), 1);
  });
});

describe('state.bin round trip', () => {
  it('preserves a realistic item set', () => {
    const items: StateItemSummary[] = [
      { itemId: 16204, minPrice: 1_800, medianPrice: 2_200, meanPrice: 2_100, quantity: 120, numAuctions: 18, priceDelta24h: 5.25, quantityDelta24h: -2.5 },
      { itemId: 13468, minPrice: 1_450_000, medianPrice: 1_520_000, meanPrice: 1_500_000, quantity: 18, numAuctions: 4, priceDelta24h: -11.75, quantityDelta24h: 0 },
    ];
    const source = stateFixture(items);
    const decoded = BinaryDecoder.decodeState(toArrayBuffer(BinaryEncoder.encodeState(source)));

    assert.equal(decoded.magic, MAGIC_UNDR);
    assert.equal(decoded.version, 1);
    assert.equal(decoded.connectedRealmId, source.connectedRealmId);
    assert.equal(decoded.generatedAt, source.generatedAt);
    assert.equal(decoded.totalAuctionsCount, source.totalAuctionsCount);
    assert.equal(decoded.totalItemsCount, items.length);
    assert.deepEqual(decoded.items, items);
  });

  it('handles an empty realm without inventing rows', () => {
    const decoded = BinaryDecoder.decodeState(toArrayBuffer(BinaryEncoder.encodeState(stateFixture([]))));
    assert.equal(decoded.totalItemsCount, 0);
    assert.deepEqual(decoded.items, []);
  });

  it('round-trips zero and maximum field values', () => {
    const items: StateItemSummary[] = [
      { itemId: 0, minPrice: 0, medianPrice: 0, meanPrice: 0, quantity: 0, numAuctions: 0, priceDelta24h: 0, quantityDelta24h: 0 },
      { itemId: MAX_UINT32, minPrice: MAX_UINT32, medianPrice: MAX_UINT32, meanPrice: MAX_UINT32, quantity: MAX_UINT32, numAuctions: MAX_UINT32, priceDelta24h: 0, quantityDelta24h: 0 },
    ];
    const decoded = BinaryDecoder.decodeState(toArrayBuffer(BinaryEncoder.encodeState(stateFixture(items))));
    assert.deepEqual(decoded.items, items);
  });
});

describe('{itemId}.bin round trip', () => {
  it('preserves every section', () => {
    const source = itemFixture({
      dailyHistory: [
        { timestamp: 1_788_000_000, minPrice: 9_000_000, medianPrice: 9_500_000, meanPrice: 9_400_000, quantity: 700_000, numAuctions: 900 },
        { timestamp: 1_788_086_400, minPrice: 9_800_000, medianPrice: 10_100_000, meanPrice: 10_000_000, quantity: 780_000, numAuctions: 1_010 },
      ],
      hourlyDeltas: [
        { timestamp: 1_788_900_000, minPrice: 10_000_000, medianPrice: 10_500_000, quantity: 800_000 },
        { timestamp: 1_788_903_600, minPrice: 10_200_000, medianPrice: 10_600_000, quantity: 810_000 },
      ],
      activeLots: [
        { auctionId: 100_001, quantity: 20, unitPrice: 10_000_000, buyout: 200_000_000, bid: 170_000_000, timeLeft: 1, sellerRealmId: 6412 },
        { auctionId: 100_002, quantity: 40, unitPrice: 10_100_000, buyout: 404_000_000, bid: 343_400_000, timeLeft: 4, sellerRealmId: 6412 },
      ],
    });

    const decoded = BinaryDecoder.decodeItem(toArrayBuffer(BinaryEncoder.encodeItem(source)));

    assert.equal(decoded.itemId, source.itemId);
    assert.equal(decoded.connectedRealmId, source.connectedRealmId);
    assert.equal(decoded.lastUpdated, source.lastUpdated);
    assert.equal(decoded.totalQuantity, source.totalQuantity);
    assert.equal(decoded.numAuctions, source.numAuctions);
    assert.equal(decoded.minBuyout, source.minBuyout);
    assert.equal(decoded.medianPrice, source.medianPrice);
    assert.equal(decoded.meanPrice, source.meanPrice);
    assert.equal(decoded.marketCap, source.marketCap);
    assert.equal(decoded.priceDelta24h, 5.25);
    assert.equal(decoded.quantityDelta24h, -2.5);
    assert.deepEqual(decoded.dailyHistory, source.dailyHistory);
    assert.deepEqual(decoded.hourlyDeltas, source.hourlyDeltas);
    assert.deepEqual(decoded.activeLots, source.activeLots);
  });

  it('handles an item with no history and no lots', () => {
    const decoded = BinaryDecoder.decodeItem(toArrayBuffer(BinaryEncoder.encodeItem(itemFixture())));
    assert.deepEqual(decoded.dailyHistory, []);
    assert.deepEqual(decoded.hourlyDeltas, []);
    assert.deepEqual(decoded.activeLots, []);
  });

  it('splits a marketCap above 2^32 across the two 32-bit halves', () => {
    // 8.4e12 copper does not fit a uint32 — this is the case the 64-bit
    // field exists for, and the one a naive single-word read would corrupt.
    const source = itemFixture({ marketCap: 8_400_000_000_000 });
    const buffer = BinaryEncoder.encodeItem(source);
    const view = new DataView(toArrayBuffer(buffer));

    assert.ok(view.getUint32(ITEM_FORMAT.field.marketCapHigh, true) > 0, 'high half should be non-zero');
    assert.equal(BinaryDecoder.decodeItem(toArrayBuffer(buffer)).marketCap, source.marketCap);
  });

  it('keeps marketCap exact at and across the 2^32 boundary', () => {
    for (const marketCap of [0, 1, MAX_UINT32, MAX_UINT32 + 1, 2 ** 32, 2 ** 40, 2 ** 50]) {
      const buffer = BinaryEncoder.encodeItem(itemFixture({ marketCap }));
      assert.equal(
        BinaryDecoder.decodeItem(toArrayBuffer(buffer)).marketCap,
        marketCap,
        `marketCap ${marketCap} did not survive the round trip`
      );
    }
  });
});

describe('percentage deltas', () => {
  it('clamps to the int16 range instead of wrapping', () => {
    // clampDelta works in scaled units (percent * 100), so 400% becomes
    // 40000, which does not fit an int16 and must saturate at 32700
    // rather than wrap into a negative.
    assert.equal(clampDelta(400), 32700);
    assert.equal(clampDelta(-400), -32700);
    assert.equal(clampDelta(327), 32700);
    assert.equal(clampDelta(-327), -32700);
    assert.equal(clampDelta(1.5), 150);

    const decoded = BinaryDecoder.decodeItem(
      toArrayBuffer(BinaryEncoder.encodeItem(itemFixture({ priceDelta24h: 400, quantityDelta24h: -400 })))
    );
    assert.equal(decoded.priceDelta24h, 327);
    assert.equal(decoded.quantityDelta24h, -327);
  });

  it('rounds to two decimal places', () => {
    assert.equal(clampDelta(5.255), 526);
    assert.equal(clampDelta(5.25), 525);
    const decoded = BinaryDecoder.decodeItem(
      toArrayBuffer(BinaryEncoder.encodeItem(itemFixture({ priceDelta24h: 1.239 })))
    );
    assert.equal(decoded.priceDelta24h, 1.24);
  });
});

describe('encoder refuses to silently corrupt', () => {
  const encodeItemExpectingThrow = (over: Record<string, unknown>, match: RegExp) => {
    assert.throws(() => BinaryEncoder.encodeItem(itemFixture(over)), match);
  };

  it('rejects a price that does not fit uint32', () => {
    encodeItemExpectingThrow(
      { minBuyout: MAX_UINT32 + 1 },
      /Cannot encode minBuyout/
    );
  });

  it('rejects a non-finite price', () => {
    encodeItemExpectingThrow({ medianPrice: Number.NaN }, /not a finite number/);
    encodeItemExpectingThrow({ meanPrice: Number.POSITIVE_INFINITY }, /not a finite number/);
  });

  it('rejects a sellerRealmId that does not fit uint16', () => {
    encodeItemExpectingThrow(
      { activeLots: [{ auctionId: 1, quantity: 1, unitPrice: 1, buyout: 1, bid: 1, timeLeft: 1, sellerRealmId: 70_000 }] },
      /Cannot encode sellerRealmId/
    );
  });

  it('rejects a lot count that does not fit uint16', () => {
    const lots: ActiveAuctionLot[] = [];
    // Building 65 536 real objects is wasteful; a sparse array of the right
    // length exercises the same length check.
    lots.length = 65_536;
    encodeItemExpectingThrow({ activeLots: lots }, /Cannot encode activeLots.length/);
  });

  it('rejects a marketCap beyond exact integer arithmetic', () => {
    encodeItemExpectingThrow(
      { marketCap: Number.MAX_SAFE_INTEGER + 10 },
      /exceeds Number.MAX_SAFE_INTEGER/
    );
  });

  it('rejects a negative marketCap rather than encoding it as zero', () => {
    encodeItemExpectingThrow({ marketCap: -1 }, /Cannot encode marketCap/);
  });
});

describe('decoder refuses truncated payloads', () => {
  it('rejects a state.bin whose body is shorter than its own item count', () => {
    const full = BinaryEncoder.encodeState(
      stateFixture([
        { itemId: 1, minPrice: 1, medianPrice: 1, meanPrice: 1, quantity: 1, numAuctions: 1, priceDelta24h: 0, quantityDelta24h: 0 },
        { itemId: 2, minPrice: 1, medianPrice: 1, meanPrice: 1, quantity: 1, numAuctions: 1, priceDelta24h: 0, quantityDelta24h: 0 },
      ])
    );
    // Cut the buffer in the middle of the second record.
    const truncated = toArrayBuffer(full.subarray(0, full.length - 10));

    assert.throws(() => BinaryDecoder.decodeState(truncated), /Truncated state\.bin body/);
  });

  it('rejects an item.bin missing part of its lot section', () => {
    const full = BinaryEncoder.encodeItem(
      itemFixture({
        activeLots: [
          { auctionId: 1, quantity: 1, unitPrice: 1, buyout: 1, bid: 1, timeLeft: 1, sellerRealmId: 1 },
          { auctionId: 2, quantity: 1, unitPrice: 1, buyout: 1, bid: 1, timeLeft: 1, sellerRealmId: 1 },
        ],
      })
    );
    const truncated = toArrayBuffer(full.subarray(0, full.length - 5));

    assert.throws(() => BinaryDecoder.decodeItem(truncated), /Truncated item\.bin/);
  });

  it('rejects a buffer too small to hold a header', () => {
    assert.throws(() => BinaryDecoder.decodeState(new ArrayBuffer(10)), /buffer too small/);
    assert.throws(() => BinaryDecoder.decodeItem(new ArrayBuffer(10)), /buffer too small/);
  });

  it('rejects a payload that is not UNDR at all', () => {
    // toArrayBuffer copies, so hold on to the copy and corrupt that one.
    const arrayBuffer = toArrayBuffer(BinaryEncoder.encodeState(stateFixture([])));
    new DataView(arrayBuffer).setUint32(STATE_FORMAT.field.magic, 0xdeadbeef, true);

    assert.throws(() => BinaryDecoder.decodeState(arrayBuffer), /Invalid state\.bin magic/);
  });

  it('rejects a format version this build cannot read', () => {
    const arrayBuffer = toArrayBuffer(BinaryEncoder.encodeItem(itemFixture()));
    new DataView(arrayBuffer).setUint16(ITEM_FORMAT.field.version, 99, true);

    assert.throws(() => BinaryDecoder.decodeItem(arrayBuffer), /Unsupported item\.bin version 99/);
  });
});
