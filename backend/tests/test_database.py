import pytest

from app.database import create_app_engine, get_database_url


def test_default_database_url_is_a_local_sqlite_file(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    url = get_database_url()
    assert url.startswith("sqlite:///")
    assert ":memory:" not in url


def test_database_url_reads_from_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:///somewhere.db")
    assert get_database_url() == "sqlite:///somewhere.db"


def test_sqlite_engine_enables_the_foreign_keys_pragma() -> None:
    engine = create_app_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        row = connection.exec_driver_sql("PRAGMA foreign_keys").fetchone()
    assert row is not None
    assert row[0] == 1
