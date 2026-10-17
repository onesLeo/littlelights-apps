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

// ---------- short desktop window: Today scrolls to the very last card ----------
{
  const { context, page, errors } = await openApp({ width: 1024, height: 500 }, false);
  const r = await page.evaluate(() => {
    const v = document.querySelector('.v-today'); v.scrollTop = 1e6;
    const last = [...document.querySelectorAll('#pFeed .p-slide, .v-today .p-sidecard')].reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
    const stage = document.querySelector('.v-today .p-stage');
    return { last, bottom: v.getBoundingClientRect().bottom, clipped: stage.scrollHeight > stage.clientHeight + 2 };
  });
  check(!r.clipped && r.last <= r.bottom, `1024x500: Today scrolls to the last card (${Math.round(r.last)} <= ${Math.round(r.bottom)})`);
  check(errors.length === 0, '1024x500: no script errors');
  await context.close();
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
  check(html.includes('>Add Salt and Light to your home screen<'), 'copy: install button label');
  check(!(await page.$('.p-slide.s2 [data-ep], .p-slide [data-sheet="0"] + [data-ep]')), 'copy: Today devotion card has no Listen button');
  check(await page.evaluate(() => window.LL_CONTENT.verses.some((v) => v.ref === 'Proverbs 17:17' && v.text === 'A friend loves at all times; and a brother is born for adversity.')), 'copy: Proverbs 17:17 is the full WEB verse');

  check(await page.title() === 'Salt and Light' && (await page.getAttribute('.p-brand .wm', 'aria-label')) === 'Salt and Light', 'brand: site is called Salt and Light');
  // Calligraphy wordmark: accessible name, candle i, alignment and contrast.
  const wm = await page.evaluate(async () => {
    await document.fonts.load('22px Parisienne');
    const all = [...document.querySelectorAll('.wm')];
    const ids = all.map((w) => w.querySelector('linearGradient').id);
    const lum = (c) => { const v = c.match(/\d+(\.\d+)?/g).slice(0, 3).map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const vis = document.querySelector('.p-logo .wm:not(.wm-onlight)').cloneNode(true); vis.style.fontSize = '22px'; document.getElementById('app').appendChild(vis);
    const l = vis.querySelector('.wm-l'); const svg = l.querySelector('svg');
    const probe = document.createElement('span'); probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    l.appendChild(probe);
    const base = probe.getBoundingClientRect().bottom; probe.remove();
    const fs = parseFloat(getComputedStyle(vis).fontSize);
    const stem = svg.querySelector('rect').getBoundingClientRect();
    return {
      n: all.length, labels: all.every((w) => w.getAttribute('role') === 'img' && w.getAttribute('aria-label') === 'Salt and Light'),
      hidden: all.every((w) => w.querySelector('svg').getAttribute('aria-hidden') === 'true' && [...w.children].every((c) => c.getAttribute('aria-hidden') === 'true')),
      unique: new Set(ids).size === ids.length, font: getComputedStyle(vis).fontFamily.includes('Parisienne') && document.fonts.check('22px Parisienne'),
      baseline: Math.abs(stem.bottom - base) / fs, xh: Math.abs((stem.bottom - stem.top) - 0.36 * fs) / fs,
      creamOnNavy: ratio(getComputedStyle(vis.querySelector('.wm-s')).color, 'rgb(15,13,32)'),
      plumOnLight: ratio(getComputedStyle(document.querySelector('.wm-onlight .wm-s')).color, 'rgb(251,246,238)'),
      plumOnNavy: ratio('rgb(59,31,74)', 'rgb(15,13,32)'),
      layers: ['.wm-sway', '.wm-flame', '.wm-fo', '.wm-fc', '.wm-halo', '.wm-ember'].map((q) => { const s = getComputedStyle(svg.querySelector(q)); return [s.animationName, s.animationDuration, s.transformOrigin]; }),
      phases: new Set(all.map((w) => w.style.getPropertyValue('--wm-d'))).size,
      flameBase: (() => { const r = svg.querySelector('.wm-flame').getBoundingClientRect(); return r.bottom; })(), stemTop: stem.top,
      _: vis.remove(),
    };
  });
  check(wm.n >= 5 && wm.labels && wm.hidden, 'wordmark: every header logo is labelled "Salt and Light" with the candle hidden from screen readers');
  check(wm.unique, 'wordmark: each candle has its own gradient id');
  check(wm.font, 'wordmark: self-hosted Parisienne is loaded');
  check(wm.baseline < 0.03 && wm.xh < 0.03, `wordmark: candle sits on the baseline and reaches the x-height (${wm.baseline.toFixed(3)}em, ${wm.xh.toFixed(3)}em)`);
  check(wm.plumOnNavy < 3 && wm.creamOnNavy >= 7 && wm.plumOnLight >= 7, `wordmark: cream on the navy header, plum only on light backgrounds (${wm.creamOnNavy.toFixed(1)}:1, ${wm.plumOnLight.toFixed(1)}:1)`);
  check(wm.layers.every(([n]) => n.startsWith('wm-')) && new Set(wm.layers.map(([, d]) => d)).size === 6, `wordmark: six flame layers animate on different (prime) durations ${wm.layers.map(([, d]) => d).join(' ')}`);
  check(wm.phases >= 5, 'wordmark: each wordmark flickers out of phase');
  check(wm.flameBase <= wm.stemTop + 1, 'wordmark: flame stays above the wick, anchored at its base');
  check(html.includes('<meta name="application-name" content="Salt and Light">') && html.includes('<meta name="apple-mobile-web-app-title" content="Salt and Light">'), 'brand: app name meta tags');
  check((html.match(/Little Light: Bible Journeys/g) || []).length >= 3, 'brand: the game keeps its name');
  // Everything on for the rest of the journey.
  await page.evaluate(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'on' } } })));
  await page.goto(base + '#today');
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  await page.click('.p-tab[data-tab="play"]');
  await page.waitForTimeout(150);
  const join = await page.$eval('.p-stores .p-join', (a) => ({ h: a.getBoundingClientRect().height, bg: getComputedStyle(a).backgroundImage, c: getComputedStyle(a).color }));
  check(join.h >= 48 && join.bg.includes('gradient') && join.c === 'rgb(42, 26, 5)', `copy: Join the testers is a big gold button (${Math.round(join.h)}px)`);
  await page.click('.p-tab[data-tab="today"]');

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

  const rows = await page.$$eval('#pEps .p-row', (r) => r.map((x) => x.textContent));
  check(rows.length === 1 && rows[0].includes('Psalm 56:3'), `listen: only episodes with a recording are listed (${rows.length})`);
  check(await page.evaluate(() => window.LL_CONTENT.episodes.every((e) => e.src)), 'listen: no silent placeholder episodes remain');
  check(await page.isVisible('.p-now [data-fa="play"]'), 'listen: This week plays the Psalm 56:3 devotion');
  check((await page.$$('[data-ep="-1"]')).length === 0, 'no buttons point at a left-out episode');
  await page.click('.p-tab[data-tab="read"]');
  await page.waitForTimeout(150);
  check(!(await page.$eval('#pCards', (c) => c.textContent.includes('▶ Audio'))), 'read: devotions without a recording show no audio badge');
  await page.click('#pCards .p-card');
  await page.waitForTimeout(250);
  check(!(await page.$('#pArticle [data-ep]')), 'read: a devotion without a recording has no Listen button');
  await page.keyboard.press('Escape');
  await page.click('.p-tab[data-tab="listen"]');
  await page.waitForTimeout(150);
  await page.click('.p-tab[data-tab="today"]');
  await page.waitForTimeout(150);
  await page.evaluate(() => document.querySelector('.p-slide.s2 [data-sheet]').scrollIntoView());
  await page.click('.p-slide.s2 [data-sheet]');
  const ps = await page.evaluate(() => { const s = document.querySelector('.p-sheet').getBoundingClientRect(); return { w: s.width, b: Math.round(innerHeight - s.bottom), vw: innerWidth }; });
  check(Math.round(ps.w) === ps.vw && ps.b <= 1, 'phone: devotion opens as a full-width bottom sheet');
  await page.click('#pSheetClose');
  check(!(await page.$eval('#pSheetWrap', (a) => a.classList.contains('on'))), 'phone: the close button closes the sheet');
  await page.click('.p-tab[data-tab="listen"]');
  await page.waitForTimeout(150);
  await page.click('#pEps .p-row');
  await page.click('#pMiniOpen');
  await page.waitForTimeout(200);
  const tx = await page.$$eval('#pFull .transcript p', (ps) => ps.map((p) => p.textContent));
  check(tx.length >= 3 && tx[0].startsWith('Today’s verse') || tx.length >= 3 && tx[0].startsWith("Today's verse"), `player: Read along shows the transcript in paragraphs (${tx.length})`);
  check(tx.some((p) => p.startsWith('Let us pray')) && tx.join(' ').endsWith('Amen.'), 'player: the prayer starts its own paragraph and nothing is lost');
  const close = await page.$eval('#pFull [data-close]', (b) => ({ l: b.getAttribute('aria-label'), w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height }));
  check(close.l === 'Close player' && close.w >= 44 && close.h >= 44, 'player: close button is labelled and at least 44px');
  check(await page.$eval('#pFull .transcript', (t) => getComputedStyle(t).overflowY === 'auto'), 'player: transcript scrolls');
  await page.keyboard.press('Escape');
  check(!(await page.$eval('#pFull', (f) => f.classList.contains('on'))), 'player: Escape closes it');
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
  check(await page.$$eval('.wm-sway, .wm-flame, .wm-fo, .wm-fc, .wm-halo, .wm-ember', (f) => f.length > 20 && f.every((x) => getComputedStyle(x).animationName === 'none')), 'phone: calm mode keeps the wordmark flame still');

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
  check(manifest.name === 'Salt and Light' && manifest.short_name === 'Salt and Light' && manifest.icons.length >= 3, 'app: manifest is valid');
  const sw = await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 4000)),
  ]));
  check(sw, 'app: offline service worker is active');
  check(errors.length === 0, `computer: no script errors ${errors.join(' | ')}`);
  await context.close();
}

// ---------- wordmark flare ----------
const flareState = (sel) => (s) => {
  const w = document.querySelector(s); const f = w.querySelector('.wm-flare'); const m = new DOMMatrix(getComputedStyle(f).transform);
  const fr = w.querySelector('.wm-flare').getBoundingClientRect(); const hr = w.querySelector('.wm-hw').getBoundingClientRect();
  const box = w.getBoundingClientRect();
  let clipped = [];
  for (let el = w.parentElement; el && el !== document.body; el = el.parentElement) {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    if (/hidden|clip|auto|scroll/.test(cs.overflow + cs.overflowX + cs.overflowY) && (fr.top < r.top || fr.left < r.left || fr.right > r.right || hr.top < r.top - 1)) clipped.push(el.className || el.tagName);
    if (cs.clipPath && cs.clipPath !== 'none') { const n = (cs.clipPath.match(/-?\d+(\.\d+)?px/g) || ['0px']).map(parseFloat); if (fr.top < r.top + n[0] || hr.top < r.top + n[0]) clipped.push('clip-path ' + el.className); }
  }
  return { sy: m.d, sx: m.a, halo2: +getComputedStyle(w.querySelector('.wm-halo2')).opacity, burst: getComputedStyle(w.querySelector('.wm-e2')).animationName,
    jit: getComputedStyle(w.querySelector('.wm-jit')).animationPlayState, box: [box.x, box.y, box.width, box.height].map(Math.round).join(), flaring: w.classList.contains('flaring'), clipped };
};
{
  const { context, page, errors } = await openApp({ width: 1366, height: 820 });
  await page.evaluate(() => { window.__cls = 0; new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: false }); });
  const S = '.p-brand .wm';
  const rest = await page.evaluate(flareState(), S);
  check(Math.abs(rest.sy - 1) < 0.01 && rest.halo2 === 0 && rest.burst === 'none', 'flare: candle rests at normal size');
  await page.hover('.p-brand .wm-l'); await page.waitForTimeout(450);
  const up = await page.evaluate(flareState(), S);
  check(up.sy >= 1.8 && up.sy <= 2 && up.halo2 === 1 && up.burst === 'wm-burst' && up.jit === 'running', `flare: hovering Light grows the flame ${up.sy.toFixed(2)}x, brightens the halo and lifts embers`);
  check(up.box === rest.box, 'flare: wordmark box is unchanged (no layout shift)');
  check(up.clipped.length === 0, `flare: desktop header does not clip the flame ${up.clipped.join(',')}`);
  await page.mouse.move(700, 600); await page.waitForTimeout(500);
  const down = await page.evaluate(flareState(), S);
  check(Math.abs(down.sy - 1) < 0.01 && down.halo2 === 0 && down.burst === 'none', 'flare: flame eases back when the pointer leaves');
  for (let i = 0; i < 15 && !(await page.evaluate(() => document.activeElement.classList.contains('p-brand'))); i++) await page.keyboard.press('Tab');
  await page.waitForTimeout(450);
  check((await page.evaluate(flareState(), S)).sy >= 1.8, 'flare: keyboard focus on the logo flares the candle');
  check((await page.evaluate(() => window.__cls)) === 0, 'flare: no cumulative layout shift');
  check(errors.length === 0, `flare: no script errors ${errors.join(' | ')}`);
  await context.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  await ctx.addInitScript(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'on' } } })));
  const page = await ctx.newPage();
  for (const tab of ['listen', 'read', 'verses', 'play']) {
    await page.goto(base + '#' + tab); await page.waitForSelector('#app[data-ready]'); await page.waitForTimeout(300);
    const S = `.v-${tab} .p-logo .wm`;
    const rest = await page.evaluate(flareState(), S);
    await page.tap(`.v-${tab} .p-logo .wm-l`); await page.waitForTimeout(450);
    const up = await page.evaluate(flareState(), S);
    check(up.flaring && up.sy >= 1.8 && up.box === rest.box && up.clipped.length === 0, `flare: tap on the ${tab} header flares the candle without clipping or shifting ${up.clipped.join(',')}`);
    await page.waitForTimeout(1500);
    const back = await page.evaluate(flareState(), S);
    check(!back.flaring && Math.abs(back.sy - 1) < 0.01, `flare: ${tab} candle eases back after about 1.5s`);
  }
  await ctx.close();
  const ctx2 = await browser.newContext({ viewport: { width: 1366, height: 820 }, hasTouch: true, serviceWorkers: 'block' });
  await ctx2.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const p2 = await ctx2.newPage(); await p2.goto(base + '#listen'); await p2.waitForSelector('#app[data-ready]');
  await p2.tap('.p-brand .wm-l'); await p2.waitForTimeout(400);
  check((await p2.evaluate(() => location.hash)) === '#today' && (await p2.$eval('.p-brand .wm', (w) => w.classList.contains('flaring'))), 'flare: tapping the logo link still navigates to Today');
  await ctx2.close();
}
// Layout and motion regressions at the smallest phone and desktop breakpoints.
for (const viewport of [{ width: 320, height: 568 }, { width: 900, height: 650 }, { width: 1024, height: 768 }]) {
  const { context, page } = await openApp(viewport);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(100);
  check(await page.$eval('#app', (a) => a.classList.contains('calm')), `${viewport.width}px: system reduced motion enables Calm mode`);
  check(await page.$$eval('.wm-sway, .wm-flame, .wm-fo, .wm-fc, .wm-halo, .wm-ember', (f) => f.length > 20 && f.every((x) => getComputedStyle(x).animationName === 'none')), `${viewport.width}px: reduced motion keeps the wordmark flame still`);
  const calmFlare = await page.evaluate(() => { document.querySelectorAll('.wm').forEach((w) => w.classList.add('flaring')); return [...document.querySelectorAll('.wm')].map((w) => [getComputedStyle(w.querySelector('.wm-flare')).transform, getComputedStyle(w.querySelector('.wm-hw')).transform, getComputedStyle(w.querySelector('.wm-halo2')).opacity, getComputedStyle(w.querySelector('.wm-e2')).animationName, getComputedStyle(w.querySelector('.wm-jit')).animationName]); });
  check(calmFlare.every(([f, h, o, e, j]) => f === 'none' && h === 'none' && o === '0.5' && e === 'none' && j === 'none'), `${viewport.width}px: flare under reduced motion is only a static brightening`);
  await page.evaluate(() => document.querySelectorAll('.wm').forEach((w) => w.classList.remove('flaring')));
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
    const sh = await page.evaluate(() => {
      const s = document.querySelector('.p-sheet').getBoundingClientRect(), x = document.getElementById('pSheetClose').getBoundingClientRect();
      return { w: s.width, mid: Math.abs(s.left + s.width / 2 - innerWidth / 2), title: document.getElementById('pSheetTitle').textContent, meta: document.getElementById('pSheetMeta').textContent,
        x: [x.width, x.height], label: document.getElementById('pSheetClose').getAttribute('aria-label'), focus: document.activeElement.id,
        foot: getComputedStyle(document.getElementById('pSheetFoot')).position, lock: getComputedStyle(document.querySelector('.p-view.on')).overflowY,
        measure: document.querySelector('#pSheetBody .p-txt').getBoundingClientRect().width / parseFloat(getComputedStyle(document.querySelector('#pSheetBody .p-txt')).fontSize) };
    });
    check(sh.w <= 660 && sh.w >= 560 && sh.mid < 4, `${viewport.width}px: devotion opens as a centred modal (${Math.round(sh.w)}px)`);
    check(sh.title.includes('brave') && /Devotion/.test(sh.meta), `${viewport.width}px: modal header shows the label and title`);
    check(sh.label === 'Close devotion' && sh.x[0] >= 44 && sh.x[1] >= 44 && sh.focus === 'pSheetClose', `${viewport.width}px: round close button, labelled, 44px, focused on open`);
    check(sh.foot === 'sticky' && sh.lock === 'hidden' && sh.measure < 36, `${viewport.width}px: sticky footer, background locked, readable line length`);
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    check(await page.evaluate(() => !!document.activeElement.closest('.p-sheet')), `${viewport.width}px: focus stays inside the modal`);
    await page.keyboard.press('Escape');
    check(!(await page.$eval('#pSheetWrap', (a) => a.classList.contains('on'))) && await page.evaluate(() => document.activeElement.matches('.s2 [data-sheet]')), `${viewport.width}px: Esc closes and focus returns to the card`);
    await page.click('.v-today .s2 [data-sheet]');
    await page.mouse.click(10, 300);
    check(!(await page.$eval('#pSheetWrap', (a) => a.classList.contains('on'))), `${viewport.width}px: a click on the backdrop closes it`);
    await page.click('.v-today .s2 [data-sheet]');
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
