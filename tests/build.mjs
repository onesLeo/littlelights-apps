// Build test: the packaged site (dist/, made by scripts/build-pages.mjs) contains every file the
// app and the Studio load, and nothing private. No browser needed.
// Run: npm test
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

execFileSync(process.execPath, [join(root, 'scripts', 'build-pages.mjs')], { stdio: 'inherit', env: { ...process.env, PRERENDER_STUDIO: '0' } });

// Everything the offline service worker caches on install; one missing file stops it installing.
const shell = readFileSync(join(root, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .match(/'[^']+'/g).map((s) => s.slice(1, -1)).filter((f) => f !== './');
const missingShell = shell.filter((f) => !existsSync(join(dist, f)));
check(missingShell.length === 0, `offline list: all ${shell.length} cached files are in the build ${missingShell.join(', ')}`);

// Every local file a page or stylesheet points at.
function refs(file) {
  const text = readFileSync(join(dist, file), 'utf8');
  const found = [...text.matchAll(/(?:src|href)="([^"#?]+)"|url\((['"]?)([^'")]+)\2\)/g)].map((m) => m[1] || m[3]);
  return found.filter((u) => !/^(https?:|data:|mailto:|#|\/\/)/.test(u)).map((u) => join(dirname(file), u));
}
for (const page of ['index.html', 'studio/index.html', 'fonts/fonts.css', 'css/app.css', 'studio/studio.css']) {
  // In-app addresses (/watch) are pages the build writes as watch.html.
  const missing = refs(page).filter((f) => !existsSync(join(dist, f)) && !existsSync(join(dist, f + '.html')));
  check(missing.length === 0, `${page}: every linked file is in the build ${missing.join(', ')}`);
}

check(existsSync(join(dist, 'studio', 'index.html')), 'the Studio is included');
const redirects = existsSync(join(dist, '_redirects')) ? readFileSync(join(dist, '_redirects'), 'utf8') : '';
check(/^\/join\s+https:\/\/\S+\s+302$/m.test(redirects), '_redirects is published and /join is a temporary (302) redirect');
for (const file of ['404.html', '_headers', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'icons/apple-touch-icon.png', 'icons/og-image.png', 'css/404.css']) {
  check(existsSync(join(dist, file)), `${file} is in the build`);
}
const missing404 = refs('404.html').filter((f) => !existsSync(join(dist, f)));
check(missing404.length === 0, `404.html: every linked file is in the build ${missing404.join(', ')}`);
check(/Disallow: \/studio\//.test(readFileSync(join(dist, 'robots.txt'), 'utf8')) && /Sitemap: https:\/\/littlesaltandlight\.com\/sitemap\.xml/.test(readFileSync(join(dist, 'robots.txt'), 'utf8')),
  'robots.txt keeps the Studio out of search and points at the sitemap');

// Security headers: the policy must allow the database named in js/config.js.
const headers = readFileSync(join(dist, '_headers'), 'utf8');
const csp = (headers.match(/^\s+Content-Security-Policy: (.+)$/m) || [])[1] || '';
const supabaseUrl = (readFileSync(join(root, 'js', 'config.js'), 'utf8').match(/supabaseUrl:\s*'([^']*)'/) || [])[1];
const directive = (name) => (csp.split(';').map((d) => d.trim().split(/\s+/)).find((d) => d[0] === name) || []).slice(1);
check(!supabaseUrl || ['connect-src', 'img-src', 'media-src'].every((d) => directive(d).includes(supabaseUrl)), `_headers: the policy allows ${supabaseUrl} for data and media`);
check(directive('script-src').join(' ') === "'self' https://static.cloudflareinsights.com" && directive('default-src').join(' ') === "'self'", '_headers: scripts only from this site and the Cloudflare Web Analytics beacon, no inline scripts');
check(directive('connect-src').includes('https://cloudflareinsights.com'), '_headers: the analytics beacon may report to cloudflareinsights.com');
check(directive('frame-ancestors').join(' ') === "'none'", '_headers: the site cannot be framed');
for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin', 'Permissions-Policy', 'X-Frame-Options: DENY', 'Cross-Origin-Opener-Policy: same-origin', '! Access-Control-Allow-Origin']) {
  check(headers.includes(h), `_headers: ${h}`);
}
// No inline <script> or <style> blocks (the policy would block them).
for (const page of ['index.html', '404.html', 'studio/index.html']) {
  const html = readFileSync(join(dist, page), 'utf8');
  // JSON-LD (type="application/ld+json") is data, not a script, so the policy doesn't apply to it.
  check(!/<script(?![^>]*\ssrc=)(?![^>]*type="application\/ld\+json")[^>]*>/i.test(html) && !/<style[\s>]/i.test(html) && !/\son[a-z]+="/i.test(html), `${page}: no inline scripts, style blocks or event handlers`);
}
// Nothing is loaded from Google Fonts or other font services.
for (const page of ['index.html', '404.html', 'studio/index.html', 'sw.js', 'css/app.css', 'studio/studio.css']) {
  check(!/fonts\.(googleapis|gstatic)\.com/.test(readFileSync(join(dist, page), 'utf8')), `${page}: no Google Fonts`);
}
for (const hidden of ['docs', 'supabase', 'tests', 'scripts', 'package.json', 'node_modules', '.github', 'legal']) {
  check(!existsSync(join(dist, hidden)), `${hidden} is not published`);
}

// ---------- one page per address (scripts/prerender.mjs) ----------
const page = (f) => readFileSync(join(dist, f), 'utf8');
const head = (html) => {
  const get = (re) => (html.match(re) || [])[1];
  let ld = null; try { ld = JSON.parse(get(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)); } catch { ld = null; }
  return { title: get(/<title>([^<]*)<\/title>/), desc: get(/<meta name="description" content="([^"]*)"/), canonical: get(/<link rel="canonical" href="([^"]*)"/),
    ogUrl: get(/<meta property="og:url" content="([^"]*)"/), ogImage: get(/<meta property="og:image" content="([^"]*)"/), ogType: get(/<meta property="og:type" content="([^"]*)"/),
    card: get(/<meta name="twitter:card" content="([^"]*)"/), robots: get(/<meta name="robots" content="([^"]*)"/), ld, types: ld ? ld['@graph'].map((g) => g['@type']) : [] };
};
const routes = { 'index.html': '/', 'watch.html': '/watch', 'listen.html': '/listen', 'read.html': '/read', 'play.html': '/play', 'verses.html': '/verses', 'read/brave.html': '/read/brave', 'watch/the-whisper.html': '/watch/the-whisper' };
const titles = new Set();
for (const [file, path] of Object.entries(routes)) {
  check(existsSync(join(dist, file)), `${path}: has its own page (${file})`);
  if (!existsSync(join(dist, file))) continue;
  const h = head(page(file));
  titles.add(h.title);
  check(h.canonical === 'https://littlesaltandlight.com' + path && h.ogUrl === h.canonical, `${path}: canonical and og:url point at ${path}`);
  check(!!h.title && h.title.includes('Salt and Light') && h.title.length <= 75 && !!h.desc && h.desc.length >= 50 && h.desc.length <= 160, `${path}: title (${h.title && h.title.length} chars) and description (${h.desc && h.desc.length} chars)`);
  check(h.ogImage === 'https://littlesaltandlight.com/icons/og-image.png' && h.card === 'summary_large_image' && !!h.ogType, `${path}: share preview (og:image 1200x630, twitter summary_large_image)`);
  check(h.types.includes('WebSite') && h.types.includes('Organization'), `${path}: JSON-LD has WebSite and Organization`);
  const html = page(file), tab = path === '/' ? 'today' : path.split('/')[1];
  check(new RegExp(`class="p-view v-${tab} on"`).test(html) && (html.match(/class="p-view [^"]* on"/g) || []).length === 1, `${path}: the ${tab} screen is the one shown before scripts run`);
}
check(titles.size === Object.keys(routes).length, 'every page has its own title');
check(head(page('read/brave.html')).types.includes('Article') && /<article class="p-over p-article on" id="pArticle"[^>]*>[\s\S]*?<h2>You don’t have to feel brave to be brave<\/h2>[\s\S]*?valley of Elah/.test(page('read/brave.html')), '/read/brave: Article JSON-LD and the devotion text are in the HTML');
check(head(page('watch/the-whisper.html')).types.includes('VideoObject') && head(page('watch/the-whisper.html')).ld['@graph'].find((g) => g['@type'] === 'VideoObject').thumbnailUrl.endsWith('.jpg'), '/watch/the-whisper: VideoObject JSON-LD with a thumbnail');
check(head(page('listen.html')).types.includes('PodcastEpisode'), '/listen: PodcastEpisode JSON-LD');
check(head(page('verses.html')).robots === 'noindex', '/verses: "coming soon", so kept out of search');
check(!head(page('watch.html')).robots && !head(page('index.html')).robots, 'live screens are indexable');
const sitemap = page('sitemap.xml');
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check(['/', '/watch', '/listen', '/read', '/play', '/read/brave', '/read/heart', '/read/keep-building', '/watch/the-whisper', '/watch/the-last-straw', '/watch/first-day-jitters'].every((p) => locs.includes('https://littlesaltandlight.com' + p)), `sitemap.xml lists every screen and post (${locs.length} addresses)`);
check(!locs.some((l) => /\/(verses|studio|today)/.test(l)), 'sitemap.xml leaves out the Studio, /today (same as /) and coming-soon screens');
check(!existsSync(join(dist, 'read', 'nope.html')) && !existsSync(join(dist, 'index', 'html')), 'no catch-all page: unknown addresses stay a 404');
check(existsSync(join(root, 'functions', 'read', '[slug].js')) && existsSync(join(root, 'functions', 'watch', '[slug].js')), 'Pages Functions cover posts published after the build (/read/<slug>, /watch/<slug>)');

console.log(failures ? `\n${failures} build check(s) failed` : '\nAll build checks passed');
process.exit(failures ? 1 : 0);
