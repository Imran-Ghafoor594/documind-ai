"""Shared-access *demo* gate (not multi-user authentication).

Public health check remains accessible; every document/data API requires an
expiring signed bearer token minted after the operator-supplied access code.
"""
from __future__ import annotations

import hmac

from flask import Blueprint, current_app, request, jsonify
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from .errors import error_response

bp = Blueprint("demo_auth", __name__)
SESSION_SECONDS = 8 * 60 * 60


def _serializer():
    settings = current_app.config["SETTINGS"]
    return URLSafeTimedSerializer(settings.demo_signing_secret, salt="documind-demo-session-v1")


@bp.post("/unlock")
def unlock():
    supplied = (request.get_json(silent=True) or {}).get("code", "")
    if not isinstance(supplied, str):
        return error_response(400, "invalid_code", "Enter a valid demo access code.")
    expected = current_app.config["SETTINGS"].demo_access_code
    if not hmac.compare_digest(supplied.encode(), expected.encode()):
        return error_response(401, "invalid_code", "Incorrect demo access code.")
    return jsonify({"data": {"token": _serializer().dumps({"scope": "demo"}),
                              "expires_in": SESSION_SECONDS}})


@bp.get("/session")
def session():
    return jsonify({"data": {"active": True}})


def check_demo_access():
    settings = current_app.config["SETTINGS"]
    if not settings.demo_mode or not request.path.startswith("/api/"):
        return None
    # Health is intentionally public for Render health checks.
    if request.method == "OPTIONS" or request.path in {"/api/health", "/api/demo/unlock"}:
        return None
    value = request.headers.get("Authorization", "")
    if not value.startswith("Bearer "):
        return error_response(401, "demo_access_required", "Enter the demo access code to continue.")
    try:
        payload = _serializer().loads(value[7:], max_age=SESSION_SECONDS)
        if not isinstance(payload, dict) or payload.get("scope") != "demo":
            raise BadSignature("Wrong token scope")
    except (BadSignature, SignatureExpired):
        return error_response(401, "demo_access_required", "Demo session expired. Enter the access code again.")
    return None
