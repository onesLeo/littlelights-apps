// Love, Share, bedtime-story play counts, the don't-count-me switch, and the Today footer staying at the end of the feed.
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';

const server = await serve(0, { headers: true });
const base = `http://localhost:${server.address().port}`;
const PATH = '/listen/jonah-and-the-whale-bedtime-story';
let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await context.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = { supabaseUrl: "https://example.invalid", supabaseAnonKey: "x" };' }));
const posts = [];
context.route('**/api/stat', (r) => {
  posts.push({ url: r.request().url(), body: r.request().postData() || '' });
  r.fulfill({ status: 204, body: '' });
});
context.route('**/api/loves**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
context.route('**/example.invalid/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

const page = await context.newPage();
await page.goto(base + PATH);
await page.waitForSelector('#app[data-ready]');

const love = page.locator('#pEpisode [data-love="story"]');
check(await love.count() === 1, 'story page has a Love button');
const box = await love.boundingBox();
check(box && box.height >= 44 && box.width >= 44, `Love tap target is at least 44px (${box && Math.round(box.width)}×${box && Math.round(box.height)})`);
check(await love.getAttribute('aria-pressed') === 'false', 'Love starts off');
check(await page.locator('#pEpisode [data-share="story"]').count() === 1, 'story page has a Share button');

posts.length = 0;
await love.click();
await page.waitForTimeout(400);
const loved = posts.filter((p) => /api\/stat/.test(p.url) && /"event":"love"/.test(p.body) && /story:jonah-and-the-whale-bedtime-story/.test(p.body));
check(loved.length === 1, 'loving the story sends one anonymous love increment');
check(await love.getAttribute('aria-pressed') === 'true', 'Love is pressed after a tap');
check(await page.evaluate(() => JSON.parse(localStorage.getItem('ll.loved') || '{}')['story:jonah-and-the-whale-bedtime-story'] === 1), 'the love is remembered on this device');

posts.length = 0;
await love.click();
await page.waitForTimeout(400);
const unloved = posts.filter((p) => /api\/stat/.test(p.url) && /"event":"unlove"/.test(p.body));
check(unloved.length === 1, 'a second tap sends unlove and takes the love back');
check(await love.getAttribute('aria-pressed') === 'false', 'Love is off after the second tap');
check(await page.evaluate(() => !JSON.parse(localStorage.getItem('ll.loved') || '{}')['story:jonah-and-the-whale-bedtime-story']), 'the device memory is cleared when Love is taken back');

await love.click();
await page.waitForTimeout(200);
await page.reload();
await page.waitForSelector('#app[data-ready]');
check(await page.getAttribute('#pEpisode [data-love="story"]', 'aria-pressed') === 'true', 'Love stays on after a reload on the same device');

// Play / finished, once per page load
posts.length = 0;
await page.$eval('#pEpisode audio', (a) => { a.play().catch(() => {}); });
await page.waitForTimeout(500);
check(posts.filter((p) => /api\/stat/.test(p.url) && /"event":"started"/.test(p.body) && /story:jonah-and-the-whale-bedtime-story/.test(p.body)).length === 1, 'pressing play counts started once');
await page.$eval('#pEpisode audio', (a) => { a.pause(); a.play().catch(() => {}); });
await page.waitForTimeout(300);
check(posts.filter((p) => /api\/stat/.test(p.url) && /"event":"started"/.test(p.body)).length === 1, 'pressing play again on the same page load is not counted twice');
await page.$eval('#pEpisode audio', (a) => { a.pause(); a.dispatchEvent(new Event('ended')); });
await page.waitForTimeout(400);
check(posts.filter((p) => /api\/stat/.test(p.url) && /"event":"finished"/.test(p.body)).length === 1, 'the ended event counts finished once');

// Share (Insights-only; the button is public, the number is not)
posts.length = 0;
await page.evaluate(() => { navigator.share = (d) => Promise.resolve(); });
await page.click('#pEpisode [data-share="story"]');
await page.waitForTimeout(400);
check(posts.filter((p) => /api\/stat/.test(p.url) && /"event":"share"/.test(p.body) && /story:jonah/.test(p.body)).length === 1, 'Share sends an anonymous share count');
check(await page.locator('#pEpisode [data-share="story"]').textContent().then((t) => !/\d+/.test(t.trim()) || t.includes('Share')), 'the Share button does not show a public count');

// Opt-out: ?nocount=1, Love and play send nothing
const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx2.route('**/js/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.LL_CONFIG = { supabaseUrl: "https://example.invalid", supabaseAnonKey: "x" };' }));
const posts2 = [];
ctx2.route('**/api/stat', (r) => { posts2.push(r.request().url() + ' ' + (r.request().postData() || '')); r.fulfill({ status: 204, body: '' }); });
ctx2.route('**/api/loves**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
ctx2.route('**/example.invalid/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
const p2 = await ctx2.newPage();
await p2.goto(base + '/?nocount=1');
await p2.waitForSelector('#app[data-ready]');
await p2.goto(base + PATH);
await p2.waitForSelector('#app[data-ready]');
posts2.length = 0;
await p2.click('#pEpisode [data-love="story"]');
await p2.waitForTimeout(400);
await p2.$eval('#pEpisode audio', (a) => a.play().catch(() => {}));
await p2.waitForTimeout(400);
check(!posts2.some((u) => /api\/stat/.test(u)), 'with don’t-count-me on, Love and play send no increment');
check(/isn’t counted/.test(await p2.textContent('body')), 'the page explains that this device isn’t counted');
await ctx2.close();

// Today footer stays at the end of the feed after the app starts (no layout jump into the first screen).
const home = await context.newPage();
await home.goto(base + '/');
await home.waitForSelector('#app[data-ready]');
const place = await home.$eval('#pFeed', (feed) => {
  const foot = feed.querySelector('footer.p-legal.in-feed');
  const kids = [...feed.children];
  return { last: kids[kids.length - 1] === foot, index: kids.indexOf(foot), n: kids.length };
});
check(place.last && place.index === place.n - 1, 'the Today footer stays the last child of the feed after the app starts');
await home.close();

await browser.close();
server.close();
if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nlove: all checks passed');
