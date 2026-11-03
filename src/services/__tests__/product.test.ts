import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { auctionNamespace, itemNamespace, resolveProduct } from '../product';

/**
 * One variable decides both the game that is queried and the prefix the
 * result is stored under.
 *
 * These used to be decided in four places that disagreed: the pipeline
 * wrote retail-prefixed keys from a Forever namespace, and the extraction
 * script pulled the retail namespace whatever the product said. The
 * consequence was a bucket whose prefix and contents could describe
 * different games.
 */
describe('resolveProduct', () => {
  it('defaults to retail when nothing is configured', () => {
    assert.equal(resolveProduct({}), 'retail');
  });

  it('selects retail explicitly', () => {
    assert.equal(resolveProduct({ BLIZZARD_PRODUCT: 'retail' }), 'retail');
  });

  it('selects forever when asked', () => {
    assert.equal(resolveProduct({ BLIZZARD_PRODUCT: 'forever' }), 'forever');
  });

  it('falls back to retail for an unknown value rather than guessing', () => {
    // A typo in the environment must not silently point the pipeline at
    // the other game.
    assert.equal(resolveProduct({ BLIZZARD_PRODUCT: 'forover' }), 'retail');
    assert.equal(resolveProduct({ BLIZZARD_PRODUCT: '' }), 'retail');
  });
});

describe('auctionNamespace', () => {
  it('uses the retail namespace for retail', () => {
    assert.equal(auctionNamespace('retail', 'eu'), 'dynamic-eu');
    assert.equal(auctionNamespace('retail', 'us'), 'dynamic-us');
  });

  it('uses the anniversary namespace for WoW: Forever', () => {
    assert.equal(auctionNamespace('forever', 'eu'), 'dynamic-classicann-eu');
    assert.equal(auctionNamespace('forever', 'us'), 'dynamic-classicann-us');
  });

  it('never returns the same namespace for both products', () => {
    // A request against the wrong namespace succeeds against the wrong
    // game rather than failing, so the two must never collide.
    assert.notEqual(auctionNamespace('retail', 'eu'), auctionNamespace('forever', 'eu'));
  });
});

describe('itemNamespace', () => {
  it('is the static catalog for both games', () => {
    assert.equal(itemNamespace('eu'), 'static-eu');
    assert.equal(itemNamespace('us'), 'static-us');
  });
});
