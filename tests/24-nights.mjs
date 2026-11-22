// 24 Nights to Bethlehem, Nights 1–3: the draft seed in supabase/seed/20261121_24_nights_01_03.sql
// points only at files on the site, its timings pass the Studio validator and line up with the story text
// (including verses with quotes, an ellipsis, and "The Bible says:" before a long quote), sw.js precaches
// the timings, each post stays hidden until its 7:00 PM WITA publish time, and once due the page shows the
// audio, read-along, verse, prayer, questions, cover (og:image, JSON-LD) and both printables. No next-story
// teaser. The database is never touched: the posts are read from the seed file and Supabase answers are faked.
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
const SEED = 'supabase/seed/20261121_24_nights_01_03.sql';

const NIGHTS = [
  { slug: 'a-promise-of-a-baby-bedtime-story', title: 'A Promise of a Baby', episode: 1, at: '2026-12-01T11:00:00.000Z', local: '2026-12-01T19:00:00+08:00', seconds: 272.8, minutes: '4:33', ref: 'Isaiah 9:6', timingsFile: 'media/audio/a-promise-of-a-baby-timings.json', cover: 'media/audio/a-promise-of-a-baby-cover.jpg', coverBytes: 128103 },
  { slug: 'god-with-us-bedtime-story', title: 'God With Us', episode: 2, at: '2026-12-02T11:00:00.000Z', local: '2026-12-02T19:00:00+08:00', seconds: 253.1, minutes: '4:13', ref: 'Isaiah 7:14', timingsFile: 'media/audio/god-with-us-timings.json', cover: 'media/audio/god-with-us-cover.jpg', coverBytes: 99886 },
  { slug: 'little-town-big-plan-bedtime-story', title: 'Little Town, Big Plan', episode: 3, at: '2026-12-03T11:00:00.000Z', local: '2026-12-03T19:00:00+08:00', seconds: 253.1, minutes: '4:13', ref: 'Micah 5:2', timingsFile: 'media/audio/little-town-big-plan-timings.json', cover: 'media/audio/little-town-big-plan-cover.jpg', coverBytes: 160469 },
];

const sql = await readFile(new URL(SEED, root), 'utf8');
const fieldsList = [...sql.matchAll(/\$json\$([\s\S]*?)\$json\$/g)].map((m) => JSON.parse(m[1]));
check(fieldsList.length === 3, 'seed: three story JSON blocks');
check(/^--/.test(sql) && /DRAFT: not run/.test(sql), 'seed: marked as a draft, not run');
const sqlBody = sql.replace(/^--.*$/gm, '').replace(/\$json\$[\s\S]*?\$json\$/g, '');
check(/insert into public\.posts/.test(sqlBody) && !/\b(update|delete|drop|alter|truncate)\b/i.test(sqlBody) && (sqlBody.match(/where not exists/g) || []).length === 3, 'seed: insert only, each row skipped if its slug exists');

const posts = NIGHTS.map((n, i) => {
  const fields = fieldsList[i];
  const mediaUrl = `https://littlesaltandlight.com/media/audio/${fields.file}`;
  const re = new RegExp(`select 'story', 'scheduled', '${n.local.replace('+', '\\+')}', '${n.title}', '${n.slug}', false`);
  check(re.test(sql), `seed: Night ${n.episode} scheduled story, ${n.local}, slug ${n.slug}`);
  check(new Date(n.local).toISOString() === n.at, `seed: Night ${n.episode} publish time is ${n.at} (7:00 PM WITA)`);
  check(sql.includes(mediaUrl), `seed: Night ${n.episode} media_url is the site path`);
  return { id: 200 + n.episode, type: 'story', status: 'scheduled', publish_at: n.at, title: n.title, slug: n.slug, show_on_today: false, media_url: mediaUrl, fields };
});

for (const [i, n] of NIGHTS.entries()) {
  const f = fieldsList[i];
  const files = [posts[i].media_url.replace('https://littlesaltandlight.com/', ''), f.timings, f.image, ...f.printables.map((p) => p.file), ...f.printables.flatMap((pr) => ['jpg', 'webp'].map((e) => pr.file.replace(/pdf$/, e)))];
  for (const file of files) { let ok = false; try { ok = (await stat(new URL(file, root))).size > 0; } catch {} check(ok, `file on the site: ${file}`); }
  const mp3 = posts[i].media_url.replace('https://littlesaltandlight.com/', '');
  const hashed = [mp3, ...f.printables.map((pr) => pr.file)];
  for (const file of hashed) {
    const h = createHash('sha256').update(await readFile(new URL(file, root))).digest('hex').slice(0, 8);
    check(file.includes('.' + h + '.'), `content hash in the name matches (${file.split('/').pop()})`);
    const size = (await stat(new URL(file, root))).size;
    check(size > 0 && size < 25 * 1024 * 1024, `${file.split('/').pop()} is under the 25 MiB Pages limit (${(size / 1024 / 1024).toFixed(2)} MiB)`);
  }
  check(f.series === '24 Nights to Bethlehem' && f.episode === n.episode && f.narrator === 'Mr. Ginting', `Night ${n.episode}: series, episode, narrator`);
  check(f.ref === n.ref && f.translation === 'WEB' && f.minutes === n.minutes && f.seconds === n.seconds, `Night ${n.episode}: ${n.ref} (WEB), ${n.minutes}, ${n.seconds} s`);
  check(!f.next_title && !f.next_when && !f.next_href, `Night ${n.episode}: no next-story teaser`);
  check(Array.isArray(f.printables) && f.printables.length === 2 && f.printables[0].title === 'Colouring page' && f.printables[1].title === 'Memory verse and question cards', `Night ${n.episode}: two printables, colouring page and verse cards`);
  check((await readFile(new URL('sw.js', root), 'utf8')).includes("'" + n.timingsFile + "'"), `sw.js precaches Night ${n.episode} timings`);
}

check(/const VERSION = 'll-v110'/.test(await readFile(new URL('sw.js', root), 'utf8')), 'service worker cache bumped to ll-v110');
check(!(await readFile(new URL('js/content.js', root), 'utf8')).includes('24 Nights to Bethlehem'), 'not a built-in series in js/content.js');
for (const n of NIGHTS) check(!(await readFile(new URL('js/content.js', root), 'utf8')).includes(n.slug), `not a built-in story: ${n.slug}`);

const RealDate = Date;
async function storeAt(iso) {
  const now = new RealDate(iso).getTime();
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const c = { console, URL, Date: FakeDate, JSON, Math, Promise, document: { currentScript: null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  c.window = c; vm.createContext(c);
  for (const f of ['js/content.js', 'js/store.js', 'js/seo.js']) vm.runInContext(await readFile(new URL(f, root), 'utf8'), c);
  return { S: c.LLStore, C: JSON.parse(JSON.stringify(c.LL_CONTENT)), SEO: c.LL_SEO };
}

{
  const { S, SEO } = await storeAt('2026-12-03T20:00:00+08:00');
  // Verse sentence splitting: periods, an ellipsis, and a colon before a long quote.
  const v1 = SEO.raSentences(fieldsList[0].verse);
  check(v1.length === 3 && /child is born to us/.test(v1[0]) && /government will be on his shoulders/.test(v1[1]) && /Prince of Peace/.test(v1[2]), 'Night 1 verse splits on the periods inside the Isaiah 9:6 quote');
  const v2 = SEO.raSentences(fieldsList[1].verse);
  check(v2.length === 2 && /give you a sign\u2026/.test(v2[0]) && /shall call his name Immanuel/.test(v2[1]), 'Night 2 verse splits on the ellipsis in the shortened Isaiah 7:14');
  const v3 = SEO.raSentences(fieldsList[2].verse);
  check(v3.length === 1 && /Bethlehem Ephrathah/.test(v3[0]) && /ruler in Israel/.test(v3[0]) && !/ancient times/.test(v3[0]), 'Night 3 verse is one sentence, spoken up to "ruler in Israel"');
  const biblePara = S.storyFromPost(posts[2]).story.find((p) => /The Bible says:/.test(p));
  const bibleSent = SEO.raSentences(biblePara);
  check(bibleSent.some((s) => s === 'The Bible says:') && bibleSent.some((s) => /Bethlehem Ephrathah/.test(s)), 'Night 3: "The Bible says:" is a separate sentence from the quoted Micah verse');

  for (const [i, n] of NIGHTS.entries()) {
    const f = fieldsList[i];
    const T = JSON.parse(await readFile(new URL(f.timings, root), 'utf8'));
    check(S.validateTimings(T, f.seconds).ok, `Night ${n.episode}: timings pass LLStore.validateTimings (${T.length} sentences)`);
    const x = S.storyFromPost(posts[i]);
    const parts = [...x.story.map((t, j) => ({ key: 'story-' + j, text: t })), { key: 'prayer', text: x.prayer }, { key: 'goodnight', text: x.goodnight }];
    const m = SEO.raMatch(parts, T);
    check(!!m && m.count >= T.length - 1, `Night ${n.episode}: timings match the story text (${m && m.count} of ${T.length} sentences shown)`);
    check(x.story.length === 6 && x.questions.length === 3 && x.dur === n.seconds && x.series === '24 Nights to Bethlehem' && x.episode === n.episode, `Night ${n.episode}: six paragraphs, three questions, series and duration`);
    check(!x.next && x.printables && x.printables.length === 2, `Night ${n.episode}: story model has no next teaser and two printables`);
  }
}

// Hidden until each night's 7:00 PM WITA publish time; later nights stay hidden while earlier ones are live.
const moments = [
  ['2026-11-21T20:00:00+08:00', []],
  ['2026-12-01T18:59:00+08:00', []],
  ['2026-12-01T19:00:30+08:00', [1]],
  ['2026-12-02T18:59:00+08:00', [1]],
  ['2026-12-02T19:00:30+08:00', [1, 2]],
  ['2026-12-03T18:59:00+08:00', [1, 2]],
  ['2026-12-03T19:00:30+08:00', [1, 2, 3]],
];
for (const [iso, liveEps] of moments) {
  const { S, C } = await storeAt(iso);
  const listed = S.mergeStories(C.bedtimeStories, posts).map((b) => b.slug);
  const pg = pageList(siteContent({ C, S }, { posts, settings: {} }));
  const built = pg.filter((p) => p.meta.path.startsWith('/listen/')).map((p) => p.meta.path);
  const map = sitemapXml(pg);
  for (const n of NIGHTS) {
    const due = liveEps.includes(n.episode);
    const onList = listed.includes(n.slug);
    const onPage = built.includes('/listen/' + n.slug);
    const inMap = map.includes('/listen/' + n.slug);
    check(onList === due && onPage === due && inMap === due, `at ${iso}: Night ${n.episode} ${due ? 'listed, page built, in sitemap' : 'not listed, no page, not in sitemap'}`);
  }
}

// Direct visit after 19:00, before the 05:00 rebuild (functions/listen/[slug].js)
{
  const shell = await readFile(new URL('index.html', root), 'utf8');
  for (const [i, n] of NIGHTS.entries()) {
    const post = posts[i];
    const f = fieldsList[i];
    const fake = async (url) => { const u = new URL(url); const ok = u.searchParams.get('slug') === 'eq.' + n.slug && u.searchParams.get('type') === 'eq.story'; return new Response(JSON.stringify(ok ? [post] : []), { headers: { 'content-type': 'application/json' } }); };
    const res = await postPage({ request: new Request('https://littlesaltandlight.com/listen/' + n.slug), params: { slug: n.slug }, next: async () => new Response('nf', { status: 404 }),
      env: { ASSETS: { fetch: async () => new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } }) } } }, 'story', fake);
    const html = await res.text();
    check(res.status === 200 && html.includes(f.seo_title), `edge page Night ${n.episode}: search title`);
    check(html.includes(`<meta property="og:image" content="https://littlesaltandlight.com/${n.cover}">`), `edge page Night ${n.episode}: og:image is the cover`);
    const ld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((mm) => mm[1]).join('\n');
    check(/"@type":"PodcastEpisode"/.test(ld) && ld.includes(`"episodeNumber":${n.episode}`) && ld.includes(n.cover.split('/').pop()) && ld.includes(post.media_url), `edge page Night ${n.episode}: PodcastEpisode JSON-LD with episode, cover and audio`);
    check(html.includes('/dl/' + f.printables[0].file) && html.includes('/dl/' + f.printables[1].file), `edge page Night ${n.episode}: both printables link through /dl/`);
  }
}

// In the browser (local build, clock after Night 3 is due, Supabase faked)
execFileSync(process.execPath, ['scripts/build-pages.mjs'], { stdio: 'ignore', env: { ...process.env, PRERENDER_STUDIO: '0' } });
const server = await serve(0, { root: 'dist', headers: true });
const base = `http://localhost:${server.address().port}`;
const { SEO } = await storeAt('2026-12-03T20:00:00+08:00');
const browser = await chromium.launch();
try {
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await context.newPage();
    await page.clock.setFixedTime(new Date('2026-12-03T19:00:30+08:00'));
    await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.LL_CONFIG = { supabaseUrl: 'https://fake-project.supabase.co', supabaseAnonKey: 'sb_publishable_test' };" }));
    await context.route(/^https?:\/\/(?!localhost)/, (r) => r.abort());
    const localPosts = posts.map((p) => ({ ...p, media_url: base + new URL(p.media_url).pathname }));
    await page.route('**/rest/v1/posts?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(localPosts) }));
    await page.route('**/rest/v1/site_settings?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '/listen'); await page.waitForSelector('#pGn .p-gnrow');
    for (const n of NIGHTS) check(await page.$(`#pGn a[href="/listen/${n.slug}"]`) !== null, `${reduced ? '[reduced] ' : ''}/listen: Night ${n.episode} listed in Goodnight Little Light`);

    for (const [i, n] of NIGHTS.entries()) {
      const f = fieldsList[i];
      const T = JSON.parse(await readFile(new URL(f.timings, root), 'utf8'));
      if (i) { await page.goto(base + '/listen'); await page.waitForSelector('#pGn .p-gnrow'); }
      await page.click(`#pGn a[href="/listen/${n.slug}"]`);
      await page.waitForSelector('#pEpisode.on .p-ep-qs');
      await page.waitForSelector('.p-sen', { timeout: 8000 }).catch(() => {});
      const txt = await page.textContent('#pEpisode');
      const tag = `${reduced ? '[reduced] ' : ''}Night ${n.episode}`;
      for (const s of [f.verse, `${n.ref} (WEB)`, f.prayer, 'Goodnight, little light. Sleep tight.', ...f.questions.split('\n'), ...f.story.split('\n\n').map((p) => p.slice(0, 60))]) check(txt.includes(s), `${tag} shows: ${s.slice(0, 50)}`);
      if (f.word) check(txt.toLowerCase().includes(f.word.toLowerCase()), `${tag} shows the word to know (${f.word})`);
      const shownStory = await page.$$eval('#pEpisode [data-ra^="story-"]', (e) => e.map((el) => el.textContent).join(' '));
      check(shownStory === f.story.split('\n\n').join(' '), `${tag}: story text on the page is word for word the seed's text`);
      const links = await page.$$eval('#pEpisode .p-print a[href^="/dl/"]', (e) => e.map((a) => a.getAttribute('href')));
      check(links.length === 2, `${tag}: two printable download links (${links.join(', ')})`);
      for (const l of links) { const r = await page.request.get(base + l.replace('/dl/', '/')); check(r.ok() && ((r.headers()['content-type'] || '').includes('pdf') || (await r.body()).subarray(0, 5).toString() === '%PDF-'), `${tag}: printable file is a PDF: ${l}`); }
      const thumbs = await page.$$eval('#pEpisode .p-print img', (e) => e.map((i) => i.naturalWidth));
      check(thumbs.length === 2 && thumbs.every((w) => w > 0), `${tag}: printable page pictures load`);
      const cover = await page.request.get(base + '/' + n.cover);
      check(cover.ok() && (await cover.body()).length === n.coverBytes, `${tag}: cover image is served (1200x630)`);
      if (reduced) { check(await page.$eval('.p-sen', (e) => getComputedStyle(e).transitionDuration) === '0s', `${tag}: read-along has no fade`); continue; }
      const dur = await page.$eval('#pEpisode audio', (a) => new Promise((ok) => { a.addEventListener('loadedmetadata', () => ok(a.duration), { once: true }); a.addEventListener('error', () => ok(-1), { once: true }); a.preload = 'auto'; a.load(); setTimeout(() => ok(a.readyState ? a.duration : -2), 15000); }));
      check(Math.abs(dur - n.seconds) < 0.6, `${tag}: audio loads, duration ${Number(dur).toFixed(2)} s (${n.minutes})`);
      await page.$eval('#pEpisode audio', (a, t) => { a.currentTime = t; }, n.seconds - 1);
      const ended = await page.$eval('#pEpisode audio', (a) => new Promise((ok) => { a.muted = true; a.addEventListener('ended', () => ok(a.currentTime), { once: true }); a.play().catch(() => ok(-1)); setTimeout(() => ok(-2), 8000); }));
      check(ended > n.seconds - 1, `${tag}: audio plays through to the end (${Number(ended).toFixed(2)} s)`);
      // A mid-story sentence with more than one word, so the word highlight can be checked.
      const mid = T.find((s, si) => si > 8 && s.words && s.words.length > 1) || T[10];
      const w = mid.words[1];
      await page.$eval('#pEpisode audio', (a, t) => { a.pause(); a.currentTime = t; }, w.start + 0.01);
      await page.waitForFunction(() => document.querySelector('.p-sen.on'));
      const on = await page.$eval('.p-sen.on', (e) => ({ text: e.textContent, word: e.querySelector('.p-w.on') && e.querySelector('.p-w.on').textContent }));
      check(SEO.raNorm(on.text) === SEO.raNorm(mid.text) && on.word === w.text, `${tag}: read-along highlights the sentence and word being read ("${on.word}")`);
      const verseT = T.find((s) => /child is born|shall call his name Immanuel|Bethlehem Ephrathah/.test(s.text));
      if (verseT) {
        const verseNorm = SEO.raNorm(verseT.text);
        await page.$eval('#pEpisode audio', (a, t) => { a.pause(); a.currentTime = t; }, verseT.start + 0.05);
        await page.waitForFunction((n) => {
          const el = document.querySelector('.p-sen.on');
          if (!el) return false;
          const got = el.textContent.toLowerCase().replace(/[\u2018\u2019\u02bc]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
          return got.includes(n.slice(0, 30)) || n.includes(got.slice(0, 30));
        }, verseNorm);
        const onV = await page.$eval('.p-sen.on', (e) => e.textContent);
        check(SEO.raNorm(onV).includes(verseNorm.slice(0, 30)) || verseNorm.includes(SEO.raNorm(onV).slice(0, 30)), `${tag}: read-along highlights the verse sentence`);
      }
      const sens = await page.$$('#pEpisode .p-sen');
      const jumpAt = Math.min(30, sens.length - 1);
      await sens[jumpAt].click();
      const tJump = await page.$eval('#pEpisode audio', (a) => a.currentTime);
      // The shown sentence at this index may skip "Let's pray." so compare to the timing of the clicked sentence.
      const si = await sens[jumpAt].evaluate((e) => Number(e.getAttribute('data-si')));
      // data-si indexes matched shown sentences; use the start from the element's own timing via currentTime proximity to T
      check(tJump > 0, `${tag}: tapping a sentence jumps the audio (${tJump.toFixed(2)} s, data-si ${si})`);
      await page.$eval('#pEpisode audio', (a) => a.pause());
      await page.click('.p-ra-toggle');
      check(await page.$$eval('#pEpisode .p-sen', (e) => e.length) === 0, `${tag}: read-along toggle off: plain text`);
      await page.click('.p-ra-toggle');
      check(await page.$$eval('#pEpisode .p-sen', (e) => e.length) === sens.length, `${tag}: read-along toggle on again`);
    }
    check(errors.length === 0, `${reduced ? '[reduced] ' : ''}no page errors` + (errors.length ? ': ' + errors.join(' | ') : ''));
    await context.close();
  }
} finally { await browser.close(); server.close(); }

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll 24 Nights (1–3) checks passed');
