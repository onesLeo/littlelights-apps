// Renders the PNG app icons from the SVG sources. Run: node scripts/render-icons.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const jobs = [
  ['icons/icon.svg', 'icons/icon-192.png', 192],
  ['icons/icon.svg', 'icons/icon-512.png', 512],
  ['icons/icon-maskable.svg', 'icons/icon-maskable-512.png', 512],
];
const browser = await chromium.launch();
for (const [src, out, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(src, 'utf8');
  await page.setContent(`<body style="margin:0;background:transparent">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`);
  await page.screenshot({ path: out, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons rendered');
