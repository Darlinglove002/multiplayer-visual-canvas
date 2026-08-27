-- Multiplayer Visual Canvas — initial schema.

create extension if not exists "pgcrypto";

-- One row per canvas. `last_activity_at` is bumped by the sync server on every
-- debounced document store (apps/sync), so a future TTL job can prune abandoned
-- anonymous boards without needing user accounts.
create table if not exists boards (
  id               uuid primary key default gen_random_uuid(),
  title            text not null default 'Untitled board',
  created_at       timestamptz not null default now(),
  last_activity_at timestamptz not null default now()
);

create index if not exists boards_last_activity_at_idx on boards (last_activity_at);

-- The CRDT state (`ydoc` = binary Yjs update) plus a derived, read-only JSON
-- projection (`snapshot`) used for board-list previews and as the context the
-- AI layer reads. The snapshot is NEVER the source of truth — the sync server
-- rewrites it from `ydoc` on every store.
create table if not exists board_documents (
  board_id   uuid primary key references boards(id) on delete cascade,
  ydoc       bytea,
  snapshot   jsonb not null default '{"nodes":[],"edges":[]}'::jsonb,
  updated_at timestamptz not null default now()
);
