"""Consistent JSON errors. Never leak stack traces or internal paths."""
from __future__ import annotations

import logging

from flask import Flask, current_app, jsonify
from werkzeug.exceptions import HTTPException, RequestEntityTooLarge

log = logging.getLogger(__name__)


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


def error_response(status: int, code: str, message: str, details=None):
    body = {"error": {"code": code, "message": message}}
    if details:
        body["error"]["details"] = details
    return jsonify(body), status


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(ApiError)
    def _api_error(exc: ApiError):
        return error_response(exc.status, exc.code, exc.message, exc.details)

    @app.errorhandler(RequestEntityTooLarge)
    def _too_large(_exc):
        limit = current_app.config["SETTINGS"].max_upload_mb
        return error_response(413, "file_too_large", f"File is too large. The limit is {limit} MB.")

    @app.errorhandler(HTTPException)
    def _http(exc: HTTPException):
        codes = {404: "not_found", 405: "method_not_allowed", 400: "bad_request"}
        return error_response(exc.code or 500, codes.get(exc.code, "http_error"), exc.name)

    @app.errorhandler(Exception)
    def _unexpected(exc: Exception):
        log.exception("Unhandled error")  # traceback goes to server logs only
        return error_response(500, "internal_error", "Something went wrong on the server.")
