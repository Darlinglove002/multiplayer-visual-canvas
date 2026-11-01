-- Shared rate-limit counters (replaces the Redis/Upstash limiter).
--
-- The web app runs on Vercel's serverless functions, which don't share memory,
-- so an in-process counter would limit nothing. Postgres is already the shared
-- store, so the counters live here and no extra service is needed.
--
-- Fixed windows keyed by an opaque string (a hashed visitor id, or a global
-- budget key). Old rows are purged opportunistically.

create table if not exists rate_limits (
  key          text not null,
  window_start timestamptz not null,
  hits         integer not null default 0,
  primary key (key, window_start)
);

alter table rate_limits enable row level security;

create or replace function consume_rate_limit(
  p_key text,
  p_window_seconds integer,
  p_limit integer,
  p_cost integer default 1
)
returns table (out_allowed boolean, out_hits integer, out_retry_after integer)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds <= 0 or p_limit < 0 or p_cost < 1 then
    raise exception 'invalid rate limit arguments';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limits as r (key, window_start, hits)
  values (p_key, v_window, p_cost)
  on conflict (key, window_start) do update set hits = r.hits + p_cost
  returning r.hits into v_hits;

  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return query select
    v_hits <= p_limit,
    v_hits,
    greatest(
      1,
      ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now())))::integer
    );
end;
$$;

-- Supabase exposes the public schema over a REST API; keep the public anon key
-- away from the limiter so nobody can burn the shared budget on purpose.
-- (On a plain Postgres these roles don't exist, hence the guard.)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on function consume_rate_limit(text, integer, integer, integer) from public, anon, authenticated;
    revoke all on table rate_limits from anon, authenticated;
  end if;
end;
$$;
