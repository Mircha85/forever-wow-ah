import { describe, it, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

import {
  clearMetadataCache,
  getCachedMetadata,
  metadataCacheSize,
  setCachedMetadata,
  warmMetadataForIds,
} from '../itemMetadataCache';
import type { WowItemMetadata } from '../../types/auction';

const stubMeta = (id: number): WowItemMetadata => ({
  id,
  name: `Stub ${id}`,
  icon: 'placeholder.jpg',
  quality: 1,
  itemClass: 'Miscellaneous',
  subclass: 'Junk',
  itemLevel: 0,
  requiredLevel: 0,
});

describe('itemMetadataCache', () => {
  beforeEach(() => {
    clearMetadataCache();
  });

  it('returns undefined for an uncached id', () => {
    assert.equal(getCachedMetadata(9999), undefined);
  });

  it('setCachedMetadata stores entries retrievable via getCachedMetadata', () => {
    const meta = stubMeta(42);
    setCachedMetadata(meta);
    assert.deepEqual(getCachedMetadata(42), meta);
    assert.equal(metadataCacheSize(), 1);
  });

  it('clearMetadataCache wipes the entire cache', () => {
    setCachedMetadata(stubMeta(1));
    setCachedMetadata(stubMeta(2));
    assert.equal(metadataCacheSize(), 2);
    clearMetadataCache();
    assert.equal(metadataCacheSize(), 0);
  });
});

describe('warmMetadataForIds', () => {
  beforeEach(() => clearMetadataCache());

  it('fetches uncached ids and skips already-cached ones', async () => {
    setCachedMetadata(stubMeta(1));
    const fetched: number[] = [];
    const result = await warmMetadataForIds(
      // eslint-disable-next-line @typescript-eslint/require-await
      async (id) => {
        fetched.push(id);
        return stubMeta(id);
      },
      [1, 2, 3]
    );
    assert.equal(result.skipped, 1, 'item 1 was pre-cached');
    assert.equal(result.fetched, 2, 'items 2 and 3 fetched');
    assert.equal(result.failed, 0);
    assert.equal(result.retriedOut, 0);
    assert.deepEqual([...fetched].sort(), [2, 3]);
  });

  it('deduplicates the input id list', async () => {
    const seen: number[] = [];
    const result = await warmMetadataForIds(
      // eslint-disable-next-line @typescript-eslint/require-await
      async (id) => {
        seen.push(id);
        return stubMeta(id);
      },
      [5, 5, 5, 6]
    );
    assert.equal(result.fetched, 2);
    assert.equal(seen.length, 2);
    assert.deepEqual([...seen].sort(), [5, 6]);
  });

  it('counts 404 / null as failed without retrying', async () => {
    let attempts = 0;
    const result = await warmMetadataForIds(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        attempts += 1;
        return null;
      },
      [7],
      { maxRetries: 3 }
    );
    assert.equal(result.failed, 1);
    assert.equal(result.retriedOut, 0);
    assert.equal(attempts, 1, 'must not retry on null');
  });

  it('retries on thrown errors up to maxRetries then counts retriedOut', async () => {
    let attempts = 0;
    const result = await warmMetadataForIds(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
        attempts += 1;
        throw new Error('boom');
      },
      [11],
      { maxRetries: 2 }
    );
    assert.equal(result.fetched, 0);
    assert.equal(result.retriedOut, 1);
    assert.equal(attempts, 3, '1 initial + 2 retries');
  });

  it('eventual success after a transient throw counts as fetched', async () => {
    let attempts = 0;
    const result = await warmMetadataForIds(
      // eslint-disable-next-line @typescript-eslint/require-await
      async (id) => {
        attempts += 1;
        if (attempts < 2) throw new Error('flaky');
        return stubMeta(id);
      },
      [12],
      { maxRetries: 1 }
    );
    assert.equal(result.fetched, 1);
    assert.equal(result.retriedOut, 0);
  });

  it('returns zeroed counts for an empty id list without calling fetch', async () => {
    let calls = 0;
    const result = await warmMetadataForIds(
      // eslint-disable-next-line @typescript-eslint/require-await
      async () => {
      calls += 1;
      return stubMeta(0);
    }, []);
    assert.deepEqual(result, { fetched: 0, skipped: 0, failed: 0, retriedOut: 0 });
    assert.equal(calls, 0);
  });

  it('filters out non-positive and non-finite ids', async () => {
    const seen: number[] = [];
    await warmMetadataForIds(
      // eslint-disable-next-line @typescript-eslint/require-await
      async (id) => {
        seen.push(id);
        return stubMeta(id);
      },
      [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 13]
    );
    assert.deepEqual(seen, [13]);
  });
});
