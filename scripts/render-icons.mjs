// Renders the PNG app icons, favicon.ico and the social sharing image from the SVG sources and the
// self-hosted fonts. Run: npm run icons   (needs Playwright's Chromium: npx playwright install chromium)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';

const fullBleed = (svg) => svg.replace(' rx="112"', ''); // iOS rounds the corners itself
const jobs = [
  ['icons/icon.svg', 'icons/icon-192.png', 192],
  ['icons/icon.svg', 'icons/icon-512.png', 512],
  ['icons/icon-maskable.svg', 'icons/icon-maskable-512.png', 512],
  ['icons/icon.svg', 'icons/apple-touch-icon.png', 180, fullBleed],
];
const browser = await chromium.launch();
async function renderSvg(svg, size) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  const png = await page.screenshot({ omitBackground: true });
  await page.close();
  return png;
}
for (const [src, out, size, edit] of jobs) {
  const svg = readFileSync(src, 'utf8');
  writeFileSync(out, await renderSvg(edit ? edit(svg) : svg, size));
}

// favicon.ico: 16, 32 and 48 px PNGs in one ICO file (for browsers and tools that ask for /favicon.ico).
const sizes = [16, 32, 48];
const pngs = [];
for (const size of sizes) pngs.push(await renderSvg(readFileSync('icons/icon.svg', 'utf8'), size));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
  const e = 6 + 16 * i;
  header.writeUInt8(size, e); header.writeUInt8(size, e + 1); header.writeUInt8(0, e + 2); header.writeUInt8(0, e + 3);
  header.writeUInt16LE(1, e + 4); header.writeUInt16LE(32, e + 6);
  header.writeUInt32LE(pngs[i].length, e + 8); header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync('favicon.ico', Buffer.concat([header, ...pngs]));

// Social sharing image (Open Graph / X): 1200 x 630.
const font = (file) => `url(data:font/woff2;base64,${readFileSync('fonts/' + file).toString('base64')}) format('woff2')`;
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.setContent(`<!doctype html><html><head><style>
  @font-face { font-family: B; font-weight: 800; src: ${font('bricolage-normal-800.woff2')}; }
  @font-face { font-family: B; font-weight: 600; src: ${font('bricolage-normal-600.woff2')}; }
  @font-face { font-family: N; font-style: italic; font-weight: 400; src: ${font('newsreader-italic-400.woff2')}; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { position: relative; color: #f4efe2; font-family: B, sans-serif;
    background: radial-gradient(90% 120% at 78% 38%, #2a2358 0%, #17122e 55%, #0f0d20 100%); }
  .stars { position: absolute; inset: 0; background:
    radial-gradient(2px 2px at 8% 14%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 22% 30%, #fff 50%, transparent 51%),
    radial-gradient(2px 2px at 41% 9%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 56% 22%, #fff 50%, transparent 51%),
    radial-gradient(2px 2px at 93% 12%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 88% 84%, #fff 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 62% 88%, #fff 50%, transparent 51%), radial-gradient(2px 2px at 31% 92%, #fff 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 4% 70%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 49% 55%, #fff 50%, transparent 51%); opacity: .8; }
  .orb { position: absolute; right: 150px; top: 135px; width: 360px; height: 360px; }
  .copy { position: absolute; left: 84px; top: 0; bottom: 0; width: 640px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .kicker { font-weight: 600; font-size: 22px; letter-spacing: .18em; text-transform: uppercase; color: #ffe08a; }
  h1 { margin: 0; font-weight: 800; font-size: 112px; line-height: .95; letter-spacing: -.02em; }
  p { margin: 0; font-family: N, serif; font-style: italic; font-size: 40px; line-height: 1.2; color: #e9e2f7; }
  .dots { display: flex; gap: 12px; margin-top: 10px; }
  .dots i { width: 18px; height: 18px; border-radius: 50%; }
  .url { position: absolute; left: 84px; bottom: 44px; font-weight: 600; font-size: 22px; color: #b3accb; letter-spacing: .02em; }
</style></head><body>
  <div class="stars"></div>
  <svg class="orb" viewBox="0 0 360 360"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%">
    <stop offset="0" stop-color="#fffbe8"/><stop offset=".35" stop-color="#ffe08a"/><stop offset=".7" stop-color="#f7c23f" stop-opacity=".35"/><stop offset="1" stop-color="#f7c23f" stop-opacity="0"/></radialGradient></defs>
    <circle cx="180" cy="180" r="180" fill="url(#g)"/><circle cx="180" cy="180" r="56" fill="#fffbe8"/>
    <circle cx="180" cy="180" r="124" fill="none" stroke="#ffe08a" stroke-opacity=".35" stroke-width="3"/>
    <circle cx="180" cy="180" r="176" fill="none" stroke="#ee8fb2" stroke-opacity=".22" stroke-width="2"/></svg>
  <div class="copy">
    <div class="kicker">For families with young children</div>
    <h1>Little Light</h1>
    <p>Bible verses, short devotions, prayers and stories, plus a gentle Bible game.</p>
    <div class="dots"><i style="background:#f7c23f"></i><i style="background:#ee8fb2"></i><i style="background:#e46a4c"></i><i style="background:#a07fd6"></i><i style="background:#69ba7e"></i><i style="background:#62a6ea"></i></div>
  </div>
  <div class="url">littlesaltandlight.com</div>
</body></html>`);
await og.evaluate(() => document.fonts.ready);
await og.screenshot({ path: 'icons/og-image.png' });
await browser.close();
console.log('icons, favicon.ico and og-image.png rendered');
