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

// Built-in audio and reels have no recordings yet, so the app hides them. The phone journey below
// needs them, so { media: true } gives every item a (pretend) file. Service workers are blocked then,
// because a worker would fetch the real js/content.js past the route.
const WITH_MEDIA = "\n;window.LL_CONTENT.episodes.forEach(function (e, i) { e.src = 'media/test-' + i + '.mp3'; });" +
  "window.LL_CONTENT.reels.forEach(function (r, i) { r.src = 'media/test-' + i + '.mp4'; });";
async function openApp(viewport, { media = false, hash = '' } = {}) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, serviceWorkers: media ? 'block' : 'allow' });
  if (media) {
    await context.route('**/js/content.js', async (r) => {
      const res = await r.fetch();
      await r.fulfill({ response: res, body: (await res.text()) + WITH_MEDIA });
    });
  }
  // Tests run in local mode so they never touch the real database.
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + hash);
  await page.waitForSelector('#app[data-ready]');
  return { context, page, errors };
}

// ---------- phone ----------
{
  const { context, page, errors } = await openApp({ width: 390, height: 844 }, { media: true });
  const onView = () => page.$eval('.p-view.on', (v) => v.dataset.view);

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

// ---------- launch content: nothing that is still a placeholder is shown ----------
const LEGAL = ['https://legal.littlesaltandlight.com/privacy/web/', 'https://legal.littlesaltandlight.com/privacy/',
  'https://legal.littlesaltandlight.com/parents/', 'https://legal.littlesaltandlight.com/terms/',
  'https://legal.littlesaltandlight.com/support/', 'mailto:support@littlesaltandlight.com'];
const visible = (page, sel) => page.$$eval(sel, (els) => els.filter((e) => e.getClientRects().length > 0).length);
const footerLinks = (page, sel) => page.$$eval(sel + ' a', (as) => as.filter((a) => a.getClientRects().length).map((a) => a.getAttribute('href')));
{
  const { context, page, errors } = await openApp({ width: 390, height: 844 });
  const tabs = await page.$$eval('.p-tab', (ts) => ts.filter((t) => !t.hidden).map((t) => t.dataset.tab));
  check(tabs.join() === 'today,read,verses,play', `launch: Watch and Listen leave the menu while they have nothing to play (${tabs})`);
  check(await visible(page, '.p-ring[data-go="watch"], .p-ring[data-go="listen"]') === 0, 'launch: no Watch or Listen story rings');
  check(await visible(page, '#pFeed .p-slide.s3, #pFeed .p-slide.s4') === 0, 'launch: the placeholder reel and audio posts are hidden on Today');
  check(await visible(page, '#pFeed [data-ep], #pFeed [data-reel]') === 0, 'launch: no Listen or Watch buttons on Today');
  check(await page.$eval('#pFeed', (f) => f.scrollTop) === 0, 'launch: Today opens at the first post');
  check(!(await page.$('#pNews')) && !(await page.$('input[type=email]')), 'launch: the newsletter sign-up box is gone');
  const tabBar = await page.$$eval('.p-tabs .p-tab:not([hidden])', (ts) => ts.map((t) => Math.round(t.getBoundingClientRect().width)));
  check(tabBar.every((w) => w >= 80), `launch: the 4 remaining tabs share the bar (${tabBar})`);

  // Phone footer: after the last post of Today, and at the bottom of Play.
  await page.$eval('#pFeed', (f) => { f.scrollTop = f.scrollHeight; });
  await page.waitForTimeout(400);
  check((await footerLinks(page, '.p-legal.in-feed')).join() === LEGAL.join(), 'phone footer: legal and support links at the end of Today');
  const inView = await page.$eval('.p-legal.in-feed', (f) => { const r = f.getBoundingClientRect(); return r.top >= 0 && r.bottom <= document.querySelector('.p-tabs').getBoundingClientRect().top + 1; });
  check(inView, 'phone footer: can be scrolled fully into view above the menu');
  await page.screenshot({ path: 'test-results/phone-today-footer.png' });

  await page.click('.p-tab[data-tab="play"]');
  await page.waitForTimeout(150);
  check(await visible(page, '[data-preview]') === 0, 'launch: "Play the free preview" is hidden until the preview is published');
  const stores = await page.$eval('#pStores', (s) => ({ text: s.textContent, links: s.querySelectorAll('a').length }));
  check(stores.text === 'Coming soon to Google Play' && stores.links === 0, `launch: store tiles say "Coming soon to Google Play" with no link and no App Store (${stores.text})`);
  check((await footerLinks(page, '.p-legal.in-play')).join() === LEGAL.join(), 'phone footer: legal and support links at the bottom of Play');
  await page.$eval('.v-play', (v) => { v.scrollTop = v.scrollHeight; });
  await page.screenshot({ path: 'test-results/phone-play-footer.png' });

  // Someone opening #listen or #watch directly sees a gentle note, not a blank page.
  for (const tab of ['listen', 'watch']) {
    await page.goto(base + '#' + tab);
    await page.waitForSelector('#app[data-ready]');
    const note = await page.$eval(`.v-${tab} .p-empty`, (e) => (e.getClientRects().length ? e.textContent : ''));
    check(note.includes('on their way'), `launch: #${tab} explains that it is coming soon`);
  }
  await page.goto(base + '#read');
  await page.waitForSelector('#app[data-ready]');
  check(!(await page.$eval('#pCards', (c) => c.textContent)).includes('Audio'), 'launch: Read cards do not offer audio that does not exist yet');
  await page.goto(base + '#read/brave');
  await page.waitForSelector('#app[data-ready]');
  await page.waitForTimeout(200);
  check(await visible(page, '#pArticle [data-ep]') === 0, 'launch: the devotion page has no Listen button yet');

  // Tap targets: the night and calm buttons are at least 44 x 44.
  await page.goto(base + '#today');
  await page.waitForSelector('#app[data-ready]');
  const modes = await page.$$eval('[data-mode], [data-calm]', (bs) => bs.filter((b) => b.getClientRects().length).map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
  check(modes.length > 0 && modes.every(([w, h]) => w >= 44 && h >= 44), `phone: night and calm buttons are at least 44 x 44 (${JSON.stringify(modes)})`);

  // Sharing tags.
  const meta = await page.evaluate(() => {
    const m = (sel) => (document.querySelector(sel) || {}).content || (document.querySelector(sel) || {}).href || '';
    return { title: document.title, desc: m('meta[name="description"]'), canonical: m('link[rel="canonical"]'), ogImage: m('meta[property="og:image"]'),
      ogUrl: m('meta[property="og:url"]'), ogType: m('meta[property="og:type"]'), site: m('meta[property="og:site_name"]'), card: m('meta[name="twitter:card"]') };
  });
  check(meta.title.length > 20 && meta.desc.length > 60, `sharing: a descriptive title and description (${meta.title})`);
  check(meta.canonical === 'https://littlesaltandlight.com/' && meta.ogUrl === 'https://littlesaltandlight.com/', 'sharing: canonical and og:url point at the live address');
  check(meta.ogImage === 'https://littlesaltandlight.com/icons/og-image.png' && meta.ogType === 'website' && meta.site === 'Little Light' && meta.card === 'summary_large_image',
    'sharing: Open Graph image, type, site name and a large X card');
  const og = await page.evaluate(() => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res(null); i.src = 'icons/og-image.png'; }));
  check(og && og[0] === 1200 && og[1] === 630, `sharing: the image is 1200 x 630 (${og})`);
  check(errors.length === 0, `launch: no script errors ${errors.join(' | ')}`);
  await context.close();
}
{
  const { context, page, errors } = await openApp({ width: 1366, height: 820 });
  check((await footerLinks(page, '.p-side .p-legal')).join() === LEGAL.join(), 'computer footer: legal and support links in the side panel');
  check(await visible(page, '.p-legal.in-feed') === 0, 'computer footer: shown once (not also under the cards)');
  const tabs = await page.$$eval('.p-tabs .p-tab', (ts) => ts.filter((t) => t.getClientRects().length).map((t) => Math.round(t.getBoundingClientRect().height)));
  check(tabs.every((h) => h >= 44), `computer: menu tabs are at least 44px tall (${tabs})`);
  const modes = await page.$$eval('.p-tools .p-mode:not([hidden])', (bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }));
  check(modes.length === 2 && modes.every(([w, h]) => w >= 44 && h >= 44), `computer: night and calm buttons are at least 44 x 44 (${JSON.stringify(modes)})`);
  check(await page.$eval('.v-today .p-slide.s2', (s) => getComputedStyle(s).gridColumnStart === '1' && getComputedStyle(s).gridColumnEnd === '-1'),
    'computer: with the reel and audio posts hidden, the devotion card takes the whole row');
  await page.screenshot({ path: 'test-results/computer-today-launch.png' });
  check(errors.length === 0, `computer launch: no script errors ${errors.join(' | ')}`);
  await context.close();
}

// ---------- adding recordings later brings items back by themselves ----------
{
  const { context, page } = await openApp({ width: 390, height: 844 }, { media: true });
  check(await visible(page, '#pFeed .p-slide.s3') === 1 && await visible(page, '#pFeed .p-slide.s4') === 1, 'with media: the reel and audio posts show on Today');
  await page.click('.p-tab[data-tab="listen"]');
  await page.waitForSelector('.v-listen.on #pNow', { state: 'visible' });
  check((await page.$$('#pEps .p-row')).length === 5 && await visible(page, '#pNow') === 1, 'with media: Listen lists every episode');
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
