import { useState } from "react";
import { LayoutTemplate, Pencil, Plus, Trash2 } from "lucide-react";
import { api, type Template } from "../api";
import { Badge } from "../components/Badges";
import { useConfirm } from "../components/Dialog";
import { EmptyState, ErrorState, Notice, PageSkeleton } from "../components/Feedback";
import { Card, PageContainer, PageHeader } from "../components/Layout";
import TemplateDialog from "../components/TemplateDialog";
import { useToast } from "../components/Toast";
import { useWorkspace } from "../context";
import { FIELD_LABEL, TYPE_LABEL } from "../lib/labels";
import { useAsync } from "../lib/useAsync";

export default function Templates() {
  const { reloadTemplates, version } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const list = useAsync(api.templates, [version]);
  const [editing, setEditing] = useState<Template | null | "new">(null);

  async function remove(t: Template) {
    const ok = await confirm({ title: `Delete “${t.name}”?`, confirmLabel: "Delete template",
      message: t.document_count > 0 ? `${t.document_count} document(s) used this template. They keep their extracted values; only the link to the template is removed.` : "This template isn't used by any document." });
    if (!ok) return;
    try { await api.deleteTemplate(t.id); await reloadTemplates(); list.reload(); toast.success("Template deleted."); } catch (e) { toast.error((e as Error).message); }
  }

  const newBtn = <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden /> New template</button>;
  if (list.loading && !list.data) return <PageContainer><PageSkeleton /></PageContainer>;
  if (list.error || !list.data) return <PageContainer><ErrorState message={list.error ?? "Could not load templates."} onRetry={list.reload} /></PageContainer>;

  return (
    <PageContainer>
      <PageHeader title="Templates" subtitle="Reusable extraction settings, applied when a document is processed." actions={newBtn} />
      <div className="mb-4"><Notice tone="info">Pick a template in the upload dialog, or re-run extraction with one from the AI Extraction page. It limits which fields the AI fills in and can set a default type or category. Defaults are labelled “Template”, never “AI”.</Notice></div>
      {list.data.length === 0 ? (
        <Card pad={false}><EmptyState icon={LayoutTemplate} title="No templates yet" action={newBtn}>Create one for a document you process often, such as restaurant receipts or monthly software invoices.</EmptyState></Card>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" aria-label="Templates">
          {list.data.map((t) => (
            <li key={t.id} className="card flex flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><h2 className="truncate text-sm font-semibold">{t.name}</h2><p className="mt-0.5 text-xs text-ink-600">{t.description || "No description"}</p></div>
                <div className="flex shrink-0 gap-1">
                  <button className="rounded p-1.5 text-ink-600 hover:bg-ink-100" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}><Pencil className="h-4 w-4" aria-hidden /></button>
                  <button className="rounded p-1.5 text-red-700 hover:bg-red-50" aria-label={`Delete ${t.name}`} onClick={() => remove(t)}><Trash2 className="h-4 w-4" aria-hidden /></button>
                </div>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <div className="flex justify-between gap-3"><dt className="text-ink-600">Document type</dt><dd className="font-medium">{t.document_type ? TYPE_LABEL(t.document_type) : "Any"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-600">Default category</dt><dd className="font-medium">{t.default_category ?? "None"}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-ink-600">Used by</dt><dd className="font-medium">{t.document_count} document{t.document_count === 1 ? "" : "s"}</dd></div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1" aria-label="Fields extracted">{t.fields.map((f) => <Badge key={f}>{FIELD_LABEL[f]}</Badge>)}</div>
            </li>
          ))}
        </ul>
      )}
      {editing && <TemplateDialog template={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
    </PageContainer>
  );
}
