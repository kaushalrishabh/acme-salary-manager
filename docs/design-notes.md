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

## Open items

- Distribution bucket boundaries, for USD and for each local currency.
