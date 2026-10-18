import { useState } from "react";
import { ClipboardCheck, Download, ExternalLink, FileStack, ScanText, Trash2 } from "lucide-react";
import { api } from "../api";
import { Badge } from "../components/Badges";
import { DetailsList } from "../components/DetailsList";
import { useConfirm } from "../components/Dialog";
import DocHeader from "../components/DocHeader";
import DocumentBrowser from "../components/DocumentBrowser";
import DocumentPreview from "../components/DocumentPreview";
import { EmptyState, ErrorState, Skeleton } from "../components/Feedback";
import { BackToList, Card, TwoPane } from "../components/Layout";
import { Menu } from "../components/Menu";
import { useToast } from "../components/Toast";
import { useCrumb, useWorkspace } from "../context";
import { useAsync } from "../lib/useAsync";
import { navigate, type Route } from "../router";

function DocumentWorkspace({ id }: { id: number }) {
  const { bump } = useWorkspace();
  const toast = useToast();
  const confirm = useConfirm();
  const doc = useAsync(() => api.get(id), [id]);
  const [tab, setTab] = useState<"preview" | "details">("preview");
  useCrumb(doc.data?.original_filename);

  if (doc.loading && !doc.data) return <div className="p-4 sm:p-6"><BackToList to="/documents" label="All documents" /><Skeleton className="h-8 w-64" /><Skeleton className="mt-4 h-96" /></div>;
  if (doc.error || !doc.data) return <div className="p-4 sm:p-6"><BackToList to="/documents" label="All documents" /><ErrorState message={doc.error ?? "Document not found."} onRetry={doc.reload} /></div>;
  const d = doc.data;

  async function remove() {
    const ok = await confirm({ title: "Delete this document?", confirmLabel: "Delete document", message: `“${d.original_filename}” and its stored file will be permanently deleted. This can't be undone.` });
    if (!ok) return;
    try { await api.remove(d.id); bump(); toast.success("Document deleted."); navigate("/documents"); } catch (e) { toast.error((e as Error).message); }
  }

  return (
    <div className="p-4 sm:p-6">
      <BackToList to="/documents" label="All documents" />
      <DocHeader doc={d} actions={<>
        <a className="btn-secondary" href={api.fileUrl(d.id)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /> View full</a>
        <a className="btn-secondary" href={api.fileUrl(d.id, true)} download><Download className="h-4 w-4" aria-hidden /> Download</a>
        <a className="btn-primary" href={`#/review/${d.id}`}><ClipboardCheck className="h-4 w-4" aria-hidden /> {d.verification_status === "confirmed" ? "View values" : "Review"}</a>
        <Menu label={`More actions for ${d.original_filename}`} iconOnly items={[
          { label: "AI extraction details", icon: ScanText, href: `#/extraction/${d.id}` },
          { label: "Delete document", icon: Trash2, danger: true, onSelect: remove },
        ]} />
      </>} />
      <div role="tablist" aria-label="Document view" className="mb-3 inline-flex rounded-lg border border-ink-200 bg-ink-100 p-0.5 xl:hidden">
        {(["preview", "details"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-sm font-medium capitalize ${tab === t ? "bg-white shadow-card" : "text-ink-600"}`}>{t}</button>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className={`${tab === "preview" ? "block" : "hidden"} min-w-0 xl:block`}><DocumentPreview doc={d} /></div>
        <div className={`${tab === "details" ? "block" : "hidden"} xl:block`}>
          <Card title="Document details" actions={d.template_id ? <Badge tone="brand">Template applied</Badge> : undefined}><DetailsList doc={d} />
            {d.review_reasons.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-900">This document is waiting in the Review Queue. Open <a className="font-semibold underline" href={`#/review/${d.id}`}>Review</a> to check and confirm the values.</p>}
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function Documents({ route }: { route: Route }) {
  const { openUpload } = useWorkspace();
  return (
    <TwoPane selected={route.id !== null}
      list={<DocumentBrowser title="Documents" basePath="/documents" selectedId={route.id} initialQ={route.query.get("q") ?? ""} />}>
      {route.id === null ? (
        <EmptyState icon={FileStack} title="Select a document" action={<button className="btn-primary" onClick={openUpload}>Upload document</button>}>
          Choose a document from the list to preview the original and see its details, or upload a new one.
        </EmptyState>
      ) : <DocumentWorkspace key={route.id} id={route.id} />}
    </TwoPane>
  );
}
