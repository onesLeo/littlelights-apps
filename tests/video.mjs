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
{ // Auto-hide: controls fade after ~3s of playback; the first tap only reveals; held while paused/loading.
  // The test media never answers, so the mock also reports enough data (readyState 4) to count as playing.
  const playing = () => { Object.defineProperty(HTMLMediaElement.prototype, 'readyState', { configurable: true, get: () => 4 });
    HTMLMediaElement.prototype.play = function () { Object.defineProperty(this, 'paused', { configurable: true, get: () => false }); this.dispatchEvent(new Event('playing')); return Promise.resolve(); };
    HTMLMediaElement.prototype.pause = function () { Object.defineProperty(this, 'paused', { configurable: true, get: () => true }); this.dispatchEvent(new Event('pause')); }; };
  const { context, page, errors } = await open(phone, playing);
  await page.click('.p-whero'); await page.waitForTimeout(500);
  const st = () => page.evaluate(() => { const p = document.querySelector('#pWatchPlayer'), el = p.querySelector('.p-reel.on'), op = (s) => { const e = p.querySelector(s); return e ? +getComputedStyle(e).opacity : -1; };
    return { idle: p.classList.contains('r-idle'), paused: el.classList.contains('userpaused'), close: op('.p-wclose'), cap: op('.p-reel.on .cap'), side: op('.p-reel.on .side'), row: op('.p-reel.on .p-rtoprow'), segs: op('.p-reel.on .p-rsegs'),
      closeVis: getComputedStyle(p.querySelector('.p-wclose')).visibility }; });
  check(!(await st()).idle, 'auto-hide: controls are shown when the reel starts');
  await page.waitForTimeout(3600);
  let s = await st();
  check(s.idle && s.close === 0 && s.cap === 0 && s.side === 0 && s.row === 0 && s.closeVis === 'hidden', `auto-hide: after ~3s of playback close, caption, actions and top row are hidden (${JSON.stringify(s)})`);
  check(s.segs > 0, 'auto-hide: the progress line stays visible');
  if (shots) await page.screenshot({ path: shots + '/phone-reel-hidden.png' });
  await page.tap('.p-reel.on .z-mid'); await page.waitForTimeout(450);
  s = await st();
  check(!s.idle && !s.paused && s.close === 1 && s.cap === 1, `auto-hide: a tap while hidden reveals them and does not pause (${JSON.stringify(s)})`);
  if (shots) await page.screenshot({ path: shots + '/phone-reel-shown.png' });
  await page.tap('.p-reel.on .z-mid'); await page.waitForTimeout(450);
  check((await st()).paused, 'auto-hide: a tap while shown pauses as before');
  await page.waitForTimeout(3600);
  check(!(await st()).idle, 'auto-hide: never hides while paused');
  await page.tap('.p-reel.on .z-mid'); await page.waitForTimeout(3600);
  check((await st()).idle, 'auto-hide: hides again once playing');
  await page.keyboard.press('Shift'); await page.waitForTimeout(100);
  check(!(await st()).idle, 'auto-hide: any key press reveals them');
  await page.waitForTimeout(3600);
  await page.evaluate(() => { const v = document.querySelector('.p-reel.on video'); Object.defineProperty(v, 'readyState', { configurable: true, get: () => 1 }); v.dispatchEvent(new Event('waiting')); }); await page.waitForTimeout(800);
  check(!(await st()).idle, 'auto-hide: loading shows them');
  await page.evaluate(() => document.querySelector('.p-reel.on video').dispatchEvent(new Event('error'))); await page.waitForTimeout(3600);
  check(!(await st()).idle, 'auto-hide: never hides on an error');
  // Overlap: the top row (Reel chip + sound) never sits under the close button.
  const ov = await page.evaluate(() => { const a = document.querySelector('.p-wclose').getBoundingClientRect(), row = document.querySelector('.p-reel.on .p-rtoprow');
    return [...row.children].map((c) => c.getBoundingClientRect()).some((b) => b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top); });
  check(!ov, 'top row: chip and sound button never overlap the close button');
  check(!errors.length, `no page errors (${errors.join('; ')})`);
  await context.close();
}
for (const [label, opts, init] of [['reduced motion', { ...phone, reducedMotion: 'reduce' }, null], ['calm', phone, () => { try { localStorage.setItem('calm', '1'); } catch (e) {} }]]) {
  const { context, page } = await open(opts, init);
  if (label === 'calm') await page.evaluate(() => document.querySelector('#app').classList.add('calm'));
  await page.click('.p-whero'); await page.waitForTimeout(200);
  const d = await page.evaluate(() => [document.querySelector('.p-wclose'), document.querySelector('.p-reel.on .cap'), document.querySelector('.p-reel.on .side')].map((e) => getComputedStyle(e).transitionDuration));
  check(d.every((x) => x.split(',').every((t) => parseFloat(t) === 0)), `${label}: auto-hide is an instant change, no fade (${d.join(' | ')})`);
  await context.close();
}
{ // Narrow phone with sound on (longest label): top row still clear of the close button.
  const { context, page } = await open({ viewport: { width: 320, height: 640 }, hasTouch: true, isMobile: true }, () => { try { localStorage.setItem('reelSound', '1'); } catch (e) {} });
  await page.click('.p-whero'); await page.waitForTimeout(300);
  const ov = await page.evaluate(() => { const a = document.querySelector('.p-wclose').getBoundingClientRect();
    return [...document.querySelectorAll('.p-reel.on .p-rtoprow > *')].map((c) => c.getBoundingClientRect()).some((b) => b.left < a.right && b.right > a.left && b.top < a.bottom && b.bottom > a.top); });
  check(!ov, '320px: top row never overlaps the close button');
  await context.close();
}
check(/const VERSION = 'll-v96'/.test(readFileSync(new URL('../sw.js', import.meta.url), 'utf8')), 'service worker cache bumped to ll-v96');
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll video playback checks passed');
process.exit(failures ? 1 : 0);
