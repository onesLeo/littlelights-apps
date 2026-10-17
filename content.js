// All site content lives here for now. Each entry is one post.
// Later this moves to one Markdown file per post (see docs/roadmap.md).
// Bible text: World English Bible (WEB), public domain.
window.LL_CONTENT = {
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
    { title: 'Story time: David and Jonathan', meta: 'Bible story for kids', dur: 380, color: '#e46a4c', src: '' }
  ],

  // `src` is empty until real videos exist; the reel then shows an animated placeholder.
  reels: [
    { title: 'Why Jonathan gave David his robe', len: '0:48', bg: '#e46a4c', kind: 'robe', src: '',
      caption: 'Jonathan was the king’s son. He gave David his own robe, sword and belt as a promise of friendship (1 Samuel 18:1–4). Real friends make room for each other.' },
    { title: 'Noah kept building', len: '0:58', bg: '#3d7fc4', kind: 'rain', src: '',
      caption: 'Before the rain, there was a lot of quiet work. Noah trusted God and kept building. Genesis 6:22.' },
    { title: 'Jonah and the second chance', len: '0:52', bg: '#1f3a6e', kind: 'sea', src: '',
      caption: 'Jonah ran the other way. God gave him another chance, and showed mercy to Nineveh too. Jonah 4:2.' }
  ],

  // Topics are phrased the way a parent searches when they need help.
  topics: ['All', 'When I’m afraid', 'Trust', 'Friendship', 'Mercy', 'God sees me', 'Light'],
  verses: [
    { text: 'Be strong and courageous. Don’t be afraid. Don’t be dismayed, for Yahweh your God is with you wherever you go.', ref: 'Joshua 1:9', topics: ['When I’m afraid'] },
    { text: 'When I am afraid, I will put my trust in you.', ref: 'Psalm 56:3', topics: ['When I’m afraid', 'Trust'] },
    { text: 'A friend loves at all times.', ref: 'Proverbs 17:17', topics: ['Friendship'] },
    { text: 'Man looks at the outward appearance, but Yahweh looks at the heart.', ref: '1 Samuel 16:7', topics: ['God sees me'] },
    { text: 'Your word is a lamp to my feet, and a light for my path.', ref: 'Psalm 119:105', topics: ['Light'] },
    { text: 'I set my rainbow in the cloud, and it will be a sign of a covenant between me and the earth.', ref: 'Genesis 9:13', topics: ['Trust'] },
    { text: 'You are a gracious God and merciful, slow to anger, and abundant in loving kindness.', ref: 'Jonah 4:2', topics: ['Mercy'] },
    { text: 'You are the light of the world. A city located on a hill can’t be hidden.', ref: 'Matthew 5:14', topics: ['Light'] },
    { text: 'Don’t you be afraid, for I am with you. Don’t be dismayed, for I am your God.', ref: 'Isaiah 41:10', topics: ['When I’m afraid'] }
  ],

  journeys: [
    { n: 1, name: 'David’s Valley', virtue: 'Courage', color: '#f7c23f', status: 'Free preview' },
    { n: 2, name: 'The King’s Camp', virtue: 'Friendship', color: '#ee8fb2', status: 'Ready' },
    { n: 3, name: 'The Beginning', virtue: 'Faithful Heart', color: '#69ba7e', status: '' },
    { n: 4, name: 'Noah’s Ark', virtue: 'Trust', color: '#62a6ea', status: 'Ready' },
    { n: 5, name: 'Jonah and the Great Fish', virtue: 'Mercy', color: '#a07fd6', status: '' }
  ],

  // Set this when the Godot browser build is published.
  gamePreviewUrl: ''
};
