"""Templates (reusable extraction configurations) and application preferences."""
from __future__ import annotations

from sqlalchemy import func, select, update

from . import routes as r
from .db import get_session
from .errors import ApiError
from .models import AppSetting, Document, Template
from .services import ocr
from .validation import validate_preferences, validate_template

api = r.api
DEFAULT_PREFS = {"default_currency": "", "date_format": "locale"}


def _counts(session) -> dict:
    rows = session.execute(select(Document.template_id, func.count(Document.id))
                           .where(Document.template_id.is_not(None)).group_by(Document.template_id))
    return {tid: n for tid, n in rows}


def _name_taken(session, name: str, ignore_id: int | None = None) -> bool:
    rows = session.scalars(select(Template).where(func.lower(Template.name) == name.lower())).all()
    return any(t.id != ignore_id for t in rows)


def _validated(session, payload: dict, ignore_id: int | None = None) -> dict:
    clean, errors = validate_template(payload)
    if "name" not in errors and _name_taken(session, clean["name"], ignore_id):
        raise ApiError(409, "duplicate_name", "A template with this name already exists.", {"name": "Name already in use"})
    if errors:
        raise ApiError(422, "validation_failed", "Some values are invalid.", errors)
    return clean


@api.get("/templates")
def list_templates():
    session = get_session()
    counts = _counts(session)
    rows = session.scalars(select(Template).order_by(func.lower(Template.name))).all()
    return r.ok([t.to_dict(counts.get(t.id, 0)) for t in rows])


@api.post("/templates")
def create_template():
    session = get_session()
    template = Template(**_validated(session, r.json_body()))
    session.add(template)
    session.commit()
    return r.ok(template.to_dict(), 201)


def _get_template(template_id: int) -> Template:
    template = get_session().get(Template, template_id)
    if template is None:
        raise ApiError(404, "not_found", "Template not found.")
    return template


@api.put("/templates/<int:template_id>")
def update_template(template_id):
    session = get_session()
    template = _get_template(template_id)
    for key, value in _validated(session, r.json_body(), ignore_id=template_id).items():
        setattr(template, key, value)
    session.commit()
    return r.ok(template.to_dict(_counts(session).get(template_id, 0)))


@api.delete("/templates/<int:template_id>")
def delete_template(template_id):
    session = get_session()
    template = _get_template(template_id)
    # Documents keep their extracted values; they just no longer point at the template.
    session.execute(update(Document).where(Document.template_id == template_id).values(template_id=None))
    session.delete(template)
    session.commit()
    return r.ok({"deleted": template_id})


# ---------------------------------------------------------------- settings
def load_prefs(session) -> dict:
    stored = {row.key: row.value for row in session.scalars(select(AppSetting))}
    return {k: stored.get(k, v) for k, v in DEFAULT_PREFS.items()}


def system_info() -> dict:
    s = r.settings()
    return {"ai_configured": s.ai_configured,
            "ai_provider": s.ai_provider if s.ai_configured else None,
            "ai_model": s.ai_model if s.ai_configured else None,   # model id only; keys are never exposed
            "ocr_available": ocr.is_available(), "ocr_languages": s.ocr_languages,
            "max_upload_mb": s.max_upload_mb, "max_pdf_pages": s.max_pdf_pages,
            "allowed_extensions": sorted(r.ALLOWED_EXT)}


@api.get("/settings")
def get_settings():
    return r.ok({"preferences": load_prefs(get_session()), "system": system_info()})


@api.put("/settings")
def update_settings():
    session = get_session()
    clean, errors = validate_preferences(r.json_body())
    if errors:
        raise ApiError(422, "validation_failed", "Some values are invalid.", errors)
    for key, value in clean.items():
        row = session.get(AppSetting, key)
        if row is None:
            session.add(AppSetting(key=key, value=value))
        else:
            row.value = value
    session.commit()
    return r.ok({"preferences": load_prefs(session), "system": system_info()})
