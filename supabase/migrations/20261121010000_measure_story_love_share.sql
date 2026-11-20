-- Anonymous counters for bedtime stories, Love, Share, Save and a few simple taps.
-- NOT applied automatically: paste into the Supabase SQL Editor and run (Taman's approval).
-- Nothing about the visitor is stored: no IP, user id, cookie, localStorage id or fingerprint.
--
-- New post_id prefixes: story:<slug> (bedtime stories), action:<name> (join, instagram, …).
-- New events: love, unlove, share, save, click.
-- Love totals on the public site come from get_post_love_counts (net love minus unlove, never below 0).
-- A Pages Function (/api/stat) also caps how often one connection can increment a post,
-- using a short-lived cache key; that cap is not stored in this database.

do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.post_stats'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%post_id%'
  loop
    execute 'alter table public.post_stats drop constraint ' || quote_ident(r.conname);
  end loop;
  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.post_stats'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) like '%event%'
  loop
    execute 'alter table public.post_stats drop constraint ' || quote_ident(r.conname);
  end loop;
end $$;

alter table public.post_stats
  add constraint post_stats_post_id_check
  check (post_id ~ '^(reel|audio|devotion|verse|story|action):[a-z0-9-]{1,80}$');

alter table public.post_stats
  add constraint post_stats_event_check
  check (event in ('started', 'finished', 'read_end', 'love', 'unlove', 'share', 'save', 'click'));

create or replace function public.increment_post_stat(p_post_id text, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  today date := (now() at time zone 'utc')::date;
  net bigint;
  todays bigint;
begin
  if p_post_id is null or p_post_id !~ '^(reel|audio|devotion|verse|story|action):[a-z0-9-]{1,80}$'
     or p_event is null or p_event not in ('started', 'finished', 'read_end', 'love', 'unlove', 'share', 'save', 'click') then
    raise exception 'invalid post stat';
  end if;

  -- Soft clamp: one post, one event, one UTC day never grows past 10,000. Stops a runaway script
  -- from blowing up a total; ordinary use will never come close.
  if p_event <> 'unlove' then
    select coalesce(sum(count), 0) into todays
    from public.post_stats
    where post_id = p_post_id and event = p_event and day = today;
    if todays >= 10000 then
      return;
    end if;
  end if;

  -- unlove never takes the public love total below zero.
  if p_event = 'unlove' then
    select greatest(0, coalesce(sum(case
      when event = 'love' then count
      when event = 'unlove' then -count
      else 0 end), 0))
    into net
    from public.post_stats
    where post_id = p_post_id;
    if net <= 0 then
      return;
    end if;
  end if;

  insert into public.post_stats (post_id, day, event, count)
  values (p_post_id, today, p_event, 1)
  on conflict (post_id, day, event) do update set count = public.post_stats.count + 1;
end;
$$;
revoke all on function public.increment_post_stat(text, text) from public;
grant execute on function public.increment_post_stat(text, text) to anon, authenticated;

-- Public love totals only (net loves). No days, no other events, no visitor data.
-- The list is limited to 80 known post ids so the function cannot be used to scan the table.
create or replace function public.get_post_love_counts(p_ids text[])
returns table (post_id text, loves bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.post_id,
    greatest(0, coalesce(sum(case
      when s.event = 'love' then s.count
      when s.event = 'unlove' then -s.count
      else 0 end), 0))::bigint as loves
  from public.post_stats s
  where s.post_id = any (select distinct x from unnest(p_ids) as x
                         where x ~ '^(reel|audio|devotion|verse|story):[a-z0-9-]{1,80}$')
  group by s.post_id;
$$;
revoke all on function public.get_post_love_counts(text[]) from public;
grant execute on function public.get_post_love_counts(text[]) to anon, authenticated;
