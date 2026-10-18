from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import JSON, Date, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base
from .validation import FIELD_NAMES, consistency_warnings, missing_required

STATUSES = ("uploaded", "processing", "review_required", "completed", "failed")
REVIEW_REASONS = ("failed", "missing_fields", "ai_unavailable", "warnings", "needs_confirmation")


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(value: datetime | None):
    return value.isoformat() + "Z" if value else None


class Template(Base):
    """Reusable extraction configuration applied when a document is processed."""
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(String(300), nullable=True)
    document_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    fields: Mapped[list] = mapped_column(JSON, default=list)           # field names to extract
    default_category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

    def to_dict(self, document_count: int = 0) -> dict:
        return {"id": self.id, "name": self.name, "description": self.description,
                "document_type": self.document_type, "fields": self.fields or [],
                "default_category": self.default_category, "document_count": document_count,
                "created_at": _iso(self.created_at), "updated_at": _iso(self.updated_at)}


class AppSetting(Base):
    """Small key/value store for non-secret preferences (never API keys)."""
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(50), primary_key=True)
    value: Mapped[str] = mapped_column(String(200), default="")


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    stored_name: Mapped[str] = mapped_column(String(64), unique=True)  # never exposed via API
    mime_type: Mapped[str] = mapped_column(String(50))
    size_bytes: Mapped[int] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)

    # Processing status and user verification are tracked separately.
    status: Mapped[str] = mapped_column(String(20), default="uploaded", index=True)
    verification_status: Mapped[str] = mapped_column(String(20), default="unverified", index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    processing_error: Mapped[str | None] = mapped_column(Text, nullable=True)

    extraction_method: Mapped[str | None] = mapped_column(String(20), nullable=True)  # pdf_text | ocr
    page_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    ai_status: Mapped[str] = mapped_column(String(20), default="pending")
    ai_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True)  # model that produced ai_fields
    ai_fields: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # validated model output snapshot
    template_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    template_filled: Mapped[dict | None] = mapped_column(JSON, nullable=True)  # {field: value} set from template defaults
    corrected_fields: Mapped[list] = mapped_column(JSON, default=list)   # fields differing from AI/template baseline
    warnings: Mapped[list] = mapped_column(JSON, default=list)           # extraction-time notes

    # Current working values (AI output, then user corrections)
    document_type: Mapped[str | None] = mapped_column(String(20), nullable=True, index=True)
    vendor: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)
    document_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    currency: Mapped[str | None] = mapped_column(String(3), nullable=True, index=True)
    subtotal: Mapped[str | None] = mapped_column(String(32), nullable=True)
    tax: Mapped[str | None] = mapped_column(String(32), nullable=True)
    total_amount: Mapped[str | None] = mapped_column(String(32), nullable=True)
    expense_category: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    short_summary: Mapped[str | None] = mapped_column(String(500), nullable=True)

    def current_fields(self) -> dict:
        out = {}
        for name in FIELD_NAMES:
            value = getattr(self, name)
            out[name] = value.isoformat() if isinstance(value, date) else value
        return out

    def set_fields(self, clean: dict) -> None:
        for name in FIELD_NAMES:
            value = clean.get(name)
            if name == "document_date" and value:
                value = date.fromisoformat(value)
            setattr(self, name, value)

    def baseline_fields(self) -> dict:
        return {**(self.ai_fields or {}), **(self.template_filled or {})}

    def refresh_corrections(self) -> None:
        baseline, current = self.baseline_fields(), self.current_fields()
        self.corrected_fields = [n for n in FIELD_NAMES if current[n] != baseline.get(n)]

    def field_sources(self, current: dict) -> dict:
        """Where each value came from: ai | template | user | None (empty)."""
        corrected, filled, ai = set(self.corrected_fields or []), self.template_filled or {}, self.ai_fields or {}
        out = {}
        for name in FIELD_NAMES:
            if current[name] is None:
                out[name] = None
            elif name in corrected:
                out[name] = "user"
            elif name in filled:
                out[name] = "template"
            elif ai.get(name) == current[name]:
                out[name] = "ai"
            else:
                out[name] = "user"
        return out

    def review_reasons(self, current: dict, warnings: list) -> list:
        """Why this document is in the review queue (empty when confirmed or still processing)."""
        if self.verification_status == "confirmed":
            return []
        if self.status == "failed":
            return ["failed"]
        if self.status != "review_required":
            return []
        reasons = []
        if missing_required(current):
            reasons.append("missing_fields")
        if self.ai_status in ("not_configured", "failed", "invalid_output"):
            reasons.append("ai_unavailable")
        if self.warnings or warnings:
            reasons.append("warnings")
        reasons.append("needs_confirmation")
        return reasons

    def to_dict(self, include_text: bool = False) -> dict:
        fields = self.current_fields()
        cons = consistency_warnings(fields)
        data = {
            "id": self.id,
            "original_filename": self.original_filename,
            "mime_type": self.mime_type,
            "size_bytes": self.size_bytes,
            "uploaded_at": _iso(self.uploaded_at),
            "status": self.status,
            "verification_status": self.verification_status,
            "confirmed_at": _iso(self.confirmed_at),
            "processing_error": self.processing_error,
            "extraction_method": self.extraction_method,
            "page_count": self.page_count,
            "ai_status": self.ai_status,
            "ai_error": self.ai_error,
            "ai_model": self.ai_model,
            "template_id": self.template_id,
            "fields": fields,
            "field_sources": self.field_sources(fields),
            "ai_fields": self.ai_fields,
            "corrected_fields": self.corrected_fields or [],
            "warnings": self.warnings or [],
            "consistency_warnings": cons,
            "missing_required": missing_required(fields),
            "review_reasons": self.review_reasons(fields, cons),
        }
        if include_text:
            data["extracted_text"] = self.extracted_text
        return data
