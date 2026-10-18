import type { ReactNode } from "react";
import { Badge } from "../components/Badges";
import { Card, PageContainer, PageHeader } from "../components/Layout";
import { useWorkspace } from "../context";

function Topic({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group border-b border-ink-200 last:border-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold hover:bg-ink-50 [&::-webkit-details-marker]:hidden">
        {title}<span aria-hidden className="text-ink-500 transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-ink-700">{children}</div>
    </details>
  );
}
const Code = ({ children }: { children: ReactNode }) => <code className="rounded bg-ink-100 px-1 py-0.5 text-xs">{children}</code>;

export default function Help() {
  const { system } = useWorkspace();
  return (
    <PageContainer>
      <PageHeader title="Help & Support" subtitle="How DocuMind AI behaves, and what to check when something goes wrong." />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm"><span className="text-ink-600">This server:</span>
        {system.ai_configured ? <Badge tone="green">AI configured</Badge> : <Badge tone="amber">AI not configured</Badge>}
        {system.ocr_available ? <Badge tone="green">OCR available</Badge> : <Badge tone="amber">OCR not installed</Badge>}</div>
      <Card pad={false} className="max-w-4xl">
        <Topic title="Uploading documents" open>
          <p>Use <strong>Upload</strong> in the top bar. You can drop a file or browse for it. Accepted: {system.allowed_extensions.join(", ")}, up to {system.max_upload_mb} MB. For PDFs, the first {system.max_pdf_pages} pages are read.</p>
          <p>Optionally choose a <a className="font-medium text-brand-700 underline" href="#/templates">template</a>. When processing finishes you land on the Review screen for that document. Files that fail are kept so you can retry or delete them.</p>
        </Topic>
        <Topic title="How extraction works">
          <ol className="list-decimal space-y-1 pl-5">
            <li><strong>Reading text.</strong> If a PDF has selectable text, that text is used. If not (a scan), or for images, OCR with Tesseract reads the pixels.</li>
            <li><strong>AI interpretation.</strong> If AI is configured, the text (up to the first 12,000 characters) is sent to the model, which suggests the fields. If not, you fill the fields in yourself.</li>
            <li><strong>Validation.</strong> The server checks every value: dates must be real, currency a 3-letter code, amounts non-negative. Invalid values are cleared and flagged, not guessed.</li>
            <li><strong>Your confirmation.</strong> Nothing counts toward totals until you confirm it.</li>
          </ol>
          <p>The <a className="font-medium text-brand-700 underline" href="#/extraction">AI Extraction</a> page keeps the raw text, what the AI suggested, and your current values side by side. No confidence score is shown because the model doesn't supply a calibrated one.</p>
        </Topic>
        <Topic title="Reviewing and confirming values">
          <p>The <a className="font-medium text-brand-700 underline" href="#/review">Review Queue</a> lists documents that failed, are missing required fields (type, vendor, currency, total, category), have no AI result, have warnings, or simply await your confirmation. Compare each field with the original, correct it, then choose <strong>Confirm and save</strong>.</p>
          <p>Editing a confirmed record reopens it for review and removes it from totals until you confirm again. “Reject and delete” permanently removes a document.</p>
        </Topic>
        <Topic title="Exporting expenses and reports">
          <p><strong>Expenses → Export CSV</strong> downloads confirmed records matching your current filters. <strong>Reports</strong> offers CSV for the monthly, category and vendor tables. Values that could be read as spreadsheet formulas are prefixed with an apostrophe for safety. Reports are CSV only; there's no PDF export.</p>
          <p>Totals are per currency. Different currencies are never added together.</p>
        </Topic>
        <Topic title="Common OCR problems">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>“OCR is not available”</strong>: install Tesseract on the server. On Windows use the UB Mannheim installer, then add it to PATH or set <Code>TESSERACT_CMD</Code> in <Code>.env</Code>. Restart the backend.</li>
            <li><strong>“No readable text was found”</strong>: the image may be blurry, rotated, very small or low-contrast. Re-scan at a higher resolution.</li>
            <li><strong>Password-protected PDF</strong>: remove the password and upload again.</li>
            <li><strong>Wrong characters</strong>: other languages need the matching Tesseract language data; set <Code>OCR_LANGUAGES</Code> (for example <Code>eng+deu</Code>).</li>
            <li><strong>Slow processing</strong>: scanned multi-page PDFs take longer because each page is run through OCR.</li>
          </ul>
        </Topic>
        <Topic title="AI provider troubleshooting">
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>“AI extraction is not configured”</strong>: set <Code>AI_BASE_URL</Code>, <Code>AI_API_KEY</Code> and <Code>AI_MODEL</Code> in the server's <Code>.env</Code> and restart. Then use “Run extraction again” on the AI Extraction page.</li>
            <li><strong>Provider rejected the API key</strong> (401/403): check the key and that it matches the provider in <Code>AI_BASE_URL</Code>.</li>
            <li><strong>Endpoint or model not found</strong> (404): check the base URL (usually ends in <Code>/v1</Code>) and the exact model id.</li>
            <li><strong>Request rejected (400)</strong>: some providers don't support JSON mode. Set <Code>AI_JSON_MODE=false</Code>.</li>
            <li><strong>Rate limit or timeout</strong>: the app retries a few times, then keeps the document for manual entry. Try again later or raise <Code>AI_TIMEOUT_SECONDS</Code>.</li>
            <li><strong>“Unusable output”</strong>: the model didn't return the requested JSON. Try a different or larger model.</li>
          </ul>
        </Topic>
        <Topic title="Privacy limitations">
          <ul className="list-disc space-y-1 pl-5">
            <li>Files and extracted text are stored on the server. {system.ai_configured ? "With AI configured, extracted text is also sent to your AI provider, so this is not local-only." : "If you configure a hosted AI provider, extracted text will be sent to it."}</li>
            <li>There are no user accounts or access control. Don't expose this app publicly with real documents.</li>
            <li>No encryption-at-rest, compliance or certification claims are made.</li>
          </ul>
        </Topic>
      </Card>
    </PageContainer>
  );
}
