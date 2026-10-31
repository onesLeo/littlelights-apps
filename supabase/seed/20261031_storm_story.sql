-- A16: Bedtime Bible Story #3 "Jesus Calms the Storm", scheduled for Mon 16 Nov 2026 00:00 Singapore time.
-- DRAFT: not run. Waits for Taman's OK (run only after this PR is merged and live).
-- Adds ONE new row to public.posts (type 'story', status 'scheduled'). It changes no existing post, table or setting.
-- Visitors can't see it before 16 Nov 00:00 SGT; until then it shows only in the Studio, where it can be edited or deleted.
-- Files it points at are on the site (littlelights-apps PRs #81 and the timings PR): media/audio/… and media/printables/….
-- Story text, verse, prayer and questions are the narrated version (littlelights-growth PR #2).
-- The insert is skipped if a post with this slug already exists.
insert into public.posts (type, status, publish_at, title, slug, show_on_today, fields, media_url, author_email)
select 'story', 'scheduled', '2026-11-16T00:00:00+08:00', 'Jesus Calms the Storm', 'jesus-calms-the-storm', false,
  $json${
 "series": "Bedtime Bible Stories for Kids",
 "episode": 3,
 "narrator": "Mr. Ginting",
 "desc": "A calm bedtime Bible story about Jesus asleep in the boat, a big wind and “Peace! Be still!”, with a lullaby, gentle lake sounds and a short prayer for a calm heart.",
 "seo_title": "Jesus Calms the Storm | Bedtime Bible Story for Kids #3",
 "file": "jesus-calms-the-storm.18857051.mp3",
 "seconds": 230.83,
 "minutes": "3:51",
 "story": "Hi, little light… It’s bedtime story time. Are you all snuggled in? Let’s pull the blanket up, nice and warm… there we go. Tonight’s story is about a boat, a big wind… and a Friend who is stronger than any storm. It’s called… Jesus Calms the Storm.\n\nOne day, Jesus sat by a big lake and told stories about God to lots and lots of people. He talked all day long, until the sun went down and the sky turned orange… and then pink… and then purple. When evening came, Jesus said to His friends, “Let’s go over to the other side.” So they all climbed into a little wooden boat and pushed off from the shore. Jesus was very, very tired. He went to the back of the boat, laid His head on a soft cushion… and fell fast asleep.\n\nOut on the lake, the wind began to blow. Whoosh… whoosh… Raindrops pattered on the wooden boat… pitter, patter, pitter, patter. The waves rocked the boat up… and down… up… and down. Splash! A wave splashed right into the boat. Then another one. The friends held on tight. They were worried. But Jesus? Jesus was still sleeping peacefully on His cushion.\n\nThe friends went to Jesus and woke Him up. They were frightened and asked if He cared about them. Jesus opened His eyes. He stood up in the boat. And He spoke to the wind and the water… “Peace! Be still!” And right away… the wind stopped. The rain stopped. The waves lay down flat, like a smooth blanket. The Bible says, “The wind ceased and there was a great calm.” Everything was quiet. The clouds drifted away… and one by one, the stars came out.\n\nJesus looked at His friends kindly. “Why are you so afraid?” He asked. His friends looked at the quiet water, and at the twinkling stars. They wondered who He was, because even the wind and the sea obeyed Him. It was Jesus… God’s own Son. And He was with them in the boat the whole time.\n\nYou know, little one… sometimes we have storms too. A loud thunderstorm outside… a bad dream… or a big worry inside our hearts. But Jesus is still with you. He is stronger than any storm. Let’s whisper what Jesus said, together… “Peace! Be still!” And take a slow, sleepy breath. In… and out.",
 "verse": "He awoke and rebuked the wind, and said to the sea, “Peace! Be still!” The wind ceased and there was a great calm.",
 "ref": "Mark 4:39",
 "translation": "WEBBE",
 "prayer": "Dear Jesus… thank You that You are with me, even when I feel scared. When a storm comes, help my heart to be calm. Amen.",
 "goodnight": "Goodnight, little light. Sleep tight. 🌙",
 "questions": "What was Jesus doing when the storm came?\nWhat did Jesus say to the wind and the waves?\nWhen you feel scared, what can you say to Jesus?",
 "timings": "media/audio/jesus-calms-the-storm-timings.json",
 "timings_file": "jesus-calms-the-storm-timings.json",
 "timings_info": "77 sentences, 429 words",
 "image": "media/audio/jesus-calms-the-storm-cover.jpg",
 "image_width": 1200,
 "image_height": 630,
 "image_file": "cover-1200x630.jpg",
 "printables": [
  {
   "title": "Colouring page",
   "file": "media/printables/jesus-calms-the-storm-colouring-page.ec57d6fe.pdf"
  },
  {
   "title": "Memory verse and question cards",
   "file": "media/printables/jesus-calms-the-storm-verse-and-question-cards.19d12ddd.pdf"
  }
 ],
 "next_title": "Four Friends on the Roof",
 "next_when": "Mon 23 Nov",
 "publish_date": "2026-11-16"
}$json$::jsonb,
  'https://littlesaltandlight.com/media/audio/jesus-calms-the-storm.18857051.mp3',
  (select author_email from public.posts where id = 38)
where not exists (select 1 from public.posts where slug = 'jesus-calms-the-storm')
returning id, slug, status, publish_at;
-- Check: select id, slug, status, publish_at, fields->>'minutes', jsonb_array_length(fields->'printables') from public.posts where slug = 'jesus-calms-the-storm';
