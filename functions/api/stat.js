// POST /api/stat  { post_id, event }
// Anonymous increment for Studio Insights (and public love totals). The browser calls this
// same-origin endpoint so we can cap how often one connection increments a single post, without
// writing an IP or any other visitor data to the database. The cap lives in the Cache API for
// one hour, then disappears. Previews and any host other than littlesaltandlight.com are
// accepted (204) but not counted, so a preview never changes the live totals.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/edge.mjs';

const POST_RE = /^(reel|audio|devotion|verse|story|action):[a-z0-9-]{1,80}$/;
const EVENTS = new Set(['started', 'finished', 'read_end', 'love', 'unlove', 'share', 'save', 'click']);
// Per post, per event, per connecting address, per hour. Love/unlove is higher so a person can
// change their mind a few times; the others rarely need more than a handful.
const LIMITS = { love: 8, unlove: 8, share: 6, save: 6, click: 8, started: 8, finished: 8, read_end: 8 };

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
});

function allowedHost(host) {
  return host === 'littlesaltandlight.com' || host === 'localhost' || host === '127.0.0.1';
}

async function hourKey(ip, postId, event, hour) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(ip || '') + '|' + hour + '|' + postId + '|' + event));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 20);
}

async function overLimit(request, postId, event) {
  const limit = LIMITS[event] || 8;
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('CF-Connecting-IPv6') || '';
  const hour = Math.floor(Date.now() / 3600000);
  const stamp = await hourKey(ip, postId, event, hour);
  const key = new Request('https://stat.ll.invalid/' + stamp);
  try {
    const cache = caches.default;
    const hit = await cache.match(key);
    const n = hit ? Number(await hit.text()) || 0 : 0;
    if (n >= limit) return true;
    await cache.put(key, new Response(String(n + 1), { headers: { 'Cache-Control': 'max-age=3600', 'Content-Type': 'text/plain' } }));
  } catch {
    // No Cache API (or it failed): still increment, the RPC also clamps a day at 10,000.
  }
  return false;
}

export async function onRequestPost(context) {
  const { request } = context;
  const host = new URL(request.url).hostname;
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Bad request' }, 400); }
  const postId = String((body && body.post_id) || '');
  const event = String((body && body.event) || '');
  if (!POST_RE.test(postId) || !EVENTS.has(event)) return json({ error: 'Invalid' }, 400);
  // Previews (and any other host) must not change live totals.
  if (!allowedHost(host)) return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
  if (await overLimit(request, postId, event)) return json({ error: 'Too many' }, 429);
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/increment_post_stat', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ p_post_id: postId, p_event: event })
    });
    if (!r.ok) return json({ error: 'Not saved' }, r.status === 404 ? 404 : 502);
  } catch {
    return json({ error: 'Not saved' }, 502);
  }
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'private, no-store' } });
}

export const onRequest = (context) => {
  if (context.request.method === 'POST') return onRequestPost(context);
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'private, no-store' } });
};
