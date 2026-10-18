import { useState } from "react";
import { ExternalLink, FileText, RefreshCw, ScanText } from "lucide-react";
import { api, ApiError } from "../api";
import { Badge } from "../components/Badges";
import { useConfirm } from "../components/Dialog";
import DocHeader from "../components/DocHeader";
import DocumentBrowser from "../components/DocumentBrowser";
import { EmptyState, ErrorState, Notice, Skeleton } from "../components/Feedback";
import FieldTable from "../components/FieldTable";
import { Field } from "../components/Form";
import { BackToList, Card, TwoPane } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useCrumb, useWorkspace } from "../context";
import { formatDateTime } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import type { Route } from "../router";

const AI_LABEL: Record<string, string> = {
  success: "AI extraction completed", not_configured: "AI not configured", failed: "AI request failed",
  invalid_output: "AI returned unusable output", skipped: "Skipped (no readable text)", pending: "Pending",
};

function ExtractionWorkspace({ id }: { id: number }) {
  const { bump, templates, system } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const doc = useAsync(() => api.get(id), [id]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useCrumb(doc.data?.original_filename);

  if (doc.loading && !doc.data) return <div className="p-4 sm:p-6"><BackToList to="/extraction" label="All documents" /><Skeleton className="h-8 w-64" /><Skeleton className="mt-4 h-80" /></div>;
  if (doc.error || !doc.data) return <div className="p-4 sm:p-6"><BackToList to="/extraction" label="All documents" /><ErrorState message={doc.error ?? "Document not found."} onRetry={doc.reload} /></div>;
  const d = doc.data;
  const chosen = templateId ?? (d.template_id ? String(d.template_id) : "");
  const used = templates.find((t) => t.id === d.template_id);
  const confirmed = d.verification_status === "confirmed";

  async function retry() {
    if (d.corrected_fields.length > 0) {
      const ok = await confirm({ title: "Run extraction again?", confirmLabel: "Run again", tone: "primary",
        message: "This replaces the current values, including the edits you made. The original document and its text are kept." });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const updated = await api.reprocess(d.id, chosen ? Number(chosen) : null);
      bump(); doc.reload();
      if (updated.ai_status === "success") toast.success("Extraction finished.");
      else toast.info(updated.ai_error ?? "Extraction finished without AI values.");
    } catch (e) { toast.error(e instanceof ApiError ? e.message : "Could not re-run extraction."); }
    finally { setBusy(false); }
  }

  return (
    <div className="p-4 sm:p-6">
      <BackToList to="/extraction" label="All documents" />
      <DocHeader doc={d} actions={<>
        <a className="btn-secondary" href={api.fileUrl(d.id)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /> View original</a>
        <a className="btn-primary" href={`#/review/${d.id}`}>{confirmed ? "View values" : "Review values"}</a>
      </>} />

      <div className="mb-4 space-y-2">
        {d.status === "failed" && <Notice tone="error"><strong>Processing failed.</strong> {d.processing_error}</Notice>}
        {d.ai_status === "not_configured" && <Notice tone="warn"><strong>AI extraction is not configured on this server.</strong> The text below was read from your document, but no fields were extracted by AI. Set <code>AI_BASE_URL</code>, <code>AI_API_KEY</code> and <code>AI_MODEL</code>, then run extraction again. See Help &amp; Support.</Notice>}
        {(d.ai_status === "failed" || d.ai_status === "invalid_output") && <Notice tone="warn">{d.ai_error}</Notice>}
        {d.warnings.length > 0 && <Notice tone="warn"><p className="font-semibold">Validation warnings</p><ul className="list-disc space-y-0.5 pl-4">{d.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
        {d.consistency_warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card title={<span className="flex items-center gap-2"><FileText className="h-4 w-4" aria-hidden /> Text read from the document</span>}
          actions={<Badge tone="gray">{d.extraction_method === "ocr" ? "OCR" : d.extraction_method === "pdf_text" ? "PDF text layer" : "No text"}</Badge>}>
          {d.extracted_text ? <pre tabIndex={0} aria-label="Extracted text" className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-ink-50 p-3 text-xs leading-relaxed text-ink-800">{d.extracted_text}</pre>
            : <p className="text-sm text-ink-600">No text could be read from this document.</p>}
          <p className="mt-2 text-xs text-ink-600">This is raw text, exactly as read. It is not interpreted or verified.</p>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card title={<span className="flex items-center gap-2"><ScanText className="h-4 w-4" aria-hidden /> AI-interpreted fields</span>} pad={false}
            actions={<Badge tone={d.ai_status === "success" ? "blue" : "gray"}>{AI_LABEL[d.ai_status]}</Badge>}>
            <div className="px-4 pt-3 text-xs text-ink-600">
              {d.ai_model ? <>Model: <strong className="text-ink-800">{d.ai_model}</strong>{system.ai_provider && <> via {system.ai_provider}</>}. </> : "No AI model produced values for this document. "}
              {used && <>Template: <strong className="text-ink-800">{used.name}</strong>. </>}
              No confidence score is shown because the model doesn't provide a calibrated one.
            </div>
            <div className="p-2"><FieldTable doc={d} /></div>
          </Card>

          <Card title="Status of this record">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-ink-600">Extraction</dt><dd>{d.status === "failed" ? "Failed" : "Done: text read"}</dd>
              <dt className="text-ink-600">Verification</dt><dd>{confirmed ? <>Confirmed {formatDateTime(d.confirmed_at)}</> : "Not confirmed yet. A person must review the values."}</dd>
              <dt className="text-ink-600">Edited by you</dt><dd>{d.corrected_fields.length ? d.corrected_fields.join(", ") : "No edits"}</dd>
            </dl>
          </Card>

          <Card title="Run extraction again">
            {confirmed ? <p className="text-sm text-ink-600">This record is confirmed. Open <a className="font-medium text-brand-700 underline" href={`#/review/${d.id}`}>Review</a> and edit a value to reopen it before re-running extraction.</p> : (
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1"><Field label="Template" htmlFor="ex-template">
                  <select id="ex-template" className="input" value={chosen} onChange={(e) => setTemplateId(e.target.value)} disabled={busy}>
                    <option value="">No template</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select></Field></div>
                <button className="btn-primary" onClick={retry} disabled={busy}><RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden /> {d.status === "failed" ? "Retry processing" : "Run extraction again"}</button>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Extraction({ route }: { route: Route }) {
  return (
    <TwoPane selected={route.id !== null} list={<DocumentBrowser title="AI Extraction" basePath="/extraction" selectedId={route.id} />}>
      {route.id === null ? <EmptyState icon={ScanText} title="Select a document">Pick a document to compare the text read from it with what the AI extracted.</EmptyState>
        : <ExtractionWorkspace key={route.id} id={route.id} />}
    </TwoPane>
  );
}
