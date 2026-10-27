-- Bedtime stories posted in the Studio (type 'story', shown at /listen/<slug> and in "Goodnight Little Light").
-- Purely additive: lets posts.type be 'story'. Nothing else changes; the existing security rules already
-- hide a scheduled story from visitors until its publish_at (midnight Singapore time on its date).
-- Apply once: Supabase Dashboard -> SQL Editor -> paste -> Run (or `supabase db push`).
alter table public.posts drop constraint if exists posts_type_check;
alter table public.posts add constraint posts_type_check
  check (type in ('verse', 'devotion', 'audio', 'reel', 'game', 'story'));
