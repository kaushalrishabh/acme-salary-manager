# acme-salary-manager

## Live demo

- App: https://acme-salary-manager.vercel.app/
- API health check: https://acme-salary-manager-7nys.onrender.com/health

This runs on free tier hosting. **If nobody has used it for 15+ minutes, the
first load can take about a minute** while the Render backend wakes up from a
cold start. Opening the health check URL first, then reloading the app, is the
quickest way through it.

The demo database resets whenever the backend restarts, so changes made in
the UI don't last. It then reseeds the same 10,000 employees automatically
(about 3 seconds on Render's free tier). See
[docs/deployment.md](docs/deployment.md) for details.
