"""Database engine setup: reads DATABASE_URL from the environment."""

import os
from collections.abc import Iterator
from typing import Any

from fastapi import Request
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session

DEFAULT_DATABASE_URL = "sqlite:///./acme_salary_manager.db"


def get_database_url() -> str:
    """Return DATABASE_URL from the environment, or a local SQLite file."""
    return os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL)


def create_app_engine(database_url: str | None = None) -> Engine:
    """Create the app's engine. SQLite connections enforce foreign keys."""
    url = database_url if database_url is not None else get_database_url()
    engine = create_engine(url)
    if url.startswith("sqlite"):
        _enable_sqlite_foreign_keys(engine)
    return engine


def get_session(request: Request) -> Iterator[Session]:
    """FastAPI dependency: a Session bound to the running app's engine."""
    with Session(request.app.state.engine) as session:
        yield session


def _enable_sqlite_foreign_keys(engine: Engine) -> None:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection: Any, connection_record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
