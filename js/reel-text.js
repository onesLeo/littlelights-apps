// "About this video" box and series intros, in one place. Classic script, used twice (like js/seo.js):
//  - by the app (js/app.js): series sheet intro and the About box in the reel caption sheet, and
//  - by lib/head.mjs (via lib/reel-text.mjs) for the static HTML of /watch/<slug> and series pages.
(function (root) {
  'use strict';
  // CONTENT CREATION OWNS THIS TEXT. Copied word for word from Content Creation's DRAFT (Oct 2026),
  // awaiting Taman's approval; do not write, edit or "improve" it here. A missing or empty field is
  // left out; an entry with no text (or no entry) renders no box. Keys are the video's slug.
  var REEL_TEXT = {
  "first-day-jitters": {
    "summary": "Ema feels nervous on her first day at a new school, so she prays with Hana and finds the courage to make a new friend.",
    "verse": "\"What time I am afraid, I will trust in thee.\" Psalm 56:3 (KJV). \"What time\" means whenever, and \"thee\" means you.",
    "lesson": "When we feel nervous, we can talk to Jesus and trust Him to help us be brave.",
    "prayer": "Dear Jesus, when I feel afraid, help me trust you and give me a brave heart. Amen."
  },
  "the-whisper": {
    "summary": "At the end of a tired day, a little voice whispers to skip time with God, but we can choose to read just one verse with Jesus.",
    "verse": "\"Submit yourselves therefore to God. Resist the devil, and he will flee from you.\" James 4:7 (KJV). \"Resist\" means say no, and \"flee\" means run away.",
    "lesson": "Even when we're tired, we can say no to wrong whispers and yes to God.",
    "prayer": "Dear Jesus, help me choose you, even when I'm tired, and rest in your love tonight. Amen."
  },
  "the-last-straw": {
    "summary": "On a day when everything goes wrong, frustration builds up, but we can stop, breathe and talk to Jesus.",
    "verse": "\"Be ye angry, and sin not: let not the sun go down upon your wrath.\" Ephesians 4:26 (KJV). \"Wrath\" means strong anger.",
    "lesson": "Feeling angry is normal, but we don't have to let it take over, and it's good to make peace before bedtime.",
    "prayer": "Dear Jesus, please calm my heart and help me make peace before I sleep. Amen."
  },
  "the-broken-crayon": {
    "summary": "Ema breaks Lily's favourite crayon, and even though a little voice tempts her to stay quiet, she bravely says sorry.",
    "verse": "\"Be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ's sake hath forgiven you.\" Ephesians 4:32 (KJV). \"Tenderhearted\" means having a soft, caring heart.",
    "lesson": "Saying sorry helps make things right, and because God forgives us, we can forgive others.",
    "prayer": "Dear Jesus, when I make a mistake, help me be brave and say sorry. Amen."
  }
};

  // Intro at the top of each series page, keyed by the series' slug (/watch/series/<slug>; the bedtime
  // series is the "Goodnight Little Light" section on /listen). CONTENT CREATION OWNS THIS TEXT (DRAFT,
  // awaiting Taman's approval). An empty or missing intro renders nothing.
  var SERIES_INTRO = {
  "slice-of-life": "Little moments, big faith. These short stories follow Ema, Lily and Hana through everyday days: first days, hard feelings and saying sorry. Each one ends with a Bible verse and a prayer you can share as a family.",
  "goodnight-little-light": "Gentle bedtime stories to help little hearts settle down at the end of the day. Each story takes about five to seven minutes to listen to and ends with a Bible verse and a quiet prayer to Jesus. Snuggle up and enjoy."
};

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tx(v) { return String(v || '').trim(); }
  // "About this video" as a native <details>: the closed summary line shows the one-line summary and
  // the verse, opening it shows the lesson and prayer. '' when there is no text.
  function reelTextHtml(t) {
    if (!t) return '';
    var sum = tx(t.summary), verse = tx(t.verse), lesson = tx(t.lesson), prayer = tx(t.prayer);
    if (!sum && !verse && !lesson && !prayer) return '';
    var head = (sum ? '<span class="p-about-sum">' + esc(sum) + '</span>' : '') + (verse ? '<span class="p-about-verse">' + esc(verse) + '</span>' : '');
    var body = (lesson ? '<div class="p-about-lesson"><h3>Lesson</h3><p>' + esc(lesson) + '</p></div>' : '') + (prayer ? '<div class="p-about-prayer"><h3>Prayer</h3><p>' + esc(prayer) + '</p></div>' : '');
    return '<details class="p-about"><summary><span class="p-about-k">About this video</span>' + head + '</summary>' + (body ? '<div class="p-about-body">' + body + '</div>' : '') + '</details>';
  }
  // A series' intro as HTML; '' when it has none yet. On phones the text is clamped to two lines with
  // a More/Less button (js/app.js); the full text is always in the HTML.
  function seriesIntroHtml(slug) {
    var t = tx(Object.prototype.hasOwnProperty.call(SERIES_INTRO, slug) ? SERIES_INTRO[slug] : '');
    var id = 'pSintro-' + String(slug).replace(/[^a-z0-9-]/gi, '');
    return t ? '<div class="p-sintro-box"><p class="p-sintro" id="' + id + '">' + esc(t) + '</p><button type="button" class="p-sintro-more" aria-expanded="false" aria-controls="' + id + '">More</button></div>' : '';
  }
  function reelText(slug) { return Object.prototype.hasOwnProperty.call(REEL_TEXT, slug) ? REEL_TEXT[slug] : undefined; }

  root.LL_TEXT = { REEL_TEXT: REEL_TEXT, SERIES_INTRO: SERIES_INTRO, reelText: reelText, reelTextHtml: reelTextHtml, seriesIntroHtml: seriesIntroHtml };
})(typeof window !== 'undefined' ? window : globalThis);
