export const STATUS_LABEL: Record<string, string> = {
  uploaded: "Uploaded", processing: "Processing", review_required: "Review required", completed: "Completed", failed: "Failed",
};
export const REASON_LABEL: Record<string, string> = {
  failed: "Processing failed", missing_fields: "Missing required fields", ai_unavailable: "No AI result",
  warnings: "Uncertain values", needs_confirmation: "Awaiting confirmation",
};
export const FIELD_LABEL: Record<string, string> = {
  vendor: "Vendor", document_type: "Document type", document_date: "Document date", currency: "Currency",
  subtotal: "Subtotal", tax: "Tax", total_amount: "Total amount", expense_category: "Expense category", short_summary: "Short summary",
};
export const FIELD_ORDER = ["vendor", "document_type", "document_date", "currency", "subtotal", "tax", "total_amount", "expense_category", "short_summary"] as const;
export const REQUIRED_FIELDS = ["document_type", "vendor", "currency", "total_amount", "expense_category"];
export const SOURCE_LABEL: Record<string, string> = { ai: "AI", template: "Template", user: "You" };
export const TYPE_LABEL = (t: string | null | undefined) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "—");
