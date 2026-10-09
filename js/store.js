// Little Light data layer, shared by the app and the Studio.
//
// One post shape everywhere (it matches the `posts` table in supabase/schema.sql):
//   { id, type, status, publish_at, title, slug, show_on_today, fields, media_url,
//     author_email, created_at, updated_at }
// type:   'verse' | 'devotion' | 'audio' | 'reel' | 'game'
// status: 'draft' | 'scheduled' | 'published'
// A post is visible in the app when status is 'scheduled' or 'published' and
// publish_at is in the past, so scheduled posts appear on time without a server job.
(function () {
  'use strict';
  var cfg = window.LL_CONFIG || {};
  var remote = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
  // Bundled copy of supabase-js (MIT), so the Studio does not depend on a CDN.
  var SUPABASE_JS = (document.currentScript && document.currentScript.src ? new URL('vendor/supabase-2.117.2.js', document.currentScript.src).href : 'js/vendor/supabase-2.117.2.js');
  var POSTS_KEY = 'll.posts.v1', SESSION_KEY = 'll.studio.session', TEAM_KEY = 'll.studio.team', HISTORY_KEY = 'll.history.v1', EVENTS_KEY = 'll.events.v1';

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
  // ---------- insights: anonymous usage counts (see supabase/schema.sql, "insights") ----------
  function utcDay(d) { return (d || new Date()).toISOString().slice(0, 10); }
  // Turns raw rows into what the Insights page shows. Same result as public.insights() in the database.
  function summarize(rows, since) {
    var days = {}, tabs = {}, items = {}, installs = 0;
    rows.forEach(function (r) {
      if (r.day < since) return;
      var d = days[r.day] || (days[r.day] = { day: r.day, seen: {}, visits: 0 });
      d.seen[r.visitor] = 1;
      if (r.name === 'visit') d.visits++;
      if (r.name === 'install') installs++;
      if (r.tab && (r.name === 'tab_view' || r.name === 'tab_time')) {
        var t = tabs[r.tab] || (tabs[r.tab] = { tab: r.tab, views: 0, seen: {}, seconds: 0 });
        if (r.name === 'tab_view') { t.views++; t.seen[r.visitor + r.day] = 1; } else t.seconds += r.value || 0;
      }
      if (r.item) {
        var i = items[r.item] || (items[r.item] = { item: r.item, kind: r.kind, title: r.title, opens: 0, saves: 0, shares: 0, plays: 0 });
        i.title = r.title || i.title;
        var k = { open: 'opens', save: 'saves', share: 'shares', play: 'plays' }[r.name];
        if (k) i[k]++;
      }
    });
    var list = function (o) { return Object.keys(o).map(function (k) { return o[k]; }); };
    return {
      days: list(days).map(function (d) { return { day: d.day, visitors: Object.keys(d.seen).length, visits: d.visits }; })
        .sort(function (a, b) { return a.day.localeCompare(b.day); }),
      tabs: list(tabs).map(function (t) { return { tab: t.tab, views: t.views, visitors: Object.keys(t.seen).length, seconds: t.seconds }; }),
      items: list(items), installs: installs
    };
  }
  function sinceDay(days) { return utcDay(new Date(Date.now() - (days - 1) * 86400000)); }

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
        return Promise.reject(new Error('This email isn’t on the Little Light team.'));
      }
      if (!team.length) writeJSON(TEAM_KEY, [{ email: email.toLowerCase(), role: 'owner', invited_at: nowIso() }]);
      var s = { email: email.toLowerCase(), role: local._roleOf(email) };
      writeJSON(SESSION_KEY, s);
      return Promise.resolve({ signedIn: true, session: s });
    },
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
    // Every change of every post, oldest first, without the post contents (for the posts table).
    listChanges: function () {
      return Promise.resolve(readJSON(HISTORY_KEY, []).map(function (r) {
        return { post_id: r.post_id, action: r.action, changed_by: r.changed_by, changed_at: r.changed_at };
      }));
    },
    track: function (rows) {
      var all = readJSON(EVENTS_KEY, []), now = new Date();
      rows.forEach(function (r) { r.at = now.toISOString(); r.day = utcDay(now); all.push(r); });
      writeJSON(EVENTS_KEY, all.slice(-4000));
      return Promise.resolve();
    },
    insights: function (days) { return Promise.resolve(summarize(readJSON(EVENTS_KEY, []), sinceDay(days))); },
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
    if (/rate limit|too many/i.test(msg)) return 'Too many sign-in emails were sent just now. Please wait a few minutes and try again.';
    return msg;
  }
  function must(res) { if (res.error) throw new Error(friendly(res.error.message)); return res.data; }
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
            return client.auth.signOut().then(function () { throw new Error('This email isn’t on the Little Light team.'); });
          }
          return { email: email, role: r.data.role };
        });
      });
    },
    signInWithEmail: function (email) {
      return loadClient().then(function (c) {
        return c.auth.signInWithOtp({ email: email, options: { emailRedirectTo: redirectTo(), shouldCreateUser: true } });
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
    listChanges: function () {
      return loadClient().then(function (c) {
        return c.from('post_revisions').select('post_id, action, changed_by, changed_at').order('changed_at', { ascending: true }).limit(5000);
      }).then(must);
    },
    // Sent straight to the database's REST address, so the app doesn't wait for the client library
    // and the request survives the page being closed (keepalive).
    track: function (rows) {
      return fetch(cfg.supabaseUrl + '/rest/v1/events', {
        method: 'POST', keepalive: true,
        headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      }).then(function () {}, function () {});
    },
    insights: function (days) {
      return loadClient().then(function (c) { return c.rpc('insights', { since: sinceDay(days) }); }).then(must);
    },
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
    listTeam: function () { return loadClient().then(function (c) { return c.from('team_members').select('*').order('invited_at'); }).then(must); },
    invite: function (email, role) {
      return loadClient().then(function (c) { return c.from('team_members').insert({ email: email.toLowerCase(), role: role }); }).then(must);
    },
    removeMember: function (email) { return loadClient().then(function (c) { return c.from('team_members').delete().eq('email', email); }).then(must); },
    publishedPosts: function () {
      return loadClient().then(function (c) {
        return c.from('posts').select('*').in('status', ['published', 'scheduled']).lte('publish_at', nowIso()).order('publish_at', { ascending: false });
      }).then(must);
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
  window.LLStore.googleSignIn = remote && cfg.googleSignIn === true;
  window.LLStore.resolveMedia = resolveMedia;
  window.LLStore.isLive = isLive;
  window.LLStore.slugify = slugify;
})();
