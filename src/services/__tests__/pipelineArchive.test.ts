import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';

import { NextRequest } from 'next/server';

import { AuctionAggregator } from '@/src/services/aggregator';
import { R2Service } from '@/src/services/r2';
import { clearRealmCache } from '@/src/services/realmCache';
import { BinaryDecoder } from '@/src/utils/binDecoder';
import { GET as getItemBin } from '@/app/api/data/cached/[product]/[region]/[realmId]/[hash]/[file]/route';

/**
 * End-to-end proof that the new write path produces data the read path can
 * serve, and that the numbers it serves were observed rather than
 * invented.
 *
 * The pipeline writes three objects per realm; the read route composes the
 * per-item view from two of them. This walks that whole loop: ingest a
 * snapshot, read the item back, ingest a second snapshot a day later, and
 * check that the 24 h delta is now a real comparison of two observations.
 */

const REALM_ID = 1305;
const ITEM_ID = 16204;

const FIRST_RUN = Date.parse('2026-01-01T12:00:00Z');
const SECOND_RUN = Date.parse('2026-01-02T12:00:00Z');

/** A snapshot with three listings of one item. */
function snapshot(unitPrice: number, quantity: number) {
  const listing = (id: number, price: number) => ({
    id,
    item: { id: ITEM_ID },
    quantity,
    unit_price: price,
    buyout: price * quantity,
    bid: Math.round((price * quantity) / 2),
    time_left: 'LONG' as const,
  });

  return {
    auctions: [
      listing(1, unitPrice),
      listing(2, unitPrice + 10),
      listing(3, unitPrice - 5),
    ],
  };
}

async function readItem(): Promise<ReturnType<typeof BinaryDecoder.decodeItem>> {
  const req = new NextRequest(
    `http://localhost/api/data/cached/retail/eu/${REALM_ID}/${ITEM_ID & 0xff}/${ITEM_ID}.bin`,
    { headers: { 'x-vercel-forwarded-for': '198.51.100.7' } }
  );
  const res = await getItemBin(req, {
    params: Promise.resolve({
      product: 'retail',
      region: 'eu',
      realmId: String(REALM_ID),
      hash: String(ITEM_ID & 0xff),
      file: `${ITEM_ID}.bin`,
    }),
  });
  assert.equal(res.status, 200, `expected the item to be served, got ${res.status}`);
  return BinaryDecoder.decodeItem(await res.arrayBuffer());
}

describe('the ingestion → read loop', () => {
  beforeEach(() => {
    R2Service.clearMemoryCache();
    clearRealmCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FIRST_RUN));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('serves the item that was ingested, with the prices it was ingested at', async () => {
    const r2 = new R2Service();
    const result = await AuctionAggregator.processSnapshot(
      'retail',
      'eu',
      REALM_ID,
      snapshot(100, 5),
      r2
    );

    assert.equal(result.uniqueItemCount, 1);
    assert.equal(result.itemsWithDelta, 0, 'nothing to compare against on the first run');

    const decoded = await readItem();

    assert.equal(decoded.itemId, ITEM_ID);
    assert.equal(decoded.connectedRealmId, REALM_ID);
    assert.equal(decoded.medianPrice, 100);
    assert.equal(decoded.minBuyout, 95);
    assert.equal(decoded.totalQuantity, 15);
    assert.equal(decoded.numAuctions, 3);
    assert.equal(decoded.activeLots.length, 3);
    assert.equal(decoded.activeLots[0].unitPrice, 95, 'lots are ordered cheapest first');
  });

  it('reports no delta until a second observation a day apart exists', async () => {
    const r2 = new R2Service();
    await AuctionAggregator.processSnapshot(
      'retail',
      'eu',
      REALM_ID,
      snapshot(100, 5),
      r2
    );

    const decoded = await readItem();

    assert.equal(decoded.priceDelta24h, null, 'an unmeasured delta is null, not zero');
    assert.equal(decoded.quantityDelta24h, null);
    assert.equal(decoded.dailyHistory.length, 1, 'one observation so far');
    assert.equal(decoded.hourlyDeltas.length, 1);
  });

  it('measures the 24 h delta once a second run is a day later', async () => {
    const r2 = new R2Service();
    await AuctionAggregator.processSnapshot(
      'retail',
      'eu',
      REALM_ID,
      snapshot(100, 5),
      r2
    );

    vi.setSystemTime(new Date(SECOND_RUN));
    const result = await AuctionAggregator.processSnapshot(
      'retail',
      'eu',
      REALM_ID,
      snapshot(200, 7),
      r2
    );

    assert.equal(result.itemsWithDelta, 1, 'the item now has a baseline to compare against');

    const decoded = await readItem();

    assert.equal(decoded.medianPrice, 200, 'the current price is the new observation');
    assert.ok(decoded.priceDelta24h !== null);
    assert.equal(decoded.priceDelta24h, 100, '100 → 200 is +100%');
    assert.ok(decoded.quantityDelta24h !== null);
    assert.equal(decoded.quantityDelta24h, 40, '15 → 21 units is +40%');
    assert.equal(decoded.dailyHistory.length, 2, 'both observations are kept');
    assert.equal(decoded.dailyHistory[0].medianPrice, 100);
    assert.equal(decoded.dailyHistory[1].medianPrice, 200);
    assert.equal(decoded.hourlyDeltas.length, 2);
  });

  it('writes three objects per realm, not one per item', async () => {
    const r2 = new R2Service();
    await AuctionAggregator.processSnapshot(
      'retail',
      'eu',
      REALM_ID,
      snapshot(100, 5),
      r2
    );

    assert.ok(
      R2Service.getCacheMeta(R2Service.generateStateKey('retail', 'eu', REALM_ID)),
      'the summary table is written'
    );
    assert.ok(
      R2Service.getCacheMeta(R2Service.generateRealmKey('retail', 'eu', REALM_ID)),
      'the item archive is written'
    );
    assert.ok(
      R2Service.getCacheMeta(R2Service.generateHistoryKey('retail', 'eu', REALM_ID)),
      'the observation history is written'
    );
  });
});
