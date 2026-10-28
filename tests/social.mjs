// Follow Little Salt & Light (js/seo.js followHtml): our three accounts only, Instagram, then TikTok, then YouTube, as plain
// links (new tab, rel="noopener noreferrer"), inline SVG icons, no third-party scripts or embeds. Shown on Today
// (phone footer, computer side column), at the end of bedtime story pages and at the end of a reel; never in the Studio.
// AA contrast in day and night. Screenshots go to SHOTS (default test-results/). Run: npm test
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

// Compact footer row (followRowHtml): on every page except Today (which has the bigger card), bedtime story
// pages and reel end screens (bigger card at the end) and the Studio.
const row = SEO.followRowHtml();
const rowLinks = [...row.matchAll(/<a class="p-ffoot-a" href="([^"]+)" target="_blank" rel="noopener noreferrer" aria-label="Little Salt &amp; Light on ([^"]+)"/g)].map((m) => [m[2], m[1]]);
check(JSON.stringify(rowLinks) === JSON.stringify(WANT) && row.includes('>Follow Little Salt &amp; Light<') && (row.match(/<svg /g) || []).length === 3 && !/<script|<iframe/.test(row), 'followRowHtml: label, three icon links with aria-labels, new tab, no scripts');
const rows = idx.match(/<footer class="p-ffoot"[\s\S]*?<\/footer>/g) || [];
check(rows.length === 5 && rows.every((r) => r === row), 'index.html: Watch, Listen, Read, Verses and Play each hold the same footer row');
const todayHtml = idx.slice(idx.indexOf('data-view="today"'), idx.indexOf('data-view="watch"'));
check(!todayHtml.includes('p-ffoot'), 'Today has no footer row (the bigger card is there)');
check(readFileSync(join(root, '404.html'), 'utf8').includes(row), '404.html has the footer row');
check(!/p-ffoot/.test(readFileSync(join(root, 'studio/index.html'), 'utf8')), 'the Studio has no footer row');

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
  for (const [vp, size] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1366, height: 900 }]]) {
    const ctx = await browser.newContext({ viewport: size, serviceWorkers: 'block' }); const page = await ctx.newPage();
    for (const mode of ['day', 'night']) {
      for (const tab of ['watch', 'listen', 'read', 'verses', 'play']) {
        await page.goto(base + '/' + tab); await page.waitForSelector('#app[data-ready]');
        // Verses is switched off in Content settings until it launches (/verses goes to Today); the static check
        // above covers its row.
        if (tab === 'verses' && await page.$eval('.p-view.on', (v) => v.dataset.view !== 'verses')) { check(true, `${vp} ${mode} /verses: switched off, row checked in index.html`); continue; }
        if (mode === 'night') await page.evaluate(() => { const app = document.getElementById('app'); if (!app.classList.contains('night')) document.querySelector('[data-mode]').click(); });
        await page.waitForTimeout(300);
        const sel = '.p-view.on .p-ffoot';
        await page.$eval('.p-view.on', (v) => { v.scrollTop = v.scrollHeight; }).catch(() => {}); await page.waitForTimeout(150);
        const r = await page.$eval(sel, (f) => { const b = f.getBoundingClientRect(), t = document.querySelector('.p-tabs').getBoundingClientRect(); const view = f.closest('.p-view').getBoundingClientRect();
          return { vis: b.height > 0, n: f.querySelectorAll('.p-ffoot-a').length, clear: b.bottom <= view.bottom + 1 && (getComputedStyle(document.querySelector('.p-tabs')).display === 'none' || b.bottom <= t.top + 1 || b.top >= t.bottom),
            c: [f.querySelector('.p-ffoot-h'), ...f.querySelectorAll('.p-ffoot-a')].map((e) => [getComputedStyle(e).color, getComputedStyle(f).backgroundColor]) }; }).catch(() => null);
        check(r && r.vis && r.n === 3 && r.clear && r.c.every(([a, b]) => ratio(a, b) >= 4.5), `${vp} ${mode} /${tab}: footer row visible, 3 links, clear of the tab bar, AA (${r ? r.c.map(([a, b]) => ratio(a, b).toFixed(1)).join(', ') : 'missing'})`);
        if (tab === 'read' && vp === 'phone' && mode === 'day') await page.screenshot({ path: join(SHOTS, 'footer-read-phone-day.png') });
        if (tab === 'listen' && vp === 'phone' && mode === 'night') await page.screenshot({ path: join(SHOTS, 'footer-listen-phone-night.png') });
      }
      await page.goto(base + '/'); await page.waitForSelector('#app[data-ready]');
      check(await page.$$eval('.p-view.on .p-ffoot', (e) => e.length === 0), `${vp} ${mode}: Today shows the card, not the footer row`);
      await page.goto(base + '/read/keep-building'); await page.waitForSelector('#app[data-ready]');
      if (mode === 'night') await page.evaluate(() => { const app = document.getElementById('app'); if (!app.classList.contains('night')) document.querySelector('[data-mode]').click(); });
      await page.$eval('#pArticle', (a) => { a.scrollTop = a.scrollHeight; }); await page.waitForTimeout(200);
      check(await page.$eval('#pArticle.on .p-ffoot', (f) => f.getBoundingClientRect().height > 0 && f.querySelectorAll('.p-ffoot-a').length === 3).catch(() => false), `${vp} ${mode}: footer row at the end of the prerendered /read/keep-building page`);
      if (vp === 'desktop' && mode === 'day') await page.screenshot({ path: join(SHOTS, 'footer-read-story-desktop.png') });
      await page.goto(base + '/listen/jonah-and-the-whale-bedtime-story'); await page.waitForSelector('#app[data-ready]');
      check(await page.$$eval('#pEpisode .p-follow.in-story', (e) => e.length === 1) && await page.$$eval('#pEpisode .p-ffoot', (e) => e.length === 0), `${vp} ${mode}: bedtime story page ends with the card, no second row`);
      if (vp === 'desktop' && mode === 'day') { await page.$eval('#pEpisode .p-follow', (e) => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(150); await page.screenshot({ path: join(SHOTS, 'footer-listen-story-desktop.png') }); }
    }
    await page.goto(base + '/studio/'); await page.waitForTimeout(500);
    check(await page.$$eval('.p-ffoot, .p-follow', (e) => e.length === 0), `${vp}: no footer row in /studio`);
    if (vp === 'phone') await page.screenshot({ path: join(SHOTS, 'footer-studio-phone.png'), fullPage: true });
    await ctx.close();
  }
  const rm = await browser.newContext({ reducedMotion: 'reduce' }); const p = await rm.newPage();
  await p.goto(base + '/'); await p.waitForSelector('#app[data-ready]');
  await p.goto(base + '/read'); await p.waitForSelector('#app[data-ready]');
  check(await p.$eval('.p-view.on .p-ffoot-a', (a) => /^0s(, 0s)*$/.test(getComputedStyle(a).transitionDuration)), 'reduced motion: footer row does not animate');
  await p.goto(base + '/'); await p.waitForSelector('#app[data-ready]');
  check(await p.$eval('.p-follow-a', (a) => { const s = getComputedStyle(a); return /^0s(, 0s)*$/.test(s.transitionDuration) && s.animationName === 'none'; }), 'reduced motion: follow links do not animate');
  await rm.close();
} finally { await browser.close(); server.close(); }
console.log(failures ? `\n${failures} failure(s)` : '\nall social checks passed'); process.exit(failures ? 1 : 0);
