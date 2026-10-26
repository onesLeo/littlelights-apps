// Clean addresses test: the built site (dist/, served the way Cloudflare Pages serves it) answers each
// address with its own page, old #links move to the new paths, and the head follows the screen.
// Run: npm test   (builds dist/ first, from js/content.js only)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { serve } from '../scripts/serve.mjs';

execFileSync(process.execPath, [new URL('../scripts/build-pages.mjs', import.meta.url).pathname], { stdio: 'inherit', env: { ...process.env, PRERENDER_STUDIO: '0' } });
const server = await serve(0, { root: 'dist', headers: true });
const base = `http://localhost:${server.address().port}`;
let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }

for (const [path, status] of [['/', 200], ['/watch', 200], ['/listen', 200], ['/read', 200], ['/play', 200], ['/read/brave', 200], ['/watch/the-whisper', 200], ['/today', 200],
  ['/nope', 404], ['/read/nope', 404], ['/watch/a/b', 404], ['/studio/', 200], ['/css/app.css', 200], ['/media/reels/the-whisper-poster.jpg', 200]]) {
  const res = await fetch(base + path, { redirect: 'manual' });
  check(res.status === status, `GET ${path} answers ${status} (${res.status})`);
}
const raw = await (await fetch(base + '/watch/the-whisper')).text();
check(/<title>The Whisper · Watch · Salt and Light<\/title>/.test(raw) && raw.includes('"@type":"VideoObject"'), 'without JavaScript, /watch/the-whisper already has its title and VideoObject data');

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Service Worker|Failed to load resource/.test(m.text())) errors.push(m.text()); });
const ready = () => page.waitForSelector('#app[data-ready]');
const state = () => page.evaluate(() => ({ path: location.pathname, hash: location.hash, view: document.querySelector('.p-view.on').dataset.view, title: document.title,
  canonical: document.querySelector('link[rel="canonical"]').href, desc: document.querySelector('meta[name="description"]').content, og: document.querySelector('meta[property="og:url"]').content }));

for (const [old, path, view] of [['/#watch', '/watch', 'watch'], ['/#listen', '/listen', 'listen'], ['/#read', '/read', 'read'], ['/#play', '/play', 'play'], ['/#today', '/', 'today'], ['/#read/brave', '/read/brave', 'read']]) {
  await page.goto(base + old); await ready();
  const s = await state();
  check(s.path === path && !s.hash && s.view === view, `old link ${old} moves to ${path}`);
}
await page.goto(base + '/'); await ready();
for (const tab of ['watch', 'listen', 'read', 'play', 'today']) {
  await page.click(`.p-tab[data-tab="${tab}"]`); await page.waitForTimeout(100);
  const s = await state(), want = tab === 'today' ? '/' : '/' + tab;
  check(s.path === want && s.view === tab && s.canonical === 'https://littlesaltandlight.com' + want && s.og === s.canonical, `menu ${tab}: address ${want}, canonical and og:url follow`);
}
const titles = new Set();
for (const tab of ['watch', 'listen', 'read', 'play', 'today']) { await page.click(`.p-tab[data-tab="${tab}"]`); await page.waitForTimeout(80); titles.add((await state()).title); }
check(titles.size === 5, 'each screen has its own title in the browser too');
await page.goBack(); await page.waitForTimeout(150);
check((await state()).view === 'play', 'the Back button returns to the previous screen');

await page.goto(base + '/read'); await ready();
await page.click('.p-card[href="/read/heart"]'); await page.waitForTimeout(200);
let s = await state();
check(s.path === '/read/heart' && s.title === 'God sees the heart · Salt and Light' && await page.$eval('#pArticle', (a) => a.classList.contains('on')), 'a devotion card opens /read/heart with its own title');
await page.click('#pArticle [data-close]'); await page.waitForTimeout(150);
check((await state()).path === '/read' && (await state()).title.startsWith('Read:'), 'closing the devotion goes back to /read');

await page.goto(base + '/watch/the-last-straw'); await ready(); await page.waitForTimeout(200);
check(!(await page.$eval('#pWatchPlayer', (p) => p.hidden)) && (await page.evaluate(() => window.LL_reel.state().story)) === (await page.evaluate(() => window.LL_CONTENT.reels.findIndex((r) => r.title === 'The Last Straw'))), '/watch/the-last-straw opens that video');
await page.click('#pWatchClose'); await page.waitForTimeout(150);
check((await state()).path === '/watch', 'closing the video goes back to /watch');
await page.click('.p-whero'); await page.waitForTimeout(200);
{
  // The featured item is the newest post, which may be a Studio series (live content), so accept either.
  const s = await state();
  check((/^\/watch\/[a-z0-9-]+$/.test(s.path) && s.title.endsWith(' · Watch · Salt and Light')) || (/^\/watch\/series\/[a-z0-9-]+$/.test(s.path) && s.title.endsWith(' · Bible story series · Salt and Light')), `opening the featured video gives it its address and title (${s.path})`);
}

await page.goto(base + '/verses'); await ready();
check((await state()).view === 'today' && (await state()).path === '/' && await page.$eval('#pSoon', (x) => x.classList.contains('on')), '/verses (coming soon) shows the message on Today');

await page.goto(base + '/read/brave'); await ready();
const share = await page.evaluate(() => { let got = null; navigator.share = (d) => { got = d; return Promise.resolve(); }; document.querySelector('[data-share-dev]').click(); return new Promise((r) => setTimeout(() => r(got), 100)); });
check(!!share && share.url === base + '/read/brave', `sharing a devotion shares its clean address (${share && share.url})`);

check(errors.length === 0, `no script errors ${errors.join(' | ')}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} SEO check(s) failed` : '\nAll SEO checks passed');
process.exit(failures ? 1 : 0);
