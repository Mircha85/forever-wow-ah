import { describe, it, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

import { R2Service } from '../r2';
import { isCacheEntryPreCreds } from '../../utils/cacheStaleness';

describe('R2Service.getCacheMeta', () => {
  beforeEach(() => {
    R2Service.clearMemoryCache();
  });

  it('returns null for an unknown key', () => {
    const meta = R2Service.getCacheMeta('data/cached/1305/missing.bin');
    assert.equal(meta, null);
  });

  it('returns the lastModified date set at upload time', async () => {
    const key = 'data/cached/1305/0/16204.bin';
    const r2 = new R2Service();
    const before = Date.now();
    await r2.uploadBin(key, Buffer.from('test'));
    const after = Date.now();

    const meta = R2Service.getCacheMeta(key);
    assert.ok(meta, 'expected cache metadata to exist');
    assert.ok(
      meta.lastModified.getTime() >= before && meta.lastModified.getTime() <= after,
      `lastModified ${meta.lastModified.toISOString()} must fall between ${before} and ${after}`
    );
  });
});

describe('isCacheEntryPreCreds', () => {
  it('returns true when the cached entry predates the moment credentials were first observed', () => {
    const credsFirstSeenAt = 1_700_000_000_000;
    const meta = { lastModified: new Date(credsFirstSeenAt - 1) };
    assert.equal(isCacheEntryPreCreds(meta, credsFirstSeenAt), true);
  });

  it('returns false when the cached entry was placed at or after the credentials-first-seen marker', () => {
    const credsFirstSeenAt = 1_700_000_000_000;
    const meta = { lastModified: new Date(credsFirstSeenAt) };
    assert.equal(isCacheEntryPreCreds(meta, credsFirstSeenAt), false);
  });
});
