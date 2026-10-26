// Read-along highlight on /listen/jonah-and-the-whale-bedtime-story: timings line up with the text, the
// current sentence/word is marked, tap and keyboard seek, the on/off choice is remembered, the gold is AA in
// day and night, calm mode has no fades, and missing or wrong timings leave plain text. Also: the stub
// timings match js/content.js, sw.js caches the file, and nothing but this site is fetched.
// Run: npm test   (builds dist/ first)
import { chromium } from 'playwright';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { serve } from '../scripts/serve.mjs';

let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }

const ctx = vm.createContext({ window: {}, console });
for (const f of ['js/content.js', 'js/seo.js']) vm.runInContext(await readFile(f, 'utf8'), ctx);
const C = ctx.window.LL_CONTENT, S = ctx.window.LL_SEO;
const x = C.bedtimeStories.find((s) => s.slug === 'jonah-and-the-whale-bedtime-story');
const T = JSON.parse(await readFile(x.timings, 'utf8'));
const parts = [...x.story.map((t, i) => ({ key: 'story-' + i, text: t })), { key: 'prayer', text: x.prayer }, { key: 'goodnight', text: x.goodnight }];
const m = S.raMatch(parts, T);
check(m && m.count === T.length - 1, `stub timings match the story text (${m && m.count} sentences; "Let’s pray." spoken, not shown)`);
check(T.every((s) => s.end <= x.dur && s.words.length && s.words.every((w) => w.start >= s.start && w.end <= s.end + 0.01)), 'stub timings fit the placeholder length and words sit inside their sentence');
check(m && m.sentences.filter((s) => s.start != null).every((s) => s.words), 'every sentence has word timings');
// Shape and fallbacks of the matcher.
check(S.raMatch(parts, []) === null && S.raMatch(parts, null) === null, 'empty timings: no read-along');
check(S.raMatch(parts, T.slice(0, 5)) === null, 'timings that stop early: no read-along');
check(S.raMatch(parts, T.map((s, i) => (i === 3 ? { ...s, text: 'Something else entirely.' } : s))) === null, 'a changed sentence: no read-along');
check(S.raMatch(parts, T.map((s, i) => (i === 3 ? { ...s, start: 999 } : s))) === null, 'times out of order: no read-along');
const noWords = S.raMatch(parts, T.map((s, i) => (i === 2 ? { ...s, words: [{ text: 'nope', start: 0, end: 1 }] } : s)));
check(noWords && noWords.count === m.count && noWords.sentences.find((s) => s.start === T[2].start).words === null, 'mismatched words: that sentence still highlights, without word underline');
const merged = [{ ...T[0], text: T[0].text + ' ' + T[1].text, end: T[1].end, words: [...T[0].words, ...T[1].words] }, ...T.slice(2)];
check(S.raMatch(parts, merged) && S.raMatch(parts, merged).count === m.count - 1, 'narration that joins two shown sentences still lines up');
check(/'media\/audio\/jonah-and-the-whale-timings\.json'/.test(await readFile('sw.js', 'utf8')) && /ll-v73/.test(await readFile('sw.js', 'utf8')), 'sw.js caches the timings file (version left at ll-v73)');

execFileSync(process.execPath, ['scripts/build-pages.mjs'], { stdio: 'ignore', env: { ...process.env, PRERENDER_STUDIO: '0' } });
const server = await serve(0, { root: 'dist', headers: true });
const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
async function open(opts = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block', reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: "window.LL_CONFIG = { supabaseUrl: 'https://fake-project.supabase.co', supabaseAnonKey: 'sb_publishable_test' };" }));
  const outside = [];
  await context.route(/^https?:\/\/(?!localhost)/, (r) => { outside.push(r.request().url()); r.abort(); });
  if (opts.timings) await context.route('**/jonah-and-the-whale-timings.json', opts.timings);
  if (opts.init) await context.addInitScript(opts.init);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '/listen/jonah-and-the-whale-bedtime-story');
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  return { context, page, errors, outside };
}
const story = x.story.join(' ');
const textOf = (p) => p.$$eval('#pEpisode [data-ra^="story-"]', (e) => e.map((n) => n.textContent).join(' '));

{
  const { context, page, errors, outside } = await open();
  await page.waitForSelector('.p-sen', { timeout: 5000 });
  check(await page.$$eval('#pEpisode .p-sen', (e) => e.length) === m.count, 'every timed sentence is a tappable span');
  check((await textOf(page)) === story, 'the story text is unchanged word for word');
  check(await page.$eval('.p-ra-toggle', (b) => b.getAttribute('aria-pressed') === 'true' && /on/.test(b.textContent)), 'toggle shows on by default');
  check(await page.$$eval('#pEpisode mark.p-word .p-w', (e) => e.some((w) => /affliction/i.test(w.textContent))), 'the word-to-know mark is kept');
  await page.$eval('#pEpisode audio', (a) => new Promise((ok) => { a.addEventListener('loadedmetadata', ok, { once: true }); a.preload = 'auto'; a.load(); }));
  const s5 = T[5], w = s5.words[2];
  await page.$eval('#pEpisode audio', (a, t) => { a.currentTime = t; }, w.start + 0.01);
  await page.waitForFunction(() => document.querySelector('.p-sen.on'));
  const on = await page.$eval('.p-sen.on', (e) => ({ text: e.textContent, word: e.querySelector('.p-w.on') && e.querySelector('.p-w.on').textContent }));
  check(S.raNorm(on.text) === S.raNorm(s5.text), 'the sentence being read is highlighted');
  check(on.word === w.text, `the word being read is underlined ("${on.word}")`);
  check(await page.$$eval('.p-sen.on', (e) => e.length) === 1 && await page.$$eval('.p-w.on', (e) => e.length) === 1, 'only one sentence and one word are marked');
  const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const [l1, l2] = [lum(a), lum(b)].sort((p, q) => q - p); return (l1 + 0.05) / (l2 + 0.05); };
  for (const mode of ['day', 'night']) {
    if (mode === 'night') await page.evaluate(() => document.querySelector('#app').classList.add('night'));
    await page.waitForTimeout(400); // let the colour fade finish
    const c = await page.$eval('.p-sen.on', (e) => { const s = getComputedStyle(e); return { fg: s.color, bg: s.backgroundColor }; });
    const r = ratio(c.fg, c.bg);
    check(r >= 4.5, `${mode}: highlighted sentence contrast ${r.toFixed(1)}:1 (AA)`);
  }
  await page.evaluate(() => document.querySelector('#app').classList.remove('night'));
  check(await page.$eval('.p-sen', (e) => getComputedStyle(e).transitionDuration) !== '0s', 'a soft colour fade normally');
  await page.evaluate(() => document.querySelector('#app').classList.add('calm'));
  check(await page.$eval('.p-sen', (e) => getComputedStyle(e).transitionDuration) === '0s', 'calm mode: no fade at all');
  check(await page.$eval('.p-sen', (e) => !/anim/.test(getComputedStyle(e).animationName) || getComputedStyle(e).animationName === 'none'), 'no animation on sentences');
  // Tap a sentence: the audio jumps to its start.
  const sens = await page.$$('#pEpisode .p-sen');
  await sens[10].click();
  check(Math.abs(await page.$eval('#pEpisode audio', (a) => a.currentTime) - T[10].start) < 0.3, 'tapping a sentence jumps the audio to it');
  await page.$eval('#pEpisode audio', (a) => a.pause());
  await sens[2].focus();
  await page.keyboard.press('Enter');
  check(Math.abs(await page.$eval('#pEpisode audio', (a) => a.currentTime) - T[2].start) < 0.3, 'Enter on a focused sentence jumps the audio to it');
  await page.$eval('#pEpisode audio', (a) => a.pause());
  await sens[7].focus();
  await page.keyboard.press(' ');
  check(Math.abs(await page.$eval('#pEpisode audio', (a) => a.currentTime) - T[7].start) < 0.3, 'Space on a focused sentence jumps the audio to it');
  await page.$eval('#pEpisode audio', (a) => a.pause());
  // Gentle follow: paused never scrolls; after the reader scrolls, playing doesn't pull them back.
  const top0 = await page.$eval('#pEpisode', (e) => e.scrollTop);
  await page.$eval('#pEpisode audio', (a, t) => { a.currentTime = t; }, T[16].start + 0.1);
  await page.waitForTimeout(400);
  check(await page.$eval('#pEpisode', (e) => e.scrollTop) === top0, 'paused: moving the time does not scroll the page');
  await page.mouse.move(200, 400);
  await page.mouse.wheel(0, -50);
  await page.$eval('#pEpisode', (e) => { e.scrollTop = 0; });
  await page.$eval('#pEpisode audio', (a, t) => { a.currentTime = t; a.muted = true; return a.play(); }, T[0].start);
  await page.waitForTimeout(300);
  const playing = await page.$eval('#pEpisode audio', (a) => !a.paused);
  await page.mouse.wheel(0, 10);
  await page.$eval('#pEpisode audio', (a, t) => { a.currentTime = t; }, T[17].start + 0.1);
  await page.waitForTimeout(600);
  check(playing && await page.$eval('#pEpisode', (e) => e.scrollTop) < 100, 'playing just after the reader scrolled: the page is not pulled away');
  await page.waitForTimeout(5200);
  await page.$eval('#pEpisode audio', (a, t) => { a.currentTime = t; }, T[18].start + 0.1);
  await page.waitForTimeout(800);
  const vis = await page.$eval('.p-sen.on', (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
  check(vis, 'playing (reader idle): the current sentence is brought into view');
  await page.$eval('#pEpisode audio', (a) => a.pause());
  // Toggle off: plain text, remembered after reload.
  await page.click('.p-ra-toggle');
  check(await page.$$eval('#pEpisode .p-sen', (e) => e.length) === 0 && (await textOf(page)) === story, 'toggle off: plain text again');
  check(await page.evaluate(() => localStorage.getItem('ll.readAlong')) === 'off', 'the choice is saved on this device only (ll.readAlong)');
  await page.reload();
  await page.waitForSelector('.p-ra-toggle');
  check(await page.$eval('.p-ra-toggle', (b) => b.getAttribute('aria-pressed')) === 'false' && await page.$$eval('#pEpisode .p-sen', (e) => e.length) === 0, 'after reload it stays off');
  await page.click('.p-ra-toggle');
  check(await page.$$eval('#pEpisode .p-sen', (e) => e.length) === m.count, 'toggle on again: highlight back');
  // The app's own existing Supabase reads (posts, site settings) are not part of the read-along; nothing else may leave.
  const other = outside.filter((u) => !/\.supabase\.co\/rest\/v1\/(posts|site_settings)\?/.test(u));
  check(other.length === 0, 'read-along makes no outside requests (no counting, no tracking)' + (other.length ? ': ' + other.join(', ') : ''));
  check(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await context.close();
}
{
  const { context, page } = await open({ reduced: true });
  await page.waitForSelector('.p-sen');
  check(await page.$eval('.p-sen', (e) => getComputedStyle(e).transitionDuration) === '0s', 'reduced motion: no fade at all');
  await context.close();
}
for (const [label, handler] of [
  ['missing timings file', (r) => r.fulfill({ status: 404, body: 'nope' })],
  ['timings that do not match the text', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify(T.map((s, i) => (i === 4 ? { ...s, text: 'A different line.' } : s))) })],
  ['broken JSON', (r) => r.fulfill({ contentType: 'application/json', body: '[{' })],
]) {
  const { context, page, errors } = await open({ timings: handler });
  await page.waitForTimeout(800);
  check(await page.$$eval('#pEpisode .p-sen, .p-ra-toggle', (e) => e.length) === 0 && (await textOf(page)) === story && errors.length === 0, `${label}: plain text, no toggle, no errors`);
  await context.close();
}
await browser.close();
server.close();
if (failures) { console.log(`\n${failures} read-along check(s) failed`); process.exit(1); }
console.log('\nRead-along checks passed');
