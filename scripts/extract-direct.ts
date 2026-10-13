/**
 * Direct bulk extraction - bypasses Next.js route, hits Blizzard API + R2
 * directly with bounded concurrency. ~10x faster than the dev-server route.
 *
 * Usage:
 *   node --experimental-strip-types scripts/extract-direct.ts eu
 *   node --experimental-strip-types scripts/extract-direct.ts us
 *
 * Env (.env.local):
 *   BLIZZARD_CLIENT_ID, BLIZZARD_CLIENT_SECRET (required for live)
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *
 * Requires: realm-ids.json (auto-generated previously)
 * Outputs: extraction-direct-summary.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

import { BlizzardService } from '../src/services/blizzard';
import { AuctionAggregator } from '../src/services/aggregator';
import { R2Service } from '../src/services/r2';

const ROOT = path.resolve(__dirname, '..');

// Load .env.local (optional — in Cloud Run, env vars come from --set-env-vars + --set-secrets)
try {
  const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch (err) {
  if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  // .env.local missing — fine in Cloud Run where env is set by the platform
}

const REGION_FILTER = process.argv[2]?.toLowerCase();
if (REGION_FILTER && !['eu', 'us'].includes(REGION_FILTER)) {
  console.error(`Invalid region filter: ${REGION_FILTER}. Use 'eu' or 'us'.`);
  process.exit(1);
}

const LIMIT_ARG = process.argv[3];
const OFFSET_ARG = process.argv[4];
const limitNum = LIMIT_ARG ? Number(LIMIT_ARG) : undefined;
const offsetNum = OFFSET_ARG ? Number(OFFSET_ARG) : 0;
// Realm ids are 4+ digits (we saw 509-3713). So a small integer (<1000) is a count.
const limitSingleId = LIMIT_ARG && /^\d{4,}$/.test(LIMIT_ARG) ? Number(LIMIT_ARG) : undefined;

const REALMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'realm-ids.json'), 'utf8'));

let ALL = [
  ...REALMS.eu.map((id: number) => ({ region: 'eu' as const, id })),
  ...REALMS.us.map((id: number) => ({ region: 'us' as const, id })),
].filter((r) => !REGION_FILTER || r.region === REGION_FILTER);

if (limitSingleId !== undefined) {
  // Single realm id mode
  ALL = ALL.filter((r) => r.id === limitSingleId);
  if (ALL.length === 0) {
    console.error(`Realm ${limitSingleId} not found in region ${REGION_FILTER || 'eu+us'}`);
    process.exit(1);
  }
} else if (limitNum !== undefined && limitNum > 0 && limitNum < ALL.length) {
  // Take N realms starting from offset
  ALL = ALL.slice(offsetNum, offsetNum + limitNum);
}

const CONCURRENCY = 2;
const RETRIES = 3;
// BLIZZARD_PRODUCT env (retail|forever). Default retail until Nov 4 2026.
const PRODUCT: 'retail' | 'forever' =
  process.env.BLIZZARD_PRODUCT === 'forever' ? 'forever' : 'retail';

const SUMMARY_PATH = path.join(ROOT, 'extraction-direct-summary.json');

interface RealmResult {
  region: string;
  id: number;
  ok: boolean;
  durationSec: number;
  items?: number;
  error?: string;
}

async function processRealm(
  blizzard: BlizzardService,
  r2: R2Service,
  region: 'eu' | 'us',
  realmId: number
): Promise<RealmResult> {
  const start = Date.now();
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      const { snapshot } = await blizzard.fetchAuctionSnapshot(realmId, true);
      const result = await AuctionAggregator.processSnapshot(
        PRODUCT,
        region,
        realmId,
        snapshot,
        r2
      );
      return {
        region: blizzard.getRegion(),
        id: realmId,
        ok: true,
        durationSec: Number(((Date.now() - start) / 1000).toFixed(1)),
        items: result.itemBinCount,
      };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      // Don't retry on 4xx client errors except 429
      if (/HTTP 4\d\d/.test(msg) && !msg.includes('429')) break;
      if (attempt < RETRIES) {
        await new Promise((r) => setTimeout(r, 15_000));
      }
    }
  }
  const errMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return {
    region: '?',
    id: realmId,
    ok: false,
    durationSec: Number(((Date.now() - start) / 1000).toFixed(1)),
    error: errMsg.slice(0, 200),
  };
}

/** Bounded parallel queue with progress to file. */
async function parallelMap<T, R>(
  items: T[],
  cap: number,
  fn: (item: T, idx: number) => Promise<R>,
  onResult: (result: R, idx: number) => void
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: cap }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      const item = items[idx];
      const result = await fn(item, idx);
      results[idx] = result;
      onResult(result, idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`Direct extraction. Region: ${REGION_FILTER || 'all'}. Concurrency: ${CONCURRENCY}.`);
  console.log(`Realm count: ${ALL.length} (eu=${REALMS.eu.length}, us=${REALMS.us.length})`);

  // Single shared R2 instance (uses same S3Client internally)
  const r2 = new R2Service();

  const summary: {
    startedAt: string;
    finishedAt: string | null;
    region: string | null;
    totals: { total: number; ok: number; failed: number };
    perRealm: Record<number, RealmResult>;
  } = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    region: REGION_FILTER || null,
    totals: { total: ALL.length, ok: 0, failed: 0 },
    perRealm: {},
  };

  // One BlizzardService per region (token cache + namespace config)
  const blizzards = new Map<string, BlizzardService>();
  const getBlizzard = (region: 'eu' | 'us'): BlizzardService => {
    if (!blizzards.has(region)) {
      blizzards.set(
        region,
        new BlizzardService({
          region,
          locale: 'en_US',
          namespace: `dynamic-${region}`,
        })
      );
    }
    return blizzards.get(region)!;
  };

  const startedAtMs = Date.now();

  await parallelMap(
    ALL,
    CONCURRENCY,
    async ({ region, id }) => processRealm(getBlizzard(region), r2, region, id),
    (result, idx) => {
      summary.perRealm[result.id] = result;
      if (result.ok) summary.totals.ok++;
      else summary.totals.failed++;

      const elapsed = ((Date.now() - startedAtMs) / 1000).toFixed(0);
      const status = result.ok ? `OK  ${result.items ?? '?'} items` : `FAIL ${result.error?.slice(0, 80) ?? ''}`;
      console.log(
        `[${(idx + 1).toString().padStart(3)}/${ALL.length}] ${result.region}/${result.id} ${result.durationSec}s — ${status}  (elapsed ${elapsed}s)`
      );

      // Persist summary every 5 realms
      if ((idx + 1) % 5 === 0) {
        fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
      }
    }
  );

  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));

  console.log('');
  console.log('=== DONE ===');
  console.log(`OK:      ${summary.totals.ok}`);
  console.log(`Failed:  ${summary.totals.failed}`);
  console.log(`Time:    ${((Date.now() - startedAtMs) / 1000).toFixed(0)}s`);
  console.log(`Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});