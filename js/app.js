// Little Light app: tabs, feed, reels, audio, reading, verses and the game page.
// Plain JavaScript, no build step. Content comes from js/content.js.
(function () {
  'use strict';
  var app = document.getElementById('app');
  var C = window.LL_CONTENT;
  if (!app || !C) return;

  var $ = function (s, r) { return (r || app).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || app).querySelectorAll(s)); };
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

  // ---------- routing: #today, #watch, #read/brave, ... ----------
  var current = 'today';
  function show(tab) {
    closeOverlays();
    current = tab;
    $$('.p-view').forEach(function (v) { v.classList.toggle('on', v.dataset.view === tab); });
    $$('.p-tab').forEach(function (a) {
      var on = a.dataset.tab === tab;
      a.classList.toggle('on', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    updateReels();
  }
  function route() {
    var parts = (location.hash || '#today').slice(1).split('/');
    var tab = TABS.indexOf(parts[0]) >= 0 ? parts[0] : 'today';
    if (tab === 'read' && parts[1]) {
      var i = indexBySlug(parts[1]);
      if (current !== 'read') show('read');
      if (i >= 0) openArticle(i, true);
      return;
    }
    show(tab);
  }
  function go(tab) {
    if (location.hash === '#' + tab) show(tab);
    else location.hash = tab;
  }
  function indexBySlug(slug) {
    for (var i = 0; i < C.devotions.length; i++) if (C.devotions[i].slug === slug) return i;
    return -1;
  }
  window.addEventListener('hashchange', route);

  // ---------- day / night and calm mode ----------
  function setNight(on, save) {
    app.classList.toggle('night', on);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', on ? '#070b22' : '#0f0d20');
    $$('[data-mode]').forEach(function (b) {
      b.innerHTML = on ? ICON_SUN : ICON_MOON;
      b.setAttribute('aria-label', on ? 'Switch to day mode' : 'Switch to night mode');
    });
    if (save) store('theme', on ? 'night' : 'day');
  }
  function setCalm(on, save) {
    app.classList.toggle('calm', on);
    $$('[data-calm]').forEach(function (b) {
      b.innerHTML = ICON_LEAF;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? 'Calm mode is on' : 'Calm mode: less movement';
    });
    if (save) { store('calm', on ? '1' : '0'); toast(on ? 'Calm mode on: less movement' : 'Calm mode off'); }
  }
  var savedTheme = store('theme');
  setNight(savedTheme ? savedTheme === 'night' : media('(prefers-color-scheme: dark)'), false);
  var savedCalm = store('calm');
  setCalm(savedCalm ? savedCalm === '1' : media('(prefers-reduced-motion: reduce)'), false);

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
    owl.classList.remove('hoot'); void owl.offsetWidth; owl.classList.add('hoot');
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
  var reelsEl = $('#pReels');
  reelsEl.innerHTML = C.reels.map(function (r, i) {
    var scene = r.src
      ? '<video src="' + r.src + '" playsinline muted loop preload="metadata" style="width:100%;height:100%;object-fit:cover"></video>'
      : reelScene(r.kind);
    return '<article class="p-reel" data-i="' + i + '" style="background:' + r.bg + '">' +
      '<div class="scene">' + scene + '</div>' +
      '<div class="bar"><i></i></div>' +
      '<button class="tapzone" type="button" aria-label="Pause or play"></button><div class="paused"></div>' +
      '<div class="side"><button type="button" class="save"><svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>Save</button>' +
      '<button type="button" class="share"><svg viewBox="0 0 24 24"><path d="M4 12v7h16v-7M12 3v12M7 8l5-5 5 5"/></svg>Share</button></div>' +
      '<div class="cap"><span class="p-kicker">Reel · ' + r.len + '</span><b>' + r.title + '</b><p>' + r.caption + '</p><button type="button" class="more">…more</button></div>' +
      '</article>';
  }).join('');
  var visibleReel = 0;
  var savedReels = {};
  try { savedReels = JSON.parse(store('savedReels') || '{}') || {}; } catch (err) { savedReels = {}; }
  $$('.p-reel').forEach(function (el, i) { if (savedReels[i]) el.querySelector('.save').classList.add('saved'); });
  function updateReels() {
    $$('.p-reel').forEach(function (el, i) {
      var playing = current === 'watch' && i === visibleReel && !el.classList.contains('userpaused');
      el.classList.toggle('playing', playing);
      var v = el.querySelector('video');
      if (v) { if (playing) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } else v.pause(); }
    });
  }
  reelsEl.addEventListener('scroll', function () {
    var i = Math.round(reelsEl.scrollTop / reelsEl.clientHeight);
    if (i !== visibleReel) { visibleReel = i; updateReels(); }
  }, { passive: true });
  reelsEl.addEventListener('click', function (e) {
    var reel = e.target.closest('.p-reel');
    if (!reel) return;
    var i = +reel.dataset.i;
    if (e.target.closest('.tapzone')) { reel.classList.toggle('userpaused'); updateReels(); }
    else if (e.target.closest('.more')) {
      var c = reel.querySelector('.cap');
      var o = c.classList.toggle('open');
      e.target.textContent = o ? 'less' : '…more';
    } else if (e.target.closest('.save')) {
      var s = e.target.closest('.save');
      s.classList.toggle('saved');
      savedReels[i] = s.classList.contains('saved');
      store('savedReels', JSON.stringify(savedReels));
      toast(savedReels[i] ? 'Saved on this device' : 'Removed from saved');
    } else if (e.target.closest('.share')) {
      share(C.reels[i].title, C.reels[i].caption, location.origin + location.pathname + '#watch');
    }
  });
  function openReel(i) {
    go('watch');
    setTimeout(function () { reelsEl.scrollTop = i * reelsEl.clientHeight; visibleReel = i; updateReels(); }, 0);
  }
  document.addEventListener('keydown', function (e) {
    if (current !== 'watch' || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowDown') { reelsEl.scrollBy({ top: reelsEl.clientHeight, behavior: 'smooth' }); e.preventDefault(); }
    if (e.key === 'ArrowUp') { reelsEl.scrollBy({ top: -reelsEl.clientHeight, behavior: 'smooth' }); e.preventDefault(); }
  });

  // ---------- audio: real files when `src` is set, otherwise a silent demo ----------
  var player = { ep: -1, t: 0, playing: false }, tick = null;
  var audio = new Audio();
  audio.preload = 'none';
  audio.addEventListener('timeupdate', function () { player.t = audio.currentTime; renderPlayer(); });
  audio.addEventListener('ended', function () { setPlaying(false); });
  function hasSrc() { return player.ep >= 0 && !!C.episodes[player.ep].src; }
  function duration() { return hasSrc() && isFinite(audio.duration) ? audio.duration : C.episodes[player.ep].dur; }

  $('#pEps').innerHTML = C.episodes.map(function (e, i) {
    return '<button class="p-row" type="button" data-ep="' + i + '"><span class="p-art" style="background:' + e.color + '"><i></i></span>' +
      '<span><b>' + e.title + '</b><small>' + e.meta + ' · ' + fmt(e.dur) + '</small></span><span class="p-pp">' + ICON_PLAY + '</span></button>';
  }).join('');
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
    $$('.p-row').forEach(function (r, i) {
      var on = i === player.ep;
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
  }
  function openFull() {
    if (player.ep < 0) return;
    var e = C.episodes[player.ep], full = $('#pFull');
    full.innerHTML =
      '<button class="down" type="button" data-close>⌄ Close</button>' +
      '<div class="bigart" style="background:radial-gradient(circle at 50% 40%,' + e.color + ',#2d2352 90%)"><i></i></div>' +
      '<div><b>' + e.title + '</b><br><small>' + e.meta + ' · Little Light</small></div>' +
      '<input type="range" id="pRange" min="0" max="' + Math.round(duration()) + '" step="1" value="' + player.t + '" aria-label="Position">' +
      '<div class="times"><span id="pTimeNow">' + fmt(player.t) + '</span><span>' + fmt(duration()) + '</span></div>' +
      '<div class="ctls"><button type="button" data-skip="-15">−15s</button><button class="main" type="button" id="pFullPP" aria-label="Play or pause"></button><button type="button" data-skip="15">+15s</button></div>' +
      (e.devotion != null ? '<button class="p-btn ghost readalong" type="button" data-read="' + e.devotion + '" style="color:#fff">Read along</button>' : '') +
      (e.src ? '' : '<div class="note">Recording coming soon. This player shows progress without sound.</div>');
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

  // ---------- read ----------
  $('#pCards').innerHTML = C.devotions.map(function (d, i) {
    return '<a class="p-card' + (i === 0 ? ' feat' : '') + '" href="#read/' + d.slug + '" style="background:' + d.color + ';color:' + d.ink + ';text-decoration:none">' +
      '<span class="p-kicker">' + d.kicker + '</span><b>' + d.title + '</b><span>' + d.teaser + '</span>' +
      '<span class="foot"><span>Read →</span><span>▶ Audio ' + fmt(C.episodes[d.episode].dur) + '</span></span></a>';
  }).join('');
  function openArticle(i, fromRoute) {
    if (!fromRoute) { location.hash = 'read/' + C.devotions[i].slug; return; }
    var d = C.devotions[i], a = $('#pArticle');
    a.innerHTML = '<button class="back" type="button" data-close>← Back</button>' +
      '<div class="hero" style="background:' + d.color + ';color:' + d.ink + '"><span class="p-kicker">' + d.kicker + '</span><b>' + d.title + '</b></div>' +
      '<div style="padding-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="p-btn listen" type="button" data-ep="' + d.episode + '">▶ Listen to this devotion</button>' +
      '<button class="p-btn ghost" type="button" data-share-dev="' + i + '" style="background:rgba(0,0,0,.08);color:inherit">Share</button></div>' +
      '<div class="body p-txt">' + d.html + '</div>';
    closeOverlays();
    a.classList.add('on');
    a.scrollTop = 0;
    document.title = d.title + ' · Little Light';
  }
  function closeArticle() {
    $('#pArticle').classList.remove('on');
    document.title = 'Little Light';
    if (location.hash.indexOf('#read/') === 0) history.replaceState(null, '', '#read');
  }
  function openSheet(i) {
    var d = C.devotions[i];
    $('#pSheetBody').innerHTML = '<div class="p-txt"><div class="meta">' + d.kicker + '</div><h5>' + d.title + '</h5>' + d.html +
      '<button class="p-btn" type="button" data-read="' + i + '" style="justify-self:start;background:#3a1426">Open as a page →</button></div>';
    $('#pSheetWrap').classList.add('on');
  }
  $('#pSheetClose').addEventListener('click', function () { $('#pSheetWrap').classList.remove('on'); });
  $('#pSheetWrap').addEventListener('click', function (e) { if (e.target.id === 'pSheetWrap') $('#pSheetWrap').classList.remove('on'); });

  // ---------- verses ----------
  var filter = 'All';
  $('#pChips').innerHTML = C.topics.map(function (t) {
    return '<button class="p-chip' + (t === 'All' ? ' on' : '') + '" type="button" data-chip="' + t + '" aria-pressed="' + (t === 'All') + '">' + t + '</button>';
  }).join('');
  function shown() {
    return C.verses.map(function (v, i) { return i; }).filter(function (i) { return filter === 'All' || C.verses[i].topics.indexOf(filter) >= 0; });
  }
  function renderGrid() {
    $('#pGrid').innerHTML = shown().map(function (i, k) {
      var v = C.verses[i];
      return '<button class="p-tile vt' + (i % 3) + (k % 4 === 0 ? ' tall' : '') + '" type="button" data-verse="' + k + '"><small>' + v.topics[0] + '</small><em>“' + v.text + '”</em><small>' + v.ref + '</small></button>';
    }).join('');
  }
  renderGrid();
  $('#pChips').addEventListener('click', function (e) {
    var c = e.target.closest('[data-chip]');
    if (!c) return;
    filter = c.dataset.chip;
    $$('.p-chip').forEach(function (b) { b.classList.toggle('on', b === c); b.setAttribute('aria-pressed', b === c); });
    renderGrid();
  });
  var story = { list: [], k: 0, timer: null };
  function renderStory() {
    var el = $('#pStory'), i = story.list[story.k], v = C.verses[i], style = i % 3;
    el.style.background = style === 0 ? '#f7c23f' : style === 1 ? '#1b1638' : '#fdf8ea';
    el.style.color = style === 1 ? '#fbe6a6' : '#3b2412';
    el.classList.toggle('dark', style === 1);
    el.innerHTML = '<div class="bars">' + story.list.map(function (_, n) { return '<i class="' + (n < story.k ? 'done' : n === story.k ? 'now' : '') + '"></i>'; }).join('') + '</div>' +
      '<button class="close" type="button" data-close aria-label="Close">✕</button>' +
      '<div class="tap"><button type="button" data-step="-1" aria-label="Previous verse"></button><button type="button" data-step="1" aria-label="Next verse"></button></div>' +
      '<div class="tag">' + v.topics[0] + '</div><div class="verse">“' + v.text + '”</div><div class="ref">' + v.ref.toUpperCase() + ' · WEB</div>' +
      '<div class="acts"><button class="p-btn" type="button" data-save-verse="' + i + '">Save image</button><button class="p-btn ghost" type="button" data-share-verse="' + i + '">Share</button></div>';
    clearTimeout(story.timer);
    story.timer = setTimeout(function () { stepStory(1); }, 6000);
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
    story.list = shown(); story.k = +t.dataset.verse;
    $('#pStory').classList.add('on');
    renderStory();
  });
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
    g.font = '700 30px "Bricolage Grotesque", system-ui, sans-serif';
    g.fillText((v.topics[0] || 'Verse').toUpperCase(), 96, 620);
    g.font = 'italic 64px Newsreader, Georgia, serif';
    var words = ('“' + v.text + '”').split(' '), line = '', y = 710, lines = [];
    words.forEach(function (w) {
      var test = line ? line + ' ' + w : w;
      if (g.measureText(test).width > 880 && line) { lines.push(line); line = w; } else line = test;
    });
    lines.push(line);
    if (lines.length > 6) { g.font = 'italic 52px Newsreader, Georgia, serif'; }
    lines.forEach(function (l) { g.fillText(l, 96, y); y += lines.length > 6 ? 66 : 80; });
    g.font = '700 30px "Bricolage Grotesque", system-ui, sans-serif';
    g.fillText(v.ref.toUpperCase() + ' · WEB', 96, y + 30);
    g.globalAlpha = .75;
    g.fillText('Little Light', 96, 1260);
    g.globalAlpha = 1;
    return cv;
  }
  function saveVerse(i) {
    var cv = verseImage(i), name = 'little-light-' + C.verses[i].ref.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
    cv.toBlob(function (blob) {
      if (!blob) { toast('Could not create the image'); return; }
      var file;
      try { file = new File([blob], name, { type: 'image/png' }); } catch (err) { file = null; }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: C.verses[i].ref }).catch(function () {});
        return;
      }
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
  function pageUrl(hash) { return location.origin + location.pathname + hash; }

  // ---------- play ----------
  $('#pMap').innerHTML = C.journeys.map(function (j) {
    return '<div class="p-stop"><span class="n" style="background:' + j.color + '">' + j.n + '</span><span><b>' + j.name + '</b><small>' + j.virtue + '</small></span>' +
      '<span class="st' + (j.status ? '' : ' wip') + '">' + (j.status || 'In progress') + '</span></div>';
  }).join('');

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
    toast('Little Light is installed');
  });

  // ---------- overlays and global buttons ----------
  function closeOverlays() {
    $('#pSheetWrap').classList.remove('on');
    $('#pArticle').classList.remove('on');
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
    else if (d.go) go(d.go);
    else if (d.ep != null && !b.closest('#pFull')) playEp(+d.ep);
    else if (d.sheet != null) openSheet(+d.sheet);
    else if (d.read != null) openArticle(+d.read);
    else if (d.reel != null) openReel(+d.reel);
    else if (d.saveVerse != null) saveVerse(+d.saveVerse);
    else if (d.shareVerse != null) { var v = C.verses[+d.shareVerse]; share(v.ref, '“' + v.text + '” ' + v.ref + ' (WEB)', pageUrl('#verses')); }
    else if (d.shareDev != null) { var dv = C.devotions[+d.shareDev]; share(dv.title, dv.teaser, pageUrl('#read/' + dv.slug)); }
    else if (d.preview != null) {
      if (C.gamePreviewUrl) window.open(C.gamePreviewUrl, '_blank', 'noopener');
      else toast('The free preview opens here once the browser build is published.');
    }
    else if (d.toast) toast(d.toast);
    else if (d.close != null && b.closest('#pArticle')) closeArticle();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if ($('#pArticle').classList.contains('on')) closeArticle(); closeOverlays(); }
    if ($('#pStory').classList.contains('on')) {
      if (e.key === 'ArrowRight') stepStory(1);
      if (e.key === 'ArrowLeft') stepStory(-1);
    }
  });

  route();

  // ---------- offline support ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
