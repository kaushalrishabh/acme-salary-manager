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
