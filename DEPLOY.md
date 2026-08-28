# Deploying

Four managed services, all with a usable free tier. Do them in this order —
each step needs a value from the one before.

| Piece | Where | Why there |
| --- | --- | --- |
| Postgres | **Neon** | serverless Postgres, branchable |
| Redis | **Upstash** | HTTP Redis — the only kind that works from Vercel functions |
| `apps/sync` | **Fly.io** (or Railway) | a long-lived process holding the live Y.Doc — *not* serverless |
| `apps/web` | **Vercel** | Next.js |

You'll set these env vars by the end:

```
DATABASE_URL              # Neon      — web + sync + migrations
UPSTASH_REDIS_REST_URL    # Upstash   — web
UPSTASH_REDIS_REST_TOKEN  # Upstash   — web
NEXT_PUBLIC_SYNC_URL      # Fly       — web (the wss:// URL of the sync server)
ANTHROPIC_API_KEY         # Anthropic — web (for the AI assistant)
```

---

## 0. Push to GitHub

```bash
# create an empty repo at github.com/new (public, no README), then:
git remote add origin https://github.com/<you>/multiplayer-visual-canvas.git
git push -u origin main
```

(First push opens a browser sign-in via Git Credential Manager. Or install the
GitHub CLI and `gh auth login` first, then `gh repo create ... --source=. --push`.)

## 1. Postgres — Neon

1. [neon.tech](https://neon.tech) → new project.
2. Copy the **pooled** connection string (`...-pooler...`, `?sslmode=require`).
   That's `DATABASE_URL`.
3. Run the migrations against it, from your machine:

   ```bash
   DATABASE_URL='postgres://…-pooler…/neondb?sslmode=require' npm run db:migrate
   ```

## 2. Redis — Upstash

1. [upstash.com](https://upstash.com) → create a Redis database (any region).
2. From the database page, copy **REST URL** and **REST token** →
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

## 3. Sync server — Fly.io

`apps/sync/fly.toml` and `apps/sync/Dockerfile` are ready. Build context is the
**repo root** (npm workspaces), so run `fly` from there.

```bash
fly launch --no-deploy --copy-config --config apps/sync/fly.toml   # pick a name/region
fly secrets set DATABASE_URL='postgres://…-pooler…/neondb?sslmode=require' --config apps/sync/fly.toml
fly deploy --config apps/sync/fly.toml --dockerfile apps/sync/Dockerfile
```

The public URL is `https://<app>.fly.dev`. The browser connects over WebSocket,
so set:

```
NEXT_PUBLIC_SYNC_URL = wss://<app>.fly.dev
```

Quick check: `curl https://<app>.fly.dev` should return Hocuspocus's start page.

> **Railway instead:** New Project → Deploy from repo → set the service's
> Dockerfile path to `apps/sync/Dockerfile` and root to the repo. Add
> `DATABASE_URL`. Railway injects `PORT` (handled). Use the generated domain as
> `wss://…` for `NEXT_PUBLIC_SYNC_URL`.

## 4. Web — Vercel

1. [vercel.com](https://vercel.com) → Import the GitHub repo.
2. **Root Directory: `apps/web`.** Leave "Include files outside the root
   directory" on (it's a monorepo — Vercel needs `packages/shared`).
3. Framework preset: Next.js (auto). Build/install commands: defaults.
4. Environment variables — add all five:

   | Name | Value |
   | --- | --- |
   | `DATABASE_URL` | the Neon pooled string |
   | `UPSTASH_REDIS_REST_URL` | from Upstash |
   | `UPSTASH_REDIS_REST_TOKEN` | from Upstash |
   | `NEXT_PUBLIC_SYNC_URL` | `wss://<app>.fly.dev` |
   | `ANTHROPIC_API_KEY` | from [console.anthropic.com](https://console.anthropic.com) |

5. Deploy.

`NEXT_PUBLIC_SYNC_URL` is baked in at build time and also feeds the CSP
`connect-src` — if you change the sync host later, redeploy the web app.

---

## Verifying the deployment

- `https://<vercel-app>/api/health` → `{ "ok": true, "checks": { "db": "ok", "redis": "ok" } }`
- Create a board, open its link in two browsers → live cursors and co-editing.
- The AI prompt bar generates a graph (or returns a clear message if the key is missing).

## Notes

- **One sync instance.** `min_machines_running = 1`, `auto_stop_machines = off`
  — it holds every open board's `Y.Doc` in memory. Multi-instance needs the
  Hocuspocus Redis extension (see README).
- **Costs.** Neon/Upstash/Fly free tiers are enough for a demo. The only metered
  cost is the Anthropic API — the `/api/generate` route is rate-limited to
  10/hour/IP.
- **No custom domain needed.** The `*.vercel.app` and `*.fly.dev` URLs work as-is.
