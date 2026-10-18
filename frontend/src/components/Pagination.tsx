import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, pages, total, perPage, onPage, noun = "items" }: { page: number; pages: number; total: number; perPage: number; onPage: (p: number) => void; noun?: string }) {
  if (total === 0) return null;
  const from = (page - 1) * perPage + 1, to = Math.min(total, page * perPage);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-2 border-t border-ink-200 px-3 py-2 text-xs text-ink-600">
      <span aria-live="polite">{from}–{to} of {total} {noun}</span>
      <div className="flex items-center gap-1">
        <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" aria-hidden /></button>
        <span className="px-1">Page {page} of {pages}</span>
        <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" aria-hidden /></button>
      </div>
    </nav>
  );
}
