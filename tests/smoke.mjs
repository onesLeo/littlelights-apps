// Smoke test: loads the app at phone and computer sizes and checks the main journeys.
// Run: npm test   (screenshots go to test-results/)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch();
let failures = 0;

function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

async function openApp(viewport, sw = true, versesOn = true) {
  // Service workers would fetch the real js/config.js past the route below, so tests that change
  // what the page loads block them.
  const context = await browser.newContext({ viewport, acceptDownloads: true, ...(sw ? {} : { serviceWorkers: 'block' }) });
  // Block external font requests so the test does not depend on the network.
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // Tests run in local mode so they never touch the real database.
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  // Verses is "coming soon" by default; the computer checks below need it on.
  if (versesOn) await context.addInitScript(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'on' } } })));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector('#app[data-ready]');
  return { context, page, errors };
}

// ---------- phone ----------
{
  const { context, page, errors } = await openApp({ width: 390, height: 844 }, false, false);
  const onView = () => page.$eval('.p-view.on', (v) => v.dataset.view);
  const soonOpen = () => page.$eval('#pSoon', (s) => s.classList.contains('on'));

  // Built-in default (no setting saved): Verses is "coming soon", every way in shows the message.
  check(await page.isVisible('.p-tab[data-tab="verses"]'), 'nav: Verses tab stays visible while coming soon');
  await page.click('.p-tab[data-tab="verses"]');
  await page.waitForTimeout(150);
  check(await soonOpen(), 'nav: tapping Verses shows the coming-soon message');
  check((await onView()) === 'today' && !page.url().includes('#verses'), 'nav: Verses section is not opened');
  check((await page.$eval('#pSoonTitle', (t) => t.textContent)) === 'Verses is coming soon', 'nav: message names the menu');
  await page.click('[data-soon-close]');
  check(!(await soonOpen()), 'nav: Okay closes the message');
  await page.click('.p-ring[data-go="verses"]');
  await page.waitForTimeout(150);
  check(await soonOpen(), 'nav: the Today shortcut shows the message too');
  await page.keyboard.press('Escape');
  check(!(await soonOpen()), 'nav: Escape closes the message');
  await page.click('.p-slide [data-go="verses"]');
  await page.waitForTimeout(150);
  check(await soonOpen() && (await onView()) === 'today', 'nav: the More verses button shows the message');
  await page.click('[data-soon-close]');
  await page.goto(base + '#verses');
  await page.waitForSelector('#app[data-ready]');
  check(await soonOpen() && (await onView()) === 'today', 'nav: opening #verses directly shows the message');
  await page.click('[data-soon-close]');

  // A saved setting: hidden menus disappear, a custom message (as text, never HTML) is used.
  await page.evaluate(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'coming_soon', play: 'hidden' }, message: '<img src=x> Soon!' } })));
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  check(!(await page.isVisible('.p-tab[data-tab="play"]')) && !(await page.isVisible('.p-ring[data-go="play"]')), 'nav: a hidden menu is removed from the tab bar and Today');
  await page.goto(base + '#play');
  await page.waitForSelector('#app[data-ready]');
  check((await onView()) === 'today' && !(await soonOpen()), 'nav: #play goes to Today when Play is hidden');
  await page.click('.p-tab[data-tab="verses"]');
  await page.waitForTimeout(150);
  check((await page.$eval('#pSoonMsg', (m) => m.textContent)) === '<img src=x> Soon!' && !(await page.$('#pSoonMsg img')), 'nav: custom message is shown as text');
  await page.click('[data-soon-close]');

  // Approved copy (Oct 2026): free game, Android closed test, no dead sign-up form, no audio-less Listen button.
  const html = await page.content();
  check(html.includes('Little Light: Bible Journeys is completely free. No ads, no purchases, nothing to unlock.'), 'copy: Play subhead says the game is free');
  check(!html.includes('App Store') && !html.includes('Play the free preview') && !html.includes('Free preview'), 'copy: no App Store badge, preview button or Free preview status');
  check(html.includes('14-day closed test') && !!(await page.$('.p-stores a[href$="/join"]')), 'copy: store line explains the closed test and links to /join');
  check(new Set(await page.$$eval('#pMap .st', (s) => s.map((x) => x.textContent))).size === 1, 'copy: all journey statuses are the same');
  check(!(await page.$('#pNewsEmail')) && html.includes('Weekly encouragement for families is on its way. Check back soon.'), 'copy: newsletter form is replaced by a note');
  check(html.includes('>Add Little Light to your home screen<'), 'copy: install button label');
  check(!(await page.$('.p-slide.s2 [data-ep], .p-slide [data-sheet="0"] + [data-ep]')), 'copy: Today devotion card has no Listen button');
  check(await page.evaluate(() => window.LL_CONTENT.verses.some((v) => v.ref === 'Proverbs 17:17' && v.text === 'A friend loves at all times; and a brother is born for adversity.')), 'copy: Proverbs 17:17 is the full WEB verse');

  // Everything on for the rest of the journey.
  await page.evaluate(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'on' } } })));
  await page.goto(base + '#today');
  await page.reload();
  await page.waitForSelector('#app[data-ready]');

  for (const tab of ['watch', 'listen', 'read', 'verses', 'play', 'today']) {
    await page.click(`.p-tab[data-tab="${tab}"]`);
    await page.waitForTimeout(150);
    check((await onView()) === tab, `phone: ${tab} tab opens`);
    check(page.url().endsWith(`#${tab}`), `phone: ${tab} tab updates the address`);
  }
  await page.screenshot({ path: 'test-results/phone-today.png' });

  const nav = await page.$eval('.p-tabs', (n) => n.getBoundingClientRect().top);
  check(nav > 700, 'phone: menu sits at the bottom');

  await page.click('.p-ring[data-go="listen"]');
  await page.waitForTimeout(150);
  check((await onView()) === 'listen', 'phone: story ring jumps to Listen');

  await page.click('.p-row[data-ep="3"]');
  check(await page.$eval('#app', (a) => a.classList.contains('has-mini')), 'phone: mini player appears');
  await page.click('.p-tab[data-tab="verses"]');
  check(await page.$eval('#app', (a) => a.classList.contains('has-mini')), 'phone: mini player stays when changing tabs');

  await page.click('[data-chip="Trust"]');
  check((await page.$$('#pGrid .p-tile')).length === 2, 'phone: topic filter shows 2 Trust verses');
  await page.click('#pGrid .p-tile');
  check(await page.$eval('#pStory', (s) => s.classList.contains('on')), 'phone: verse opens as a story');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: () => { window.__shareCalled = true; return Promise.resolve(); } });
  });
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#pStory [data-save-verse]');
  const download = await dl;
  check(!!download && download.suggestedFilename().endsWith('.png'), 'phone: Save image downloads a PNG');
  check(await page.evaluate(() => window.__shareCalled !== true), 'phone: Save image does not open the share sheet');
  await page.keyboard.press('Escape');

  await page.goto(base + '#read/brave');
  await page.waitForTimeout(200);
  check(await page.$eval('#pArticle', (a) => a.classList.contains('on')), 'phone: #read/brave opens the article directly');
  await page.screenshot({ path: 'test-results/phone-article.png' });

  const night = await page.$eval('#app', (a) => a.classList.contains('night'));
  await page.click('.p-tab[data-tab="today"]');
  await page.click('.p-rings [data-mode]');
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  check((await page.$eval('#app', (a) => a.classList.contains('night'))) === !night, 'phone: day/night choice is remembered');
  await page.screenshot({ path: 'test-results/phone-today-toggled.png' });

  await page.click('.p-rings [data-calm]');
  check(await page.$eval('#app', (a) => a.classList.contains('calm')), 'phone: calm mode turns on');

  await page.click('.p-tab[data-tab="watch"]');
  await page.click('.p-reel .save');
  check(await page.$eval('.p-reel .save', (b) => b.classList.contains('saved')), 'phone: Watch Save marks a reel on this device');
  check((await page.evaluate(() => localStorage.getItem('ll.savedReels') || '')).includes('true'), 'phone: Watch Save is remembered in local storage');
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  check(await page.$eval('.p-reel .save', (b) => b.classList.contains('saved')), 'phone: Watch Save stays marked after reload');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'phone: no sideways scrolling');
  check(await page.evaluate(() => ['.p-orb', '.v-today .p-clouds', '#pOwl'].every((sel) => document.querySelector(sel).closest('#pFeed .p-slide.s1'))),
    'phone: the sun, clouds and owl stay in the first post');
  check(errors.length === 0, `phone: no script errors ${errors.join(' | ')}`);
  await context.close();
}

// ---------- computer ----------
{
  const { context, page, errors } = await openApp({ width: 1366, height: 820 });
  const nav = await page.$eval('.p-tabs', (n) => n.getBoundingClientRect().top);
  check(nav < 10, 'computer: menu sits at the top');
  check(await page.$eval('.p-side', (s) => getComputedStyle(s).display !== 'none'), 'computer: side panel is shown');
  check(await page.$eval('.v-today .p-sky', (k) => !!k.querySelector('.p-orb') && !!k.querySelector('.p-clouds') && !!k.querySelector('#pOwl')),
    'computer: the sun, clouds and owl fill the page behind the Today feed');
  await page.screenshot({ path: 'test-results/computer-today.png' });
  await page.click('.p-tab[data-tab="verses"]');
  await page.waitForTimeout(150);
  const cols = await page.$eval('#pGrid', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  check(cols === 4, 'computer: verses use 4 columns');
  await page.screenshot({ path: 'test-results/computer-verses.png' });
  await page.click('.p-tab[data-tab="read"]');
  await page.click('.p-card.feat');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/computer-article.png' });

  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  check(manifest.name === 'Little Light' && manifest.icons.length >= 3, 'app: manifest is valid');
  const sw = await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 4000)),
  ]));
  check(sw, 'app: offline service worker is active');
  check(errors.length === 0, `computer: no script errors ${errors.join(' | ')}`);
  await context.close();
}

// Layout and motion regressions at the smallest phone and desktop breakpoints.
for (const viewport of [{ width: 320, height: 568 }, { width: 900, height: 650 }, { width: 1024, height: 768 }]) {
  const { context, page } = await openApp(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  check(await page.$eval('#app', (a) => a.classList.contains('calm')), `${viewport.width}px: system reduced motion enables Calm mode`);
  await page.evaluate(() => document.querySelector('[data-mode]').click());
  await page.evaluate(() => document.querySelector('#pOwl').click());
  check(await page.$eval('#pOwl', (o) => !o.classList.contains('hoot')), `${viewport.width}px: owl responds without hopping in Calm mode`);
  check(await page.evaluate(() => getComputedStyle(document.querySelector('.p-owl .lid')).animationName === 'none'), `${viewport.width}px: decorative owl motion is stopped`);
  const fits = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.v-today .p-btn, .p-tabs .p-tab');
    return Array.from(nodes).filter((n) => n.getClientRects().length).every((n) => {
      const r = n.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;
    });
  });
  check(fits, `${viewport.width}px: visible actions fit the screen`);
  if (viewport.width >= 900) {
    check(await page.$eval('#pFeed', (f) => getComputedStyle(f).display === 'grid'), `${viewport.width}px: desktop content uses a card grid`);
    await page.click('.v-today .s2 [data-sheet]');
    check(await page.$eval('#pSheetWrap', (a) => a.classList.contains('on')), `${viewport.width}px: desktop devotion card opens its preview`);
    await page.click('#pSheetWrap [data-read]');
    await page.waitForSelector('#pArticle.on');
    check(await page.$eval('#pArticle', (a) => a.classList.contains('on')), `${viewport.width}px: desktop devotion card opens its article`);
    await page.goto(base);
    await page.waitForSelector('#app[data-ready]');
  }
  await page.screenshot({ path: `test-results/home-${viewport.width}.png` });
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
