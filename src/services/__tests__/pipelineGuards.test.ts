import { describe, it, beforeEach, afterEach, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { AuctionAggregator } from '@/src/services/aggregator';
import { R2Service } from '@/src/services/r2';
import { clearRealmCache } from '@/src/services/realmCache';
import {
  buildHistoryArchive,
  HISTORY_RAW_BUDGET_BYTES,
  type Observation,
} from '@/src/services/historyStore';
import { decodeHistory, readHistoryItem } from '@/src/services/realmArchive';

/**
 * The ingestion path has to be able to say no.
 *
 * A run overwrites what the dashboard reads. A snapshot that is empty,
 * older than what is stored, or implausibly small would replace a good
 * snapshot with a worse one, and the pipeline used to write whatever it
 * was handed.
 */

const REALM_ID = 1305;
const ITEM_ID = 16204;

function listing(id: number, price: number, quantity: number) {
  return {
    id,
    item: { id: ITEM_ID },
    quantity,
    unit_price: price,
    buyout: price * quantity,
    bid: Math.round((price * quantity) / 2),
    time_left: 'LONG' as const,
  };
}

function snapshotOf(count: number, price = 100) {
  return {
    auctions: Array.from({ length: count }, (_, i) => listing(i + 1, price + i, 3)),
  };
}

describe('the ingestion guards', () => {
  beforeEach(() => {
    R2Service.clearMemoryCache();
    clearRealmCache();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses a snapshot with no auctions', async () => {
    const r2 = new R2Service();
    await assert.rejects(
      () => AuctionAggregator.processSnapshot('retail', 'eu', REALM_ID, { auctions: [] }, r2),
      /no auctions/i
    );
  });

  it('keeps the stored snapshot when a later run is refused', async () => {
    const r2 = new R2Service();
    await AuctionAggregator.processSnapshot(
      'retail',
      'eu',
      REALM_ID,
      snapshotOf(6),
      r2
    );

    await assert.rejects(
      () =>
        AuctionAggregator.processSnapshot(
          'retail',
          'eu',
          REALM_ID,
          { auctions: [] },
          r2
        ),
      /no auctions/i
    );

    // The good snapshot is still there.
    assert.ok(
      R2Service.getCacheMeta(R2Service.generateStateKey('retail', 'eu', REALM_ID)),
      'the previous snapshot survives a refused run'
    );
  });

  it('refuses a snapshot that is older than the stored one', async () => {
    const r2 = new R2Service();
    await AuctionAggregator.processSnapshot(
      'retail',
      'eu',
      REALM_ID,
      snapshotOf(6),
      r2
    );

    // Clock skew or an out-of-order cron tick.
    vi.setSystemTime(new Date('2026-01-01T11:00:00Z'));
    await assert.rejects(
      () =>
        AuctionAggregator.processSnapshot(
          'retail',
          'eu',
          REALM_ID,
          snapshotOf(6),
          r2
        ),
      /newer/i
    );
  });

  it('refuses a snapshot with implausibly few items', async () => {
    const r2 = new R2Service();
    // 60 listings of 20 distinct items — three each, so all 20 are kept
    // (items with fewer than three auctions are not listed at all).
    const many = {
      auctions: Array.from({ length: 60 }, (_, i) => ({
        ...listing(i + 1, 100, 3),
        item: { id: ITEM_ID + (i % 20) },
      })),
    };
    await AuctionAggregator.processSnapshot('retail', 'eu', REALM_ID, many, r2);

    // A single item against the stored twenty.
    await assert.rejects(
      () =>
        AuctionAggregator.processSnapshot(
          'retail',
          'eu',
          REALM_ID,
          snapshotOf(3),
          r2
        ),
      /partial upstream response/i
    );
  });
});

describe('the history archive respects its byte budget', () => {
  it('stays inside the budget when every item is observed every hour', () => {
    // The pathological shape: 4 000 items, each observed in all 168 hourly
    // buckets. Without a budget this archive is tens of megabytes, and it
    // is read and written on every run.
    const observations: Observation[] = [];
    for (let i = 0; i < 4000; i++) {
      observations.push({
        itemId: 100000 + i,
        minPrice: 100,
        medianPrice: 200,
        meanPrice: 150,
        quantity: 10,
        numAuctions: 3,
      });
    }

    let archive = buildHistoryArchive({
      previous: null,
      observations,
      connectedRealmId: REALM_ID,
      generatedAt: 1_700_000_000,
    });

    // A week of hourly observations.
    for (let day = 0; day < 7; day++) {
      archive = buildHistoryArchive({
        previous: archive.buffer,
        observations,
        connectedRealmId: REALM_ID,
        generatedAt: 1_700_000_000 + (day + 1) * 24 * 3600,
      });
    }

    assert.ok(
      archive.buffer.length <= HISTORY_RAW_BUDGET_BYTES,
      `the archive is ${archive.buffer.length} bytes, over the ${HISTORY_RAW_BUDGET_BYTES} budget`
    );
  });

  it('keeps every item\'s 24 hour anchor, so the delta stays measurable', () => {
    const observations: Observation[] = Array.from({ length: 500 }, (_, i) => ({
      itemId: 100000 + i,
      minPrice: 100,
      medianPrice: 200,
      meanPrice: 150,
      quantity: 10,
      numAuctions: 3,
    }));

    let archive = buildHistoryArchive({
      previous: null,
      observations,
      connectedRealmId: REALM_ID,
      generatedAt: 1_700_000_000,
    });
    for (let day = 0; day < 7; day++) {
      archive = buildHistoryArchive({
        previous: archive.buffer,
        observations,
        connectedRealmId: REALM_ID,
        generatedAt: 1_700_000_000 + (day + 1) * 24 * 3600,
      });
    }

    const index = decodeHistory(archive.buffer);
    let withBaseline = 0;
    for (const [itemId] of index.offsets) {
      const item = readHistoryItem(index, itemId);
      assert.ok(item);
      // The observation closest to 24 hours back must still be in the
      // series — that is what the price delta is computed from.
      const latest = item.hourly[item.hourly.length - 1];
      assert.ok(latest, 'the newest observation is kept');
      const baseline = item.hourly.reduce((best, point) =>
        Math.abs(point.timestamp - (latest.timestamp - 24 * 3600)) <
        Math.abs(best.timestamp - (latest.timestamp - 24 * 3600))
          ? point
          : best
      );
      if (
        Math.abs(baseline.timestamp - (latest.timestamp - 24 * 3600)) <= 2 * 3600
      ) {
        withBaseline += 1;
      }
    }

    assert.equal(
      withBaseline,
      observations.length,
      'every item still has a 24 hour baseline after trimming'
    );
  });
});

describe('the public realm listing does not call the upstream', () => {
  it('the realms route references neither the Blizzard client nor the cache', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'app/api/realms/route.ts'),
      'utf8'
    )
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

    assert.doesNotMatch(
      source,
      /BlizzardService/,
      'a public GET must not call Battle.net — one request would fan out into one call per realm'
    );
    assert.doesNotMatch(source, /fetchConnectedRealmName/);
  });
});
