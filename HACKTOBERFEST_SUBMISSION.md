# DocuMind AI: Hacktoberfest 2026 submission notes

Challenge: DEV Community Open-Source AI Challenge, Week 2 (Side Hustle). Eligibility has not been checked or guaranteed; confirm the rules and the "brand-new project" requirement yourself.

## Title
DocuMind AI

## Short description
An AI-assisted document assistant for freelancers and small businesses. It reads invoices and receipts, suggests structured fields with an open-weight model, makes the user review and confirm them, and exports clean CSV records.

## The real problem
Expense paperwork arrives as PDFs, emails and phone photos. Retyping it is slow and error-prone, and fully automatic extraction is risky for money. The problem is saving time while keeping a human in charge of the numbers.

## Target customer
Freelancers, sole proprietors and very small teams who track expenses in spreadsheets. (An assumption to validate, not a finding.)

## Why open-weight AI matters
The model is swappable through `AI_BASE_URL`/`AI_MODEL`, so a user or business can pick a hosted open-weight model, move providers, or later point at a self-hosted server without code changes. This could help with cost and data-handling choices. In the current implementation, hosted inference still sends document text to a third party; self-hosting has not been tested.

## Architecture and data flow
Upload -> validation (extension, size, magic bytes) -> storage -> PDF text or OCR -> optional AI call -> server-side validation -> `review_required` -> user edits/confirms -> totals and CSV. See README for the diagram and file layout.

## Why it works as a side hustle
Candidate ideas, none validated: a done-for-you "paperwork cleanup" service for a handful of local freelancers using the tool, or a small hosted subscription. These depend on adding authentication and persistent hosting first.

## Implemented features
Nine-screen workspace (Overview, Documents, AI Extraction, Review Queue, Expenses, Reports, Templates, Settings, Help & Support) with a three-pane document workspace; upload with validation, progress and double-submit protection; PDF text and OCR extraction; configurable OpenAI-compatible AI extraction with optional DB-persisted templates; server-side field validation; per-field provenance (AI / template / you); review, edit, confirm and reject with confirmation dialogs; separate processing and verification status; search, filters, sorting and pagination; dashboard, expense and report figures computed from confirmed records per currency; CSV export with formula-injection protection; clear states when AI or OCR is unavailable.

## Planned, not implemented
Authentication/multi-user, background processing, Postgres, currency conversion, line items, duplicate detection, bulk upload, PDF reports, accuracy benchmarking, deployment.

## Actual testing results
Commands run in the development environment (Linux, Python 3.12, Node 22, Tesseract installed):
- Backend: `pytest -q` in a fresh virtualenv from `requirements-dev.txt`: **105 passed**, 1 warning. Covers upload validation, image/PDF/OCR extraction, templates (CRUD, enforced in code, defaults labelled), review-queue reasons, reports and CSV, per-currency totals, numeric amount sorting, settings, secret non-disclosure, in-place migration of an older database file, malformed/`<think>`-wrapped model output, missing AI credentials, provider retries over real HTTP against a local stub server.
- Frontend: `tsc --noEmit` and `npm run build` succeeded. **20 jsdom UI tests passed** against a real Flask backend (AI endpoint = local stub), and **2 more passed** against a backend with no AI credentials.
- Real browser (headless Chromium, synthetic data): layout sweep of 13 screens at 1440, 1024, 768 and 390 px wide with 0 console errors, 0 failed requests, 0 horizontal overflow, unclipped dialogs, working drawer/Escape/focus; and a 23-check end-to-end flow (upload through the real file chooser, double-click guard, focus trap, edit/save, server-side rejection, confirm, totals change, CSV export, delete, template CRUD, settings persistence) that passed 23/23.
- Bugs found and fixed by these runs: stale form overwritten by a background refetch; toast covering the Confirm button; refetch of a just-deleted record; mobile overflow on Overview and AI Extraction; reasoning-model output rejected.
- `npm audit --omit=dev`: 0 vulnerabilities. Dev tooling advisories were not force-upgraded.
- **Not tested:** extraction against any real AI provider or open-weight model (every AI endpoint in tests is a stub fixture); extraction accuracy; PDF preview rendering (headless Chromium has no PDF viewer); Safari/Firefox/real phones; automated accessibility audit; Windows setup steps; the Dockerfile; deployment.

## Known limitations
No authentication; synchronous processing; 2-decimal amounts; no currency conversion; issued invoices would be counted as expenses if confirmed; no accuracy measurements. See README.

## Potential business model
Free self-hosted open-source core; paid hosted plan or setup service for non-technical users. Unvalidated.

## Questions to ask a first potential user
1. Walk me through the last time you did your expense paperwork. What took longest?
2. Where do your invoices and receipts live today?
3. Which fields do you actually need out of them?
4. What would make you distrust an automatic extraction?
5. Would you upload real documents to a hosted service? What would you need to see first?
6. What do you do with the data afterwards (accountant, tax filing, spreadsheet)?
7. What would you pay for this to be reliable, if anything?

## Suggested DEV article outline
1. The problem: expense paperwork as a recurring tax-season chore
2. Design principle: facts vs interpretations, human confirms
3. Pipeline: PDF text, OCR fallback, model call
4. Treating model output and document text as untrusted (validation, prompt-injection delimiters, CSV injection)
5. Making AI optional and failure states honest
6. Testing without a paid API key (fake provider)
7. What I did not verify, and what comes next
8. Reused libraries and how this is a new project
