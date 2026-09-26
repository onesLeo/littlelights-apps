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
