// Video playback test: a refused play() shows "Tap to play" (and the progress never fakes ahead),
// waiting/stalled shows a calm spinner, an error offers "Try again", only the current and next reel
// preload metadata, the Watch gallery never uses a <video>, and the desktop book art uses the poster.
// Run: npm test
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';
import { renderPage, reelTextHtml, seriesIntroHtml } from '../lib/head.mjs';
import { REEL_TEXT, SERIES_INTRO } from '../lib/reel-text.mjs';

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
// "About this video" box and series intros (lib/reel-text.mjs): static HTML, desktop only.
{
  const tpl = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const reel = { title: 'First Day Jitters', caption: 'Old caption.', slug: 'first-day-jitters' };
  const reelHtml = renderPage(tpl, { tab: 'watch', kind: 'reel', item: reel, meta: { path: '/watch/first-day-jitters', title: 'x', desc: 'x' } });
  const t = REEL_TEXT['first-day-jitters'];
  check(/<details class="p-about"><summary>/.test(reelHtml) && reelHtml.indexOf('class="p-about"') < reelHtml.indexOf('id="pWatchPlayer"'), 'watch page: native <details> About box in the static HTML');
  const sum = reelHtml.slice(reelHtml.indexOf('<summary>'), reelHtml.indexOf('</summary>'));
  const esc = (x) => x.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const has = (h, x) => h.includes(x) || h.includes(esc(x)) || h.includes(x.replace(/"/g, '&quot;'));
  check(has(sum, t.summary) && has(sum, t.verse) && !has(sum, t.lesson) && !has(sum, t.prayer), 'About box: closed summary has the summary and verse only');
  check(has(reelHtml, t.lesson) && has(reelHtml, t.prayer), 'About box: open part has the lesson and prayer');
  check(!/<div class="p-seo"><h1>[^<]*<\/h1><p>/.test(reelHtml), 'About box replaces the hidden .p-seo caption it would repeat');
  check(reelTextHtml(undefined) === '' && reelTextHtml({ summary: ' ' }) === '', 'no text, no About box');
  const partial = reelTextHtml({ summary: 'Only a summary.' });
  check(partial.includes('Only a summary.') && !partial.includes('p-about-verse') && !partial.includes('p-about-body'), 'missing fields are left out');
  check(seriesIntroHtml('no-such-series') === '' && seriesIntroHtml('') === '', 'empty series intro slot renders nothing');
  const empty = renderPage(tpl, { tab: 'watch', kind: 'series', item: { series: 'Other', desc: 'Desc.', reels: [] }, meta: { path: '/watch/series/other' } });
  check(!empty.includes('p-sintro') && empty.includes('<p>Desc.</p>'), 'series page with no intro: no intro markup, hidden description kept');
  const ser = renderPage(tpl, { tab: 'watch', kind: 'series', item: { series: 'Slice of Life', desc: 'D', reels: [] }, meta: { path: '/watch/series/slice-of-life' } });
  check(ser.includes('class="p-sintro"') && has(ser, SERIES_INTRO['slice-of-life']) && ser.indexOf('p-sintro') < ser.indexOf('id="pWatchGal"'), 'series page: intro at the top, in the static HTML');
  for (const [w, mobile] of [[1280, false], [375, true]]) {
    const shown = true;
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: w, height: 900 } });
    await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
    await context.route('**/watch/first-day-jitters', (r) => r.fulfill({ contentType: 'text/html', body: reelHtml.replace('<head>', '<head><base href="' + base + '">') }));
    await context.route('**/watch/series/slice-of-life', (r) => r.fulfill({ contentType: 'text/html', body: ser.replace('<head>', '<head><base href="' + base + '">') }));
    const page = await context.newPage();
    await page.goto(base + 'watch/first-day-jitters'); await page.waitForSelector('#app[data-ready]');
    const vis = await page.$eval('.p-about', (d) => getComputedStyle(d).display !== 'none' && d.getBoundingClientRect().height > 0);
    check(vis, `${w}px: About box shown`);
    {
      check(await page.$eval('.p-about', (d) => !d.open), `${w}px: About box starts closed`);
      await page.focus('.p-about > summary'); await page.keyboard.press('Enter');
      check(await page.$eval('.p-about', (d) => d.open && getComputedStyle(d.querySelector('.p-about-prayer')).display !== 'none'), `${w}px: keyboard Enter opens it and shows the prayer`);
      check(await page.$eval('.p-about', (d) => { const c = getComputedStyle(d); return c.color === 'rgb(246, 241, 255)' && c.backgroundColor === 'rgb(29, 21, 56)'; }), `${w}px: About box keeps its AA colours`);
    }
    await page.goto(base + 'watch/series/slice-of-life'); await page.waitForSelector('#app[data-ready]');
    check(await page.$eval('.p-sintro', (d) => getComputedStyle(d).display !== 'none' && d.getBoundingClientRect().height > 0) , `${w}px: series intro shown`);
    const st = () => page.$eval('.p-sintro-box', (b) => { const p = b.querySelector('.p-sintro'), m = b.querySelector('.p-sintro-more'), lh = parseFloat(getComputedStyle(p).lineHeight);
      return { lines: Math.round(p.getBoundingClientRect().height / lh), btn: getComputedStyle(m).display !== 'none', exp: m.getAttribute('aria-expanded'), text: p.textContent.length }; });
    const a = await st();
    if (mobile) {
      check(a.lines === 2 && a.btn && a.exp === 'false' && a.text > 150, `${w}px: intro clamped to 2 lines with a More button (full text in HTML)`);
      await page.focus('.p-sintro-more'); await page.keyboard.press('Enter');
      const b = await st();
      check(b.lines > 2 && b.exp === 'true' && await page.$eval('.p-sintro-more', (m) => m.textContent === 'Less'), `${w}px: More (keyboard) expands the intro, aria-expanded true, says Less`);
    } else check(!a.btn && a.lines > 2, `${w}px: full intro, no More button`);
    await context.close();
  }
}
// In the live app (not just the static HTML): the series sheet shows the intro under its title, and
// the reel caption sheet shows the "About this video" box for whichever reel is open.
{
  const SER = `;(function(){var eps={'The Broken Crayon':1,'First Day Jitters':2,'The Last Straw':3,'The Whisper':4};window.LL_CONTENT.reels.forEach(function(r){if(eps[r.title]){r.series='Slice of Life';r.episode=eps[r.title];r.series_description='Little everyday moments in a Singapore family.';}});})();`;
  for (const night of [false, true]) {
    const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true, colorScheme: night ? 'dark' : 'light', reducedMotion: 'reduce' });
    await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
    await context.route(/\/js\/content\.js/, async (r) => { const res = await r.fetch(); r.fulfill({ response: res, body: (await res.text()) + SER }); });
    await context.route(/\.mp4(\?|#|$)/, () => {});
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]');
    const tag = night ? 'night' : 'day';
    check(await page.evaluate(() => !!window.LL_TEXT && typeof window.LL_TEXT.reelTextHtml === 'function'), `${tag}: js/reel-text.js loaded in the app`);
    await page.evaluate(() => window.LL_series.open('Slice of Life')); await page.waitForTimeout(200);
    const sh = await page.evaluate(() => { const b = document.querySelector('#pSeries .p-series-body'), h = b.querySelector('h2'), box = b.querySelector('.p-sintro-box'), p = box && box.querySelector('.p-sintro'), m = box && box.querySelector('.p-sintro-more');
      return { box: !!box, after: !!box && h.nextElementSibling === box, text: p ? p.textContent : '', lines: p ? Math.round(p.getBoundingClientRect().height / parseFloat(getComputedStyle(p).lineHeight)) : 0, more: m ? getComputedStyle(m).display !== 'none' : false, desc: !!b.querySelector('.p-series-desc'), ids: document.querySelectorAll('#' + (p ? p.id : 'x')).length, ctl: m && document.getElementById(m.getAttribute('aria-controls')) === p }; });
    check(sh.box && sh.after && sh.text === SERIES_INTRO['slice-of-life'], `${tag}: in-app series sheet shows the intro word for word, right under the title`);
    check(sh.lines === 2 && sh.more && sh.ctl && sh.ids === 1, `${tag}: series sheet intro clamped to 2 lines on a phone, More controls it, unique id`);
    check(sh.desc, `${tag}: existing series description kept below the intro`);
    await page.click('#pSeries .p-sintro-more');
    check(await page.$eval('#pSeries .p-sintro-more', (m) => m.textContent === 'Less' && m.getAttribute('aria-expanded') === 'true'), `${tag}: series sheet More expands (Less)`);
    if (shots && !night) await page.screenshot({ path: shots + '/inapp-series-sheet-375.png' });
    // Play episode 1 (The Broken Crayon), then switch reels: the About box follows the open reel.
    const idx = await page.evaluate(() => { const o = {}; window.LL_CONTENT.reels.forEach((r, i) => { o[r.title] = i; }); return o; });
    for (const [title, slug] of [['The Broken Crayon', 'the-broken-crayon'], ['The Whisper', 'the-whisper'], ['First Day Jitters', 'first-day-jitters']]) {
      await page.evaluate(() => { window.LL_closeWatch && window.LL_closeWatch(true); window.LL_series.close && window.LL_series.close(); });
      await page.evaluate((i) => { document.querySelector('#pWatchGal').insertAdjacentHTML('beforeend', '<button type="button" id="tmpPlay" data-watch="' + i + '">x</button>'); }, idx[title]);
      await page.click('#tmpPlay'); await page.evaluate(() => document.getElementById('tmpPlay') && document.getElementById('tmpPlay').remove()); await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelector('.p-reel.on .more').click()); await page.waitForTimeout(150);
      const t = REEL_TEXT[slug];
      const a = await page.evaluate(() => { const d = document.querySelector('#pReelSheet .bk-about details.p-about'), sh = document.querySelector('#pReelSheet .p-rsheet-in'), h = sh.querySelector('h3');
        if (!d) return null; const r = d.getBoundingClientRect(), hr = h.getBoundingClientRect(), side = document.querySelector('.p-reel.on .side'), cap = document.querySelector('.p-reel.on .cap');
        const vis = (e) => e && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).opacity !== '0' && e.getBoundingClientRect().height > 0;
        const over = (e) => { if (!vis(e)) return false; const b = e.getBoundingClientRect(); return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top && document.elementFromPoint(r.left + 10, r.top + 10) && !d.contains(document.elementFromPoint(r.left + 10, r.top + 10)); };
        return { open: d.open, sum: d.querySelector('summary').textContent, body: d.textContent, below: r.top >= hr.bottom, overlap: over(side) || over(cap), color: getComputedStyle(d).color, bg: getComputedStyle(d).backgroundColor, h3: getComputedStyle(d.querySelector('h3')).fontSize, first: getComputedStyle(d.querySelector('.p-about-body p'), '::first-letter').float }; });
      check(!!a && !a.open && a.sum.includes(t.summary) && a.sum.includes(t.verse) && a.body.includes(t.lesson) && a.body.includes(t.prayer), `${tag}: ${title}: collapsed About box in the in-app caption sheet, word for word`);
      check(!!a && a.below && !a.overlap, `${tag}: ${title}: About box sits below the episode info, not over the player controls or caption`);
      check(!!a && a.color === 'rgb(246, 241, 255)' && a.bg === 'rgb(29, 21, 56)' && a.first === 'none', `${tag}: ${title}: About box keeps its AA colours, no drop cap`);
      const pageBoxes = await page.evaluate(() => [...document.querySelectorAll('details.p-about')].filter((d) => !document.getElementById('pWatchPlayer').contains(d)).map((d) => d.textContent));
      check(pageBoxes.length <= 1 && pageBoxes.every((x) => x.includes(t.summary)), `${tag}: ${title}: no other reel's About text left on the page`);
      if (shots && !night && slug === 'the-whisper') { await page.click('#pReelSheet .p-about > summary'); await page.evaluate(() => document.querySelector('#pReelSheet .p-about').scrollIntoView({ block: 'end' })); await page.waitForTimeout(150); await page.screenshot({ path: shots + '/inapp-reel-about-open-375.png' }); }
    }
    // A reel with no text: no About box in its sheet.
    const plain = await page.evaluate(() => { const T = window.LL_TEXT; return window.LL_CONTENT.reels.findIndex((r) => !T.reelText(window.LL_SEO.reelSlug(r)) && r.caption); });
    if (plain >= 0) check(await page.evaluate((i) => window.LL_about.html(i) === '', plain), `${tag}: a reel with no text gets no About box`);
    check(!errors.length, `${tag}: no page errors (${errors.join('; ')})`);
    await context.close();
  }
}
check(/const VERSION = 'll-v99'/.test(readFileSync(new URL('../sw.js', import.meta.url), 'utf8')), 'service worker cache bumped to ll-v99');
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll video playback checks passed');
process.exit(failures ? 1 : 0);
