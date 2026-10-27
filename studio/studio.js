// Calligraphy wordmark (same markup as the site header). The candle is the i.
function wordmark(id) { return '<span class="wm" role="img" aria-label="Salt and Light" style="--wm-d:-PHs"><span class="wm-s" aria-hidden="true">Salt and </span><span class="wm-l" aria-hidden="true">L<svg class="wm-i" viewBox="0 0 18 49" aria-hidden="true" focusable="false"><defs><linearGradient id="GID" x1="0" y1="0" x2="0" y2="1"><stop class="wm-a" offset="0"/><stop class="wm-b" offset="1"/></linearGradient><radialGradient id="GIDf" cx=".5" cy=".65" r=".6"><stop class="wm-c" offset="0"/><stop class="wm-a" offset=".55"/><stop class="wm-b" offset="1"/></radialGradient><radialGradient id="GIDh"><stop class="wm-a" offset="0" stop-opacity=".55"/><stop class="wm-a" offset=".45" stop-opacity=".18"/><stop class="wm-a" offset="1" stop-opacity="0"/></radialGradient></defs><g transform="translate(0 49) skewX(-10) translate(0 -49)"><rect x="6.2" y="13" width="5.6" height="36" rx="2.8" fill="url(#GID)"/><path class="wm-wick" d="M9.0 12.5v-2.2"/><g class="wm-hw"><circle class="wm-halo" cx="9" cy="8" r="13" fill="url(#GIDh)"/><circle class="wm-halo2" cx="9" cy="8" r="13" fill="url(#GIDh)"/></g><g class="wm-flare"><g class="wm-jit"><g class="wm-sway"><g class="wm-flame"><g class="wm-fo"><path d="M9 0C13.6 5.5 14 9.8 9 12.6C4 9.8 4.4 5.5 9 0Z" fill="url(#GIDf)"/></g><g class="wm-fc"><path d="M9 4.4C11.2 7.4 11.5 10.2 9 12C6.5 10.2 6.8 7.4 9 4.4Z" fill="#FFF8E1"/></g></g></g></g></g><circle class="wm-ember" cx="9" cy="0" r="0.9"/><circle class="wm-ember wm-e2" cx="8" cy="1" r="0.8"/><circle class="wm-ember wm-e3" cx="10" cy="1" r="0.7"/></g></svg>ght</span></span>'.replace(/GID/g, id).replace('PH', (id.length * 0.73 + id.charCodeAt(id.length - 1) % 7 * 0.41).toFixed(2)); }
// Little Light Studio: sign in, write, schedule and publish posts.
// Talks to the data layer in js/store.js (local mode or Supabase).
(function () {
  'use strict';

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
  var S = window.LLStore;
  var root = document.getElementById('root');

  var TYPES = {
    verse:    { name: 'Verse', color: 'var(--verse)', ink: '#3b2412', hint: 'A Bible verse, shared as a picture' },
    devotion: { name: 'Devotion', color: 'var(--devotion)', ink: '#3a1426', hint: 'A short reading with a prayer' },
    reel:     { name: 'Reel', color: 'var(--reel)', ink: '#2b0d05', hint: 'A short vertical video' },
    audio:    { name: 'Audio', color: 'var(--audio)', ink: '#1a0f33', hint: 'A recorded devotion, prayer or story' },
    game:     { name: 'Game update', color: 'var(--game)', ink: '#0f2a17', hint: 'News about Little Light: Bible Journeys' }
  };
  // Fields kept in posts.fields for each kind of post.
  var FIELDS = {
    verse: ['verse', 'ref', 'translation', 'topics'],
    devotion: ['teaser', 'body', 'ref', 'family', 'prayer', 'audioId'],
    audio: ['kind', 'minutes', 'seconds', 'file', 'transcript'],
    reel: ['caption', 'youtube', 'minutes', 'seconds', 'file', 'poster', 'poster_auto', 'series', 'episode', 'series_description', 'page_style', 'page_color'],
    game: ['text', 'button']
  };
  // Desktop caption page (book spread) for reels: fields.page_style and fields.page_color; empty colour = from the reel.
  var PAGE_STYLES = ['auto', 'dark', 'light', 'clear'], PAGE_STYLE_LABEL = { auto: 'Auto from reel', dark: 'Dark', light: 'Light', clear: 'Glass clear' };
  var TOPICS = ['When I’m afraid', 'Trust', 'Friendship', 'Mercy', 'God sees me', 'Light'];
  // Public-domain translations, suggested in the Translation box. Any other name can be typed.
  var TRANSLATIONS = ['WEB', 'KJV', 'ASV', 'BSB'];
  // Over 200 characters, the Today card shows the first lines and a "Read full passage" button (isLongVerse in js/app.js).
  function isLongVerse(text) { return (text || '').trim().length > 200; }
  function verseLenNote(text) {
    var n = (text || '').trim().length;
    return isLongVerse(text) ? n + ' characters: the Today card shows the first lines, with a “Read full passage” button for the rest.'
      : 'Press Enter for a new line (for example, one line per verse). Up to 200 characters fits on the Today card.';
  }
  // Built-in topics, then any topic already used on a verse post.
  function allTopics() {
    var list = TOPICS.slice();
    state.posts.concat(state.editing ? [state.editing] : []).forEach(function (p) {
      (p.topics || (p.fields && p.fields.topics) || []).forEach(function (t) { if (list.indexOf(t) < 0) list.push(t); });
    });
    return list;
  }
  var ICON = {
    posts: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    media: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 16l5-5 4 4 3-3 6 6"/></svg>',
    site: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
    insights: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    guide: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01"/></svg>',
    team: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.5"/><path d="M3 19c.8-3.3 3.2-5 6-5s5.2 1.7 6 5M16 5.5a3 3 0 010 6M17.5 14c1.8.5 3 2.2 3.5 5"/></svg>',
    site: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.6 2.5 13.4 0 16M12 4c-2.5 2.6-2.5 13.4 0 16"/></svg>'
  };

  var state = {
    screen: 'loading', email: '', authError: '', session: null,
    view: 'posts', filter: 'all', statusFilter: 'all', q: '', sortKey: 'date', sortDir: 'desc', limit: 20, posts: [], team: [],
    editing: null, errors: {}, confirmDelete: false, busy: false, uploading: ''
  };

  // ---------- helpers ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  var toastT;
  function toast(msg, isErr) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.toggle('err', !!isErr);
    t.classList.add('on');
    clearTimeout(toastT);
    toastT = setTimeout(function () { t.classList.remove('on'); }, isErr ? 5000 : 2800);
  }
  function fail(err) { state.busy = false; toast(err && err.message ? err.message : 'Something went wrong. Please try again.', true); render(); }
  function fmtWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined }) +
      ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  function canPublish() { return state.session && (state.session.role === 'owner' || state.session.role === 'editor'); }
  function isOwner() { return state.session && state.session.role === 'owner'; }
  // ---------- history ----------
  var ACTION = { created: 'Created', edited: 'Edited', published: 'Published', scheduled: 'Scheduled', unpublished: 'Moved to drafts', deleted: 'Deleted' };
  var LABEL = { title: 'Title', status: 'Status', publish_at: 'Publish time', show_on_today: 'Show on Today', media_url: 'File',
    verse: 'Verse text', ref: 'Reference', translation: 'Translation', topics: 'Topics', teaser: 'Summary', body: 'Reading',
    family: 'For families', prayer: 'Prayer', audioId: 'Audio version', kind: 'Kind', minutes: 'Length', caption: 'Caption',
    youtube: 'YouTube link', text: 'Text', button: 'Button label', series: 'Series', episode: 'Episode', series_description: 'Series description', page_style: 'Page style', page_color: 'Page colour', poster: 'Poster', poster_auto: 'Poster made from the video' };
  // One flat list of what a reader would notice, from a stored post.
  function flat(p) {
    var out = { status: p.status, publish_at: p.publish_at, show_on_today: p.show_on_today, media_url: p.media_url };
    if (p.type !== 'verse') out.title = p.title;
    Object.keys(p.fields || {}).forEach(function (k) { if (LABEL[k]) out[k] = p.fields[k]; });
    return out;
  }
  function shown(k, v) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '(empty)';
    if (k === 'publish_at') return fmtWhen(v);
    if (k === 'show_on_today') return v ? 'Yes' : 'No';
    if (k === 'audioId') { var a = state.posts.filter(function (x) { return String(x.id) === String(v); })[0]; return a ? a.title : 'Audio #' + v; }
    if (k === 'media_url') return String(v).split('/').pop();
    var t = Array.isArray(v) ? v.join(', ') : String(v);
    return t.length > 160 ? t.slice(0, 157) + '…' : t;
  }
  function changes(older, newer) {
    var a = flat(older), b = flat(newer), keys = Object.keys(LABEL).filter(function (k) { return k in a || k in b; });
    return keys.filter(function (k) { return JSON.stringify(a[k] == null ? null : a[k]) !== JSON.stringify(b[k] == null ? null : b[k]); })
      .map(function (k) { return { label: LABEL[k], from: shown(k, a[k]), to: shown(k, b[k]) }; });
  }
  function historyView() {
    var list = state.history;
    if (!state.editing || !state.editing.id) return '';
    var body = list == null ? '<p class="role-note">Loading…</p>'
      : !list.length ? '<p class="role-note">No changes recorded yet.</p>'
      : '<ol>' + list.map(function (r, i) {
        var older = list[i + 1], diff = older ? changes(older.snapshot, r.snapshot) : [];
        var pill = r.action === 'published' ? 'published' : r.action === 'scheduled' ? 'scheduled' : 'draft';
        return '<li><div class="h-head"><span class="pill ' + pill + '">' + (ACTION[r.action] || r.action) + '</span>' +
          '<span class="h-when">' + esc(fmtWhen(r.changed_at)) + ' · ' + esc(r.changed_by || 'unknown') + (i === 0 ? ' · <b>current</b>' : '') + '</span></div>' +
          (!older ? '<small>First recorded version</small>'
            : diff.length ? '<details><summary>' + diff.length + ' change' + (diff.length > 1 ? 's' : '') + '</summary><dl>' +
              diff.map(function (c) { return '<dt>' + c.label + '</dt><dd><del>' + esc(c.from) + '</del> <ins>' + esc(c.to) + '</ins></dd>'; }).join('') + '</dl></details>'
            : '<small>Saved with no changes to the content</small>') +
          (i > 0 ? '<button class="btn ghost small" type="button" data-restore="' + r.id + '">Restore this version</button>' : '') + '</li>';
      }).join('') + '</ol>';
    return '<section class="history" id="history" aria-label="History"><h3>History</h3>' + body + '</section>';
  }
  function loadHistory(id) {
    state.history = null;
    S.listRevisions(id).then(function (list) {
      if (!state.editing || state.editing.id !== id) return;
      state.history = list || [];
      var box = document.getElementById('history'); if (box) box.outerHTML = historyView();
    }).catch(function (err) {
      state.history = [];
      var box = document.getElementById('history'); if (box) box.innerHTML = '<h3>History</h3><p class="errmsg">History could not be loaded: ' + esc(err.message) + '</p>';
    });
  }
  // Load an older version into the form. Nothing is saved until the post is updated or saved.
  function restore(revId) {
    var r = (state.history || []).filter(function (x) { return String(x.id) === String(revId); })[0];
    if (!r) return;
    var cur = state.editing, e = toEditing(r.snapshot);
    ['id', 'status', 'publish_at', 'when', '_mode', 'slug', 'created_at', 'author_email'].forEach(function (k) { e[k] = cur[k]; });
    state.editing = e; state.errors = {};
    render(); window.scrollTo(0, 0);
    toast('Loaded the version from ' + fmtWhen(r.changed_at) + '. ' + (cur.status === 'draft' ? 'Save' : 'Update') + ' the post to keep it.');
  }

  function statusOf(p) { return p.status === 'scheduled' && S.isLive(p) ? 'published' : p.status; }

  // post (stored shape) <-> editing (flat form shape)
  function toEditing(p) {
    var e = { id: p.id, type: p.type, status: p.status, title: p.title, show_on_today: p.show_on_today !== false,
      media_url: p.media_url || '', publish_at: p.publish_at || '', when: toLocalInput(p.status === 'scheduled' ? p.publish_at : ''),
      slug: p.slug, created_at: p.created_at, author_email: p.author_email, _fields: p.fields || {} };
    FIELDS[p.type].forEach(function (k) { e[k] = (p.fields || {})[k]; });
    if (p.type === 'verse') { e.topics = e.topics || []; e.translation = e.translation || 'WEB'; }
    e._mode = p.status === 'scheduled' && !S.isLive(p) ? 'schedule' : 'now';
    return e;
  }
  function fromEditing(e, status) {
    var p = { type: e.type, status: status, title: (e.type === 'verse' ? (e.ref || 'Verse') : e.title || '').trim(),
      show_on_today: e.show_on_today !== false, media_url: e.media_url || null, fields: {} };
    // Fields the form doesn't show (such as `builtin` and `look` on posts moved from js/content.js) are kept.
    Object.keys(e._fields || {}).forEach(function (k) { if (FIELDS[e.type].indexOf(k) < 0) p.fields[k] = e._fields[k]; });
    if (e.id) { p.id = e.id; p.slug = e.slug; p.created_at = e.created_at; p.author_email = e.author_email; }
    FIELDS[e.type].forEach(function (k) {
      var v = e[k];
      if (typeof v === 'string') v = v.trim();
      if (v !== undefined && v !== '' && !(Array.isArray(v) && !v.length)) p.fields[k] = v;
    });
    if (p.fields.page_style === 'auto' || (p.fields.page_style && PAGE_STYLES.indexOf(p.fields.page_style) < 0)) delete p.fields.page_style;
    if (p.fields.page_color != null && !/^#[0-9a-f]{6}$/i.test(p.fields.page_color)) delete p.fields.page_color;
    if (p.fields.episode != null) { var n = parseInt(p.fields.episode, 10); if (n > 0) p.fields.episode = n; else delete p.fields.episode; }
    if (status === 'scheduled') p.publish_at = new Date(e.when).toISOString();
    else if (status === 'published') p.publish_at = e.status === 'published' && e.publish_at ? e.publish_at : new Date().toISOString();
    else p.publish_at = null;
    return p;
  }

  // ---------- data ----------
  function loadAll() {
    // A missing site_settings table (SQL not applied yet) must not stop the Studio from loading.
    var hid = S.getSetting('builtins_hidden').then(function (v) { state.hiddenError = ''; return v; }, function (err) { state.hiddenError = err.message; return null; });
    var nav = S.getSetting('nav').then(function (v) { state.navError = ''; return v; }, function (err) { state.navError = err.message; return null; });
    var content = S.getSetting('content').then(function (v) { return v; }, function () { return null; });
    var reelPage = S.getSetting('reel_page').then(function (v) { return v; }, function () { return null; });
    return Promise.all([S.listPosts(), S.listTeam(), nav, hid, content, reelPage]).then(function (r) {
      state.reelPage = { style: r[5] && PAGE_STYLES.indexOf(r[5].style) >= 0 ? r[5].style : 'auto' };
      state.content = S.normalizeContent(r[4]) || S.contentDefault();
      state.hidden = S.effectiveHidden(r[3] && S.normalizeHidden(r[3]) ? r[3] : null);
      state.posts = r[0] || []; state.team = r[1] || [];
      state.nav = S.normalizeNav(r[2]) || S.navDefault();
    });
  }
  function enter(session) {
    state.session = session;
    state.email = session.email;
    state.screen = 'studio';
    return loadAll().then(render, fail);
  }
  function boot() {
    S.session().then(function (s) {
      if (s) return enter(s);
      state.screen = 'signin'; render();
    }).catch(function (err) { state.screen = 'signin'; state.authError = err.message; render(); });
  }
  S.onAuthChange(function () { boot(); });

  // ---------- screens ----------
  function modeBar() {
    return S.mode === 'local'
      ? '<div class="modebar"><b>Local mode.</b> Posts and files are saved in this browser only, and only this browser’s copy of the app shows them. Connect Supabase to publish for everyone (see docs/studio.md).</div>'
      : '';
  }
  function signin() {
    var err = state.authError, pw = S.mode !== 'local';
    return '<main class="auth"><form class="auth-card" id="signinForm" novalidate>' +
      '<div class="brand">' + wordmark('wms1') + '<small class="wm-tag">Studio</small></div>' +
      '<div><h1>Sign in to post</h1><p style="margin-top:6px">For the Salt and Light team. Visitors never need an account.</p></div>' +
      modeBar() +
      '<label class="field"><span>Email</span><input class="input' + (err ? ' err' : '') + '" id="email" type="email" autocomplete="username" placeholder="you@example.com" value="' + esc(state.email) + '"></label>' +
      (pw ? '<label class="field"><span>Password</span><input class="input' + (err ? ' err' : '') + '" id="password" type="password" autocomplete="current-password"></label>' : '') +
      (err ? '<span class="errmsg" role="alert">' + esc(err) + '</span>' : (pw ? '' : '<small>The first email to sign in becomes the owner.</small>')) +
      '<button class="btn primary" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Signing in…' : 'Sign in') + '</button>' +
      (pw ? '<button class="btn ghost" type="button" id="magicLink" style="font-size:12.5px"' + (state.busy ? ' disabled' : '') + '>No password yet? Email me a one-time sign-in link</button>' : '') +
      '<div class="note">Only people on the team can sign in. There is no sign-up: the owner adds team members.</div>' +
      '</form></main>';
  }
  // Rough strength hint only; Supabase does the real checking. Never logged or stored.
  function pwStrength(p) {
    if (!p) return '';
    if (p.length < 12) return 'Too short: ' + p.length + ' of at least 12 characters.';
    var kinds = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(function (r) { return r.test(p); }).length;
    if (p.length >= 16 && kinds >= 3) return 'Strong.';
    if (kinds >= 3 || p.length >= 16) return 'Good. Longer or more varied is even better.';
    return 'Weak: mix upper and lower case, numbers and symbols, or make it longer.';
  }
  function passwordView() {
    var e = state.pwError;
    return '<div class="head"><div><h1>Change password' + help('account') + '</h1><p>Signed in as ' + esc(state.email) + '. Use at least 12 characters; a short phrase of random words works well.</p></div></div>' +
      '<form id="pwForm" class="auth-card" novalidate style="margin:0">' +
      '<label class="field"><span>New password</span><input class="input' + (e ? ' err' : '') + '" id="newPassword" type="password" autocomplete="new-password" minlength="12"><small id="pwHint" aria-live="polite"></small></label>' +
      '<label class="field"><span>Repeat new password</span><input class="input' + (e ? ' err' : '') + '" id="newPassword2" type="password" autocomplete="new-password"></label>' +
      (e ? '<span class="errmsg" role="alert">' + esc(e) + '</span>' : '') +
      '<button class="btn primary" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (state.busy ? 'Saving…' : 'Save new password') + '</button>' +
      '<button class="btn ghost" type="button" id="pwCancel">Cancel</button></form>';
  }
  function checkEmail() {
    return '<main class="auth"><div class="auth-card">' +
      '<div class="check-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/></svg></div>' +
      '<div><h1>Check your email</h1><p style="margin-top:6px">We sent a sign-in link to <b style="color:var(--ink)">' + esc(state.email) + '</b>. Open it on this device to come back here signed in.</p></div>' +
      '<button class="btn ghost" type="button" id="back">Use a different email</button></div></main>';
  }
  function shell(inner) {
    var nav = [['posts', 'Posts', ICON.posts], ['new', 'New post', ICON.plus], ['media', 'Media', ICON.media], ['site', 'Menus', ICON.site], ['builtins', 'Built-in content', ICON.media], ['insights', 'Insights', ICON.insights], ['team', 'Team', ICON.team], ['guide', 'Guide', ICON.guide]];
    return '<div class="shell"><aside class="side">' +
      '<div class="brand">' + wordmark('wms2') + '<small class="wm-tag">Studio</small></div>' +
      '<nav aria-label="Studio">' + nav.map(function (n) {
        var on = state.view === n[0] || (n[0] === 'new' && state.view === 'edit' && state.editing && !state.editing.id);
        return '<button class="nav' + (on ? ' on' : '') + '" type="button" data-view="' + n[0] + '"' + (on ? ' aria-current="page"' : '') + '>' + n[2] + n[1] +
          (n[0] === 'posts' ? '<span class="count">' + state.posts.length + '</span>' : '') + '</button>';
      }).join('') + '<a class="nav" href="../" target="_blank" rel="noopener">' + ICON.site + 'View the app</a></nav>' +
      '<div class="me"><div class="who"><span class="avatar">' + esc(state.email[0] || '?').toUpperCase() + '</span><span>' + esc(state.email) + '<small>' + esc(cap(state.session.role)) + '</small></span></div>' +
      (S.mode !== 'local' ? '<button class="btn ghost" type="button" id="changePw" style="justify-content:flex-start;padding-left:0">Change password</button>' : '') +
      '<button class="btn ghost guidebtn" type="button" data-view="guide" style="justify-content:flex-start;padding-left:0"><span aria-hidden="true">?</span> How to use Studio</button>' +
      '<button class="btn ghost" type="button" id="signout" style="justify-content:flex-start;padding-left:0">Sign out</button></div>' +
      '</aside><main class="main">' + modeBar() + inner + '</main></div>';
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

  // ---------- Posts: a compact, searchable, sortable list (a table on wide screens, rows on phones) ----------
  var PAGE_SIZE = 20;
  var STATUSES = [['published', 'Published'], ['scheduled', 'Scheduled'], ['draft', 'Drafts']];
  var SORTS = { date: 'Date', title: 'Title', type: 'Type', status: 'Status', views: 'Views' };
  function postPath(p) { return p.type === 'devotion' ? '/read/' + p.slug : p.type === 'reel' ? '/watch/' + p.slug : ''; }
  // Page views (from Insights, last 30 days) plus plays, when Insights is available. null = not known.
  function viewsOf(p) {
    var I = state.postInsights;
    if (!I || I.error && I.connected === undefined) return null;
    var n = 0, path = postPath(p), known = false;
    (I.pages || []).forEach(function (pg) { if (path && pg.path.replace(/\/$/, '') === path) { n += pg.views || 0; known = true; } });
    var pl = (I.plays || {})[p.type + ':' + p.slug];
    if (pl && !path) { n += pl.started || 0; known = true; }
    return known || I.connected ? n : null;
  }
  function filteredPosts() {
    var q = (state.q || '').trim().toLowerCase(), f = state.filter || 'all', sf = state.statusFilter || 'all';
    var list = state.posts.filter(function (p) {
      if (f !== 'all' && p.type !== f) return false;
      if (sf !== 'all' && statusOf(p) !== sf) return false;
      if (!q) return true;
      var hay = [p.title, p.slug, TYPES[p.type] && TYPES[p.type].name, p.fields && (p.fields.ref || p.fields.series || p.fields.caption), p.author_email].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
    var key = state.sortKey || 'date', dir = state.sortDir === 'asc' ? 1 : -1;
    var val = function (p) {
      if (key === 'title') return (p.title || '').toLowerCase();
      if (key === 'type') return TYPES[p.type] ? TYPES[p.type].name : p.type;
      if (key === 'status') return statusOf(p);
      if (key === 'views') { var v = viewsOf(p); return v == null ? -1 : v; }
      return p.publish_at || p.updated_at || '';
    };
    return list.slice().sort(function (a, b) { var x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; });
  }
  function thumb(p) {
    var t = TYPES[p.type] || TYPES.verse, poster = p.fields && p.fields.poster;
    return '<span class="thumb" style="background:' + t.color + ';color:' + t.ink + '" aria-hidden="true">' +
      (poster ? '<img alt="" loading="lazy" data-src="' + esc(poster) + '">' : '<span>' + esc(t.name[0]) + '</span>') + '</span>';
  }
  function postRows() {
    var list = filteredPosts(), limit = state.limit || PAGE_SIZE, shown = list.slice(0, limit);
    if (!list.length) {
      var msg = !state.posts.length ? 'No posts yet. Press “New post” to write the first one.'
        : state.q ? 'Nothing matches “' + esc(state.q) + '”. Try another word, or clear the search.'
        : 'No posts match these filters.';
      return '<div class="empty">' + msg + (state.posts.length ? ' <button class="btn soft small" type="button" id="clearFilters">Show all posts</button>' : '') + '</div>';
    }
    var head = function (k, label, cls) {
      var on = (state.sortKey || 'date') === k, dir = on ? (state.sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
      return '<th scope="col" class="' + (cls || '') + '" aria-sort="' + dir + '"><button type="button" class="sorth" data-sort="' + k + '">' + label + '<i aria-hidden="true">' + (on ? (state.sortDir === 'asc' ? '▲' : '▼') : '') + '</i></button></th>';
    };
    return '<table class="list ptable"><caption class="sr">Posts. Choose a column title to sort.</caption><thead><tr><th scope="col" class="c-thumb"><span class="sr">Picture</span></th>' +
      head('title', 'Title') + head('type', 'Type', 'c-type') + head('status', 'Status', 'c-status') + head('date', 'Date', 'c-date') + head('views', 'Views', 'c-views') + '</tr></thead><tbody>' +
      shown.map(function (p) {
        var st = statusOf(p), v = viewsOf(p), t = TYPES[p.type] || TYPES.verse;
        return '<tr class="row" data-edit="' + p.id + '"><td class="c-thumb">' + thumb(p) + '</td>' +
          '<td class="c-title"><button type="button" class="titlebtn" data-edit="' + p.id + '"><b>' + esc(p.title || 'Untitled') + '</b></button>' +
          '<small>' + (p.show_on_today ? 'On Today' : '') + (p.show_on_today && p.author_email ? ' · ' : '') + (p.author_email ? esc(p.author_email) : '') + '</small></td>' +
          '<td class="c-type"><span class="kind"><i style="background:' + t.color + '"></i>' + t.name + '</span></td>' +
          '<td class="c-status"><span class="pill ' + st + '">' + cap(st) + '</span></td>' +
          '<td class="c-date when">' + esc(fmtWhen(p.publish_at || p.updated_at)) + '</td>' +
          '<td class="c-views" title="Page views and plays in the last 30 days">' + (v == null ? '<span class="muted">—</span>' : v.toLocaleString()) + '</td></tr>';
      }).join('') + '</tbody></table>' +
      '<div class="more"><span class="muted" role="status">Showing ' + shown.length + ' of ' + list.length + (list.length === 1 ? ' post' : ' posts') + '</span>' +
      (list.length > shown.length ? '<button class="btn soft" type="button" id="loadMore">Show ' + Math.min(PAGE_SIZE, list.length - shown.length) + ' more</button>' : '') + '</div>';
  }
  function postsView() {
    if (!state.postInsights && !state.postInsightsLoading) setTimeout(loadPostInsights, 0);
    var count = function (st) { return state.posts.filter(function (p) { return statusOf(p) === st; }).length; };
    var next = state.posts.filter(function (p) { return p.status === 'scheduled' && !S.isLive(p); })
      .sort(function (a, b) { return a.publish_at.localeCompare(b.publish_at); })[0];
    var f = state.filter || 'all', sf = state.statusFilter || 'all';
    var typeCount = function (k) { return state.posts.filter(function (p) { return p.type === k; }).length; };
    return '<div class="top"><div><h2>Posts' + help('posts') + '</h2><p>Everything on Today, Watch, Listen, Read and Verses.' +
      (next ? ' <span class="nextup">Next scheduled: <b>' + esc(fmtWhen(next.publish_at)) + '</b></span>' : '') + '</p></div>' +
      '<button class="btn primary" type="button" data-view="new">+ New post</button></div>' +
      '<div class="ptools">' +
        '<label class="search"><span class="sr">Search posts</span><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>' +
        '<input class="input" type="search" id="postSearch" placeholder="Search by title, verse or series" autocomplete="off" value="' + esc(state.q || '') + '"></label>' +
        '<label class="sortsel"><span class="sr">Sort by</span><select class="select" id="postSort">' +
          [['date-desc', 'Newest first'], ['date-asc', 'Oldest first'], ['title-asc', 'Title A–Z'], ['views-desc', 'Most viewed'], ['type-asc', 'Type'], ['status-asc', 'Status']].map(function (o) {
            var cur = (state.sortKey || 'date') + '-' + (state.sortDir || 'desc');
            return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
          }).join('') + '</select></label>' +
      '</div>' +
      '<div class="filters"><div class="chips" role="group" aria-label="Show status">' +
        '<button class="chip' + (sf === 'all' ? ' on' : '') + '" type="button" data-sfilter="all" aria-pressed="' + (sf === 'all') + '">All <span class="n">' + state.posts.length + '</span></button>' +
        STATUSES.map(function (s) { return '<button class="chip' + (sf === s[0] ? ' on' : '') + '" type="button" data-sfilter="' + s[0] + '" aria-pressed="' + (sf === s[0]) + '">' + s[1] + ' <span class="n">' + count(s[0]) + '</span></button>'; }).join('') +
      '</div><div class="chips" role="group" aria-label="Filter by kind"><button class="chip' + (f === 'all' ? ' on' : '') + '" type="button" data-filter="all" aria-pressed="' + (f === 'all') + '">All kinds</button>' +
        Object.keys(TYPES).map(function (k) { return '<button class="chip' + (f === k ? ' on' : '') + '" type="button" data-filter="' + k + '" aria-pressed="' + (f === k) + '"><i style="background:' + TYPES[k].color + '"></i>' + TYPES[k].name + (k === 'reel' ? ' (video)' : '') + ' <span class="n">' + typeCount(k) + '</span></button>'; }).join('') +
      '</div></div>' +
      '<div id="postResults">' + postRows() + '</div>';
  }
  function refreshPostRows() { var el = document.getElementById('postResults'); if (el) { el.innerHTML = postRows(); resolveMediaElements(); } }
  function loadPostInsights() {
    state.postInsightsLoading = true;
    S.accessToken().then(function (token) {
      if (!token) return null;
      return fetch('/api/insights?days=30', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' }).then(function (r) { return r.ok || r.status === 502 ? r.json() : null; });
    }).then(function (body) { state.postInsights = body || { error: 'none' }; if (state.view === 'posts' && body) refreshPostRows(); })
      .catch(function () { state.postInsights = { error: 'none' }; });
  }

  function newView() {
    return '<div class="top"><div><h2>What would you like to share?' + help('write') + '</h2><p>Pick a kind of post. Each one has its own colour in the app.</p></div></div>' +
      '<div class="types">' + Object.keys(TYPES).map(function (k) {
        return '<button class="type t-' + k + '" type="button" data-new="' + k + '"><b>' + TYPES[k].name + '</b><span>' + TYPES[k].hint + '</span></button>';
      }).join('') + '</div>';
  }

  function seriesNames() {
    var seen = {};
    (state.posts || []).forEach(function (p) { var s = p.type === 'reel' && p.fields && String(p.fields.series || '').trim(); if (s) seen[s] = 1; });
    return Object.keys(seen).sort();
  }
  function field(id, label, value, opts) {
    opts = opts || {};
    var err = state.errors[id];
    var input = opts.textarea
      ? '<textarea class="textarea' + (opts.tall ? ' tall' : '') + (err ? ' err' : '') + '" id="f_' + id + '" data-f="' + id + '" placeholder="' + esc(opts.ph || '') + '">' + esc(value) + '</textarea>'
      : '<input class="input' + (err ? ' err' : '') + '" id="f_' + id + '" data-f="' + id + '" value="' + esc(value) + '" placeholder="' + esc(opts.ph || '') + '"' + (opts.type ? ' type="' + opts.type + '"' : '') + (opts.list ? ' list="' + opts.list + '" autocomplete="off"' : '') + '>';
    return '<label class="field"><span>' + label + '</span>' + (opts.toolbar ? '<div class="toolbar"><button type="button" data-md="**" title="Bold">B</button><button type="button" data-md="_" title="Italic"><i>I</i></button><button type="button" data-md="> " title="Quote">“ Quote</button></div>' : '') +
      input + (err ? '<span class="errmsg" role="alert">' + err + '</span>' : opts.help ? '<small' + (opts.helpId ? ' id="' + opts.helpId + '"' : '') + '>' + opts.help + '</small>' : '') + '</label>';
  }
  function uploadField(label, accept, help) {
    var e = state.editing, busy = state.uploading === 'file';
    return '<div class="field"><span>' + label + '</span><label class="upload' + (busy ? ' busy' : '') + '" data-drop="file"><b>' +
      (busy ? 'Uploading…' : e.file ? esc(e.file) : 'Choose a file or drop it here') + '</b><small>' + help + '</small>' +
      '<input class="sr" type="file" accept="' + accept + '" data-file="file" id="f_file"></label>' +
      (state.errors.file ? '<span class="errmsg" role="alert">' + state.errors.file + '</span>' : '') + '</div>';
  }

  // Poster (thumbnail) for a video reel, stored in fields.poster (a URL like media_url, so any storage
  // host works). Optional: without one, a frame about 1 s in is taken from the video and saved as WebP.
  var POSTER_TYPES = ['image/jpeg', 'image/png', 'image/webp'], POSTER_MAX = 5 * 1024 * 1024;
  function posterField() {
    var e = state.editing, busy = state.uploading === 'poster';
    if (!e.media_url && !e.poster) return '';
    return '<div class="field"><span>Poster image (optional)</span><div class="poster-row">' +
      (e.poster ? '<img class="poster-pv" id="posterPv" alt="Poster preview" width="90" height="160" data-src="' + esc(e.poster) + '">' : '<div class="poster-pv empty" id="posterPv">No poster</div>') +
      '<div class="poster-acts"><label class="upload' + (busy ? ' busy' : '') + '" data-drop="poster"><b>' + (busy ? 'Saving poster…' : 'Choose a poster image') + '</b>' +
      '<small>JPG, PNG or WebP, up to 5 MB. Vertical 9:16 looks best. ' + (e.poster ? (e.poster_auto ? 'Now using a frame from the video.' : 'Now using your image.') : 'Without one, a frame from the video is used.') + '</small>' +
      '<input class="sr" type="file" accept="' + POSTER_TYPES.join(',') + '" data-file="poster" id="f_poster"></label>' +
      (e.media_url ? '<button class="btn soft small" type="button" id="posterFrame"' + (busy ? ' disabled' : '') + '>Use a frame from the video</button>' : '') +
      '</div></div>' + (state.errors.poster ? '<span class="errmsg" role="alert">' + state.errors.poster + '</span>' : '') + '</div>';
  }

  function editView() {
    var p = state.editing, t = TYPES[p.type], f = '';
    if (p.type === 'verse') {
      f = field('verse', 'Verse text', p.verse, { textarea: true, ph: 'Your word is a lamp to my feet…', help: verseLenNote(p.verse), helpId: 'verseNote' }) +
        '<div class="two">' + field('ref', 'Reference', p.ref, { ph: 'Psalm 119:105' }) +
        field('translation', 'Translation', p.translation, { ph: 'WEB', list: 'translations', help: 'WEB, KJV, ASV and BSB are public domain. Others (NIV, ESV, NLT…) are copyrighted: follow the publisher’s quoting rules.' }) +
        '<datalist id="translations">' + TRANSLATIONS.map(function (x) { return '<option value="' + x + '">'; }).join('') + '</datalist></div>' +
        '<div class="field"><span>Topics</span><div class="topics">' + allTopics().map(function (x) { var on = (p.topics || []).indexOf(x) >= 0; return '<button class="chip' + (on ? ' on' : '') + '" type="button" data-topic="' + esc(x) + '" aria-pressed="' + on + '">' + esc(x) + '</button>'; }).join('') + '</div>' +
        '<div class="add-topic"><input class="input" id="newTopic" placeholder="New topic, e.g. Armor of God" maxlength="40" aria-label="New topic"><button class="btn soft small" type="button" id="addTopic">Add topic</button></div>' +
        '<small>Parents find verses by these. New topics appear in the app’s Verses tab.</small></div>';
    } else if (p.type === 'devotion') {
      var audios = state.posts.filter(function (x) { return x.type === 'audio'; });
      f = field('title', 'Title', p.title, { ph: 'God sees the heart' }) +
        field('teaser', 'One-line summary for the Today card', p.teaser, { ph: 'David was the youngest, out with the sheep. God saw him first.', help: 'Keep it under 100 characters.' }) +
        field('body', 'Devotion', p.body, { textarea: true, tall: true, toolbar: true, ph: 'Write the reading here. Leave an empty line between paragraphs.' }) +
        '<div class="two">' + field('ref', 'Bible passage', p.ref, { ph: '1 Samuel 16:7' }) +
        '<label class="field"><span>Audio version</span><select class="select" data-f="audioId" id="f_audioId"><option value="">None yet</option>' +
        audios.map(function (x) { return '<option value="' + x.id + '"' + (String(p.audioId) === String(x.id) ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('') + '</select></label></div>' +
        field('family', 'For families tonight', p.family, { textarea: true, ph: 'A question or small activity to do together' }) +
        field('prayer', 'Prayer', p.prayer, { textarea: true, ph: 'Lord, …' });
    } else if (p.type === 'audio') {
      f = field('title', 'Title', p.title, { ph: 'Bedtime prayer: stay close tonight' }) +
        '<div class="two"><label class="field"><span>Kind</span><select class="select" data-f="kind" id="f_kind">' + ['Devotion', 'Prayer', 'Bible story for kids'].map(function (x) { return '<option' + ((p.kind || 'Devotion') === x ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
        field('minutes', 'Length', p.minutes, { ph: 'Filled in from the file' }) + '</div>' +
        uploadField('Recording', 'audio/*', 'MP3 or M4A, up to 50 MB. The length is read from the file.') +
        field('transcript', 'Transcript (Read along)', p.transcript, { textarea: true, tall: true, ph: 'What the recording says. Shown under the player so listeners can read along. Leave an empty line between paragraphs.' });
    } else if (p.type === 'reel') {
      f = field('title', 'Title', p.title, { ph: 'Noah kept building' }) +
        field('caption', 'Caption', p.caption, { textarea: true, ph: 'What the reel is about, with the Bible reference' }) +
        uploadField('Video', 'video/*', 'Vertical 9:16 MP4, up to 60 seconds and 50 MB. Or paste a YouTube Shorts link below.') +
        posterField() +
        '<div class="two">' + field('youtube', 'YouTube link (optional)', p.youtube, { ph: 'https://youtube.com/shorts/…', type: 'url' }) + field('minutes', 'Length', p.minutes, { ph: '0:52' }) + '</div>' +
        // Series: reels with the same series name are grouped on the Watch page, ordered by episode number.
        '<div class="two">' + field('series', 'Series (optional)', p.series, { ph: 'Leave empty for a standalone reel', list: 'seriesList', help: 'Reels with the same series name are shown together.' }) +
        field('episode', 'Episode #', p.episode, { type: 'number', ph: '1' }) + '</div>' +
        '<datalist id="seriesList">' + seriesNames().map(function (s) { return '<option value="' + esc(s) + '">'; }).join('') + '</datalist>' +
        field('series_description', 'Series description (optional)', p.series_description, { textarea: true, ph: 'Shown on the series page. Leave empty to use the first episode’s caption.' }) +
        // Caption page on desktop: the reel becomes the left page of a book, the caption a tinted glass page.
        '<div class="two"><label class="field"><span>Page style</span><select class="select" data-f="page_style" id="f_page_style">' +
        PAGE_STYLES.map(function (st) { return '<option value="' + st + '"' + ((p.page_style || 'auto') === st ? ' selected' : '') + '>' + PAGE_STYLE_LABEL[st] + '</option>'; }).join('') +
        '</select><small>The caption page on computers. Auto: dark at night, light by day.</small></label>' +
        '<label class="field"><span>Page colour</span><span class="colorrow"><input type="color" id="f_page_color_pick" data-pick="page_color" value="' + esc(/^#[0-9a-f]{6}$/i.test(p.page_color || '') ? p.page_color : '#c8742e') + '" aria-label="Pick page colour">' +
        '<input class="input" id="f_page_color" data-f="page_color" value="' + esc(p.page_color || '') + '" placeholder="Auto (from the reel)" maxlength="7" pattern="#[0-9a-fA-F]{6}"></span>' +
        '<small>Leave empty to use the reel’s own colour. Text and buttons are adjusted so they stay easy to read.</small></label></div>';
    } else {
      f = field('title', 'Headline', p.title, { ph: 'Noah’s Ark is ready to play' }) +
        field('text', 'Text', p.text, { textarea: true, ph: 'What’s new in the game' }) +
        field('button', 'Button label', p.button, { ph: 'See the game' });
    }
    var mode = p._mode, pub = canPublish();
    var primary = !pub ? '' : '<button class="btn primary" type="submit"' + (state.busy || state.uploading ? ' disabled' : '') + '>' +
      (state.busy ? 'Saving…' : mode === 'schedule' ? 'Schedule' : p.status === 'published' ? 'Update' : 'Publish') + '</button>';
    var canDelete = p.id && (canPublish());
    return '<div class="top"><div><h2>' + (p.id ? 'Edit ' : 'New ') + t.name.toLowerCase() + help('write') + '</h2><p>' + t.hint + '. The preview updates as you type.</p></div>' +
      '<button class="btn ghost" type="button" data-view="posts">← All posts</button></div>' +
      '<div class="editor"><div class="edit-col"><form class="form" id="postForm" novalidate><h3>' + t.name + '</h3>' + f +
      '<label class="toggle"><input type="checkbox" id="f_today" data-check="show_on_today"' + (p.show_on_today ? ' checked' : '') + '> Show on the Today feed</label>' +
      '<div class="publish">' +
      (pub ? '<div class="seg" role="group" aria-label="When to publish">' +
        '<button type="button" data-mode="now" class="' + (mode === 'now' ? 'on' : '') + '" aria-pressed="' + (mode === 'now') + '">Publish now</button>' +
        '<button type="button" data-mode="schedule" class="' + (mode === 'schedule' ? 'on' : '') + '" aria-pressed="' + (mode === 'schedule') + '">Schedule</button></div>' +
        (mode === 'schedule' ? '<label class="field"><span>Date and time</span><input class="input' + (state.errors.when ? ' err' : '') + '" type="datetime-local" id="f_when" data-f="when" value="' + esc(p.when) + '">' +
          (state.errors.when ? '<span class="errmsg" role="alert">' + state.errors.when + '</span>' : '<small>Your local time. Good slots: 6:30 in the morning, 19:30 before bedtime.</small>') + '</label>' : '')
        : '<p class="role-note">' + (p.id && p.status !== 'draft' ? 'This post is live or scheduled. Only an owner or editor can change it.' : 'Contributors save drafts. An owner or editor publishes them.') + '</p>') +
      '<div class="actions">' +
        (canDelete ? (state.confirmDelete
          ? '<span class="confirm">Delete this post for everyone? <button class="btn danger" type="button" id="delYes">Delete</button><button class="btn ghost" type="button" id="delNo">Keep it</button></span>'
          : '<button class="btn danger" type="button" id="del">Delete</button>') : '') +
        (p.status === 'published' || (p.status === 'scheduled') ? (pub ? '<button class="btn soft" type="button" id="unpublish"' + (state.busy ? ' disabled' : '') + '>Move to drafts</button>' : '')
          : '<button class="btn soft" type="button" id="saveDraft"' + (state.busy || state.uploading ? ' disabled' : '') + '>Save draft</button>') +
        primary +
      '</div></div></form>' + historyView() + '</div>' +
      '<div class="preview-col"><span class="label">Preview on Today</span><div class="phone"><div class="screen" id="preview">' + preview(p) + '</div></div>' +
      '<p class="pv-note">This is how the post will look in the app’s feed.</p></div></div>';
  }

  function preview(p) {
    var t = TYPES[p.type], ph = function (v, d) { return v ? esc(v) : '<span class="placeholder">' + d + '</span>'; }, inner = '';
    var bg = { verse: 'radial-gradient(120% 80% at 80% 25%, #ffe089, #f7c23f 45%, #e0a820)', devotion: '#ee8fb2', reel: '#e46a4c',
      audio: 'radial-gradient(120% 70% at 50% 30%, #b99ae4, #a07fd6 50%, #6f52a8)', game: 'linear-gradient(180deg, #9ad8aa, #69ba7e 55%, #3f8a55)' }[p.type];
    if (p.type === 'verse') inner = '<div class="sun"></div><div class="kick">Verse of the week</div><div class="verse' + (isLongVerse(p.verse) ? ' preview' : '') + '">“' + ph((p.verse || '').trim(), 'Your verse appears here') + '”</div><div class="ref">' + ph((p.ref || '').toUpperCase(), 'REFERENCE') + ' · ' + esc((p.translation || '').trim() || 'WEB') + '</div><div class="btns"><span class="pbtn">' + (isLongVerse(p.verse) ? 'Read full passage' : 'More verses') + '</span><span class="pbtn g">Save image</span></div>';
    else if (p.type === 'devotion') inner = '<div class="kick">Devotion · ' + readMinutes(p) + ' min</div><div class="big">' + ph(p.title, 'Your title') + '</div><p>' + ph(p.teaser, 'Your one-line summary') + '</p><div class="btns"><span class="pbtn">Read ↑</span>' + (p.audioId ? '<span class="pbtn g">▶ Listen</span>' : '') + '</div>';
    else if (p.type === 'audio') inner = '<div class="wave">' + [30, 70, 45, 90, 55, 80, 35, 65, 50, 85, 40, 60].map(function (h) { return '<i style="height:' + h + '%"></i>'; }).join('') + '</div><div class="kick">Audio · ' + esc(p.minutes || '0:00') + '</div><div class="big">' + ph(p.title, 'Your title') + '</div><p>' + esc(p.kind || 'Devotion') + '</p><div class="btns"><span class="pbtn">▶ Play</span></div>';
    else if (p.type === 'reel') inner = '<div class="play"></div><div class="kick">Reel · ' + esc(p.minutes || '0:00') + '</div><div class="big">' + ph(p.title, 'Your title') + '</div><div class="btns"><span class="pbtn">▶ Watch</span></div>';
    else inner = '<div class="kick">Game</div><div class="big">' + ph(p.title, 'Your headline') + '</div><p>' + ph(p.text, 'What’s new') + '</p><div class="btns"><span class="pbtn">' + esc(p.button || 'See the game') + '</span></div>';
    return '<div class="pv" style="background:' + bg + ';color:' + t.ink + '">' + inner + '</div>' +
      '<div class="tabbar"><span class="on">Today</span><span>Watch</span><span>Listen</span><span>Read</span><span>Verses</span><span>Play</span></div>';
  }
  function readMinutes(p) { return Math.max(1, Math.round([p.body, p.family, p.prayer].join(' ').split(/\s+/).filter(Boolean).length / 180)); }

  function mediaView() {
    var files = state.posts.filter(function (p) { return p.media_url; });
    return '<div class="top"><div><h2>Media' + help('media') + '</h2><p>Audio and video attached to posts.</p></div></div>' +
      (files.length ? '<div class="grid-media">' + files.map(function (p) {
        var isVideo = p.type === 'reel';
        return '<div class="media"><div class="thumb" style="background:' + TYPES[p.type].color + '">' + (isVideo ? '▶ ' : '♪ ') + esc((p.fields || {}).minutes || '') + '</div>' +
          '<div><b>' + esc((p.fields || {}).file || 'File') + '</b><small>Used in: ' + esc(p.title) + '</small>' +
          '<' + (isVideo ? 'video' : 'audio') + ' controls preload="none" data-src="' + esc(p.media_url) + '"></' + (isVideo ? 'video' : 'audio') + '></div></div>';
      }).join('') + '</div>' : '<div class="list"><div class="empty">No files yet. Upload one when you write an audio or reel post.</div></div>');
  }
  var NAV_LABEL = { watch: 'Watch', listen: 'Listen', read: 'Read', verses: 'Verses', play: 'Play' };
  var NAV_STATE_LABEL = { on: 'On', coming_soon: 'Coming soon', hidden: 'Hidden' };
  function siteView() {
    var n = state.nav || S.navDefault(), owner = isOwner();
    return '<div class="top"><div><h2>Menus' + help('menus') + '</h2><p>Choose which menus visitors see in the app. “Coming soon” keeps the menu but shows a friendly message when tapped.</p></div></div>' +
      (state.navError ? '<p class="role-note" role="alert">The menu settings could not be loaded (' + esc(state.navError) + '). If the <code>site_settings</code> table hasn’t been created yet, run supabase/schema.sql first. Until then the app uses its built-in default (Verses: coming soon).</p>' : '') +
      (owner ? '' : '<p class="role-note">Only owners can change the menus.</p>') +
      '<form class="form" id="siteForm" novalidate>' +
      '<label class="field"><span>Today</span><select class="select" disabled><option>Always on</option></select></label>' +
      S.NAV_MENUS.map(function (m) {
        return '<label class="field"><span>' + esc(NAV_LABEL[m]) + '</span><select class="select" id="nav_' + m + '"' + (owner ? '' : ' disabled') + '>' +
          S.NAV_STATES.map(function (st) { return '<option value="' + st + '"' + (n.menus[m] === st ? ' selected' : '') + '>' + esc(NAV_STATE_LABEL[st]) + '</option>'; }).join('') + '</select></label>';
      }).join('') +
      '<label class="field"><span>Coming-soon message</span><textarea class="input" id="nav_message" rows="3" maxlength="300"' + (owner ? '' : ' disabled') + '>' + esc(n.message) + '</textarea>' +
      '<small>Shown under “Verses is coming soon” (or the menu’s name). Keep it short and friendly.</small></label>' +
      (owner ? '<button class="btn primary" type="submit"' + (state.busy ? ' disabled' : '') + '>Save menus</button>' : '') + '</form>' +
      '<h3 class="sub">Content</h3>' +
      '<form class="form" id="contentForm" novalidate>' +
      '<label class="check"><input type="checkbox" id="content_verses"' + ((state.content || {}).verses ? ' checked' : '') + (owner ? '' : ' disabled') + '> ' +
      '<span>Show verse cards on Today (Verse, Verse of the week, published verse posts, “More verses” and “Save image”)</span></label>' +
      '<small>Off by default. Nothing is deleted: switching it back on brings them back. Bible quotes inside devotions always show. The Verses menu follows its own setting above.</small>' +
      (owner ? '<button class="btn primary" type="submit"' + (state.busy ? ' disabled' : '') + '>Save content</button>' : '') + '</form>' +
      '<h3 class="sub">Reel caption page</h3>' +
      '<form class="form" id="reelPageForm" novalidate><label class="field"><span>Default page style (computers)</span><select class="select" id="reel_page_style"' + (owner ? '' : ' disabled') + '>' +
      PAGE_STYLES.map(function (st) { return '<option value="' + st + '"' + (((state.reelPage || {}).style || 'auto') === st ? ' selected' : '') + '>' + PAGE_STYLE_LABEL[st] + '</option>'; }).join('') + '</select>' +
      '<small>Used for reels whose Page style is Auto. Auto here means dark at night and light by day.</small></label>' +
      (owner ? '<button class="btn primary" type="submit"' + (state.busy ? ' disabled' : '') + '>Save page style</button>' : '') + '</form>';
  }
  // Items written into the app (js/content.js). A Studio post with the same `builtin` key replaces one
  // once published; here they can be hidden altogether.
  function builtinItems() {
    var C = window.LL_CONTENT || {}, out = [];
    [['episodes', 'audio', 'Audio', function (e) { return e.title; }], ['devotions', 'devotion', 'Devotion', function (d) { return d.slug; }, function (d) { return d.title; }],
      ['reels', 'reel', 'Reel', function (r) { return r.title; }], ['verses', 'verse', 'Verse', function (v) { return v.ref; }]].forEach(function (t) {
      (C[t[0]] || []).forEach(function (item) {
        out.push({ key: t[1] + ':' + S.slugify(t[3](item)), type: t[2], title: (t[4] || t[3])(item), silent: t[1] === 'audio' && !item.src, byDefault: item.hidden === true });
      });
    });
    return out;
  }
  function builtinsView() {
    var owner = isOwner(), hidden = state.hidden || [], bf = state.builtinFilter || 'all';
    var shownBuiltins = builtItemsBy(bf, hidden);
    return '<div class="top"><div><h2>Built-in content' + help('builtins') + '</h2><p>Items that came with the app. Hide any you don’t want visitors to see. A published Studio copy of an item replaces it anyway.</p></div></div>' +
      (state.hiddenError ? '<p class="role-note" role="alert">The hidden list could not be loaded (' + esc(state.hiddenError) + '). Nothing is hidden until it can be.</p>' : '') +
      (owner ? '' : '<p class="role-note">Only owners can change this.</p>') +
      builtinFilterChips(hidden) +
      '<div class="list" id="builtinList">' + (shownBuiltins.length ? '' : '<div class="empty" role="status">' + (bf === 'hidden' ? 'No hidden items.' : 'No visible items.') + '</div>') + shownBuiltins.map(function (it) {
        var off = hidden.indexOf(it.key) >= 0;
        return '<div class="row brow" data-key="' + esc(it.key) + '"><span class="btitle"><b>' + esc(it.title) + '</b><small>' + esc(it.type) + (it.silent ? ' · no recording yet, not shown in the app' : '') + '</small></span>' +
          '<span class="bctrls"><span class="pill ' + (off ? 'draft' : 'published') + '">' + (off ? 'Hidden' : 'Visible') + '</span>' + (it.byDefault ? '<small>hidden by default</small>' : '') +
          (owner ? '<button class="btn ghost small" type="button" data-bhide="' + esc(it.key) + '" aria-pressed="' + off + '">' + (off ? 'Show' : 'Hide') + '</button>' : '') + '</span></div>';
      }).join('') + '</div>' +
      (owner ? '<div style="margin-top:16px"><button class="btn primary" type="button" id="saveHidden"' + (state.busy ? ' disabled' : '') + '>Save</button></div>' : '');
  }
  // Built-in content filter: All, Visible, Hidden (by the list as it stands, including unsaved changes).
  function builtItemsBy(f, hidden) {
    return builtinItems().filter(function (it) { var off = hidden.indexOf(it.key) >= 0; return f === 'hidden' ? off : f === 'visible' ? !off : true; });
  }
  function builtinFilterChips(hidden) {
    var bf = state.builtinFilter || 'all';
    return '<div class="filters"><div class="chips" role="group" aria-label="Show built-in items">' +
      [['all', 'All'], ['visible', 'Visible'], ['hidden', 'Hidden']].map(function (o) {
        return '<button class="chip' + (bf === o[0] ? ' on' : '') + '" type="button" data-bfilter="' + o[0] + '" aria-pressed="' + (bf === o[0]) + '">' + o[1] + ' <span class="n">' + builtItemsBy(o[0], hidden).length + '</span></button>';
      }).join('') + '</div></div>';
  }
  // A small “?” beside a section title that opens its part of the guide.
  function help(part) {
    return ' <button class="help" type="button" data-view="guide" data-guide="' + part + '" aria-label="How to: ' + esc(GUIDE_TITLE[part]) + '" title="How to use this">?</button>';
  }
  // ---------- Guide: short, task-based steps for new team members (only features this Studio has) ----------
  var GUIDE_TITLE = { start: 'Sign in', account: 'Your password and signing out', posts: 'Find and edit posts', write: 'Write a new post',
    publish: 'Publish, schedule or keep a draft', reelpage: 'Reel page colours and styles', media: 'Media', menus: 'Menus and content switches',
    builtins: 'Built-in content', insights: 'Insights', team: 'Team and roles' };
  function guideView() {
    var part = function (id, steps, note) {
      return '<section class="gpart" aria-labelledby="gh-' + id + '"><h3 id="g-' + id + '" tabindex="-1"><span id="gh-' + id + '">' + GUIDE_TITLE[id] + '</span></h3>' +
        '<ol>' + steps.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ol>' + (note ? '<p class="gnote">' + note + '</p>' : '') + '</section>';
    };
    return '<div class="top"><div><h2>How to use Studio</h2><p>Short steps for the everyday jobs. Tap a “?” beside any section title to jump straight to its part here.</p></div></div>' +
      '<nav class="gtoc" aria-label="Guide contents"><ul>' + Object.keys(GUIDE_TITLE).map(function (k) { return '<li><a href="#g-' + k + '" data-gjump="' + k + '">' + GUIDE_TITLE[k] + '</a></li>'; }).join('') + '</ul></nav>' +
      '<div class="guide">' +
      part('start', ['Open the Studio and type your email.', 'Type your password and press <b>Sign in</b>.', 'No password yet? Press <b>Email me a one-time sign-in link</b> and open the link on the same device.'],
        'Only people on the team can sign in. There is no sign-up: the owner adds you on the Team page.') +
      part('account', ['Press <b>Change password</b> at the top (beside Sign out).', 'Type a new password twice. Use at least 12 characters; a short phrase of random words works well.', 'Press <b>Sign out</b> when you finish on a shared device.']) +
      part('posts', ['Open <b>Posts</b> to see everything on Today, Watch, Listen, Read and Verses.', 'Type in the search box, or use the kind and status chips (Published, Scheduled, Drafts) to narrow the list.', 'On a computer, press a column title to sort by title, type, status, date or views.', 'Tap a post to open it and change it.']) +
      part('write', ['Press <b>New post</b> and pick a kind: Verse, Devotion, Reel, Audio or Game update.', 'Fill in the fields. The phone preview on the right shows how it will look on Today.', 'For audio and reels, choose or drop the file to upload it. For a reel you can also add a poster image or use a frame from the video.', 'Tick <b>Show on the Today feed</b> if it should appear there.'],
        'Each saved change is kept in <b>History</b> under the form. Press <b>Restore this version</b> to go back to an older one.') +
      part('publish', ['Choose <b>Publish now</b> or <b>Schedule</b>. For Schedule, pick a date and time (your local time).', 'Press <b>Publish</b> (or <b>Schedule</b>, or <b>Update</b> for a live post).', 'Not ready? Press <b>Save draft</b>. A live post can go back with <b>Move to drafts</b>.', 'To remove a post for everyone, press <b>Delete</b>, then confirm.'],
        'Contributors save drafts only. An owner or editor publishes them.') +
      part('reelpage', ['Open a reel post.', 'Under <b>Page style</b>, choose Auto from reel, Dark, Light or Glass clear. This is the caption page on computers.', 'Under <b>Page colour</b>, pick a colour, or leave it empty to use the reel’s own colour. Text and buttons are adjusted so they stay easy to read.', 'To set the default for every reel left on Auto, go to <b>Menus</b> → <b>Reel caption page</b> and press <b>Save page style</b> (owner only).']) +
      part('media', ['Open <b>Media</b> to see the audio and video files attached to posts.', 'Press play to check a file, and see which post uses it.', 'To add a file, upload it while writing an audio or reel post.']) +
      part('menus', ['Open <b>Menus</b> (owner only).', 'For Watch, Listen, Read, Verses and Play, choose On, Coming soon or Hidden. Today is always on.', 'Write a short, friendly coming-soon message, then press <b>Save menus</b>.', 'Under <b>Content</b>, switch the verse cards on Today on or off and press <b>Save content</b>.']) +
      part('builtins', ['Open <b>Built-in content</b> to see items that came with the app.', 'Press <b>Hide</b> on any item visitors should not see, or <b>Show</b> to bring it back.', 'Press <b>Save</b>.', 'Use the <b>All</b>, <b>Visible</b> and <b>Hidden</b> chips to see just one group.'],
        'A published Studio copy of an item replaces it anyway.') +
      part('insights', ['Open <b>Insights</b>.', 'Pick 7, 30 or 90 days.', 'See visits, the most-read pages, countries, where visitors came from, and plays and “read to the end”.'],
        'Counts only: no names and no personal data.') +
      part('team', ['Open <b>Team</b> (owner only to add or remove people).', 'Type the person’s email, choose a role and press <b>Add to team</b>.', 'They sign in with the same page. Press <b>Remove</b> to take someone off the team.'],
        '<b>Owner</b>: everything, including adding and removing people. <b>Editor</b>: writes, publishes and deletes posts. <b>Contributor</b>: writes drafts for an owner or editor to publish.') +
      '</div>';
  }
  function teamView() {
    return '<div class="top"><div><h2>Team' + help('team') + '</h2><p>Only people on this list can sign in to the Studio.</p></div></div>' +
      (isOwner() ? '<form class="form invite" id="inviteForm" novalidate>' +
        '<label class="field"><span>Email</span><input class="input' + (state.errors.invite ? ' err' : '') + '" id="inviteEmail" type="email" placeholder="name@example.com">' + (state.errors.invite ? '<span class="errmsg" role="alert">' + esc(state.errors.invite) + '</span>' : '') + '</label>' +
        '<label class="field"><span>Role</span><select class="select" id="inviteRole"><option value="editor">Editor</option><option value="contributor">Contributor</option><option value="owner">Owner</option></select></label>' +
        '<button class="btn primary" type="submit">Add to team</button></form>' : '') +
      '<div class="list team">' + state.team.map(function (m) {
        var me = m.email === state.email;
        return '<div class="member"><span class="avatar">' + esc(m.email[0].toUpperCase()) + '</span><span><b>' + esc(m.email) + '</b><small>' + (me ? 'You' : 'Added ' + esc(fmtWhen(m.invited_at))) + '</small></span>' +
          '<span style="display:flex;gap:8px;align-items:center"><span class="pill ' + (m.role === 'owner' ? 'published' : 'draft') + '">' + cap(m.role) + '</span>' +
          (isOwner() && !me ? '<button class="btn ghost small" type="button" data-remove="' + esc(m.email) + '">Remove</button>' : '') + '</span></div>';
      }).join('') + '</div>' +
      '<div class="roles"><div class="role"><b>Owner</b><span>Everything, including adding and removing people.</span></div>' +
      '<div class="role"><b>Editor</b><span>Writes, publishes and deletes posts.</span></div>' +
      '<div class="role"><b>Contributor</b><span>Writes drafts. An owner or editor publishes them.</span></div></div>' +
      (S.mode === 'local' ? '' : '<p class="role-note">New people sign in with the same email-link page. They can only get in after you add them here.</p>');
  }

  // ---------- render ----------
  function render() {
    if (state.screen === 'loading') return;
    if (state.screen === 'signin') root.innerHTML = signin();
    else if (state.screen === 'check') root.innerHTML = checkEmail();
    else {
      var v = state.pwOpen ? passwordView() : state.view === 'posts' ? postsView() : state.view === 'new' ? newView() : state.view === 'edit' ? editView() : state.view === 'media' ? mediaView() : state.view === 'site' ? siteView() : state.view === 'builtins' ? builtinsView() : state.view === 'insights' ? insightsView() : state.view === 'guide' ? guideView() : teamView();
      var ae = document.activeElement, keep = ae && ae.id === 'postSearch' ? [ae.selectionStart, ae.selectionEnd] : null;
      root.innerHTML = shell(v);
      if (state.view === 'media' || state.view === 'edit' || state.view === 'new' || state.view === 'posts') resolveMediaElements();
      var navOn = root.querySelector('.side nav .nav.on'), navBar = navOn && navOn.parentNode;
      if (navBar && navBar.scrollWidth > navBar.clientWidth) navBar.scrollLeft = Math.max(0, navOn.offsetLeft - navBar.offsetLeft - 24);
      if (state.view === 'guide' && state.guideAt) { var gt = document.getElementById('g-' + state.guideAt); state.guideAt = null; if (gt) { gt.scrollIntoView({ block: 'start' }); gt.focus({ preventScroll: true }); } }
      if (keep) { var ps = document.getElementById('postSearch'); if (ps) { ps.focus(); try { ps.setSelectionRange(keep[0], keep[1]); } catch (err) {} } }
    }
  }
  // ---------- Insights: Cloudflare Web Analytics + anonymous play/read counts (functions/api/insights.js) ----------
  function loadInsights(days) {
    state.insights = { loading: true, days: days };
    if (state.view === 'insights') render();
    S.accessToken().then(function (token) {
      if (!token) return { status: 0, body: { error: S.mode === 'local' ? 'Insights need the live Studio (Supabase mode).' : 'Sign in again to see insights.' } };
      return fetch('/api/insights?days=' + days, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
        .then(function (r) { return r.json().catch(function () { return { error: 'Insights aren’t available on this address yet.' }; }).then(function (b) { return { status: r.status, body: b }; }); });
    }).then(function (res) {
      state.insights = res.body || {}; state.insights.days = days;
      if (state.view === 'insights') render();
    }).catch(function () { state.insights = { days: days, error: 'Couldn’t load insights. Check your connection and try again.' }; if (state.view === 'insights') render(); });
  }
  // A friendly title for an address or content key, from Studio posts or built-in content.
  function insightTitle(kind, slug) {
    var p = state.posts.filter(function (x) { return x.type === kind && (x.slug === slug || S.slugify(x.title || '') === slug); })[0];
    if (p) return p.title;
    var C = window.LL_CONTENT || {}, list = kind === 'devotion' ? C.devotions : kind === 'reel' ? C.reels : kind === 'audio' ? C.episodes : [];
    var b = (list || []).filter(function (x) { return (x.slug || S.slugify(x.title || '')) === slug; })[0];
    return b ? b.title : slug;
  }
  // Friendly country name and flag from the two-letter code Cloudflare reports.
  var regionNames = null;
  try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch (err) {}
  function countryLabel(code) {
    var c = String(code || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(c)) return c && c !== 'UNKNOWN' ? code : 'Somewhere unknown';
    var name = c; try { name = regionNames ? regionNames.of(c) : c; } catch (err) {}
    return String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65, 0x1F1E6 + c.charCodeAt(1) - 65) + ' ' + name;
  }
  var SOURCE_HELP = { 'Direct': 'Typed the address, used a bookmark, or tapped a link in an app that hides where it came from.', 'Within the site': 'Moved from one page of the site to another.' };
  // "▲ 18% more than the 30 days before", kindly worded. Nothing to compare with = no line.
  function change(cur, prev, days) {
    if (prev == null || cur == null) return '';
    var span = ' than the ' + days + ' days before';
    if (!prev && !cur) return '';
    if (!prev) return '<span class="delta up">New this period</span>';
    var pct = Math.round((cur - prev) / prev * 100);
    if (pct === 0) return '<span class="delta">About the same as the ' + days + ' days before</span>';
    return '<span class="delta ' + (pct > 0 ? 'up' : 'down') + '">' + (pct > 0 ? '▲ ' + pct + '% more' : '▼ ' + (-pct) + '% fewer') + span + '</span>';
  }
  function card(id, label, value, help, delta) {
    return '<div class="stat icard" id="' + id + '" title="' + esc(help) + '"><span class="ilabel">' + label + '</span><b>' + (value == null ? '—' : Number(value).toLocaleString()) + '</b>' +
      (delta || '') + '<small class="ihelp">' + help + '</small></div>';
  }
  function bars(list, labelFn, helpFn, empty) {
    if (!list || !list.length) return '<p class="iempty">' + empty + '</p>';
    var max = Math.max.apply(null, list.map(function (x) { return x.views; })) || 1, total = list.reduce(function (s, x) { return s + x.views; }, 0) || 1;
    return '<ul class="bars">' + list.map(function (x) {
      var help = helpFn ? helpFn(x.name) : '';
      return '<li' + (help ? ' title="' + esc(help) + '"' : '') + '><span class="bl">' + esc(labelFn(x.name)) + '</span><span class="bv">' + Math.round(x.views / total * 100) + '%</span>' +
        '<span class="bt"><i style="width:' + Math.max(2, Math.round(x.views / max * 100)) + '%"></i></span></li>';
    }).join('') + '</ul>';
  }
  // A simple bar chart of one number per day (plain HTML buttons, no libraries). Each bar is a
  // full-height button, so it is easy to tap; tapping, hovering or focusing shows its number.
  function trend(series, key, label) {
    if (!series || !series.length) return '';
    var unit = key === 'started' ? 'plays' : 'visits';
    var vals = series.map(function (d) { return d[key] || 0; });
    var max = Math.max.apply(null, vals), total = vals.reduce(function (t, v) { return t + v; }, 0), peak = vals.indexOf(max), n = series.length;
    var fmt = function (d, long) { var dt = new Date(d + 'T00:00:00'); if (isNaN(dt)) return d; var dm = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); return long ? dt.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + dm : dm; };
    var say = function (i) { return fmt(series[i].date, true) + ' · ' + vals[i].toLocaleString() + ' ' + (vals[i] === 1 ? unit.slice(0, -1) : unit); };
    return '<figure class="trend" aria-label="' + esc(label) + '">' +
      '<p class="tsum">Total ' + total.toLocaleString() + (max ? ' · Busiest day ' + esc(fmt(series[peak].date, true)) + ' (' + max.toLocaleString() + ')' : '') + '</p>' +
      '<p class="tsel" id="trendSel" aria-live="polite">Tap a bar to see its number.</p>' +
      '<div class="tbars" role="group" aria-label="' + esc(label) + '">' +
      series.map(function (d, i) {
        var h = max ? Math.max(1.5, vals[i] / max * 100) : 1.5;
        return '<button type="button" class="tbar" data-bar="' + esc(say(i)) + '" aria-label="' + esc(say(i)) + '"><i style="height:' + h.toFixed(1) + '%"></i></button>';
      }).join('') + '</div>' +
      '<figcaption><span>' + esc(fmt(series[0].date)) + '</span><span>' + esc(fmt(series[n - 1].date)) + '</span></figcaption></figure>';
  }
  function showBar(btn) {
    var fig = btn.closest('.trend'), out = fig && fig.querySelector('.tsel');
    if (!out) return;
    fig.querySelectorAll('.tbar.on').forEach(function (x) { if (x !== btn) { x.classList.remove('on'); x.removeAttribute('aria-pressed'); } });
    btn.classList.add('on'); btn.setAttribute('aria-pressed', 'true');
    out.textContent = btn.dataset.bar;
  }
  root.addEventListener('mouseover', function (ev) { var b = ev.target.closest && ev.target.closest('.tbar'); if (b) showBar(b); });
  root.addEventListener('focusin', function (ev) { var b = ev.target.closest && ev.target.closest('.tbar'); if (b) showBar(b); });
  function pageLabel(path) {
    var P = { '/': 'Home (Today)', '/watch': 'Watch page', '/watch/': 'Watch page', '/read': 'Read page', '/read/': 'Read page', '/listen': 'Listen page', '/listen/': 'Listen page', '/verses': 'Verses page', '/verses/': 'Verses page' };
    return P[path] || path;
  }
  function speedVerdict(v) {
    if (!v || v.lcp == null) return null;
    var slow = v.lcp > 4000 || (v.inp != null && v.inp > 500) || (v.cls != null && v.cls > 0.25);
    var ok = v.lcp > 2500 || (v.inp != null && v.inp > 200) || (v.cls != null && v.cls > 0.1);
    return slow ? ['ins-poor', 'Slow', 'Pages take a while to appear on many phones.'] : ok ? ['ins-ok', 'OK', 'Pages load fine, with a little room to improve.'] : ['ins-good', 'Fast', 'Pages open quickly for most visitors.'];
  }
  function insightsView() {
    var I = state.insights || { loading: true, days: 7 }, days = I.days || 7;
    var head = '<div class="top"><div><h2>Insights' + help('insights') + '</h2><p>How families are finding and enjoying Salt and Light. Counts only — no names, no personal data.</p></div>' +
      '<div class="chips" role="group" aria-label="Time range">' + [7, 30, 90].map(function (n) { return '<button class="chip' + (days === n ? ' on' : '') + '" type="button" data-days="' + n + '" aria-pressed="' + (days === n) + '">' + n + ' days</button>'; }).join('') + '</div></div>';
    if (I.loading) return head + '<div class="list"><div class="empty">Counting visits…</div></div>';
    if (I.error && I.connected === undefined) return head + '<div class="list"><div class="empty">' + esc(I.error) + '</div></div>';
    var plays = I.plays || null, rows = {}, order = [];
    function row(kind, slug) { var k = kind + ':' + slug; if (!rows[k]) { rows[k] = { kind: kind, slug: slug, views: 0, plays: null }; order.push(k); } return rows[k]; }
    (I.pages || []).forEach(function (pg) {
      var m = /^\/(read|watch)\/([a-z0-9-]+)\/?$/.exec(pg.path);
      var r = m ? row(m[1] === 'read' ? 'devotion' : 'reel', m[2]) : row('page', pg.path);
      r.views = pg.views;
    });
    Object.keys(plays || {}).forEach(function (k) { var i = k.indexOf(':'); row(k.slice(0, i), k.slice(i + 1)).plays = plays[k]; });
    var KIND = { devotion: 'Devotion', reel: 'Reel', audio: 'Audio', verse: 'Verse', page: 'Page', game: 'Game update' };
    var notice = '';
    if (I.connected === false) notice = '<div class="ins-note"><b>Visitor numbers aren’t switched on yet.</b> Visits, countries and sources appear here once the site owner adds the Cloudflare Analytics key. Plays and “read to the end” below already work.</div>';
    else if (I.error) notice = '<div class="ins-note err">' + esc(I.error) + '</div>';
    if (plays === null) notice += '<div class="ins-note">Play and reading counts start once the database update for them is applied.</div>';
    var T = I.total || {}, P = I.previous || null, PT = I.playsTotal || null, PP = I.playsPrevious || null;
    var cards = '<div class="stats icards">' +
      card('insVisits', 'People visited', I.connected ? T.visits || 0 : null, 'Visits to the site. Someone who comes back on another day counts again.', I.connected && P ? change(T.visits || 0, P.visits, days) : '') +
      card('insViews', 'Pages opened', I.connected ? T.views || 0 : null, 'Every time a page was opened, including going back to one.', I.connected && P ? change(T.views || 0, P.views, days) : '') +
      card('insPlays', 'Videos & audio played', PT ? PT.started || 0 : null, 'Times someone pressed play on a reel, video or audio.', PT && PP ? change(PT.started || 0, PP.started, days) : '') +
      card('insReads', 'Read to the end', PT ? PT.read_end || 0 : null, 'Times someone scrolled to the end of a devotion.', PT && PP ? change(PT.read_end || 0, PP.read_end, days) : '') +
      '</div>';
    var series = I.series && I.series.length ? I.series : null, chart;
    if (series) chart = '<section class="ipanel"><h3>Visits per day</h3><p class="ihint">Each bar is one day. Tap a bar to see its number.</p>' + trend(series, 'visits', 'Visits per day') + '</section>';
    else if (I.playsSeries && I.playsSeries.length) chart = '<section class="ipanel"><h3>Plays per day</h3><p class="ihint">Each bar is one day. Tap a bar to see its number.</p>' + trend(I.playsSeries, 'started', 'Plays per day') + '</section>';
    else chart = '<section class="ipanel"><h3>Visits per day</h3><p class="iempty">No daily numbers yet for these ' + days + ' days. Once people visit, a small chart appears here.</p></section>';
    var ranked = order.map(function (k) { return rows[k]; }).map(function (r) { r.score = (r.views || 0) + ((r.plays && r.plays.started) || 0); return r; })
      .filter(function (r) { return r.score > 0 || (r.plays && r.plays.read_end); }).sort(function (a, b) { return b.score - a.score; });
    var postsOnly = ranked.filter(function (r) { return r.kind !== 'page'; }).slice(0, 10), topMax = postsOnly.length ? postsOnly[0].score || 1 : 1;
    var top = '<section class="ipanel"><h3>Top posts</h3><p class="ihint">Most opened and played posts in the last ' + days + ' days.</p>' +
      (postsOnly.length ? '<ol class="toplist" id="topPosts">' + postsOnly.map(function (r, i) {
        var pl = r.plays || {}, bits = [];
        if (r.views) bits.push(r.views.toLocaleString() + (r.views === 1 ? ' view' : ' views'));
        if (pl.started) bits.push(pl.started.toLocaleString() + (pl.started === 1 ? ' play' : ' plays'));
        if (pl.finished) bits.push(pl.finished.toLocaleString() + ' watched to the end');
        if (pl.read_end) bits.push(pl.read_end.toLocaleString() + ' read to the end');
        var t = TYPES[r.kind];
        return '<li><span class="rank">' + (i + 1) + '</span><span class="tp"><b>' + esc(insightTitle(r.kind, r.slug)) + '</b><small><span class="kind"><i style="background:' + (t ? t.color : 'var(--muted)') + '"></i>' + esc(KIND[r.kind] || r.kind) + '</span> · ' + bits.join(' · ') + '</small>' +
          '<span class="bt"><i style="width:' + Math.max(2, Math.round(r.score / topMax * 100)) + '%"></i></span></span></li>';
      }).join('') + '</ol>' : '<p class="iempty">No post has been opened or played in these ' + days + ' days yet. Share a favourite post with friends, then check back.</p>') + '</section>';
    var pagesList = ranked.filter(function (r) { return r.kind === 'page' && r.views; }).slice(0, 6).map(function (r) { return { name: r.slug, views: r.views }; });
    var where = '<div class="igrid">' +
      '<section class="ipanel"><h3>Where visitors are</h3><p class="ihint">Countries, worked out roughly from the internet connection.</p>' + (I.connected ? bars(I.countries, countryLabel, null, 'No visits from any country yet in these ' + days + ' days.') : '<p class="iempty">Appears once visitor numbers are switched on.</p>') + '</section>' +
      '<section class="ipanel"><h3>How they found us</h3><p class="ihint">The website or app people came from.</p>' + (I.connected ? bars(I.sources, function (n) { return n; }, function (n) { return SOURCE_HELP[n] || ''; }, 'No visits yet in these ' + days + ' days.') : '<p class="iempty">Appears once visitor numbers are switched on.</p>') +
        '<p class="ihint small"><b>Direct</b> means a typed address, a bookmark, or a link from an app like WhatsApp that doesn’t say where it came from.</p></section>' +
      (pagesList.length ? '<section class="ipanel"><h3>Most visited pages</h3><p class="ihint">Main pages of the site, not single posts.</p>' + bars(pagesList, pageLabel, null, '') + '</section>' : '') +
      speedPanel(I.vitals) + '</div>';
    return head + notice + cards + chart + top + where;
  }
  function speedPanel(v) {
    var s = speedVerdict(v);
    if (!s) return '';
    return '<section class="ipanel"><h3>How fast the site feels</h3><p class="speed ' + s[0] + '"><b>' + s[1] + '</b> ' + s[2] + '</p>' +
      '<details class="tech"><summary>Technical details</summary><ul>' +
      '<li>Main content appears in <b>' + (v.lcp / 1000).toFixed(1) + 's</b> <small>(LCP; under 2.5s is good)</small></li>' +
      (v.inp != null ? '<li>Responds to a tap in <b>' + v.inp + 'ms</b> <small>(INP; under 200ms is good)</small></li>' : '') +
      (v.cls != null ? '<li>Page jumps around: <b>' + (+v.cls).toFixed(2) + '</b> <small>(CLS; under 0.1 is good)</small></li>' : '') +
      '</ul><small>For 3 out of 4 visits (p75).</small></details></section>';
  }
  function resolveMediaElements() {
    Array.prototype.forEach.call(root.querySelectorAll('[data-src]'), function (el) {
      S.resolveMedia(el.getAttribute('data-src')).then(function (url) { if (url) el.src = url; });
    });
  }
  function refreshPreview() { var pv = document.getElementById('preview'); if (pv && state.editing) pv.innerHTML = preview(state.editing); }
  function go(view) { if (view === 'insights' && !state.insights) loadInsights(30); state.view = view; state.editing = null; state.errors = {}; state.confirmDelete = false; render(); window.scrollTo(0, 0); }

  // ---------- validation and saving ----------
  function validate(p, publishing) {
    var e = {};
    if (p.type === 'verse') {
      if (!(p.verse || '').trim()) e.verse = 'Add the verse text.';
      if (!(p.ref || '').trim()) e.ref = 'Add where the verse is from, for example Psalm 119:105.';
      if (!(p.translation || '').trim()) e.translation = 'Name the translation the text is from, for example WEB.';
    } else if (!(p.title || '').trim()) e.title = 'Add a title so the post can be found.';
    if (p.type === 'reel' && p.youtube && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(p.youtube.trim())) e.youtube = 'Paste a full YouTube link starting with https://.';
    if (publishing) {
      if (p.type === 'devotion' && !(p.body || '').trim()) e.body = 'Write the devotion before publishing, or save it as a draft.';
      if (p.type === 'devotion' && !(p.teaser || '').trim()) e.teaser = 'Add a one-line summary for the Today card.';
      if (p.type === 'audio' && !p.media_url) e.file = 'Upload the recording before publishing, or save it as a draft.';
      if (p.type === 'reel' && !p.media_url && !p.youtube) e.file = 'Upload a video or paste a YouTube link before publishing.';
      if (p._mode === 'schedule') {
        if (!p.when) e.when = 'Pick a date and time.';
        else if (new Date(p.when) <= new Date()) e.when = 'Pick a time in the future.';
      }
    }
    return e;
  }
  function save(status) {
    syncFields();
    var e = state.editing;
    state.errors = validate(e, status !== 'draft');
    if (Object.keys(state.errors).length) {
      render();
      var first = root.querySelector('.err'); if (first) first.focus();
      return;
    }
    state.busy = true; render();
    S.savePost(fromEditing(e, status), state.email).then(function (rec) {
      state.busy = false;
      toast(status === 'draft' ? 'Draft saved' : status === 'scheduled' ? 'Scheduled for ' + fmtWhen(rec.publish_at)
        : e.status === 'published' ? 'Updated. The app shows the new version.' : 'Published. It’s in the app now.');
      state.filter = 'all';
      return loadAll().then(function () { go('posts'); });
    }).catch(fail);
  }
  function syncFields() {
    if (!state.editing) return;
    Array.prototype.forEach.call(root.querySelectorAll('[data-f]'), function (el) { state.editing[el.dataset.f] = el.value; });
    var td = document.getElementById('f_today'); if (td) state.editing.show_on_today = td.checked;
  }

  // ---------- file uploads ----------
  function handleFile(file) {
    if (!file) return;
    var e = state.editing, wantVideo = e.type === 'reel';
    if (wantVideo ? file.type.indexOf('video/') !== 0 : file.type.indexOf('audio/') !== 0) {
      state.errors.file = wantVideo ? 'Choose a video file (MP4).' : 'Choose an audio file (MP3 or M4A).'; render(); return;
    }
    if (file.size > 50 * 1024 * 1024) { state.errors.file = 'This file is ' + Math.round(file.size / 1048576) + ' MB. The limit is 50 MB.'; render(); return; }
    syncFields();
    delete state.errors.file;
    state.uploading = 'file'; render();
    var probe = document.createElement(wantVideo ? 'video' : 'audio'), url = URL.createObjectURL(file);
    probe.preload = 'metadata';
    probe.onloadedmetadata = function () {
      if (isFinite(probe.duration)) {
        var s = Math.round(probe.duration);
        state.editing.seconds = s;
        state.editing.minutes = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
        // The upload may already have finished and redrawn the form, so fill the box directly too.
        var box = document.getElementById('f_minutes');
        if (box) box.value = state.editing.minutes;
        refreshPreview();
        if (wantVideo && s > 90) toast('This video is ' + state.editing.minutes + ' long. Reels work best under a minute.');
      }
      URL.revokeObjectURL(url);
    };
    probe.src = url;
    S.uploadMedia(file).then(function (mediaUrl) {
      state.editing.media_url = mediaUrl;
      state.editing.file = file.name;
      state.uploading = '';
      render(); refreshPreview();
      toast('Uploaded ' + file.name);
      // Every new video gets a poster: keep one the author chose, otherwise take a frame from this file.
      if (wantVideo && (!state.editing.poster || state.editing.poster_auto)) autoPoster(file);
    }).catch(function (err) { state.uploading = ''; state.errors.file = 'Upload failed: ' + err.message; render(); });
  }

  // A still from the video (about 1 s in, or the middle of a shorter clip), as WebP (JPEG where the
  // browser can't encode WebP). `src` is a File/Blob or a URL; remote files need CORS (public buckets have it).
  function grabFrame(src) {
    return new Promise(function (resolve, reject) {
      var v = document.createElement('video'), url = typeof src === 'string' ? src : URL.createObjectURL(src), done = false;
      var finish = function (err, blob) { if (done) return; done = true; clearTimeout(timer); if (typeof src !== 'string') URL.revokeObjectURL(url); v.removeAttribute('src'); v.load(); if (err) reject(err); else resolve(blob); };
      var timer = setTimeout(function () { finish(new Error('The video took too long to read.')); }, 20000);
      v.muted = true; v.playsInline = true; v.preload = 'auto';
      if (typeof src === 'string' && /^https?:/i.test(src)) v.crossOrigin = 'anonymous';
      v.onerror = function () { finish(new Error('This browser can’t read the video.')); };
      v.onloadedmetadata = function () { var d = v.duration; v.currentTime = isFinite(d) && d > 0 ? Math.min(1, d / 2) : 1; };
      v.onseeked = function () {
        var w = v.videoWidth, h = v.videoHeight;
        if (!w || !h) return finish(new Error('The video has no picture.'));
        var k = Math.min(1, 1080 / Math.max(w, h)), c = document.createElement('canvas');
        c.width = Math.round(w * k); c.height = Math.round(h * k);
        try { c.getContext('2d').drawImage(v, 0, 0, c.width, c.height); } catch (err) { return finish(err); }
        var out = function (type, q, next) {
          try { c.toBlob(function (b) { if (b && b.type === type) finish(null, b); else if (next) next(); else finish(new Error('Couldn’t make an image.')); }, type, q); } catch (err) { finish(err); }
        };
        out('image/webp', 0.82, function () { out('image/jpeg', 0.85); });
      };
      v.src = url;
    });
  }
  function posterName(e) { return (S.slugify((e.file || e.title || 'video').replace(/\.[^.]+$/, '')) || 'video') + '-poster'; }
  function savePoster(blob, name, auto) {
    var e = state.editing;
    state.uploading = 'poster'; delete state.errors.poster; render();
    var file = blob instanceof File ? blob : new File([blob], name + (blob.type === 'image/webp' ? '.webp' : '.jpg'), { type: blob.type });
    return S.uploadMedia(file).then(function (url) {
      if (state.editing === e) { e.poster = url; e.poster_auto = auto || undefined; }
      state.uploading = ''; render();
    }).catch(function (err) { state.uploading = ''; state.errors.poster = 'Poster upload failed: ' + err.message; render(); });
  }
  function autoPoster(src) {
    var e = state.editing;
    syncFields();
    state.uploading = 'poster'; render();
    return grabFrame(src).then(function (blob) {
      if (state.editing !== e) return;
      return savePoster(blob, posterName(e), true).then(function () { toast('Poster made from the video. Choose an image to use your own.'); });
    }).catch(function (err) { state.uploading = ''; state.errors.poster = 'Couldn’t make a poster from the video (' + err.message + '). Choose an image instead.'; render(); });
  }
  function handlePoster(file) {
    if (!file) return;
    syncFields();
    if (POSTER_TYPES.indexOf(file.type) < 0) { state.errors.poster = 'Choose a JPG, PNG or WebP image.'; render(); return; }
    if (file.size > POSTER_MAX) { state.errors.poster = 'This image is ' + (file.size / 1048576).toFixed(1) + ' MB. The limit is 5 MB.'; render(); return; }
    savePoster(file, '', false).then(function () { if (!state.errors.poster) toast('Poster saved: ' + file.name); });
  }

  // ---------- events ----------
  root.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var id = ev.target.id;
    if (id === 'signinForm') {
      var email = document.getElementById('email').value.trim().toLowerCase();
      var pwBox = document.getElementById('password'), password = pwBox ? pwBox.value : '';
      state.email = email; state.authError = '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { state.authError = 'Enter an email address like name@example.com.'; render(); document.getElementById('email').focus(); return; }
      if (pwBox && !password) { state.authError = 'Enter your password.'; render(); document.getElementById('password').focus(); return; }
      state.busy = true; render();
      S.signInWithPassword(email, password).then(function (res) {
        state.busy = false;
        if (res.signedIn && res.session) return enter(res.session);
        state.screen = 'signin'; render();
      }).catch(function (err) { state.busy = false; state.authError = err.message; render(); });
      password = '';
    } else if (id === 'pwForm') {
      var p1 = document.getElementById('newPassword').value, p2 = document.getElementById('newPassword2').value;
      state.pwError = '';
      if (p1.length < 12) state.pwError = 'Use at least 12 characters.';
      else if (p1 !== p2) state.pwError = 'The two passwords don’t match.';
      if (state.pwError) { render(); document.getElementById('newPassword').focus(); return; }
      state.busy = true; render();
      S.updatePassword(p1).then(function () {
        state.busy = false; state.pwOpen = false; render(); toast('Password changed. Use it next time you sign in.');
      }).catch(function (err) { state.busy = false; state.pwError = err.message; render(); });
      p1 = p2 = '';
    } else if (id === 'postForm') {
      if (!canPublish()) return save('draft');
      save(state.editing._mode === 'schedule' ? 'scheduled' : 'published');
    } else if (id === 'siteForm') {
      if (!isOwner()) return;
      var value = { menus: {}, message: document.getElementById('nav_message').value.trim() };
      S.NAV_MENUS.forEach(function (m) { value.menus[m] = document.getElementById('nav_' + m).value; });
      value = S.normalizeNav(value);
      state.busy = true; render();
      S.saveSetting('nav', value, state.email).then(function (saved) {
        state.busy = false; state.navError = ''; state.nav = S.normalizeNav(saved) || value;
        toast('Menus saved. Visitors see the change next time the app loads.'); render();
      }).catch(fail);
    } else if (id === 'contentForm') {
      if (!isOwner()) return;
      var cv = { verses: document.getElementById('content_verses').checked };
      state.busy = true; render();
      S.saveSetting('content', cv, state.email).then(function (saved) {
        state.busy = false; state.content = S.normalizeContent(saved) || cv;
        toast(cv.verses ? 'Verse cards are on. Visitors see them next time the app loads.' : 'Verse cards are hidden. Visitors see the change next time the app loads.'); render();
      }).catch(fail);
    } else if (id === 'reelPageForm') {
      if (!isOwner()) return;
      var rp = { style: document.getElementById('reel_page_style').value };
      if (PAGE_STYLES.indexOf(rp.style) < 0) rp.style = 'auto';
      state.busy = true; render();
      S.saveSetting('reel_page', rp, state.email).then(function (saved) {
        state.busy = false; state.reelPage = saved && saved.style ? saved : rp;
        toast('Reel page style saved. Visitors see the change next time the app loads.'); render();
      }).catch(fail);
    } else if (id === 'inviteForm') {
      var em = document.getElementById('inviteEmail').value.trim().toLowerCase(), role = document.getElementById('inviteRole').value;
      state.errors = {};
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { state.errors.invite = 'Enter an email address like name@example.com.'; render(); return; }
      S.invite(em, role).then(function () { toast(em + ' can now sign in as ' + role + '.'); return loadAll(); }).then(render).catch(function (err) { state.errors.invite = err.message; render(); });
    }
  });

  root.addEventListener('click', function (ev) {
    var gj = ev.target.closest('a[data-gjump]');
    if (gj) { ev.preventDefault(); var gt = document.getElementById('g-' + gj.dataset.gjump); if (gt) { gt.scrollIntoView({ block: 'start' }); gt.focus({ preventScroll: true }); } return; }
    var b = ev.target.closest('button') || ev.target.closest('tr[data-edit]');
    if (!b) return;
    var d = b.dataset;
    if (d.bar !== undefined && b.classList.contains('tbar')) { showBar(b); return; }
    if (b.id === 'back') { state.screen = 'signin'; render(); }
    else if (b.id === 'magicLink') {
      var em = document.getElementById('email').value.trim().toLowerCase();
      state.email = em; state.authError = '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { state.authError = 'Enter your email above first, then ask for a link.'; render(); return; }
      state.busy = true; render();
      S.signInWithEmail(em).then(function (res) {
        state.busy = false;
        if (res.signedIn) return enter(res.session);
        state.screen = 'check'; render();
      }).catch(function (err) { state.busy = false; state.authError = err.message; render(); });
    }
    else if (b.id === 'changePw') { state.pwOpen = true; state.pwError = ''; render(); var np = document.getElementById('newPassword'); if (np) np.focus(); }
    else if (b.id === 'pwCancel') { state.pwOpen = false; state.pwError = ''; render(); }
    else if (b.id === 'signout') S.signOut().then(function () { state.session = null; state.pwOpen = false; state.screen = 'signin'; state.view = 'posts'; render(); });
    else if (b.id === 'posterFrame' && state.editing && state.editing.media_url) S.resolveMedia(state.editing.media_url).then(function (u) { if (u) autoPoster(u); });
    else if (d.days) loadInsights(+d.days);
    else if (d.view) { state.pwOpen = false; if (d.guide) state.guideAt = d.guide; go(d.view); if (state.guideAt) render(); }
    else if (d.bfilter) { state.builtinFilter = d.bfilter; render(); var bfb = root.querySelector('[data-bfilter="' + d.bfilter + '"]'); if (bfb) bfb.focus(); }
    else if (d.filter) { state.filter = d.filter; state.limit = PAGE_SIZE; render(); }
    else if (d.sfilter) { state.statusFilter = d.sfilter; state.limit = PAGE_SIZE; render(); }
    else if (d.sort) {
      if ((state.sortKey || 'date') === d.sort) state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      else { state.sortKey = d.sort; state.sortDir = d.sort === 'date' || d.sort === 'views' ? 'desc' : 'asc'; }
      render();
    }
    else if (b.id === 'loadMore') { state.limit = (state.limit || PAGE_SIZE) + PAGE_SIZE; refreshPostRows(); }
    else if (b.id === 'clearFilters') { state.q = ''; state.filter = 'all'; state.statusFilter = 'all'; state.limit = PAGE_SIZE; render(); }
    else if (d.new) {
      state.editing = { type: d.new, status: 'draft', show_on_today: true, topics: [], translation: 'WEB', kind: 'Devotion', _mode: 'now' };
      state.view = 'edit'; state.errors = {}; state.confirmDelete = false; render(); window.scrollTo(0, 0);
    }
    else if (d.edit) {
      var src = state.posts.filter(function (x) { return String(x.id) === d.edit; })[0];
      if (!src) return;
      state.editing = toEditing(src); state.view = 'edit'; state.errors = {}; state.confirmDelete = false; state.history = null;
      render(); window.scrollTo(0, 0); loadHistory(src.id);
    }
    else if (d.mode) { syncFields(); state.editing._mode = d.mode; delete state.errors.when; render(); }
    else if (d.topic) {
      var tp = state.editing.topics || (state.editing.topics = []), i = tp.indexOf(d.topic);
      if (i >= 0) tp.splice(i, 1); else tp.push(d.topic);
      b.classList.toggle('on'); b.setAttribute('aria-pressed', i < 0);
    }
    else if (d.md) {
      var ta = document.getElementById('f_body'), s = ta.selectionStart, en = ta.selectionEnd, m = d.md, sel = ta.value.slice(s, en);
      ta.value = m === '> ' ? ta.value.slice(0, s) + '> ' + sel + ta.value.slice(en) : ta.value.slice(0, s) + m + sel + m + ta.value.slice(en);
      state.editing.body = ta.value; ta.focus();
    }
    else if (d.restore) restore(d.restore);
    else if (b.id === 'addTopic') addTopic();
    else if (b.id === 'saveDraft') save('draft');
    else if (b.id === 'unpublish') save('draft');
    else if (b.id === 'del') { syncFields(); state.confirmDelete = true; render(); }
    else if (b.id === 'delNo') { state.confirmDelete = false; render(); }
    else if (b.id === 'delYes') {
      S.deletePost(state.editing.id, state.email).then(function () { toast('Post deleted'); return loadAll(); }).then(function () { go('posts'); }).catch(fail);
    }
    else if (d.bhide) {
      if (!isOwner()) return;
      var h = state.hidden || (state.hidden = []), at = h.indexOf(d.bhide);
      if (at >= 0) h.splice(at, 1); else h.push(d.bhide);
      render();
    }
    else if (b.id === 'saveHidden') {
      if (!isOwner()) return;
      var value = S.hiddenValue(state.hidden || []);
      state.busy = true; render();
      S.saveSetting('builtins_hidden', value, state.email).then(function (saved) {
        state.busy = false; state.hiddenError = ''; state.hidden = S.effectiveHidden(saved && S.normalizeHidden(saved) ? saved : value);
        toast('Saved. Visitors see the change next time the app loads.'); render();
      }).catch(fail);
    }
    else if (d.remove) S.removeMember(d.remove).then(function () { toast(d.remove + ' was removed from the team.'); return loadAll(); }).then(render).catch(fail);
  });

  root.addEventListener('input', function (ev) {
    if (ev.target.id === 'newPassword') { var h = document.getElementById('pwHint'); if (h) h.textContent = pwStrength(ev.target.value); return; }
    if (ev.target.id === 'postSearch') { state.q = ev.target.value; state.limit = PAGE_SIZE; refreshPostRows(); return; }
    if (!state.editing) return;
    if (ev.target.dataset.pick) { var tx = document.getElementById('f_' + ev.target.dataset.pick); state.editing[ev.target.dataset.pick] = ev.target.value; if (tx) tx.value = ev.target.value; refreshPreview(); return; }
    var f = ev.target.dataset.f;
    if (!f) return;
    state.editing[f] = ev.target.value;
    if (state.errors[f]) {
      delete state.errors[f];
      ev.target.classList.remove('err');
      var msg = ev.target.parentElement.querySelector('.errmsg'); if (msg) msg.remove();
    }
    if (f === 'verse') { var note = document.getElementById('verseNote'); if (note) note.textContent = verseLenNote(ev.target.value); }
    refreshPreview();
  });
  // Enter in the new-topic box adds the topic instead of submitting the post.
  root.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter' && ev.target.id === 'newTopic') { ev.preventDefault(); addTopic(); }
  });
  function addTopic() {
    var box = document.getElementById('newTopic'), name = box ? box.value.trim().replace(/\s+/g, ' ') : '';
    if (!name) { if (box) box.focus(); return; }
    name = allTopics().filter(function (t) { return t.toLowerCase() === name.toLowerCase(); })[0] || name;
    syncFields();
    var tp = state.editing.topics || (state.editing.topics = []);
    if (tp.indexOf(name) < 0) tp.push(name);
    render();
    var again = document.getElementById('newTopic'); if (again) again.focus();
  }
  root.addEventListener('change', function (ev) {
    if (ev.target.id === 'postSort') { var sv = ev.target.value.split('-'); state.sortKey = sv[0]; state.sortDir = sv[1]; render(); return; }
    if (!state.editing) return;
    if (ev.target.dataset.check) state.editing[ev.target.dataset.check] = ev.target.checked;
    if (ev.target.dataset.f) { state.editing[ev.target.dataset.f] = ev.target.value; refreshPreview(); }
    if (ev.target.dataset.file === 'poster') handlePoster(ev.target.files[0]);
    else if (ev.target.dataset.file) handleFile(ev.target.files[0]);
  });
  root.addEventListener('dragover', function (ev) { var z = ev.target.closest('[data-drop]'); if (z) { ev.preventDefault(); z.classList.add('drag'); } });
  root.addEventListener('dragleave', function (ev) { var z = ev.target.closest('[data-drop]'); if (z) z.classList.remove('drag'); });
  root.addEventListener('drop', function (ev) { var z = ev.target.closest('[data-drop]'); if (z) { ev.preventDefault(); (z.dataset.drop === 'poster' ? handlePoster : handleFile)(ev.dataTransfer.files[0]); } });

  boot();
})();
