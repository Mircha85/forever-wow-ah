# WoW: Forever AH

Auction house intelligence dashboard for WoW: Forever, with a custom binary
transport and client-side decoding.

The app pulls auction snapshots from the Battle.net API, aggregates them into
per-realm and per-item statistics, encodes those into a compact binary format
(`UNDR v1`), caches the blobs in Cloudflare R2, and decodes them in the browser
with `ArrayBuffer` / `DataView`. No JSON parsing on the hot path.

<!-- markdownlint-disable MD033 -->

## Stack

| Layer     | Choice                                       |
| --------- | -------------------------------------------- |
| Framework | Next.js 15 (App Router) + React 19           |
| Language  | TypeScript 5.9, `strict: true`               |
| Styling   | Tailwind CSS 4                               |
| Runtime   | Node.js >= 20.9                              |
| Tooling   | npm                                          |
| Storage   | Cloudflare R2 (S3-compatible), in-memory fallback |
| Upstream  | Battle.net REST API (OAuth2 `client_credentials`) |

## Getting started

```bash
npm install
cp .env.example .env.local   # optional — see "Configuration"
npm run dev
```

npm is the only package manager here. `package-lock.json` is committed and CI
installs with `npm ci`, so you get the exact dependency tree CI verified. Bun,
Yarn and pnpm lockfiles are git-ignored so a stray one cannot quietly become a
second source of truth.

The app runs with **no configuration at all**. Without Battle.net credentials it
serves high-fidelity simulated data, and without R2 it falls back to an
in-process memory cache, so you can develop and demo the full UI offline.

### Commands

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Dev server with HMR                           |
| `npm run build`     | Production build (runs typecheck + lint)      |
| `npm run start`     | Serve the production build                    |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run lint`      | ESLint (Next + TypeScript-aware rules)        |
| `npm run check`     | typecheck → lint → build, same as CI          |

## Configuration

Every variable is optional. Copy `.env.example` to `.env.local` and fill in what
you need; `.env.example` documents each one.

### Pipeline bearer token

`PIPELINE_RUN_TOKEN` — required in production, optional in local dev. This is a
shared bearer secret that gates `POST /api/pipeline/run`. Generate one with
`openssl rand -base64 32` (or any 32-byte random source, base64url-safe) and
keep it out of version control. The route compares it against the
`Authorization: Bearer <token>` header using `crypto.timingSafeEqual`; a
mismatch returns 401, and production refuses to start if the variable is empty.
Local dev (`NODE_ENV !== 'production'`) may leave it unset so `npm run dev`
keeps working without ceremony.

### Battle.net API

`BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REGION`

OAuth2 `client_credentials` flow. Access tokens are cached in-process with a
60-second expiry buffer. Without credentials the app uses simulated data.

### Cloudflare R2

`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`,
`R2_PUBLIC_DOMAIN`

Blobs are addressed as `data/cached/<realmId>/<shard>/<itemId>.bin`, where
`<shard>` is `itemId & 0xff`. Omit these to use the in-memory cache.

## Project layout

```
app/
  page.tsx                    Dashboard (single client component, ~2.3k lines)
  api/
    status/route.ts            Service health probe
    pipeline/run/route.ts      Full ingestion run  (rate limited: 5 / 5 s)
    data/cached/…/state.bin    Realm state blob   (rate limited: 30 / min)
    data/cached/…/[file]       Per-item blob      (rate limited: 60 / min)
src/
  components/                  UI, incl. binary inspector and pipeline modal
  data/                        Item catalogue, categories, realm list
  services/
    blizzard.ts                Battle.net OAuth + snapshot fetch
    aggregator.ts              Snapshot → per-item / per-realm metrics
    encoder.ts                 Metrics → UNDR v1 binary
    r2.ts                      R2 storage + in-memory fallback
  utils/
    binDecoder.ts              Client-side UNDR v1 decoder
    rateLimit.ts               Sliding-window limiter
    apiGuard.ts                Route guards, bounded id parsing
  types/auction.ts             Shared domain types
```

## Binary format — UNDR v1

All integers are little-endian. `state.bin` layout:

**Header (24 bytes)**

| Offset | Field             | Type       |
| ------ | ----------------- | ---------- |
| 0      | Magic `0x554E4452` | `Uint32` (ASCII `UNDR`) |
| 4      | Version (`1`)     | `Uint16`   |
| 6      | Reserved (`0`)    | `Uint16`   |
| 8      | Realm id          | `Uint32`   |
| 12     | Generated at (s)  | `Uint32`   |
| 16     | Total auctions    | `Uint32`   |
| 20     | Item record count | `Uint32`   |

**Item records (28 bytes each)**

| Offset | Field                | Type                    |
| ------ | -------------------- | ----------------------- |
| 0      | Item id              | `Uint32`                |
| 4      | Min price (copper)   | `Uint32`                |
| 8      | Median price         | `Uint32`                |
| 12     | Mean price           | `Uint32`                |
| 16     | Quantity             | `Uint32`                |
| 20     | Auction count        | `Uint32`                |
| 24     | 24 h price delta     | `Int16`, ×100           |
| 26     | 24 h quantity delta  | `Int16`, ×100           |

Per-item blobs (`[file]`) carry a header plus 24-hour history and hourly deltas;
see `src/services/encoder.ts` for the authoritative layout and
`src/utils/binDecoder.ts` for the reader.

## API

Most routes are public. The two read paths and `pipeline/run` are rate limited
per client IP, returning `429` with a `Retry-After` header when over budget.

> **Rate limits are per instance.** The limiter keeps state in process memory, so
> it resets on cold start and scales with instance count. It stops a single
> anonymous client and casual abuse. For a hard global guarantee, move it behind
> Cloud Run IAM or a shared store (Redis / KV / Durable Object) — the limiter's
> function signature is deliberately narrow to make that swap easy.

| Method | Path                                       | Notes                                     |
| ------ | ------------------------------------------ | ----------------------------------------- |
| `GET`  | `/api/status`                              | Credential/storage/binary-codec health     |
| `POST` | `/api/pipeline/run`                        | Bearer-gated full snapshot → aggregate → encode → store |
| `GET`  | `/api/data/cached/{realmId}/state.bin`     | Realm state blob, `application/octet-stream` |
| `GET`  | `/api/data/cached/{realmId}/{hash}/{itemId}.bin` | Per-item blob                       |

`realmId` and `itemId` must be positive in-range integers; anything else is a
`400` rather than being coerced to a default.

### Triggering `pipeline/run` outside the browser

`POST /api/pipeline/run` is no longer reachable from the dashboard — the UI no
longer ships the token to a browser bundle. Trigger it from a host where the
token lives in an env var:

```bash
curl -X POST "$APP_URL/api/pipeline/run" \
  -H "Authorization: Bearer $PIPELINE_RUN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"connectedRealmId": 4401}'
```

Without a matching bearer the route answers 401 (opaque body — no probe signal).
Production refuses to start if `PIPELINE_RUN_TOKEN` is empty. If the token ever
leaks, rotate it: generate a new value, update the env var, redeploy.

## Quality gates

CI runs on every push and PR: `npm ci`, then `npm run typecheck`, `npm run lint`,
`npm run build`, and finally `git diff --exit-code` so a generated artifact can
never slip in. `next build` also runs ESLint and TypeScript itself, so a red
build and a red CI agree. Locally, `npm run check` is the same thing in one
command.

## Deploying

The app runs anywhere Next.js 15 on Node >= 20.9 runs. Production deploy is on
**Vercel Hobby** (`fra1` region). Extraction is triggered by
[cron-job.org](https://cron-job.org/) hitting `POST /api/pipeline/run` every
30 minutes per connected realm. No Cloud Run, no egress bills.

Set the env vars documented in `.env.example`. The Cloudflare R2 credentials
are required for any non-toy deployment.
