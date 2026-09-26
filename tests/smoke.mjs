// Smoke test: loads the app at phone and computer sizes and checks the main journeys.
// Run: npm test   (screenshots go to test-results/)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
mkdirSync('test-results', { recursive: true });
const browser = await chromium.launch();
let failures = 0;

function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

async function openApp(viewport) {
  const context = await browser.newContext({ viewport, acceptDownloads: true });
  // Block external font requests so the test does not depend on the network.
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(base);
  await page.waitForSelector('.v-today.on');
  return { context, page, errors };
}

// ---------- phone ----------
{
  const { context, page, errors } = await openApp({ width: 390, height: 844 });
  const onView = () => page.$eval('.p-view.on', (v) => v.dataset.view);

  for (const tab of ['watch', 'listen', 'read', 'verses', 'play', 'today']) {
    await page.click(`.p-tab[data-tab="${tab}"]`);
    await page.waitForTimeout(150);
    check((await onView()) === tab, `phone: ${tab} tab opens`);
    check(page.url().endsWith(`#${tab}`), `phone: ${tab} tab updates the address`);
  }
  await page.screenshot({ path: 'test-results/phone-today.png' });

  const nav = await page.$eval('.p-tabs', (n) => n.getBoundingClientRect().top);
  check(nav > 700, 'phone: menu sits at the bottom');

  await page.click('.p-ring[data-go="listen"]');
  await page.waitForTimeout(150);
  check((await onView()) === 'listen', 'phone: story ring jumps to Listen');

  await page.click('.p-row[data-ep="3"]');
  check(await page.$eval('#app', (a) => a.classList.contains('has-mini')), 'phone: mini player appears');
  await page.click('.p-tab[data-tab="verses"]');
  check(await page.$eval('#app', (a) => a.classList.contains('has-mini')), 'phone: mini player stays when changing tabs');

  await page.click('[data-chip="Trust"]');
  check((await page.$$('#pGrid .p-tile')).length === 2, 'phone: topic filter shows 2 Trust verses');
  await page.click('#pGrid .p-tile');
  check(await page.$eval('#pStory', (s) => s.classList.contains('on')), 'phone: verse opens as a story');
  const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
  await page.click('#pStory [data-save-verse]');
  const download = await dl;
  check(!!download && download.suggestedFilename().endsWith('.png'), 'phone: Save image downloads a PNG');
  await page.keyboard.press('Escape');

  await page.goto(base + '#read/brave');
  await page.waitForTimeout(200);
  check(await page.$eval('#pArticle', (a) => a.classList.contains('on')), 'phone: #read/brave opens the article directly');
  await page.screenshot({ path: 'test-results/phone-article.png' });

  const night = await page.$eval('#app', (a) => a.classList.contains('night'));
  await page.click('.p-tab[data-tab="today"]');
  await page.click('.p-rings [data-mode]');
  await page.reload();
  await page.waitForSelector('.v-today.on');
  check((await page.$eval('#app', (a) => a.classList.contains('night'))) === !night, 'phone: day/night choice is remembered');
  await page.screenshot({ path: 'test-results/phone-today-toggled.png' });

  await page.click('.p-rings [data-calm]');
  check(await page.$eval('#app', (a) => a.classList.contains('calm')), 'phone: calm mode turns on');

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(!overflow, 'phone: no sideways scrolling');
  check(errors.length === 0, `phone: no script errors ${errors.join(' | ')}`);
  await context.close();
}

// ---------- computer ----------
{
  const { context, page, errors } = await openApp({ width: 1366, height: 820 });
  const nav = await page.$eval('.p-tabs', (n) => n.getBoundingClientRect().top);
  check(nav < 10, 'computer: menu sits at the top');
  check(await page.$eval('.p-side', (s) => getComputedStyle(s).display !== 'none'), 'computer: side panel is shown');
  await page.screenshot({ path: 'test-results/computer-today.png' });
  await page.click('.p-tab[data-tab="verses"]');
  await page.waitForTimeout(150);
  const cols = await page.$eval('#pGrid', (g) => getComputedStyle(g).gridTemplateColumns.split(' ').length);
  check(cols === 4, 'computer: verses use 4 columns');
  await page.screenshot({ path: 'test-results/computer-verses.png' });
  await page.click('.p-tab[data-tab="read"]');
  await page.click('.p-card.feat');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/computer-article.png' });

  const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  check(manifest.name === 'Little Light' && manifest.icons.length >= 3, 'app: manifest is valid');
  const sw = await page.evaluate(() => Promise.race([
    navigator.serviceWorker.ready.then(() => true),
    new Promise((r) => setTimeout(() => r(false), 4000)),
  ]));
  check(sw, 'app: offline service worker is active');
  check(errors.length === 0, `computer: no script errors ${errors.join(' | ')}`);
  await context.close();
}

await browser.close();
server.close();
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
