// Video reel sound test: video reels start muted with a large "Tap for sound" toggle under the
// progress bar; tapping it unmutes in the same gesture, never pauses or navigates, keeps clear of
// the close button, and the choice lasts for the session across reels. The bottom overlay on
// video reels is compact (title + "more", caption hidden) so text burned into the video stays visible.
// Run: npm test
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }

for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  const context = await browser.newContext({ viewport: vp, serviceWorkers: 'block', hasTouch: name === 'phone', isMobile: name === 'phone' });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const page = await context.newPage();
  await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]');
  const at = await page.evaluate(() => window.LL_CONTENT.reels.findIndex((r) => r.src && /\.mp4$/.test(r.src)));
  check(at >= 0, `${name}: a video reel exists`);
  await page.click(`[data-watch="${at}"]`); await page.waitForTimeout(500);
  const r0 = await page.evaluate(() => { const el = document.querySelector('.p-reel.on'), v = el.querySelector('video'), b = el.querySelector('.p-rsound');
    return { muted: v.muted, inline: v.hasAttribute('playsinline'), controls: v.hasAttribute('controls'), loop: v.loop, btn: !!b, text: b && b.textContent, pressed: b && b.getAttribute('aria-pressed'), video: el.classList.contains('is-video') }; });
  check(r0.muted && r0.inline && !r0.loop && !r0.controls, `${name}: video starts muted, playsinline, no loop, no hidden native controls`);
  check(r0.btn && /Tap for sound/.test(r0.text) && r0.pressed === 'false', `${name}: "Tap for sound" toggle shows on first play`);
  const box = await page.$eval('.p-reel.on .p-rsound', (b) => { const r = b.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.x, y: r.y, r: r.right, b: r.bottom }; });
  check(box.w >= 44 && box.h >= 44, `${name}: sound toggle is at least 44px (${Math.round(box.w)}x${Math.round(box.h)})`);
  const hits = await page.evaluate(() => { const b = document.querySelector('.p-reel.on .p-rsound').getBoundingClientRect(); const x = b.left + b.width / 2, y = b.top + b.height / 2; return document.elementFromPoint(x, y).closest('.p-rsound') ? 1 : 0; });
  check(hits === 1, `${name}: the toggle is on top (not swallowed by the tap zones)`);
  const close = await page.evaluate(() => { const c = [...document.querySelectorAll('#pWatchPlayer button')].find((b) => /close|back/i.test(b.getAttribute('aria-label') || '') && b.getClientRects().length && !b.closest('.p-reel')); return c && (({ x, y, right, bottom }) => ({ x, y, right, bottom }))(c.getBoundingClientRect()); });
  check(!close || box.r <= close.x || box.x >= close.right || box.b <= close.y || box.y >= close.bottom, `${name}: toggle does not overlap the close button`);
  const before = await page.evaluate(() => ({ story: window.LL_reel.state().story, reel: window.LL_reel.state().reel, userpaused: document.querySelector('.p-reel.on').classList.contains('userpaused') }));
  if (name === 'phone') await page.tap('.p-reel.on .p-rsound'); else await page.click('.p-reel.on .p-rsound');
  await page.waitForTimeout(200);
  const r1 = await page.evaluate(() => { const el = document.querySelector('.p-reel.on'), v = el.querySelector('video'), b = el.querySelector('.p-rsound');
    return { muted: v.muted, vol: v.volume, pressed: b.getAttribute('aria-pressed'), text: b.textContent, story: window.LL_reel.state().story, reel: window.LL_reel.state().reel, userpaused: el.classList.contains('userpaused'), ss: sessionStorage.getItem('ll.reelSound') }; });
  check(!r1.muted && r1.vol === 1 && r1.pressed === 'true' && /Sound on/.test(r1.text), `${name}: tapping the toggle unmutes (muted=false, volume=1)`);
  check(r1.story === before.story && r1.reel === before.reel && !r1.userpaused, `${name}: tapping the toggle never pauses or navigates`);
  check(r1.ss === '1', `${name}: the sound choice is kept for the session`);
  const cap = await page.evaluate(() => { const el = document.querySelector('.p-reel.on'), p = el.querySelector('.cap p'), m = el.querySelector('.cap .more'); return { pHidden: !p || !p.getClientRects().length, more: !!(m && m.getClientRects().length), top: el.querySelector('.cap').getBoundingClientRect().top / el.getBoundingClientRect().height }; });
  check(cap.pHidden && cap.more, `${name}: video reel overlay is compact (caption behind "more")`);
  check(cap.top > 0.85, `${name}: the overlay stays in the bottom 15% (${cap.top.toFixed(2)}) so burned-in text is readable`);
  // Close and open again (a new tap): the choice persists across reels in this session.
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.click(`[data-watch="${at}"]`); await page.waitForTimeout(400);
  const r2 = await page.evaluate(() => { const v = document.querySelector('.p-reel.on video'); return { muted: v.muted, pressed: document.querySelector('.p-reel.on .p-rsound').getAttribute('aria-pressed') }; });
  check(r2.pressed === 'true', `${name}: sound stays on for the next reel in this session`);
  const ph = await page.evaluate(() => !document.querySelector('.p-reel:not(.is-video) .p-rsound'));
  check(ph, `${name}: placeholder reels have no sound toggle`);
  await context.close();
}
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll reel sound checks passed');
process.exit(failures ? 1 : 0);
