-- A29 Little Light Lessons #1, episode 1 "Always First": website reel post.
-- Adds ONE new row to posts (type reel, status scheduled). Goes live Thu 5 Nov 2026, 19:00 SGT (11:00 UTC).
-- Does not change any other post, user, team or setting. Undo before it goes live:
--   update posts set status = 'draft' where slug = 'always-first' and type = 'reel';
-- Media files are in this repo: media/reels/little-light-lessons-ep01-always-first.3e65dec2.mp4 and -poster.c64d0547.jpg.
insert into posts (type, status, publish_at, title, slug, show_on_today, media_url, author_email, fields)
values (
  'reel', 'scheduled', '2026-11-05 11:00:00+00',
  'Always First', 'always-first', true,
  'https://littlesaltandlight.com/media/reels/little-light-lessons-ep01-always-first.3e65dec2.mp4',
  'admin@littlesaltandlight.com',
  jsonb_build_object(
    'file', 'little-light-lessons-ep01-always-first.mp4',
    'poster', 'https://littlesaltandlight.com/media/reels/little-light-lessons-ep01-always-first-poster.c64d0547.jpg',
    'series', 'Little Light Lessons',
    'episode', 1,
    'minutes', '0:52',
    'seconds', 52,
    'series_description', 'A claymation story for families to watch together. Ema and her little brother Atan learn the lessons Jesus taught, one everyday adventure at a time.',
    'caption', E'Ema is ALWAYS first. First down the slide, first on the swings… 🛝 But this Saturday, being first cost her something. (Don''t worry, Atan is safe!) 💛\n\nPart 1 of 4. Part 2 "Why Him?" comes on Monday.\n\nFor families today: have you ever wanted to be first so much that you forgot someone? What should Ema do now: tell Mum and Dad, or look for Atan by herself?'
  )
);
