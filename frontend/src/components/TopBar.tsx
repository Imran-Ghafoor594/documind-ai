import { useEffect, useId, useRef, useState } from "react";
import { ChevronRight, Menu as MenuIcon, Search, Upload } from "lucide-react";
import { api, type Doc } from "../api";
import { useWorkspace } from "../context";
import { money } from "../lib/format";
import { useDebounced } from "../lib/useAsync";
import { href, navigate, type Route } from "../router";
import { NAV } from "./Sidebar";
import { StatusBadge } from "./Badges";

export function Breadcrumbs({ route, crumb }: { route: Route; crumb: string | null }) {
  const section = NAV.find((n) => n.name === route.name);
  const items = [{ label: "DocuMind", to: "/" }];
  if (section) items.push({ label: section.label, to: section.to });
  if (route.name === "notfound") items.push({ label: "Not found", to: "" });
  if (crumb) items.push({ label: crumb, to: "" });
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 sm:block">
      <ol className="flex items-center gap-1 text-sm text-ink-600">
        {items.map((it, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            {i === items.length - 1 ? <span aria-current="page" className="max-w-[16rem] truncate font-semibold text-ink-900">{it.label}</span>
              : <a className="hover:text-ink-900 hover:underline" href={href(it.to)}>{it.label}</a>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function GlobalSearch() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const [results, setResults] = useState<Doc[] | null>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!dq) { setResults(null); return; }
    let live = true;
    api.list({ q: dq, per_page: 6 }).then((r) => { if (live) { setResults(r.data); setActive(-1); } }).catch(() => live && setResults([]));
    return () => { live = false; };
  }, [dq]);
  useEffect(() => {
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, []);

  const go = (id: number) => { setOpen(false); setQ(""); navigate(`/documents/${id}`); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown" && results?.length) { e.preventDefault(); setActive((a) => (a + 1) % results.length); }
    if (e.key === "ArrowUp" && results?.length) { e.preventDefault(); setActive((a) => (a <= 0 ? results.length - 1 : a - 1)); }
    if (e.key === "Enter" && q.trim()) {
      e.preventDefault();
      if (active >= 0 && results?.[active]) go(results[active].id);
      else { setOpen(false); navigate(`/documents?q=${encodeURIComponent(q.trim())}`); }
    }
  };

  return (
    <div ref={box} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-ink-500" aria-hidden />
      <input type="search" role="combobox" aria-expanded={open && !!dq} aria-controls={listId} aria-autocomplete="list" aria-label="Search documents by filename or vendor"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="input pl-9" placeholder="Search documents…" value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey} />
      {open && dq && (
        <ul id={listId} role="listbox" aria-label="Search results" className="absolute left-0 right-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-lg border border-ink-200 bg-white py-1 shadow-pop">
          {results === null && <li className="px-3 py-2 text-sm text-ink-600">Searching…</li>}
          {results?.length === 0 && <li className="px-3 py-2 text-sm text-ink-600">No documents match “{dq}”.</li>}
          {results?.map((d, i) => (
            <li key={d.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); go(d.id); }}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${i === active ? "bg-brand-50" : "hover:bg-ink-50"}`}>
              <span className="min-w-0"><span className="block truncate text-sm font-medium">{d.fields.vendor ?? d.original_filename}</span>
                <span className="block truncate text-xs text-ink-600">{d.original_filename}{d.fields.total_amount && ` · ${money(d.fields.total_amount, d.fields.currency)}`}</span></span>
              <StatusBadge status={d.status} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TopBar({ route, crumb, onMenu }: { route: Route; crumb: string | null; onMenu: () => void }) {
  const { openUpload } = useWorkspace();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-white px-3 sm:px-5">
      <button className="rounded-lg p-2 text-ink-700 hover:bg-ink-100 lg:hidden" onClick={onMenu} aria-label="Open navigation menu"><MenuIcon className="h-5 w-5" aria-hidden /></button>
      <Breadcrumbs route={route} crumb={crumb} />
      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 sm:flex-none"><GlobalSearch /></div>
      <button className="btn-primary" onClick={openUpload}><Upload className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Upload</span><span className="sr-only sm:hidden">Upload document</span></button>
    </header>
  );
}
