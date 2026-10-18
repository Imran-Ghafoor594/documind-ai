"""QA tests: image uploads, OCR-unavailable paths, config parsing, CORS, and the
real HTTP code path of the AI provider against a local STUB server.

The stub is a test fixture standing in for a provider; it is NOT a real model."""
import io
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest
from PIL import Image, ImageDraw, ImageFont

from app import create_app
from app.config import Settings
from app.services import ocr
from tests.conftest import FakeProvider, make_pdf, make_settings

needs_ocr = pytest.mark.skipif(not ocr.is_available(), reason="Tesseract not installed")


def data_of(resp):
    return resp.get_json()["data"]


def image_bytes(fmt="PNG", text="Cafe Demo TOTAL 12.50 USD 2026-10-01"):
    img = Image.new("RGB", (1400, 220), "white")
    ImageDraw.Draw(img).text((20, 70), text, fill="black", font=ImageFont.load_default(size=60))
    buf = io.BytesIO()
    img.save(buf, fmt)
    return buf.getvalue()


def post(client, data, name):
    return client.post("/api/documents/upload", data={"file": (io.BytesIO(data), name)},
                       content_type="multipart/form-data")


# ---- image uploads through the real API --------------------------------------
@needs_ocr
@pytest.mark.parametrize("fmt,name", [("PNG", "r.png"), ("JPEG", "r.jpg"), ("JPEG", "r.jpeg")])
def test_image_upload_runs_ocr_then_ai(client, provider, fmt, name):
    doc = data_of(post(client, image_bytes(fmt), name))
    assert doc["status"] == "review_required" and doc["extraction_method"] == "ocr"
    assert doc["ai_status"] == "success"
    assert "12.50" in provider.calls[0][1]  # OCR text really reached the AI prompt
    assert client.get(f"/api/documents/{doc['id']}/file").mimetype in ("image/png", "image/jpeg")


def test_image_upload_when_ocr_unavailable_fails_clearly(client, monkeypatch):
    monkeypatch.setattr(ocr, "is_available", lambda: False)
    doc = data_of(post(client, image_bytes(), "r.png"))
    assert doc["status"] == "failed" and "Tesseract" in doc["processing_error"]
    assert doc["fields"]["vendor"] is None


def test_blank_pdf_without_ocr_fails_clearly(client, monkeypatch):
    import pymupdf
    d = pymupdf.open(); d.new_page()
    monkeypatch.setattr(ocr, "is_available", lambda: False)
    doc = data_of(post(client, d.tobytes(), "blank.pdf"))
    assert doc["status"] == "failed" and "OCR is not available" in doc["processing_error"]


def test_truncated_png_is_rejected_gracefully(client):
    doc = data_of(post(client, image_bytes()[:200], "cut.png"))
    assert doc["status"] == "failed" and "Traceback" not in (doc["processing_error"] or "")


def test_decompression_bomb_image_fails_not_crashes(client, tmp_path):
    big = Image.new("1", (9000, 9000), 1)  # 81M pixels > MAX_PIXELS
    buf = io.BytesIO(); big.save(buf, "PNG")
    doc = data_of(post(client, buf.getvalue(), "bomb.png"))
    assert doc["status"] == "failed"


# ---- config -----------------------------------------------------------------------
def test_config_from_env(monkeypatch, tmp_path):
    monkeypatch.setenv("MAX_UPLOAD_MB", "3")
    monkeypatch.setenv("CORS_ORIGINS", "http://a.test/, *, http://b.test")
    monkeypatch.setenv("AI_JSON_MODE", "false")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "u"))
    monkeypatch.setenv("DATABASE_URL", "sqlite:///data/x.db")
    s = Settings.from_env()
    assert s.max_upload_mb == 3 and s.ai_json_mode is False
    assert s.cors_origins == ["http://a.test", "http://b.test"]  # '*' ignored, slash trimmed
    assert s.database_url.endswith("/backend/data/x.db") and s.upload_dir == tmp_path / "u"
    assert s.ai_configured is False


def test_config_rejects_bad_numbers(monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "ten")
    with pytest.raises(ValueError):
        Settings.from_env()
    monkeypatch.setenv("MAX_UPLOAD_MB", "0")
    with pytest.raises(ValueError):
        Settings.from_env()


def test_database_file_is_created_on_disk(settings):
    create_app(settings)
    assert (settings.upload_dir.parent / "test.db").exists()


# ---- CORS ---------------------------------------------------------------------------
def test_cors_allows_only_configured_origin(tmp_path):
    c = create_app(make_settings(tmp_path, cors_origins=["http://good.test"]), ai_provider=FakeProvider()).test_client()
    ok = c.get("/api/health", headers={"Origin": "http://good.test"})
    bad = c.get("/api/health", headers={"Origin": "http://evil.test"})
    assert ok.headers.get("Access-Control-Allow-Origin") == "http://good.test"
    assert "Access-Control-Allow-Origin" not in bad.headers
    assert "Access-Control-Allow-Credentials" not in ok.headers


# ---- real HTTP path to an OpenAI-compatible endpoint (STUB server) -----------------
class Stub:
    def __init__(self):
        self.requests, self.status, self.body = [], 200, None
        stub = self

        class H(BaseHTTPRequestHandler):
            def do_POST(self):
                raw = self.rfile.read(int(self.headers["Content-Length"]))
                stub.requests.append({"path": self.path, "auth": self.headers.get("Authorization"),
                                      "json": json.loads(raw)})
                payload = stub.body if stub.body is not None else json.dumps(
                    {"choices": [{"message": {"content": json.dumps({
                        "document_type": "receipt", "vendor": "Stub Cafe", "document_date": "2026-10-01",
                        "currency": "USD", "total_amount": 12.5, "expense_category": "Meals & Entertainment"})}}]})
                self.send_response(stub.status); self.send_header("Content-Type", "application/json")
                self.end_headers(); self.wfile.write(payload.encode())

            def log_message(self, *a):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), H)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()
        self.url = f"http://127.0.0.1:{self.server.server_port}/v1"


@pytest.fixture
def stub():
    s = Stub()
    yield s
    s.server.shutdown()


def stub_client(tmp_path, stub, **kw):
    s = make_settings(tmp_path, ai_base_url=stub.url, ai_api_key="test-key", ai_model="stub-model",
                      ai_max_retries=0, ai_timeout_seconds=5, **kw)
    return create_app(s).test_client()  # no provider override: uses the real OpenAICompatibleProvider


def test_real_provider_http_roundtrip(tmp_path, stub):
    c = stub_client(tmp_path, stub)
    assert c.get("/api/health").get_json()["ai_configured"] is True
    doc = data_of(post(c, make_pdf(), "a.pdf"))
    req = stub.requests[0]
    assert req["path"] == "/v1/chat/completions" and req["auth"] == "Bearer test-key"
    assert req["json"]["model"] == "stub-model" and req["json"]["response_format"] == {"type": "json_object"}
    assert req["json"]["temperature"] == 0 and "UNTRUSTED" in req["json"]["messages"][0]["content"]
    assert doc["ai_status"] == "success" and doc["fields"]["vendor"] == "Stub Cafe"
    assert doc["fields"]["total_amount"] == "12.50" and doc["fields"]["currency"] == "USD"


def test_real_provider_json_mode_can_be_disabled(tmp_path, stub):
    post(stub_client(tmp_path, stub, ai_json_mode=False), make_pdf(), "a.pdf")
    assert "response_format" not in stub.requests[0]["json"]


@pytest.mark.parametrize("status,expect", [(401, "API key"), (404, "not found"), (429, "rate limit"), (500, "temporary")])
def test_real_provider_http_errors_surface_clearly(tmp_path, stub, status, expect):
    stub.status, stub.body = status, "{}"
    doc = data_of(post(stub_client(tmp_path, stub), make_pdf(), "a.pdf"))
    assert doc["status"] == "review_required" and doc["ai_status"] == "failed"
    assert expect in doc["ai_error"] and all(v is None for v in doc["fields"].values())


def test_real_provider_unreachable_host(tmp_path):
    s = make_settings(tmp_path, ai_base_url="http://127.0.0.1:1/v1", ai_api_key="k", ai_model="m",
                      ai_max_retries=0, ai_timeout_seconds=2)
    doc = data_of(post(create_app(s).test_client(), make_pdf(), "a.pdf"))
    assert doc["ai_status"] == "failed" and "reach" in doc["ai_error"]


def test_real_provider_garbage_body(tmp_path, stub):
    stub.body = "<html>gateway error</html>"
    doc = data_of(post(stub_client(tmp_path, stub), make_pdf(), "a.pdf"))
    assert doc["ai_status"] == "invalid_output"


def test_image_over_pixel_limit_is_rejected_even_below_pillow_hard_cap(client):
    """Regression: Pillow only warns between 1x and 2x MAX_IMAGE_PIXELS (49 MP here)."""
    buf = io.BytesIO(); Image.new("1", (7000, 7000), 1).save(buf, "PNG")
    doc = data_of(post(client, buf.getvalue(), "49mp.png"))
    assert doc["status"] == "failed" and "too large" in doc["processing_error"]
