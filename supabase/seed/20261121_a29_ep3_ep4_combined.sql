-- A29 Little Light Lessons #1, Parts 3 & 4 combined: "Where Am I? Who Walks at the Back?"
-- Adds ONE new row to public.posts (type reel, status scheduled). Not run. Do not run the older
-- 20261108 ep3/ep4 seeds for this page: those point at the untrimmed social cuts and still have
-- the Friday 13 Nov / Saturday 14 Nov teaser lines.
-- Goes live Tue 24 Nov 2026, 19:00 WITA (UTC+8) = 2026-11-24 11:00 UTC. Same clock time as earlier
-- Little Light Lessons website reels (ep1 Thu 5 Nov, ep2 Sun 8 Nov, ep3 Tue 10 Nov, ep4 Thu 12 Nov,
-- all 19:00 WITA/SGT). Next weekday evening after Four Friends on the Roof (Mon 23 Nov 00:00 WITA),
-- and it continues the Tue/Thu evening pattern of ep3 and ep4. The app shows a scheduled post only
-- once publish_at has passed (js/store.js isLive), so it appears on time without a server job.
-- Title is the two episode titles, word for word, as they appear on the approved combined cover
-- (PARTS 3 & 4 badge). Caption is the ep3 and ep4 website/YouTube descriptions from
-- supabase/seed/20261108_a29_ep3_where_am_i_reel.sql and
-- supabase/seed/20261108_a29_ep4_who_walks_at_the_back_reel.sql, with the Friday/Saturday teaser
-- lines, the YouTube Shorts hashtags and the ?src=yt link removed. series_description is copied
-- word for word from the earlier Little Light Lessons reel seeds. Video and 9:16 poster are on R2
-- (the MP4 is 35.48 MiB, over the Cloudflare Pages 25 MiB per-file limit).
-- Does not change any other post, user, team or setting. The insert is skipped if the slug exists.
-- Undo before it goes live:
--   update posts set status = 'draft' where slug = 'where-am-i-who-walks-at-the-back' and type = 'reel';
insert into public.posts (type, status, publish_at, title, slug, show_on_today, media_url, author_email, fields)
select 'reel', 'scheduled', '2026-11-24T19:00:00+08:00', 'Where Am I? Who Walks at the Back?', 'where-am-i-who-walks-at-the-back', true,
  'https://media.littlesaltandlight.com/reels/where-am-i-who-walks-at-the-back.27b7520c.mp4',
  'admin@littlesaltandlight.com',
  $json${
 "file": "where-am-i-who-walks-at-the-back.mp4",
 "poster": "https://media.littlesaltandlight.com/reels/where-am-i-who-walks-at-the-back-poster.5d9030f6.jpg",
 "series": "Little Light Lessons",
 "episode": 3,
 "minutes": "2:06",
 "seconds": 126,
 "series_description": "A claymation story for families to watch together. Ema and her little brother Atan learn the lessons Jesus taught, one everyday adventure at a time.",
 "caption": "\"Where am I?\" Ema looks around — sandals, sheep, golden hills. This isn't the park. Then she hears a gentle voice counting: ninety-seven… ninety-eight… ninety-nine. One little lamb is missing — the one with the red thread. The Shepherd shuts the gate on the ninety-nine and walks out into the hills.\n\nWho walks at the back? Back at the sheepfold the lost lamb is home. Ema asks why the Shepherd left the ninety-nine — and learns that every sheep matters. Warm light lifts… she hears Oma again. Dad carries Atan home. Ema remembers who came back for her too, takes Atan's hand, and walks at the back with him.\n\nLittle Light Lessons is a claymation series for families to watch together. Over four parts, Ema learns the lesson Jesus taught in the parable of the lost sheep (Luke 15:1-7).\n\nTalk about it together: Why did the Shepherd leave the ninety-nine? Why do you think he went back for Ema too?\n\nTalk about it together: Who could you walk \"at the back\" with this week — a sibling or a friend?"
}$json$::jsonb
where not exists (select 1 from public.posts where slug = 'where-am-i-who-walks-at-the-back')
returning id, slug, status, publish_at;
-- Check: select id, slug, status, publish_at, media_url, fields->>'minutes', fields->>'poster' from public.posts where slug = 'where-am-i-who-walks-at-the-back';
