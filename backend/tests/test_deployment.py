"""Deployment regressions: real Tesseract, mocked AI transport, optional real PostgreSQL."""
import io
import os
from pathlib import Path

import pymupdf
import pytest
from sqlalchemy import create_engine, text

from app import create_app
from app.config import ConfigError, Settings, _database_url
from app.services.ai import OpenAICompatibleProvider
from app.services import ocr
from .conftest import FakeProvider, GOOD_AI_JSON, make_pdf, make_settings


def test_render_urls():
    for url in ('postgres://u:p@host/db', 'postgresql://u:p@host/db'):
        assert _database_url(url) == 'postgresql+psycopg://u:p@host/db'


def test_production_refuses_sqlite(monkeypatch):
    monkeypatch.setenv('APP_ENV', 'production')
    monkeypatch.setenv('DATABASE_URL', 'sqlite:///data/no.db')
    with pytest.raises(ConfigError, match='PostgreSQL'):
        Settings.from_env()


def test_groq_settings_and_request(monkeypatch):
    monkeypatch.setenv('GROQ_API_KEY', 'test-only')
    for key in ('AI_PROVIDER', 'AI_BASE_URL', 'AI_MODEL', 'APP_ENV'):
        monkeypatch.delenv(key, raising=False)
    settings = Settings.from_env()
    class HTTP:
        def post(self, url, **kw):
            assert url == 'https://api.groq.com/openai/v1/chat/completions'
            assert kw['headers']['Authorization'] == 'Bearer test-only'
            assert kw['json']['model'] == 'openai/gpt-oss-20b'
            assert kw['json']['response_format'] == {'type': 'json_object'}
            assert kw['json']['reasoning_effort'] == 'low'
            assert kw['json']['max_completion_tokens'] == 4096
            class Response:
                status_code = 200
                def json(self):
                    return {'choices': [{'message': {'content': GOOD_AI_JSON}}]}
            return Response()
    assert OpenAICompatibleProvider(settings, session=HTTP()).complete('system', 'document') == GOOD_AI_JSON


def raster_fixtures():
    with pymupdf.open(stream=make_pdf(), filetype='pdf') as native:
        png = native[0].get_pixmap(dpi=150).tobytes('png')
    with pymupdf.open() as scan:
        page = scan.new_page()
        page.insert_image(page.rect, stream=png)
        scanned_pdf = scan.tobytes()
    return [('native.pdf', make_pdf(), 'pdf_text'), ('scan.pdf', scanned_pdf, 'ocr'), ('image.png', png, 'ocr')]


def test_real_ocr_review_restart(tmp_path):
    if not ocr.is_available():
        pytest.skip('System Tesseract required for real OCR integration')
    s = make_settings(tmp_path)
    app = create_app(s, ai_provider=FakeProvider())
    client = app.test_client()
    ids = []
    for name, data, method in raster_fixtures():
        response = client.post('/api/documents/upload', data={'file': (io.BytesIO(data), name)})
        assert response.status_code == 201
        doc = response.json['data']
        assert doc['extraction_method'] == method
        assert doc['ai_status'] == 'success'  # fake AI, real native extraction/OCR
        assert doc['status'] == 'review_required'
        detail = client.get(f'/api/documents/{doc["id"]}').json['data']
        assert 'Stationery' in detail['extracted_text']
        confirmed = client.post(f'/api/documents/{doc["id"]}/confirm', json={'fields': {'vendor': 'Reviewed vendor'}})
        assert confirmed.status_code == 200
        assert confirmed.json['data']['verification_status'] == 'confirmed'
        ids.append(doc['id'])
    app.extensions['db_engine'].dispose()
    restarted = create_app(s, ai_provider=FakeProvider()).test_client()
    for doc_id in ids:
        assert restarted.get(f'/api/documents/{doc_id}').json['data']['fields']['vendor'] == 'Reviewed vendor'
        assert restarted.get(f'/api/documents/{doc_id}/file').status_code == 200


def test_cors_and_busy(client, app):
    assert client.get('/api/health', headers={'Origin': 'http://localhost:5173'}).headers['Access-Control-Allow-Origin'] == 'http://localhost:5173'
    assert 'Access-Control-Allow-Origin' not in client.get('/api/health', headers={'Origin': 'https://untrusted.example'}).headers
    slot = app.extensions['processing_slot']
    slot.acquire()
    try:
        response = client.post('/api/documents/upload', data={'file': (io.BytesIO(make_pdf()), 'test.pdf')})
        assert response.status_code == 503
        assert response.json['error']['code'] == 'processing_busy'
        assert client.get('/api/health').status_code == 200
    finally:
        slot.release()


def test_postgres_workflow(tmp_path):
    # Use a dedicated disposable DB. Never point this at production.
    url = os.getenv('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL not provided')
    settings = make_settings(tmp_path).with_overrides(database_url=_database_url(url))
    app = create_app(settings, ai_provider=FakeProvider())
    client = app.test_client()
    doc_ids = []
    try:
        for name, content, method in raster_fixtures():
            r = client.post('/api/documents/upload', data={'file': (io.BytesIO(content), name)})
            assert r.status_code == 201
            doc = r.json['data']; doc_ids.append(doc['id'])
            assert doc['extraction_method'] == method
            assert client.post(f'/api/documents/{doc["id"]}/confirm', json={}).status_code == 200
        app.extensions['db_engine'].dispose()
        client = create_app(settings, ai_provider=FakeProvider()).test_client()
        for doc_id in doc_ids:
            assert client.get(f'/api/documents/{doc_id}').json['data']['verification_status'] == 'confirmed'
            assert client.get(f'/api/documents/{doc_id}/file').status_code == 200
        for endpoint in ('/api/dashboard', '/api/reports/summary', '/api/expenses/summary', '/api/export/csv'):
            assert client.get(endpoint).status_code == 200
    finally:
        for doc_id in doc_ids:
            client.delete(f'/api/documents/{doc_id}')
