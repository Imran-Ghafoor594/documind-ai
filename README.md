> **Hacktoberfest Free Demo:** Use [`docs/FREE_DEMO_DEPLOYMENT.md`](docs/FREE_DEMO_DEPLOYMENT.md) and [`render-free.yaml`](render-free.yaml) for a free-tier *temporary, shared-access* deployment. The original `render.yaml` provisions paid persistent infrastructure. Do **not** apply it for a free demo. Only upload synthetic sample documents; free-tier OCR needs testing on the real host.

> **Online deployment:** Start with [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
> The supplied Render configuration uses server-side Tesseract, PostgreSQL and a paid upload disk.
> No laptop OCR installation is required. Older local setup instructions below are optional.
> Deployment is prepared, not yet live-verified; see [docs/VALIDATION.md](docs/VALIDATION.md).

# DocuMind AI

> Turn messy documents into organized business insights.

DocuMind AI is a small full-stack app for freelancers and small businesses. Upload an invoice or receipt, let an open-weight language model suggest the structured fields, check them against the original, and export confirmed records. Nothing counts toward your totals until a person confirms it.

Built for the Hacktoberfest 2026 DEV Community Open-Source AI Challenge (Week 2: Side Hustle). See [HACKTOBERFEST_SUBMISSION.md](HACKTOBERFEST_SUBMISSION.md).

## Screenshots

All screenshots use fictional, synthetic documents from `backend/tests/visual_server.py`. (Headless Chromium has no PDF viewer, so these use an OCR'd image document for the preview.)

| | |
|---|---|
| ![Documents workspace](docs/screenshots/documents-workspace.png) | ![Review](docs/screenshots/review-queue.png) |
| ![Overview](docs/screenshots/overview.png) | ![AI extraction](docs/screenshots/ai-extraction.png) |
| ![Expenses](docs/screenshots/expenses.png) | ![Reports](docs/screenshots/reports.png) |

Mobile: `docs/screenshots/mobile-documents.png`, `docs/screenshots/mobile-review.png`.

## Problem and users

Small operators keep expenses in email attachments, phone photos and PDFs, then retype them into a spreadsheet at tax time. DocuMind AI targets freelancers, sole proprietors and very small teams who want less data entry but still want to stay in control of their numbers.

## What is in the app

Pages (sidebar): **Overview**, **Documents** (list, preview, details), **AI Extraction**, **Review Queue**, **Expenses**, **Reports**, **Templates**, **Settings**, **Help & Support**. Top bar: breadcrumbs, live global search, Upload.

- **Upload** PDF/JPG/PNG: drag and drop, size and type checks, magic-byte content check, progress, retry, double-submit protection, optional extraction template.
- **Text extraction**: native PDF text (PyMuPDF), OCR fallback (Tesseract) for scans and images.
- **AI extraction** via any OpenAI-compatible API (you choose the model). Server-side validation of every field.
- **Provenance**: each field shows whether it came from the **AI**, a **template** default, or **you**. The raw text, the AI's suggestion and the current value are shown side by side. No confidence scores are shown because the model doesn't provide calibrated ones.
- **Review Queue** with reasons (processing failed, missing required fields, no AI result, uncertain values, awaiting confirmation), edit, confirm, retry, reject (delete with confirmation). Processing status and verification status are separate.
- **Templates** (stored in the database): name, description, document type, fields to extract, default category. Applied at upload or when re-running extraction. The field restriction is enforced in code, not just in the prompt; defaults are labelled "Template", never "AI".
- **Expenses**: confirmed records only; search, date range, category, type, currency, sorting, pagination, detail dialog, CSV export of the current filters. Totals are per currency and never converted or mixed.
- **Reports**: monthly, category and vendor summaries and a processing summary, from stored records, with date range and per-section CSV export. No PDF export.
- **Settings**: default currency and date format (saved on the server), read-only processing/OCR/AI status, privacy and retention text. API keys are never shown and cannot be edited from the browser.
- **Accessibility basics**: semantic landmarks, skip link, labelled controls, visible focus, dialogs with focus trap and Escape, `aria-sort` on sortable headers, `aria-current` navigation, reduced-motion support.

Everything displayed comes from the database. If it is empty you get an empty state, not demo numbers.

## Architecture

```
React (Vite, Tailwind) --/api--> Flask --> SQLite (SQLAlchemy)
                                   |--> storage (uuid-named files, UPLOAD_DIR)
                                   |--> extraction: PyMuPDF -> Tesseract (OCR fallback)
                                   '--> ai: OpenAI-compatible HTTP API (optional)
```

Upload flow: validate file -> store -> extract text -> (if configured) call AI with the optional template -> validate/normalise -> `review_required` -> user edits and confirms -> counts toward totals. Processing runs inside the upload request (simple, but slow files block that request).

Backend: `backend/app/{config,db,models,validation,routes,routes_templates,routes_reports,errors}.py`, `services/{storage,ocr,extraction,ai,processing}.py`.
Frontend: `frontend/src/{api.ts,context.tsx,router.ts}`, `pages/` (nine screens), `components/` (Sidebar, TopBar, Dialog + confirm, Toast, Menu, Pagination, Badges, DocumentBrowser, DocumentPreview, FieldTable, ReviewForm, Charts, ...), `lib/`.
The existing SQLite file of an older version is upgraded in place on start (new columns are added automatically).

## How OCR works

1. PDF: read the text layer with PyMuPDF (first `MAX_PDF_PAGES` pages).
2. If fewer than 40 non-space characters are found, render the pages (200 DPI, pixel-capped) and run Tesseract.
3. Images go straight to Tesseract. Password-protected, damaged or oversized files fail with a clear message.
4. If Tesseract is missing the app still starts; scanned files fail with an explanation. `/api/health` reports `ocr_available`.

## How the AI model is used

The extracted text (first 12,000 characters) is sent to `POST {AI_BASE_URL}/chat/completions` with a system prompt asking for one JSON object, `null` when unsure, and treating the document as untrusted data. The reply is parsed (code fences and `<think>` blocks are tolerated) and every field is validated in code: real `YYYY-MM-DD` dates, 3-letter currency codes, non-negative decimals, categories from a fixed list. Invalid values become `null` with a warning. Timeouts, 429 and 5xx are retried a limited number of times (`AI_MAX_RETRIES`); auth errors are not. If AI is not configured or fails, the document is still saved for manual entry and says so; nothing is faked.

Which open-weight model to use is your choice. This project does not claim any particular model or provider works; check the model's licence and the provider's terms yourself.

## Configure the AI provider

Copy `.env.example` to `.env` and set:

| Variable | Meaning |
|---|---|
| `AI_PROVIDER` | `openai_compatible` (only provider implemented) |
| `AI_BASE_URL` | Provider's OpenAI-compatible base URL, e.g. ending in `/v1` |
| `AI_API_KEY` | Your key (never commit it; use any non-empty placeholder for a local server) |
| `AI_MODEL` | Model id as the provider names it |
| `AI_JSON_MODE` | `true`; set `false` if the provider rejects `response_format` |
| `AI_TIMEOUT_SECONDS`, `AI_MAX_RETRIES` | Request limits |

Other variables: `DATABASE_URL`, `UPLOAD_DIR`, `MAX_UPLOAD_MB`, `MAX_PDF_PAGES`, `OCR_LANGUAGES`, `TESSERACT_CMD`, `CORS_ORIGINS`, `PORT`. Frontend: `VITE_API_BASE_URL` (production only).

## Local setup (Windows)

Requirements: Python 3.11+, Node.js 18+, optionally Tesseract.

1. Install Tesseract (optional, for scans/images): the UB Mannheim Windows build, then add it to PATH or set `TESSERACT_CMD` in `.env`.
2. Backend (PowerShell):
   ```powershell
   cd backend
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements-dev.txt
   copy ..\.env.example ..\.env   # then edit AI_* values
   python run.py
   ```
   API: http://127.0.0.1:5000 (creates `backend/data/` on first start).
3. Frontend (second terminal):
   ```powershell
   cd frontend
   npm install
   npm run dev
   ```
   Open http://localhost:5173. Vite proxies `/api` to the backend.

The Windows steps have not been run on Windows; everything was developed and tested on Linux.

## Tests

Backend (105 tests; temporary database and upload folder; no API key needed):
```powershell
cd backend
pytest -q
```
OCR tests skip when Tesseract is absent. The AI provider's real HTTP path is tested against a **local stub server** (a fixture, not a model).

Frontend:
```powershell
cd frontend
npm run build                 # typecheck + production build
# UI tests render the real app in jsdom and call a real backend over HTTP:
#   terminal A:  cd backend; python -m tests.qa_server            (AI endpoint = local stub on :5055)
#   terminal B:  cd frontend; npm test
#   no-credentials screens:  restart A with QA_NO_AI=1, then: npx vitest run src/__tests__/noai.test.tsx
```
The UI tests wipe all documents and templates in the QA backend's temporary database; never point them at a real instance.

Real-browser checks (headless Chromium, synthetic data): see `frontend/e2e/README.md`.

## API

`GET /api/health` · `GET /api/meta` · `GET|PUT /api/settings` · `GET /api/dashboard` · `GET /api/expenses/summary` · `GET /api/documents` (`q, status, category, document_type, currency, verification, date_from, date_to, sort, order, page, per_page`) · `POST /api/documents/upload` (optional `template_id`) · `GET|PUT|DELETE /api/documents/<id>` · `POST /api/documents/<id>/confirm` (optional `{"fields":{}}`) · `POST /api/documents/<id>/reprocess` (optional `{"template_id":n|null}`) · `GET /api/documents/<id>/file[?download=1]` · `GET /api/review/queue` (`reason, q, page, per_page`) · `GET|POST /api/templates` · `PUT|DELETE /api/templates/<id>` · `GET /api/reports/summary` · `GET /api/reports/csv?section=monthly|categories|vendors` · `GET /api/export/csv`.
Responses are `{"data":...,"meta":...}` or `{"error":{"code","message","details"}}`.

## Deployment

Nothing here has been deployed. Constraints to plan for:

- **Persistence:** SQLite and uploads live on the server's disk. Many hosts give containers an ephemeral filesystem. On Render, for example, the docs say a persistent disk needs a paid service and only the disk mount path survives restarts. On an ephemeral plan, documents and the database vanish on restart. Mount a disk and point `DATABASE_URL` and `UPLOAD_DIR` into it, or use a host with volumes.
- **Single worker:** keep one app instance/worker (SQLite).
- **Tesseract:** needs a system package. `backend/Dockerfile` installs it; it is untested.
- **Frontend:** `npm run build`, host `frontend/dist` on any static host, set `VITE_API_BASE_URL` at build time.
- **CORS:** set `CORS_ORIGINS` to the exact frontend origin. `*` is ignored on purpose.
- **No authentication:** anyone who can reach the app can read every document. Do not expose a deployment with real documents without adding auth or a network restriction.
- **Timeouts:** AI and OCR requests can be slow; set a generous server timeout (the Dockerfile uses 180 s).

## Known limitations

- No user accounts or authentication, so there is no user menu; single-tenant. No notifications (there is no event data to base them on).
- Synchronous processing; large scans block a request. One file per upload.
- The review queue and report vendor lists are computed in Python over all records, fine for small data sets, not for thousands.
- Amounts are stored with 2 decimals; no currency conversion. Every confirmed invoice counts as an expense, so invoices you *issue* should not be confirmed.
- Templates restrict fields and set defaults; they can't define new custom fields.
- Reports export CSV only (no PDF).
- PDF preview uses the browser's built-in viewer (some mobile browsers show only the first page). This could not be visually verified in automated runs because headless Chromium has no PDF viewer; image previews were verified.
- Tested in Chromium only. Not tested in Safari or Firefox, or on real phones. No automated accessibility audit (axe/Lighthouse) was run; colours were chosen to keep white-on-coral text at 4.5:1 or better.
- The visual match to the reference screenshot is by eye, not measured. AI extraction accuracy has not been measured, and no real AI provider was tested (only a local stub).

## Privacy

Files and extracted text are stored on the server. When AI is configured, document text is sent to your chosen third-party AI provider, so this is not "local-only". No encryption at rest, compliance or certification is claimed. Uploaded files are only reachable via `GET /api/documents/<id>/file`, which has no authentication. Logs record document ids and statuses, not content. API keys are never returned by any endpoint (this is covered by a test). Use synthetic documents for demos.

## Reused code and libraries

Flask, Flask-CORS, SQLAlchemy, PyMuPDF, Pillow, pytesseract/Tesseract, requests, python-dotenv, React, Vite, Tailwind CSS, Recharts, Lucide. Testing: pytest, Vitest, Testing Library, jsdom, puppeteer-core with @sparticuz/chromium. The application code was written for this project. The UI layout follows a reference screenshot supplied by the project owner (coral sidebar, document list, preview pane); branding and content are original.

## Future improvements

Authentication and multi-user support, background job queue, Postgres, currency conversion, line items, duplicate detection, bulk upload, PDF reports, accuracy evaluation set.
