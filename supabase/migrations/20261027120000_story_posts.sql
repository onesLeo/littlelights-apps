-- Bedtime stories in the Studio: allow posts.type = 'story'.
--
-- A story post holds a bedtime story's page (/listen/<slug>): the audio (media_url), the story text,
-- verse, prayer, questions and the read-along timings file (fields.timings, a JSON file in the media
-- bucket). Like every post it goes live on its own when publish_at passes.
--
-- Purely additive: only widens the allowed values of posts.type. Existing posts and the app are
-- unaffected. Run once in Supabase: Dashboard → SQL Editor → New query → paste → Run. Safe to run again.

begin;

alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts add constraint posts_type_check
  check (type in ('verse', 'devotion', 'audio', 'reel', 'game', 'story'));

commit;
