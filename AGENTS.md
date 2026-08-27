# Working notes for this repo

Portfolio reference implementation. Priorities: correctness of the hard parts
(CRDT multiplayer, multiplayer-safe undo, an AI layer that can't corrupt the
doc), honest documentation of gaps over half-built features.

## Locked decisions (do not re-litigate without a reason)

- **Monorepo**: npm workspaces. `apps/web` (Next.js/Vercel), `apps/sync`
  (Hocuspocus, stateful host — never serverless), `packages/shared` (Y.Doc
  schema + Zod + snapshot codec, the single source of truth imported everywhere).
- **Sync transport**: Hocuspocus, self-hosted. Presence via its built-in Yjs
  awareness. Persistence via the Database extension → Postgres (`ydoc` blob +
  derived `snapshot` jsonb). Postgres = Neon in prod.
- **Node content**: nested `Y.Text` per node (parallel editing of block text).
  Editor = `y-codemirror.next`, mounted **only on the node being edited**
  (double-click); otherwise render `yText.toString()` as static text. Never
  mount an editor per node — it kills FPS past ~30 nodes.
- **Undo**: per-client `Y.UndoManager`, `trackedOrigins: {LOCAL_ORIGIN}`. Every
  doc mutation goes through one module and runs inside
  `ydoc.transact(fn, LOCAL_ORIGIN)`.
- **Auth**: none yet. One board = one uuid `room_id` in the URL. Anonymous
  identity (name + random color) for presence, persisted to `localStorage`.
  `onAuthenticate` only checks the board exists.
- **AI layer**: server reads the JSON snapshot, calls Claude with a strict
  schema, returns an **add-only** patch (`aiPatchSchema` in `packages/shared`) —
  no ids, no coordinates. Client regenerates ids, elk lays out, dangling edges
  are pruned inside one transaction. LLM proposes, deterministic code disposes.
- **Rate limiting**: `@upstash/ratelimit` in `apps/web` (board creation, AI
  generation). In-memory limiter in `apps/sync` (correct there — single
  long-lived process).

## Commands

- `npm run setup` — docker infra + migrations + env files
- `npm run dev` — web (:3000) + sync (:1234)
- `npm run db:migrate` / `npm run db:reset`
- `npm run typecheck` / `npm run lint` / `npm run build`
