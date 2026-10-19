// Pages Functions test (functions/read/[slug].js, functions/watch/[slug].js via lib/edge.mjs): a post
// published after the last build gets its page and head; prerendered pages and unknown addresses pass
// through untouched (unknown stays a 404). Supabase and Cloudflare are faked. No browser needed.
// Run: npm test
import { readFileSync } from 'node:fs';
import { postPage, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/edge.mjs';

let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }

const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
check(config.includes(`supabaseUrl: '${SUPABASE_URL}'`) && config.includes(`supabaseAnonKey: '${SUPABASE_ANON_KEY}'`), 'lib/edge.mjs uses the same Supabase project and public key as js/config.js');

const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace('class="p-view v-today on"', 'class="p-view v-today"').replace('class="p-view v-read"', 'class="p-view v-read on"');
const posts = [
  { id: 41, type: 'devotion', status: 'published', publish_at: '2026-10-01T00:00:00Z', title: 'A new devotion', slug: 'a-new-devotion', fields: { teaser: 'Fresh from the Studio.', body: 'Hello **families**.', prayer: 'Amen.' } },
  { id: 42, type: 'reel', status: 'published', publish_at: '2026-10-02T00:00:00Z', title: 'A new video', slug: 'a-new-video', media_url: 'https://x.supabase.co/v.mp4', fields: { caption: 'A video caption.', minutes: '0:30' } },
];
const asked = [];
const fakeFetch = async (url) => {
  asked.push(url);
  const u = new URL(url), type = (u.searchParams.get('type') || '').replace('eq.', ''), slug = (u.searchParams.get('slug') || '').replace('eq.', '');
  const rows = posts.filter((p) => p.type === type && p.slug === slug);
  return new Response(JSON.stringify(rows), { headers: { 'content-type': 'application/json' } });
};
const ctx = (path, status = 404) => ({
  request: new Request('https://littlesaltandlight.com' + path),
  params: { slug: path.split('/').pop() },
  next: async () => new Response(status === 404 ? 'not found page' : 'static page', { status, headers: { 'content-type': 'text/html' } }),
  env: { ASSETS: { fetch: async () => new Response(shell, { status: 200, headers: { 'content-type': 'text/html', 'content-security-policy': "default-src 'self'" } }) } },
});

let res = await postPage(ctx('/read/brave', 200), 'devotion', fakeFetch);
check(res.status === 200 && (await res.text()) === 'static page' && asked.length === 0, 'a prerendered page is served as it is, without asking the database');

res = await postPage(ctx('/read/a-new-devotion'), 'devotion', fakeFetch);
let html = await res.text();
check(res.status === 200 && html.includes('<title>A new devotion · Salt and Light</title>') && html.includes('<link rel="canonical" href="https://littlesaltandlight.com/read/a-new-devotion">'), 'a devotion published after the build gets its page, title and canonical');
check(html.includes('"@type":"Article"') && /id="pArticle"[^>]*>[\s\S]*Hello <b>families<\/b>/.test(html), 'it carries Article JSON-LD and the devotion text');
check(res.headers.get('content-security-policy') === "default-src 'self'", 'it keeps the security headers of the site');
check(asked.every((u) => u.includes('status=in.(published,scheduled)') && u.includes('publish_at=lte.') && !u.includes('author_email')), 'it only asks for live posts, and not for private columns');

res = await postPage(ctx('/watch/a-new-video'), 'reel', fakeFetch);
html = await res.text();
check(res.status === 200 && html.includes('<title>A new video · Watch · Salt and Light</title>') && html.includes('"@type":"VideoObject"'), 'a video published after the build gets its page and VideoObject JSON-LD');

res = await postPage(ctx('/read/no-such-post'), 'devotion', fakeFetch);
check(res.status === 404 && (await res.text()) === 'not found page', 'an unknown devotion stays a real 404');
res = await postPage(ctx('/read/Bad%20Slug!'), 'devotion', fakeFetch);
check(res.status === 404, 'a malformed address stays a 404 without asking the database');
res = await postPage(ctx('/read/a-new-devotion'), 'devotion', async () => { throw new Error('down'); });
check(res.status === 404, 'if the database is down the visitor gets the normal 404 page, not an error');

console.log(failures ? `\n${failures} edge check(s) failed` : '\nAll edge checks passed');
process.exit(failures ? 1 : 0);
