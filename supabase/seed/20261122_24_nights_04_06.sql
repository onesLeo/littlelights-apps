-- 24 Nights to Bethlehem, Nights 4–6 audio bedtime stories, scheduled for 7:00 PM WITA
-- on Fri 4 Dec, Sat 5 Dec and Sun 6 Dec 2026 (2026-12-04T19:00:00+08:00 and the two days after).
-- DRAFT: not run. Run it only after this PR is merged and live (the posts point at files this PR
-- adds under media/audio/ and media/printables/). It changes no existing post, table or setting.
-- Visitors can't see a night before its publish_at; until then it shows only in the Studio, where
-- it can be edited or deleted. Each insert is skipped if a post with that slug already exists.
-- Story, verse, prayer, goodnight, questions and word-to-know are copied word for word from
-- each night's script.md and episode.json. desc and seo_title have no source in those files
-- and are proposed for Taman's approval.
insert into public.posts (type, status, publish_at, title, slug, show_on_today, fields, media_url, author_email)
select 'story', 'scheduled', '2026-12-04T19:00:00+08:00', 'A Great Light', 'a-great-light-bedtime-story', false,
  $json${
 "series": "24 Nights to Bethlehem",
 "episode": 4,
 "narrator": "Mr. Ginting",
 "desc": "A calm Advent bedtime Bible story about God's promise of a great light, Isaiah 9:2, and Jesus who is brighter than every Christmas light, with a lullaby and a short prayer.",
 "seo_title": "A Great Light | 24 Nights to Bethlehem #4",
 "file": "a-great-light.fe1c3e07.mp3",
 "seconds": 253.2,
 "minutes": "4:13",
 "story": "Hi, little light… It's Advent story time. Are you all cosy? Let's tuck the blanket under your chin… just like that. Tonight is night four of twenty-four nights to Bethlehem. And I have a question for you. What's brighter than every Christmas light? Hmm… let's find out together. Tonight's story is called… A Great Light.\n\nEma snuggled under her quilt, and Mummy and Papa sat close beside her. On the window, the paper star, the paper heart and the little paper house glowed in the lamplight. \"Door number four,\" said Papa. Ema opened it… and inside was a tiny paper candle, with a bright yellow flame. \"Ooh,\" she whispered. Can you hold up four fingers, little one? One… two… three… four. A star, a heart, a little house, and a candle. \"Even a little light can shine in the dark,\" said Papa. \"Close your eyes, Ema… and imagine…\"\n\nEma closed her eyes… and now she was standing on a quiet road, long, long ago. It was night time, and the sky was dark and still. People were walking slowly along the road, each one holding a tiny clay lamp. The little flames flickered… flicker, flicker… and made small golden circles on the ground. Ema walked beside them. She felt warm and safe, and she wasn't scared at all. Can you make your fingers twinkle, like tiny little lamps? Twinkle, twinkle… just like that.\n\nThen Ema saw Isaiah again, the man who wrote God's messages. God had given him a bright, happy message for all those people with their tiny lamps. The Bible says: \"The people who walked in darkness have seen a great light.\" A great light… much bigger than a little lamp. Bigger than a candle. Brighter than the sunrise. And God was going to send that light to the whole world.\n\nEma opened her eyes. \"Papa, what was the great light?\" \"It's Jesus,\" said Papa. \"Jesus is brighter than every Christmas light. When we feel sad, or a little bit scared, Jesus is right there, shining His love on us.\" \"Christmas is coming!\" said Mummy. \"Tomorrow, let's shine too: one kind thing for someone in our family.\" Ema thought hard. \"I'll help Papa make breakfast!\" What about you, little one? What kind thing could you do tomorrow? Oh, that will make someone smile.\n\nYou know, little one… Jesus is the great light, and you can be His little light. Every kind word, every helping hand, every gentle hug… that's you, shining for Jesus. Ema looked at the paper candle on her window and smiled. Then they all held hands.",
 "verse": "The people who walked in darkness have seen a great light.",
 "ref": "Isaiah 9:2",
 "translation": "WEB",
 "prayer": "Dear Jesus… thank You for being the great light. Help me shine with kindness tomorrow. Amen.",
 "goodnight": "Goodnight, little light. Sleep tight. Twenty more nights to go. 🌙",
 "questions": "What did the people carry on the dark road?\nWho is the great light?\nWhat kind thing could you do tomorrow?",
 "word": "darkness",
 "word_meaning": "the people with tiny lamps in the dark, and Jesus, the great light",
 "timings": "media/audio/a-great-light-timings.json",
 "timings_file": "a-great-light-timings.json",
 "timings_info": "74 sentences, 459 words",
 "image": "media/audio/a-great-light-cover.jpg",
 "image_width": 1200,
 "image_height": 630,
 "image_file": "cover-1200x630-scene.jpg",
 "printables": [
  {
   "title": "Colouring page",
   "file": "media/printables/a-great-light-colouring-page.4734de0e.pdf"
  },
  {
   "title": "Memory verse and question cards",
   "file": "media/printables/a-great-light-verse-and-question-cards.f3d9ba08.pdf"
  }
 ],
 "publish_date": "2026-12-04"
}$json$::jsonb,
  'https://littlesaltandlight.com/media/audio/a-great-light.fe1c3e07.mp3',
  (select author_email from public.posts where id = 38)
where not exists (select 1 from public.posts where slug = 'a-great-light-bedtime-story')
returning id, slug, status, publish_at;
insert into public.posts (type, status, publish_at, title, slug, show_on_today, fields, media_url, author_email)
select 'story', 'scheduled', '2026-12-05T19:00:00+08:00', 'The Gentle Shepherd', 'the-gentle-shepherd-bedtime-story', false,
  $json${
 "series": "24 Nights to Bethlehem",
 "episode": 5,
 "narrator": "Mr. Ginting",
 "desc": "A calm Advent bedtime Bible story about the gentle shepherd who carries a little lamb close to his heart, Isaiah 40:11, and Jesus the gentle shepherd, with a lullaby and a short prayer.",
 "seo_title": "The Gentle Shepherd | 24 Nights to Bethlehem #5",
 "file": "the-gentle-shepherd.42c4e56a.mp3",
 "seconds": 251.5,
 "minutes": "4:12",
 "story": "Hi, little light… It's Advent story time. Are you snuggled in? Let's fluff your pillow… soft and squishy… there. Tonight is night five of twenty-four nights to Bethlehem. Tonight's story starts with a question. Who carries the littlest lamb? Let's find out. Tonight's story is called… The Gentle Shepherd.\n\nEma snuggled under her quilt, with Mummy and Papa close beside her. Four paper treasures were stuck on her window now: a star, a heart, a little house and a candle. \"Door number five,\" said Mummy. Ema opened it… and inside was a tiny, fluffy paper lamb, with cotton wool for its fleece. \"It's so soft!\" said Ema. Can you hold up five fingers, little one? A whole hand! One… two… three… four… five. \"Lambs are little, and they need lots of care,\" said Mummy. \"Close your eyes, Ema… and imagine…\"\n\nEma closed her eyes… and now she was sitting on a green, grassy hill, long, long ago. The evening sun was warm and golden. All around her, sheep were munching grass. Baa… baa… A shepherd was leading them home. But one tiny lamb was too tired to keep up. Its little legs wobbled… and it sat down in the grass. Ema watched. She didn't say a word. Can you say baa, very softly, like a sleepy little lamb? Baa… just like that.\n\nThe shepherd stopped. He walked back, knelt down, and gently scooped the little lamb up in his arms. He held it close, right next to his heart. And Ema remembered a promise God gave Isaiah. The Bible says: \"He will feed his flock like a shepherd. He will gather the lambs in his arm, and carry them in his bosom.\" Bosom means close to his heart. The tired little lamb wasn't left behind. It was carried… all the way home.\n\nEma opened her eyes. \"Mummy, who is the gentle shepherd?\" \"It's Jesus,\" said Mummy. \"When you feel tired, or small, or a little bit sad, Jesus carries you close to His heart, just like that lamb.\" \"Christmas is coming!\" said Papa. \"Tomorrow, let's share or help someone smaller, just like He does.\" \"I'll help the little ones at Sunday school!\" said Ema. What about you, little one? Who could you help, or share with, tomorrow? That's a lovely idea.\n\nYou know, little one… you are one of Jesus' little lambs. He knows your name, and He never leaves you behind. Can you give yourself a gentle hug, like the shepherd hugging his lamb? Mmm… that's it. Ema hugged her paper lamb, and they all held hands.",
 "verse": "He will feed his flock like a shepherd. He will gather the lambs in his arm, and carry them in his bosom.",
 "ref": "Isaiah 40:11",
 "translation": "WEB",
 "prayer": "Dear Jesus… thank You for carrying me. Help me care for others. Amen.",
 "goodnight": "Goodnight, little light. Sleep tight. Nineteen more nights to go. 🌙",
 "questions": "What happened to the tired little lamb?\nWho is our gentle shepherd?\nWho could you help or share with tomorrow?",
 "word": "bosom",
 "word_meaning": "close to his heart",
 "timings": "media/audio/the-gentle-shepherd-timings.json",
 "timings_file": "the-gentle-shepherd-timings.json",
 "timings_info": "81 sentences, 453 words",
 "image": "media/audio/the-gentle-shepherd-cover.jpg",
 "image_width": 1200,
 "image_height": 630,
 "image_file": "cover-1200x630-scene.jpg",
 "printables": [
  {
   "title": "Colouring page",
   "file": "media/printables/the-gentle-shepherd-colouring-page.6d5e43f9.pdf"
  },
  {
   "title": "Memory verse and question cards",
   "file": "media/printables/the-gentle-shepherd-verse-and-question-cards.ce4eea4b.pdf"
  }
 ],
 "publish_date": "2026-12-05"
}$json$::jsonb,
  'https://littlesaltandlight.com/media/audio/the-gentle-shepherd.42c4e56a.mp3',
  (select author_email from public.posts where id = 38)
where not exists (select 1 from public.posts where slug = 'the-gentle-shepherd-bedtime-story')
returning id, slug, status, publish_at;
insert into public.posts (type, status, publish_at, title, slug, show_on_today, fields, media_url, author_email)
select 'story', 'scheduled', '2026-12-06T19:00:00+08:00', 'A Prayer Heard', 'a-prayer-heard-bedtime-story', false,
  $json${
 "series": "24 Nights to Bethlehem",
 "episode": 6,
 "narrator": "Mr. Ginting",
 "desc": "A calm Advent bedtime Bible story about Zechariah's prayer being heard, Luke 1:13, and a God who is always listening, with a lullaby and a short prayer.",
 "seo_title": "A Prayer Heard | 24 Nights to Bethlehem #6",
 "file": "a-prayer-heard.bfea9168.mp3",
 "seconds": 252.2,
 "minutes": "4:12",
 "story": "Hi, little light… It's Advent story time. Are you tucked in? Let's wiggle your toes… and let them rest. Tonight is night six of twenty-four nights to Bethlehem. Have you ever waited and waited for something? Waiting can feel so, so long, can't it? Tonight's story is about a long wait, and a prayer God heard. It's called… A Prayer Heard.\n\nEma snuggled under her quilt, and Mummy and Papa sat close beside her. \"Door number six,\" said Papa. Ema opened it… and inside was one smooth, brown bean seed. \"Let's plant it,\" said Papa. So they filled a little pot with soil, pushed the bean in, and set it on the windowsill. Ema gave it a drink from her tiny watering can. Drip… drip… drip. Can you hold up six fingers, little one? One whole hand, and one more. \"When will it grow?\" asked Ema. \"We'll have to wait,\" said Papa. \"Close your eyes, Ema… and imagine…\"\n\nEma closed her eyes… and now she was standing in a big, quiet temple, long, long ago. Golden lamps glowed, and sweet-smelling smoke curled up softly. An old man named Zechariah was there, praying to God. He and his wife, Elizabeth, had prayed for a baby for years and years and years. But no baby came. They waited… and waited. Ema stood very still and watched. She didn't say a word. Can you fold your hands, like Zechariah praying? Just like that.\n\nThen, all of a sudden, the room grew bright. An angel stood beside Zechariah, shining and kind. Zechariah was surprised! But the angel spoke gently. The Bible says: \"Don't be afraid, Zacharias, because your request has been heard. Your wife, Elizabeth, will bear you a son, and you shall call his name John.\" A request is when you ask for something. God had heard every single prayer. And now… a baby boy was coming!\n\nEma opened her eyes. \"Papa, did God hear them all along?\" \"All along,\" said Papa. \"Every prayer. Sometimes we wait a long time, but God is always listening. And baby John would grow up to get everyone ready for Jesus.\" \"Christmas is coming!\" said Mummy. \"Tomorrow, let's draw a prayer and put it in our prayer jar.\" \"And I'll water my bean!\" said Ema. What about you, little one? What would you like to tell God tonight? God hears you.\n\nYou know, little one… God hears every prayer, big or small, even whispered ones. Like Ema's bean, hiding under the soil, God is doing good things even when we can't see them yet. Ema peeked at her little pot on the windowsill. Then they all held hands.",
 "verse": "Don't be afraid, Zacharias, because your request has been heard. Your wife, Elizabeth, will bear you a son, and you shall call his name John.",
 "ref": "Luke 1:13",
 "translation": "WEB",
 "prayer": "Dear Jesus… thank You that You always hear me. Help me wait and trust You. Amen.",
 "goodnight": "Goodnight, little light. Sleep tight. Eighteen more nights to go. 🌙",
 "questions": "What did Ema plant on her windowsill?\nWhat did Zechariah and Elizabeth pray for?\nWhat would you like to tell God tonight?",
 "word": "request",
 "word_meaning": "when you ask for something (and \"bear you a son\" means have a baby boy)",
 "timings": "media/audio/a-prayer-heard-timings.json",
 "timings_file": "a-prayer-heard-timings.json",
 "timings_info": "77 sentences, 469 words",
 "image": "media/audio/a-prayer-heard-cover.jpg",
 "image_width": 1200,
 "image_height": 630,
 "image_file": "cover-1200x630-scene.jpg",
 "printables": [
  {
   "title": "Colouring page",
   "file": "media/printables/a-prayer-heard-colouring-page.82e25969.pdf"
  },
  {
   "title": "Memory verse and question cards",
   "file": "media/printables/a-prayer-heard-verse-and-question-cards.85f46082.pdf"
  }
 ],
 "publish_date": "2026-12-06"
}$json$::jsonb,
  'https://littlesaltandlight.com/media/audio/a-prayer-heard.bfea9168.mp3',
  (select author_email from public.posts where id = 38)
where not exists (select 1 from public.posts where slug = 'a-prayer-heard-bedtime-story')
returning id, slug, status, publish_at;
-- Check: select id, slug, status, publish_at, fields->>'minutes', fields->>'episode', jsonb_array_length(fields->'printables') from public.posts where slug in ('a-great-light-bedtime-story', 'the-gentle-shepherd-bedtime-story', 'a-prayer-heard-bedtime-story') order by publish_at;
