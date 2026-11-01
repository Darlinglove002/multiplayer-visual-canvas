# Deploying

Three pieces, in this order — each step needs a value from the one before.

| Piece | Where | Why there |
| --- | --- | --- |
| Postgres | **Supabase** (free plan) | managed Postgres; the apps connect to it directly |
| `apps/sync` | any host that runs a **Docker container** | a long-lived process holding the live Y.Doc and WebSockets — *not* serverless |
| `apps/web` | **Vercel** | Next.js |

Environment variables by the end:

```
DATABASE_URL        # Supabase pooler string — web + sync + migrations
DATABASE_CA_CERT    # Supabase CA certificate, PEM text — web + sync (see step 1)
NEXT_PUBLIC_SYNC_URL # wss:// URL of the sync server — web
ANTHROPIC_API_KEY   # web, optional — without it the AI bar says it isn't set up
```

Optional spend caps for the AI assistant (defaults shown): `AI_PER_IP_PER_HOUR=10`,
`DAILY_AI_CALL_CAP=25`, `MONTHLY_AI_CALL_CAP=200`. `RATE_LIMIT_SALT` can be any
random string; it is mixed into the hash of visitor addresses.

---

## 0. Push to GitHub

Create an empty repo (no README), then:

```bash
git remote add origin https://github.com/<you>/multiplayer-visual-canvas.git
git push -u origin main
```

## 1. Postgres — Supabase

1. [supabase.com](https://supabase.com) → new project.
2. **Project Settings → Database → Connection string → Session pooler.** That is
   `DATABASE_URL`. (Do *not* add `?sslmode=…` to it — the code sets TLS itself and
   always verifies the certificate.)
3. **Project Settings → Database → SSL Configuration → Download certificate.**
   Open the file, copy its whole text, and use it as `DATABASE_CA_CERT`.
4. Apply the migrations from your machine (they are tracked, so re-running is safe):

   ```bash
   DATABASE_URL='postgresql://…pooler.supabase.com:5432/postgres' \
   DATABASE_CA_CERT="$(cat prod-ca-2021.crt)" npm run db:migrate
   ```

   `0003_lock_down_public_api.sql` turns on row level security for the tables so
   Supabase's public REST API can't read or edit boards. The app doesn't use that
   API, so nothing else changes.

## 2. Sync server — a Docker host

`apps/sync/Dockerfile` builds from the **repo root** (npm workspaces). Any
container host works: set the service's Dockerfile path to `apps/sync/Dockerfile`,
give it `DATABASE_URL` and `DATABASE_CA_CERT`, and use the HTTPS domain it gives
you as `wss://…` for `NEXT_PUBLIC_SYNC_URL`. The host injects `PORT` (handled).

- **Always-on hosts** (Fly.io, Railway, a small VPS) are the right fit: the server
  holds every open board in memory. `apps/sync/fly.toml` is ready for Fly.
- **Free tiers that sleep when idle** (e.g. Render's free web service) work for a
  demo — boards are saved to Postgres, so nothing is lost — but the first visitor
  after a quiet period waits roughly a minute for the server to wake up.

Quick check: `curl https://<your-sync-host>` returns Hocuspocus's start page.

## 3. Web — Vercel

1. [vercel.com](https://vercel.com) → import the GitHub repo.
2. **Root Directory: `apps/web`.** Leave "Include files outside the root
   directory" on (it's a monorepo — Vercel needs `packages/shared`).
3. Framework preset: Next.js (auto). Build/install commands: defaults.
4. Add the environment variables above and deploy.

`NEXT_PUBLIC_SYNC_URL` is baked in at build time and also feeds the CSP
`connect-src` — if you change the sync host later, redeploy the web app.

---

## Verifying the deployment

- `https://<vercel-app>/api/health` → `{ "ok": true, "checks": { "db": "ok", "rate_limits": "ok" } }`
- Create a board, open its link in two browsers → live cursors and co-editing.
- The AI prompt bar generates a graph (or says plainly that it isn't set up).

## Notes

- **One sync instance.** It holds every open board's `Y.Doc` in memory. More than
  one instance needs the Hocuspocus Redis extension (see README).
- **Costs.** The Supabase free plan is enough for a demo. The only metered cost
  is the Anthropic API, bounded by the per-visitor, daily and monthly caps above.
- **No custom domain needed.** The `*.vercel.app` URL and the host's own domain
  work as-is.
