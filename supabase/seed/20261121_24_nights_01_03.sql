-- 24 Nights to Bethlehem, Nights 1–3 audio bedtime stories, scheduled for 7:00 PM WITA
-- on Tue 1 Dec, Wed 2 Dec and Thu 3 Dec 2026 (2026-12-01T19:00:00+08:00 and the two days after).
-- DRAFT: not run. Run it only after this PR is merged and live (the posts point at files this PR
-- adds under media/audio/ and media/printables/). It changes no existing post, table or setting.
-- Visitors can't see a night before its publish_at; until then it shows only in the Studio, where
-- it can be edited or deleted. Each insert is skipped if a post with that slug already exists.
-- Story, verse, prayer, goodnight, questions and word-to-know are copied word for word from
-- each night's script.md and episode.json. desc and seo_title have no source in those files
-- and are proposed for Taman's approval.
insert into public.posts (type, status, publish_at, title, slug, show_on_today, fields, media_url, author_email)
select 'story', 'scheduled', '2026-12-01T19:00:00+08:00', 'A Promise of a Baby', 'a-promise-of-a-baby-bedtime-story', false,
  $json${
 "series": "24 Nights to Bethlehem",
 "episode": 1,
 "narrator": "Mr. Ginting",
 "desc": "A calm Advent bedtime Bible story about God's promise of a baby, Isaiah 9:6, and Jesus the Prince of Peace, with a lullaby and a short prayer.",
 "seo_title": "A Promise of a Baby | 24 Nights to Bethlehem #1",
 "file": "a-promise-of-a-baby.d06f122a.mp3",
 "seconds": 272.8,
 "minutes": "4:33",
 "story": "Hi, little light… It's Advent story time. Are you all snuggled in? Let's pull the blanket up, nice and cosy… there we go. Tonight is night one of twenty-four nights to Bethlehem. Twenty-four nights until Christmas! Have you ever waited for a promise? Tonight's story is about the very first promise… a promise from God. It's called… A Promise of a Baby.\n\nEma climbed into bed and wriggled under her quilt. Her pink glasses sat folded on the little table, right next to a new Advent calendar with twenty-four tiny doors. Then Mummy and Papa came in and sat close beside her. \"Can we open door number one?\" Ema whispered. Mummy nodded. Ema opened the tiny door… and inside was a little paper star. Can you hold up one finger with me, little one? One. One door. One star. \"Before we pray,\" said Mummy, \"let me tell you a story from the Bible. It starts with a promise.\" \"Like when Papa promises pancakes?\" asked Ema. Papa laughed softly. \"Even better,\" he said. \"Close your eyes, Ema… and imagine…\"\n\nEma closed her eyes. The bedroom faded away… and now she was standing in a quiet room, long, long ago. The air felt warm. A small oil lamp flickered on a table. A man sat there, writing very carefully on a long roll of paper called a scroll. His name was Isaiah. God gave Isaiah messages to write down, so God's people would remember them. Ema stood very still and watched. She didn't say a word. Scratch… scratch… went his pen. Can you make a tiny scratch, scratch sound with your finger on the blanket? Just like that.\n\nAnd this is the message God gave. The Bible says: \"For a child is born to us. A son is given to us; and the government will be on his shoulders. His name will be called Wonderful Counselor, Mighty God, Everlasting Father, Prince of Peace.\" Ema watched the lamplight glow across the scroll, warm and golden. A child… a son… a promise from God.\n\nEma opened her eyes. She was back in her bed, and Mummy and Papa were right beside her. \"Mummy, who was the child?\" \"It's Jesus,\" said Mummy. \"God's people waited a long, long time. But God always keeps His promises.\" \"Government just means being in charge,\" said Papa, \"like a kind, good king. And look at all His names. Wonderful Counselor means He gives the very best help. Prince of Peace means He brings peace to our hearts.\" Ema yawned. \"I like Prince of Peace.\" Which name do you like best, little one? That's a lovely one.\n\nYou know, little one… God made a promise, and God kept it. Jesus came, just like God said. Tomorrow, maybe you can draw a big star, and write \"Christmas is coming\" on it, and put it in your window. One star for night one. Ema snuggled down, and they all folded their hands.",
 "verse": "For a child is born to us. A son is given to us; and the government will be on his shoulders. His name will be called Wonderful Counselor, Mighty God, Everlasting Father, Prince of Peace.",
 "ref": "Isaiah 9:6",
 "translation": "WEB",
 "prayer": "Dear Jesus… thank You for coming, just as God promised. Help us get ready for Your birthday. Amen.",
 "goodnight": "Goodnight, little light. Sleep tight. Only twenty-three more nights to go. 🌙",
 "questions": "What did God promise?\nWho was the child in the promise?\nWhich of Jesus' names do you like best?",
 "word": "government",
 "word_meaning": "being in charge, like a kind, good king",
 "timings": "media/audio/a-promise-of-a-baby-timings.json",
 "timings_file": "a-promise-of-a-baby-timings.json",
 "timings_info": "83 sentences, 521 words",
 "image": "media/audio/a-promise-of-a-baby-cover.jpg",
 "image_width": 1200,
 "image_height": 630,
 "image_file": "cover-1200x630-scene.jpg",
 "printables": [
  {
   "title": "Colouring page",
   "file": "media/printables/a-promise-of-a-baby-colouring-page.1e6b8577.pdf"
  },
  {
   "title": "Memory verse and question cards",
   "file": "media/printables/a-promise-of-a-baby-verse-and-question-cards.5bcf3b39.pdf"
  }
 ],
 "publish_date": "2026-12-01"
}$json$::jsonb,
  'https://littlesaltandlight.com/media/audio/a-promise-of-a-baby.d06f122a.mp3',
  (select author_email from public.posts where id = 38)
where not exists (select 1 from public.posts where slug = 'a-promise-of-a-baby-bedtime-story')
returning id, slug, status, publish_at;
insert into public.posts (type, status, publish_at, title, slug, show_on_today, fields, media_url, author_email)
select 'story', 'scheduled', '2026-12-02T19:00:00+08:00', 'God With Us', 'god-with-us-bedtime-story', false,
  $json${
 "series": "24 Nights to Bethlehem",
 "episode": 2,
 "narrator": "Mr. Ginting",
 "desc": "A calm Advent bedtime Bible story about the name Immanuel, which means God with us, Isaiah 7:14, with a lullaby and a short prayer.",
 "seo_title": "God With Us | 24 Nights to Bethlehem #2",
 "file": "god-with-us.a84bca85.mp3",
 "seconds": 253.1,
 "minutes": "4:13",
 "story": "Hi, little light… It's Advent story time again. Are you cosy? Let's fluff the pillow… and tuck in your toes. Tonight is night two of twenty-four nights to Bethlehem. Do you know what your name means? Some names have a special meaning. Tonight we'll hear about a name God chose… a name that means something wonderful. It's called… God With Us.\n\nEma snuggled under her quilt. Last night's paper star was already stuck on her window, and the street lamp outside made it shine. Mummy and Papa sat close beside her. \"Let's open door number two,\" said Papa. Ema found the tiny door with a two on it… and inside was a little paper heart. Can you hold up two fingers, little one? One… two. Two doors. A star and a heart. \"Papa, what's tonight's story?\" asked Ema. \"It's about a name,\" said Papa. \"A very special name.\" \"Close your eyes, Ema… and imagine…\"\n\nEma closed her eyes… and now she was far away, long, long ago. The night was quiet and cool. Through a window, she could see the sky, full of tiny, twinkling stars. And there by the window stood Isaiah, the man from last night. God had given him another message. Ema stood very still beside the window and listened. She didn't say a word. Shall we count some stars with her? One… two… three… so many stars. God made every single one. And God was about to tell Isaiah something even more wonderful… a very special baby was coming, and God even told Isaiah his name.\n\nThe Bible says: \"Therefore the Lord himself will give you a sign… and shall call his name Immanuel.\" Immanuel. It's a big word, isn't it? Can you whisper it with me? Im… man… u… el. Immanuel means… God with us. A sign is like a clue God gives, so His people would know it was really Him.\n\nEma opened her eyes. Papa was smiling at her. \"Papa, who is Immanuel?\" \"It's Jesus,\" said Papa. \"When Jesus came as a baby, God came to be with us. Close. Right here.\" \"Is God with me at school?\" asked Ema. \"Yes,\" said Mummy. \"And when you play, and when you sleep, and when you wake up in the morning.\" Where else is God with you, little one? At the park? At Oma's house? In your bed right now? Yes. Everywhere. God is with us.\n\nYou know, little one… you are never alone. Not in the day, and not in the night. Jesus is Immanuel… God with us. Tomorrow, when you wake up, you can whisper, \"Good morning, Jesus. You're with me.\" Ema held Mummy's hand on one side, and Papa's hand on the other.",
 "verse": "Therefore the Lord himself will give you a sign… and shall call his name Immanuel.",
 "ref": "Isaiah 7:14",
 "translation": "WEB",
 "prayer": "Dear Jesus… thank You for always being with us. Thank You that I am never alone. Amen.",
 "goodnight": "Goodnight, little light. Sleep tight. Twenty-two more nights to go. 🌙",
 "questions": "What does Immanuel mean?\nWho is Immanuel?\nWhere is God with you?",
 "word": "Immanuel",
 "word_meaning": "God with us (Matthew 1:23)",
 "timings": "media/audio/god-with-us-timings.json",
 "timings_file": "god-with-us-timings.json",
 "timings_info": "91 sentences, 480 words",
 "image": "media/audio/god-with-us-cover.jpg",
 "image_width": 1200,
 "image_height": 630,
 "image_file": "cover-1200x630-scene.jpg",
 "printables": [
  {
   "title": "Colouring page",
   "file": "media/printables/god-with-us-colouring-page.7c4f384d.pdf"
  },
  {
   "title": "Memory verse and question cards",
   "file": "media/printables/god-with-us-verse-and-question-cards.1f23b95b.pdf"
  }
 ],
 "publish_date": "2026-12-02"
}$json$::jsonb,
  'https://littlesaltandlight.com/media/audio/god-with-us.a84bca85.mp3',
  (select author_email from public.posts where id = 38)
where not exists (select 1 from public.posts where slug = 'god-with-us-bedtime-story')
returning id, slug, status, publish_at;
insert into public.posts (type, status, publish_at, title, slug, show_on_today, fields, media_url, author_email)
select 'story', 'scheduled', '2026-12-03T19:00:00+08:00', 'Little Town, Big Plan', 'little-town-big-plan-bedtime-story', false,
  $json${
 "series": "24 Nights to Bethlehem",
 "episode": 3,
 "narrator": "Mr. Ginting",
 "desc": "A calm Advent bedtime Bible story about little Bethlehem and God's big plan, Micah 5:2, with a lullaby and a short prayer.",
 "seo_title": "Little Town, Big Plan | 24 Nights to Bethlehem #3",
 "file": "little-town-big-plan.b13ea9bd.mp3",
 "seconds": 253.1,
 "minutes": "4:13",
 "story": "Hi, little light… It's Advent story time. Are you tucked in? Let's wiggle down, nice and snug… there. Tonight is night three of twenty-four nights to Bethlehem. And tonight… the smallest town had the biggest secret. Do you like secrets? Good ones, I mean. This story is about a tiny town, and God's big plan. It's called… Little Town, Big Plan.\n\nEma snuggled under her quilt, and Mummy and Papa sat close beside her. On the window, the paper star and the paper heart glowed in the lamplight. \"Door number three,\" said Mummy. Ema opened it… and inside was a teeny, tiny paper house. \"It's so small!\" she giggled. Can you hold up three fingers, little one? One… two… three. Three doors. A star, a heart, and a little house. \"Small things can be very special,\" said Mummy. \"Let me show you.\" \"Close your eyes, Ema… and imagine…\"\n\nEma closed her eyes… and now she was standing on a quiet, grassy hill, long, long ago. A soft breeze blew. The sky was turning pink and gold. Beside her stood a man named Micah. God gave Micah messages for His people. Far below them was a little town, with little houses and little roofs. It was so small, you could almost hold it in your hand. That town was called Bethlehem. Ema stood very still and listened. She didn't say a word. Can you make your hands into a tiny little house? Just like that.\n\nAnd this is what God said about that little town. The Bible says: \"But you, Bethlehem Ephrathah, being small among the clans of Judah, out of you one will come out to me who is to be ruler in Israel.\" Clans means big families. And a ruler is like a king. So here was the secret… one day, a King would come from that tiny town. Not a big, busy city. Little Bethlehem.\n\nEma opened her eyes. \"Mummy, who was the King?\" \"It's Jesus,\" said Mummy. \"Many years later, Jesus was born in Bethlehem, just like God said. God doesn't need big places to do big things.\" \"Christmas is coming!\" said Papa. \"Let's each say three little things we're thankful for.\" Ema counted on her fingers. \"My blanket… my star light… and you!\" What about you, little one? Can you think of three little things you're thankful for? One… two… three. Wonderful.\n\nYou know, little one… you don't have to be big to matter to God. Little towns matter. Little things matter. And you matter, so much. Tomorrow, see if you can find three little things to say thank you for. They all held hands, and Ema closed her eyes.",
 "verse": "But you, Bethlehem Ephrathah, being small among the clans of Judah, out of you one will come out to me who is to be ruler in Israel.",
 "ref": "Micah 5:2",
 "translation": "WEB",
 "prayer": "Dear Jesus… thank You for little things, and little towns, and for coming to be our King. Amen.",
 "goodnight": "Goodnight, little light. Sleep tight. Twenty-one more nights to go. 🌙",
 "questions": "What was the name of the little town?\nWho was born in Bethlehem?\nWhat are three little things you're thankful for?",
 "word": "clans",
 "word_meaning": "big families (and a ruler is like a king)",
 "timings": "media/audio/little-town-big-plan-timings.json",
 "timings_file": "little-town-big-plan-timings.json",
 "timings_info": "84 sentences, 474 words",
 "image": "media/audio/little-town-big-plan-cover.jpg",
 "image_width": 1200,
 "image_height": 630,
 "image_file": "cover-1200x630-scene.jpg",
 "printables": [
  {
   "title": "Colouring page",
   "file": "media/printables/little-town-big-plan-colouring-page.ca0150eb.pdf"
  },
  {
   "title": "Memory verse and question cards",
   "file": "media/printables/little-town-big-plan-verse-and-question-cards.76bb59e8.pdf"
  }
 ],
 "publish_date": "2026-12-03"
}$json$::jsonb,
  'https://littlesaltandlight.com/media/audio/little-town-big-plan.b13ea9bd.mp3',
  (select author_email from public.posts where id = 38)
where not exists (select 1 from public.posts where slug = 'little-town-big-plan-bedtime-story')
returning id, slug, status, publish_at;
-- Check: select id, slug, status, publish_at, fields->>'minutes', fields->>'episode', jsonb_array_length(fields->'printables') from public.posts where slug in ('a-promise-of-a-baby-bedtime-story', 'god-with-us-bedtime-story', 'little-town-big-plan-bedtime-story') order by publish_at;
