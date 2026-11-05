-- A29 Little Light Lessons #1, episode 2 "Why Him?": website reel post.
-- Adds ONE new row to posts (type reel, status scheduled). Goes live Sun 8 Nov 2026, 19:00 SGT (11:00 UTC),
-- the evening before the social posts (Mon 9 Nov 16:00 SGT), so the website has it first.
-- Does not change any other post, user, team or setting. Undo before it goes live:
--   update posts set status = 'draft' where slug = 'why-him' and type = 'reel';
-- Media files are in this repo: media/reels/little-light-lessons-ep02-why-him.1be8bade.mp4 and -poster.0b76ff38.jpg.
insert into posts (type, status, publish_at, title, slug, show_on_today, media_url, author_email, fields)
values (
  'reel', 'scheduled', '2026-11-08 11:00:00+00',
  'Why Him?', 'why-him', true,
  'https://littlesaltandlight.com/media/reels/little-light-lessons-ep02-why-him.1be8bade.mp4',
  'admin@littlesaltandlight.com',
  jsonb_build_object(
    'file', 'little-light-lessons-ep02-why-him.mp4',
    'poster', 'https://littlesaltandlight.com/media/reels/little-light-lessons-ep02-why-him-poster.0b76ff38.jpg',
    'series', 'Little Light Lessons',
    'episode', 2,
    'minutes', '1:16',
    'seconds', 76,
    'series_description', 'A claymation story for families to watch together. Ema and her little brother Atan learn the lessons Jesus taught, one everyday adventure at a time.',
    'caption', E'Everyone is looking for Atan… and Ema has to mind the BAGS. 🧺 "I always do everything right. Why does he get everyone?" (Don''t worry, Atan is safe!) 💛\n\nThen Oma opens her little Bible… and the pressed flower begins to glow.\n\nPart 2 of 4. Part 3 "The Ninety-Nine" comes on Wednesday.\n\nFor families today: is it fair when someone else gets all the attention? How does it feel?'
  )
);
