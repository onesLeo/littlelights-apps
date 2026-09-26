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
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js';
  var POSTS_KEY = 'll.posts.v1', SESSION_KEY = 'll.studio.session', TEAM_KEY = 'll.studio.team';

  function nowIso() { return new Date().toISOString(); }
  function isLive(p) { return (p.status === 'published' || p.status === 'scheduled') && p.publish_at && new Date(p.publish_at) <= new Date(); }
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
    savePost: function (post, email) {
      var all = readJSON(POSTS_KEY, []), stamp = nowIso(), rec = JSON.parse(JSON.stringify(post));
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
      return Promise.resolve(rec);
    },
    deletePost: function (id) {
      writeJSON(POSTS_KEY, readJSON(POSTS_KEY, []).filter(function (p) { return p.id !== id; }));
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
  function must(res) { if (res.error) throw new Error(res.error.message); return res.data; }
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
        if (!rec.id) { delete rec.id; rec.author_email = email || ''; }
        var q = rec.id ? client.from('posts').update(rec).eq('id', rec.id) : client.from('posts').insert(rec);
        return q.select().single();
      }).then(must);
    },
    deletePost: function (id) { return loadClient().then(function (c) { return c.from('posts').delete().eq('id', id); }).then(must); },
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

  window.LLStore = remote ? supa : local;
  window.LLStore.resolveMedia = resolveMedia;
  window.LLStore.isLive = isLive;
  window.LLStore.slugify = slugify;
})();
