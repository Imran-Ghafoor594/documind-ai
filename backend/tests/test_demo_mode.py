"""Free demo access gate and its production/development isolation."""
import io
import pytest
from app import create_app
from app.config import ConfigError, Settings
from .conftest import FakeProvider, make_pdf, make_settings


def test_demo_requires_strong_secrets(monkeypatch, tmp_path):
    monkeypatch.setenv("APP_ENV", "demo")
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'demo.db'}")
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("CORS_ORIGINS", "https://documind-demo-web.onrender.com")
    monkeypatch.setenv("GROQ_API_KEY", "fake-only-not-live")
    monkeypatch.setenv("MAX_UPLOAD_MB", "3")
    monkeypatch.setenv("MAX_PDF_PAGES", "3")
    monkeypatch.setenv("OCR_DPI", "100")
    monkeypatch.delenv("DEMO_ACCESS_CODE", raising=False)
    with pytest.raises(ConfigError, match="DEMO_ACCESS_CODE"):
        Settings.from_env()
    monkeypatch.setenv("DEMO_ACCESS_CODE", "a-strong-16-character-code")
    monkeypatch.delenv("DEMO_SIGNING_SECRET", raising=False)
    with pytest.raises(ConfigError, match="DEMO_SIGNING_SECRET"):
        Settings.from_env()
    monkeypatch.setenv("DEMO_SIGNING_SECRET", "this-is-only-for-tests-not-a-real-secret-123456")
    assert Settings.from_env().demo_mode
    monkeypatch.setenv("MAX_PDF_PAGES", "5")
    with pytest.raises(ConfigError, match="PDF"):
        Settings.from_env()


def test_demo_gate_covers_private_and_binary_endpoints(tmp_path, monkeypatch):
    settings = make_settings(tmp_path).with_overrides(
        demo_mode=True, demo_access_code="a-strong-16-character-code",
        demo_signing_secret="this-is-only-for-tests-not-a-real-secret-123456",
        max_upload_mb=3, max_pdf_pages=3, ocr_dpi=100,
        cors_origins=["https://documind-demo-web.onrender.com"],
    )
    # No local OCR installation is necessary to run the access-control test.
    from app.services import ocr
    import pytesseract
    monkeypatch.setattr(ocr, "is_available", lambda: True)
    monkeypatch.setattr(pytesseract, "get_languages", lambda **kwargs: ["eng"])
    app = create_app(settings, ai_provider=FakeProvider())
    client = app.test_client()
    assert client.get("/api/health").status_code == 200
    for uri in ["/api/dashboard", "/api/documents", "/api/expenses/summary",
                "/api/export/csv", "/api/reports/summary", "/api/documents/1/file"]:
        assert client.get(uri).status_code == 401
    assert client.post("/api/demo/unlock", json={"code": "wrong"}).status_code == 401
    login = client.post("/api/demo/unlock", json={"code": settings.demo_access_code})
    assert login.status_code == 200
    token = login.json["data"]["token"]
    auth = {"Authorization": f"Bearer {token}"}
    assert client.get("/api/demo/session", headers=auth).status_code == 200
    assert client.get("/api/dashboard", headers=auth).status_code == 200
    assert client.get("/api/export/csv", headers=auth).status_code == 200
    assert client.get("/api/dashboard", headers={"Authorization": "Bearer fake"}).status_code == 401
    r = client.post("/api/documents/upload", data={"file": (io.BytesIO(make_pdf()), "test.pdf")}, headers=auth)
    assert r.status_code == 201
    doc_id = r.json["data"]["id"]
    assert client.get(f"/api/documents/{doc_id}/file").status_code == 401
    assert client.get(f"/api/documents/{doc_id}/file", headers=auth).status_code == 200
    assert client.get("/api/dashboard", headers={"Origin": "https://evil.example", **auth}).headers.get("Access-Control-Allow-Origin") is None
    assert client.get("/api/dashboard", headers={"Origin": settings.cors_origins[0], **auth}).headers.get("Access-Control-Allow-Origin") == settings.cors_origins[0]
    assert r.headers["Cache-Control"] == "no-store"
