import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api import auth as auth_api
from app.api import employees, health, insights, meta
from app.auth import get_auth_secret_key
from app.database import create_app_engine
from app.env import get_env
from app.errors import DuplicateEmailError, FieldValidationError, NotFoundError
from app.models import Base
from app.seeding import (
    DEFAULT_EMPLOYEE_COUNT,
    ensure_currency_rates,
    seed_employees_if_empty,
    seed_on_empty_enabled,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    engine = app.state.engine
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        ensure_currency_rates(session)
        session.commit()

        if seed_on_empty_enabled():
            start = time.perf_counter()
            inserted = seed_employees_if_empty(session, n=app.state.seed_count)
            if inserted:
                elapsed = time.perf_counter() - start
                logger.info("Seeded %d employees in %.2fs", inserted, elapsed)

    yield
    engine.dispose()


def get_cors_allowed_origins() -> list[str]:
    """CORS_ALLOWED_ORIGINS from the environment: comma-separated. Unset,
    empty, or whitespace-only means no origins allowed, not "allow
    everything".
    """
    raw = get_env("CORS_ALLOWED_ORIGINS") or ""
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app(
    database_url: str | None = None, seed_count: int = DEFAULT_EMPLOYEE_COUNT
) -> FastAPI:
    logging.basicConfig(level=logging.INFO)
    get_auth_secret_key()  # fail fast at startup, not on the first request

    app = FastAPI(title="ACME Salary Manager", lifespan=lifespan)
    app.state.engine = create_app_engine(database_url)
    app.state.seed_count = seed_count
    app.add_middleware(
        CORSMiddleware,
        allow_origins=get_cors_allowed_origins(),
        # Explicit, not "*": every method and header this API actually
        # uses, and nothing else.
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.include_router(health.router)
    app.include_router(employees.router)
    app.include_router(insights.router)
    app.include_router(auth_api.router)
    app.include_router(meta.router)
    app.add_exception_handler(NotFoundError, _not_found_handler)
    app.add_exception_handler(DuplicateEmailError, _duplicate_email_handler)
    app.add_exception_handler(FieldValidationError, _field_validation_handler)
    return app


async def _not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"detail": str(exc)})


async def _duplicate_email_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=409, content={"detail": str(exc)})


async def _field_validation_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, FieldValidationError)
    return JSONResponse(
        status_code=422,
        content={
            "detail": [{"loc": ["body", exc.field], "msg": exc.message, "type": "value_error"}]
        },
    )


app = create_app()
