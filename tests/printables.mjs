// Free printables and "Tonight's bedtime story" (website tasks W11 and W12):
//  - js/seo.js: printables card on story pages (links through /dl/, nofollow, no other hosts), Tonight card,
//  - js/store.js and lib/head.mjs agree on fields.printables,
//  - lib/downloads.mjs (/dl/<path>): only our PDFs, 302 to the file, counted per file and country, never for
//    bots, HEAD or ?nc=1, and a failed count never blocks the download,
//  - /api/upload accepts PDFs; /api/insights shapes download counts,
//  - the built pages: Today shows tonight's story, the Jonah page lists its printables, the files exist.
// Run: npm test   (builds dist/ first, from js/content.js only)
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { serve } from '../scripts/serve.mjs';
import { download, dlKey, target, countryOf } from '../lib/downloads.mjs';
import { printableList, storyFromPost } from '../lib/head.mjs';
import { shapeDownloads } from '../functions/api/insights.js';
import { keyFor } from '../functions/api/upload.js';

let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; };
const root = new URL('..', import.meta.url).pathname;
const SHOTS = process.env.SHOTS || join(root, 'test-results'); mkdirSync(SHOTS, { recursive: true });
globalThis.window = globalThis; createRequire(import.meta.url)(join(root, 'js/seo.js')); const SEO = globalThis.LL_SEO;

// ---------- js/seo.js ----------
const jonahFiles = ['media/printables/jonah-colouring-page.6e78574d.pdf', 'media/printables/jonah-verse-and-question-cards.e965a567.pdf'];
const card = SEO.printablesHtml({ printables: [{ title: 'Colouring page', file: jonahFiles[0] }, { title: 'Cards', file: 'https://media.littlesaltandlight.com/stories/pip-colouring-page.0a1b2c3d.pdf' }, { title: 'Evil', file: 'https://evil.example/x.pdf' }] });
check(card.includes('href="/dl/' + jonahFiles[0] + '"') && card.includes('href="/dl/stories/pip-colouring-page.0a1b2c3d.pdf"'), 'printables link through /dl/ (site files and R2 stories/)');
check(!card.includes('evil') && (card.match(/class="p-dl"/g) || []).length === 2, 'a file on another host is dropped');
check((card.match(/rel="nofollow noopener"/g) || []).length === 2 && card.includes('<h2 id="pPrintH">Free printables</h2>'), 'links are nofollow, card has its heading');
check(SEO.printablesHtml({}) === '' && SEO.printablesHtml({ printables: [] }) === '', 'no printables, no card');
check(SEO.dlKey(jonahFiles[0]) === 'jonah-colouring-page' && dlKey(jonahFiles[0]) === 'jonah-colouring-page' && dlKey('stories/a-b.pdf') === 'a-b', 'count key drops folder, fingerprint and .pdf (app and /dl/ agree)');
const t = SEO.tonightHtml([{ slug: 'old', title: 'Old', series: 'S', episode: 1, dur: 240 }, { slug: 'new-one', title: 'New One', series: 'Goodnight Little Light', episode: 2, dur: 409, narrator: 'Mr. Ginting', date: '2026-11-11T00:00:00+08:00' }]);
check(t.includes('href="/listen/new-one"') && t.includes('New One') && t.includes('Goodnight Little Light #2 · 7 min · read by Mr. Ginting'), 'Tonight picks the newest dated story, with series, length and narrator');
check(SEO.tonightHtml([]) === '' && SEO.tonightStory([{ slug: 'a', placeholder: true }]) === null, 'no story (or only a placeholder): no Tonight card');

// ---------- store.js and head.mjs agree ----------
{
  const c = { window: {}, console, URL, Date, JSON, Math, Promise, setTimeout, clearTimeout, document: { currentScript: null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  c.window = c; vm.createContext(c);
  c.LL_CONFIG = {}; vm.runInContext(readFileSync(join(root, 'js/store.js'), 'utf8'), c);
  const p = { slug: 'pip', title: 'Pip', fields: { questions: 'a\nb\nc', printables: [{ title: 'Colouring page', file: 'media/printables/pip.a084c7ff.pdf' }, { file: 'https://media.littlesaltandlight.com/stories/pip-cards.aad51929.pdf' }, { title: 'x', file: 'javascript:alert(1)' }, 'junk'] } };
  check(JSON.stringify(storyFromPost(p)) === JSON.stringify(c.LLStore.storyFromPost(p)), 'edge storyFromPost matches js/store.js with printables');
  const pl = printableList(p.fields.printables);
  check(pl.length === 2 && pl[1].title === 'Printable', 'printables: only our PDFs kept; a missing title becomes "Printable"');
  check(!('printables' in storyFromPost({ slug: 'x', fields: {} })), 'a story without printables has no printables key');
}

// ---------- /dl/ ----------
const calls = [];
const fakeFetch = async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return new Response('', { status: 204 }); };
const ctx = (path, { method = 'GET', ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1', cf = { country: 'ID' }, q = '' } = {}) => {
  const req = new Request('https://littlesaltandlight.com/dl/' + path + q, { method, headers: ua ? { 'User-Agent': ua } : {} });
  Object.defineProperty(req, 'cf', { value: cf });
  const waits = [];
  return { request: req, params: { path: path.split('/') }, waitUntil: (p) => waits.push(p), waits };
};
{
  let c = ctx(jonahFiles[0]);
  let r = await download(c, fakeFetch); await Promise.all(c.waits);
  check(r.status === 302 && r.headers.get('Location') === 'https://littlesaltandlight.com/' + jonahFiles[0], 'site PDF: 302 to the file on this site');
  check(calls.length === 1 && calls[0].url.endsWith('/rest/v1/rpc/increment_download') && calls[0].body.p_file === 'jonah-colouring-page' && calls[0].body.p_country === 'ID', 'counted once: file key and country only');
  check(Object.keys(calls[0].body).length === 2, 'nothing else about the visitor is sent');
  c = ctx('stories/pip-colouring-page.0a1b2c3d.pdf', { cf: {} }); r = await download(c, fakeFetch); await Promise.all(c.waits);
  check(r.status === 302 && r.headers.get('Location') === 'https://media.littlesaltandlight.com/stories/pip-colouring-page.0a1b2c3d.pdf' && calls[1].body.p_country === 'XX', 'R2 PDF: 302 to media.littlesaltandlight.com; unknown country is XX');
  const before = calls.length;
  for (const [label, opt] of [['Googlebot', { ua: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }], ['Pinterest bot', { ua: 'Pinterestbot/1.0' }], ['WhatsApp preview', { ua: 'WhatsApp/2.23' }], ['no user agent', { ua: '' }], ['HEAD', { method: 'HEAD' }], ['?nc=1', { q: '?nc=1' }]]) {
    c = ctx(jonahFiles[1], opt); r = await download(c, fakeFetch); await Promise.all(c.waits);
    check(r.status === 302 && calls.length === before, `${label}: file sent, not counted`);
  }
  for (const bad of ['media/printables/x.html', 'media/audio/jonah.mp3', 'uploads/x.pdf', 'stories/../secret.pdf', 'stories/.pdf', '']) {
    r = await download(ctx(bad), fakeFetch);
    check(r.status === 404, `refused: "${bad}"`);
  }
  check(target('stories/a.pdf', 'https://x') === 'https://media.littlesaltandlight.com/stories/a.pdf' && target('https://evil.example/a.pdf', 'https://x') === null, 'never redirects to another site');
  check(countryOf({ cf: { country: 'T1' } }) === 'XX' && countryOf({ cf: { country: 'sg' } }) === 'SG', 'Tor (T1) is unknown; codes are upper case');
  c = ctx(jonahFiles[0]); r = await download(c, async () => { throw new Error('down'); }); await Promise.all(c.waits);
  check(r.status === 302, 'database down: the download still works');
  r = await download({ ...ctx(jonahFiles[0], { method: 'POST' }) }, fakeFetch);
  check(r.status === 405, 'POST refused');
}

// ---------- upload and insights ----------
check(keyFor(new URL('https://x/api/upload?path=stories/pip-colouring-page.0a1b2c3d.pdf')).key === 'stories/pip-colouring-page.0a1b2c3d.pdf', 'upload: stories/<name>.pdf path accepted');
check(readFileSync(join(root, 'functions/api/upload.js'), 'utf8').includes('application\\/(json|pdf)'), 'upload: application/pdf allowed');
{
  const d = shapeDownloads([{ file: 'a', day: '2026-11-10', country: 'ID', count: 3 }, { file: 'a', day: '2026-11-11', country: 'US', count: 1 }, { file: 'b', day: '2026-11-10', country: 'ID', count: 2 }, { file: 'a', day: '2026-11-01', country: 'ID', count: 5 }], '2026-11-05T00:00:00Z');
  check(d.total === 6 && d.previous === 5 && d.files[0].file === 'a' && d.files[0].total === 4 && d.files[0].countries.ID === 3 && d.countries.ID === 5, 'insights: downloads per file, per country, total and previous period');
}
const mig = readFileSync(join(root, 'supabase/migrations/20261030120000_download_stats.sql'), 'utf8');
check(/enable row level security/.test(mig) && /private\.is_team\(\)/.test(mig) && /security definer/.test(mig) && /grant execute on function public\.increment_download\(text, text\) to anon/.test(mig) && !/\bip\b|user_agent/i.test(mig.replace(/no IP|user agent/gi, '')), 'migration: team-only reads, increment via function, no visitor columns');
check(/Disallow: \/dl\//.test(readFileSync(join(root, 'robots.txt'), 'utf8')), 'robots.txt keeps crawlers out of /dl/');

// ---------- built pages ----------
execFileSync(process.execPath, [join(root, 'scripts/build-pages.mjs')], { stdio: 'inherit', env: { ...process.env, PRERENDER_STUDIO: '0' } });
for (const f of jonahFiles) check(existsSync(join(root, 'dist', f)) && readFileSync(join(root, 'dist', f)).subarray(0, 5).toString() === '%PDF-', `in the build: ${f}`);
const server = await serve(0, { root: 'dist', headers: true });
const base = `http://localhost:${server.address().port}`;
const home = await (await fetch(base + '/')).text();
check(/<div class="p-tonight" id="pTonight" data-slug="jonah-and-the-whale-bedtime-story">[\s\S]*?Tonight’s bedtime story[\s\S]*?Jonah and the Whale[\s\S]*?href="\/listen\/jonah-and-the-whale-bedtime-story"/.test(home), 'Today HTML has tonight’s story (Jonah) before any script runs');
const story = await (await fetch(base + '/listen/jonah-and-the-whale-bedtime-story')).text();
check(jonahFiles.every((f) => story.includes('href="/dl/' + f + '"')) && story.includes('Free printables'), 'Jonah page HTML lists both printables');
{ const at = story.indexOf('<section class="p-print"'); check(at > 0 && story.indexOf('3 questions to ask afterwards') < at && story.indexOf('class="p-ep-cards"', at) > at, 'printables sit after the 3 questions, before the cards'); }

const browser = await chromium.launch();
for (const night of [false, true]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, colorScheme: night ? 'dark' : 'light' });
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const box = await page.locator('#pTonight').boundingBox();
  check(!!box && box.y + box.height <= 844, `${night ? 'night' : 'day'}: Tonight card is on the first screen of a phone`);
  await page.screenshot({ path: join(SHOTS, `tonight-${night ? 'night' : 'day'}.png`) });
  await page.locator('#pTonight a.p-btn').first().click();
  await page.waitForURL(/\/listen\/jonah-and-the-whale-bedtime-story$/);
  await page.locator('#pPrintH').scrollIntoViewIfNeeded();
  check(await page.locator('#pEpisode a.p-dl').count() === 2, `${night ? 'night' : 'day'}: Listen tonight opens the story page with its printables`);
  await page.screenshot({ path: join(SHOTS, `printables-${night ? 'night' : 'day'}.png`) });
  await page.close();
}
{
  // "Don't count me" devices add nc=1 before the PDF opens.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx2.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('ll.nocount', '1'); } catch (e) {} });
  await page.goto(base + '/listen/jonah-and-the-whale-bedtime-story', { waitUntil: 'load' });
  await page.waitForTimeout(2000); // the app starts once Studio posts have loaded (or failed to)
  const link = page.locator('#pEpisode a.p-dl').first();
  await Promise.all([page.waitForEvent('popup').catch(() => null), link.click()]);
  const href = await link.getAttribute('href');
  check(/^\/dl\/media\/printables\/jonah-colouring-page\.6e78574d\.pdf\?nc=1$/.test(href), 'don’t-count device opens /dl/…?nc=1 (' + href + ')');
  await ctx2.close();
}
{
  // Studio (local mode): add a printable to a bedtime story, refuse a non-PDF, remove it again.
  const studio = await serve(0);
  const sb = `http://localhost:${studio.address().port}/`;
  const c3 = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  await c3.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const page = await c3.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(sb + 'studio/'); await page.waitForSelector('#signinForm');
  await page.fill('#email', 'owner@example.org'); await page.click('#signinForm button[type=submit]'); await page.waitForSelector('.shell');
  await page.click('.side [data-view="new"]'); await page.click('[data-new="story"]');
  await page.fill('#f_title', 'Test Story');
  await page.setInputFiles('#f_story_printable', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForTimeout(300);
  check(/Choose a PDF file/.test(await page.textContent('[data-drop="story_printable"]').catch(() => '') + await page.textContent('form')), 'Studio: a non-PDF is refused');
  await page.setInputFiles('#f_story_printable', { name: 'test-story-colouring-page.pdf', mimeType: 'application/pdf', buffer: readFileSync(join(root, jonahFiles[0])) });
  await page.waitForSelector('.plist li');
  check((await page.textContent('.plist li')).includes('Colouring page'), 'Studio: an uploaded PDF is listed as "Colouring page"');
  await page.click('[data-print-remove="0"]');
  check(await page.locator('.plist li').count() === 0, 'Studio: Remove takes it off the list');
  check(!errs.length, 'Studio: no script errors' + (errs.length ? ' (' + errs.join('; ') + ')' : ''));
  await c3.close(); studio.close();
}
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll printables checks passed');
process.exit(failures ? 1 : 0);
