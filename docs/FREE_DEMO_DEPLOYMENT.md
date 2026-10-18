# DocuMind AI — $0-target Hacktoberfest demo deployment

This is a **temporary shared demo**, **not a production SaaS**, and is designed for synthetic sample documents only. The original `render.yaml` remains the paid, persistent production-oriented configuration; `render-free.yaml` is a separate free experiment. The author has **not** deployed this ZIP to Render or tested its performance on the actual free instance.

## 0. What is included and what can fail

- React/Vite static frontend — Render Static Site (free allocation).
- Flask REST API in Docker — Render **Free** Web Service (currently 512 MB RAM and limited CPU). OCR can run out of memory; no guarantees until a real scanned-PDF smoke test passes.
- `PyMuPDF` native PDF text + `pytesseract` and `tesseract-ocr-eng` installed **inside Docker** for scanned PDFs / PNG / JPEG. **Nothing needs to be installed on your Windows laptop for production OCR.**
- GroqCloud OpenAI-compatible endpoint. The configured model is `openai/gpt-oss-20b`; check Groq's active model list and JSON mode support when deploying. Free-tier requests are rate-limited. API credentials stay server-side.
- Ephemeral SQLite `/tmp/documind-demo/documind.db` + uploads `/tmp/documind-demo/uploads`. **All files and records may vanish on restart, redeploy or spin-down**. The free backend's filesystem is not persistent.
- Shared access-code gate. This is **NOT separate user accounts**: everyone with the same code sees the same documents. Access code must be kept private, and real/customer documents must never be uploaded. A valid session token lasts up to 8 hours, stored in the browser session. **Do not publish the code in the GitHub README.**
- Limits: 3 MB per upload; max 3 PDF pages; 100 DPI OCR, 8-million-pixel budget for demo raster processing, 1 active document extraction per backend process. Scanned pages may still exceed the free instance's memory.

**Costs:** `render-free.yaml` requests a **Free** web service and a **Free** static site and **creates no paid database or disk**. Render has usage/instance-hour limits and can charge for excess usage depending on account/billing settings. Groq has its own rate limits and potential billing settings. Review Render's price and create screen and never approve an unexpected paid selection.

## 1. Prepare a GitHub repository

1. Extract the ZIP. In VS Code open the extracted **root** containing `backend/`, `frontend/`, `render-free.yaml`.
2. Verify neither `.env` / customer invoices / `.db` / API credentials are staged (`git status`, `git ls-files`). `.gitignore` excludes these files.
3. Create a new GitHub repository and run (replace the URL):

```powershell
git init
git add .
git commit -m "Add free DocuMind AI demo deployment"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/documind-ai.git
git push -u origin main
```

If this is an existing Git repository, **do not reinitialize or add another origin**; just commit and push changes.

## 2. GroqCloud setup

1. Generate a new Groq API key from <https://console.groq.com/>.
2. Check the currently available model IDs in your account. The Blueprint defaults to `openai/gpt-oss-20b`. If not available, choose an active compatible model and set `AI_MODEL` on Render. Keep `AI_JSON_MODE=true` only if the selected model supports JSON output.
3. **Never paste the key into the frontend, `VITE_*` variables, a repository, or screenshots.**

## 3. Render Blueprint (select the free YAML)

1. Visit <https://dashboard.render.com/>; sign in with GitHub.
2. Choose **New → Blueprint** and connect your repository.
3. **CRITICAL:** choose the Blueprint file path **`render-free.yaml`**, **not** the existing paid `render.yaml`. The original is left untouched for future production planning.
4. Inspect the create/preview page carefully: it should show exactly **`documind-demo-api` (Web Service, Free)** and **`documind-demo-web` (Static Site)**, **no PostgreSQL database, no persistent disk**. If the UI does not allow selecting `render-free.yaml`, don't apply the paid default file. See fallback below.
5. Supply these variables when prompted:

   | Service | Variable | Value |
   |---|---|---|
   | API | `DEMO_ACCESS_CODE` | A *random, unique* code of **at least 16 characters**; share privately with judges only |
   | API | `GROQ_API_KEY` | Your secret Groq API key |
   | API | `CORS_ORIGINS` | Exact final frontend HTTPS origin, e.g. `https://documind-demo-web.onrender.com` |
   | Static site | `VITE_API_BASE_URL` | Exact final backend origin, e.g. `https://documind-demo-api.onrender.com` (no `/api` suffix) |

   The `DEMO_SIGNING_SECRET` is generated **automatically by Render**; do not share it. The specific Render `onrender.com` subdomains are **examples**; replace with real URLs assigned to your services. If actual URLs are unknown during Blueprint creation, enter the likely URLs initially and fix them after the services exist; then redeploy. `sync: false` variables can be edited in each service's **Environment** panel afterwards.

6. Click deploy **only if the dashboard shows Free services and no paid resource**.

**Fallback if Render can't pick a nondefault Blueprint:** Manually create a Free Docker Web Service with repo root, Dockerfile `./backend/Dockerfile`, Docker context `./backend`, health check `/api/health`; copy the API env vars from `render-free.yaml`. Create a Static Site with build command `cd frontend && npm ci --no-audit --no-fund && npm run build`, publish `frontend/dist`, the two frontend env vars, and rewrite `/*` → `/index.html`. Do not deploy the paid `render.yaml` as a workaround.

## 4. Correct cross-origin setup

Backend service environment:
- `CORS_ORIGINS`: exact **HTTPS** frontend origin, with no path and no trailing slash.
- `APP_ENV=demo`, `DEMO_ACCESS_CODE`, generated `DEMO_SIGNING_SECRET`, and `GROQ_API_KEY` must all be present.

Static site environment:
- `VITE_API_BASE_URL=https://YOUR-API.onrender.com` (not `/api`)
- `VITE_DEMO_MODE=true`

**After changing `VITE_*` vars, rebuild/redeploy the static site.** Vite bakes these values into the build. Changing backend `CORS_ORIGINS` needs a backend restart/redeploy. Never place the access code or API key in any `VITE_*` variable.

## 5. Smoke test after real deployment

1. `https://YOUR-API.onrender.com/api/health` should return JSON with `status: ok`, `ocr_available: true`, `ai_configured: true`. Health being OK does **not** prove document OCR or Groq calls work.
2. Open the frontend URL. You should see **Demo Access**. An incorrect access code should fail; your secret code should unlock the dashboard.
3. Without auth, visiting the backend `/api/documents` should return HTTP **401**.
4. Upload a **synthetic** 1-page selectable-text PDF under 3 MB; check extraction, AI status, review, confirm, Expenses and CSV.
5. Upload a **synthetic** 1-page scanned PDF and PNG/JPG; verify OCR text in Extraction, AI suggestions and final review. If Tesseract is OOM-killed (common risk on 512 MB), check Render logs and reduce DPI or use paid compute/external OCR; don't claim it works.
6. Preview and download documents. This demo uses **authenticated blob requests** because normal resource links cannot send bearer auth headers.
7. Refresh the frontend and verify the signed demo session still works in that tab. Also test the wrong origin is not CORS-whitelisted.
8. Restart/redeploy the free backend: expect all SQLite records and uploads to disappear. This is known and intentional for this ephemeral demo.

## 6. Constraints, failure diagnosis & challenge submission

| Problem | Check / Fix |
|---|---|
| Build fails | Render Docker build logs; Tesseract installation (server Dockerfile), pinned constraints package availability |
| Crash on startup | `DEMO_ACCESS_CODE` minimum 16, `DEMO_SIGNING_SECRET` min 32, `CORS_ORIGINS` HTTPS, Groq key configured |
| Browser shows network/CORS failure | Real backend URL in `VITE_API_BASE_URL`; matching frontend origin in backend `CORS_ORIGINS`; rebuild/redeploy |
| 401 on documents | Demo code not entered, session expired; refresh and unlock |
| OCR unavailable / 500 | `tesseract` binary/language data missing or free server RAM exhausted; inspect Render logs |
| AI fails / invalid JSON | Groq key, current model ID, free rate limits, JSON output format |
| Documents disappear | Expected: ephemeral storage; re-upload synthetic sample |
| First request slow | Free service can spin down when idle |

Publish your frontend live link, GitHub source link, screenshots and a short product/value proposition in the Hacktoberfest entry. Give judges the access code **privately** via permitted challenge communication; if private access details cannot be provided, consider a separate **read-only synthetic-data walkthrough** instead. Label the product clearly as a demo, not secure document storage.

**Original deployment guide:** `docs/DEPLOYMENT.md` describes the paid architecture and may not apply to the free demo. **Use this file for the free route.**

References: <https://render.com/docs/free>, <https://render.com/docs/blueprint-spec>, <https://render.com/docs/docker>, <https://render.com/docs/redirects-rewrites>.
