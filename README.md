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

### Verifying

- `curl localhost:3000/api/health` → `{ "ok": true, "checks": { "db": "ok", "redis": "ok" } }`
- Open `http://localhost:3000` — the dashboard of your recent boards. **New
  board** → the canvas. Add blocks, connect them, double-click a block to edit
  its text. Open the same `/board/<uuid>` in a second window to see live cursors
  and co-editing. Back on the dashboard, each board shows a live mini-preview.
- `npm run smoke` — sync server **syncs** a valid board id, **rejects** an
  unknown one (`onAuthenticate` room gate).
- `npm run smoke:mp` — two `HocuspocusProvider` clients on one board: CRDT sync,
  concurrent create/text merges, awareness, and that a client's undo reverts
  only its own work, never a collaborator's.
- `npm run smoke:snapshot` — drives a provider, then reads Postgres: the sync
  server's debounced store projects the Y.Doc into `board_documents.snapshot`
  (jsonb) faithfully and bumps `boards.last_activity_at`.
- `POST /api/boards` more than 5×/10min from one IP → `429` (Upstash limiter).

Local Postgres is on host port **5433** and Redis on **6380**, shifted off the
defaults so the stack coexists with anything else on the machine.

## Roadmap

- [x] **Phase 0 — Foundations.** Monorepo, Docker infra, `packages/shared`
      schema + Zod, migrations, one-command setup, CI, `onAuthenticate` room
      gate, Upstash rate limiting.
- [x] **Phase 1 + 2 — Yjs-backed canvas.** React Flow bound to a Y.Doc
      (`useYjsFlow`: doc is the source of truth, React state holds only
      ephemeral UI), custom logic-block node, nested `Y.Text` per node edited
      with CodeMirror mounted only on double-click, labeled edges, per-client
      `Y.UndoManager` with `trackedOrigins`, IndexedDB persistence. 37 unit
      tests over the doc primitives.
- [x] **Phase 3 — Multiplayer + presence.** Hocuspocus provider, live cursors
      with names, "X is editing" indicator, connection status; `Ctrl+Z` reverts
      only your own work (`npm run smoke:mp`).
- [x] **Phase 4 — Dashboard + snapshot.** Board list (your recently-opened
      boards, tracked in `localStorage`) with a live mini-preview drawn from the
      JSON snapshot the sync server projects into Postgres, plus inline rename.
- [ ] **Phase 5 — AI graph generation.** Snapshot → Claude (strict JSON) →
      add-only patch → validate + elk layout → transactional apply. Eval suite.
- [ ] **Phase 6 — Polish + write-up.** Visual pass, shortcuts, alignment,
      README/diagram, walkthrough.

## Known limitations (deliberately out of scope for now)

- **No real auth, and no view-only links.** One board = one unguessable
  `room_id` in the URL. The URL *is* the capability: anyone who has it is a full
  editor. There is deliberately no read-only mode — it would mean gating the
  WebSocket transport with per-link tokens, and keeping the transport a plain
  `room_id` is a design decision (see [AGENTS.md](AGENTS.md)). A production
  version would add sessions + per-board roles enforced in Postgres RLS.
- **Single sync instance.** Scaling `apps/sync` past one process needs the
  Hocuspocus Redis extension for pub/sub between instances.
- **No board TTL job yet.** `boards.last_activity_at` is maintained for exactly
  this, but the cleanup cron isn't written.
- **Docker image for `apps/sync` installs all workspace deps.** Fine to build;
  a pruned install would slim it.
