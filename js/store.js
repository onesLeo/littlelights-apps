// Little Light data layer, shared by the app and the Studio.
//
// One post shape everywhere (it matches the `posts` table in supabase/schema.sql):
//   { id, type, status, publish_at, title, slug, show_on_today, fields, media_url,
//     author_email, created_at, updated_at }
// type:   'verse' | 'devotion' | 'audio' | 'reel' | 'game' | 'story' (bedtime story, /listen/<slug>)
// status: 'draft' | 'scheduled' | 'published'
// A post is visible in the app when status is 'scheduled' or 'published' and
// publish_at is in the past, so scheduled posts appear on time without a server job.
(function () {
  'use strict';
  var cfg = window.LL_CONFIG || {};
  var remote = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  // Bundled copy of supabase-js (MIT), so the Studio does not depend on a CDN.
  // The public pages load a fingerprinted copy of this file from /assets/ (scripts/build-pages.mjs); the library stays in /js/vendor/.
  var SUPABASE_JS = (document.currentScript && document.currentScript.src ? new URL('vendor/supabase-2.117.2.js', document.currentScript.src.replace(/\/assets\/[^\/]*$/, '/js/')).href : 'js/vendor/supabase-2.117.2.js');
  var SETTINGS_KEY = 'll.settings.v1';
  var POSTS_KEY = 'll.posts.v1', SESSION_KEY = 'll.studio.session', TEAM_KEY = 'll.studio.team', HISTORY_KEY = 'll.history.v1';

  function nowIso() { return new Date().toISOString(); }
  function isLive(p) { return (p.status === 'published' || p.status === 'scheduled') && p.publish_at && new Date(p.publish_at) <= new Date(); }
  // What a change did, for the post history. Same rules as private.record_post_revision() in supabase/schema.sql.
  function changeAction(before, after) {
    if (!after) return 'deleted';
    var to = after.status;
    if (!before) return to === 'published' || to === 'scheduled' ? to : 'created';
    if (to !== before.status) return to === 'published' || to === 'scheduled' ? to : 'unpublished';
    if (to === 'scheduled' && after.publish_at !== before.publish_at) return 'scheduled';
    return 'edited';
  }
  function slugify(s) {
    return String(s || 'post').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[’']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'post';
  }
  function readJSON(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (err) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (err) { return false; }
  }

  // ---------- local media: files live in IndexedDB, referenced as local-media:<id> ----------
  var idb = null;
  function openDb() {
    if (idb) return idb;
    idb = new Promise(function (resolve, reject) {
      if (!('indexedDB' in window)) { reject(new Error('This browser cannot store files.')); return; }
      var req = indexedDB.open('ll-media', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('files'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return idb;
  }
  function idbDo(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('files', mode), store = tx.objectStore('files'), out = fn(store);
        tx.oncomplete = function () { resolve(out && out.result !== undefined ? out.result : out); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }
  var objectUrls = {};
  function resolveMedia(url) {
    if (!url || url.indexOf('local-media:') !== 0) return Promise.resolve(url || '');
    if (objectUrls[url]) return Promise.resolve(objectUrls[url]);
    var id = url.slice('local-media:'.length);
    return idbDo('readonly', function (s) { return s.get(id); }).then(function (blob) {
      if (!blob) return '';
      objectUrls[url] = URL.createObjectURL(blob);
      return objectUrls[url];
    }).catch(function () { return ''; });
  }

  // ---------- local implementation ----------
  var local = {
    mode: 'local',
    session: function () { return Promise.resolve(readJSON(SESSION_KEY, null)); },
    signInWithEmail: function (email) {
      var team = local._team();
      if (team.length && !team.some(function (m) { return m.email === email.toLowerCase(); })) {
        return Promise.reject(new Error('This email isn’t on the Salt and Light team.'));
      }
      if (!team.length) writeJSON(TEAM_KEY, [{ email: email.toLowerCase(), role: 'owner', invited_at: nowIso() }]);
      var s = { email: email.toLowerCase(), role: local._roleOf(email) };
      writeJSON(SESSION_KEY, s);
      return Promise.resolve({ signedIn: true, session: s });
    },
    // Local mode has no passwords: the browser's own team list is the only gate.
    signInWithPassword: function (email) { return local.signInWithEmail(email); },
    updatePassword: function () { return Promise.reject(new Error('Passwords need Supabase mode. In local mode there is no password to change.')); },
    signInWithGoogle: function () { return Promise.reject(new Error('Google sign-in needs Supabase mode. In local mode, sign in with your email.')); },
    signOut: function () { try { localStorage.removeItem(SESSION_KEY); } catch (err) {} return Promise.resolve(); },
    onAuthChange: function () {},
    _team: function () { return readJSON(TEAM_KEY, []); },
    _roleOf: function (email) {
      var m = local._team().filter(function (x) { return x.email === String(email).toLowerCase(); })[0];
      return m ? m.role : 'owner';
    },
    listPosts: function () {
      var all = readJSON(POSTS_KEY, []);
      return Promise.resolve(all.slice().sort(function (a, b) { return (b.publish_at || b.updated_at || '').localeCompare(a.publish_at || a.updated_at || ''); }));
    },
    _record: function (before, after, email) {
      var list = readJSON(HISTORY_KEY, []), snap = after || before;
      var strip = function (p) { var c = JSON.parse(JSON.stringify(p || {})); delete c.updated_at; return JSON.stringify(c); };
      if (before && after && strip(before) === strip(after)) return;
      list.push({ id: list.length ? list[list.length - 1].id + 1 : 1, post_id: snap.id, action: changeAction(before, after),
        snapshot: JSON.parse(JSON.stringify(snap)), changed_by: email || '', changed_at: nowIso() });
      writeJSON(HISTORY_KEY, list);
    },
    listRevisions: function (postId) {
      return Promise.resolve(readJSON(HISTORY_KEY, []).filter(function (r) { return r.post_id === postId; }).reverse());
    },
    savePost: function (post, email) {
      var all = readJSON(POSTS_KEY, []), stamp = nowIso(), rec = JSON.parse(JSON.stringify(post));
      var before = rec.id ? all.filter(function (p) { return p.id === rec.id; })[0] : null;
      rec.updated_at = stamp;
      rec.slug = uniqueSlug(rec, all);
      if (rec.id) {
        all = all.map(function (p) { return p.id === rec.id ? rec : p; });
      } else {
        rec.id = Date.now();
        rec.created_at = stamp;
        rec.author_email = email || '';
        all.push(rec);
      }
      if (!writeJSON(POSTS_KEY, all)) return Promise.reject(new Error('The browser’s storage is full. Delete some posts or files and try again.'));
      local._record(before, rec, email);
      return Promise.resolve(rec);
    },
    deletePost: function (id, email) {
      var all = readJSON(POSTS_KEY, []);
      local._record(all.filter(function (p) { return p.id === id; })[0], null, email);
      writeJSON(POSTS_KEY, all.filter(function (p) { return p.id !== id; }));
      return Promise.resolve();
    },
    uploadMedia: function (file) {
      var id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
      return idbDo('readwrite', function (s) { s.put(file, id); }).then(function () { return 'local-media:' + id; });
    },
    // Local mode has no file names: same as uploadMedia.
    uploadMediaAt: function (file) { return local.uploadMedia(file); },
    // Site settings (the `site_settings` table in Supabase mode), for example key 'nav'.
    getSetting: function (key) { var v = readJSON(SETTINGS_KEY, {})[key]; return Promise.resolve(v == null ? null : v); },
    saveSetting: function (key, value) {
      var all = readJSON(SETTINGS_KEY, {});
      all[key] = value;
      if (!writeJSON(SETTINGS_KEY, all)) return Promise.reject(new Error('The browser’s storage is full.'));
      return Promise.resolve(value);
    },
    accessToken: function () { return Promise.resolve(''); },
    listTeam: function () { return Promise.resolve(local._team()); },
    invite: function (email, role) {
      var team = local._team();
      email = email.toLowerCase();
      if (team.some(function (m) { return m.email === email; })) return Promise.reject(new Error(email + ' is already on the team.'));
      team.push({ email: email, role: role, invited_at: nowIso() });
      writeJSON(TEAM_KEY, team);
      return Promise.resolve();
    },
    removeMember: function (email) {
      writeJSON(TEAM_KEY, local._team().filter(function (m) { return m.email !== email; }));
      return Promise.resolve();
    },
    publishedPosts: function () {
      return local.listPosts().then(function (all) { return all.filter(isLive); });
    }
  };

  function uniqueSlug(rec, all) {
    var base = slugify(rec.slug || rec.title), slug = base, n = 2;
    var taken = function (s) { return all.some(function (p) { return p.slug === s && p.id !== rec.id; }); };
    while (taken(slug)) slug = base + '-' + n++;
    return slug;
  }

  // ---------- Supabase implementation ----------
  var client = null;
  function loadClient() {
    if (client) return Promise.resolve(client);
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) { resolve(); return; }
      var s = document.createElement('script');
      s.src = SUPABASE_JS; s.async = true;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not reach the database. Check your internet connection.')); };
      document.head.appendChild(s);
    }).then(function () {
      client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
      return client;
    });
  }
  function friendly(msg) {
    msg = String(msg || '');
    if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) return 'Could not reach the database. Check your internet connection and try again.';
    if (/invalid login credentials|invalid_credentials/i.test(msg)) return 'That email and password don’t match. Check them and try again.';
    if (/email not confirmed/i.test(msg)) return 'This email isn’t confirmed yet. Ask the owner to confirm it in Supabase.';
    if (/should be different|same.*password|same_password/i.test(msg)) return 'Pick a new password that’s different from your current one.';
    if (/weak|password should|pwned|leaked/i.test(msg)) return 'That password is too weak. Use at least 12 characters, mixing words, numbers and symbols.';
    if (/reauthenticat|session.*(missing|expired)|jwt expired/i.test(msg)) return 'Your sign-in has expired. Sign out, sign in again, then change your password.';
    if (/signups not allowed|user not found/i.test(msg)) return 'This email isn’t on the Salt and Light team.';
    if (/rate limit|too many/i.test(msg)) return 'Too many sign-in emails were sent just now. Please wait a few minutes and try again.';
    return msg;
  }
  function must(res) { if (res.error) throw new Error(friendly(res.error.message)); return res.data; }
  // Public reads (published posts, site settings) go straight to the REST API with fetch(), so a
  // visitor's browser never loads the 55 KB Supabase library; the Studio still uses it for sign-in and writes.
  function restGet(query) {
    return fetch(cfg.supabaseUrl + '/rest/v1/' + query, { headers: { apikey: cfg.supabaseAnonKey, Accept: 'application/json' } }).then(function (res) {
      if (res.ok) return res.json();
      return res.json().catch(function () { return {}; }).then(function (b) { throw new Error(friendly(b.message || 'The database answered ' + res.status + '.')); });
    }, function (err) { throw new Error(friendly(err && err.message || 'Failed to fetch')); });
  }
  // All public settings in one request; the app asks for three of them at start-up.
  var settingsReq = null, settingsAt = 0;
  function publicSettings() {
    if (!settingsReq || Date.now() - settingsAt > 5000) {
      settingsAt = Date.now();
      settingsReq = restGet('site_settings?select=key,value').then(function (rows) {
        var out = {}; (rows || []).forEach(function (r) { out[r.key] = r.value; }); return out;
      });
      settingsReq.catch(function () { settingsReq = null; });
    }
    return settingsReq;
  }
  var redirectTo = function () { return location.origin + location.pathname; };

  var supa = {
    mode: 'supabase',
    session: function () {
      return loadClient().then(function (c) { return c.auth.getSession(); }).then(function (res) {
        var s = res.data && res.data.session;
        if (!s) return null;
        var email = s.user.email.toLowerCase();
        return client.from('team_members').select('role').eq('email', email).maybeSingle().then(function (r) {
          if (r.error || !r.data) {
            return client.auth.signOut().then(function () { throw new Error('This email isn’t on the Salt and Light team.'); });
          }
          return { email: email, role: r.data.role };
        });
      });
    },
    // The signed-in user's Supabase access token (for /api/insights), or '' when signed out.
    accessToken: function () {
      return loadClient().then(function (c) { return c.auth.getSession(); }).then(function (res) { var s = res.data && res.data.session; return s ? s.access_token : ''; });
    },
    // Main sign-in: email + password. Sends no email, so it never touches Supabase's email limit.
    // The password goes straight to Supabase and is never logged or stored here. The team check
    // happens in session(), which signs anyone not on the team straight back out.
    signInWithPassword: function (email, password) {
      return loadClient().then(function (c) { return c.auth.signInWithPassword({ email: email, password: password }); })
        .then(function (res) { must(res); return supa.session(); })
        .then(function (s) { return { signedIn: true, session: s }; });
    },
    updatePassword: function (password) {
      return loadClient().then(function (c) { return c.auth.updateUser({ password: password }); })
        .then(function (res) { must(res); return true; });
    },
    // Secondary: one-time email link. Never creates new users (sign-ups stay closed).
    signInWithEmail: function (email) {
      return loadClient().then(function (c) {
        return c.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: false } });
      }).then(function (res) { must(res); return { signedIn: false }; });
    },
    signInWithGoogle: function () {
      return loadClient().then(function (c) { return c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: redirectTo() } }); })
        .then(function (res) { must(res); return { signedIn: false }; });
    },
    signOut: function () { return loadClient().then(function (c) { return c.auth.signOut(); }); },
    onAuthChange: function (fn) {
      loadClient().then(function (c) { c.auth.onAuthStateChange(function (event) { if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') fn(event); }); });
    },
    listPosts: function () {
      return loadClient().then(function (c) { return c.from('posts').select('*').order('publish_at', { ascending: false, nullsFirst: true }); }).then(must);
    },
    savePost: function (post, email) {
      return supa.listPosts().then(function (all) {
        var rec = JSON.parse(JSON.stringify(post));
        rec.slug = uniqueSlug(rec, all);
        rec.updated_at = nowIso();
        // The database assigns `id` itself and refuses to have it written, so it is never sent.
        var id = rec.id;
        delete rec.id;
        if (!id) rec.author_email = email || '';
        var q = id ? client.from('posts').update(rec).eq('id', id) : client.from('posts').insert(rec);
        return q.select().single();
      }).then(must);
    },
    deletePost: function (id) { return loadClient().then(function (c) { return c.from('posts').delete().eq('id', id); }).then(must); },
    // History is written by a database trigger (supabase/schema.sql), so it can't be skipped or edited.
    listRevisions: function (postId) {
      return loadClient().then(function (c) {
        return c.from('post_revisions').select('*').eq('post_id', postId).order('changed_at', { ascending: false }).order('id', { ascending: false });
      }).then(must);
    },
    uploadMedia: function (file) {
      var path = new Date().toISOString().slice(0, 10) + '/' + Date.now() + '-' + slugify(file.name.replace(/\.[^.]+$/, '')) + (file.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();
      return loadClient().then(function (c) { return c.storage.from('media').upload(path, file, { contentType: file.type, upsert: false }); })
        .then(must).then(function () { return client.storage.from('media').getPublicUrl(path).data.publicUrl; });
    },
    // Upload to a fixed, content-hashed path (bedtime stories: stories/<slug>.<sha8>.mp3). The name changes
    // whenever the bytes change, so the file may be cached for a year. Uploading the same bytes again
    // (same name) is not an error: the file is already there.
    uploadMediaAt: function (file, path, opts) {
      opts = opts || {};
      return loadClient().then(function (c) {
        return c.storage.from('media').upload(path, file, { contentType: opts.contentType || file.type, cacheControl: opts.cacheControl || '3600', upsert: false });
      }).then(function (res) {
        if (res && res.error && !/exists|duplicate/i.test(res.error.message || '')) throw res.error;
        return client.storage.from('media').getPublicUrl(path).data.publicUrl;
      });
    },
    getSetting: function (key) {
      return publicSettings().then(function (all) { return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : null; });
    },
    // Only owners may write (row-level security in supabase/schema.sql).
    saveSetting: function (key, value) {
      settingsReq = null;
      return loadClient().then(function (c) { return c.from('site_settings').upsert({ key: key, value: value }).select('value').single(); })
        .then(must).then(function (row) { settingsReq = null; return row.value; });
    },
    listTeam: function () { return loadClient().then(function (c) { return c.from('team_members').select('*').order('invited_at'); }).then(must); },
    invite: function (email, role) {
      return loadClient().then(function (c) { return c.from('team_members').insert({ email: email.toLowerCase(), role: role }); }).then(must);
    },
    removeMember: function (email) { return loadClient().then(function (c) { return c.from('team_members').delete().eq('email', email); }).then(must); },
    publishedPosts: function () {
      // Visitors may read every column except author_email (column grants in the database), so `*` is refused.
      return restGet('posts?select=id,type,status,publish_at,title,slug,show_on_today,fields,media_url,created_at,updated_at' +
        '&status=in.(published,scheduled)&publish_at=lte.' + encodeURIComponent(nowIso()) + '&order=publish_at.desc');
    }
  };

  // Turn network errors thrown by the client into plain messages too.
  Object.keys(supa).forEach(function (k) {
    var fn = supa[k];
    if (typeof fn !== 'function' || k === 'onAuthChange') return;
    supa[k] = function () {
      return fn.apply(supa, arguments).catch(function (err) { throw new Error(friendly(err && err.message)); });
    };
  });

  window.LLStore = remote ? supa : local;
  window.LLStore.resolveMedia = resolveMedia;
  window.LLStore.isLive = isLive;
  window.LLStore.slugify = slugify;

  // ---------- public menus (site setting 'nav') ----------
  // Each menu is 'on', 'coming_soon' (the tab stays, tapping it shows a friendly message) or
  // 'hidden'. Today is always on. Used when the setting is missing or can't be loaded.
  var NAV_MENUS = ['watch', 'listen', 'read', 'verses', 'play'];
  var NAV_STATES = ['on', 'coming_soon', 'hidden'];
  var NAV_DEFAULT = { menus: { watch: 'on', listen: 'on', read: 'on', verses: 'hidden', play: 'on' },
    message: 'This feature is coming soon! We’re still getting it ready for you.' };
  // Returns a clean copy, or null when `v` doesn't look like a nav setting.
  function normalizeNav(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v) || !v.menus || typeof v.menus !== 'object') return null;
    var out = { menus: {}, message: typeof v.message === 'string' && v.message.trim() ? v.message.trim().slice(0, 300) : NAV_DEFAULT.message };
    NAV_MENUS.forEach(function (m) { out.menus[m] = NAV_STATES.indexOf(v.menus[m]) >= 0 ? v.menus[m] : 'on'; });
    return out;
  }
  window.LLStore.NAV_MENUS = NAV_MENUS;
  window.LLStore.NAV_STATES = NAV_STATES;
  window.LLStore.navDefault = function () { return normalizeNav(NAV_DEFAULT); };
  window.LLStore.normalizeNav = normalizeNav;

  // ---------- built-in items hidden in the Studio (site setting 'builtins_hidden') ----------
  // value: { hidden: ["audio:keep-building", "verse:joshua-1-9", ...] }. Returns the clean list, or
  // null when `v` doesn't look like this setting.
  function normalizeHidden(v) {
    if (!v || typeof v !== 'object' || !Array.isArray(v.hidden)) return null;
    var out = [];
    v.hidden.forEach(function (k) { if (typeof k === 'string' && /^(audio|devotion|reel|verse):[a-z0-9-]{1,60}$/.test(k) && out.indexOf(k) < 0) out.push(k); });
    return out;
  }
  window.LLStore.normalizeHidden = normalizeHidden;
  // Built-ins marked `hidden: true` in js/content.js start hidden; the Studio can show them again,
  // which is saved as value.shown. Effective list = value.hidden + (hidden-by-default - value.shown).
  function defaultHidden() {
    var C = window.LL_CONTENT || {}, out = [];
    [['episodes', 'audio', 'title'], ['devotions', 'devotion', 'slug'], ['reels', 'reel', 'title'], ['verses', 'verse', 'ref']].forEach(function (t) {
      (C[t[0]] || []).forEach(function (it) { if (it && it.hidden === true) out.push(t[1] + ':' + slugify(it[t[2]])); });
    });
    return out;
  }
  function effectiveHidden(v) {
    var base = normalizeHidden(v) || [], shown = (v && Array.isArray(v.shown) ? normalizeHidden({ hidden: v.shown }) : null) || [];
    defaultHidden().forEach(function (k) { if (shown.indexOf(k) < 0 && base.indexOf(k) < 0) base.push(k); });
    return base;
  }
  // The setting value to save for an effective hidden list.
  function hiddenValue(list) {
    var d = defaultHidden(), l = normalizeHidden({ hidden: list || [] }) || [];
    return { hidden: l.filter(function (k) { return d.indexOf(k) < 0; }), shown: d.filter(function (k) { return l.indexOf(k) < 0; }) };
  }
  window.LLStore.defaultHidden = defaultHidden;
  window.LLStore.effectiveHidden = effectiveHidden;
  window.LLStore.hiddenValue = hiddenValue;

  // ---------- which kinds of content the site shows (site setting 'content') ----------
  // value: { verses: true|false }. A missing row or key means verses are HIDDEN (Taman's choice,
  // Oct 2026); nothing is deleted, the owner can switch them back on in the Studio.
  var CONTENT_DEFAULT = { verses: false };
  function normalizeContent(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    return { verses: v.verses === true };
  }
  window.LLStore.contentDefault = function () { return { verses: CONTENT_DEFAULT.verses }; };
  window.LLStore.normalizeContent = normalizeContent;
  // ---------- bedtime stories posted in the Studio (type 'story') ----------
  // Shared by the app (js/app.js), the build (scripts/prerender.mjs) and the Studio, so a Studio story is
  // shown exactly like a built-in one in js/content.js `bedtimeStories`.
  var SGT_OFFSET = '+08:00';
  // 'YYYY-MM-DD' -> the moment that day starts in Singapore, as an ISO string (publish_at of a story).
  function sgtDayStart(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) return '';
    var t = new Date(day + 'T00:00:00' + SGT_OFFSET);
    return isNaN(t) ? '' : t.toISOString();
  }
  // 'YYYY-MM-DD' + 'HH:MM' (Singapore time, default 00:00) -> ISO string. The schedule time of every post.
  function sgtStart(day, hm) {
    hm = hm == null || hm === '' ? '00:00' : String(hm);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(hm)) return '';
    var t = new Date(day + 'T' + hm + ':00' + SGT_OFFSET);
    return isNaN(t) ? '' : t.toISOString();
  }
  // An ISO time -> its clock time in Singapore ('HH:MM').
  function sgtTime(iso) {
    var t = Date.parse(iso || '');
    return isFinite(t) ? new Date(t + 8 * 3600 * 1000).toISOString().slice(11, 16) : '';
  }
  // An ISO time -> its calendar day in Singapore ('YYYY-MM-DD').
  function sgtDay(iso) {
    var t = Date.parse(iso || '');
    return isFinite(t) ? new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10) : '';
  }
  function num(v) { return typeof v === 'number' && isFinite(v); }
  // Read-along timings: [{text,start,end,words:[{text,start,end}]}], seconds from the start of the audio.
  // Returns { ok, error, sentences, words, end }. `dur` (seconds, optional) checks the file fits the audio.
  function validateTimings(t, dur) {
    function bad(msg) { return { ok: false, error: msg }; }
    if (!Array.isArray(t)) return bad('The timings file must be a list: [{ "text", "start", "end", "words": [...] }, ...].');
    if (!t.length) return bad('The timings file is empty.');
    var words = 0, last = -1;
    for (var i = 0; i < t.length; i++) {
      var s = t[i], at = 'Sentence ' + (i + 1);
      if (!s || typeof s !== 'object' || Array.isArray(s)) return bad(at + ' is not an object.');
      if (typeof s.text !== 'string' || !s.text.trim()) return bad(at + ' has no "text".');
      if (!num(s.start) || !num(s.end)) return bad(at + ': "start" and "end" must be numbers (seconds).');
      if (s.start < 0 || s.end < s.start) return bad(at + ': "end" must not be before "start".');
      if (s.start < last - 0.05) return bad(at + ' starts before the sentence before it. Keep sentences in order.');
      last = s.start;
      if (!Array.isArray(s.words) || !s.words.length) return bad(at + ' has no "words" list.');
      for (var j = 0; j < s.words.length; j++) {
        var w = s.words[j];
        if (!w || typeof w.text !== 'string' || !num(w.start) || !num(w.end) || w.end < w.start) return bad(at + ', word ' + (j + 1) + ': needs "text", "start" and "end".');
      }
      words += s.words.length;
    }
    var end = t[t.length - 1].end;
    if (num(dur) && dur > 0 && end > dur + 2) return bad('The timings run to ' + Math.round(end) + ' s but the audio is ' + Math.round(dur) + ' s long. Is it the right file?');
    return { ok: true, sentences: t.length, words: words, end: end };
  }
  function lines(v) { return String(v || '').split(/\n/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function paragraphs(v) { return String(v || '').split(/\n\s*\n/).map(function (x) { return x.replace(/\s*\n\s*/g, ' ').trim(); }).filter(Boolean); }
  // A published Studio story post -> the bedtimeStories shape (see js/content.js). `src` overrides media_url
  // (the app resolves local-media: links first).
  function storyFromPost(p, src) {
    var f = (p && p.fields) || {};
    var qs = lines(f.questions);
    var x = {
      slug: p.slug, title: p.title || '', series: f.series || 'Bedtime Bible Stories for Kids', episode: +f.episode || 0,
      seoTitle: f.seo_title || '', desc: f.desc || '', narrator: f.narrator || '',
      src: src || p.media_url || '', placeholder: false, dur: +f.seconds || 0,
      timings: f.timings || '', color: /^#[0-9a-f]{6}$/i.test(f.color || '') ? f.color : '#a07fd6', ink: /^#[0-9a-f]{6}$/i.test(f.ink || '') ? f.ink : '#1d1233',
      story: paragraphs(f.story), prayer: f.prayer || '', goodnight: f.goodnight || '',
      verse: { text: f.verse || '', ref: f.ref || '', version: f.translation || 'WEB' },
      questions: qs.length === 3 ? qs : qs.length ? qs.slice(0, 3) : [],
      image: f.image || '', imageWidth: +f.image_width || 0, imageHeight: +f.image_height || 0,
      date: p.publish_at || p.created_at || '', updated: p.updated_at || '', _studio: true
    };
    if (f.next_title) x.next = { title: f.next_title, when: f.next_when || '', href: f.next_href || '/listen' };
    if (f.word && f.word_meaning) x.word = { word: f.word, meaning: f.word_meaning };
    if (!x.image) { x.imageWidth = 0; x.imageHeight = 0; }
    return x;
  }
  // Built-in stories first, then Studio stories by publish date (then episode). A Studio story with the
  // same slug as a built-in one replaces it.
  function mergeStories(builtins, posts) {
    var studio = (posts || []).filter(function (p) { return p.type === 'story' && p.slug && isLive(p); })
      .sort(function (a, b) { return String(a.publish_at).localeCompare(String(b.publish_at)); })
      .map(function (p) { return storyFromPost(p, p._src); });
    var taken = {};
    studio.forEach(function (x) { taken[x.slug] = 1; });
    return (builtins || []).filter(function (b) { return !taken[b.slug]; }).concat(studio);
  }
  window.LLStore.sgtDayStart = sgtDayStart;
  window.LLStore.sgtStart = sgtStart;
  window.LLStore.sgtTime = sgtTime;
  window.LLStore.sgtDay = sgtDay;
  window.LLStore.validateTimings = validateTimings;
  window.LLStore.storyFromPost = storyFromPost;
  window.LLStore.mergeStories = mergeStories;
})();
