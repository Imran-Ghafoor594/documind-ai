import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, Save, ScanText, Trash2 } from "lucide-react";
import { api, ApiError, type Doc, type FieldName } from "../api";
import { useWorkspace } from "../context";
import { FIELD_LABEL, FIELD_ORDER, REQUIRED_FIELDS, TYPE_LABEL } from "../lib/labels";
import { SourceBadge } from "./Badges";
import { useConfirm } from "./Dialog";
import { Notice } from "./Feedback";
import { Field } from "./Form";
import { useToast } from "./Toast";

type Form = Record<FieldName, string>;
const toForm = (f: Doc["fields"]): Form => Object.fromEntries(FIELD_ORDER.map((k) => [k, f[k] ?? ""])) as Form;

interface Props { doc: Doc; onChange: (d: Doc) => void; onConfirmed: (d: Doc) => void; onDeleted: () => void }

/** Edit, save and confirm extracted values. Confirming is the only way a record counts toward totals. */
export default function ReviewForm({ doc, onChange, onConfirmed, onDeleted }: Props) {
  const { meta, prefs, bump } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<Form>(() => toForm(doc.fields));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const fieldsKey = JSON.stringify(doc.fields);
  useEffect(() => { setForm(toForm(doc.fields)); setErrors({}); }, [doc.id, fieldsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = doc.status === "review_required" || doc.status === "completed";
  const dirty = FIELD_ORDER.some((k) => form[k] !== (doc.fields[k] ?? ""));
  const set = (k: FieldName, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function run(action: () => Promise<Doc>, done: (d: Doc) => void, success: string) {
    setBusy(true); setErrors({});
    try {
      const updated = await action();
      bump(); done(updated); toast.success(success);
    } catch (e) {
      if (e instanceof ApiError) {
        const d = e.details as any;
        if (d?.missing) setErrors(Object.fromEntries((d.missing as string[]).map((m) => [m, "Required before you can confirm."])));
        else if (d) setErrors(d as Record<string, string>);
        toast.error(e.message);
      } else toast.error("Something went wrong.");
    } finally { setBusy(false); }
  }

  async function reject() {
    const ok = await confirm({ title: "Reject and delete this document?", confirmLabel: "Delete document",
      message: `“${doc.original_filename}” and its stored file will be permanently deleted. This can't be undone.` });
    if (!ok) return;
    setBusy(true);
    try { await api.remove(doc.id); bump(); toast.success("Document deleted."); onDeleted(); }
    catch (e) { toast.error((e as Error).message); setBusy(false); }
  }

  const tag = (k: FieldName) => (doc.field_sources[k] ? <SourceBadge source={doc.field_sources[k]} /> : null);
  const text = (k: FieldName, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Field label={FIELD_LABEL[k] + (REQUIRED_FIELDS.includes(k) ? " *" : "")} htmlFor={`rf-${k}`} error={errors[k]} tag={tag(k)}>
      <input id={`rf-${k}`} className="input" value={form[k]} disabled={!editable || busy} onChange={(e) => set(k, e.target.value)}
        aria-invalid={Boolean(errors[k])} aria-describedby={errors[k] ? `rf-${k}-err` : undefined} {...extra} />
    </Field>
  );
  const choice = (k: FieldName, options: string[], fmt: (s: string) => string = (s) => s) => (
    <Field label={FIELD_LABEL[k] + (REQUIRED_FIELDS.includes(k) ? " *" : "")} htmlFor={`rf-${k}`} error={errors[k]} tag={tag(k)}>
      <select id={`rf-${k}`} className="input" value={form[k]} disabled={!editable || busy} onChange={(e) => set(k, e.target.value)} aria-invalid={Boolean(errors[k])}>
        <option value="">Not set</option>{options.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}
      </select>
    </Field>
  );

  if (doc.status === "failed") {
    return (
      <div className="space-y-3">
        <Notice tone="error"><strong>Processing failed.</strong> {doc.processing_error}</Notice>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={busy} onClick={() => run(() => api.reprocess(doc.id), onChange, "Processing finished.")}><RefreshCw className="h-4 w-4" aria-hidden /> Retry processing</button>
          <button className="btn-danger" disabled={busy} onClick={reject}><Trash2 className="h-4 w-4" aria-hidden /> Reject and delete</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 space-y-2">
        {doc.ai_status === "not_configured" && <Notice tone="warn">AI extraction isn't configured, so nothing was filled in automatically. Enter the values from the original.</Notice>}
        {(doc.ai_status === "failed" || doc.ai_status === "invalid_output") && <Notice tone="warn">AI extraction didn't produce usable values. {doc.ai_error}</Notice>}
        {doc.warnings.length > 0 && <Notice tone="warn"><ul className="list-disc space-y-0.5 pl-4">{doc.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
        {doc.consistency_warnings.map((w) => <Notice tone="warn" key={w}>{w}</Notice>)}
      </div>
      <form className="grid gap-3.5 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate aria-label="Extracted values">
        <div className="sm:col-span-2">{text("vendor")}</div>
        {choice("document_type", meta.document_types, TYPE_LABEL)}
        {text("document_date", { type: "date" })}
        <div>
          {text("currency", { maxLength: 3, placeholder: prefs.default_currency || "USD", className: "input uppercase" })}
          {prefs.default_currency && !form.currency && editable && (
            <button type="button" className="mt-1 text-xs font-medium text-brand-700 underline" onClick={() => set("currency", prefs.default_currency)}>Use default ({prefs.default_currency})</button>
          )}
        </div>
        {choice("expense_category", meta.categories)}
        {text("subtotal", { inputMode: "decimal" })}
        {text("tax", { inputMode: "decimal" })}
        <div className="sm:col-span-2">{text("total_amount", { inputMode: "decimal" })}</div>
        <div className="sm:col-span-2">{text("short_summary")}</div>
      </form>
      <p className="mt-2 text-xs text-ink-600">* required to confirm</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button className="btn-primary" disabled={!editable || busy || (doc.verification_status === "confirmed" && !dirty)}
          onClick={() => run(() => api.confirm(doc.id, dirty ? form : {}), onConfirmed, "Confirmed. This record now counts toward your totals.")}>
          <CheckCircle2 className="h-4 w-4" aria-hidden />{doc.verification_status === "confirmed" && !dirty ? "Confirmed" : "Confirm and save"}
        </button>
        <button className="btn-secondary" disabled={!editable || busy || !dirty} onClick={() => run(() => api.update(doc.id, form), onChange, "Changes saved. Not confirmed yet.")}>
          <Save className="h-4 w-4" aria-hidden /> Save without confirming
        </button>
        <a className="btn-secondary" href={`#/extraction/${doc.id}`}><ScanText className="h-4 w-4" aria-hidden /> AI details</a>
        <button className="btn-danger" disabled={busy} onClick={reject}><Trash2 className="h-4 w-4" aria-hidden /> Reject and delete</button>
      </div>
      {doc.verification_status === "confirmed" && <p className="mt-3 text-xs text-ink-600">Editing a confirmed record reopens it for review and removes it from totals until you confirm again.</p>}
    </div>
  );
}
