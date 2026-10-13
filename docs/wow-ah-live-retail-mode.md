# WoW AH: Live Retail Mode — Final Design

**Date**: 2026-10-13
**Branch**: main
**Status**: Design approved, ready for implementation

---

## Goal

Replace all hardcoded offline data (synthetic auction snapshot, items catalog, categories match-by-name, aggregator test fakes) with a live Blizzard Retail API + Cloudflare R2 pipeline that fetches every connected realm in EU + US, stores per-realm/per-item binary blobs, and serves them to a dashboard with realm selector + cross-realm per-item comparison. Validate end-to-end now against WoW Retail. After Nov 4, 2026 swap namespace to Forever via env var.

---

## Understanding Summary

- **What**: kill synthetic, force live; fetch all connected realms EU+US in parallel; persist to R2; serve via dashboard with realm selector and cross-realm per-item view; single env-var swap to Forever on Nov 4.
- **Why**: prepare for Forever API (Nov 4, 2026). Until then validate architecture against Retail (structurally identical for commodities + non-commodities + connected realms + item metadata). A healthy-looking dashboard of fake numbers is a worse failure mode than a loud one.
- **Who**: solo operator. Internal/private use. Single bearer-gated pipeline endpoint.
- **Key constraints**: no synthetic fallback; items metadata from Blizzard + R2 cache; categories match by Blizzard numeric ids (no English substring hacks); no aggregator test magic numbers; R2 not yet provisioned; dashboard enumerates realms by listing R2 keys.
- **Trigger**: manual curl, visual browser verification. Parallel batch fetch with concurrency cap 4.
- **Non-goals**: persistent cron, multi-user auth, public R2 domain, new UI beyond realm selector + cross-realm table.

## Explicit Assumptions

1. Blizzard API credentials obtainable via developer.blizzard.com (free).
2. Retail namespace = `dynamic-{region}`; item namespace = `static-{region}` (works for both Retail and Forever).
3. Forever namespace = `dynamic-classicann-{region}` (post-Nov 4).
4. Locale stays `en_US`.
5. Pipeline run timeout 300s acceptable for ~50 realms at concurrency 4 (typical 125s).
6. Crafting recipes sourced live with graceful degradation (recipe endpoint failures don't fail run).
7. R2 bucket private (no public domain). Read path = same app proxy.
8. Bucket name remains env-overridable (`R2_BUCKET_NAME`), default `wow-forever-ah-cache`.

---

## Architecture

### Pipeline write path
`POST /api/pipeline/run-all` (bearer-gated, 1 per 5 min):
1. Validate Blizzard creds + R2 configured. Fail loud otherwise.
2. `realmIndex.listRealmsAll()` enumerates `data/wow/connected-realm/index` for each region.
3. Items metadata prewarm (parallel cap 5): for each distinct id in current snapshot, fetch `data/wow/item/{id}` + persist to R2 `data/items-meta/{region}/{itemId}.json`.
4. Realm snapshots (parallel cap 4): fetch `data/wow/connected-realm/{id}/auctions`, aggregate, write per-realm `state.bin` + per-item shards.
5. Recipes (best effort, parallel cap 2): `data/wow/recipe/{id}` for known recipe ids.
6. Write `data/manifests/{region}/recent-items.json` + `data/manifests/run-log/{ISO8601}.json`.

### Pipeline read path
- `GET /api/realms?region=eu|us` via `ListObjectsV2` `CommonPrefixes`.
- `GET /api/realms/{region}/{realmId}/items` same approach with shard dirs.
- `GET /api/data/cached/{region}/{realmId}/{shard}/{itemId}.bin` (existing binary routes; old un-prefixed paths 410 Gone).
- Dashboard selector + cross-realm table populated from `/api/realms` + per-realm `/items`.

### Items metadata (two-tier cache)
- Hot: in-memory `globalThis` Map (existing `itemMetadataCache.ts`).
- Durable: R2 JSON files, `Cache-Control: 30d`.
- Lazy fill: fetch when item appears in snapshot and missing.
- R2 save fire-and-forget; failures logged not raised.

### Categories
Match by Blizzard `item_class.id` + `item_subclass.id`. UI taxonomy preserved (12 items) with compact group mapping (e.g. `One-Handed = [0,4,7,13]`).

### Forever swap
Single env var `BLIZZARD_PRODUCT` (default `retail`). Swaps namespace + R2 prefix.

---

## R2 Layout

```
wow-forever-ah-cache/
 data/
    cached/
      eu/{connectedRealmId}/{itemId & 0xff}/{itemId}.bin
      eu/{connectedRealmId}/state.bin
      us/{connectedRealmId}/{itemId & 0xff}/{itemId}.bin
      us/{connectedRealmId}/state.bin
      forever/{...}     (post-Nov 4)
    items-meta/
      eu/{itemId}.json
      us/{itemId}.json
    recipes/
      eu/{recipeId}.json
      us/{recipeId}.json
    manifests/
      eu/recent-items.json
      us/recent-items.json
      run-log/{ISO8601}.json
```

Old path `data/cached/{realmId}/...` returns 410 Gone. `scripts/migrate-r2-prefix.ts` moves legacy blobs.

---

## New Files

- `src/services/blizzard/realmIndex.ts`
- `src/services/itemMetadataPersistence.ts`
- `src/utils/parallel.ts` (bounded semaphore)
- `src/types/pipeline.ts`
- `app/api/pipeline/run-all/route.ts`
- `app/api/realms/route.ts`
- `app/api/realms/[region]/[connectedRealmId]/items/route.ts`
- `scripts/migrate-r2-prefix.ts`
- Tests for all above

## Modified Files

- `src/services/blizzard.ts` — env-product switch, `region` param on `fetchItemMetadata`, remove `generateSyntheticWoWForeverSnapshot`.
- `src/services/aggregator.ts` — region-aware key generation, remove item 16204 test magic numbers.
- `src/services/r2.ts` — `listKeys`, `HeadObject` helpers, product/region-aware key helpers.
- `src/data/categories.ts` — numeric ids, `matchesCategoryFilter` rewrite, compact group mapping.
- `src/data/itemsCatalog.ts` — runtime data removed, only `WowItemMetadata` type re-exports.
- `src/types/auction.ts` — `itemClassId`, `itemSubclassId` fields.
- `app/api/data/cached/[realmId]/state.bin/route.ts` — region required, 410 for legacy.
- `app/page.tsx` — DashboardHeader wired to `/api/realms?region=eu`.
- `src/components/MultiRealmPriceTable.tsx` — enumerate via `/api/realms/{region}/{id}/items`.
- `.env.example` — `BLIZZARD_PRODUCT=retail` default.
- `README.md` — Smoke test section.
- `package.json` — `npm run smoke`, `check` includes coverage.

---

## Testing Strategy

Three layers:
1. **Unit**: extend existing `itemMetadataCache.test.ts`; add `itemMetadataPersistence.test.ts`, `realmIndex.test.ts`, `parallel.test.ts`, `categories.test.ts`, `migrate-r2-prefix.test.ts`.
2. **Integration**: `pipeline-run-all.test.ts` (in-memory R2 + stubbed Blizzard).
3. **Manual smoke**: documented in README. Verify R2 contents via `wrangler r2 object list`.

Coverage 80% lines / 75% branches. Wired into CI now.

---

## Decision Log

| ID | Decision |
|---|---|
| §D1.1 | New endpoint `pipeline/run-all` (distinct from `pipeline/run`). |
| §D1.2 | Realm/item enumeration via `ListObjectsV2` paginated, CommonPrefixes. |
| §D2.1 | Region-prefixed R2 layout. |
| §D2.2 | `data/manifests/recent-items.json` as prewarm hint. |
| §D2.3 | `ListObjectsV2` paginated 1000/page. |
| §D2.4 | `/api/realms?region=eu|us` region required param. |
| §D2.5 | Bucket name unchanged (env-overridable). |
| §D3.1 | Items metadata two-tier (hot + durable). |
| §D3.2 | R2 30d Cache-Control. |
| §D3.3 | Region-aware fetch (param threaded through). |
| §D3.4 | R2 save fire-and-forget. |
| §D3.5 | `WOW_ITEMS_CATALOG` runtime data deleted. |
| §D3.6 | 30d Cache-Control (kept). |
| §D3.7 | No incremental refresh (YAGNI). |
| §D3.8 | Lazy fill via existing `warmMetadataForIds` + persistence. |
| §D4.1 | `realmIndex.listRealms` per region; no R2 mirror. |
| §D4.2 | Batch endpoint rate-limited 1 per 5 min. |
| §D4.3 | Custom array semaphore (no new dep). |
| §D4.4 | Per-realm failure isolated, response success ≠ 0. |
| §D4.5 | Numeric realm labels only (v1). |
| §D4.6 | Simple batch, no SSE, no chunking. |
| §D5.1 | `GET /api/realms?region=eu|us` via CommonPrefixes. |
| §D5.2 | In-memory TTL cache 60s on realms listing. |
| §D5.3 | Status endpoint reports region readiness. |
| §D5.4 | Old paths 410 Gone + migration script. |
| §D6.1 | Category matching by Blizzard numeric ids. |
| §D6.2 | Localized names retained for display. |
| §D6.3 | `itemClassId`/`itemSubclassId` on metadata. |
| §D6.4 | Old substring matching deleted. |
| §D6.5 | Compact group mapping; 12-item taxonomy preserved. |
| §D7.1 | `BLIZZARD_PRODUCT` env var; default `retail`. |
| §D7.2 | Forever uses `dynamic-classicann-{region}`. |
| §D7.3 | R2 prefix partitioned by product. |
| §D7.4 | `scripts/migrate-r2-prefix.ts` one-time. |
| §D7.5 | Swap design approved as described. |
| §D8.1 | Three test layers: unit + integration + manual smoke. |
| §D8.2 | No Playwright E2E in v1. |
| §D8.3 | README `## Smoke test` section. |
| §D8.4 | 80% line / 75% branch coverage target. |
| §D8.5 | Wire coverage into CI now. |

---

## Implementation Order (suggested phases within one PR)

1. **Phase 0**: `BLIZZARD_PRODUCT` env + product-aware namespace in `BlizzardService`. Smoke test against Forever namespace URL pattern (returns 404 expected, validates config wiring).
2. **Phase 1**: `R2Service.listKeys`, `HeadObject` helpers. Product/region-aware key helpers. Unit tests.
3. **Phase 2**: `realmIndex` service. Unit tests.
4. **Phase 3**: `parallel` semaphore. Unit tests.
5. **Phase 4**: `itemMetadataPersistence`. Extend `itemMetadataCache` to use it. Unit tests.
6. **Phase 5**: `categories.ts` numeric id rework. `WowItemMetadata` schema additions. Update `BlizzardService.fetchItemMetadata` to parse ids. Unit tests.
7. **Phase 6**: `pipeline/run-all` route. Integration test (in-memory R2 + stubbed Blizzard).
8. **Phase 7**: `GET /api/realms` + `GET /api/realms/[region]/[connectedRealmId]/items`. Update `app/api/data/cached/...` paths. 410 Gone for legacy.
9. **Phase 8**: Dashboard wiring (`DashboardHeader`, `MultiRealmPriceTable`).
10. **Phase 9**: Remove synthetic snapshot. Remove item 16204 aggregator test magic numbers. Delete `WOW_ITEMS_CATALOG` runtime data.
11. **Phase 10**: `scripts/migrate-r2-prefix.ts`. README smoke test. Wire coverage into `npm run check`.
12. **Phase 11**: Manual smoke verification end-to-end.

---

## Open Risks

- **R2 quota**: `ListObjectsV2` 1000/page. 50 realms x ~3000 items/realm x shard dirs = ~150k keys under `data/cached/eu/`. Per-realm listing stays small; cross-region listing O(regions x realms). Acceptable.
- **Vercel 300s timeout**: edge case where Blizzard takes >75s avg x 4 parallel could exceed. Mitigated by per-realm 15s timeout (existing). If happens, chunked resume becomes follow-up.
- **Blizzard rate limits on item-metadata prewarm**: 50 realms x 3000 items = 150k ids. Concurrency 5 x max 30s = batches. First run will pull heavy quota. Mitigated by R2 cache filling over time. No pre-warm until ids seen in snapshot (lazy).
- **Forever API unknown schema changes**: mitigation = product switch is single-point, easy rollback via env var revert.

---

## Next Step

Ready for implementation. Per brainstorming skill, ask operator: set up for implementation?