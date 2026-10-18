# Real-browser checks (optional)

These drive headless Chromium against a **synthetic** dataset. They are not needed to run the app.

```bash
# 1. backend with fictional demo documents on :5056 (real PDF/OCR pipeline; AI endpoint is a local stub)
cd backend && python -m tests.visual_server
# 2. frontend built against it, served on :4173
cd frontend && VITE_API_BASE_URL=http://127.0.0.1:5056 npm run build && npx vite preview --port 4173 --strictPort
# 3. checks
cd frontend/e2e && npm install
npm run layout        # 13 routes x 4 widths: console errors, overflow, dialogs, drawer
npm run flow          # upload -> review -> confirm -> totals -> export -> delete -> templates -> settings
npm run screenshots   # regenerates docs/screenshots
```
Run `flow` against a freshly started `visual_server` (it edits and deletes data). Headless Chromium has no PDF viewer, so
PDF previews appear blank in these runs; image previews (the OCR'd PNG) render. Only Chromium is covered.
