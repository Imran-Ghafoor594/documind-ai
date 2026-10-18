"""Orchestrates: extract text -> (optional) AI -> validate -> save for review."""
from __future__ import annotations

import logging

from sqlalchemy import select

from ..models import Document
from ..validation import FIELD_NAMES, validate_fields
from . import ai, extraction, storage

log = logging.getLogger(__name__)
MAX_STORED_TEXT = 200_000
NOT_CONFIGURED_MSG = ("AI extraction is not configured on this server. Set AI_BASE_URL, AI_API_KEY and "
                      "AI_MODEL, or enter the fields manually.")


def run_pipeline(session, doc: Document, settings, provider, *, reuse_text: bool = False, template=None) -> Document:
    doc.template_id = template.id if template is not None else None
    doc.status, doc.processing_error = "processing", None
    session.commit()
    notes: list = []
    try:
        if not (reuse_text and doc.extracted_text):
            path = storage.resolve(settings.upload_dir, doc.stored_name)
            result = extraction.extract_text(path, doc.mime_type, settings)
            doc.extracted_text = result.text[:MAX_STORED_TEXT]
            doc.extraction_method, doc.page_count = result.method, result.page_count
            notes.extend(result.warnings)
    except extraction.ExtractionError as exc:
        return _fail(session, doc, str(exc))
    except Exception:
        log.exception("Unexpected extraction failure for document %s", doc.id)
        return _fail(session, doc, "Unexpected error while reading this document.")

    if len(doc.extracted_text or "") > settings.ai_max_text_chars:
        notes.append(f"Only the first {settings.ai_max_text_chars} characters were sent to the AI model.")
    _run_ai(doc, settings, provider, notes, template)
    doc.status = "review_required"
    doc.verification_status, doc.confirmed_at = "unverified", None
    session.commit()
    return doc


def _fail(session, doc: Document, message: str) -> Document:
    doc.status, doc.processing_error, doc.ai_status = "failed", message, "skipped"
    session.commit()
    return doc


def _template_defaults(template) -> dict:
    if template is None:
        return {}
    out = {}
    if template.document_type:
        out["document_type"] = template.document_type
    if template.default_category:
        out["expense_category"] = template.default_category
    return out


def _run_ai(doc: Document, settings, provider, notes: list, template=None) -> None:
    doc.warnings = notes
    defaults = _template_defaults(template)
    if provider is None:
        doc.ai_status, doc.ai_error = "not_configured", NOT_CONFIGURED_MSG
        # Template defaults are still useful, but they are never presented as AI output.
        filled = {}
        for name, value in defaults.items():
            if getattr(doc, name) is None:
                setattr(doc, name, value)
                filled[name] = value
        doc.template_filled = filled
        doc.refresh_corrections()
        return
    try:
        raw = ai.extract_fields(doc.extracted_text, settings, provider, template)
        if not any(key in raw for key in FIELD_NAMES):
            raise ai.AIError("invalid_output", "The AI model response did not contain the expected fields.")
    except ai.AIError as exc:
        doc.ai_status = "invalid_output" if exc.code == "invalid_output" else "failed"
        doc.ai_error = exc.message
        return
    except Exception:
        log.exception("Unexpected AI failure for document %s", doc.id)
        doc.ai_status, doc.ai_error = "failed", "Unexpected error during AI extraction."
        return
    result = validate_fields(raw, lenient=True)
    fields = dict(result.fields)
    if template is not None:  # enforce the template in code, not just in the prompt
        for name in FIELD_NAMES:
            if name not in template.fields:
                fields[name] = None
    doc.ai_status, doc.ai_error, doc.ai_model = "success", None, settings.ai_model
    doc.ai_fields = dict(fields)
    filled = {}
    for name, value in defaults.items():
        if fields.get(name) is None:
            fields[name] = value
            filled[name] = value
    doc.template_filled = filled
    doc.set_fields(fields)
    doc.corrected_fields = []
    doc.warnings = notes + [w for w in result.warnings if w.split(":")[0] in (template.fields if template else FIELD_NAMES)]


def recover_interrupted(session) -> int:
    """Documents left mid-processing by a crash/restart are marked failed."""
    stuck = session.scalars(select(Document).where(Document.status.in_(("uploaded", "processing")))).all()
    for doc in stuck:
        doc.status = "failed"
        doc.processing_error = "Processing was interrupted. Use Reprocess or delete and re-upload."
    session.commit()
    return len(stuck)
