-- A29 Little Light Lessons #1, episode 4 "Who Walks at the Back?": website reel post.
-- Adds ONE new row to posts (type reel, status scheduled). Goes live Thu 12 Nov 2026, 19:00 WITA (UTC+8) = 11:00 UTC.
-- The app shows a scheduled post only once publish_at has passed (js/store.js isLive), so it appears on time without a server job.
-- Caption is the YouTube Shorts description from ep4-social-upload-guide.md, word for word.
-- Does not change any other post, user, team or setting. Undo before it goes live:
--   update posts set status = 'draft' where slug = 'who-walks-at-the-back' and type = 'reel';
-- Media files are in this repo: media/reels/little-light-lessons-ep04-who-walks-at-the-back.199ee030.mp4 and little-light-lessons-ep04-who-walks-at-the-back-poster.e75069ef.jpg.
insert into posts (type, status, publish_at, title, slug, show_on_today, media_url, author_email, fields)
values (
  'reel', 'scheduled', '2026-11-12 11:00:00+00',
  'Who Walks at the Back?', 'who-walks-at-the-back', true,
  'https://littlesaltandlight.com/media/reels/little-light-lessons-ep04-who-walks-at-the-back.199ee030.mp4',
  'admin@littlesaltandlight.com',
  jsonb_build_object(
    'file', 'little-light-lessons-ep04-who-walks-at-the-back.mp4',
    'poster', 'https://littlesaltandlight.com/media/reels/little-light-lessons-ep04-who-walks-at-the-back-poster.e75069ef.jpg',
    'series', 'Little Light Lessons',
    'episode', 4,
    'minutes', '1:17',
    'seconds', 77,
    'series_description', 'A claymation story for families to watch together. Ema and her little brother Atan learn the lessons Jesus taught, one everyday adventure at a time.',
    'caption', E'Who walks at the back? Back at the sheepfold the lost lamb is home. Ema asks why the Shepherd left the ninety-nine — and learns that every sheep matters. Warm light lifts… she hears Oma again. Dad carries Atan home. Ema remembers who came back for her too, takes Atan''s hand, and walks at the back with him.\n\nLittle Light Lessons is a claymation series for families to watch together. Over four parts, Ema learns the lesson Jesus taught in the parable of the lost sheep (Luke 15:1-7).\n\nTalk about it together: Who could you walk "at the back" with this week — a sibling or a friend?\n\nPart 4 of 4 (finale). Full film of The Ninety-Nine: Saturday 14 Nov.\nStory pages, read-alongs and free printables: https://littlesaltandlight.com/?src=yt\n\n#LittleLightLessons #BibleStoriesForKids #Shorts'
  )
);
