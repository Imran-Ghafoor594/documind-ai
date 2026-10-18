import { useState } from "react";
import { api, ApiError, type FieldName, type Template } from "../api";
import { useWorkspace } from "../context";
import { FIELD_LABEL, FIELD_ORDER, TYPE_LABEL } from "../lib/labels";
import { Dialog } from "./Dialog";
import { Field } from "./Form";
import { useToast } from "./Toast";

export default function TemplateDialog({ template, onClose, onSaved }: { template: Template | null; onClose: () => void; onSaved: () => void }) {
  const { meta, reloadTemplates } = useWorkspace();
  const toast = useToast();
  const [name, setName] = useState(template?.name ?? "");
  const [description, setDescription] = useState(template?.description ?? "");
  const [docType, setDocType] = useState(template?.document_type ?? "");
  const [category, setCategory] = useState(template?.default_category ?? "");
  const [fields, setFields] = useState<FieldName[]>(template?.fields ?? [...FIELD_ORDER]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const toggle = (f: FieldName) => setFields((l) => (l.includes(f) ? l.filter((x) => x !== f) : [...l, f]));

  async function save() {
    if (busy) return;
    setBusy(true); setErrors({});
    const body = { name, description: description || null, document_type: docType || null, default_category: category || null, fields };
    try {
      if (template) await api.updateTemplate(template.id, body); else await api.createTemplate(body);
      await reloadTemplates();
      toast.success(template ? "Template updated." : "Template created.");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.details) setErrors(e.details as Record<string, string>);
      else toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Dialog title={template ? "Edit template" : "New template"} onClose={onClose} dismissible={!busy} width="max-w-xl"
      description="A template tells the AI which fields to extract and can set defaults. Choose it when uploading or re-running extraction."
      footer={<><button className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="btn-primary" onClick={save} disabled={busy}>{busy ? "Saving…" : template ? "Save changes" : "Create template"}</button></>}>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Template name" htmlFor="tpl-name" error={errors.name}>
          <input id="tpl-name" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-invalid={Boolean(errors.name)} placeholder="e.g. Restaurant receipts" /></Field></div>
        <div className="sm:col-span-2"><Field label="Description (optional)" htmlFor="tpl-desc" error={errors.description}>
          <input id="tpl-desc" className="input" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} /></Field></div>
        <Field label="Supported document type" htmlFor="tpl-type" error={errors.document_type} hint="Used as the default type if the AI can't tell.">
          <select id="tpl-type" className="input" value={docType} onChange={(e) => setDocType(e.target.value)}><option value="">Any type</option>{meta.document_types.map((t) => <option key={t} value={t}>{TYPE_LABEL(t)}</option>)}</select></Field>
        <Field label="Default category (optional)" htmlFor="tpl-cat" error={errors.default_category} hint="Filled in only when the AI leaves the category empty.">
          <select id="tpl-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">No default</option>{meta.categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <fieldset className="sm:col-span-2">
          <legend className="label">Fields to extract</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {FIELD_ORDER.map((f) => (
              <label key={f} className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm hover:bg-ink-50">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={fields.includes(f)} onChange={() => toggle(f)} />{FIELD_LABEL[f]}
              </label>
            ))}
          </div>
          {errors.fields && <p className="mt-1 text-xs font-medium text-red-700">{errors.fields}</p>}
        </fieldset>
      </div>
    </Dialog>
  );
}
