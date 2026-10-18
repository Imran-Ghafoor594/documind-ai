"""Text extraction: native PDF text first, OCR as fallback."""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from pathlib import Path

import pymupdf
from PIL import Image, ImageOps

from . import ocr

MAX_PIXELS = 40_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS  # decompression-bomb guard


class ExtractionError(Exception):
    """Message is safe to show to users."""


@dataclass
class ExtractionResult:
    text: str
    method: str  # pdf_text | ocr
    page_count: int | None = None
    warnings: list = field(default_factory=list)


def extract_text(path: Path, mime: str, settings) -> ExtractionResult:
    if mime == "application/pdf":
        return _extract_pdf(path, settings)
    if mime in ("image/png", "image/jpeg"):
        return _extract_image(path, settings)
    raise ExtractionError("Unsupported file type.")


def _extract_pdf(path: Path, settings) -> ExtractionResult:
    try:
        doc = pymupdf.open(str(path))
    except Exception as exc:
        raise ExtractionError("This PDF could not be opened. The file may be damaged.") from exc
    with doc:
        if doc.needs_pass:
            raise ExtractionError("Password-protected PDFs are not supported.")
        total_pages = doc.page_count
        if total_pages == 0:
            raise ExtractionError("This PDF has no pages.")
        pages = min(total_pages, settings.max_pdf_pages)
        warnings = []
        if total_pages > pages:
            warnings.append(f"Only the first {pages} of {total_pages} pages were processed.")

        native = "\n".join(doc[i].get_text("text") for i in range(pages)).strip()
        if len(re.sub(r"\s+", "", native)) >= settings.min_pdf_text_chars:
            return ExtractionResult(native, "pdf_text", pages, warnings)

        # Scanned / image-only PDF: fall back to OCR.
        if not ocr.is_available():
            if native:
                warnings.append("Little selectable text found and OCR is unavailable; "
                                "results may be incomplete.")
                return ExtractionResult(native, "pdf_text", pages, warnings)
            raise ExtractionError("This PDF has no selectable text and OCR is not available. "
                                  "Ask the server operator to enable Tesseract OCR.")
        chunks = []
        for i in range(pages):
            page = doc[i]
            dpi = settings.ocr_dpi
            pixels = page.rect.width * page.rect.height * (dpi / 72) ** 2
            pixel_budget = 8_000_000 if settings.demo_mode else MAX_PIXELS
            if pixels > pixel_budget:
                dpi = max(50, int(72 * math.sqrt(pixel_budget / (page.rect.width * page.rect.height))))
            pix = page.get_pixmap(dpi=dpi, colorspace=pymupdf.csRGB, alpha=False)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            chunks.append(ocr.ocr_image(image, settings.ocr_languages, settings.ocr_timeout_seconds))
            del pix, image  # release raster buffers before handling the next page
        text = "\n".join(chunks).strip()
        if not text:
            raise ExtractionError("No readable text was found in this PDF.")
        return ExtractionResult(text, "ocr", pages, warnings)


def _extract_image(path: Path, settings) -> ExtractionResult:
    if not ocr.is_available():
        raise ExtractionError("OCR is not available, so images cannot be read. "
                              "Ask the server operator to enable Tesseract OCR.")
    try:
        with Image.open(path) as probe:
            probe.verify()
        with Image.open(path) as image:
            # Pillow only warns between 1x and 2x MAX_IMAGE_PIXELS, so enforce the limit ourselves.
            pixel_budget = 8_000_000 if settings.demo_mode else MAX_PIXELS
            if image.width * image.height > pixel_budget:
                raise ExtractionError("Image exceeds the demo pixel limit. Resize it and try again.")
            image.load()
            image = ImageOps.exif_transpose(image)
            if image.mode not in ("RGB", "L"):
                image = image.convert("RGB")
            text = ocr.ocr_image(image, settings.ocr_languages, settings.ocr_timeout_seconds)
    except ExtractionError:
        raise
    except ocr.OCRError as exc:
        raise ExtractionError(str(exc)) from exc
    except Exception as exc:  # corrupt image, decompression bomb, etc.
        raise ExtractionError("This image could not be read. It may be damaged or too large.") from exc
    text = text.strip()
    if not text:
        raise ExtractionError("No readable text was found in this image.")
    return ExtractionResult(text, "ocr", 1, [])
