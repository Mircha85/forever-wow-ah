/**
 * Projects the monthly cost of the ingestion pipeline against the free
 * allowances, and says which allowance is the binding one.
 *
 * The limits below are the published ones, transcribed so the projection
 * can be checked against the source:
 *
 * Cloudflare R2, free tier (standard storage):
 *   storage          10 GB-month / month
 *   Class A (writes) 1 million requests / month
 *   Class B (reads)  10 million requests / month
 *   egress           free — "egressing directly from R2, including via the
 *                    Workers API, S3 API, and r2.dev domains does not incur
 *                    data transfer charges and is free"
 *
 * Vercel Hobby, included usage:
 *   Fast Data Transfer      first 100 GB
 *   Fast Origin Transfer    first 10 GB
 *   Function Invocations    first 1,000,000
 *   Active CPU              4 CPU-hrs
 *   Provisioned Memory      360 GB-hrs
 *   CDN Requests            first 1,000,000
 *   Global Config Reads     first 100,000
 *
 * Usage:
 *   node --experimental-strip-types scripts/project-traffic.ts
 *   node --experimental-strip-types scripts/project-traffic.ts --realms=92 --cadence=180
 *   node --experimental-strip-types scripts/project-traffic.ts --cpu-sec=1.2 --mem-gb=0.5
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// The project root. Not __dirname: Node re-parses a TypeScript script as an ES
// module when it contains import syntax, and __dirname does not exist there.
// These scripts are run from the repository root; PROJECT_ROOT overrides that.
const ROOT = process.env.PROJECT_ROOT ?? process.cwd();

// --- Free allowances ----------------------------------------------------

const R2 = {
  /** Class A — writes. */
  classAFree: 1_000_000,
  /** Class B — reads, HEADs and deletes. */
  classBFree: 10_000_000,
  /** Storage included. */
  storageFreeGB: 10,
  /** Egress is free, in both directions out of R2. */
  egressFree: true,
};

const VERCEL = {
  /** Fast Data Transfer — data leaving the platform. */
  fastDataTransferFreeGB: 100,
  /**
   * Fast Origin Transfer — data leaving a function for an external origin.
   * Whether a function's call to R2 counts here or under Fast Data Transfer
   * is the one question this projection cannot settle on its own; both are
   * reported.
   */
  fastOriginTransferFreeGB: 10,
  functionInvocationsFree: 1_000_000,
  activeCpuHoursFree: 4,
  provisionedMemoryGBHoursFree: 360,
  cdnRequestsFree: 1_000_000,
  /** Maximum duration of one function invocation. */
  maxFunctionSeconds: 120,
};

const args = process.argv.slice(2);
const arg = (name: string): string | undefined =>
  args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const argNumber = (name: string, fallback: number): number => {
  const value = Number(arg(name));
  return Number.isFinite(value) ? value : fallback;
};

function humanBytes(bytes: number): string {
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
 * Defaults come from the last extraction summary when there is one, so the
 * projection is grounded in a real run rather than in a guess. The
 * arguments override anything that has to be assumed.
 */
interface Measurement {
  realms: number;
  /** Bytes pulled from Battle.net per realm — inbound to Vercel. */
  downloadBytes: number;
  /** Bytes written to R2 per realm — outbound from Vercel. */
  uploadBytes: number;
  /** Bytes read back from R2 per realm — inbound to Vercel. */
  readBackBytes: number;
  /** Wall-clock seconds of one invocation. */
  durationSec: number;
  /** CPU-seconds of one invocation — the part that is not waiting on I/O. */
  cpuSec: number;
  /** Memory the function holds, in GB. */
  memoryGB: number;
  /** Objects written per realm per run. */
  writesPerRun: number;
  /** Objects read per realm per run. */
  readsPerRun: number;
}

function loadMeasurement(): Measurement {
  let fromSummary: Partial<Measurement> = {};
  try {
    const summary = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'extraction-direct-summary.json'), 'utf8')
    ) as {
      totals?: { ok?: number };
      traffic?: { downloadedBytes?: number; writtenBytes?: number };
      perRealm?: Record<string, { durationSec?: number; writtenBytes?: number }>;
    };
    const ok = summary.totals?.ok ?? 0;

    // Only a summary written by the current code carries the traffic
    // block. An older one describes the previous pipeline — its 195.7 s
    // per realm is not a measurement of anything that exists now, and
    // projecting from it would be projecting from the past.
    if (summary.traffic && summary.traffic.downloadedBytes && ok > 0) {
      const perRealm = Object.values(summary.perRealm ?? []);
      fromSummary = {
        realms: ok,
        downloadBytes: summary.traffic.downloadedBytes / ok,
        uploadBytes: (summary.traffic.writtenBytes ?? 0) / ok,
        durationSec:
          perRealm.length > 0
            ? perRealm.reduce((sum, r) => sum + (r.durationSec ?? 0), 0) / perRealm.length
            : undefined,
      };
    }
  } catch {
    // No summary — the caller supplies everything.
  }

  const downloadMb = argNumber('download-mb', NaN);
  const uploadMb = argNumber('upload-mb', NaN);

  return {
    realms: argNumber('realms', fromSummary.realms ?? 92),
    downloadBytes: Number.isFinite(downloadMb)
      ? downloadMb * 1024 * 1024
      : (fromSummary.downloadBytes ?? 18 * 1024 * 1024),
    uploadBytes: Number.isFinite(uploadMb)
      ? uploadMb * 1024 * 1024
      : (fromSummary.uploadBytes ?? 3.9 * 1024 * 1024),
    readBackBytes: argNumber('read-mb', 1.9) * 1024 * 1024,
    durationSec: argNumber('duration-sec', fromSummary.durationSec ?? 4),
    cpuSec: argNumber('cpu-sec', 1.2),
    memoryGB: argNumber('mem-gb', 0.5),
    writesPerRun: 3,
    readsPerRun: 2,
  };
}

interface Projection {
  runsPerMonth: number;
  invocations: number;
  /** Data leaving Vercel, in bytes: the uploads to R2. */
  egressBytes: number;
  cpuHours: number;
  memoryGBHours: number;
  r2ClassA: number;
  r2ClassB: number;
  r2StorageGB: number;
  /** What R2 would charge beyond the free allowance. */
  r2Cost: number;
  /** Allowances that are certainly exceeded. */
  breaches: string[];
  /** Open questions that would make it worse, if they resolve the wrong way. */
  caveats: string[];
}

function project(m: Measurement, realms: number, cadenceMinutes: number): Projection {
  const runsPerMonth = realms * ((30 * 24 * 60) / cadenceMinutes);

  const egressBytes = runsPerMonth * m.uploadBytes;
  const cpuHours = (runsPerMonth * m.cpuSec) / 3600;
  const memoryGBHours = runsPerMonth * m.memoryGB * (m.durationSec / 3600);
  const r2ClassA = runsPerMonth * m.writesPerRun;
  const r2ClassB = runsPerMonth * m.readsPerRun;
  const r2StorageGB = (realms * (m.uploadBytes + m.readBackBytes)) / 1024 ** 3;

  const breaches: string[] = [];
  const caveats: string[] = [];

  if (egressBytes / 1024 ** 3 > VERCEL.fastDataTransferFreeGB) {
    breaches.push(
      `Fast Data Transfer over by ${(egressBytes / 1024 ** 3 - VERCEL.fastDataTransferFreeGB).toFixed(0)} GB`
    );
  }
  if (egressBytes / 1024 ** 3 > VERCEL.fastOriginTransferFreeGB) {
    // Not a breach: it depends on whether a function's call to an
    // external host counts as origin transfer. Reported as an open
    // question rather than a fact, because it changes the answer.
    caveats.push(
      `if function→R2 egress is Origin Transfer, over by ` +
        `${(egressBytes / 1024 ** 3 - VERCEL.fastOriginTransferFreeGB).toFixed(0)} GB`
    );
  }
  if (cpuHours > VERCEL.activeCpuHoursFree) {
    breaches.push(
      `Active CPU over by ${(cpuHours - VERCEL.activeCpuHoursFree).toFixed(1)} CPU-hrs`
    );
  }
  if (memoryGBHours > VERCEL.provisionedMemoryGBHoursFree) {
    breaches.push(
      `Provisioned Memory over by ${(memoryGBHours - VERCEL.provisionedMemoryGBHoursFree).toFixed(0)} GB-hrs`
    );
  }
  if (runsPerMonth > VERCEL.functionInvocationsFree) {
    breaches.push('Function invocations over');
  }
  if (r2ClassA > R2.classAFree) breaches.push('R2 Class A over');
  if (r2ClassB > R2.classBFree) breaches.push('R2 Class B over');
  if (r2StorageGB > R2.storageFreeGB) breaches.push('R2 storage over');

  // R2 is the only metered service in the picture: Vercel Hobby is free
  // until it is not, and R2's egress is free in both directions.
  const r2Cost =
    (Math.max(0, r2ClassA - R2.classAFree) * 4.5 +
      Math.max(0, r2ClassB - R2.classBFree) * 0.36) /
      1e6 +
    Math.max(0, r2StorageGB - R2.storageFreeGB) * 0.015;

  return {
    runsPerMonth,
    invocations: runsPerMonth,
    egressBytes,
    cpuHours,
    memoryGBHours,
    r2ClassA,
    r2ClassB,
    r2StorageGB,
    r2Cost,
    breaches,
    caveats,
  };
}

const m = loadMeasurement();

console.log('Per-realm measurement');
console.log(`  realms measured   ${m.realms}`);
console.log(`  download           ${humanBytes(m.downloadBytes)} from Battle.net (inbound)`);
console.log(`  upload to R2       ${humanBytes(m.uploadBytes)} (outbound from Vercel)`);
console.log(`  read back from R2  ${humanBytes(m.readBackBytes)} (inbound)`);
console.log(`  duration           ${m.durationSec.toFixed(1)}s`);
console.log(`  CPU                ${m.cpuSec.toFixed(2)}s`);
console.log(`  memory             ${(m.memoryGB * 1024).toFixed(0)} MB`);
console.log(`  objects written    ${m.writesPerRun} per run`);
console.log(`  objects read       ${m.readsPerRun} per run`);

const realmCount = argNumber('realms', m.realms);
const cadences = arg('cadence')
  ? [argNumber('cadence', 30)]
  : [30, 60, 180, 360, 1440];

console.log(`\nProjection for ${realmCount} realms\n`);
console.log(
  'cadence'.padEnd(9) +
    'runs/mo'.padStart(10) +
    'egress'.padStart(10) +
    'CPU-hr'.padStart(9) +
    'mem GB-hr'.padStart(11) +
    'R2 A'.padStart(8) +
    'R2 B'.padStart(8) +
    'R2 cost'.padStart(9) +
    '  verdict'
);

for (const cadence of cadences) {
  const p = project(m, realmCount, cadence);
  console.log(
    `${cadence}m`.padEnd(9) +
      Math.round(p.runsPerMonth).toLocaleString().padStart(10) +
      `${(p.egressBytes / 1024 ** 3).toFixed(0)} GB`.padStart(10) +
      p.cpuHours.toFixed(1).padStart(9) +
      Math.round(p.memoryGBHours).toLocaleString().padStart(11) +
      `${(p.r2ClassA / 1e6).toFixed(2)}M`.padStart(8) +
      `${(p.r2ClassB / 1e6).toFixed(2)}M`.padStart(8) +
      money(p.r2Cost).padStart(9) +
      '  ' +
      (p.breaches.length === 0 ? 'fits' : p.breaches[0]) +
      (p.caveats.length > 0 && p.breaches.length === 0 ? ' (+ open question)' : '')
  );
}

const fitting = cadences.filter((cadence) => project(m, realmCount, cadence).breaches.length === 0);
console.log(
  `\nCadences that fit every allowance: ${
    fitting.length > 0 ? fitting.map((c) => `${c}m`).join(', ') : 'none'
  }`
);

console.log('\nRealms that fit at each cadence');
for (const cadence of cadences) {
  let fit = 0;
  for (let realms = 1; realms <= 500; realms++) {
    if (project(m, realms, cadence).breaches.length > 0) break;
    fit = realms;
  }
  console.log(`  ${String(cadence).padStart(5)}m : ${fit} realms`);
}

// The binding constraint: which allowance stops the fleet first.
console.log('\nWhat binds first');
for (const cadence of cadences) {
  const limits: Array<[string, number]> = [];
  const p = project(m, realmCount, cadence);
  limits.push(['Fast Data Transfer', VERCEL.fastDataTransferFreeGB / (p.egressBytes / 1024 ** 3)]);
  limits.push(['Active CPU', VERCEL.activeCpuHoursFree / p.cpuHours]);
  limits.push(['Provisioned Memory', VERCEL.provisionedMemoryGBHoursFree / p.memoryGBHours]);
  limits.push(['R2 Class A', R2.classAFree / p.r2ClassA]);
  limits.push(['R2 Class B', R2.classBFree / p.r2ClassB]);
  const [tightest, headroom] = limits.reduce((best, current) =>
    current[1] < best[1] ? current : best
  );
  console.log(
    `  ${String(cadence).padStart(5)}m : ${tightest} — uses ${(100 / headroom).toFixed(0)}% of its allowance`
  );
}

console.log('\nFree allowances');
console.log(`  R2 storage            ${R2.storageFreeGB} GB-month`);
console.log(`  R2 Class A (writes)   ${(R2.classAFree / 1e6).toFixed(0)}M/month`);
console.log(`  R2 Class B (reads)    ${(R2.classBFree / 1e6).toFixed(0)}M/month`);
console.log('  R2 egress             free');
console.log(`  Vercel Fast Data      ${VERCEL.fastDataTransferFreeGB} GB/month`);
console.log(`  Vercel Origin Transfer ${VERCEL.fastOriginTransferFreeGB} GB/month`);
console.log(`  Vercel invocations    ${(VERCEL.functionInvocationsFree / 1e6).toFixed(0)}M/month`);
console.log(`  Vercel Active CPU     ${VERCEL.activeCpuHoursFree} CPU-hrs`);
console.log(`  Vercel Memory         ${VERCEL.provisionedMemoryGBHoursFree} GB-hrs`);
console.log(`  Vercel function       ${VERCEL.maxFunctionSeconds}s`);

// What the dashboard itself adds.
const dashboardLoadsPerDay = argNumber('dashboard-loads', 40);
const itemClicksPerDay = argNumber('item-clicks', 200);
const stateBinBytes = 440 * 1024;
const composedItemBytes = 8 * 1024;
const dashboardEgress =
  (dashboardLoadsPerDay * stateBinBytes + itemClicksPerDay * composedItemBytes) * 30;
console.log(
  `\nDashboard egress: ${humanBytes(dashboardEgress)}/month ` +
    `(${dashboardLoadsPerDay} loads and ${itemClicksPerDay} item clicks a day)`
);
console.log(
  '  The server reads the per-realm archives from R2 to compose an item view. That traffic ' +
    'goes into Vercel, so it is not egress — but it is R2 request volume.'
);
