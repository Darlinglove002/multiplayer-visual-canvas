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
  `onAuthenticate` only checks the board exists. **No view-only links** — the
  transport stays a bare `room_id`, so everyone with the link is an editor.
  Read-only mode is cancelled, not deferred; do not add token-gated links.
- **AI layer**: server reads the JSON snapshot, calls Claude with a strict
  schema, returns an **add-only** patch (`aiPatchSchema` in `packages/shared`) —
  no ids, no coordinates. Client regenerates ids, elk lays out, dangling edges
  are pruned inside one transaction. LLM proposes, deterministic code disposes.
- **Rate limiting**: `@upstash/ratelimit` in `apps/web` (board creation, AI
  generation). In-memory limiter in `apps/sync` (correct there — single
  long-lived process).

## Progress

- **Phase 0** — monorepo, docker infra, sync server + room gate, rate limiting. Done.
- **Phase 1 + 2** (merged) — `packages/shared/doc-ops.ts` primitives, `useYjsFlow`
  binding (Y.Doc = source of truth, React state = ephemeral UI only), nested
  `Y.Text` per node, CodeMirror-on-double-click editor, per-client `Y.UndoManager`
  (`trackedOrigins: {LOCAL_ORIGIN}`), IndexedDB persistence. 37 shared unit tests.
- **Phase 3** — Hocuspocus provider in `lib/canvas/ydoc.tsx` (refcounted module
  cache, deferred teardown for Strict Mode). Presence via `lib/canvas/presence.tsx`
  — one awareness subscription split across `useOthers` (cursors, hot) /
  `useEditors` (per-node "X is editing", cold) / `usePresenceActions` (stable).
  `PresenceCursors` renders in `<ViewportPortal>`. Multiplayer-undo verified:
  Ctrl+Z reverts only the local client's work. Canvas is `ssr: false` (Yjs /
  IndexedDB / WS can't run on the server).
- **Phase 4** — dashboard (`app/page.tsx`, client) lists this browser's recent
  boards (`lib/recent-boards.ts`, localStorage) via `GET /api/boards?ids=`,
  each with a `<BoardPreview>` SVG drawn from the Postgres snapshot; inline
  rename → `PATCH /api/boards/[id]`. Snapshot projection itself was already done
  in the Phase 0 sync-server `store` hook — Phase 4 is the consumer + a
  `smoke:snapshot` test. No view-only links (see above).
- **Phase 5** — AI graph generation. `POST /api/generate` (`lib/ai/`): loads the
  Postgres snapshot as context, `client.messages.parse` with
  `zodOutputFormat(aiGraphSchema)` (structured output), one retry, maps failure
  reasons to status codes. Client applier `lib/canvas/apply-ai-graph.ts` +
  pure `resolveAiGraph` in `@canvas/shared`: clamp → regen ids → resolve edges
  against the LIVE doc (drop dangling/self/dup) → `elkjs` layout
  (`lib/canvas/layout.ts`, browser worker) → offset into free space → ONE
  `doc.transact(…, LOCAL_ORIGIN)`. Model `claude-opus-5`. No server-side
  refusal fallback (refusal → 422). `npm run eval:ai` needs the key. Model
  `claude-sonnet-5` (was opus-5; sonnet is fine + cheaper for this).
- **Phase 6** — visual pass. Design tokens in `globals.css` (`@theme` +
  `:root` vars for canvas surfaces that get passed to RF as props, with a dark
  media-query block). `next/font` Inter. The 4 kind colours are one language
  used on the node, toolbar, minimap, and dashboard preview. Prod-only CSP in
  `next.config.ts` — `worker-src blob:` for elkjs, `connect-src` includes the
  sync WS origin derived from `NEXT_PUBLIC_SYNC_URL`. `prefers-reduced-motion`
  honoured globally. README rewritten around the architecture.

Post-Phase-6 polish: right-click node menu (`node-menu.tsx` — change kind/colour
via the existing `setNodeColor`/`setNodeKind`, delete), `ShareButton` (copies
`location.href`). `apps/sync/src/env.ts` honours `$PORT` for Fly/Railway.
`LICENSE` (MIT), `DEPLOY.md` (Neon → Upstash → Fly → Vercel), `apps/sync/fly.toml`.

All six phases done + deployed-ready. Open item: `ANTHROPIC_API_KEY` in
`apps/web/.env.local` for live generation + `npm run eval:ai`.

### Env / tooling notes
- The Browser pane, when hidden, suspends `ResizeObserver` → React Flow can't
  measure nodes → edges don't visually render. `window.__canvas` (dev-only, in
  `ydoc.tsx`) exposes the live store for headless checks.
- `apps/web` uses Next 16's strict react-hooks lint: no ref writes in render, no
  `Math.random`/impure calls in component bodies, no sync `setState` in effects.

## Commands

- `npm run setup` — docker infra + migrations + env files
- `npm run dev` — web (:3000) + sync (:1234)
- `npm run db:migrate` / `npm run db:reset`
- `npm run typecheck` / `npm run lint` / `npm run build` / `npm test`
- `npm run smoke` — sync room gate · `npm run smoke:mp` — multiplayer + undo
- `npm run smoke:snapshot` — snapshot projection · `npm run eval:ai` — AI structure (needs key)
