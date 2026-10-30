-- Printable download counts for Studio Insights (website tasks W12). NOT YET APPLIED: needs Taman's approval.
-- Apply once: Supabase Dashboard -> SQL Editor -> paste -> Run (or `supabase db push`).
-- One row per (file, UTC day, country) holding a plain number. Nothing about the visitor is stored: no IP,
-- user id, user agent, cookie or fingerprint. The country is the two-letter code Cloudflare works out from the
-- connection ('XX' when unknown). Written only by /dl/<file> (functions/dl, lib/downloads.mjs) through the
-- function below; read only by the team (Studio Insights, functions/api/insights.js).
-- file is the PDF's name without folder, fingerprint and .pdf, e.g. 'jonah-colouring-page'.
create table if not exists public.download_stats (
  file text not null check (file ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  day date not null default (now() at time zone 'utc')::date,
  country text not null check (country ~ '^[A-Z]{2}$'),
  count bigint not null default 0 check (count >= 0),
  primary key (file, day, country)
);

alter table public.download_stats enable row level security;
-- Only the team can read. Nobody writes directly (no insert/update/delete policies; the RPC below does it).
drop policy if exists "Team reads download stats" on public.download_stats;
create policy "Team reads download stats" on public.download_stats for select using (private.is_team());
revoke all on public.download_stats from anon, authenticated;
grant select on public.download_stats to authenticated;

-- Public increment: adds 1 for today. SECURITY DEFINER so the /dl/ function (anon key) can bump the counter
-- without table rights.
create or replace function public.increment_download(p_file text, p_country text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_file is null or p_file !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
     or p_country is null or p_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid download stat';
  end if;
  insert into public.download_stats (file, day, country, count)
  values (p_file, (now() at time zone 'utc')::date, p_country, 1)
  on conflict (file, day, country) do update set count = public.download_stats.count + 1;
end;
$$;
revoke all on function public.increment_download(text, text) from public;
grant execute on function public.increment_download(text, text) to anon, authenticated;
