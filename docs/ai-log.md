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