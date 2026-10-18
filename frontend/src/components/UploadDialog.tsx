import { useRef, useState } from "react";
import { FileUp, FileText, RotateCcw } from "lucide-react";
import { api, ApiError } from "../api";
import { useWorkspace } from "../context";
import { fileSize } from "../lib/format";
import { navigate } from "../router";
import { Dialog } from "./Dialog";
import { Field } from "./Form";
import { Notice } from "./Feedback";
import { useToast } from "./Toast";

type Phase = "idle" | "uploading" | "processing";

export default function UploadDialog({ onClose }: { onClose: () => void }) {
  const { meta, system, templates, bump } = useWorkspace();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);   // blocks double submits even before React re-renders
  const busy = phase !== "idle";

  function pick(f: File | undefined) {
    setError(null);
    if (!f) return;
    if (!/\.(pdf|png|jpe?g)$/i.test(f.name)) return setError("Unsupported file type. Choose a PDF, JPG or PNG.");
    if (f.size > meta.max_upload_mb * 1024 * 1024) return setError(`That file is ${fileSize(f.size)}, over the ${meta.max_upload_mb} MB limit.`);
    if (f.size === 0) return setError("That file is empty.");
    setFile(f);
  }

  async function submit() {
    if (!file || inFlight.current) return;
    inFlight.current = true;
    setError(null); setPhase("uploading"); setProgress(0);
    try {
      const doc = await api.upload(file, templateId ? Number(templateId) : null, (p) => { setProgress(p); if (p >= 1) setPhase("processing"); });
      bump();
      if (doc.status === "failed") toast.error(`${doc.original_filename}: ${doc.processing_error ?? "processing failed"}`);
      else toast.success(`${doc.original_filename} uploaded. Check the extracted values.`);
      onClose();
      navigate(`/review/${doc.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Upload failed.");
      setPhase("idle");
    } finally { inFlight.current = false; }
  }

  return (
    <Dialog title="Upload a document" onClose={onClose} dismissible={!busy}
      description={`PDF, JPG or PNG, up to ${meta.max_upload_mb} MB.`}
      footer={<>
        <button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="btn-primary" onClick={submit} disabled={!file || busy}>
          {busy ? "Working…" : error && file ? <><RotateCcw className="h-4 w-4" aria-hidden /> Try again</> : "Upload and extract"}
        </button>
      </>}>
      <div onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); if (!busy) pick(e.dataTransfer.files[0]); }}
        className={`rounded-lg border-2 border-dashed p-6 text-center ${drag ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-ink-50"}`}>
        {file ? (
          <p className="flex items-center justify-center gap-2 text-sm"><FileText className="h-5 w-5 text-brand-700" aria-hidden /><strong className="break-all">{file.name}</strong><span className="text-ink-600">({fileSize(file.size)})</span></p>
        ) : (
          <><FileUp className="mx-auto h-7 w-7 text-ink-500" aria-hidden /><p className="mt-2 text-sm text-ink-700">Drag a file here, or browse</p></>
        )}
        <button type="button" className="btn-secondary mt-3" disabled={busy} onClick={() => input.current?.click()}>{file ? "Choose a different file" : "Browse files"}</button>
        <input ref={input} type="file" className="sr-only" aria-label="Choose a document file" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
      </div>

      {templates.length > 0 && (
        <div className="mt-4">
          <Field label="Extraction template (optional)" htmlFor="up-template" hint="Limits which fields the AI fills in and can set a default type or category.">
            <select id="up-template" className="input" value={templateId} onChange={(e) => setTemplateId(e.target.value)} disabled={busy}>
              <option value="">No template: extract all fields</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </Field>
        </div>
      )}

      {phase === "uploading" && (
        <div className="mt-4" aria-live="polite">
          <div className="h-2 overflow-hidden rounded-full bg-ink-200" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
            <div className="h-full bg-brand-600 transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p className="mt-1 text-xs text-ink-600">Uploading… {Math.round(progress * 100)}%</p>
        </div>
      )}
      {phase === "processing" && <p className="mt-4 text-sm text-ink-700" role="status">Reading the document{system.ai_configured ? " and extracting fields with AI" : ""}. Scanned files can take a minute…</p>}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}
      <p className="mt-4 text-xs text-ink-600">
        {system.ai_configured ? "Text read from your document is sent to the configured AI provider for extraction." : "AI extraction is not configured, so you will enter the fields yourself after upload."}
      </p>
    </Dialog>
  );
}
