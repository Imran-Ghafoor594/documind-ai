import { useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileStack, Upload, Wallet, Activity as ActivityIcon, UploadCloud } from "lucide-react";
import { api } from "../api";
import { ReasonBadge, StatusBadge } from "../components/Badges";
import { CategoryChart, CurrencyTabs, MonthlyChart } from "../components/Charts";
import { EmptyState, ErrorState, PageSkeleton } from "../components/Feedback";
import { Card, PageContainer, PageHeader } from "../components/Layout";
import { useWorkspace } from "../context";
import { formatDate, formatDateTime, money } from "../lib/format";
import { pickCurrency } from "../lib/currency";
import { useAsync } from "../lib/useAsync";

function Metric({ icon: Icon, label, value, sub, to }: { icon: typeof FileStack; label: string; value: React.ReactNode; sub: string; to?: string }) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700"><Icon className="h-[18px] w-[18px]" aria-hidden /></span>
      <span className="min-w-0"><span className="block text-xs font-medium text-ink-600">{label}</span><span className="block text-xl font-semibold tabular-nums text-ink-900">{value}</span><span className="block text-xs text-ink-600">{sub}</span></span>
    </>
  );
  const cls = "card flex items-start gap-3 p-4";
  return to ? <a href={to} className={`${cls} hover:border-ink-300`}>{body}</a> : <div className={cls}>{body}</div>;
}

export default function Overview() {
  const { version, prefs, openUpload } = useWorkspace();
  const data = useAsync(api.dashboard, [version]);
  const [picked, setPicked] = useState<string | null>(null);

  if (data.loading && !data.data) return <PageContainer><PageSkeleton /></PageContainer>;
  if (data.error || !data.data) return <PageContainer><ErrorState message={data.error ?? "Could not load the dashboard."} onRetry={data.reload} /></PageContainer>;
  const d = data.data;
  const active = pickCurrency(d.summary, picked, prefs.default_currency);
  const uploadBtn = <button className="btn-primary" onClick={openUpload}><Upload className="h-4 w-4" aria-hidden /> Upload document</button>;

  return (
    <PageContainer>
      <PageHeader title="Welcome to DocuMind AI" subtitle="Upload invoices and receipts, check what was extracted, and track confirmed expenses." actions={uploadBtn} />
      {d.is_empty ? (
        <Card pad={false}><EmptyState icon={UploadCloud} title="No documents yet" action={uploadBtn}>Upload an invoice or receipt. DocuMind reads it, suggests the fields, and nothing counts toward your totals until you confirm it.</EmptyState></Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric icon={FileStack} label="Total documents" value={d.counts.documents} sub={d.counts.failed ? `${d.counts.failed} failed processing` : "All uploads"} to="#/documents" />
            <Metric icon={CheckCircle2} label="Processed documents" value={d.counts.processed} sub={`of ${d.counts.documents} uploaded`} to="#/documents" />
            <Metric icon={ClipboardCheck} label="Awaiting review" value={d.counts.awaiting_review} sub={d.counts.needs_attention ? `${d.counts.needs_attention} in the review queue` : "Queue is clear"} to="#/review" />
            <Metric icon={Wallet} label="Confirmed expenses" to="#/expenses"
              value={d.summary.length === 0 ? "—" : <span className="block space-y-0.5 text-base leading-tight">{d.summary.slice(0, 2).map((s) => <span key={s.currency} className="block">{money(s.total, s.currency)}</span>)}</span>}
              sub={d.summary.length === 0 ? "Nothing confirmed yet" : `${d.counts.confirmed} confirmed${d.summary.length > 2 ? ` · +${d.summary.length - 2} more currencies` : ""}`} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Monthly expenses" actions={<CurrencyTabs items={d.summary.map((s) => s.currency)} value={active?.currency ?? ""} onChange={setPicked} />}>
              {active ? <MonthlyChart summary={active} /> : <p className="py-10 text-center text-sm text-ink-600">Confirm a document to see monthly spending.</p>}
            </Card>
            <Card className="lg:col-span-2" title="Expenses by category">
              {active ? <CategoryChart summary={active} /> : <p className="py-10 text-center text-sm text-ink-600">No confirmed expenses yet.</p>}
            </Card>
          </div>
          {d.summary.length > 1 && <p className="mt-2 text-xs text-ink-600">Charts show one currency at a time. Amounts are never converted or added across currencies.</p>}

          <div className="mt-4 grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-3" title="Recent documents" pad={false} actions={<a href="#/documents" className="text-sm font-medium text-brand-700 hover:underline">View all</a>}>
              <ul className="divide-y divide-ink-100">
                {d.recent.map((r) => (
                  <li key={r.id}><a href={`#/documents/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-ink-50">
                    <span className="min-w-0"><span className="block truncate text-sm font-medium">{r.fields.vendor ?? "Vendor not set"}</span><span className="block truncate text-xs text-ink-600">{r.original_filename} · {formatDate(r.fields.document_date)}</span></span>
                    <span className="flex shrink-0 items-center gap-3"><span className="hidden text-sm font-medium tabular-nums sm:block">{money(r.fields.total_amount, r.fields.currency)}</span><StatusBadge status={r.status} /></span>
                  </a></li>
                ))}
              </ul>
            </Card>
            <div className="min-w-0 space-y-4 lg:col-span-2">
              <Card title={<span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden /> Needs attention</span>} pad={false}>
                {d.attention.length === 0 ? <p className="p-4 text-sm text-ink-600">No failed documents or missing fields.</p> : (
                  <ul className="divide-y divide-ink-100">{d.attention.map((a) => (
                    <li key={a.id}><a href={`#/review/${a.id}`} className="block px-4 py-2.5 hover:bg-ink-50"><span className="block truncate text-sm font-medium">{a.fields.vendor ?? a.original_filename}</span>
                      <span className="mt-1 flex flex-wrap gap-1">{a.review_reasons.filter((r) => r !== "needs_confirmation").map((r) => <ReasonBadge key={r} reason={r} />)}</span></a></li>
                  ))}</ul>
                )}
              </Card>
              <Card title={<span className="flex items-center gap-2"><ActivityIcon className="h-4 w-4" aria-hidden /> Recent activity</span>} pad={false}>
                <ul className="divide-y divide-ink-100">{d.activity.map((e, i) => (
                  <li key={i}><a href={`#/documents/${e.document_id}`} className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm hover:bg-ink-50">
                    <span className="min-w-0 truncate">{e.type === "confirmed" ? "Confirmed" : "Uploaded"} <strong className="font-medium">{e.label}</strong></span>
                    <span className="shrink-0 text-xs text-ink-600">{formatDateTime(e.at)}</span></a></li>
                ))}</ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}
