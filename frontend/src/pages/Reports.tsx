import { useState } from "react";
import { BarChart3, Download } from "lucide-react";
import { api } from "../api";
import { CategoryChart, CurrencyTabs, MonthlyChart, ShareBars } from "../components/Charts";
import { EmptyState, ErrorState, Notice, PageSkeleton } from "../components/Feedback";
import { Field } from "../components/Form";
import { Card, PageContainer, PageHeader } from "../components/Layout";
import { useWorkspace } from "../context";
import { money } from "../lib/format";
import { pickCurrency } from "../lib/currency";
import { useAsync } from "../lib/useAsync";

const STATUS_NAMES: Record<string, string> = { review_required: "Awaiting review", completed: "Completed", failed: "Failed", uploaded: "Uploaded", processing: "Processing" };
const AI_NAMES: Record<string, string> = { success: "AI extraction succeeded", not_configured: "AI not configured", failed: "AI request failed", invalid_output: "AI output unusable", skipped: "Skipped (no readable text)", pending: "Pending" };
const METHOD_NAMES: Record<string, string> = { pdf_text: "PDF text layer", ocr: "OCR", none: "No text read" };

function Counts({ title, data, names }: { title: string; data: Record<string, number>; names: Record<string, string> }) {
  const rows = Object.entries(data);
  return (
    <div><h3 className="mb-1.5 text-xs font-semibold text-ink-600">{title}</h3>
      {rows.length === 0 ? <p className="text-sm text-ink-600">No data</p> : <ul className="space-y-1 text-sm">{rows.map(([k, n]) => <li key={k} className="flex justify-between gap-3"><span>{names[k] ?? k}</span><span className="font-semibold tabular-nums">{n}</span></li>)}</ul>}</div>
  );
}

export default function Reports() {
  const { version, prefs } = useWorkspace();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const range = { date_from: from, date_to: to };
  const rep = useAsync(() => api.report(range), [from, to, version]);

  if (rep.loading && !rep.data) return <PageContainer><PageSkeleton /></PageContainer>;
  if (rep.error || !rep.data) return <PageContainer><ErrorState message={rep.error ?? "Could not load reports."} onRetry={rep.reload} /></PageContainer>;
  const { currencies, processing } = rep.data;
  const active = pickCurrency(currencies, picked, prefs.default_currency);
  const csv = (section: string) => <a className="btn-secondary btn-sm" href={api.reportCsvUrl(section, range)} download><Download className="h-3.5 w-3.5" aria-hidden /> CSV</a>;

  return (
    <PageContainer>
      <PageHeader title="Reports" subtitle="Calculated from your stored, confirmed records. Reports export as CSV; PDF export isn't available." />
      <Card className="mb-4">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="From date" htmlFor="rp-from"><input id="rp-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To date" htmlFor="rp-to"><input id="rp-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
          {(from || to) && <button className="btn-secondary" onClick={() => { setFrom(""); setTo(""); }}>Clear date range</button>}
        </div>
        <p className="mt-3 text-xs text-ink-600">Expense sections use the <strong>document date</strong> of confirmed records. The processing summary uses the <strong>upload date</strong> of all documents.</p>
      </Card>

      <h2 className="mb-2 text-sm font-semibold">Expense reports</h2>
      {!active ? (
        <Card pad={false}><EmptyState icon={BarChart3} title="No confirmed expenses in this range">{from || to ? "Try a wider date range." : "Confirm documents in the Review Queue to build reports."}</EmptyState></Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><CurrencyTabs items={currencies.map((c) => c.currency)} value={active.currency} onChange={setPicked} />
            <p className="text-sm text-ink-700">Total <strong className="tabular-nums">{money(active.total, active.currency)}</strong> · {active.count} record{active.count === 1 ? "" : "s"}</p></div>
          {currencies.length > 1 && <div className="mb-3"><Notice tone="info">{currencies.length} currencies found. Each is reported separately; nothing is converted.</Notice></div>}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Monthly summary" actions={csv("monthly")}>
              <MonthlyChart summary={active} />
              {active.monthly.length > 0 && <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><caption className="sr-only">Monthly totals</caption><thead><tr className="border-b border-ink-200"><th scope="col" className="th">Month</th><th scope="col" className="th text-right">Records</th><th scope="col" className="th text-right">Total</th></tr></thead>
                <tbody className="divide-y divide-ink-100">{active.monthly.map((m) => <tr key={m.month}><th scope="row" className="td text-left font-medium">{m.month}</th><td className="td text-right tabular-nums">{m.count}</td><td className="td text-right tabular-nums">{money(m.total, active.currency)}</td></tr>)}</tbody></table></div>}
              {active.undated_count > 0 && <p className="mt-2 text-xs text-ink-600">{active.undated_count} record(s) worth {money(active.undated_total, active.currency)} have no document date and are not in a month.</p>}
            </Card>
            <Card title="Spending by category" actions={csv("categories")}>
              <CategoryChart summary={active} />
              <div className="mt-4"><ShareBars rows={active.categories.map((c) => ({ label: c.category, total: c.total, count: c.count }))} total={active.total} currency={active.currency} /></div>
            </Card>
            <Card title="Spending by vendor" actions={csv("vendors")} className="lg:col-span-2">
              <ShareBars rows={active.vendors.map((v) => ({ label: v.vendor, total: v.total, count: v.count }))} total={active.total} currency={active.currency} />
              {active.vendors.length >= 25 && <p className="mt-2 text-xs text-ink-600">Showing the top 25 vendors.</p>}
            </Card>
          </div>
        </>
      )}

      <h2 className="mb-2 mt-6 text-sm font-semibold">Document processing summary</h2>
      <Card>
        {processing.total === 0 ? <p className="text-sm text-ink-600">No documents were uploaded in this range.</p> : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <div><h3 className="mb-1.5 text-xs font-semibold text-ink-600">Uploaded documents</h3><p className="text-3xl font-semibold tabular-nums">{processing.total}</p></div>
            <Counts title="By processing status" data={processing.by_status} names={STATUS_NAMES} />
            <Counts title="Verification" data={processing.by_verification} names={{ confirmed: "Confirmed by a person", unverified: "Not confirmed" }} />
            <div className="space-y-4"><Counts title="AI extraction" data={processing.by_ai_status} names={AI_NAMES} /><Counts title="Text read via" data={processing.by_extraction_method} names={METHOD_NAMES} /></div>
          </div>
        )}
      </Card>
    </PageContainer>
  );
}
