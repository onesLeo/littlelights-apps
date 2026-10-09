// Security headers test: serves the site with the rules in _headers (like Cloudflare Pages), then
// walks through the app and the Studio and fails on any Content-Security-Policy violation or any
// request to another site. The database is faked (at the real address, so the policy is tested as
// it is live), so the real database is never used.
// Run: npm test
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0, { headers: true });
const base = `http://localhost:${server.address().port}/`;
const supabaseUrl = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8').match(/supabaseUrl:\s*'([^']*)'/)[1];
const browser = await chromium.launch();
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

// ---------- the headers themselves ----------
const home = await fetch(base);
const csp = home.headers.get('content-security-policy') || '';
check(csp.includes("default-src 'self'") && csp.includes("frame-ancestors 'none'"), 'headers: the page has a Content-Security-Policy');
check(home.headers.get('x-frame-options') === 'DENY' && home.headers.get('x-content-type-options') === 'nosniff', 'headers: X-Frame-Options and nosniff');
check(home.headers.get('referrer-policy') === 'strict-origin-when-cross-origin' && /max-age=\d+/.test(home.headers.get('strict-transport-security') || ''), 'headers: Referrer-Policy and HSTS');
check(/camera=\(\)/.test(home.headers.get('permissions-policy') || '') && home.headers.get('cross-origin-opener-policy') === 'same-origin', 'headers: Permissions-Policy and COOP');
check(!home.headers.get('access-control-allow-origin'), 'headers: no Access-Control-Allow-Origin');
check(((await fetch(base + 'studio/')).headers.get('x-robots-tag') || '').includes('noindex'), 'headers: the Studio asks search engines to stay away');
const missing = await fetch(base + 'some/old/page');
check(missing.status === 404 && (await missing.text()).includes('Page not found'), 'unknown address: 404 with the friendly page');

// ---------- the app and the Studio under the policy ----------
const post = { id: 1, type: 'verse', status: 'published', publish_at: '2026-01-01T00:00:00Z', title: 'Psalm 4:8', slug: 'psalm-4-8',
  show_on_today: true, media_url: null, fields: { verse: 'In peace I will both lay myself down and sleep.', ref: 'Psalm 4:8', translation: 'WEB', topics: ['Trust'] } };
const violations = [], offsite = [], errors = [];
async function newContext(viewport, { local = false } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: local ? 'block' : 'allow' });
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => { (window.__csp = window.__csp || []).push(`${e.violatedDirective} ${e.blockedURI}`); });
  });
  if (local) await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  await context.route(supabaseUrl + '/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/auth/v1/otp') return r.fulfill({ contentType: 'application/json', body: '{}' });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(url.pathname.endsWith('/posts') ? [post] : []) });
  });
  context.on('request', (req) => {
    const u = new URL(req.url());
    if (!['http:', 'https:'].includes(u.protocol)) return;
    if (u.origin !== new URL(base).origin && u.origin !== supabaseUrl) offsite.push(req.url());
  });
  context.on('console', (m) => { if (/Content.Security.Policy|Refused to/i.test(m.text())) violations.push(m.text()); });
  context.on('weberror', (e) => errors.push(e.error().message));
  return context;
}
async function collect(page, where) {
  const found = await page.evaluate(() => window.__csp || []).catch(() => []);
  found.forEach((v) => violations.push(`${where}: ${v}`));
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1366, height: 820 }]) {
  const context = await newContext(viewport);
  const page = await context.newPage();
  await page.goto(base);
  await page.waitForSelector('#app[data-ready]');
  check((await page.$eval('#pFeed', (f) => f.textContent)).includes('In peace I will'), `${viewport.width}px: posts load from the database under the policy`);
  for (const tab of ['verses', 'read', 'play', 'listen', 'watch', 'today']) {
    await page.goto(base + '#' + tab);
    await page.waitForTimeout(150);
  }
  await page.goto(base + '#verses');
  await page.click('#pGrid .p-tile');
  await page.click('#pStory [data-save-verse]');
  await page.keyboard.press('Escape');
  await page.goto(base + '#read/brave');
  await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('[data-mode]').click());
  const sw = await page.evaluate(() => Promise.race([navigator.serviceWorker.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 5000))]));
  check(sw, `${viewport.width}px: the offline service worker installs under the policy`);
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  await collect(page, `app ${viewport.width}px`);
  const fonts = await page.evaluate(() => document.fonts.ready.then(() => [...document.fonts].filter((f) => f.status === 'loaded').length));
  check(fonts > 0, `${viewport.width}px: self-hosted fonts load`);

  // Studio sign-in page (database mode) and the 404 page
  await page.goto(base + 'studio/');
  await page.waitForSelector('#signinForm');
  await page.fill('#email', 'me@example.org');
  await page.click('#signinForm button[type=submit]');
  await page.waitForTimeout(500);
  await collect(page, 'studio sign-in');
  await page.goto(base + 'no/such/page');
  await page.waitForSelector('.nf');
  check(await page.$eval('.nf a', (a) => a.getAttribute('href')) === '/', '404 page links home');
  await collect(page, '404 page');
  await context.close();
}

// Studio in local mode: writing, previewing and the team page render everything under the policy.
{
  const context = await newContext({ width: 1280, height: 900 }, { local: true });
  const page = await context.newPage();
  await page.goto(base + 'studio/');
  await page.fill('#email', 'owner@example.org');
  await page.click('#signinForm button[type=submit]');
  await page.waitForSelector('.side');
  for (const view of ['new', 'media', 'team', 'posts']) {
    await page.click(`.side [data-view="${view}"]`);
    await page.waitForTimeout(150);
  }
  await collect(page, 'studio');
  await context.close();
}

check(violations.length === 0, `no Content-Security-Policy violations ${violations.join(' | ')}`);
check(offsite.length === 0, `no requests to other sites ${offsite.join(' | ')}`);
check(errors.length === 0, `no script errors ${errors.join(' | ')}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} header check(s) failed` : '\nAll header checks passed');
process.exit(failures ? 1 : 0);
