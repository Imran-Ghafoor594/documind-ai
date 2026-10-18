import { useState } from "react";
import { Save } from "lucide-react";
import { ApiError, type Prefs } from "../api";
import { Badge } from "../components/Badges";
import { Field } from "../components/Form";
import { Card, PageContainer, PageHeader } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useWorkspace } from "../context";
import { formatDate } from "../lib/format";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b border-ink-100 py-2.5 text-sm last:border-0"><dt className="text-ink-600">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{children}</dd></div>;
}

export default function Settings() {
  const { prefs, system, savePrefs } = useWorkspace();
  const toast = useToast();
  const [currency, setCurrency] = useState(prefs.default_currency);
  const [dateFormat, setDateFormat] = useState<Prefs["date_format"]>(prefs.date_format);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const dirty = currency !== prefs.default_currency || dateFormat !== prefs.date_format;
  const sample = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const preview = (f: Prefs["date_format"]) => {
    const [y, m, d] = sample.split("-");
    return f === "iso" ? sample : f === "dmy" ? `${d}/${m}/${y}` : f === "mdy" ? `${m}/${d}/${y}` : formatDate(sample);
  };

  async function save() {
    setBusy(true); setErrors({});
    try { await savePrefs({ default_currency: currency, date_format: dateFormat }); toast.success("Preferences saved."); }
    catch (e) { if (e instanceof ApiError && e.details) setErrors(e.details as Record<string, string>); toast.error((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <PageContainer>
      <PageHeader title="Settings" subtitle="Preferences are saved on the server. Processing and AI options are read-only here because they're set in the server's .env file." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="General" className="xl:col-span-2">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="Default currency" htmlFor="st-cur" error={errors.default_currency} hint="Pre-selects this currency in charts and filters and offers a one-click fill in the review form. Never applied automatically to a document.">
              <input id="st-cur" className="input uppercase" maxLength={3} placeholder="USD" value={currency} onChange={(e) => setCurrency(e.target.value)} aria-invalid={Boolean(errors.default_currency)} />
            </Field>
            <Field label="Date display" htmlFor="st-date" error={errors.date_format} hint={`Example: ${preview(dateFormat)}`}>
              <select id="st-date" className="input" value={dateFormat} onChange={(e) => setDateFormat(e.target.value as Prefs["date_format"])}>
                <option value="locale">Browser default</option><option value="iso">2026-10-31 (year-month-day)</option><option value="dmy">31/10/2026 (day/month/year)</option><option value="mdy">10/31/2026 (month/day/year)</option>
              </select>
            </Field>
          </div>
          <div className="mt-4"><button className="btn-primary" onClick={save} disabled={!dirty || busy}><Save className="h-4 w-4" aria-hidden /> {busy ? "Saving…" : "Save preferences"}</button></div>
        </Card>

        <Card title="Document processing">
          <dl>
            <Row k="Supported file types">{system.allowed_extensions.join(", ")}</Row>
            <Row k="Maximum upload size">{system.max_upload_mb} MB</Row>
            <Row k="PDF pages processed">First {system.max_pdf_pages}</Row>
            <Row k="OCR (Tesseract)">{system.ocr_available ? <Badge tone="green">Available · {system.ocr_languages}</Badge> : <Badge tone="amber">Not installed</Badge>}</Row>
          </dl>
          {!system.ocr_available && <p className="mt-2 text-xs text-ink-600">Without OCR, only PDFs that contain selectable text can be read. See Help &amp; Support to install Tesseract.</p>}
        </Card>

        <Card title="AI configuration">
          <dl>
            <Row k="Status">{system.ai_configured ? <Badge tone="green">Configured</Badge> : <Badge tone="amber">Not configured</Badge>}</Row>
            <Row k="Provider type">{system.ai_provider ?? "—"}</Row>
            <Row k="Model">{system.ai_model ?? "—"}</Row>
          </dl>
          <p className="mt-2 text-xs text-ink-600">API keys are never shown here and can't be edited from the browser. Set <code className="rounded bg-ink-100 px-1">AI_BASE_URL</code>, <code className="rounded bg-ink-100 px-1">AI_API_KEY</code> and <code className="rounded bg-ink-100 px-1">AI_MODEL</code> in the server's <code className="rounded bg-ink-100 px-1">.env</code> file and restart the backend.</p>
        </Card>

        <Card title="Privacy">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-700">
            <li>Uploaded files, extracted text and your records are stored on the server running DocuMind AI.</li>
            {system.ai_configured
              ? <li><strong>AI is configured: the text read from each document is sent to the AI provider you set up ({system.ai_provider}).</strong> This is not local-only processing. Check that provider's data policy before uploading sensitive documents.</li>
              : <li>AI isn't configured, so document text isn't sent to an AI provider. If you configure one later, extracted text will be sent to it.</li>}
            <li>There are no user accounts: anyone who can open this app can see every document.</li>
          </ul>
        </Card>

        <Card title="Data retention and deletion">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink-700">
            <li>Documents are kept until you delete them. There is no automatic expiry.</li>
            <li>Deleting a document removes its database record, extracted text and the stored file.</li>
            <li>Deleting a template doesn't change documents that used it.</li>
            <li>This app doesn't make backups. Back up the server's database and upload folder yourself.</li>
          </ul>
        </Card>
      </div>
    </PageContainer>
  );
}
