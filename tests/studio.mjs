// Studio test (local mode): sign in, write, validate, upload, publish, schedule,
// manage the team, then check the posts appear in the app.
// Run: npm test   (screenshots go to test-results/)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';
import { friendlySource, shape, shapeStats } from '../functions/api/insights.js';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch();
// Service workers are blocked: they would fetch the real js/config.js past the route below.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
// Tests run in local mode so they never touch the real database.
await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}
const text = (sel) => page.$eval(sel, (el) => el.textContent);
const rowStatus = (title) => page.$$eval('.row', (rows, t) => {
  const r = rows.find((x) => x.querySelector('b').textContent === t);
  return r ? r.querySelector('.pill').textContent : null;
}, title);

// One second of silence as a WAV file, so the upload and length detection run for real.
function silentWav(seconds = 2, rate = 8000) {
  const n = seconds * rate, buf = Buffer.alloc(44 + n);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36); buf.writeUInt32LE(n, 40);
  buf.fill(128, 44);
  return buf;
}

// ---------- Insights API helpers (no network) ----------
check(friendlySource('www.google.co.id') === 'Google search' && friendlySource('') === 'Direct' && friendlySource('Direct / none') === 'Direct' && friendlySource('l.facebook.com') === 'Facebook' && friendlySource('wa.me') === 'WhatsApp' && friendlySource('littlesaltandlight.com') === 'Within the site' && friendlySource('example.org') === 'example.org', 'insights api: referrers get friendly names');
{
  const out = shape({ total: [{ count: 9, sum: { visits: 5 } }], previous: [{ count: 4, sum: { visits: 2 } }], daily: [{ count: 9, sum: { visits: 5 }, dimensions: { date: '2026-10-20' } }],
    paths: [{ count: 9, sum: { visits: 5 }, dimensions: { requestPath: '/read/a' } }, { count: 3, sum: { visits: 1 }, dimensions: { requestPath: '/studio/' } }],
    countries: [{ count: 6, dimensions: { requestPath: '/read/a', countryName: 'SG' } }, { count: 3, dimensions: { requestPath: '/read/a', countryName: 'ID' } }, { count: 3, dimensions: { requestPath: '/studio/', countryName: 'US' } }],
    referers: [{ count: 5, dimensions: { requestPath: '/read/a', refererHost: 'www.google.com' } }, { count: 4, dimensions: { requestPath: '/read/a', refererHost: 'google.com' } }] }, 7);
  check(out.previous.visits === 2 && out.series[0].visits === 5 && out.countries.map((c) => c.name).join() === 'SG,ID' && out.sources[0].name === 'Google search' && out.sources[0].views === 9, 'insights api: previous period, daily series, site-wide countries and grouped sources (Studio visits left out)');
  const st = shapeStats([{ post_id: 'reel:a', day: '2026-10-01', event: 'started', count: 2 }, { post_id: 'reel:a', day: '2026-10-24', event: 'started', count: 3 }, { post_id: 'devotion:b', day: '2026-10-24', event: 'read_end', count: 1 }], '2026-10-18T00:00:00Z');
  check(st.plays['reel:a'].started === 3 && st.playsTotal.started === 3 && st.playsPrevious.started === 2 && st.playsTotal.read_end === 1 && st.playsSeries.length === 1, 'insights api: plays split into this period and the one before');
}

// ---------- sign in ----------
await page.goto(base + 'studio/');
await page.waitForSelector('#signinForm');
check(await page.$('.modebar') !== null, 'studio: local mode is explained on the sign-in page');
await page.fill('#email', 'not-an-email');
await page.click('#signinForm button[type=submit]');
check((await text('.errmsg')).includes('Enter an email'), 'studio: a bad email is explained');
await page.fill('#email', 'Owner@Example.org');
await page.click('#signinForm button[type=submit]');
await page.waitForSelector('.shell');
check((await text('.me')).includes('owner@example.org'), 'studio: first sign-in becomes the owner');

// ---------- verse: validation, then publish ----------
const longVerse = 'Be strong in the Lord and in the strength of his might. Put on the whole armor of God, that you may be able to stand against the schemes of the devil. For our wrestling is not against flesh and blood, but against the principalities, against the powers, against the world’s rulers of the darkness of this age, and against the spiritual forces of wickedness in the heavenly places. Therefore put on the whole armor of God, that you may be able to withstand in the evil day, and, having done all, to stand. Stand firm therefore, having the belt of truth buckled around your waist, and having put on the breastplate of righteousness, and having fitted your feet with the readiness that comes from the Good News of peace. Above all, taking up the shield of faith, with which you will be able to quench all the fiery darts of the evil one. Take the helmet of salvation, and the sword of the Spirit, which is the word of God. Pray in the Spirit at all times, with all kinds of prayer and requests. To that end, keep alert and always persevere in making supplication for all the saints.';
check((await page.getAttribute('.side .brand .wm', 'aria-label')) === 'Salt and Light' && (await page.$eval('.side .brand .wm svg', (s) => s.getAttribute('aria-hidden'))) === 'true', 'studio: sidebar shares the calligraphy wordmark');
check(await page.$eval('.side .brand .wm-fc', (e) => getComputedStyle(e).animationName === 'wm-core'), 'studio: wordmark flame is alive');
await page.click('.side [data-view="new"]');
await page.click('[data-new="verse"]');
await page.click('#postForm button[type=submit]');
check((await page.$$('.errmsg')).length === 2, 'verse: missing text and reference are both flagged');
await page.fill('#f_verse', longVerse);
check((await text('#preview')).includes('Be strong in the Lord'), 'verse: preview updates while typing');
await page.fill('#f_ref', 'Ephesians 6:10-18');
await page.click('[data-topic="Trust"]');
await page.fill('#newTopic', 'Armor of God');
await page.press('#newTopic', 'Enter');
check(await page.$eval('[data-topic="Armor of God"]', (b) => b.classList.contains('on')), 'verse: a new topic can be added and is selected');
await page.fill('#f_translation', '');
await page.click('#postForm button[type=submit]');
check((await text('#postForm')).includes('Name the translation'), 'verse: an empty translation is flagged');
await page.fill('#f_translation', 'BSB');
check((await text('#preview')).includes('BSB'), 'verse: preview shows the typed translation');
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.list .row');
check(await rowStatus('Ephesians 6:10-18') === 'Published', 'verse: published');

// ---------- reel: series and episode number ----------
await page.click('.side [data-view="new"]');
await page.click('[data-new="reel"]');
check(await page.$eval('#f_series', (i) => i.getAttribute('list') === 'seriesList') && await page.$eval('#f_episode', (i) => i.type === 'number'), 'reel: Series input with a list of existing names and an Episode # number');
await page.fill('#f_title', 'Test episode one');
await page.fill('#f_youtube', 'https://youtube.com/shorts/abcdefghijk');
await page.fill('#f_series', 'Test series');
await page.fill('#f_episode', '2');
check(await page.$eval('#f_page_style', (s) => [...s.options].map((o) => o.textContent).join('|')) === 'Auto from reel|Dark|Light|Glass clear', 'reel: Page style offers Auto from reel / Dark / Light / Glass clear');
check(await page.$eval('#f_page_color', (i) => i.value === '' && /Auto/.test(i.placeholder)) && !!(await page.$('#f_page_color_pick[type=color]')), 'reel: Page colour has a picker and is empty (auto) by default');
await page.selectOption('#f_page_style', 'light');
await page.$eval('#f_page_color_pick', (i) => { i.value = '#2a7f62'; i.dispatchEvent(new Event('input', { bubbles: true })); });
check(await page.$eval('#f_page_color', (i) => i.value) === '#2a7f62', 'reel: the colour picker fills the Page colour box');
await page.locator('#f_page_style').evaluate((s) => s.closest('.two').scrollIntoView({ block: 'center' }));
await page.locator('.two:has(#f_page_style)').screenshot({ path: 'test-results/studio-page-style.png' });
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.list .row');
const saved = await page.evaluate(async () => (await window.LLStore.publishedPosts()).filter((p) => p.title === 'Test episode one')[0]);
check(saved && saved.fields.page_style === 'light' && saved.fields.page_color === '#2a7f62', `reel: page style and colour are saved in fields.page_style / fields.page_color (${JSON.stringify(saved && [saved.fields.page_style, saved.fields.page_color])})`);
check(saved && saved.fields.series === 'Test series' && saved.fields.episode === 2, `reel: series and episode number are saved (${JSON.stringify(saved && { s: saved.fields.series, e: saved.fields.episode })})`);
await page.click('.side [data-view="new"]');
await page.click('[data-new="reel"]');
check(await page.$$eval('#seriesList option', (o) => o.map((x) => x.value).includes('Test series')), 'reel: existing series names are suggested');
await page.click('.side [data-view="posts"]').catch(() => {});

// ---------- reel: video poster (thumbnail) ----------
{
  const tinyReel = readFileSync(new URL('./fixtures/tiny-reel.webm', import.meta.url));
  const png1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.click('.side [data-view="new"]');
  await page.click('[data-new="reel"]');
  check(!(await page.$('#f_poster')), 'poster: no poster picker before a video is uploaded');
  // Phone width: the preview is above the form and must not stay stuck over it while scrolling.
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.$eval('#f_caption', (e) => e.scrollIntoView({ block: 'center' }));
    const reachable = await page.$eval('#f_caption', (e) => { const r = e.getBoundingClientRect(), x = document.elementFromPoint(r.left + 10, r.top + r.height / 2); return x === e || e.contains(x); });
    check(reachable, `editor: the form is not covered by the preview when scrolled (${w}px)`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.fill('#f_title', 'Poster test video');
  await page.setInputFiles('#f_file', { name: 'poster-test.webm', mimeType: 'video/webm', buffer: tinyReel });
  await page.waitForFunction(() => { const i = document.querySelector('img#posterPv'); return i && i.src && i.naturalWidth > 0; }, null, { timeout: 20000 }).catch(() => {});
  const auto = await page.evaluate(async () => {
    const i = document.querySelector('img#posterPv');
    if (!i) return null;
    const b = await (await fetch(i.src)).blob();
    return { w: i.naturalWidth, h: i.naturalHeight, type: b.type };
  });
  check(auto && auto.type === 'image/webp' && auto.w === 180 && auto.h === 320, `poster: without a chosen image, a WebP frame is taken from the video (${JSON.stringify(auto)})`);
  check(await page.$eval('#posterFrame', (b) => b.textContent.includes('frame')), 'poster: the author can take a frame again');
  await page.setInputFiles('#f_poster', { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  check((await text('.errmsg')).includes('JPG, PNG or WebP'), 'poster: a non-image file is refused');
  await page.setInputFiles('#f_poster', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(5 * 1024 * 1024 + 10) });
  check((await text('.errmsg')).includes('limit is 5 MB'), 'poster: an image over 5 MB is refused');
  await page.click('#postForm button[type=submit]');
  await page.waitForSelector('.list .row');
  let pv = await page.evaluate(async () => (await window.LLStore.publishedPosts()).filter((p) => p.title === 'Poster test video')[0]);
  check(pv && /^local-media:/.test(pv.fields.poster || '') && pv.fields.poster_auto === true && pv.fields.poster !== pv.media_url, `poster: the made poster is saved in fields.poster (${JSON.stringify(pv && pv.fields.poster)})`);
  const autoUrl = pv && pv.fields.poster;
  // The author's own image replaces it and is kept when the post is edited again.
  await page.click('.row >> text=Poster test video');
  await page.waitForSelector('#f_poster', { state: 'attached' });
  await page.setInputFiles('#f_poster', { name: 'cover.png', mimeType: 'image/png', buffer: png1 });
  await page.waitForFunction((a) => { const i = document.querySelector('img#posterPv'); return i && i.dataset.src && i.dataset.src !== a && !document.querySelector('.upload.busy'); }, autoUrl, { timeout: 10000 }).catch(() => {});
  await page.click('#postForm button[type=submit]');
  await page.waitForSelector('.list .row');
  pv = await page.evaluate(async () => (await window.LLStore.publishedPosts()).filter((p) => p.title === 'Poster test video')[0]);
  check(pv && pv.fields.poster && pv.fields.poster !== autoUrl && !pv.fields.poster_auto, 'poster: a chosen image replaces the made poster');
  // The app uses it: <video poster> and the Watch card.
  const app = await context.newPage();
  await app.goto(base + '#watch');
  await app.waitForFunction(() => window.LL_CONTENT && window.LL_CONTENT.reels.some((r) => r.title === 'Poster test video'), null, { timeout: 10000 }).catch(() => {});
  const r = await app.evaluate(() => { const r = window.LL_CONTENT.reels.find((x) => x.title === 'Poster test video'); return r && { poster: r.poster, src: r.src }; });
  check(r && /^blob:/.test(r.poster) && r.poster !== r.src, `app: the Studio poster is on the video (${JSON.stringify(r)})`);
  await app.close();
}

// ---------- reel: pasted video link needs a poster ----------
{
  await page.click('.side [data-view="new"]');
  await page.click('[data-new="reel"]');
  await page.fill('#f_title', 'Pasted link reel');
  await page.fill('#f_media_url', 'https://media.littlesaltandlight.com/reels/the-whisper.1fb48680.mp4');
  await page.click('#postForm button[type=submit]');
  await page.waitForTimeout(300);
  check(await page.$('.poster-need') !== null, 'poster: a video with no poster shows a clear prompt');
  check((await page.$$eval('.errmsg', (e) => e.map((x) => x.textContent).join(' '))).includes('Add a poster before publishing'), 'poster: publishing a video without a poster is blocked');
  await page.fill('#f_poster_url', 'https://media.littlesaltandlight.com/reels/test-poster.jpg');
  await page.click('#postForm button[type=submit]');
  await page.waitForSelector('.list .row');
  const pp = await page.evaluate(async () => (await window.LLStore.publishedPosts()).filter((p) => p.title === 'Pasted link reel')[0]);
  check(pp && pp.media_url === 'https://media.littlesaltandlight.com/reels/the-whisper.1fb48680.mp4' && pp.fields.poster === 'https://media.littlesaltandlight.com/reels/test-poster.jpg' && !pp.fields.poster_auto, `poster: pasted video and poster links are saved (${JSON.stringify(pp && { m: pp.media_url, p: pp.fields.poster })})`);
}

// ---------- devotion: draft, then publish after fixing ----------
await page.click('.side [data-view="new"]');
await page.click('[data-new="devotion"]');
await page.fill('#f_title', 'Rest for the weary <img src=x onerror=alert(1)>');
await page.click('#saveDraft');
await page.waitForSelector('.list .row');
check(await rowStatus('Rest for the weary <img src=x onerror=alert(1)>') === 'Draft', 'devotion: saved as a draft with just a title');
await page.click('.row >> text=Rest for the weary');
await page.click('#postForm button[type=submit]');
const devErrors = await page.$$eval('.errmsg', (e) => e.map((x) => x.textContent).join(' | '));
check(devErrors.includes('Write the devotion') && devErrors.includes('one-line summary'), 'devotion: publishing without the reading or summary is blocked');
await page.fill('#f_teaser', 'Jesus invites tired people to come to him.');
await page.fill('#f_body', 'When the week feels long, **Jesus** says come.\n\nHe does not say _hurry_.');
await page.fill('#f_prayer', 'Lord, give us rest tonight. Amen.');
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.list .row');
check(await rowStatus('Rest for the weary <img src=x onerror=alert(1)>') === 'Published', 'devotion: published after fixing');

// ---------- audio: upload a real file ----------
await page.click('.side [data-view="new"]');
await page.click('[data-new="audio"]');
await page.fill('#f_title', 'Evening prayer');
await page.click('#postForm button[type=submit]');
check((await text('.errmsg')).includes('Upload the recording'), 'audio: publishing without a recording is blocked');
await page.setInputFiles('#f_file', { name: 'evening-prayer.wav', mimeType: 'audio/wav', buffer: silentWav() });
await page.waitForFunction(() => document.querySelector('.upload b')?.textContent === 'evening-prayer.wav');
await page.waitForFunction(() => document.getElementById('f_minutes')?.value, null, { timeout: 5000 }).catch(() => {});
check((await page.inputValue('#f_minutes')) === '0:02', 'audio: length is read from the file');
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.list .row');
check(await rowStatus('Evening prayer') === 'Published', 'audio: published with its file');

// ---------- game update: scheduled for tomorrow ----------
await page.click('.side [data-view="new"]');
await page.click('[data-new="game"]');
await page.fill('#f_title', 'Jonah is coming soon');
await page.fill('#f_text', 'Journey 5 is being built.');
await page.click('[data-mode="schedule"]');
check(await page.inputValue('#f_publish_time') === '00:00', 'schedule: time defaults to 00:00 (SGT)');
await page.fill('#f_publish_date', '2020-01-01'); await page.fill('#f_publish_time', '08:00');
await page.click('#postForm button[type=submit]');
check((await text('.errmsg')).includes('future'), 'game: a past schedule time is rejected');
const tomorrowSgt = new Date(Date.now() + 86400000 + 8 * 3600e3).toISOString().slice(0, 10);
await page.fill('#f_publish_date', tomorrowSgt); await page.fill('#f_publish_time', '18:30');
check((await text('#whenSay')).includes('6:30 PM SGT'), 'schedule: the chosen moment is spelled out in SGT');
await page.screenshot({ path: 'test-results/studio-schedule-picker.png' });
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.list .row');
check(await rowStatus('Jonah is coming soon') === 'Scheduled', 'game: scheduled for tomorrow');
{
  const g = await page.evaluate(() => JSON.parse(localStorage.getItem('ll.posts.v1')).find((p) => p.title === 'Jonah is coming soon'));
  check(g && g.publish_at === new Date(tomorrowSgt + 'T18:30:00+08:00').toISOString(), 'game: stored at 18:30 Singapore time');
  const cell = await page.$$eval('.list .row', (rs) => rs.find((r) => r.textContent.includes('Jonah is coming soon')).querySelector('.c-date').textContent);
  check(/Goes live/.test(cell) && /6:30 PM SGT/.test(cell) && /20\d\d/.test(cell), 'table: scheduled row says Goes live, year and 6:30 PM SGT (' + cell.trim() + ')');
  await page.click('.list .row:has-text("Jonah is coming soon") .titlebtn');
  await page.waitForSelector('#f_publish_time');
  check(await page.inputValue('#f_publish_time') === '18:30' && await page.inputValue('#f_publish_date') === tomorrowSgt, 'game: reopening keeps the date and 18:30');
  await page.click('[data-view="posts"]'); await page.waitForSelector('.list .row');
}
await page.screenshot({ path: 'test-results/studio-posts.png', fullPage: true });

// ---------- media and team ----------
await page.click('.side [data-view="media"]');
check((await page.$$eval('.media b', (b) => b.map((x) => x.textContent))).includes('evening-prayer.wav'), 'media: the uploaded recording is listed');
await page.click('.side [data-view="team"]');
await page.fill('#inviteEmail', 'helper@example.org');
await page.selectOption('#inviteRole', 'contributor');
await page.click('#inviteForm button[type=submit]');
await page.waitForFunction(() => document.body.textContent.includes('helper@example.org'));
check(true, 'team: owner adds a contributor');

// ---------- the app shows the posts ----------
const app = await context.newPage();
app.on('pageerror', (e) => errors.push(e.message));
await app.goto(base + '#today');
await app.waitForSelector('#app[data-ready]');
await app.waitForTimeout(300);
const firstSlide = await app.$eval('#pFeed .p-slide', (s) => s.textContent);
check(firstSlide.includes('Psalm 23') || firstSlide.includes('Rest for the weary') || firstSlide.includes('Evening prayer'), 'app: Studio posts lead the Today feed');
check(!(await app.$('#pFeed img')), 'app: text from the Studio is shown as text, never as HTML');
check(!(await app.isVisible('.p-tab[data-tab="verses"]')), 'menus: Verses is hidden by default');
// The owner switches Verses on in the Studio.
await page.click('.side [data-view="site"]');
check(await page.isDisabled('#siteForm select[disabled]'), 'menus: Today cannot be switched off');
await page.selectOption('#nav_verses', 'on');
await page.fill('#nav_message', 'Almost ready!');
await page.click('#siteForm button[type=submit]');
await page.waitForTimeout(200);
check(await page.$eval('#nav_verses', (s) => s.value) === 'on', 'menus: the setting is saved');
check(!(await app.$('#pFeed .s-studio .verse')), 'content: a published verse post is not on Today while verses are off (default)');
check(await page.$eval('#content_verses', (c) => !c.checked), 'content: the Studio shows verse cards off by default');
await page.check('#content_verses');
await page.click('#contentForm button[type=submit]');
await page.waitForTimeout(200);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('ll.settings.v1')).content.verses === true), 'content: the owner switch saves content.verses (upsert of the content key)');
await app.reload();
await app.waitForSelector('#app[data-ready]');
check(!!(await app.$('#pFeed .s-studio .verse')), 'content: with verses switched on, the published verse post is back on Today');
check(await page.$eval('#reel_page_style', (s) => s.value) === 'auto', 'reel page: the site-wide default is Auto');
await page.selectOption('#reel_page_style', 'clear');
await page.click('#reelPageForm button[type=submit]');
await page.waitForTimeout(200);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('ll.settings.v1')).reel_page.style === 'clear'), 'reel page: the owner saves the site default in site_settings key reel_page');
// Footer style (site setting footer_style): B or C with a small drawing of each; saving changes the site on its next load.
check(await page.$$eval('#footerForm .ff-choice', (c) => c.length === 2 && c.every((x) => x.querySelector('.ffp') && x.querySelector('small').textContent.length > 20)) && await page.$eval('#footerForm input[value="C"]', (i) => i.checked), 'footer: the Studio offers B and C with a preview and description, C selected by default');
await page.$eval('#footerForm', (f) => f.scrollIntoView({ block: 'center' })); await page.waitForTimeout(100);
if (process.env.SHOTS13) await page.screenshot({ path: process.env.SHOTS13 + '/studio-footer-style.png' });
await page.click('#footerForm .ff-choice:has(input[value="B"])');
await page.click('#footerForm button[type=submit]');
await page.waitForTimeout(200);
check(await page.evaluate(() => JSON.parse(localStorage.getItem('ll.settings.v1')).footer_style === 'B'), 'footer: saving stores "B" in site_settings key footer_style');
await app.goto(base + 'read'); await app.waitForSelector('#app[data-ready]'); await app.waitForTimeout(200);
check(await app.$eval('#app', (a) => a.classList.contains('ff-B') && !a.classList.contains('ff-C')), 'footer: the site switches to B on its next load (no rebuild)');
await page.click('#footerForm .ff-choice:has(input[value="C"])'); await page.click('#footerForm button[type=submit]'); await page.waitForTimeout(200);
await app.goto(base); await app.waitForSelector('#app[data-ready]');
check(await app.$('#pFeed [data-open-verse]') !== null, 'app: long Today verse offers a full-passage action');
await app.click('#pFeed [data-open-verse]');
check(await app.$eval('#pStory', (el) => el.classList.contains('long')), 'app: long verse opens in a readable passage view');
check((await app.$eval('#pStory .verse', (el) => el.textContent)).includes('for all the saints.'), 'app: full passage remains available when opened');
check(!(await app.$eval('#pStory', (el) => el.querySelector('.verse').getBoundingClientRect().bottom > el.querySelector('.acts').getBoundingClientRect().top)), 'app: passage and Save image/Share buttons do not overlap');
await app.keyboard.press('Escape');
await app.click('.p-tab[data-tab="verses"]');
await app.waitForTimeout(150);
check((await app.$eval('#pGrid', (g) => g.textContent)).includes('Be strong in the Lord'), 'app: new verse is in Verses');
await app.click('#pGrid .p-tile.long');
check((await app.$eval('#pStory .verse', (el) => el.textContent)).includes('for all the saints.'), 'app: long verse tile opens the complete passage');
await app.keyboard.press('Escape');
check((await app.$eval('#pChips', (c) => c.textContent)).includes('Armor of God'), 'app: a topic added in the Studio has its own chip');
await app.click('.p-tab[data-tab="read"]');
await app.waitForTimeout(150);
check((await app.$eval('#pCards', (g) => g.textContent)).includes('Rest for the weary'), 'app: new devotion is in Read');
await app.click('#pCards .p-card');
await app.waitForTimeout(250);
check((await app.$eval('#pArticle', (a) => a.innerHTML)).includes('<b>Jesus</b>'), 'app: devotion formatting (bold) is shown');
await app.screenshot({ path: 'test-results/app-studio-article.png' });
await app.keyboard.press('Escape');
await app.click('.p-tab[data-tab="listen"]');
await app.waitForTimeout(150);
check((await app.$eval('#pEps', (g) => g.textContent)).includes('Evening prayer'), 'app: new audio is in Listen');
await app.click('.p-tab[data-tab="play"]');
await app.waitForTimeout(150);
check(!(await app.$eval('#pGameNews', (g) => g.textContent)).includes('Jonah is coming soon'), 'app: scheduled post stays hidden until its time');
await app.close();

// ---------- edit a published post, with history ----------
await page.click('.side [data-view="posts"]');
await page.click('.row >> text=Ephesians 6:10-18');
await page.waitForSelector('#history li');
check((await text('#history')).includes('Published'), 'history: the first version is listed');
check((await page.$eval('#postForm button[type=submit]', (b) => b.textContent)) === 'Update', 'edit: a published post can be updated');
await page.fill('#f_verse', 'Finally, be strong in the Lord (edited).');
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.list .row');
check(await rowStatus('Ephesians 6:10-18') === 'Published', 'edit: the post stays published after updating');
const app2 = await context.newPage();
app2.on('pageerror', (e) => errors.push(e.message));
await app2.goto(base + '#verses');
await app2.waitForSelector('#app[data-ready]');
const g2 = await app2.$eval('#pGrid', (g) => g.textContent);
check(g2.includes('(edited)'), 'edit: the app shows the updated text');
await app2.close();
await page.click('.row >> text=Ephesians 6:10-18');
await page.waitForSelector('#history li:nth-child(2)');
check((await page.$$('#history li')).length === 2, 'history: the update is a second version');
await page.click('#history li:first-child summary');
const diff = await text('#history li:first-child dl');
check(diff.includes('Verse text') && diff.includes('(edited)') && diff.includes('Be strong in the Lord'), 'history: shows what changed, before and after');
await page.click('#history [data-restore]');
check((await page.$eval('#f_verse', (t) => t.value)).startsWith('Be strong in the Lord'), 'history: Restore loads the older version into the form');
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.list .row');
await page.click('.row >> text=Ephesians 6:10-18');
await page.waitForSelector('#history li:nth-child(3)');
check((await page.$eval('#f_verse', (t) => t.value)).startsWith('Be strong in the Lord'), 'history: the restored version is saved as the newest version');

// ---------- built-in content: hide items that came with the app ----------
await page.click('.side [data-view="builtins"]');
await page.waitForSelector('#builtinList .row');
const bRows = await page.$$eval('#builtinList .row', (r) => r.map((x) => x.dataset.key));
check(bRows.includes('audio:keep-building') && bRows.includes('devotion:brave') && bRows.includes('reel:why-jonathan-gave-david-his-robe') && bRows.includes('verse:joshua-1-9'),
  'built-ins: audio, devotions, reels and verses are all listed');
check((await page.$$eval('#builtinList .row', (r) => r.filter((x) => x.querySelector('.pill').textContent === 'Hidden').map((x) => x.dataset.key))).join() === 'reel:why-jonathan-gave-david-his-robe,reel:noah-kept-building,reel:jonah-and-the-second-chance', 'built-ins: everything is visible by default except the 3 placeholder reels (hidden: true)');
await page.click('[data-bhide="devotion:brave"]');
await page.click('[data-bhide="reel:noah-kept-building"]');
await page.click('#saveHidden');
await page.waitForTimeout(200);
check(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('ll.settings.v1')).builtins_hidden)) === JSON.stringify({ hidden: ['devotion:brave'], shown: ['reel:noah-kept-building'] }),
  'built-ins: Save stores the hidden list and the default-hidden items shown again (builtins_hidden)');
check(await page.$eval('[data-key="devotion:brave"] .pill', (p) => p.textContent) === 'Hidden', 'built-ins: the item shows as Hidden after saving');
const app3 = await context.newPage();
app3.on('pageerror', (e) => errors.push(e.message));
await app3.goto(base);
await app3.waitForSelector('#app[data-ready]');
check(await app3.evaluate(() => !window.LL_CONTENT.devotions.some((d) => d.slug === 'brave') && !window.LL_CONTENT.reels.some((r) => r.title.startsWith('Why Jonathan')) && window.LL_CONTENT.reels.some((r) => r.title === 'Noah kept building')), 'app: hidden built-ins are left out; a default-hidden reel shown in the Studio comes back');
check((await app3.$$('[data-sheet="-1"], [data-reel="-1"], [data-ep="-1"]')).length === 0, 'app: no buttons point at hidden items');
check(!(await app3.$('#pFeed .p-slide.s2:not(.s-studio)')) && !(await app3.$('#pFeed .p-slide.s3:not(.s-studio)')), 'app: Today cards built around hidden items are removed');
const row = await app3.evaluate(() => {
  const f = document.getElementById('pFeed').getBoundingClientRect();
  const s4 = document.querySelector('#pFeed .p-slide.s4').getBoundingClientRect();
  const rows = {};
  document.querySelectorAll('#pFeed .p-slide').forEach((e) => { const b = e.getBoundingClientRect(); rows[Math.round(b.top)] = Math.max(rows[Math.round(b.top)] || 0, b.right); });
  return { cls: document.getElementById('pFeed').className, gapRight: Math.round(Math.max(...Object.values(rows).map((r) => f.right - r))) };
});
check(/mid-[12]/.test(row.cls) && row.gapRight < 4, `app: the Today row is filled to the edge, no row ends early (${row.cls}, ${row.gapRight}px)`);
await app3.close();
await page.click('[data-bhide="devotion:brave"]');
await page.click('[data-bhide="reel:noah-kept-building"]');
await page.click('#saveHidden');
await page.waitForTimeout(200);

// ---------- post list: search, filters, sorting, 20 at a time ----------
{
  const saved = await page.evaluate(() => localStorage.getItem('ll.posts.v1'));
  await page.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('ll.posts.v1')), now = Date.now();
    for (let i = 0; i < 30; i++) all.push({ id: 9000 + i, type: i % 2 ? 'audio' : 'reel', status: i % 3 ? 'published' : 'draft', title: 'Bulk post ' + String(i).padStart(2, '0'), slug: 'bulk-post-' + i,
      show_on_today: false, publish_at: new Date(now - (i + 400) * 86400000).toISOString(), updated_at: new Date().toISOString(), fields: {}, media_url: '' });
    localStorage.setItem('ll.posts.v1', JSON.stringify(all));
  });
  await page.reload();
  await page.waitForSelector('.ptable');
  const total = await page.evaluate(() => JSON.parse(localStorage.getItem('ll.posts.v1')).length);
  check(await page.$$eval('.ptable tbody .row', (r) => r.length) === 20, 'posts: shows 20 at a time');
  check((await text('.more')).includes('Showing 20 of ' + total), 'posts: says how many are shown');
  await page.click('#loadMore');
  check(await page.$$eval('.ptable tbody .row', (r) => r.length) === Math.min(40, total), 'posts: “Show more” adds the next 20');
  check(await page.$$eval('.ptable thead th[aria-sort]', (h) => h.map((x) => x.textContent.replace(/[▲▼]/g, '')).join(',')) === 'Title,Type,Status,Date,Views', 'posts: table columns are Title, Type, Status, Date, Views');
  await page.fill('#postSearch', 'bulk post 0');
  check(await page.$$eval('.ptable tbody .row', (r) => r.length) === 10 && await page.evaluate(() => document.activeElement.id === 'postSearch'), 'posts: search filters as you type and keeps focus');
  await page.fill('#postSearch', 'zzz nothing');
  check((await text('#postResults')).includes('Nothing matches'), 'posts: a search with no results explains itself');
  await page.click('#clearFilters');
  check(await page.$eval('#postSearch', (i) => i.value) === '' && await page.$$eval('.ptable tbody .row', (r) => r.length) === 20, 'posts: “Show all posts” clears the search');
  await page.click('[data-filter="audio"]');
  await page.click('[data-sfilter="draft"]');
  check(await page.$$eval('.ptable tbody .row', (r) => r.every((x) => x.querySelector('.kind').textContent === 'Audio' && x.querySelector('.pill').textContent === 'Draft')) && await page.$$eval('.ptable tbody .row', (r) => r.length) === 5, 'posts: type and status chips combine');
  await page.click('[data-filter="all"]'); await page.click('[data-sfilter="all"]');
  await page.click('[data-sort="title"]');
  const titles = await page.$$eval('.ptable tbody .row b', (b) => b.map((x) => x.textContent));
  check(titles.join('|') === titles.slice().sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1).join('|') && await page.$eval('th[aria-sort="ascending"]', (t) => t.textContent.startsWith('Title')), 'posts: a column title sorts A–Z');
  await page.click('[data-sort="title"]');
  check(await page.$eval('th[aria-sort="descending"]', (t) => t.textContent.startsWith('Title')), 'posts: pressing it again sorts Z–A');
  await page.click('.ptable tbody .row .kind');
  await page.waitForSelector('#postForm');
  check(true, 'posts: tapping anywhere on a row opens the editor');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.side [data-view="posts"]');
  check(await page.$eval('.ptable thead', (h) => getComputedStyle(h).display === 'none') && await page.$eval('.ptable tbody .row', (r) => getComputedStyle(r).display === 'grid' && r.getBoundingClientRect().height < 90), 'posts (phone): compact rows instead of a wide table');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'posts (phone): nothing sticks out sideways');
  await page.selectOption('#postSort', 'title-asc');
  check(await page.$eval('th[aria-sort="ascending"]', (t) => t.textContent.startsWith('Title')), 'posts (phone): the Sort menu sorts');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'test-results/studio-posts-list.png' });
  await page.evaluate((s) => localStorage.setItem('ll.posts.v1', s), saved);

  // ---------- Insights: plain-language cards, chart, top posts, friendly sources (mocked API) ----------
  const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
  let asked = [];
  const restSlug = await page.evaluate(() => JSON.parse(localStorage.getItem('ll.posts.v1')).find((p) => p.title.startsWith('Rest for the weary')).slug);
  await page.route('**/api/insights**', (r) => {
    const d = +new URL(r.request().url()).searchParams.get('days'); asked.push(d);
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(d === 90 ? { connected: true, days: 90, total: { views: 0, visits: 0 }, previous: { views: 0, visits: 0 }, series: [], pages: [], countries: [], sources: [], plays: {}, playsTotal: { started: 0, finished: 0, read_end: 0 }, playsPrevious: { started: 0, finished: 0, read_end: 0 } } : {
      connected: true, days: d, total: { views: 240, visits: 120 }, previous: { views: 200, visits: 100 },
      series: [{ date: day(2), views: 100, visits: 50 }, { date: day(1), views: 140, visits: 70 }],
      pages: [{ path: '/read/' + restSlug, views: 90, visits: 60, countries: [], referrers: [] }, { path: '/', views: 150, visits: 100, countries: [], referrers: [] }],
      countries: [{ name: 'SG', views: 30 }, { name: 'ID', views: 10 }], sources: [{ name: 'Google search', views: 20 }, { name: 'Direct', views: 10 }],
      vitals: { samples: 10, lcp: 1800, inp: 100, cls: 0.02 },
      plays: { ['devotion:' + restSlug]: { started: 0, finished: 0, read_end: 12 } }, playsTotal: { started: 8, finished: 4, read_end: 12 }, playsPrevious: { started: 8, finished: 2, read_end: 6 } }) });
  });
  await page.reload();
  await page.waitForSelector('.shell');
  await page.evaluate(() => { window.LLStore.accessToken = () => Promise.resolve('test-token'); });
  await page.click('.side [data-view="insights"]');
  await page.waitForSelector('#insVisits');
  check(asked.includes(30) && await page.$eval('[data-days="30"]', (b) => b.getAttribute('aria-pressed') === 'true'), 'insights: opens on the last 30 days');
  check(await page.$$eval('[data-days]', (b) => b.map((x) => x.dataset.days).join()) === '7,30,90', 'insights: 7, 30 and 90 day chips');
  check((await text('#insVisits')).includes('People visited') && (await text('#insVisits')).includes('120') && (await text('#insVisits')).includes('20% more than the 30 days before'), 'insights: “People visited” with a friendly change');
  check((await text('#insReads')).includes('Read to the end') && (await text('#insReads')).includes('100% more'), 'insights: “Read to the end” card');
  check((await text('#insPlays')).includes('About the same'), 'insights: no change is said plainly');
  check(await page.$$eval('.icard', (c) => c.every((x) => x.title && x.querySelector('.ihelp').textContent.length > 10)), 'insights: every number has a one-line explanation');
  check(await page.$$eval('.trend .tbar', (r) => r.length) === 2, 'insights: a bar per day in the trend chart');
  const longDay = (n) => { const dt = new Date(day(n) + 'T00:00:00'); return dt.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  check((await text('.tsum')).includes('Total 120') && (await text('.tsum')).includes('Busiest day ' + longDay(1) + ' (70)'), 'chart: total and busiest day under the title');
  check(await page.$$eval('.tbar', (b) => b.every((x) => /\d+ visits$/.test(x.getAttribute('aria-label')))), 'chart: every bar has an accessible label');
  await page.hover('.tbar >> nth=0');
  check((await text('#trendSel')) === longDay(2) + ' · 50 visits', 'chart: hovering a bar shows its number');
  await page.focus('.tbar >> nth=1');
  check((await text('#trendSel')) === longDay(1) + ' · 70 visits', 'chart: keyboard focus shows its number');
  {
    const ph = await context.newPage();
    await ph.setViewportSize({ width: 390, height: 844 });
    await ph.route('**/api/insights**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ connected: true, days: 30, total: { views: 240, visits: 120 }, previous: { views: 200, visits: 100 },
      series: [{ date: day(3), views: 10, visits: 7 }, { date: day(2), views: 100, visits: 50 }, { date: day(1), views: 140, visits: 70 }], pages: [], countries: [], sources: [], plays: {}, playsTotal: { started: 0, finished: 0, read_end: 0 }, playsPrevious: { started: 0, finished: 0, read_end: 0 } }) }));
    await ph.goto(base + 'studio/');
    await ph.waitForSelector('.shell');
    await ph.evaluate(() => { window.LLStore.accessToken = () => Promise.resolve('test-token'); });
    await ph.click('.side [data-view="insights"]');
    await ph.waitForSelector('.tbar');
    const box = await ph.$eval('.tbar >> nth=0', (b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height }; }).catch(async () => { const r = await (await ph.$$('.tbar'))[0].boundingBox(); return { w: r.width, h: r.height }; });
    check(box.h >= 44, 'chart (phone): bars are tall enough to tap');
    await (await ph.$$('.tbar'))[0].scrollIntoViewIfNeeded();
    await (await ph.$$('.tbar'))[0].click();
    const sel = await ph.$eval('#trendSel', (e) => ({ t: e.textContent, r: e.getBoundingClientRect().right, l: e.getBoundingClientRect().left }));
    check(sel.t === longDay(3) + ' · 7 visits' && sel.l >= 0 && sel.r <= 390, 'chart (phone): tapping a bar shows its date and count on screen');
    check(await ph.$eval('.tbar.on', (b) => b.getAttribute('aria-pressed') === 'true'), 'chart (phone): the tapped bar is highlighted');
    await (await ph.$$('.tbar'))[0].evaluate((b) => { b.closest('.ipanel').scrollIntoView(); scrollBy(0, -130); });
    await ph.screenshot({ path: 'test-results/studio-chart-390.png' });
    await ph.close();
  }
  check((await text('#topPosts li:first-child')).includes('Rest for the weary') && (await text('#topPosts')).includes('12 read to the end') && !(await text('#topPosts')).includes('Home'), 'insights: top posts use post titles and plain labels');
  const where = await text('.igrid');
  check(where.includes('Singapore') && where.includes('Indonesia') && where.includes('Google search') && where.includes('Direct') && where.includes('Home (Today)'), 'insights: countries, sources and pages have friendly names');
  check((await text('.speed')).includes('Fast'), 'insights: site speed in one word, details tucked away');
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'insights (phone): nothing sticks out sideways');
  await page.evaluate(() => scrollTo(0, 0));
  check(await page.$eval('#signout', (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && r.top >= 0; }), 'insights (phone): Sign out is still visible');
  check(!/\b[A-Z]{2} \d+\b|ID \d+ ·/.test(await text('.igrid')), 'insights (phone): no raw country codes like “ID 42 · US 11”');
  await page.screenshot({ path: 'test-results/studio-insights-390.png', fullPage: true });
  await page.click('.side [data-view="posts"]');
  await page.waitForSelector('.list .row, .ptable, table');
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'posts (phone): list fits the screen');
  await page.screenshot({ path: 'test-results/studio-posts-390.png', fullPage: true });
  await page.click('.side [data-view="insights"]');
  await page.waitForSelector('#insVisits');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('[data-days="90"]');
  await page.waitForSelector('.iempty');
  check((await text('#topPosts, .ipanel:nth-of-type(2)')).length > 0 && (await page.$$eval('.iempty', (e) => e.length)) >= 3, 'insights: helpful empty states when there is nothing yet');
  await page.unroute('**/api/insights**');
  await page.click('.side [data-view="posts"]');
}

// ---------- delete, sign out, strangers stay out ----------
await page.click('.side [data-view="posts"]');
await page.click('.row >> text=Jonah is coming soon');
await page.click('#del');
await page.click('#delYes');
await page.waitForSelector('.list');
check(await rowStatus('Jonah is coming soon') === null, 'posts: delete asks first, then removes the post');
check(await page.evaluate(() => JSON.parse(localStorage.getItem('ll.history.v1')).some((r) => r.action === 'deleted' && r.snapshot.title === 'Jonah is coming soon')),
  'history: a deleted post is kept in the history');
await page.click('#signout');
await page.waitForSelector('#signinForm');
await page.fill('#email', 'stranger@example.org');
await page.click('#signinForm button[type=submit]');
await page.waitForSelector('.errmsg');
check((await text('.errmsg')).includes('isn’t on the Salt and Light team'), 'sign-in: people not on the team are turned away');

// ---------- Supabase mode: password sign-in and change password (Supabase is faked) ----------
const sctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await sctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
await sctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript',
  body: "window.LL_CONFIG = { supabaseUrl: 'https://fake-project.supabase.co', supabaseAnonKey: 'sb_publishable_test' };" }));
await sctx.route('https://fake-project.supabase.co/**', (r) => r.fulfill({ contentType: 'application/json', body: '[]' }));
await sctx.addInitScript(() => {
  const TEAM = { 'owner@example.org': 'owner' }, PW = { 'owner@example.org': 'correct horse battery', 'stranger@example.org': 'stranger password 1' };
  const log = window.__auth = { otp: [], updates: [], session: null };
  const q = (table) => {
    const b = { _eq: null, select() { return b; }, eq(_, v) { b._eq = v; return b; }, order() { return b; },
      maybeSingle() { return Promise.resolve({ data: TEAM[b._eq] ? { role: TEAM[b._eq] } : null, error: null }); },
      then(res, rej) { return Promise.resolve({ data: [], error: null }).then(res, rej); } };
    return b;
  };
  const client = {
    auth: {
      getSession: () => Promise.resolve({ data: { session: log.session } }),
      signInWithPassword: ({ email, password }) => {
        if (PW[email] !== password) return Promise.resolve({ data: null, error: { message: 'Invalid login credentials' } });
        log.session = { user: { email }, access_token: 't' }; return Promise.resolve({ data: { session: log.session }, error: null });
      },
      signInWithOtp: (o) => { log.otp.push(o); return Promise.resolve({ data: {}, error: null }); },
      updateUser: (u) => { log.updates.push(u.password.length); return Promise.resolve({ data: {}, error: null }); },
      signOut: () => { log.session = null; return Promise.resolve({ error: null }); },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: q,
    storage: { from: () => ({ list: () => Promise.resolve({ data: [], error: null }) }) },
  };
  window.supabase = { createClient: () => client };
});
const sp = await sctx.newPage();
const consoleText = [];
sp.on('console', (m) => consoleText.push(m.text()));
sp.on('pageerror', (e) => errors.push('supabase mode: ' + e.message));
const stext = (sel) => sp.$eval(sel, (el) => el.textContent);
await sp.goto(base + 'studio/');
await sp.waitForSelector('#signinForm #password');
check(await sp.$eval('#password', (i) => i.type === 'password' && i.autocomplete === 'current-password'), 'password: sign-in asks for email and password');
check(!/sign up|create account|register/i.test(await stext('#signinForm')), 'password: there is no sign-up option');
check(await sp.$('#magicLink') !== null, 'password: the email link is only a small secondary option');
await sp.fill('#email', 'owner@example.org');
await sp.click('#signinForm button[type=submit]');
check((await stext('.errmsg')).includes('Enter your password'), 'password: an empty password is explained');
await sp.fill('#password', 'wrong password here');
await sp.click('#signinForm button[type=submit]');
await sp.waitForFunction(() => /don’t match/.test(document.querySelector('.errmsg')?.textContent || ''));
check(true, 'password: a wrong password gets a friendly message');
await sp.fill('#email', 'stranger@example.org');
await sp.fill('#password', 'stranger password 1');
await sp.click('#signinForm button[type=submit]');
await sp.waitForFunction(() => /isn’t on the Salt and Light team/.test(document.querySelector('.errmsg')?.textContent || ''));
check(await sp.evaluate(() => window.__auth.session === null), 'password: a valid account not on the team is signed straight back out');
await sp.fill('#email', 'owner@example.org');
await sp.click('#magicLink');
await sp.waitForSelector('#back');
check(await sp.evaluate(() => window.__auth.otp.length === 1 && window.__auth.otp[0].options.shouldCreateUser === false), 'magic link: still available, and never creates new users');
await sp.click('#back');
await sp.fill('#email', 'owner@example.org');
await sp.fill('#password', 'correct horse battery');
await sp.click('#signinForm button[type=submit]');
await sp.waitForSelector('.shell');
check((await stext('.me')).includes('owner@example.org'), 'password: a team member signs in with a password');
await sp.click('#changePw');
await sp.waitForSelector('#pwForm');
await sp.fill('#newPassword', 'short');
check((await stext('#pwHint')).includes('Too short'), 'change password: strength hint flags a short password');
await sp.fill('#newPassword', 'Gentle-River-42-Lamp');
check((await stext('#pwHint')).startsWith('Strong'), 'change password: strength hint praises a strong one');
await sp.fill('#newPassword', 'elevenchars');
await sp.fill('#newPassword2', 'elevenchars');
await sp.click('#pwForm button[type=submit]');
check((await stext('#pwForm .errmsg')).includes('at least 12'), 'change password: fewer than 12 characters is refused');
await sp.fill('#newPassword', 'Gentle-River-42-Lamp');
await sp.fill('#newPassword2', 'Gentle-River-42-Lam');
await sp.click('#pwForm button[type=submit]');
check((await stext('#pwForm .errmsg')).includes('don’t match'), 'change password: mismatched passwords are caught');
check(await sp.evaluate(() => window.__auth.updates.length === 0), 'change password: nothing is sent until it is valid');
// Fields are cleared after an error on purpose: passwords are never kept in app state.
await sp.fill('#newPassword', 'Gentle-River-42-Lamp');
await sp.fill('#newPassword2', 'Gentle-River-42-Lamp');
await sp.click('#pwForm button[type=submit]');
await sp.waitForSelector('#pwForm', { state: 'detached' });
check(await sp.evaluate(() => window.__auth.updates.length === 1 && window.__auth.updates[0] === 20), 'change password: updateUser is called with the new password');
const stored = await sp.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage) + document.documentElement.outerHTML);
check(!/correct horse battery|Gentle-River-42-Lamp/.test(stored + consoleText.join(' ')), 'passwords: never stored, logged or left in the page');
// Account buttons must be on screen when signed in, on desktop and on a phone.
const onScreen = (sel) => sp.$eval(sel, (el) => { const r = el.getBoundingClientRect();
  return getComputedStyle(el).display !== 'none' && r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }).catch(() => false);
for (const [w, h] of [[1280, 900], [1280, 600], [390, 844]]) {
  await sp.setViewportSize({ width: w, height: h });
  await sp.evaluate(() => scrollTo(0, 0));
  const ok = await onScreen('#signout') && await onScreen('#changePw') && await sp.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check(ok, `account: Sign out and Change password are visible at ${w}x${h}`);
  if (w === 390) await sp.screenshot({ path: 'test-results/studio-account-390.png' });
}
await sp.setViewportSize({ width: 390, height: 844 });
await sp.click('#signout');
await sp.waitForSelector('#signinForm #password');
check(await sp.evaluate(() => window.__auth.session === null), 'account: Sign out works on a phone and returns to the sign-in screen');
await sctx.close();

// ---------- built-in list on phones, and the guide ----------
{
  const pctx = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
  await pctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await pctx.route('**/js/config.js*', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const pp = await pctx.newPage();
  pp.on('pageerror', (e) => errors.push(e.message));
  await pp.goto(base + 'studio/');
  await pp.fill('#email', 'owner@example.org');
  await pp.click('#signinForm button[type=submit]');
  await pp.waitForSelector('.shell');
  for (const w of [320, 360, 375, 1280]) {
    await pp.setViewportSize({ width: w, height: 780 });
    await pp.$eval('.side [data-view="builtins"]', (e) => e.click());
    await pp.waitForSelector('#builtinList .brow');
    const rows = await pp.$$eval('#builtinList .brow', (rs) => rs.map((r) => {
      const t = r.querySelector('.btitle').getBoundingClientRect(), k = r.querySelector('.bctrls').getBoundingClientRect(), b = r.getBoundingClientRect();
      return { tw: t.width / b.width, below: k.top >= t.bottom - 1, inside: t.left >= b.left + 8 && k.left >= b.left + 8 && k.right <= b.right };
    }));
    const navOk = await pp.$eval('.side nav .nav.on', (e) => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
    const phone = w < 600;
    check(rows.length > 5 && rows.every((r) => r.inside && (phone ? r.tw > 0.8 && r.below : !r.below)) && navOk && await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      `built-ins at ${w}px: ${phone ? 'title full width, controls on their own row' : 'title and controls on one line'}, inside the card, current tab in view`);
  }
  // Visible / Hidden filter
  for (const w of [320, 1280]) {
    await pp.setViewportSize({ width: w, height: 780 });
    const n = (f) => pp.$eval(`[data-bfilter="${f}"] .n`, (e) => +e.textContent);
    const total = await n('all');
    check(total > 5 && await n('visible') + await n('hidden') === total && await pp.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `built-in filter at ${w}px: All, Visible and Hidden chips with counts that add up`);
  }
  const firstKey = await pp.$eval('#builtinList [data-bhide]', (e) => e.dataset.bhide);
  await pp.click('[data-bfilter="hidden"]');
  const hiddenBefore = await pp.$$eval('#builtinList .brow', (r) => r.length);
  check(await pp.$eval('[data-bfilter="hidden"]', (e) => e.getAttribute('aria-pressed') === 'true' && document.activeElement === e) && (hiddenBefore > 0 || (await pp.textContent('#builtinList .empty')).includes('No hidden items')), 'built-in filter: Hidden is pressed, keeps focus, and says “No hidden items” when empty');
  await pp.click('[data-bfilter="all"]');
  await pp.click(`[data-bhide="${firstKey}"]`);
  await pp.click('[data-bfilter="hidden"]');
  check(await pp.$$eval('#builtinList .brow', (r) => r.length) === hiddenBefore + 1 && await pp.$$eval('#builtinList .pill', (p) => p.every((x) => x.textContent === 'Hidden')), 'built-in filter: Hidden shows only hidden items, including one just hidden');
  await pp.click('[data-bfilter="visible"]');
  check(await pp.$$eval('#builtinList .pill', (p) => p.length > 0 && p.every((x) => x.textContent === 'Visible')), 'built-in filter: Visible shows only visible items');
  await pp.keyboard.press('Shift+Tab'); await pp.keyboard.press('Enter');
  check(await pp.$eval('[data-bfilter="all"]', (e) => e.getAttribute('aria-pressed') === 'true'), 'built-in filter: works from the keyboard');
  await pp.setViewportSize({ width: 360, height: 780 });
  await pp.screenshot({ path: 'test-results/builtin-filter-360.png' });
  await pp.click('.top .help');
  await pp.waitForSelector('.guide');
  check(await pp.evaluate(() => document.activeElement.id === 'g-builtins' && document.querySelectorAll('.gpart').length >= 10), 'guide: the “?” on a section opens the guide at that part');
  await pp.click('[data-gjump="team"]');
  check(await pp.evaluate(() => document.activeElement.id === 'g-team' && !location.hash), 'guide: contents links jump within the guide');
  check(await pp.$eval('.me .guidebtn', (e) => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.right <= innerWidth; }), 'guide: the guide button is on screen at the top on a phone');
  await pctx.close();
}

// ---------- phone: tapping a scheduled post shows its form first ----------
{
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await tctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await tctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const tp = await tctx.newPage();
  tp.on('pageerror', (e) => errors.push(e.message));
  await tp.goto(base + 'studio/');
  await tp.fill('#email', 'owner@example.org'); await tp.tap('#signinForm button[type=submit]'); await tp.waitForSelector('.shell');
  await tp.tap('.side [data-view="new"]'); await tp.tap('[data-new="game"]');
  await tp.fill('#f_title', 'Jonah is coming soon'); await tp.fill('#f_text', 'Journey 5 is being built.');
  await tp.tap('[data-mode="schedule"]');
  await tp.fill('#f_publish_date', tomorrowSgt); await tp.fill('#f_publish_time', '18:30');
  await tp.tap('#postForm button[type=submit]'); await tp.waitForSelector('.ptable .row');
  await tp.tap('[data-sfilter="scheduled"]');
  await tp.tap('.ptable .row .c-date');
  await tp.waitForSelector('#postForm');
  await tp.waitForTimeout(700);
  const vis = await tp.$eval('#f_title', (el) => { const r = el.getBoundingClientRect(), bar = document.querySelector('.side').getBoundingClientRect(); return { ok: r.top >= bar.bottom && r.bottom <= innerHeight, top: Math.round(r.top) }; });
  check(vis.ok && (await tp.inputValue('#f_title')) === 'Jonah is coming soon', `phone: tapping a scheduled post shows its Title field in the first screen (top ${vis.top}px)`);
  check(await tp.$eval('#pvToggle', (b) => b.getAttribute('aria-expanded') === 'false' && getComputedStyle(document.getElementById('pvBody')).display === 'none'), 'phone: the preview starts folded under “Show preview”');
  await tp.focus('#pvToggle'); await tp.keyboard.press('Enter');
  check(await tp.$eval('#pvToggle', (b) => b.getAttribute('aria-expanded') === 'true' && b.textContent === 'Hide preview' && document.querySelector('#pvBody .phone').getBoundingClientRect().height > 100), 'phone: “Show preview” opens the preview from the keyboard');
  await tp.screenshot({ path: 'test-results/studio-phone-edit.png' });
  await tp.setViewportSize({ width: 1280, height: 900 });
  check(await tp.$eval('#pvToggle', (b) => getComputedStyle(b).display === 'none' && document.querySelector('.preview-col .phone').getBoundingClientRect().height > 100), 'desktop: the preview shows beside the form with no toggle');
  await tctx.close();
}

check(errors.length === 0, `no script errors ${errors.join(' | ')}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll studio checks passed');
process.exit(failures ? 1 : 0);
