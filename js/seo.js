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
    if (m[1] === 'watch' && rest.length === 2 && rest[0] === 'series') return { tab: 'watch', series: rest[1] };
    return null;
  }
  // The other way round: the address for a screen or item.
  function path(tab, item) {
    if (tab === 'read' && item) return '/read/' + item;
    if (tab === 'watch' && item) return '/watch/' + item;
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
  // Head values for a screen. kind: 'page' | 'devotion' | 'reel' | 'series'.
  function meta(kind, x) {
    if (kind === 'devotion') return { path: path('read', x.slug), title: x.title + ' · ' + NAME, desc: clip(x.teaser || x.html || x.title), type: 'article' };
    if (kind === 'reel') return { path: path('watch', reelSlug(x)), title: x.title + ' · Watch · ' + NAME, desc: clip(x.caption || x.topic || PAGES.watch.desc), type: 'video.other' };
    if (kind === 'series') return { path: path('series', slugify(x.series)), title: x.series + ' · Bible story series · ' + NAME, desc: clip(x.desc || PAGES.watch.desc), type: 'website' };
    var p = PAGES[x] || PAGES.today;
    return { path: p.path, title: p.title, desc: p.desc, type: 'website' };
  }
  root.LL_SEO = { SITE: SITE, NAME: NAME, TAGLINE: TAGLINE, IMAGE: IMAGE, PAGES: PAGES, TABS: TABS, slugify: slugify, clip: clip, reelSlug: reelSlug, parse: parse, path: path, fromHash: fromHash, meta: meta };
})(typeof window !== 'undefined' ? window : globalThis);
