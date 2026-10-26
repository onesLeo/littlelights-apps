// Pages Functions helper: an address like /read/<slug> for a post published in the Studio after the
// last build has no file yet. Look it up (public, read-only request with the anon key, like the app)
// and answer with the page and its own <head>; anything else stays a real 404.
import { SEO, renderPage, devotionFromPost, reelFromPost, audioFromPost, playerPoster } from './head.mjs';

// Must match js/config.js (tests/edge.mjs checks it). The anon key is public by design.
export const SUPABASE_URL = 'https://svlvlmyugyadmehjwudm.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_PpHntUeaf4RbeeYWStKpVw_RlYdUQFV';
const COLUMNS = 'id,type,status,publish_at,title,slug,show_on_today,fields,media_url,created_at,updated_at';

async function rest(query, fetchImpl) {
  const res = await fetchImpl(SUPABASE_URL + '/rest/v1/' + query, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// kind: 'devotion' (/read/<slug>) or 'reel' (/watch/<slug>).
export async function postPage(context, kind, fetchImpl = fetch) {
  const fallback = await context.next();
  if (fallback.status !== 404 || context.request.method !== 'GET') return fallback;
  try {
    const slug = String(context.params.slug || '');
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return fallback;
    const live = '&status=in.(published,scheduled)&publish_at=lte.' + encodeURIComponent(new Date().toISOString());
    const rows = await rest(`posts?select=${COLUMNS}&type=eq.${kind}&slug=eq.${slug}${live}&limit=1`, fetchImpl);
    if (!rows.length) return fallback;
    const p = rows[0];
    let page;
    if (kind === 'devotion') {
      const audioId = (p.fields || {}).audioId;
      const audio = audioId != null ? (await rest(`posts?select=${COLUMNS}&type=eq.audio&id=eq.${encodeURIComponent(audioId)}${live}&limit=1`, fetchImpl))[0] : null;
      const item = devotionFromPost(p, audio ? audioFromPost(audio) : null);
      page = { tab: 'read', kind: 'devotion', item, meta: SEO.meta('devotion', item) };
    } else {
      const item = reelFromPost(p);
      page = { tab: 'watch', kind: 'reel', item, meta: SEO.meta('reel', item), ...playerPoster(item) };
    }
    const shell = await context.env.ASSETS.fetch(new URL(kind === 'devotion' ? '/read' : '/watch', context.request.url));
    if (!shell.ok) return fallback;
    const headers = new Headers(shell.headers);
    headers.delete('content-length'); headers.delete('etag');
    headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    return new Response(renderPage(await shell.text(), page), { status: 200, headers });
  } catch (err) {
    return fallback;
  }
}

// /sitemap.xml: the file written at build time (scripts/prerender.mjs), plus any video or devotion
// published in the Studio since then, so new posts reach search engines without waiting for a build.
// Only sections the built sitemap lists (/watch, /read) get posts added. If the database can't be
// reached the built file is served as it is.
export async function sitemap(context, fetchImpl = fetch) {
  const built = await context.next();
  if (!built.ok || context.request.method !== 'GET') return built;
  const xml = await built.text();
  const headers = new Headers(built.headers);
  headers.delete('content-length'); headers.delete('etag');
  headers.set('Content-Type', 'application/xml; charset=utf-8');
  headers.set('Cache-Control', 'public, max-age=3600');
  try {
    const listed = new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
    const live = 'status=in.(published,scheduled)&publish_at=lte.' + encodeURIComponent(new Date().toISOString());
    const rows = await rest(`posts?select=type,title,slug,publish_at,updated_at&type=in.(reel,devotion)&${live}&order=publish_at.desc&limit=500`, fetchImpl);
    const extra = [];
    for (const p of rows) {
      const slug = p.type === 'reel' ? SEO.reelSlug(p) : p.slug;
      if (!slug || !/^[a-z0-9-]{1,80}$/.test(slug)) continue;
      const section = p.type === 'reel' ? 'watch' : 'read';
      const loc = SEO.SITE + SEO.path(section, slug);
      if (listed.has(loc) || !listed.has(SEO.SITE + '/' + section)) continue;
      listed.add(loc);
      const t = Math.max(Date.parse(p.publish_at || '') || 0, Date.parse(p.updated_at || '') || 0);
      extra.push(`  <url>\n    <loc>${loc}</loc>\n    <lastmod>${new Date(t || Date.now()).toISOString().slice(0, 10)}</lastmod>\n  </url>`);
    }
    const out = extra.length ? xml.replace('</urlset>', extra.join('\n') + '\n</urlset>') : xml;
    return new Response(out, { status: 200, headers });
  } catch (err) {
    return new Response(xml, { status: 200, headers });
  }
}
