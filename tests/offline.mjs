// Offline test: Studio posts from Supabase are kept on the device and shown when the
// database can't be reached or is slow. Supabase is faked, so the real database is never used.
// Run: npm test
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0);
const base = `http://localhost:${server.address().port}/`;
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.route('**/js/config.js', (r) => r.fulfill({
  contentType: 'text/javascript',
  body: "window.LL_CONFIG = { supabaseUrl: 'https://fake-project.supabase.co', supabaseAnonKey: 'sb_publishable_test' };"
}));
const errors = [];
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

const post = {
  id: 1, type: 'verse', status: 'published', publish_at: '2026-01-01T00:00:00Z', title: 'Psalm 4:8', slug: 'psalm-4-8',
  show_on_today: true, media_url: null, fields: { verse: 'In peace I will both lay myself down and sleep.', ref: 'Psalm 4:8', translation: 'WEB', topics: ['Trust'] }
};
// How the fake database answers: 'ok', 'down' or 'slow'.
let db = 'ok';
await context.route('https://fake-project.supabase.co/**', async (r) => {
  if (db === 'down') return r.abort('internetdisconnected');
  if (db === 'slow') await new Promise((res) => setTimeout(res, 8000));
  return r.fulfill({ contentType: 'application/json', body: JSON.stringify([post]) }).catch(() => {});
});

async function verses() {
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  const started = Date.now();
  await page.goto(base + '#verses');
  await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
  const text = await page.$eval('#pGrid', (g) => g.textContent);
  const ms = Date.now() - started;
  await page.close();
  return { shown: text.includes('In peace I will both lay myself down'), ms };
}

check((await verses()).shown, 'online: the Studio post is shown');
db = 'down';
check((await verses()).shown, 'offline: the saved Studio post is still shown');
db = 'slow';
const slow = await verses();
check(slow.shown && slow.ms < 7000, `slow connection: the saved post is shown without waiting (${slow.ms} ms)`);

// A device that has never been online shows only the built-in content, without errors.
const fresh = await browser.newContext({ serviceWorkers: 'block' });
await fresh.route('**/js/config.js', (r) => r.fulfill({
  contentType: 'text/javascript',
  body: "window.LL_CONFIG = { supabaseUrl: 'https://fake-project.supabase.co', supabaseAnonKey: 'sb_publishable_test' };"
}));
await fresh.route('https://fake-project.supabase.co/**', (r) => r.abort('internetdisconnected'));
const page = await fresh.newPage();
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '#verses');
await page.waitForSelector('#app[data-ready]', { timeout: 15000 });
check((await page.$$('#pGrid .p-tile')).length > 0, 'first visit offline: built-in verses still show');

check(errors.length === 0, 'no script errors ' + errors.join(' | '));
await browser.close();
server.close();
console.log(failures ? `\n${failures} offline check(s) failed` : '\nAll offline checks passed');
process.exit(failures ? 1 : 0);
