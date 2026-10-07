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
   title, department, country, currency, annual gross salary, hire date.
   Invalid input gets clear field-level errors.
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
- **Salary** is one field: annual gross base, full-time. Stored as integer
  minor units in the employee's local currency (never float).
- **Currency:** fixed, deterministic rates in a `currency_rates` table to a
  USD reporting currency. Same data always gives same numbers.
- **Aggregation:** sums, min, max, and counts run in the database. Median is
  computed in the service layer (SQLite has no percentile function).
- **Pagination:** offset-based with indexed sort columns; adequate at 10k rows.
- **Layering:** router -> service -> repository -> model, so business logic
  is unit-testable without HTTP.
- **Auth:** one shared HR login, credentials from environment variables.
  Reason: the app is publicly reachable with edit/delete endpoints, so a
  minimal gate protects the demo. No user management or roles.
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

## Success Criteria
- Seed completes in seconds (measured, recorded in README)
- List and insight endpoints respond in well under 500 ms locally
- Core services covered by fast, deterministic unit tests
- Deployed publicly by 15/10/26, with demo video