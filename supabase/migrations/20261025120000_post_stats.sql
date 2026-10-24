-- Anonymous play/read counters for Studio Insights. NOT YET APPLIED: needs Taman's approval.
-- One row per (post, UTC day, event) holding a plain number. Nothing about the visitor is stored:
-- no IP, user id, cookie, localStorage id or fingerprint. The site calls it at most once per page
-- load per post and event (js/app.js countEvent).
-- post_id is a content key like 'reel:the-broken-crayon', 'audio:<slug>' or 'devotion:<slug>'.
create table if not exists public.post_stats (
  post_id text not null check (post_id ~ '^(reel|audio|devotion|verse):[a-z0-9-]{1,80}$'),
  day date not null default (now() at time zone 'utc')::date,
  event text not null check (event in ('started', 'finished', 'read_end')),
  count bigint not null default 0 check (count >= 0),
  primary key (post_id, day, event)
);

alter table public.post_stats enable row level security;
-- Only the team can read. Nobody writes directly (no insert/update/delete policies; the RPC below does it).
drop policy if exists "Team reads post stats" on public.post_stats;
create policy "Team reads post stats" on public.post_stats for select using (private.is_team());
revoke all on public.post_stats from anon, authenticated;
grant select on public.post_stats to authenticated;

-- Public increment: adds 1 for today. SECURITY DEFINER so anon can bump the counter without table rights.
create or replace function public.increment_post_stat(p_post_id text, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_post_id is null or p_post_id !~ '^(reel|audio|devotion|verse):[a-z0-9-]{1,80}$'
     or p_event is null or p_event not in ('started', 'finished', 'read_end') then
    raise exception 'invalid post stat';
  end if;
  insert into public.post_stats (post_id, day, event, count)
  values (p_post_id, (now() at time zone 'utc')::date, p_event, 1)
  on conflict (post_id, day, event) do update set count = public.post_stats.count + 1;
end;
$$;
revoke all on function public.increment_post_stat(text, text) from public;
grant execute on function public.increment_post_stat(text, text) to anon, authenticated;
