// Clear-glass caption test: the caption sheet (phone) and book page (desktop) are see-through
// (light tint + backdrop blur, no opaque underlay), backdrop-filter is really applied (no ancestor
// or fallback blocks it), and the caption text stays AA over the brightest real frames of
// media/reels/the-whisper.mp4 (tests/fixtures/whisper-frame-*.jpg, extracted with ffmpeg).
// Run: npm test
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }
const frames = ['19.0', '18.1', '17.97', '14.6'];
const frameData = {};
for (const f of frames) frameData[f] = 'data:image/jpeg;base64,' + (await readFile(new URL(`./fixtures/whisper-frame-${f}.jpg`, import.meta.url))).toString('base64');

async function openSheet(vp, theme) {
  const context = await browser.newContext({ viewport: vp, serviceWorkers: 'block' });
  await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = {};' }));
  await context.addInitScript((t) => { localStorage.setItem('ll.theme', t); localStorage.setItem('ll.calm', '1'); }, theme);
  const page = await context.newPage();
  await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]');
  // The fixtures are frames of The Whisper, so open that reel (it is no longer the newest/hero).
  const w = await page.evaluate(() => window.LL_CONTENT.reels.findIndex((r) => r.title === 'The Whisper'));
  await page.click(`[data-watch="${w}"]`); await page.waitForTimeout(300);
  await page.click('.p-reel.on .p-rcc'); await page.waitForTimeout(500);
  return { context, page };
}
// Put a real video frame behind the glass (on top of the <video>, which this Chromium can't decode).
const setFrame = (page, src) => page.evaluate(async (src) => {
  let im = document.querySelector('#glassFrame');
  const kb = document.querySelector('.p-reel.on .p-rkb');
  if (!im) { im = document.createElement('img'); im.id = 'glassFrame'; im.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:5'; kb.appendChild(im); }
  im.src = src; await im.decode();
  const art = document.querySelector('.p-wplayer.book .bk-art'); // desktop: the twin video behind the book page
  if (art) { let a = art.querySelector('#glassFrame2'); if (!a) { a = document.createElement('img'); a.id = 'glassFrame2'; a.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1'; art.appendChild(a); } a.src = src; await a.decode(); } await new Promise((f) => requestAnimationFrame(() => requestAnimationFrame(f)));
}, src);

for (const [name, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  for (const theme of ['day', 'night']) {
    const tag = `${name} ${theme}`;
    const { context, page } = await openSheet(vp, theme);
    const info = await page.evaluate(() => {
      const inn = document.querySelector('.p-rsheet-in'), cs = getComputedStyle(inn);
      const bf = cs.backdropFilter || cs.webkitBackdropFilter;
      const bg = cs.backgroundImage, alphas = [...bg.matchAll(/rgba\([^)]*?,\s*([\d.]+)\)/g)].map((m) => +m[1]);
      // Ancestors that would stop backdrop-filter from seeing the video (Chromium backdrop root rules).
      const bad = []; for (let e = inn.parentElement; e && e !== document.body; e = e.parentElement) {
        const c = getComputedStyle(e);
        if (+c.opacity < 1 || c.filter !== 'none' || c.mixBlendMode !== 'normal' || (c.maskImage && c.maskImage !== 'none') || /filter|opacity/.test(c.willChange)) bad.push(e.id || e.className);
      }
      return { bf, alphas, bad, after: getComputedStyle(inn, '::after').display, sup: CSS.supports('backdrop-filter: blur(1px)') || CSS.supports('-webkit-backdrop-filter: blur(1px)'), style: inn.dataset.style, sheetBg: getComputedStyle(document.querySelector('.p-rsheet')).backgroundColor };
    });
    check(info.sup && /blur\(18px\)/.test(info.bf) && /saturate\(1\.8\)/.test(info.bf), `${tag}: backdrop-filter is applied (${info.bf})`);
    const maxA = name === 'phone' ? 0.35 : 0.5;
    check(info.alphas.length >= 2 && Math.max(...info.alphas.slice(-2)) <= maxA + 1e-6, `${tag}: sheet tint is light (alphas ${info.alphas.slice(-2).join(' -> ')}, max ${maxA})`);
    check(info.after === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(info.sheetBg), `${tag}: no grain overlay or opaque scrim`);
    check(info.bad.length === 0, `${tag}: no ancestor breaks backdrop-filter (${info.bad.join(', ') || 'none'})`);
    // See-through: an area of the sheet away from the text changes clearly when the video frame changes.
    const probe = await page.evaluate(() => { const r = document.querySelector('.p-rsheet-in').getBoundingClientRect(); return { x: Math.round(r.left + 4), y: Math.round(r.top + 6), width: Math.round(Math.min(60, r.width / 6)), height: 14 }; });
    const mean = async () => { const png = (await page.screenshot({ clip: probe })).toString('base64'); return page.evaluate(async (png) => { const im = new Image(); im.src = 'data:image/png;base64,' + png; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += (d[i] + d[i + 1] + d[i + 2]) / 3; return s / (d.length / 4); }, png); };
    await setFrame(page, frameData['19.0']); const bright = await mean();
    await setFrame(page, frameData['14.6']); const dark = await mean();
    check(Math.abs(bright - dark) > 60, `${tag}: the video shows through the glass (sheet edge brightness ${dark.toFixed(0)} vs ${bright.toFixed(0)} for a dark vs bright frame)`);
    // AA over the brightest real frames.
    let worst = { r: 99 };
    for (const f of frames) {
      await setFrame(page, frameData[f]);
      const texts = await page.evaluate(() => { const els = [...document.querySelectorAll('.p-rsheet-in .bk-kick, .p-rsheet-in h3, .p-rsheet-in p')];
        const out = els.map((e) => { const g = document.createRange(); g.selectNodeContents(e); return { sel: e.tagName + '.' + e.className, rects: [...g.getClientRects()].map((r) => ({ x: r.left, y: r.top, w: r.width, h: r.height })), color: getComputedStyle(e).color, big: parseFloat(getComputedStyle(e).fontSize) >= 24 }; });
        els.forEach((e) => { e.dataset.css = e.style.cssText; e.style.setProperty('color', 'transparent', 'important'); e.style.setProperty('text-shadow', 'none', 'important'); });
        document.querySelector('.p-rsheet-in').classList.add('glass-probe'); return out; });
      await page.addStyleTag({ content: '.glass-probe p::first-letter { color: transparent !important; }' });
      const png = (await page.screenshot()).toString('base64');
      await page.evaluate(() => document.querySelectorAll('.p-rsheet-in [data-css]').forEach((e) => { e.style.cssText = e.dataset.css; delete e.dataset.css; }));
      const r = await page.evaluate(async ({ png, texts }) => {
        const im = new Image(); im.src = 'data:image/png;base64,' + png; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const lum = (c) => { const v = c.map((n) => { n /= 255; return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4; }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
        let min = 99, at = '';
        for (const t of texts) { const tc = t.color.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number), A = lum(tc);
          for (const r of t.rects) { if (r.w < 1) continue; const d = g.getImageData(Math.floor(r.x), Math.floor(r.y), Math.max(1, Math.floor(r.w)), Math.max(1, Math.floor(r.h))).data;
            for (let i = 0; i < d.length; i += 16) { const B = lum([d[i], d[i + 1], d[i + 2]]), q = (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); const need = t.big ? 3 : 4.5; if (q / need < min / (at.endsWith('big') ? 3 : 4.5) || min === 99) { if (q < min) { min = q; at = t.sel + (t.big ? ' big' : ''); } } } } }
        return { min, at };
      }, { png, texts });
      if (r.min < worst.r) worst = { r: r.min, at: r.at, f };
    }
    const need = /big$/.test(worst.at) ? 3 : 4.5;
    check(worst.r >= need, `${tag} (${info.style} page): caption text AA over the brightest video frames, worst ${worst.r.toFixed(2)}:1 (${worst.at}, frame ${worst.f}s, needs ${need})`);
    await context.close();
  }
}
await browser.close(); server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll glass checks passed');
process.exit(failures ? 1 : 0);
