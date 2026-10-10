import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api import employees, health
from app.database import create_app_engine
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


def create_app(
    database_url: str | None = None, seed_count: int = DEFAULT_EMPLOYEE_COUNT
) -> FastAPI:
    logging.basicConfig(level=logging.INFO)

    app = FastAPI(title="ACME Salary Manager", lifespan=lifespan)
    app.state.engine = create_app_engine(database_url)
    app.state.seed_count = seed_count
    app.include_router(health.router)
    app.include_router(employees.router)
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
