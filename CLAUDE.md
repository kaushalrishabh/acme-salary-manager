# CLAUDE.md

## Project
Employee salary management app for an HR Manager at ACME (10,000 employees,
multiple countries). Replaces Excel. See docs/requirements.md (source of truth).

## Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy, SQLite, pytest, ruff, mypy, uv
- Frontend: React + TypeScript (Vite), MUI
- Deploy: live public URL required

## Commands (run from backend/)
- Install: `uv sync`
- Dev server: `uv run uvicorn app.main:app --reload`
- Tests: `uv run pytest`; one test: `uv run pytest tests/test_health.py::test_health_returns_ok`
- Pre-commit check: `uv run ruff check . && uv run ruff format --check . && uv run mypy && uv run pytest`

Backend code lives in `backend/src/app`; `create_app()` in `main.py` is the
app factory (tests build a fresh app per test via the `client` fixture).

## Commands (run from frontend/, Yarn 1 only, not npm)
- Install: `yarn install`
- Dev server: `yarn dev`
- Tests: `yarn test` (Vitest + React Testing Library, jsdom); one file: `yarn test src/App.test.tsx`
- Pre-commit check: `yarn lint && yarn build && yarn test` (`build` runs `tsc -b`, so it is the type check)

## Architecture
router -> service -> repository -> model. Business logic lives in services
and must be unit-testable without HTTP or a real DB.

## Domain rules
- One salary field: annual gross base, full-time. No bonus/allowances/deductions.
- Money is integer minor units. Never float.
- Salary stored in local currency; fixed rates in `currency_rates` to USD.
  No live FX. Per-country insights in local currency, org-wide in USD.
- Employee fields: id, full_name, email (unique), job_title, department,
  country, currency, annual_gross_salary, hire_date, created_at, updated_at.
- Insights: headcount, min, max, average, median, distribution buckets by
  country, department, job title. No AI / natural-language querying.
- Auth: single shared HR login, credentials from env vars. No roles.

## Working rules
- TDD: write the failing test first, then the code.
- Tests must be fast and deterministic (fixed seeds, no network, no clock).
- Small, incremental commits using conventional messages (feat:, test:,
  fix:, docs:, chore:, refactor:).
- Run ruff, mypy and pytest before every commit.
- Stay inside the P0 list in requirements.md. Ask before adding scope.
- Show a plan before writing files for any non-trivial task.
- After each session, remind me to log it in docs/ai-log.md.