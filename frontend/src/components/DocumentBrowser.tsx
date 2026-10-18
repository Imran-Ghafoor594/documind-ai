import { useEffect, useRef, useState, type ReactNode } from "react";
import { Calendar, Clock, FileSearch, Search, SlidersHorizontal } from "lucide-react";
import { api, type Doc, type Params } from "../api";
import { useWorkspace } from "../context";
import { formatDate, formatTime, money } from "../lib/format";
import { STATUS_LABEL } from "../lib/labels";
import { useAsync, useDebounced } from "../lib/useAsync";
import { href } from "../router";
import { ReasonBadge, StatusBadge } from "./Badges";
import { EmptyState, ErrorState, ListSkeleton } from "./Feedback";
import { FilterSelect } from "./Form";
import { Pagination } from "./Pagination";

const SORTS: Record<string, { label: string; sort: string; order: string }> = {
  newest: { label: "Newest uploaded", sort: "uploaded", order: "desc" },
  oldest: { label: "Oldest uploaded", sort: "uploaded", order: "asc" },
  vendor: { label: "Vendor A–Z", sort: "vendor", order: "asc" },
  amount_desc: { label: "Amount: high to low", sort: "amount", order: "desc" },
  amount_asc: { label: "Amount: low to high", sort: "amount", order: "asc" },
  date: { label: "Document date: newest", sort: "date", order: "desc" },
};

export function DocRow({ doc, selected, to, showReasons }: { doc: Doc; selected: boolean; to: string; showReasons?: boolean }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => { if (selected) ref.current?.scrollIntoView?.({ block: "nearest" }); }, [selected]);
  return (
    <li>
      <a ref={ref} href={href(to)} aria-current={selected ? "true" : undefined}
        className={`block rounded-lg border bg-white p-3 shadow-card transition-colors ${selected ? "border-ink-200 border-l-4 border-l-brand-600 bg-ink-100" : "border-ink-200 hover:border-ink-300"}`}>
        <span className="flex items-start justify-between gap-2">
          <span className={`min-w-0 truncate text-sm font-semibold ${selected ? "text-brand-700" : "text-ink-900"}`}>{doc.fields.vendor ?? "Vendor not set"}</span>
          <StatusBadge status={doc.status} />
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-600">{doc.original_filename}</span>
        <span className="mt-2 flex items-end justify-between gap-2">
          <span className="space-y-1 text-xs text-ink-600">
            <span className="flex items-center gap-1"><Calendar className="h-3 w-3" aria-hidden />{formatDate(doc.fields.document_date)}</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden /><span className="sr-only">Uploaded at </span>{formatTime(doc.uploaded_at)}</span>
          </span>
          <span className="text-right">
            <span className="block text-sm font-semibold tabular-nums text-ink-900">{money(doc.fields.total_amount, doc.fields.currency)}</span>
            <span className={`block text-xs font-medium ${doc.verification_status === "confirmed" ? "text-emerald-700" : "text-ink-600"}`}>{doc.verification_status === "confirmed" ? "Verified" : "Unverified"}</span>
          </span>
        </span>
        {showReasons && doc.review_reasons.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1">{doc.review_reasons.filter((r) => r !== "needs_confirmation").slice(0, 2).map((r) => <ReasonBadge key={r} reason={r} />)}</span>
        )}
      </a>
    </li>
  );
}

interface Props {
  title: string; basePath: string; selectedId: number | null; source?: "documents" | "queue";
  extra?: Params; topSlot?: ReactNode; initialQ?: string; showStatusFilter?: boolean; showReasons?: boolean;
}

/** The list pane shared by Documents, AI Extraction and Review Queue. */
export default function DocumentBrowser({ title, basePath, selectedId, source = "documents", extra, topSlot, initialQ = "", showStatusFilter = true, showReasons }: Props) {
  const { meta, version } = useWorkspace();
  const [q, setQ] = useState(initialQ);
  const dq = useDebounced(q.trim(), 250);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sortKey, setSortKey] = useState("newest");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const extraKey = JSON.stringify(extra ?? {});
  const perPage = 12;
  const isDocs = source === "documents";
  const activeFilters = [type, isDocs && status, category].filter(Boolean).length;

  useEffect(() => setPage(1), [dq, type, status, category, sortKey, extraKey]);

  const params: Params = { q: dq, document_type: type, category, page, per_page: perPage, ...extra };
  if (isDocs) Object.assign(params, { status, sort: SORTS[sortKey].sort, order: SORTS[sortKey].order });
  const list = useAsync(() => (isDocs ? api.list(params) : api.queue(params)), [JSON.stringify(params), source, version]);
  const docs = list.data?.data ?? [];
  const pg = list.data?.meta;
  const filtered = Boolean(dq || activeFilters);
  const clear = () => { setQ(""); setType(""); setStatus(""); setCategory(""); };

  return (
    <>
      <div className="space-y-2.5 border-b border-ink-200 p-3">
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{title}{pg && <span className="ml-1.5 font-normal text-ink-600">({pg.total})</span>}</h2>
          <button className="btn-ghost btn-sm" aria-expanded={filtersOpen} aria-controls={`${basePath}-filters`} onClick={() => setFiltersOpen(!filtersOpen)}>
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Filters{activeFilters > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-bold text-white">{activeFilters}</span>}
          </button></div>
        <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-500" aria-hidden />
          <input type="search" className="input pl-8" placeholder="Search filename or vendor" aria-label={`Search ${title.toLowerCase()}`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {topSlot}
        {filtersOpen && (
          <div id={`${basePath}-filters`} className="grid grid-cols-2 gap-2">
            <FilterSelect label="Filter by document type" value={type} onChange={setType}><option value="">All types</option>{meta.document_types.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</FilterSelect>
            {isDocs && showStatusFilter && <FilterSelect label="Filter by status" value={status} onChange={setStatus}><option value="">All statuses</option>{meta.statuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</FilterSelect>}
            <FilterSelect label="Filter by category" value={category} onChange={setCategory}><option value="">All categories</option>{meta.categories.map((c) => <option key={c}>{c}</option>)}</FilterSelect>
            {isDocs && <FilterSelect label="Sort documents" value={sortKey} onChange={setSortKey}>{Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}</FilterSelect>}
            {filtered && <button className="btn-secondary btn-sm col-span-2" onClick={clear}>Clear search and filters</button>}
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.loading && !list.data ? <ListSkeleton /> : list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : docs.length === 0 ? (
          <EmptyState icon={FileSearch} title={filtered ? "No matching documents" : source === "queue" ? "Nothing to review" : "No documents yet"}
            action={filtered ? <button className="btn-secondary" onClick={clear}>Clear search and filters</button> : undefined}>
            {filtered ? "Try a different search or clear the filters." : source === "queue" ? "Everything uploaded has been confirmed." : "Upload an invoice or receipt to get started."}
          </EmptyState>
        ) : (
          <ul className="space-y-2 p-3" aria-label={title}>{docs.map((d) => <DocRow key={d.id} doc={d} selected={d.id === selectedId} to={`${basePath}/${d.id}`} showReasons={showReasons} />)}</ul>
        )}
      </div>
      {pg && <Pagination page={pg.page} pages={pg.pages} total={pg.total} perPage={pg.per_page} onPage={setPage} noun="documents" />}
    </>
  );
}
