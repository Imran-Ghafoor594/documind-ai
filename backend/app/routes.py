"""HTTP API. All responses are JSON except CSV export and the original-file preview."""
from __future__ import annotations

from functools import wraps
import csv
import io
import logging
import re
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from flask import Blueprint, Response, current_app, jsonify, request, send_file
from collections import Counter

from sqlalchemy import Float, cast, func, or_, select

from . import __version__
from .db import get_session
from .errors import ApiError
from .models import STATUSES, Document, Template, utcnow
from .services import ai, ocr, storage
from .services.processing import run_pipeline
from .validation import (CATEGORIES, DOCUMENT_TYPES, FIELD_NAMES, missing_required,
                         validate_fields)

log = logging.getLogger(__name__)
api = Blueprint("api", __name__)
ALLOWED_EXT = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
PER_PAGE_MAX = 100


def settings():
    return current_app.config["SETTINGS"]


def provider():
    return current_app.config.get("AI_PROVIDER_OVERRIDE") or ai.build_provider(settings())


def ok(data, status=200, meta=None):
    body = {"data": data}
    if meta:
        body["meta"] = meta
    return jsonify(body), status


def json_body() -> dict:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ApiError(400, "invalid_json", "Request body must be a JSON object.")
    return body


def template_from(raw) -> Template | None:
    """Resolve an optional template id (form/JSON value). Empty means 'no template'."""
    if raw is None or raw == "":
        return None
    try:
        tid = int(raw)
    except (TypeError, ValueError) as exc:
        raise ApiError(422, "invalid_template", "template_id must be a number.") from exc
    template = get_session().get(Template, tid)
    if template is None:
        raise ApiError(422, "invalid_template", "That template no longer exists.")
    return template


def get_doc(doc_id: int) -> Document:
    doc = get_session().get(Document, doc_id)
    if doc is None:
        raise ApiError(404, "not_found", "Document not found.")
    return doc


def int_arg(name: str, default: int, lo: int, hi: int) -> int:
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        return max(lo, min(hi, int(raw)))
    except ValueError as exc:
        raise ApiError(400, "invalid_parameter", f"{name} must be an integer.") from exc


def like_escape(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def parse_date_arg(name: str, value: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise ApiError(400, "invalid_parameter", f"{name} must be YYYY-MM-DD.") from exc


def apply_filters(stmt, *, confirmed_only: bool = False):
    args = request.args
    q = (args.get("q") or "").strip()[:100]
    if q:
        pattern = f"%{like_escape(q)}%"
        stmt = stmt.where(or_(Document.vendor.ilike(pattern, escape="\\"),
                              Document.original_filename.ilike(pattern, escape="\\"),
                              Document.short_summary.ilike(pattern, escape="\\")))
    if args.get("category"):
        stmt = stmt.where(Document.expense_category == args["category"])
    if args.get("currency"):
        stmt = stmt.where(Document.currency == args["currency"].upper())
    if args.get("document_type"):
        stmt = stmt.where(Document.document_type == args["document_type"])
    if confirmed_only:
        stmt = stmt.where(Document.verification_status == "confirmed")
    else:
        if args.get("status"):
            if args["status"] not in STATUSES:
                raise ApiError(400, "invalid_parameter", "Unknown status filter.")
            stmt = stmt.where(Document.status == args["status"])
        if args.get("verification"):
            stmt = stmt.where(Document.verification_status == args["verification"])
    for key in ("date_from", "date_to"):
        if args.get(key):
            parsed = parse_date_arg(key, args[key])
            stmt = stmt.where(Document.document_date >= parsed if key == "date_from"
                              else Document.document_date <= parsed)
    return stmt


# ---------------------------------------------------------------- meta / health
@api.get("/health")
def health():
    db_ok = True
    try:
        get_session().execute(select(1))
    except Exception:
        db_ok = False
    return jsonify({"status": "ok" if db_ok else "degraded", "version": __version__,
                    "database": "ok" if db_ok else "error",
                    "ocr_available": ocr.is_available(),
                    "ai_configured": settings().ai_configured}), (200 if db_ok else 503)


@api.get("/meta")
def meta():
    s = settings()
    return ok({"categories": list(CATEGORIES), "document_types": list(DOCUMENT_TYPES),
               "statuses": list(STATUSES), "max_upload_mb": s.max_upload_mb,
               "allowed_extensions": sorted(ALLOWED_EXT), "ai_configured": s.ai_configured,
               "ocr_available": ocr.is_available()})


def bounded_processing(fn):
    @wraps(fn)
    def wrapped(*args, **kwargs):
        slot = current_app.extensions["processing_slot"]
        if not slot.acquire(blocking=False):
            raise ApiError(503, "processing_busy", "Another document is processing. Try again shortly.")
        try:
            return fn(*args, **kwargs)
        finally:
            slot.release()
    return wrapped


# ---------------------------------------------------------------- upload / CRUD
@api.post("/documents/upload")
@bounded_processing
def upload():
    s = settings()
    file = request.files.get("file")
    if file is None or not file.filename:
        raise ApiError(400, "no_file", "No file was uploaded. Send a form field named 'file'.")
    name = re.sub(r"[\x00-\x1f\x7f]", "", file.filename.replace("\\", "/").split("/")[-1]).strip()[:200] or "document"
    ext = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext not in ALLOWED_EXT:
        raise ApiError(415, "unsupported_type", "Unsupported file type. Upload a PDF, JPG or PNG.")
    data = file.read(s.max_upload_bytes + 1)
    if len(data) > s.max_upload_bytes:
        raise ApiError(413, "file_too_large", f"File is too large. The limit is {s.max_upload_mb} MB.")
    if not data:
        raise ApiError(400, "empty_file", "The uploaded file is empty.")
    mime = storage.detect_mime(data[:16])
    if mime is None or mime != ALLOWED_EXT[ext]:
        raise ApiError(415, "content_mismatch", "The file content does not match a supported PDF, JPG or PNG.")

    session = get_session()
    template = template_from(request.form.get("template_id"))
    stored = storage.save_upload(s.upload_dir, data, mime)
    try:
        doc = Document(original_filename=name, stored_name=stored, mime_type=mime, size_bytes=len(data))
        session.add(doc)
        session.commit()
    except Exception:
        session.rollback()
        storage.delete_file(s.upload_dir, stored)
        raise
    run_pipeline(session, doc, s, provider(), template=template)
    log.info("Document %s processed: status=%s ai=%s", doc.id, doc.status, doc.ai_status)
    return ok(doc.to_dict(), 201)


SORTS = {"uploaded": Document.uploaded_at, "date": Document.document_date,
         "vendor": func.lower(Document.vendor), "amount": cast(Document.total_amount, Float)}


def sort_clauses():
    key = request.args.get("sort", "uploaded")
    order = request.args.get("order", "desc")
    if key not in SORTS or order not in ("asc", "desc"):
        raise ApiError(400, "invalid_parameter", "sort must be uploaded, date, vendor or amount; order asc or desc.")
    col = SORTS[key]
    # empty values always last; id as a stable tie-breaker
    return (col.is_(None), col.asc() if order == "asc" else col.desc(), Document.id.desc())


@api.get("/documents")
def list_documents():
    session = get_session()
    page, per_page = int_arg("page", 1, 1, 10**6), int_arg("per_page", 20, 1, PER_PAGE_MAX)
    stmt = apply_filters(select(Document))
    total = session.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = session.scalars(stmt.order_by(*sort_clauses()).limit(per_page).offset((page - 1) * per_page)).all()
    return ok([d.to_dict() for d in rows],
              meta={"page": page, "per_page": per_page, "total": total,
                    "pages": max(1, -(-total // per_page))})


@api.get("/documents/<int:doc_id>")
def get_document(doc_id):
    return ok(get_doc(doc_id).to_dict(include_text=True))


def _apply_edits(doc: Document, payload: dict) -> None:
    unknown = sorted(set(payload) - set(FIELD_NAMES))
    if unknown:
        raise ApiError(400, "unknown_fields", f"Unknown field(s): {', '.join(unknown)}")
    if doc.status not in ("review_required", "completed"):
        raise ApiError(409, "not_editable", "This document cannot be edited in its current state.")
    result = validate_fields({**doc.current_fields(), **payload}, lenient=False)
    if result.errors:
        raise ApiError(422, "validation_failed", "Some values are invalid.", result.errors)
    doc.set_fields(result.fields)
    doc.refresh_corrections()
    # Any edit invalidates a previous confirmation.
    doc.status, doc.verification_status, doc.confirmed_at = "review_required", "unverified", None


@api.put("/documents/<int:doc_id>")
def update_document(doc_id):
    doc = get_doc(doc_id)
    _apply_edits(doc, json_body())
    get_session().commit()
    return ok(doc.to_dict())


@api.post("/documents/<int:doc_id>/confirm")
def confirm_document(doc_id):
    doc = get_doc(doc_id)
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict) or not isinstance(body.get("fields", {}), dict):
        raise ApiError(400, "invalid_json", "Body must be an object with an optional 'fields' object.")
    if doc.status not in ("review_required", "completed"):
        raise ApiError(409, "not_editable", "This document cannot be confirmed in its current state.")
    if body.get("fields"):
        _apply_edits(doc, body["fields"])
    missing = missing_required(doc.current_fields())
    if missing:
        get_session().rollback()
        raise ApiError(422, "incomplete", "Fill in the required fields before confirming.", {"missing": missing})
    doc.status, doc.verification_status, doc.confirmed_at = "completed", "confirmed", utcnow()
    get_session().commit()
    return ok(doc.to_dict())


@api.post("/documents/<int:doc_id>/reprocess")
@bounded_processing
def reprocess_document(doc_id):
    doc = get_doc(doc_id)
    if doc.verification_status == "confirmed":
        raise ApiError(409, "already_confirmed", "Edit the confirmed document first to reopen it for review.")
    body = request.get_json(silent=True)
    body = body if isinstance(body, dict) else {}
    template = template_from(body["template_id"]) if "template_id" in body else template_from(doc.template_id)
    run_pipeline(get_session(), doc, settings(), provider(), reuse_text=bool(doc.extracted_text), template=template)
    return ok(doc.to_dict())


@api.delete("/documents/<int:doc_id>")
def delete_document(doc_id):
    session = get_session()
    doc = get_doc(doc_id)
    stored = doc.stored_name
    session.delete(doc)
    session.commit()
    storage.delete_file(settings().upload_dir, stored)
    return ok({"deleted": doc_id})


@api.get("/documents/<int:doc_id>/file")
def document_file(doc_id):
    """Original upload, for side-by-side review. Looked up by DB id only."""
    doc = get_doc(doc_id)
    try:
        path = storage.resolve(settings().upload_dir, doc.stored_name)
    except ValueError:
        raise ApiError(404, "not_found", "File not available.")
    if not path.exists():
        raise ApiError(404, "not_found", "File not available.")
    download = request.args.get("download") == "1"
    resp = send_file(path, mimetype=doc.mime_type, as_attachment=download, max_age=0,
                     download_name=doc.original_filename if download else None)
    if doc.mime_type.startswith("image/"):
        # A CSP sandbox would stop browsers' built-in PDF viewer, so it is applied to images only.
        resp.headers["Content-Security-Policy"] = "sandbox; default-src 'none'"
    return resp


# ---------------------------------------------------------------- summaries
def _money(d: Decimal) -> str:
    return format(d.quantize(Decimal("0.01")), "f")


def summarize(session) -> list:
    """Confirmed records only, grouped per currency (never converted or mixed).
    Honors the same query filters as the document list / CSV export."""
    stmt = apply_filters(select(Document.currency, Document.document_date, Document.expense_category,
                                Document.vendor, Document.total_amount), confirmed_only=True)
    stmt = stmt.where(Document.currency.is_not(None), Document.total_amount.is_not(None))
    new = lambda: {"total": Decimal(0), "count": 0}  # noqa: E731
    buckets = defaultdict(lambda: {"total": Decimal(0), "count": 0, "months": defaultdict(new),
                                   "cats": defaultdict(new), "vendors": {}, "undated": Decimal(0), "undated_count": 0})
    for cur, when, cat, vendor, total in session.execute(stmt):
        b, amount = buckets[cur], Decimal(total)
        b["total"] += amount
        b["count"] += 1
        for group in (b["cats"][cat or "Uncategorized"], ):
            group["total"] += amount
            group["count"] += 1
        if when:
            m = b["months"][when.strftime("%Y-%m")]
            m["total"] += amount
            m["count"] += 1
        else:
            b["undated"] += amount
            b["undated_count"] += 1
        label = (vendor or "Unknown vendor").strip()
        v = b["vendors"].setdefault(label.lower(), {"vendor": label, "total": Decimal(0), "count": 0})
        v["total"] += amount
        v["count"] += 1
    out = []
    for cur, b in sorted(buckets.items()):
        out.append({
            "currency": cur, "total": _money(b["total"]), "count": b["count"],
            "monthly": [{"month": m, "total": _money(v["total"]), "count": v["count"]}
                        for m, v in sorted(b["months"].items())],
            "categories": [{"category": c, "total": _money(v["total"]), "count": v["count"]}
                           for c, v in sorted(b["cats"].items(), key=lambda kv: -kv[1]["total"])],
            "vendors": [{"vendor": v["vendor"], "total": _money(v["total"]), "count": v["count"]}
                        for v in sorted(b["vendors"].values(), key=lambda v: -v["total"])[:25]],
            "undated_total": _money(b["undated"]), "undated_count": b["undated_count"]})
    return out


@api.get("/expenses/summary")
def expenses_summary():
    return ok({"currencies": summarize(get_session())})


def review_queue_items(session, reason: str | None = None):
    """Unconfirmed documents that need a person: computed in Python (small, single-tenant data set)."""
    stmt = apply_filters(select(Document).where(Document.verification_status != "confirmed",
                                                Document.status.in_(("review_required", "failed"))))
    items = [d.to_dict() for d in session.scalars(stmt.order_by(Document.uploaded_at.desc(), Document.id.desc()))]
    counts = Counter(r for d in items for r in d["review_reasons"])
    counts["total"] = len(items)
    if reason:
        items = [d for d in items if reason in d["review_reasons"]]
    return items, dict(counts)


@api.get("/dashboard")
def dashboard():
    session = get_session()
    count = lambda *conds: session.scalar(select(func.count(Document.id)).where(*conds)) or 0  # noqa: E731
    total = count()
    recent = session.scalars(select(Document).order_by(Document.uploaded_at.desc(), Document.id.desc()).limit(8)).all()
    queue, queue_counts = review_queue_items(session)
    attention = [d for d in queue if "failed" in d["review_reasons"] or "missing_fields" in d["review_reasons"]][:5]
    # Activity is derived from real timestamps only (upload and confirmation times).
    events = []
    for d in session.scalars(select(Document).order_by(Document.uploaded_at.desc()).limit(8)):
        events.append({"type": "uploaded", "at": d.uploaded_at, "document_id": d.id,
                       "label": d.vendor or d.original_filename})
    for d in session.scalars(select(Document).where(Document.confirmed_at.is_not(None))
                             .order_by(Document.confirmed_at.desc()).limit(8)):
        events.append({"type": "confirmed", "at": d.confirmed_at, "document_id": d.id,
                       "label": d.vendor or d.original_filename})
    events = sorted(events, key=lambda e: e["at"], reverse=True)[:8]
    for e in events:
        e["at"] = e["at"].isoformat() + "Z"
    return ok({"is_empty": total == 0,
               "counts": {"documents": total,
                          "processed": count(Document.status.in_(("review_required", "completed"))),
                          "awaiting_review": count(Document.status == "review_required"),
                          "confirmed": count(Document.verification_status == "confirmed"),
                          "failed": count(Document.status == "failed"),
                          "needs_attention": queue_counts.get("total", 0)},
               "summary": summarize(session),
               "recent": [d.to_dict() for d in recent],
               "attention": attention, "activity": events,
               "ai_configured": settings().ai_configured, "ocr_available": ocr.is_available()})


# ---------------------------------------------------------------- CSV export
def csv_safe(value) -> str:
    """Neutralise spreadsheet formula injection."""
    text = "" if value is None else str(value)
    if text and (text[0] in "=+-@\t\r" or text.lstrip()[:1] in ("=", "+", "-", "@")):
        return "'" + text
    return text


@api.get("/export/csv")
def export_csv():
    rows = get_session().scalars(
        apply_filters(select(Document), confirmed_only=True)
        .order_by(Document.document_date.is_(None), Document.document_date, Document.id)).all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Vendor", "Document date", "Document type", "Currency", "Subtotal", "Tax",
                     "Total", "Expense category", "Verification status"])
    for d in rows:
        writer.writerow([csv_safe(v) for v in (
            d.vendor, d.document_date.isoformat() if d.document_date else "", d.document_type,
            d.currency, d.subtotal, d.tax, d.total_amount, d.expense_category, d.verification_status)])
    name = f"documind-expenses-{datetime.now().strftime('%Y%m%d')}.csv"
    return Response("\ufeff" + buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})
