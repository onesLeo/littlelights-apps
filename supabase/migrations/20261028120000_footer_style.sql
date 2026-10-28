-- Footer style, switchable from the Studio (Site > Footer style).
-- Paste into the Supabase SQL Editor and run once. Safe to run again.
--
-- The site_settings table already exists (supabase/schema.sql): key text primary key, value jsonb,
-- updated_at (+ updated_by, set by a trigger). Anyone can read it; until now only owners could write.
-- This adds write access to the 'footer_style' row for the same Studio editors who can publish posts
-- (owners and editors; mirrors the posts policies). Contributors only write drafts, so they cannot
-- change a live site setting. Every other key stays owner-only.
--
-- value: "B" (golden horizon) or "C" (open columns). The site falls back to C if the row is missing.

create table if not exists public.site_settings (
  key         text primary key check (key ~ '^[a-z_]+$'),
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

alter table public.site_settings enable row level security;

drop policy if exists "Settings are public" on public.site_settings;
create policy "Settings are public" on public.site_settings for select using (true);

drop policy if exists "Editors add the footer style" on public.site_settings;
create policy "Editors add the footer style" on public.site_settings for insert
  with check (key = 'footer_style' and private.team_role() in ('owner', 'editor'));

drop policy if exists "Editors change the footer style" on public.site_settings;
create policy "Editors change the footer style" on public.site_settings for update
  using (key = 'footer_style' and private.team_role() in ('owner', 'editor'))
  with check (key = 'footer_style' and private.team_role() in ('owner', 'editor'));

-- Only "B" or "C" may be stored.
alter table public.site_settings drop constraint if exists site_settings_footer_style_value;
alter table public.site_settings add constraint site_settings_footer_style_value
  check (key <> 'footer_style' or value in ('"B"'::jsonb, '"C"'::jsonb));

insert into public.site_settings (key, value) values ('footer_style', '"C"'::jsonb)
on conflict (key) do nothing;
