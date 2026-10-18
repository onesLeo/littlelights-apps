// Wordmark contrast: every visible header wordmark ("Salt and" and both ends of the "Light" gradient) is measured
// against the pixels actually behind it, in day and night, at phone and computer sizes.
// Run: node tests/wmcontrast.mjs [--shots]   (WCAG AA: 4.5:1; the Today phone row is large display text, 3:1)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const shots = process.argv.includes('--shots');
const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch();
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; };
const lum = ([r, g, b]) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const rgb = (s) => s.startsWith('#') ? [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16)) : (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
const views = ['today', 'watch', 'listen', 'read', 'verses', 'play'];
export const results = [];

for (const vp of [{ width: 412, height: 915, phone: true }, { width: 1280, height: 800 }]) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: vp, isMobile: !!vp.phone, hasTouch: !!vp.phone, serviceWorkers: 'block', colorScheme: scheme, deviceScaleFactor: 2 });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await ctx.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
    await ctx.addInitScript(() => localStorage.setItem('ll.settings.v1', JSON.stringify({ nav: { menus: { verses: 'on' } }, content: { verses: true } })));
    const page = await ctx.newPage();
    await page.goto(base); await page.waitForSelector('#app[data-ready]');
    await page.addStyleTag({ content: '*,*::before,*::after{animation:none!important;transition:none!important}' });
    const mode = scheme === 'light' ? 'day' : 'night';
    check((await page.$eval('#app', (a) => a.classList.contains('night'))) === (mode === 'night'), `${vp.width}px: app follows ${mode}`);
    for (const v of views) {
      await page.evaluate((v) => { location.hash = v; }, v); await page.waitForTimeout(700);
      // The visible wordmark for this screen: the header logo on page views, the phone row or top bar on Today/Watch.
      const sel = await page.evaluate((v) => {
        const cands = [`.p-view[data-view="${v}"] .p-logo .wm`, '.p-rings .p-rwm .wm', '.p-brand .wm'];
        for (const s of cands) { const e = document.querySelector(s); if (!e) continue; const b = e.getBoundingClientRect();
          if (b.width > 20 && b.height > 0 && b.bottom > 0 && b.top < innerHeight && getComputedStyle(e).visibility !== 'hidden') {
            if (s.includes('p-rwm') && v !== 'today') continue; return s; } }
        return null;
      }, v);
      if (!sel) { console.log(`--   ${vp.width}px ${mode} ${v}: no wordmark on this screen`); continue; }
      const el = page.locator(sel).first();
      const fg = await el.evaluate((w) => { const cs = getComputedStyle(w); const g = (n) => cs.getPropertyValue(n).trim();
        const l = getComputedStyle(w.querySelector('.wm-l')); const solid = l.backgroundImage === 'none';
        const s = getComputedStyle(w.querySelector('.wm-s')).color; const c = document.createElement('canvas').getContext('2d');
        const norm = (x) => { c.fillStyle = '#000'; c.fillStyle = x; return c.fillStyle; };
        return { s, l1: solid ? l.color : norm(g('--wm-g1')), l2: solid ? l.color : norm(g('--wm-g2')), fs: parseFloat(cs.fontSize) }; });
      const box = await el.boundingBox();
      if (shots && v === 'play' && vp.phone) {
        const h = await page.locator(`.p-view[data-view="play"] .p-head`).boundingBox();
        await page.screenshot({ path: `/workspace/hdr-play-${mode}.png`, clip: { x: 0, y: Math.max(0, h.y - 8), width: vp.width, height: h.height + 16 } });
      }
      if (shots && mode === 'day') {
        const h = sel.includes('p-logo') ? await page.locator(`.p-view[data-view="${v}"] .p-head`).boundingBox() : { y: Math.max(0, box.y - 20), height: box.height + 40 };
        await page.screenshot({ path: `test-results/hdr-${vp.width}-${v}.png`, clip: { x: 0, y: Math.max(0, h.y - 4), width: vp.width, height: h.height + 8 } });
      }
      // Background: hide the wordmark ink and sample the pixels it covered.
      await el.evaluate((w) => { w.dataset.hid = w.style.visibility; w.style.visibility = 'hidden'; });
      const png = await page.screenshot({ clip: box });
      await el.evaluate((w) => { w.style.visibility = w.dataset.hid; });
      const bg = await page.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
        const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        const d = x.getImageData(0, 0, c.width, c.height).data; const px = [];
        for (let i = 0; i < d.length; i += 4) px.push([d[i], d[i + 1], d[i + 2]]);
        const L = (p) => 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]; px.sort((a, b) => L(a) - L(b));
        const avg = px.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]).map((s) => s / px.length);
        return { avg, dark: px[Math.floor(px.length * 0.05)], light: px[Math.floor(px.length * 0.95)] }; }, png.toString('base64'));
      const today = v === 'today' || v === 'watch';
      const min = sel.includes('p-rwm') || fg.fs >= 24 ? 3 : 4.5; // large text (>=24px) and the Today display row: 3:1
      // Worst case against the 5th and 95th percentile of the background (photos and gradients behind the glass).
      const worst = (c) => Math.min(ratio(rgb(c), bg.avg), ratio(rgb(c), bg.dark), ratio(rgb(c), bg.light));
      const r = { size: vp.width, mode, view: v, sel, salt: worst(fg.s), light1: worst(fg.l1), light2: worst(fg.l2), fg, bg: bg.avg.map(Math.round) };
      results.push(r);
      const f = (n) => n.toFixed(2);
      check(r.salt >= min && Math.min(r.light1, r.light2) >= min, `${vp.width}px ${mode} ${v}${today ? ` (${sel.split(' ')[0]})` : ''}: wordmark contrast "Salt and" ${f(r.salt)}:1, "Light" ${f(r.light1)}–${f(r.light2)}:1 (min ${min}:1)`);
    }
    await ctx.close();
  }
}
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
