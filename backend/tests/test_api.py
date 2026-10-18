import io

import pytest

from app import create_app
from tests.conftest import FakeProvider, make_pdf, make_settings


def doc_of(resp):
    return resp.get_json()["data"]


# ---- health / empty dashboard -------------------------------------------------
def test_health_reports_status_without_secrets(client):
    body = client.get("/api/health").get_json()
    assert body["status"] == "ok" and body["database"] == "ok"
    assert set(body) == {"status", "version", "database", "ocr_available", "ai_configured"}


def test_empty_dashboard_has_no_fabricated_numbers(client):
    data = doc_of(client.get("/api/dashboard"))
    assert data["is_empty"] is True
    assert data["counts"] == {"documents": 0, "processed": 0, "awaiting_review": 0, "confirmed": 0,
                              "failed": 0, "needs_attention": 0}
    assert data["summary"] == [] and data["recent"] == [] and data["attention"] == [] and data["activity"] == []


# ---- upload validation ----------------------------------------------------------
def test_valid_pdf_upload_extracts_text_and_ai_fields(upload, provider):
    resp = upload()
    assert resp.status_code == 201
    doc = doc_of(resp)
    assert doc["status"] == "review_required" and doc["verification_status"] == "unverified"
    assert doc["extraction_method"] == "pdf_text" and doc["ai_status"] == "success"
    assert doc["fields"]["vendor"] == "Example Stationery"
    assert doc["fields"]["total_amount"] == "4500.00" and doc["fields"]["currency"] == "PKR"
    assert "stored_name" not in doc and "upload" not in str(doc).lower().replace("uploaded_at", "")
    # untrusted document text is delimited and the prompt warns about it
    system, user = provider.calls[0]
    assert "UNTRUSTED" in system and "<document>" in user


@pytest.mark.parametrize("filename,data,code", [
    ("malware.exe", b"MZ\x90\x00", 415),
    ("notes.txt", b"hello", 415),
    ("fake.pdf", b"this is not a pdf", 415),            # extension lies
    ("photo.png", make_pdf(), 415),                      # content type mismatch
    ("empty.pdf", b"", 400),
])
def test_invalid_uploads_rejected(upload, filename, data, code):
    assert upload(data, filename).status_code == code


def test_missing_file_field(client):
    assert client.post("/api/documents/upload", data={}).status_code == 400


def test_oversized_upload_rejected(tmp_path):
    app = create_app(make_settings(tmp_path, max_upload_mb=1), ai_provider=FakeProvider())
    big = b"%PDF-" + b"0" * (2 * 1024 * 1024)
    resp = app.test_client().post("/api/documents/upload",
                                  data={"file": (io.BytesIO(big), "big.pdf")}, content_type="multipart/form-data")
    assert resp.status_code == 413
    assert "limit is 1 MB" in resp.get_json()["error"]["message"]


def test_corrupt_pdf_is_saved_as_failed_with_clear_error(upload):
    doc = doc_of(upload(b"%PDF-1.4\ngarbage that is not really a pdf", "bad.pdf"))
    assert doc["status"] == "failed" and doc["processing_error"]
    assert "Traceback" not in doc["processing_error"]


def test_path_traversal_filename_is_neutralised(upload, settings):
    doc = doc_of(upload(make_pdf(), "../../etc/passwd.pdf"))
    assert doc["original_filename"] == "passwd.pdf"
    assert not any(p.name == "passwd.pdf" for p in settings.upload_dir.parent.rglob("*"))


# ---- AI behaviour -----------------------------------------------------------------
def test_missing_ai_credentials_clear_message_not_fake_data(tmp_path):
    app = create_app(make_settings(tmp_path))  # no provider, no credentials
    client = app.test_client()
    assert client.get("/api/health").get_json()["ai_configured"] is False
    resp = client.post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), "a.pdf")},
                       content_type="multipart/form-data")
    doc = doc_of(resp)
    assert resp.status_code == 201 and doc["status"] == "review_required"
    assert doc["ai_status"] == "not_configured" and "not configured" in doc["ai_error"]
    assert all(v is None for v in doc["fields"].values())  # nothing pretended


@pytest.mark.parametrize("reply", ["I'm sorry, I can't help with that.", "[1, 2, 3]", '{"foo": "bar"}', "{broken json"])
def test_invalid_model_output_is_handled(tmp_path, reply):
    app = create_app(make_settings(tmp_path), ai_provider=FakeProvider(reply=reply))
    resp = app.test_client().post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), "a.pdf")},
                                  content_type="multipart/form-data")
    doc = doc_of(resp)
    assert doc["status"] == "review_required" and doc["ai_status"] == "invalid_output"
    assert all(v is None for v in doc["fields"].values())


def test_model_values_are_validated_not_trusted(tmp_path):
    bad = ('{"vendor": "X", "currency": "$", "total_amount": -50, "document_date": "10/11/2026", '
           '"expense_category": "Made Up", "document_type": "receipt", "subtotal": "abc"}')
    app = create_app(make_settings(tmp_path), ai_provider=FakeProvider(reply=bad))
    doc = doc_of(app.test_client().post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), "a.pdf")},
                                        content_type="multipart/form-data"))
    f = doc["fields"]
    assert f["vendor"] == "X" and f["document_type"] == "receipt"
    assert f["currency"] is None and f["total_amount"] is None and f["document_date"] is None
    assert f["expense_category"] is None and f["subtotal"] is None
    assert len(doc["warnings"]) >= 5


def test_fenced_json_is_accepted(tmp_path):
    reply = "```json\n" + '{"vendor": "Fenced Co", "currency": "usd", "total_amount": "1,234.5"}' + "\n```"
    app = create_app(make_settings(tmp_path), ai_provider=FakeProvider(reply=reply))
    doc = doc_of(app.test_client().post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), "a.pdf")},
                                        content_type="multipart/form-data"))
    assert doc["fields"]["currency"] == "USD" and doc["fields"]["total_amount"] == "1234.50"


# ---- listing / persistence / edit / confirm / delete --------------------------------------
def test_listing_search_filter_and_pagination(client, upload):
    for _ in range(3):
        upload()
    body = client.get("/api/documents?per_page=2").get_json()
    assert len(body["data"]) == 2 and body["meta"]["total"] == 3 and body["meta"]["pages"] == 2
    assert client.get("/api/documents?q=stationery").get_json()["meta"]["total"] == 3
    assert client.get("/api/documents?q=nomatch").get_json()["meta"]["total"] == 0
    assert client.get("/api/documents?q=%25").get_json()["meta"]["total"] == 0  # % is literal
    assert client.get("/api/documents?category=Travel").get_json()["meta"]["total"] == 0
    assert client.get("/api/documents?status=review_required").get_json()["meta"]["total"] == 3
    assert client.get("/api/documents?status=bogus").status_code == 400
    assert client.get("/api/documents?page=abc").status_code == 400


def test_database_persistence_across_app_instances(settings, upload, client):
    doc_id = doc_of(upload())["id"]
    other = create_app(settings, ai_provider=FakeProvider()).test_client()
    assert doc_of(other.get(f"/api/documents/{doc_id}"))["fields"]["vendor"] == "Example Stationery"


def test_missing_and_invalid_ids(client):
    assert client.get("/api/documents/9999").status_code == 404
    assert client.get("/api/documents/abc").status_code == 404
    assert client.delete("/api/documents/9999").status_code == 404
    assert client.get("/api/nope").get_json()["error"]["code"] == "not_found"


def test_edit_fields_tracks_corrections_and_validates(client, upload):
    doc_id = doc_of(upload())["id"]
    resp = client.put(f"/api/documents/{doc_id}", json={"vendor": "Corrected Vendor", "tax": "600"})
    doc = doc_of(resp)
    assert resp.status_code == 200 and doc["fields"]["vendor"] == "Corrected Vendor"
    assert doc["fields"]["tax"] == "600.00" and set(doc["corrected_fields"]) == {"vendor", "tax"}
    assert doc["ai_fields"]["vendor"] == "Example Stationery"        # AI snapshot preserved
    assert doc["consistency_warnings"]                              # 4000 + 600 != 4500
    for payload in ({"total_amount": "-5"}, {"currency": "dollars"}, {"document_date": "2026-13-45"},
                    {"expense_category": "Nope"}):
        bad = client.put(f"/api/documents/{doc_id}", json=payload)
        assert bad.status_code == 422 and bad.get_json()["error"]["details"]
    assert client.put(f"/api/documents/{doc_id}", json={"stored_name": "x"}).status_code == 400
    assert client.put(f"/api/documents/{doc_id}", data="notjson").status_code == 400


def test_confirm_workflow_and_dashboard_update(client, upload):
    doc_id = doc_of(upload())["id"]
    assert doc_of(client.get("/api/dashboard"))["summary"] == []          # unconfirmed never counted
    assert doc_of(client.get("/api/dashboard"))["counts"]["awaiting_review"] == 1
    resp = client.post(f"/api/documents/{doc_id}/confirm")
    doc = doc_of(resp)
    assert doc["status"] == "completed" and doc["verification_status"] == "confirmed" and doc["confirmed_at"]
    dash = doc_of(client.get("/api/dashboard"))
    assert dash["counts"]["awaiting_review"] == 0 and dash["counts"]["confirmed"] == 1
    cur = dash["summary"][0]
    assert cur["currency"] == "PKR" and cur["total"] == "4500.00"
    assert cur["monthly"] == [{"month": "2026-10", "total": "4500.00", "count": 1}]
    assert cur["categories"] == [{"category": "Office Supplies", "total": "4500.00", "count": 1}]
    assert cur["vendors"] == [{"vendor": "Example Stationery", "total": "4500.00", "count": 1}]
    # editing a confirmed document reopens it for review and removes it from totals
    client.put(f"/api/documents/{doc_id}", json={"vendor": "Changed"})
    assert doc_of(client.get("/api/dashboard"))["summary"] == []


def test_confirm_requires_complete_fields_and_can_apply_edits(tmp_path):
    app = create_app(make_settings(tmp_path), ai_provider=FakeProvider(reply='{"vendor": "Only Vendor"}'))
    client = app.test_client()
    doc_id = doc_of(client.post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), "a.pdf")},
                                content_type="multipart/form-data"))["id"]
    resp = client.post(f"/api/documents/{doc_id}/confirm")
    assert resp.status_code == 422
    assert set(resp.get_json()["error"]["details"]["missing"]) == {
        "document_type", "currency", "total_amount", "expense_category"}
    resp = client.post(f"/api/documents/{doc_id}/confirm", json={"fields": {
        "document_type": "receipt", "currency": "EUR", "total_amount": "12.5", "expense_category": "Travel"}})
    assert resp.status_code == 200 and doc_of(resp)["verification_status"] == "confirmed"


def test_currencies_are_never_mixed(tmp_path):
    replies = iter(['{"vendor":"A","document_type":"invoice","currency":"USD","total_amount":10,"expense_category":"Travel"}',
                    '{"vendor":"B","document_type":"invoice","currency":"PKR","total_amount":500,"expense_category":"Travel"}'])

    class Seq(FakeProvider):
        def complete(self, system, user):
            return next(replies)

    client = create_app(make_settings(tmp_path), ai_provider=Seq()).test_client()
    for _ in range(2):
        doc_id = doc_of(client.post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), "a.pdf")},
                                    content_type="multipart/form-data"))["id"]
        client.post(f"/api/documents/{doc_id}/confirm")
    summary = doc_of(client.get("/api/expenses/summary"))["currencies"]
    assert {c["currency"]: c["total"] for c in summary} == {"PKR": "500.00", "USD": "10.00"}
    assert len(doc_of(client.get("/api/expenses/summary?currency=usd"))["currencies"]) == 1


def test_delete_removes_record_and_file(client, upload, settings):
    doc_id = doc_of(upload())["id"]
    assert len(list(settings.upload_dir.iterdir())) == 1
    assert client.get(f"/api/documents/{doc_id}/file").status_code == 200
    assert client.delete(f"/api/documents/{doc_id}").status_code == 200
    assert client.get(f"/api/documents/{doc_id}").status_code == 404
    assert list(settings.upload_dir.iterdir()) == []
    assert doc_of(client.get("/api/dashboard"))["is_empty"] is True


def test_reprocess_after_ai_becomes_available(tmp_path):
    settings = make_settings(tmp_path)
    client = create_app(settings).test_client()  # no AI
    doc_id = doc_of(client.post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), "a.pdf")},
                                content_type="multipart/form-data"))["id"]
    client2 = create_app(settings, ai_provider=FakeProvider()).test_client()
    doc = doc_of(client2.post(f"/api/documents/{doc_id}/reprocess"))
    assert doc["ai_status"] == "success" and doc["fields"]["vendor"] == "Example Stationery"


def test_interrupted_documents_are_marked_failed_on_startup(settings, client, upload):
    from app.db import get_session
    from app.models import Document
    doc_id = doc_of(upload())["id"]
    with client.application.app_context():
        s = get_session()
        s.get(Document, doc_id).status = "processing"
        s.commit()
    restarted = create_app(settings, ai_provider=FakeProvider()).test_client()
    assert doc_of(restarted.get(f"/api/documents/{doc_id}"))["status"] == "failed"


# ---- CSV export ------------------------------------------------------------------------------
def test_csv_export_confirmed_only_with_formula_protection(client, upload):
    first, second = doc_of(upload())["id"], doc_of(upload())["id"]
    client.put(f"/api/documents/{first}", json={"vendor": "=HYPERLINK(\"http://evil\")"})
    client.post(f"/api/documents/{first}/confirm")
    client.put(f"/api/documents/{second}", json={"vendor": "Still Unconfirmed"})
    resp = client.get("/api/export/csv")
    text = resp.get_data(as_text=True)
    assert resp.mimetype == "text/csv" and "attachment" in resp.headers["Content-Disposition"]
    lines = text.lstrip("\ufeff").strip().splitlines()
    assert lines[0].startswith("Vendor,Document date,Document type,Currency,Subtotal,Tax,Total")
    assert len(lines) == 2 and "Unconfirmed" not in text
    assert "'=HYPERLINK" in lines[1] and ",PKR,4000.00,500.00,4500.00,Office Supplies,confirmed" in lines[1]
    assert client.get("/api/export/csv?category=Travel").get_data(as_text=True).strip().count("\n") == 0
    assert client.get("/api/export/csv?date_from=bad").status_code == 400
