"""Live HTTP acceptance test; runs without any laptop OCR installation.
Creates synthetic documents on the target; cleans up only those IDs unless --keep.
"""
import argparse
import json
from pathlib import Path
import requests

p = argparse.ArgumentParser()
p.add_argument('--api', required=True, help='Backend origin, without /api')
p.add_argument('--origin', required=True, help='Deployed frontend origin')
p.add_argument('--keep', action='store_true', help='Keep test data for redeploy persistence test')
p.add_argument('--verify', type=Path, help='Verify prior --keep manifest after redeploy')
p.add_argument('--manifest', type=Path, default=Path('smoke-results.json'))
a = p.parse_args()
base = a.api.rstrip('/')
s = requests.Session()

def call(method, path, **kwargs):
    response = s.request(method, base + path, timeout=240, **kwargs)
    response.raise_for_status()
    return response

def verify(record):
    doc = call('GET', f'/api/documents/{record["id"]}').json()['data']
    assert doc['verification_status'] == 'confirmed'
    assert doc['fields']['vendor'] == 'Deployment QA reviewed'
    assert doc['ai_status'] == 'success'
    assert doc['extraction_method'] == record['method']
    assert call('GET', f'/api/documents/{record["id"]}/file').content == (Path(__file__).resolve().parents[1] / 'tests/fixtures' / record['name']).read_bytes()

health = call('GET', '/api/health').json()
assert health['database'] == 'ok' and health['ocr_available'] and health['ai_configured'], health
assert call('GET', '/api/meta', headers={'Origin': a.origin}).headers.get('Access-Control-Allow-Origin') == a.origin
assert 'Access-Control-Allow-Origin' not in call('GET', '/api/meta', headers={'Origin': 'https://untrusted.example'}).headers
preflight = call('OPTIONS', '/api/documents/upload', headers={'Origin': a.origin, 'Access-Control-Request-Method': 'POST'})
assert preflight.headers.get('Access-Control-Allow-Origin') == a.origin

if a.verify:
    result = json.loads(a.verify.read_text())
    assert result['api'] == base, 'Manifest belongs to another backend'
    for record in result['documents']:
        verify(record)
    print('PASS: records, corrections and original files survived redeploy. Test data retained.')
else:
    records = []
    passed = False
    try:
        fixtures = Path(__file__).resolve().parents[1] / 'tests/fixtures'
        for name, method, mime in [('native.pdf', 'pdf_text', 'application/pdf'), ('scan.pdf', 'ocr', 'application/pdf'), ('image.png', 'ocr', 'image/png')]:
            with (fixtures / name).open('rb') as file:
                doc = call('POST', '/api/documents/upload', files={'file': (name, file, mime)}).json()['data']
            record = {'id': doc['id'], 'name': name, 'method': method}
            records.append(record)
            assert doc['status'] == 'review_required', doc
            assert doc['extraction_method'] == method, doc
            assert doc['ai_status'] == 'success', doc
            assert doc['fields']['currency'] == 'PKR', doc['fields']
            assert float(doc['fields']['total_amount']) == 4500, doc['fields']
            detail = call('GET', f'/api/documents/{doc["id"]}').json()['data']
            assert 'Stationery' in detail['extracted_text']
            call('PUT', f'/api/documents/{doc["id"]}', json={'vendor': 'Deployment QA reviewed'})
            call('POST', f'/api/documents/{doc["id"]}/confirm', json={})
            verify(record)
        assert 'Deployment QA reviewed' in call('GET', '/api/export/csv').text
        passed = True
        print('PASS: native PDF, scanned PDF, image OCR, live AI, edit, confirm, file retrieval, CSV, CORS.')
    finally:
        if a.keep:
            a.manifest.write_text(json.dumps({'api': base, 'passed': passed, 'documents': records}, indent=2))
            print(f'Test IDs saved to {a.manifest}; retained for restart verification.')
        else:
            for record in records:
                response = s.delete(base + f'/api/documents/{record["id"]}', timeout=30)
                if response.status_code != 200:
                    print(f'Cleanup failed for test document {record["id"]}: HTTP {response.status_code}')
