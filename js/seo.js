// Page addresses, titles and descriptions for every screen, in one place.
// Used twice, so the two always agree:
//  - by the app (js/app.js), which updates <title>, the description and the canonical link on every
//    screen change, and
//  - by scripts/prerender.mjs at build time, which writes a static <head> for each address, so
//    search engines and link previews (WhatsApp, iMessage, Facebook) see it without running JavaScript.
(function (root) {
  'use strict';
  var SITE = 'https://littlesaltandlight.com';
  var NAME = 'Salt and Light';
  var TAGLINE = 'Bible devotions, stories & audio for families';
  var IMAGE = SITE + '/icons/og-image.png';
  var PAGES = {
    today: { path: '/', title: NAME + ' — ' + TAGLINE,
      desc: 'Gentle encouragement for families: short Bible devotions, prayers to listen to, Bible story videos and a free Bible game for ages 5–8.' },
    watch: { path: '/watch', title: 'Watch: short Bible story videos for kids · ' + NAME,
      desc: 'Short, gentle Bible story videos for children and families, each with a verse and a question to talk about together.' },
    listen: { path: '/listen', title: 'Listen: Bible devotions and prayers to hear together · ' + NAME,
      desc: 'Audio Bible devotions and prayers for families. Press play at bedtime or in the car and listen together.' },
    read: { path: '/read', title: 'Read: short Bible devotions for families · ' + NAME,
      desc: 'Short Bible devotions for families, each with a verse, a question for tonight and a prayer. A few minutes to read together.' },
    verses: { path: '/verses', title: 'Verses: Bible verses for when you need them · ' + NAME,
      desc: 'Bible verses for families, grouped by what you need: when you are afraid, trust, friendship, mercy and light.' },
    play: { path: '/play', title: 'Play: Little Light, a free Bible game for ages 5–8 · ' + NAME,
      desc: 'Little Light: Bible Journeys is a free, gentle Bible game for ages 5–8. No ads, no purchases, every line read aloud. Coming to Android.' }
  };
  var TABS = ['today', 'watch', 'listen', 'read', 'verses', 'play'];

  // Same rules as LLStore.slugify (js/store.js), so addresses match the Studio's post slugs.
  function slugify(s) {
    return String(s || 'post').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'post';
  }
  // Plain text for a description: no tags, no emoji, one line, cut at a word near 155 characters.
  function clip(text, max) {
    max = max || 155;
    var t = String(text || '').replace(/<[^>]+>/g, ' ').replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    var cut = t.slice(0, max - 1), sp = cut.lastIndexOf(' ');
    return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, '') + '…';
  }
  function reelSlug(r) { return r.slug || slugify(r.title); }

  // What a path means: { tab, slug, series } or null when the app has no such screen.
  // '/today' is accepted as another name for '/'. Trailing slashes are ignored.
  function parse(path) {
    var p = String(path || '/').replace(/\/index\.html$/, '/').replace(/\/+$/, '') || '/';
    if (p === '/' || p === '/today') return { tab: 'today' };
    var m = /^\/(watch|listen|read|verses|play)(?:\/(.*))?$/.exec(p);
    if (!m) return null;
    var rest = m[2] ? m[2].split('/') : [];
    try { rest = rest.map(decodeURIComponent); } catch (e) { return null; }
    if (!rest.length) return { tab: m[1] };
    if (m[1] === 'read' && rest.length === 1) return { tab: 'read', slug: rest[0] };
    if (m[1] === 'watch' && rest.length === 1) return { tab: 'watch', slug: rest[0] };
    if (m[1] === 'listen' && rest.length === 1) return { tab: 'listen', slug: rest[0] };
    if (m[1] === 'watch' && rest.length === 2 && rest[0] === 'series') return { tab: 'watch', series: rest[1] };
    return null;
  }
  // The other way round: the address for a screen or item.
  function path(tab, item) {
    if (tab === 'read' && item) return '/read/' + item;
    if (tab === 'watch' && item) return '/watch/' + item;
    if (tab === 'listen' && item) return '/listen/' + item;
    if (tab === 'series' && item) return '/watch/series/' + item;
    return (PAGES[tab] || PAGES.today).path;
  }
  // Old #hash addresses (#watch, #read/brave) to the new paths; null when the hash isn't one.
  function fromHash(hash) {
    var h = String(hash || '').replace(/^#\/?/, '');
    if (!h) return null;
    var parts = h.split('/');
    if (TABS.indexOf(parts[0]) < 0) return null;
    if (parts[0] === 'read' && parts[1]) return '/read/' + parts[1];
    return path(parts[0]);
  }
  // Share image for a video: a Studio poster (a full storage URL on any host). Built-in reels (site paths,
  // portrait) and posts without a poster keep the 1200x630 site image.
  function posterImage(u) { u = String(u || ''); return /^https:\/\//i.test(u) ? u : ''; }
  // Head values for a screen. kind: 'page' | 'devotion' | 'reel' | 'series'.
  function meta(kind, x) {
    if (kind === 'devotion') return { path: path('read', x.slug), title: x.title + ' · ' + NAME, desc: clip(x.teaser || x.html || x.title), type: 'article' };
    if (kind === 'reel') return { path: path('watch', reelSlug(x)), title: x.title + ' · Watch · ' + NAME, desc: clip(x.caption || x.topic || PAGES.watch.desc), type: 'video.other', image: x.src ? posterImage(x.poster) : '' };
    if (kind === 'story') return { path: path('listen', x.slug), title: (x.seoTitle || x.title) + ' · ' + NAME, desc: clip(x.desc || x.title), type: 'article' };
    if (kind === 'series') return { path: path('series', slugify(x.series)), title: x.series + ' · Bible story series · ' + NAME, desc: clip(x.desc || PAGES.watch.desc), type: 'website' };
    var p = PAGES[x] || PAGES.today;
    return { path: p.path, title: p.title, desc: p.desc, type: 'website' };
  }
  // Body of a bedtime story page (/listen/<slug>), shared by the build (scripts/prerender.mjs, so the
  // text is in the HTML search engines receive) and the app (js/app.js). Plain <audio controls>: no
  // play counting or other tracking on this page.
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mark(text, w) {
    var t = esc(text);
    if (!w || !w.word) return t;
    return t.replace(new RegExp('\\b(' + w.word + ')\\b', 'i'), '<mark class="p-word">$1</mark>');
  }
  function storyHtml(x, h) {
    h = h || 'h1';
    var src = /^https?:/i.test(x.src || '') ? x.src : '/' + String(x.src || '').replace(/^\/+/, '');
    var mins = Math.floor((x.dur || 0) / 60), secs = Math.round((x.dur || 0) % 60);
    var qs = x.questions && x.questions.length === 3 ? x.questions : null;
    return '<a class="back" href="/listen" data-ep-back>← Listen</a>' +
      '<div class="hero" style="background:' + esc(x.color || '#a07fd6') + ';color:' + esc(x.ink || '#1d1233') + '">' +
        '<span class="p-kicker">' + esc(x.series) + (x.episode ? ' · #' + x.episode : '') + '</span>' +
        '<' + h + '>' + esc(x.title) + '</' + h + '>' +
        '<span class="p-ep-by">Bedtime Bible story' + (x.narrator ? ', read by ' + esc(x.narrator) : '') + ' · about ' + (mins ? mins + ' min ' : '') + (secs ? secs + ' s' : '') + '</span>' +
      '</div>' +
      '<div class="body p-txt p-sbody">' +
        '<div class="p-ep-player">' +
          '<audio controls preload="none" src="' + esc(src) + '">Your browser can\u2019t play this audio.</audio>' +
          (x.placeholder ? '<p class="p-ep-note" data-placeholder-audio>[PLACEHOLDER AUDIO: the narration is coming soon]</p>' : '') +
        '</div>' +
        '<h2>The story</h2>' + (x.story || []).map(function (p) { return '<p>' + mark(p, x.word) + '</p>'; }).join('') +
        '<h2>Bible verse</h2>' +
        '<blockquote class="p-ep-verse">\u201c' + mark(x.verse.text, x.word) + '\u201d<br><span class="meta">' + esc(x.verse.ref) + ' (' + esc(x.verse.version) + ')</span></blockquote>' +
        (x.word ? '<p class="p-ep-word"><span aria-hidden="true">\u{1F4A1} </span><b>Word to know:</b> ' + esc(x.word.meaning) + '</p>' : '') +
        '<h2>Let\u2019s pray</h2><div class="pray">' + esc(x.prayer) + '</div>' +
        (x.goodnight ? '<p class="p-ep-night">' + esc(x.goodnight) + '</p>' : '') +
        '<h2>3 questions to ask afterwards</h2>' +
        (qs ? '<ol class="p-ep-qs">' + qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>'
          : '<ol class="p-ep-qs" data-placeholder-questions><li>[PLACEHOLDER: question 1 not in the content plan yet]</li><li>[PLACEHOLDER: question 2 not in the content plan yet]</li><li>[PLACEHOLDER: question 3 not in the content plan yet]</li></ol>') +
        '<div class="p-ep-cards">' +
          (x.next ? '<a class="p-ep-card" href="' + esc(x.next.href || '/listen') + '"><span class="p-kicker">Next story' + (x.next.when ? ' · ' + esc(x.next.when) : '') + '</span><b>' + esc(x.next.title) + '</b><span>More bedtime stories on Listen \u2192</span></a>' : '') +
          '<a class="p-ep-card join" href="/join"><span class="p-kicker">Join the testers</span><b>Little Light is a free Bible adventure game for kids 5\u20138, coming to Android.</b><span>Join the test families \u2192</span></a>' +
        '</div>' +
      '</div>';
  }
  root.LL_SEO = { SITE: SITE, NAME: NAME, TAGLINE: TAGLINE, IMAGE: IMAGE, PAGES: PAGES, TABS: TABS, slugify: slugify, clip: clip, reelSlug: reelSlug, parse: parse, path: path, fromHash: fromHash, meta: meta, storyHtml: storyHtml };
})(typeof window !== 'undefined' ? window : globalThis);
