export interface Fields {
  document_type: string | null; vendor: string | null; document_date: string | null; currency: string | null;
  subtotal: string | null; tax: string | null; total_amount: string | null; expense_category: string | null; short_summary: string | null;
}
export type FieldName = keyof Fields;
export type FieldSource = "ai" | "template" | "user" | null;

export interface Doc {
  id: number; original_filename: string; mime_type: string; size_bytes: number; uploaded_at: string;
  status: "uploaded" | "processing" | "review_required" | "completed" | "failed";
  verification_status: "unverified" | "confirmed"; confirmed_at: string | null; processing_error: string | null;
  extraction_method: string | null; page_count: number | null;
  ai_status: "pending" | "success" | "not_configured" | "failed" | "invalid_output" | "skipped";
  ai_error: string | null; ai_model: string | null; template_id: number | null;
  fields: Fields; field_sources: Record<FieldName, FieldSource>; ai_fields: Fields | null;
  corrected_fields: string[]; warnings: string[]; consistency_warnings: string[]; missing_required: string[];
  review_reasons: string[]; extracted_text?: string | null;
}

export interface Template {
  id: number; name: string; description: string | null; document_type: string | null; fields: FieldName[];
  default_category: string | null; document_count: number; created_at: string; updated_at: string;
}
export type TemplateInput = Omit<Template, "id" | "document_count" | "created_at" | "updated_at">;

export interface CurrencySummary {
  currency: string; total: string; count: number;
  monthly: { month: string; total: string; count: number }[];
  categories: { category: string; total: string; count: number }[];
  vendors: { vendor: string; total: string; count: number }[];
  undated_total: string; undated_count: number;
}
export interface Activity { type: "uploaded" | "confirmed"; at: string; document_id: number; label: string }
export interface Dashboard {
  is_empty: boolean;
  counts: { documents: number; processed: number; awaiting_review: number; confirmed: number; failed: number; needs_attention: number };
  summary: CurrencySummary[]; recent: Doc[]; attention: Doc[]; activity: Activity[]; ai_configured: boolean; ocr_available: boolean;
}
export interface Meta {
  categories: string[]; document_types: string[]; statuses: string[]; max_upload_mb: number;
  allowed_extensions: string[]; ai_configured: boolean; ocr_available: boolean;
}
export interface Prefs { default_currency: string; date_format: "locale" | "iso" | "dmy" | "mdy" }
export interface SystemInfo {
  ai_configured: boolean; ai_provider: string | null; ai_model: string | null; ocr_available: boolean; ocr_languages: string;
  max_upload_mb: number; max_pdf_pages: number; allowed_extensions: string[];
}
export interface Page { page: number; per_page: number; total: number; pages: number; counts?: Record<string, number> }
export interface ProcessingSummary {
  total: number; by_status: Record<string, number>; by_verification: Record<string, number>;
  by_ai_status: Record<string, number>; by_extraction_method: Record<string, number>;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public details?: Record<string, unknown>) { super(message); }
}

export const API_BASE: string = ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "").replace(/\/$/, "");
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const DEMO_TOKEN_KEY = "documind-demo-token";
export const getDemoToken = () => DEMO_MODE ? sessionStorage.getItem(DEMO_TOKEN_KEY) : null;
export function setDemoToken(token: string | null) {
  if (token) sessionStorage.setItem(DEMO_TOKEN_KEY, token);
  else sessionStorage.removeItem(DEMO_TOKEN_KEY);
}
function authorizedHeaders(existing?: HeadersInit): Headers {
  const headers = new Headers(existing);
  const token = getDemoToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}


function toError(status: number, body: any): ApiError {
  const err = body?.error;
  return new ApiError(err?.message ?? "Something went wrong. Please try again.", status, err?.details);
}

async function request<T>(path: string, init?: RequestInit): Promise<{ data: T; meta?: Page }> {
  let res: Response;
  try { res = await fetch(API_BASE + path, { ...init, headers: authorizedHeaders(init?.headers) }); }
  catch { throw new ApiError("Cannot reach the DocuMind server. Check that the backend is running.", 0); }
  const body = await res.json().catch(() => null);
  if (!res.ok) throw toError(res.status, body);
  return body;
}

const json = (method: string, payload?: unknown): RequestInit => ({
  method, headers: { "Content-Type": "application/json" }, body: payload === undefined ? undefined : JSON.stringify(payload),
});
const qs = (p?: Record<string, string | number | undefined | null>) => {
  const u = new URLSearchParams();
  Object.entries(p ?? {}).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== "") u.set(k, String(v)); });
  return u;
};
export type Params = Record<string, string | number | undefined | null>;

export const api = {
  unlockDemo: (code: string) => request<{ token: string; expires_in: number }>("/api/demo/unlock", json("POST", { code })).then((r) => r.data),
  demoSession: () => request<{ active: boolean }>("/api/demo/session").then((r) => r.data),
  dashboard: () => request<Dashboard>("/api/dashboard").then((r) => r.data),
  meta: () => request<Meta>("/api/meta").then((r) => r.data),
  settings: () => request<{ preferences: Prefs; system: SystemInfo }>("/api/settings").then((r) => r.data),
  saveSettings: (p: Partial<Prefs>) => request<{ preferences: Prefs; system: SystemInfo }>("/api/settings", json("PUT", p)).then((r) => r.data),
  templates: () => request<Template[]>("/api/templates").then((r) => r.data),
  createTemplate: (t: TemplateInput) => request<Template>("/api/templates", json("POST", t)).then((r) => r.data),
  updateTemplate: (id: number, t: TemplateInput) => request<Template>(`/api/templates/${id}`, json("PUT", t)).then((r) => r.data),
  deleteTemplate: (id: number) => request<{ deleted: number }>(`/api/templates/${id}`, { method: "DELETE" }),
  summary: (p?: Params) => request<{ currencies: CurrencySummary[] }>("/api/expenses/summary?" + qs(p)).then((r) => r.data.currencies),
  report: (p?: Params) => request<{ currencies: CurrencySummary[]; processing: ProcessingSummary }>("/api/reports/summary?" + qs(p)).then((r) => r.data),
  list: (p?: Params) => request<Doc[]>("/api/documents?" + qs(p)),
  queue: (p?: Params) => request<Doc[]>("/api/review/queue?" + qs(p)),
  get: (id: number) => request<Doc>(`/api/documents/${id}`).then((r) => r.data),
  update: (id: number, fields: Partial<Record<FieldName, string | null>>) => request<Doc>(`/api/documents/${id}`, json("PUT", fields)).then((r) => r.data),
  confirm: (id: number, fields: Partial<Record<FieldName, string | null>>) => request<Doc>(`/api/documents/${id}/confirm`, json("POST", { fields })).then((r) => r.data),
  reprocess: (id: number, templateId?: number | null) =>
    request<Doc>(`/api/documents/${id}/reprocess`, json("POST", templateId === undefined ? {} : { template_id: templateId })).then((r) => r.data),
  remove: (id: number) => request<{ deleted: number }>(`/api/documents/${id}`, { method: "DELETE" }),
  fileUrl: (id: number, download = false) => `${API_BASE}/api/documents/${id}/file${download ? "?download=1" : ""}`,
  csvUrl: (p?: Params) => `${API_BASE}/api/export/csv?${qs(p)}`,
  reportCsvUrl: (section: string, p?: Params) => `${API_BASE}/api/reports/csv?${qs({ ...p, section })}`,

  /** XHR (not fetch) so we can report real upload progress. */
  upload(file: File, templateId: number | null, onProgress: (fraction: number) => void): Promise<Doc> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", API_BASE + "/api/documents/upload");
      const token = getDemoToken();
      if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onerror = () => reject(new ApiError("Cannot reach the DocuMind server. Check that the backend is running.", 0));
      xhr.onload = () => {
        let body: any = null;
        try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON error page */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(body.data as Doc); else reject(toError(xhr.status, body));
      };
      const form = new FormData();
      form.append("file", file);
      if (templateId != null) form.append("template_id", String(templateId));
      xhr.send(form);
    });
  },
};
