# DocuMind AI: online deployment

Prepared 18 October 2026. Preserve the React UI and Flask app. Tesseract runs **on Render**, installed by `backend/Dockerfile`; you do not need Tesseract or EasyOCR on your laptop. Native PDF extraction stays on PyMuPDF. Groq receives extracted text, not the source PDF/image.

## Status and launch blockers

This is a deployment-prepared application, **not a production-certified or live-verified deployment**. See `VALIDATION.md` for actual test results. Render was installed during preparation, but its deployment operations were not exposed to this session. No Groq secret, repository URL or live URLs were supplied. No paid services have been created.

The original app has **no authentication, authorization, tenant isolation, or per-user rate limits**. Anyone who can reach the API can list/read/edit/delete documents, retrieve original uploads and consume AI quota. CORS is a browser rule, not access control. Until an authenticated access layer protects BOTH the frontend and backend (including direct backend access), use synthetic public demo data only. A production login/access-control feature is outside this deployment-only change. Do not put a shared secret in `VITE_*` as a substitute. Groq privacy/retention settings and your handling of personal documents also need review before real use.

## Architecture and cost

| Component | Selected deployment | Expected baseline USD/month |
|---|---|---:|
| React | Render Static Site, built with Vite | $0 within included usage |
| Flask + Tesseract | Render Docker web service, `1c-2g` (1 CPU / 2 GB) | $25 |
| Database | Render Postgres `0.1c-256mb`, explicitly 1 GB storage | $6 compute; confirm storage charge in checkout |
| Uploads | 1 GB persistent disk mounted at `/var/data` | $0.25 |
| Groq | `openai/gpt-oss-20b` | $0.075 / million input tokens, $0.30 / million output tokens |

Plan for **about $31.25/month plus any database storage charge, Groq usage, taxes, bandwidth/build overages, workspace upgrades and optional domain**. Pricing currently lists 1 GB Postgres storage included and expansion at $0.30/GB; confirm the actual dashboard estimate before applying. Do not accept an automatically larger database disk by accident: the Blueprint explicitly sets `diskSizeGB: 1`. Illustrative AI cost: 1,000 documents at 3,000 input + 800 billed output tokens each is about $0.465, excluding retries and additional reasoning tokens. Actual bills depend on token usage. Open weights do not mean hosted inference is unlimited/free. Groq free account quotas, model access and production capacity must be verified in your console.

The $7 / 512 MB web service would reduce this baseline by $18, but is **not recommended or memory-validated for OCR**. The 2 GB plan is a starting capacity estimate, not a load-test result. Large images and complex PDFs can still exhaust memory. Monitor peak RSS and latency using representative files before launch.

Render Free is unsuitable for this persistent deployment: free web services cannot attach disks, have ephemeral files, and sleep after inactivity; free Postgres expires after 30 days and lacks backups. Python wheels alone do not install Tesseract. Docker installs its binary and English language data explicitly.

Sources checked during preparation:
- https://render.com/pricing
- https://render.com/docs/free
- https://render.com/docs/disks
- https://render.com/docs/blueprint-spec
- https://render.com/docs/compute-plans
- https://console.groq.com/docs/models
- https://console.groq.com/docs/model/openai/gpt-oss-20b

## Deploy from GitHub (no local OCR)

1. Extract the ZIP. Put its contents at your repository root: `render.yaml`, `frontend/`, `backend/`, `docs/`, `scripts/`, `tests/`. Commit the provided source and lock files, never `.env`, API keys, databases, uploads, `node_modules/` or generated `dist/`.
2. In Groq Console create an API key and check that `openai/gpt-oss-20b` is enabled for your account. It is a supported production open-weight model with JSON-object mode. The app defaults to that model and requests low reasoning effort with a 4,096 completion-token budget. Model ID and limits remain configurable.
3. In Render select **New → Blueprint**, connect the repository and select `render.yaml`. Review the paid resources before applying. Services and database use Singapore. Change BOTH database and backend region together if needed.
4. Supply the prompted backend `GROQ_API_KEY`, `CORS_ORIGINS` (frontend HTTPS origin), and frontend `VITE_API_BASE_URL` (backend HTTPS origin). Do not assume requested service names equal assigned URLs. If URLs are not available yet, enter `https://pending.invalid` for the two URL values, provision, then replace them with the actual dashboard URLs before testing.
5. Backend Docker build installs Tesseract and English data using apt, installs Python requirements, and starts Gunicorn on `$PORT`. Do not switch it to Render's native Python runtime or use `flask run`. The Blueprint connects `DATABASE_URL` to the managed database's internal connection string. External database access is disabled by `ipAllowList: []`.
6. Verify the backend Disk tab shows a mounted disk at `/var/data`, and `UPLOAD_DIR=/var/data/uploads`. Only that mount persists; directories elsewhere are ephemeral. The app checks for an absolute upload directory but cannot prove Render has attached the disk: verify the dashboard and restart test.
7. Copy the actual backend URL into the frontend environment as `VITE_API_BASE_URL=https://actual-api.onrender.com` (no trailing slash and **no `/api` suffix**). Trigger a frontend rebuild: Vite variables are embedded at build time.
8. Set backend `CORS_ORIGINS=https://actual-web.onrender.com` (origin only, no paths/trailing slash). Redeploy backend. Multiple approved origins are comma-separated; add a custom frontend domain explicitly when used. Never use `*`.
9. Open `/api/health` on the backend. Expect `database: ok`, `ocr_available: true`, `ai_configured: true`. `ai_configured` means settings exist, not that the secret/model works: upload tests must prove that.
10. Run the acceptance checks below with fictional data. Check Render build/runtime logs without posting credentials or document contents.

The frontend is a separate static site. It contains no Python, OCR binaries or Groq key. Its build command is `cd frontend && npm ci --no-audit --no-fund && npm run build`; publish directory is `frontend/dist`. A rewrite to `/index.html` is included. No React source/components/styles were changed.

### Manual setup if not using Blueprint

Create paid Postgres in Singapore, select 256 MB compute and 1 GB storage. Create a Docker web service from the same repo: leave root directory blank; Dockerfile `backend/Dockerfile`, Docker context `backend`, health path `/api/health`, plan 2 GB, disk `/var/data` (1 GB). Copy the database internal URL into backend `DATABASE_URL`. Set all backend variables below. Create a Static Site with the build/publish settings above and `NODE_VERSION=22`. Set its API origin and backend CORS as above. Do not run schema initialization during Docker build: DB/disk are runtime resources.

## Environment variables

| Variable | Where | Value / purpose |
|---|---|---|
| `APP_ENV` | Backend | `production`; rejects SQLite and incomplete production configuration |
| `DATABASE_URL` | Backend secret | Blueprint internal PostgreSQL connection string; `postgres://` and `postgresql://` normalize to psycopg v3 |
| `UPLOAD_DIR` | Backend | `/var/data/uploads`; must be on attached disk |
| `GROQ_API_KEY` | Backend secret | Set only in Render environment; never frontend, Git or screenshots |
| `AI_API_KEY` | Backend secret, optional | Legacy fallback only when `GROQ_API_KEY` is absent; prefer one key |
| `AI_PROVIDER` | Backend | `groq` (existing `openai_compatible` also supported) |
| `AI_BASE_URL` | Backend | `https://api.groq.com/openai/v1` |
| `AI_MODEL` | Backend | `openai/gpt-oss-20b`; verify supported model before changing |
| `AI_JSON_MODE` | Backend | `true` |
| `AI_MAX_COMPLETION_TOKENS` | Backend | `4096`; reasoning and final response share provider limits |
| `AI_MAX_TEXT_CHARS` | Backend | `12000`; longer text is truncated with an existing UI warning |
| `AI_TIMEOUT_SECONDS` | Backend | `30` per attempt |
| `AI_MAX_RETRIES` | Backend | `1` (two attempts maximum) |
| `CORS_ORIGINS` | Backend | Exact comma-separated HTTPS frontend origins |
| `MAX_UPLOAD_MB` | Backend | `10` |
| `MAX_PDF_PAGES` | Backend | `5`; extra pages are not processed, with warning; not a full long-PDF workflow |
| `OCR_LANGUAGES` | Backend | `eng` (installed in Docker image) |
| `OCR_DPI` | Backend | `150`; balance OCR quality and memory |
| `OCR_TIMEOUT_SECONDS` | Backend | `20` per OCR page/image |
| `PORT` | Backend | Supplied by Render; Gunicorn binds `0.0.0.0` |
| `VITE_API_BASE_URL` | Frontend build only | Actual backend origin; public, not a secret |
| `NODE_VERSION` | Frontend build | `22` |

For Urdu OCR, add `tesseract-ocr-urd` to the Docker apt packages, set `OCR_LANGUAGES=eng+urd`, and rebuild. Changing only the variable is insufficient. Production startup verifies installed language data. OCR accuracy still depends on scan quality; human review remains required.

## Acceptance tests against the live service

A cloud terminal or CI runner can execute the following; only Python + requests are needed, **not Tesseract on your laptop**. Fixtures are included in `tests/fixtures`. These create synthetic records and call real Groq, so they consume a small amount of usage.

```bash
python -m pip install requests
python scripts/live_smoke.py --api https://ACTUAL-API.onrender.com --origin https://ACTUAL-WEB.onrender.com --keep
```

This verifies native PDF extraction, scanned PDF OCR, PNG OCR, successful AI fields, expected currency/total, edit, confirm, original file bytes, CSV, allowed/disallowed CORS and upload preflight. An AI failure fails the test even if manual review would still work. It keeps only its three fictional test records and writes `smoke-results.json`. Record the result; never report a script that hasn't run as a passed live test.

Redeploy/restart the backend and repeat:

```bash
python scripts/live_smoke.py --api https://ACTUAL-API.onrender.com --origin https://ACTUAL-WEB.onrender.com --verify smoke-results.json
```

Both DB records and original files must survive. Delete the retained test records through the UI afterward. Omit `--keep` for a run that cleans up its own records, even after failures. It never wipes unrelated documents. Preserve the manifest if cleanup or verification fails.

Then perform the browser workflow on the deployed frontend:
1. Upload each fixture through the existing upload dialog. Check completion and preview; no CORS or mixed-content errors in DevTools.
2. Check extraction method and AI success. Compare vendor, PKR currency, total 4500, and date with the fixture, not just the success badge.
3. Edit vendor, save, confirm, and verify the record leaves the review queue and appears in expenses/reports. Export CSV and inspect the correction.
4. Refresh and open the same document in another browser session. Verify persistence again after a backend redeploy.
5. Upload a malformed file and >10 MB file: expect clear errors. Try two simultaneous uploads: the second receives a retryable 503 instead of starting another OCR process.
6. On a separate staging service test an invalid Groq key, timeout/429, and missing OCR language: there must be no fabricated AI result. Restore valid settings afterward.
7. Capture actual response times and peak memory for representative documents. Do not approve production capacity based only on small fixtures.

## Operational limits and data safety

- **Single instance, one Gunicorn worker:** startup recovery and the processing semaphore are process-local. Four threads let health checks run while one document is processed. Do not raise worker count without redesigning job coordination. A busy upload/reprocess is rejected before reading/storing it.
- Processing remains synchronous to preserve the existing API/UI. Five OCR pages at 20 seconds plus AI retries can approach 162 seconds, excluding rendering/network overhead. Gunicorn's gthread timeout is not a total request deadline. For larger documents or sustained concurrency, a durable task queue and asynchronous UI contract are needed; not implemented here.
- The original extractor decides PDF OCR fallback based on total native text. Mixed native/scanned PDFs can omit scanned-page text if enough selectable text exists elsewhere. Use fully scanned fixtures for the acceptance test and treat mixed PDFs as a known limitation requiring review.
- Render disk is attached to one instance only. It prevents horizontal scaling and zero-downtime deployments. Expect brief downtime on deploys; interrupted processing is marked failed and can be reprocessed from the review UI.
- Database tables are initialized at runtime; the existing additive legacy-column setup is retained. This is not a versioned migration framework. Future schema changes need reviewed migrations and backups. An existing laptop SQLite database is **not automatically migrated**. This deployment creates a fresh PostgreSQL database. If existing records matter, stop and plan an explicit export/import with original files and preserved IDs before switching.
- Keep a coordinated backup of PostgreSQL AND `/var/data/uploads`; a DB-only restore cannot reconstruct PDFs. Render has paid database recovery facilities and daily disk snapshots, but recovery windows and plan entitlements must be checked. Test restores to a separate environment, including document preview and confirmation state. Do not treat disk snapshots as a substitute for database backups.
- Monitor DB and disk space, 5xx rate, OCR failures, latency, memory, and Groq usage. A 1 GB disk is intentionally small; delete unneeded documents using the app or expand the disk before it fills. Expansion cannot be reversed by shrinking.
- Store rotated keys in Render and redeploy; never log request bodies or authorization headers. Financial extraction can be wrong even with valid JSON. Review and confirm against originals.

## Troubleshooting

| Symptom | Check |
|---|---|
| Backend fails startup | Real PostgreSQL URL, key, HTTPS CORS origin, absolute upload path, installed OCR languages |
| `ModuleNotFoundError: psycopg` | Deploy updated requirements/Docker image; old build cache must not hide changes |
| Tesseract unavailable | Select Docker runtime; inspect apt build step and language listing |
| UI cannot reach backend | Rebuild after changing `VITE_API_BASE_URL`; exclude `/api` suffix; exact CORS origin |
| AI auth/model error | Groq key, model permission/availability, base URL; health alone does not validate credentials |
| 503 `processing_busy` | Wait for current document; retry once completed |
| Missing files after restart | Disk mount absent or `UPLOAD_DIR` outside `/var/data`; restore backup |
| Out of memory / slow scans | Smaller files, fewer pages, lower DPI or larger plan; do not add OCR concurrency |
| Review required despite AI success | Expected: the original human confirmation workflow remains in place |
