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

### 2026-10-09 Session 2f: seed generator and shared salary function

**Tools:** Claude Code for the design, tests and code; Claude chat for review.

**Design first**
- **Prompt:** Had Claude Code propose the seed design before writing any
  files: 22 job titles with USD salary bands, per-country pay multipliers,
  weighted countries, a fixed hire-date range, and emails unique by
  construction.
- **My review:** Reviewed the design with Claude chat and found three
  problems: the claim that adjacent salary bands do not overlap was false
  (Staff Engineer vs Engineering Manager, and Senior Account Executive vs
  Sales Manager overlap); a defensive clamp that could never run, which was
  removed in favour of a test; and a risk that Python's `random` module
  does not guarantee identical output across versions for methods other
  than `random()`, so no test pins a generated value.

**Decision: one shared salary function**
- The generator computed minor units and USD cents itself, which would
  duplicate the create/update path. We added one shared function,
  `derive_salary_fields`, used by the seed and later by the service. It
  also enforces the salary limits (1 to 100,000,000 major units).

**Test review caught a second regex mistake**
- Test review found the email pattern used `\d`, which matches non-ASCII
  digits; changed to `[0-9]`, the same issue as in the money module.

**First run: bad data in my own name lists**
- Tests failed on name-list entries with a space, a non-ASCII letter and a
  hyphen. They were replaced with plain ASCII surnames, and a direct test
  of the name lists was added.

**Result:** 214 tests pass, ruff and strict mypy clean, no `float`,
`round(` or new `10**9` literal.

**What I learned:** Derived data should have one writer; test the rule
itself, not just samples of it.

### 2026-10-09 Session 2g: seeding on startup

**Tools:** Claude Code for the design, tests and code; Claude chat for review.

**Design first**
- **Prompt:** Asked Claude Code for a design-only proposal first: functions
  to fill `currency_rates`, check whether `employees` is empty, bulk insert
  generated employees in one transaction, and seed only when the table is
  empty; a `SEED_ON_EMPTY` environment flag read in the FastAPI lifespan,
  off by default; and a timing script.

**Review caught a test that could pass for the wrong reason (in-memory SQLite)**
- Review with Claude chat found that the proposed lifespan test could pass
  for the wrong reason. In-memory SQLite gives each thread its own
  database; Claude chat reproduced this in a scratch project (a second
  thread got "no such table"). The default database is a file on disk,
  which tests must not touch. So
  `create_app` takes `database_url` and `seed_count`, the engine is stored
  on `app.state`, and the lifespan tests use a real SQLite file under
  pytest's `tmp_path`.

**A "flag off, zero rows" test alone proves nothing**
- A test that only checks "flag off, zero rows" would still pass if the
  lifespan never seeded at all. We added a flag-on test with
  `seed_count=20` that expects exactly 20 rows.

**Currency rates would have been silently rolled back**
- The review also found that with the flag off, the currency rates
  inserted at startup would be rolled back when the session closed, because
  nothing committed them. We added an assertion that `currency_rates` holds
  all eight currencies with the flag off, and made the lifespan commit.

**A log line that wouldn't actually show under uvicorn**
- The review found that an INFO log line from the app's own logger does
  not show under uvicorn unless logging is configured. Claude chat
  reproduced this in a scratch app. The caplog test would pass anyway, so
  we configured logging at app creation, and I confirmed the real output by
  running uvicorn myself.

**A check command left a misleading empty file**
- My first local run showed no "Seeded" line and no scratch.db file, which
  meant the implementation had not been written yet. The empty scratch.db
  that appeared afterwards came from the check command itself (sqlite3
  creates a missing file), so I switched the check to read-only mode.

**Result:** With `SEED_ON_EMPTY=true`, uvicorn logged "Seeded 10000
employees in 0.16s" on my laptop (file database, one transaction), and a
read-only query showed 10000 employees and 8 currency_rates. 242 tests
pass, ruff and strict mypy clean. On Render's free tier the log line
reported 2.90 s.

**What I learned:** A test can pass for the wrong reason, so check what
would still pass if the feature were removed; and verify real output, not
only test output.

### 2026-10-10 Session 3: Employees API, Slice 1 (list) and Slice 2 (writes)

**Tools:** Claude Code for the design proposal and all implementation.
Claude (claude.ai chat) for an independent review of the design and of each
slice report.

**Design first**
- Asked Claude Code for a complete API contract and internal design
  (router/service/repository split, Pydantic schemas, endpoint shapes, the
  exact test list per slice) before any code, so I could review the whole
  shape once and then build it slice by slice.
- Had the design reviewed separately in a Claude chat, which ran scratch
  checks against real behaviour rather than just reading it. That review
  found three defects in the proposal:
  1. The EXPLAIN QUERY PLAN test asserted `"SCAN TABLE employees" not in
     plan_text`, but SQLite 3.36+ prints `SCAN employees`, so the assertion
     could never fail.
  2. The login check joined two `hmac.compare_digest` calls with `and`,
     which short-circuits and leaks timing, and `compare_digest` raises
     `TypeError` on non-ASCII `str`, which would turn a bad login into a 500.
  3. The bucket rule (`width = (max - min) // 10`) gave width 0 for any
     range under 10, not only when `min == max`, putting everyone in the
     last bucket.
  The same review confirmed the 422 shapes, `extra="forbid"` behaviour, the
  201/204 statuses, and CORS header behaviour in a scratch FastAPI app, and
  noted that the `.ilike()` portability claim was overstated.
- Approved the design with corrections: `POST /employees` returns 201; three
  separate insights endpoints; a missing `AUTH_SECRET_KEY` fails fast with
  no dev fallback; buckets use a ceiling-width rule; the EXPLAIN assertion
  must match positive plan text; the login compare must encode to bytes and
  evaluate both comparisons without short-circuiting.

**Slice 1 (list): built test-first, one commit per red/green step**
- `money.minor_to_major` (the exact inverse of `parse_major_to_minor`) ->
  `EmployeeRepository` (list/get/options) -> `EmployeeService` + schemas +
  errors -> the three GET routes.
- Process slip, caught by Claude Code and corrected before pushing: its first
  commit bundled the `minor_to_major` test and implementation under a "red"
  message. It undid this with `git reset --soft` and recommitted as separate
  red and green steps.
- mypy caught one real bug: the repository's `list` method shadowed the
  builtin `list` type inside its own class body once `from __future__ import
  annotations` was in play. Renamed to `list_employees`.
- Asked which of the 5 plan tests passed when I dropped the `country` index.
  It was the timing smoke test. That test had no plan assertion at all, so it
  passed on a disguised full scan: SQLite walked `ix_employees_full_name` to
  satisfy `ORDER BY` and applied `country=?` as a residual filter. The four
  tests that inspect plan text did fail. Tightened every test, including the
  timing one, to require `SEARCH employees USING INDEX ix_employees_country`
  specifically, then re-ran the same mutation: all 5 failed.
- Measured at 10,000 seeded rows: `GET /employees` with a country filter,
  every sort field, both orders, 2-4ms per request.

**Slice 2 (writes): same pattern**
- Repository writes (create/get_by_email/update/delete, no method commits)
  -> `EmployeeService` writes (`derive_salary_fields` on both create and
  update; `InvalidAmountError` mapped to `FieldValidationError(
  "annual_gross_salary", ...)`, caught before the plain `ValueError` that
  maps to `"country"`) -> the three write routes, no auth yet.
- Mutation-checked two tests: removed email lowercasing in `create_employee`
  and confirmed the case-insensitive duplicate test failed (neither the
  pre-check nor SQLite's case-sensitive unique constraint caught it); removed
  the `existing.id != employee_id` self-exclusion in `update_employee` and
  confirmed the "own email" test failed while the "different employee" test
  still passed.
- Manual round trip against a seeded 10,000-row DB with a JPY employee: POST
  "6500000" JPY gave `"6500000"` and USD `"43550.00"`; PUT changing only
  `country` to US with the same salary string gave `"6500000.00"` and
  `"6500000.00"`. DELETE returned 204, then GET returned 404.
- Recorded in design-notes.md that writes are unprotected until auth exists
  (Slice 4) and this backend must not be redeployed before then.

**Three follow-up gaps, closed before Slice 3**
- Verified over all 10,000 seeded rows that every email is already lowercase.
  Added a model test proving SQLite's unique constraint on email is
  case-sensitive, so the lowercasing is what keeps duplicates out.
- Verified `PUT` bumps `updated_at` and leaves `created_at` unchanged for a
  real change. A PUT with an identical body does not change `updated_at`,
  because SQLAlchemy sees no net change and emits no UPDATE. Accepted: the
  column means "when the data last changed", and an audit trail is out of
  scope.
- `session.rollback()` before `raise DuplicateEmailError` was already in
  place; added the missing test that the session survives a commit-time
  race. Mutation-checked: removing the rollback fails the new test with
  `PendingRollbackError`, while the router-level duplicate test still passes
  because FastAPI opens a fresh session per request.

**Result:** 327 tests pass; ruff and strict mypy clean.

**What I learned:** A loose assertion ("some index was used") can pass for
the same wrong reason a missing assertion can: SQLite will substitute a
different index to avoid a sort. And a missing rollback can be invisible at
the API layer when every request gets a fresh session.

### 2026-10-11 Session 4: Employees API, Slice 3 (insights) and Slice 4 (auth + CORS)

**Tools:** Claude Code for the design and all implementation. A separate
Claude chat reviewed each slice's report after I accepted it, before the
next slice started.

**Slice 3: insights**
- Built in the established order: `InsightsRepository` (red, then green)
  → `InsightsService` (average/median/buckets; red, then green) → an
  end-to-end median test → the `/insights/country`,
  `/insights/department`, `/insights/job-title` routes, wired into
  `main.py`, with comprehensive integration tests written straight after
  (not red-first; see "process slip" below).
- Design: exactly two queries per dimension -- one `GROUP BY` for
  count/sum/min/max, one bulk `(group_value, salary)` fetch grouped in
  Python with `itertools.groupby`. Verified with a SQLAlchemy
  `before_execute` listener counting real statements per request: exactly
  2, for all three endpoints.
- Three mutation checks, each performed once and reverted: dropping the
  bulk query's secondary `ORDER BY` (on salary) broke an integration-level
  median test; un-clamping the last bucket's `range_max` (letting it run
  past `max` instead of clamping to it) failed 4 of 5 bucket tests;
  swapping `round_half_even` for `//` in average failed the one test built
  specifically to disagree with floor division, while two other average
  tests coincidentally still passed.
- A gap I found in my own test suite before trusting it: my first
  `compute_median` tests passed an already-sorted list directly, so
  removing the repository's secondary `ORDER BY` couldn't have affected
  them. I added `test_median_is_correct_even_when_rows_are_inserted_out_of_salary_order`
  (through the real repository, not a hand-built list) before running that
  mutation check.
- Differential test, at 10,000 seeded rows: every group's
  count/min/max/average/median/distribution recomputed independently
  (Python's `decimal` module for rounding, a separate reimplementation of
  the bucket rule rather than calling `compute_buckets`) and compared for
  exact equality against the live endpoint, across all three dimensions.
  Stated limitation: the independent bucket reimplementation shares the
  same documented rule as the real one, so it could not have caught a
  shared misreading of that rule -- only an implementation bug, such as an
  off-by-one or a wrong clamp, in one but not the other.
- mypy found two real issues, both in the repository: a helper's
  parameters were typed `ColumnElement[str]`/`ColumnElement[int]`, but
  `Employee.country` etc. are `InstrumentedAttribute`, which isn't
  assignable there (fixed by typing the helper as `InstrumentedAttribute`);
  and labelling the headcount column `"count"` would have shadowed
  `Row`'s own `.count()` tuple method, which mypy's `Row` stub types
  regardless of any per-query label (fixed by labelling it `"headcount"`
  instead, with the `DimensionAggregate` dataclass field still called
  `count`).
- Measured at 10,000 rows (5-run average each): `/insights/country`
  ~15ms, `/insights/department` ~15ms, `/insights/job-title` ~16ms.
- 365 tests passed at the point Slice 3 was accepted.

**Review-chat findings on Slice 3**
- The average mutation (swapping to `//`) only proved floor division was
  caught, not that half-even and half-up actually disagree -- some values
  round the same way under both. I asked for cases that distinguish them
  (5/2 → 2, 1/2 → 0, both differing from half-up's 3 and 1) and
  mutation-checked those specifically.
- The "last bucket excludes max" mutation was requested but not run; I ran
  "un-clamp the last bucket" instead (letting `range_max` run past `max`
  rather than clamping to it), which was accepted as equivalent coverage of
  the same clamp.
- Group ordering across the three dimensions turned out to be incidental
  SQLite behaviour (it happens to return `GROUP BY` results sorted via a
  temp B-tree), not a guarantee -- Postgres, which the schema is kept
  compatible with, can use hash-based grouping with no such ordering at
  all. I added an explicit `ORDER BY group_column` and tests inserting rows
  in scrambled order for all three dimensions.
- It was noted that there is no organisation-wide summary endpoint
  (one set of aggregates across the whole company, not split by any
  dimension). Deferred as a possible addition in a later slice; not
  committed to.

**Slice 4: auth + CORS**
- Tokens: `itsdangerous.URLSafeTimedSerializer`, `max_age=3600`.
  `BadSignature`/`SignatureExpired` both become a 401 with
  `WWW-Authenticate: Bearer`.
- Credential check: username and password are both encoded to UTF-8 bytes
  before `hmac.compare_digest` (bytes never raise `TypeError` on non-ASCII
  content; `str` can). Both `compare_digest` calls run unconditionally,
  combined with `&`, never `and`. A spy test wraps `hmac.compare_digest`
  with a `MagicMock` and asserts it was called twice even when the
  username alone is wrong.
- Three mutation checks, each performed once and reverted: inlining the
  two `compare_digest` calls with `and` (so the second one could actually
  be skipped, not just swapping the final combinator on already-computed
  values) dropped the spy's call count from 2 to 1; dropping `max_age` from
  the token-verification call let an "expired" token through; removing
  `Depends(require_auth)` from `DELETE /employees/{id}` made its
  "without auth" test fail (204 instead of 401), while the other two
  routes' equivalent tests were unaffected.
- Two real bugs found, neither in the core logic: my first tampered-token
  test flipped the token's *last* character, which doesn't reliably
  invalidate it -- base64's final character can have unused "slack" bits
  when the encoded byte count isn't a multiple of 3, so more than one
  character value decodes to the same bytes there; fixed by flipping the
  *first* character instead. Separately, `app.main` has a module-level
  `app = create_app()` (for `uvicorn app.main:app`), which runs once at
  import time, before any pytest fixture exists -- once `AUTH_SECRET_KEY`
  became required, this broke test collection itself. Fixed by having
  `conftest.py` set `AUTH_SECRET_KEY`/`HR_USERNAME`/`HR_PASSWORD` via
  `os.environ.setdefault` before importing `app.main` at all, not only via
  the per-test fixture.
- Deviations from the planned TDD order: the login route
  (`app/api/auth.py`) and the CORS/fail-fast/`Depends(require_auth)`
  wiring in `main.py` and `app/api/employees.py` were written before their
  tests, on the judgment that pure wiring with no logic of its own didn't
  need a red step. The comprehensive tests passed in full once written, so
  nothing was masked, but this was not the clean TDD run I'd been
  following in every other file.
- `require_auth` is attached via `dependencies=[Depends(require_auth)]` on
  the route decorator, not as a function parameter, since the handler
  never uses its return value.

**Review-chat finding on Slice 4**
- CORS had only been tested against a simple `GET`. The review raised
  preflight as a risk: a browser sends an `OPTIONS` preflight before a
  cross-origin `PUT`/`POST`/`DELETE` carrying an `Authorization` header, and
  Starlette's bare `CORSMiddleware` defaults (`allow_methods=("GET",)`, no
  headers allowed) would reject that with 400. Checking my own code, I
  found it already used `allow_methods=["*"]` and `allow_headers=["*"]`,
  not Starlette's bare defaults, so no functional bug existed: the
  preflight tests I added passed immediately, with no red state. I
  replaced the wildcards with an explicit list
  (`["GET", "POST", "PUT", "DELETE"]` and
  `["Authorization", "Content-Type"]`) anyway, as hardening -- more
  auditable than `"*"` -- and mutation-checked it against Starlette's
  genuine bare defaults: with those restored, the three write-method
  preflight tests failed with 400, while the disallowed-origin test was
  unaffected. Reverted.

**Known limits accepted, recorded in design-notes.md:** no rate limiting or
lockout on login attempts; no logout or revocation (a token is valid until
it expires); rotating `AUTH_SECRET_KEY` invalidates every outstanding token
at once.

**Result:** 414 tests pass (`uv run pytest`, fresh run), ruff and strict
mypy clean.

**What I learned:** A test that passes proves nothing until it has been
deliberately broken and watched to fail -- my own first average and
group-ordering checks passed without proving what I thought they proved
(floor division coinciding with half-even on some values; SQLite's
incidental sort order). And a CORS test against a simple `GET` says
nothing at all about whether the preflight for an actual write request
would be rejected.

### 2026-10-11 Session 5: backend deployment, S6 frontend, and four rounds of UI polish

**Tools:** Claude Code for implementation; a separate Claude chat for
review of each report, deployment help, and debugging.

**1. Backend deployment (Render)**
- First deploy failed at startup with "AUTH_SECRET_KEY environment
  variable must be set". That was the fail-fast design working, not a
  bug: the env vars (`HR_USERNAME`, `HR_PASSWORD`, `AUTH_SECRET_KEY`,
  `CORS_ALLOWED_ORIGINS`) hadn't been set on Render yet. I set them and
  redeployed.
- Verified the live API with curl: `GET /employees` 200, a write without
  a token 401, login returned a token with `expires_in` 3600, then an
  authenticated create (a JPY employee: 6,500,000 JPY -> 43,550.00 USD,
  the same conversion as the local round trip from Session 3) and
  delete 204, and all three insights endpoints 200.
- Render seeds 10,000 employees at startup because `SEED_ON_EMPTY` is on
  and the SQLite database is empty on each start, so the demo database
  resets on restart -- documented in docs/deployment.md.
- Housekeeping caught during this work: I had edited `.env.example`
  locally with real values; `git diff` showed it before any commit, so I
  restored the file, moved the real values into an ignored `backend/.env`,
  and added `.env` to `.gitignore` (commit `7b2f179`; `git check-ignore`
  confirmed it). Nothing secret was committed (verified with `git log -S`).
- Later, a follow-up pass on `.env.example` itself (commit `74af2fa`): set
  `CORS_ALLOWED_ORIGINS=http://localhost:5173` with a comment explaining
  it's the local frontend's origin and production sets its own; confirmed
  `DATABASE_URL` and the `AUTH_SECRET_KEY` generate-command comment were
  already in place from earlier; checked docs/deployment.md and the
  README for anything describing these vars (no mismatches found); and
  confirmed `*.db` was already covered by `backend/.gitignore`.

**2. S6: React frontend and employee table**
- Stack: Vite, React, TypeScript strict, TanStack Query, MUI core `Table`
  (not the X Data Grid), Vitest, React Testing Library, MSW, Yarn instead
  of npm. CLAUDE.md said Yarn 1 only, but the brief's own wording and the
  Vercel build command recorded in docs/deployment.md both said npm --
  Claude Code flagged the conflict and asked; I chose Yarn, to match the
  already-committed `yarn.lock`, and had the Vercel build command note
  corrected to `yarn build`.
- Build order, each as its own red/green commit: utils (pagination, date,
  money) -> typed API client with one `ApiError` shape -> employees API
  functions and TanStack Query hooks -> MSW wired into the test setup ->
  `useDebouncedValue` and `useSlowRequest` hooks -> the `EmployeeTable`
  component -> the App shell (AppBar, `QueryClientProvider`). 42 tests
  passing at the end of the slice.
- Two mutation checks, both run and reverted: disabling the
  page-reset-on-filter-change logic failed the "changing a filter resets
  the page to 1" test; removing the `+1` offset in the MUI-to-API page
  conversion failed both its own unit test and the "next page" component
  test.
- Findings along the way: `Intl.NumberFormat` falls back to the JS
  runtime's own locale when passed `undefined`, which produced
  Indian-style digit grouping in this environment instead of the expected
  Western grouping -- pinned to `'en-US'` explicitly. MSW v3 renamed its
  `onUnhandledRequest` option to `onUnhandledFrame` (caught by a `tsc`
  type error, not a failing test). `eslint-plugin-react-hooks`'s
  `set-state-in-effect` rule rejects a synchronous `setState` at the top
  of an effect body; hit twice (`useSlowRequest`'s reset, and the table's
  page-reset-on-filter-change) and fixed both times by following React's
  own documented pattern instead of an effect -- a cleanup-function reset
  for the hook, a render-time comparison against the previous filters key
  for the table. The debounce and slow-server component tests use real
  timers, not fake ones: combining Vitest's fake timers with MSW's async
  fetch mocking made the whole test file hang.
- Process slip: commit `b7a8276` bundled the green `useDebouncedValue`
  implementation together with the red (failing) tests for the separate
  `useSlowRequest` feature, breaking the clean red/green-per-commit rule
  I'd otherwise followed throughout.
- Claude Code had no browser automation available, so it could not see
  the UI itself. It started a local backend seeded with 10,000 employees
  and I ran the dev server against it myself: confirmed 25 rows per page
  and the "10,000 employees" count, the page jumping back to 1 when the
  sort changes, filters working alone and combined, search sending one
  request after typing stops, and JPY salaries showing no decimal places.
- Review-chat contributions: asked it to check the live Render CORS
  preflight headers and the deployed commit, after Claude Code noticed
  the deployed response didn't match the latest local CORS-hardening
  commit (`989a3fe`) -- flagged as open, still not resolved. Separately
  confirmed that the limited set of sortable columns (name, hire date,
  salary in USD) is a deliberate backend decision from Slice 1
  (`sort: Literal["full_name", "hire_date", "salary"]`), not a frontend
  gap, because local-currency salaries aren't comparable across
  employees paid in different currencies.

**3. UI polish, four rounds (driven by my screenshot reviews -- Claude
Code has no browser, so every round started from something I'd seen and
it hadn't)**

**Round 1**
- Requested: a modern MUI theme, clearable filters, a full-width filter
  row (four equal columns on desktop, 2x2 on mobile), and sort
  affordances restricted to the three sortable columns.
- Result: 48 tests. Two mutation checks, both run and reverted: disabling
  the page-reset logic failed 5 tests (the pre-existing filter-reset test
  plus the four new clear-button tests); adding a `TableSortLabel` to the
  Department header failed the "only three sortable columns" test.
- Chose MUI's `Autocomplete` over `Select` for Country/Department/Job
  title specifically for its built-in clear (x) button, which `Select`
  doesn't have. Hire dates now render as "26 Jun 2017"
  (`Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' })`) instead of the
  browser's locale-default format, so the display reads the same way
  regardless of viewer locale.
- Finding: MUI's Autocomplete clear button is CSS `visibility: hidden`
  until the field is focused or hovered. The first version of each
  clear-button test failed even though the button was already in the DOM,
  because Testing Library correctly treats a CSS-hidden element as
  inaccessible. Fixed by having each test focus the field first (the same
  thing a sighted user has to do) via `getByRole('combobox', ...)` rather
  than `getByLabelText` -- the clear button's own aria-label also
  contains the filter's name, so a text-based label query matched both
  elements.
- The app heading changed from "ACME Salary Manager" to "HR Salary
  Manager" at my request.
- **Clear-button follow-up** (separate request, same round's theme): MUI
  hiding the clear indicator until hover or focus meant touch devices --
  no hover state at all -- had no visible way to clear an active filter.
  Fixed with a theme-level `MuiAutocomplete` override forcing it visible
  whenever the field has a value. Finding along the way: the component
  tests had never actually wrapped `EmployeeTable` in the real app
  `ThemeProvider`, only MUI's default theme -- so this (and any other
  theme-dependent behaviour) had never really been under test. Fixed by
  wrapping the test's render helper in the same theme the app uses. 55
  tests; reverting the override back to hidden fails all 6
  clear-button-dependent tests.
- Still pending, not yet done: applying the Vercel build-command fix
  (`npm run build` -> `yarn build`) and the `VITE_API_URL` production
  environment variable in the actual Vercel dashboard, and re-verifying
  the live deployed site afterward.

**Round 2**
- From my review: country codes should read as names, the standalone
  employee count above the table was redundant with the pagination
  footer's own total, and hire dates needed to never wrap.
- Added `formatCountryName(code)` via `Intl.DisplayNames(['en'], { type:
  'region' })`, falling back to the code itself when there's no display
  name (tested directly: US/GB/IN resolve to their names, an unassigned
  code like "XX" returns itself). Used for the Country filter's options
  (sorted by name, matching on name *or* code when typing) and the
  table's Country chip -- the value sent to the API is always still the
  two-letter code. Mutation-checked: making the filter send the display
  name instead of the code fails a dedicated test expecting `country=GB`.
- Removed the "X employees" line above the table; the pagination
  footer's own range/total was already showing it.
- 52 tests.

**Round 3**
- From my screenshots: Department/Country chips and the Name header
  weren't centred like the other headers, the pinned Name header looked a
  different colour from the rest at 390px, salary figures needed to stay
  digit-aligned while still sitting under their centred headers, Job
  title rows had uneven height, and on a phone the next-page arrow was
  cut off with the horizontal scrollbar overlapping the pagination row.
- The pagination/horizontal-scroll bug turned out to be the toolbar
  itself being wider than a 390px screen (rows-per-page label + select +
  range text + prev/next all in one row), not pagination being nested
  inside the scrolling table container (a DOM-structure test proved it
  already wasn't, mutation-checked by moving it back inside and
  confirming that test fails). Fixed by hiding the rows-per-page control
  below the `md` breakpoint.
- Salary figures: right-aligned inside a fixed-120px box so digits line
  up down the column, with the box itself centred under the header.
  58 tests.

**Round 4**
- From my screenshots: round 3's fixes had pushed the table past its
  container at desktop widths -- a horizontal scrollbar and a clipped
  Hire date column even at 1920px, which hadn't been there before round
  3's per-column minWidths.
- Root cause: `minWidth`/`maxWidth` on individual columns can't stop a
  table from exceeding its container; only `table-layout: fixed` with
  percentage widths can. Fixed in the order I asked for: raised the
  content container's cap from MUI's default 1200px to 1680px; cut cell
  horizontal padding from 16px to 12px; switched the table to
  `table-layout: fixed` with an explicit percentage budget per column at
  the `lg` breakpoint (1200px) and up, keeping the existing auto-layout/
  horizontal-scroll/pinned-Name behaviour below it; added ellipsis plus a
  full value in a `title` attribute to Name/Email/Job title (mutation-
  checked: removing the attribute fails the new truncation test); shrank
  the salary figure's fixed box from 120px to a 7.5em minWidth now that
  the column itself is width-constrained. 59 tests.
- Name header background: I asked Claude Code not to guess again and to
  read the actual theme and MUI source. It found every header cell,
  pinned or not, already drew its background from the exact same MUI
  `stickyHeader` rule (`background.default`, fully opaque, no alpha
  anywhere in the chain) -- round 3's explicit override on just the Name
  cell resolved to the identical literal value, so it couldn't have been
  the cause of a visible difference. Removed as redundant rather than
  replaced with a new guess, leaving one shared rule that can't diverge
  from itself.
  **TODO (me):** confirm from the next screenshot whether the Name header
  still looks different -- if it does, the cause isn't in this code and
  needs to be found visually.
- Column-width budget used (percentages of the table, estimated from
  character counts, not measured): Name 12%, Email 19%, Job title 17%,
  Department 10%, Country 12%, Salary 10%, Salary (USD) 10%, Hire date
  9% (sums to 99%). Also changed the table's own scroll-area height from
  a flat 560px to `calc(100vh - 320px)` at `lg`+, from an *estimate* of
  the surrounding chrome (AppBar + container padding + filters card +
  pagination, ~274px, rounded up), so the page itself wouldn't also need
  to scroll on top of the table's own scroll area.
  **TODO (me):** confirm at 1280px, 1440px, 1920px, and 390px that there's
  no horizontal scrollbar at the three desktop widths, that the column
  widths actually look right (not just summing to 99%), and that the
  `320px` constant doesn't need tuning -- these are estimates, not
  measurements.
- Deferred, not done: the >500kB JS bundle-size warning from `vite
  build` -- plan to lazy-load the insights route once it exists in S7.

**4. Local-run bugs (two, both backend)**
- Running the backend locally so Claude Code could point a dev frontend
  at real data (it has no browser, so this was the closest it could get
  to checking its own UI work) hit the same "AUTH_SECRET_KEY environment
  variable must be set" error the first Render deploy hit --
  `uv run uvicorn app.main:app --reload` doesn't load a `.env` file on
  its own. Passing `--env-file .env` then failed a different way:
  `backend/.env` has `DATABASE_URL=` (intentionally blank, meaning "use
  the SQLite default"), but `--env-file` sets that as an actual
  empty-string environment variable, and the code's
  `os.environ.get("DATABASE_URL", DEFAULT)` only falls back to the
  default when the key is absent, not when it's merely empty -- so
  SQLAlchemy received an empty URL and failed to parse it.
- Fixed by exporting only the specific variables the app needs inline
  (`AUTH_SECRET_KEY`, `HR_USERNAME`, `HR_PASSWORD`,
  `CORS_ALLOWED_ORIGINS`, and `SEED_ON_EMPTY=true` for sample data)
  without `--env-file`, so `DATABASE_URL` stayed unset and the code's own
  default applied.
- Separately, two full test/build runs during the UI polish pass took
  600-900 seconds instead of the usual ~10, with no error -- caused by a
  leftover `yarn dev` (Vite) process still running in the background from
  the manual verification step, competing with the test runner's own Vite
  instance over the same dependency cache. Killing the leftover dev
  server brought run times back to normal immediately.
- **Second bug, more serious:** copying `.env.example` to `.env` and
  leaving `DATABASE_URL=` blank crashed startup with
  `sqlalchemy.exc.ArgumentError` -- a plain `os.environ.get(name,
  default)` only falls back to `default` when the key is *absent*, not
  when it's present but blank, and `.env.example`'s own comment claiming
  it "defaults to local SQLite if unset" was therefore wrong for this
  exact case. Fixed with one shared `app.env.get_env(name)` helper, now
  used for every environment read in the backend: `None` for unset,
  empty, or whitespace-only, otherwise the value. Beyond fixing the
  crash, this closed a real correctness gap, not just a startup one:
  `HR_USERNAME=""` previously meant `expected_username` was `""`, not
  `None`, so a blank env var plus a blank *submitted* username could
  authenticate. `SEED_ON_EMPTY` and `CORS_ALLOWED_ORIGINS` turned out to
  already handle a blank value correctly before this fix (added
  regression tests for those rather than fixes). 9 tests fail when the
  helper is reverted to a plain `os.environ.get`; 429 backend tests pass
  overall. Verified directly, not just by the test suite: a fresh copy
  of `.env.example` with the three required values filled in boots and
  answers `/health` with 200; a copy with them left blank fails at
  startup with the same clear `AUTH_SECRET_KEY` message as an unset one,
  not a confusing crash.

**5. Review-chat contributions on the UI polish rounds**
- Spotted directly from my screenshots, each driving the next round:
  the mobile pagination arrow cut off and overlapped by the scrollbar;
  Department/Country chips not centred under their (centred) headers;
  salary column headers sitting off-centre from their own figures; and
  the desktop horizontal scrollbar/clipped Hire date column that round 4
  fixed.
- Also used for the live-deployment checks noted in sections 1 and 2
  above (Render env vars and curl verification; the CORS
  preflight/deployed-commit mismatch, still open).

**Known limits and open items, as of this session:**
- The backend database resets on every restart (free-tier Render disk is
  not persistent) -- a known, accepted limit, not a bug.
- No rate limiting or lockout on login attempts (carried over from
  Session 4, still true).
- Render's health check path is `/health`.
- Still open: the possible stale Render deployment (CORS headers not
  matching the latest local commit, flagged in section 2); the Vercel
  dashboard settings (section 3, round 1); the two round-4 TODOs above.

**Result (fresh runs, end of this session):** `uv run pytest` --
429 passed. `yarn test` -- 59 passed (10 test files).

**What I learned:** `uv run`'s environment handling doesn't match a plain
shell's -- it doesn't read `.env` by default, and `--env-file` treats a
blank value as "set to empty", which isn't the same thing the
application's own fallback logic assumes. A dev server left running in
the background isn't always harmless -- it can silently slow down an
unrelated test or build run in the same project by 10-100x. A green test
suite (414 tests, at the time) can still miss a real startup bug if none
of those tests actually boot the app from a copy of the example file
itself, rather than from hand-set environment variables. And a passing
layout test in jsdom proves a style rule exists, not that it renders
correctly -- stacked per-column minWidths can silently overflow a
container in a way no test catches, a hover-only control isn't
accessible on a touch device regardless of what the DOM says, and a
sizing constant derived from arithmetic needs to be labelled an estimate
until someone actually measures the rendered page.
