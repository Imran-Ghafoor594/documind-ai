"""QA harness for frontend tests: REAL Flask backend + SQLite + OCR pipeline, with the AI
provider pointed at a local STUB endpoint (a fixture, not a model). Run from backend/:
    python -m tests.qa_server            (listens on 127.0.0.1:5055)"""
import os
import tempfile
from pathlib import Path

from werkzeug.serving import make_server

from app import create_app
from tests.conftest import make_settings
from tests.test_integration import Stub

tmp = Path(tempfile.mkdtemp(prefix="documind-qa-"))
stub = Stub()
if os.getenv("QA_NO_AI"):  # genuine "no credentials" configuration: no provider is built at all
    settings = make_settings(tmp, cors_origins=["http://localhost:3000"])
else:
    settings = make_settings(tmp, ai_base_url=stub.url, ai_api_key="qa-key", ai_model="stub-model",
                             ai_max_retries=0, cors_origins=["http://localhost:3000"])
app = create_app(settings)
port = int(os.getenv("QA_PORT", "5055"))
print(f"QA backend on :{port}, data in {tmp}", flush=True)
make_server("127.0.0.1", port, app, threaded=True).serve_forever()
