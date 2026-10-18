"""Templates, settings, review queue, reports, sorting/filters, download, migration."""
import io
import json
import sqlite3

import pytest

from app import create_app
from tests.conftest import FakeProvider, make_pdf, make_settings


def D(resp):
    return resp.get_json()["data"]


def rec(vendor="V", currency="USD", total=10, category="Travel", dtype="invoice", date="2026-10-01", **extra):
    return json.dumps({"vendor": vendor, "currency": currency, "total_amount": total, "expense_category": category,
                       "document_type": dtype, "document_date": date, **extra})


class Seq(FakeProvider):
    """Returns the given replies in order (a test fixture, not a model)."""
    def __init__(self, *replies):
        super().__init__()
        self.replies = list(replies)

    def complete(self, system, user):
        self.calls.append((system, user))
        return self.replies.pop(0)


def up(client, name="a.pdf", **form):
    return client.post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), name), **form},
                       content_type="multipart/form-data")


def client_with(tmp_path, *replies, **kw):
    return create_app(make_settings(tmp_path, **kw), ai_provider=Seq(*replies)).test_client()


# ------------------------------------------------------------------ templates CRUD
def test_template_crud_validation_and_unique_names(client):
    body = {"name": "Receipts", "fields": ["total_amount", "vendor", "vendor"], "document_type": "receipt",
            "default_category": "Meals & Entertainment", "description": "Quick receipts"}
    resp = client.post("/api/templates", json=body)
    t = D(resp)
    assert resp.status_code == 201 and t["fields"] == ["vendor", "total_amount"]  # canonical order, deduplicated
    assert client.post("/api/templates", json={**body, "name": "  receipts "}).status_code == 409
    bad = client.post("/api/templates", json={"name": "", "fields": ["nope"], "document_type": "x", "default_category": "y"})
    assert bad.status_code == 422 and set(bad.get_json()["error"]["details"]) == {"name", "fields", "document_type", "default_category"}
    assert client.post("/api/templates", json={"name": "X", "fields": []}).status_code == 422
    assert client.post("/api/templates", data="nope").status_code == 400

    upd = client.put(f"/api/templates/{t['id']}", json={**body, "name": "Receipts v2", "fields": ["vendor"]})
    assert upd.status_code == 200 and D(upd)["name"] == "Receipts v2" and D(upd)["fields"] == ["vendor"]
    client.post("/api/templates", json={"name": "Other", "fields": ["vendor"]})
    assert client.put(f"/api/templates/{t['id']}", json={**body, "name": "other"}).status_code == 409
    assert [x["name"] for x in D(client.get("/api/templates"))] == ["Other", "Receipts v2"]
    assert client.put("/api/templates/999", json=body).status_code == 404
    assert client.delete("/api/templates/999").status_code == 404


def test_template_is_enforced_in_code_and_defaults_are_labelled(tmp_path):
    full = rec(vendor="Cafe", total=12.5, category=None, dtype=None, subtotal=10, tax=2.5)
    client = client_with(tmp_path, full)
    tid = D(client.post("/api/templates", json={"name": "Lite", "fields": ["vendor", "total_amount", "currency"],
                                                "document_type": "receipt", "default_category": "Meals & Entertainment"}))["id"]
    doc = D(up(client, template_id=str(tid)))
    f = doc["fields"]
    assert (f["vendor"], f["total_amount"], f["currency"]) == ("Cafe", "12.50", "USD")
    assert f["subtotal"] is None and f["tax"] is None and f["document_date"] is None   # outside the template
    assert doc["ai_fields"]["subtotal"] is None                                         # snapshot is restricted too
    assert f["document_type"] == "receipt" and f["expense_category"] == "Meals & Entertainment"
    assert doc["field_sources"]["vendor"] == "ai" and doc["field_sources"]["expense_category"] == "template"
    assert doc["corrected_fields"] == [] and doc["template_id"] == tid
    assert "Extract ONLY these keys" in client.application.config["AI_PROVIDER_OVERRIDE"].calls[0][1]
    # a user edit flips provenance to "user"
    edited = D(client.put(f"/api/documents/{doc['id']}", json={"expense_category": "Travel"}))
    assert edited["field_sources"]["expense_category"] == "user" and "expense_category" in edited["corrected_fields"]
    assert D(client.get("/api/templates"))[0]["document_count"] == 1


def test_template_defaults_apply_without_ai_but_are_not_called_ai(tmp_path):
    client = create_app(make_settings(tmp_path)).test_client()   # no AI configured
    tid = D(client.post("/api/templates", json={"name": "T", "fields": ["vendor"], "default_category": "Rent"}))["id"]
    doc = D(up(client, template_id=tid))
    assert doc["ai_status"] == "not_configured" and doc["ai_fields"] is None
    assert doc["fields"]["expense_category"] == "Rent" and doc["field_sources"]["expense_category"] == "template"
    assert doc["fields"]["vendor"] is None


def test_upload_and_reprocess_template_handling(tmp_path):
    client = client_with(tmp_path, rec(), rec(vendor="Second"), rec(vendor="Third"))
    assert up(client, template_id="999").status_code == 422
    assert up(client, template_id="abc").status_code == 422
    tid = D(client.post("/api/templates", json={"name": "T", "fields": ["vendor"]}))["id"]
    doc = D(up(client))
    assert doc["template_id"] is None
    again = D(client.post(f"/api/documents/{doc['id']}/reprocess", json={"template_id": tid}))
    assert again["template_id"] == tid and again["fields"]["currency"] is None and again["fields"]["vendor"] == "Second"
    cleared = D(client.post(f"/api/documents/{doc['id']}/reprocess", json={"template_id": None}))
    assert cleared["template_id"] is None and cleared["fields"]["currency"] == "USD"
    assert client.post(f"/api/documents/{doc['id']}/reprocess", json={"template_id": 12345}).status_code == 422


def test_deleting_template_keeps_documents(tmp_path):
    client = client_with(tmp_path, rec())
    tid = D(client.post("/api/templates", json={"name": "T", "fields": ["vendor", "currency", "total_amount"]}))["id"]
    doc = D(up(client, template_id=tid))
    assert client.delete(f"/api/templates/{tid}").status_code == 200
    kept = D(client.get(f"/api/documents/{doc['id']}"))
    assert kept["template_id"] is None and kept["fields"]["vendor"] == "V"


# ------------------------------------------------------------------ sorting / filtering
def test_sorting_is_numeric_and_case_insensitive_with_empties_last(tmp_path):
    client = client_with(tmp_path, rec("zeta", total=9), rec("Alpha", total=100), rec("beta", total=25), '{"vendor": null}')
    for _ in range(4):
        up(client)
    names = lambda q: [d["fields"]["vendor"] for d in D(client.get("/api/documents?" + q))]
    assert names("sort=amount&order=asc") == ["zeta", "beta", "Alpha", None]       # 9 < 25 < 100 (not "100" < "9")
    assert names("sort=amount&order=desc") == ["Alpha", "beta", "zeta", None]
    assert names("sort=vendor&order=asc") == ["Alpha", "beta", "zeta", None]
    assert client.get("/api/documents?sort=bogus").status_code == 400
    assert client.get("/api/documents?order=sideways").status_code == 400


def test_document_type_and_category_filters(tmp_path):
    client = client_with(tmp_path, rec(dtype="invoice"), rec(dtype="receipt", category="Rent"))
    up(client); up(client)
    assert client.get("/api/documents?document_type=receipt").get_json()["meta"]["total"] == 1
    assert client.get("/api/documents?document_type=receipt&category=Travel").get_json()["meta"]["total"] == 0


# ------------------------------------------------------------------ review queue
def test_review_queue_reasons_counts_and_exclusions(tmp_path):
    client = client_with(tmp_path, rec(), '{"vendor": "Only"}', rec(vendor="Warn", subtotal=100, tax=1, total=500))
    ok_id = D(up(client))["id"]
    miss_id = D(up(client))["id"]
    warn_id = D(up(client))["id"]
    bad_id = D(client.post("/api/documents/upload", data={"file": (io.BytesIO(b"%PDF-1.4\nnot a pdf"), "bad.pdf")},
                           content_type="multipart/form-data"))["id"]
    client.post(f"/api/documents/{ok_id}/confirm")
    body = client.get("/api/review/queue").get_json()
    ids = [d["id"] for d in body["data"]]
    assert ok_id not in ids and set(ids) == {miss_id, warn_id, bad_id}
    assert body["meta"]["counts"] == {"total": 3, "failed": 1, "missing_fields": 1, "needs_confirmation": 2, "warnings": 1}
    by = lambda reason: {d["id"] for d in client.get(f"/api/review/queue?reason={reason}").get_json()["data"]}
    assert by("failed") == {bad_id} and by("missing_fields") == {miss_id} and by("warnings") == {warn_id}
    assert client.get("/api/review/queue?reason=nope").status_code == 400
    page = client.get("/api/review/queue?per_page=2&page=2").get_json()
    assert len(page["data"]) == 1 and page["meta"]["pages"] == 2
    # fixing and confirming a document removes it from the queue
    client.post(f"/api/documents/{miss_id}/confirm", json={"fields": {
        "document_type": "receipt", "currency": "USD", "total_amount": 5, "expense_category": "Travel"}})
    assert miss_id not in [d["id"] for d in client.get("/api/review/queue").get_json()["data"]]


def test_no_ai_documents_are_flagged_ai_unavailable(tmp_path):
    client = create_app(make_settings(tmp_path)).test_client()
    doc = D(up(client))
    assert {"ai_unavailable", "missing_fields", "needs_confirmation"} <= set(doc["review_reasons"])


# ------------------------------------------------------------------ reports + expenses filters
def seed(tmp_path):
    client = client_with(tmp_path, rec("Acme", "USD", 100, "Travel", "invoice", "2026-08-15"),
                         rec("acme ", "USD", 50.5, "Travel", "receipt", "2026-09-10"),
                         rec("=EVIL()", "EUR", 70, "Rent", "invoice", "2026-09-20"),
                         rec("Undated", "USD", 5, "Other", "receipt", None), rec("Unconfirmed"))
    for _ in range(5):
        doc = D(up(client))
        if doc["fields"]["vendor"] != "Unconfirmed":
            client.post(f"/api/documents/{doc['id']}/confirm")
    return client


def test_reports_are_currency_aware_and_date_filtered(tmp_path):
    client = seed(tmp_path)
    cur = {c["currency"]: c for c in D(client.get("/api/reports/summary"))["currencies"]}
    assert cur["USD"]["total"] == "155.50" and cur["USD"]["count"] == 3 and cur["EUR"]["total"] == "70.00"
    assert [(m["month"], m["total"], m["count"]) for m in cur["USD"]["monthly"]] == [("2026-08", "100.00", 1), ("2026-09", "50.50", 1)]
    assert cur["USD"]["undated_count"] == 1
    assert {v["vendor"]: v["count"] for v in cur["USD"]["vendors"]}["Acme"] == 2     # same vendor, different casing/spacing
    sept = D(client.get("/api/reports/summary?date_from=2026-09-01&date_to=2026-09-30"))["currencies"]
    assert {c["currency"]: c["total"] for c in sept} == {"USD": "50.50", "EUR": "70.00"}
    only_usd = D(client.get("/api/reports/summary?currency=usd"))["currencies"]
    assert [c["currency"] for c in only_usd] == ["USD"]
    proc = D(client.get("/api/reports/summary"))["processing"]
    assert proc["total"] == 5 and proc["by_verification"] == {"confirmed": 4, "unverified": 1}
    assert proc["by_ai_status"] == {"success": 5} and proc["by_extraction_method"] == {"pdf_text": 5}
    assert client.get("/api/reports/summary?date_from=bad").status_code == 400


def test_expense_summary_honors_filters(tmp_path):
    client = seed(tmp_path)
    tot = lambda q: {c["currency"]: c["total"] for c in D(client.get("/api/expenses/summary?" + q))["currencies"]}
    assert tot("category=Travel") == {"USD": "150.50"}
    assert tot("document_type=invoice") == {"USD": "100.00", "EUR": "70.00"}
    assert tot("q=acme&date_from=2026-09-01") == {"USD": "50.50"}


def test_reports_csv_sections_and_formula_protection(tmp_path):
    client = seed(tmp_path)
    resp = client.get("/api/reports/csv?section=vendors")
    lines = resp.get_data(as_text=True).lstrip("\ufeff").strip().splitlines()
    assert resp.mimetype == "text/csv" and lines[0] == "Currency,Vendor,Records,Total"
    assert any(l.startswith("EUR,'=EVIL()") for l in lines)
    monthly = client.get("/api/reports/csv?section=monthly").get_data(as_text=True)
    assert "USD,2026-09,1,50.50" in monthly
    assert client.get("/api/reports/csv?section=nope").status_code == 400


def test_dashboard_attention_and_activity_come_from_records(tmp_path):
    client = client_with(tmp_path, rec(), '{"vendor": "Missing stuff"}')
    first = D(up(client))["id"]
    D(up(client))
    client.post(f"/api/documents/{first}/confirm")
    dash = D(client.get("/api/dashboard"))
    assert dash["counts"]["processed"] == 2 and dash["counts"]["needs_attention"] == 1
    assert [d["fields"]["vendor"] for d in dash["attention"]] == ["Missing stuff"]
    assert {(e["type"], e["document_id"]) for e in dash["activity"]} >= {("uploaded", first), ("confirmed", first)}


# ------------------------------------------------------------------ settings, secrets, download
def test_settings_defaults_update_and_validation(client):
    s = D(client.get("/api/settings"))
    assert s["preferences"] == {"default_currency": "", "date_format": "locale"}
    upd = client.put("/api/settings", json={"default_currency": "pkr", "date_format": "iso"})
    assert D(upd)["preferences"] == {"default_currency": "PKR", "date_format": "iso"}
    assert D(client.get("/api/settings"))["preferences"]["default_currency"] == "PKR"   # persisted
    assert D(client.put("/api/settings", json={"default_currency": ""}))["preferences"]["default_currency"] == ""
    for bad in ({"default_currency": "dollars"}, {"date_format": "weird"}, {"theme": "dark"}):
        resp = client.put("/api/settings", json=bad)
        assert resp.status_code == 422 and resp.get_json()["error"]["details"]


def test_api_key_never_appears_in_any_response(tmp_path):
    secret = "sk-SUPER-SECRET-123"
    settings = make_settings(tmp_path, ai_base_url="https://ai.example/v1", ai_api_key=secret, ai_model="my-model")
    client = create_app(settings, ai_provider=Seq(rec())).test_client()
    doc = D(up(client))
    paths = ["/api/health", "/api/meta", "/api/settings", "/api/dashboard", "/api/documents",
             f"/api/documents/{doc['id']}", "/api/templates", "/api/review/queue", "/api/reports/summary"]
    for path in paths:
        assert secret not in client.get(path).get_data(as_text=True), path
    system = D(client.get("/api/settings"))["system"]
    assert system["ai_configured"] is True and system["ai_model"] == "my-model" and "ai_api_key" not in system
    assert doc["ai_model"] == "my-model" and "ai.example" not in json.dumps(system)


def test_download_original_vs_inline(client, upload):
    doc_id = D(upload(filename="My Invoice.pdf"))["id"]
    inline = client.get(f"/api/documents/{doc_id}/file")
    assert inline.status_code == 200 and "attachment" not in inline.headers.get("Content-Disposition", "")
    dl = client.get(f"/api/documents/{doc_id}/file?download=1")
    assert "attachment" in dl.headers["Content-Disposition"] and "My Invoice.pdf" in dl.headers["Content-Disposition"]
    assert dl.data.startswith(b"%PDF-")


# ------------------------------------------------------------------ migration of an older database file
def test_old_database_file_is_migrated_in_place(tmp_path):
    db = tmp_path / "test.db"
    con = sqlite3.connect(db)
    con.executescript("""
      CREATE TABLE documents (id INTEGER PRIMARY KEY, original_filename VARCHAR(255) NOT NULL, stored_name VARCHAR(64) NOT NULL UNIQUE,
        mime_type VARCHAR(50) NOT NULL, size_bytes INTEGER NOT NULL, uploaded_at DATETIME NOT NULL, status VARCHAR(20) NOT NULL,
        verification_status VARCHAR(20) NOT NULL, confirmed_at DATETIME, processing_error TEXT, extraction_method VARCHAR(20),
        page_count INTEGER, extracted_text TEXT, ai_status VARCHAR(20) NOT NULL, ai_error TEXT, ai_fields JSON,
        corrected_fields JSON, warnings JSON, document_type VARCHAR(20), vendor VARCHAR(200), document_date DATE,
        currency VARCHAR(3), subtotal VARCHAR(32), tax VARCHAR(32), total_amount VARCHAR(32), expense_category VARCHAR(40),
        short_summary VARCHAR(500));
      INSERT INTO documents (id, original_filename, stored_name, mime_type, size_bytes, uploaded_at, status, verification_status,
        ai_status, corrected_fields, warnings, vendor, currency, total_amount, document_type, expense_category)
      VALUES (1, 'old.pdf', 'a' || hex(zeroblob(15)) || '.pdf', 'application/pdf', 10, '2026-01-01 00:00:00', 'completed', 'confirmed',
        'success', '[]', '[]', 'Legacy Co', 'USD', '42.00', 'invoice', 'Other');
    """)
    con.commit(); con.close()
    client = create_app(make_settings(tmp_path), ai_provider=Seq(rec())).test_client()
    old = D(client.get("/api/documents/1"))
    assert old["fields"]["vendor"] == "Legacy Co" and old["template_id"] is None and old["ai_model"] is None
    assert D(client.get("/api/dashboard"))["summary"][0]["total"] == "42.00"
    new_doc = D(up(client))                      # new columns are writable after migration
    assert new_doc["ai_model"] is None or isinstance(new_doc["ai_model"], str)
    cols = {r[1] for r in sqlite3.connect(db).execute("PRAGMA table_info(documents)")}
    assert {"template_id", "template_filled", "ai_model"} <= cols
