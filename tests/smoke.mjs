// Smoke test: loads the app at phone and computer sizes and checks the main journeys.
// Run: npm test   (screenshots go to test-results/)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch();
// TEST-ONLY: the 3 placeholder reels ship hidden by default (only The Whisper shows); these UI
// tests still need several reels, so every context gets them un-hidden. tests/reelsound.mjs
// checks the shipped default.
const unhide = (src) => src.replace(/\{ hidden: true, /g, '{ ');
const shippedContent = unhide(await (await fetch(base + 'js/content.js')).text());
const newContext0 = browser.newContext.bind(browser);
browser.newContext = async (...a) => { const c = await newContext0(...a); await c.route('**/js/content.js', (r) => r.fulfill({ contentType: 'text/javascript', body: shippedContent })); return c; };
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
  if (versesOn) await context.addInitScript(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'on' } }, content: { verses: true } })));
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
  check(!(await page.$('#pFeed [data-go="verses"], #pFeed [data-save-verse]')), 'nav: with verses off by default there is no More verses or Save image button');
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
  await page.evaluate(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'on' } }, content: { verses: true } })));
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
  check(await page.$$eval('.p-whero[data-watch="0"], .p-wcard[data-watch]', (e) => e.length) === 4, 'Watch: a featured hero and a thumbnail card for each other reel');
  check(await page.$$eval('.p-wcard .p-wdur, .p-wcard .p-wplay', (e) => e.length) === 6, 'Watch: cards show a duration badge and a play icon');
  check(await page.$eval('#pWatchPlayer', (p) => p.hidden) && (await page.$$('#pWatchPlayer iframe, .p-reel.playing')).length === 0, 'Watch: nothing plays until a video is chosen');
  check(await page.$eval('.p-wcard .p-wthumb', (t) => getComputedStyle(t).transitionDuration.split(',').every((d) => parseFloat(d) === 0)) && await page.$eval('.p-wscene svg, .p-wscene *', (s) => getComputedStyle(s).animationName === 'none'), 'Watch: calm mode has no hover zoom or animation');
  await page.click('.p-wcard[data-watch="1"]'); await page.waitForTimeout(200);
  check(await page.evaluate(() => !document.querySelector('#pWatchPlayer').hidden && document.activeElement.id === 'pWatchClose' && document.querySelector('#pWatchClose').getAttribute('aria-label') === 'Close video'), 'Watch: a card opens the player and focuses the labelled close button');
  check(await page.$eval('#pWatchClose', (b) => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && getComputedStyle(b).borderRadius === '50%'; }), 'Watch: close button is round and at least 44px');
  check(await page.evaluate(() => window.LL_reel.state().story === 1 && !!document.querySelector('.p-reel.on.playing')), 'Watch: the chosen reel plays in the player');
  check(await page.$$eval('.p-reel video', (v) => v.every((x) => x.muted)), 'Watch: no video starts with sound');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await page.evaluate(() => document.querySelector('#pWatchPlayer').hidden && document.activeElement.dataset.watch === '1' && !document.querySelector('.p-reel.playing')), 'Watch: Escape closes the player, stops it and returns focus to the card');
  check(await page.evaluate(() => { const u = window.LL_ytEmbed(window.LL_ytId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')); return u.startsWith('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ') && /rel=0/.test(u) && !/autoplay/.test(u); }), 'Watch: YouTube embeds use youtube-nocookie, rel=0 and no autoplay');
  check(!/<iframe/.test(await page.$eval('#pReels', (e) => e.innerHTML)), 'Watch: no embed is loaded while the player is closed');
  await page.click('.p-whero');
  await page.click('.p-reel .save');
  check(await page.$eval('.p-reel .save', (b) => b.classList.contains('saved')), 'phone: Watch Save marks a reel on this device');
  check((await page.evaluate(() => localStorage.getItem('ll.savedReels') || '')).includes('true'), 'phone: Watch Save is remembered in local storage');
  await page.reload();
  await page.waitForSelector('#app[data-ready]');
  await page.click('.p-whero'); await page.waitForTimeout(150);
  check(await page.$eval('.p-reel .save', (b) => b.classList.contains('saved')), 'phone: Watch Save stays marked after reload');
  await page.evaluate(() => window.LL_closeWatch && window.LL_closeWatch());

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
  check(await page.$eval('.v-today .p-sky', (k) => !!k.querySelector('.p-orb') && !!k.querySelector('.p-clouds') && !!document.querySelector('.v-today > .p-perch #pOwl')),
    'computer: the sun and clouds fill the sky; the owl perches in the page beside the welcome');
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
  for (let i = 0; i < 40 && !(await page.evaluate(() => document.activeElement.classList.contains('p-brand'))); i++) await page.keyboard.press('Tab');
  await page.waitForTimeout(450);
  check((await page.evaluate(flareState(), S)).sy >= 1.8, 'flare: keyboard focus on the logo flares the candle');
  check((await page.evaluate(() => window.__cls)) === 0, 'flare: no cumulative layout shift');
  check(errors.length === 0, `flare: no script errors ${errors.join(' | ')}`);
  await context.close();
}
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, serviceWorkers: 'block' });
  await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  await ctx.addInitScript(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'on' } }, content: { verses: true } })));
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
// ---------- night owl: perched on a branch, never covered, no sideways scroll ----------
async function openNight(viewport, extra = {}) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', ...extra });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  await context.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('ll.theme', 'night'); sessionStorage.setItem('seeded', '1'); } });
  const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '#today'); await page.waitForSelector('#app[data-ready]');
  return { context, page, errors };
}
const owlCheck = () => {
  const owl = document.querySelector('#pOwl'); const r = owl.getBoundingClientRect();
  const wide = innerWidth >= 900;
  const blockers = [...document.querySelectorAll(wide ? '.v-today .p-stage, .v-today .p-side > *, .p-welcome h1, .p-welcome p, .p-welcome .p-kicker, .p-tabs, .p-brand' : '.s1 .verse, .s1 .p-btns, .s1 .ref, .s1 .p-kicker, .p-rings, .p-tabs')].filter((e) => e.offsetWidth);
  const box = (e) => { if (/^(H1|P)$/.test(e.tagName) || e.classList.contains('p-kicker')) { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); } return e.getBoundingClientRect(); };
  const hit = blockers.filter((e) => { const b = box(e); return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; }).map((e) => e.className || e.tagName);
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.6);
  const branch = owl.parentNode.querySelector('.p-branch').getBoundingClientRect();
  const sc = document.scrollingElement; const today = document.querySelector('.v-today');
  return { w: r.width, inView: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, hit, onTop: !!top && owl.contains(top),
    feetOnBranch: Math.abs((r.top + r.width * 0.833) - (branch.top + branch.height * 0.3)) < r.width * 0.12,
    branchAtEdge: wide ? Math.abs(branch.right - today.clientWidth) < 2 : Math.abs(branch.left) < 2,
    hscroll: sc.scrollWidth > innerWidth + 1 || today.scrollWidth > today.clientWidth + 1, opacity: getComputedStyle(owl.parentNode).opacity,
    perchPE: getComputedStyle(owl.parentNode).pointerEvents };
};
for (const vp of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1280, height: 800 }, { width: 1440, height: 900 }]) {
  const { context, page, errors } = await openNight(vp);
  await page.waitForTimeout(2600);
  const o = await page.evaluate(owlCheck);
  check(o.w >= 50 && o.inView && o.opacity === '1', `owl ${vp.width}px: owl is fully visible in night mode (${Math.round(o.w)}px)`);
  check(o.hit.length === 0 && o.onTop, `owl ${vp.width}px: no card or control overlaps the owl ${o.hit.join(',')}`);
  check(o.feetOnBranch && o.branchAtEdge, `owl ${vp.width}px: owl stands on a branch that grows from the screen edge`);
  check(!o.hscroll, `owl ${vp.width}px: no horizontal scroll`);
  check(o.perchPE === 'none', `owl ${vp.width}px: the branch never blocks taps`);
  if (vp.width >= 900) {
    await page.evaluate(() => { document.querySelector('.v-today').scrollTop = 300; }); await page.waitForTimeout(100);
    const s = await page.evaluate(() => { const r = document.querySelector('#pOwl').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.6); return r.bottom < 70 || (!!e && document.querySelector('#pOwl').contains(e)); });
    check(s, `owl ${vp.width}px: scrolling never slides a card over the owl`);
    let under = [];
    for (const y of [0, 20, 40, 60, 80, 100, 120, 160, 200, 300]) {
      await page.evaluate((y) => { document.querySelector('.v-today').scrollTop = y; }, y); await page.waitForTimeout(260);
      const u = await page.evaluate(() => { const owl = document.querySelector('#pOwl'); const r = owl.getBoundingClientRect(); const vis = getComputedStyle(owl).opacity !== '0' && getComputedStyle(owl).visibility !== 'hidden';
        const bars = [...document.querySelectorAll('.p-tabs, .p-brand, header, .p-head')].filter((e) => !e.classList.contains('p-welcome') && e.offsetWidth && e.getClientRects().length);
        return vis && bars.some((e) => { const b = e.getBoundingClientRect(); return r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; }); });
      if (u) under.push(y);
    }
    check(under.length === 0, `owl ${vp.width}px: never visible under the header/nav at any scroll position ${under.join(',')}`);
  }
  check(errors.length === 0, `owl ${vp.width}px: no script errors ${errors.join(' | ')}`);
  await context.close();
}
{
  // Fly-in plays when night starts, not on navigation; calm and reduced motion keep it perched and still.
  const { context, page } = await openNight({ width: 1280, height: 800 });
  check(await page.$eval('#pOwl', (o) => o.classList.contains('fly') && getComputedStyle(o).animationName === 'owlflyx'), 'owl: flies in when the app opens at night');
  await page.waitForTimeout(2300);
  check(await page.$eval('#pOwl', (o) => !o.classList.contains('fly')), 'owl: lands and settles on the branch');
  await page.click('.p-tab[data-tab="listen"]'); await page.click('.p-tab[data-tab="today"]'); await page.waitForTimeout(50);
  check(await page.$eval('#pOwl', (o) => !o.classList.contains('fly')), 'owl: does not fly again on page navigation');
  await page.evaluate(() => document.querySelector('[data-mode]').click()); await page.waitForTimeout(100);
  check(await page.$eval('#app', (a) => !a.classList.contains('night')), 'owl: day mode hides it');
  await page.evaluate(() => document.querySelector('[data-mode]').click()); await page.waitForTimeout(80);
  check(await page.$eval('#pOwl', (o) => o.classList.contains('fly')), 'owl: flies in again when night mode is switched on');
  check(await page.$eval('#pOwl .lid', (l) => getComputedStyle(l).animationName === 'blink') && await page.$eval('#pOwl .head', (h) => getComputedStyle(h).animationName === 'owlhead'), 'owl: idles with a blink and head tilt');
  await context.close();
  const c2 = await openNight({ width: 390, height: 844 }, { reducedMotion: 'reduce' });
  await c2.page.waitForTimeout(150);
  const still = await c2.page.evaluate(() => { const o = document.querySelector('#pOwl'); return [o, o.querySelector('svg'), ...o.querySelectorAll('.wing, .head, .lid, .pupil')].every((e) => getComputedStyle(e).animationName === 'none') && document.getElementById('app').classList.contains('calm'); });
  check(still, 'owl: calm mode / reduced motion keeps the owl perched and still');
  const o2 = await c2.page.evaluate(owlCheck);
  check(o2.inView && o2.hit.length === 0, 'owl: perched in place straight away in calm mode');
  await c2.context.close();
}
// ---------- TEST-ONLY series fixture (never shipped): 3 episodes of a made-up series + dated built-ins ----------
const seriesStub = shippedContent
  .replace("  reels: [\n", "  reels: [\n" +
    "    { title: 'The lamp is lit', series: 'Test Series: Little Lamp', episode: 1, date: '2026-02-01', len: '0:20', bg: '#e46a4c', kind: 'robe', src: '', caption: 'Fixture episode one caption for tests.' },\n" +
    "    { title: 'Oil for the lamp', series: 'Test Series: Little Lamp', episode: 2, date: '2026-07-01', len: '0:15', bg: '#3d7fc4', kind: 'rain', src: '', caption: 'Fixture episode two caption.', series_description: 'Fixture series description used only in tests.' },\n" +
    "    { title: 'Light for the path', series: 'Test Series: Little Lamp', episode: 3, date: '2026-03-01', len: '0:10', bg: '#1f3a6e', kind: 'sea', src: '', caption: 'Fixture episode three caption.' },\n")
  .replace("{ title: 'Why Jonathan gave David his robe',", "{ date: '2026-04-01', title: 'Why Jonathan gave David his robe',")
  .replace("{ title: 'Noah kept building',", "{ date: '2026-05-01', title: 'Noah kept building',").replace("{ title: 'Jonah and the second chance',", "{ date: '2026-06-01', title: 'Jonah and the second chance',")
  .replace("date: '2026-10-18T12:00:00+08:00',", "date: '2026-01-15',");  // keep the fixture series newest
// ---------- frosted glass cards: fallback exists, text keeps AA contrast over the real sky ----------
{
  const css = await (await fetch(base + 'css/app.css')).text();
  check(/@supports\s+not\s*\(\(backdrop-filter/.test(css) && /-webkit-backdrop-filter:\s*blur/.test(css), 'glass: -webkit- prefix and an @supports not (backdrop-filter) solid fallback exist');
  check(!/@keyframes[^}]*\{[^@]*backdrop-filter/.test(css), 'glass: no animated filters');
  for (const [theme, vp, hash, sel, setup, fixture] of [['day', { width: 1440, height: 900 }, '#today', '.v-today .p-slide, .p-sidecard'], ['night', { width: 1440, height: 900 }, '#today', '.v-today .p-slide, .p-sidecard'], ['phone day', { width: 390, height: 844 }, '#read', '#pCards .p-card, .p-now'], ['phone night', { width: 390, height: 844 }, '#read', '#pCards .p-card'], ...[1024, 1280, 1440].flatMap((w) => [['desk ' + w + ' read day', { width: w, height: 900 }, '#read', '#pCards .p-card'], ['desk ' + w + ' read night', { width: w, height: 900 }, '#read', '#pCards .p-card']]),
    ...['day', 'night'].flatMap((t) => [
      [`desktop ${t} nav`, { width: 1440, height: 900 }, '#listen', '.p-tabs', async (pg) => { await pg.evaluate(() => { const v = document.querySelector('.v-listen'); if (v) v.scrollTop = 200; }); }],
      [`phone ${t} listen bars`, { width: 390, height: 844 }, '#listen', '.v-listen .p-head, .p-tabs, .p-list .p-row, .p-mini', async (pg) => { await pg.click('.p-row'); await pg.waitForTimeout(300); await pg.evaluate(() => { const v = document.querySelector('.v-listen'); if (v) v.scrollTop = 120; }); }],
      [`phone ${t} player`, { width: 390, height: 844 }, '#listen', '.p-full.on', async (pg) => { await pg.click('.p-row'); await pg.waitForTimeout(300); await pg.click('#pMiniOpen'); await pg.waitForTimeout(700); }],
      [`desktop ${t} watch`, { width: 1440, height: 900 }, '#watch', '.p-whero, .p-wcard', async () => {}],
      [`desktop ${t} today filters`, { width: 1440, height: 900 }, '#today', '.p-filter', async () => {}],
      [`phone ${t} watch filters`, { width: 390, height: 844 }, '#watch', '.p-filter', async () => {}],
      [`phone ${t} watch`, { width: 390, height: 844 }, '#watch', '.p-whero, .p-wcard', async () => {}],
      [`phone ${t} series (test data)`, { width: 390, height: 844 }, '#watch', '.p-series-in', async (pg) => { await pg.click('.p-whero[data-series]'); await pg.waitForTimeout(500); }, true],
      [`desktop ${t} series cards (test data)`, { width: 1440, height: 900 }, '#watch', '.p-whero, .p-wcard', async () => {}, true],
      [`phone ${t} sheet`, { width: 390, height: 844 }, '#today', '.p-sheet', async (pg) => { await pg.locator('[data-sheet]:visible').first().click(); await pg.waitForTimeout(700); }],
    ])]) {
    const surface = !!setup;
    const context = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
    await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
    if (fixture) await context.route('**/js/content.js', (r) => r.fulfill({ contentType: 'text/javascript', body: seriesStub }));
    await context.addInitScript((t) => { localStorage.setItem('ll.theme', /night/.test(t) ? 'night' : 'day'); localStorage.setItem('ll.calm', '1'); localStorage.setItem('ll.settings.v1', JSON.stringify({ content: { verses: true } })); }, theme);
    const page = await context.newPage();
    await page.goto(base + hash); await page.waitForSelector('#app[data-ready]'); await page.waitForTimeout(800);
    if (setup) { await setup(page); await page.evaluate(() => document.querySelectorAll('.p-toast').forEach((t) => t.remove())); await page.waitForTimeout(200); }
    const cards = await page.$$(sel);
    check(cards.length >= (surface ? 1 : 3) && await page.$eval(sel.split(',')[0], (c) => /blur/.test(getComputedStyle(c).backdropFilter || getComputedStyle(c).webkitBackdropFilter)), `glass ${theme}: cards are frosted (backdrop blur)`);
    let worst = { r: 99, name: '' };
    for (const card of cards) {
      const box = await card.boundingBox(); if (!box || box.x >= vp.width || (!surface && (box.y + 60 > vp.height || box.height < 60)) || box.height < 20 || (surface && (box.x < 0 || box.x + box.width > vp.width + 1))) continue;
      // Text elements (not buttons) and their own colours; then hide the content and sample what is behind each one.
      const info = await card.evaluate((c, surface) => {
        const cr = c.getBoundingClientRect();
        const texts = [...c.querySelectorAll(surface ? 'h1, h2, h3, h4, p, b, span, small, .p-kicker, label, .p-filter button' : '.p-kicker, .big, p, b, .verse, .ref, span, small')].filter((e) => (surface ? !e.closest('.p-btn, .p-mini button, .p-full button') && !e.children.length : !e.closest('.p-btn, button')) && e.textContent.trim() && e.getClientRects().length)
          .map((e) => { let r = e.getBoundingClientRect(); if (e.matches('button, .p-wdur')) { const g = document.createRange(); g.selectNodeContents(e); r = g.getBoundingClientRect(); } const cs = getComputedStyle(e); let op = 1; for (let x = e; x && x !== c.parentElement; x = x.parentElement) op *= +getComputedStyle(x).opacity; return { sel: e.tagName + '.' + e.className, x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height, color: cs.color, op }; });
        (surface ? c.querySelectorAll('*') : c.querySelectorAll('*')).forEach((e) => { e.dataset.vis = e.style.visibility;
          if (!c.matches('.p-whero, .p-wcard, .p-filter, .p-series-in') || ((e.matches('svg, .p-wplay') || e.closest('.p-wplay')) && !e.closest('.p-wscene'))) { e.style.visibility = 'hidden'; return; }
          e.dataset.col = e.style.cssText; e.style.setProperty('color', 'transparent', 'important'); e.style.setProperty('-webkit-text-fill-color', 'transparent', 'important'); e.style.setProperty('text-shadow', 'none', 'important'); e.style.setProperty('transition', 'none', 'important'); });
        return { texts, name: c.className };
      }, surface);
      const clip = { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, vp.height - box.y) };
      const png = (await page.screenshot({ clip })).toString('base64');
      await card.evaluate((c) => c.querySelectorAll('*').forEach((e) => { e.style.visibility = e.dataset.vis || ''; if (e.dataset.col != null) { e.style.cssText = e.dataset.col; delete e.dataset.col; } }));
      const r = await page.evaluate(async ({ png, texts }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        const lum = (c) => { const v = c.map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
        let min = 99;
        for (const t of texts) {
          const w = Math.max(1, Math.floor(t.w)), h = Math.max(1, Math.floor(t.h)); if (t.y + h > cv.height) continue;
          const d = g.getImageData(Math.floor(t.x), Math.floor(t.y), w, h).data;
          const tc = t.color.match(/\d+(\.\d+)?/g).map(Number); const a = (tc[3] ?? 1) * t.op;
          for (let i = 0; i < d.length; i += 4 * 2) { const bg = [d[i], d[i + 1], d[i + 2]]; const tx = tc.slice(0, 3).map((v, k) => v * a + bg[k] * (1 - a)); const A = lum(tx), B = lum(bg); const q = (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); if (q < min) self.__w = t.sel + ' ' + t.color; min = Math.min(min, (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05)); }
        }
        return min && (self.__last = self.__w, min);
      }, { png, texts: info.texts });
      if (r < worst.r) worst = { r, name: info.name + ' / ' + await page.evaluate(() => self.__last) };
      check(r >= 4.5, `glass ${theme}: "${info.name}" text vs the busiest pixel behind it ${r.toFixed(2)}:1 (AA 4.5)`);
    }
    console.log(`     glass ${theme}: worst card ${worst.name} ${worst.r.toFixed(2)}:1`);
    await context.close();
  }
}
// ---------- reel redesign: story progress, floating glass actions, caption sheet, AA on every reel's art ----------
{
  const css = await (await fetch(base + 'css/app.css')).text();
  const kf = (n) => (css.match(new RegExp('@keyframes ' + n + '\\s*\\{([^@]*?)\\}\\s*\\}')) || [, ''])[1];
  check(['kenburns', 'rflash', 'grow', 'up'].every((n) => kf(n) && !/(^|[;{\s])(?!transform|opacity)[a-z-]+\s*:/.test(kf(n).replace(/(from|to|\d+%)\s*\{/g, ''))), 'reel: only transform and opacity animate');
  for (const [theme, vp] of [['day', { width: 390, height: 844 }], ['night', { width: 390, height: 844 }], ['day', { width: 1440, height: 900 }], ['night', { width: 1440, height: 900 }]]) {
    const tag = `${theme} ${vp.width}px`;
    const context = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
    await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
    await context.addInitScript((t) => { localStorage.setItem('ll.theme', t); }, theme);
    const page = await context.newPage();
    await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]');
    await page.click('.p-whero'); await page.waitForTimeout(300);
    const n = await page.evaluate(() => window.LL_CONTENT.reels.length);
    if (theme === 'day') {
      check(await page.$$eval('.p-reel', (rs) => rs.length === 1 && rs[0].querySelectorAll('.p-rsegs i').length === 1 && rs[0].querySelector('.p-rsegs i').classList.contains('cur')), `reel ${tag}: a 1-part story has one progress segment`);
      check(await page.$eval('.p-reel .p-rchip', (e) => /^Reel · \d+:\d\d$/.test(e.textContent)), `reel ${tag}: "Reel · 0:48" chip`);
      check(await page.$eval('.p-reel .p-rtitle', (e) => getComputedStyle(e).fontWeight === '800' && /Bricolage/.test(getComputedStyle(e).fontFamily)), `reel ${tag}: bold display title (self-hosted Bricolage 800)`);
      check(await page.$$eval('.p-reel .side', (s) => s.every((x) => [...x.querySelectorAll('.p-ract span')].map((e) => e.textContent).join() === 'Save,Share,Caption')), `reel ${tag}: only Save, Share and the CC caption button when no devotion or audio is linked`);
      check(await page.$eval('.p-reel .p-ract svg', (s) => { const r = s.getBoundingClientRect(); return r.width >= 44 && getComputedStyle(s).borderRadius === '50%'; }), `reel ${tag}: round action buttons at least 44px`);
      check(!/\blikes?\b|\bcomments?\b/i.test(await page.$eval('#pReels', (e) => e.textContent)), `reel ${tag}: no like counts or comments`);
      check(await page.$eval('.p-reel .p-rkb', (e) => getComputedStyle(e).animationName === 'kenburns'), `reel ${tag}: slow Ken Burns on the art while playing`);
      await page.click('.p-reel.playing .z-mid'); await page.waitForTimeout(350);
      await page.waitForFunction(() => { const r = document.querySelector('.p-reel.userpaused'); return r && getComputedStyle(r.querySelector('.paused')).opacity === '1'; }, null, { timeout: 3000 }).catch(() => {});
      check(await page.$eval('.p-reel.userpaused', (r) => getComputedStyle(r.querySelector('.paused')).opacity === '1'), `reel ${tag}: tap pauses, shows the play indicator and stops the progress bar`);
      await page.click('.p-reel.userpaused .z-mid'); await page.waitForTimeout(100);
      await page.click('.p-reel .more'); await page.waitForTimeout(200);
      check(await page.evaluate(() => !document.querySelector('#pReelSheet').hidden && document.activeElement.classList.contains('p-rsheet-x') && document.querySelector('#pReelSheet p').textContent.length > 40), `reel ${tag}: "more" opens the caption sheet and focuses its close button`);
      await page.keyboard.press('Escape'); await page.waitForTimeout(100);
      check(await page.evaluate(() => document.querySelector('#pReelSheet').hidden && !document.querySelector('#pWatchPlayer').hidden && document.activeElement.classList.contains('more')), `reel ${tag}: Escape closes the sheet first and returns focus to "more"`);
    }
    let worst = { r: 99, w: '' };
    for (let i = 0; i < n; i++) {
      await page.evaluate((i) => window.LL_reel.open(i), i); await page.waitForTimeout(300);
      const reel = await page.$('.p-reel.on');
      const box = await reel.boundingBox();
      const texts = await reel.evaluate((c) => { const cr = c.getBoundingClientRect();
        const t = [...c.querySelectorAll('.p-rtitle, .cap p, .p-rchip, .p-ract span')].map((e) => { const r = e.getBoundingClientRect(); return { sel: e.className || e.tagName, x: r.left - cr.left, y: r.top - cr.top, w: r.width, h: r.height, color: getComputedStyle(e).color }; });
        c.querySelectorAll('.p-rtitle, .cap p, .p-rchip, .p-ract span').forEach((e) => { e.dataset.css = e.style.cssText; e.style.setProperty('color', 'transparent', 'important'); e.style.setProperty('text-shadow', 'none', 'important'); e.style.setProperty('text-decoration-color', 'transparent', 'important'); });
        c.querySelectorAll('.p-rkb, .p-rkb *').forEach((e) => e.style.setProperty('animation-play-state', 'paused', 'important'));
        return t; });
      const png = (await page.screenshot({ clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, vp.height - box.y) } })).toString('base64');
      await reel.evaluate((c) => c.querySelectorAll('[data-css]').forEach((e) => { e.style.cssText = e.dataset.css; delete e.dataset.css; }));
      const r = await page.evaluate(async ({ png, texts }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + png; await img.decode();
        const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height; const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
        const lum = (c) => { const v = c.map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
        let min = 99, w = '';
        for (const t of texts) { const ww = Math.max(1, Math.floor(t.w)), h = Math.max(1, Math.floor(t.h)); if (t.y + h > cv.height || t.w < 1) continue;
          const d = g.getImageData(Math.floor(t.x), Math.floor(t.y), ww, h).data; const tc = t.color.match(/\d+(\.\d+)?/g).map(Number).slice(0, 3);
          for (let k = 0; k < d.length; k += 8) { const A = lum(tc), B = lum([d[k], d[k + 1], d[k + 2]]); const q = (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); if (q < min) { min = q; w = t.sel; } } }
        return { min, w };
      }, { png, texts });
      if (r.min < worst.r) worst = { r: r.min, w: `reel ${i} ${r.w}` };
      check(r.min >= 4.5, `reel ${tag}: reel ${i} text vs the busiest art pixel behind it ${r.min.toFixed(2)}:1 (AA 4.5) ${r.w}`);
    }
    console.log(`     reel ${tag}: worst ${worst.w} ${worst.r.toFixed(2)}:1`);
    await context.close();
  }
  // calm mode: no Ken Burns, no indicator motion
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const page = await context.newPage(); await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]'); await page.click('.p-whero'); await page.waitForTimeout(200);
  check(await page.$eval('.p-reel.playing .p-rkb', (e) => getComputedStyle(e).animationName === 'none'), 'reel: reduced motion turns the Ken Burns move off');
  await page.evaluate(() => document.querySelector('#app').classList.add('calm'));
  check(await page.$eval('.p-reel.playing .p-rkb', (e) => getComputedStyle(e).animationName === 'none'), 'reel: calm mode turns the Ken Burns move off');
  await context.close();
}
// ---------- series and episodes (TEST-ONLY fixture data): Watch shelves, series sheet, one bar per episode, end screen ----------
{
  const open = async (vp, hash = '#watch', stub = true) => {
    const context = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
    await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
    if (stub) await context.route('**/js/content.js', (r) => r.fulfill({ contentType: 'text/javascript', body: seriesStub }));
    const page = await context.newPage(); await page.goto(base + hash); await page.waitForSelector('#app[data-ready]');
    return { context, page };
  };
  const st = (page) => page.evaluate(() => window.LL_reel.state());
  const segs = (page) => page.$eval('.p-reel.on', (r) => [...r.querySelectorAll('.p-rsegs i')].map((i) => i.className || '-').join(','));
  const watched = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('ll.watched') || '{}'));
  check(seriesStub.includes('Test Series: Little Lamp'), 'series: test fixture applied (test data only)');
  const { context, page } = await open({ width: 1440, height: 900 });
  const u = await page.evaluate(() => window.LL_series.units());
  check(u.length === 5 && u.filter((x) => x.series).length === 1 && u.find((x) => x.series).eps.length === 3, 'series: 3 episodes group into one series; the 4 built-ins stay standalone');
  check(await page.$eval('.p-whero', (h) => h.dataset.series === 'Test Series: Little Lamp' && /Series · 3 episodes/.test(h.textContent)), 'Watch: the hero is the newest series (sorted by its newest episode) with its episode count');
  check(await page.$$eval('#pWatchGal [data-watch], #pWatchGal [data-series]', (b) => b.length) === 5, 'Watch: one cover per series plus standalone cards (no card per episode)');
  check(!/\blikes?\b|\bcomments?\b/i.test(await page.$eval('#pWatchGal', (e) => e.textContent)), 'Watch: no like counts or comments');
  await page.click('.p-whero');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => { const s = document.querySelector('#pSeries'); return !s.hidden && document.activeElement.classList.contains('p-series-x') && document.activeElement.getAttribute('aria-label') === 'Close series' && s.getAttribute('role') === 'dialog'; }), 'series sheet: opens as a dialog and focuses the labelled close button');
  check(await page.$eval('#pSeries', (s) => s.querySelector('h2').textContent === 'Test Series: Little Lamp' && /Fixture series description/.test(s.textContent) && !!s.querySelector('.p-series-cover .p-wthumb')), 'series sheet: cover (first episode art), title and description (series_description)');
  check(await page.$$eval('#pSeries .p-ep', (b) => b.map((x) => x.querySelector('b').textContent).join('|')) === 'Ep 1 · The lamp is lit|Ep 2 · Oil for the lamp|Ep 3 · Light for the path', 'series sheet: episodes listed in episode order as "Ep 1 · title"');
  check(await page.$eval('#pSeries .p-ep small', (s) => s.textContent === '0:20') && await page.$eval('#pSeries .p-series-play', (b) => /Play · Ep 1/.test(b.textContent)), 'series sheet: durations and "Play · Ep 1"');
  await page.click('#pSeries .p-ep[data-story="0"]'); await page.waitForTimeout(300);
  check((await st(page)).story === 0 && (await segs(page)) === 'cur' && await page.$eval('.p-reel.on .p-rseries', (e) => /Test Series: Little Lamp · Episode 1/.test(e.textContent)), 'episode: plays alone with ONE progress bar and shows its series and episode');
  const zone = async (cls) => { const b = await page.$(`.p-reel.on .${cls}`); const r = await b.boundingBox(); await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2); await page.waitForTimeout(250); };
  check(await page.$eval('.p-reel.on .p-rzones', (z) => { const [a, b, c] = [...z.children].map((x) => x.getBoundingClientRect().width); return Math.abs(a - b) < 2 && Math.abs(b - c) < 2; }), 'episode: three equal tap zones');
  await page.waitForTimeout(1000);
  check((await st(page)).t > 0.5 && await page.$eval('.p-reel.on .p-rsegs i.cur b', (b) => /scaleX\(0\.0[1-9]/.test(b.style.transform)), 'episode: the bar fills with playback (part length fallback 0:20)');
  await page.evaluate(() => window.LL_reel.seek(5)); await zone('z-prev'); check((await st(page)).t < 1, 'episode: left third past 3s restarts');
  await zone('z-mid'); check(!(await st(page)).playing, 'episode: centre tap pauses'); const tp = (await st(page)).t; await page.waitForTimeout(400); check(Math.abs((await st(page)).t - tp) < 0.01, 'episode: the bar stops while paused');
  await zone('z-mid'); check((await st(page)).playing, 'episode: centre tap resumes');
  const mid = await (await page.$('.p-reel.on .z-mid')).boundingBox();
  await page.mouse.move(mid.x + mid.width / 2, mid.y + mid.height / 2); await page.mouse.down(); await page.waitForTimeout(600);
  check(!(await st(page)).playing, 'episode: press and hold pauses'); await page.mouse.up(); await page.waitForTimeout(150);
  check((await st(page)).playing && !(await st(page)).ended, 'episode: letting go resumes');
  await page.keyboard.press('Space'); check(!(await st(page)).playing, 'episode: Space pauses'); await page.keyboard.press('Space');
  for (const sel of ['.save', '.share', '.more']) {
    await page.click(`.p-reel.on ${sel}`); await page.waitForTimeout(200);
    const a = await st(page); check(a.playing && !a.ended && a.story === 0, `episode: tapping ${sel.slice(1)} never navigates or pauses`);
    if (sel === '.more') await page.click('#pReelSheet .p-rsheet-x');
    if (sel === '.save') await page.click('.p-reel.on .save');
  }
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(200);
  check((await st(page)).ended && !(await watched(page))['reel:the-lamp-is-lit'], 'episode: Right arrow skips to the end screen without counting it as watched');
  check(await page.$eval('.p-reel.on .p-rend', (e) => !e.hidden && /Next episode/.test(e.textContent) && /Ep 2 · Oil for the lamp/.test(e.textContent) && /Watch again/.test(e.textContent) && !e.querySelector('[data-story="3"], [data-story="4"], [data-story="5"]')), 'end screen: offers the next episode and Watch again, nothing unrelated');
  await page.click('.p-reel.on .p-ragain'); await page.waitForTimeout(200);
  check(!(await st(page)).ended && (await st(page)).t < 1, 'end screen: Watch again restarts the episode');
  await page.evaluate(() => window.LL_reel.seek(window.LL_reel.state().dur - 0.2)); await page.waitForTimeout(700);
  check((await st(page)).ended && (await watched(page))['reel:the-lamp-is-lit'] === 1 && await page.evaluate(() => document.activeElement.classList.contains('p-rnextep')), 'episode: finishing marks it watched (localStorage, per episode) and focuses Next episode');
  await page.waitForTimeout(900); check((await st(page)).story === 0, 'end screen: no automatic jump to the next episode');
  await page.click('.p-reel.on .p-rnextep'); await page.waitForTimeout(250);
  check((await st(page)).story === 1 && (await segs(page)) === 'cur', 'end screen: Next episode plays episode 2 with its own single bar');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  check(await page.evaluate(() => !document.querySelector('#pSeries').hidden && document.querySelector('#pSeries .p-ep[data-story="0"]').classList.contains('watched') && !!document.querySelector('#pSeries .p-ep[data-story="0"] .p-ep-tick') && /Continue · Ep 2/.test(document.querySelector('#pSeries .p-series-play').textContent)), 'series sheet: watched tick on Ep 1 and "Continue · Ep 2" from the first unwatched episode');
  for (const k of [1, 2]) { await page.click(`#pSeries .p-ep[data-story="${k}"]`); await page.waitForTimeout(250); await page.evaluate(() => window.LL_reel.seek(window.LL_reel.state().dur - 0.2)); await page.waitForTimeout(700); if (k === 1) await page.keyboard.press('Escape'); await page.waitForTimeout(150); }
  check(await page.$eval('.p-reel.on .p-rend', (e) => !/Next episode/.test(e.textContent) && !!e.querySelector('.p-rback') && e.querySelectorAll('.p-rnexts .p-rnext').length === 2 && [...e.querySelectorAll('.p-rnexts .p-rnext')].every((b) => +b.dataset.story >= 3)), 'end screen: after the last episode, Back to series and up to 2 other unwatched items');
  await page.click('.p-reel.on .p-rback'); await page.waitForTimeout(300);
  check(await page.evaluate(() => document.querySelector('#pWatchPlayer').hidden && !document.querySelector('#pSeries').hidden && /Watched/.test(document.querySelector('#pSeries .p-kicker').textContent)), 'end screen: Back to series reopens the series; all episodes done counts the series as watched');
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  check(await page.evaluate(() => document.querySelector('#pSeries').hidden && document.activeElement.dataset.series === 'Test Series: Little Lamp'), 'series sheet: Escape closes it and returns focus to the series card');
  check(await page.evaluate(() => { const els = [...document.querySelectorAll('#pWatchGal [data-watch], #pWatchGal [data-series]')]; const last = els[els.length - 1]; return last.dataset.series === 'Test Series: Little Lamp' && last.classList.contains('watched') && /3 episodes/.test(last.textContent) && /Watched/.test(last.textContent); }), 'Watch: a watched series moves to the end with its "3 episodes" badge and a Watched tick');
  await page.click('[data-clear-watched]'); await page.waitForTimeout(150);
  check(await page.evaluate(() => document.querySelector('.p-whero').dataset.series === 'Test Series: Little Lamp' && localStorage.getItem('ll.watched') === '{}'), 'Watch: Clear watched resets');
  await page.click('.p-filter[data-fpage="watch"] [data-fsort="old"]'); await page.waitForTimeout(150);
  check(await page.evaluate(() => { const els = [...document.querySelectorAll('#pWatchGal [data-watch], #pWatchGal [data-series]')]; return document.querySelector('.p-whero').dataset.watch === '3' && els[els.length - 1].dataset.series === 'Test Series: Little Lamp'; }), 'filters: Oldest sorts series by their newest episode (Jul) after older standalone reels');
  await page.reload(); await page.waitForSelector('#app[data-ready]');
  check(await page.evaluate(() => JSON.parse(sessionStorage.getItem('ll.filters')).watch.sort === 'old'), 'filters: the Watch sort persists in sessionStorage');
  await page.click('.p-filter[data-fpage="watch"] [data-fsort="new"]');
  await context.close();
  // Shipped content: the 3 built-ins stay standalone; a reel from Today plays with one bar.
  const t = await open({ width: 1440, height: 900 }, '#today', false);
  check(await t.page.evaluate(() => window.LL_series.units().every((x) => !x.series && x.eps.length === 1)), 'shipped content: the 3 built-ins stay standalone (no series data)');
  await t.page.click('[data-reel]'); await t.page.waitForTimeout(300);
  check((await segs(t.page)) === 'cur', 'story: a reel opened from Today shows one segment');
  await t.page.evaluate(() => window.LL_reel.seek(window.LL_reel.state().dur - 0.2)); await t.page.waitForTimeout(700);
  check((await st(t.page)).ended && !(await t.page.$('.p-reel.on .p-rback')), 'story: a standalone reel ends on the end screen (no Back to series)');
  await t.context.close();
  // Filters on Today stay as before.
  {
    const f = await open({ width: 1440, height: 900 }, '#today', false);
    const chips = await f.page.$$eval('.p-filter[data-fpage="today"] .p-fchip', (c) => c.map((x) => x.textContent).join(','));
    check(chips === 'All,Devotion,Reel,Audio,Game', `filters Today: chips from existing card kinds (${chips})`);
    await f.page.click('.p-filter[data-fpage="today"] [data-ftype="Reel"]'); await f.page.waitForTimeout(150);
    check(await f.page.evaluate(() => { const vis = [...document.querySelectorAll('#pFeed .p-slide')].filter((s) => s.offsetParent); return vis.length >= 1 && vis.every((s) => s.classList.contains('s3')); }), 'filters Today: the Reel chip shows only reel cards');
    await f.page.keyboard.press('Shift+Tab'); await f.page.keyboard.press('Shift+Tab'); await f.page.keyboard.press('Enter'); await f.page.waitForTimeout(150);
    check(await f.page.evaluate(() => JSON.parse(sessionStorage.getItem('ll.filters')).today.type === 'All' && document.activeElement.dataset.ftype === 'All'), 'filters: chips work from the keyboard');
    const rows = await f.page.$$eval('#pEps .p-row', (r) => r.length);
    check(rows > 2 || (await f.page.$$('.p-filter[data-fpage="listen"]')).length === 0, `filters: hidden on a page with ${rows} item(s)`);
    await f.page.evaluate(() => document.querySelector('#app').classList.add('calm'));
    check(await f.page.$eval('.p-filter button', (b) => parseFloat(getComputedStyle(b).transitionDuration) === 0), 'filters: no transitions in calm mode');
    await f.context.close();
  }
  // Phone swipe left on an episode goes to its end screen.
  const ph = await open({ width: 390, height: 844 });
  await ph.page.click('.p-whero'); await ph.page.waitForTimeout(400); await ph.page.click('#pSeries .p-series-play'); await ph.page.waitForTimeout(300);
  await ph.page.mouse.move(300, 400); await ph.page.mouse.down(); await ph.page.mouse.move(120, 410, { steps: 5 }); await ph.page.mouse.up(); await ph.page.waitForTimeout(250);
  check((await st(ph.page)).ended, 'episode: swiping left skips to the end screen');
  await ph.context.close();
}
// ---------- verses switched off by default (site setting 'content') ----------
for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const page = await context.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '#today'); await page.waitForSelector('#app[data-ready]');
  const r = await page.evaluate(() => {
    const vis = (e) => !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
    const slides = [...document.querySelectorAll('#pFeed .p-slide')].filter(vis);
    const feed = document.getElementById('pFeed').getBoundingClientRect();
    const first = slides.filter((s) => Math.abs(s.getBoundingClientRect().top - slides[0].getBoundingClientRect().top) < 2);
    const rowRight = Math.max(...first.map((s) => s.getBoundingClientRect().right));
    return {
      verseText: [...document.querySelectorAll('#pFeed .verse, #pFeed .ref')].filter(vis).length,
      buttons: document.querySelectorAll('[data-save-verse], [data-open-verse], #pFeed [data-go="verses"]').length - document.querySelectorAll('.v-verses [data-save-verse], .v-verses [data-open-verse]').length,
      navVerses: vis(document.querySelector(innerWidth >= 900 ? '.p-tab[data-tab="verses"]' : '.p-ring[data-go="verses"]')),
      hello: vis(document.querySelector('.p-hello')), welcome: vis(document.querySelector('.p-welcome')),
      firstTopGap: slides[0].getBoundingClientRect().top - feed.top, rowGap: feed.right - rowRight,
      devotionQuote: (window.LL_CONTENT.devotions || []).some((d) => /“|"/.test(JSON.stringify(d))),
    };
  });
  const tag = vp.width >= 900 ? 'desktop' : 'phone';
  check(r.verseText === 0 && r.buttons === 0, `verses off ${tag}: no verse cards, More verses or Save image on Today`);
  check(r.navVerses, `verses off ${tag}: the Verses menu entry stays (coming soon)`);
  check(tag === 'desktop' ? (r.welcome && !r.hello && r.firstTopGap < 2 && r.rowGap < 2) : r.hello, `verses off ${tag}: Today still opens with a welcome and the cards close up (gap ${Math.round(r.firstTopGap)}/${Math.round(r.rowGap)}px)`);
  check(r.devotionQuote, `verses off ${tag}: Bible quotes inside devotions are kept`);
  // Owner switches them back on: everything returns, nothing was deleted.
  await page.evaluate(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ content: { verses: true } })));
  await page.reload(); await page.waitForSelector('#app[data-ready]');
  check(await page.evaluate(() => !document.getElementById('app').classList.contains('no-verses') && [...document.querySelectorAll('#pFeed .verse')].some((e) => e.getClientRects().length) && !!document.querySelector('#pFeed [data-save-verse]')), `verses on ${tag}: switching the setting on brings the verse cards back`);
  check(errors.length === 0, `verses ${tag}: no script errors ${errors.join(' | ')}`);
  await context.close();
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

// ---------- Read page: Midnight & Gold colours ----------
for (const [theme, exp] of [['night', { bg: 'rgb(15, 21, 48)', ink: 'rgb(246, 238, 220)', gold: 'rgb(242, 196, 107)' }], ['day', { bg: 'rgb(238, 241, 248)', ink: 'rgb(27, 36, 71)', gold: 'rgb(122, 78, 0)', card: 'rgb(255, 255, 255)' }]]) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => { localStorage.setItem('ll.theme', t); localStorage.setItem('ll.calm', '1'); }, theme);
  const pg = await ctx.newPage(); await pg.goto(base + '#read'); await pg.waitForSelector('#pCards .p-card');
  const r = await pg.evaluate(() => { const v = getComputedStyle(document.querySelector('.v-read')); const c = document.querySelector('#pCards .p-card'); const cs = getComputedStyle(c);
    return { bg: v.backgroundColor, img: v.backgroundImage, ink: cs.color, cardBg: cs.backgroundColor, cardImg: cs.backgroundImage, cardImgSize: cs.backgroundSize, kick: getComputedStyle(c.querySelector('.p-kicker')).color, sheen: getComputedStyle(c, '::before').content, bw: cs.borderTopWidth, bc: cs.borderTopColor, bf: cs.backdropFilter, anim: cs.animationName }; });
  check(r.bg === exp.bg && /radial-gradient/.test(r.img), `read ${theme}: midnight & gold page background (${r.bg})`);
  check(r.ink === exp.ink && r.kick === exp.gold, `read ${theme}: card text ${r.ink}, kicker ${r.kick}`);
  check((theme === 'night' ? r.cardBg === 'rgba(28, 38, 80, 0.42)' && /242, 196, 107/.test(r.cardImg) : r.cardBg === 'rgba(255, 255, 255, 0.5)') && /100% 1.5px/.test(r.cardImgSize), `read ${theme}: translucent glass card with 1.5px hairline (${r.cardBg})`);
  check(/blur\(20px\)/.test(r.bf) && /saturate/.test(r.bf), `read ${theme}: frosted blur + saturate (${r.bf})`);
  check(parseFloat(r.bw) >= 1 && /border: 1.5px solid rgba\(242,196,107,.7\)/.test(await (await fetch(base + 'css/app.css')).text()) && (theme === 'night' ? /242, 196, 107, 0.7/ : /184, 134, 43/).test(r.bc), `read ${theme}: visible gold border (${r.bw} ${r.bc})`);
  check(r.anim === 'none', `read ${theme}: calm, no card animation`);
  await ctx.close();
}

// ---------- Read page layout: header seamless + aligned, tight featured card, visible hairline, AA over desktop glow ----------
for (const w of [390, 1024, 1280, 1440]) for (const theme of ['night', 'day']) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 } });
  await ctx.addInitScript((t) => { localStorage.setItem('ll.theme', t); }, theme);
  const pg = await ctx.newPage(); await pg.goto(base + '#read'); await pg.waitForSelector('#pCards .p-card'); await pg.waitForTimeout(600);
  const r = await pg.evaluate(() => { const R = (e) => e.getBoundingClientRect(); const h = document.querySelector('.v-read .p-head'); const c = document.querySelector('#pCards .p-card.feat'); const f = document.querySelector('.v-read .p-filter');
    const t = h.querySelector('h3') || h; const tr = document.createRange(); tr.selectNodeContents(t);
    return { title: Math.round(tr.getBoundingClientRect().left), card: Math.round(R(c).left), filt: f ? Math.round(R(f).left) : null, headBg: getComputedStyle(h).backgroundColor, gap: R(c.querySelector('.p-kicker')).top - R(c).top,
      hair: [...document.querySelectorAll('#pCards .p-card')].every((x) => { const a = getComputedStyle(x, '::after'); return parseFloat(a.height) >= 1.5 && parseFloat(a.height) <= 2 && /gradient/.test(a.backgroundImage); }) }; });
  check(Math.abs(r.title - r.card) <= 2 && (r.filt === null || Math.abs(r.filt - r.card) <= 2), `read ${w} ${theme}: title/filter aligned with cards (${r.title}/${r.filt}/${r.card})`);
  if (w >= 900) check(r.headBg === 'rgba(0, 0, 0, 0)', `read ${w} ${theme}: header is seamless (transparent)`);
  check(r.gap <= 24, `read ${w} ${theme}: featured card has no empty band (${Math.round(r.gap)}px above kicker)`);
  check(r.hair, `read ${w} ${theme}: thin gold hairline on every card`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
