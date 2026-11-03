/**
 * Read-only inventory of the R2 bucket.
 *
 * Reports what is actually in there — how many objects, how many bytes,
 * broken down by kind — and what it would cost to list it again or to
 * delete it. Nothing is written or deleted.
 *
 * Usage:
 *   node --experimental-strip-types scripts/inspect-r2.ts
 *
 * Env (.env.local):
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 */


import {
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

import { loadEnvFile, requireR2Env } from './lib/env';

// The project root. Not __dirname: Node re-parses a TypeScript script as an ES
// module when it contains import syntax, and __dirname does not exist there.
// These scripts are run from the repository root; PROJECT_ROOT overrides that.
const ROOT = process.env.PROJECT_ROOT ?? process.cwd();

/** R2 Class B — reads, HEADs and deletes. */
const CLASS_B_PRICE_PER_MILLION = 0.36;
/** R2 Class A — writes. */
const CLASS_A_PRICE_PER_MILLION = 4.5;

type Kind =
  | 'state.bin'
  | 'realm.bin'
  | 'history.bin'
  | 'names.json'
  | 'item.bin'
  | 'other';

interface Bucket {
  objects: number;
  bytes: number;
}

function classify(key: string): Kind {
  if (key.endsWith('/state.bin')) return 'state.bin';
  if (key.endsWith('/realm.bin')) return 'realm.bin';
  if (key.endsWith('/history.bin')) return 'history.bin';
  if (key.endsWith('/names.json')) return 'names.json';
  if (/\/\d+\.bin$/.test(key)) return 'item.bin';
  return 'other';
}

/** The realm a key belongs to, so the report can group by realm. */
function realmOf(key: string): string | null {
  const match = key.match(/^data\/cached\/[^/]+\/[^/]+\/(\d+)\//);
  return match ? match[1] : null;
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function cost(operations: number, pricePerMillion: number): string {
  const dollars = (operations * pricePerMillion) / 1_000_000;
  return dollars < 0.01 ? '< $0.01' : `$${dollars.toFixed(2)}`;
}

void (async () => {
  loadEnvFile(ROOT);
  const { accountId, accessKeyId, secretAccessKey, bucket } = requireR2Env();

  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  console.log(`Bucket: ${bucket}`);
  console.log('Listing…\n');

  const byKind = new Map<Kind, Bucket>();
  const byRealm = new Map<string, { objects: number; bytes: number }>();
  const products = new Set<string>();
  const regions = new Set<string>();

  let totalObjects = 0;
  let totalBytes = 0;
  let listRequests = 0;
  let token: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1000,
        ContinuationToken: token,
      })
    );
    listRequests += 1;

    for (const object of response.Contents ?? []) {
      const key = object.Key ?? '';
      const size = object.Size ?? 0;
      totalObjects += 1;
      totalBytes += size;

      const kind = classify(key);
      const bucketStats = byKind.get(kind) ?? { objects: 0, bytes: 0 };
      bucketStats.objects += 1;
      bucketStats.bytes += size;
      byKind.set(kind, bucketStats);

      const realm = realmOf(key);
      if (realm) {
        const realmStats = byRealm.get(realm) ?? { objects: 0, bytes: 0 };
        realmStats.objects += 1;
        realmStats.bytes += size;
        byRealm.set(realm, realmStats);
      }

      const parts = key.split('/');
      if (parts[0] === 'data' && parts[1] === 'cached') {
        products.add(parts[2]);
        regions.add(parts[3]);
      }
    }

    token = response.NextContinuationToken;
    if (listRequests % 25 === 0) {
      process.stdout.write(
        `  ${totalObjects.toLocaleString()} objects, ${human(totalBytes)}\r`
      );
    }
  } while (token);

  console.log(`  ${totalObjects.toLocaleString()} objects, ${human(totalBytes)}\n`);

  console.log('By kind');
  console.log('  ' + 'kind'.padEnd(14) + 'objects'.padStart(12) + 'size'.padStart(14));
  for (const kind of ['state.bin', 'realm.bin', 'history.bin', 'item.bin', 'names.json', 'other'] as Kind[]) {
    const stats = byKind.get(kind);
    if (!stats) continue;
    console.log(
      '  ' +
        kind.padEnd(14) +
        stats.objects.toLocaleString().padStart(12) +
        human(stats.bytes).padStart(14)
    );
  }

  console.log(`\nRealms covered : ${byRealm.size.toLocaleString()}`);
  console.log(`Products       : ${[...products].join(', ') || '(none)'}`);
  console.log(`Regions        : ${[...regions].join(', ') || '(none)'}`);

  const biggest = [...byRealm.entries()].sort((a, b) => b[1].bytes - a[1].bytes).slice(0, 5);
  if (biggest.length > 0) {
    console.log('\nBiggest realms');
    for (const [realm, stats] of biggest) {
      console.log(
        `  realm ${realm.padEnd(8)}${stats.objects.toLocaleString().padStart(12)} objects  ` +
          human(stats.bytes).padStart(12)
      );
    }
  }

  console.log('\nCost of the operations above');
  console.log(`  listing (${listRequests} requests)      ${cost(listRequests, CLASS_B_PRICE_PER_MILLION)}`);
  console.log(`  deleting ${totalObjects.toLocaleString()} objects  ${cost(totalObjects, CLASS_B_PRICE_PER_MILLION)}`);
  console.log(
    `  writing the same objects back      ${cost(totalObjects, CLASS_A_PRICE_PER_MILLION)}`
  );
  console.log(
    `  storage right now                  $${((totalBytes / 1024 ** 3) * 0.015).toFixed(3)}/month`
  );
  console.log(
    `  (deletes are Class B; batching 1000 keys per request means ` +
      `${Math.ceil(totalObjects / 1000).toLocaleString()} DELETE requests, not ${totalObjects.toLocaleString()})`
  );
  console.log(`\n  storage freed by a purge: ${human(totalBytes)}`);
})();
