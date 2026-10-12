# Prompts used with AI tools

[docs/ai-log.md](ai-log.md) records outcomes, reviews, and what was accepted,
changed, or rejected, session by session. This file is the companion: the
prompts and instructions themselves, skimmable in a few minutes. Quotes below
are the actual prompt text recorded in ai-log.md unless marked
**(paraphrased)**, which means the original wording isn't preserved verbatim
in the repo and this is a faithful summary of it.

## Tools and working pattern

Two tools, two jobs: **Claude Code** did all implementation (writing tests,
writing code, running them, committing); a **separate Claude chat** reviewed
designs and reports, diagnosed problems from screenshots and browser output
Claude Code can't see, and helped draft the next prompt.

The same pattern repeats through almost every session in ai-log.md:

1. **Design first** -- a design-only proposal, no files written, reviewed
   before any code exists.
2. **Test first** -- failing tests shown before any implementation; one red
   commit, then one green commit, per slice.
3. **Mutation check** -- break the just-built behaviour on purpose, confirm
   the right test fails, then revert.
4. **Report with a deviations list** -- every report states what changed from
   the brief and why, not just what was built.

## Standing instructions

Full text: [CLAUDE.md](../CLAUDE.md). The parts that shaped almost every
prompt below:

- Stack and commands: FastAPI/SQLAlchemy/SQLite/uv on the backend, React/
  TypeScript/Vite/MUI on the frontend -- exact install/test/lint commands for
  both live there, not repeated per prompt.
- Architecture: `router -> service -> repository -> model`; business logic
  must be unit-testable without HTTP or a real database.
- Domain rules fixed up front: money as integer minor units, never float;
  one fixed currency per country; a single shared HR login from environment
  variables, no roles.
- Working rules: TDD (failing test first); fast, deterministic tests (fixed
  seeds, no network, no clock); small commits with conventional prefixes
  (`feat:`, `test:`, `fix:`, `docs:`, `chore:`, `refactor:`); ruff/mypy/pytest
  before every commit; stay inside the P0 scope in requirements.md, ask
  before adding more; show a plan before writing files for anything
  non-trivial; log each session in docs/ai-log.md afterward.

## Prompt patterns I reused

### a. Design-only proposal before any files are written

**When:** anything with real design decisions to make first -- the data
model, the seed generator, the full API contract.

**Skeleton (paraphrased):** "Propose a design for `<X>` only -- no files
written. I'll review it, then you implement."

**Real outcome (Session 2b):** "Asked for a design-only proposal of the data
model, with no files written." The first proposal computed USD conversion in
Python after aggregating per currency in the database; review found the
multi-currency handling heavy (conversion in two places, an overflow risk,
totals that could differ by a few cents), which is what led to storing both
the local amount and a derived USD copy instead.

### b. Test-first slice: failing tests before any implementation

**When:** every module in the backend (money, reference data, models, seed,
each API slice) and most frontend pieces.

**Skeleton:** "Build `<X>` test-first: `<requirements>`. Show me the failing
tests before writing any implementation."

**Real outcome (Session 2c):** "Asked Claude Code to build `app/money.py`
test-first... Told it to show me the failing tests before writing any
implementation." Tests failed first with `ModuleNotFoundError` (expected),
then all 70 passed once the implementation landed -- one red commit, one
green commit.

### c. Mutation check: break it on purpose, watch it fail, revert

**When:** after almost every test is written, to prove it actually exercises
the behaviour it claims to.

**Skeleton:** "Break `<specific line>` on purpose, run the tests, confirm
`<specific test>` fails for the right reason, then revert."

**Real outcomes:**
- Session 3: "removed email lowercasing in `create_employee` and confirmed
  the case-insensitive duplicate test failed."
- Session 4: "removing `Depends(require_auth)` from `DELETE /employees/{id}`
  made its 'without auth' test fail (204 instead of 401), while the other two
  routes' equivalent tests were unaffected."
- Session 6: "hard-coding the desktop nav's `aria-current` to always point at
  Insights" failed both the `/`-route and `/login`-route active-link tests,
  then reverted.

### d. Review the report: ask for deviations, and what would still pass

**When:** at the end of every slice or session, before moving to the next
one.

**Skeleton:** "Report every deviation from this brief and why. Which tests
would still pass if this feature were removed entirely?"

**Real outcomes:**
- Session 2g: "A test that only checks 'flag off, zero rows' would still
  pass if the lifespan never seeded at all." -- led to adding a flag-on test
  that expects exactly the right row count, not just "non-zero."
- Session 3: "Asked which of the 5 plan tests passed when I dropped the
  `country` index. It was the timing smoke test" -- because it had no plan
  assertion at all and passed on a disguised full scan.

### e. Evidence over reasoning, for a UI bug Claude Code can't see

**When:** the insights page's horizontal/vertical scrollbar, after two
source-reasoned fixes from Claude Code didn't work (Sessions 6-7).

**Skeleton (paraphrased):** "Your last two fixes didn't work. I ran a
browser console diagnostic myself: page `scrollWidth` vs `clientWidth`,
which elements sit past the right edge, which element is lowest on the
page. Here are the numbers -- find the actual cause and fix only that."

**Real outcome:** the diagnostic found one element -- the chart's
visually-hidden accessible table -- responsible for the overflow: width
1344 vs 1303, bottom edge at 2189 vs the real content at 1637. Hiding it in
the console confirmed it (1303/1303, `scrollHeight` down to 1406); the real
fix replaced that hidden table with a visible, collapsible disclosure, and
I confirmed afterward that the scrollbars were actually gone.

### f. Run your own docs in a clean clone

**When:** verifying the README before submission (Session 7).

**Skeleton (paraphrased):** "Verify the README: follow your own run-locally
instructions step by step in a fresh temporary clone, with throwaway env
values, and report whether the backend boots, `/health` answers, and the
frontend builds."

**Real outcome:** Claude Code caught its own documentation bug this way --
the command it had just written (`uv run uvicorn app.main:app --reload`)
doesn't read `.env` at all, and crashed with the same "AUTH_SECRET_KEY"
error as the real Render incident. Fixed by adding `--env-file .env`, then
re-ran the corrected instructions from scratch to confirm they actually work.

## Prompts by phase

| Phase | Main prompt, one line | ai-log.md section |
|---|---|---|
| Scaffold | Read CLAUDE.md and requirements; scaffold backend/frontend skeletons, plan first | [Session 1](ai-log.md#2026-10-07-session-1-backend-scaffold), [Session 1b](ai-log.md#2026-10-07-session-1b-frontend-scaffold) |
| Deployment (first pass) | Where/how to host the backend and frontend for free | [Session 2a](ai-log.md#2026-10-07-session-2a-deployment-vercel--render) |
| Data model | Design-only proposal for salary storage and currency, no files written | [Session 2b](ai-log.md#2026-10-07-session-2b-data-model-design-and-the-currency-decision) |
| Money module | Build `app/money.py` test-first: parsing, half-even rounding, USD conversion | [Session 2c](ai-log.md#2026-10-08-session-2c-money-module-test-driven) |
| Reference data | Build `app/reference_data.py` test-first: country/currency maps, rate table | [Session 2d](ai-log.md#2026-10-08-session-2d-reference-data-module-test-driven) |
| Models + DB | Build `app/models.py`/`app/database.py` test-first against in-memory SQLite | [Session 2e](ai-log.md#2026-10-08-session-2e-models-and-database-setup-test-driven) |
| Seed generator | Propose the seed design first, then one shared salary-derivation function | [Session 2f](ai-log.md#2026-10-09-session-2f-seed-generator-and-shared-salary-function) |
| Seeding on startup | Design-only proposal for `SEED_ON_EMPTY` and the startup seeding path | [Session 2g](ai-log.md#2026-10-09-session-2g-seeding-on-startup) |
| API Slice 1-2 (list, writes) | Full API contract reviewed up front, then list and writes built slice-by-slice, test-first | [Session 3](ai-log.md#2026-10-10-session-3-employees-api-slice-1-list-and-slice-2-writes) |
| API Slice 3-4 (insights, auth) | Insights aggregation and auth/CORS, same slice-by-slice pattern | [Session 4](ai-log.md#2026-10-11-session-4-employees-api-slice-3-insights-and-slice-4-auth--cors) |
| Deployment + S6 | Deploy the backend for real; build the React employee table test-first; four rounds of screenshot-driven UI polish | [Session 5](ai-log.md#2026-10-11-session-5-backend-deployment-s6-frontend-and-four-rounds-of-ui-polish) |
| S7 (login, CRUD, insights) | Build login, add/edit/delete, and the insights dashboard; same TDD/mutation-check discipline | [Session 6](ai-log.md#2026-10-12-session-6-s7-login-crud-insights-dashboard-the-fix-round-the-final-ui-round-and-the-insights-scrollbar-investigation) |
| UI rounds (navbar, login, insights redesign) | Final UI round across the navbar, login page, and insights page, plus the scrollbar investigation | [Session 6](ai-log.md#2026-10-12-session-6-s7-login-crud-insights-dashboard-the-fix-round-the-final-ui-round-and-the-insights-scrollbar-investigation), [Session 7](ai-log.md#2026-10-12-session-7-deployment-s6s7-frontend-the-insights-scrollbar-investigation-and-the-docs-pass) |
| Docs pass | Write README.md, docs/architecture.md (Mermaid), verify instructions in a clean clone | [Session 7](ai-log.md#2026-10-12-session-7-deployment-s6s7-frontend-the-insights-scrollbar-investigation-and-the-docs-pass) |
| Final deploy | Diagnose the live 404, redeploy, rotate the password, smoke-test | [Session 8](ai-log.md#2026-10-12-session-8-final-deploy-and-submission-checks) |

## Where AI was wrong and I corrected it

- **A design-review assertion that could never fail** (Session 3): the
  proposed `EXPLAIN QUERY PLAN` test checked `"SCAN TABLE employees" not in
  plan_text`, but SQLite 3.36+ prints `SCAN employees` with no "TABLE" in it
  -- the assertion would always pass, index or no index. Caught before any
  code was written, by running the check against real SQLite rather than
  just reading the proposal.
- **A credential check that leaked timing and could 500 on bad input**
  (Session 3): the first design joined two `hmac.compare_digest` calls with
  `and`, which short-circuits (leaking which field was wrong through timing)
  and raises `TypeError` on non-ASCII `str` input, which would have turned a
  bad login into a 500 instead of a 401.
- **A bucket-width bug beyond the one case it was built for** (Session 3):
  `width = (max - min) // 10` gives a width of 0 for any salary range under
  10 (in minor units), not only when every salary is identical, which would
  put every employee in the last bucket for any dimension with a narrow
  range -- not just the edge case it was written to handle.
- **Two CSS fixes, reasoned correctly from source, that didn't work in a real
  browser** (Sessions 6-7): Claude Code can't see the UI, so both attempts to
  fix the insights page's scrollbar were argued from documented CSS
  mechanisms rather than observed -- and neither worked. Only a browser
  console diagnostic found the actual cause.
- **A plausible-sounding CORS risk that turned out not to apply** (Session
  4): I (the review chat) suspected the write routes' preflight would be
  rejected under Starlette's bare CORS defaults, since the existing tests
  only checked a simple `GET`. The code already used explicit wildcards, so
  there was no bug -- the suspicion itself was wrong, even though hardening
  the config afterward was still worth doing.
- **A live 404 diagnosed as "still building" before the evidence said
  otherwise** (Session 8): my chat assistant's first guess for why
  `/meta/countries` 404'd on the live API was a timing delay or a failed
  build. Both were wrong; comparing the live `/openapi.json` route list
  against the code, and checking Render's own Events page, is what actually
  found it -- Auto-Deploy was disabled on the service, so pushes were never
  deploying at all.
