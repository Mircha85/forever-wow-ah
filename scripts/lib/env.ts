import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Loads `.env.local` into `process.env`.
 *
 * Variables that are already set win: a real environment (Vercel, CI) must
 * not be overridden by a file that happens to be on disk.
 *
 * The file is optional. Its absence is not an error — the caller reports
 * which variables were missing.
 */
export function loadEnvFile(root: string): void {
  const envPath = path.join(root, '.env.local');
  let text: string;
  try {
    text = fs.readFileSync(envPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return;
  }

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2] ?? '';
    // Strip surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

/**
 * The R2 credentials the scripts need, and whether they are all present.
 */
export function requireR2Env(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
} {
  const missing: string[] = [];
  const read = (name: string): string => {
    const value = process.env[name] ?? '';
    if (!value) missing.push(name);
    return value;
  };

  const accountId = read('R2_ACCOUNT_ID');
  const accessKeyId = read('R2_ACCESS_KEY_ID');
  const secretAccessKey = read('R2_SECRET_ACCESS_KEY');
  const bucket = read('R2_BUCKET_NAME');

  if (missing.length > 0) {
    console.error(
      `Missing R2 configuration: ${missing.join(', ')}\n` +
        'Set them in .env.local (never committed) or in the environment.'
    );
    process.exit(2);
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}
