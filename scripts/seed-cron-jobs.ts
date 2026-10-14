/**
 * Generate cron-job.org bulk-import JSON for triggering the extraction
 * pipeline every 30 minutes per connected realm.
 *
 * Usage:
 *   node --experimental-strip-types scripts/seed-cron-jobs.ts \
 *     --app-url https://<project>.vercel.app \
 *     --output docs/superpowers/plans/cron-jobs.generated.json
 *
 * Reads `realm-ids.json` from the repo root and emits one cron entry per
 * (region, realmId) pair. The PIPELINE_RUN_TOKEN must be substituted in by
 * the caller — do not commit the rendered file with a real token.
 *
 * Run once at Task 6 of the Vercel Hobby migration plan:
 *   docs/superpowers/plans/2026-10-14-vercel-hobby-migration.md
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface CliArgs {
  appUrl: string;
  output: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--app-url' && value) {
      args.appUrl = value.replace(/\/+$/, '');
      i++;
    } else if (flag === '--output' && value) {
      args.output = path.resolve(value);
      i++;
    }
  }
  if (!args.appUrl || !args.output) {
    console.error(
      'Usage: tsx scripts/seed-cron-jobs.ts --app-url <URL> --output <path>'
    );
    process.exit(2);
  }
  return args as CliArgs;
}

interface RealmIdsFile {
  eu: number[];
  us: number[];
}

const ROOT = path.resolve(__dirname, '..');
const REALM_IDS_PATH = path.join(ROOT, 'realm-ids.json');
const SCHEDULE = '*/30 * * * *';
const PLACEHOLDER_TOKEN = '__PIPELINE_RUN_TOKEN__';

function buildEntry(region: 'eu' | 'us', realmId: number, appUrl: string) {
  return {
    title: `extract-${region}-${realmId}`,
    url: `${appUrl}/api/pipeline/run`,
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PLACEHOLDER_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ connectedRealmId: realmId }),
    schedule: SCHEDULE,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(REALM_IDS_PATH, 'utf8');
  const parsed = JSON.parse(raw) as RealmIdsFile;

  const entries = [
    ...parsed.eu.map((id) => buildEntry('eu', id, args.appUrl)),
    ...parsed.us.map((id) => buildEntry('us', id, args.appUrl)),
  ];

  const json = JSON.stringify(entries, null, 2) + '\n';
  fs.writeFileSync(args.output, json, 'utf8');

  console.log(
    `Wrote ${entries.length} cron entries (${parsed.eu.length} eu, ${parsed.us.length} us) -> ${args.output}`
  );
  console.log(
    `Substitute ${PLACEHOLDER_TOKEN} with $PIPELINE_RUN_TOKEN before importing into cron-job.org.`
  );
}

main();