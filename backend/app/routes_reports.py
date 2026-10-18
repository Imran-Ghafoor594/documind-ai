"""Review queue and reports. Everything is computed from stored records."""
from __future__ import annotations

import csv
import io
from collections import Counter
from datetime import datetime, time

from flask import Response, request
from sqlalchemy import select

from . import routes as r
from .db import get_session
from .errors import ApiError
from .models import REVIEW_REASONS, Document

api = r.api


@api.get("/review/queue")
def review_queue():
    reason = request.args.get("reason") or None
    if reason and reason not in REVIEW_REASONS:
        raise ApiError(400, "invalid_parameter", "Unknown review reason.")
    page, per_page = r.int_arg("page", 1, 1, 10**6), r.int_arg("per_page", 20, 1, r.PER_PAGE_MAX)
    items, counts = r.review_queue_items(get_session(), reason)
    total = len(items)
    return r.ok(items[(page - 1) * per_page: page * per_page],
                meta={"page": page, "per_page": per_page, "total": total,
                      "pages": max(1, -(-total // per_page)), "counts": counts})


def _processing_summary(session) -> dict:
    stmt = select(Document.status, Document.verification_status, Document.ai_status, Document.extraction_method)
    for key, op in (("date_from", "ge"), ("date_to", "le")):
        value = request.args.get(key)
        if value:
            parsed = r.parse_date_arg(key, value)
            bound = datetime.combine(parsed, time.min if op == "ge" else time.max)
            stmt = stmt.where(Document.uploaded_at >= bound if op == "ge" else Document.uploaded_at <= bound)
    rows = session.execute(stmt).all()
    return {"total": len(rows),
            "by_status": dict(Counter(row[0] for row in rows)),
            "by_verification": dict(Counter(row[1] for row in rows)),
            "by_ai_status": dict(Counter(row[2] for row in rows)),
            "by_extraction_method": dict(Counter(row[3] or "none" for row in rows))}


@api.get("/reports/summary")
def reports_summary():
    session = get_session()
    return r.ok({"currencies": r.summarize(session),
                 "processing": _processing_summary(session),
                 "basis": {"expenses": "confirmed records, filtered by document date",
                           "processing": "all uploads, filtered by upload date"}})


@api.get("/reports/csv")
def reports_csv():
    section = request.args.get("section", "")
    keys = {"monthly": ("month", "Month"), "categories": ("category", "Category"), "vendors": ("vendor", "Vendor")}
    if section not in keys:
        raise ApiError(400, "invalid_parameter", "section must be monthly, categories or vendors.")
    key, label = keys[section]
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Currency", label, "Records", "Total"])
    for cur in r.summarize(get_session()):
        for row in cur[section]:
            writer.writerow([r.csv_safe(cur["currency"]), r.csv_safe(row[key]), row["count"], row["total"]])
    return Response("\ufeff" + buf.getvalue(), mimetype="text/csv",
                    headers={"Content-Disposition": f'attachment; filename="documind-report-{section}.csv"'})
