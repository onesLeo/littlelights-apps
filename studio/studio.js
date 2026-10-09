// Little Light Studio: sign in, write, schedule and publish posts.
// Talks to the data layer in js/store.js (local mode or Supabase).
(function () {
  'use strict';
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
    audio: ['kind', 'minutes', 'seconds', 'file'],
    reel: ['caption', 'youtube', 'minutes', 'seconds', 'file'],
    game: ['text', 'button']
  };
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
    team: '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.5"/><path d="M3 19c.8-3.3 3.2-5 6-5s5.2 1.7 6 5M16 5.5a3 3 0 010 6M17.5 14c1.8.5 3 2.2 3.5 5"/></svg>',
    site: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c2.5 2.6 2.5 13.4 0 16M12 4c-2.5 2.6-2.5 13.4 0 16"/></svg>'
  };

  var state = {
    screen: 'loading', email: '', authError: '', session: null,
    view: 'posts', filter: 'all', posts: [], team: [],
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
    youtube: 'YouTube link', text: 'Text', button: 'Button label' };
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
    if (status === 'scheduled') p.publish_at = new Date(e.when).toISOString();
    else if (status === 'published') p.publish_at = e.status === 'published' && e.publish_at ? e.publish_at : new Date().toISOString();
    else p.publish_at = null;
    return p;
  }

  // ---------- data ----------
  function loadAll() {
    return Promise.all([S.listPosts(), S.listTeam()]).then(function (r) { state.posts = r[0] || []; state.team = r[1] || []; });
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
    var err = state.authError;
    return '<main class="auth"><form class="auth-card" id="signinForm" novalidate>' +
      '<div class="brand"><span class="dot"></span>Little Light Studio</div>' +
      '<div><h1>Sign in to post</h1><p style="margin-top:6px">For the Little Light team. Visitors never need an account.</p></div>' +
      modeBar() +
      '<label class="field"><span>Email</span><input class="input' + (err ? ' err' : '') + '" id="email" type="email" autocomplete="email" placeholder="you@example.com" value="' + esc(state.email) + '">' +
      (err ? '<span class="errmsg" role="alert">' + esc(err) + '</span>' : '<small>' + (S.mode === 'local' ? 'The first email to sign in becomes the owner.' : 'We’ll email you a one-time sign-in link. No password to remember.') + '</small>') + '</label>' +
      '<button class="btn primary" type="submit"' + (state.busy ? ' disabled' : '') + '>' + (S.mode === 'local' ? 'Sign in' : state.busy ? 'Sending…' : 'Email me a sign-in link') + '</button>' +
      '<div class="note">Only people on the team can sign in. Anyone else sees “This email isn’t on the Little Light team.”</div>' +
      '</form></main>';
  }
  function checkEmail() {
    return '<main class="auth"><div class="auth-card">' +
      '<div class="check-icon"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 7l9 6 9-6"/></svg></div>' +
      '<div><h1>Check your email</h1><p style="margin-top:6px">We sent a sign-in link to <b style="color:var(--ink)">' + esc(state.email) + '</b>. Open it on this device to come back here signed in.</p></div>' +
      '<button class="btn ghost" type="button" id="back">Use a different email</button></div></main>';
  }
  function shell(inner) {
    var nav = [['posts', 'Posts', ICON.posts], ['new', 'New post', ICON.plus], ['media', 'Media', ICON.media], ['team', 'Team', ICON.team]];
    return '<div class="shell"><aside class="side">' +
      '<div class="brand"><span class="dot"></span><span>Little Light Studio</span></div>' +
      '<nav aria-label="Studio">' + nav.map(function (n) {
        var on = state.view === n[0] || (n[0] === 'new' && state.view === 'edit' && state.editing && !state.editing.id);
        return '<button class="nav' + (on ? ' on' : '') + '" type="button" data-view="' + n[0] + '"' + (on ? ' aria-current="page"' : '') + '>' + n[2] + n[1] +
          (n[0] === 'posts' ? '<span class="count">' + state.posts.length + '</span>' : '') + '</button>';
      }).join('') + '<a class="nav" href="../#today" target="_blank" rel="noopener">' + ICON.site + 'View the app</a></nav>' +
      '<div class="me"><div class="who"><span class="avatar">' + esc(state.email[0] || '?').toUpperCase() + '</span><span>' + esc(state.email) + '<small>' + esc(cap(state.session.role)) + '</small></span></div>' +
      '<button class="btn ghost" type="button" id="signout" style="justify-content:flex-start;padding-left:0">Sign out</button></div>' +
      '</aside><main class="main">' + modeBar() + inner + '</main></div>';
  }
  function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }

  function postsView() {
    var count = function (st) { return state.posts.filter(function (p) { return statusOf(p) === st; }).length; };
    var list = state.posts.filter(function (p) { return state.filter === 'all' || p.type === state.filter; });
    var next = state.posts.filter(function (p) { return p.status === 'scheduled' && !S.isLive(p); })
      .sort(function (a, b) { return a.publish_at.localeCompare(b.publish_at); })[0];
    return '<div class="top"><div><h2>Posts</h2><p>Everything on Today, Watch, Listen, Read and Verses.</p></div>' +
      '<button class="btn primary" type="button" data-view="new">+ New post</button></div>' +
      '<div class="stats"><div class="stat"><b>' + count('published') + '</b><span>Published</span></div><div class="stat"><b>' + count('scheduled') + '</b><span>Scheduled</span></div>' +
      '<div class="stat"><b>' + count('draft') + '</b><span>Drafts</span></div><div class="stat"><b>' + (next ? esc(fmtWhen(next.publish_at)) : '—') + '</b><span>Next scheduled post</span></div></div>' +
      '<div class="chips" role="group" aria-label="Filter by kind"><button class="chip' + (state.filter === 'all' ? ' on' : '') + '" type="button" data-filter="all">All</button>' +
      Object.keys(TYPES).map(function (k) { return '<button class="chip' + (state.filter === k ? ' on' : '') + '" type="button" data-filter="' + k + '"><i style="background:' + TYPES[k].color + '"></i>' + TYPES[k].name + '</button>'; }).join('') +
      '</div><div class="list">' + (list.length ? list.map(function (p) {
        var st = statusOf(p);
        return '<button class="row" type="button" data-edit="' + p.id + '"><span class="stripe" style="background:' + TYPES[p.type].color + '"></span>' +
          '<span><b>' + esc(p.title || 'Untitled') + '</b><small>' + TYPES[p.type].name + (p.show_on_today ? ' · on Today' : '') + (p.author_email ? ' · ' + esc(p.author_email) : '') + '</small></span>' +
          '<span class="when">' + esc(fmtWhen(p.publish_at || p.updated_at)) + '</span><span class="pill ' + st + '">' + cap(st) + '</span></button>';
      }).join('') : '<div class="empty">' + (state.posts.length ? 'No ' + TYPES[state.filter].name.toLowerCase() + ' posts yet.' : 'No posts yet. Press “New post” to write the first one.') + '</div>') + '</div>';
  }

  function newView() {
    return '<div class="top"><div><h2>What would you like to share?</h2><p>Pick a kind of post. Each one has its own colour in the app.</p></div></div>' +
      '<div class="types">' + Object.keys(TYPES).map(function (k) {
        return '<button class="type t-' + k + '" type="button" data-new="' + k + '"><b>' + TYPES[k].name + '</b><span>' + TYPES[k].hint + '</span></button>';
      }).join('') + '</div>';
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
        uploadField('Recording', 'audio/*', 'MP3 or M4A, up to 50 MB. The length is read from the file.');
    } else if (p.type === 'reel') {
      f = field('title', 'Title', p.title, { ph: 'Noah kept building' }) +
        field('caption', 'Caption', p.caption, { textarea: true, ph: 'What the reel is about, with the Bible reference' }) +
        uploadField('Video', 'video/*', 'Vertical 9:16 MP4, up to 60 seconds and 50 MB. Or paste a YouTube Shorts link below.') +
        '<div class="two">' + field('youtube', 'YouTube link (optional)', p.youtube, { ph: 'https://youtube.com/shorts/…', type: 'url' }) + field('minutes', 'Length', p.minutes, { ph: '0:52' }) + '</div>';
    } else {
      f = field('title', 'Headline', p.title, { ph: 'Noah’s Ark is ready to play' }) +
        field('text', 'Text', p.text, { textarea: true, ph: 'What’s new in the game' }) +
        field('button', 'Button label', p.button, { ph: 'See the game' });
    }
    var mode = p._mode, pub = canPublish();
    var primary = !pub ? '' : '<button class="btn primary" type="submit"' + (state.busy || state.uploading ? ' disabled' : '') + '>' +
      (state.busy ? 'Saving…' : mode === 'schedule' ? 'Schedule' : p.status === 'published' ? 'Update' : 'Publish') + '</button>';
    var canDelete = p.id && (canPublish());
    return '<div class="top"><div><h2>' + (p.id ? 'Edit ' : 'New ') + t.name.toLowerCase() + '</h2><p>' + t.hint + '. The preview updates as you type.</p></div>' +
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
    return '<div class="top"><div><h2>Media</h2><p>Audio and video attached to posts.</p></div></div>' +
      (files.length ? '<div class="grid-media">' + files.map(function (p) {
        var isVideo = p.type === 'reel';
        return '<div class="media"><div class="thumb" style="background:' + TYPES[p.type].color + '">' + (isVideo ? '▶ ' : '♪ ') + esc((p.fields || {}).minutes || '') + '</div>' +
          '<div><b>' + esc((p.fields || {}).file || 'File') + '</b><small>Used in: ' + esc(p.title) + '</small>' +
          '<' + (isVideo ? 'video' : 'audio') + ' controls preload="none" data-src="' + esc(p.media_url) + '"></' + (isVideo ? 'video' : 'audio') + '></div></div>';
      }).join('') + '</div>' : '<div class="list"><div class="empty">No files yet. Upload one when you write an audio or reel post.</div></div>');
  }
  function teamView() {
    return '<div class="top"><div><h2>Team</h2><p>Only people on this list can sign in to the Studio.</p></div></div>' +
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
      var v = state.view === 'posts' ? postsView() : state.view === 'new' ? newView() : state.view === 'edit' ? editView() : state.view === 'media' ? mediaView() : teamView();
      root.innerHTML = shell(v);
      if (state.view === 'media') resolveMediaElements();
    }
  }
  function resolveMediaElements() {
    Array.prototype.forEach.call(root.querySelectorAll('[data-src]'), function (el) {
      S.resolveMedia(el.getAttribute('data-src')).then(function (url) { if (url) el.src = url; });
    });
  }
  function refreshPreview() { var pv = document.getElementById('preview'); if (pv && state.editing) pv.innerHTML = preview(state.editing); }
  function go(view) { state.view = view; state.editing = null; state.errors = {}; state.confirmDelete = false; render(); window.scrollTo(0, 0); }

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
    }).catch(function (err) { state.uploading = ''; state.errors.file = 'Upload failed: ' + err.message; render(); });
  }

  // ---------- events ----------
  root.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var id = ev.target.id;
    if (id === 'signinForm') {
      var email = document.getElementById('email').value.trim().toLowerCase();
      state.email = email; state.authError = '';
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { state.authError = 'Enter an email address like name@example.com.'; render(); document.getElementById('email').focus(); return; }
      state.busy = true; render();
      S.signInWithEmail(email).then(function (res) {
        state.busy = false;
        if (res.signedIn) return enter(res.session);
        state.screen = 'check'; render();
      }).catch(function (err) { state.busy = false; state.authError = err.message; render(); });
    } else if (id === 'postForm') {
      if (!canPublish()) return save('draft');
      save(state.editing._mode === 'schedule' ? 'scheduled' : 'published');
    } else if (id === 'inviteForm') {
      var em = document.getElementById('inviteEmail').value.trim().toLowerCase(), role = document.getElementById('inviteRole').value;
      state.errors = {};
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { state.errors.invite = 'Enter an email address like name@example.com.'; render(); return; }
      S.invite(em, role).then(function () { toast(em + ' can now sign in as ' + role + '.'); return loadAll(); }).then(render).catch(function (err) { state.errors.invite = err.message; render(); });
    }
  });

  root.addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    var d = b.dataset;
    if (b.id === 'back') { state.screen = 'signin'; render(); }
    else if (b.id === 'signout') S.signOut().then(function () { state.session = null; state.screen = 'signin'; state.view = 'posts'; render(); });
    else if (d.view) go(d.view);
    else if (d.filter) { state.filter = d.filter; render(); }
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
    else if (d.remove) S.removeMember(d.remove).then(function () { toast(d.remove + ' was removed from the team.'); return loadAll(); }).then(render).catch(fail);
  });

  root.addEventListener('input', function (ev) {
    if (!state.editing) return;
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
    if (!state.editing) return;
    if (ev.target.dataset.check) state.editing[ev.target.dataset.check] = ev.target.checked;
    if (ev.target.dataset.f) { state.editing[ev.target.dataset.f] = ev.target.value; refreshPreview(); }
    if (ev.target.dataset.file) handleFile(ev.target.files[0]);
  });
  root.addEventListener('dragover', function (ev) { var z = ev.target.closest('[data-drop]'); if (z) { ev.preventDefault(); z.classList.add('drag'); } });
  root.addEventListener('dragleave', function (ev) { var z = ev.target.closest('[data-drop]'); if (z) z.classList.remove('drag'); });
  root.addEventListener('drop', function (ev) { var z = ev.target.closest('[data-drop]'); if (z) { ev.preventDefault(); handleFile(ev.dataTransfer.files[0]); } });

  boot();
})();
