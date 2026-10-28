// Video playback test: a refused play() shows "Tap to play" (and the progress never fakes ahead),
// waiting/stalled shows a calm spinner, an error offers "Try again", only the current and next reel
// preload metadata, the Watch gallery never uses a <video>, and the desktop book art uses the poster.
// Run: npm test
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const shots = process.env.SHOTS || '';
let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }

async function open(opts, init) {
  const context = await browser.newContext({ serviceWorkers: 'block', ...opts });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  await context.route(/\.mp4(\?|#|$)/, () => {});            // media never answers: no real decoding in the test
  if (init) await context.addInitScript(init);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]');
  return { context, page, errors };
}
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true };

{ // Autoplay refused (iPhone Low Power Mode): visible Tap to play, no fake progress.
  const { context, page, errors } = await open(phone, () => {
    window.__allow = false;
    HTMLMediaElement.prototype.play = function () { if (window.__allow) { Object.defineProperty(this, 'paused', { configurable: true, get: () => false }); return Promise.resolve(); } const e = new Error('blocked'); e.name = 'NotAllowedError'; return Promise.reject(e); };
  });
  await page.click('.p-whero'); await page.waitForTimeout(1500);
  const s = await page.evaluate(() => { const el = document.querySelector('.p-reel.on'), b = el.querySelector('.p-rtap'), r = b.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { shown: !b.hidden && r.width > 0, w: r.width, h: r.height, top: !!(hit && (hit.closest('.p-rtap') || hit.closest('.z-mid'))), seg: el.querySelector('.p-rsegs i.cur b').style.transform, label: b.getAttribute('aria-label') }; });
  check(s.shown && s.top, 'muted play() refused: a visible "Tap to play" button, and a tap there lands on the play zone');
  check(s.w >= 44 && s.h >= 44 && /Tap to play/.test(s.label), `tap to play is labelled and at least 44px (${Math.round(s.w)}x${Math.round(s.h)})`);
  check(!s.seg || /scaleX\(0(\.0+)?\)/.test(s.seg), `progress does not advance while the video is not playing (${s.seg})`);
  if (shots) await page.screenshot({ path: shots + '/phone-tap-to-play.png' });
  await page.evaluate(() => { window.__allow = true; });
  await page.tap('.p-reel.on .z-mid'); await page.waitForTimeout(300);
  check(await page.$eval('.p-reel.on .p-rtap', (b) => b.hidden), 'tapping it starts the video and hides the button');
  check(!errors.length, `no page errors (${errors.join('; ')})`);
  await context.close();
}
{ // Waiting / stalled / error
  const { context, page, errors } = await open(phone, () => { HTMLMediaElement.prototype.play = function () { Object.defineProperty(this, 'paused', { configurable: true, get: () => false }); return Promise.resolve(); }; });
  await page.click('.p-whero'); await page.waitForTimeout(300);
  await page.evaluate(() => document.querySelector('.p-reel.on video').dispatchEvent(new Event('waiting'))); await page.waitForTimeout(800);
  const w = await page.evaluate(() => { const el = document.querySelector('.p-reel.on'), x = el.querySelector('.p-rwait'); return { shown: !x.hidden, retry: !x.querySelector('.p-rretry').hidden, text: x.textContent, role: x.querySelector('[role=status]') !== null }; });
  check(w.shown && !w.retry && /Loading/.test(w.text) && w.role, 'waiting: a calm spinner with "Loading the video…" (role=status), no retry yet');
  if (shots) await page.screenshot({ path: shots + '/phone-loading-spinner.png' });
  await page.evaluate(() => document.querySelector('.p-reel.on video').dispatchEvent(new Event('playing'))); await page.waitForTimeout(100);
  check(await page.$eval('.p-reel.on .p-rwait', (x) => x.hidden), 'playing again hides the spinner');
  await page.evaluate(() => document.querySelector('.p-reel.on video').dispatchEvent(new Event('stalled'))); await page.waitForTimeout(800);
  check(await page.$eval('.p-reel.on .p-rwait', (x) => !x.hidden), 'stalled also shows the spinner');
  await page.evaluate(() => document.querySelector('.p-reel.on video').dispatchEvent(new Event('error'))); await page.waitForTimeout(100);
  const e = await page.evaluate(() => { const b = document.querySelector('.p-reel.on .p-rretry'), r = b.getBoundingClientRect(); return { shown: !b.hidden && r.width > 0, h: r.height, text: document.querySelector('.p-reel.on .p-rwait').textContent }; });
  check(e.shown && e.h >= 44 && /didn’t load/.test(e.text), 'error: "Try again" (44px+) with a plain message');
  if (shots) await page.screenshot({ path: shots + '/phone-error-retry.png' });
  await page.tap('.p-reel.on .p-rretry'); await page.waitForTimeout(200);
  check(await page.$eval('.p-reel.on .p-rretry', (b) => b.hidden), 'tapping Try again reloads and goes back to loading');
  // Preload: only the current and the next reel fetch metadata.
  const pl = await page.evaluate(() => [...document.querySelectorAll('.p-reel video')].map((v) => v.getAttribute('preload')));
  check(pl.length < 2 || (pl.filter((x) => x === 'metadata').length <= 2 && pl[0] === 'metadata' && pl.slice(2).every((x) => x === 'none')), `preload: current and next "metadata", the rest "none" (${pl.join(',')})`);
  check(!errors.length, `no page errors (${errors.join('; ')})`);
  await context.close();
}
{ // Gallery never uses <video>; desktop book art has no second video.
  const { context, page } = await open({ viewport: { width: 1440, height: 900 } }, () => {
    const t = setInterval(() => { if (window.LL_CONTENT) { clearInterval(t); window.LL_CONTENT.reels.forEach((r) => { delete r.poster; delete r.thumb; }); } }, 0);
  });
  check(await page.$$eval('#pWatchGal video', (v) => v.length) === 0, 'Watch gallery: no <video> thumbnails (poster or scene art only)');
  await page.click('.p-whero'); await page.waitForTimeout(400);
  const cc = await page.$('.p-reel.on .p-rcc'); if (cc) { await cc.click(); await page.waitForTimeout(400); }
  check(await page.$$eval('.bk-art video', (v) => v.length) === 0, 'desktop book art: no twin <video> (poster image instead)');
  await context.close();
}
{ // Reduced motion and calm: the spinner does not spin fast.
  const { context, page } = await open({ ...phone, reducedMotion: 'reduce' });
  await page.click('.p-whero'); await page.waitForTimeout(200);
  check(await page.$eval('.p-reel.on .p-rspin', (s) => getComputedStyle(s).animationName) === 'none', 'reduced motion: the spinner is still');
  await context.close();
}
{ // Colour contrast of the overlay text (white on the dark pill) is AA.
  const lum = (r, g, b) => [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((a, c, k) => a + c * [0.2126, 0.7152, 0.0722][k], 0);
  const bg = [8, 5, 20].map((c) => c * 0.78 + 255 * 0.22); // worst case: the pill over a white frame
  const ratio = (1.05) / (lum(...bg) + 0.05);
  check(ratio >= 4.5, `tap to play / loading text contrast ≥ 4.5:1 over a white frame (${ratio.toFixed(1)}:1)`);
}
check(/const VERSION = 'll-v92'/.test(readFileSync(new URL('../sw.js', import.meta.url), 'utf8')), 'service worker cache bumped to ll-v92');
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll video playback checks passed');
process.exit(failures ? 1 : 0);
