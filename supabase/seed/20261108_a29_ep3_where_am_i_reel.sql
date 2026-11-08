-- A29 Little Light Lessons #1, episode 3 "Where Am I?": website reel post.
-- Adds ONE new row to posts (type reel, status scheduled). Goes live Tue 10 Nov 2026, 19:00 WITA (UTC+8) = 11:00 UTC.
-- The app shows a scheduled post only once publish_at has passed (js/store.js isLive), so it appears on time without a server job.
-- Caption is the YouTube Shorts description from ep3-social-upload-guide.md, word for word.
-- Does not change any other post, user, team or setting. Undo before it goes live:
--   update posts set status = 'draft' where slug = 'where-am-i' and type = 'reel';
-- Media files are in this repo: media/reels/little-light-lessons-ep03-where-am-i.b1ff854b.mp4 and little-light-lessons-ep03-where-am-i-poster.95013066.jpg.
insert into posts (type, status, publish_at, title, slug, show_on_today, media_url, author_email, fields)
values (
  'reel', 'scheduled', '2026-11-10 11:00:00+00',
  'Where Am I?', 'where-am-i', true,
  'https://littlesaltandlight.com/media/reels/little-light-lessons-ep03-where-am-i.b1ff854b.mp4',
  'admin@littlesaltandlight.com',
  jsonb_build_object(
    'file', 'little-light-lessons-ep03-where-am-i.mp4',
    'poster', 'https://littlesaltandlight.com/media/reels/little-light-lessons-ep03-where-am-i-poster.95013066.jpg',
    'series', 'Little Light Lessons',
    'episode', 3,
    'minutes', '1:06',
    'seconds', 66,
    'series_description', 'A claymation story for families to watch together. Ema and her little brother Atan learn the lessons Jesus taught, one everyday adventure at a time.',
    'caption', E'"Where am I?" Ema looks around — sandals, sheep, golden hills. This isn''t the park. Then she hears a gentle voice counting: ninety-seven… ninety-eight… ninety-nine. One little lamb is missing — the one with the red thread. The Shepherd shuts the gate on the ninety-nine and walks out into the hills.\n\nLittle Light Lessons is a claymation series for families to watch together. Over four parts, Ema learns the lesson Jesus taught in the parable of the lost sheep (Luke 15:1-7).\n\nTalk about it together: Why did the Shepherd leave the ninety-nine? Why do you think he went back for Ema too?\n\nPart 3 of 4. Part 4 comes Friday 13 Nov, 16:00.\nStory pages, read-alongs and free printables: https://littlesaltandlight.com/?src=yt\n\n#LittleLightLessons #BibleStoriesForKids #Shorts'
  )
);
