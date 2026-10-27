// Bedtime stories posted in the Studio (type 'story'): timings validation, SGT publish dates, the post ->
// story mapping, merging with the built-in stories, prerender (published only, in the sitemap), the Elijah
// seed rendering exactly like the built-in entry, and the app showing a live Studio story but not a future one.
// Run: npm test
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { SEO } from '../lib/head.mjs';
import { siteContent, pageList, sitemapXml } from '../scripts/prerender.mjs';
import { builtinStory, fieldsFromStory, seedSql, ELIJAH_SLUG, ELIJAH_PUBLISH_AT } from '../scripts/seed-elijah.mjs';
import { serve } from '../scripts/serve.mjs';

let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }
const root = new URL('..', import.meta.url);

const ctx = { console, URL, Date, JSON, Math, Promise, document: { currentScript: null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
ctx.window = ctx; vm.createContext(ctx);
vm.runInContext(await readFile(new URL('js/content.js', root), 'utf8'), ctx);
vm.runInContext(await readFile(new URL('js/store.js', root), 'utf8'), ctx);
const S = ctx.LLStore, C = JSON.parse(JSON.stringify(ctx.LL_CONTENT));

// ---- timings ----
const jonahT = JSON.parse(await readFile(new URL('media/audio/jonah-and-the-whale-timings.json', root), 'utf8'));
check(S.validateTimings(jonahT, 238.34).ok, 'Jonah timings file passes validation');
check(S.validateTimings(JSON.parse(await readFile(new URL('media/audio/elijah-still-small-voice-timings.json', root), 'utf8')), 257.98).ok, 'Elijah timings file passes validation');
check(!S.validateTimings({}).ok && !S.validateTimings([]).ok, 'not a list / empty list rejected');
check(/text/.test(S.validateTimings([{ start: 0, end: 1, words: [{ text: 'a', start: 0, end: 1 }] }]).error), 'missing text rejected');
check(/end/.test(S.validateTimings([{ text: 'a', start: 2, end: 1, words: [{ text: 'a', start: 0, end: 1 }] }]).error), 'end before start rejected');
check(/words/.test(S.validateTimings([{ text: 'a', start: 0, end: 1 }]).error), 'missing words rejected');
check(/word 1/.test(S.validateTimings([{ text: 'a', start: 0, end: 1, words: [{ text: 'a', start: 'x', end: 1 }] }]).error), 'bad word times rejected');
check(/order/.test(S.validateTimings([{ text: 'a', start: 5, end: 6, words: [{ text: 'a', start: 5, end: 6 }] }, { text: 'b', start: 1, end: 2, words: [{ text: 'b', start: 1, end: 2 }] }]).error), 'out-of-order sentences rejected');
check(/audio is/.test(S.validateTimings(jonahT, 100).error || ''), 'timings longer than the audio rejected');

// ---- SGT dates ----
check(S.sgtDayStart('2026-11-09') === '2026-11-08T16:00:00.000Z', 'publish date = midnight SGT');
check(S.sgtDay('2026-11-08T16:00:00.000Z') === '2026-11-09' && S.sgtDay('2026-11-08T15:59:59Z') === '2026-11-08', 'ISO -> SGT day');
check(S.sgtDayStart('9 Nov') === '', 'bad date rejected');

// ---- post -> story, merge ----
const past = new Date(Date.now() - 86400e3).toISOString(), future = new Date(Date.now() + 5 * 86400e3).toISOString();
const post = (slug, publish_at, extra = {}) => ({ id: slug, type: 'story', status: 'scheduled', publish_at, title: 'Test ' + slug, slug, show_on_today: false, media_url: 'https://svlvlmyugyadmehjwudm.supabase.co/storage/v1/object/public/media/stories/' + slug + '.1a2b3c4d.mp3',
  fields: { series: 'Bedtime Bible Stories for Kids', episode: 3, narrator: 'Mr. Ginting', desc: 'A test story.', seconds: 200.5, story: 'Para one.\n\nPara\ntwo.', prayer: 'Dear God. Amen.', goodnight: 'Night.', verse: 'Peace.', ref: 'Psalm 4:8', translation: 'WEB', questions: 'Q1?\nQ2?\nQ3?', timings: 'https://x.supabase.co/t.json', ...extra } });
const live = post('test-live-story', past), later = post('test-future-story', future);
const x = S.storyFromPost(live);
check(x.story.length === 2 && x.story[1] === 'Para two.' && x.questions.length === 3 && x.verse.ref === 'Psalm 4:8' && x.dur === 200.5 && x.timings.startsWith('https://'), 'storyFromPost maps the fields');
const merged = S.mergeStories(C.bedtimeStories, [later, live, { ...post('draft', null), status: 'draft' }]);
check(merged.length === C.bedtimeStories.length + 1 && merged[merged.length - 1].slug === 'test-live-story', 'merge: built-ins kept, live Studio story added, future and draft left out');
check(merged[0].slug === 'jonah-and-the-whale-bedtime-story', 'Jonah (hard-coded) still first');
const html = SEO.storyHtml(x, 'h1');
check(html.includes('<audio controls preload="none" src="' + live.media_url + '"') && html.includes('data-ra="story-1"') && html.includes('data-ra="prayer"') && html.includes('<li>Q2?</li>') && html.includes('Psalm 4:8 (WEB)'), 'Studio story renders with player, read-along hooks, prayer, verse, questions');

// ---- prerender ----
const site = siteContent({ C, S }, { posts: [live, later], settings: {} });
const pages = pageList(site);
check(pages.some((p) => p.meta.path === '/listen/test-live-story'), 'prerender writes a page for the published Studio story');
check(!pages.some((p) => p.meta.path === '/listen/test-future-story'), 'prerender skips the future story');
const xml = sitemapXml(pages);
check(xml.includes('/listen/test-live-story') && !xml.includes('test-future-story'), 'sitemap lists published, not future');
check(pages.some((p) => p.meta.path === '/listen/jonah-and-the-whale-bedtime-story') && pages.some((p) => p.meta.path === '/listen/' + ELIJAH_SLUG), 'built-in Jonah and Elijah pages still built');

// ---- Elijah seed renders exactly like the built-in ----
const eli = await builtinStory(ELIJAH_SLUG);
const seeded = S.storyFromPost({ type: 'story', status: 'scheduled', publish_at: new Date(ELIJAH_PUBLISH_AT).toISOString(), title: eli.title, slug: eli.slug, media_url: eli.src, fields: fieldsFromStory(eli) });
check(SEO.storyHtml(seeded, 'h1') === SEO.storyHtml(eli, 'h1'), 'Elijah Studio copy renders the same page body as the built-in');
const m1 = SEO.meta('story', seeded), m2 = SEO.meta('story', eli);
check(JSON.stringify(m1) === JSON.stringify(m2), 'Elijah Studio copy has the same head (title, description, image)');
check(SEO.storyRowsHtml([seeded]) === SEO.storyRowsHtml([eli]), 'Elijah Studio copy has the same Goodnight row');
const sql = await seedSql();
check(sql.includes("'scheduled', '2026-11-09T00:00:00+08:00'") && sql.includes('on conflict (slug) do nothing') && /TODO \(audio\)/.test(sql) && !/\b(delete|update|drop)\b/i.test(sql.replace(/--.*$/gm, '')), 'seed SQL: scheduled 9 Nov SGT, idempotent, audio TODO flagged, insert only');
check(sql === await readFile(new URL('supabase/seed/20261027_elijah_story.sql', root), 'utf8'), 'committed seed file is up to date with js/content.js');
const mig = await readFile(new URL('supabase/migrations/20261027120000_bedtime_story_posts.sql', root), 'utf8');
check(/'story'/.test(mig) && /'verse', 'devotion', 'audio', 'reel', 'game'/.test(mig), 'migration allows type story and keeps the others');

// ---- app: a live Studio story shows, a future one does not (Supabase answers mocked) ----
execFileSync(process.execPath, [new URL('../scripts/build-pages.mjs', import.meta.url).pathname], { stdio: 'ignore', env: { ...process.env, PRERENDER_STUDIO: '0' } });
const server = await serve(0, { root: 'dist', headers: true });
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // The public posts request answers with a live and a future story (the app must still drop the future one).
  await page.route('**/rest/v1/posts?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([later, live]) }));
  await page.route('**/rest/v1/site_settings?**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
  await page.goto(base + '/listen');
  await page.waitForSelector('#pGn .p-gnrow');
  const rows = await page.$$eval('#pGn .p-gnrow', (els) => els.map((e) => e.getAttribute('href')));
  check(rows.includes('/listen/test-live-story'), 'Goodnight Little Light lists the live Studio story');
  check(!rows.includes('/listen/test-future-story'), 'Goodnight Little Light hides the future Studio story');
  check(rows.includes('/listen/jonah-and-the-whale-bedtime-story'), 'Jonah still listed');
  await page.click('a[href="/listen/test-live-story"]');
  await page.waitForSelector('#pEpisode.on .p-ep-qs');
  const txt = await page.textContent('#pEpisode');
  check(txt.includes('Para two.') && txt.includes('Dear God. Amen.') && txt.includes('Q3?'), 'story page opens in the app with text, prayer and questions');
  await page.goto(base + '/listen/test-future-story');
  await page.waitForTimeout(500);
  check(!(await page.textContent('body')).includes('Para two.'), 'future story page shows nothing');
} finally { await browser.close(); server.close(); }

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll story checks passed');
