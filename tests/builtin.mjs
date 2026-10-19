// Built-in content test: items from js/content.js that were copied into the Studio (fields.builtin)
// are replaced by their copy once it is published, never shown twice, and the buttons written in
// index.html still point at the right item. Supabase is faked, so the real database is never used.
// Run: npm test
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
const errors = [];
function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

const at = '2026-01-01T00:00:00Z';
// Published: a new verse, a copy of Joshua 1:9 with changed wording, and a copy of the "brave" devotion
// whose audio copy is still a draft (so it isn't returned).
const posts = [
  { id: 20, type: 'verse', status: 'published', publish_at: at, title: 'Psalm 4:8', slug: 'psalm-4-8', show_on_today: false,
    fields: { verse: 'In peace I will both lay myself down and sleep.', ref: 'Psalm 4:8', translation: 'WEB', topics: ['Trust'] } },
  { id: 21, type: 'verse', status: 'published', publish_at: at, title: 'Joshua 1:9', slug: 'joshua-1-9', show_on_today: false,
    fields: { verse: 'Be strong and courageous (Studio copy).', ref: 'Joshua 1:9', translation: 'WEB', topics: ['When I’m afraid'], builtin: 'verse:joshua-1-9' } },
  { id: 22, type: 'devotion', status: 'published', publish_at: at, title: 'You don’t have to feel brave to be brave (Studio)', slug: 'brave', show_on_today: false,
    fields: { teaser: 'Studio teaser', body: 'Studio body text.', audioId: 99, builtin: 'devotion:brave' } }
];

async function open(hash, list) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript',
    body: "window.LL_CONFIG = { supabaseUrl: 'https://fake-project.supabase.co', supabaseAnonKey: 'sb_publishable_test' };" }));
  await context.route('https://fake-project.supabase.co/**', (r) => {
    // These checks cover the verse cards, so the 'content' setting switches verses on.
    if (/site_settings/.test(r.request().url())) return r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ key: 'content', value: { verses: true } }]) });
    return r.fulfill({ contentType: 'application/json', body: JSON.stringify(list) });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + hash);
  await page.waitForSelector('#app[data-ready]');
  return page;
}
const C = (page, fn) => page.evaluate(fn);

let page = await open('#verses', posts);
const refs = await C(page, () => window.LL_CONTENT.verses.map((v) => v.ref));
check(refs.filter((r) => r === 'Joshua 1:9').length === 1, 'verses: Joshua 1:9 appears once (the Studio copy replaces the built-in)');
check(await C(page, () => window.LL_CONTENT.verses.some((v) => v.text.includes('Studio copy'))), 'verses: the Studio wording is shown');
check(refs.length === 10, `verses: 1 new + 9 built-in, none lost (${refs.length})`);
const saveRef = await C(page, () => window.LL_CONTENT.verses[+document.querySelector('.p-slide.s1 [data-save-verse]').dataset.saveVerse].ref);
check(saveRef === 'Joshua 1:9', `Today: the "Verse of the week" Save image button still means Joshua 1:9 (${saveRef})`);
check(await C(page, () => !!document.querySelector('.sc-family') && !document.querySelector('.sc-verse')),
  'side panel: a family activity replaces the repeated verse');

const devs = await C(page, () => window.LL_CONTENT.devotions.map((d) => d.slug));
check(devs.filter((s) => s === 'brave').length === 1 && devs.length === 3, 'devotions: "brave" appears once, 3 in total');
const brave = await C(page, () => window.LL_CONTENT.devotions.find((d) => d.slug === 'brave'));
check(brave.title.includes('(Studio)'), 'devotions: the Studio copy of "brave" is used');
const braveEp = await C(page, () => { const d = window.LL_CONTENT.devotions.find((x) => x.slug === 'brave'); return d.episode >= 0 ? window.LL_CONTENT.episodes[d.episode].title : null; });
check(braveEp === null, 'devotions: "brave" has no Listen link while its recording is a silent placeholder');
const sheet = await C(page, () => window.LL_CONTENT.devotions[+document.querySelector('.p-slide.s2 [data-sheet]').dataset.sheet].slug);
check(sheet === 'brave', 'Today: the devotion Read button still opens "brave"');
const bedtime = await C(page, () => window.LL_CONTENT.episodes[+document.querySelector('.p-slide.s4 [data-ep]').dataset.ep].title);
check(bedtime === 'When I Am Afraid — Psalm 56:3', 'Today: the audio Play button plays the Psalm 56:3 devotion (built-in index still mapped)');
// The Jonathan reel ships hidden by default, so its Today card is removed (no button points nowhere).
const reel = await C(page, () => ({ card: !!document.querySelector('.p-slide.s3:not(.s-studio)'), broken: document.querySelectorAll('[data-reel="-1"]').length, jon: window.LL_CONTENT.reels.some((r) => r.title.startsWith('Why Jonathan')) }));
check(!reel.card && !reel.broken && !reel.jon, 'Today: the hidden-by-default Jonathan reel card is removed, no broken Watch button');
await page.context().close();

page = await open('#read/brave', posts);
await page.waitForTimeout(300);
check((await page.$eval('#pArticle', (a) => a.textContent)).includes('Studio body text'), 'links: #read/brave opens the Studio copy');
await page.context().close();

// Built-in Psalm 56:3 recording fills the Today audio card and the Listen hero; once its Studio post is
// published (marked for Today, with fields.builtin) the card uses the post and nothing is listed twice.
page = await open('', posts);
check(await page.$eval('.p-slide.s4 [data-fa="title"]', (e) => e.textContent) === 'When I Am Afraid — Psalm 56:3', 'audio: Today card shows the Psalm 56:3 devotion');
check(await C(page, () => !!window.LL_CONTENT.episodes[+document.querySelector('.p-slide.s4 [data-fa="play"]').dataset.ep].src), 'audio: Today card plays a real file');
await page.context().close();
const audioPost = { id: 30, type: 'audio', status: 'published', publish_at: at, title: 'When I Am Afraid — Psalm 56:3', slug: 'when-i-am-afraid-psalm-56-3', show_on_today: true,
  media_url: 'https://fake-project.supabase.co/storage/v1/object/public/media/x.mp3',
  fields: { kind: 'Devotion', minutes: '1:55', seconds: 115, ref: 'Psalm 56:3', verse: 'When I am afraid, I will put my trust in you.', builtin: 'audio:when-i-am-afraid-psalm-56-3', transcript: 'First <b>line</b>.\n\nSecond part.' } };
page = await open('', [audioPost, ...posts]);
const titles = await C(page, () => window.LL_CONTENT.episodes.map((e) => e.title));
check(titles.filter((t) => t === 'When I Am Afraid — Psalm 56:3').length === 1, 'audio: the published copy replaces the built-in (listed once)');
check(await C(page, () => window.LL_CONTENT.episodes[+document.querySelector('.p-slide.s4 [data-fa="play"]').dataset.ep].src.includes('fake-project')), 'audio: Today card plays the published post');
check(await C(page, () => window.LL_CONTENT.episodes[+document.querySelector('.p-now [data-fa="play"]').dataset.ep].src.includes('fake-project')), 'audio: Listen hero plays the published post');
await page.click('.p-slide.s4 [data-fa="play"]');
await page.click('#pMiniOpen');
await page.waitForTimeout(200);
const ptx = await page.$$eval('#pFull .transcript p', (ps) => ps.map((p) => p.innerHTML));
check(ptx.length === 2 && ptx[0] === 'First &lt;b&gt;line&lt;/b&gt;.', 'read along: a published post’s transcript is used, split on blank lines and escaped');
await page.keyboard.press('Escape');
check(await C(page, () => ![...document.querySelectorAll('#pFeed .p-slide.s-studio')].some((s) => s.textContent.includes('Psalm 56:3'))), 'audio: no second Today card for it');
await page.context().close();

check(errors.length === 0, 'no script errors ' + errors.join(' | '));
await browser.close();
server.close();
console.log(failures ? `\n${failures} built-in check(s) failed` : '\nAll built-in checks passed');
process.exit(failures ? 1 : 0);
