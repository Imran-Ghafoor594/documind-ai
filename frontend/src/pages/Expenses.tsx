import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, ExternalLink, Receipt, Search, X } from "lucide-react";
import { api, type Doc, type Params } from "../api";
import { Badge } from "../components/Badges";
import { DetailsList } from "../components/DetailsList";
import { Dialog } from "../components/Dialog";
import { EmptyState, ErrorState, ListSkeleton } from "../components/Feedback";
import { Field } from "../components/Form";
import { Card, PageContainer, PageHeader } from "../components/Layout";
import { Pagination } from "../components/Pagination";
import { useWorkspace } from "../context";
import { formatDate, money } from "../lib/format";
import { TYPE_LABEL } from "../lib/labels";
import { useAsync, useDebounced } from "../lib/useAsync";

type SortKey = "vendor" | "date" | "amount";

export default function Expenses() {
  const { meta, version, prefs } = useWorkspace();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("");
  const [currency, setCurrency] = useState(prefs.default_currency);
  const [sort, setSort] = useState<SortKey>("date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<Doc | null>(null);

  const filters: Params = { q: dq, date_from: from, date_to: to, category, document_type: type, currency };
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [filterKey, sort, order]);

  const all = useAsync(() => api.summary(), [version]);
  const totals = useAsync(() => api.summary(filters), [filterKey, version]);
  const list = useAsync(() => api.list({ ...filters, verification: "confirmed", sort, order, page, per_page: 15 }), [filterKey, sort, order, page, version]);
  const rows = list.data?.data ?? [];
  const pg = list.data?.meta;
  const currencies = all.data?.map((c) => c.currency) ?? [];
  const active = Boolean(dq || from || to || category || type || currency);
  const reset = () => { setQ(""); setFrom(""); setTo(""); setCategory(""); setType(""); setCurrency(""); };
  const toggle = (k: SortKey) => { if (sort === k) setOrder(order === "asc" ? "desc" : "asc"); else { setSort(k); setOrder(k === "vendor" ? "asc" : "desc"); } };

  const SortHead = ({ k, label, right }: { k: SortKey; label: string; right?: boolean }) => (
    <th scope="col" className={`th ${right ? "text-right" : ""}`} aria-sort={sort === k ? (order === "asc" ? "ascending" : "descending") : "none"}>
      <button className="inline-flex items-center gap-1 font-semibold hover:text-ink-900" onClick={() => toggle(k)}>{label}
        {sort === k ? (order === "asc" ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />) : <ArrowUpDown className="h-3 w-3 text-ink-400" aria-hidden />}</button>
    </th>
  );

  return (
    <PageContainer>
      <PageHeader title="Expenses" subtitle="Confirmed records only. Totals are shown per currency and never converted."
        actions={<a className="btn-secondary" href={api.csvUrl(filters)} download><Download className="h-4 w-4" aria-hidden /> Export CSV{active ? " (filtered)" : ""}</a>} />

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1"><Field label="Search vendor" htmlFor="ex-q"><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-500" aria-hidden />
            <input id="ex-q" type="search" className="input pl-9" placeholder="Vendor name" value={q} onChange={(e) => setQ(e.target.value)} /></div></Field></div>
          <Field label="From date" htmlFor="ex-from"><input id="ex-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To date" htmlFor="ex-to"><input id="ex-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} /></Field>
          <Field label="Currency" htmlFor="ex-cur"><select id="ex-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="">All currencies</option>{currencies.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Category" htmlFor="ex-cat"><select id="ex-cat" className="input" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{meta.categories.map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Document type" htmlFor="ex-type"><select id="ex-type" className="input" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{meta.document_types.map((t) => <option key={t} value={t}>{TYPE_LABEL(t)}</option>)}</select></Field>
          {active && <div className="flex items-end"><button className="btn-secondary w-full" onClick={reset}><X className="h-4 w-4" aria-hidden /> Reset filters</button></div>}
        </div>
      </Card>

      {totals.data && totals.data.length > 0 && (
        <ul aria-label="Totals by currency" className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {totals.data.map((c) => <li key={c.currency} className="card p-4"><p className="text-xs font-medium text-ink-600">Total ({c.currency}){active && " · filtered"}</p><p className="text-xl font-semibold tabular-nums">{money(c.total, c.currency)}</p><p className="text-xs text-ink-600">{c.count} record{c.count === 1 ? "" : "s"}</p></li>)}
        </ul>
      )}

      <section className="card" aria-label="Expense records">
        {list.loading && !list.data ? <ListSkeleton rows={6} /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : rows.length === 0 ? (
          <EmptyState icon={Receipt} title={active ? "No expenses match these filters" : "No confirmed expenses yet"}
            action={active ? <button className="btn-secondary" onClick={reset}>Reset filters</button> : <a className="btn-primary" href="#/review">Go to Review Queue</a>}>
            {active ? "Try widening the date range or clearing a filter." : "Expenses appear here after you confirm a document's values."}
          </EmptyState>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full border-collapse">
                <caption className="sr-only">Confirmed expenses</caption>
                <thead className="border-b border-ink-200 bg-ink-50"><tr><SortHead k="vendor" label="Vendor" /><SortHead k="date" label="Date" /><th scope="col" className="th">Category</th><th scope="col" className="th">Type</th><SortHead k="amount" label="Amount" right /></tr></thead>
                <tbody className="divide-y divide-ink-100">{rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-ink-50" onClick={() => setOpen(r)}>
                    <td className="td max-w-[18rem] font-medium"><button className="max-w-full truncate text-left hover:text-brand-700" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.fields.vendor}</button></td>
                    <td className="td whitespace-nowrap text-ink-700">{formatDate(r.fields.document_date)}</td>
                    <td className="td text-ink-700">{r.fields.expense_category}</td>
                    <td className="td"><Badge>{TYPE_LABEL(r.fields.document_type)}</Badge></td>
                    <td className="td whitespace-nowrap text-right font-semibold tabular-nums">{money(r.fields.total_amount, r.fields.currency)}</td>
                  </tr>))}</tbody>
              </table>
            </div>
            <ul className="divide-y divide-ink-100 md:hidden">{rows.map((r) => (
              <li key={r.id}><button className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen(r)}>
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{r.fields.vendor}</span><span className="block text-xs text-ink-600">{formatDate(r.fields.document_date)} · {r.fields.expense_category}</span></span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{money(r.fields.total_amount, r.fields.currency)}</span></button></li>))}</ul>
          </>
        )}
        {pg && <Pagination page={pg.page} pages={pg.pages} total={pg.total} perPage={pg.per_page} onPage={setPage} noun="expenses" />}
      </section>

      {open && (
        <Dialog title={open.fields.vendor ?? "Expense"} description={`${money(open.fields.total_amount, open.fields.currency)} · ${formatDate(open.fields.document_date)}`} onClose={() => setOpen(null)}
          footer={<><a className="btn-secondary" href={api.fileUrl(open.id)} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" aria-hidden /> View original</a><a className="btn-primary" href={`#/documents/${open.id}`} onClick={() => setOpen(null)}>Open document</a></>}>
          <DetailsList doc={open} />
        </Dialog>
      )}
    </PageContainer>
  );
}
