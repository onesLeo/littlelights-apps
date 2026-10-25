// Writes one HTML file per address into dist/ (dist/watch.html is served at /watch, dist/read/brave.html
// at /read/brave), each with its own <title>, description, canonical, share-preview tags and JSON-LD,
// plus a sitemap.xml listing them. Run by scripts/build-pages.mjs.
//
// Content: js/content.js (built-in posts) plus what is published in the Studio, read from Supabase with
// the public (anon) key, the same read-only request the app makes. If Supabase can't be reached the
// build still succeeds with the built-in posts; posts published later are covered by functions/.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';
import { SEO, renderPage, audioFromPost, devotionFromPost, reelFromPost, playerPoster } from '../lib/head.mjs';

// Loads js/config.js, js/content.js and js/store.js in a small sandbox, so the build uses the app's own
// rules (slugs, hidden built-ins, menu settings).
async function loadScripts(root) {
  const ctx = { console, URL, Date, JSON, Math, Promise, setTimeout, clearTimeout, document: { currentScript: null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['js/config.js', 'js/content.js']) vm.runInContext(await readFile(resolve(root, f), 'utf8'), ctx, { filename: f });
  const cfg = ctx.LL_CONFIG;
  ctx.LL_CONFIG = {}; // local mode: store.js only provides its helpers here
  vm.runInContext(await readFile(resolve(root, 'js/store.js'), 'utf8'), ctx, { filename: 'js/store.js' });
  return { cfg, C: JSON.parse(JSON.stringify(ctx.LL_CONTENT)), S: ctx.LLStore };
}

export async function fetchPublished(cfg, fetchImpl = fetch, timeoutMs = 10000) {
  if (!cfg || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return { posts: [], settings: {}, ok: false, why: 'no Supabase config' };
  const h = { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey };
  const get = async (q) => {
    const res = await fetchImpl(cfg.supabaseUrl + '/rest/v1/' + q, { headers: h, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) throw new Error(q.split('?')[0] + ': HTTP ' + res.status);
    return res.json();
  };
  try {
    const now = new Date().toISOString();
    const [posts, rows] = await Promise.all([
      get('posts?select=id,type,status,publish_at,title,slug,show_on_today,fields,media_url,created_at,updated_at&status=in.(published,scheduled)&publish_at=lte.' + encodeURIComponent(now) + '&order=publish_at.desc'),
      get('site_settings?select=key,value'),
    ]);
    const settings = {};
    for (const r of rows) settings[r.key] = r.value;
    return { posts, settings, ok: true };
  } catch (err) {
    return { posts: [], settings: {}, ok: false, why: err.message };
  }
}

// What the public site shows, in the shape the head builder needs.
export function siteContent({ C, S }, { posts, settings }) {
  const hidden = S.effectiveHidden(settings.builtins_hidden == null ? null : settings.builtins_hidden);
  const nav = S.normalizeNav(settings.nav) || S.navDefault();
  const copyOf = new Set(posts.map((p) => p.fields && p.fields.builtin).filter(Boolean));
  const keep = (kind, key) => (it) => { const k = kind + ':' + S.slugify(key(it)); return hidden.indexOf(k) < 0 && !copyOf.has(k); };
  const studioAudio = posts.filter((p) => p.type === 'audio').map(audioFromPost);
  const builtinAudio = C.episodes.filter(keep('audio', (e) => e.title));
  const episodes = studioAudio.concat(builtinAudio).filter((e) => e.src);

  const studioDev = posts.filter((p) => p.type === 'devotion' && p.slug).map((p) => devotionFromPost(p, studioAudio.find((a) => a._id === (p.fields || {}).audioId)));
  const builtinDev = C.devotions.filter(keep('devotion', (d) => d.slug)).map((d) => ({ ...d, date: '', audio: d.episode >= 0 && C.episodes[d.episode] && C.episodes[d.episode].src ? C.episodes[d.episode] : null }));
  const devotions = studioDev.concat(builtinDev);

  const studioReels = posts.filter((p) => p.type === 'reel').map(reelFromPost);
  const builtinReels = C.reels.filter(keep('reel', (r) => r.title)).map((r) => ({ ...r, slug: '' }));
  const reels = studioReels.concat(builtinReels);
  const seriesMap = new Map();
  for (const r of reels) if (r.series) { const s = seriesMap.get(r.series) || { series: r.series, desc: '', reels: [] }; s.reels.push(r); if (r.seriesDesc && !s.desc) s.desc = r.seriesDesc; seriesMap.set(r.series, s); }
  for (const s of seriesMap.values()) s.reels.sort((a, b) => a.episode - b.episode);
  return { nav, episodes, devotions, reels, series: [...seriesMap.values()] };
}

// The Watch gallery (js/app.js renderWatch/units) leads with its newest video or series, the biggest
// picture on every Watch address (/watch, /watch/<slug>, /watch/series/<name>): start loading it with
// the HTML. Same grouping as units(): a series is dated by its newest episode, its cover is episode 1.
export function watchHero(site) {
  const units = [];
  const by = new Map();
  for (const r of site.reels) {
    const s = String(r.series || '').trim();
    if (!s) { units.push({ eps: [r] }); continue; }
    if (!by.has(s)) { const u = { eps: [] }; by.set(s, u); units.push(u); }
    by.get(s).eps.push(r);
  }
  for (const u of units) {
    u.eps.sort((a, b) => (a.episode || 999) - (b.episode || 999));
    u.date = u.eps.reduce((m, r) => (Date.parse(r.date || '') || 0) > (Date.parse(m || '') || 0) ? r.date : m, '');
  }
  units.sort((a, b) => (Date.parse(b.date || '') || 0) - (Date.parse(a.date || '') || 0));
  const cover = units[0] && units[0].eps[0];
  const out = { watchUnits: units.length };
  if (cover && cover.src && cover.poster && cover.thumb) out.heroImage = '/' + String(cover.thumb).replace(/^\//, '');
  // No made thumbnails (a Studio post): the gallery shows the poster itself (thumb() in js/app.js).
  else if (cover && cover.src && cover.poster) out.heroPoster = /^https?:/.test(cover.poster) ? cover.poster : '/' + String(cover.poster).replace(/^\//, '');
  return out;
}

// Every address, with the file it is written to.
export function pageList(site) {
  const on = (tab) => tab === 'today' || site.nav.menus[tab] === 'on';
  const fileFor = (p) => (p === '/' ? 'index.html' : p.slice(1) + '.html');
  const pages = [];
  for (const tab of SEO.TABS) {
    const meta = SEO.meta('page', tab);
    // Screens that are switched off or "coming soon" still answer (old links), but stay out of search.
    const page = { tab, meta, file: fileFor(meta.path), noindex: !on(tab), episodes: site.episodes, reels: site.reels.filter((r) => !r.series), devotions: site.devotions };
    if (tab === 'watch') Object.assign(page, watchHero(site));
    pages.push(page);
  }
  pages.push({ tab: 'today', meta: { ...SEO.meta('page', 'today') }, file: 'today.html', alias: true });
  if (on('read')) for (const d of site.devotions) { const meta = SEO.meta('devotion', d); pages.push({ tab: 'read', kind: 'devotion', item: d, meta, file: fileFor(meta.path) }); }
  if (on('watch')) {
    for (const r of site.reels) { const meta = SEO.meta('reel', r); pages.push({ tab: 'watch', kind: 'reel', item: r, meta, file: fileFor(meta.path), ...watchHero(site), ...playerPoster(r) }); }
    for (const s of site.series) { const meta = SEO.meta('series', s); pages.push({ tab: 'watch', kind: 'series', item: s, meta, file: fileFor(meta.path), ...watchHero(site) }); }
  }
  return pages;
}

// <lastmod> for every address: a post's own date (its last edit when the Studio has one), a series'
// newest episode, a screen's newest post, Today the newest of all. Built-in posts without a date and
// screens without posts use `fallback` (when js/content.js last changed, else the build date).
const day = (d) => { const t = Date.parse(d || ''); return Number.isFinite(t) ? t : 0; };
const newest = (dates) => dates.reduce((m, d) => Math.max(m, day(d)), 0);
const itemDate = (x) => Math.max(day(x.date), day(x.updated));
export function lastmodFor(p, pages, fallback) {
  let t = 0;
  if (p.kind === 'series') t = Math.max(...p.item.reels.map(itemDate), 0);
  else if (p.item) t = itemDate(p.item);
  else {
    const posts = pages.filter((q) => q.item && !q.noindex);
    const of = (tab) => posts.filter((q) => q.tab === tab && q.kind !== 'series').map((q) => itemDate(q.item));
    if (p.tab === 'today') t = Math.max(0, ...posts.filter((q) => q.kind !== 'series').map((q) => itemDate(q.item)), newest((p.episodes || []).map((e) => e.date)));
    else if (p.tab === 'listen') t = newest((p.episodes || []).map((e) => e.date));
    else t = Math.max(0, ...of(p.tab));
  }
  return new Date(t || day(fallback) || Date.now()).toISOString().slice(0, 10);
}
export function sitemapXml(pages, fallback = '') {
  const urls = pages.filter((p) => !p.noindex && !p.alias).map((p) =>
    `  <url>\n    <loc>${SEO.SITE}${p.meta.path === '/' ? '/' : p.meta.path}</loc>\n    <lastmod>${lastmodFor(p, pages, fallback)}</lastmod>\n  </url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
// When the built-in content last changed (git), for posts and screens that carry no date of their own.
export async function contentDate(root) {
  try {
    const { execFileSync } = await import('node:child_process');
    return execFileSync('git', ['log', '-1', '--format=%cI', '--', 'js/content.js', 'index.html'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (err) { return ''; }
}

export async function prerender(root, output, { fetchImpl = fetch, log = console.log } = {}) {
  const scripts = await loadScripts(root);
  // PRERENDER_STUDIO=0 (the tests) builds from js/content.js only, so results don't depend on what is published.
  const data = process.env.PRERENDER_STUDIO === '0' ? { posts: [], settings: {}, ok: false, why: 'PRERENDER_STUDIO=0' } : await fetchPublished(scripts.cfg, fetchImpl);
  if (!data.ok) log(`prerender: Studio posts not included (${data.why}); built-in posts only.`);
  const site = siteContent(scripts, data);
  const pages = pageList(site);
  const template = await readFile(resolve(root, 'index.html'), 'utf8');
  for (const page of pages) {
    const file = resolve(output, page.file);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, renderPage(template, page));
  }
  await writeFile(resolve(output, 'sitemap.xml'), sitemapXml(pages, await contentDate(root)));
  log(`prerender: ${pages.length} pages (${site.devotions.length} devotions, ${site.reels.length} videos, ${site.series.length} series, ${site.episodes.length} audio)${data.ok ? ', Studio posts included' : ''}.`);
  return { pages, site, studio: data.ok };
}

// `node scripts/prerender.mjs --source` refreshes the <head> written in index.html itself (the Today
// page, used by the local server and as the template), so the source and the build agree.
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href && process.argv.includes('--source')) {
  const { fileURLToPath } = await import('node:url');
  const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
  const file = resolve(root, 'index.html');
  const template = await readFile(file, 'utf8');
  const page = { tab: 'today', meta: SEO.meta('page', 'today') };
  const head = renderPage(template, page).match(/<!-- seo:[^>]*-->[\s\S]*?<!-- \/seo -->/)[0];
  await writeFile(file, template.replace(/<!-- seo:[^>]*-->[\s\S]*?<!-- \/seo -->/, head).replace('<a class="p-tab on" aria-current="page" href="/" data-tab="today"', '<a class="p-tab on" href="/" data-tab="today"'));
  console.log('index.html <head> refreshed');
}
