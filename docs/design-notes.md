# Design Notes: Data Model

How employee salaries and currency rates are stored, converted and
aggregated, and why. requirements.md stays the source of truth for scope;
this file records how the backend meets it.

## Decisions at a glance

1. Each employee's salary is stored twice: local currency in minor units
   (`annual_gross_salary_minor`, the source of truth) and a derived USD amount
   in cents (`annual_gross_salary_usd_cents`). `app.salary.derive_salary_fields`
   is the function that create, update and the seed generator call to derive
   currency, convert the salary and enforce the salary limits. The recompute
   script re-applies `to_usd_cents` directly to each employee's stored minor
   amount; a shared helper will be factored out when that script is built.
   The API never accepts currency or the USD amount as input.
2. Each country has exactly one fixed currency. The API accepts the country
   only, and the service derives the currency from the country map, so a
   country/currency mismatch cannot be entered.
3. Supported currencies: INR, USD, GBP, EUR, CAD, AUD, SGD, JPY.
4. Insights that span countries aggregate the USD column in the database.
   Per-country insights use the local column. Median is computed in the
   service layer.
5. Changing a rate requires running the recompute script.

## Tables

All columns are NOT NULL. Types are portable SQLAlchemy 2.x types that map
cleanly to both SQLite and Postgres.

### `currency_rates`

| Column | Type | Notes |
|---|---|---|
| `currency_code` | `String(3)` PK | ISO 4217, e.g. `EUR` |
| `minor_unit` | `SmallInteger` | Decimal places: 0 for JPY, 2 for all others |
| `usd_rate_scaled` | `BigInteger` | USD per 1 major unit × 10⁹, e.g. 1.08 → `1_080_000_000` |

Constraints: `usd_rate_scaled > 0`, `minor_unit BETWEEN 0 AND 3`.

### `employees`

| Column | Type | Notes |
|---|---|---|
| `id` | `Integer` PK | |
| `full_name` | `String(200)` | indexed |
| `email` | `String(254)` | unique; lowercased by the service before saving |
| `job_title` | `String(100)` | indexed |
| `department` | `String(100)` | indexed |
| `country` | `String(2)` | ISO 3166-1 alpha-2; indexed |
| `currency` | `String(3)` | derived from `country`; FK → `currency_rates.currency_code` |
| `annual_gross_salary_minor` | `BigInteger` | source of truth, local minor units |
| `annual_gross_salary_usd_cents` | `BigInteger` | derived; indexed |
| `hire_date` | `Date` | indexed |
| `created_at` | `DateTime(timezone=True)` | `server_default=func.now()` |
| `updated_at` | `DateTime(timezone=True)` | `server_default` and `onupdate=func.now()` |

Constraints: `annual_gross_salary_minor > 0`,
`annual_gross_salary_usd_cents >= 0`. `MetaData` uses a constraint naming
convention so constraint names stay stable on Postgres and under future
migrations.

Notes on the types:
- Salaries use `BigInteger` because 32-bit integers are too small for
  high-denomination currencies once expressed in minor units.
- Text length limits are enforced by Postgres but not by SQLite, so the
  Pydantic schemas are what actually validate input and give field-level
  errors.
- Timestamps come from the database clock, so no Python code reads the clock
  and tests stay deterministic. SQLite stores them without timezone
  information.

## Countries and currencies

The country → currency map is a fixed constant in code. The API accepts a
country from this list, and the service sets `currency` from the map on every
create and update. Proposed countries:

| Country | Currency |
|---|---|
| IN India | INR |
| US United States | USD |
| GB United Kingdom | GBP |
| DE Germany, FR France, NL Netherlands | EUR |
| CA Canada | CAD |
| AU Australia | AUD |
| SG Singapore | SGD |
| JP Japan | JPY |

A currency can serve several countries (EUR), but a country never has more
than one currency. That guarantees every per-country view is in a single
currency.

The stored `currency` column repeats what the country already implies. It is
kept because it is the foreign key to `currency_rates`, it makes the rate
join a plain column join, and API responses show it.

## Money and conversion

- **API input.** The salary arrives in major units as a decimal string (e.g.
  `"85000.50"`). The service parses it with `Decimal` and rejects more decimal
  places than the derived currency allows (any decimals for JPY, more than 2
  for the others). It then stores the integer minor-unit amount. No `float`
  is used anywhere.
- **Salary limits.** 1 to 100,000,000 in major units, enforced by
  `derive_salary_fields` for every caller (API, seed); the future input
  schema mirrors the range to give field-level errors.
- **Exchange rates** are scaled integers rather than `Numeric`. `Numeric` is
  exact in Postgres but stored as a float in SQLite. Values are illustrative,
  fixed as of 2026-10-08 (`app.reference_data.RATES_AS_OF`), not live
  market data.
- **Rounding** goes through one helper that divides integers with `divmod`
  and rounds half-to-even. Every rounded value uses it: conversion, averages
  and the median.
- **Conversion.** `app.salary.derive_salary_fields(country, amount_major)`
  derives currency from country, parses the amount to minor units, checks
  the salary limits, then converts to USD cents with one pure function:

      usd_cents = round_half_even(
          salary_minor × usd_rate_scaled × 100,
          10^minor_unit × 10^9,
      )

  It works only on integers, and rounding happens once per employee, when the
  salary is written.

## Why we store both local and USD amounts

The local amount is what HR enters and what payslips use, so it is the source
of truth. The USD copy is stored because insights that span countries need a
single comparable number, and computing it on every query costs more than
keeping it.

- **Aggregation stays in the database.** Org-wide count, sum, min and max are
  a single `SELECT` over one column. Without the stored column, the database
  would group by currency and Python would convert and combine the results.
- **Totals add up.** Each employee's USD amount is rounded once, when written.
  So the org-wide total is exactly the sum of the USD figures shown for
  individual employees. Converting per-currency totals instead would make them
  differ by a few cents, which undermines "trustworthy aggregates".
- **Salary sort uses an index.** Sorting the whole list by salary uses the
  indexed USD column, with no join to `currency_rates` and no computed sort
  key. Sorting by local minor units would be meaningless across currencies:
  ¥10,000,000 would rank above $150,000.
- **No overflow.** Summing cents over 10,000 rows stays far below the 64-bit
  limit. Summing salary × scaled rate inside SQL could overflow, and SQLite
  raises an error when it does.

What it costs:
- **Stale data if a rate changes.** The USD column is derived data and goes
  stale when a rate changes, until the recompute script runs (see "Write
  paths").
- **Every write must go through the conversion function.** Raw SQL updates or
  a seed that skips the service would leave the two columns out of step.
- 8 extra bytes per row (negligible at 10k rows).

## Write paths

Create, update and the seed generator call `app.salary.derive_salary_fields`,
the one function that derives currency, converts the salary and enforces
`MIN_SALARY_MAJOR`/`MAX_SALARY_MAJOR`. The recompute script instead
re-applies `to_usd_cents` directly to each employee's already-stored minor
amount, since it isn't deriving currency or parsing a new amount; a shared
helper will be extracted when that script is built.

| Path | Behaviour |
|---|---|
| Create | Call `derive_salary_fields`, store the three returned fields |
| Update | Re-call `derive_salary_fields` on every update, whatever fields changed |
| Seed | Calls `derive_salary_fields` for every generated employee |
| Recompute script | Re-applies `to_usd_cents` to each stored `annual_gross_salary_minor`, refreshing `annual_gross_salary_usd_cents` for every employee in one transaction; idempotent; reports how many rows changed |

The API schemas forbid unknown fields (`extra="forbid"`). A client sending
`currency` or `annual_gross_salary_usd_cents` gets a clear validation error
instead of having it silently ignored. Responses include both as read-only.

`app.reference_data` is the single source for rates and the country/currency
map; the `currency_rates` table is filled from it at seed time and
refreshed by the recompute script.

To change a rate: update the rate data, then run the recompute script.

Write-path tests:
- After create, and after an update that changes the country, every stored
  `currency` equals the country map's currency for that row's `country`.
- Recomputing straight after a seed changes zero rows, which proves the seed
  and the recompute script use the same conversion.

## Insights

| Scope | Column | Where |
|---|---|---|
| Org-wide, by department, by job title | `annual_gross_salary_usd_cents` | count/sum/min/max in the database |
| Per country | `annual_gross_salary_minor` | count/sum/min/max in the database, filtered by country |

- **Average:** the database returns `SUM` and `COUNT`, and the service divides
  them with the half-even rounding helper. SQLite's `AVG` returns a float, so
  it isn't used.
- **Median** is computed in the service. The repository fetches the relevant
  column sorted (`ORDER BY` on an indexed column). For an even count the
  median is the mean of the two middle values, rounded by the same helper.
- **Distribution buckets** are computed in the service from the same sorted
  list, so one query serves both median and buckets.

## Indexes

| Index | Why |
|---|---|
| `email` UNIQUE | Enforces the unique-email rule; fast duplicate checks |
| `country`, `department`, `job_title` | The three list filters and the three insight groupings |
| `full_name`, `hire_date`, `annual_gross_salary_usd_cents` | Sort columns for the employee list |
| PK `id` | Tie-breaker: every sort is `ORDER BY <col>, id`, so offset pages are stable |

Not indexed, on purpose:
- **Search** is a substring match on name and email (`LIKE '%q%'`), which a
  normal index can't help. A full scan of 10k rows takes a few milliseconds.
  On Postgres the upgrade would be a `pg_trgm` index.
- **Composite indexes** wait until a measured slow query needs one.

## Seed script

The seed is split into a pure generator,
`generate_employees(n, seed) -> list[GeneratedEmployee]`, and a thin insert
step. `GeneratedEmployee` is a plain dataclass, a placeholder for
`EmployeeCreate`, which doesn't exist yet; once it does, the two should be
reconciled. The generator uses its own `random.Random(seed)` instance, never
the global one. Names come from built-in word lists, not Faker, because
Faker's output for a given seed can change between versions.

The job-title salary bands, country pay multipliers, and department/title
weights are invented for this exercise, not sourced data.

Tests: see `backend/tests/test_seed.py`, which covers determinism (including
independence from the global `random` module state), email uniqueness and
format, weighted country and department/title distribution, the fixed
hire-date range, and that every salary round-trips through
`derive_salary_fields` as a neat figure within the configured limits.

Seed timing is measured by the script and recorded in the README, not
asserted in tests, because timing assertions make tests flaky.

## Trade-offs

| Choice | Gain | Cost |
|---|---|---|
| Store local and USD amounts | DB-side aggregation, indexed salary sort, totals that add up | Derived data can go stale; every write path must convert; recompute script needed |
| One currency per country, derived from country | Per-country views are always single-currency; a mismatch can't be entered | Can't represent expats paid in another currency; stored `currency` duplicates what `country` implies |
| Country → currency map in code | Simple, no extra table or CRUD | Adding a country needs a code change and deploy |
| Scaled-integer rates | Exact on both SQLite and Postgres | Raw values (`1080000000`) are less readable; scale constant must live in one place |
| Per-employee rounding at write time | Totals equal the sum of displayed values | Each stored USD figure carries up to half a cent of rounding |
| DB-clock timestamps | No clock in Python code; deterministic tests | SQLite stores them without timezone |
| `create_all` instead of Alembic | No migration tooling for a reseeded SQLite demo | Moving to Postgres with real data would need migrations |
| No search index | Simple and portable | Full scan per search; fine at 10k, not at millions |

## Employees and insights API

Full contract proposed and reviewed before any code; built slice by slice
(list, writes, insights, auth), TDD, one slice per review. Decisions fixed
so far:

- **`POST /employees` returns 201.**
- **Insights are three separate endpoints:** `/insights/country`,
  `/insights/department`, `/insights/job-title` -- not one combined
  response, so the dashboard can fetch/cache each panel independently.
- **`AUTH_SECRET_KEY` missing at startup is a fail-fast error, not a dev
  fallback.** (Auth isn't built yet; this is fixed ahead of Slice 4 so it
  isn't relitigated then.)
- **Distribution buckets: ceiling width, integer maths only, always exactly
  10 buckets.**
  - `n = max_minor - min_minor + 1`, `width = (n + 9) // 10` (ceiling of
    `n / 10`, no floats).
  - Bucket index for a value `v` is `(v - min_minor) // width` -- always
    `0..9`.
  - Bucket `i` covers `[min + i*width, min + (i+1)*width)`, exclusive,
    except the last *non-empty* bucket, whose `range_max` is clamped to
    `max` (inclusive).
  - Trailing buckets past `max` (when the data doesn't fill all 10) have
    `range_min == range_max == max` and `count == 0`.
  - `min == max` needs no special case: `width` is 1 and every value lands
    in bucket 0 by the same rule.
- **Search** (`q`, on `full_name` and `email`): `LOWER(column) LIKE
  LOWER(:pattern) ESCAPE '\'`, both sides explicitly lower-cased so the
  comparison is case-insensitive identically on SQLite and Postgres,
  regardless of either engine's own default collation. `%`, `_` and `\` in
  the user's input are backslash-escaped first, so a literal percent or
  underscore in a name is never read as a wildcard. Deliberately not
  indexed (see Indexes, above) -- a leading-wildcard `LIKE` can't use a
  B-tree index regardless of engine.
- **Confirming the list query is indexed, at 10,000 rows:** `EXPLAIN QUERY
  PLAN` on a filtered, sorted page must contain
  `SEARCH employees USING INDEX ix_employees_country` -- the exact index
  name, not just the word "SEARCH". Without the country index, SQLite
  doesn't fall back to a bare scan; it walks the table via whichever *other*
  index satisfies the `ORDER BY` instead (`SCAN employees USING INDEX
  ix_employees_full_name`, filtering `country` as a residual check) -- still
  O(n), but easy to mistake for "an index is being used" if the assertion
  only checks for the word "SEARCH" or the presence of some index. The temp
  B-tree SQLite adds for `ORDER BY` when the country index *is* present is
  accepted as-is; no composite index was added to remove it. Verified by
  mutation twice: dropping the `country` index first exposed that one test
  (a timing smoke test with no plan assertion at all) stayed green through
  the disguised scan; after tightening every test to require the specific
  index name, the same mutation made all of them fail, before reverting.
- **Measured at 10,000 rows:** `GET /employees` with a country filter,
  across every sort field and both orders, responds in 2-4ms (well under
  the 500ms success criterion in requirements.md).

### Slice 2: writes

- **`app.salary.derive_salary_fields` is the single conversion point for
  create and update, same as the seed generator.** Country and salary
  format/limits are enforced there, not duplicated in the Pydantic schemas;
  `EmployeeCreate`/`EmployeeUpdate` hold structural rules only (types,
  length bounds, `extra="forbid"`).
- **Exception mapping:** `InvalidAmountError` (malformed amount or outside
  `MIN_SALARY_MAJOR`/`MAX_SALARY_MAJOR`) is caught *before* plain
  `ValueError` (unsupported country) -- it's a `ValueError` subclass, so
  order matters. Both become `FieldValidationError`, on `annual_gross_salary`
  and `country` respectively, which a registered handler turns into a 422
  matching Pydantic's own per-field shape
  (`{"detail": [{"loc": ["body", field], "msg": ..., "type": "value_error"}]}`).
- **Commit boundary:** the repository never commits -- `create`/`update`/
  `delete` only stage changes (`session.add`, attribute mutation,
  `session.delete`). The service commits once per write, catching
  `IntegrityError` on that commit as a last-resort guard for a race between
  the pre-commit duplicate-email check and a concurrent request, and
  raising `DuplicateEmailError`. Verified with a forced race (the pre-check
  mocked to see no conflict while a real duplicate already exists): the
  response is 409, not 500.
- **Email:** trimmed and lowercased by the service before both the
  uniqueness check and storage, so duplicates are caught case-insensitively
  even though the repository's own `get_by_email` is an exact, case-sensitive
  match (lowercasing is explicitly the service's job, not the repository's).
- **Update always re-derives both money fields,** even when only `country`
  changed and the salary string is textually identical -- the same number
  means a different real salary in a different currency. The email-collision
  check on update excludes the row being updated, so saving without changing
  email never 409s against itself.
- **Mutation-checked, not just written:** the case-insensitive duplicate
  test was confirmed to fail when lowercasing was removed (without it,
  neither the pre-check nor the DB's case-sensitive unique constraint would
  catch the duplicate); the self-exclusion test was confirmed to fail when
  the `existing.id != employee_id` exclusion was removed, with the sibling
  "different employee" test still correctly passing either way.
- **Manually round-tripped** against a seeded 10,000-row DB with a JPY
  employee: POST "6500000" JPY → `annual_gross_salary: "6500000"`,
  `annual_gross_salary_usd: "43550.00"`; PUT changing only `country` to US
  with the same salary string → `annual_gross_salary: "6500000.00"`,
  `annual_gross_salary_usd: "6500000.00"` -- the same literal number now
  means a completely different real salary. DELETE → 204, then GET → 404.
- **Writes were unprotected at the end of this slice.** Fixed in Slice 4,
  which adds `Depends(require_auth)` to all three write routes -- see
  below. (The deploy warning that was here is removed now that every write
  route is protected and tested.)

### Slice 3: insights

- **Two queries per dimension, always.** One `GROUP BY` for
  count/sum/min/max; one bulk `(group_value, salary)` fetch, grouped in
  Python with `itertools.groupby` in a single pass. Verified with a
  SQLAlchemy `before_execute` listener counting real statements per
  request: exactly 2, for all three endpoints.
- **The bulk fetch's `ORDER BY` has two jobs, not one.** The primary key
  (`group_column`) is what makes `itertools.groupby` correct at all --
  it only merges *adjacent* equal keys, so without it, rows interleaved by
  insertion order would split one group into several. The secondary key
  (`salary_column`) is what gives median its "middle value" meaning.
  Mutation-checked: dropping the secondary sort key left grouping correct
  but broke median (a 3-row group inserted out of salary order returned
  the wrong middle value); the permanent regression test for this
  (`test_median_is_correct_even_when_rows_are_inserted_out_of_salary_order`)
  only exists because the original pure `compute_median` tests pass an
  already-sorted list directly and couldn't have caught this.
- **Units, fixed per dimension, not per row:** country groups use
  `annual_gross_salary_minor`, formatted with *that country's* `minor_unit`
  (never ambiguous within a group, since currency is 1:1 with country) and
  carry a `currency` field. Department and job-title groups use
  `annual_gross_salary_usd_cents`, formatted with `minor_unit=2` always,
  and their response schemas have no `currency` field at all -- not `null`,
  genuinely absent, enforced by using three separate Pydantic models
  (`CountryInsight` vs `DepartmentInsight`/`JobTitleInsight`) rather than
  one shared schema with an optional field.
- **Average:** `round_half_even(sum, count)`, the same helper as
  conversion. Mutation-checked: swapping it for `//` passed two of three
  average tests by coincidence (floor and half-even agree when the result
  isn't a genuine tie) but failed the one test built specifically to
  disagree with floor division (7/2 -- floor gives 3, half-even ties to 4).
- **Median:** odd count is the sorted middle value; even count is
  `round_half_even(a + b, 2)` of the two middle values. The even-count tie
  test (100 and 101 cents) is chosen so naive "round half up" (101) and
  round-half-even (100, since 100 is even) actually disagree -- a tie
  picked at random usually wouldn't expose this.
- **Buckets: ceiling width, ten always.** `n = max - min + 1`,
  `width = (n + 9) // 10`; bucket index for value `v` is
  `(v - min) // width`, always `0..9`. Every bucket's `range_max` is
  exclusive except the last *non-empty* bucket, clamped to `max`
  (inclusive); buckets past that are trailing, `range_min == range_max ==
  max`, `count == 0`. `min == max` needs no special case (width 1, bucket
  0 takes everyone). Mutation-checked: un-clamping the last bucket (letting
  `range_max` run past `max`) failed 4 of 5 bucket tests, all of them
  checking that exact clamp.
- **Differential-tested at 10,000 seeded rows:** every group's
  count/min/max/average/median/distribution recomputed independently --
  Python's `decimal` module (`ROUND_HALF_EVEN`) instead of the hand-rolled
  integer `round_half_even`, and a separate reimplementation of the bucket
  rule instead of calling `compute_buckets` -- and compared for exact
  equality against the live endpoint output, for all three dimensions.
  (The independent bucket reimplementation shares the same documented rule
  as the real one, so it would not catch a shared misreading of the rule
  itself -- only an implementation bug, such as an off-by-one or a wrong
  clamp, in one but not the other.)
- **Measured at 10,000 rows:** `/insights/country` ~15ms,
  `/insights/department` ~15ms, `/insights/job-title` ~16ms per request
  (5-run average each), comfortably under the 500ms success criterion.
- **Public, no auth check.** Read-only aggregate data; consistent with
  `GET /employees` also being public.

### Slice 4: auth + CORS

- **One shared HR login, no roles, no refresh.** `HR_USERNAME`/
  `HR_PASSWORD`/`AUTH_SECRET_KEY`/`CORS_ALLOWED_ORIGINS` are all read from
  the environment with no hardcoded fallback. `.env.example` lists all four
  with comments; no real secret is ever committed.
- **A blank value counts as unset, everywhere.** A real bug: copying
  `.env.example` to `.env` and leaving `DATABASE_URL=` empty crashed
  startup with `sqlalchemy.exc.ArgumentError` -- `os.environ.get(name,
  default)` only falls back to `default` when the key is *absent*, not
  when it's present but blank. `app.env.get_env(name)` is now the one
  place every environment read in this app goes through: it returns
  `None` for unset, empty, *or whitespace-only*, used by `DATABASE_URL`
  (falls back to the SQLite default), `SEED_ON_EMPTY`/`CORS_ALLOWED_ORIGINS`
  (already handled blank correctly before this, now via the same shared
  helper), and `AUTH_SECRET_KEY`/`HR_USERNAME`/`HR_PASSWORD` (a blank value
  is treated exactly like missing -- for the login credentials this is
  also a correctness fix, not just a crash fix: a blank `HR_USERNAME` env
  var previously meant *submitting an empty username could authenticate*,
  since the old check was `is None`, not "blank").
- **`AUTH_SECRET_KEY` fails the app at startup, not at first login,** if
  unset (`create_app` calls `get_auth_secret_key()` eagerly, before
  building the `FastAPI` instance). `HR_USERNAME`/`HR_PASSWORD` are
  different: unset makes every login attempt return 401, the app still
  starts.
- **The credential check never short-circuits.** Both
  `hmac.compare_digest` calls run unconditionally, combined with `&`
  (never `and`); both sides are encoded to UTF-8 bytes first, since
  `compare_digest` raises `TypeError` on non-ASCII `str` but never on
  bytes. Wrong username, wrong password, and both wrong all return the
  same 401 body, so nothing reveals which field was wrong. Mutation-
  checked: inlining the two calls with `and` (so the second one could
  actually be skipped, not just swapping the final combinator on
  already-computed values) made the spy test's call-count assertion fail
  (1 call instead of 2).
- **Tokens:** `itsdangerous.URLSafeTimedSerializer`, `max_age=3600`.
  `BadSignature`/`SignatureExpired` both become a 401 with
  `WWW-Authenticate: Bearer`. Mutation-checked: dropping the `max_age`
  argument from `loads()` made the expired-token test fail (an "expired"
  token was accepted). The expired-token test itself uses `max_age=-1`,
  not `0` -- `itsdangerous`'s expiry check is `age > max_age`, and
  sub-second timing means an elapsed age of exactly `0` would not exceed
  `max_age=0`.
- **A real test bug, found and fixed along the way:** the first version of
  the tampered-token test flipped the token's *last* character, which
  doesn't reliably invalidate it -- base64's final character can have
  unused "slack" bits when the encoded byte count isn't a multiple of 3,
  so more than one character value decodes to the same bytes there.
  Flipping the *first* character instead always changes the decoded
  payload.
- **Writes are protected, reads are not.** `Depends(require_auth)` on
  `POST`/`PUT`/`DELETE` for `/employees`; every `GET` (employees and
  insights) stays public. Mutation-checked: removing the dependency from
  `DELETE /employees/{id}` made its "without auth" test fail (204 instead
  of 401), while the other two routes' equivalent tests were unaffected.
- **CORS:** `CORSMiddleware`, origins from `CORS_ALLOWED_ORIGINS` split on
  commas; unset or empty means the list is empty, not "allow everything".
  `allow_methods=["GET", "POST", "PUT", "DELETE"]` and
  `allow_headers=["Authorization", "Content-Type"]` -- explicit, not `"*"`:
  every method and header this API actually uses, nothing else. This isn't
  optional: Starlette's CORS *preflight* handling (the `OPTIONS` request a
  browser sends before a cross-origin `PUT`/`POST`/`DELETE` that carries an
  `Authorization` header) is separate from its simple-request handling, and
  its own bare defaults are `allow_methods=("GET",)` and `allow_headers=()`
  -- neither PUT/POST/DELETE nor Authorization. A test suite that only
  checks a simple `GET` (as this slice's first CORS tests did) can't catch
  a write route's preflight being silently rejected with 400. Mutation-
  checked: removing `allow_methods`/`allow_headers` entirely (reverting to
  those bare defaults) failed the PUT/POST/DELETE preflight tests (400,
  not 200), while the disallowed-origin preflight test was unaffected.
- **`app.main` has a module-level `app = create_app()`** (for
  `uvicorn app.main:app`), which runs once at import time, before any
  pytest fixture exists. Making `AUTH_SECRET_KEY` fail-fast exposed this:
  the autouse env fixture alone was too late to prevent that import from
  raising during test collection. `conftest.py` now sets
  `AUTH_SECRET_KEY`/`HR_USERNAME`/`HR_PASSWORD` via
  `os.environ.setdefault` *before* importing `app.main` at all.

**Known limits, accepted for now:**
- **No logout or revocation.** A token is valid until it expires, full
  stop -- there is no server-side session store to invalidate one early.
- **`AUTH_SECRET_KEY` rotation invalidates every outstanding token at
  once.** Expected, not a bug; worth knowing before a redeploy that
  changes the env var surprises anyone mid-session.
- **No rate limiting or lockout on login.** A wrong-password attempt costs
  nothing to retry. Acceptable for a single shared demo login behind a
  free-tier deployment, not for a real multi-tenant system.
- **CORS misconfiguration is a silent failure mode.** If
  `CORS_ALLOWED_ORIGINS` is wrong or unset after this ships, the frontend
  breaks with an opaque browser-console CORS error, not a clear API
  error -- there is nothing server-side that would flag it.

## Frontend

**Stack:** Vite + React + TypeScript (strict), MUI (core `Table`/
`TablePagination`/`TableSortLabel`, not the X `DataGrid`), TanStack Query v5
for server state, Vitest + React Testing Library + MSW for tests. Yarn
(classic, 1.x), matching this repo's existing lockfile convention.

**Data flow:** `src/api/client.ts` is a single `apiFetch<T>` wrapper around
`fetch`, reading `VITE_API_URL` (build-time, never hardcoded) and turning
every failure -- an HTTP error response or `fetch` itself rejecting -- into
one `ApiError` shape (`status`, `message`, and `fieldErrors` when the body
was a 422 list). `src/api/employees.ts` layers typed query functions and
TanStack Query hooks on top; `useEmployees` sets
`placeholderData: keepPreviousData` so paging/filtering/sorting shows the
previous page's rows while the next page loads, instead of flashing empty.

**State decisions:**
- Pagination: MUI's `TablePagination` is 0-based, the API's `page` is
  1-based. `src/utils/pagination.ts` is the only place that conversion
  happens, in both directions, each covered by a test (and mutation-
  checked: removing the `+1` offset fails both the unit test and the
  "next page" component test, for the right reason).
- Page reset on filter/search/sort change: implemented as a render-time
  comparison against the previous render's filters key (React's documented
  "adjusting state when an input changes" pattern), not a `useEffect` --
  an effect version triggers `eslint-plugin-react-hooks`'s
  `set-state-in-effect` rule, the same finding hit for `useSlowRequest`
  below. Mutation-checked: disabling the reset comparison fails the
  "changing a filter resets the page to 1" test (page stays `2`).
- Search debounce: a generic `useDebouncedValue(value, delayMs)` hook:
  300ms for the search box.
- Slow-server detection: `useSlowRequest(isFetching, thresholdMs = 5000)`
  flips true once a query has been fetching continuously past the
  threshold, reset in the effect's cleanup (not synchronously in the
  effect body, which is what the lint rule above actually flags) so it
  clears the moment fetching stops. Backs the "Waking up the server, this
  can take up to a minute on first load" message, shown for both the
  initial load and any later refetch -- a free-tier Render cold start can
  hit either.
- Money fields (`annual_gross_salary`, `annual_gross_salary_usd`) are
  exact major-unit strings from the API, formatted for display only via
  `Intl.NumberFormat` with the currency code -- never parsed back into a
  number for arithmetic. The locale is pinned to `'en-US'` explicitly:
  passing `undefined` uses the JS runtime's default locale, which produced
  Indian-style digit grouping (`"JP¥65,00,000"`) in one environment this
  was tested in, before the fix.
- Dates: `hire_date` (date-only, `"YYYY-MM-DD"`) is parsed by splitting
  the parts and building a local `Date`, never `new Date("YYYY-MM-DD")`
  directly, which parses as UTC midnight and displays as the day before in
  any timezone west of UTC. `created_at`/`updated_at` have no timezone
  suffix but are UTC, so a trailing `"Z"` is appended before parsing.
  Displayed as `"26 Jun 2017"` (`Intl.DateTimeFormat('en-GB', { dateStyle:
  'medium' })`), not the locale-default `toLocaleDateString()`.

**Persistence caveat:** the backend database resets on restart (no
persistent volume on the free Render tier) -- data seen in the deployed
app, including anything created in a future write-enabled slice, does not
survive a backend restart or redeploy.

## Frontend: UI polish pass

A later pass restyled the table page without touching the backend.

**Theme (`src/theme.ts`):** `createTheme()` with explicit design tokens
rather than MUI defaults -- a neutral slate palette (Tailwind's slate
50/100/200/600/900) with one indigo accent (indigo 600/700, chosen with
white-on-indigo-600 button contrast already comfortably AA), 12px border
radius, soft shadows (a lighter `boxShadow` override on `MuiPaper`
elevation 1, not MUI's default harder-edged one), and Inter Variable
self-hosted via `@fontsource-variable/inter` (imported once in
`main.tsx`) so there's no external font request. The exact CSS name the
package declares is `'Inter Variable'` (not `'InterVariable'` -- checked
the package's own stylesheet rather than guessing). `MuiCssBaseline`
carries two accessibility defaults globally: a visible `:focus-visible`
outline, and a `prefers-reduced-motion: reduce` media query that collapses
animation/transition durations to near-zero. No dark mode: `palette.mode`
is fixed to `'light'` with no `colorSchemes` config, so there's no
automatic `prefers-color-scheme` switch to turn off later.

**Why Autocomplete, not Select, for Country/Department/Job title:** MUI's
`Select` has no built-in clear affordance -- clearing a value means adding
a manual "All" menu item and remembering to render it first. `Autocomplete`
(non-`freeSolo`, options still only from `/employees/options`) has a
built-in clear (x) button for free, with `slotProps.clearIndicator`
carrying the button's own `aria-label`. A real finding during testing: MUI's
clear indicator is CSS `visibility: hidden` until the field is focused or
hovered -- `.Mui-focused .MuiAutocomplete-clearIndicator { visibility:
visible }`. Testing Library's `getByRole` treats CSS-hidden elements as
inaccessible by design, so a test that selects a value and immediately
tries to click the (unfocused) clear button fails even though the element
is in the DOM; each clear-button test now focuses the field first via
`getByRole('combobox', ...)`, matching what a sighted user would actually
have to do. (Not `getByLabelText`: the clear button's own aria-label
contains the filter's name too, so a text-based label query matches both
the input and the button.)

**Sortable-column rule:** only `full_name`, `hire_date`, and `salary`
(the USD column) are sortable, matching the backend's whitelist exactly --
enforced by a dedicated test asserting every other header has no sort
control at all (not just "inactive"), mutation-checked by wrapping
Department in a `TableSortLabel` and confirming that test fails. Local-
currency Salary is deliberately excluded and commented in the code: its
values are in different currencies per employee, so they aren't
comparable without converting to USD first -- which is what the other
salary column already is.

**Layout:** the filter bar and the table are both full-width `Paper`
cards. Filters use MUI's `Grid` (this is MUI v9; its default `Grid` export
*is* Grid v2 -- the `size` prop API, not the legacy `item`/`xs`/`md` props)
with `size={{ xs: 6, md: 3 }}` on all four controls: a 2x2 grid on phones,
four equal columns on desktop. The table's Name column is pinned via
`position: sticky; left: 0` on both its header and body cells, so it
stays visible when the table scrolls horizontally on narrow screens;
`stickyHeader` on the `Table` plus a bounded-height `TableContainer`
keeps the header pinned vertically during normal scrolling too.

## Frontend: UI polish, round 2

**Header/column rules:**
- Every column header is centred (`align="center"` on the `TableCell`);
  body-cell alignment is unchanged (salary stays right-aligned, Name
  stays left via the sticky cell's default). Centring the cell centres a
  sortable header's whole `TableSortLabel` as one inline unit, so the
  icon stays next to its label rather than drifting to the cell's edge.
- The pinned Name header cell had an explicit `background.paper`
  (white) carried over from the sticky-body-cell styles, while every
  other header cell was getting MUI's own `stickyHeader` default
  (`background.default`, a light slate in this theme) -- a real, visible
  mismatch. Fixed by not setting a background on the header cell at all,
  so it falls back to the same default every other header cell uses; the
  body cells keep their own explicit `background.paper` override, which
  they need since MUI doesn't give body cells any automatic sticky
  background at all.
- Hire date (header and body) has `white-space: nowrap` and a 130px
  `minWidth` so "26 Jun 2017" never wraps; the two salary columns have
  `nowrap` only, no forced minimum width.
- The standalone "X employees" line above the table was removed -- the
  pagination footer's own "26-50 of 10,000" already states the total, so
  the line was redundant.

**Country name display:** `src/utils/country.ts` exports
`formatCountryName(code)`, built on `Intl.DisplayNames(['en'], { type:
'region' })` with the code itself as the fallback (also used if the
lookup throws, which it does for an ill-formed region subtag). The
two-letter code stays the value everywhere it's compared or sent: filter
state, the API's `country` query param, and `value`/`onChange` on the
Autocomplete. Only *display* goes through the helper -- the filter's
options list (sorted by display name, not code), its selected value, and
the table's Country chip. Typing into the filter matches against both
the code and the display name (a custom `filterOptions`, since MUI's
default filtering only checks `getOptionLabel`'s string, which here is
the name), so "IN" and "ind" both find India. Mutation-checked: making
the Autocomplete's `onChange` store the display name instead of the code
fails a dedicated test expecting `country=GB` in the request (got
`country=United Kingdom`). Exported for the S7 employee form to reuse.

## Frontend: UI polish, round 3

From screenshot review: round 2's header centring and sticky-header
background fix were applied correctly to every column *except* the
pinned Name one, and a few column-width/mobile issues turned up under
real rendering that jsdom's tests couldn't have caught.

- **The Name header's background and centring needed to be more
  explicit, not just inherited.** Round 2 left the Name header cell's
  background unset so it would inherit MUI's own `stickyHeader` default
  (`background.default`), on the theory that this guarantees the same
  token as every other header cell. In practice, under real rendering,
  the sticky-positioned cell didn't reliably pick up that default, so
  it's now set explicitly (`backgroundColor: 'background.default'`) on
  the cell itself. Likewise, `TableSortLabel`'s own `text-align`-based
  centring (inherited from the cell's `align="center"`) wasn't reliable
  for this sticky cell either; every sortable header's `TableSortLabel`
  now also gets `width: '100%', justifyContent: 'center'` directly, a
  more robust way to centre an inline-flex element than relying on an
  ancestor's `text-align` alone.
- **Salary columns: centred cell, right-aligned figure.** The cell
  itself is now `align="center"` (matching its centred header), with the
  formatted amount wrapped in a fixed-120px `inline-block` that's
  right-aligned internally -- digits and decimals still line up down the
  column (every row's figure ends at the same right edge of that fixed
  box), while the box as a whole sits centred under the header, since
  it's the box -- not the raw text -- that the cell's centring now acts
  on.
- **Job title** gets `white-space: nowrap` and a 220px `minWidth` so
  every row has the same height regardless of title length. **Email**
  gets a 220px `maxWidth` with ellipsis truncation -- a judgment call
  made without being able to see whether the column was actually
  overflowing; worth a look in the screenshot review.
- **Mobile pagination.** `TablePagination` was already rendered outside
  `TableContainer` (not a descendant of the scrolling area), which a new
  DOM-structure test now locks in, mutation-checked by moving it back
  inside and confirming that test fails. The actual reported bug was
  different: the toolbar's full content (rows-per-page label + select,
  range text, prev/next buttons) is wider than a 390px viewport, clipping
  the next-page button. Fixed by hiding the rows-per-page label/select at
  `xs` (kept from `md` up) via `sx` targeting
  `tablePaginationClasses.selectLabel`/`.input`, leaving only the range
  text and prev/next buttons, which fit comfortably.

**Still not visually verified** (this project's frontend work has no
browser automation available): all of the above, plus whether the
Email truncation was actually needed.

## Frontend: UI polish, round 4

Round 3's per-column `minWidth`/`maxWidth` values (Email, Job title) plus
the fixed-120px salary inline-blocks added up to more than the
Container's available width (1200px, MUI's default cap with no
`maxWidth` prop set) -- producing a horizontal scrollbar and a clipped
Hire date column even at 1920px, which hadn't been there before round 3.
`minWidth`/`maxWidth` on individual cells can't prevent a table from
growing past its container; only `table-layout: fixed` with widths that
are *percentages of the total* can.

**Fix, in the order requested:**
1. `App.tsx`'s `Container`: `maxWidth={false}` + `sx.maxWidth: 1680`
   (overriding the default 1200px cap), gutters unchanged.
2. `MuiTableCell` theme override: horizontal padding 16px -> 12px
   (`padding: '16px 12px'`; MUI's own default is `padding: 16` all round).
3. `Table`'s `sx.tableLayout`: `{ xs: 'auto', lg: 'fixed' }`. Below `lg`
   (1200px), everything from round 3 is unchanged -- auto layout, the
   table scrolls horizontally inside its card, Name stays pinned,
   pagination stays outside the scrolling area. At `lg` and up, fixed
   layout plus an explicit percentage `width` on every column (also
   responsive -- `{ lg: 'X%' }` -- so it only takes effect at that
   breakpoint) is what actually stops the table from exceeding its
   container.

**Column width budget (sums to 99%, intentionally under 100%):**

| Column | Width | How estimated |
|---|---|---|
| Name | 12% | Sticky column; sized similarly to Department/Country, not tied to the longest possible name |
| Email | 19% | Widest realistic content (`ada.allen.1209@acme.example`, ~27 chars) among the text columns |
| Job title | 17% | Longest seeded title ("Engineering Manager", "Senior Account Executive") |
| Department | 10% | Short, fixed set of values ("Engineering", "Marketing") |
| Country | 12% | Longest display name ("United Kingdom"), via `formatCountryName` |
| Salary | 10% | Worst case `"$100,000,000.00"` (~16 chars, the `MAX_SALARY_MAJOR` upper bound) |
| Salary (USD) | 10% | Same worst case, always USD so no currency-symbol variance |
| Hire date | 9% | Fixed format, `"26 Jun 2017"` (11 chars), never truncates |

This was reasoned from character counts against realistic/worst-case
content, not measured against a rendered page -- it's a starting budget
for tuning, as the brief asked for, not a verified fit.

**Text columns (Name, Email, Job title):** `white-space: nowrap`,
`overflow: hidden`, `text-overflow: ellipsis`, plus the full value in a
`title` attribute (mutation-checked: removing the attribute fails a
dedicated test). Department/Country (chips) and Hire date never
truncate or wrap -- the width budget is sized to fit their content
instead.

**Salary figures:** the round-3 fixed-120px inline-block becomes a
`7.5em` `min-width` (now that the column itself is width-constrained at
`lg+`, the figure doesn't need to supply its own fixed width) --
tabular-nums and right-aligned internally, so digits/decimals still line
up down the column, while the box as a whole sits centred under the
centred header.

**Name header background -- investigated, not re-guessed.** Round 3
added an explicit `background.default` on the sticky Name header cell,
reasoning that a sticky cell "didn't reliably pick up" MUI's own
default. That didn't fix the reported mismatch, so this round re-read
the actual source instead of changing the guess: every `TableCell`
inside a `<Table stickyHeader>` gets `position: sticky` and
`background.default` automatically from MUI's own internals
(`node_modules/@mui/material/TableCell`) as soon as it's a head cell --
not something unique to a cell that's *also* pinned horizontally. All 8
header cells, Name included, were therefore already drawing their
background from the exact same rule, and round 3's explicit override
resolved to the identical literal value (`#f1f5f9`) via a second,
redundant path. Since both paths agreed, the override couldn't have
been the cause of a visible mismatch -- so it was removed rather than
replaced with a different guess, leaving one shared rule that can't
diverge from itself. No alpha/transparency exists anywhere in the
relevant chain (`palette.background.default`, `.paper`, and the
`MuiTableCell` override's `borderBottomColor` are all opaque hex
values). If the mismatch is still visible after this, the cause isn't
in this color/background logic and needs a real screenshot to localize
further -- rendering-only effects (sticky-layer compositing, a
shadow/border optical illusion at the column boundary) can't be
diagnosed from source alone.

**Page-level vs. table-level scrolling (verify-only, changed on an
estimate).** Asked to check whether the pagination footer stays visible
without scrolling the whole page, and whether only the table's own
internal area scrolls rather than the page as well. `TableContainer`'s
`maxHeight` was a flat 560px at every width; estimated page-chrome
height at `lg+` (AppBar ~64px + Container's `py: 4` ~64px + filters card
~88px + table card's own border/pagination ~58px, total ~274px, rounded
up to 320px for safety) suggested the page likely did need to scroll on
a typical ~900px-tall desktop viewport in addition to the table's own
560px scroll area. Changed `maxHeight` to `calc(100vh - 320px)` at
`lg+` only (below `lg`, unchanged at the flat 560px, matching the
"existing behaviour" the brief asked to keep there). This is an
estimate from component heights, not a measurement of the rendered
page -- needs visual confirmation and likely tuning of the `320px`
constant.

## Frontend: S7 table alignment (pre-CRUD pass)

Every body cell is now centred (`align="center"`), matching the already-
centred headers and the Department/Country chips -- Name, Email, and Job
title previously had no `align` prop (default left). The salary figures'
round-3/4 fixed-width inline-block (added so every row's last digit lined
up on the same right edge) was removed per this round's request: the
figure is now plain centred text with `font-variant-numeric: tabular-nums`
like the rest of the table, trading exact right-edge digit alignment for
visual consistency with every other column. The pinned Name column
(sticky positioning, opaque background on mobile) and the ellipsis +
`title` attribute on Name/Email/Job title are unchanged.

## S7: GET /meta/countries

A public, read-only view of the existing `COUNTRY_CURRENCY`/`CURRENCIES`
reference data (no new data introduced): `[{code, currency, minor_unit}]`,
sorted by code. Exists for the employee form, which needs to show the
currency and decimal places for whichever country the user picks (e.g.
"JPY, no decimals") before they type a salary. Country *display names*
(e.g. "Japan") are not part of this response -- they come from the
frontend's own `formatCountryName` helper (S6/round 2), which already
owns that mapping; duplicating it here would just be two sources of
truth for the same thing.

## S7: routing and auth

**Routing:** `react-router-dom` v7 (the data router). Route config is a
plain array (`routes.tsx`) wrapped by `createBrowserRouter` for the real
app (`router.tsx`); tests wrap the same array in `createMemoryRouter`
instead, each test getting its own fresh navigation history. A real bug
caught while writing the routing tests: `createBrowserRouter` is a
module-level singleton, so tests that `render(<App />)` more than once
in the same file were sharing -- and leaking -- one router's navigation
state across tests, not starting fresh each time. `/insights` is
`React.lazy` + `Suspense`, confirmed via the build output to already be
its own chunk (independent of auth/employee-form work, so it's cheap to
verify now and re-check once the real dashboard, with `@mui/x-charts`,
replaces the placeholder).

**Auth token storage: sessionStorage + an in-memory copy, not a
Context/Provider.** `src/auth/authStore.ts` is plain code (not a React
module) that both `src/api/client.ts` (needs to read the token and
attach it to write requests) and React components (via `useAuth`,
`useSyncExternalStore` over the same store) can use. Every storage
access is wrapped in `try/catch`: a private-browsing mode that throws on
`sessionStorage.setItem` still lets the session work, just without
surviving a refresh. `sessionStorage` over `localStorage`: the token is
meant to be cleared when the tab closes, not persist indefinitely: a
closer approximation to "logged in for this session" than a login that
silently outlives the browser tab. The alternative not used,
`httpOnly` cookies, would need the backend to set/read the cookie
itself (CORS + cookie flags across the Vercel/Render origin split), and
there's no backend work planned for this in S7 -- noted as a real
trade-off, not a dismissal: an XSS vulnerability anywhere in this SPA
can read `sessionStorage` and steal the token, which a cookie marked
`httpOnly` would prevent.

**No revocation, same as Slice 4's login design.** A token is valid
until its 3600s expiry, full stop; logging out only forgets the token
client-side; the server has no server-side session to invalidate early.

**The 401 -> redirect path, end to end:** `apiFetch` sends
`Authorization: Bearer <token>` only on POST/PUT/DELETE, only when a
token is set (every GET stays public, matching the backend). If such a
write comes back 401 (the 3600s token expired, or was otherwise
invalidated), it calls `authStore.notifySessionExpired()`, which clears
the token and notifies subscribers -- `AppLayout`, the one component
that's on every route (the root route's own `element`), is where that
turns into an actual redirect (`navigate('/login', { state: { from,
sessionExpired: true } })`), since it's the one place `useNavigate`/
`useLocation` only need wiring up once. `LoginPage` reads
`location.state` both to show "Session expired, please log in again"
and to return to the page the user came from after logging back in.

## S7: employee form, Actions column, and the global Snackbar

**Form error mapping** (`src/utils/apiErrorToFieldErrors.ts`): a 422's
field errors each go to their own field (`loc` is `["body", "<field>",
...]`, so `loc[1]` is the field name); a 409 (duplicate email) always
goes to the `email` field, with the server's own message; anything else
(a network failure, a 500) has no specific field, so it returns `null`
and the caller shows it via the global Snackbar instead.

**Client-side validation is deliberately rough**: required fields, and
one currency-agnostic decimal pattern (`/^\d+(\.\d+)?$/`) for the salary
-- matching the project's own convention that business rules (exact
format, per-currency decimal limits) stay server-side, enforced once by
`app.money.parse_major_to_minor`. The salary is sent to the API exactly
as the string the user typed, never parsed to a number client-side.

**Country is a Select from `/meta/countries`**, not an Autocomplete
(Department/Job title are, since those need free text entry too) --
labelled via the frontend's own `formatCountryName`, with a helper text
showing the selected country's currency and decimal places (e.g. "JPY,
no decimals"), so the user knows what they're about to type a number in
before they type it.

**A global Snackbar, not a per-dialog one** (`src/notifications/`):
`noticeStore.ts` is plain code (the same external-store pattern as
`authStore.ts`), so a mutation's `onError`/`onSuccess` callback -- not
just a component -- can trigger a message; one `<GlobalSnackbar/>`
mounted once in `AppLayout` shows it on every route.

**Two real bugs, both in the form dialog's "reset form state on open"
logic**, found by the edit-mode tests actually failing rather than
assumed correct:
1. The first version used a `useEffect`, which
   `eslint-plugin-react-hooks`'s `set-state-in-effect` rule flags (the
   same finding hit for `useSlowRequest` and the table's own page-reset
   logic earlier) -- switched to a render-time comparison against the
   previous render (open transitions only), React's documented pattern.
2. That render-time version then missed the dialog's actual usage: it
   only detects a *change* in `open`, but every caller (every test, and
   the real table) renders the dialog already open rather than
   transitioning into it, so Edit's prefill never ran at all. Fixed with
   a lazy `useState` initializer that also reads `employee` on the very
   first render, not only inside the transition-reset block.

**Actions column and width budget.** The kebab menu (Edit/Delete) and
the "Add employee" button are both gated on `useAuth().isLoggedIn`; when
logged out, the Actions column doesn't render at all (not just hidden),
so the column count itself is 8 vs. 9 and the skeleton/empty-state
`colSpan` both read a computed `columnCount`, not a constant. The lg+
column-width budget (round 4's table-alignment work) was re-tuned to
make room for a 5% Actions column, trimming roughly 1 point each from
Name/Email/Job title/Department/Country:

| Column | Round 4 | Now |
|---|---|---|
| Name | 12% | 11% |
| Email | 19% | 18% |
| Job title | 17% | 16% |
| Department | 10% | 9% |
| Country | 12% | 11% |
| Salary | 10% | 10% |
| Salary (USD) | 10% | 10% |
| Hire date | 9% | 9% |
| Actions | -- | 5% |

These percentages sum to 99% when Actions is present (logged in). Logged
out, the same percentages (Actions simply isn't rendered) sum to 94%,
leaving an unused sliver of width at the table's right edge -- accepted
as a harmless cosmetic difference rather than maintaining two separate
width budgets for the two login states.

## S7: insights dashboard

**Chart library choice:** `@mui/x-charts`'s `BarChart` -- already in the
MUI family the rest of the app uses, so no second component library's
theming/accessibility conventions to reconcile. Lazy-loaded with the
`/insights` route (set up in the routing commit, before this dashboard
existed): confirmed via the build output that the heavy part is fully
isolated to that one chunk, not paid for on first load of the employee
table --

| | Before (placeholder) | After (real dashboard) |
|---|---|---|
| `InsightsPage` chunk | 0.16kB | 317.74kB (gzip 99.23kB) |
| Main bundle | ~667kB | ~692kB (gzip 216.83kB) |

The main bundle barely moved (new page/component source, not the chart
library); essentially all of the new weight is in the chunk that only
downloads when someone actually opens the dashboard.

**One shared summary-table/chart pair, three dimensions.** Country,
Department, and Job title each have their own backend response shape
(`CountryInsight` has a `currency` field per group; `DepartmentInsight`/
`JobTitleInsight` don't, since neither dimension has one local currency
to report in -- deliberately absent, not null). Each is normalized to
one shared `SummaryGroup` shape before reaching `InsightsSummaryTable`/
`InsightsDistributionChart`, so there's one table and one chart
implementation, not three: Country's `currency` carries through as-is;
Department/Job title are hardcoded to `'USD'` at the normalization step.
Group labels: Country runs its key through `formatCountryName`; the
other two use the raw value (a department or job title name needs no
translation).

**Group selection:** clicking a row in the summary table calls
`onSelectGroup`, which drives which group's distribution the chart
below shows; the default (before anything's been clicked) is whichever
group has the highest headcount. Sorting the summary table is
client-side, via `Number()` on the money-string fields for comparison
only -- never stored or displayed as a number, so it isn't the kind of
"arithmetic on money" this project otherwise avoids (which is about not
computing a *new* money amount, not about ordering existing ones).

**Chart accessibility:** the `BarChart` itself is wrapped in a
`role="img"` container with an `aria-label` naming the group, since a
static bar chart can't expose its own per-bar data to assistive tech any
other way that's actually reliable across chart libraries. The real
accessible content is a visually hidden `<table>` (the standard
clip-based recipe -- still in the accessibility tree and announced by
screen readers, unlike `display: none`) listing every bucket's range
(formatted in the group's own currency) and count.

**A real bug, caught by the slow-server test, not assumed fixed by
analogy with `EmployeeTable`:** the first version of the loading logic
checked `query.isPending` before checking `isSlow`, so a request that
never resolves always rendered the loading skeleton and never reached
the slow-server banner at all. Fixed by making the banner additive --
shown alongside whatever else is rendering (skeleton, error, or data),
the same structure `EmployeeTable` already uses, since a slow *refetch*
(switching tabs, Retry) can hit this too, not just the first load.

## S7 walkthrough fixes

Four items from a manual walkthrough of the deployed/local app after S7.

**1. Salary decimals (422 field mapping) -- no reproduction found.** The
walkthrough reported that a salary with too many decimal places (e.g.
`6500000.505` for a JPY employee, which the backend correctly rejects
with a 422) showed no field error in the browser and appeared to save.
Reading `EmployeeFormDialog`/`mapApiErrorToFields`/`apiFetch` end to end
found no trimming, rounding, or reformatting of the typed value, and the
422-to-field mapping is generic (`loc[1]` -> field name) rather than
salary-specific. A new MSW test pins the exact reported scenario
(country JP, `"6500000.505"`, the server's real `"too many decimal
places (at most 0 allowed)"` message) and passes against the existing
code unchanged: the request body carries the string exactly as typed,
and the error lands on the Salary field with the dialog staying open.
No code change made. The likely explanation is the walkthrough hit a
build that predates this code (e.g. the deployed frontend before a
redeploy) rather than a live bug -- flagged to re-test once confirmed
current, since the original report didn't say which value was actually
saved.

**2. Session expiry -- already correct, now actually covered.** Existing
coverage called `notifySessionExpired()` directly, proving the
redirect/message plumbing but not that a real write's 401 response
triggers it. Added: a write (delete) that 401s clears the token, shows
"Session expired, please log in again", and returns to the originating
page after re-login; and the same flow for a token that was already
present when the app started (standing in for one restored from
`sessionStorage` -- `authStore`'s own unit tests already prove that
hydration path produces the identical in-memory value, so there's
nothing `apiFetch`/`getToken()` could tell apart) and turns out to be
rejected on the first write. Both pass unchanged; no fix needed.

**3. Insights page layout -- flex children missing `minWidth: 0`, plus
an unnecessary legend.** `InsightsTabContent` wraps the summary table
and the chart in a `display: flex, flexDirection: column` container.
Neither child declared `minWidth: 0`, which is MUI X Charts' own
documented requirement for a flex/grid-hosted chart to size down to its
container instead of measuring (and rendering) at its unconstrained
content width -- the known mechanism for a chart forcing the whole page
to scroll horizontally instead of shrinking. Added `minWidth: 0` to the
chart's wrapping `Box` and to `InsightsSummaryTable`'s `TableContainer`
(the table already had its own escape valve via `TableContainer`'s
built-in `overflow-x: auto`, which is what should produce the one
allowed horizontal scrollbar, inside the card, at 390px). Also hid the
chart's legend (`hideLegend`): with exactly one series, a color-keyed
"Headcount" legend repeats what the caption/accessible table already
say and was claiming extra vertical space for nothing. Checked and
ruled out, by reading the source rather than guessing: no fixed-pixel
chart width (the `BarChart` only sets `height`, leaving width to the
parent-measurement behavior its own prop docs describe), no `100vw`
anywhere in the frontend, no MUI `Grid` on this page (the employee
table's filter row is the only `Grid` usage in the app), no nested
`maxHeight`/scroll container (the `calc(100vh - 320px)` height cap is
local to `EmployeeTable` and was never applied here). This project has
no browser/e2e tooling (Vitest + jsdom only), so none of this could be
visually confirmed -- the `minWidth: 0` fix is the documented one for
exactly this symptom, but it needs a real-browser check at 1280/1440/
1920/390px to confirm the horizontal scrollbar is actually gone.

**4. Read-only clarity.** Logged out, an info `Alert` above the employee
filters ("You're viewing in read-only mode. Log in to add, edit or
delete employees.") carries its own Login link, and the `AppBar`'s
Login switched from a plain inherited-color button to `variant=
"contained"` -- the Add/Edit/Delete affordances were already
login-gated, but nothing on the page said so before you went looking
for them. Logged in: the alert disappears and a small "Logged in"
`Chip` sits next to Logout, so the two states are visually distinct at
a glance, not just by which buttons happen to be present. The existing
return-to-the-prior-page-after-login behavior is unchanged. The read-
only `Alert`'s own Login link needed `EmployeeTable`'s tests wrapped in
a `MemoryRouter` for the first time (a `react-router` `Link`, unlike
the dialogs this component already rendered, needs a router context
even in isolation).

## S7 final UI round

**1. Insights page horizontal scrollbar: the real cause.** The previous
round's `minWidth: 0` fix addressed a real but secondary issue; a
browser console diagnostic (`document.documentElement.scrollWidth` vs
`clientWidth`, 24px apart at 1440px) found the actual culprit: the
distribution chart's visually-hidden accessible `<table>` had its
clipping styles (`position: absolute`, `width: 1`, `height: 1`,
`overflow: hidden`, `clip: rect(0 0 0 0)`) applied directly to the
`<table>` element itself. `overflow` on a `<table>` clips the table's
own grid box, but a `<caption>` is laid out as a sibling inside the
table's *anonymous wrapper box*, which that `overflow` does not reach
-- so the caption (and the table's own auto-layout content width,
which auto-layout tables compute from cell content regardless of an
author-specified `width`) rendered at its natural size, poking out
past the intended 1x1px clip and widening the whole page by exactly
that amount. Fixed by moving every clipping style onto a plain
wrapping `<div>` (a MUI `Box`) and leaving the `<table>` inside
unstyled -- a div's `overflow: hidden` clips an oversized child
regardless of the child's own content size, which is not reliably true
of a table clipping itself. Checked the rest of the frontend for the
same pattern: this was the only visually-hidden element in the
codebase, so nothing else needed the same fix.

**2. Navbar active-page indication.** `useMatch({ path, end: true })`
per route (not `NavLink`'s own `className`/`style` function props --
those don't compose cleanly through MUI `Button`'s `component` slot,
which expects a plain string `className`, not a function) drives one
shared `aria-current="page"` + styling rule, applied identically to
the desktop nav buttons, the xs menu's items, and the Login button
when it's the active route. At `xs`, `Employees`/`Insights` collapse
into a hamburger `IconButton` (`aria-label="Open navigation menu"`)
opening a `Menu` with the same active styling on its `MenuItem`s; the
brand *text* hides at `xs` (brief: "keep the brand icon ... visible" --
text wasn't guaranteed), the icon stays and still links home. The
brand mark/name link to the employees route, which is `/` in this
app's routing (there is no literal `/employees` path) -- read as "the
employees page," consistent with the existing "Employees" nav button.

## Open items

- Exact salary-limit values per currency for the input schema (JPY's
  natural range is nothing like USD's; the current `MIN_SALARY_MAJOR`/
  `MAX_SALARY_MAJOR` are a single flat range, not yet currency-aware).
