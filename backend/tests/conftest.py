import io

import pymupdf
import pytest

from app import create_app
from app.config import Settings

SAMPLE_TEXT = ("Example Stationery\nInvoice INV-001\nDate: 2026-10-10\n"
               "Subtotal PKR 4000.00\nTax PKR 500.00\nTotal PKR 4500.00\nThank you for your business")

GOOD_AI_JSON = ('{"document_type": "receipt", "vendor": "Example Stationery", "document_date": "2026-10-10", '
                '"currency": "PKR", "subtotal": 4000, "tax": 500, "total_amount": 4500, '
                '"expense_category": "Office Supplies", "short_summary": "Stationery purchase"}')


class FakeProvider:
    def __init__(self, reply=GOOD_AI_JSON, error=None):
        self.reply, self.error, self.calls = reply, error, []

    def complete(self, system, user):
        self.calls.append((system, user))
        if self.error:
            raise self.error
        return self.reply


def make_pdf(text=SAMPLE_TEXT) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), text, fontsize=12)
    return doc.tobytes()


def make_settings(tmp_path, **kw) -> Settings:
    return Settings(database_url=f"sqlite:///{(tmp_path / 'test.db').as_posix()}",
                    upload_dir=tmp_path / "uploads", **kw)


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture
def provider():
    return FakeProvider()


@pytest.fixture
def app(settings, provider):
    return create_app(settings, ai_provider=provider)


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def upload(client):
    def _upload(data=None, filename="invoice.pdf"):
        data = make_pdf() if data is None else data
        return client.post("/api/documents/upload", data={"file": (io.BytesIO(data), filename)},
                           content_type="multipart/form-data")
    return _upload
