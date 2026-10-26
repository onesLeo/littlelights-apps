// Bedtime story page (/listen/<slug>): built with its own head and the full text in the HTML, listed in
// the sitemap, opened by the app, no tracking requests of its own, and readable in day and night mode.
// Run: npm test   (builds dist/ first, from js/content.js only)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';

execFileSync(process.execPath, [new URL('../scripts/build-pages.mjs', import.meta.url).pathname], { stdio: 'inherit', env: { ...process.env, PRERENDER_STUDIO: '0' } });
const server = await serve(0, { root: 'dist', headers: true });
const base = `http://localhost:${server.address().port}`;
const PATH = '/listen/jonah-and-the-whale-bedtime-story';
let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }

const res = await fetch(base + PATH);
check(res.status === 200, `GET ${PATH} answers 200 (${res.status})`);
const raw = await res.text();
check(raw.includes('<title>Jonah and the Whale | Bedtime Bible Story for Kids #1 · Salt and Light</title>'), 'own <title>');
check(raw.includes(`<link rel="canonical" href="https://littlesaltandlight.com${PATH}">`), 'own canonical');
check(raw.includes(`<meta property="og:url" content="https://littlesaltandlight.com${PATH}">`) && raw.includes('og:title" content="Jonah and the Whale'), 'own Open Graph tags');
check(raw.includes('"@type":"PodcastEpisode"') && raw.includes('"@type":"AudioObject"') && raw.includes('"isFamilyFriendly":true'), 'PodcastEpisode JSON-LD');
check(raw.includes('Then Jonah was swallowed by a great big fish!') && raw.includes('Dear Jesus, thank You that You always hear me.'), 'story text and prayer are in the HTML without JavaScript');
check(raw.includes('I called because of my <mark class="p-word">affliction</mark> to Yahweh. He answered me.') && raw.includes('Jonah 2:2 (WEB)'), 'verse is Jonah 2:2 (WEB) with Yahweh');
check(raw.includes('Affliction means big trouble, and Yahweh is God’s special name.'), '"affliction" and "Yahweh" explained on screen');
check(!/WEBBE|the LORD/.test(raw), 'no WEBBE / "the LORD" left on the page');
check(['Who trusted God?', 'How did God help?', 'How can we be like that tomorrow?'].every((q) => raw.includes('<li>' + q + '</li>')) && !raw.includes('PLACEHOLDER: question'), 'the 3 questions from the plan, no placeholders');
{
  const cover = 'https://littlesaltandlight.com/media/audio/jonah-and-the-whale-cover.jpg';
  check(raw.includes(`<meta property="og:image" content="${cover}">`) && raw.includes(`<meta name="twitter:image" content="${cover}">`) && raw.includes(`"image":"${cover}"`), 'share image is the Jonah cover (og, twitter, JSON-LD)');
  check(raw.includes('<meta property="og:image:width" content="1200">') && raw.includes('<meta property="og:image:height" content="630">') && (raw.match(/og:image:width/g) || []).length === 1, 'og:image size is 1200x630, stated once');
{
  // The stated size must be the file's real size (JPEG SOF marker).
  const buf = await readFile(new URL('../media/audio/jonah-and-the-whale-cover.jpg', import.meta.url));
  let i = 2, wh = null;
  while (i < buf.length) { const m = buf[i + 1], len = buf.readUInt16BE(i + 2); if (m >= 0xc0 && m <= 0xc3) { wh = [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)]; break; } i += 2 + len; }
  check(wh && wh[0] === 1200 && wh[1] === 630, `cover file is 1200x630 (${wh})`);
}
  check((await fetch(cover.replace('https://littlesaltandlight.com', base))).status === 200, 'cover file is in the build');
}
check(/<audio controls[^>]+src="\/media\/audio\//.test(raw), 'an <audio> player with a file');
check(raw.includes('href="/join"') && raw.includes('Next story'), 'Next story and Join testers cards');
check((raw.match(/<h1[\s>]/g) || []).length === 1, 'exactly one <h1>');
check(!/<script[^>]+src="https?:/.test(raw), 'no third-party scripts in the page (Cloudflare Web Analytics is added by Cloudflare)');
const sitemap = await readFile(new URL('../dist/sitemap.xml', import.meta.url), 'utf8');
check(new RegExp(`<loc>https://littlesaltandlight.com${PATH}</loc>\\s*<lastmod>\\d{4}-\\d{2}-\\d{2}</lastmod>`).test(sitemap), 'listed in sitemap.xml with lastmod');
check((await fetch(base + '/listen/nope')).status === 404, '/listen/nope is still a 404');
// W7: /listen lists the story under "Goodnight Little Light", as a link to its page, in the HTML.
const listenRaw = await (await fetch(base + '/listen')).text();
check(/<div class="p-gn" id="pGnWrap"><h2 class="p-sec" id="pGnTitle">Goodnight Little Light<\/h2>/.test(listenRaw) && listenRaw.includes(`<a class="p-row p-gnrow" href="${PATH}">`), '/listen HTML has the Goodnight Little Light section linking to the story');
check(listenRaw.indexOf('Goodnight Little Light') < listenRaw.indexOf('All episodes'), 'Goodnight Little Light comes before All episodes');
// The share image has one swap point: setting `image` changes og:image, twitter:image and JSON-LD.
{
  await import('../js/seo.js');
  const { renderPage } = await import('../lib/head.mjs');
  const S = globalThis.LL_SEO;
  const x = { slug: 'test-story', title: 'T', series: 'S', src: 'media/a.mp3', dur: 60, story: [], prayer: '', verse: { text: '', ref: '', version: 'WEB' }, image: 'media/audio/test-cover.jpg' };
  const html = renderPage('<!-- seo: test --><!-- /seo --><article class="p-over p-article p-epage" id="pEpisode"></article>', { tab: 'listen', kind: 'story', item: x, meta: S.meta('story', x) });
  const u = 'https://littlesaltandlight.com/media/audio/test-cover.jpg';
  check(html.includes(`og:image" content="${u}"`) && html.includes(`twitter:image" content="${u}"`) && html.includes(`"image":"${u}"`), 'setting a story\'s image updates og:image, twitter:image and JSON-LD');
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = { supabaseUrl: "https://example.invalid", supabaseAnonKey: "x" };' }));
const page = await context.newPage();
const errors = [], rpc = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => { if (/rpc\/|increment_post_stat/.test(r.url())) rpc.push(r.url()); });
await page.goto(base + PATH);
await page.waitForSelector('#app[data-ready]');
check(await page.$eval('#pEpisode', (e) => e.classList.contains('on') && !!e.querySelector('h1')), 'the app keeps the story page open');
check((await page.title()).startsWith('Jonah and the Whale'), 'title stays after the app starts');
await page.$eval('#pEpisode audio', (a) => a.play().catch(() => {}));
await page.waitForTimeout(100);
await page.waitForTimeout(400);
check(rpc.length === 0, 'playing the story audio sends no counting request');
// AA contrast of the key text, day and night.
const ratio = () => page.evaluate(() => {
  const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
  const bgOf = (el) => { while (el) { const b = getComputedStyle(el).backgroundColor; const al = /rgba/.test(b) ? +b.match(/[\d.]+/g)[3] : 1; if (b && b !== 'transparent' && al >= 0.5) return b; el = el.parentElement; } return 'rgb(255,255,255)'; };
  return ['#pEpisode .body > p', '#pEpisode .p-ep-note', '#pEpisode .pray', '#pEpisode .p-ep-word', '#pEpisode .p-ep-card', '#pEpisode .p-ep-card.join', '#pEpisode .hero h1', '#pEpisode .p-word'].map((sel) => {
    const el = document.querySelector(sel); const a = lum(getComputedStyle(el).color), b = lum(bgOf(el));
    return [sel, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)];
  });
});
for (const mode of ['day', 'night']) {
  if (mode === 'night') await page.evaluate(() => { const app = document.getElementById('app'); if (!app.classList.contains('night')) document.querySelector('[data-mode]').click(); });
  await page.waitForTimeout(100);
  for (const [sel, r] of await ratio()) check(r >= 4.5, `${mode}: ${sel} contrast ${r.toFixed(2)} ≥ 4.5`);
}
await page.click('#pEpisode [data-ep-back]');
await page.waitForTimeout(150);
check(new URL(page.url()).pathname === '/listen' && !(await page.$eval('#pEpisode', (e) => e.classList.contains('on'))), '← Listen goes back to /listen');
check(await page.$eval('#pGnWrap', (w) => !w.hidden && w.getBoundingClientRect().height > 0), 'Goodnight Little Light is visible on /listen');
await page.click('#pGn a.p-gnrow');
await page.waitForTimeout(150);
check(new URL(page.url()).pathname === PATH && await page.$eval('#pEpisode', (e) => e.classList.contains('on') && e.querySelector('h1').textContent === 'Jonah and the Whale'), 'clicking the Goodnight Little Light row opens the story page');
await page.goBack();
await page.waitForTimeout(150);
await page.goBack();
await page.waitForTimeout(150);
check(await page.$eval('#pEpisode', (e) => e.classList.contains('on')), 'Back button reopens the story');
check(errors.length === 0, `no page errors (${errors.join(' | ')})`);
await browser.close();
server.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nlisten story: all checks passed');
