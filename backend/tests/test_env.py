"""Tests for app.env.get_env: the one place every environment-variable
read in this app goes through, so a value that's set but blank (e.g. a
literal `KEY=` left over from an unfilled .env.example) behaves exactly
like not setting KEY at all.
"""

import pytest

from app.env import get_env

_VAR = "SCRATCH_ENV_VAR_FOR_TESTS"


def test_returns_none_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(_VAR, raising=False)
    assert get_env(_VAR) is None


def test_returns_none_when_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(_VAR, "")
    assert get_env(_VAR) is None


def test_returns_none_when_whitespace_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(_VAR, "   \t  ")
    assert get_env(_VAR) is None


def test_returns_the_stripped_value_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(_VAR, "  hello  ")
    assert get_env(_VAR) == "hello"
