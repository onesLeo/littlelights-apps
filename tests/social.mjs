// Follow Little Salt & Light (js/seo.js followHtml): our three accounts only, Instagram, then TikTok, then YouTube, as plain
// links (new tab, rel="noopener noreferrer"), inline SVG icons, no third-party scripts or embeds. Shown on Today
// (phone footer, computer side column), at the end of bedtime story pages and at the end of a reel; never in the Studio.
// Site footer (footerHtml) in styles B and C. AA contrast in day and night. Screenshots go to SHOTS (default test-results/). Run: npm test
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { serve } from '../scripts/serve.mjs';

let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }
const root = new URL('..', import.meta.url).pathname;
const SHOTS = process.env.SHOTS || join(root, 'test-results'); mkdirSync(SHOTS, { recursive: true });
const WANT = [['Instagram', 'https://www.instagram.com/littlesaltandlight_/'], ['TikTok', 'https://www.tiktok.com/@littlesaltandlight'], ['YouTube', 'https://www.youtube.com/@little_salt_and_light']];
const BAD = /youtu\.be|facebook|fb\.com|whatsapp|wa\.me/i;
globalThis.window = globalThis; createRequire(import.meta.url)(join(root, 'js/seo.js')); const SEO = globalThis.LL_SEO;

function linksOk(html) {
  const a = [...html.matchAll(/<a class="p-follow-a" href="([^"]+)" target="_blank" rel="noopener noreferrer" aria-label="Little Salt &amp; Light on ([^"]+)"[^>]*>.*?<span>([^<]+)<\/span><\/a>/g)].filter((m) => m[2] === m[3]).map((m) => [m[3], m[1]]);
  return JSON.stringify(a) === JSON.stringify(WANT);
}
const gen = SEO.followHtml();
check(linksOk(gen) && gen.includes('>Follow Little Salt &amp; Light<'), 'followHtml: heading, Instagram, TikTok, YouTube, exact URLs, aria-labels, new tab with noopener noreferrer');
check(!BAD.test(gen) && !/<script|<iframe/.test(gen) && (gen.match(/<svg /g) || []).length === 3 && /aria-hidden="true"/.test(gen), 'followHtml: inline icons only, no other networks, scripts or embeds');
const idx = readFileSync(join(root, 'index.html'), 'utf8');
const blocks = idx.match(/<section class="p-follow[\s\S]*?<\/section>/g) || [];
check(blocks.length === 2 && blocks.every(linksOk), 'index.html: phone footer and computer side column blocks have the same links');
const sub = (SEO.followHtml().match(/<p class="p-follow-sub">([^<]*)</) || [])[1] || '';
check(blocks.every((b) => ((b.match(/<p class="p-follow-sub">([^<]*)</) || [])[1] || '') === sub), `subline "${sub}" matches js/seo.js FOLLOW_SUBLINE in index.html`);
check(!/p-follow|instagram|tiktok|youtube\.com\/@little/i.test(readFileSync(join(root, 'studio/index.html'), 'utf8')), 'the Studio has no follow links');
check(!BAD.test(idx), 'index.html links no Facebook or WhatsApp');

// Site footer (footerHtml): on every page except Today (bigger card), bedtime story pages and reel end screens
// (bigger card at the end) and the Studio. Two styles, B and C, picked by the site setting 'footer_style'.
const foot = SEO.footerHtml('x');
const footLinks = [...foot.matchAll(/<a class="sf-soc sf-[a-z]+" href="([^"]+)" target="_blank" rel="noopener noreferrer" aria-label="Little Salt &amp; Light on ([^"]+)"/g)].map((m) => [m[2], m[1]]);
check(JSON.stringify(footLinks) === JSON.stringify(WANT) && foot.includes('>Follow Little Salt &amp; Light<') && !/<script|<iframe/.test(foot), 'footerHtml: heading, three follow links with aria-labels, new tab, no scripts');
check(SEO.footerStyle('B') === 'B' && SEO.footerStyle('C') === 'C' && SEO.footerStyle({ style: 'B' }) === 'B' && SEO.footerStyle('Z') === null && SEO.footerStyle(null) === null && SEO.FOOTER_DEFAULT === 'C', 'footerStyle: B and C accepted, anything else rejected, default C');
const foots = idx.match(/<footer class="p-sfoot"[\s\S]*?<\/footer>/g) || [];
check(foots.length === 5 && ['watch', 'listen', 'read', 'verses', 'play'].every((id, i) => foots[i] === SEO.footerHtml(id)), 'index.html: Watch, Listen, Read, Verses and Play each hold footerHtml()');
check(/<div class="[^"]*\bff-C\b[^"]*" id="app"/.test(idx), 'index.html (and so prerendered pages and no-JS visitors) start with style C');
const todayHtml = idx.slice(idx.indexOf('data-view="today"'), idx.indexOf('data-view="watch"'));
check(!todayHtml.includes('p-sfoot'), 'Today has no footer (the bigger card is there)');
check(readFileSync(join(root, '404.html'), 'utf8').includes(SEO.footerHtml('nf').replace('class="p-sfoot"', 'class="p-sfoot ff-C"')), '404.html has the footer (style C)');
check(!/p-sfoot|p-ffoot/.test(readFileSync(join(root, 'studio/index.html'), 'utf8')), 'the Studio has no footer');

function lum(c) { const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
async function contrast(page, sel) {
  return page.$$eval(sel + ' .p-follow-a span, ' + sel + ' .p-follow-h', (els) => els.filter((e) => e.getClientRects().length).map((e) => {
    let n = e, bg = 'rgba(0, 0, 0, 0)';
    while (n && (bg = getComputedStyle(n).backgroundColor) === 'rgba(0, 0, 0, 0)') n = n.parentElement;
    return [getComputedStyle(e).color, bg];
  }));
}
const server = await serve(0); const base = `http://localhost:${server.address().port}`;
const browser = await chromium.launch();
try {
  for (const [vp, size] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1366, height: 900 }]]) {
    const ctx = await browser.newContext({ viewport: size, serviceWorkers: "block" });
    const page = await ctx.newPage(); const third = [];
    page.on('request', (r) => { const u = new URL(r.url()); if (!u.href.startsWith(base) && !/^data:/.test(r.url())) third.push(u.host); });
    for (const mode of ['day', 'night']) {
      await page.goto(base + '/'); await page.waitForSelector('#app[data-ready]');
      if (mode === 'night') await page.evaluate(() => { const app = document.getElementById('app'); if (!app.classList.contains('night')) document.querySelector('[data-mode]').click(); });
      const sel = vp === 'phone' ? '.p-follow.in-feed' : '.sc-follow .p-follow';
      const vis = await page.$eval(sel, (e) => e.getBoundingClientRect().height > 0).catch(() => false);
      check(vis, `${vp} ${mode}: Follow block is visible on Today`);
      const c = await contrast(page, sel); check(c.length >= 3 && c.every(([f, b]) => ratio(f, b) >= 4.5), `${vp} ${mode}: Follow text AA (${c.map(([f, b]) => ratio(f, b).toFixed(1)).join(', ')})`);
      await page.$eval(sel, (e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(150);
      await page.screenshot({ path: join(SHOTS, `social-today-${vp}-${mode}.png`) });
      await page.goto(base + '/listen/jonah-and-the-whale-bedtime-story'); await page.waitForSelector('#app[data-ready]');
      if (mode === 'night') await page.evaluate(() => { const app = document.getElementById('app'); if (!app.classList.contains('night')) document.querySelector('[data-mode]').click(); });
      const s = '#pEpisode .p-follow.in-story';
      check(await page.$eval(s, (e) => e.getBoundingClientRect().height > 0).catch(() => false), `${vp} ${mode}: Follow block at the end of the bedtime story page`);
      const c2 = await contrast(page, s); check(c2.length >= 3 && c2.every(([f, b]) => ratio(f, b) >= 4.5), `${vp} ${mode}: story page Follow text AA (${c2.map(([f, b]) => f + "|" + b).join(", ")})`);
      await page.$eval(s, (e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(150);
      await page.screenshot({ path: join(SHOTS, `social-story-${vp}-${mode}.png`) });
    }
    await page.goto(base + '#watch'); await page.waitForSelector('#app[data-ready]');
    await page.click('.p-whero'); await page.waitForTimeout(400); await page.click('#pSeries .p-ep'); await page.waitForTimeout(500); await page.keyboard.press('ArrowRight'); await page.waitForTimeout(400);
    const r = await page.$eval('.p-reel.on .p-rend', (e) => !e.hidden && !!e.querySelector('.p-follow.in-reel') && e.querySelectorAll('.p-follow-a').length === 3 && !e.querySelector('.p-follow-sub')).catch(() => false);
    check(r, `${vp}: reel end screen has the small Instagram, TikTok and YouTube links`);
    await page.screenshot({ path: join(SHOTS, `social-reel-${vp}.png`) });
    check(!third.some((h) => /instagram|tiktok|cdninstagram|facebook|youtube|ytimg|ggpht/.test(h)), `${vp}: no requests to Instagram, TikTok or YouTube (plain links only)`);
    await page.goto(base + '/studio/'); await page.waitForTimeout(500);
    check(await page.$$eval('.p-follow, a[href*="instagram"], a[href*="tiktok"], a[href*="youtube"]', (e) => e.length === 0), `${vp}: nothing in /studio`);
    await ctx.close();
  }
  // Real background behind each footer text: hide the text, screenshot its box and test every pixel
  // (glows, the B dome and gradients included) against the text colour.
  async function realAA(page, root) {
    const els = await page.$$(`${root} :is(.sf-h, .sf-sub, .sf-n, .sf-line, .sf-quick a, .sf-legal a)`);
    let worst = 99, which = '';
    for (const el of els) {
      const box = await el.boundingBox(); if (!box || box.width < 2 || box.height < 2) continue;
      const fg = await el.evaluate((e) => { const c = getComputedStyle(e).color; e.dataset.c = e.style.color; e.style.setProperty('color', 'transparent', 'important'); e.querySelectorAll('svg, .sf-dot, .sf-ic').forEach((s) => { s.style.visibility = 'hidden'; }); return c; });
      const vh = page.viewportSize().height; if (box.y < 0 || box.y + box.height > vh) { await el.evaluate((e) => { e.style.color = e.dataset.c; e.querySelectorAll('svg, .sf-dot, .sf-ic').forEach((s) => { s.style.visibility = ''; }); }); continue; }
      const png = await page.screenshot({ clip: box, animations: 'disabled', caret: 'hide' });
      await el.evaluate((e) => { e.style.color = e.dataset.c; e.querySelectorAll('svg, .sf-dot, .sf-ic').forEach((s) => { s.style.visibility = ''; }); });
      const px = await page.evaluate(async (b64) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let lo = [255, 255, 255], hi = [0, 0, 0], l = (r, g, b) => r * 299 + g * 587 + b * 114; for (let i = 0; i < d.length; i += 4) { if (l(d[i], d[i + 1], d[i + 2]) < l(...lo)) lo = [d[i], d[i + 1], d[i + 2]]; if (l(d[i], d[i + 1], d[i + 2]) > l(...hi)) hi = [d[i], d[i + 1], d[i + 2]]; } return [lo, hi]; }, png.toString('base64'));
      const r = Math.min(...px.map((p) => ratio(fg, `rgb(${p.join(',')})`)));
      if (r < worst) { worst = r; which = await el.evaluate((e) => e.className || e.textContent.trim().slice(0, 20)); }
    }
    return [worst, which];
  }
  // Mocked setting: the site_settings REST read (anon key) answers with our footer_style; in local mode
  // (no Supabase config) the same value goes into the local settings store. undefined = no row.
  async function mockSetting(ctx, value) {
    await ctx.route(/\/rest\/v1\/site_settings/, async (route) => {
      let rows = []; try { rows = (await (await route.fetch()).json()).filter((r) => r.key !== 'footer_style'); } catch { rows = []; }
      if (value !== undefined) rows.push({ key: 'footer_style', value });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) });
    });
    await ctx.addInitScript((v) => { const all = JSON.parse(localStorage.getItem('ll.settings.v1') || '{}'); if (v === null) delete all.footer_style; else all.footer_style = v; localStorage.setItem('ll.settings.v1', JSON.stringify(all)); }, value === undefined ? null : value);
  }
  const night = (page) => page.evaluate(() => { const app = document.getElementById('app'); if (!app.classList.contains('night')) document.querySelector('[data-mode]').click(); });
  const SHOTS13 = process.env.SHOTS13;
  for (const style of ['B', 'C']) {
    for (const [vp, size] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1366, height: 900 }]]) {
      const ctx = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
      // Mocked setting: local mode keeps site settings in localStorage (js/store.js), the same getSetting path as Supabase.
      await mockSetting(ctx, style);
      const page = await ctx.newPage();
      for (const mode of ['day', 'night']) {
        for (const tab of ['watch', 'listen', 'read', 'verses', 'play']) {
          await page.goto(base + '/' + tab); await page.waitForSelector('#app[data-ready]');
          if (tab === 'verses' && await page.$eval('.p-view.on', (v) => v.dataset.view !== 'verses')) { check(true, `${style} ${vp} ${mode} /verses: switched off, footer checked in index.html`); continue; }
          if (mode === 'night') await night(page);
          await page.waitForTimeout(300);
          await page.$eval('.p-view.on', (v) => { v.scrollTop = v.scrollHeight; }).catch(() => {}); await page.waitForTimeout(200);
          const r = await page.$eval('.p-view.on .p-sfoot', (f) => { const b = f.getBoundingClientRect(), tabs = document.querySelector('.p-tabs'), t = tabs.getBoundingClientRect(), view = f.closest('.p-view').getBoundingClientRect(), app = document.getElementById('app');
            return { cls: app.classList.contains('ff-' + (app.dataset.footer || '?')) ? app.dataset.footer : '', vis: b.height > 0, n: f.querySelectorAll('.sf-soc').length, clear: [...f.querySelectorAll('a')].filter((a) => a.getClientRects().length).every((a) => { const r = a.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e && a.contains(e); }) }; }).catch(() => null);
          const aa = await realAA(page, '.p-view.on .p-sfoot');
          check(r && r.cls === style && r.vis && r.n === 3 && r.clear && aa[0] >= 4.5, `${style} ${vp} ${mode} /${tab}: footer style ${r && r.cls}, 3 links, clear of the tab bar, AA on the real background (worst ${aa[0].toFixed(2)} ${aa[1]})`);
          if (SHOTS13 && tab === 'read' && !(vp === 'phone' && mode === 'night')) await page.screenshot({ path: join(SHOTS13, `${style}-read-${vp === 'phone' ? 'phone' : 'desktop'}-${mode}.png`) });
        }
        await page.goto(base + '/'); await page.waitForSelector('#app[data-ready]');
        check(await page.$$eval('.p-view.on .p-sfoot', (e) => e.length === 0), `${style} ${vp} ${mode}: Today shows the card, no footer`);
        await page.goto(base + '/read/keep-building'); await page.waitForSelector('#app[data-ready]');
        if (mode === 'night') await night(page);
        await page.$eval('#pArticle', (a) => { a.scrollTop = a.scrollHeight; }); await page.waitForTimeout(250);
        const art = await page.$eval('#pArticle.on .p-sfoot', (f) => f.getBoundingClientRect().height > 0 && f.querySelectorAll('.sf-soc').length === 3).catch(() => false);
        const aaA = await realAA(page, '#pArticle.on .p-sfoot');
        check(art && aaA[0] >= 4.5, `${style} ${vp} ${mode}: footer at the end of the prerendered /read/keep-building page, AA (worst ${aaA[0].toFixed(2)} ${aaA[1]})`);
        await page.goto(base + '/listen/jonah-and-the-whale-bedtime-story'); await page.waitForSelector('#app[data-ready]');
        check(await page.$$eval('#pEpisode .p-follow.in-story', (e) => e.length === 1) && await page.$$eval('#pEpisode .p-sfoot', (e) => e.length === 0), `${style} ${vp} ${mode}: bedtime story page ends with the card, no footer`);
      }
      // Short page: Play has little content on a tall screen, so the footer must rest at the bottom of the view.
      const tall = await browser.newContext({ viewport: vp === 'phone' ? { width: 390, height: 2600 } : { width: 1366, height: 2000 }, serviceWorkers: 'block' });
      await mockSetting(tall, style);
      const tp = await tall.newPage(); await tp.goto(base + '/play'); await tp.waitForSelector('#app[data-ready]'); await tp.waitForTimeout(300);
      const sp = await tp.$eval('.p-view.on', (v) => { const f = v.querySelector('.p-sfoot'), fb = f.getBoundingClientRect(), r = v.getBoundingClientRect(); return { short: v.scrollHeight <= v.clientHeight + 1, gap: Math.round(r.bottom - parseFloat(getComputedStyle(v).paddingBottom) - fb.bottom), tabs: [...f.querySelectorAll('a')].filter((a) => a.getClientRects().length).every((a) => { const q = a.getBoundingClientRect(); const e = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return e && a.contains(e); }) }; });
      check(sp.short && sp.gap <= 1 && sp.gap >= -1 && sp.tabs, `${style} ${vp} short page (/play on a tall screen): footer rests at the bottom (gap ${sp.gap}px, short ${sp.short}), clear of the nav`);
      if (SHOTS13 && vp === 'phone') await tp.screenshot({ path: join(SHOTS13, `${style}-short-page-phone.png`) });
      await tall.close();
      await page.goto(base + '/studio/'); await page.waitForTimeout(500);
      check(await page.$$eval('.p-sfoot, .p-follow', (e) => e.length === 0) && !(await page.$eval('body', (b) => /ff-[BC]/.test(b.outerHTML.slice(0, 400)))), `${style} ${vp}: no footer in /studio`);
      await ctx.close();
    }
  }
  // Switch logic: cached value first, then the live setting; anything bad means C.
  for (const [label, setting, cache, want] of [['setting B', 'B', null, 'B'], ['setting C over cached B', 'C', 'B', 'C'], ['missing setting', undefined, null, 'C'], ['unknown value', 'Z', 'B', 'C'], ['object form', { style: 'B' }, null, 'B']]) {
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await mockSetting(ctx, setting); if (cache) await ctx.addInitScript((c) => localStorage.setItem('ll.footerStyle', c), cache);
    const p = await ctx.newPage(); await p.goto(base + '/read'); await p.waitForSelector('#app[data-ready]'); await p.waitForTimeout(200);
    const got = await p.evaluate(() => { const a = document.getElementById('app'); return [a.classList.contains('ff-B'), a.classList.contains('ff-C'), localStorage.getItem('ll.footerStyle')]; });
    check(got[0] === (want === 'B') && got[1] === (want === 'C') && got[2] === want, `switch: ${label} → ${want} (cached for next load)`);
    await ctx.close();
  }
  { // An error reading the setting keeps the cached value, else C.
    const ctx = await browser.newContext({ serviceWorkers: 'block' });
    await ctx.addInitScript(() => { localStorage.setItem('ll.footerStyle', 'B'); Object.defineProperty(window, 'LLStore', { configurable: true, set(v) { v.getSetting = (k) => k === 'footer_style' ? Promise.reject(new Error('offline')) : Promise.resolve(null); Object.defineProperty(window, 'LLStore', { value: v, writable: true }); } }); });
    const p = await ctx.newPage(); await p.goto(base + '/read'); await p.waitForSelector('#app[data-ready]');
    check(await p.$eval('#app', (a) => a.classList.contains('ff-B') && !a.classList.contains('ff-C')), 'switch: an error keeps the cached style (B) instead of flickering');
    await ctx.close();
  }
  { // No JavaScript: C.
    const ctx = await browser.newContext({ javaScriptEnabled: false }); const p = await ctx.newPage(); await p.goto(base + '/read');
    check(await p.$eval('#app', (a) => a.classList.contains('ff-C')) && await p.$$eval('.p-sfoot', (e) => e.length > 0), 'no JavaScript: footer in style C');
    await ctx.close();
  }
  const rm = await browser.newContext({ reducedMotion: 'reduce' }); const p = await rm.newPage();
  await p.goto(base + '/read'); await p.waitForSelector('#app[data-ready]');
  check(await p.$eval('.p-view.on .sf-soc', (a) => /^0s(, 0s)*$/.test(getComputedStyle(a).transitionDuration)), 'reduced motion: footer does not animate');
  await p.evaluate(() => document.getElementById('app').classList.add('calm'));
  check(await p.$eval('.p-view.on .sf-soc', (a) => /^0s(, 0s)*$/.test(getComputedStyle(a).transitionDuration)), 'calm mode: footer does not animate');
  await p.goto(base + '/'); await p.waitForSelector('#app[data-ready]');
  check(await p.$eval('.p-follow-a', (a) => { const s = getComputedStyle(a); return /^0s(, 0s)*$/.test(s.transitionDuration) && s.animationName === 'none'; }), 'reduced motion: follow links do not animate');
  await rm.close();
} finally { await browser.close(); server.close(); }
console.log(failures ? `\n${failures} failure(s)` : '\nall social checks passed'); process.exit(failures ? 1 : 0);
