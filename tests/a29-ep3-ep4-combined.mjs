// A29 Little Light Lessons Parts 3 & 4 combined reel: the draft seed in
// supabase/seed/20261121_a29_ep3_ep4_combined.sql points at the R2 video and 9:16 poster,
// stays hidden until Tue 24 Nov 2026 19:00 WITA, has teaser-free caption copy taken word for word
// from the existing ep3/ep4 seeds, and sw.js is bumped. The live database is never touched: the
// post is read from the seed file and Supabase answers are faked.
// Run: npm test
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { siteContent, pageList, sitemapXml } from '../scripts/prerender.mjs';
import { postPage } from '../lib/edge.mjs';

let failures = 0;
function check(ok, label) { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; }
const root = new URL('..', import.meta.url);
const SLUG = 'where-am-i-who-walks-at-the-back';
const TITLE = 'Where Am I? Who Walks at the Back?';
const AT = '2026-11-24T11:00:00.000Z'; // Tue 24 Nov 2026 19:00 WITA (UTC+8)
const MP4 = 'https://media.littlesaltandlight.com/reels/where-am-i-who-walks-at-the-back.27b7520c.mp4';
const POSTER = 'https://media.littlesaltandlight.com/reels/where-am-i-who-walks-at-the-back-poster.5d9030f6.jpg';
const MP4_BYTES = 37205987;
const POSTER_BYTES = 360901;

const sql = await readFile(new URL('supabase/seed/20261121_a29_ep3_ep4_combined.sql', root), 'utf8');
const fields = JSON.parse(/\$json\$([\s\S]*?)\$json\$/.exec(sql)[1]);
check(/select 'reel', 'scheduled', '2026-11-24T19:00:00\+08:00', 'Where Am I\? Who Walks at the Back\?', 'where-am-i-who-walks-at-the-back', true/.test(sql), 'seed: one scheduled reel, 24 Nov 19:00 +08:00, the agreed slug and title');
check(new Date('2026-11-24T19:00:00+08:00').toISOString() === AT, 'seed: publish time is 2026-11-24T11:00Z');
check(/^insert into public\.posts/m.test(sql) && !/\b(update|delete|drop|alter|truncate)\b/i.test(sql.replace(/^--.*$/gm, '').replace(/\$json\$[\s\S]*?\$json\$/, '')) && /where not exists/.test(sql), 'seed: insert only, skipped if the slug exists');
check(sql.includes(MP4) && fields.poster === POSTER, 'seed: media_url and poster are the hashed R2 objects');
check(fields.series === 'Little Light Lessons' && fields.episode === 3 && fields.minutes === '2:06' && fields.seconds === 126, 'seed: series, episode 3 (sorts after Why Him?), 2:06 / 126 s');
check(fields.series_description === 'A claymation story for families to watch together. Ema and her little brother Atan learn the lessons Jesus taught, one everyday adventure at a time.', 'seed: series_description copied word for word from earlier Little Light Lessons reels');
check(fields.caption.includes('"Where am I?" Ema looks around — sandals, sheep, golden hills.') && fields.caption.includes('Who walks at the back? Back at the sheepfold the lost lamb is home.') && fields.caption.includes('Talk about it together: Why did the Shepherd leave the ninety-nine?') && fields.caption.includes('Talk about it together: Who could you walk "at the back" with this week'), 'seed: caption uses the ep3 and ep4 story and talk-about wording');
check(!/Friday|Saturday|YouTube|#Shorts|\?src=yt|Full film/i.test(fields.caption), 'seed: caption has no Friday/Saturday teaser, YouTube or hashtag lines');
check(!(await readFile(new URL('supabase/seed/20261108_a29_ep3_where_am_i_reel.sql', root), 'utf8')).includes('27b7520c'), 'does not edit the older ep3 seed');
check(!(await readFile(new URL('supabase/seed/20261108_a29_ep4_who_walks_at_the_back_reel.sql', root), 'utf8')).includes('27b7520c'), 'does not edit the older ep4 seed');
check(/const VERSION = 'll-v109'/.test(await readFile(new URL('sw.js', root), 'utf8')), 'service worker cache bumped to ll-v109');

async function head(url) {
  const res = await fetch(url, { method: 'HEAD' });
  return { status: res.status, type: (res.headers.get('content-type') || '').split(';')[0].trim(), length: Number(res.headers.get('content-length') || 0), ranges: (res.headers.get('accept-ranges') || '') === 'bytes' };
}
const mp4 = await head(MP4);
check(mp4.status === 200 && mp4.type === 'video/mp4' && mp4.length === MP4_BYTES && mp4.ranges, `R2 mp4 HEAD: 200 video/mp4 ${mp4.length} bytes, accept-ranges (status ${mp4.status})`);
const poster = await head(POSTER);
check(poster.status === 200 && poster.type === 'image/jpeg' && poster.length === POSTER_BYTES && poster.ranges, `R2 poster HEAD: 200 image/jpeg ${poster.length} bytes, accept-ranges (status ${poster.status})`);
const range = await fetch(MP4, { headers: { Range: 'bytes=0-1023' } });
check(range.status === 206 && Number(range.headers.get('content-length') || 0) === 1024, 'R2 mp4 supports a 206 range request (needed on iOS)');

const RealDate = Date;
async function storeAt(iso) {
  const now = new RealDate(iso).getTime();
  class FakeDate extends RealDate { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
  const c = { console, URL, Date: FakeDate, JSON, Math, Promise, document: { currentScript: null }, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  c.window = c; vm.createContext(c);
  for (const f of ['js/content.js', 'js/store.js', 'js/seo.js']) vm.runInContext(await readFile(new URL(f, root), 'utf8'), c);
  return { S: c.LLStore, C: JSON.parse(JSON.stringify(c.LL_CONTENT)) };
}
const post = { id: 99, type: 'reel', status: 'scheduled', publish_at: AT, title: TITLE, slug: SLUG, show_on_today: true, media_url: MP4, fields };

for (const [iso, due] of [['2026-11-24T18:59:00+08:00', false], ['2026-11-24T19:00:30+08:00', true]]) {
  const { S, C } = await storeAt(iso);
  const live = S.isLive(post);
  const listed = siteContent({ C, S }, { posts: live ? [post] : [], settings: {} });
  const pg = pageList(listed);
  const built = pg.some((p) => p.meta && p.meta.path === '/watch/' + SLUG);
  const inMap = sitemapXml(pg).includes('/watch/' + SLUG);
  const inSeries = listed.series.some((s) => s.series === 'Little Light Lessons' && s.reels.some((r) => r.slug === SLUG));
  check(live === due && built === due && inMap === due, `at ${iso}: ${due ? 'live, page built, in sitemap' : 'not live, no page, not in sitemap'}`);
  if (due) check(inSeries && listed.reels.find((r) => r.slug === SLUG).seconds === 126 && listed.reels.find((r) => r.slug === SLUG).src === MP4 && listed.reels.find((r) => r.slug === SLUG).poster === POSTER, 'after publish_at: in the Little Light Lessons series with R2 src, poster and 126 s');
}
check(!(await readFile(new URL('js/content.js', root), 'utf8')).includes(SLUG), 'not a built-in reel in js/content.js');

{
  const shell = await readFile(new URL('index.html', root), 'utf8');
  const fake = async (url) => {
    const u = new URL(url);
    const due = u.searchParams.get('publish_at') && new Date(u.searchParams.get('publish_at').replace(/^lte\./, '')) >= new Date(AT);
    const ok = u.searchParams.get('slug') === 'eq.' + SLUG && u.searchParams.get('type') === 'eq.reel' && due;
    return new Response(JSON.stringify(ok ? [post] : []), { headers: { 'content-type': 'application/json' } });
  };
  const ctx = (iso) => {
    const now = new Date(iso).getTime();
    class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } }
    const Real = globalThis.Date;
    globalThis.Date = FakeDate;
    return () => { globalThis.Date = Real; };
  };
  {
    const restore = ctx('2026-11-24T18:59:00+08:00');
    try {
      const res = await postPage({ request: new Request('https://littlesaltandlight.com/watch/' + SLUG), params: { slug: SLUG }, next: async () => new Response('nf', { status: 404 }),
        env: { ASSETS: { fetch: async () => new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } }) } } }, 'reel', fake);
      check(res.status === 404, 'edge page: 404 before 19:00 WITA');
    } finally { restore(); }
  }
  {
    const restore = ctx('2026-11-24T19:00:30+08:00');
    try {
      const res = await postPage({ request: new Request('https://littlesaltandlight.com/watch/' + SLUG), params: { slug: SLUG }, next: async () => new Response('nf', { status: 404 }),
        env: { ASSETS: { fetch: async () => new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } }) } } }, 'reel', fake);
      const html = await res.text();
      check(res.status === 200 && html.includes(TITLE + ' · Watch · Salt and Light'), 'edge page: search title after 19:00 WITA');
      check(html.includes('property="og:image" content="' + POSTER + '"'), 'edge page: og:image is the R2 9:16 poster');
      check(html.includes(MP4) && html.includes(POSTER), 'edge page: R2 video and poster URLs are in the HTML');
      check(html.includes('sandals, sheep, golden hills') && html.includes('walks at the back with him') && !/Friday|Saturday|#Shorts/i.test(html), 'edge page: teaser-free caption text is in the HTML');
    } finally { restore(); }
  }
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nAll A29 ep3+ep4 combined checks passed');
