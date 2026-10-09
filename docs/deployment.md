# Deployment

Both apps run on **free tier** hosting. That keeps the demo at zero cost, but
it has the trade-offs described below.

| Part | Host | URL |
|---|---|---|
| Frontend (React + Vite) | Vercel | https://acme-salary-manager.vercel.app/ |
| Backend (FastAPI) | Render | https://acme-salary-manager-7nys.onrender.com |

To check that the backend is up, open
https://acme-salary-manager-7nys.onrender.com/health. A healthy server returns:

```json
{"status": "ok"}
```

## Free tier limitations

### Cold start on Render

Render's free tier stops the backend after **15 minutes without requests**.
The next request starts it again, which can take **about a minute**. Until
then the page may load slowly or show errors from the API.

If the app looks slow or empty after a break, open the `/health` URL above,
wait for `{"status": "ok"}`, then reload the frontend. Requests are fast again
once the server is awake.

The Vercel frontend has no cold start, because it is served as static files.

### SQLite data resets

The backend stores data in a SQLite file on the Render server's local disk.
Free tier disks are not persistent: the file is lost whenever the service
restarts, which happens on every redeploy and every cold start after idling.
Any employees added or edited through the UI disappear at that point.

### Reseed on empty

When `SEED_ON_EMPTY=true` and the employees table is empty, the backend
seeds 10,000 deterministic employees at startup, before the server starts
accepting requests. On Render's free tier this was measured at 2.90 s on
2026-10-09; on a laptop with a file database it takes 0.16 s.

`SEED_ON_EMPTY` is a demo-only flag set in Render's Environment settings.
Because free-tier disks are ephemeral, edits made in the UI are lost on
restart and the same dataset is reseeded. If someone deletes every employee
and the app restarts, it reseeds. Keeping them would need a persistent
database, such as a paid Render disk or a hosted Postgres; the schema is
kept Postgres-compatible for that reason.

## Settings used

**Render (backend):** Root Directory `backend` · Build
`pip install uv && uv sync --frozen --no-dev` · Start
`uv run --frozen --no-dev uvicorn app.main:app --host 0.0.0.0 --port $PORT`
(plain `uv run` re-installed the dev tools on each start). Python is pinned
by `backend/.python-version` (3.12.15).

**Vercel (frontend):** Root Directory `frontend` · Framework preset Vite ·
Build `npm run build` · Output `dist`