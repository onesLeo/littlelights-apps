// Studio bedtime story (local mode, never touches the real database): the form, MP3-only upload of a file
// over 5 MB with its length read, timings JSON validation, cover image size, the SGT publish date, the guide
// section, and a phone-width layout without sideways scrolling.
// Run: npm test   (screenshots go to test-results/)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }
const text = (sel) => page.$eval(sel, (el) => el.textContent);

// A real MP3 over 5 MB (the 100 s silent fixture repeated: ~6.2 MB, like a real mix).
const one = readFileSync(new URL('fixtures/silence-100s.mp3', import.meta.url));
const bigMp3 = Buffer.concat(Array(62).fill(one));
const timings = readFileSync(new URL('../media/audio/jonah-and-the-whale-timings.json', import.meta.url));
const cover = readFileSync(new URL('../media/audio/jonah-and-the-whale-cover.jpg', import.meta.url));

await page.goto(base + 'studio/');
await page.waitForSelector('#signinForm');
await page.fill('#email', 'owner@example.org');
await page.click('#signinForm button[type=submit]');
await page.waitForSelector('.shell');

await page.click('.side [data-view="new"]');
check(await page.$('[data-new="story"]') !== null, 'New post offers Bedtime story');
await page.click('[data-new="story"]');
check(await page.$('#f_today') === null, 'stories are not offered on the Today feed');
check((await page.inputValue('#f_series')) === 'Bedtime Bible Stories for Kids' && (await page.inputValue('#f_episode')) === '3', 'series pre-filled, next episode number is 3');
check(await page.$('#f_publish_date') !== null, 'schedule asks for a publish date');

// Validation before anything is filled in.
await page.click('#postForm button[type=submit]');
const errs = await page.$$eval('.errmsg', (els) => els.map((e) => e.textContent).join(' | '));
check(/title/i.test(errs) && /narration/i.test(errs) && /timings/i.test(errs) && /3 questions/.test(errs) && /publish date/i.test(errs), 'missing title, audio, timings, questions and date are flagged');

// Files need the title first.
await page.setInputFiles('#f_story_audio', { name: 'mix.mp3', mimeType: 'audio/mpeg', buffer: bigMp3 });
await page.waitForSelector('.errmsg');
check((await page.textContent('.form')).includes('Type the title first'), 'audio upload asks for the title first');
await page.fill('#f_title', 'Test Story For Studio');

// Wrong type rejected; a fake .mp3 rejected by its bytes.
await page.setInputFiles('#f_story_audio', { name: 'mix.wav', mimeType: 'audio/wav', buffer: Buffer.from('RIFFxxxxWAVE') });
await page.waitForFunction(() => document.querySelector('.form').textContent.includes('Choose an MP3 file'));
check(true, 'non-MP3 rejected');
await page.setInputFiles('#f_story_audio', { name: 'fake.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('hello world, not audio') });
await page.waitForFunction(() => document.querySelector('.form').textContent.includes('doesn’t look like an MP3'));
check(true, 'a file that is not really MP3 rejected');

await page.setInputFiles('#f_story_audio', { name: 'mix.mp3', mimeType: 'audio/mpeg', buffer: bigMp3 });
await page.waitForFunction(() => /mix\.mp3/.test(document.querySelector('[data-drop="story_audio"] b').textContent), null, { timeout: 30000 });
const minutes = await page.inputValue('#f_minutes');
check(bigMp3.length > 6e6 && /^1\d\d:\d\d$/.test(minutes), `${(bigMp3.length / 1048576).toFixed(1)} MB MP3 uploaded and its length read (${minutes})`);

// Timings: bad JSON, bad shape, then the real Jonah file.
await page.setInputFiles('#f_story_timings', { name: 't.json', mimeType: 'application/json', buffer: Buffer.from('{oops') });
await page.waitForFunction(() => document.querySelector('.form').textContent.includes('isn’t valid JSON'));
check(true, 'invalid JSON rejected');
await page.setInputFiles('#f_story_timings', { name: 't.json', mimeType: 'application/json', buffer: Buffer.from('[{"text":"Hi","start":0,"end":1}]') });
await page.waitForFunction(() => document.querySelector('.form').textContent.includes('has no "words" list'));
check(true, 'timings without words rejected');
await page.setInputFiles('#f_story_timings', { name: 'jonah-timings.json', mimeType: 'application/json', buffer: timings });
await page.waitForFunction(() => /sentences/.test(document.querySelector('[data-drop="story_timings"] b').textContent));
check(/\d+ sentences, \d+ words/.test(await text('[data-drop="story_timings"] b')), 'valid timings accepted with a count');

await page.setInputFiles('#f_story_cover', { name: 'cover.jpg', mimeType: 'image/jpeg', buffer: cover });
await page.waitForFunction(() => /1200×630/.test(document.querySelector('[data-drop="story_cover"] b').textContent));
check(true, 'cover saved with its size (1200×630)');

await page.fill('#f_desc', 'A test bedtime story.');
await page.fill('#f_story', 'First paragraph.\n\nSecond paragraph.');
await page.fill('#f_verse', 'In peace I will lie down.');
await page.fill('#f_ref', 'Psalm 4:8');
await page.fill('#f_prayer', 'Dear God, amen.');
await page.fill('#f_questions', 'One?\nTwo?\nThree?');
// SGT date: today is refused, a future day accepted.
const sgtDay = (d) => new Date(Date.now() + d * 86400e3 + 8 * 3600e3).toISOString().slice(0, 10);
await page.fill('#f_publish_date', sgtDay(0));
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.errmsg');
check((await page.textContent('.form')).includes('Pick a day after today'), 'today (SGT) refused for Schedule');
await page.fill('#f_publish_date', sgtDay(3));
await page.screenshot({ path: 'test-results/studio-story-form.png', fullPage: true });
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.row');
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ll.posts.v1')).find((p) => p.type === 'story'));
const day = sgtDay(3);
check(saved && saved.status === 'scheduled' && saved.publish_at === new Date(day + 'T00:00:00+08:00').toISOString(), 'scheduled for midnight SGT on the chosen day');
check(saved && saved.fields.seconds > 6000 && saved.fields.timings && saved.fields.image_width === 1200 && saved.fields.questions.split('\n').length === 3 && saved.show_on_today === false, 'post keeps duration, timings, cover size and questions');

// Guide section.
await page.click('.side [data-view="guide"]');
check((await page.textContent('.guide')).includes('Post a bedtime story') && (await page.textContent('.guide')).includes('5:00 (SGT)'), 'guide has the bedtime story section');

// Phone width: no sideways scroll on the story form.
await page.setViewportSize({ width: 375, height: 800 });
await page.click('.side [data-view="new"], [data-view="new"]').catch(() => {});
await page.evaluate(() => document.querySelector('[data-view="new"]').click());
await page.click('[data-new="story"]');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(overflow <= 1, `story form fits a 375 px phone (overflow ${overflow}px)`);
await page.screenshot({ path: 'test-results/studio-story-phone.png', fullPage: true });

check(!errors.length, 'no page errors' + (errors.length ? ': ' + errors.join('; ') : ''));
await browser.close(); server.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll Studio story checks passed');
