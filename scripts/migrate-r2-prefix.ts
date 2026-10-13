/**
 * One-time R2 prefix migration:
 *   data/cached/{region}/{realmId}/...   →   data/cached/{product}/{region}/{realmId}/...
 *
 * Usage:
 *   tsx scripts/migrate-r2-prefix.ts retail [--from=<prefix>] [--to=<prefix>] [--dry-run]
 *
 * Reads .env.local for R2 credentials.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

const ROOT = path.resolve(__dirname, '..');
const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const argv = process.argv.slice(2);
const PRODUCT = argv[0] || 'retail';
const args = Object.fromEntries(
  argv
    .filter((a) => a.startsWith('--'))
    .map((a) => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v ?? 'true'];
    })
);

const FROM = args.from ?? 'data/cached/';
const TO = args.to ?? `data/cached/${PRODUCT}/`;
const DRY_RUN = 'dryRun' in args;

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const ACCESS_KEY = process.env.R2_ACCESS_KEY_ID;
const SECRET = process.env.R2_SECRET_ACCESS_KEY;
const BUCKET = process.env.R2_BUCKET_NAME;

if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET || !BUCKET) {
  console.error('Missing R2 env vars.');
  process.exit(1);
}

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET },
});

async function listAll(prefix: string): Promise<string[]> {
  const out: string[] = [];
  let token: string | undefined;
  do {
    const r = await s3.send(new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: prefix,
      ContinuationToken: token,
      MaxKeys: 1000,
    }));
    for (const obj of r.Contents ?? []) if (obj.Key) out.push(obj.Key);
    token = r.NextContinuationToken;
  } while (token);
  return out;
}

async function copy(key: string): Promise<Buffer> {
  const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await r.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

async function main() {
  console.log(`Migrating ${FROM} → ${TO} (product=${PRODUCT}, dryRun=${DRY_RUN})`);
  const keys = await listAll(FROM);
  console.log(`Found ${keys.length} objects to migrate.`);
  let copied = 0;
  let deleted = 0;
  let errors = 0;
  for (const oldKey of keys) {
    const newKey = oldKey.replace(FROM, TO);
    if (oldKey === newKey) continue;
    try {
      if (!DRY_RUN) {
        const body = await copy(oldKey);
        await s3.send(new PutObjectCommand({ Bucket: BUCKET, Key: newKey, Body: body }));
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey }));
      }
      copied++;
      deleted++;
      if (copied % 200 === 0) console.log(`  ${copied}/${keys.length}`);
    } catch (err) {
      errors++;
      console.error(`  failed ${oldKey}: ${(err as Error).message}`);
    }
  }
  console.log('Done.');
  console.log(`Copied: ${copied}, Deleted: ${deleted}, Errors: ${errors}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});