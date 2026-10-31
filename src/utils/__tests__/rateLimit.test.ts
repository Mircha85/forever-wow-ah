import { describe, it } from 'vitest';
import assert from 'node:assert/strict';

import { clientKeyFromHeaders } from '../rateLimit';

/** Build a `Headers` instance from a plain object so each test reads like a table. */
function makeHeaders(values: Record<string, string>): Headers {
  const h = new Headers();
  for (const [k, v] of Object.entries(values)) h.set(k, v);
  return h;
}

describe('clientKeyFromHeaders — no headers', () => {
  it('returns "unknown" when the request carries no IP headers', () => {
    assert.equal(clientKeyFromHeaders(new Headers()), 'unknown');
  });

  it('returns "unknown" when the headers are present but empty', () => {
    assert.equal(clientKeyFromHeaders(makeHeaders({})), 'unknown');
  });
});

describe('clientKeyFromHeaders — trusted edge headers take precedence over x-forwarded-for', () => {
  it('prefers x-vercel-forwarded-for over a spoofed x-forwarded-for', () => {
    // The previous implementation took the leftmost x-forwarded-for
    // entry, which meant a client could send a fresh XFF per request
    // and bypass the limiter entirely. The fix must ignore spoofed
    // XFF whenever a platform-managed header is present.
    const headers = makeHeaders({
      'x-vercel-forwarded-for': '203.0.113.1',
      'x-forwarded-for': '198.51.100.99',
    });
    assert.equal(clientKeyFromHeaders(headers), '203.0.113.1');
  });

  it('prefers cf-connecting-ip over x-forwarded-for when Vercel is absent', () => {
    const headers = makeHeaders({
      'cf-connecting-ip': '203.0.113.5',
      'x-forwarded-for': '198.51.100.99',
    });
    assert.equal(clientKeyFromHeaders(headers), '203.0.113.5');
  });

  it('prefers fly-client-ip when neither Vercel nor CF is set', () => {
    const headers = makeHeaders({
      'fly-client-ip': '203.0.113.7',
      'x-forwarded-for': '198.51.100.99',
    });
    assert.equal(clientKeyFromHeaders(headers), '203.0.113.7');
  });

  it('prefers the most-trusted header when several edge headers are present', () => {
    // Vercel is the top of the trust list and must override CF and Fly.
    const headers = makeHeaders({
      'x-vercel-forwarded-for': '203.0.113.1',
      'cf-connecting-ip': '203.0.113.5',
      'fly-client-ip': '203.0.113.7',
      'x-real-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.99',
    });
    assert.equal(clientKeyFromHeaders(headers), '203.0.113.1');
  });
});

describe('clientKeyFromHeaders — x-real-ip fallback', () => {
  it('uses x-real-ip when no edge headers are present', () => {
    const headers = makeHeaders({
      'x-real-ip': '203.0.113.10',
      'x-forwarded-for': '198.51.100.99',
    });
    assert.equal(clientKeyFromHeaders(headers), '203.0.113.10');
  });

  it('skips an empty/whitespace trusted header and falls through to x-real-ip', () => {
    const headers = makeHeaders({
      'x-vercel-forwarded-for': '   ',
      'cf-connecting-ip': '',
      'x-real-ip': '203.0.113.40',
    });
    assert.equal(clientKeyFromHeaders(headers), '203.0.113.40');
  });
});

describe('clientKeyFromHeaders — last-resort x-forwarded-for fallback', () => {
  it('uses the leftmost x-forwarded-for entry when no trusted header is present', () => {
    const headers = makeHeaders({
      'x-forwarded-for': '198.51.100.50, 10.0.0.1, 10.0.0.2',
    });
    assert.equal(clientKeyFromHeaders(headers), '198.51.100.50');
  });

  it('returns "unknown" when x-forwarded-for is empty or whitespace', () => {
    assert.equal(
      clientKeyFromHeaders(makeHeaders({ 'x-forwarded-for': '   ' })),
      'unknown'
    );
    assert.equal(
      clientKeyFromHeaders(makeHeaders({ 'x-forwarded-for': ',' })),
      'unknown'
    );
  });
});

describe('clientKeyFromHeaders — value handling', () => {
  it('trims whitespace from the chosen header', () => {
    const headers = makeHeaders({
      'x-vercel-forwarded-for': '  203.0.113.30  ',
    });
    assert.equal(clientKeyFromHeaders(headers), '203.0.113.30');
  });

  it('takes the first comma-separated entry when a header carries a chain', () => {
    // Defensive — Vercel usually sends a single IP, but if a future
    // change sends a chain, the first (client) entry is the correct one.
    const headers = makeHeaders({
      'x-vercel-forwarded-for': '203.0.113.50, 10.0.0.5',
    });
    assert.equal(clientKeyFromHeaders(headers), '203.0.113.50');
  });

  it('returns a stable string per IP so equal IPs bucket together', () => {
    // Two requests from the same client must produce the same key, or
    // the rate limiter hands them separate buckets.
    const a = makeHeaders({ 'x-vercel-forwarded-for': '203.0.113.99' });
    const b = makeHeaders({ 'x-vercel-forwarded-for': '203.0.113.99' });
    assert.equal(clientKeyFromHeaders(a), clientKeyFromHeaders(b));
  });

  it('treats different IPs as different keys', () => {
    const a = makeHeaders({ 'x-vercel-forwarded-for': '203.0.113.99' });
    const b = makeHeaders({ 'x-vercel-forwarded-for': '203.0.113.100' });
    assert.notEqual(clientKeyFromHeaders(a), clientKeyFromHeaders(b));
  });
});