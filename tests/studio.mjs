// Studio test (local mode): sign in, write, validate, upload, publish, schedule,
// manage the team, then check the posts appear in the app.
// Run: npm test   (screenshots go to test-results/)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch();
// Service workers are blocked: they would fetch the real js/config.js past the route below.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
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
await page.fill('#f_when', '2020-01-01T08:00');
await page.click('#postForm button[type=submit]');
check((await text('.errmsg')).includes('future'), 'game: a past schedule time is rejected');
const tomorrow = new Date(Date.now() + 86400000);
const local = new Date(tomorrow - tomorrow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
await page.fill('#f_when', local);
await page.click('#postForm button[type=submit]');
await page.waitForSelector('.list .row');
check(await rowStatus('Jonah is coming soon') === 'Scheduled', 'game: scheduled for tomorrow');
await page.screenshot({ path: 'test-results/studio-posts.png', fullPage: true });

// ---------- media and team ----------
await page.click('.side [data-view="media"]');
check((await page.$$('.media')).length === 1, 'media: the uploaded recording is listed');
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
check((await text('.errmsg')).includes('isn’t on the Little Light team'), 'sign-in: people not on the team are turned away');

// A sign-in link that failed (expired, or no Studio account) comes back with the reason in the address.
await page.goto('about:blank');
await page.goto(base + 'studio/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
await page.waitForSelector('.errmsg');
check((await text('.errmsg')).includes('expired') && !page.url().includes('error'), 'sign-in: an expired link is explained and the address tidied');
await page.goto(base + 'studio/?error=access_denied&error_description=Signups+not+allowed+for+this+instance');
await page.waitForSelector('.errmsg');
check((await text('.errmsg')).includes('isn’t on the Little Light team'), 'sign-in: a new Google account (sign-ups closed) gets the team message');

check(errors.length === 0, `no script errors ${errors.join(' | ')}`);
await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll studio checks passed');
process.exit(failures ? 1 : 0);
