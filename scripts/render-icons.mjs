// Renders the PNG app icons and favicon.ico from the SVG sources. Run: npm run icons   (needs Playwright's Chromium: npx playwright install chromium)
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

// The social sharing image (icons/og-image.png) is made by scripts/render-og.mjs (npm run og).
await browser.close();
console.log('icons and favicon.ico rendered');
