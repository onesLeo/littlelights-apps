-- Hide posts.author_email from visitors.
--
-- Visitors use the public "anon" key, which until now could read every column of live posts,
-- including the email address of the team member who wrote them. From now on anon may read only the
-- columns below. Team members (signed in, role "authenticated") keep full access, so the Studio is
-- unchanged. Row-level security still decides WHICH posts anyone can see; this decides which columns.
--
-- Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run.
-- Run it AFTER the app update that stops asking for author_email is live (js/store.js asks for named
-- columns): an older copy of the app asked for every column ('*') and would get "permission denied".
-- Safe to run more than once.

begin;

revoke select on table public.posts from anon;
grant select (id, type, status, publish_at, title, slug, show_on_today, fields, media_url, created_at, updated_at)
  on table public.posts to anon;

-- Team members keep reading everything (unchanged; repeated here so the intent is explicit).
grant select on table public.posts to authenticated;

commit;

-- Check (should list every column except author_email for anon):
-- select grantee, column_name from information_schema.column_privileges
-- where table_schema = 'public' and table_name = 'posts' and privilege_type = 'SELECT' and grantee = 'anon'
-- order by column_name;
