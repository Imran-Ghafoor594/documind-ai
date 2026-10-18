"""Tesseract OCR wrapper. Tesseract is a system dependency and may be missing."""
from __future__ import annotations

import logging
import os

import pytesseract

log = logging.getLogger(__name__)

if os.getenv("TESSERACT_CMD"):
    pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_CMD"]


class OCRError(Exception):
    """Message is safe to show to users."""


def is_available() -> bool:
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:  # missing binary, bad path, ...
        return False


def ocr_image(image, languages: str = "eng", timeout: int = 60) -> str:
    try:
        return pytesseract.image_to_string(image, lang=languages, timeout=timeout)
    except Exception as exc:  # never include text/paths in the message
        log.warning("OCR failed (%s)", type(exc).__name__)
        raise OCRError("OCR failed on this document. Check that Tesseract and the "
                       "configured language data are installed.") from exc
