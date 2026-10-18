"""Server-side validation of extracted / user-edited financial fields.

Amounts are handled as Decimal and stored as canonical strings ("4500.00")
so no floating-point rounding ever touches money.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

DOCUMENT_TYPES = ("invoice", "receipt", "bill", "other")
CATEGORIES = (
    "Office Supplies", "Software & Subscriptions", "Travel", "Meals & Entertainment",
    "Utilities", "Professional Services", "Marketing", "Equipment", "Rent",
    "Taxes & Fees", "Other",
)
FIELD_NAMES = (
    "document_type", "vendor", "document_date", "currency", "subtotal", "tax",
    "total_amount", "expense_category", "short_summary",
)
AMOUNT_FIELDS = ("subtotal", "tax", "total_amount")
REQUIRED_FOR_CONFIRM = ("document_type", "vendor", "currency", "total_amount", "expense_category")

MAX_AMOUNT = Decimal("1000000000")
MIN_DATE = date(1990, 1, 1)
_CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
_AMOUNT_RE = re.compile(r"^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$")
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


class FieldError(ValueError):
    pass


@dataclass
class ValidationResult:
    fields: dict = field(default_factory=dict)
    errors: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)


def _blank(value) -> bool:
    return value is None or (isinstance(value, str) and not value.strip())


def clean_text(value, max_len: int, label: str):
    if not isinstance(value, str):
        raise FieldError(f"{label} must be text")
    text = re.sub(r"\s+", " ", _CONTROL_RE.sub("", value)).strip()
    if len(text) > max_len:
        raise FieldError(f"{label} must be at most {max_len} characters")
    return text or None


def parse_amount(value, label: str) -> str:
    if isinstance(value, bool):
        raise FieldError(f"{label} must be a number")
    if isinstance(value, (int, float)):
        if isinstance(value, float) and not math.isfinite(value):
            raise FieldError(f"{label} must be a finite number")
        dec = Decimal(str(value))
    elif isinstance(value, str):
        text = value.strip()
        if not _AMOUNT_RE.match(text):
            raise FieldError(f"{label} must be a plain non-negative number")
        dec = Decimal(text.replace(",", ""))
    else:
        raise FieldError(f"{label} must be a number")
    try:
        if dec < 0:
            raise FieldError(f"{label} cannot be negative")
        if dec > MAX_AMOUNT:
            raise FieldError(f"{label} is implausibly large")
        return format(dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), "f")
    except InvalidOperation as exc:
        raise FieldError(f"{label} is not a valid number") from exc


def parse_date(value, label: str = "Date") -> str:
    if not isinstance(value, str) or not _DATE_RE.match(value.strip()):
        raise FieldError(f"{label} must use the format YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value.strip())
    except ValueError as exc:
        raise FieldError(f"{label} is not a real calendar date") from exc
    if parsed < MIN_DATE or parsed > date.today() + timedelta(days=366):
        raise FieldError(f"{label} is outside the plausible range")
    return parsed.isoformat()


def parse_currency(value) -> str:
    if not isinstance(value, str):
        raise FieldError("Currency must be a 3-letter code such as USD")
    code = value.strip().upper()
    if not _CURRENCY_RE.match(code):
        raise FieldError("Currency must be a 3-letter code such as USD or PKR")
    return code


def _choice(value, options, label):
    if not isinstance(value, str):
        raise FieldError(f"{label} must be text")
    for option in options:
        if option.lower() == value.strip().lower():
            return option
    raise FieldError(f"{label} must be one of: {', '.join(options)}")


_PARSERS = {
    "document_type": lambda v: _choice(v, DOCUMENT_TYPES, "Document type"),
    "vendor": lambda v: clean_text(v, 200, "Vendor"),
    "document_date": lambda v: parse_date(v),
    "currency": parse_currency,
    "subtotal": lambda v: parse_amount(v, "Subtotal"),
    "tax": lambda v: parse_amount(v, "Tax"),
    "total_amount": lambda v: parse_amount(v, "Total amount"),
    "expense_category": lambda v: _choice(v, CATEGORIES, "Category"),
    "short_summary": lambda v: clean_text(v, 500, "Summary"),
}


def validate_fields(raw: dict, *, lenient: bool) -> ValidationResult:
    """lenient=True (AI output): bad values become null + warning.
    lenient=False (user input): bad values are errors."""
    result = ValidationResult()
    for name in FIELD_NAMES:
        value = raw.get(name)
        if _blank(value):
            result.fields[name] = None
            continue
        try:
            result.fields[name] = _PARSERS[name](value)
        except FieldError as exc:
            result.fields[name] = None
            if lenient:
                result.warnings.append(f"{name}: {exc} (value discarded, please check the document)")
            else:
                result.errors[name] = str(exc)
    return result


def missing_required(fields: dict) -> list:
    return [name for name in REQUIRED_FOR_CONFIRM if _blank(fields.get(name))]


def consistency_warnings(fields: dict) -> list:
    """Soft checks only: invoices may include discounts, shipping, rounding."""
    warnings = []
    try:
        sub = Decimal(fields["subtotal"]) if fields.get("subtotal") else None
        tax = Decimal(fields["tax"]) if fields.get("tax") else None
        total = Decimal(fields["total_amount"]) if fields.get("total_amount") else None
    except InvalidOperation:
        return warnings
    if sub is not None and tax is not None and total is not None:
        if abs(sub + tax - total) > Decimal("0.01"):
            warnings.append("Total does not equal subtotal + tax. This can be legitimate "
                            "(discounts, shipping, rounding) - please verify.")
    if sub is not None and total is not None and total < sub:
        warnings.append("Total is lower than the subtotal - please verify.")
    return warnings


DATE_FORMATS = ("locale", "iso", "dmy", "mdy")


def validate_template(payload: dict) -> tuple[dict, dict]:
    """Returns (clean, errors). Used for both create and update (full replacement)."""
    errors, clean = {}, {}
    try:
        name = clean_text(payload.get("name"), 80, "Name") if payload.get("name") is not None else None
        if not name:
            raise FieldError("Name is required")
        clean["name"] = name
    except FieldError as exc:
        errors["name"] = str(exc)
    try:
        desc = payload.get("description")
        clean["description"] = None if _blank(desc) else clean_text(desc, 300, "Description")
    except FieldError as exc:
        errors["description"] = str(exc)
    dtype = payload.get("document_type")
    try:
        clean["document_type"] = None if _blank(dtype) else _choice(dtype, DOCUMENT_TYPES, "Document type")
    except FieldError as exc:
        errors["document_type"] = str(exc)
    cat = payload.get("default_category")
    try:
        clean["default_category"] = None if _blank(cat) else _choice(cat, CATEGORIES, "Default category")
    except FieldError as exc:
        errors["default_category"] = str(exc)
    fields = payload.get("fields")
    if not isinstance(fields, list) or not fields:
        errors["fields"] = "Choose at least one field to extract"
    elif any(f not in FIELD_NAMES for f in fields):
        errors["fields"] = "Unknown field in list"
    else:
        clean["fields"] = [f for f in FIELD_NAMES if f in fields]  # canonical order, deduplicated
    return clean, errors


def validate_preferences(payload: dict) -> tuple[dict, dict]:
    errors, clean = {}, {}
    unknown = set(payload) - {"default_currency", "date_format"}
    if unknown:
        errors["_"] = f"Unknown setting(s): {', '.join(sorted(unknown))}"
    if "default_currency" in payload:
        value = payload["default_currency"]
        try:
            clean["default_currency"] = "" if _blank(value) else parse_currency(value)
        except FieldError as exc:
            errors["default_currency"] = str(exc)
    if "date_format" in payload:
        if payload["date_format"] in DATE_FORMATS:
            clean["date_format"] = payload["date_format"]
        else:
            errors["date_format"] = f"Must be one of: {', '.join(DATE_FORMATS)}"
    return clean, errors
