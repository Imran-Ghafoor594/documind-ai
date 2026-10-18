/**
 * UI tests: the real React app rendered in jsdom, talking over real HTTP to the real Flask backend
 * (backend/tests/qa_server.py). The AI endpoint behind that backend is a local STUB fixture, not a model.
 * Start the backend first:  cd backend && python -m tests.qa_server
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import { api, type Doc } from "../api";

const BASE = "http://127.0.0.1:5055";
const pdfBytes = readFileSync(join(__dirname, "sample.pdf"));
const pdf = (name = "demo.pdf") => new File([pdfBytes], name, { type: "application/pdf" });
const user = () => userEvent.setup({ applyAccept: false });

async function wipe() {
  const docs = await api.list({ per_page: 100 });
  for (const d of docs.data) await api.remove(d.id);
  for (const t of await api.templates()) await api.deleteTemplate(t.id);
  await api.saveSettings({ default_currency: "", date_format: "locale" });
}
const mount = (hash = "/") => { window.location.hash = hash; return render(<App />); };
const upload = (name?: string) => api.upload(pdf(name), null, () => {});
/** Upload a document, then set its vendor/currency through the real API (the stub AI returns the same values every time). */
async function seed(vendor: string, over: Record<string, string> = {}, confirm = false): Promise<Doc> {
  const d = await upload(`${vendor.toLowerCase().replace(/\W+/g, "-")}.pdf`);
  await api.update(d.id, { vendor, ...over });
  return confirm ? api.confirm(d.id, {}) : api.get(d.id);
}

beforeAll(async () => {
  const health = await fetch(BASE + "/api/health").then((r) => r.json());
  expect(health.status).toBe("ok");
});
beforeEach(async () => { await wipe(); });

describe("empty workspace", () => {
  it("shows an honest empty state, no fabricated metrics, and a working upload dialog", async () => {
    const u = user();
    mount("/");
    expect(await screen.findByText("No documents yet")).toBeInTheDocument();
    expect(screen.queryByText("Total documents")).not.toBeInTheDocument();
    expect(screen.queryByText("Confirmed expenses")).not.toBeInTheDocument();
    await u.click(screen.getAllByRole("button", { name: /upload/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: "Upload a document" });
    expect(within(dialog).getByText(/up to \d+ MB/)).toBeInTheDocument();
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("application shell", () => {
  it("has all nine sidebar destinations, marks the current page, and shows breadcrumbs", async () => {
    const u = user();
    mount("/");
    const nav = await screen.findByRole("navigation", { name: "Main" });
    for (const name of ["Overview", "Documents", "AI Extraction", "Review Queue", "Expenses", "Reports", "Templates", "Settings", "Help & Support"])
      expect(within(nav).getByRole("link", { name })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await u.click(within(nav).getByRole("link", { name: "Templates" }));
    await waitFor(() => expect(within(nav).getByRole("link", { name: "Templates" })).toHaveAttribute("aria-current", "page"));
    expect(within(nav).getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current");
    expect(await screen.findByRole("heading", { name: "Templates" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByText("Templates")).toBeInTheDocument();
  });

  it("shows a not-found page for unknown addresses", async () => {
    mount("/nope/123");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Overview" })).toBeInTheDocument();
  });

  it("opens and closes the mobile navigation drawer", async () => {
    const u = user();
    mount("/");
    await screen.findByRole("heading", { name: /welcome/i });
    await u.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Navigation menu" });
    await u.click(within(drawer).getByRole("link", { name: "Reports" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation menu" })).not.toBeInTheDocument());
    expect(await screen.findByRole("heading", { name: "Reports" })).toBeInTheDocument();
  });

  it("reports an unreachable backend with a retry option instead of a blank page", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network down"));
    mount("/");
    expect(await screen.findByText(/cannot reach the docuMind server/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    spy.mockRestore();
  });
});

describe("upload", () => {
  it("rejects unsupported files client-side, then uploads a PDF and lands on the review screen", async () => {
    const u = user();
    mount("/");
    await screen.findByText("No documents yet");
    await u.click(screen.getAllByRole("button", { name: /upload/i })[0]);
    const dialog = await screen.findByRole("dialog");
    const input = within(dialog).getByLabelText("Choose a document file");
    await u.upload(input, new File(["hello"], "notes.txt", { type: "text/plain" }));
    expect(await within(dialog).findByText(/unsupported file type/i)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Upload and extract" })).toBeDisabled();
    await u.upload(input, pdf("invoice.pdf"));
    const go = within(dialog).getByRole("button", { name: "Upload and extract" });
    await u.dblClick(go);   // a double click must not create two documents
    await waitFor(() => expect(window.location.hash).toMatch(/^#\/review\/\d+$/));
    expect(await screen.findByLabelText(/^Vendor/)).toHaveValue("Stub Cafe");
    expect((await api.list({ per_page: 50 })).data).toHaveLength(1);
  });
});

describe("review and confirmation", () => {
  it("saves edits, rejects invalid values with a visible message, then confirms and updates totals", async () => {
    const u = user();
    const d = await upload();
    mount(`/review/${d.id}`);
    const vendor = await screen.findByLabelText(/^Vendor/);
    expect(vendor).toHaveValue("Stub Cafe");
    expect(screen.getAllByText("AI").length).toBeGreaterThan(0);          // provenance tag per field
    await u.clear(vendor); await u.type(vendor, "Corner Bakery");
    await u.click(screen.getByRole("button", { name: /save without confirming/i }));
    await waitFor(async () => expect((await api.get(d.id)).fields.vendor).toBe("Corner Bakery"));
    expect((await api.get(d.id)).verification_status).toBe("unverified");
    expect(await screen.findByText("Edited by you")).toBeInTheDocument();

    const total = screen.getByLabelText(/^Total amount/);
    await u.clear(total); await u.type(total, "-5");
    await u.click(screen.getByRole("button", { name: /confirm and save/i }));
    expect(await screen.findByText(/non-negative/i)).toBeInTheDocument();
    expect(total).toHaveAttribute("aria-invalid", "true");
    expect((await api.get(d.id)).verification_status).toBe("unverified");

    await u.clear(total); await u.type(total, "12.50");
    await u.click(screen.getByRole("button", { name: /confirm and save/i }));
    await waitFor(async () => expect((await api.get(d.id)).verification_status).toBe("confirmed"));
    expect((await api.get(d.id)).status).toBe("completed");
    expect(await screen.findByText("Nothing waiting for review")).toBeInTheDocument();  // queue now empty
    const dash = await api.dashboard();
    expect(dash.summary).toEqual([expect.objectContaining({ currency: "USD", total: "12.50", count: 1 })]);
  });

  it("filters the queue by review reason and rejects (deletes) a document after confirmation", async () => {
    const u = user();
    const a = await seed("Complete Co");
    const b = await upload("missing.pdf");
    await api.update(b.id, { currency: "" });   // now missing a required field
    mount("/review");
    const queue = await screen.findByRole("region", { name: "Documents list" });
    await within(queue).findByText("Complete Co");
    await u.click(await within(queue).findByRole("button", { name: /missing required fields/i }));
    await waitFor(() => expect(within(queue).queryByText("Complete Co")).not.toBeInTheDocument());
    expect(within(queue).getByText("Stub Cafe")).toBeInTheDocument();
    await u.click(within(queue).getByRole("link", { name: /stub cafe/i }));
    await u.click(await screen.findByRole("button", { name: /reject and delete/i }));
    const confirm = await screen.findByRole("dialog", { name: /reject and delete/i });
    await u.click(within(confirm).getByRole("button", { name: "Cancel" }));
    expect((await api.get(b.id)).id).toBe(b.id);                           // cancel keeps it
    await u.click(screen.getByRole("button", { name: /reject and delete/i }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete document" }));
    await waitFor(async () => await expect(api.get(b.id)).rejects.toThrow(/not found/i));
    expect((await api.get(a.id)).id).toBe(a.id);
  });
});

describe("documents workspace", () => {
  it("lists real records, searches, sorts, selects, and shows details with the original preview", async () => {
    const u = user();
    await seed("Alpha Supplies", { total_amount: "100" });
    await seed("Zulu Hardware", { total_amount: "9" });
    const target = await seed("Mid Cafe", { total_amount: "25" });
    mount("/documents");
    const list = await screen.findByRole("region", { name: "Documents list" });
    await within(list).findByText("Alpha Supplies");
    expect(within(list).getAllByRole("link")).toHaveLength(3);
    await u.type(within(list).getByRole("searchbox"), "zulu");
    await waitFor(() => expect(within(list).getAllByRole("link")).toHaveLength(1));
    await u.clear(within(list).getByRole("searchbox"));
    await u.click(within(list).getByRole("button", { name: /filters/i }));
    await u.selectOptions(within(list).getByLabelText("Sort documents"), "Amount: low to high");
    await waitFor(() => expect(within(list).getAllByRole("link")[0]).toHaveTextContent("Zulu Hardware"));
    await u.selectOptions(within(list).getByLabelText("Filter by document type"), "invoice");
    await waitFor(() => expect(within(list).getByText(/no matching documents/i)).toBeInTheDocument());
    await u.click(within(list).getAllByRole("button", { name: /clear search and filters/i })[0]);
    await u.click(await within(list).findByRole("link", { name: /mid cafe/i }));
    expect(window.location.hash).toBe(`#/documents/${target.id}`);
    expect(await screen.findByRole("heading", { name: "Mid Cafe" })).toBeInTheDocument();
    expect(screen.getByText("Document details")).toBeInTheDocument();
    expect(screen.getByTitle(/PDF preview/)).toHaveAttribute("src", expect.stringContaining(`/api/documents/${target.id}/file`));
    expect(screen.getByRole("link", { name: /download/i })).toHaveAttribute("href", expect.stringContaining("download=1"));
  });

  it("deletes through the row menu only after the confirmation dialog", async () => {
    const u = user();
    const d = await seed("Delete Me");
    mount(`/documents/${d.id}`);
    await screen.findByRole("heading", { name: "Delete Me" });
    await u.click(screen.getByRole("button", { name: /more actions/i }));
    await u.click(await screen.findByRole("menuitem", { name: "Delete document" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete document" }));
    await waitFor(() => expect(window.location.hash).toBe("#/documents"));
    await expect(api.get(d.id)).rejects.toThrow(/not found/i);
  });

  it("shows an error state, not a crash, for a missing document", async () => {
    mount("/documents/999999");
    expect(await screen.findByText(/document not found/i)).toBeInTheDocument();
  });
});

describe("AI extraction page", () => {
  it("separates raw text, AI suggestions, current values and edits, and re-runs with a template", async () => {
    const u = user();
    const tpl = await api.createTemplate({ name: "Cafe", description: null, document_type: "receipt", fields: ["vendor", "total_amount", "currency"], default_category: "Meals & Entertainment" });
    const d = await seed("Edited Name");
    mount(`/extraction/${d.id}`);
    await screen.findByRole("heading", { name: "Edited Name" });
    expect(screen.getByText("Text read from the document")).toBeInTheDocument();
    expect(screen.getByLabelText("Extracted text")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /ai suggestion compared/i });
    expect(within(table).getByText("Stub Cafe")).toBeInTheDocument();     // what the AI said
    expect(within(table).getByText("Edited Name")).toBeInTheDocument();   // what is stored now
    expect(within(table).getByText("Edited by you")).toBeInTheDocument();
    expect(screen.getByText("stub-model")).toBeInTheDocument();
    expect(screen.getByText(/no confidence score is shown/i)).toBeInTheDocument();
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();           // no invented percentages
    await u.selectOptions(screen.getByLabelText("Template"), String(tpl.id));
    await u.click(screen.getByRole("button", { name: /run extraction again/i }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Run again" }));  // warns that edits are replaced
    await waitFor(async () => expect((await api.get(d.id)).template_id).toBe(tpl.id));
    const after = await api.get(d.id);
    expect(after.fields.vendor).toBe("Stub Cafe");
    expect(after.fields.document_date).toBeNull();                         // outside the template
    expect(after.field_sources.expense_category).toBeDefined();
  });
});

describe("templates", () => {
  it("creates, applies at upload, edits and deletes a template", async () => {
    const u = user();
    mount("/templates");
    expect(await screen.findByText("No templates yet")).toBeInTheDocument();
    await u.click(screen.getAllByRole("button", { name: /new template/i })[0]);
    const dialog = await screen.findByRole("dialog", { name: "New template" });
    await u.click(within(dialog).getByRole("button", { name: "Create template" }));
    expect(await within(dialog).findByText(/name is required/i)).toBeInTheDocument();   // server validation
    await u.type(within(dialog).getByLabelText("Template name"), "Lunch receipts");
    await u.selectOptions(within(dialog).getByLabelText(/default category/i), "Meals & Entertainment");
    await u.click(within(dialog).getByLabelText("Tax")); await u.click(within(dialog).getByLabelText("Subtotal"));
    await u.click(within(dialog).getByRole("button", { name: "Create template" }));
    expect(await screen.findByRole("heading", { name: "Lunch receipts" })).toBeInTheDocument();
    const saved = (await api.templates())[0];
    expect(saved.fields).not.toContain("tax");

    await u.click(screen.getByRole("button", { name: "Edit Lunch receipts" }));
    const edit = await screen.findByRole("dialog", { name: "Edit template" });
    const name = within(edit).getByLabelText("Template name");
    await u.clear(name); await u.type(name, "Lunches");
    await u.click(within(edit).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("heading", { name: "Lunches" })).toBeInTheDocument();

    await u.click(screen.getAllByRole("button", { name: /upload/i })[0]);           // template is offered at upload
    const up = await screen.findByRole("dialog", { name: "Upload a document" });
    expect(within(up).getByRole("option", { name: "Lunches" })).toBeInTheDocument();
    await u.click(within(up).getByRole("button", { name: "Cancel" }));

    await u.click(screen.getByRole("button", { name: "Delete Lunches" }));
    await u.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete template" }));
    expect(await screen.findByText("No templates yet")).toBeInTheDocument();
    expect(await api.templates()).toEqual([]);
  });
});

describe("expenses and reports", () => {
  it("counts only confirmed records, keeps currencies separate, filters, sorts and exports", async () => {
    const u = user();
    await seed("Usd Shop", { total_amount: "10", currency: "USD", document_date: "2026-09-10" }, true);
    await seed("Eur Shop", { total_amount: "40", currency: "EUR", document_date: "2026-09-20", expense_category: "Travel" }, true);
    await seed("Pending Shop", { total_amount: "999", currency: "USD" });          // unconfirmed: must not count
    mount("/expenses");
    const totals = await screen.findByRole("list", { name: "Totals by currency" });
    expect(within(totals).getAllByRole("listitem")).toHaveLength(2);
    expect(totals).toHaveTextContent(/€40\.00/);
    expect(totals).toHaveTextContent(/\$10\.00/);
    expect(totals).not.toHaveTextContent("999");
    const table = await screen.findByRole("table", { name: "Confirmed expenses" });
    expect(within(table).queryByText("Pending Shop")).not.toBeInTheDocument();
    await u.click(within(table).getByRole("button", { name: /^Amount/ }));
    await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("row")[1]).toHaveTextContent("Eur Shop"));   // high to low
    await u.selectOptions(screen.getByLabelText("Currency"), "EUR");
    await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2));
    expect(screen.getByRole("link", { name: /export csv \(filtered\)/i }).getAttribute("href")).toContain("currency=EUR");
    await u.click(screen.getByRole("button", { name: /reset filters/i }));
    await waitFor(() => expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(3));
    await u.click(within(screen.getByRole("table")).getByRole("button", { name: "Usd Shop" }));
    expect(await screen.findByRole("dialog", { name: "Usd Shop" })).toBeInTheDocument();
  });

  it("shows a helpful empty state with a reset action when filters match nothing", async () => {
    const u = user();
    await seed("Only Shop", { total_amount: "5", currency: "USD", document_date: "2026-09-10" }, true);
    mount("/expenses");
    await screen.findByRole("table", { name: "Confirmed expenses" });
    await u.type(screen.getByLabelText("Search vendor"), "zzz");
    expect(await screen.findByText("No expenses match these filters")).toBeInTheDocument();
    await u.click(screen.getAllByRole("button", { name: /reset filters/i })[0]);
    expect(await screen.findByRole("table", { name: "Confirmed expenses" })).toBeInTheDocument();
  });

  it("builds reports from stored records with per-section CSV links and a date range", async () => {
    const u = user();
    await seed("Aug Shop", { total_amount: "30", currency: "USD", document_date: "2026-08-15" }, true);
    await seed("Sep Shop", { total_amount: "70", currency: "USD", document_date: "2026-09-15" }, true);
    mount("/reports");
    expect(await screen.findByRole("table", { name: "Monthly totals" })).toBeInTheDocument();
    expect(screen.getByText("2026-08")).toBeInTheDocument();
    expect(screen.getByText(/\$100\.00/, { selector: "strong" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /csv/i }).map((a) => a.getAttribute("href")).join(" ")).toMatch(/section=monthly.*section=categories.*section=vendors/);
    expect(screen.getByText(/PDF export isn't available/i)).toBeInTheDocument();
    await u.type(screen.getByLabelText("From date"), "2026-09-01");
    await waitFor(() => expect(screen.queryByText("2026-08")).not.toBeInTheDocument());
    expect(screen.getByText("2026-09")).toBeInTheDocument();
    expect(screen.getByText("Document processing summary")).toBeInTheDocument();
  });
});

describe("settings and help", () => {
  it("saves preferences on the server, validates them, never shows secrets, and states the privacy reality", async () => {
    const u = user();
    mount("/settings");
    const currency = await screen.findByLabelText("Default currency");
    await u.type(currency, "eur");
    await u.selectOptions(screen.getByLabelText("Date display"), "2026-10-31 (year-month-day)");
    await u.click(screen.getByRole("button", { name: /save preferences/i }));
    await waitFor(async () => expect((await api.settings()).preferences).toEqual({ default_currency: "EUR", date_format: "iso" }));
    expect(screen.getByText("stub-model")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("qa-key");                // the API key is never in the page
    expect(screen.getByText(/this is not local-only processing/i)).toBeInTheDocument();
    expect(screen.getByText(/anyone who can open this app can see every document/i)).toBeInTheDocument();
  });

  it("applies the chosen date format throughout the app", async () => {
    await api.saveSettings({ date_format: "dmy" });
    await seed("Dated Shop", { document_date: "2026-03-05", total_amount: "5", currency: "USD" }, true);
    mount("/expenses");
    expect(await screen.findByText("05/03/2026")).toBeInTheDocument();
  });

  it("documents real behaviour in Help & Support, without fake contact details", async () => {
    mount("/help");
    expect(await screen.findByRole("heading", { name: "Help & Support" })).toBeInTheDocument();
    for (const t of ["Uploading documents", "How extraction works", "Reviewing and confirming values", "Exporting expenses and reports", "Common OCR problems", "AI provider troubleshooting", "Privacy limitations"])
      expect(screen.getByText(t)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}|\+?\d[\d\s-]{8,}\d/i);   // no email/phone numbers
  });
});

describe("global search", () => {
  it("finds documents as you type and opens the selected one", async () => {
    const u = user();
    const d = await seed("Searchable Vendor");
    await seed("Other Place");
    mount("/");
    const box = await screen.findByRole("combobox", { name: /search documents/i });
    await u.type(box, "searchable");
    const option = await screen.findByRole("option", { name: /searchable vendor/i });
    expect(screen.queryByRole("option", { name: /other place/i })).not.toBeInTheDocument();
    await u.click(option);
    expect(window.location.hash).toBe(`#/documents/${d.id}`);
  });
});
