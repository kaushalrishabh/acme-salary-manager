from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    # create_app's lifespan always touches the database (create_all,
    # ensure_currency_rates), so every test must point it at a throwaway
    # file, never the default database file.
    database_url = f"sqlite:///{tmp_path / 'test.db'}"
    with TestClient(create_app(database_url=database_url)) as test_client:
        yield test_client
