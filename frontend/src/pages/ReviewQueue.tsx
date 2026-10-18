import { useState } from "react";
import { CheckCircle2, ClipboardCheck, ExternalLink } from "lucide-react";
import { api } from "../api";
import DocHeader from "../components/DocHeader";
import DocumentBrowser from "../components/DocumentBrowser";
import DocumentPreview from "../components/DocumentPreview";
import { EmptyState, ErrorState, Skeleton } from "../components/Feedback";
import { BackToList, TwoPane } from "../components/Layout";
import ReviewForm from "../components/ReviewForm";
import { Card } from "../components/Layout";
import { useToast } from "../components/Toast";
import { useCrumb, useWorkspace } from "../context";
import { REASON_LABEL } from "../lib/labels";
import { useAsync } from "../lib/useAsync";
import { navigate, type Route } from "../router";

const REASONS = ["failed", "missing_fields", "ai_unavailable", "warnings", "needs_confirmation"] as const;

function ReviewWorkspace({ id }: { id: number }) {
  const toast = useToast();
  const doc = useAsync(() => api.get(id), [id]);
  const [tab, setTab] = useState<"edit" | "original">("edit");
  useCrumb(doc.data?.original_filename);

  if (doc.loading && !doc.data) return <div className="p-4 sm:p-6"><BackToList to="/review" label="Review queue" /><Skeleton className="h-8 w-64" /><Skeleton className="mt-4 h-96" /></div>;
  if (doc.error || !doc.data) return <div className="p-4 sm:p-6"><BackToList to="/review" label="Review queue" /><ErrorState message={doc.error ?? "Document not found."} onRetry={doc.reload} /></div>;
  const d = doc.data;

  async function afterConfirm() {
    // Move on to the next document that still needs review.
    const next = await api.queue({ per_page: 3 }).then((r) => r.data.find((x) => x.id !== id)).catch(() => undefined);
    if (next) navigate(`/review/${next.id}`);
    else { toast.info("The review queue is clear."); navigate("/review"); }
  }

  return (
    <div className="p-4 sm:p-6">
      <BackToList to="/review" label="Review queue" />
      <DocHeader doc={d} actions={<a className="btn-secondary" href={api.fileUrl(d.id)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /> View full</a>} />
      <div role="tablist" aria-label="Review view" className="mb-3 inline-flex rounded-lg border border-ink-200 bg-ink-100 p-0.5 xl:hidden">
        {([["edit", "Edit values"], ["original", "Original"]] as const).map(([t, label]) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 text-sm font-medium ${tab === t ? "bg-white shadow-card" : "text-ink-600"}`}>{label}</button>)}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className={`${tab === "original" ? "block" : "hidden"} min-w-0 xl:block`}><DocumentPreview doc={d} /></div>
        <div className={`${tab === "edit" ? "block" : "hidden"} min-w-0 xl:block`}>
          <Card title="Extracted values">
            <ReviewForm doc={d} onChange={doc.mutate} onConfirmed={afterConfirm} onDeleted={() => navigate("/review")} />
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function ReviewQueue({ route }: { route: Route }) {
  const { version } = useWorkspace();
  const [reason, setReason] = useState("");
  const counts = useAsync(() => api.queue({ per_page: 1 }), [version]);
  const c = counts.data?.meta?.counts ?? {};
  const chip = (value: string, label: string, n: number) => (
    <button key={value} aria-pressed={reason === value} onClick={() => setReason(value)}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${reason === value ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white text-ink-700 hover:bg-ink-50"}`}>{label} <span className="tabular-nums">{n}</span></button>
  );
  const chips = (
    <div role="group" aria-label="Filter by review reason" className="flex flex-wrap gap-1.5">
      {chip("", "All", c.total ?? 0)}{REASONS.map((r) => (c[r] ?? 0) > 0 || reason === r ? chip(r, REASON_LABEL[r], c[r] ?? 0) : null)}
    </div>
  );
  return (
    <TwoPane selected={route.id !== null}
      list={<DocumentBrowser title="Review Queue" basePath="/review" selectedId={route.id} source="queue" extra={{ reason }} topSlot={chips} showReasons />}>
      {route.id === null ? (
        <EmptyState icon={(c.total ?? 0) === 0 ? CheckCircle2 : ClipboardCheck} title={(c.total ?? 0) === 0 ? "Nothing waiting for review" : "Select a document to review"}>
          {(c.total ?? 0) === 0 ? "Uploaded documents appear here until you confirm their values." : "Check each extracted value against the original, correct anything wrong, then confirm."}
        </EmptyState>
      ) : <ReviewWorkspace key={route.id} id={route.id} />}
    </TwoPane>
  );
}
