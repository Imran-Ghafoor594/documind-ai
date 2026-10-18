"""SQLAlchemy engine/session setup (PostgreSQL in production, SQLite for development)."""
from __future__ import annotations

from pathlib import Path

from flask import Flask, current_app
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, scoped_session, sessionmaker


class Base(DeclarativeBase):
    pass


# Columns added after the first release. create_all() never alters existing tables,
# so older database files get them added here (names/types are constants, not user input).
_ADDED_COLUMNS = {"documents": {"template_id": "INTEGER", "template_filled": "JSON", "ai_model": "VARCHAR(100)"}}


def _ensure_columns(engine) -> None:
    insp = inspect(engine)
    with engine.begin() as conn:
        for table, wanted in _ADDED_COLUMNS.items():
            existing = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in wanted.items():
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def init_db(app: Flask, database_url: str) -> None:
    from . import models  # noqa: F401  (register tables)

    if database_url.startswith("sqlite:///") and ":memory:" not in database_url:
        Path(database_url[len("sqlite:///"):]).parent.mkdir(parents=True, exist_ok=True)

    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite:") else {"connect_timeout": 10}
    engine = create_engine(database_url, connect_args=connect_args, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    _ensure_columns(engine)
    factory = scoped_session(sessionmaker(bind=engine, expire_on_commit=False))
    app.extensions["db_engine"] = engine
    app.extensions["db_session"] = factory

    @app.teardown_appcontext
    def _remove_session(_exc):
        factory.remove()  # rolls back anything uncommitted


def get_session() -> Session:
    return current_app.extensions["db_session"]()
