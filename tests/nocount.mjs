// Cloudflare Web Analytics beacon (js/analytics.js): loaded on public pages, never on /studio, never on a
// device where "don't count me" is on (?nocount=1 → localStorage 'll.nocount'), back on with ?nocount=0.
// Also: every built page (prerendered, 404, the shell the /listen, /read, /watch functions use) loads
// js/analytics.js before anything else, the Studio doesn't, and the Studio CSP blocks the beacon.
// The beacon is faked; nothing is sent to Cloudflare. Run: npm test
import { chromium } from 'playwright';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { serve } from '../scripts/serve.mjs';

let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }
const root = new URL('..', import.meta.url).pathname;
const BEACON = /static\.cloudflareinsights\.com\/beacon\.min\.js/;

// ---- source and built files ----
const idx = readFileSync(join(root, 'index.html'), 'utf8');
check(idx.indexOf('src="/js/analytics.js"') > 0 && idx.indexOf('src="/js/analytics.js"') < idx.indexOf('src="/js/config.js"') && !BEACON.test(idx), 'index.html (also the shell of /listen, /read, /watch functions) loads js/analytics.js first, no hard-coded beacon');
check(readFileSync(join(root, '404.html'), 'utf8').includes('src="/js/analytics.js"'), '404.html loads js/analytics.js');
check(!/analytics\.js|cloudflareinsights/.test(readFileSync(join(root, 'studio/index.html'), 'utf8')), 'the Studio page never loads analytics');
const a = readFileSync(join(root, 'js/analytics.js'), 'utf8');
check(!/document\.cookie|fetch\(|sendBeacon|XMLHttpRequest/.test(a), 'js/analytics.js adds no other tracking (only inserts the Cloudflare beacon)');
const hdr = readFileSync(join(root, '_headers'), 'utf8');
check(/\/studio\/\*\n\s+Content-Security-Policy: script-src 'self'\n/.test(hdr), "_headers: the Studio's extra policy blocks the beacon script");
const dist = join(root, 'dist');
if (existsSync(join(dist, 'index.html'))) {
  const pages = [];
  const walk = (d) => readdirSync(d).forEach((n) => { const p = join(d, n); if (statSync(p).isDirectory()) { if (!['assets', 'media', 'fonts', 'icons', 'js', 'css'].includes(n)) walk(p); } else if (n.endsWith('.html')) pages.push(p); });
  walk(dist);
  const pub = pages.filter((p) => !p.includes('/studio/'));
  const bad = pub.filter((p) => !/src="\/(assets\/analytics\.[0-9a-f]+\.js|js\/analytics\.js)"/.test(readFileSync(p, 'utf8')));
  check(pub.length > 5 && !bad.length, `every built public page (${pub.length}, incl. /listen stories) loads the analytics loader${bad.length ? ': missing in ' + bad.slice(0, 3).join(', ') : ''}`);
  check(pages.filter((p) => p.includes('/studio/')).every((p) => !/analytics|cloudflareinsights/.test(readFileSync(p, 'utf8'))), 'built Studio pages never load analytics');
} else console.log('skip dist checks (run npm run build first)');

// ---- in the browser ----
{ // Not on other hosts (previews, local): no beacon at all.
  const s0 = await serve(0), b0 = await chromium.launch(), c0 = await b0.newContext({ serviceWorkers: 'block' }); let hit = 0;
  await c0.route(/cloudflareinsights/, (r) => { hit++; r.abort(); });
  const p0 = await c0.newPage(); await p0.goto(`http://localhost:${s0.address().port}/`); await p0.waitForTimeout(400);
  check(!hit && !(await p0.$('script[src*="cloudflareinsights"]')), 'other hosts (preview, local) never load the beacon');
  await b0.close(); s0.close();
}
const server = await serve(0);
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
const ctx = await browser.newContext({ serviceWorkers: 'block' });
let beaconLoads = 0;
await ctx.addInitScript(() => { window.LL_BEACON_ANY_HOST = true; });
await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
await ctx.route(BEACON, (r) => { beaconLoads++; r.fulfill({ contentType: 'text/javascript', body: '' }); });
const page = await ctx.newPage();
const visit = async (path) => { const before = beaconLoads; await page.goto(base + path); await page.waitForTimeout(400); return { tag: await page.$('script[src*="cloudflareinsights"]') !== null, loaded: beaconLoads > before }; };

let r = await visit('/');
check(r.tag && r.loaded, 'beacon present on / by default');
const tok = await page.$eval('script[src*="cloudflareinsights"]', (s) => JSON.parse(s.dataset.cfBeacon));
check(/^[0-9a-f]{32}$/.test(tok.token) && tok.spa === true, 'beacon has the site token and SPA mode');
r = await visit('/listen/jonah-and-the-whale-bedtime-story');
check(r.tag && r.loaded, 'beacon present on a story page by default');
r = await visit('/studio/');
check(!r.tag && !r.loaded, 'beacon absent on /studio');
r = await visit('/?nocount=1');
check(!r.tag && !r.loaded, 'beacon absent right after ?nocount=1');
check(await page.evaluate(() => localStorage.getItem('ll.nocount')) === '1' && !page.url().includes('nocount'), '?nocount=1 sets the flag and is removed from the address');
check(/won’t be counted/.test(await page.textContent('.ll-nocount-note')), 'a small note confirms it');
for (const p of ['/', '/listen', '/listen/jonah-and-the-whale-bedtime-story', '/no-such-page']) { r = await visit(p); check(!r.tag && !r.loaded, `flag set: beacon absent on ${p}`); }
r = await visit('/?nocount=0');
check(r.tag && r.loaded && await page.evaluate(() => localStorage.getItem('ll.nocount')) === null, '?nocount=0 clears the flag and the beacon is back');
check(/counted in visitor numbers again/.test(await page.textContent('.ll-nocount-note')), 'a note confirms it is off');

// Studio shows the state and can switch it.
await page.goto(base + '/studio/');
await page.fill('#email', 'owner@example.org'); await page.click('#signinForm button[type=submit]'); await page.waitForSelector('.shell');
await page.click('.side [data-view="guide"]'); await page.waitForSelector('#nocountBox');
check((await page.textContent('#nocountBox')).includes('is counted') && (await page.textContent('#g-nocount ~ ol, .gpart:has(#g-nocount)')).includes('littlesaltandlight.com/?nocount=1'), 'Studio guide shows the link and “counted”');
await page.click('#nocountBox [data-nocount="1"]');
check((await page.textContent('#nocountBox')).includes('not counted') && await page.evaluate(() => localStorage.getItem('ll.nocount')) === '1', 'Studio switch turns it on and shows “not counted”');
await page.screenshot({ path: 'test-results/studio-nocount.png', fullPage: false });
r = await visit('/');
check(!r.tag && !r.loaded, 'after the Studio switch: beacon absent on /');

await browser.close(); server.close();
if (failures) { console.log(`${failures} failed`); process.exit(1); }
console.log('All no-count checks passed');
