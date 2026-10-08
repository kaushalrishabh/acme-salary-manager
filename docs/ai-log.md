# AI Log

How I used AI tools on this project, including what I changed or rejected.

## Template
### [07-10-26] Session N: topic
- **Prompt:** what I asked
- **Output:** what it produced
- **My review:** what I accepted, changed, or rejected, and why

### [07-10-26] Session 1: backend scaffold
- **Prompt:** Read CLAUDE.md and requirements; scaffold backend skeleton
  with uv, FastAPI app factory, /health, one test, ruff and mypy. Plan first.
- **Output:** FastAPI app factory, health endpoint, pytest test, tooling config.
- **My review:** [what you accepted, changed, or rejected. Example: "Asked it to
  drop an unneeded dependency" or "Accepted as-is; verified ruff, mypy, pytest pass."]
  
  ### [07-10-26] Session 1b: frontend scaffold
- **Prompt:** Read CLAUDE.md; scaffold frontend only (Vite, React, TypeScript,
  MUI + Data Grid, Vitest + React Testing Library, ESLint); one smoke test;
  placeholder page; plan first.
- **Output:** Vite React TS app in frontend/, MUI installed, Vitest config,
  one passing App test, lint and build scripts.
- **My review:** [Your real notes. Examples: "Verified lint, test and build
  pass." / "Rejected an extra routing library it proposed, since the P0 scope
  doesn't need it yet." / "Claude updated CLAUDE.md with frontend commands;
  reviewed the diff and kept it."]
- **Takeaway:** Asking for a plan before file writes made the review faster.

### [07-10-2026] Session 2a: deployment (Vercel + Render)

**Tools:** Claude chat for planning and research; Claude Code for
[drafting docs / scaffolding. Edit to match what you used it for].

**Decision: SQLite vs MySQL for the database**
- **Prompt:** Asked what switching from SQLite to MySQL would change for
  deployment.
- **Output:** Comparison of the two. MySQL would persist data but adds a
  third host, SSL, migrations and a Docker setup; Render's free tier has an
  ephemeral disk, so SQLite resets on restart.
- **My decision:** Stay with SQLite and reseed on empty start. The
  persistence gain didn't justify a third failure point for an assessment
  demo. The app reads `DATABASE_URL` so the database stays swappable later.

**Backend deploy on Render**
- **Prompt:** Asked how and where to host the FastAPI backend for free.
- **Output:** Render free web service, Root Directory `backend`, start
  command `uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- **My review:** Claude Code's local command used `--reload`, so I removed
  it for production. I learned that `--host 0.0.0.0` and `$PORT` are needed
  because Render's router is outside the container and assigns the port.

**Correction: AI-suggested command was wrong**
- The test command `PORT=8000 uv run uvicorn ... --port $PORT` failed with
  "Option '--port' requires an argument". The shell expands `$PORT` before
  the inline variable is set. I ran it locally before deploying, found the
  bug, and used `export PORT=8000` first. Lesson: verify AI-provided
  commands locally before trusting them.

**Frontend deploy on Vercel**
- Created a fresh project (an old unrelated one existed), Root Directory
  `frontend`, Vite preset.

**Result:** Both services live; `/health` returns 200. Documented the cold
start and reset behaviour in README and docs/deployment.md.

### [07-10-26] Session 2b: data model design and the currency decision

**Tools:** Claude Code for the first data model proposal and the doc edits;
Claude chat for design review, comparing options, and explaining trade-offs.

**First proposal (Claude Code)**
- **Prompt:** Asked for a design-only proposal of the data model, with no
  files written.
- **Output:** Salary stored only in local currency as integer minor units,
  exchange rates as scaled integers, and USD conversion done in Python after
  aggregating per currency in the database.
- **My review:** I reviewed it with Claude chat and found the multi-currency
  handling heavy: conversion happened in two places (Python and a SQL sort
  expression), there was an overflow concern, and org totals could differ by
  a few cents.

**Decision: local only, USD only, or both**
- **Prompt:** I proposed storing everything in USD only.
- **Output:** We compared three options: A) local only, B) USD only, C) store
  both. B has two costs: the entered number doesn't come back exactly after a
  round trip (e.g. 1,234,567 INR becomes 1,234,566.67 INR), and changing a
  rate would change what people appear to be paid.
- **My decision:** C. The local amount is the source of truth for exact
  individual figures, and a derived USD amount is used for insights and
  comparisons.
- **Consequences I accepted:** The USD column is derived data that can go
  stale. So only the service writes it (it is never accepted from API input),
  every create and update recomputes it, and a recompute script is needed if
  a rate ever changes. Tests will check that recomputing right after seeding
  changes zero rows.

**Currency and naming**
- **My decision:** Currency is derived from country (one fixed currency per
  country), so the API accepts country only. Currencies: INR, USD, GBP, EUR,
  CAD, AUD, SGD, JPY (JPY is the zero-decimal case). I renamed the salary
  column to `annual_gross_salary_minor` so the unit is visible in the name.

**Doc edits (Claude Code)**
- **My review:** When I reviewed the doc edits Claude Code proposed, I asked
  for these changes:
  - keep requirements.md to one page and move detail into design-notes.md
  - reword the average calculation so it uses the same half-even integer
    rounding helper instead of floor division
  - add a minimum and maximum salary check to input validation
  - add a test that every stored currency matches its country's currency

**What I'd tell a reviewer:** The design is simpler to query because of the
stored USD copy. The price is that every write path must go through one
conversion function.

### 2026-10-08 Session 2c: money module (test-driven)

**Tools:** Claude Code for writing the tests and the implementation; Claude
chat for reviewing the tests and explaining the reasoning.

**Tests first (Claude Code)**
- **Prompt:** Asked Claude Code to build `app/money.py` test-first: parse a
  major-unit string to minor units, one half-even integer rounding helper,
  and a function that converts minor units to USD cents using a
  scaled-integer rate. I told it to show me the failing tests before writing
  any implementation.
- **My review:** I reviewed the tests with Claude chat. The expected values
  were correct, including the tie cases (0.5 cents rounds to 0, 1.5 cents
  rounds to 2). Over two review rounds I sent back these additions: a strict
  input format, checks that results are real ints, conversion cases that are
  not ties, rejection of a zero or negative rate, `TypeError` for non-string
  input, `minor_unit` limited to 0 to 3, and leading zeros allowed.

**Why the strict input format**
- `Decimal` accepts input like `"1e3"`, `"1_000"`, whitespace and non-ASCII
  digits, and a huge exponent such as `"1e999999999"` could exhaust memory on
  a public endpoint. So the format (ASCII digits with one optional decimal
  point, max 40 characters) is checked with `re.fullmatch` before any
  `Decimal` conversion.
- **My decision:** I accepted that `"100."` and `".50"` are rejected, and that
  `"100.00"` is accepted for JPY because it is a whole number by value.

**Result**
- Tests failed first with `ModuleNotFoundError` (expected), then 70 passed,
  with ruff and strict mypy clean. No float, `/` or `round()` in `money.py`,
  and the rate scale (`10**9`) is defined once.

**Correction from tooling**
- Strict mypy rejected the first implementation ("Returning Any", because
  `10**minor_unit` is typed as `Any` when the exponent is not a literal). It
  was fixed by moving the scale into a small typed helper that also checks
  the 0 to 3 range.

**Checking the tests catch it**
- I changed the format check from `[0-9]` to `\d` on purpose to confirm the
  tests would catch it. My first attempt had a typo in the decimal part of
  the pattern, and 10 valid-amount tests failed. After fixing the edit,
  exactly two tests failed: the Arabic-Indic and fullwidth digit cases. I
  then reverted the change and confirmed all 70 pass again.

**What I learned:** Half-even rounding stops tie-breaking errors from adding
up in one direction across thousands of rows, and it is done on integers
because floats cannot represent money exactly. There is also no round trip
back from USD in this design, because the local amount is the source of
truth. Python's `\d` matches non-ASCII digits, which is why the pattern uses
`[0-9]`.

### 2026-10-08 Session 2d: reference data module (test-driven)

**Tools:** Claude Code for writing the tests and the implementation.

**Tests first**
- **Prompt:** Asked Claude Code to build `app/reference_data.py` test-first:
  the country -> currency map for 10 countries, and a currency table with
  `minor_unit` and `usd_rate_scaled` for the 8 supported currencies, built
  from `RATE_SCALE` in `app.money` with no literal `10**9` and no floats.
  Also a `RATES_AS_OF` date constant and a `RATES_NOTE` string. Told it to
  show me the failing tests before any implementation.
- **Output:** Tests covering: the exact country -> currency map; both maps
  immutable; currency codes matching the 8 supported currencies; JPY at 0
  decimal places and the rest at 2; each `usd_rate_scaled` checked against
  its decimal rate exactly via `Fraction`, independent of the formula used to
  derive it; round-number integration checks against `app.money.to_usd_cents`
  that don't depend on tie-breaking; and checks on `RATES_AS_OF` and
  `RATES_NOTE`.
- **My review:** I asked for three more tests before implementation: pinned
  literal values for EUR (`1_080_000_000`) and JPY (`6_700_000`), independent
  of the `Fraction` check; country codes are 2 uppercase ASCII letters;
  currency codes are 3 uppercase ASCII letters.

**Result**
- Tests failed first with `ModuleNotFoundError` (expected). The
  implementation wraps both maps in `MappingProxyType` so they can't be
  mutated, and builds every `usd_rate_scaled` from `RATE_SCALE` with integer
  multiplication and floor division (e.g. `108 * RATE_SCALE // 100` for
  1.08), never a literal `10**9`. All 136 tests passed, with ruff and strict
  mypy clean. A grep for `10**9` and `float(` in the file matched only an
  explanatory comment, not any arithmetic.

**Trade-off flagged, not yet decided**
- The two pinned literal values only hold because `RATE_SCALE` is `10**9`. If
  `RATE_SCALE` ever changes, those two tests break even though the
  `Fraction`-based test would still correctly confirm the rates are right.
  Left as is, since I asked for the literals on purpose.

**What I learned:** `MappingProxyType` catches accidental mutation of shared
reference data at the point it happens, rather than as a silent bug later in
the service or seed script.

### 2026-10-08 Session 2e: models and database setup (test-driven)

**Tools:** Claude Code for writing the tests and the implementation.

**Tests first**
- **Prompt:** Asked Claude Code to build `app/models.py` (SQLAlchemy 2.x
  `CurrencyRate` and `Employee` models, exactly as in design-notes.md) and
  `app/database.py` (reads `DATABASE_URL`, defaults to a local SQLite file,
  enables `PRAGMA foreign_keys=ON` for SQLite). Told it to use in-memory
  SQLite and show me the failing tests before any implementation.
- **Output:** Tests covering: `create_all` builds both tables; the
  `currency_rates` table can be filled from `app.reference_data`; a
  duplicate email is rejected; an unknown currency is rejected (foreign key
  enforced); a non-positive salary is rejected; the indexes and the
  constraint naming convention from design-notes.md exist.

**Correction: an AI-written test would have failed for the wrong reason**
- Claude Code's first draft of the `make_employee()` test helper set
  `hire_date` to a plain string (`"2020-01-01"`). Every constraint test in
  the file builds its employee through that one helper and only overrides
  the field it's actually testing, so a wrong default there would have
  broken all of them, not just a hire_date-specific test.
- I caught this in review: SQLite's `Date` column type rejects a plain
  string with `StatementError`, not `IntegrityError`. Since those are
  different exception types, every `pytest.raises(IntegrityError)` in the
  file — duplicate email, unknown currency, non-positive salary, the
  required-field checks — would have failed, and for the wrong reason: a
  type mismatch on a field the test wasn't even exercising, not the
  constraint actually under test. I only learned the cause by checking it,
  not because I already knew that distinction.
- **My decision:** asked for `hire_date` to be a real `datetime.date` before
  any implementation was written, with a comment in the test file explaining
  why.

**Second review round**
- I also asked for more tests before implementation: `currency_rates`
  rejects a `usd_rate_scaled` that is zero or negative and a `minor_unit`
  outside 0 to 3; `employees` rejects `None` for each required column,
  parametrized; and the duplicated currency-filling loop removed in favor of
  reusing the `seeded_currencies` fixture, with a comment that lowercasing
  email is the service's job, not the database's.

**Result**
- Tests failed first with `ModuleNotFoundError` (expected), then all 165
  passed on the first implementation attempt, with ruff and strict mypy
  clean.

**Corrections from tooling (not from me)**
- Strict mypy flagged three issues, all in the test file, none in the
  implementation: an unused `type: ignore`; `Employee.__table__` typed as
  the generic `FromClause` rather than `Table`, so
  `.indexes`/`.constraints`/`.foreign_key_constraints` weren't visible
  (fixed with two `cast(Table, ...)` aliases instead of scattered ignores);
  and a constraint's `.name` typed as `str | Literal[_NoneName.NONE_NAME]`
  rather than `str | None`, so an `is not None` check didn't narrow the type
  (switched to `isinstance(name, str)`).

**What I learned:** A test helper's default values matter for every test
that reuses it, not just the one that first needed them — a wrong default
can make a whole file of otherwise-unrelated tests fail for one shared
reason.
