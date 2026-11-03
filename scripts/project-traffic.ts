/**
 * Projects the monthly traffic and cost of the ingestion pipeline.
 *
 * Takes the measured per-realm numbers — from an extraction run — and
 * projects what a fleet of realms at a given cadence would move, then
 * checks the result against the free allowances:
 *
 *   Cloudflare R2   1 M Class A (writes) + 10 M Class B (reads) per month,
 *                   10 GB of storage. Egress is free.
 *   Vercel Hobby    100 GB of egress per month, 120 s per function.
 *
 * The Vercel figure counts traffic leaving the platform: the pipeline's
 * uploads to R2 and the dashboard's responses to browsers. Traffic coming
 * *in* — the snapshot from Battle.net, the previous archive read back
 * from R2 — does not count against it, but it does count against R2's
 * request allowance.
 *
 * Usage:
 *   node --experimental-strip-types scripts/project-traffic.ts
 *   node --experimental-strip-types scripts/project-traffic.ts --cadence=60 --realms=92
 *   node --experimental-strip-types scripts/project-traffic.ts --download-mb=18 --upload-mb=3.9
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// The project root. Not __dirname: Node re-parses a TypeScript script as an ES
// module when it contains import syntax, and __dirname does not exist there.
// These scripts are run from the repository root; PROJECT_ROOT overrides that.
const ROOT = process.env.PROJECT_ROOT ?? process.cwd();

// --- Free allowances ----------------------------------------------------

/** R2 Class A — writes. */
const R2_CLASS_A_FREE = 1_000_000;
/** R2 Class B — reads, HEADs and deletes. */
const R2_CLASS_B_FREE = 10_000_000;
/** R2 storage included. */
const R2_STORAGE_FREE_GB = 10;

const R2_CLASS_A_PRICE = 4.5; // $ per million
const R2_CLASS_B_PRICE = 0.36; // $ per million
const R2_STORAGE_PRICE = 0.015; // $ per GB-month

/** Vercel Hobby's included egress. */
const VERCEL_EGRESS_FREE_GB = 100;
/** Vercel Hobby's maximum function duration. */
const VERCEL_FUNCTION_LIMIT_SEC = 120;

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

function humanGb(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function money(dollars: number): string {
  if (dollars < 0.005) return '$0.00';
  return `$${dollars.toFixed(2)}`;
}

/**
 * The measured per-realm numbers.
 *
 * Defaults come from the last extraction summary when there is one, so
 * the projection is grounded in a real run rather than in a guess.
 */
interface Measurement {
  realms: number;
  /** Bytes pulled from Battle.net per realm. */
  downloadBytes: number;
  /** Bytes written to R2 per realm. */
  uploadBytes: number;
  /** Bytes read back from R2 per realm (the previous state + history). */
  readBackBytes: number;
  /** Wall-clock seconds per realm. */
  durationSec: number;
  /** Average objects written per realm per run. */
  writesPerRun: number;
  /** Average objects read per realm per run. */
  readsPerRun: number;
}

function loadMeasurement(): Measurement {
  const summaryPath = path.join(ROOT, 'extraction-direct-summary.json');
  let fromSummary: Partial<Measurement> = {};
  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as {
      totals?: { ok?: number };
      traffic?: { downloadedBytes?: number; writtenBytes?: number };
      perRealm?: Record<string, { durationSec?: number; writtenBytes?: number }>;
    };
    const ok = summary.totals?.ok ?? 0;
    const perRealm = Object.values(summary.perRealm ?? {});
    const meanDuration =
      perRealm.length > 0
        ? perRealm.reduce((sum, r) => sum + (r.durationSec ?? 0), 0) / perRealm.length
        : 0;
    const meanWritten =
      perRealm.length > 0
        ? perRealm.reduce((sum, r) => sum + (r.writtenBytes ?? 0), 0) / perRealm.length
        : 0;

    fromSummary = {
      realms: ok,
      downloadBytes: ok > 0 ? (summary.traffic?.downloadedBytes ?? 0) / ok : 0,
      uploadBytes: ok > 0 ? (summary.traffic?.writtenBytes ?? 0) / ok : meanWritten,
      durationSec: meanDuration,
    };
  } catch {
    // No summary — the caller supplies everything on the command line.
  }

  const downloadMb = Number(arg('download-mb') ?? NaN);
  const uploadMb = Number(arg('upload-mb') ?? NaN);
  const durationSec = Number(arg('duration-sec') ?? NaN);

  return {
    realms: Number(arg('realms') ?? fromSummary.realms ?? 92),
    downloadBytes: Number.isFinite(downloadMb)
      ? downloadMb * 1024 * 1024
      : (fromSummary.downloadBytes ?? 18 * 1024 * 1024),
    uploadBytes: Number.isFinite(uploadMb)
      ? uploadMb * 1024 * 1024
      : (fromSummary.uploadBytes ?? 3.9 * 1024 * 1024),
    readBackBytes: 1.9 * 1024 * 1024,
    durationSec: Number.isFinite(durationSec)
      ? durationSec
      : (fromSummary.durationSec ?? 20),
    writesPerRun: 3,
    readsPerRun: 2,
  };
}

function project(m: Measurement, realms: number, cadenceMinutes: number) {
  const runsPerMonth = realms * ((30 * 24 * 60) / cadenceMinutes);

  const classAWrites = runsPerMonth * m.writesPerRun;
  const classBReads = runsPerMonth * m.readsPerRun;

  // Vercel egress: what leaves the platform. The uploads are the pipeline
  // writing to R2; the dashboard's downloads are counted separately.
  const pipelineEgress = runsPerMonth * m.uploadBytes;

  const storageBytes = realms * (m.uploadBytes + m.readBackBytes);

  return {
    runsPerMonth,
    classAWrites,
    classBReads,
    pipelineEgress,
    storageBytes,
    r2WriteCost: Math.max(0, classAWrites - R2_CLASS_A_FREE) * (R2_CLASS_A_PRICE / 1e6),
    r2ReadCost: Math.max(0, classBReads - R2_CLASS_B_FREE) * (R2_CLASS_B_PRICE / 1e6),
    r2StorageCost: Math.max(0, storageBytes / 1024 ** 3 - R2_STORAGE_FREE_GB) * R2_STORAGE_PRICE,
    vercelEgressBytes: pipelineEgress,
  };
}

const m = loadMeasurement();

console.log('Per-realm measurement');
console.log(`  realms measured   ${m.realms}`);
console.log(`  download           ${humanGb(m.downloadBytes)} from Battle.net`);
console.log(`  upload to R2       ${humanGb(m.uploadBytes)}`);
console.log(`  read back from R2  ${humanGb(m.readBackBytes)}`);
console.log(`  duration           ${m.durationSec.toFixed(1)}s`);
console.log(`  objects written    ${m.writesPerRun} per run`);
console.log(`  objects read       ${m.readsPerRun} per run`);

const realmCount = Number(arg('realms') ?? m.realms);
const cadences = arg('cadence')
  ? [Number(arg('cadence'))]
  : [30, 60, 180, 360, 1440];

console.log(`\nProjection for ${realmCount} realms\n`);
console.log(
  'cadence'.padEnd(9) +
    'runs/mo'.padStart(11) +
    'R2 A'.padStart(11) +
    'R2 B'.padStart(11) +
    'egress'.padStart(10) +
    'R2 cost'.padStart(9) +
    '  verdict'
);

for (const cadence of cadences) {
  const p = project(m, realmCount, cadence);
  const r2Cost = p.r2WriteCost + p.r2ReadCost + p.r2StorageCost;
  const egressGb = p.vercelEgressBytes / 1024 ** 3;

  const problems: string[] = [];
  if (p.classAWrites > R2_CLASS_A_FREE) {
    problems.push(`R2 Class A over by ${(p.classAWrites / 1e6).toFixed(1)}M`);
  }
  if (p.classBReads > R2_CLASS_B_FREE) {
    problems.push(`R2 Class B over by ${(p.classBReads / 1e6).toFixed(1)}M`);
  }
  if (p.storageBytes / 1024 ** 3 > R2_STORAGE_FREE_GB) {
    problems.push('R2 storage over');
  }
  if (egressGb > VERCEL_EGRESS_FREE_GB) {
    problems.push(`Vercel egress over by ${(egressGb - VERCEL_EGRESS_FREE_GB).toFixed(0)} GB`);
  }
  if (m.durationSec > VERCEL_FUNCTION_LIMIT_SEC) {
    problems.push(`function over ${VERCEL_FUNCTION_LIMIT_SEC}s`);
  }

  console.log(
    `${cadence}m`.padEnd(9) +
      Math.round(p.runsPerMonth).toLocaleString().padStart(11) +
      `${(p.classAWrites / 1e6).toFixed(2)}M`.padStart(11) +
      `${(p.classBReads / 1e6).toFixed(2)}M`.padStart(11) +
      `${egressGb.toFixed(0)} GB`.padStart(10) +
      money(r2Cost).padStart(9) +
      '  ' +
      (problems.length === 0 ? 'fits' : problems.join('; '))
  );
}

// What cadence would fit, for the same realm count.
const fitting = cadences.filter((cadence) => {
  const p = project(m, realmCount, cadence);
  return (
    p.classAWrites <= R2_CLASS_A_FREE &&
    p.classBReads <= R2_CLASS_B_FREE &&
    p.vercelEgressBytes / 1024 ** 3 <= VERCEL_EGRESS_FREE_GB &&
    p.storageBytes / 1024 ** 3 <= R2_STORAGE_FREE_GB
  );
});
console.log(
  `\nCadences that fit the free allowances: ${
    fitting.length > 0 ? fitting.map((c) => `${c}m`).join(', ') : 'none'
  }`
);

// How many realms fit at a given cadence.
console.log('\nRealms that fit at each cadence');
for (const cadence of cadences) {
  let fit = 0;
  for (let realms = 1; realms <= 500; realms++) {
    const p = project(m, realms, cadence);
    const ok =
      p.classAWrites <= R2_CLASS_A_FREE &&
      p.classBReads <= R2_CLASS_B_FREE &&
      p.vercelEgressBytes / 1024 ** 3 <= VERCEL_EGRESS_FREE_GB;
    if (!ok) break;
    fit = realms;
  }
  console.log(`  ${String(cadence).padStart(5)}m : ${fit} realms`);
}

console.log('\nFree allowances');
console.log(`  R2 Class A (writes)   ${(R2_CLASS_A_FREE / 1e6).toFixed(0)}M/month`);
console.log(`  R2 Class B (reads)    ${(R2_CLASS_B_FREE / 1e6).toFixed(0)}M/month`);
console.log(`  R2 storage            ${R2_STORAGE_FREE_GB} GB`);
console.log(`  Vercel egress         ${VERCEL_EGRESS_FREE_GB} GB/month`);
console.log(`  Vercel function       ${VERCEL_FUNCTION_LIMIT_SEC}s`);

// What the dashboard itself adds. A page load pulls one realm's state.bin;
// an item click pulls the composed item blob, which is a few kilobytes —
// the megabytes stay between R2 and the function.
const dashboardLoadsPerDay = Number(arg('dashboard-loads') ?? 40);
const itemClicksPerDay = Number(arg('item-clicks') ?? 200);
const stateBinBytes = 440 * 1024;
const composedItemBytes = 8 * 1024;
const dashboardEgress =
  dashboardLoadsPerDay * stateBinBytes + itemClicksPerDay * composedItemBytes;
console.log(
  `\nDashboard egress: ${humanGb(dashboardEgress * 30)}/month ` +
    `(${dashboardLoadsPerDay} loads and ${itemClicksPerDay} item clicks a day)`
);
console.log(
  '  The server reads the per-realm archives from R2 to compose an item view. ' +
    'That traffic goes into Vercel, so it is not egress — but it is R2 request volume.'
);
