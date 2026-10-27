// Pages Functions test (functions/read/[slug].js, functions/watch/[slug].js, functions/listen/[slug].js via lib/edge.mjs): a post
// published after the last build gets its page and head; prerendered pages and unknown addresses pass
// through untouched (unknown stays a 404). Supabase and Cloudflare are faked. No browser needed.
// Run: npm test
import { readFileSync } from 'node:fs';
import { postPage, sitemap, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/edge.mjs';

let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }

const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
check(config.includes(`supabaseUrl: '${SUPABASE_URL}'`) && config.includes(`supabaseAnonKey: '${SUPABASE_ANON_KEY}'`), 'lib/edge.mjs uses the same Supabase project and public key as js/config.js');

const shell = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace('class="p-view v-today on"', 'class="p-view v-today"').replace('class="p-view v-read"', 'class="p-view v-read on"');
const posts = [
  { id: 41, type: 'devotion', status: 'published', publish_at: '2026-10-01T00:00:00Z', title: 'A new devotion', slug: 'a-new-devotion', fields: { teaser: 'Fresh from the Studio.', body: 'Hello **families**.', prayer: 'Amen.' } },
  { id: 43, type: 'reel', status: 'published', publish_at: '2026-10-03T00:00:00Z', title: 'A video with a poster', slug: 'a-video-with-a-poster', media_url: 'https://media.example.com/v2.mp4', fields: { caption: 'Has a poster.', poster: 'https://media.example.com/v2-poster.webp' } },
  { id: 44, type: 'story', status: 'scheduled', publish_at: '2026-10-04T00:00:00Z', title: 'The Smallest Star', slug: 'the-smallest-star-bedtime-story', media_url: 'https://media.littlesaltandlight.com/audio/the-smallest-star.6b731d78.mp3',
    fields: { series: 'Goodnight Little Light', episode: 1, desc: 'A gentle bedtime story about kindness.', narrator: 'Mr. Ginting', seconds: 357, story: 'Hi, little light.\n\nTwinkle was the smallest star.', verse: 'As you would like people to do to you, do exactly so to them.', ref: 'Luke 6:31', version: 'WEB', prayer: 'Dear Jesus, help me be kind. Amen.', goodnight: 'Goodnight, little light.', questions: 'Why did Twinkle leave?\nHow did she help?\nWho could you help?', timings: 'https://x.supabase.co/storage/v1/object/public/media/t.json' } },
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

check(html.includes('<meta property="og:image" content="https://littlesaltandlight.com/og-image.png">') || /<meta property="og:image" content="[^"]*og-image[^"]*">/.test(html), 'a video without a poster keeps the site share image');
check(!/rel="preload" as="image" fetchpriority="high"/.test(html), 'a video without a poster has no poster preload');

res = await postPage(ctx('/watch/a-video-with-a-poster'), 'reel', fakeFetch);
html = await res.text();
check(html.includes('<meta property="og:image" content="https://media.example.com/v2-poster.webp">') && html.includes('<meta name="twitter:image" content="https://media.example.com/v2-poster.webp">') && !html.includes('og:image:width'), 'a video with a poster shares it as og:image / twitter:image (any storage host)');
check(html.includes('"thumbnailUrl":"https://media.example.com/v2-poster.webp"'), 'its VideoObject thumbnailUrl is the poster');
check(html.includes('<link rel="preload" as="image" fetchpriority="high" href="https://media.example.com/v2-poster.webp">'), 'its poster is preloaded first');

res = await postPage(ctx('/listen/the-smallest-star-bedtime-story'), 'story', fakeFetch);
html = await res.text();
check(res.status === 200 && html.includes('<title>The Smallest Star | Bedtime Story for Kids #1 · Salt and Light</title>') && html.includes('<link rel="canonical" href="https://littlesaltandlight.com/listen/the-smallest-star-bedtime-story">'), 'a bedtime story written in the Studio gets its page, title and canonical');
check(html.includes('"@type":"PodcastEpisode"') && html.includes('the-smallest-star.6b731d78.mp3') && /id="pEpisode"[^>]*>[\s\S]*Twinkle was the smallest star/.test(html), 'it carries PodcastEpisode JSON-LD, the audio and the story text');
check(/Bedtime story, read by Mr\. Ginting/.test(html) && !/Bedtime Bible story, read by/.test(html) && /<ol class="p-ep-qs"><li>Why did Twinkle leave\?<\/li>/.test(html), 'an original story is labelled “Bedtime story” and shows its three questions');
res = await postPage(ctx('/read/no-such-post'), 'devotion', fakeFetch);
check(res.status === 404 && (await res.text()) === 'not found page', 'an unknown devotion stays a real 404');
res = await postPage(ctx('/read/Bad%20Slug!'), 'devotion', fakeFetch);
check(res.status === 404, 'a malformed address stays a 404 without asking the database');
res = await postPage(ctx('/read/a-new-devotion'), 'devotion', async () => { throw new Error('down'); });
check(res.status === 404, 'if the database is down the visitor gets the normal 404 page, not an error');

// /sitemap.xml: posts published after the build are added (with lastmod), listed ones are not repeated.
{
  const built = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://littlesaltandlight.com/watch</loc>\n    <lastmod>2026-10-24</lastmod>\n  </url>\n  <url>\n    <loc>https://littlesaltandlight.com/read</loc>\n    <lastmod>2026-10-24</lastmod>\n  </url>\n  <url>\n    <loc>https://littlesaltandlight.com/watch/the-whisper</loc>\n    <lastmod>2026-10-18</lastmod>\n  </url>\n</urlset>\n';
  const rows = [{ type: 'reel', title: 'A new video', slug: 'a-new-video', publish_at: '2026-10-26T00:00:00Z', updated_at: '2026-10-27T00:00:00Z' }, { type: 'reel', title: 'The Whisper', slug: 'the-whisper', publish_at: '2026-10-18T00:00:00Z' }, { type: 'devotion', title: 'A new devotion', slug: 'a-new-devotion', publish_at: '2026-10-25T00:00:00Z' }];
  const sctx = { request: new Request('https://littlesaltandlight.com/sitemap.xml'), next: async () => new Response(built, { status: 200, headers: { 'content-type': 'application/xml' } }) };
  let r = await sitemap(sctx, async (url) => { check(/type=in\.\(reel,devotion,story\)/.test(url) && url.includes('publish_at=lte.'), 'the sitemap asks only for live videos, devotions and bedtime stories'); return new Response(JSON.stringify(rows)); });
  const x = await r.text();
  check(r.status === 200 && x.includes('<loc>https://littlesaltandlight.com/watch/a-new-video</loc>\n    <lastmod>2026-10-27</lastmod>') && x.includes('<loc>https://littlesaltandlight.com/read/a-new-devotion</loc>'), 'sitemap.xml adds posts published after the build, with lastmod');
  check(x.split('/watch/the-whisper<').length === 2 && x.trim().endsWith('</urlset>'), 'sitemap.xml does not repeat posts the build already listed');
  {
    const withListen = built.replace('</urlset>', '  <url>\n    <loc>https://littlesaltandlight.com/listen</loc>\n    <lastmod>2026-10-24</lastmod>\n  </url>\n</urlset>');
    const storyRow = [{ type: 'story', title: 'The Smallest Star', slug: 'the-smallest-star-bedtime-story', publish_at: '2026-11-05T11:00:00Z', updated_at: '2026-11-05T11:00:00Z' }];
    const lctx = { ...sctx, next: async () => new Response(withListen, { status: 200, headers: { 'content-type': 'application/xml' } }) };
    const lx = await (await sitemap(lctx, async () => new Response(JSON.stringify(storyRow)))).text();
    check(lx.includes('<loc>https://littlesaltandlight.com/listen/the-smallest-star-bedtime-story</loc>\n    <lastmod>2026-11-05</lastmod>'), 'a bedtime story published after the build is added to sitemap.xml under /listen');
  }
  r = await sitemap(sctx, async () => { throw new Error('down'); });
  check(r.status === 200 && (await r.text()) === built, 'if the database is down the built sitemap is served as it is');
}

// The build (scripts/prerender.mjs) writes a page for each live Studio bedtime story and lists it in sitemap.xml.
{
  const { prerender } = await import('../scripts/prerender.mjs');
  const { mkdtempSync, readFileSync: rf, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join, resolve } = await import('node:path');
  const out = mkdtempSync(join(tmpdir(), 'll-prerender-'));
  const story = posts.find((p) => p.type === 'story');
  const fake = async (url) => new Response(JSON.stringify(url.includes('/posts?') ? [story] : []), { headers: { 'content-type': 'application/json' } });
  const before = process.env.PRERENDER_STUDIO; delete process.env.PRERENDER_STUDIO;
  const r = await prerender(resolve(new URL('..', import.meta.url).pathname), out, { fetchImpl: fake, log: () => {} });
  if (before != null) process.env.PRERENDER_STUDIO = before;
  const file = join(out, 'listen/the-smallest-star-bedtime-story.html');
  const page = existsSync(file) ? rf(file, 'utf8') : '';
  check(r.studio && page.includes('<title>The Smallest Star | Bedtime Story for Kids #1 · Salt and Light</title>') && page.includes('Twinkle was the smallest star.'), 'build: a live Studio story gets its own prerendered page with the story text');
  check(rf(join(out, 'sitemap.xml'), 'utf8').includes('<loc>https://littlesaltandlight.com/listen/the-smallest-star-bedtime-story</loc>'), 'build: the Studio story is in sitemap.xml');
  check(/the-smallest-star-bedtime-story/.test(rf(join(out, 'listen.html'), 'utf8')), 'build: /listen links to the Studio story');
}

console.log(failures ? `\n${failures} edge check(s) failed` : '\nAll edge checks passed');
process.exit(failures ? 1 : 0);
