"""Configuration, read from environment variables (and an optional .env file)."""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field, replace
from pathlib import Path

from dotenv import load_dotenv

log = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR.parent / ".env")
load_dotenv(BACKEND_DIR / ".env")


class ConfigError(ValueError):
    pass


def _int(name: str, default: int, minimum: int = 0) -> int:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise ConfigError(f"{name} must be an integer") from exc
    if value < minimum:
        raise ConfigError(f"{name} must be >= {minimum}")
    return value


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _resolve_dir(raw: str) -> Path:
    path = Path(raw).expanduser()
    return path if path.is_absolute() else (BACKEND_DIR / path).resolve()


def _database_url(raw: str) -> str:
    """Make relative sqlite paths relative to backend/ regardless of cwd."""
    for prefix in ("postgres://", "postgresql://"):
        if raw.startswith(prefix):
            return "postgresql+psycopg://" + raw[len(prefix):]
    prefix = "sqlite:///"
    if raw.startswith(prefix) and not raw.startswith("sqlite:////") and ":memory:" not in raw:
        rel = raw[len(prefix):]
        if not (len(rel) > 1 and rel[1] == ":"):  # Windows absolute path like C:\...
            return prefix + str((BACKEND_DIR / rel).resolve()).replace("\\", "/")
    return raw


def _origins(raw: str) -> list[str]:
    origins = []
    for item in raw.split(","):
        item = item.strip().rstrip("/")
        if not item:
            continue
        if item == "*":
            log.warning("CORS_ORIGINS contains '*'; ignoring it. List explicit origins instead.")
            continue
        origins.append(item)
    return origins


@dataclass(frozen=True)
class Settings:
    production: bool = False
    demo_mode: bool = False
    demo_access_code: str = ""
    demo_signing_secret: str = ""
    ai_max_completion_tokens: int = 4096
    database_url: str = "sqlite:///" + str(BACKEND_DIR / "data" / "documind.db").replace("\\", "/")
    upload_dir: Path = BACKEND_DIR / "data" / "uploads"
    max_upload_mb: int = 10
    max_pdf_pages: int = 15
    min_pdf_text_chars: int = 40
    ocr_dpi: int = 200
    ocr_languages: str = "eng"
    ocr_timeout_seconds: int = 60
    ai_provider: str = "openai_compatible"
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""
    ai_json_mode: bool = True
    ai_timeout_seconds: int = 30
    ai_max_retries: int = 2
    ai_max_text_chars: int = 12000
    cors_origins: list[str] = field(default_factory=lambda: ["http://localhost:5173"])

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def ai_configured(self) -> bool:
        return bool(self.ai_api_key and self.ai_model and self.ai_base_url)

    def with_overrides(self, **overrides) -> "Settings":
        return replace(self, **overrides)

    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls(
            production=os.getenv("APP_ENV", "development") == "production",
            demo_mode=os.getenv("APP_ENV", "development") == "demo",
            demo_access_code=os.getenv("DEMO_ACCESS_CODE", ""),
            demo_signing_secret=os.getenv("DEMO_SIGNING_SECRET", ""),
            ai_max_completion_tokens=_int("AI_MAX_COMPLETION_TOKENS", 4096, 800),
            database_url=_database_url(os.getenv("DATABASE_URL", "sqlite:///data/documind.db")),
            upload_dir=_resolve_dir(os.getenv("UPLOAD_DIR", "data/uploads")),
            max_upload_mb=_int("MAX_UPLOAD_MB", 10, 1),
            max_pdf_pages=_int("MAX_PDF_PAGES", 15, 1),
            ocr_dpi=_int("OCR_DPI", 150, 72),
            ocr_timeout_seconds=_int("OCR_TIMEOUT_SECONDS", 20, 1),
            ai_max_text_chars=_int("AI_MAX_TEXT_CHARS", 12000, 100),
            ocr_languages=os.getenv("OCR_LANGUAGES", "eng").strip() or "eng",
            ai_provider=os.getenv("AI_PROVIDER", "groq").strip() or "openai_compatible",
            ai_base_url=os.getenv("AI_BASE_URL", "https://api.groq.com/openai/v1").strip(),
            ai_api_key=(os.getenv("GROQ_API_KEY", "") or os.getenv("AI_API_KEY", "")).strip(),
            ai_model=os.getenv("AI_MODEL", "openai/gpt-oss-20b").strip(),
            ai_json_mode=_bool("AI_JSON_MODE", True),
            ai_timeout_seconds=_int("AI_TIMEOUT_SECONDS", 30, 1),
            ai_max_retries=_int("AI_MAX_RETRIES", 2, 0),
            cors_origins=_origins(os.getenv("CORS_ORIGINS", "http://localhost:5173")),
        )

        if settings.demo_mode:
            if len(settings.demo_access_code) < 16:
                raise ConfigError("Demo requires DEMO_ACCESS_CODE with at least 16 characters.")
            if len(settings.demo_signing_secret) < 32:
                raise ConfigError("Demo requires DEMO_SIGNING_SECRET with at least 32 characters.")
            if not os.getenv("CORS_ORIGINS") or not settings.cors_origins or any(
                not origin.startswith("https://") for origin in settings.cors_origins
            ):
                raise ConfigError("Demo requires explicit HTTPS CORS_ORIGINS for the deployed frontend.")
            if not settings.ai_configured:
                raise ConfigError("Demo requires GROQ_API_KEY, AI_MODEL and AI_BASE_URL for AI extraction.")
            if settings.max_upload_mb > 3 or settings.max_pdf_pages > 3 or settings.ocr_dpi > 120:
                raise ConfigError("Demo upload must be <= 3 MB, PDF <= 3 pages and OCR_DPI <= 120.")
        if settings.production:
            if not settings.database_url.startswith("postgresql+psycopg://"):
                raise ConfigError("Production requires a PostgreSQL DATABASE_URL; SQLite is development-only.")
            if not os.getenv("UPLOAD_DIR") or not Path(os.environ["UPLOAD_DIR"]).is_absolute():
                raise ConfigError("Production requires an absolute UPLOAD_DIR on a mounted persistent disk.")
            if not os.getenv("CORS_ORIGINS") or not settings.cors_origins or any(
                not origin.startswith("https://") for origin in settings.cors_origins
            ):
                raise ConfigError("Production requires explicit HTTPS CORS_ORIGINS.")
            if not settings.ai_configured or settings.ai_provider not in {"groq", "openai_compatible"}:
                raise ConfigError("Production requires a supported AI provider and API key.")
        return settings
