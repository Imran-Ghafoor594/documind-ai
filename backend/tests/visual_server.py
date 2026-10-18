"""Visual-QA fixture (NOT part of the product): real Flask backend + real PDF/OCR pipeline, populated with
clearly FICTIONAL documents. The AI endpoint is a local stub that returns canned values keyed by vendor name.
    python -m tests.visual_server        (listens on 127.0.0.1:5056)"""
import io
import json
import os
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw, ImageFont
from werkzeug.serving import make_server

from app import create_app
from tests.conftest import make_settings

SEED = {  # vendor -> (fields returned by the stub, confirm?)
    "Northwind Stationery": ({"document_type": "receipt", "document_date": "2026-09-12", "currency": "USD", "subtotal": 78, "tax": 6.2, "total_amount": 84.2, "expense_category": "Office Supplies", "short_summary": "Printer paper and pens"}, True),
    "Harbor Cloud Hosting": ({"document_type": "invoice", "document_date": "2026-09-30", "currency": "USD", "subtotal": 1250, "tax": 0, "total_amount": 1250, "expense_category": "Software & Subscriptions", "short_summary": "Monthly hosting"}, True),
    "Lumen Travel Co": ({"document_type": "invoice", "document_date": "2026-08-18", "currency": "EUR", "subtotal": 600, "tax": 40, "total_amount": 640, "expense_category": "Travel", "short_summary": "Train tickets"}, True),
    "Bluebird Cafe": ({"document_type": "receipt", "document_date": "2026-10-02", "currency": "USD", "total_amount": 23.75, "expense_category": "Meals & Entertainment", "short_summary": "Client lunch"}, True),
    "Atlas Coworking": ({"document_type": "invoice", "document_date": "2026-10-01", "currency": "PKR", "subtotal": 45000, "tax": 0, "total_amount": 45000, "expense_category": "Rent", "short_summary": "Desk rental"}, True),
    "Pioneer Print Shop": ({"document_type": "receipt", "document_date": "2026-10-08", "currency": "USD", "subtotal": 100, "tax": 5, "total_amount": 112, "expense_category": "Marketing", "short_summary": "Flyers"}, False),
    "Greenleaf Utilities": ({"document_type": "bill", "document_date": "2026-10-05", "total_amount": 96.4, "expense_category": "Utilities"}, False),
    "The Extraordinarily Long Named Business Solutions and Consulting Partnership LLP": ({"document_type": "invoice", "document_date": "2026-10-09", "currency": "USD", "subtotal": 9500, "tax": 499.99, "total_amount": 9999.99, "expense_category": "Professional Services", "short_summary": "Quarterly advisory retainer"}, False),
    "Orbit Software": ({"document_type": "receipt", "document_date": "2026-10-11", "currency": "USD", "total_amount": 19, "expense_category": "Software & Subscriptions", "short_summary": "Licence"}, False),
}


class StubHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        text = body["messages"][-1]["content"]
        fields = next((dict(f, vendor=v) for v, (f, _) in SEED.items() if v[:40] in text), {"vendor": None})
        out = json.dumps({"choices": [{"message": {"content": json.dumps(fields)}}]}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json"); self.end_headers(); self.wfile.write(out)

    def log_message(self, *a):
        pass


def invoice_pdf(vendor: str, f: dict) -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((60, 70), "INVOICE" if f.get("document_type") != "receipt" else "RECEIPT", fontsize=22)
    page.insert_text((60, 100), vendor[:48], fontsize=13)
    if len(vendor) > 48:
        page.insert_text((60, 114), vendor[48:96], fontsize=13)
    page.insert_text((60, 118), "456 Example Street, Sampleville   (synthetic demo document)", fontsize=8)
    page.insert_text((60, 150), f"Date: {f.get('document_date', '')}", fontsize=10)
    y = 190
    page.insert_text((60, y), "Description", fontsize=10); page.insert_text((380, y), "Amount", fontsize=10)
    page.draw_line((60, y + 6), (535, y + 6))
    for i, label in enumerate(["Service line one", "Service line two", "Service line three"]):
        page.insert_text((60, y + 28 + 22 * i), label, fontsize=10)
        page.insert_text((380, y + 28 + 22 * i), f"{(f.get('subtotal') or f.get('total_amount') or 0) / 3:.2f}", fontsize=10)
    page.insert_text((60, 330), f"Subtotal {f.get('subtotal', '')}   Tax {f.get('tax', '')}", fontsize=10)
    page.insert_text((60, 352), f"Total {f.get('currency', '')} {f.get('total_amount', '')}", fontsize=12)
    return doc.tobytes()


def invoice_png(vendor: str) -> bytes:
    img = Image.new("RGB", (1000, 500), "white")
    d = ImageDraw.Draw(img)
    d.text((40, 40), "RECEIPT", fill="black", font=ImageFont.load_default(size=48))
    d.text((40, 130), vendor, fill="black", font=ImageFont.load_default(size=44))
    d.text((40, 220), "Total USD 19.00   2026-10-11", fill="black", font=ImageFont.load_default(size=44))
    buf = io.BytesIO(); img.save(buf, "PNG"); return buf.getvalue()


stub = HTTPServer(("127.0.0.1", 0), StubHandler)
threading.Thread(target=stub.serve_forever, daemon=True).start()
tmp = Path(tempfile.mkdtemp(prefix="documind-visual-"))
origins = os.getenv("VISUAL_ORIGINS", "http://127.0.0.1:4173").split(",")
settings = make_settings(tmp, ai_base_url=f"http://127.0.0.1:{stub.server_port}/v1", ai_api_key="visual-qa", ai_model="demo-stub-model",
                         ai_max_retries=0, cors_origins=origins)
app = create_app(settings)
c = app.test_client()


def upload(data: bytes, name: str, **form):
    return c.post("/api/documents/upload", data={"file": (io.BytesIO(data), name), **form}, content_type="multipart/form-data").get_json()["data"]


c.post("/api/templates", json={"name": "Restaurant receipts", "fields": ["vendor", "document_date", "currency", "total_amount"], "document_type": "receipt",
                                "default_category": "Meals & Entertainment", "description": "Cafes and client lunches"})
c.post("/api/templates", json={"name": "Software subscriptions", "fields": ["vendor", "document_date", "currency", "subtotal", "tax", "total_amount"],
                                "default_category": "Software & Subscriptions"})
ids = {}
for vendor, (fields, confirm) in SEED.items():
    if vendor == "Orbit Software":
        doc = upload(invoice_png(vendor), "orbit-receipt.png")
    else:
        doc = upload(invoice_pdf(vendor, fields), vendor.split()[0].lower() + "-" + fields.get("document_date", "x") + ".pdf")
    ids[vendor] = doc["id"]
    if confirm and doc["status"] == "review_required":
        c.post(f"/api/documents/{doc['id']}/confirm")
upload(b"%PDF-1.4\nthis file is damaged", "damaged-scan.pdf")
print("READY", json.dumps({"ids": ids}), flush=True)
make_server("127.0.0.1", int(os.getenv("VISUAL_PORT", "5056")), app, threaded=True).serve_forever()
