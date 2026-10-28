// Little Light app: tabs, feed, reels, audio, reading, verses and the game page.
// Plain JavaScript, no build step. Content comes from js/content.js.
(function () {
  'use strict';
  var app = document.getElementById('app');
  var C = window.LL_CONTENT;
  if (!app || !C) return;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function isLongVerse(v) { return String(v && v.text || '').trim().length > 200; }

  // ---------- posts from the Studio ----------
  // Text from the Studio is escaped; **bold**, _italic_ and "> quote" lines are the only formatting.
  function mdToHtml(text) {
    return String(text || '').trim().split(/\n\s*\n/).filter(Boolean).map(function (block) {
      var quote = /^>\s?/.test(block);
      var html = esc(block.replace(/^>\s?/gm, ''))
        .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\W)_(.+?)_(?=\W|$)/g, '$1<i>$2</i>').replace(/\n/g, '<br>');
      return quote ? '<blockquote>' + html + '</blockquote>' : '<p>' + html + '</p>';
    }).join('');
  }
  // Long passages get smaller type in the full-screen verse view, which also scrolls.
  function verseSize(text) { var n = (text || '').length; return n > 850 ? ' v-xxl' : n > 560 ? ' v-xl' : n > 320 ? ' v-l' : n > 160 ? ' v-m' : ''; }
  function toSeconds(m) { var x = String(m || '').split(':'); return x.length === 2 ? (+x[0] * 60 + +x[1]) || 0 : 0; }
  // Studio posts from Supabase are kept on the device, so they still show offline or on a slow
  // connection (after 4 seconds the saved copy is used while the fresh one keeps loading for next time).
  var POSTS_KEY = 'll.studioPosts';
  function savedPosts(S) {
    try { var list = JSON.parse(localStorage.getItem(POSTS_KEY) || 'null'); return list ? list.filter(S.isLive) : null; } catch (err) { return null; }
  }
  function loadPublished(S) {
    if (S.mode !== 'supabase') return S.publishedPosts();
    var fresh = S.publishedPosts().then(function (posts) {
      try { localStorage.setItem(POSTS_KEY, JSON.stringify(posts)); } catch (err) { /* storage full or blocked */ }
      return posts;
    });
    fresh.catch(function () {}); // if the saved copy wins the race, a later failure is expected
    var slow =new Promise(function (resolve) { setTimeout(resolve, 4000, 'slow'); });
    return Promise.race([fresh, slow]).then(function (r) {
      return r === 'slow' ? (savedPosts(S) || fresh) : r;
    }).catch(function (err) {
      var saved = savedPosts(S);
      if (saved) return saved;
      throw err;
    });
  }
  // ---------- which menus are on (site setting 'nav') ----------
  // The last value is kept on the device; if the database can't be reached (or the setting
  // doesn't exist yet) the saved copy is used, then the built-in default.
  var NAV_KEY = 'll.navSettings';
  var NAV = null;
  function loadNav() {
    var S = window.LLStore;
    if (!S || !S.getSetting) return Promise.resolve();
    var saved = null;
    try { saved = S.normalizeNav(JSON.parse(localStorage.getItem(NAV_KEY) || 'null')); } catch (err) { saved = null; }
    NAV = saved || S.navDefault();
    var fresh = S.getSetting('nav').then(function (v) {
      var n = S.normalizeNav(v);
      if (!n) return;
      NAV = n;
      try { localStorage.setItem(NAV_KEY, JSON.stringify(n)); } catch (err) { /* storage blocked */ }
    });
    var slow = new Promise(function (resolve) { setTimeout(resolve, 4000); });
    return Promise.race([fresh, slow]).catch(function () {});
  }

  // ---------- built-ins hidden in the Studio (site setting 'builtins_hidden') ----------
  // Same caching as the menus. A missing row means nothing is hidden.
  var HIDDEN_KEY = 'll.builtinsHidden';
  var HIDDEN = [];
  function loadHidden() {
    var S = window.LLStore;
    if (!S || !S.getSetting) return Promise.resolve();
    try { HIDDEN = S.effectiveHidden(JSON.parse(localStorage.getItem(HIDDEN_KEY) || 'null')); } catch (err) { HIDDEN = S.effectiveHidden(null); }
    var fresh = S.getSetting('builtins_hidden').then(function (v) {
      if (v != null && !S.normalizeHidden(v)) return;
      HIDDEN = S.effectiveHidden(v);
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(v == null ? { hidden: [] } : v)); } catch (err) { /* storage blocked */ }
    });
    var slow = new Promise(function (resolve) { setTimeout(resolve, 4000); });
    return Promise.race([fresh, slow]).catch(function () {});
  }

  // ---------- content switches (site setting 'content') ----------
  // Missing row/key = verses hidden. Same device caching as the other settings.
  var CONTENT_KEY = 'll.contentSettings';
  var CONTENT = { verses: false };
  function loadContent() {
    var S = window.LLStore;
    if (!S || !S.getSetting || !S.contentDefault) return Promise.resolve();
    try { CONTENT = S.normalizeContent(JSON.parse(localStorage.getItem(CONTENT_KEY) || 'null')) || S.contentDefault(); } catch (err) { CONTENT = S.contentDefault(); }
    var fresh = S.getSetting('content').then(function (v) {
      CONTENT = S.normalizeContent(v) || S.contentDefault();
      try { localStorage.setItem(CONTENT_KEY, JSON.stringify(CONTENT)); } catch (err) { /* storage blocked */ }
    });
    var slow = new Promise(function (resolve) { setTimeout(resolve, 4000); });
    return Promise.race([fresh, slow]).catch(function () {});
  }

  // ---------- footer style (site setting 'footer_style', chosen in the Studio) ----------
  // index.html and the prerendered pages ship .ff-C (also the no-JS look). The last value seen is kept on the
  // device so a returning visitor gets the right look straight away; then the live value is read with the
  // anon key and the class is swapped. Anything missing, unknown or failing falls back to C.
  var FOOTER_KEY = 'll.footerStyle';
  function setFooterStyle(v) {
    var F = window.LL_SEO, style = (F && F.footerStyle(v)) || 'C', el = document.getElementById('app');
    if (!el) return style;
    ['B', 'C'].forEach(function (k) { el.classList.toggle('ff-' + k, k === style); });
    el.setAttribute('data-footer', style);
    return style;
  }
  function loadFooterStyle() {
    var cached = null;
    try { cached = localStorage.getItem(FOOTER_KEY); } catch (err) { /* storage blocked */ }
    setFooterStyle(cached);
    var S = window.LLStore;
    if (!S || !S.getSetting) return Promise.resolve();
    return S.getSetting('footer_style').then(function (v) {
      var style = setFooterStyle(v);
      try { localStorage.setItem(FOOTER_KEY, style); } catch (err) { /* storage blocked */ }
    }, function () { setFooterStyle(cached); });
  }

  function mergeStudioPosts() {
    var S = window.LLStore;
    if (!S) return Promise.resolve();
    return loadPublished(S).then(function (posts) {
      return Promise.all(posts.map(function (p) {
        var f = p.fields || {}, jobs = [];
        if (p.media_url) jobs.push(S.resolveMedia(p.media_url).then(function (u) { p._src = u; }));
        if (p.type === 'reel' && f.poster) jobs.push(S.resolveMedia(f.poster).then(function (u) { p._poster = u; }));
        return Promise.all(jobs);
      })).then(function () { return posts; });
    }).then(function (posts) {
      var eps = [], devs = [], reels = [], verses = [], news = [], audioAt = {}, today = [], featured = null;
      // Posts moved from js/content.js carry `fields.builtin` (for example "devotion:brave"); once
      // published they replace the built-in item they came from.
      var copyOf = {};
      var pinks = ['#ee8fb2', '#f6c9d8', '#fde0e9'], reelLook = [['#e46a4c', 'robe'], ['#3d7fc4', 'rain'], ['#1f3a6e', 'sea']];
      posts.forEach(function (p) {
        if (p.type !== 'audio') return;
        var f = p.fields || {};
        audioAt[p.id] = eps.length;
        eps.push({ title: p.title, meta: f.kind || 'Audio', dur: f.seconds || toSeconds(f.minutes), color: f.color || '#a07fd6', src: p._src || '', _id: p.id,
          verse: f.verse || '', ref: f.ref || '', transcript: f.transcript || '', date: p.publish_at || p.created_at || '' });
        if (f.builtin) copyOf[f.builtin] = eps.length - 1;
      });
      posts.forEach(function (p) {
        var f = p.fields || {};
        if (p.type === 'devotion') {
          var ep = f.audioId != null && audioAt[f.audioId] != null ? audioAt[f.audioId] : -1;
          var words = [f.body, f.family, f.prayer].join(' ').split(/\s+/).filter(Boolean).length;
          if (ep >= 0) eps[ep].devotion = devs.length;
          devs.push({ slug: p.slug, title: p.title, kicker: 'Devotion · ' + Math.max(1, Math.round(words / 180)) + ' min read',
            color: pinks[devs.length % 3], ink: '#3a1426', episode: ep, teaser: f.teaser || '', date: p.publish_at || p.created_at || '',
            html: mdToHtml(f.body) + (f.ref ? '<p class="meta">' + esc(f.ref) + '</p>' : '') +
              (f.family ? '<p><b>For families tonight:</b> ' + esc(f.family) + '</p>' : '') +
              (f.prayer ? '<div class="pray">' + esc(f.prayer) + '</div>' : '') });
          if (f.builtin) copyOf[f.builtin] = devs.length - 1;
          if (p.show_on_today) today.push({ type: 'devotion', i: devs.length - 1 });
        } else if (p.type === 'reel') {
          var look = reelLook.filter(function (l) { return l[1] === f.look; })[0] || reelLook[reels.length % 3];
          reels.push({ title: p.title, slug: p.slug || '', len: f.minutes || '', bg: look[0], kind: look[1], src: p._src || '', poster: p._poster || '', youtube: f.youtube || '', caption: f.caption || '', read: f.devotion || '', listen: f.audio || '', date: p.publish_at || p.created_at || '', series: f.series || '', episode: +f.episode || 0, seriesDesc: f.series_description || '', pageStyle: f.page_style || '', pageColor: /^#[0-9a-f]{6}$/i.test(f.page_color || '') ? f.page_color : '' });
          if (f.builtin) copyOf[f.builtin] = reels.length - 1;
          if (p.show_on_today) today.push({ type: 'reel', i: reels.length - 1 });
        } else if (p.type === 'verse') {
          verses.push({ text: f.verse || '', ref: f.ref || '', topics: f.topics && f.topics.length ? f.topics : ['Verse'], translation: f.translation || 'WEB', date: p.publish_at || p.created_at || '' });
          if (f.builtin) copyOf[f.builtin] = verses.length - 1;
          if (p.show_on_today) today.push({ type: 'verse', i: verses.length - 1 });
        } else if (p.type === 'game') {
          news.push({ title: p.title, text: f.text || '', button: f.button || '', date: p.publish_at });
          if (p.show_on_today) today.push({ type: 'game', i: news.length - 1 });
        } else if (p.type === 'audio' && p.show_on_today) {
          // The newest audio marked for Today fills the Today audio card and the Listen hero
          // (see bindFeaturedAudio), so it doesn't get a second card of its own.
          if (featured == null) featured = audioAt[p.id];
          else today.push({ type: 'audio', i: audioAt[p.id] });
        }
      });
      // Studio posts come first, then the built-in items that have no published copy yet.
      // map[i] is where built-in item i ends up: its Studio copy, or its new position.
      function merge(studio, builtins, kind, key) {
        var map = [], kept = [];
        builtins.forEach(function (b, i) {
          var copy = copyOf[kind + ':' + key(b)];
          if (copy != null) map[i] = copy; else { map[i] = studio.length + kept.length; kept.push(b); }
        });
        return { list: studio.concat(kept), map: map };
      }
      var E = merge(eps, C.episodes, 'audio', function (e) { return S.slugify(e.title); });
      var D = merge(devs, C.devotions, 'devotion', function (d) { return d.slug; });
      var R = merge(reels, C.reels, 'reel', function (r) { return S.slugify(r.title); });
      var V = merge(verses, C.verses, 'verse', function (v) { return S.slugify(v.ref); });
      // Keep devotions and their recordings linked across the move. A Studio copy keeps its own
      // link if it has one; otherwise it inherits the built-in item's.
      C.episodes.forEach(function (e, i) {
        if (e.devotion == null) return;
        var at = E.map[i], to = D.map[e.devotion];
        if (at >= eps.length) e.devotion = to; else if (eps[at].devotion == null) eps[at].devotion = to;
      });
      C.devotions.forEach(function (d, i) {
        if (d.episode < 0) return;
        var at = D.map[i], to = E.map[d.episode];
        if (at >= devs.length) d.episode = to; else if (devs[at].episode < 0) devs[at].episode = to;
      });
      C.episodes = E.list;
      C.devotions = D.list;
      C.reels = R.list;
      C.verses = V.list;
      // Buttons written in index.html point at built-in items by position (see startApp).
      C.builtinAt = { 'ep': E.map, 'sheet': D.map, 'read': D.map, 'share-dev': D.map, 'reel': R.map, 'save-verse': V.map, 'share-verse': V.map };
      C.news = news;
      // Bedtime stories posted in the Studio (type 'story'), after the built-in ones (js/store.js mergeStories).
      if (S.mergeStories) C.bedtimeStories = S.mergeStories(C.bedtimeStories, posts);
      C.featuredAudio = featured; // Studio posts come first in C.episodes, so the index stays valid.
      C.today = today.slice(0, 5);
      // Topics added in the Studio get their own chip in Verses.
      verses.forEach(function (v) { v.topics.forEach(function (t) { if (C.topics.indexOf(t) < 0) C.topics = C.topics.concat([t]); }); });
    }).catch(function (err) { if (window.console) console.warn('Studio posts could not be loaded:', err); });
  }

  // ---------- leaving items out: silent episodes (no recording) and built-ins hidden in the Studio ----------
  // Built-in items get a key like the Studio's `fields.builtin` ("audio:keep-building"), tagged before
  // Studio posts are merged in, so only built-ins can be hidden this way.
  var BUILTIN_KEY = { episodes: ['audio', function (e) { return e.title; }], devotions: ['devotion', function (d) { return d.slug; }],
    reels: ['reel', function (r) { return r.title; }], verses: ['verse', function (v) { return v.ref; }] };
  function tagBuiltins() {
    var S = window.LLStore;
    if (!S) return;
    Object.keys(BUILTIN_KEY).forEach(function (list) {
      (C[list] || []).forEach(function (item) { item._builtin = BUILTIN_KEY[list][0] + ':' + S.slugify(BUILTIN_KEY[list][1](item)); });
    });
  }
  // Which index-holding things point into each list.
  var LINKS = { episodes: { attrs: ['ep'], today: 'audio' }, devotions: { attrs: ['sheet', 'read', 'share-dev'], today: 'devotion' },
    reels: { attrs: ['reel'], today: 'reel' }, verses: { attrs: ['save-verse', 'share-verse'], today: 'verse' } };
  // Removes items from C[list] and re-points everything at them; what pointed at a removed item gets -1.
  function dropItems(list, keepFn) {
    var items = C[list] || [], keep = [], at = [];
    items.forEach(function (e, i) { var k = keepFn(e); at[i] = k ? keep.length : -1; if (k) keep.push(e); });
    if (keep.length === items.length) return;
    var re = function (i) { return i == null || i < 0 ? -1 : at[i]; };
    var L = LINKS[list];
    C.builtinAt = C.builtinAt || {};
    L.attrs.forEach(function (attr) { C.builtinAt[attr] = (C.builtinAt[attr] || items.map(function (e, i) { return i; })).map(re); });
    if (C.today) C.today = C.today.filter(function (t) { if (t.type !== L.today) return true; t.i = re(t.i); return t.i >= 0; });
    if (list === 'episodes') {
      C.devotions.forEach(function (d) { d.episode = re(d.episode); });
      if (C.featuredAudio != null) C.featuredAudio = re(C.featuredAudio) < 0 ? null : re(C.featuredAudio);
    }
    if (list === 'devotions') C.episodes.forEach(function (e) { if (e.devotion != null) e.devotion = re(e.devotion) < 0 ? null : re(e.devotion); });
    C[list] = keep;
  }
  function dropLeftOut() {
    dropItems('episodes', function (e) { return !!e.src; });  // option C: no recording, not listed
    var hidden = HIDDEN || [];
    if (!hidden.length) return;
    Object.keys(BUILTIN_KEY).forEach(function (list) {
      dropItems(list, function (e) { return !e._builtin || hidden.indexOf(e._builtin) < 0; });
    });
  }

  // ---------- list filters: Latest/Oldest by post date + type chips from real fields; kept in sessionStorage ----------
  var FILTER_KEY = 'll.filters', FILTER_APPLY = {};
  function fall() { try { return JSON.parse(sessionStorage.getItem(FILTER_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function fstate(page) { var s = fall()[page] || {}; return { sort: s.sort === 'old' ? 'old' : 'new', type: s.type || 'All' }; }
  function fset(page, patch) { var a = fall(), s = fstate(page); for (var k in patch) s[k] = patch[k]; a[page] = s; try { sessionStorage.setItem(FILTER_KEY, JSON.stringify(a)); } catch (e) {} }
  function dateOf(d) { var t = Date.parse(d || C.builtinDate || ''); return isNaN(t) ? 0 : t; }
  // Stable sort by date; equal dates keep their original order in both directions.
  function sortIdx(idx, dateFn, dir) {
    return idx.map(function (k, n) { return { k: k, n: n, t: dateOf(dateFn(k)) }; })
      .sort(function (a, b) { return (dir === 'old' ? a.t - b.t : b.t - a.t) || a.n - b.n; }).map(function (x) { return x.k; });
  }
  // The control only appears when a page has 3 or more items; chips only when there are 2+ real types.
  function filterBar(page, count, types) {
    if (count <= 2) return '';
    var s = fstate(page), ty = types.length > 1 ? ['All'].concat(types) : [];
    if (ty.indexOf(s.type) < 0) s.type = 'All';
    return '<div class="p-filter glass glass--dark" data-fpage="' + page + '">' +
      '<div class="p-fsort" role="group" aria-label="Sort">' + [['new', 'Latest'], ['old', 'Oldest']].map(function (o) {
        return '<button type="button" data-fsort="' + o[0] + '" aria-pressed="' + (s.sort === o[0]) + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      (ty.length ? '<div class="p-fchips" role="group" aria-label="Show">' + ty.map(function (t) {
        return '<button type="button" class="p-fchip" data-ftype="' + esc(t) + '" aria-pressed="' + (s.type === t) + '">' + esc(t) + '</button>'; }).join('') + '</div>' : '') +
      '</div>';
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-fsort], [data-ftype]'); if (!b) return;
    var bar = b.closest('[data-fpage]'); if (!bar) return;
    var page = bar.dataset.fpage;
    if (b.dataset.fsort) fset(page, { sort: b.dataset.fsort }); else fset(page, { type: b.dataset.ftype });
    var which = b.dataset.fsort ? '[data-fsort="' + b.dataset.fsort + '"]' : '[data-ftype="' + b.dataset.ftype + '"]';
    if (FILTER_APPLY[page]) FILTER_APPLY[page]();
    var again = document.querySelector('[data-fpage="' + page + '"] ' + which); if (again) again.focus();
  });
  // Reorders and filters existing items in place (DOM order, so keyboard order matches what is seen).
  function applyDom(page, box, items, dateFn, typeFn) {
    var s = fstate(page);
    var order = sortIdx(items.map(function (_, k) { return k; }), function (k) { return dateFn(items[k]); }, s.sort);
    order.forEach(function (k) { box.appendChild(items[k]); });
    items.forEach(function (el) { el.classList.toggle('f-out', s.type !== 'All' && typeFn(el) !== s.type); });
  }
  function mountBar(page, html, before) {
    var old = document.querySelector('.p-filter[data-fpage="' + page + '"]'); if (old) old.remove();
    if (!html || !before) return; before.insertAdjacentHTML('beforebegin', html);
  }
  // Files named in js/content.js ('media/...') are relative to the site root; pages also live at
  // deeper addresses now (/read/brave), so make them root-relative.
  function fromRoot(u) { return u && !/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(u) ? '/' + u : u; }
  // On the public pages the full stylesheet is loaded after the first screen (see scripts/build-pages.mjs).
  Array.prototype.forEach.call(document.querySelectorAll('link[data-late]'), function (l) {
    l.media = 'all';
  });
  function startApp() {
  dropLeftOut();
  C.episodes.forEach(function (e) { e.src = fromRoot(e.src); });
  C.reels.forEach(function (r) { r.src = fromRoot(r.src); r.poster = fromRoot(r.poster); r.thumb = fromRoot(r.thumb); });
  // Verses switched off: no verse cards on Today (built-in or Studio) and no verse buttons.
  // Bible quotes inside devotions are untouched. The Verses menu keeps its own nav state.
  // index.html starts with .no-verses (the default), so the welcome card paints before any data arrives.
  app.classList.toggle('no-verses', !CONTENT.verses);
  if (!CONTENT.verses) {
    if (C.today) C.today = C.today.filter(function (t) { return t.type !== 'verse'; });
    Array.prototype.forEach.call(document.querySelectorAll('#pFeed .p-slide.s1 > :is(.p-kicker, .verse, .ref, .p-btns)'), function (el) { el.remove(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-save-verse], [data-share-verse], [data-open-verse], #pFeed [data-go="verses"]'), function (el) {
      if (!el.closest('.v-verses')) el.remove();
    });
  }

  var $ = function (s, r) { return (r || app).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || app).querySelectorAll(s)); };
  // Point the buttons written in index.html at where their built-in items are now.
  if (C.builtinAt) Object.keys(C.builtinAt).forEach(function (attr) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-' + attr + ']'), function (b) {
      var to = C.builtinAt[attr][+b.getAttribute('data-' + attr)];
      if (to != null) b.setAttribute('data-' + attr, to);
    });
  });
  // A button pointing at a left-out item disappears; a Today card built around one goes too, and
  // the Listen hero is hidden. #pFeed then gets a class saying how many cards share the middle row.
  Array.prototype.forEach.call(document.querySelectorAll('[data-ep="-1"], [data-sheet="-1"], [data-read="-1"], [data-share-dev="-1"], [data-reel="-1"], [data-save-verse="-1"], [data-share-verse="-1"]'), function (b) {
    var box = b.closest('[data-featured-audio]') || b.closest('#pFeed .p-slide');
    if (box && box.dataset.featuredAudio === 'listen') box.hidden = true;
    else if (box) box.remove();
    else b.remove();
  });
  function markRow() {
    var feed = document.getElementById('pFeed');
    if (!feed) return;
    var n = feed.querySelectorAll('.p-slide:is(.s2, .s3, .s4):not(.s-studio):not(.f-out)').length;
    feed.classList.remove('mid-0', 'mid-1', 'mid-2', 'mid-3');
    feed.classList.add('mid-' + n);
  }
  markRow();
  // Today filters: every post card except the built-in welcome slide, which keeps its place.
  // Types come from the card kind each slide already has (Verse, Devotion, Reel, Audio, Game).
  (function todayFilters() {
    var feed = $('#pFeed'); if (!feed) return;
    var KIND = { s1: 'Verse', s2: 'Devotion', s3: 'Reel', s4: 'Audio', s5: 'Game' };
    var typeOf = function (el) { for (var k in KIND) if (el.classList.contains(k)) return KIND[k]; return ''; };
    var welcome = feed.querySelector('.p-slide.s1:not(.s-studio)');
    var all = $$('.p-slide', feed), at = welcome ? all.indexOf(welcome) : -1;
    var items = all.filter(function (el) { return el !== welcome; });
    var types = []; items.forEach(function (el) { var t = typeOf(el); if (t && types.indexOf(t) < 0) types.push(t); });
    var wide = matchMedia('(min-width: 900px)');
    function apply() {
      var html = filterBar('today', items.length, types);
      mountBar('today', html, wide.matches || !welcome ? feed : null);
      if (html && !wide.matches && welcome) welcome.insertAdjacentHTML('beforeend', html);
      applyDom('today', feed, items, function (el) { return el.dataset.date; }, typeOf);
      if (welcome) { var kids = $$('.p-slide', feed); feed.insertBefore(welcome, kids[Math.min(at, kids.length)] || null); if (kids.indexOf(welcome) < 0 && at >= kids.length) feed.appendChild(welcome); }
      markRow();
    }
    FILTER_APPLY.today = apply; apply();
    wide.addEventListener('change', apply);
  })();
  // Today audio card and Listen "This week": the newest published audio marked for Today,
  // otherwise the built-in recording written in index.html.
  (function bindFeaturedAudio() {
    if (C.featuredAudio == null) return;
    var e = C.episodes[C.featuredAudio];
    if (!e) return;
    var line = e.verse ? '“' + e.verse + '”' + (e.ref ? ' ' + e.ref : '') : e.meta;
    $$('[data-featured-audio]').forEach(function (box) {
      var set = function (sel, text) { var el = box.querySelector(sel); if (el) el.innerHTML = esc(text); };
      set('[data-fa="kicker"]', (box.dataset.featuredAudio === 'today' ? 'Audio · ' : 'This week · ') + fmt(e.dur));
      set('[data-fa="title"]', e.title);
      set('[data-fa="text"]', line);
      var b = box.querySelector('[data-fa="play"]'); if (b) b.setAttribute('data-ep', C.featuredAudio);
    });
  })();
  var ICON_PLAY = '<svg viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg>';
  var ICON_PAUSE = '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  var ICON_SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/></svg>';
  var ICON_LEAF = '<svg viewBox="0 0 24 24"><path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7"/></svg>';
  var TABS = ['today', 'watch', 'listen', 'read', 'verses', 'play'];
  var TAB_COLOR = { today: '#fff1b8', watch: '#e46a4c', listen: '#a07fd6', read: '#ee8fb2', verses: '#f7c23f', play: '#69ba7e' };

  function fmt(s) { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem('ll.' + key);
      localStorage.setItem('ll.' + key, value);
    } catch (err) { return null; }
    return null;
  }
  function media(q) { try { return window.matchMedia(q).matches; } catch (err) { return false; } }

  // ---------- toast ----------
  var toastT;
  function toast(msg) {
    var t = $('#pToast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, 2400);
  }

  // ---------- routing: real addresses (/, /watch, /listen, /read/brave, /watch/the-whisper), see js/seo.js ----------
  // Old #addresses (#watch, #read/brave) still work: route() swaps them for the new path.
  var SEO = window.LL_SEO;
  var current = 'today';
  function show(tab) {
    closeOverlays();
    current = tab;
    // The first screen is written into the page already visible (.p-boot, no fade-in), so it paints
    // straight away; switching to another screen fades in as before.
    var was = $('.p-view.on');
    if (!was || was.dataset.view !== tab) app.classList.remove('p-boot');
    $$('.p-view').forEach(function (v) { v.classList.toggle('on', v.dataset.view === tab); });
    $$('.p-tab').forEach(function (a) {
      var on = a.dataset.tab === tab;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    if (tab !== 'watch' && watchOpen) closeWatch();
    if (tab !== 'watch' && seriesOpen) closeSeries();
    updateReels();
  }
  function navState(tab) { return tab === 'today' || !NAV ? 'on' : NAV.menus[tab] || 'on'; }
  // Hide menus that are switched off, and mark the "coming soon" ones.
  function applyNav() {
    TABS.forEach(function (tab) {
      var st = navState(tab);
      $$('.p-tab[data-tab="' + tab + '"], [data-go="' + tab + '"]').forEach(function (el) {
        el.hidden = st === 'hidden';
        if (st === 'coming_soon') el.setAttribute('data-soon', ''); else el.removeAttribute('data-soon');
        if (el.classList.contains('p-tab')) {
          if (st === 'coming_soon') { el.setAttribute('aria-label', (TAB_NAME[tab] || tab) + ', coming soon'); el.title = 'Coming soon'; }
          else { el.removeAttribute('aria-label'); el.removeAttribute('title'); }
        }
      });
    });
  }
  var TAB_NAME = { watch: 'Watch', listen: 'Listen', read: 'Read', verses: 'Verses', play: 'Play' };
  function showSoon(tab) {
    var box = $('#pSoon');
    $('#pSoonTitle').innerHTML = esc(TAB_NAME[tab] || 'This') + ' is coming soon';
    $('#pSoonMsg').innerHTML = esc(NAV ? NAV.message : '');
    box.classList.add('on');
    var ok = $('#pSoon [data-soon-close]'); if (ok) ok.focus();
  }
  function closeSoon() { $('#pSoon').classList.remove('on'); }
  // <title>, description, canonical and the share-preview tags follow the screen (same values the
  // build writes into each page's static <head>, from js/seo.js).
  function setHead(m) {
    if (!SEO || !m) return;
    document.title = m.title;
    var set = function (sel, attr, v) { var el = document.head.querySelector(sel); if (el) el.setAttribute(attr, v); };
    var url = SEO.SITE + m.path;
    set('meta[name="description"]', 'content', m.desc);
    set('link[rel="canonical"]', 'href', url);
    set('meta[property="og:url"]', 'content', url);
    set('meta[property="og:type"]', 'content', m.type);
    set('meta[property="og:title"]', 'content', m.title);
    set('meta[property="og:description"]', 'content', m.desc);
    set('meta[name="twitter:title"]', 'content', m.title);
    set('meta[name="twitter:description"]', 'content', m.desc);
    // A video's own poster when it has a web address (Studio posts), else the site's share image.
    var img = m.image && /^https?:/i.test(m.image) ? m.image : SEO.IMAGE;
    set('meta[property="og:image"]', 'content', img);
    set('meta[name="twitter:image"]', 'content', img);
  }
  function pageHead(tab) { if (SEO) setHead(SEO.meta('page', tab)); }
  // Changes the address without a page load. replace: no new history entry (overlays, fixes).
  function setPath(p, replace) {
    if (!SEO || location.pathname + location.search + location.hash === p) return;
    try { history[replace ? 'replaceState' : 'pushState'](null, '', p); } catch (err) { /* file:// */ }
  }
  function navigate(p, replace) { setPath(p, replace); route(); }
  function route() {
    var legacy = SEO && SEO.fromHash(location.hash);
    if (legacy) setPath(legacy + location.search, true);
    var r = (SEO && SEO.parse(location.pathname)) || { tab: 'today' };
    var tab = TABS.indexOf(r.tab) >= 0 ? r.tab : 'today';
    if (navState(tab) !== 'on') {
      // Stay where we are (Today on a fresh visit) and put the address back.
      setPath(SEO ? SEO.path(current) : '/', true);
      // A fresh visit to /verses: the page was built showing that screen, so show Today instead.
      if (!app.dataset.ready) { show(current); pageHead(current); }
      if (navState(tab) === 'coming_soon') showSoon(tab);
      return;
    }
    if (tab === 'read' && r.slug) {
      var i = indexBySlug(r.slug);
      if (current !== 'read') show('read');
      if (i >= 0) { openArticle(i, true); return; }
      setPath('/read', true);
      if ($('#pArticle').classList.contains('on')) $('#pArticle').classList.remove('on');
      pageHead('read');
      return;
    }
    if (tab === 'watch' && (r.slug || r.series)) {
      if (current !== 'watch') show('watch');
      if (r.series) {
        var u = units().filter(function (x) { return x.series && SEO.slugify(x.series) === r.series; })[0];
        if (u) { openSeries(u.series); return; }
      } else {
        var k = reelBySlug(r.slug);
        if (k >= 0) { openReel(k); return; }
      }
      setPath('/watch', true);
      pageHead('watch');
      return;
    }
    if (tab === 'listen' && r.slug) {
      // Bedtime story page (/listen/<slug>): the build already wrote it into the page (scripts/prerender.mjs),
      // so keep that text and only draw it when arriving from another screen. No play counting here.
      var x = storyBySlug(r.slug), ep = $('#pEpisode');
      var pre = x && ep.getAttribute('data-slug') === x.slug && ep.querySelector('.body');
      show('listen');
      if (x) {
        if (!pre) { ep.innerHTML = SEO.storyHtml(x, 'h1'); ep.setAttribute('data-slug', x.slug); ep.scrollTop = 0; app.classList.remove('p-boot'); }
        ep.classList.add('on');
        readAlong(ep, x);
        setHead(SEO.meta('story', x));
        return;
      }
      setPath('/listen', true);
      pageHead('listen');
      return;
    }
    if (current === 'read' && tab === 'read') $('#pArticle').classList.remove('on');
    if (tab === 'watch') { closeWatch(true); closeSeries(true); }
    show(tab);
    pageHead(tab);
  }
  function go(tab) { navigate(SEO ? SEO.path(tab) : '/'); }
  function indexBySlug(slug) {
    for (var i = 0; i < C.devotions.length; i++) if (C.devotions[i].slug === slug) return i;
    return -1;
  }
  function storyBySlug(slug) {
    var list = C.bedtimeStories || [];
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i];
    return null;
  }
  function reelBySlug(slug) {
    for (var i = 0; i < C.reels.length; i++) if (SEO.reelSlug(C.reels[i]) === slug) return i;
    return -1;
  }
  // In-app links (menu, cards, wordmark) change screen without reloading the page.
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || !SEO || e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (a.target && a.target !== '_self')) return;
    var url = new URL(a.getAttribute('href'), location.href);
    if (url.origin !== location.origin || !SEO.parse(url.pathname) || url.pathname.indexOf('/studio') === 0) return;
    e.preventDefault();
    navigate(url.pathname);
  });
  window.addEventListener('popstate', route);
  // A typed or old #link fires popstate (handled above) and then hashchange; by then route() has already
  // swapped the hash for a path, so only a hash that is still there needs routing.
  window.addEventListener('hashchange', function () { if (location.hash && SEO && SEO.fromHash(location.hash)) route(); });

  // ---------- Studio posts marked "Show on Today" go to the top of the feed ----------
  (function buildTodaySlides() {
    if (!C.today || !C.today.length) return;
    var feedEl = $('#pFeed'), html = '';
    C.today.forEach(function (t) {
      if (t.type === 'verse') {
        var v = C.verses[t.i];
        var longVerse = isLongVerse(v);
        html += '<article class="p-slide s1 s-studio" data-c="#fffaf0" data-cn="#dfe6ff"><div class="p-stars"></div><div class="p-kicker">Verse</div>' +
          '<div class="verse' + (longVerse ? ' preview' : '') + '">“' + esc(v.text) + '”</div><div class="ref">' + esc(v.ref.toUpperCase()) + ' · ' + esc(v.translation) + '</div>' +
          '<div class="p-btns"><button class="p-btn" type="button" ' + (longVerse ? 'data-open-verse="' + t.i + '">Read full passage' : 'data-go="verses">More verses') + '</button><button class="p-btn ghost" type="button" data-save-verse="' + t.i + '">Save image</button></div></article>';
      } else if (t.type === 'devotion') {
        var d = C.devotions[t.i];
        html += '<article class="p-slide s2 s-studio" data-c="#fff5f9" data-cn="#f6b3cb"><div class="p-kicker">' + esc(d.kicker.replace(' read', '')) + '</div>' +
          '<div class="big">' + esc(d.title) + '</div><p>' + esc(d.teaser) + '</p><div class="p-btns"><button class="p-btn" type="button" data-sheet="' + t.i + '">Read ↑</button>' +
          (d.episode >= 0 ? '<button class="p-btn ghost" type="button" data-ep="' + d.episode + '">▶ Listen</button>' : '') + '</div></article>';
      } else if (t.type === 'reel') {
        var r = C.reels[t.i];
        html += '<article class="p-slide s3 s-studio" data-c="#fff" data-cn="#ffc9b8"><div class="p-kicker">Reel' + (r.len ? ' · ' + esc(r.len) : '') + '</div>' +
          '<div class="big">' + esc(r.title) + '</div><div class="p-btns"><button class="p-btn" type="button" data-reel="' + t.i + '">▶ Watch</button></div></article>';
      } else if (t.type === 'audio') {
        var e = C.episodes[t.i];
        html += '<article class="p-slide s4 s-studio" data-c="#fff" data-cn="#d9c8f7"><div class="p-kicker">Audio · ' + fmt(e.dur) + '</div>' +
          '<div class="big">' + esc(e.title) + '</div><p>' + esc(e.meta) + '</p><div class="p-btns"><button class="p-btn" type="button" data-ep="' + t.i + '">▶ Play</button><button class="p-btn ghost" type="button" data-go="listen">All audio</button></div></article>';
      } else if (t.type === 'game') {
        var n = C.news[t.i];
        html += '<article class="p-slide s5 s-studio" data-c="#fff3c4" data-cn="#cfeed6"><div class="p-stars"></div><div class="p-kicker">Game</div>' +
          '<div class="big">' + esc(n.title) + '</div>' + (n.text ? '<p>' + esc(n.text) + '</p>' : '') + '<div class="p-btns"><button class="p-btn" type="button" data-go="play">See the game</button></div></article>';
      }
    });
    feedEl.insertAdjacentHTML('afterbegin', html);
    var lists = { devotion: C.devotions, reel: C.reels, audio: C.episodes, verse: C.verses, game: C.news };
    $$('#pFeed .p-slide.s-studio').forEach(function (s, k) { var t = C.today[k]; var it = t && lists[t.type] && lists[t.type][t.i]; if (it) s.dataset.date = it.date || ''; });
    var hint = $('#pHint');
    if (hint) { feedEl.firstElementChild.appendChild(hint); feedEl.firstElementChild.classList.add('has-hint'); }
  })();

  // ---------- day / night and calm mode ----------
  // The owl flies in only when night mode starts (or the app opens at night), never on navigation.
  function flyOwl() {
    var o = $('#pOwl'); if (!o) return;
    o.classList.remove('fly'); void o.offsetWidth; o.classList.add('fly');
    o.addEventListener('animationend', function done(e) { if (e.target === o) { o.classList.remove('fly'); o.removeEventListener('animationend', done); } });
  }
  function setNight(on, save) {
    var was = app.classList.contains('night');
    app.classList.toggle('night', on);
    if (window.LL_pagePalette) applyBook();
    if (on && !was) setTimeout(function () { if (!app.classList.contains('calm')) flyOwl(); if (window.LL_perchFit) window.LL_perchFit(); }, 0);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', on ? '#070b22' : '#0f0d20');
    $$('[data-mode]').forEach(function (b) {
      b.innerHTML = (on ? ICON_SUN : ICON_MOON) + '<span class="p-mlabel" aria-hidden="true">' + (on ? 'Day' : 'Night') + '</span>';
      b.setAttribute('aria-label', on ? 'Switch to day mode' : 'Switch to night mode');
      b.title = on ? 'Switch to day mode' : 'Switch to night mode';
    });
    if (save) store('theme', on ? 'night' : 'day');
  }
  function setCalm(on, save) {
    app.classList.toggle('calm', on);
    $$('[data-calm]').forEach(function (b) {
      b.innerHTML = ICON_LEAF + '<span class="p-mlabel" aria-hidden="true">Calm</span>';
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? 'Calm mode is on' : 'Calm mode: less movement';
    });
    if (save) { store('calm', on ? '1' : '0'); toast(on ? 'Calm mode on: less movement' : 'Calm mode off'); }
  }
  var savedTheme = store('theme');
  setNight(savedTheme ? savedTheme === 'night' : media('(prefers-color-scheme: dark)'), false);
  var savedCalm = store('calm');
  setCalm(savedCalm ? savedCalm === '1' : media('(prefers-reduced-motion: reduce)'), false);
  var motionPreference = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionPreference && motionPreference.addEventListener) motionPreference.addEventListener('change', function (e) {
    if (store('calm') == null) setCalm(e.matches, false);
  });

  // ---------- light wakes up on activity, dims when idle ----------
  var idleT;
  function wake() {
    app.classList.add('awake');
    clearTimeout(idleT);
    idleT = setTimeout(function () { app.classList.remove('awake'); }, 2600);
  }
  app.addEventListener('scroll', wake, true);
  app.addEventListener('wheel', wake, { passive: true });
  app.addEventListener('keydown', wake);
  wake();

  // ---------- colour ripple where you press ----------
  // Wordmark flare: a tap on touch screens flares the candle for 1.5s. Never blocks the tap, so the logo link still works.
  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse') return;
    document.documentElement.classList.add('wm-touch');
    var w = e.target.closest && e.target.closest('.wm, .p-brand, .p-logo, .brand');
    w = w && (w.classList.contains('wm') ? w : w.querySelector('.wm'));
    if (!w) return;
    w.classList.add('flaring');
    clearTimeout(w._flare);
    w._flare = setTimeout(function () { w.classList.remove('flaring'); }, 1500);
  }, { passive: true });
  app.addEventListener('pointerdown', function (e) {
    wake();
    if (app.classList.contains('calm')) return;
    var r = app.getBoundingClientRect();
    var slide = e.target.closest('.p-slide');
    var night = app.classList.contains('night');
    var c = slide ? (night ? slide.dataset.cn : slide.dataset.c) : TAB_COLOR[current];
    // one soft glow, then five thin rings: each later ring is smaller and fainter
    var rings = [{ a: .22, s: 2.2, t: 0, g: true },
                 { a: .42, s: 6.2, t: 0 }, { a: .32, s: 5.2, t: 150 }, { a: .24, s: 4.3, t: 300 },
                 { a: .16, s: 3.5, t: 450 }, { a: .1, s: 2.8, t: 600 }];
    rings.forEach(function (k) {
      var d = document.createElement('span');
      d.className = 'p-tapr' + (k.g ? ' glow' : '');
      d.style.left = (e.clientX - r.left) + 'px';
      d.style.top = (e.clientY - r.top) + 'px';
      d.style.setProperty('--c', c);
      d.style.setProperty('--a', k.a);
      d.style.setProperty('--s', k.s);
      d.style.animationDelay = k.t + 'ms';
      app.appendChild(d);
      setTimeout(function () { d.remove(); }, 1400 + k.t);
    });
  });

  // ---------- computer layout: the sky fills the page behind the Today feed ----------
  // On a phone the first post is the whole screen, so its sun, clouds, stars and owl are the
  // background already. On a computer the feed is a narrow column, so they move to a sky layer
  // behind the whole Today page, and move back if the window becomes narrow.
  (function sky() {
    var today = $('.v-today'), wide = window.matchMedia ? window.matchMedia('(min-width: 900px)') : null;
    if (!today || !wide) return;
    var layer = document.createElement('div');
    layer.className = 'p-sky';
    today.insertBefore(layer, today.firstChild);
    var parts = ['.s1 .p-stars', '.s1 .p-orb', '.s1 .p-clouds', '.s5 .p-flyowl'].reduce(function (all, sel) {
      return all.concat($$(sel).map(function (el) { return { el: el, home: el.parentNode, next: el.nextSibling }; }));
    }, []);
    function place() {
      parts.forEach(function (p) {
        if (wide.matches) layer.appendChild(p.el);
        else p.home.insertBefore(p.el, p.next && p.next.parentNode === p.home ? p.next : null);
      });
    }
    // The owl's perch sits in the page itself on a computer (so it scrolls with the welcome text and
    // the cards never cover it), sized to the free space between the header and the first card.
    var perch = $('#pPerch'), perchHome = perch && perch.parentNode, perchNext = perch && perch.nextSibling;
    function perchFit() {
      if (!perch) return;
      if (!wide.matches) { perch.classList.remove('no-room'); perch.style.removeProperty('--perch-top'); perch.style.removeProperty('--perch-size'); return; }
      var stage = $('.v-today .p-stage'); if (!stage || !today.offsetParent) return;
      var top = stage.getBoundingClientRect().top - today.getBoundingClientRect().top + today.scrollTop;
      var size = Math.min(120, (top - 4 - 10) / 0.933);
      perch.classList.toggle('no-room', size < 56);
      perch.style.setProperty('--perch-size', Math.round(size) + 'px');
      perch.style.setProperty('--perch-top', Math.round(top - 4 - 0.933 * size) + 'px');
    }
    function placePerch() {
      if (!perch) return;
      if (wide.matches) { if (perch.parentNode !== today) today.insertBefore(perch, layer.nextSibling); }
      else if (perch.parentNode !== perchHome) perchHome.insertBefore(perch, perchNext && perchNext.parentNode === perchHome ? perchNext : null);
      perchFit(); perchTuck();
    }
    // The nav is glass now, so anything scrolling under it shows through. Tuck the owl away (fade) as
    // soon as any part of it would slide under the header/nav, and bring it back when it is clear.
    function perchTuck() {
      if (!perch) return;
      if (!wide.matches) { perch.classList.remove('tucked'); return; }
      var owl = $('#pOwl'), bar = $('.p-tabs'); if (!owl || !bar) return;
      var navBottom = Math.max(bar.getBoundingClientRect().bottom, ($('.p-brand') || bar).getBoundingClientRect().bottom);
      perch.classList.toggle('tucked', owl.getBoundingClientRect().top < navBottom + 2);
    }
    if (today) today.addEventListener('scroll', perchTuck, { passive: true });
    window.addEventListener('resize', function () { requestAnimationFrame(perchTuck); });
    window.LL_perchTuck = perchTuck;
    window.LL_perchFit = perchFit;
    place(); placePerch();
    window.addEventListener('resize', perchFit);
    if (window.ResizeObserver) new ResizeObserver(perchFit).observe(today);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(perchFit);
    function onWide() { place(); placePerch(); }
    if (wide.addEventListener) wide.addEventListener('change', onWide); else if (wide.addListener) wide.addListener(onWide);
  })();

  // ---------- pause animations off screen and when the app is hidden ----------
  document.addEventListener('visibilitychange', function () { app.classList.toggle('asleep', document.hidden); });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { en.target.classList.toggle('inview', en.isIntersecting); });
    }, { threshold: 0.2 });
    $$('.p-feed .p-slide').forEach(function (s) { io.observe(s); });
  } else {
    $$('.p-feed .p-slide').forEach(function (s) { s.classList.add('inview'); });
  }

  // ---------- today feed: travelling light and swipe hint ----------
  var feed = $('#pFeed'), light = $('#pLight');
  if (store('swiped') === '1') app.classList.add('swiped');
  feed.addEventListener('scroll', function () {
    var max = feed.scrollHeight - feed.clientHeight;
    var h = light.parentElement.clientHeight - 12;
    light.style.top = (max > 0 ? feed.scrollTop / max : 0) * h + 'px';
    if (feed.scrollTop > 40 && !app.classList.contains('swiped')) { app.classList.add('swiped'); store('swiped', '1'); }
  }, { passive: true });

  // ---------- owl says hello ----------
  var owl = $('#pOwl'), hoot = $('#pHoot'), hootT;
  if (owl) owl.addEventListener('click', function () {
    if (!app.classList.contains('calm')) {
      owl.classList.remove('hoot'); void owl.offsetWidth; owl.classList.add('hoot');
    }
    hoot.classList.add('on');
    clearTimeout(hootT);
    hootT = setTimeout(function () { hoot.classList.remove('on'); owl.classList.remove('hoot'); }, 1600);
  });

  // ---------- reels ----------
  function reelScene(kind) {
    if (kind === 'robe') return '<svg viewBox="0 0 300 600" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%"><rect width="300" height="600" fill="#e46a4c"/><circle cx="240" cy="120" r="60" fill="#f59a7c"/><circle cx="105" cy="250" r="30" fill="#2b0d05" opacity=".85"/><rect x="75" y="285" width="60" height="110" rx="24" fill="#2b0d05" opacity=".85"/><circle cx="200" cy="250" r="30" fill="#fff"/><rect x="170" y="285" width="60" height="110" rx="24" fill="#fff"/><path class="drift" d="M130 300 l36 -14 l12 48 l-40 10z" fill="#f7c23f"/><rect y="420" width="300" height="180" fill="#c9533a"/></svg>';
    if (kind === 'rain') {
      var drops = '';
      for (var i = 0; i < 26; i++) drops += '<i style="left:' + (i * 11.5 % 100) + '%;animation-delay:' + (-(i * 0.37) % 1.1).toFixed(2) + 's"></i>';
      return '<div class="rain" style="position:absolute;inset:0;background:linear-gradient(#3d7fc4,#2a5d99)">' + drops + '</div><svg viewBox="0 0 300 600" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;width:100%;height:100%"><g class="bob"><path d="M40 360 h220 l-30 60 h-160z" fill="#8a5a33"/><rect x="90" y="310" width="120" height="50" rx="8" fill="#a8744a"/><rect x="130" y="325" width="18" height="18" rx="4" fill="#fff3c4"/></g><path d="M0 430 Q75 405 150 430 T300 430 V600 H0Z" fill="#1f4f86"/></svg>';
    }
    return '<svg viewBox="0 0 300 600" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%"><rect width="300" height="600" fill="#1f3a6e"/><circle cx="150" cy="150" r="40" fill="#fff3c4" opacity=".9"/><g class="swim"><path d="M60 330 q80 -60 170 0 q-90 60 -170 0z" fill="#62a6ea"/><path d="M225 330 l35 -25 v50z" fill="#62a6ea"/><circle cx="95" cy="322" r="5" fill="#1f3a6e"/></g><path d="M0 420 Q40 400 80 420 T160 420 T240 420 T320 420 V600 H0Z" fill="#16305c"/><path d="M0 460 Q40 440 80 460 T160 460 T240 460 T320 460 V600 H0Z" fill="#102447"/></svg>';
  }
  // YouTube is only ever embedded from youtube-nocookie with rel=0, and only once the player is opened.
  function ytId(u) { var m = String(u || '').match(/(?:youtu\.be\/|[?&]v=|\/embed\/|\/shorts\/)([\w-]{11})/); return m ? m[1] : ''; }
  function ytEmbed(id) { return 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=' + encodeURIComponent(location.origin); }
  window.LL_ytEmbed = ytEmbed; window.LL_ytId = ytId;
  var reelsEl = $('#pReels');
  function rIcon(d) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>'; }
  // Each reel (episode) plays alone with one progress bar. The old `parts` field is no longer read.
  // Built-in reels (the ones with made thumbnails) have a WebP copy of their poster (scripts/make-thumbs.py),
  // a third of the JPEG's size; the player shows that. The JPEG stays for link previews and JSON-LD.
  function playerPoster(r) { return r.poster && r.thumb && /-poster\.jpg$/.test(r.poster) ? r.poster.replace(/\.jpg$/, '.webp') : (r.poster || ''); }
  function partsOf(r) { return [{ src: r.src || '', youtube: r.youtube || '', len: r.len || '', kind: r.kind, bg: r.bg, poster: playerPoster(r) }]; }
  // Series: reels sharing `series` (fields.series) are grouped and ordered by `episode` (fields.episode).
  // A unit is one series or one standalone reel. Cover art = first episode's art; description =
  // fields.series_description from any episode, otherwise the first episode's caption.
  function units() {
    var by = {}, list = [];
    C.reels.forEach(function (r, i) {
      var s = String(r.series || '').trim();
      if (!s) { list.push({ series: '', eps: [i] }); return; }
      if (!by[s]) { by[s] = { series: s, eps: [] }; list.push(by[s]); }
      by[s].eps.push(i);
    });
    list.forEach(function (u) {
      u.eps.sort(function (a, b) { return (C.reels[a].episode || 999) - (C.reels[b].episode || 999) || a - b; });
      u.date = u.eps.reduce(function (m, k) { var d = C.reels[k].date || ''; return dateOf(d) > dateOf(m) ? d : m; }, '');
      var first = C.reels[u.eps[0]];
      u.cover = first; u.desc = u.series ? (u.eps.map(function (k) { return C.reels[k].seriesDesc || C.reels[k].series_description; }).filter(Boolean)[0] || first.caption || '') : first.caption || '';
      u.title = u.series || first.title; u.key = u.series ? 'series:' + u.series : 'reel:' + u.eps[0];
    });
    return list;
  }
  function unitOf(i) { return units().filter(function (u) { return u.eps.indexOf(i) >= 0; })[0]; }
  function unitWatched(u) { return u.eps.every(function (k) { return isWatched(k); }); }
  function firstUnwatched(u) { return u.eps.filter(function (k) { return !isWatched(k); })[0]; }
  function epLabel(i) { var r = C.reels[i]; return r.series && r.episode ? 'Ep ' + r.episode + ' · ' : ''; }
  function storyKey(r) { return 'reel:' + String(r.title || '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  var curStory = -1, parts = [];
  // Video reels start muted (autoplay rules); the sound toggle unmutes inside the tap itself
  // (required by iOS Safari) and the choice lasts for this session across reels.
  var reelSound = false; try { reelSound = sessionStorage.getItem('ll.reelSound') === '1'; } catch (x) {}
  function soundIcon(on) { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/>' + (on ? '<path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>' : '<path d="M16 9l5 6M21 9l-5 6"/>') + '</svg>'; }
  function paintSound() {
    $$('.p-rsound', reelsEl).forEach(function (b) {
      b.setAttribute('aria-pressed', String(reelSound)); b.setAttribute('aria-label', reelSound ? 'Turn sound off' : 'Turn sound on');
      b.innerHTML = soundIcon(reelSound) + '<span class="p-rsound-t">' + (reelSound ? 'Sound on' : 'Tap for sound') + '</span>';
    });
  }
  function setSound(on) {
    reelSound = on; try { sessionStorage.setItem('ll.reelSound', on ? '1' : '0'); } catch (x) {}
    $$('.p-reel video', reelsEl).forEach(function (v) { v.muted = !on; if (on) v.volume = 1; });
    var el = reelEl(visibleReel), v = el && el.querySelector('video');
    if (v && on && v.paused && isPlaying()) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    paintSound();
  }
  function renderReelStory(i) {
    var r = C.reels[i]; curStory = i; parts = partsOf(r);
    // Read only shows when its devotion slug resolves (a draft post isn't in C.devotions, so no dead link).
    // Read / Listen only appear when the reel post links a devotion (fields.devotion = slug) or audio (fields.audio = title).
    var acts = '<button type="button" class="save p-ract' + (savedReels[i] ? ' saved' : '') + '" aria-label="Save">' + rIcon('M6 3h12v18l-6-4-6 4z') + '<span>Save</span></button>' +
      '<button type="button" class="share p-ract" aria-label="Share">' + rIcon('M4 12v7h16v-7M12 3v12M7 8l5-5 5 5') + '<span>Share</span></button>' +
      (r.caption ? '<button type="button" class="more p-ract p-rcc" aria-label="Show caption" aria-expanded="false" aria-haspopup="dialog"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="6" width="17" height="12" rx="3"/><text x="12" y="15.2" text-anchor="middle">CC</text></svg><span>Caption</span></button>' : '') +
      (r.read && indexBySlug(r.read) >= 0 ? '<button type="button" class="p-ract" data-read-slug="' + esc(r.read) + '" aria-label="Read the devotion">' + rIcon('M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3zM21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z') + '<span>Read</span></button>' : '') +
      (r.listen ? '<button type="button" class="p-ract" data-listen-title="' + esc(r.listen) + '" aria-label="Listen">' + rIcon('M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v6H4zM17 14h3v6h-3z') + '<span>Listen</span></button>' : '');
    var many = parts.length > 1;
    reelsEl.innerHTML = parts.map(function (pt, k) {
      var yid = ytId(pt.youtube);
      var scene = pt.src
        ? '<video src="' + esc(pt.src) + '"' + (pt.poster ? ' poster="' + esc(pt.poster) + '"' : '') + ' width="1080" height="1920" playsinline muted preload="none" style="width:100%;height:100%;object-fit:cover"></video>'
        : yid ? '<div class="p-yt-slot" data-yt="' + yid + '" style="position:absolute;inset:0;background:#000"></div>'
        : reelScene(pt.kind);
      return '<article class="p-reel' + (pt.src ? ' is-video' : '') + '" data-i="' + i + '" data-p="' + k + '" style="--rc:' + esc(pt.bg) + ';background:' + esc(pt.bg) + '" aria-label="' + esc(r.title) + (many ? ', part ' + (k + 1) + ' of ' + parts.length : '') + '">' +
        '<div class="scene"><div class="p-rkb">' + scene + '</div></div><div class="p-rfade" aria-hidden="true"></div>' +
        '<div class="p-rtop"><div class="p-rsegs" aria-hidden="true"></div><div class="p-rtoprow"><span class="p-rchip">Reel' + (many ? ' · ' + (k + 1) + '/' + parts.length : '') + (pt.len ? ' · ' + esc(pt.len) : '') + '</span>' +
          (pt.src ? '<button type="button" class="p-rsound" aria-pressed="' + reelSound + '" aria-label="' + (reelSound ? 'Turn sound off' : 'Turn sound on') + '">' + soundIcon(reelSound) + '<span class="p-rsound-t">' + (reelSound ? 'Sound on' : 'Tap for sound') + '</span></button>' : '') + '</div></div>' +
        '<div class="tapzone p-rzones"><button type="button" class="z-prev" aria-label="Previous part"><span aria-hidden="true">‹</span></button><button type="button" class="z-mid" aria-label="Pause or play"></button><button type="button" class="z-next" aria-label="Next part"><span aria-hidden="true">›</span></button></div>' +
        (pt.src ? '<div class="p-rwait" hidden><span class="p-rspin" aria-hidden="true"></span><span class="p-rwait-t" role="status">Loading the video…</span><button type="button" class="p-rretry" hidden>Try again</button></div>' +
          '<button type="button" class="p-rtap" hidden aria-label="Tap to play the video"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg><span>Tap to play</span></button>' : '') +
        '<div class="p-rend" hidden></div><div class="paused" aria-hidden="true"><span class="ic-pause"></span><span class="ic-play"></span></div>' +
        '<div class="side">' + acts + '</div>' +
        '<div class="cap">' + (r.series ? '<span class="p-rseries">' + esc(r.series) + (r.episode ? ' · Episode ' + r.episode : '') + '</span>' : r.topic ? '<span class="p-rseries">' + esc(r.topic) + '</span>' : '') + '<b class="p-rtitle">' + esc(r.title) + '</b>' + (r.caption ? '<p>' + esc(r.caption) + '</p>' : '') +
        (pt.youtube && !yid ? '<a class="p-yt" href="' + esc(pt.youtube) + '" target="_blank" rel="noopener">Watch on YouTube</a>' : '') + '</div>' +
        '</article>';
    }).join('');
  }
  // Finished stories are remembered on this device only (localStorage); nothing is sent anywhere.
  function watchedMap() { try { return JSON.parse(store('watched') || '{}') || {}; } catch (e) { return {}; } }
  function isWatched(i) { return !!watchedMap()[storyKey(C.reels[i])]; }
  function markWatched(i) { var m = watchedMap(); m[storyKey(C.reels[i])] = 1; store('watched', JSON.stringify(m)); }
  window.LL_watched = { clear: function () { store('watched', '{}'); renderWatch(); }, get: watchedMap };
  var rSheet = document.createElement('div');
  rSheet.className = 'p-rsheet glass glass--dark'; rSheet.id = 'pReelSheet'; rSheet.hidden = true;
  rSheet.setAttribute('role', 'dialog'); rSheet.setAttribute('aria-modal', 'true'); rSheet.setAttribute('aria-labelledby', 'pReelSheetT');
  rSheet.innerHTML = '<div class="p-rsheet-in"><div class="bk-art" aria-hidden="true"></div><span class="bk-hair" aria-hidden="true"><i class="bk-led"></i></span><span class="handle" aria-hidden="true"></span>' +
    '<span class="bk-kick"></span><h3 id="pReelSheetT"></h3><i class="bk-rule" aria-hidden="true"></i><p></p>' +
    '<div class="bk-acts"><button type="button" class="bk-save" aria-pressed="false">' + rIcon('M6 3h12v18l-6-4-6 4z') + '<span>Save</span></button>' +
    '<button type="button" class="bk-share">' + rIcon('M4 12v7h16v-7M12 3v12M7 8l5-5 5 5') + '<span>Share</span></button></div>' +
    '<button type="button" class="p-rsheet-x" aria-label="Close caption">' + rIcon('M6 6l12 12M18 6L6 18') + '</button></div>';
  $('#pWatchPlayer').appendChild(rSheet);
  var rSheetFrom = null;
  // ---------- Desktop book spread: the caption becomes a tinted glass page beside the reel ----------
  // Page colours come from the reel (fields.page_color, else its theme colour); text and accent are
  // picked with a contrast check so any colour stays readable (AA). Phones keep the bottom sheet.
  var BOOK_MQ = matchMedia('(min-width: 900px)'), REEL_PAGE = { style: 'auto' }, rSheetI = -1;
  try { REEL_PAGE = JSON.parse(localStorage.getItem('ll.reelPage') || 'null') || REEL_PAGE; } catch (err) { /* storage blocked */ }
  if (window.LLStore && window.LLStore.getSetting) window.LLStore.getSetting('reel_page').then(function (v) {
    if (v && typeof v === 'object') { REEL_PAGE = { style: /^(auto|dark|light|clear)$/.test(v.style) ? v.style : 'auto' }; try { localStorage.setItem('ll.reelPage', JSON.stringify(REEL_PAGE)); } catch (err) { /* blocked */ } }
  }, function () {});
  var pg = {
    rgb: function (h) { h = h.replace('#', ''); return [0, 2, 4].map(function (k) { return parseInt(h.substr(k, 2), 16); }); },
    hex: function (c) { return '#' + c.map(function (v) { return ('0' + Math.round(Math.max(0, Math.min(255, v))).toString(16)).slice(-2); }).join(''); },
    hsl: function (c) { var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn, h = 0, s = 0;
      if (d) { s = d / (1 - Math.abs(2 * l - 1)); h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; } return [h, s, l]; },
    fromHsl: function (h, s, l) { var c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2, r = [0, 0, 0], k = Math.floor(h / 60) % 6;
      r = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k]; return pg.hex(r.map(function (v) { return (v + m) * 255; })); },
    lum: function (h) { return pg.rgb(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce(function (a, v, k) { return a + v * [0.2126, 0.7152, 0.0722][k]; }, 0); },
    ratio: function (a, b) { var x = pg.lum(a), y = pg.lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); },
    rgba: function (h, a) { return 'rgba(' + pg.rgb(h).join(',') + ',' + a + ')'; }
  };
  // style: 'dark' | 'light' | 'clear'. Returns CSS custom properties for the page.
  function pagePalette(base, style) {
    var hs = pg.hsl(pg.rgb(base)), h = hs[0], s = Math.min(Math.max(hs[1], 0.3), 0.62), v = {}, L;
    if (style === 'light') {
      v.p1 = pg.fromHsl(h, Math.min(s, 0.7), 0.94); v.p2 = pg.fromHsl(h, Math.min(s, 0.6), 0.88);
      v.text = pg.fromHsl(h, 0.45, 0.14); if (pg.ratio(v.text, v.p2) < 8) v.text = '#1F1420';
      for (L = 0.38; L > 0.12 && pg.ratio(pg.fromHsl(h, 0.65, L), v.p2) < 5.6; L -= 0.02); v.acc = pg.fromHsl(h, 0.65, L);
      v.onacc = pg.ratio('#FFF8EE', v.acc) >= 5 ? '#FFF8EE' : '#FFFFFF'; v.hair = '#B07A1E'; v.a1 = 0.93; v.a2 = 0.96;
    } else {
      v.p1 = pg.fromHsl(h, s, 0.24); v.p2 = pg.fromHsl(h, s * 0.95, 0.15);
      v.text = pg.ratio('#FBF3E6', v.p1) >= 7 ? '#FBF3E6' : '#FFFFFF';
      for (L = 0.72; L < 0.94 && pg.ratio(pg.fromHsl(h, 0.8, L), v.p1) < 5.6; L += 0.02); v.acc = pg.fromHsl(h, 0.8, L);
      v.onacc = pg.fromHsl(h, 0.55, 0.12); if (pg.ratio(v.onacc, v.acc) < 5) v.onacc = '#1B1020';
      v.hair = '#F2C46B'; v.a1 = style === 'clear' ? 0.66 : 0.86; v.a2 = style === 'clear' ? 0.74 : 0.92;
    }
    v.style = style; return v;
  }
  window.LL_pagePalette = pagePalette;
  function bookStyle(r) {
    var st = r.pageStyle && r.pageStyle !== 'auto' ? r.pageStyle : REEL_PAGE.style && REEL_PAGE.style !== 'auto' ? REEL_PAGE.style : '';
    return st || (app.classList.contains('night') ? 'dark' : 'light');
  }
  function applyBook() {
    var open = !rSheet.hidden && rSheetI >= 0;
    wPlayer.classList.toggle('book', open && BOOK_MQ.matches); wPlayer.classList.toggle('capopen', open);
    // Native video controls (and their floating mute pill) must not sit on top of the caption sheet.
    if (!open) return;
    var r = C.reels[rSheetI], base = r.pageColor || (parts[visibleReel] || r).bg || '#3B1F4A', v = pagePalette(base, bookStyle(r)), inn = rSheet.querySelector('.p-rsheet-in');
    inn.dataset.style = v.style;
    [['p1', v.p1], ['p2', v.p2], ['text', v.text], ['acc', v.acc], ['onacc', v.onacc], ['hair', v.hair]].forEach(function (x) { inn.style.setProperty('--bk-' + x[0], x[1]); });
    // Clear glass: a light tint so the moving reel reads through (phone sheet 0.24 -> 0.34; the
    // desktop book page a little denser, 0.40 -> 0.50). Text gets its own soft halo (--bk-halo).
    var gA = BOOK_MQ.matches ? [0.40, 0.50] : [0.24, 0.34];
    inn.style.setProperty('--bk-t1', pg.rgba(v.p1, gA[0])); inn.style.setProperty('--bk-t2', pg.rgba(v.p2, gA[1]));
    var hc = v.style === 'light' ? v.p1 : v.p2; inn.style.setProperty('--bk-halo', pg.rgba(hc, 0.55)); inn.style.setProperty('--bk-halo2', pg.rgba(hc, v.style === 'light' ? 0.86 : 0.72)); inn.style.setProperty('--bk-edge', pg.rgba(v.acc, 0.6));
    // The blurred reel art seen through the page: built-in scenes are SVG copies; a video reel shows
    // its own video (a muted twin kept in sync with playback, see syncBookArt).
    var src = reelEl(visibleReel), kb = src && src.querySelector('.p-rkb'), art = rSheet.querySelector('.bk-art'), sv0 = kb && kb.querySelector('video');
    // A video reel shows its poster here (no second download of the video).
    if (sv0) { var pst = sv0.getAttribute('poster'); art.innerHTML = pst ? '<img alt="" src="' + esc(pst) + '" style="width:100%;height:100%;object-fit:cover">' : ''; }
    else art.innerHTML = kb && !kb.querySelector('iframe, .p-yt-slot') ? kb.innerHTML : '';
    art.style.background = base;
    var sv = src && src.querySelector('.save'); rSheet.querySelector('.bk-save').setAttribute('aria-pressed', String(!!(sv && sv.classList.contains('saved'))));
  }
  // Caption text: blank lines (\n\n) become separate <p>s, built with textContent (no HTML parsing).
  function setCaption(p0, text) {
    var paras = String(text || '').split(/\n\s*\n/).map(function (t) { return t.trim(); }).filter(Boolean), at = p0;
    Array.prototype.forEach.call(p0.parentNode.querySelectorAll('p[data-para]'), function (x) { x.remove(); });
    p0.textContent = paras[0] || '';
    paras.slice(1).forEach(function (t) { var p = document.createElement('p'); p.dataset.para = '1'; p.textContent = t; at.after(p); at = p; });
  }
  function openReelSheet(i, from) {
    var r = C.reels[i], pt = parts[visibleReel] || r;
    rSheetFrom = from; rSheetI = i; rSheet.querySelector('h3').textContent = r.title; setCaption(rSheet.querySelector('p'), r.caption);
    rSheet.querySelector('.bk-kick').textContent = r.series ? r.series + (r.episode ? ' · Episode ' + r.episode : '') : 'Reel' + (pt.len ? ' · ' + pt.len : '');
    rSheet.hidden = false; if (from) from.setAttribute('aria-expanded', 'true'); applyBook(); wakeOverlay(); rSheet.querySelector('.p-rsheet-x').focus();
  }
  function closeReelSheet() { if (rSheet.hidden) return false; rSheet.hidden = true; applyBook(); var tw = rSheet.querySelector('.bk-art video'); if (tw) tw.pause(); if (rSheetFrom) { rSheetFrom.setAttribute('aria-expanded', 'false'); rSheetFrom.focus(); } wakeOverlay(); updateReels(); return true; }
  // Keep the blurred twin video behind the glass page in step with the reel.
  function syncBookArt() {
    var tw = rSheet.querySelector('.bk-art video'); if (!tw || rSheet.hidden) return;
    var el = reelEl(visibleReel), v = el && el.querySelector('video'); if (!v) return;
    if (Math.abs((tw.currentTime || 0) - (v.currentTime || 0)) > 0.4) try { tw.currentTime = v.currentTime; } catch (x) {}
    if (!v.paused && tw.paused) { var q = tw.play(); if (q && q.catch) q.catch(function () {}); } else if (v.paused && !tw.paused) tw.pause();
  }
  if (BOOK_MQ.addEventListener) BOOK_MQ.addEventListener('change', applyBook);
  rSheet.addEventListener('click', function (e) {
    if (e.target.closest('.bk-save')) { var sv = reelEl(visibleReel) && reelEl(visibleReel).querySelector('.save'); if (sv) sv.click(); applyBook(); return; }
    if (e.target.closest('.bk-share')) { var sh = reelEl(visibleReel) && reelEl(visibleReel).querySelector('.share'); if (sh) sh.click(); return; }
    if (e.target === rSheet || e.target.closest('.p-rsheet-x')) closeReelSheet();
  });
  // Title/topic overlay on playing video reels rests at 60% opacity and wakes to 100% on touch,
  // tap, hover, focus or an open caption; it settles again after ~3s idle (CSS does the fade).
  var wakeT = 0;
  function wakeOverlay() {
    if (!reelsEl) return; reelsEl.classList.add('awake'); clearTimeout(wakeT);
    wakeT = setTimeout(function () { if (rSheet.hidden) reelsEl.classList.remove('awake'); else wakeOverlay(); }, 3000);
  }
  ['pointerdown', 'pointermove', 'focusin', 'keydown', 'wheel'].forEach(function (ev) { reelsEl.addEventListener(ev, wakeOverlay, { passive: true }); });
  // Auto-hide: while a video reel plays, the close button, top row, actions, caption and nav arrows
  // fade out after ~3s without interaction (the progress line stays). A tap while they are hidden only
  // brings them back (it does not pause); a key press, focus or mouse move does too. They always show
  // when paused, ended, loading, on an error, on "Tap to play" or with the caption sheet open.
  var chromeT = 0, CHROME_MS = 3000;
  function chromeHeld() {
    var el = reelEl(visibleReel), v = el && el.querySelector('video');
    return !watchOpen || !el || !v || v.paused || v.ended || !isPlaying() || ended || !rSheet.hidden ||
      el.classList.contains('vwait') || el.classList.contains('verror') || el.classList.contains('needtap');
  }
  function chromeHidden() { return !!wPlayer && wPlayer.classList.contains('r-idle'); }
  function showChrome() {
    if (!wPlayer) return; wPlayer.classList.remove('r-idle'); clearTimeout(chromeT); chromeT = 0;
    if (!chromeHeld()) chromeT = setTimeout(function () { chromeT = 0; if (!chromeHeld()) wPlayer.classList.add('r-idle'); }, CHROME_MS);
  }
  function syncChrome() {
    if (!wPlayer) return;
    if (chromeHeld()) { wPlayer.classList.remove('r-idle'); clearTimeout(chromeT); chromeT = 0; }
    else if (!chromeT && !chromeHidden()) showChrome();
  }
  var wpEl = $('#pWatchPlayer');
  if (wpEl) wpEl.addEventListener('pointerdown', function () {
    if (!chromeHidden()) { showChrome(); return; }
    showChrome(); reelsEl._suppress = Date.now();      // this tap only reveals: the click that follows is ignored
  }, { capture: true, passive: true });
  if (wpEl) wpEl.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') showChrome(); }, { passive: true });
  if (wpEl) ['keydown', 'focusin', 'wheel'].forEach(function (ev) { wpEl.addEventListener(ev, showChrome, { passive: true }); });
  // Press feedback: the pressed control shows at 100% at once (touch browsers apply :active late or not at all).
  reelsEl.addEventListener('pointerdown', function (e) { var b = e.target.closest('.side .p-ract, .p-rsound'); if (b) b.classList.add('pressed'); }, { passive: true });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { reelsEl.addEventListener(ev, function () { $$('.pressed', reelsEl).forEach(function (b) { b.classList.remove('pressed'); }); }, { passive: true }); });
  // ---------- Story player ----------
  // The progress bars and taps move between the parts of the open story only; the end screen offers
  // Watch again and up to two unwatched stories instead of running into the next story by itself.
  var seq = [], pos = 0, visibleReel = 0, clock = { t: 0, dur: 0, real: false, last: 0 }, raf = 0, holdT = 0, held = false, ended = false;
  var savedReels = {};
  try { savedReels = JSON.parse(store('savedReels') || '{}') || {}; } catch (err) { savedReels = {}; }
  function lenSec(s) { var m = String(s || '').match(/(\d+):(\d\d)/); return m ? +m[1] * 60 + +m[2] : 30; }
  function reelEl(k) { return reelsEl.querySelector('.p-reel[data-p="' + k + '"]'); }
  function motionOff() { return app.classList.contains('calm') || matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function buildSegs() {
    $$('.p-reel', reelsEl).forEach(function (el) {
      var k = +el.dataset.p;
      el.querySelector('.p-rsegs').innerHTML = seq.map(function (_, n) { return '<i class="' + (n < k ? 'done' : n === k ? 'cur' : '') + '"><b></b></i>'; }).join('');
    });
  }
  function paint() { var el = reelEl(visibleReel); if (!el) return; var b = el.querySelector('.p-rsegs i.cur b'); if (b) b.style.transform = 'scaleX(' + Math.min(1, clock.dur ? clock.t / clock.dur : 0).toFixed(4) + ')'; }
  function isPlaying() { var el = reelEl(visibleReel); return watchOpen && current === 'watch' && el && !el.classList.contains('userpaused') && !held && !ended; }
  function ytSend(el, func, args) { var f = el && el.querySelector('.p-yt-slot iframe'); if (f && f.contentWindow) f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), '*'); }
  function reelTick(now) {
    raf = 0; if (!watchOpen) return;
    var el = reelEl(visibleReel), v = el && el.querySelector('video'), dt = clock.last ? (now - clock.last) / 1000 : 0; clock.last = now;
    if (v && isFinite(v.duration) && v.duration > 0) { clock.real = true; clock.dur = v.duration; clock.t = v.currentTime; if (v.ended) clock.t = clock.dur; }
    // Fallback (built-in scenes only): the chip duration. A video's clock only moves with its own
    // currentTime once its duration is known, so a stalled or blocked video never skips ahead.
    else if (!v && !clock.real && isPlaying()) clock.t += dt;
    paint(); syncBookArt();
    if (clock.dur && clock.t >= clock.dur - 0.05 && !ended) { nextReel(true); }
    raf = requestAnimationFrame(reelTick);
  }
  window.addEventListener('message', function (e) {
    if (!/youtube(-nocookie)?\.com$/.test(String(e.origin).replace(/^https?:\/\/(www\.)?/, ''))) return;
    var d; try { d = JSON.parse(e.data); } catch (x) { return; }
    var el = reelEl(visibleReel), f = el && el.querySelector('.p-yt-slot iframe'); if (!f || e.source !== f.contentWindow) return;
    var info = d && d.info; if (!info) return;
    if (info.duration) { clock.real = true; clock.dur = info.duration; }
    if (info.currentTime != null) clock.t = info.currentTime;
    if (info.playerState === 0) clock.t = clock.dur;
  });
  function updateReels() {
    // The caption page's running light follows playback (paused, held or ended: it stops in place).
    if (wPlayer) wPlayer.classList.toggle('rplaying', !!isPlaying());
    $$('.p-reel', reelsEl).forEach(function (el) {
      var i = +el.dataset.i, on = watchOpen && +el.dataset.p === visibleReel;
      el.classList.toggle('on', on);
      var playing = on && isPlaying();
      el.classList.toggle('playing', playing);
      if (on) reelsEl.style.setProperty('--rc', parts[+el.dataset.p].bg);
      var slot = el.querySelector('.p-yt-slot');
      if (slot) {
        if (on) { if (!slot.firstChild) { slot.innerHTML = '<iframe src="' + ytEmbed(slot.dataset.yt) + '" title="' + esc(C.reels[i].title) + '" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" style="width:100%;height:100%;border:0"></iframe>';
            slot.firstChild.addEventListener('load', function () { this.contentWindow.postMessage(JSON.stringify({ event: 'listening' }), '*'); }); }
          ytSend(el, playing ? 'playVideo' : 'pauseVideo'); }
        else slot.innerHTML = '';
      }
      var v = el.querySelector('video');
      if (v) {
        v.muted = !reelSound;
        var near = on || (watchOpen && +el.dataset.p === seq[pos + 1]);
        if (near && v.getAttribute('preload') !== 'metadata') v.setAttribute('preload', 'metadata');
        else if (!near && v.getAttribute('preload') !== 'none') v.setAttribute('preload', 'none');
        wireVideo(el, v);
        if (playing && !el.classList.contains('needtap')) playVideo(el, v); else v.pause();
      }
    });
    if (watchOpen && !raf) { clock.last = 0; raf = requestAnimationFrame(reelTick); }
    syncChrome();
  }
  // Video health: a calm spinner while it waits for data, a retry if it fails, and a visible
  // "Tap to play" whenever the browser refuses to start it (Low Power Mode, data saver, etc.).
  function setWait(el, mode) {
    var w = el.querySelector('.p-rwait'); if (!w) return;
    el.classList.toggle('vwait', mode === 'wait'); el.classList.toggle('verror', mode === 'error');
    w.hidden = !mode; w.querySelector('.p-rretry').hidden = mode !== 'error';
    w.querySelector('.p-rwait-t').textContent = mode === 'error' ? 'The video didn’t load.' : 'Loading the video…';
    syncChrome();
  }
  function needTap(el, on) { var b = el.querySelector('.p-rtap'); if (!b) return; el.classList.toggle('needtap', !!on); b.hidden = !on; if (on) setWait(el, ''); syncChrome(); }
  function playVideo(el, v) {
    var p; try { p = v.play(); } catch (x) { needTap(el, true); return; }
    if (!p || !p.then) return;
    p.then(function () { needTap(el, false); }, function (err) {
      if (err && err.name === 'AbortError') return;                 // paused or swapped on purpose
      if (!v.muted && err && err.name === 'NotAllowedError') {       // sound not allowed: try muted
        v.muted = true; reelSound = false; paintSound();
        v.play().then(function () { needTap(el, false); }, function (e2) { if (!e2 || e2.name !== 'AbortError') needTap(el, true); });
      } else if (err && err.name === 'NotAllowedError') needTap(el, true);
      else setWait(el, 'error');                                     // can't decode/load: offer Try again
    });
  }
  function wireVideo(el, v) {
    if (v._ll) return; v._ll = 1; var timer = 0;
    var waitSoon = function () { clearTimeout(timer); timer = setTimeout(function () { if (!v.paused && v.readyState < 3) setWait(el, 'wait'); }, 600); };
    v.addEventListener('waiting', waitSoon); v.addEventListener('stalled', waitSoon);
    ['playing', 'canplay', 'pause'].forEach(function (t) { v.addEventListener(t, function () { clearTimeout(timer); if (!el.classList.contains('verror')) setWait(el, ''); }); });
    v.addEventListener('playing', function () { needTap(el, false); });
    ['playing', 'pause', 'ended'].forEach(function (t) { v.addEventListener(t, syncChrome); });
    v.addEventListener('error', function () { clearTimeout(timer); setWait(el, 'error'); });
  }
  function showReel(k, again) {
    if (k < 0 || k >= seq.length) return;
    var prev = reelEl(visibleReel); if (prev) { prev.classList.remove('userpaused', 'flash'); var pv = prev.querySelector('video'); if (pv) { pv.pause(); } }
    pos = k; visibleReel = seq[k]; ended = false;
    var el = reelEl(visibleReel); el.querySelector('.p-rend').hidden = true;
    var v = el.querySelector('video'); if (v) try { v.currentTime = 0; } catch (x) {}
    if (again) ytSend(el, 'seekTo', [0, true]);
    clock = { t: 0, dur: lenSec(parts[visibleReel].len), real: false, last: 0 };
    reelsEl.classList.toggle('instant', motionOff());
    buildSegs(); paint(); updateReels();
  }
  function restartReel() { var el = reelEl(visibleReel), v = el.querySelector('video'); if (v) try { v.currentTime = 0; } catch (x) {} ytSend(el, 'seekTo', [0, true]); clock.t = 0; ended = false; el.querySelector('.p-rend').hidden = true; paint(); updateReels(); }
  function nextReel(auto) {
    if (pos < seq.length - 1) { showReel(pos + 1); return; }
    endStory(!!auto);
  }
  // End screen: Next episode if there is one; otherwise Back to series (for a series) and up to two other
  // unwatched series or reels. Nothing starts by itself.
  function endStory(finished) {
    if (ended) return;
    ended = true; clock.t = clock.dur; paint(); if (finished) { markWatched(curStory); countEvent('reel', reelKey(curStory), 'finished'); }
    var el = reelEl(visibleReel), end = el.querySelector('.p-rend'), u = unitOf(curStory), at = u.eps.indexOf(curStory), nx = u.series ? u.eps[at + 1] : undefined;
    var html = '<b>' + (nx != null ? 'Up next' : 'That’s all for now') + '</b>';
    if (nx != null) { var n = C.reels[nx]; html += '<button type="button" class="p-rnext p-rnextep" data-story="' + nx + '" style="--bg:' + esc(n.bg) + '"><span class="p-wthumb">' + thumb(n) + '</span><span class="p-rnext-t"><small>Next episode</small><b>' + esc(epLabel(nx) + n.title) + '</b></span></button>'; }
    html += '<div class="p-rendbtns"><button type="button" class="p-ragain">↻ Watch again</button>' + (u.series ? '<button type="button" class="p-rback" data-series="' + esc(u.series) + '">Back to series</button>' : '') + '</div>';
    if (nx == null) {
      var others = unitOrder().filter(function (o) { return o.key !== u.key && !unitWatched(o); }).slice(0, 2);
      if (others.length) html += '<div class="p-rnexts" role="group" aria-label="More to watch">' + others.map(function (o) {
        return '<button type="button" class="p-rnext" ' + (o.series ? 'data-series="' + esc(o.series) + '"' : 'data-story="' + o.eps[0] + '"') + ' style="--bg:' + esc(o.cover.bg) + '"><span class="p-wthumb">' + thumb(o.cover) + '</span><span class="p-rnext-t"><small>' + (o.series ? 'Series · ' + o.eps.length + ' episodes' : 'Watch next') + '</small><b>' + esc(o.title) + '</b></span></button>'; }).join('') + '</div>';
    }
    if (window.LL_SEO && LL_SEO.followHtml) html += LL_SEO.followHtml({ tag: 'p', cls: 'in-reel', sub: false });
    end.innerHTML = html; end.hidden = false; updateReels(); renderWatch();
    (end.querySelector('.p-rnextep') || end.querySelector('.p-ragain')).focus();
  }
  function prevReel() { if (clock.t > 3 || pos === 0) restartReel(); else showReel(pos - 1); }
  function togglePause(el) { el.classList.toggle('userpaused'); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); updateReels(); }
  window.LL_reel = { sound: function () { return reelSound; }, next: function () { nextReel(); }, prev: prevReel, show: showReel, seek: function (t) { clock.t = t; paint(); }, open: function (i) { openStory(i); }, state: function () { return { story: curStory, parts: parts.length, pos: pos, reel: visibleReel, seq: seq.slice(), t: clock.t, dur: clock.dur, real: clock.real, ended: ended, playing: !!isPlaying() }; } };
  // Tap zones (left third: previous/restart, centre: pause, right third: next), press-and-hold pauses, swipe navigates.
  var down = null;
  reelsEl.addEventListener('pointerdown', function (e) {
    var z = e.target.closest('.p-rzones button'); if (!z || e.button > 0) return;
    down = { x: e.clientX, y: e.clientY, z: z }; held = false;
    clearTimeout(holdT); holdT = setTimeout(function () { held = true; updateReels(); }, 300);
  });
  function endPress(e) {
    clearTimeout(holdT); if (!down) return;
    var d = down; down = null;
    if (held) { held = false; d.suppress = true; updateReels(); reelsEl._suppress = Date.now(); return; }
    var dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) { reelsEl._suppress = Date.now(); if (dx < 0) nextReel(); else prevReel(); }
    else if (Math.abs(dy) > 60) { reelsEl._suppress = Date.now(); if (dy < 0) nextReel(); else prevReel(); }
  }
  reelsEl.addEventListener('pointerup', endPress);
  reelsEl.addEventListener('pointercancel', function () { clearTimeout(holdT); down = null; if (held) { held = false; updateReels(); } });
  reelsEl.addEventListener('click', function (e) {
    var reel = e.target.closest('.p-reel');
    if (!reel) return;
    var i = +reel.dataset.i;
    if (e.target.closest('.p-rsound')) { e.stopPropagation(); e.preventDefault(); setSound(!reelSound); return; }
    // "Tap to play" is drawn over the middle tap zone; a tap there (or on the button itself) starts the video.
    var midR = e.target.closest('.z-mid') && e.target.closest('.p-reel.needtap');
    var tapB = midR ? midR.querySelector('.p-rtap') : e.target.closest('.p-rtap, .p-rretry');
    if (tapB) {
      var rl = tapB.closest('.p-reel'), vv = rl && rl.querySelector('video'); if (!vv) return;
      if (tapB.classList.contains('p-rretry')) { setWait(rl, 'wait'); var cur = vv.currentTime || 0; vv.load(); try { vv.currentTime = cur; } catch (x) {} }
      rl.classList.remove('userpaused'); needTap(rl, false); playVideo(rl, vv); updateReels(); return;
    }
    if (e.target.closest('.p-rzones') && !e.target.closest('.p-rend')) {
      if (reelsEl._suppress && Date.now() - reelsEl._suppress < 400) { reelsEl._suppress = 0; return; }
      if (e.target.closest('.z-next')) nextReel(); else if (e.target.closest('.z-prev')) prevReel(); else togglePause(reel);
      return;
    }
    e.stopPropagation();
    var ser = e.target.closest('[data-series]');
    if (ser) { closeWatch(); openSeries(ser.dataset.series); }
    else if (e.target.closest('.p-rnext')) { openStory(+e.target.closest('.p-rnext').dataset.story); }
    else if (e.target.closest('.p-ragain')) { showReel(0, true); var z = reelEl(visibleReel).querySelector('.z-mid'); if (z) z.focus(); }
    else if (e.target.closest('.more')) { openReelSheet(i, e.target.closest('.more')); updateReels(); }
    else if (e.target.closest('[data-read-slug]')) { closeWatch(); navigate(SEO.path('read', e.target.closest('[data-read-slug]').dataset.readSlug)); }
    else if (e.target.closest('[data-listen-title]')) { var t = e.target.closest('[data-listen-title]').dataset.listenTitle; closeWatch(); var k = C.episodes.findIndex(function (x) { return x.title === t; }); go('listen'); if (k >= 0) playEp(k); } else if (e.target.closest('.save')) {
      var s = e.target.closest('.save');
      s.classList.toggle('saved');
      savedReels[i] = s.classList.contains('saved');
      store('savedReels', JSON.stringify(savedReels));
      toast(savedReels[i] ? 'Saved on this device' : 'Removed from saved');
    } else if (e.target.closest('.share')) {
      share(C.reels[i].title, C.reels[i].caption, location.origin + SEO.path('watch', SEO.reelSlug(C.reels[i])));
    }
  });
  // ---------- Watch gallery: featured hero + thumbnail grid; the feed opens in a glass player ----------
  var watchOpen = false, watchReturn = null, wPlayer = $('#pWatchPlayer'), wGal = $('#pWatchGal');
  // Built-in reels have 16:9 thumbnails (scripts/make-thumbs.py) at 360 and 720 px in AVIF and WebP;
  // the first (featured) one is not lazy-loaded and is fetched first, because it is the biggest picture.
  var THUMB_SIZES = { hero: '(min-width: 1100px) 720px, (min-width: 900px) 60vw, 100vw', card: '(min-width: 900px) 260px, 50vw' };
  function thumb(r, first) {
    var yid = ytId(r.youtube);
    var load = first ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
    if (r.src && r.poster && r.thumb) {
      var set = function (ext) { return esc(r.thumb) + '-360.' + ext + ' 360w, ' + esc(r.thumb) + '-720.' + ext + ' 720w'; };
      var sizes = first ? THUMB_SIZES.hero : THUMB_SIZES.card;
      return '<picture><source type="image/avif" srcset="' + set('avif') + '" sizes="' + sizes + '"><source type="image/webp" srcset="' + set('webp') + '" sizes="' + sizes + '">' +
        '<img src="' + esc(r.thumb) + '-720.webp" alt="" width="720" height="405" ' + load + '></picture>';
    }
    if (r.src && r.poster) return '<img src="' + esc(r.poster) + '" alt="" ' + load + '>';
    if (r.src) return '<div class="p-wscene" aria-hidden="true">' + reelScene(r.kind) + '</div>';  // no poster yet: scene art, never a <video>
    if (yid) return '<img src="https://i.ytimg.com/vi/' + yid + '/hqdefault.jpg" alt="" ' + load + ' referrerpolicy="no-referrer">';
    return '<div class="p-wscene" aria-hidden="true">' + reelScene(r.kind) + '</div>';
  }
  function playIcon() { return '<span class="p-wplay" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>'; }
  // Order: the chosen sort (Latest/Oldest by post date), then unwatched stories before watched ones.
  // Order: the chosen sort (series sorted by their newest episode), then unwatched before watched.
  function unitOrder() {
    var us = units(), idx = sortIdx(us.map(function (_, k) { return k; }), function (k) { return us[k].date; }, fstate('watch').sort);
    var o = idx.map(function (k) { return us[k]; });
    return o.filter(function (u) { return !unitWatched(u); }).concat(o.filter(unitWatched));
  }
  function watchOrder() { return [].concat.apply([], unitOrder().map(function (u) { return u.eps; })); }
  function tickHtml(on) { return on ? '<span class="p-wwatched"><span aria-hidden="true">✓</span> Watched</span>' : ''; }
  function unitAttrs(u) { return u.series ? 'data-series="' + esc(u.series) + '"' : 'data-watch="' + u.eps[0] + '"'; }
  // The buttons are named by the text they show (so the name always contains the visible words, WCAG
  // 2.5.3), plus a hidden note saying what tapping does.
  function unitAction(u) { return '<span class="p-vh">, ' + (u.series ? 'series, open' : 'play') + '</span>'; }
  function renderWatch() {
    wGal.removeAttribute('aria-busy');
    // One <h1> per page: the prerendered page says which level the "Watch" title is (data-h: h1 on
    // /watch, h2 where the page already has its own h1, e.g. a video's title on /watch/<slug>). The
    // hidden .p-seo block (the post's h1 and text) is kept.
    var seoBlock = wGal.querySelector('.p-seo'), hTag = wGal.getAttribute('data-h') === 'h1' && !seoBlock ? 'h1' : 'h2';
    if (!C.reels.length) { wGal.innerHTML = '<div class="p-wempty glass glass--dark"><b>No videos yet</b><p>New Bible story videos are on their way. Check back soon.</p></div>'; return; }
    var order = unitOrder(), h = order[0], hr = h.cover, anyW = C.reels.some(function (_, k) { return isWatched(k); });
    var focusWas = document.activeElement && wGal.contains(document.activeElement) ? (document.activeElement.dataset.watch || document.activeElement.dataset.series) : null;
    var badge = function (u) { return u.series ? '<span class="p-weps">' + u.eps.length + ' episode' + (u.eps.length === 1 ? '' : 's') + '</span>' : (u.cover.len ? '<span class="p-wdur">' + esc(u.cover.len) + '</span>' : ''); };
    wGal.innerHTML = '<div class="p-wtop"><' + hTag + ' class="p-wtitle">Watch</' + hTag + '>' + (anyW ? '<button type="button" class="p-wclear" data-clear-watched>Clear watched</button>' : '') + '</div>' +
      filterBar('watch', order.length, []) +
      '<button type="button" class="p-whero glass glass--dark' + (unitWatched(h) ? ' watched' : '') + (h.series ? ' is-series' : '') + '" ' + unitAttrs(h) + ' style="--bg:' + esc(hr.bg) + '">' +
      '<span class="p-wthumb">' + thumb(hr, true) + '</span><span class="p-wshade"></span>' + playIcon() +
      '<span class="p-winfo"><span class="p-kicker">' + (h.series ? 'Series · ' + h.eps.length + ' episode' + (h.eps.length === 1 ? '' : 's') : (unitWatched(h) ? 'Watched' : 'Featured') + (hr.len ? ' · ' + esc(hr.len) : '')) + '</span><b>' + esc(h.title) + '</b>' + unitAction(h) + (h.desc ? '<small aria-hidden="true">' + esc(h.desc) + '</small>' : '') + '</span>' + tickHtml(unitWatched(h)) + '</button>' +
      (order.length > 1 ? '<h2 class="p-wsub">More videos</h2><div class="p-wgrid">' + order.slice(1).map(function (u) {
        var r = u.cover;
        return '<button type="button" class="p-wcard' + (unitWatched(u) ? ' watched' : '') + (u.series ? ' is-series' : '') + '" ' + unitAttrs(u) + ' style="--bg:' + esc(r.bg) + '">' +
          '<span class="p-wthumb">' + thumb(r) + (u.series ? '' : playIcon()) + badge(u) + tickHtml(unitWatched(u)) + '</span>' +
          '<b>' + esc(u.title) + '</b>' + (u.series ? '<small class="p-wkind">Series</small>' : '') + unitAction(u) + '</button>';
      }).join('') + '</div>' : '');
    if (seoBlock) wGal.appendChild(seoBlock);
    if (focusWas != null) { var f = wGal.querySelector('[data-watch="' + focusWas + '"], [data-series="' + focusWas.replace(/"/g, '\\"') + '"]'); if (f) f.focus(); }
    if (seriesOpen) renderSeries(seriesOpen);
  }
  // ---------- series detail: glass sheet with cover, description and episode list ----------
  var seriesEl = document.createElement('div'), seriesOpen = '', seriesReturn = null;
  seriesEl.className = 'p-series'; seriesEl.id = 'pSeries'; seriesEl.hidden = true;
  seriesEl.setAttribute('role', 'dialog'); seriesEl.setAttribute('aria-modal', 'true'); seriesEl.setAttribute('aria-labelledby', 'pSeriesT');
  $('.v-watch').appendChild(seriesEl);
  function renderSeries(name) {
    var u = units().filter(function (x) { return x.series === name; })[0]; if (!u) { closeSeries(); return; }
    var nx = firstUnwatched(u), start = nx != null ? nx : u.eps[0], started = u.eps.some(function (k) { return isWatched(k); });
    var focusWas = seriesEl.contains(document.activeElement) ? document.activeElement.dataset.story || document.activeElement.className : null;
    seriesEl.innerHTML = '<div class="p-series-in glass glass--dark">' +
      '<button type="button" class="p-series-x" aria-label="Close series">' + rIcon('M6 6l12 12M18 6L6 18') + '</button>' +
      '<div class="p-series-cover" style="--bg:' + esc(u.cover.bg) + '"><span class="p-wthumb">' + thumb(u.cover) + '</span><span class="p-wshade"></span></div>' +
      '<div class="p-series-body"><span class="p-kicker">Series · ' + u.eps.length + ' episode' + (u.eps.length === 1 ? '' : 's') + (unitWatched(u) ? ' · Watched' : '') + '</span>' +
      '<h2 id="pSeriesT">' + esc(u.series) + '</h2>' + (u.desc ? '<p>' + esc(u.desc) + '</p>' : '') +
      '<button type="button" class="p-series-play" data-story="' + start + '">▶ ' + (started && nx != null ? 'Continue' : 'Play') + ' · ' + esc(epLabel(start).replace(/ · $/, '') || C.reels[start].title) + '</button>' +
      '<ol class="p-eps">' + u.eps.map(function (k) { var r = C.reels[k], w = isWatched(k);
        return '<li><button type="button" class="p-ep' + (w ? ' watched' : '') + '" data-story="' + k + '" aria-label="' + esc(epLabel(k) + r.title + (r.len ? ', ' + r.len : '') + (w ? ', watched' : '')) + '">' +
          '<span class="p-wthumb">' + thumb(r) + '</span><span class="p-ep-t"><b>' + esc(epLabel(k) + r.title) + '</b><small>' + esc(r.len || '') + '</small></span>' +
          (w ? '<span class="p-ep-tick" aria-hidden="true">✓</span>' : '') + '</button></li>'; }).join('') + '</ol></div></div>';
    if (focusWas) { var f = seriesEl.querySelector('[data-story="' + focusWas + '"]') || seriesEl.querySelector('.' + String(focusWas).split(' ')[0]); if (f) f.focus(); }
  }
  function seriesHead(name) {
    var u = units().filter(function (x) { return x.series === name; })[0];
    if (!SEO || !u) return;
    setPath(SEO.path('series', SEO.slugify(name)), true);
    setHead(SEO.meta('series', { series: name, desc: u.desc }));
  }
  function openSeries(name) {
    if (!seriesOpen) seriesReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    seriesOpen = name; renderSeries(name); seriesEl.hidden = false; seriesEl.querySelector('.p-series-x').focus();
    seriesHead(name);
  }
  // quiet: the router is already changing the address.
  function closeSeries(quiet) {
    if (!seriesOpen) return false; var name = seriesOpen; seriesOpen = ''; seriesEl.hidden = true;
    if (quiet !== true && SEO && location.pathname.indexOf('/watch/') === 0) { setPath('/watch', true); pageHead('watch'); }
    var back = seriesReturn && wGal.contains(seriesReturn) ? seriesReturn : $$('[data-series]', wGal).filter(function (b) { return b.dataset.series === name; })[0]; if (back) back.focus(); return true;
  }
  window.LL_series = { open: openSeries, close: closeSeries, units: function () { return units().map(function (u) { return { series: u.series, eps: u.eps.slice(), date: u.date, watched: unitWatched(u) }; }); } };
  seriesEl.addEventListener('click', function (e) {
    if (e.target === seriesEl || e.target.closest('.p-series-x')) { closeSeries(); return; }
    var b = e.target.closest('[data-story]'); if (b) openReel(+b.dataset.story);
  });
  seriesEl.addEventListener('keydown', function (e) {
    if (watchOpen) return;
    if (e.key === 'Escape') { e.stopPropagation(); closeSeries(); }
    if (e.key === 'Tab') { var f = $$('button', seriesEl); var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); } }
  });
  FILTER_APPLY.watch = renderWatch;
  renderWatch();
  wGal.addEventListener('click', function (e) { var b = e.target.closest('[data-watch]'); if (b) openReel(+b.dataset.watch); var sr = e.target.closest('[data-series]'); if (sr) openSeries(sr.dataset.series); var cl = e.target.closest('[data-clear-watched]'); if (cl) { window.LL_watched.clear(); var h = wGal.querySelector('.p-whero'); if (h) h.focus(); } });
  function closeWatch(quiet) {
    if (!watchOpen) return;
    rSheet.hidden = true; wPlayer.classList.remove('book', 'capopen'); watchOpen = false; wPlayer.hidden = true; wPlayer.classList.remove('on'); updateReels();
    if (quiet !== true && SEO && location.pathname.indexOf('/watch/') === 0) { if (seriesOpen) seriesHead(seriesOpen); else { setPath('/watch', true); pageHead('watch'); } }
    if (watchReturn && document.contains(watchReturn)) watchReturn.focus();
  }
  window.LL_closeWatch = closeWatch;
  $('#pWatchClose').addEventListener('click', function () { closeWatch(); });
  wPlayer.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.stopPropagation(); if (!closeReelSheet()) closeWatch(); }
    if (e.key === 'Tab') { var f = $$('#pWatchPlayer button, #pWatchPlayer a[href], #pWatchPlayer iframe, #pWatchPlayer video').filter(function (x) { return x.offsetParent; });
      if (!f.length) return; var a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); } }
  });
  // openReel(i): opens story i; its parts are the sequence.
  function openStory(i) {
    rSheet.hidden = true; wPlayer.classList.remove('book', 'capopen'); renderReelStory(i); seq = parts.map(function (_, k) { return k; });
    showReel(0); $('#pWatchClose').focus();
    countEvent('reel', reelKey(i), 'started');
  }
  function openReel(i) {
    if (!watchOpen) watchReturn = document.activeElement;
    if (current !== 'watch') { if (navState('watch') !== 'on') { go('watch'); return; } show('watch'); }
    if (SEO && C.reels[i]) { setPath(SEO.path('watch', SEO.reelSlug(C.reels[i])), true); setHead(SEO.meta('reel', C.reels[i])); }
    watchOpen = true; wPlayer.hidden = false; wPlayer.classList.add('on');
    setTimeout(function () { openStory(i); }, 0);
  }
  document.addEventListener('keydown', function (e) {
    if (current !== 'watch' || !watchOpen || !rSheet.hidden || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { nextReel(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { prevReel(); e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Spacebar') { if (!ended) togglePause(reelEl(visibleReel)); e.preventDefault(); }
  });

  // ---------- anonymous play/read counter (Studio Insights) ----------
  // Adds 1 to a per-post, per-day number in Supabase (public.increment_post_stat). Strictly anonymous:
  // no IP is stored, no user id, cookie, localStorage id or fingerprint is sent or kept, and no
  // credentials or referrer go with the request. At most once per page load per post and event.
  var counted = {};
  function slugKey(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }
  function countEvent(kind, slug, ev) {
    var cfg = window.LL_CONFIG || {}, k = slugKey(slug);
    if (!k || !cfg.supabaseUrl || !cfg.supabaseAnonKey || counted[kind + ':' + k + '|' + ev]) return;
    counted[kind + ':' + k + '|' + ev] = 1;
    try {
      fetch(cfg.supabaseUrl + '/rest/v1/rpc/increment_post_stat', {
        method: 'POST', keepalive: true, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
        headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_post_id: kind + ':' + k, p_event: ev })
      }).catch(function () {});
    } catch (x) {}
  }
  window.LL_countEvent = countEvent;
  function reelKey(i) { var r = C.reels[i]; return r ? (SEO ? SEO.reelSlug(r) : (r.slug || r.title)) : ''; }

  // ---------- audio: real files when `src` is set, otherwise a silent demo ----------
  var player = { ep: -1, t: 0, playing: false }, tick = null;
  var audio = new Audio();
  audio.preload = 'none';
  audio.addEventListener('timeupdate', function () { player.t = audio.currentTime; renderPlayer(); });
  audio.addEventListener('ended', function () { setPlaying(false); if (player.ep >= 0) countEvent('audio', C.episodes[player.ep].title, 'finished'); });
  function hasSrc() { return player.ep >= 0 && !!C.episodes[player.ep].src; }
  function duration() { return hasSrc() && isFinite(audio.duration) ? audio.duration : C.episodes[player.ep].dur; }

  $('#pEps').innerHTML = C.episodes.map(function (e, i) {
    return '<button class="p-row" type="button" data-ep="' + i + '"><span class="p-art" style="background:' + e.color + '"><i></i></span>' +
      '<span><b>' + esc(e.title) + '</b><small>' + esc(e.meta) + ' · ' + fmt(e.dur) + '</small></span><span class="p-pp">' + ICON_PLAY + '</span></button>';
  }).join('');
  // ---------- read-along highlight (bedtime story pages) ----------
  // The sentence being read gets a soft gold background and the word a small underline. Tap (or Enter/Space)
  // on a sentence to jump the audio there. Timings come from the story's own JSON file (js/content.js
  // bedtimeStories[].timings, same site, cached by sw.js for offline). If the file is missing or doesn't
  // match the text, the page simply stays plain text. On/off is remembered on this device (ll.readAlong).
  var raCache = {};
  function readAlong(ep, x) {
    if (!x.timings || ep.getAttribute('data-ra-on') === x.slug) return;
    ep.setAttribute('data-ra-on', x.slug);
    var audio = $('audio', ep);
    if (!audio) return;
    var get = raCache[x.timings] || (raCache[x.timings] = fetch(/^https:\/\//i.test(x.timings) ? x.timings : '/' + x.timings.replace(/^\//, ''))
      .then(function (r) { if (!r.ok) throw new Error('timings ' + r.status); return r.json(); }));
    get.then(function (timings) {
      if (ep.getAttribute('data-slug') !== x.slug) return;
      var els = $$('[data-ra]', ep);
      var parts = els.map(function (el) { return { key: el.getAttribute('data-ra'), text: el.textContent }; });
      var m = SEO.raMatch(parts, timings);
      if (!m || !m.count) { console.info('Read-along off: the timings do not match the text'); return; }
      raStart(ep, audio, x, els, m);
    }).catch(function () { delete raCache[x.timings]; /* no timings: plain text */ });
  }
  function raStart(ep, audio, x, els, m) {
    var plain = els.map(function (el) { return el.innerHTML; });
    var on = store('readAlong') !== 'off', sens = [], cur = -1, curW = -1, raf = 0, userAt = 0;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'p-ra-toggle';
    audio.parentNode.appendChild(btn);
    function si(el) { return m.sentences[+el.getAttribute('data-si')]; }
    function draw() {
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.textContent = on ? 'Read-along highlight: on' : 'Read-along highlight: off';
      els.forEach(function (el, i) { el.innerHTML = on ? SEO.raHtml(m, el.getAttribute('data-ra'), x.word) : plain[i]; });
      ep.classList.toggle('p-ra', on);
      sens = on ? $$('.p-sen', ep) : [];
      cur = curW = -1;
      tick();
    }
    function find(t) {
      var k = -1;
      for (var i = 0; i < sens.length; i++) { if (si(sens[i]).start <= t) k = i; else break; }
      return k;
    }
    function tick() {
      if (!on) return;
      var t = audio.currentTime, k = audio.ended ? -1 : find(t);
      if (k > -1 && k === sens.length - 1 && t > si(sens[k]).end + 2) k = -1;
      if (k !== cur) {
        if (cur > -1 && sens[cur]) sens[cur].classList.remove('on');
        $$('.p-w.on', ep).forEach(function (w) { w.classList.remove('on'); });
        cur = k; curW = -1;
        if (k > -1) { sens[k].classList.add('on'); if (!audio.paused) follow(sens[k]); }
      }
      if (k > -1) {
        var s = si(sens[k]), wk = -1;
        if (s.words) for (var j = 0; j < s.words.length; j++) { if (s.words[j].start <= t) wk = j; else break; }
        if (wk !== curW) {
          var ws = $$('.p-w', sens[k]);
          if (ws[curW]) ws[curW].classList.remove('on');
          if (ws[wk]) ws[wk].classList.add('on');
          curW = wk;
        }
      }
    }
    // Gentle follow: only while playing, only when the sentence is off screen, and never within
    // 5 seconds of the reader scrolling themselves.
    function follow(el) {
      if (Date.now() - userAt < 5000) return;
      var r = el.getBoundingClientRect(), vh = window.innerHeight || 0;
      if (r.top >= 70 && r.bottom <= vh - 90) return;
      var still = app.classList.contains('calm') || media('(prefers-reduced-motion: reduce)');
      el.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
    }
    function loop() { tick(); raf = audio.paused ? 0 : requestAnimationFrame(loop); }
    function seek(el) {
      var s = si(el);
      if (!s) return;
      audio.currentTime = s.start;
      tick();
      if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
    }
    ['wheel', 'touchmove'].forEach(function (ev) { ep.addEventListener(ev, function () { userAt = Date.now(); }, { passive: true }); });
    ep.addEventListener('keydown', function (e) {
      var s = on && e.target.closest && e.target.closest('.p-sen');
      if (s && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); seek(s); return; }
      if (/^(PageUp|PageDown|ArrowUp|ArrowDown|Home|End| )$/.test(e.key)) userAt = Date.now();
    });
    ep.addEventListener('click', function (e) {
      var s = on && e.target.closest('.p-sen');
      if (s) { seek(s); return; }
      if (e.target === btn) { on = !on; store('readAlong', on ? 'on' : 'off'); draw(); }
    });
    audio.addEventListener('play', function () { userAt = 0; if (!raf) loop(); });
    ['pause', 'seeked', 'timeupdate', 'ended'].forEach(function (ev) { audio.addEventListener(ev, tick); });
    draw();
  }

  // "Goodnight Little Light": bedtime stories, each a link to its own page (/listen/<slug>).
  (function goodnightSection() {
    var list = C.bedtimeStories || [], wrap = $('#pGnWrap');
    if (!wrap || !SEO) return;
    $('#pGn').innerHTML = SEO.storyRowsHtml(list);
    wrap.hidden = !list.length;
  })();
  (function listenFilters() {
    var box = $('#pEps'), rows = $$('.p-row', box), types = [];
    rows.forEach(function (r) { var m = C.episodes[+r.dataset.ep].meta; if (m && types.indexOf(m) < 0) types.push(m); });
    function apply() {
      mountBar('listen', filterBar('listen', rows.length, types), box.closest('.p-list') || box);
      applyDom('listen', box, rows, function (r) { return C.episodes[+r.dataset.ep].date; }, function (r) { return C.episodes[+r.dataset.ep].meta; });
    }
    FILTER_APPLY.listen = apply; apply();
  })();
  (function oneEpisode() {
    var feat = $('[data-featured-audio="listen"]');
    var one = C.episodes.length === 1 && feat && !feat.hidden;
    $('.v-listen').classList.toggle('p-one-ep', !!one);
  })();
  function renderPlayer() {
    var has = player.ep >= 0;
    app.classList.toggle('has-mini', has);
    if (!has) return;
    var e = C.episodes[player.ep], d = duration();
    $('#pMiniArt').style.background = e.color;
    $('#pMiniTitle').textContent = e.title;
    $('#pMiniTime').textContent = fmt(player.t) + ' / ' + fmt(d);
    $('#pMiniProg').style.width = (player.t / d * 100) + '%';
    $('#pMiniPP').innerHTML = player.playing ? ICON_PAUSE : ICON_PLAY;
    $('#pMiniPP').setAttribute('aria-label', player.playing ? 'Pause' : 'Play');
    $$('.p-row').forEach(function (r) {
      var on = +r.dataset.ep === player.ep;
      r.classList.toggle('now', on);
      r.querySelector('.p-pp').innerHTML = on && player.playing ? ICON_PAUSE : ICON_PLAY;
    });
    var full = $('#pFull');
    if (full.classList.contains('on')) {
      full.classList.toggle('playing', player.playing);
      var rng = $('#pRange', full);
      if (rng && document.activeElement !== rng) { rng.max = Math.round(d); rng.value = player.t; }
      var tn = $('#pTimeNow', full); if (tn) tn.textContent = fmt(player.t);
      var mp = $('#pFullPP', full); if (mp) mp.innerHTML = player.playing ? ICON_PAUSE : ICON_PLAY;
    }
  }
  function setPlaying(p) {
    if (p) $$("#pEpisode audio").forEach(function (a) { a.pause(); });
    player.playing = p;
    clearInterval(tick);
    if (hasSrc()) {
      if (p) { var pr = audio.play(); if (pr && pr.catch) pr.catch(function () { player.playing = false; renderPlayer(); toast('Tap play again to start the audio'); }); }
      else audio.pause();
    } else if (p) {
      tick = setInterval(function () {
        player.t += 0.5;
        if (player.t >= C.episodes[player.ep].dur) { player.t = C.episodes[player.ep].dur; setPlaying(false); }
        renderPlayer();
      }, 500);
    }
    renderPlayer();
  }
  function seek(t) {
    player.t = Math.max(0, Math.min(duration(), t));
    if (hasSrc()) audio.currentTime = player.t;
    renderPlayer();
  }
  function playEp(i) {
    if (player.ep === i) { setPlaying(!player.playing); return; }
    setPlaying(false);
    player.ep = i; player.t = 0;
    if (C.episodes[i].src) { audio.src = C.episodes[i].src; audio.currentTime = 0; }
    setPlaying(true);
    toast('Playing: ' + C.episodes[i].title);
    countEvent('audio', C.episodes[i].title, 'started');
  }
  // Transcript as paragraphs: blank lines if the text has them, otherwise a few sentences each,
  // with a new paragraph where a prayer starts.
  function transcriptHtml(text) {
    text = String(text || '').trim();
    if (!text) return '';
    var blocks = text.split(/\n\s*\n/);
    if (blocks.length === 1) {
      blocks = [];
      var cur = [];
      (text.match(/[^.!?]+[.!?]+["”’)]*|[^.!?]+$/g) || [text]).forEach(function (s) {
        s = s.trim();
        if (!s) return;
        if (cur.length && (cur.length >= 3 || /^(Let us pray|Dear (Jesus|Lord|God|Father))/i.test(s))) { blocks.push(cur.join(' ')); cur = []; }
        cur.push(s);
      });
      if (cur.length) blocks.push(cur.join(' '));
    }
    return blocks.map(function (b) { return '<p>' + esc(b.trim()).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function openFull() {
    if (player.ep < 0) return;
    var e = C.episodes[player.ep], full = $('#pFull'), tx = transcriptHtml(e.transcript);
    full.innerHTML =
      '<div class="p-full-top"><span class="handle" aria-hidden="true"></span>' +
      '<button class="down" type="button" data-close aria-label="Close player"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></div>' +
      '<div class="bigart" style="background:radial-gradient(circle at 50% 40%,' + e.color + ',#2d2352 90%)"><i></i></div>' +
      '<div><b>' + esc(e.title) + '</b><br><small>' + esc(e.meta) + ' · Salt and Light</small></div>' +
      '<input type="range" id="pRange" min="0" max="' + Math.round(duration()) + '" step="1" value="' + player.t + '" aria-label="Position">' +
      '<div class="times"><span id="pTimeNow">' + fmt(player.t) + '</span><span>' + fmt(duration()) + '</span></div>' +
      '<div class="ctls"><button type="button" data-skip="-15">−15s</button><button class="main" type="button" id="pFullPP" aria-label="Play or pause"></button><button type="button" data-skip="15">+15s</button></div>' +
      (e.devotion != null ? '<button class="p-btn ghost readalong" type="button" data-read="' + e.devotion + '" style="color:#fff">Open the devotion</button>' : '') +
      (e.src ? '' : '<div class="note">Recording coming soon. This player shows progress without sound.</div>') +
      (tx ? '<section class="transcript" aria-labelledby="pTxHead" tabindex="0"><h4 id="pTxHead">Read along</h4>' + tx + '</section>' : '');
    full.classList.toggle('has-text', !!tx);
    full.classList.add('on');
    renderPlayer();
  }
  $('#pFull').addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) $('#pFull').classList.remove('on');
    else if (e.target.closest('#pFullPP')) setPlaying(!player.playing);
    else if (e.target.closest('[data-skip]')) seek(player.t + +e.target.closest('[data-skip]').dataset.skip);
  });
  $('#pFull').addEventListener('input', function (e) { if (e.target.id === 'pRange') seek(+e.target.value); });
  $('#pMiniPP').addEventListener('click', function () { setPlaying(!player.playing); });
  $('#pMiniOpen').addEventListener('click', openFull);
  $('#pMiniX').addEventListener('click', function () { setPlaying(false); player.ep = -1; audio.removeAttribute('src'); renderPlayer(); });

  // A bedtime story's own <audio> (on /listen/<slug>) and the app's player never play at once.
  $('#pEpisode').addEventListener('play', function () { if (player.playing) setPlaying(false); }, true);

  // ---------- read ----------
  $('#pCards').innerHTML = C.devotions.map(function (d, i) {
    return '<a class="p-card' + (i === 0 ? ' feat' : '') + '" data-i="' + i + '" href="/read/' + esc(d.slug) + '" style="--c:' + d.color + ';color:' + d.ink + ';text-decoration:none">' +
      '<span class="p-kicker">' + esc(d.kicker) + '</span><b>' + esc(d.title) + '</b><span>' + esc(d.teaser) + '</span>' +
      '<span class="foot"><span>Read →</span>' + (d.episode >= 0 ? '<span>▶ Audio ' + fmt(C.episodes[d.episode].dur) + '</span>' : '') + '</span></a>';
  }).join('');
  (function readFilters() {
    var box = $('#pCards'), cards = $$('.p-card', box);
    function apply() {
      mountBar('read', filterBar('read', cards.length, []), box);
      applyDom('read', box, cards, function (el) { return C.devotions[+el.dataset.i].date; }, function () { return ''; });
      cards.forEach(function (el) { el.classList.remove('feat'); }); var first = box.querySelector('.p-card:not(.f-out)'); if (first) first.classList.add('feat');
    }
    FILTER_APPLY.read = apply; apply();
  })();
  function openArticle(i, fromRoute) {
    if (!fromRoute) { navigate(SEO ? SEO.path('read', C.devotions[i].slug) : '#read/' + C.devotions[i].slug); return; }
    var d = C.devotions[i], a = $('#pArticle');
    // Opened from its own address: the page already holds this devotion (scripts/prerender.mjs), so
    // keep the text that is on screen and add only the buttons, instead of redrawing it all.
    var pre = a.getAttribute('data-slug') === d.slug && a.classList.contains('on') && a.querySelector('.body');
    a.removeAttribute('data-slug');
    if (!pre) app.classList.remove('p-boot');
    var top = '<button class="back" type="button" data-close>← Back</button>' +
      '<div class="hero" style="background:' + d.color + ';color:' + d.ink + '"><span class="p-kicker">' + esc(d.kicker) + '</span><h2>' + esc(d.title) + '</h2></div>' +
      '<div style="padding-top:16px;display:flex;gap:8px;flex-wrap:wrap">' + (d.episode >= 0 ? '<button class="p-btn listen" type="button" data-ep="' + d.episode + '">▶ Listen to this devotion</button>' : '') +
      '<button class="p-btn ghost" type="button" data-share-dev="' + i + '" style="background:rgba(0,0,0,.08);color:inherit">Share</button></div>';
    var same = document.createElement('div'); same.innerHTML = d.html;
    if (pre && pre.innerHTML === same.innerHTML) {
      while (a.firstChild !== pre) a.removeChild(a.firstChild);
      pre.insertAdjacentHTML('beforebegin', top);
    } else a.innerHTML = top + '<div class="body p-txt">' + d.html + '</div>' + (SEO && SEO.footerHtml ? SEO.footerHtml('a') : '');
    closeOverlays();
    a.classList.add('on');
    a.scrollTop = 0;
    readSlug = d.slug;
    setTimeout(function () { if (readSlug === d.slug && a.scrollHeight <= a.clientHeight + 80) countEvent('devotion', d.slug, 'read_end'); }, 4000);
    if (SEO) setHead(SEO.meta('devotion', d));
  }
  // read_end: the reader scrolled to the end of the devotion (counted once per page load).
  var readSlug = '';
  $('#pArticle').addEventListener('scroll', function () {
    var a = this;
    if (readSlug && a.classList.contains('on') && a.scrollTop + a.clientHeight >= a.scrollHeight - 80) countEvent('devotion', readSlug, 'read_end');
  }, { passive: true });
  function closeArticle() {
    readSlug = '';
    $('#pArticle').classList.remove('on');
    if (SEO && location.pathname.indexOf('/read/') === 0) setPath('/read', true);
    pageHead(current);
  }
  // Devotion preview: bottom sheet on phones, centred modal on computers. Focus stays inside while
  // it's open and goes back to the button that opened it; the page behind doesn't scroll.
  var sheetOpener = null;
  function openSheet(i) {
    var d = C.devotions[i];
    if (!d) return;
    sheetOpener = document.activeElement;
    var mins = /(\d+)\s*min/.exec(d.kicker || '');
    $('#pSheetMeta').innerHTML = esc('Devotion' + (mins ? ' · ' + mins[1] + ' min' : ''));
    $('#pSheetTitle').innerHTML = esc(d.title);
    $('#pSheetBody').innerHTML = '<div class="p-txt">' + d.html + '</div>';
    $('#pSheetFoot').innerHTML = '<button class="p-btn" type="button" data-read="' + i + '">Open as a page →</button>';
    $('#pSheetBody').scrollTop = 0;
    $('#pSheetWrap').classList.add('on');
    app.classList.add('sheet-open');
    $('#pSheetClose').focus();
  }
  function closeSheet() {
    var w = $('#pSheetWrap');
    if (!w.classList.contains('on')) return;
    w.classList.remove('on');
    app.classList.remove('sheet-open');
    var back = sheetOpener; sheetOpener = null;
    if (back && back.focus && document.contains(back)) back.focus();
  }
  $('#pSheetClose').addEventListener('click', closeSheet);
  $('#pSheetWrap').addEventListener('click', function (e) { if (e.target.id === 'pSheetWrap') closeSheet(); });
  $('#pSheetWrap').addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    var f = $$('button, [href], [tabindex]:not([tabindex="-1"])', $('#pSheetWrap .p-sheet')).filter(function (x) { return !x.disabled && x.offsetParent; });
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------- verses ----------
  var filter = 'All';
  $('#pChips').innerHTML = C.topics.map(function (t) {
    return '<button class="p-chip' + (t === 'All' ? ' on' : '') + '" type="button" data-chip="' + esc(t) + '" aria-pressed="' + (t === 'All') + '">' + esc(t) + '</button>';
  }).join('');
  function shown() {
    return sortIdx(C.verses.map(function (v, i) { return i; }), function (i) { return C.verses[i].date; }, fstate('verses').sort).filter(function (i) { return filter === 'All' || C.verses[i].topics.indexOf(filter) >= 0; });
  }
  function renderGrid() {
    $('#pGrid').innerHTML = shown().map(function (i, k) {
      var v = C.verses[i];
      return '<button class="p-tile vt' + (i % 3) + (k % 4 === 0 ? ' tall' : '') + (isLongVerse(v) ? ' long' : '') + '" type="button" data-verse="' + k + '"><small>' + esc(v.topics[0]) + '</small><em>“' + esc(v.text) + '”</em><small>' + esc(v.ref) + '</small></button>';
    }).join('');
  }
  renderGrid();
  FILTER_APPLY.verses = function () { mountBar('verses', filterBar('verses', C.verses.length, []), $('#pChips')); renderGrid(); };
  FILTER_APPLY.verses();
  $('#pChips').addEventListener('click', function (e) {
    var c = e.target.closest('[data-chip]');
    if (!c) return;
    filter = c.dataset.chip;
    $$('.p-chip').forEach(function (b) { b.classList.toggle('on', b === c); b.setAttribute('aria-pressed', b === c); });
    renderGrid();
  });
  var story = { list: [], k: 0, timer: null, single: false };
  function renderStory() {
    var el = $('#pStory'), i = story.list[story.k], v = C.verses[i], style = i % 3;
    var single = story.single || isLongVerse(v);
    el.style.background = style === 0 ? '#f7c23f' : style === 1 ? '#1b1638' : '#fdf8ea';
    el.style.color = style === 1 ? '#fbe6a6' : '#3b2412';
    el.classList.toggle('dark', style === 1);
    el.classList.toggle('long', single);
    el.innerHTML = (single ? '' : '<div class="bars">' + story.list.map(function (_, n) { return '<i class="' + (n < story.k ? 'done' : n === story.k ? 'now' : '') + '"></i>'; }).join('') + '</div>') +
      '<button class="close" type="button" data-close aria-label="Close">✕</button>' +
      (single ? '' : '<div class="tap"><button type="button" data-step="-1" aria-label="Previous verse"></button><button type="button" data-step="1" aria-label="Next verse"></button></div>') +
      '<div class="tag">' + esc(v.topics[0]) + '</div><div class="verse">“' + esc(v.text) + '”</div><div class="ref">' + esc(v.ref.toUpperCase()) + ' · ' + esc(v.translation || 'WEB') + '</div>' +
      '<div class="acts"><button class="p-btn" type="button" data-save-verse="' + i + '">Save image</button><button class="p-btn ghost" type="button" data-share-verse="' + i + '">Share</button></div>';
    clearTimeout(story.timer);
    if (!single) story.timer = setTimeout(function () { stepStory(1); }, 6000);
  }
  function stepStory(d) {
    story.k += d;
    if (story.k < 0) story.k = 0;
    if (story.k >= story.list.length) { closeStory(); return; }
    renderStory();
  }
  function closeStory() { clearTimeout(story.timer); $('#pStory').classList.remove('on'); }
  $('#pGrid').addEventListener('click', function (e) {
    var t = e.target.closest('[data-verse]');
    if (!t) return;
    story.list = shown(); story.k = +t.dataset.verse; story.single = isLongVerse(C.verses[story.list[story.k]]);
    $('#pStory').classList.add('on');
    renderStory();
  });
  function openFullVerse(i) {
    story.list = [i]; story.k = 0; story.single = true;
    $('#pStory').classList.add('on');
    renderStory();
  }
  $('#pStory').addEventListener('click', function (e) {
    if (e.target.closest('[data-close]')) closeStory();
    else if (e.target.closest('[data-step]')) stepStory(+e.target.closest('[data-step]').dataset.step);
    else if (e.target.closest('.acts')) clearTimeout(story.timer);
  });

  // ---------- verse images: 1080 x 1350, ready for Instagram ----------
  function verseImage(i) {
    var v = C.verses[i], night = app.classList.contains('night');
    var cv = document.createElement('canvas');
    cv.width = 1080; cv.height = 1350;
    var g = cv.getContext('2d');
    var bg = g.createRadialGradient(860, 260, 40, 700, 500, 1100);
    if (night) { bg.addColorStop(0, '#25306a'); bg.addColorStop(.5, '#111a44'); bg.addColorStop(1, '#070b22'); }
    else { bg.addColorStop(0, '#ffe089'); bg.addColorStop(.5, '#f7c23f'); bg.addColorStop(1, '#e0a820'); }
    g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
    var ink = night ? '#f3e9c6' : '#3b2412';
    // the light
    var glow = g.createRadialGradient(840, 300, 10, 840, 300, 190);
    glow.addColorStop(0, night ? 'rgba(255,255,255,.95)' : 'rgba(255,250,225,.95)');
    glow.addColorStop(.45, night ? 'rgba(214,221,240,.6)' : 'rgba(255,230,150,.6)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow; g.beginPath(); g.arc(840, 300, 190, 0, Math.PI * 2); g.fill();
    // text
    g.fillStyle = ink;
    function wrap(text, width) {
      var out = [];
      text.split('\n').forEach(function (para) {
        var line = '';
        para.split(/\s+/).filter(Boolean).forEach(function (w) {
          var test = line ? line + ' ' + w : w;
          if (g.measureText(test).width > width && line) { out.push(line); line = w; } else line = test;
        });
        out.push(line);
      });
      return out;
    }
    // Text sits between y = 250 (top) and 1180 (above the footer), starting at 710 when it is short.
    var size = 64, lines, lh, top;
    for (;;) {
      g.font = 'italic ' + size + 'px Newsreader, Georgia, serif';
      lines = wrap('“' + v.text + '”', 880);
      lh = Math.round(size * 1.24);
      top = Math.min(710, 1180 - lines.length * lh);
      if (top >= 250 || size <= 24) break;
      size -= 4;
    }
    var y = top;
    lines.forEach(function (l) { g.fillText(l, 96, y); y += lh; });
    g.font = '700 30px "Bricolage Grotesque", system-ui, sans-serif';
    g.fillText((v.topics[0] || 'Verse').toUpperCase(), 96, top - size - 30);
    g.fillText(v.ref.toUpperCase() + ' · ' + (v.translation || 'WEB'), 96, y + 20);
    g.globalAlpha = .75;
    g.fillText('Salt and Light', 96, 1260);
    g.globalAlpha = 1;
    return cv;
  }
  function saveVerse(i) {
    var cv = verseImage(i), name = 'little-light-' + C.verses[i].ref.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
    cv.toBlob(function (blob) {
      if (!blob) { toast('Could not create the image'); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      toast('Image saved');
    }, 'image/png');
  }

  // ---------- sharing ----------
  function share(title, text, url) {
    if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); return; }
    var msg = text + '\n' + url;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).then(function () { toast('Copied to share'); }, function () { toast(url); });
    } else toast(url);
  }
  function pageUrl(p) { return location.origin + p; }

  // ---------- play ----------
  $('#pMap').innerHTML = C.journeys.map(function (j) {
    return '<div class="p-stop"><span class="n" style="background:' + j.color + '">' + j.n + '</span><span><b>' + j.name + '</b><small>' + j.virtue + '</small></span>' +
      '<span class="st' + (j.status ? '' : ' wip') + '">' + (j.status || 'In progress') + '</span></div>';
  }).join('');

  var newsEl = $('#pGameNews');
  if (newsEl && C.news && C.news.length) {
    newsEl.innerHTML = '<div class="p-sec" style="color:inherit;padding-inline:4px">News</div>' + C.news.map(function (n) {
      return '<article class="p-newscard glass glass--light"><small>' + esc(new Date(n.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })) + '</small><b>' + esc(n.title) + '</b>' +
        (n.text ? '<p>' + esc(n.text) + '</p>' : '') + (n.button ? '<button class="p-btn" type="button" data-preview>' + esc(n.button) + '</button>' : '') + '</article>';
    }).join('');
  }

  // ---------- newsletter (connect to an email service later) ----------
  var news = $('#pNews');
  if (news) news.addEventListener('submit', function (e) {
    e.preventDefault();
    toast('Thank you! Sign-up opens when the email list is connected.');
    news.reset();
  });

  // ---------- install as an app ----------
  var installEvent = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    installEvent = e;
    $$('[data-install]').forEach(function (b) { b.hidden = false; });
  });
  window.addEventListener('appinstalled', function () {
    $$('[data-install]').forEach(function (b) { b.hidden = true; });
    toast('Salt and Light is installed');
  });

  // ---------- overlays and global buttons ----------
  function closeOverlays() {
    closeSoon();
    closeSheet();
    $('#pArticle').classList.remove('on');
    var ep = $('#pEpisode');
    if (ep.classList.contains('on')) { ep.classList.remove('on'); $$('audio', ep).forEach(function (a) { a.pause(); }); }
    $('#pFull').classList.remove('on');
    closeStory();
  }
  app.addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    var d = b.dataset;
    if (d.mode != null) setNight(!app.classList.contains('night'), true);
    else if (d.calm != null) setCalm(!app.classList.contains('calm'), true);
    else if (d.install != null && installEvent) { installEvent.prompt(); installEvent = null; }
    else if (d.soonClose != null) closeSoon();
    else if (d.go) go(d.go);
    else if (d.ep != null && !b.closest('#pFull')) playEp(+d.ep);
    else if (d.sheet != null) openSheet(+d.sheet);
    else if (d.openVerse != null) openFullVerse(+d.openVerse);
    else if (d.read != null) openArticle(+d.read);
    else if (d.reel != null) openReel(+d.reel);
    else if (d.saveVerse != null) saveVerse(+d.saveVerse);
    else if (d.shareVerse != null) { var v = C.verses[+d.shareVerse]; share(v.ref, '“' + v.text + '” ' + v.ref + ' (' + (v.translation || 'WEB') + ')', pageUrl('/verses')); }
    else if (d.shareDev != null) { var dv = C.devotions[+d.shareDev]; share(dv.title, dv.teaser, pageUrl(SEO.path('read', dv.slug))); }
    else if (d.preview != null) {
      if (C.gamePreviewUrl) window.open(C.gamePreviewUrl, '_blank', 'noopener');
      else toast('The free preview opens here once the browser build is published.');
    }
    else if (d.toast) toast(d.toast);
    else if (d.close != null && b.closest('#pArticle')) closeArticle();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if ($('#pArticle').classList.contains('on')) closeArticle(); if ($('#pEpisode').classList.contains('on')) { navigate('/listen'); return; } closeOverlays(); }
    if ($('#pStory').classList.contains('on')) {
      if (e.key === 'ArrowRight') stepStory(1);
      if (e.key === 'ArrowLeft') stepStory(-1);
    }
  });

  $('#pSoon').addEventListener('click', function (e) { if (e.target.id === 'pSoon') closeSoon(); });
  applyNav();
  route();
  app.dataset.ready = '1';
  }
  tagBuiltins();
  loadFooterStyle();
  Promise.all([mergeStudioPosts(), loadNav(), loadHidden(), loadContent()]).then(startApp);

  // ---------- offline support ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
  }
})();
