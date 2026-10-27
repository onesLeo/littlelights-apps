// All site content lives here for now. Each entry is one post.
// Later this moves to one Markdown file per post (see docs/roadmap.md).
// Bible text: World English Bible (WEB), public domain.
// Built-in reel videos live in Cloudflare R2 (bucket littlesaltandlight-media), served from this
// address with versioned file names (see docs/media-r2.md). Posters and thumbnails stay in media/reels/.
var MEDIA_BASE = 'https://media.littlesaltandlight.com/';
window.LL_CONTENT = {
  // Built-in items have no post date; they sort as this fixed date (older than any Studio post).
  builtinDate: '2026-01-01',
  devotions: [
    {
      slug: 'brave',
      title: 'You don’t have to feel brave to be brave',
      kicker: 'Courage · 3 min read',
      color: '#ee8fb2', ink: '#3a1426', episode: 0,
      teaser: 'David wasn’t calm in the valley. God was with him. That was enough.',
      html:
        '<p>When David walked into the valley of Elah, the Bible doesn’t tell us he felt calm. It tells us who he trusted.</p>' +
        '<blockquote>“Yahweh who delivered me out of the paw of the lion, and out of the paw of the bear, he will deliver me out of the hand of this Philistine.”<br><span class="meta">1 Samuel 17:37 · WEB</span></blockquote>' +
        '<p>Courage in the Bible is rarely a feeling. It is remembering what God has already done, and taking the next step because he is with you.</p>' +
        '<p>Maybe your giant this week is a hard conversation, a doctor’s appointment, or just a tired Monday. You don’t have to wait until the fear leaves. Remember one time God was faithful to you. Say it out loud. Then take one small step.</p>' +
        '<p><b>For families tonight:</b> ask your child to name one time God helped them. Write it on a small stone or a card. The next time they feel afraid, read it back together.</p>' +
        '<div class="pray">Lord, I don’t always feel brave. Thank you that you are with me wherever I go. Help me take the next step today. Amen.</div>'
    },
    {
      slug: 'heart',
      title: 'God sees the heart',
      kicker: 'Faithful Heart · 2 min read',
      color: '#f6c9d8', ink: '#3a1426', episode: 1,
      teaser: 'David was the youngest, out with the sheep. God saw him first.',
      html:
        '<p>When Samuel came to Jesse’s house, seven brothers walked past him. Each one looked like a king. None of them was chosen.</p>' +
        '<blockquote>“For man looks at the outward appearance, but Yahweh looks at the heart.”<br><span class="meta">1 Samuel 16:7 · WEB</span></blockquote>' +
        '<p>David wasn’t even invited. He was out doing small, faithful work that nobody noticed. God noticed.</p>' +
        '<p><b>For families tonight:</b> name one small, kind thing someone in your family did this week that nobody thanked them for. Thank them now.</p>' +
        '<div class="pray">Lord, thank you that you see what others miss. Help me be faithful in small things. Amen.</div>'
    },
    {
      slug: 'keep-building',
      title: 'Keep building',
      kicker: 'Trust · 2 min read',
      color: '#fde0e9', ink: '#3a1426', episode: 2,
      teaser: 'Noah trusted God before he could see the rain.',
      html:
        '<p>Noah built the ark for a long time before a single raindrop fell. Every day he chose to keep going.</p>' +
        '<blockquote>“Thus Noah did. According to all that God commanded him, so he did.”<br><span class="meta">Genesis 6:22 · WEB</span></blockquote>' +
        '<p>Trust is often quiet and slow. It looks like doing today’s part and leaving tomorrow with God.</p>' +
        '<p><b>For families tonight:</b> what is one thing you are waiting for? Pray about it together, then name one small step for this week.</p>' +
        '<div class="pray">Lord, help me keep building even when I can’t see the end yet. Amen.</div>'
    }
  ],

  // `src` is empty until real recordings exist; the player then runs in demo mode.
  episodes: [
    { title: 'You don’t have to feel brave to be brave', meta: 'Devotion', dur: 190, color: '#ee8fb2', devotion: 0, src: '' },
    { title: 'God sees the heart', meta: 'Devotion', dur: 160, color: '#f6c9d8', devotion: 1, src: '' },
    { title: 'Keep building', meta: 'Devotion', dur: 175, color: '#fde0e9', devotion: 2, src: '' },
    { title: 'Bedtime prayer: stay close tonight', meta: 'Prayer for families', dur: 90, color: '#a07fd6', src: '' },
    { title: 'Story time: David and Jonathan', meta: 'Bible story for kids', dur: 380, color: '#e46a4c', src: '' },
    // Built-in copy of the Psalm 56:3 devotion. Its Studio post carries fields.builtin
    // 'audio:when-i-am-afraid-psalm-56-3', so once published it replaces this entry (no duplicate).
    { title: 'When I Am Afraid — Psalm 56:3', meta: 'Devotion', dur: 115, color: '#a07fd6', src: 'media/devotion-psalm-56-3.mp3',
      verse: 'When I am afraid, I will put my trust in you.', ref: 'Psalm 56:3',
      transcript: "Today's verse, Psalm 56:3. When I am afraid, I will put my trust in you. Sometimes in life we face our own Goliath. It might be a problem so big that we wonder if we could ever bring it down. We feel afraid, and our strength seems to slip away. But today's verse reminds us of something David learned. Even in the middle of his fear, he kept moving forward, because he knew that God was with him and would protect him. Being afraid doesn't mean we've lost. It's the moment we choose to trust God. Let us pray. Dear Jesus, you know the challenges I'm facing today, in my marriage, my work, my income, my parenting or my relationships. Even when I'm afraid, I choose to put all my trust in you. Please help me face and overcome these challenges with the strength that comes from you. I believe that with you I will come through victorious and blessed. In Jesus' name I pray. Amen." }
  ],

  // Bedtime Bible Stories: one page each at /listen/<slug> (written by scripts/prerender.mjs, opened by
  // js/app.js). Wording comes from littlelights-growth content/2026-11-content-plan.md; do not edit it here
  // without updating the plan. Jonah 2:2 is WEB (with "Yahweh" explained), per plan commit 7ca1d09.
  // AUDIO: v3 narration on R2 (docs/media-r2.md, "Bedtime story audio"). A new recording gets a new
  // audio/<name>.<sha8>.mp3 key; set `src`, `dur` (seconds) and the timings file together, then bump VERSION in sw.js.
  bedtimeStories: [
    {
      slug: 'jonah-and-the-whale-bedtime-story',
      series: 'Bedtime Bible Stories for Kids', episode: 1,
      title: 'Jonah and the Whale',
      seoTitle: 'Jonah and the Whale | Bedtime Bible Story for Kids #1',
      desc: 'A gentle bedtime Bible story about Jonah and the great fish, with soft sea sounds, a lullaby and a short prayer.',
      narrator: 'Mr. Ginting',
      // ?v=2: a fresh URL, because browsers that asked before the R2 upload cached its 404 for a year (27 Oct 2026).
      // v3 (27 Oct 2026): Eleven v4 narration with gentle sound effects and The Moon's Lullaby, mixed to -20 LUFS.
      // Source and mix settings: littlelights-growth content/bedtime/01-jonah (tools/mix_bedtime.py).
      src: MEDIA_BASE + 'audio/jonah-and-the-whale.2f761925.mp3?v=2', placeholder: false, dur: 238.34,
      // Read-along timings: [{text,start,end,words:[{text,start,end}]}] in seconds, one entry per spoken sentence.
      // v3: ElevenLabs Scribe word alignment of each narration section, shifted to its place in the mix.
      timings: 'media/audio/jonah-and-the-whale-timings.json',
      color: '#a07fd6', ink: '#1d1233',
      // Narration v3, split into paragraphs (one per narration section). The word in `word` is highlighted in the text.
      story: [
        "Hi, little light… It’s bedtime story time. Are you all cozy? Let’s make a little nest with your blanket… there we go. Tonight’s story is about a man who ran away… and a God who never stopped loving him. It’s called… Jonah and the Great Fish.",
        "A long time ago, there was a man named Jonah. One day, God spoke to him. “Jonah,” God said, “go to the big city of Nineveh, and tell the people to turn back to Me.” But Jonah didn’t want to go. So he did something very silly… he went the other way. He walked all the way down to the sea, found a boat that was sailing far, far away, and climbed on board. Then Jonah went down to the bottom of the boat… and fell fast asleep.",
        "Out on the sea, the wind began to blow. Whoosh… whoosh… The waves rocked the boat up… and down… up… and down. The sailors were worried, so they woke Jonah up. And Jonah said, “This storm is because of me. I ran away from God.” So the sailors lifted Jonah into the sea… and right away, the wind stopped. The waves grew calm and still. And Jonah? Well… God had a plan. A great big fish swam up, opened its great big mouth… and gulp! Jonah was safe inside.",
        "Inside the fish, it was dark… and quiet… and a little bit squishy. Jonah stayed there for three days and three nights. But Jonah wasn’t alone. God was with him, even there. So Jonah did the very best thing he could do… he prayed. Later, Jonah said, “I called because of my affliction to Yahweh. He answered me.” Affliction means… big trouble. And Yahweh is God’s special name. When Jonah was in big trouble, he talked to God. And God heard every word.",
        "Then God spoke to the fish… and the fish swam all the way to the shore, and… bloop! Out came Jonah, onto the warm, dry sand. Jonah was safe! And God gave Jonah a second chance. “Jonah,” God said again, “go to Nineveh.” And this time… Jonah said yes. He went to the big city and told the people about God, and they were sorry for the wrong things they had done. And God, who is so kind, forgave them all.",
        "You know, little one… wherever you are, you can always talk to God. In the dark, in a storm, even in the middle of the sea… He hears you. And when we get things wrong, God is kind. He gives us another chance, just like He did for Jonah."
      ],
      prayer: "Dear Jesus… thank You that You always hear me. When I’m scared, help me talk to You. And when I make mistakes, thank You for giving me another chance. Amen.",
      goodnight: 'Goodnight, little light. Sleep tight. \u{1F319}',
      verse: { text: 'I called because of my affliction to Yahweh. He answered me.', ref: 'Jonah 2:2', version: 'WEB' },
      word: { word: 'affliction', meaning: 'Affliction means big trouble, and Yahweh is God\u2019s special name.' },
      // From the plan's post 2 (Wed 4 Nov), "Try them with our Jonah bedtime story".
      questions: ['Who trusted God?', 'How did God help?', 'How can we be like that tomorrow?'],
      // SHARE IMAGE (og:image, twitter:image, JSON-LD image): the one place to set this story's cover.
      // Final cover, 1200x630 JPEG (whole badge visible). To change it: replace the file (or point `image`
      // at a new one) and keep imageWidth/imageHeight equal to its real size.
      // Empty `image` = the site's default share image.
      image: 'media/audio/jonah-and-the-whale-cover.jpg', imageWidth: 1200, imageHeight: 630,
      next: { title: 'Elijah and the Still Small Voice', when: 'Mon 9 Nov', href: '/listen' }
    }
  ],

  // `src` is empty until real videos exist; the reel then shows an animated placeholder.
  // `hidden: true` = hidden by default (Oct 2026: only The Broken Crayon, First Day Jitters, The Last Straw and The Whisper show); Studio > Built-in content can show them again.
  reels: [
    // Built-in uploaded-video reels, videos on MEDIA_BASE (R2), posters in media/reels/. Newest first, so it leads Watch.
    { title: 'The Broken Crayon', topic: 'When I need to say sorry', len: '0:41', bg: '#1f2a44', kind: 'sea',
      src: MEDIA_BASE + 'reels/the-broken-crayon.4e507a9c.mp4', poster: 'media/reels/the-broken-crayon-poster.jpg', thumb: 'media/reels/the-broken-crayon-thumb', date: '2026-10-24T19:00:00+08:00',
      // Read button links this devotion; it only shows once the post is live (see renderReelStory).
      read: 'the-bravest-word',
      // Caption page: warm wooden-desk tan, the poster's dominant colour (auto-contrast picks text/accent).
      pageStyle: 'auto', pageColor: '#bc8566',
      // Blank lines (\n\n) become separate paragraphs in the caption sheet.
      caption: "Ema broke Lily's favourite crayon. A little voice told her she didn't need to say sorry, but Jesus helped her be brave. Watch what happens when we choose kindness.\n\n\"Be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ's sake hath forgiven you.\" Ephesians 4:32 (KJV)" },
    { title: 'First Day Jitters', topic: 'When I\u2019m nervous', len: '0:39', bg: '#1f2a44', kind: 'sea',
      src: MEDIA_BASE + 'reels/first-day-jitters.95d14109.mp4', poster: 'media/reels/first-day-jitters-poster.jpg', thumb: 'media/reels/first-day-jitters-thumb', date: '2026-10-19T19:00:00+08:00',
      // Caption page: golden-hour amber from the poster's sunrise over the school gate (auto-contrast picks text/accent).
      pageStyle: 'auto', pageColor: '#c27d4a',
      // Blank lines (\n\n) become separate paragraphs in the caption sheet.
      caption: "First days can feel scary, for kids and grown-ups too. 💛 Mia was nervous about her new school, so she and Hana prayed together, and Mia asked Jesus for strength. God helped her be brave enough to say hello and make a new friend.\n\n\"What time I am afraid, I will trust in thee.\" Psalm 56:3 (KJV)\n\nWill you pray with your little one before their next big day?" },
    { title: 'The Last Straw', topic: 'When I feel angry', len: '0:28', bg: '#1f2a44', kind: 'rain',
      src: MEDIA_BASE + 'reels/the-last-straw.6b7c5300.mp4', poster: 'media/reels/the-last-straw-poster.jpg', thumb: 'media/reels/the-last-straw-thumb', date: '2026-10-18T21:00:00+08:00',
      // Caption page: rainy-night slate blue from the poster's sky (auto-contrast picks text/accent).
      pageStyle: 'auto', pageColor: '#3e5a7e',
      caption: "Ever had one of those days where everything goes wrong, one thing after another? It's okay to feel frustrated. God isn't surprised by it. But He invites us not to let anger take over. 'Be ye angry, and sin not.' (Ephesians 4:26, KJV). Tonight, take a breath, talk to Jesus, and let Him calm your heart. 💛" },
    { title: 'The Whisper', topic: 'Choosing God when you\u2019re tired', len: '0:20', bg: '#1f2a44', kind: 'sea',
      src: MEDIA_BASE + 'reels/the-whisper.d5d7e0a3.mp4', poster: 'media/reels/the-whisper-poster.jpg', thumb: 'media/reels/the-whisper-thumb', date: '2026-10-18T12:00:00+08:00',
      // Caption page: warm amber from the poster's lamp-lit tones (auto-contrast picks text/accent).
      pageStyle: 'auto', pageColor: '#b8743e',
      caption: "Tired at the end of the day? That little voice telling you to skip time with God can sound so reasonable. But you don't have to listen. 'Resist the devil, and he will flee from you.' (James 4:7, KJV). Tonight, open the Book, even for just one verse. 💛" },
    { hidden: true, title: 'Why Jonathan gave David his robe', len: '0:48', bg: '#e46a4c', kind: 'robe', src: '', pageStyle: 'auto', pageColor: '#c8742e',
      caption: 'Jonathan was the king’s son. He gave David his own robe, sword and belt as a promise of friendship (1 Samuel 18:1–4). Real friends make room for each other.' },
    { hidden: true, title: 'Noah kept building', len: '0:58', bg: '#3d7fc4', kind: 'rain', src: '', pageStyle: 'auto', pageColor: '',
      caption: 'Before the rain, there was a lot of quiet work. Noah trusted God and kept building. Genesis 6:22.' },
    { hidden: true, title: 'Jonah and the second chance', len: '0:52', bg: '#1f3a6e', kind: 'sea', src: '', pageStyle: 'auto', pageColor: '',
      caption: 'Jonah ran the other way. God gave him another chance, and showed mercy to Nineveh too. Jonah 4:2.' }
  ],

  // Topics are phrased the way a parent searches when they need help.
  topics: ['All', 'When I’m afraid', 'Trust', 'Friendship', 'Mercy', 'God sees me', 'Light'],
  verses: [
    { text: 'Be strong and courageous. Don’t be afraid. Don’t be dismayed, for Yahweh your God is with you wherever you go.', ref: 'Joshua 1:9', topics: ['When I’m afraid'] },
    { text: 'When I am afraid, I will put my trust in you.', ref: 'Psalm 56:3', topics: ['When I’m afraid', 'Trust'] },
    { text: 'A friend loves at all times; and a brother is born for adversity.', ref: 'Proverbs 17:17', topics: ['Friendship'] },
    { text: 'Man looks at the outward appearance, but Yahweh looks at the heart.', ref: '1 Samuel 16:7', topics: ['God sees me'] },
    { text: 'Your word is a lamp to my feet, and a light for my path.', ref: 'Psalm 119:105', topics: ['Light'] },
    { text: 'I set my rainbow in the cloud, and it will be a sign of a covenant between me and the earth.', ref: 'Genesis 9:13', topics: ['Trust'] },
    { text: 'You are a gracious God and merciful, slow to anger, and abundant in loving kindness.', ref: 'Jonah 4:2', topics: ['Mercy'] },
    { text: 'You are the light of the world. A city located on a hill can’t be hidden.', ref: 'Matthew 5:14', topics: ['Light'] },
    { text: 'Don’t you be afraid, for I am with you. Don’t be dismayed, for I am your God.', ref: 'Isaiah 41:10', topics: ['When I’m afraid'] }
  ],

  journeys: [
    { n: 1, name: 'David’s Valley', virtue: 'Courage', color: '#f7c23f', status: 'In closed test' },
    { n: 2, name: 'The King’s Camp', virtue: 'Friendship', color: '#ee8fb2', status: 'In closed test' },
    { n: 3, name: 'The Beginning', virtue: 'Faithful Heart', color: '#69ba7e', status: 'In closed test' },
    { n: 4, name: 'Noah’s Ark', virtue: 'Trust', color: '#62a6ea', status: 'In closed test' },
    { n: 5, name: 'Jonah and the Great Fish', virtue: 'Mercy', color: '#a07fd6', status: 'In closed test' }
  ],

  // Set this when the Godot browser build is published.
  gamePreviewUrl: ''
};
