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