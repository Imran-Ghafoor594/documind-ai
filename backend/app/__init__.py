"""DocuMind AI backend (Flask)."""
import logging
from threading import BoundedSemaphore

from flask import Flask, request
from flask_cors import CORS

__version__ = "0.1.0"


def create_app(settings=None, ai_provider=None) -> Flask:
    from .config import Settings
    from .db import get_session, init_db
    from .errors import register_error_handlers
    from . import routes_reports, routes_templates  # noqa: F401  (register extra routes on the api blueprint)
    from .routes import api
    from .services.processing import recover_interrupted

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    settings = settings or Settings.from_env()
    if settings.production or settings.demo_mode:
        from .services import ocr
        import pytesseract
        if not ocr.is_available():
            raise RuntimeError("Tesseract is missing from the server image.")
        if not set(settings.ocr_languages.split("+")).issubset(pytesseract.get_languages(config="")):
            raise RuntimeError("Configured Tesseract language data is missing.")
    app = Flask(__name__)
    app.extensions["processing_slot"] = BoundedSemaphore(1)
    app.config["SETTINGS"] = settings
    app.config["AI_PROVIDER_OVERRIDE"] = ai_provider  # tests inject a fake provider
    app.config["MAX_CONTENT_LENGTH"] = settings.max_upload_bytes + 1024 * 1024  # multipart overhead

    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    init_db(app, settings.database_url)
    CORS(app, resources={r"/api/*": {"origins": settings.cors_origins}},
         methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
         expose_headers=["Content-Disposition"], supports_credentials=False)
    if settings.demo_mode:
        from .demo_auth import bp as demo_bp, check_demo_access
        app.register_blueprint(demo_bp, url_prefix="/api/demo")
        app.before_request(check_demo_access)
    app.register_blueprint(api, url_prefix="/api")
    register_error_handlers(app)

    @app.after_request
    def _headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("Referrer-Policy", "no-referrer")
        if settings.demo_mode and request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    with app.app_context():
        recover_interrupted(get_session())
    return app
