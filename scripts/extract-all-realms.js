/**
 * Bulk-extract auction snapshots for all 175 connected realms (EU + US) Retail
 * into R2 via the existing /api/pipeline/run endpoint.
 *
 * Usage:
 *   npm run dev                                # one terminal
 *   node scripts/extract-all-realms.js         # this terminal
 *
 * Requires:
 *   .env.local with PIPELINE_RUN_TOKEN set
 *   realm-ids.json at project root (auto-generated above)
 *
 * Behavior:
 *   - Sequential (5/5s rate limit per IP). ~30 min for 175 realms.
 *   - Each call: POST /api/pipeline/run { connectedRealmId } with bearer.
 *   - On 200: mark realm done.
 *   - On 5xx / network error: retry up to 3 times with 30s backoff.
 *   - After all realms: verify state.bin exists in R2 for each.
 *   - Missing state.bin → re-queue for next pass.
 *   - Outputs extraction-summary.json with per-realm results.
 *
 * Caveat: rate limit is per IP. Running from same machine as the dev server
 * means this is the bottleneck. If we ever need faster, hit Blizzard + write
 * to R2 directly from this script (skip the Next.js route).
 */

const fs = require('node:fs');
const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');

const ROOT = path.resolve(__dirname, '..');
const REALMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'realm-ids.json'), 'utf8'));

// Region filter via argv: 'eu', 'us', or omit for both.
const REGION_FILTER = process.argv[2]?.toLowerCase();
if (REGION_FILTER && !['eu', 'us'].includes(REGION_FILTER)) {
  console.error(`Invalid region filter: ${REGION_FILTER}. Use 'eu' or 'us'.`);
  process.exit(1);
}

// Load .env.local
const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const TOKEN = process.env.PIPELINE_RUN_TOKEN;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
if (!TOKEN) {
  console.error('PIPELINE_RUN_TOKEN missing in .env.local');
  process.exit(1);
}

const ALL = [
  ...REALMS.eu.map((id) => ({ region: 'eu', id })),
  ...REALMS.us.map((id) => ({ region: 'us', id })),
].filter((r) => !REGION_FILTER || r.region === REGION_FILTER);

if (ALL.length === 0) {
  console.error(`No realms match filter '${REGION_FILTER}'`);
  process.exit(1);
}

console.log(`Region filter: ${REGION_FILTER || 'all'}`);
console.log(`Realm count: ${ALL.length} (eu=${REALMS.eu.length}, us=${REALMS.us.length})`);

const SUMMARY_PATH = path.join(ROOT, 'extraction-summary.json');
const summary = {
  startedAt: new Date().toISOString(),
  finishedAt: null,
  totals: { total: ALL.length, ok: 0, failed: 0, retried: 0 },
  perRealm: {},
};

async function callPipeline(realmId, attempt = 1) {
  const res = await fetch(`${APP_URL}/api/pipeline/run`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ connectedRealmId: realmId }),
    signal: AbortSignal.timeout(120_000),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 200) }; }
  return { status: res.status, body };
}

async function runOne({ region, id }) {
  const start = Date.now();
  let result;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      result = await callPipeline(id, attempt);
      if (result.status === 200) break;
      if (result.status === 401 || result.status === 400) break; // no point retrying
      if (attempt < 3) {
        summary.totals.retried++;
        await sleep(30_000);
      }
  } catch (err) {
      if (attempt >= 3) {
        result = { status: 0, body: { error: String(err) } };
      } else {
        summary.totals.retried++;
        await sleep(30_000);
      }
    }
  }
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const ok = result.status === 200 && result.body?.success === true;
  summary.perRealm[id] = {
    region,
    ok,
    status: result.status,
    durationSec: Number(elapsed),
    itemCount: result.body?.result?.itemBinCount ?? null,
    stateBytes: result.body?.result?.stateBinSize ?? null,
    error: ok ? null : (result.body?.error || result.body?.message || `HTTP ${result.status}`),
  };
  if (ok) summary.totals.ok++;
  else summary.totals.failed++;
  return ok;
}

async function main() {
  console.log(`Starting extraction: ${ALL.length} realms (${REALMS.eu.length} EU + ${REALMS.us.length} US)`);
  console.log(`Target: ${APP_URL}`);
  console.log('');

  for (let i = 0; i < ALL.length; i++) {
    const r = ALL[i];
    const idx = i + 1;
    process.stdout.write(`[${idx.toString().padStart(3)}/${ALL.length}] region=${r.region} realm=${r.id} ... `);
    const ok = await runOne(r);
    console.log(ok ? `OK (${summary.perRealm[r.id].durationSec}s, ${summary.perRealm[r.id].itemCount} items)` : `FAIL ${summary.perRealm[r.id].status} ${summary.perRealm[r.id].error?.slice(0, 100)}`);

    // Persist summary every 10 realms
    if (idx % 10 === 0) {
      fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
      console.log(`  >> Progress saved: ok=${summary.totals.ok} failed=${summary.totals.failed} retried=${summary.totals.retried}`);
    }
  }

  summary.finishedAt = new Date().toISOString();
  fs.writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log('');
  console.log('=== DONE ===');
  console.log(`OK:      ${summary.totals.ok}`);
  console.log(`Failed:  ${summary.totals.failed}`);
  console.log(`Retried: ${summary.totals.retried}`);
  console.log(`Summary: ${SUMMARY_PATH}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});