/**
 * Deletes objects from the R2 bucket.
 *
 * A dry run is the default: the script lists what would go and stops.
 * Deleting needs an explicit `--confirm`, and even then it prints the
 * plan and the cost first.
 *
 * Usage:
 *   node --experimental-strip-types scripts/purge-r2.ts                       # dry run, everything
 *   node --experimental-strip-types scripts/purge-r2.ts --prefix=data/cached/retail/eu
 *   node --experimental-strip-types scripts/purge-r2.ts --confirm             # actually delete
 *
 * Options:
 *   --confirm              perform the deletion (without it, nothing is deleted)
 *   --prefix=<prefix>      only delete keys starting with this prefix
 *   --keep=<substring>     never delete keys containing this substring
 *
 * Env (.env.local):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */

import * as path from 'node:path';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { loadEnvFile, requireR2Env } from './lib/env';

const ROOT = path.resolve(__dirname, '..');

const CLASS_B_PRICE_PER_MILLION = 0.36;
const BATCH_SIZE = 1000;

const args = process.argv.slice(2);
const CONFIRM = args.includes('--confirm');
const PREFIX = args.find((a) => a.startsWith('--prefix='))?.slice('--prefix='.length) ?? '';
const KEEP = args.find((a) => a.startsWith('--keep='))?.slice('--keep='.length) ?? '';

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

void (async () => {
  loadEnvFile(ROOT);
  const { accountId, accessKeyId, secretAccessKey, bucket } = requireR2Env();

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`Bucket : ${bucket}`);
  console.log(`Prefix : ${PREFIX || '(everything)'}`);
  console.log(`Keep   : ${KEEP || '(nothing)'}`);
  console.log(`Mode   : ${CONFIRM ? 'DELETE' : 'DRY RUN — nothing will be deleted'}\n`);

  // --- Plan -------------------------------------------------------------
  const keys: string[] = [];
  let bytes = 0;
  let token: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        MaxKeys: 1000,
        ContinuationToken: token,
      })
    );

    for (const object of response.Contents ?? []) {
      const key = object.Key ?? '';
      if (KEEP && key.includes(KEEP)) continue;
      keys.push(key);
      bytes += object.Size ?? 0;
    }

    token = response.NextContinuationToken;
  } while (token);

  const deleteRequests = Math.ceil(keys.length / BATCH_SIZE);
  const dollarCost = (keys.length * CLASS_B_PRICE_PER_MILLION) / 1_000_000;

  console.log(`Objects to delete : ${keys.length.toLocaleString()}`);
  console.log(`Storage freed     : ${human(bytes)}`);
  console.log(`DELETE requests   : ${deleteRequests.toLocaleString()} (batches of ${BATCH_SIZE})`);
  console.log(`Cost              : $${dollarCost.toFixed(2)} (R2 Class B)`);

  if (keys.length > 0) {
    console.log('\nFirst 5 keys:');
    for (const key of keys.slice(0, 5)) console.log(`  ${key}`);
  }

  if (!CONFIRM) {
    console.log('\nDry run. Re-run with --confirm to delete.');
    return;
  }

  if (keys.length === 0) {
    console.log('\nNothing to delete.');
    return;
  }

  console.log('\nDeleting…');
  let deleted = 0;
  const startedAt = Date.now();

  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: batch.map((key) => ({ Key: key })),
          Quiet: true,
        },
      })
    );

    const errors = response.Errors ?? [];
    deleted += batch.length - errors.length;
    if (errors.length > 0) {
      console.error(
        `  ${errors.length} objects failed to delete in this batch ` +
          `(first: ${errors[0]?.Key} — ${errors[0]?.Code})`
      );
    }

    if (deleted % 25_000 === 0 || deleted + errors.length >= keys.length) {
      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = elapsed > 0 ? Math.round(deleted / elapsed) : 0;
      process.stdout.write(
        `  ${deleted.toLocaleString()}/${keys.length.toLocaleString()} deleted (${rate}/s)\r`
      );
    }
  }

  const elapsed = (Date.now() - startedAt) / 1000;
  console.log(
    `\nDone. ${deleted.toLocaleString()} objects deleted in ${elapsed.toFixed(1)}s, ` +
      `${human(bytes)} freed.`
  );
})();
