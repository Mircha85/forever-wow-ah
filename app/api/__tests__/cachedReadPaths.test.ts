import { describe, it, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NextRequest } from 'next/server';

import { R2Service } from '@/src/services/r2';
import { BinaryEncoder } from '@/src/services/encoder';
import { gzipForStorage, decodeHistory, readHistoryItem } from '@/src/services/realmArchive';
import { clearRealmCache } from '@/src/services/realmCache';
import { buildHistoryArchive } from '@/src/services/historyStore';
import { GET as getItemBin } from '../data/cached/[product]/[region]/[realmId]/[hash]/[file]/route';
import { GET as getStateBin } from '../data/cached/[product]/[region]/[realmId]/state.bin/route';

/**
 * The public read path must never invent data and never do work on a
 * reader's behalf.
 *
 * These tests lock in two properties that were both violated until the
 * 2026-10-31 remediation:
 *
 *   1. A cache miss is a 404 with an explanatory body. It is not a
 *      fabricated item blob (the old `generateSingleItemBin` returned fixed
 *      placeholder prices and even persisted them to R2) and it is not a
 *      live rebuild of the realm (the old state.bin route fetched a
 *      10-25 MB snapshot from Battle.net and re-ran the whole aggregation
 *      on any miss).
 *
 *   2. A miss writes nothing. The in-memory R2 cache is inspected after
 *      the call to prove the read path did not create an object.
 */

const ITEM_ROUTE = path.join(
  process.cwd(),
  'app/api/data/cached/[product]/[region]/[realmId]/[hash]/[file]/route.ts'
);
const STATE_ROUTE = path.join(
  process.cwd(),
  'app/api/data/cached/[product]/[region]/[realmId]/state.bin/route.ts'
);

const REALM_ID = 1305;
const ITEM_ID = 16204;

/** Distinct client IPs keep the rate limiter's per-client buckets isolated. */
let ipCounter = 0;
function nextIp(): string {
  ipCounter += 1;
  return `203.0.113.${ipCounter}`;
}

function request(pathname: string): NextRequest {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: { 'x-vercel-forwarded-for': nextIp() },
  });
}

async function callItemRoute(itemId: number, realmId = REALM_ID) {
  const req = request(
    `/api/data/cached/retail/eu/${realmId}/${itemId & 0xff}/${itemId}.bin`
  );
  return getItemBin(req, {
    params: Promise.resolve({
      product: 'retail',
      region: 'eu',
      realmId: String(realmId),
      hash: String(itemId & 0xff),
      file: `${itemId}.bin`,
    }),
  });
}

async function callStateRoute(realmId = REALM_ID) {
  const req = request(`/api/data/cached/retail/eu/${realmId}/state.bin`);
  return getStateBin(req, {
    params: Promise.resolve({
      product: 'retail',
      region: 'eu',
      realmId: String(realmId),
    }),
  });
}

/** Writes a realm archive holding one item, as the pipeline would. */
async function seedRealmArchive(
  itemId = ITEM_ID,
  overrides: Partial<{ medianPrice: number; quantity: number; numAuctions: number }> = {}
): Promise<void> {
  const r2 = new R2Service();
  const buffer = BinaryEncoder.encodeRealmArchive({
    connectedRealmId: REALM_ID,
    generatedAt: 1_700_000_000,
    totalAuctionsCount: 3,
    items: [
      {
        itemId,
        minPrice: 100,
        medianPrice: overrides.medianPrice ?? 200,
        meanPrice: 150,
        quantity: overrides.quantity ?? 10,
        numAuctions: overrides.numAuctions ?? 3,
        marketCap: 2000,
        lots: [
          {
            auctionId: 5001,
            quantity: 4,
            unitPrice: 200,
            buyout: 800,
            bid: 150,
            timeLeft: 2,
            sellerRealmId: REALM_ID,
          },
        ],
      },
    ],
  });
  await r2.uploadBin(R2Service.generateRealmKey('retail', 'eu', REALM_ID), buffer);
}

describe('per-item binary route — cache miss', () => {
  beforeEach(() => {
    R2Service.clearMemoryCache();
    clearRealmCache();
  });

  it('answers 404 when the realm has not been ingested', async () => {
    const res = await callItemRoute(ITEM_ID);

    assert.equal(res.status, 404);
    assert.equal(res.headers.get('X-WoW-AH-Source'), 'not-ingested');

    const body = (await res.json()) as { error?: string; hint?: string };
    assert.match(String(body.error), /No ingested data for realm 1305/);
    assert.match(String(body.hint), /pipeline/i);
  });

  it('answers 404 when the realm was ingested but the item was not listed', async () => {
    await seedRealmArchive(ITEM_ID);

    const res = await callItemRoute(999999);

    assert.equal(res.status, 404);
    assert.equal(res.headers.get('X-WoW-AH-Source'), 'not-ingested');

    const body = (await res.json()) as { error?: string; hint?: string };
    assert.match(String(body.error), /was not listed in realm 1305/);
  });

  it('does not write anything on a miss', async () => {
    await callItemRoute(ITEM_ID);

    const after = R2Service.getCacheMeta(
      R2Service.generateRealmKey('retail', 'eu', REALM_ID)
    );
    assert.equal(after, null, 'a read must not create the object it did not find');
  });

  it('serves the item view composed from the realm archive', async () => {
    await seedRealmArchive();

    const res = await callItemRoute(ITEM_ID);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'application/octet-stream');
    assert.equal(res.headers.get('X-WoW-AH-Product'), 'retail');
    assert.equal(res.headers.get('X-WoW-AH-Region'), 'eu');

    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.ok(bytes.length > 60, 'the item blob has a header at least');
    // 'UNDR' magic, little-endian on disk.
    assert.deepEqual([...bytes.slice(0, 4)], [0x52, 0x44, 0x4e, 0x55]);
  });
});

describe('state.bin route — cache miss', () => {
  beforeEach(() => {
    R2Service.clearMemoryCache();
    clearRealmCache();
  });

  it('answers 404 instead of rebuilding the realm snapshot', async () => {
    const res = await callStateRoute();

    assert.equal(res.status, 404);
    assert.equal(res.headers.get('X-WoW-AH-Source'), 'not-ingested');

    const body = (await res.json()) as { error?: string; hint?: string };
    assert.match(String(body.error), /No ingested state for realm 1305/);
    assert.match(String(body.hint), /pipeline/i);
  });

  it('does not write anything on a miss', async () => {
    await callStateRoute();

    const after = R2Service.getCacheMeta(
      R2Service.generateStateKey('retail', 'eu', REALM_ID)
    );
    assert.equal(after, null, 'a read must not create the object it did not find');
  });

  it('serves the stored bytes verbatim when the realm has been ingested', async () => {
    const r2 = new R2Service();
    const payload = Buffer.from([0x52, 0x44, 0x4e, 0x55]);
    await r2.uploadBin(R2Service.generateStateKey('retail', 'eu', REALM_ID), payload);

    const res = await callStateRoute();

    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'application/octet-stream');

    const bytes = new Uint8Array(await res.arrayBuffer());
    assert.deepEqual([...bytes], [...payload]);
  });
});

describe('public read routes never talk to the upstream', () => {
  /**
   * Strip comments before matching, so a route is allowed to *explain*
   * that it no longer calls the upstream without tripping the guard.
   */
  function code(source: string): string {
    return source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // `[^:]` keeps `https://` inside string literals intact.
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  }

  /**
   * A source-level guard, not a behavioural one. Proving "this route made
   * no network call" would mean standing up a fake Battle.net endpoint;
   * asserting that the read path does not even reference the upstream
   * client is cheaper and catches the regression at its source — someone
   * re-adding `fetchAuctionSnapshot` to a GET handler.
   */
  it('the item route references neither the Blizzard client nor the aggregator', () => {
    const source = code(readFileSync(ITEM_ROUTE, 'utf8'));
    assert.doesNotMatch(source, /BlizzardService/, 'the item route must not reach the upstream');
    assert.doesNotMatch(source, /processSnapshot/, 'the item route must not rebuild a realm');
    assert.doesNotMatch(source, /generateSingleItemBin/, 'the item route must not fabricate a blob');
  });

  it('the state route references neither the Blizzard client nor the aggregator', () => {
    const source = code(readFileSync(STATE_ROUTE, 'utf8'));
    assert.doesNotMatch(source, /BlizzardService/, 'the state route must not reach the upstream');
    assert.doesNotMatch(source, /processSnapshot/, 'the state route must not rebuild a realm');
  });
});

describe('the rolling history records what was observed', () => {
  it('has no baseline on the first run, so no delta is measured', () => {
    const archive = buildHistoryArchive({
      previous: null,
      observations: [
        {
          itemId: ITEM_ID,
          minPrice: 100,
          medianPrice: 200,
          meanPrice: 150,
          quantity: 10,
          numAuctions: 3,
        },
      ],
      connectedRealmId: REALM_ID,
      generatedAt: 1_700_000_000,
    });

    assert.equal(archive.baselines.size, 0);
    assert.equal(archive.baselines.get(ITEM_ID), undefined);
  });

  it('produces a real baseline once a second run is a day later', () => {
    const first = buildHistoryArchive({
      previous: null,
      observations: [
        {
          itemId: ITEM_ID,
          minPrice: 100,
          medianPrice: 200,
          meanPrice: 150,
          quantity: 10,
          numAuctions: 3,
        },
      ],
      connectedRealmId: REALM_ID,
      generatedAt: 1_700_000_000,
    });

    const second = buildHistoryArchive({
      previous: gzipForStorage(first.buffer),
      observations: [
        {
          itemId: ITEM_ID,
          minPrice: 150,
          medianPrice: 250,
          meanPrice: 200,
          quantity: 20,
          numAuctions: 4,
        },
      ],
      connectedRealmId: REALM_ID,
      generatedAt: 1_700_000_000 + 24 * 3600,
    });

    const baseline = second.baselines.get(ITEM_ID);
    assert.ok(baseline, 'a 24 hour old observation is the baseline');
    assert.equal(baseline.medianPrice, 200);
    assert.equal(baseline.quantity, 10);
  });

  it('keeps both observations in the series rather than replacing them', () => {
    const first = buildHistoryArchive({
      previous: null,
      observations: [
        {
          itemId: ITEM_ID,
          minPrice: 100,
          medianPrice: 200,
          meanPrice: 150,
          quantity: 10,
          numAuctions: 3,
        },
      ],
      connectedRealmId: REALM_ID,
      generatedAt: 1_700_000_000,
    });

    const second = buildHistoryArchive({
      previous: gzipForStorage(first.buffer),
      observations: [
        {
          itemId: ITEM_ID,
          minPrice: 150,
          medianPrice: 250,
          meanPrice: 200,
          quantity: 20,
          numAuctions: 4,
        },
      ],
      connectedRealmId: REALM_ID,
      generatedAt: 1_700_000_000 + 24 * 3600,
    });

    const index = decodeHistory(gzipForStorage(second.buffer));
    const item = readHistoryItem(index, ITEM_ID);

    assert.ok(item);
    assert.equal(item.hourly.length, 2, 'one observation per run, both kept');
    assert.equal(item.daily.length, 2);
    assert.equal(item.hourly[0].medianPrice, 200);
    assert.equal(item.hourly[1].medianPrice, 250);
  });
});
