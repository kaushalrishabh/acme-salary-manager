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

### Planned fix: reseed on empty

When the backend starts, it will check whether the employee table is empty.
If it is, it will run the seed script, which creates 10,000 deterministic
employees from a fixed seed. Every restart then comes back to the same known
dataset, so the demo never shows an empty app.

This is planned and not built yet. Edits made through the UI will still be
lost on restart. Keeping them would need a persistent database, such as a paid
Render disk or a hosted Postgres; the schema is kept Postgres-compatible for
that reason.

## Settings used

**Render (backend):** Root Directory `backend` · Build
`pip install uv && uv sync --frozen --no-dev` · Start
`uv run uvicorn app.main:app --host 0.0.0.0 --port $PORT`

**Vercel (frontend):** Root Directory `frontend` · Framework preset Vite ·
Build `npm run build` · Output `dist`