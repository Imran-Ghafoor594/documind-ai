# Validation record — 18 October 2026

## Executed in the preparation environment

- Backend pytest: **110 passed, 1 skipped**, 9.43 seconds. The skipped test requires `TEST_DATABASE_URL` for real PostgreSQL. One expected Pillow decompression-bomb warning comes from an oversized-image rejection test.
- React TypeScript check and Vite production build: **passed**. Existing bundle size warning (>500 kB) remains; no UI refactor was made.
- React integration tests against the real Flask QA server with simulated AI: **20 passed**.
- Separate no-AI React tests: **2 passed** (manual review remains honest when credentials are absent).
- New deployment tests include real Tesseract on image-only PDF and PNG, native PDF extraction, mocked Groq HTTP request shape, production SQLite rejection, PostgreSQL URL normalization, permitted/rejected CORS, processing capacity rejection, editing/confirmation and database/file survival after app restart.
- All original React source, component, styling and package files are byte-identical to the upload. Frontend `.env.example` was updated for a hosted API.
- Linux/Python 3.12 dependency versions from this run are recorded in `backend/constraints.txt`. `requirements.txt` applies those constraints. Frontend continues using its existing `package-lock.json`.

- The live-smoke script was exercised against a local HTTP server with real OCR and a simulated AI provider: passed. This does **not** count as a live Groq/Render test.

## Not executed / cannot be claimed

- **No Render deployment**: Render installation was confirmed, but deployment operations were unavailable in this session. No service URL, paid service or hosted database was created.
- **No real Groq request**: no API key supplied. AI in automated tests uses fake responses/local HTTP stubs; this verifies integration handling, not model accuracy or credentials.
- **No Docker image build**: Docker is unavailable in this environment. Apt installation is explicit in the Dockerfile, but the final image must be built and checked on Render.
- **No real PostgreSQL execution**: a database service was unavailable; installing one was blocked by execution-environment permissions. The driver is installed and SQLAlchemy setup no longer passes SQLite-only arguments to PostgreSQL. The optional PostgreSQL integration test remains a required release check.
- No live browser acceptance test, hosted disk restart test, backup restore drill, production memory benchmark or load/security test.

## Required release checks

1. Build Docker on Render; verify Tesseract version/languages and `/api/health`.
2. On an isolated test database, set `TEST_DATABASE_URL` and run `pytest -q tests/test_deployment.py::test_postgres_workflow` from `backend/` with dev requirements installed. The test creates and deletes only its own records.
3. Run `scripts/live_smoke.py` against actual Render with actual Groq. Follow the guide for restart verification and manual browser review.
4. Validate the Blueprint with Render before provisioning; local configuration inspection is not hosted validation.
5. Protect all document endpoints with real access control before processing private data. The app remains a shared, unauthenticated workspace.
6. Measure OCR peak memory and latency with realistic scans, then choose hosting capacity and budget.

## Changed scope

Added Render Blueprint, server Docker configuration, dependency constraints and PostgreSQL driver, production environment validation, Groq configuration/default model, OCR runtime limits/language checks, single-document processing guard, deployment regression tests, synthetic acceptance fixtures and live smoke script. PyMuPDF extraction, React frontend, Flask route contract and the human review flow are retained. An RGB PDF-rendering argument fixes non-RGB scan rendering without changing the UI.
