"""Upload storage. Files live outside any static dir under random names."""
from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path

log = logging.getLogger(__name__)

_STORED_RE = re.compile(r"^[0-9a-f]{32}\.(pdf|png|jpg)$")
EXT_FOR_MIME = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg"}


def detect_mime(head: bytes) -> str | None:
    """Identify the real type from magic bytes (never trust the filename/header)."""
    if head.startswith(b"%PDF-"):
        return "application/pdf"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    return None


def save_upload(upload_dir: Path, data: bytes, mime: str) -> str:
    upload_dir.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.{EXT_FOR_MIME[mime]}"
    (upload_dir / name).write_bytes(data)
    return name


def resolve(upload_dir: Path, stored_name: str) -> Path:
    """Map a stored name to a path, refusing anything outside upload_dir."""
    if not _STORED_RE.match(stored_name or ""):
        raise ValueError("Invalid stored file name")
    base = upload_dir.resolve()
    path = (base / stored_name).resolve()
    if not path.is_relative_to(base):
        raise ValueError("Path escapes upload directory")
    return path


def delete_file(upload_dir: Path, stored_name: str) -> bool:
    try:
        path = resolve(upload_dir, stored_name)
        path.unlink(missing_ok=True)
        return True
    except (ValueError, OSError):
        log.warning("Could not delete stored file for a document")
        return False
