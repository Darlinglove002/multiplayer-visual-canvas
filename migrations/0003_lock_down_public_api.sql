-- Lock the tables away from Supabase's auto-generated REST API.
--
-- On Supabase every table in the `public` schema is reachable over HTTP with
-- the *public* anon key unless row level security says otherwise — that would
-- let anyone on the internet read, edit or delete every board. This app never
-- uses that API: the web app and the sync server connect straight to Postgres
-- with the database role, which isn't subject to RLS. So RLS with no policies
-- (deny everything) costs nothing and closes the door.
--
-- On a plain Postgres the roles below don't exist, hence the guard.

alter table boards enable row level security;
alter table board_documents enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on table boards, board_documents, rate_limits from anon, authenticated;
  end if;
end;
$$;
