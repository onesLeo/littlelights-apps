-- A20: Bedtime Bible Story #4 "Four Friends on the Roof", scheduled for Mon 23 Nov 2026 00:00 Singapore/WITA time
-- (2026-11-22T16:00:00Z), the same time of day as Elijah, The Smallest Star, Pip and Jesus Calms the Storm.
-- DRAFT: not run. Taman said to schedule it on 23 Nov; run it only after this PR is merged and live
-- (the post points at files this PR adds under media/audio/ and media/printables/).
-- Adds ONE new row to public.posts (type 'story', status 'scheduled'). It changes no existing post, table or setting.
-- Visitors can't see it before 23 Nov 00:00; until then it shows only in the Studio, where it can be edited or deleted.
-- Every text field is copied word for word from the approved handoff (bedtime/04-four-friends-on-the-roof/studio-fields.txt).
-- The insert is skipped if a post with this slug already exists.
insert into public.posts (type, status, publish_at, title, slug, show_on_today, fields, media_url, author_email)
select 'story', 'scheduled', '2026-11-23T00:00:00+08:00', 'Four Friends on the Roof', 'four-friends-on-the-roof-bedtime-story', false,
  $json${
 "series": "Bedtime Bible Stories for Kids",
 "episode": 4,
 "narrator": "Mr. Ginting",
 "desc": "A calm bedtime Bible story about four friends who carried their friend to Jesus through the roof, and Jesus who forgave him and made him well, with a lullaby and a short prayer for kind friends.",
 "seo_title": "Four Friends on the Roof | Bedtime Bible Story for Kids #4",
 "file": "four-friends-on-the-roof.eb3ed4de.mp3",
 "seconds": 252.5,
 "minutes": "4:13",
 "story": "Hi, little light… It’s bedtime story time. Are you all snuggled in? Let’s tuck the blanket up, nice and warm… there we go. Tonight’s story is about four good friends… a man whose legs couldn’t walk… and Jesus, who is so kind. It’s called… Four Friends on the Roof.\n\nA long time ago, there was a man whose legs couldn’t walk. He couldn’t stand up by himself. He couldn’t walk to the door, or down the road. Every day, he lay on a little mat. I think some days felt very long. But he was not alone. He had four good friends. Can you count them with me, little one? One… two… three… four. Four friends who loved him very much. And they knew someone who could help. They knew Jesus.\n\nSo the four friends picked up the four corners of the mat… and they carried their friend, nice and slow, all the way to the house where Jesus was. Step… by step… by step. But when they got there… the house was full. So full! People stood in the doorway, and all around. There was no room to squeeze in. The friends could not get through. Oh dear. Did they give up? No. Good friends don’t give up. They had an idea.\n\nIn those days, houses had flat roofs, like a little floor on top, with stairs on the outside. So the four friends climbed the stairs, carefully, carefully, still carrying their friend on the mat. Then… very gently… they opened a little space in the roof. Not a bang. Not a crash. Just a quiet opening, like pulling back a curtain to let the light in. And then they lowered their friend down… down… down… right in front of Jesus. There he was, on his mat, looking up at Jesus’ kind face.\n\nJesus looked at the man, and at the four friends peeking through the opening. He could see how much they trusted Him. The Bible says, “Jesus, seeing their faith, said to the paralytic, ‘Son, your sins are forgiven you.’” Paralytic means… the man whose legs couldn’t walk. And sins are the wrong things we do. Jesus was making his heart clean. He was saying, you are forgiven. You are loved. Then Jesus said, “I tell you, arise, take up your mat, and go to your house.” And the man… stood up. He rolled up his mat, and walked home with his four friends beside him, their hearts very glad.\n\nYou know, little one… good friends help each other come to Jesus. When someone you love needs help, you can pray for them. You can be kind. You can bring them to Jesus, just like those four friends did. And Jesus is never too busy for you. He forgives. He takes care of you. He is so kind.",
 "verse": "I tell you, arise, take up your mat, and go to your house.",
 "ref": "Mark 2:11",
 "translation": "WEB",
 "prayer": "Dear Jesus… thank You for my friends. Thank You that I can come to You. Help me be a kind friend too. Amen.",
 "goodnight": "Goodnight, little light. Sleep tight. 🌙",
 "questions": "How many friends carried the man to Jesus?\nWhat did the friends do when they couldn't get in the door?\nWho is a good friend to you?",
 "timings": "media/audio/four-friends-on-the-roof-timings.json",
 "timings_file": "four-friends-on-the-roof-timings.json",
 "timings_info": "84 sentences, 501 words",
 "image": "media/audio/four-friends-on-the-roof-cover.jpg",
 "image_width": 1200,
 "image_height": 630,
 "image_file": "cover-1200x630.jpg",
 "printables": [
  {
   "title": "Colouring page",
   "file": "media/printables/four-friends-on-the-roof-colouring-page.440701df.pdf"
  },
  {
   "title": "Memory verse and question cards",
   "file": "media/printables/four-friends-on-the-roof-verse-and-question-cards.92566f3d.pdf"
  }
 ],
 "publish_date": "2026-11-23"
}$json$::jsonb,
  'https://littlesaltandlight.com/media/audio/four-friends-on-the-roof.eb3ed4de.mp3',
  (select author_email from public.posts where id = 38)
where not exists (select 1 from public.posts where slug = 'four-friends-on-the-roof-bedtime-story')
returning id, slug, status, publish_at;
-- Check: select id, slug, status, publish_at, fields->>'minutes', jsonb_array_length(fields->'printables') from public.posts where slug = 'four-friends-on-the-roof-bedtime-story';
