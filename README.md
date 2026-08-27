# Multiplayer Visual Canvas

A real-time collaborative node canvas — several people build logic graphs
together on an infinite pane, and an AI assistant can sketch a graph from a
prompt. Think a focused, node-based slice of Miro/FigJam with an LLM that
proposes structure without ever corrupting the shared document.

This is a portfolio reference implementation. The interesting parts are the ones
that are genuinely hard to get right:

- **Conflict-free multiplayer** via Yjs (CRDT) over a self-hosted Hocuspocus
  WebSocket server — concurrent edits merge, they don't clobber.
- **Multiplayer-correct undo** — `Ctrl+Z` reverts *your* last change, not your
  collaborator's, via a per-client `Y.UndoManager` scoped to a local origin.
- **An AI layer that can't break the CRDT** — the model reads a read-only JSON
  snapshot and returns an *add-only* patch with no ids and no coordinates; the
  client regenerates ids, `elkjs` assigns layout, and dangling edges are pruned
  inside a single Y.Doc transaction. The LLM proposes; deterministic code
  disposes.

## Architecture

Three deployable pieces, and the topology is a consequence, not an incidental:

| Piece | Stack | Runs on |
| --- | --- | --- |
| `apps/web` | Next.js (App Router), React Flow, CodeMirror | Vercel |
| `apps/sync` | Hocuspocus (Yjs WebSocket server) | Railway / Fly — a **stateful long-lived process**, never serverless |
| `packages/shared` | Y.Doc schema, Zod schemas, snapshot codec | imported by both |
| Postgres | Neon (prod) / Docker (local) | — |
| Redis | Upstash (prod) / Docker + `serverless-redis-http` (local) | — |

`apps/sync` holds the live `Y.Doc` for every open board in memory and terminates
every WebSocket. It cannot run on Vercel's serverless functions — the same
reason an in-memory rate limiter doesn't work there. So the sync server is a
container on a host that keeps a process alive, and the browser talks to it
directly over `wss://`.

```
Browser ──wss──> apps/sync (Hocuspocus)  ──> Postgres (ydoc blob + JSON snapshot)
   │
   └──https──> apps/web (Next.js)  ──> Postgres (board metadata)
                     │                └──> Redis (rate limits)
                     └──> Anthropic API (Phase 5, server-side only)
```

## Setup

Needs Docker Desktop running. No cloud accounts required for local dev.

```bash
npm install
npm run setup   # docker compose up (Postgres + Redis + Upstash shim),
                # run migrations, write apps/web/.env.local + apps/sync/.env
npm run dev     # web on http://localhost:3000, sync on ws://localhost:1234
```

`npm run setup` preserves an existing `ANTHROPIC_API_KEY` in
`apps/web/.env.local` (it's the one value it can't fill in for you — needed only
once the AI layer lands in Phase 5).

Reset the local database: `npm run db:reset`.

### Verifying Phase 0

- `curl localhost:3000/api/health` → `{ "ok": true, "checks": { "db": "ok", "redis": "ok" } }`
- Open `http://localhost:3000`, click **Create a board** → redirects to
  `/board/<uuid>` (a stub until Phase 1).
- `npm run smoke` — creates a board, then checks the sync server **syncs** a
  valid board id and **rejects** an unknown one (`onAuthenticate` room gate).
- `POST /api/boards` more than 5×/10min from one IP → `429` (Upstash limiter).

Local Postgres is on host port **5433** and Redis on **6380**, shifted off the
defaults so the stack coexists with anything else on the machine.

## Roadmap

- [x] **Phase 0 — Foundations.** Monorepo, Docker infra, `packages/shared`
      schema + Zod, migrations, one-command setup, CI, `onAuthenticate` room
      gate, Upstash rate limiting.
- [ ] **Phase 1 — Single-user canvas.** React Flow, custom logic-block node,
      CodeMirror-on-double-click for node content, edges with labels.
- [ ] **Phase 2 — Yjs document.** `useYjsReactFlow` binding, nested `Y.Text`
      per node, `Y.UndoManager` with `trackedOrigins`.
- [ ] **Phase 3 — Multiplayer + presence.** Hocuspocus provider, awareness
      cursors/selection, "X is editing" indicator, multiplayer undo test.
- [ ] **Phase 4 — Persistence + rooms.** Board list, snapshot projection,
      view-only links.
- [ ] **Phase 5 — AI graph generation.** Snapshot → Claude (strict JSON) →
      add-only patch → validate + elk layout → transactional apply. Eval suite.
- [ ] **Phase 6 — Polish + write-up.** Shortcuts, alignment, README/diagram,
      walkthrough.

## Known limitations (deliberately out of scope for now)

- **No real auth.** One board = one unguessable `room_id` in the URL; anyone
  with the link can edit. A production version needs sessions + per-board roles
  enforced in Postgres RLS, not just app code.
- **Single sync instance.** Scaling `apps/sync` past one process needs the
  Hocuspocus Redis extension for pub/sub between instances.
- **No board TTL job yet.** `boards.last_activity_at` is maintained for exactly
  this, but the cleanup cron isn't written.
- **Docker image for `apps/sync` installs all workspace deps.** Fine to build;
  a pruned install would slim it.
