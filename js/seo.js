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
    if (kind === 'story') return { path: path('listen', x.slug), title: (x.seoTitle || x.title) + ' · ' + NAME, desc: clip(x.desc || x.title), type: 'article', image: storyImage(x), imageWidth: x.image ? x.imageWidth : 0, imageHeight: x.image ? x.imageHeight : 0, imageAlt: x.image ? x.title + ', ' + (x.series || 'bedtime Bible story') : '' };
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
  // A bedtime story's share image: its own `image` (js/content.js bedtimeStories) when set, else none
  // (the site's default share image is used).
  function storyImage(x) { var u = String((x && x.image) || ''); return !u ? '' : /^https:\/\//i.test(u) ? u : SITE + '/' + u.replace(/^\/+/, ''); }
  // Rows for the "Goodnight Little Light" section on /listen: each opens the story's own page.
  function storyRowsHtml(list) {
    return (list || []).map(function (x) {
      var m = Math.floor((x.dur || 0) / 60), s = Math.round((x.dur || 0) % 60);
      return '<a class="p-row p-gnrow" href="' + esc(path('listen', x.slug)) + '"><span class="p-art" style="background:' + esc(x.color || '#a07fd6') + '"><i></i></span>' +
        '<span><b>' + esc(x.title) + '</b><small>Bedtime Bible story' + (x.episode ? ' #' + x.episode : '') + ' \u00b7 ' + m + ':' + (s < 10 ? '0' : '') + s + '</small></span>' +
        '<span class="p-pp" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span></a>';
    }).join('');
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
        '<h2>The story</h2>' + (x.story || []).map(function (p, i) { return '<p data-ra="story-' + i + '">' + mark(p, x.word) + '</p>'; }).join('') +
        '<h2>Bible verse</h2>' +
        '<blockquote class="p-ep-verse">\u201c' + mark(x.verse.text, x.word) + '\u201d<br><span class="meta">' + esc(x.verse.ref) + ' (' + esc(x.verse.version) + ')</span></blockquote>' +
        (x.word ? '<p class="p-ep-word"><span aria-hidden="true">\u{1F4A1} </span><b>Word to know:</b> ' + esc(x.word.meaning) + '</p>' : '') +
        '<h2>Let\u2019s pray</h2><div class="pray" data-ra="prayer">' + esc(x.prayer) + '</div>' +
        (x.goodnight ? '<p class="p-ep-night" data-ra="goodnight">' + esc(x.goodnight) + '</p>' : '') +
        '<h2>3 questions to ask afterwards</h2>' +
        (qs ? '<ol class="p-ep-qs">' + qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join('') + '</ol>'
          : '<ol class="p-ep-qs" data-placeholder-questions><li>[PLACEHOLDER: question 1 not in the content plan yet]</li><li>[PLACEHOLDER: question 2 not in the content plan yet]</li><li>[PLACEHOLDER: question 3 not in the content plan yet]</li></ol>') +
        printablesHtml(x) +
        '<div class="p-ep-cards">' +
          (x.next ? '<a class="p-ep-card" href="' + esc(x.next.href || '/listen') + '"><span class="p-kicker">Next story' + (x.next.when ? ' · ' + esc(x.next.when) : '') + '</span><b>' + esc(x.next.title) + '</b><span>' + (x.next.href && x.next.href !== '/listen' ? 'Play it now \u2192' : 'More bedtime stories on Listen \u2192') + '</span></a>' : '') +
          '<a class="p-ep-card join" href="/join"><span class="p-kicker">Join the testers</span><b>Little Light is a free Bible adventure game for kids 5\u20138, coming to Android.</b><span>Join the test families \u2192</span></a>' +
        '</div>' +
        followHtml({ tag: 'h2', cls: 'in-story' }) +
      '</div>';
  }

  // ---------- free printables (bedtime story pages) ----------
  // Each PDF opens through /dl/<path> (functions/dl), which adds 1 to that file's count for the day and the visitor's
  // country (from the connection, nothing stored about the visitor) and then sends the PDF. rel="nofollow" and
  // robots.txt keep search engines from counting. js/app.js adds ?nc=1 on devices that are not counted.
  var MEDIA = 'https://media.littlesaltandlight.com/';
  function dlHref(file) {
    var f = String(file || '');
    if (f.indexOf(MEDIA + 'stories/') === 0) f = f.slice(MEDIA.length);
    return /^(stories|media\/printables)\/[a-z0-9][a-z0-9._-]{0,150}\.pdf$/.test(f) ? '/dl/' + f : '';
  }
  // The count key for a file: its name without the folder, the 8-character fingerprint and .pdf.
  function dlKey(path) {
    var m = /\/([a-z0-9][a-z0-9._-]*?)(?:\.[0-9a-f]{8})?\.pdf$/.exec('/' + String(path || ''));
    return m ? m[1].slice(0, 100) : '';
  }
  function printablesHtml(x) {
    var list = (x.printables || []).map(function (p) { return { title: p.title, href: dlHref(p.file) }; }).filter(function (p) { return p.href; });
    if (!list.length) return '';
    return '<section class="p-print" aria-labelledby="pPrintH"><h2 id="pPrintH">Free printables</h2>' +
      '<p>Print at home (A4) for bedtime or Sunday school. Free to share.</p><ul class="p-print-list">' +
      list.map(function (p) {
        return '<li><a class="p-dl" href="' + esc(p.href) + '" target="_blank" rel="nofollow noopener" type="application/pdf">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M12 4v11m0 0l-4.5-4.5M12 15l4.5-4.5M5 19h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          '<span><b>' + esc(p.title) + '</b><small>PDF</small></span></a></li>';
      }).join('') + '</ul></section>';
  }

  // ---------- Today: tonight's bedtime story ----------
  // The newest live story (Studio stories carry their publish date; built-in ones without a date count as oldest,
  // so the newest Studio story wins once it is live). Written into the Today page at build time (lib/head.mjs) and
  // redrawn by js/app.js when the Studio stories arrive.
  function tonightStory(list) {
    var best = null, bt = -1;
    (list || []).forEach(function (x, i) {
      if (!x || !x.slug || x.placeholder) return;
      var t = Date.parse(x.date || '') || 0;
      if (t > bt || (t === bt && best && (x.episode || 0) > (best.episode || 0))) { best = x; bt = t; }
    });
    return best;
  }
  function tonightHtml(list) {
    var x = tonightStory(list);
    if (!x) return '';
    var m = Math.round((x.dur || 0) / 60);
    return '<div class="p-ton-x"><div class="p-kicker">Tonight\u2019s bedtime story</div>' +
      '<div class="p-ton-t">' + esc(x.title) + '</div>' +
      '<p class="p-ton-m">' + esc(x.series) + (x.episode ? ' #' + x.episode : '') + (m ? ' \u00b7 ' + m + ' min' : '') + (x.narrator ? ' \u00b7 read by ' + esc(x.narrator) : '') + '</p></div>' +
      '<a class="p-btn p-ton-go" href="' + esc(path('listen', x.slug)) + '" data-tonight="' + esc(x.slug) + '" aria-label="Listen tonight: ' + esc(x.title) + '">\u25b6 Listen</a>';
  }

  // ---------- follow us (social links) ----------
  // Our accounts only (Instagram first, then TikTok, then YouTube). Plain links with inline icons: no embeds, scripts or trackers.
  var SOCIAL = [
    { name: 'Instagram', handle: '@littlesaltandlight_', href: 'https://www.instagram.com/littlesaltandlight_/',
      icon: '<rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.2" cy="6.8" r="1.25" fill="currentColor"/>' },
    { name: 'TikTok', handle: '@littlesaltandlight', href: 'https://www.tiktok.com/@littlesaltandlight',
      icon: '<path fill="currentColor" d="M12.53.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>' },
    { name: 'YouTube', handle: '@little_salt_and_light', href: 'https://www.youtube.com/@little_salt_and_light',
      icon: '<path fill="currentColor" d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.4 31.4 0 0 0 0 12a31.4 31.4 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.4 31.4 0 0 0 24 12a31.4 31.4 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/>' }
  ];
  // Optional line under the heading. To remove it everywhere: set FOLLOW_SUBLINE = '' here AND delete the
  // <p class="p-follow-sub"> lines in index.html (tests/social.mjs checks the two agree).
  var FOLLOW_SUBLINE = 'New Bible stories every week';
  // 'Follow Little Salt & Light' block. opts: { tag: 'h2' | 'p' (heading element), cls: extra class, sub: false to leave the subline out }
  function followHtml(opts) {
    opts = opts || {};
    var tag = opts.tag || 'h2';
    return '<section class="p-follow' + (opts.cls ? ' ' + opts.cls : '') + '" aria-label="Follow Little Salt &amp; Light">' +
      '<' + tag + ' class="p-follow-h">Follow Little Salt &amp; Light</' + tag + '>' +
      (FOLLOW_SUBLINE && opts.sub !== false ? '<p class="p-follow-sub">' + esc(FOLLOW_SUBLINE) + '</p>' : '') +
      '<ul class="p-follow-links">' + SOCIAL.map(function (x) {
        return '<li><a class="p-follow-a" href="' + x.href + '" target="_blank" rel="noopener noreferrer" aria-label="Little Salt &amp; Light on ' + x.name + '" title="' + x.handle + ' on ' + x.name + '">' +
          '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' + x.icon + '</svg><span>' + x.name + '</span></a></li>';
      }).join('') + '</ul></section>';
  }

  // ---------- site footer (Follow + Explore + legal) ----------
  // At the end of every page except Today, the end of a bedtime story and a reel's end screen (they end with
  // the bigger followHtml card) and the Studio. Two looks, switched in the Studio (site setting 'footer_style'):
  // 'B' golden horizon, 'C' open columns. The markup is the same; js/app.js sets .ff-B or .ff-C on #app
  // (index.html ships .ff-C, so prerendered pages and no-JS visitors get C). Static copies live in index.html
  // (one per view); tests/social.mjs checks they match footerHtml().
  var FOOTER_STYLES = ['B', 'C'], FOOTER_DEFAULT = 'C';
  function footerStyle(v) {
    if (v && typeof v === 'object' && !Array.isArray(v)) v = v.style;
    return FOOTER_STYLES.indexOf(v) >= 0 ? v : null;
  }
  var FOOT_WM = '<span class="wm sf-wmk" role="img" aria-label="Salt and Light" style="--wm-d:-1.1s"><span class="wm-s" aria-hidden="true">Salt and </span><span class="wm-l" aria-hidden="true">L<svg class="wm-i" viewBox="0 0 18 49" aria-hidden="true" focusable="false"><defs><linearGradient id="wmgF" x1="0" y1="0" x2="0" y2="1"><stop class="wm-a" offset="0"/><stop class="wm-b" offset="1"/></linearGradient><radialGradient id="wmgFf" cx=".5" cy=".65" r=".6"><stop class="wm-c" offset="0"/><stop class="wm-a" offset=".55"/><stop class="wm-b" offset="1"/></radialGradient><radialGradient id="wmgFh"><stop class="wm-a" offset="0" stop-opacity=".55"/><stop class="wm-a" offset=".45" stop-opacity=".18"/><stop class="wm-a" offset="1" stop-opacity="0"/></radialGradient></defs><g transform="translate(0 49) skewX(-10) translate(0 -49)"><rect x="6.2" y="13" width="5.6" height="36" rx="2.8" fill="url(#wmgF)"/><path class="wm-wick" d="M9.0 12.5v-2.2"/><g class="wm-hw"><circle class="wm-halo" cx="9" cy="8" r="13" fill="url(#wmgFh)"/><circle class="wm-halo2" cx="9" cy="8" r="13" fill="url(#wmgFh)"/></g><g class="wm-flare"><g class="wm-jit"><g class="wm-sway"><g class="wm-flame"><g class="wm-fo"><path d="M9 0C13.6 5.5 14 9.8 9 12.6C4 9.8 4.4 5.5 9 0Z" fill="url(#wmgFf)"/></g><g class="wm-fc"><path d="M9 4.4C11.2 7.4 11.5 10.2 9 12C6.5 10.2 6.8 7.4 9 4.4Z" fill="#FFF8E1"/></g></g></g></g></g><circle class="wm-ember" cx="9" cy="0" r="0.9"/><circle class="wm-ember wm-e2" cx="8" cy="1" r="0.8"/><circle class="wm-ember wm-e3" cx="10" cy="1" r="0.7"/></g></svg>ght</span></span>';
  var FOOT_TABS = [['Read', '/read', 'read', '<path d="M4 5h6a2 2 0 012 2v12a2 2 0 00-2-2H4zM20 5h-6a2 2 0 00-2 2v12a2 2 0 012-2h6z"/>'],
    ['Listen', '/listen', 'listen', '<path d="M4 15v-3a8 8 0 0116 0v3M4 15h3v5H4zM17 15h3v5h-3z"/>'],
    ['Watch', '/watch', 'watch', '<rect x="5" y="3" width="14" height="18" rx="3"/><path d="M10 9l5 3-5 3z"/>'],
    ['Play', '/play', 'play', '<rect x="3" y="7" width="18" height="11" rx="5"/><path d="M8 11v3M6.5 12.5h3M15.5 12h.01"/>']];
  var FOOT_LEGAL = [['Website privacy', 'https://legal.littlesaltandlight.com/privacy/web/'], ['Game privacy', 'https://legal.littlesaltandlight.com/privacy/'],
    ['For parents', 'https://legal.littlesaltandlight.com/parents/'], ['Terms', 'https://legal.littlesaltandlight.com/terms/'],
    ['Support', 'https://legal.littlesaltandlight.com/support/'], ['Contact us', 'mailto:support@littlesaltandlight.com']];
  function footerHtml(id) {
    // id: a short suffix so each copy's wordmark gradients have their own ids (a gradient inside a hidden view
    // would not paint for a visible copy that points at it).
    var wm = FOOT_WM.split('wmgF').join('wmgF' + (id || ''));
    return '<footer class="p-sfoot" aria-label="Little Salt &amp; Light">' +
      '<div class="sf-grid">' +
        '<div class="sf-brand"><a class="sf-wm" href="/" aria-label="Little Salt &amp; Light home">' + wm + '</a><p class="sf-line">Bible devotions, prayers and stories for families.</p></div>' +
        '<nav class="sf-quick" aria-label="Explore"><h2 class="sf-h">Explore</h2><ul>' + FOOT_TABS.map(function (t) {
          return '<li><a href="' + t[1] + '" style="--tc:var(--t-' + t[2] + ')"><span class="sf-dot"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + t[3] + '</svg></span>' + t[0] + '</a></li>';
        }).join('') + '</ul></nav>' +
        '<section class="sf-follow" aria-label="Follow Little Salt &amp; Light"><h2 class="sf-h">Follow Little Salt &amp; Light</h2>' +
          (FOLLOW_SUBLINE ? '<p class="sf-sub">' + esc(FOLLOW_SUBLINE) + '</p>' : '') + '<ul>' + SOCIAL.map(function (x) {
          return '<li><a class="sf-soc sf-' + x.name.toLowerCase() + '" href="' + x.href + '" target="_blank" rel="noopener noreferrer" aria-label="Little Salt &amp; Light on ' + x.name + '" title="' + x.handle + ' on ' + x.name + '">' +
            '<span class="sf-ic"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' + x.icon + '</svg></span><span class="sf-n">' + x.name + '</span></a></li>';
        }).join('') + '</ul></section>' +
      '</div>' +
      '<nav class="sf-legal" aria-label="Legal and support">' + FOOT_LEGAL.map(function (l) { return '<a href="' + l[1] + '">' + l[0] + '</a>'; }).join('') + '</nav>' +
    '</footer>';
  }

  // ---------- read-along (bedtime stories) ----------
  // The text on the page is split into sentences and words, then lined up with the timings file
  // ([{text,start,end,words:[{text,start,end}]}]). Matching ignores case, punctuation and curly vs straight
  // quotes. Narration that isn't on the page (e.g. "Let's pray.") is allowed and skipped; anything else that
  // doesn't line up returns null, and the page stays plain text.
  function raNorm(t) {
    return String(t || '').toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[^a-z0-9' ]+/g, ' ')
      .replace(/(^|\s)'+|'+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function raSentences(text) {
    return String(text || '').split(/(?<=[.!?\u2026][\u2019\u201d'"]?)\s+/).filter(function (x) { return x.trim(); });
  }
  // parts: [{key, text}] in reading order. Returns {sentences:[{part, text, start, end, words|null}], count} or null.
  function raMatch(parts, timings) {
    if (!Array.isArray(timings) || !timings.length) return null;
    var shown = [];
    parts.forEach(function (p) {
      raSentences(p.text).forEach(function (t) { shown.push({ part: p.key, text: t, n: raNorm(t) }); });
    });
    var all = shown.map(function (x) { return x.n; }).join(' ');
    var out = [], i = 0, last = -1;
    for (var k = 0; k < timings.length; k++) {
      var tm = timings[k];
      if (!tm || typeof tm.start !== 'number' || typeof tm.end !== 'number' || !(tm.end >= tm.start) || tm.start < last) return null;
      last = tm.start;
      var n = raNorm(tm.text);
      while (i < shown.length && !shown[i].n) out.push(shown[i++]); // e.g. an emoji on its own: never timed
      // The narration may group sentences differently ("Go!" he said.): join shown pieces of one part until they match.
      var j = i, acc = '';
      while (j < shown.length && shown[j].part === (shown[i] || {}).part) {
        acc = acc ? acc + ' ' + shown[j].n : shown[j].n; j++;
        if (acc === n || n.indexOf(acc + ' ') !== 0) break;
      }
      if (i < shown.length && n && acc === n) {
        var x = shown[i];
        if (j - i > 1) x = { part: x.part, text: shown.slice(i, j).map(function (y) { return y.text; }).join(' '), n: n };
        i = j;
        x.start = tm.start; x.end = tm.end; x.words = raWords(x.text, tm.words);
        out.push(x);
      } else if (n && all.indexOf(n) === -1) {
        continue; // spoken but not shown
      } else return null;
    }
    while (i < shown.length && !shown[i].n) out.push(shown[i++]);
    if (i < shown.length) return null;
    return { sentences: out, count: out.filter(function (x) { return x.start != null; }).length };
  }
  function raWords(text, words) {
    var toks = text.split(/\s+/).filter(Boolean);
    if (!Array.isArray(words)) return null;
    var spoken = toks.filter(function (t) { return raNorm(t); });
    if (spoken.length !== words.length) return null;
    for (var j = 0; j < words.length; j++) {
      var w = words[j];
      if (!w || raNorm(w.text) !== raNorm(spoken[j]) || typeof w.start !== 'number' || typeof w.end !== 'number') return null;
    }
    return words;
  }
  // HTML for one part, sentence spans first (data-si = index into match.sentences), word spans inside.
  function raHtml(match, key, word) {
    var key2 = word && raNorm(word.word);
    return match.sentences.map(function (x, si) {
      if (x.part !== key) return '';
      var wi = 0;
      var inner = x.text.split(/(\s+)/).map(function (t) {
        if (!t.trim()) return t;
        var n = raNorm(t);
        if (!n || !x.words) return esc(t);
        var h = '<span class="p-w" data-wi="' + (wi++) + '">' + esc(t) + '</span>';
        return key2 && n === key2 ? '<mark class="p-word">' + h + '</mark>' : h;
      }).join('');
      if (x.start == null) return inner + ' ';
      return '<span class="p-sen" data-si="' + si + '" role="button" tabindex="0">' + inner + '</span> ';
    }).filter(Boolean).join('').trim();
  }

  root.LL_SEO = { SITE: SITE, NAME: NAME, TAGLINE: TAGLINE, IMAGE: IMAGE, PAGES: PAGES, TABS: TABS, slugify: slugify, clip: clip, reelSlug: reelSlug, parse: parse, path: path, fromHash: fromHash, meta: meta, storyHtml: storyHtml, storyRowsHtml: storyRowsHtml, printablesHtml: printablesHtml, dlHref: dlHref, dlKey: dlKey, tonightStory: tonightStory, tonightHtml: tonightHtml, storyImage: storyImage, raNorm: raNorm, raSentences: raSentences, raMatch: raMatch, raHtml: raHtml, SOCIAL: SOCIAL, followHtml: followHtml, footerHtml: footerHtml, footerStyle: footerStyle, FOOTER_STYLES: FOOTER_STYLES, FOOTER_DEFAULT: FOOTER_DEFAULT };
})(typeof window !== 'undefined' ? window : globalThis);
