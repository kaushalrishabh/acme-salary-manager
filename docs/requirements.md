# ACME Salary Management: Requirements

## Goal
Replace ACME HR's Excel-based salary tracking with a web app where the HR
Manager can maintain salary data for 10,000 employees across countries and
answer "how do we pay people?" without building pivot tables.

## Persona
HR Manager. Needs fast lookup, safe edits, and trustworthy aggregates.

## Scope and Features

### P0 (must ship)
1. **Employee CRUD** with validation. Fields: full name, unique email, job
   title, department, country, annual gross salary, hire date (currency is
   derived from the country). Invalid input gets clear field-level errors.
2. **Find employees fast:** server-side search, filters (country, department,
   job title), sorting, pagination. Responsive at 10,000 rows.
3. **Salary insights:** headcount, min, max, average, median, and
   distribution buckets by country, department, and job title.
   Per-country views in local currency; org-wide views in USD.
4. **Seed script:** 10,000 deterministic employees (fixed seed), timed.
5. **UI:** employee table, add/edit form, insights dashboard.
6. **Live deployment** at a public URL, plus a demo video.

### Stretch (only if time allows)
CSV export, then CSV import.

## Key Decisions
Data model, conversion rules and trade-offs: [design-notes.md](design-notes.md).

- **Salary:** annual gross base, full-time, as integer minor units in local
  currency (source of truth), plus a derived USD copy in cents.
- **Currency:** one fixed currency per country, derived from the country.
  INR, USD, GBP, EUR, CAD, AUD, SGD, JPY at fixed rates to USD; no live FX.
- **Rate changes:** require running a recompute script for the USD copies.
- **Aggregation:** in the database, on the USD column across countries and
  the local column per country. Median is computed in the service layer.
- **Pagination:** offset-based with indexed sort columns; adequate at 10k rows.
- **Layering:** router -> service -> repository -> model, so business logic
  is unit-testable without HTTP.
- **Auth:** one shared HR login from environment variables, gating the public
  demo's edit/delete endpoints. No user management or roles.
- **Persistence:** SQLite for the exercise; schema stays Postgres-compatible.

## Deliberately Left Out
| Out | Reason |
|---|---|
| Bonus, allowances, deductions | One salary field keeps aggregates unambiguous |
| Live FX rates | Adds an external dependency and non-deterministic results |
| Salary history / audit trail | Valuable, but not needed to answer "how do we pay people?" |
| Payroll, tax | A different product: this tracks pay data, it does not run pay |
| Role management, approvals | One persona; nobody to approve |
| AI / natural-language querying | Fixed insight set covers the stated need; avoids accuracy risk |
| Several currencies per country (e.g. expats paid in USD) | Keeps every per-country view in a single currency |

## Success Criteria
- Seed completes in seconds (measured, recorded in README)
- List and insight endpoints respond in well under 500 ms locally
- Core services covered by fast, deterministic unit tests
- Deployed publicly by 15/10/26, with demo video