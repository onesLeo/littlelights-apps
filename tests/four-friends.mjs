// Bedtime #4 "Four Friends on the Roof" (A20): the draft seed in supabase/seed/20261121_four_friends_story.sql
// points only at files on the site, its timings pass the Studio validator and line up with the story text,
// sw.js precaches the timings, the post stays hidden until Mon 23 Nov 2026 00:00 SGT/WITA, and once due the
// page shows the audio, read-along, verse, prayer, questions, cover (og:image, JSON-LD) and both printables.
// The database is never touched: the post is read from the seed file and Supabase answers are faked.
// Run: npm test   (builds dist/ first)
import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { siteContent, pageList, sitemapXml } from '../scripts/prerender.mjs';
import { postPage } from '../lib/edge.mjs';
import { serve } from '../scripts/serve.mjs';

let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }
const root = new URL('..', import.meta.url);
const SLUG = 'four-friends-on-the-roof-bedtime-story';
const AT = '2026-11-22T16:00:00.000Z'; // Mon 23 Nov 2026 00:00 SGT / WITA (UTC+8)

// ---- the seed file ----
const sql = await readFile(new URL('supabase/seed/20261121_four_friends_story.sql', root), 'utf8');
const fields = JSON.parse(/\$json\$([\s\S]*?)\$json\$/.exec(sql)[1]);
const mediaUrl = /'(https:\/\/littlesaltandlight\.com\/media\/audio\/[^']+\.mp3)'/.exec(sql)[1];
check(/select 'story', 'scheduled', '2026-11-23T00:00:00\+08:00', 'Four Friends on the Roof', 'four-friends-on-the-roof-bedtime-story', false/.test(sql), 'seed: one scheduled story, 23 Nov 00:00 +08:00, the agreed slug');
check(new Date('2026-11-23T00:00:00+08:00').toISOString() === AT, 'seed: publish time is 2026-11-22T16:00Z, like posts 36-39');
check(/^insert into public\.posts/m.test(sql) && !/\b(update|delete|drop|alter|truncate)\b/i.test(sql.replace(/^--.*$/gm, '').replace(/\$json\$[\s\S]*?\$json\$/, '')) && /where not exists/.test(sql), 'seed: insert only, skipped if the slug exists');
const files = [mediaUrl.replace('https://littlesaltandlight.com/', ''), fields.timings, fields.image, ...fields.printables.map((p) => p.file), ...fields.printables.flatMap((p) => ['jpg', 'webp'].map((e) => p.file.replace(/pdf$/, e)))];
for (const f of files) { let ok = false; try { ok = (await stat(new URL(f, root))).size > 0; } catch {} check(ok, `file on the site: ${f}`); }
for (const f of [mediaUrl.replace('https://littlesaltandlight.com/', ''), ...fields.printables.map((p) => p.file)]) {
  const h = createHash('sha256').update(await readFile(new URL(f, root))).digest('hex').slice(0, 8);
  check(f.includes('.' + h + '.'), `content hash in the name matches (${f.split('/').pop()})`);
}
check(fields.printables.length === 2 && fields.ref === 'Mark 2:11' && fields.translation === 'WEB' && fields.episode === 4, 'two printables, Mark 2:11 (WEB), episode 4');
check((await readFile(new URL('sw.js', root), 'utf8')).includes("'media/audio/four-friends-on-the-roof-timings.json'"), 'sw.js precaches the timings');

// ---- store: post -> story, timings ----
const RealDate = Date;
async function storeAt(iso) {
  const now = new RealDate(iso).getTime();
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const c = { console, URL, Date: FakeDate, JSON, Math, Promise, document: { currentScript: null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  c.window = c; vm.createContext(c);
  for (const f of ['js/content.js', 'js/store.js', 'js/seo.js']) vm.runInContext(await readFile(new URL(f, root), 'utf8'), c);
  return { S: c.LLStore, C: JSON.parse(JSON.stringify(c.LL_CONTENT)), SEO: c.LL_SEO };
}
const post = { id: 99, type: 'story', status: 'scheduled', publish_at: AT, title: 'Four Friends on the Roof', slug: SLUG, show_on_today: false, media_url: mediaUrl, fields };
const T = JSON.parse(await readFile(new URL(fields.timings, root), 'utf8'));
{
  const { S, SEO } = await storeAt('2026-11-23T08:00:00+08:00');
  check(S.validateTimings(T, fields.seconds).ok, `timings pass LLStore.validateTimings (${T.length} sentences)`);
  const x = S.storyFromPost(post);
  const parts = [...x.story.map((t, i) => ({ key: 'story-' + i, text: t })), { key: 'prayer', text: x.prayer }, { key: 'goodnight', text: x.goodnight }];
  const m = SEO.raMatch(parts, T);
  check(!!m && m.count >= T.length - 1, `timings match the story text (${m && m.count} of ${T.length} sentences shown)`);
  check(x.story.length === 6 && x.questions.length === 3 && x.dur === 252.5, 'six paragraphs, three questions, 252.5 s');
}

// ---- hidden until 23 Nov 00:00 (SGT/WITA) ----
for (const [iso, due] of [['2026-11-21T12:00:00+08:00', false], ['2026-11-22T23:59:00+08:00', false], ['2026-11-23T00:00:30+08:00', true]]) {
  const { S, C } = await storeAt(iso);
  const listed = S.mergeStories(C.bedtimeStories, [post]).some((b) => b.slug === SLUG);
  const pg = pageList(siteContent({ C, S }, { posts: [post], settings: {} }));
  const built = pg.some((p) => p.meta.path === '/listen/' + SLUG), inMap = sitemapXml(pg).includes('/listen/' + SLUG);
  check(listed === due && built === due && inMap === due, `at ${iso}: ${due ? 'listed, page built, in sitemap' : 'not listed, no page, not in sitemap'}`);
}
check(!(await readFile(new URL('js/content.js', root), 'utf8')).includes(SLUG), 'not a built-in story in js/content.js');

// ---- direct visit after 00:00, before the 05:00 rebuild (functions/listen/[slug].js) ----
{
  const shell = await readFile(new URL('index.html', root), 'utf8');
  const fake = async (url) => { const u = new URL(url); const ok = u.searchParams.get('slug') === 'eq.' + SLUG && u.searchParams.get('type') === 'eq.story'; return new Response(JSON.stringify(ok ? [post] : []), { headers: { 'content-type': 'application/json' } }); };
  const res = await postPage({ request: new Request('https://littlesaltandlight.com/listen/' + SLUG), params: { slug: SLUG }, next: async () => new Response('nf', { status: 404 }),
    env: { ASSETS: { fetch: async () => new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } }) } } }, 'story', fake);
  const html = await res.text();
  check(res.status === 200 && html.includes('<title>Four Friends on the Roof | Bedtime Bible Story for Kids #4</title>') || html.includes('Four Friends on the Roof | Bedtime Bible Story for Kids #4'), 'edge page: search title');
  check(html.includes('<meta property="og:image" content="https://littlesaltandlight.com/media/audio/four-friends-on-the-roof-cover.jpg">'), 'edge page: og:image is the cover');
  const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((mm) => mm[1]).join('\n');
  check(/"@type":"PodcastEpisode"/.test(ld) && ld.includes('"episodeNumber":4') && ld.includes('four-friends-on-the-roof-cover.jpg') && ld.includes(mediaUrl), 'edge page: PodcastEpisode JSON-LD with episode 4, cover and audio');
  check(html.includes('/dl/media/printables/four-friends-on-the-roof-colouring-page.440701df.pdf') && html.includes('/dl/media/printables/four-friends-on-the-roof-verse-and-question-cards.92566f3d.pdf'), 'edge page: both printables link through /dl/');
}

// ---- in the browser (local build, clock after 00:00, Supabase faked) ----
execFileSync(process.execPath, ['scripts/build-pages.mjs'], { stdio: 'ignore', env: { ...process.env, PRERENDER_STUDIO: '0' } });
const server = await serve(0, { root: 'dist', headers: true });
const base = `http://localhost:${server.address().port}`;
const { SEO } = await storeAt('2026-11-23T08:00:00+08:00');
const browser = await chromium.launch();
try {
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference', acceptDownloads: true });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-11-23T00:00:30+08:00'));
    await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.LL_CONFIG = { supabaseUrl: 'https://fake-project.supabase.co', supabaseAnonKey: 'sb_publishable_test' };" }));
    await context.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    await page.route('**/rest/v1/posts?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([post]) }));
    await page.route('**/rest/v1/site_settings?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    // The post's audio address is on the live site (same origin there, media-src 'self'); here the same file
    // is served by the local build, so the post is given the local address of this branch's copy.
    const localPost = { ...post, media_url: base + new URL(mediaUrl).pathname };
    await page.unroute('**/rest/v1/posts?**');
    await page.route('**/rest/v1/posts?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([localPost]) }));
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/listen'); await page.waitForSelector('#pGn .p-gnrow');
    check(await page.$(`#pGn a[href="/listen/${SLUG}"]`) !== null, `${reduced ? '[reduced] ' : ''}/listen: listed in Goodnight Little Light`);
    await page.click(`#pGn a[href="/listen/${SLUG}"]`);
    await page.waitForSelector('#pEpisode.on .p-ep-qs');
    await page.waitForSelector('.p-sen', { timeout: 8000 }).catch(() => {});
    const txt = await page.textContent('#pEpisode');
    for (const s of [fields.verse, 'Mark 2:11 (WEB)', fields.prayer, fields.goodnight, ...fields.questions.split('\n'), ...fields.story.split('\n\n').map((p) => p.slice(0, 60))]) check(txt.includes(s), `${reduced ? '[reduced] ' : ''}shows: ${s.slice(0, 50)}`);
    const shownStory = await page.$$eval('#pEpisode [data-ra^="story-"]', (e) => e.map((n) => n.textContent).join(' '));
    check(shownStory === fields.story.split('\n\n').join(' '), `${reduced ? '[reduced] ' : ''}story text on the page is word for word the seed's (handoff) text`);
    if (reduced) { check(await page.$eval('.p-sen', (e) => getComputedStyle(e).transitionDuration) === '0s', '[reduced] read-along has no fade'); await context.close(); continue; }
    const dur = await page.$eval('#pEpisode audio', (a) => new Promise((ok) => { a.addEventListener('loadedmetadata', () => ok(a.duration), { once: true }); a.addEventListener('error', () => ok(-1), { once: true }); a.preload = 'auto'; a.load(); setTimeout(() => ok(a.readyState ? a.duration : -2), 15000); }));
    check(Math.abs(dur - 252.5) < 0.6, `audio loads, duration ${dur.toFixed(2)} s (4:12)`);
    await page.$eval('#pEpisode audio', (a, t) => { a.currentTime = t; }, 251.5);
    const ended = await page.$eval('#pEpisode audio', (a) => new Promise((ok) => { a.muted = true; a.addEventListener('ended', () => ok(a.currentTime), { once: true }); a.play().catch(() => ok(-1)); setTimeout(() => ok(-2), 8000); }));
    check(ended > 252, `audio plays through to the end (${ended.toFixed(2)} s)`);
    const s5 = T[5], w = s5.words[1];
    await page.$eval('#pEpisode audio', (a, t) => { a.pause(); a.currentTime = t; }, w.start + 0.01);
    await page.waitForFunction(() => document.querySelector('.p-sen.on'));
    const on = await page.$eval('.p-sen.on', (e) => ({ text: e.textContent, word: e.querySelector('.p-w.on') && e.querySelector('.p-w.on').textContent }));
    check(SEO.raNorm(on.text) === SEO.raNorm(s5.text) && on.word === w.text, `read-along highlights the sentence and word being read ("${on.word}")`);
    const sens = await page.$$('#pEpisode .p-sen');
    await sens[40].click();
    const t40 = await page.$eval('#pEpisode audio', (a) => a.currentTime);
    check(Math.abs(t40 - T[40].start) < 0.3, `tapping sentence 41 jumps the audio to ${T[40].start.toFixed(2)} s (${t40.toFixed(2)})`);
    await page.$eval('#pEpisode audio', (a) => a.pause());
    await page.click('.p-ra-toggle');
    check(await page.$$eval('#pEpisode .p-sen', (e) => e.length) === 0, 'read-along toggle off: plain text');
    await page.click('.p-ra-toggle');
    check(await page.$$eval('#pEpisode .p-sen', (e) => e.length) === sens.length, 'read-along toggle on again');
    const links = await page.$$eval('#pEpisode .p-print a[href^="/dl/"]', (e) => e.map((a) => a.getAttribute('href')));
    check(links.length === 2, `printables: two download links (${links.join(', ')})`);
    for (const l of links) { const r = await page.request.get(base + l.replace('/dl/', '/')); check(r.ok() && (r.headers()['content-type'] || '').includes('pdf') || (await r.body()).subarray(0, 5).toString() === '%PDF-', `printable file is a PDF: ${l}`); }
    const thumbs = await page.$$eval('#pEpisode .p-print img', (e) => e.map((i) => i.naturalWidth));
    check(thumbs.length === 2 && thumbs.every((n) => n > 0), 'printables: page pictures load');
    const cover = await page.request.get(base + '/media/audio/four-friends-on-the-roof-cover.jpg');
    check(cover.ok() && (await cover.body()).length === 198295, 'cover image is served (1200x630, 198 KB)');
    check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
    await context.close();
  }
} finally { await browser.close(); server.close(); }

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll Four Friends checks passed');
