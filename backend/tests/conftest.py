from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app

# Safe test-only values for every test by default, since create_app() now
# fails fast at startup if AUTH_SECRET_KEY is unset. A test that needs to
# exercise the "unset" behavior itself overrides this with its own
# monkeypatch.delenv -- the same monkeypatch instance is shared within one
# test, so that override applies on top of (and reverts independently of)
# this fixture's setenv calls.
_TEST_AUTH_SECRET_KEY = "test-only-secret-key-never-use-in-production"
_TEST_HR_USERNAME = "hr"
_TEST_HR_PASSWORD = "test-only-password"


@pytest.fixture(autouse=True)
def _default_auth_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AUTH_SECRET_KEY", _TEST_AUTH_SECRET_KEY)
    monkeypatch.setenv("HR_USERNAME", _TEST_HR_USERNAME)
    monkeypatch.setenv("HR_PASSWORD", _TEST_HR_PASSWORD)


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    # create_app's lifespan always touches the database (create_all,
    # ensure_currency_rates), so every test must point it at a throwaway
    # file, never the default database file.
    database_url = f"sqlite:///{tmp_path / 'test.db'}"
    with TestClient(create_app(database_url=database_url)) as test_client:
        yield test_client
