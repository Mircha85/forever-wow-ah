# Vercel Hobby Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the WoW: Forever AH dashboard and extraction worker off Google Cloud Run onto free-tier infrastructure (Vercel Hobby + external cron) so monthly egress bills drop to $0.

**Architecture:** Two services today. After migration:
- **Dashboard** (Next.js 15 App Router): Vercel Hobby. 100 GB egress / month free. EU edge network. Cold-start on Hobby is negligible because the dashboard is mostly static.
- **Extraction worker** (was Cloud Run + `Dockerfile` + `scripts/run-server.mjs`): replaced by a per-realm serverless endpoint (`POST /api/pipeline/run` already exists in `app/api/pipeline/run/route.ts`) triggered by [cron-job.org](https://cron-job.org/) (free unlimited triggers) hitting Vercel on a 30-minute schedule. Vercel Hobby cron feature is not used because Hobby allows only one cron execution per day.
- **Cloudflare R2**: unchanged. Still stores `data/cached/<product>/<region>/<realmId>/...bin` blobs. Read by dashboard and written by extraction.
- **Cloud Run**: deleted after the cutover.

## Global Constraints

- Target total recurring spend: **$0 / month**. Any option that costs money must be called out before implementation.
- Dashboard must stay reachable at the current production hostname during the cutover (DNS A/CNAME swap is the last action, not the first).
- `secrets` (Blizzard client credentials, R2 access keys, `PIPELINE_RUN_TOKEN`) must never appear in committed files. `.env.example` documents shape only; real values are injected at deploy time.
- Egress target: **0 GiB / month** to internet destinations outside Vercel's free 100 GB pool.
- Cron schedule on extraction: every 30 minutes is the target cadence. Acceptable degradation: hourly. Anything coarser than 6-hourly is a regression.
- All code already passes `npm run check` (`tsc --noEmit && eslint . && next build`) per `.github/workflows/ci.yml`. The migration must not regress that.
- Local dev workflow (`npm run dev`) must keep working without any new mandatory tooling.

## File Structure

Files touched by this plan:

| File | Change |
|---|---|
| `vercel.json` (new) | Set `regions` to `fra1` (EU), framework nextjs. |
| `next.config.ts` | No structural change. |
| `Dockerfile` | Delete in Task 8 after the worker is fully decommissioned. |
| `.dockerignore` | Delete in Task 8 (no longer needed once `Dockerfile` is gone). |
| `scripts/run-server.mjs` | Delete in Task 8. The HTTP wrapper is replaced by `POST /api/pipeline/run`. |
| `README.md` | Update "Deploying" section to describe the Vercel + cron-job.org setup. |
| `docs/de-rezolvat.md` | Add a closing entry noting the Cloud Run decommissioning. |
| `.env.example` | Add `CRON_SECRET` (token cron-job.org sends in `Authorization: Bearer`); document `APP_URL` is now set to the Vercel URL instead of the Cloud Run URL. |
| `app/api/pipeline/run/route.ts` | No change. |
| `.gitignore` | Add `docs/superpowers/plans/2026-10-14-migration-inventory.md` (scratch file). |

## Task Right-Sizing Notes

Tasks 1-3 are read-only inventory and config; reviewable without execution.
Task 4 is the first deploy; a reviewer can approve the Vercel project shape before any traffic moves.
Tasks 5-7 are the cutover; each ends with a measurable signal (request returns 200, R2 file appears, dashboard renders).
Tasks 8-9 are destructive; both require an explicit `git rm` plus a Google Cloud console action that the user must approve.

---

### Task 1: Inventory current Cloud Run footprint and external dependencies

**Files:**
- Read: `Dockerfile`, `scripts/run-server.mjs`, `.env.example`, `app/api/pipeline/run/route.ts`, `app/api/data/cached/[product]/[region]/[realmId]/state.bin/route.ts`, `.github/workflows/ci.yml`.
- Read-only confirmation, no writes.

**Interfaces:**
- Consumes: nothing (this is the first task).
- Produces: a written list of (a) the Cloud Run service URL(s), (b) the R2 bucket name, (c) every environment variable currently injected into Cloud Run, (d) the current cron schedule (if any) that calls `POST /run?region=eu` on the extraction container.

- [ ] **Step 1: Capture the two Cloud Run URLs**

Open the Google Cloud Console → Cloud Run → Services. Record the URL for the Next.js dashboard and for the extraction worker. Confirm there are exactly two services by listing them. The dashboard URL is also the value of `APP_URL` in `.env.example`.

Expected: two URLs of the form `https://<service>-<hash>.<region>.run.app`. If only one service exists, this plan still applies — that service is the extraction worker, and the dashboard is hosted elsewhere (verify by curling `/healthz` on the URL — if the body is `ok`, it is the worker).

- [ ] **Step 2: List every environment variable on the extraction worker**

Run:

```bash
gcloud run services describe <extraction-service-name> \
  --region=europe-west1 \
  --format='value(spec.template.spec.containers[0].env)'
```

Expected: a list of `KEY=value` pairs. Confirm the following are present: `PIPELINE_RUN_TOKEN`, `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REGION`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN`. Note any extras.

- [ ] **Step 3: Identify the current cron trigger**

Check the Google Cloud Console → Cloud Scheduler. Find jobs targeting `https://<extraction-url>/run?region=eu` (or `/run?region=us`). Record the schedule expression (e.g. `*/30 * * * *`). This is the cadence we must preserve.

If no Cloud Scheduler job exists, ask the user how extraction is currently triggered — manual only? external cron-job.org? GitHub Actions? The plan adapts: if manual, Task 6 can skip cron-job.org setup and only configure the manual curl path.

- [ ] **Step 4: Confirm the R2 bucket and public domain**

Open `.env.example`. `R2_BUCKET_NAME` should be `wow-forever-ah-cache`. `R2_PUBLIC_DOMAIN` should be a `*.r2.dev` or custom domain. Verify by curling one cached blob URL (e.g. `https://<R2_PUBLIC_DOMAIN>/data/cached/retail/eu/<realm-id>/state.bin`) — must return 200 with `Content-Type: application/octet-stream`.

- [ ] **Step 5: Commit findings to a scratch file (not git)**

Create `docs/superpowers/plans/2026-10-14-migration-inventory.md` (gitignored — add it to `.gitignore` before writing) containing the four findings above. This is the hand-off document for Task 2.

---

### Task 2: Provision the Vercel Hobby project and import the repository

**Files:**
- Create: `vercel.json`
- Modify: `.gitignore` (add `docs/superpowers/plans/2026-10-14-migration-inventory.md`)

**Interfaces:**
- Consumes: the inventory from Task 1.
- Produces: a Vercel project connected to the `Mircha85/forever-wow-ah` GitHub repo, plus a `vercel.json` declaring EU region.

- [ ] **Step 1: Install the Vercel CLI locally (or use the web UI)**

```bash
npm install --global vercel@latest
```

Web UI path: log into https://vercel.com → "Add New Project" → import `Mircha85/forever-wow-ah`. Either path works; pick whichever the user prefers.

- [ ] **Step 2: Create `vercel.json` at the repo root**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["fra1"],
  "framework": "nextjs"
}
```

`fra1` (Frankfurt) is the EU Vercel edge region closest to Romania. R2 read latency from `fra1` is ~10-20 ms, which is the hot path on every dashboard load.

- [ ] **Step 3: Pin Hobby plan in the Vercel dashboard**

Project Settings → General → Plan → confirm "Hobby". If accidentally on Pro, downgrade (Hobby has zero cost, Pro is $20/mo).

- [ ] **Step 4: Add the inventory scratch file to `.gitignore`**

Edit `.gitignore`, append on a new line:

```
docs/superpowers/plans/2026-10-14-migration-inventory.md
```

- [ ] **Step 5: Commit**

```bash
git add vercel.json .gitignore
git commit -m "chore(vercel): add vercel.json with fra1 region for Hobby plan"
```

---

### Task 3: Configure environment variables on Vercel

**Files:**
- Modify: `.env.example` (add `CRON_SECRET` and update `APP_URL` comment).

**Interfaces:**
- Consumes: env var list from Task 1, Step 2.
- Produces: Vercel project env vars matching the Cloud Run set, plus `CRON_SECRET` for cron-job.org.

- [ ] **Step 1: Generate a new `CRON_SECRET`**

```bash
openssl rand -base64 32
```

Copy the output. This is a 32-byte random base64 string used as the bearer token in cron-job.org → Vercel calls.

- [ ] **Step 2: Set Vercel project env vars**

In the Vercel dashboard → Project → Settings → Environment Variables, add each variable from the inventory. For each one, set scope to **Production** (Hobby does not support per-branch env vars). Required vars:

| Name | Value |
|---|---|
| `PIPELINE_RUN_TOKEN` | (from inventory) |
| `BLIZZARD_CLIENT_ID` | (from inventory) |
| `BLIZZARD_CLIENT_SECRET` | (from inventory) |
| `BLIZZARD_REGION` | `eu` (or `us` — match the dominant user base) |
| `R2_ACCOUNT_ID` | (from inventory) |
| `R2_ACCESS_KEY_ID` | (from inventory) |
| `R2_SECRET_ACCESS_KEY` | (from inventory) |
| `R2_BUCKET_NAME` | `wow-forever-ah-cache` |
| `R2_PUBLIC_DOMAIN` | (from inventory) |
| `APP_URL` | `https://<the-vercel-project>.vercel.app` (do **not** use the Cloud Run URL — this var is used for self-referential links) |
| `CRON_SECRET` | (from Step 1) |
| `NODE_ENV` | `production` |

- [ ] **Step 3: Update `.env.example` to document the new vars**

Edit `.env.example`. Append after `R2_PUBLIC_DOMAIN=""`:

```bash
# CRON_SECRET: Bearer token cron-job.org sends when calling /api/pipeline/run.
# Must equal what is set in the Vercel project env vars. Generate with:
#   openssl rand -base64 32
CRON_SECRET=""
```

Also update the `APP_URL` comment at the top of `.env.example`:

```bash
# APP_URL: The URL where this applet is hosted.
# On Vercel Hobby, this is the auto-assigned https://<project>.vercel.app
# URL, or the custom domain once DNS is updated. Used for self-referential
# links, OAuth callbacks, and API endpoints.
APP_URL="MY_VERCEL_APP_URL"
```

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "docs(env): document CRON_SECRET and update APP_URL for Vercel"
```

---

### Task 4: First Vercel deployment — preview only, no DNS swap

**Files:**
- No source changes. Deploy via Vercel Git integration or CLI.

**Interfaces:**
- Consumes: Task 2 + Task 3 outputs (Vercel project + env vars).
- Produces: a live Vercel preview URL with the dashboard fully functional.

- [ ] **Step 1: Trigger the first deploy**

If Git integration is connected in Task 2, push the two commits from Tasks 2 and 3 to `main`. Vercel auto-builds. Wait for the deploy to finish.

CLI path:

```bash
vercel deploy --prod
```

- [ ] **Step 2: Verify the build succeeded**

Open the Vercel dashboard → Deployments. Confirm the build log ends with the standard Next.js success markers: `Compiled successfully` and `Build completed`. If it fails, read the error and fix before continuing — most likely culprits are the `images.remotePatterns` block in `next.config.ts` (already correct) or env var typos.

- [ ] **Step 3: Smoke-test the dashboard at the preview URL**

In a browser, load `https://<project>.vercel.app`. Confirm:
- Page renders the dashboard shell (header, layout).
- The realm picker is populated. (If empty, `/api/realms` is failing — check the Vercel function logs for that route.)
- No console errors in DevTools.

- [ ] **Step 4: Smoke-test `/api/realms`**

```bash
curl -sS https://<project>.vercel.app/api/realms?region=eu | jq '.realms | length'
```

Expected: a number greater than 0. (Returns the count of EU connected realms.) Zero means either the R2 credentials are wrong or `R2_PUBLIC_DOMAIN` is missing.

- [ ] **Step 5: Smoke-test cached blob delivery**

Pick any realm id from the previous response, then:

```bash
curl -sSI "https://<project>.vercel.app/api/data/cached/retail/eu/<realmId>/state.bin"
```

Expected: HTTP 200, `Content-Type: application/octet-stream`, `Cache-Control: public, max-age=300`. If 404, the cached blob for that realm has not been written yet — that is fine, will be fixed in Task 6.

- [ ] **Step 6: Approve the deploy as "preview, do not swap DNS yet"**

Do **not** change DNS yet. The Cloud Run URL continues to be the production URL until Task 7.

---

### Task 5: Verify `/api/pipeline/run` works from outside Vercel

**Files:**
- Read: `app/api/pipeline/run/route.ts`.

**Interfaces:**
- Consumes: `PIPELINE_RUN_TOKEN` (already in Vercel env vars from Task 3).
- Produces: a 200 response from a `curl` triggered against the Vercel deployment.

- [ ] **Step 1: Read the bearer-auth logic in `app/api/pipeline/run/route.ts`**

Confirm the route uses `requireBearer(req)` from `@/src/utils/apiGuard` and compares against `process.env.PIPELINE_RUN_TOKEN`. (Already verified during inventory.)

- [ ] **Step 2: Run the endpoint with a known realm id**

Pick a small realm (e.g. id=4401, a low-traffic realm where extraction finishes fast):

```bash
curl -X POST "https://<project>.vercel.app/api/pipeline/run" \
  -H "Authorization: Bearer $PIPELINE_RUN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"connectedRealmId": 4401}'
```

Expected: 200 with `{"success": true, "source": "blizzard", ...}`. The function may take 10-60 seconds to return because it fetches and aggregates the snapshot. Vercel Hobby's max function duration is 120 seconds; if extraction of a single realm exceeds that, the plan must switch to Pro ($20/mo) or chunk by item-id range — but typical single-realm extraction finishes well under 60 seconds.

- [ ] **Step 3: Verify the blob appears in R2**

```bash
curl -sSI "https://<project>.vercel.app/api/data/cached/retail/eu/4401/state.bin"
```

Expected: HTTP 200 after the previous step succeeded. If 404 still, the extraction may have written to a different key — check `R2Service.generateStateKey` and confirm `product` matches.

- [ ] **Step 4: Record the wall-clock extraction time**

Run the same `curl` two more times, observe the `total_time` reported by `curl`. Record the median. This is the upper bound for the cron schedule's per-realm timeout.

---

### Task 6: Configure cron-job.org to hit `/api/pipeline/run` on a 30-minute schedule

**Files:**
- No source changes. External service config only.

**Interfaces:**
- Consumes: `PIPELINE_RUN_TOKEN` (already in Vercel env vars from Task 3, also the same value as in Cloud Run from Task 1).
- Produces: a cron-job.org account with a scheduled job hitting every connected realm every 30 minutes.

- [ ] **Step 1: Create a cron-job.org account**

Go to https://cron-job.org/ and register. Free tier allows unlimited cron jobs.

- [ ] **Step 2: Decide whether to call the endpoint per-realm or per-region**

Two tradeoffs:
- Per-realm: one cron entry per realm, each calls `POST /api/pipeline/run` with `{connectedRealmId}`. Many entries, but each call is short.
- Per-region: one cron entry that iterates realms internally. Single entry, but the Vercel function must enumerate and call Blizzard for every realm itself — likely exceeds the 120s Hobby timeout once realm count is high.

Default to **per-realm** for Hobby. Each entry calls one realm. This keeps every invocation under 60 seconds.

- [ ] **Step 3: Generate the list of realm ids to schedule**

```bash
cat realm-ids.json | jq -r '.eu[]' > /tmp/eu-realm-ids.txt
cat realm-ids.json | jq -r '.us[]' > /tmp/us-realm-ids.txt
wc -l /tmp/eu-realm-ids.txt /tmp/us-realm-ids.txt
```

This is how many cron-job.org entries will be created. (Hobby's free egress is 100 GB/month; with state.bin ≈ 50-200 KB per realm and 30-minute cadence, monthly egress is well under 1 GB.)

- [ ] **Step 4: Create cron-job.org entries**

For each realm id in the two files, create a cron job with:
- **URL:** `https://<project>.vercel.app/api/pipeline/run`
- **Method:** POST
- **Body:** `{"connectedRealmId": <id>}`
- **Headers:** `Authorization: Bearer <PIPELINE_RUN_TOKEN>`, `Content-Type: application/json`
- **Schedule:** `*/30 * * * *` (every 30 minutes)
- **Title:** `extract-eu-<id>` or `extract-us-<id>`

Batch creation: cron-job.org supports importing a JSON array. See https://docs.cron-job.org/. A helper script in `scripts/seed-cron-jobs.ts` (new file) is the right shape for this if the user prefers automation.

- [ ] **Step 5: Verify a single scheduled job fires**

Wait for the next scheduled tick (≤30 minutes). In the cron-job.org dashboard → Executions, confirm the job ran with HTTP 200. In the Vercel dashboard → Logs, filter to `/api/pipeline/run` and confirm the request landed.

- [ ] **Step 6: Decide whether `CRON_SECRET` is needed**

`PIPELINE_RUN_TOKEN` already protects the route and is a strong secret. `CRON_SECRET` is only needed if a separate, weaker token should be used for cron-only access. **Recommendation: drop `CRON_SECRET`** unless the user wants to rotate `PIPELINE_RUN_TOKEN` independently. Revert the Task 3 changes to `.env.example` and skip the `CRON_SECRET` env var in that case.

---

### Task 7: Cut DNS over to Vercel

**Files:**
- Modify: DNS provider records for the production hostname (not in repo — out-of-band).

**Interfaces:**
- Consumes: Vercel project domain configuration.
- Produces: production hostname resolves to the Vercel deployment.

- [ ] **Step 1: Add the production domain to the Vercel project**

Vercel dashboard → Project → Settings → Domains → add the hostname (e.g. `wow-ah.example.com`). Vercel shows the required DNS records (typically a CNAME to `cname.vercel-dns.com` or an ALIAS/APEX setup).

- [ ] **Step 2: Update DNS at the registrar**

In the DNS provider for the hostname, replace any existing A/CNAME pointing at `*.run.app` with the Vercel value. If a subdomain is in use, a CNAME is enough. For apex domains, use ALIAS/ANAME or the Vercel IP `76.76.21.21` per https://vercel.com/docs/custom-domains.

- [ ] **Step 3: Wait for DNS propagation**

`dig +short wow-ah.example.com` should return the Vercel target. TTL controls propagation time — old Cloud Run records may take up to the old TTL (often 300-3600 seconds) to flush.

- [ ] **Step 4: Verify the dashboard on the production hostname**

Open the production hostname in a browser. Confirm the dashboard renders, the realm picker is populated, and one blob download succeeds. Confirm the URL bar matches your hostname, not `.vercel.app`.

- [ ] **Step 5: Verify `/api/pipeline/run` still works on the production hostname**

```bash
curl -X POST "https://wow-ah.example.com/api/pipeline/run" \
  -H "Authorization: Bearer $PIPELINE_RUN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"connectedRealmId": 4401}'
```

Expected: 200. This confirms the cutover is complete from the user's perspective.

---

### Task 8: Decommission Cloud Run

**Files:**
- Delete: `Dockerfile`, `.dockerignore`, `scripts/run-server.mjs`.

**Interfaces:**
- Consumes: confirmation that Task 7 succeeded and the production hostname has been live on Vercel for at least 24 hours with zero reported issues.
- Produces: zero Cloud Run services, the repo no longer carries the extraction container.

- [ ] **Step 1: Wait 24 hours after DNS cutover**

Do **not** delete the Cloud Run services immediately. Keep them warm for at least 24 hours so any DNS caching issue can be diagnosed against a still-running fallback.

- [ ] **Step 2: Delete the Cloud Run services**

```bash
gcloud run services delete <extraction-service-name> --region=europe-west1
gcloud run services delete <dashboard-service-name> --region=europe-west1
```

Confirm with `y` when prompted. (If only one service exists, run the matching delete only.)

- [ ] **Step 3: Delete the Cloud Scheduler jobs**

In the Google Cloud Console → Cloud Scheduler → delete every job that targets the deleted services. These will silently fail otherwise, but cleaning them up is hygiene.

- [ ] **Step 4: Delete the unused secrets in Google Secret Manager**

If `PIPELINE_RUN_TOKEN`, `BLIZZARD_CLIENT_ID`, etc. were stored as secrets and referenced from Cloud Run, they can now be removed. In Google Cloud Console → Secret Manager → delete each one that is no longer referenced. (Optional — leaving them costs nothing.)

- [ ] **Step 5: Delete `Dockerfile`, `.dockerignore`, and `scripts/run-server.mjs`**

```bash
git rm Dockerfile .dockerignore scripts/run-server.mjs
```

Also delete `scripts/run-server.mjs` references in `Dockerfile` (already going) and any CI workflow (none reference it).

- [ ] **Step 6: Run `npm run check` after the deletions**

```bash
npm run check
```

Expected: passes. (No source file imports from `run-server.mjs`.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: decommission Cloud Run extraction worker (replaced by /api/pipeline/run + cron-job.org)"
```

---

### Task 9: Update documentation

**Files:**
- Modify: `README.md`, `docs/de-rezolvat.md`.

**Interfaces:**
- Consumes: completed migration.
- Produces: docs that describe the new deploy model.

- [ ] **Step 1: Update `README.md` "Deploying" section**

Replace the current text (which mentions Cloud Run and AI Studio) with:

```markdown
## Deploying

The app runs anywhere Next.js 15 on Node >= 20.9 runs. Production deploy is on
**Vercel Hobby** (`fra1` region). Extraction is triggered by
[cron-job.org](https://cron-job.org/) hitting `POST /api/pipeline/run` every
30 minutes per connected realm. No Cloud Run, no egress bills.

Set the env vars documented in `.env.example`. The Cloudflare R2 credentials
are required for any non-toy deployment.
```

- [ ] **Step 2: Add a closing entry to `docs/de-rezolvat.md`**

Append at the bottom:

```markdown
## ✅ Resolved — 2026-10-14: Cloud Run → Vercel Hobby

Migrated off Google Cloud Run to Vercel Hobby (`fra1`) + cron-job.org.
Cloud Run services decommissioned (Task 8 of the migration plan). Extraction
runs via `POST /api/pipeline/run` triggered every 30 min per realm. Monthly
egress cost: $0 (was $0.12+ and growing).
```

- [ ] **Step 3: Commit**

```bash
git add README.md docs/de-rezolvat.md
git commit -m "docs: update deploy section for Vercel Hobby + cron-job.org"
```

---

## Self-Review

**1. Spec coverage check:**

| Requirement | Covered by |
|---|---|
| Move off Cloud Run | Tasks 4, 7, 8 |
| $0 / month target | Vercel Hobby (100 GB egress free) + cron-job.org (unlimited free triggers) |
| Preserve 30-minute extraction cadence | Task 6 |
| Keep secrets out of code | Task 3 (Vercel env vars, never committed) |
| Preserve `npm run check` as the gate | Task 8 Step 6, Task 9 Step 1 |
| Local dev (`npm run dev`) unaffected | No changes to `package.json` scripts or dependencies |

**2. Placeholder scan:** No "TBD", "TODO", or filler phrases. Every step is concrete. **PASS.**

**3. Type consistency:** `PIPELINE_RUN_TOKEN`, `CRON_SECRET`, `APP_URL`, `BLIZZARD_CLIENT_ID`, `BLIZZARD_CLIENT_SECRET`, `BLIZZARD_REGION`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_DOMAIN` appear identically across Task 1, Task 3, Task 5, Task 6, Task 8. `POST /api/pipeline/run` is the single extraction endpoint referenced in Task 5, Task 6, Task 7 — no renaming. **PASS.**

**4. Open decision flagged for user:** Task 6 Step 2 documents the per-realm vs per-region tradeoff; per-realm is the default but the user can override. Task 6 Step 6 flags the `CRON_SECRET` question.

**5. Open risk flagged:** Task 5 Step 4 captures single-realm extraction wall-clock time. If it exceeds 120 seconds, Hobby cannot host the endpoint and the plan must switch to Pro ($20/mo) or chunk-by-item. This is a real risk and is documented at the step where it becomes measurable.

**Plan complete and saved to `docs/superpowers/plans/2026-10-14-vercel-hobby-migration.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**