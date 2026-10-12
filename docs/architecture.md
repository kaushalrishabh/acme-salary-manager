# Architecture

How the pieces fit together, and how one request (login, then an
authenticated write) flows through them. For the data model, conversion
rules and trade-offs, see [design-notes.md](design-notes.md).

## System

A single-page React app, served as static files from Vercel, talks
directly to the FastAPI API on Render over HTTPS. The browser is the only
thing that ever calls the API -- Vercel does not proxy requests.

```mermaid
flowchart LR
    User(["HR Manager"]) --> Browser["Browser"]
    Browser -- "HTTPS, static files" --> Vercel["React app (Vercel)"]
    Browser -- "HTTPS, fetch + JSON" --> API["FastAPI (Render)"]
    API --> DB[("SQLite file<br/>(ephemeral disk)")]
```

SQLite's disk on Render's free tier is not persistent: the file resets on
every restart, so the backend reseeds 10,000 deterministic employees at
startup when the table is empty (`SEED_ON_EMPTY=true`). See
[deployment.md](deployment.md).

## Backend layering

`router -> service -> repository -> model`, so business logic is
unit-testable without HTTP or a real database (CLAUDE.md). Error handlers
and the auth dependency sit outside that chain: routers don't `try`/`except`
anything themselves, and writes declare `Depends(require_auth)` rather
than checking auth inline.

```mermaid
flowchart TD
    subgraph Routers["app/api/*.py"]
        EmployeesRouter["employees.py"]
        InsightsRouter["insights.py"]
        AuthRouter["auth.py"]
        MetaRouter["meta.py"]
    end

    Auth["app/auth.py<br/>require_auth dependency<br/>token issue + verify"]

    subgraph Services["Service layer"]
        EmployeeService["employee_service.py"]
        InsightsService["insights_service.py"]
    end

    subgraph Repos["Repository layer"]
        EmployeeRepo["employee_repository.py"]
        InsightsRepo["insights_repository.py"]
    end

    Money["app/money.py + app/salary.py<br/>parsing, half-even rounding,<br/>USD conversion"]
    Models["app/models.py<br/>SQLAlchemy 2.x ORM"]
    DB[("SQLite,<br/>Postgres-compatible schema")]
    Errors["app/errors.py + handlers in main.py<br/>NotFoundError to 404<br/>DuplicateEmailError to 409<br/>FieldValidationError to 422"]

    EmployeesRouter -. "writes only" .-> Auth
    EmployeesRouter --> EmployeeService
    InsightsRouter --> InsightsService
    AuthRouter --> Auth
    MetaRouter --> Models

    EmployeeService --> Money
    EmployeeService --> EmployeeRepo
    InsightsService --> InsightsRepo
    EmployeeRepo --> Models
    InsightsRepo --> Models
    Models --> DB

    EmployeeService -. raises .-> Errors
    EmployeeRepo -. raises .-> Errors
```

Notes:
- `app/money.py` holds the currency-agnostic primitives (parsing a decimal
  string to minor units, the one half-even rounding helper, USD-cents
  conversion); `app/salary.py`'s `derive_salary_fields` is the single
  write-path entry point that calls them, used identically by create,
  update, and the seed generator.
- `app/errors.py` defines plain exceptions the service layer raises
  (`NotFoundError`, `DuplicateEmailError`, `FieldValidationError`); the
  handlers that translate them to HTTP responses are registered once, in
  `app/main.py`, so no router needs its own `try`/`except`.
- Reads (`GET /employees`, `GET /employees/options`,
  `GET /employees/{id}`, all three `/insights/*`, `GET /meta/countries`)
  are public. Only `POST`/`PUT`/`DELETE` on `/employees` require
  `Depends(require_auth)`.

## Sequence: login, then an authenticated create

```mermaid
sequenceDiagram
    actor HR as HR Manager
    participant FE as React app
    participant AuthRoute as POST /auth/login
    participant EmpRoute as POST /employees
    participant Svc as EmployeeService
    participant Money as derive_salary_fields
    participant Repo as EmployeeRepository
    participant DB as SQLite

    HR->>FE: Enter username + password
    FE->>AuthRoute: POST /auth/login
    AuthRoute->>AuthRoute: verify_credentials()<br/>hmac.compare_digest, both sides
    AuthRoute-->>FE: 200 token, expires_in 3600
    FE->>FE: store token (memory + sessionStorage)

    HR->>FE: Submit "Add employee" form
    FE->>EmpRoute: POST /employees<br/>Authorization: Bearer token
    EmpRoute->>EmpRoute: require_auth()<br/>verify signature + max_age

    alt token missing, invalid, or expired
        EmpRoute-->>FE: 401 Unauthorized
    else token valid
        EmpRoute->>Svc: create_employee(data)
        Svc->>Svc: pre-check: email already in use?
        alt email already in use
            Svc-->>EmpRoute: raises DuplicateEmailError
            EmpRoute-->>FE: 409 Conflict
        else email free
            Svc->>Money: derive_salary_fields(country, amount)
            alt amount malformed or out of range
                Money-->>Svc: raises InvalidAmountError
                Svc-->>EmpRoute: FieldValidationError on annual_gross_salary
                EmpRoute-->>FE: 422, field-level detail
            else country not supported
                Money-->>Svc: raises ValueError
                Svc-->>EmpRoute: FieldValidationError on country
                EmpRoute-->>FE: 422, field-level detail
            else amount and country valid
                Money-->>Svc: currency, minor units, USD cents
                Svc->>Repo: create(employee fields)
                Repo->>DB: INSERT
                Svc->>DB: commit
                DB-->>Svc: committed
                Svc-->>EmpRoute: EmployeeRead
                EmpRoute-->>FE: 201 Created
            end
        end
    end
```

The 422 shape matches Pydantic's own per-field error format
(`{"detail": [{"loc": ["body", "<field>"], "msg": ..., "type":
"value_error"}]}`), so the frontend maps every validation error --
schema-shape ones from Pydantic itself, and business-rule ones from
`FieldValidationError` -- through the same code path
(`src/utils/apiErrorToFieldErrors.ts`). The commit itself is also wrapped:
if two requests somehow race past the pre-check with the same email, the
database's own unique constraint raises `IntegrityError` on commit, which
is caught and re-raised as the same `DuplicateEmailError` -> 409, so the
race case reaches the client the same way the common case does.
