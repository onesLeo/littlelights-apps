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

execFileSync(process.execPath, [join(root, 'scripts', 'build-pages.mjs')], { stdio: 'inherit' });

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
  const missing = refs(page).filter((f) => !existsSync(join(dist, f)));
  check(missing.length === 0, `${page}: every linked file is in the build ${missing.join(', ')}`);
}

check(existsSync(join(dist, 'studio', 'index.html')), 'the Studio is included');
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
check(directive('script-src').join(' ') === "'self'" && directive('default-src').join(' ') === "'self'", '_headers: scripts only from this site, no inline scripts');
check(directive('frame-ancestors').join(' ') === "'none'", '_headers: the site cannot be framed');
for (const h of ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'Referrer-Policy: strict-origin-when-cross-origin', 'Permissions-Policy', 'X-Frame-Options: DENY', 'Cross-Origin-Opener-Policy: same-origin', '! Access-Control-Allow-Origin']) {
  check(headers.includes(h), `_headers: ${h}`);
}
// No inline <script> or <style> blocks (the policy would block them).
for (const page of ['index.html', '404.html', 'studio/index.html']) {
  const html = readFileSync(join(dist, page), 'utf8');
  check(!/<script(?![^>]*\ssrc=)[^>]*>/i.test(html) && !/<style[\s>]/i.test(html) && !/\son[a-z]+="/i.test(html), `${page}: no inline scripts, style blocks or event handlers`);
}
// Nothing is loaded from Google Fonts or other font services.
for (const page of ['index.html', '404.html', 'studio/index.html', 'sw.js', 'css/app.css', 'studio/studio.css']) {
  check(!/fonts\.(googleapis|gstatic)\.com/.test(readFileSync(join(dist, page), 'utf8')), `${page}: no Google Fonts`);
}
for (const hidden of ['docs', 'supabase', 'tests', 'scripts', 'package.json', 'node_modules', '.github', 'legal']) {
  check(!existsSync(join(dist, hidden)), `${hidden} is not published`);
}

console.log(failures ? `\n${failures} build check(s) failed` : '\nAll build checks passed');
process.exit(failures ? 1 : 0);
