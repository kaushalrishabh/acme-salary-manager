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


@pytest.mark.parametrize("value", ["", "   "])
def test_database_url_falls_back_to_default_when_set_but_blank(
    monkeypatch: pytest.MonkeyPatch, value: str
) -> None:
    # A literal `DATABASE_URL=` left in a copied .env.example is "set" as
    # far as os.environ is concerned, but must behave like unset -- an
    # empty string isn't a valid SQLAlchemy URL.
    monkeypatch.setenv("DATABASE_URL", value)
    url = get_database_url()
    assert url.startswith("sqlite:///")
    assert ":memory:" not in url


def test_sqlite_engine_enables_the_foreign_keys_pragma() -> None:
    engine = create_app_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        row = connection.exec_driver_sql("PRAGMA foreign_keys").fetchone()
    assert row is not None
    assert row[0] == 1
