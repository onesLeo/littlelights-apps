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
  const at = await page.evaluate(() => window.LL_CONTENT.reels.findIndex((r) => r.title === 'The Whisper' && r.src && /\.mp4$/.test(r.src)));
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
  const cap = await page.evaluate(() => { const el = document.querySelector('.p-reel.on'), p = el.querySelector('.cap p'), m = el.querySelector('.cap .more'); return { pHidden: !p || !p.getClientRects().length, noMore: !m, top: el.querySelector('.cap').getBoundingClientRect().top / el.getBoundingClientRect().height }; });
  check(cap.pHidden && cap.noMore, `${name}: video reel overlay is compact (title only, no "more" link)`);
  check(cap.top > 0.85, `${name}: the overlay stays in the bottom 15% (${cap.top.toFixed(2)}) so burned-in text is readable`);
  // CC caption button: round glass, 44px+, stacked with Save/Share, opens the caption sheet without pausing or navigating.
  const cc = await page.evaluate(() => { const el = document.querySelector('.p-reel.on'), b = el.querySelector('.side .p-rcc'), s = b && b.querySelector('svg').getBoundingClientRect(); return b && { label: b.getAttribute('aria-label'), exp: b.getAttribute('aria-expanded'), w: s.width, h: s.height, radius: getComputedStyle(b.querySelector('svg')).borderRadius, inSide: !!b.closest('.side'), sideBottom: el.querySelector('.side').getBoundingClientRect().bottom / el.getBoundingClientRect().height }; });
  check(cc && cc.label === 'Show caption' && cc.exp === 'false' && cc.inSide, `${name}: CC button labelled "Show caption" with aria-expanded, stacked with Save/Share`);
  check(cc && cc.w >= 44 && cc.h >= 44 && cc.radius === '50%', `${name}: CC button is round and at least 44px`);
  check(cc && cc.sideBottom < 0.72, `${name}: action stack sits above the burned-in text (${cc && cc.sideBottom.toFixed(2)})`);
  const b4 = await page.evaluate(() => window.LL_reel.state());
  if (name === 'phone') await page.tap('.p-reel.on .p-rcc'); else await page.click('.p-reel.on .p-rcc');
  await page.waitForTimeout(250);
  const o = await page.evaluate(() => ({ open: !document.querySelector('#pReelSheet').hidden, exp: document.querySelector('.p-reel.on .p-rcc').getAttribute('aria-expanded'), text: document.querySelector('#pReelSheet p').textContent, st: window.LL_reel.state(), paused: document.querySelector('.p-reel.on').classList.contains('userpaused'), awake: document.querySelector('#pReels').classList.contains('awake') }));
  check(o.open && o.exp === 'true' && /James 4:7/.test(o.text), `${name}: tapping CC opens the caption sheet (aria-expanded=true)`);
  check(o.st.story === b4.story && o.st.reel === b4.reel && !o.paused, `${name}: tapping CC never pauses or navigates`);
  check(o.awake, `${name}: the overlay is fully shown while the caption is open`);
  await page.click('#pReelSheet .p-rsheet-x'); await page.waitForTimeout(200);
  check(await page.$eval('.p-reel.on .p-rcc', (b) => b.getAttribute('aria-expanded')) === 'false', `${name}: closing the caption sets aria-expanded=false`);
  // Resting opacity: 60% while playing and idle, 100% when awake; instant in calm mode.
  const op = await page.evaluate(async () => { const r = document.querySelector('#pReels'), el = r.querySelector('.p-reel.on'), cap = el.querySelector('.cap');
    el.classList.add('playing'); r.classList.remove('awake'); await new Promise((f) => setTimeout(f, 50));
    const rest = getComputedStyle(cap).opacity; r.classList.add('awake'); await new Promise((f) => setTimeout(f, 450)); const awakeOp = getComputedStyle(cap).opacity, tr = getComputedStyle(cap).transitionDuration;
    return { rest, awakeOp, tr, calm: document.querySelector('#app').classList.contains('calm') }; });
  check(op.awakeOp === '1', `${name}: overlay goes to 100% when awake`);
  check(op.calm ? op.tr === '0s' : /0\.35s/.test(op.tr), `${name}: overlay fade is ${op.calm ? 'instant in calm mode' : 'a short transition'} (${op.tr})`);
  const rest = await page.evaluate(async () => { const r = document.querySelector('#pReels'), el = r.querySelector('.p-reel.on'), cap = el.querySelector('.cap');
    for (let k = 0; k < 6; k++) { el.classList.add('playing'); r.classList.remove('awake'); await new Promise((f) => setTimeout(f, 100)); }
    return getComputedStyle(cap).opacity; });
  check(rest === '0.6', `${name}: overlay rests at 60% while the video plays (${rest})`);
  // Controls rest at 40% while playing (still tappable), 100% when awake, paused or focus-visible.
  const ctl = await page.evaluate(async () => { const r = document.querySelector('#pReels'), el = r.querySelector('.p-reel.on'), wait = (ms) => new Promise((f) => setTimeout(f, ms));
    const ops = () => [...el.querySelectorAll('.side .p-ract, .p-rsound')].map((b) => getComputedStyle(b).opacity);
    for (let k = 0; k < 6; k++) { el.classList.add('playing'); r.classList.remove('awake'); await wait(100); }
    const rest = ops(), pe = [...el.querySelectorAll('.side .p-ract, .p-rsound')].every((b) => getComputedStyle(b).pointerEvents !== 'none');
    const b = el.querySelector('.p-rsound').getBoundingClientRect(), top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2).closest('.p-rsound') !== null;
    r.dispatchEvent(new PointerEvent('pointermove', { bubbles: true })); await wait(800); const awake = ops();
    r.classList.remove('awake'); el.classList.add('userpaused'); await wait(450); const paused = ops(); el.classList.remove('userpaused');
    return { rest, pe, top, awake, paused, tr: getComputedStyle(el.querySelector('.p-rsound')).transitionDuration }; });
  check(ctl.rest.length >= 4 && ctl.rest.every((o) => o === '0.4'), `${name}: CC/Save/Share and the sound toggle rest at 40% while playing (${ctl.rest.join(',')})`);
  check(ctl.pe && ctl.top, `${name}: resting controls stay tappable (not covered, pointer events on)`);
  check(ctl.awake.every((o) => +o > 0.99) && ctl.paused.every((o) => +o > 0.99), `${name}: controls are 100% when awake and when paused (${ctl.awake},${ctl.paused})`);
  { // first tap on a resting control acts (not swallowed)
    await page.evaluate(async () => { const r = document.querySelector('#pReels'), el = r.querySelector('.p-reel.on'); for (let k = 0; k < 6; k++) { el.classList.add('playing'); r.classList.remove('awake'); await new Promise((f) => setTimeout(f, 100)); } });
    const was = await page.evaluate(() => window.LL_reel.sound());
    if (name === 'phone') await page.tap('.p-reel.on .p-rsound'); else await page.click('.p-reel.on .p-rsound');
    await page.waitForTimeout(150);
    check(await page.evaluate(() => window.LL_reel.sound()) === !was, `${name}: the first tap on a resting sound toggle still toggles sound`);
    if (name === 'phone') await page.tap('.p-reel.on .p-rsound'); else await page.click('.p-reel.on .p-rsound');
    await page.waitForTimeout(150);
  }
  { // focus-visible keeps a resting control at 100%
    await page.evaluate(async () => { const r = document.querySelector('#pReels'), el = r.querySelector('.p-reel.on'); el.classList.add('playing'); r.classList.remove('awake'); });
    await page.focus('.p-reel.on .share'); await page.keyboard.press('Shift'); await page.evaluate(() => { clearTimeout(window.__x); document.querySelector('#pReels').classList.remove('awake'); document.querySelector('.p-reel.on').classList.add('playing'); });
    await page.waitForTimeout(450);
    const fv = await page.$eval('.p-reel.on .share', (b) => ({ fv: b.matches(':focus-visible'), op: getComputedStyle(b).opacity }));
    check(!fv.fv || fv.op === '1', `${name}: a focus-visible control shows at 100% (${fv.fv ? fv.op : 'focus-visible n/a'})`);
  }
  { // Each resting control jumps to 100% on its own hover / press / focus-visible, instantly, while the others stay at 40%.
    const restAll = () => page.evaluate(async () => { document.querySelector('.p-reel.on .z-mid').focus({ preventScroll: true }); const r = document.querySelector('#pReels'), el = r.querySelector('.p-reel.on'); for (let k = 0; k < 6; k++) { el.classList.add('playing'); r.classList.remove('awake'); await new Promise((f) => setTimeout(f, 100)); } });
    const read = (sel) => page.evaluate((sel) => { const el = document.querySelector('.p-reel.on'); el.classList.add('playing'); document.querySelector('#pReels').classList.remove('awake');
      const me = el.querySelector(sel), others = [...el.querySelectorAll('.side .p-ract, .p-rsound')].filter((b) => b !== me);
      return { me: getComputedStyle(me).opacity, tr: getComputedStyle(me).transitionDuration, others: others.map((b) => getComputedStyle(b).opacity) }; }, sel);
    for (const sel of ['.p-rcc', '.save', '.share', '.p-rsound']) {
      if (name === 'desktop') { await restAll(); await page.hover('.p-reel.on ' + sel); await restAll(); await page.waitForTimeout(400); const h = await read(sel); // pointer still over it after the stack goes idle
        check(h.me === '1' && h.tr === '0s' && h.others.every((o) => o === '0.4'), `${name}: hovering ${sel} shows it at 100% instantly while the others rest (${h.me}, ${h.others})`); }
      await restAll();
      const box = await page.$eval('.p-reel.on ' + sel, (b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
      await page.evaluate(({ x, y }) => { const t = document.elementFromPoint(x, y); t.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x, clientY: y })); }, box);
      const pr = await read(sel);
      await page.evaluate(() => document.querySelector('#pReels').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })));
      check(pr.me === '1' && pr.tr === '0s', `${name}: pressing ${sel} shows it at 100% instantly (${pr.me})`);
    }
    await page.mouse.move(5, 5);
  }
  check(await page.evaluate(async () => { document.querySelector('#pReels').dispatchEvent(new PointerEvent('pointermove', { bubbles: true })); return document.querySelector('#pReels').classList.contains('awake'); }), `${name}: moving/touching the reel area wakes the overlay`);
  await page.waitForTimeout(3300);
  check(await page.evaluate(() => !document.querySelector('#pReels').classList.contains('awake')), `${name}: overlay settles again after ~3s idle`);
  // Close and open again (a new tap): the choice persists across reels in this session.
  await page.keyboard.press('Escape'); await page.waitForTimeout(400); await page.click(`[data-watch="${at}"]`); await page.waitForTimeout(400);
  const r2 = await page.evaluate(() => { const v = document.querySelector('.p-reel.on video'); return { muted: v.muted, pressed: document.querySelector('.p-reel.on .p-rsound').getAttribute('aria-pressed') }; });
  check(r2.pressed === 'true', `${name}: sound stays on for the next reel in this session`);
  const only = await page.evaluate(() => ({ reels: window.LL_CONTENT.reels.map((r) => r.title), cards: document.querySelectorAll('#pWatchGal .p-wcard').length }));
  check(only.reels.join('|') === 'The Broken Crayon|First Day Jitters|The Last Straw|The Whisper', `${name}: only The Broken Crayon, First Day Jitters, The Last Straw and The Whisper are shipped visible (placeholders hidden by default)`);
  await context.close();
}
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  await context.addInitScript(() => localStorage.setItem('ll.calm', '1'));
  const page = await context.newPage(); await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]');
  check(await page.$$eval('#pWatchGal .p-whero', (h) => h.length) === 1 && await page.$$eval('#pWatchGal .p-wcard', (c) => c.length) === 3 && await page.$$eval('#pWatchGal .p-wsub', (c) => c.length) === 1, 'four shipped reels: Watch shows the hero and three cards under More videos');
  check(!(await page.$('#pFeed .p-slide.s3:not(.s-studio)')) && (await page.$$('[data-reel="-1"]')).length === 0, 'Today: the card for the hidden Jonathan reel is removed, no broken links');
  await page.click('.p-whero'); await page.waitForTimeout(300);
  check(await page.$eval('.p-reel.on .cap', (c) => getComputedStyle(c).transitionDuration) === '0s', 'calm mode: overlay changes instantly (no fade)');
  check(await page.$$eval('.p-reel.on .side .p-ract, .p-reel.on .p-rsound', (b) => b.every((x) => getComputedStyle(x).transitionDuration === '0s')), 'calm mode: controls change instantly (no fade)');
  await context.close();
  const rm = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' });
  await rm.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const p2 = await rm.newPage(); await p2.goto(base + '#watch'); await p2.waitForSelector('#app[data-ready]'); await p2.click('.p-whero'); await p2.waitForTimeout(300);
  check(await p2.$eval('.p-reel.on .cap', (c) => getComputedStyle(c).transitionDuration) === '0s', 'reduced motion: overlay changes instantly (no fade)');
  check(await p2.$$eval('.p-reel.on .side .p-ract, .p-reel.on .p-rsound', (b) => b.every((x) => getComputedStyle(x).transitionDuration === '0s')), 'reduced motion: controls change instantly (no fade)');
  await rm.close();
}
// Caption paragraphs: blank lines in a caption become separate <p>s (textContent only, no HTML parsing).
for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  const context = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  const page = await context.newPage(); await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]');
  const i = await page.evaluate(() => window.LL_CONTENT.reels.findIndex((r) => r.title === 'First Day Jitters'));
  await page.click(`[data-watch="${i}"]`); await page.waitForTimeout(300); await page.click('.p-reel.on .p-rcc'); await page.waitForTimeout(300);
  const ps = await page.evaluate(() => ({ want: window.LL_CONTENT.reels.find((r) => r.title === 'First Day Jitters').caption.split('\n\n'), got: [...document.querySelectorAll('#pReelSheet p')].map((p) => ({ t: p.textContent, kids: p.children.length, gap: parseFloat(getComputedStyle(p).marginTop) })) }));
  check(ps.got.length === 3 && ps.got.every((p, k) => p.t === ps.want[k] && p.kids === 0) && ps.got[1].gap > 0 && ps.got[2].gap > 0, `${name}: a caption with blank lines shows as 3 separate paragraphs, text exact`);
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.evaluate((i) => { window.LL_reel.open(i); }, i + 1); await page.waitForTimeout(300); await page.click('.p-reel.on .p-rcc'); await page.waitForTimeout(300);
  check(await page.$$eval('#pReelSheet p', (p) => p.length) === 1, `${name}: extra paragraphs are cleared when a single-paragraph caption opens`);
  await context.close();
}
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll reel sound checks passed');
process.exit(failures ? 1 : 0);
