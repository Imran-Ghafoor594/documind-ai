import type { Doc } from "../api";
import { fileSize, formatDate, formatDateTime, money } from "../lib/format";
import { TYPE_LABEL } from "../lib/labels";

export function DetailsList({ doc }: { doc: Doc }) {
  const f = doc.fields;
  const rows: [string, string][] = [
    ["Vendor", f.vendor ?? "—"], ["Document type", TYPE_LABEL(f.document_type)], ["Document date", formatDate(f.document_date)],
    ["Total", money(f.total_amount, f.currency)], ["Subtotal", money(f.subtotal, f.currency)], ["Tax", money(f.tax, f.currency)],
    ["Currency", f.currency ?? "—"], ["Category", f.expense_category ?? "—"], ["Summary", f.short_summary ?? "—"],
    ["Uploaded", formatDateTime(doc.uploaded_at)], ["File", `${fileSize(doc.size_bytes)}${doc.page_count ? ` · ${doc.page_count} page${doc.page_count > 1 ? "s" : ""}` : ""}`],
    ["Text read via", doc.extraction_method === "ocr" ? "OCR" : doc.extraction_method === "pdf_text" ? "PDF text layer" : "—"],
  ];
  return (
    <dl className="divide-y divide-ink-100 text-sm">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="shrink-0 text-ink-600">{k}</dt><dd className="min-w-0 break-words text-right font-medium">{v}</dd></div>)}
    </dl>
  );
}
