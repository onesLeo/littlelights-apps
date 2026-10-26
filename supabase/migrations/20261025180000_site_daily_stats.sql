-- Our own permanent copy of daily anonymous visitor analytics. NOT YET APPLIED: needs Taman's approval.
-- Daily TOTALS only, copied from Cloudflare Web Analytics by workers/analytics-snapshot:
--   total/visits, total/views                     key ''
--   path/views, path/visits                       key = request path ('/read/abc')
--   path_country/views                            key = path || E'\t' || country name
--   path_referer/views                            key = path || E'\t' || referring host ('' = direct)
--   vitals/samples (key ''), vitals/p75           key = lcp|inp|fcp|ttfb (microseconds) or cls (x10000)
-- No IPs, user agents, cookies, visitor ids or per-visit rows: Cloudflare only ever hands us counts.
create table if not exists public.site_daily_stats (
  day date not null,
  metric text not null check (metric in ('views', 'visits', 'samples', 'p75')),
  dimension text not null check (dimension in ('total', 'path', 'path_country', 'path_referer', 'vitals')),
  key text not null default '' check (length(key) <= 600),
  value bigint not null check (value >= 0),
  primary key (day, metric, dimension, key)
);

alter table public.site_daily_stats enable row level security;
-- Team members can read. No insert/update/delete policies: only save_site_daily_stats() writes.
drop policy if exists "Team reads site stats" on public.site_daily_stats;
create policy "Team reads site stats" on public.site_daily_stats for select using (private.is_team());
revoke all on public.site_daily_stats from anon, authenticated;
grant select on public.site_daily_stats to authenticated;

-- The snapshot secret, stored only as a SHA-256 hash, in the private schema (not exposed by the API).
create extension if not exists pgcrypto with schema extensions;
create table if not exists private.analytics_ingest (
  id boolean primary key default true check (id),
  secret_hash bytea not null
);
revoke all on private.analytics_ingest from public, anon, authenticated;

-- Replaces one day's rows in one transaction (so re-running a day is idempotent).
-- Callable with the public anon key, but does nothing without the right secret.
create or replace function public.save_site_daily_stats(p_secret text, p_day date, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_secret is null or length(p_secret) < 32 or not exists (
    select 1 from private.analytics_ingest where secret_hash = extensions.digest(p_secret, 'sha256')
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_day is null or p_day >= (now() at time zone 'utc')::date or p_day < date '2020-01-01' then
    raise exception 'only finished UTC days can be saved';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then
    raise exception 'rows must be an array of at most 20000';
  end if;
  delete from public.site_daily_stats where day = p_day;
  insert into public.site_daily_stats (day, metric, dimension, key, value)
  select p_day, r.metric, r.dimension, coalesce(r.key, ''), sum(r.value)
  from jsonb_to_recordset(p_rows) as r(metric text, dimension text, key text, value bigint)
  group by r.metric, r.dimension, coalesce(r.key, '');
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.save_site_daily_stats(text, date, jsonb) from public;
grant execute on function public.save_site_daily_stats(text, date, jsonb) to anon, authenticated;

-- One-time, by Taman in the SQL editor (never commit the real value):
--   insert into private.analytics_ingest (secret_hash)
--   values (extensions.digest('<ANALYTICS_INGEST_SECRET>', 'sha256'))
--   on conflict (id) do update set secret_hash = excluded.secret_hash;
