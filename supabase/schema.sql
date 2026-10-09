-- Little Light Studio: database, security rules and file storage.
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Then add yourself as owner (last statement, with your email).

-- ---------- team ----------
create table if not exists public.team_members (
  email      text primary key check (email = lower(email)),
  role       text not null check (role in ('owner', 'editor', 'contributor')),
  invited_at timestamptz not null default now()
);

-- Helpers used by the security rules. They live in a private schema so the public
-- API cannot call them directly. SECURITY DEFINER lets them read team_members
-- without being blocked by that table's own rules.
create schema if not exists private;
grant usage on schema private to anon, authenticated;

create or replace function private.team_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.team_members where email = lower((select auth.jwt()) ->> 'email')
$$;

create or replace function private.is_team() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.team_role() is not null
$$;

create or replace function private.my_email() returns text
language sql stable set search_path = '' as $$
  select lower((select auth.jwt()) ->> 'email')
$$;

revoke all on function private.team_role(), private.is_team(), private.my_email() from public;
grant execute on function private.team_role(), private.is_team(), private.my_email() to anon, authenticated;

-- ---------- posts ----------
create table if not exists public.posts (
  id            bigint generated always as identity primary key,
  type          text not null check (type in ('verse', 'devotion', 'audio', 'reel', 'game')),
  status        text not null default 'draft' check (status in ('draft', 'scheduled', 'published')),
  publish_at    timestamptz,
  title         text not null default '',
  slug          text not null unique,
  show_on_today boolean not null default true,
  fields        jsonb not null default '{}'::jsonb,   -- the post's own fields (verse text, body, caption, ...)
  media_url     text,                                  -- audio or video file
  author_email  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  check (status = 'draft' or publish_at is not null)
);
create index if not exists posts_live_idx on public.posts (status, publish_at desc);

alter table public.posts enable row level security;
alter table public.team_members enable row level security;

-- Everyone (no login) can read posts that are live: published or scheduled, and due.
drop policy if exists "Live posts are public" on public.posts;
create policy "Live posts are public" on public.posts for select
  using (status in ('published', 'scheduled') and publish_at <= now());

-- The team can read everything, including drafts.
drop policy if exists "Team reads all posts" on public.posts;
create policy "Team reads all posts" on public.posts for select
  using (private.is_team());

-- Owners and editors can publish; contributors can only write drafts, and only their own.
drop policy if exists "Team creates posts" on public.posts;
create policy "Team creates posts" on public.posts for insert
  with check (private.team_role() in ('owner', 'editor')
              or (private.team_role() = 'contributor' and status = 'draft' and author_email = private.my_email()));

drop policy if exists "Team edits posts" on public.posts;
create policy "Team edits posts" on public.posts for update
  using (private.team_role() in ('owner', 'editor')
         or (private.team_role() = 'contributor' and status = 'draft' and author_email = private.my_email()))
  with check (private.team_role() in ('owner', 'editor')
              or (private.team_role() = 'contributor' and status = 'draft' and author_email = private.my_email()));

drop policy if exists "Owners and editors delete posts" on public.posts;
create policy "Owners and editors delete posts" on public.posts for delete
  using (private.team_role() in ('owner', 'editor'));

-- Team list: the team can see it; only owners can change it.
drop policy if exists "Team sees the team" on public.team_members;
create policy "Team sees the team" on public.team_members for select using (private.is_team());
drop policy if exists "Owners invite" on public.team_members;
create policy "Owners invite" on public.team_members for insert with check (private.team_role() = 'owner');
drop policy if exists "Owners remove" on public.team_members;
create policy "Owners remove" on public.team_members for delete using (private.team_role() = 'owner' and email <> private.my_email());

-- ---------- post history ----------
-- Every change to a post is kept by a trigger: the whole post after the change (or just before it
-- was deleted), who made it and when. The trigger runs for every change, including ones made
-- outside the Studio. Nobody can edit or delete history through the API.
create table if not exists public.post_revisions (
  id          bigint generated always as identity primary key,
  post_id     bigint not null,          -- no foreign key, so the history outlives a deleted post
  action      text not null check (action in ('created', 'edited', 'published', 'scheduled', 'unpublished', 'deleted')),
  snapshot    jsonb not null,
  changed_by  text,                     -- the team member's email, or 'database' for changes made in the SQL editor
  changed_at  timestamptz not null default now()
);
create index if not exists post_revisions_post_idx on public.post_revisions (post_id, changed_at desc);

alter table public.post_revisions enable row level security;
revoke insert, update, delete on public.post_revisions from anon, authenticated;
drop policy if exists "Team reads history" on public.post_revisions;
create policy "Team reads history" on public.post_revisions for select using (private.is_team());

-- Same rules as changeAction() in js/store.js.
create or replace function private.record_post_revision() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  act text;
  snap public.posts;
begin
  if tg_op = 'DELETE' then
    act := 'deleted'; snap := old;
  elsif tg_op = 'INSERT' then
    act := case when new.status in ('published', 'scheduled') then new.status else 'created' end; snap := new;
  else
    -- A save that changed nothing but the timestamp is not a new version.
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then return null; end if;
    snap := new;
    if new.status is distinct from old.status then
      act := case when new.status in ('published', 'scheduled') then new.status else 'unpublished' end;
    elsif new.status = 'scheduled' and new.publish_at is distinct from old.publish_at then
      act := 'scheduled';
    else
      act := 'edited';
    end if;
  end if;
  insert into public.post_revisions (post_id, action, snapshot, changed_by)
  values (snap.id, act, to_jsonb(snap), coalesce(private.my_email(), 'database'));
  return null;
end $$;

drop trigger if exists posts_history on public.posts;
create trigger posts_history after insert or update or delete on public.posts
  for each row execute function private.record_post_revision();

-- ---------- insights: anonymous usage counts ----------
-- What the app records so the team can see which content helps families: visits, tab views and
-- time, and opens, saves, shares and plays of each post. Nothing identifies a person: no names,
-- emails, cookies or IP addresses. `visitor` is a random id made in the browser that changes every
-- day, so visitors can be counted per day but never followed from one day to the next.
-- The app can only add rows; only the team can read them (through public.insights()).
create table if not exists public.events (
  id       bigint generated always as identity primary key,
  at       timestamptz not null default now(),
  day      date not null default ((now() at time zone 'utc')::date),
  visitor  text not null check (char_length(visitor) between 8 and 40),
  name     text not null check (name in ('visit', 'tab_view', 'tab_time', 'open', 'save', 'share', 'play', 'install')),
  tab      text check (tab in ('today', 'watch', 'listen', 'read', 'verses', 'play')),
  kind     text check (kind in ('verse', 'devotion', 'audio', 'reel', 'game')),
  item     text check (char_length(item) <= 120),     -- 'post:27', or 'verse:joshua-1-9' for built-in content
  title    text check (char_length(title) <= 160),
  value    integer check (value between 0 and 3600),  -- seconds, for tab_time
  device   text check (device in ('phone', 'computer'))
);
create index if not exists events_day_idx on public.events (day);

alter table public.events enable row level security;
-- Visitors may add rows, and only these columns: the time and day are always set by the database.
revoke all on public.events from anon, authenticated;
grant insert (visitor, name, tab, kind, item, title, value, device) on public.events to anon, authenticated;
grant select on public.events to authenticated;
drop policy if exists "Anyone adds usage counts" on public.events;
create policy "Anyone adds usage counts" on public.events for insert to anon, authenticated with check (true);
drop policy if exists "Team reads usage counts" on public.events;
create policy "Team reads usage counts" on public.events for select to authenticated using (private.is_team());

-- The summary the Studio's Insights page shows. It runs as the person asking, so the rule above
-- applies: the team gets the numbers, anyone else gets zeros. Same shape as insights() in js/store.js.
create or replace function public.insights(since date) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.visitors, 'visits', d.visits) order by d.day)
      from (select day, count(distinct visitor) as visitors, count(*) filter (where name = 'visit') as visits
            from public.events where day >= since group by day) d), '[]'::jsonb),
    'tabs', coalesce((
      select jsonb_agg(jsonb_build_object('tab', t.tab, 'views', t.views, 'visitors', t.visitors, 'seconds', t.seconds))
      from (select tab, count(*) filter (where name = 'tab_view') as views,
                   count(distinct visitor || day::text) filter (where name = 'tab_view') as visitors,
                   coalesce(sum(value) filter (where name = 'tab_time'), 0) as seconds
            from public.events where day >= since and tab is not null and name in ('tab_view', 'tab_time') group by tab) t), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('item', i.item, 'kind', i.kind, 'title', i.title,
                                          'opens', i.opens, 'saves', i.saves, 'shares', i.shares, 'plays', i.plays))
      from (select item, max(kind) as kind, (array_agg(title order by at desc))[1] as title,
                   count(*) filter (where name = 'open') as opens, count(*) filter (where name = 'save') as saves,
                   count(*) filter (where name = 'share') as shares, count(*) filter (where name = 'play') as plays
            from public.events where day >= since and item is not null group by item) i), '[]'::jsonb),
    'installs', (select count(*) from public.events where day >= since and name = 'install')
  )
$$;
revoke execute on function public.insights(date) from public, anon;
grant execute on function public.insights(date) to authenticated;

-- ---------- file storage: audio and video ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', true, 52428800)            -- public read, 50 MB per file
on conflict (id) do nothing;

drop policy if exists "Team uploads media" on storage.objects;
create policy "Team uploads media" on storage.objects for insert
  with check (bucket_id = 'media' and private.is_team());

drop policy if exists "Owners and editors delete media" on storage.objects;
create policy "Owners and editors delete media" on storage.objects for delete
  using (bucket_id = 'media' and private.team_role() in ('owner', 'editor'));

-- ---------- make yourself the owner (change the email) ----------
-- insert into public.team_members (email, role) values ('you@example.com', 'owner');
