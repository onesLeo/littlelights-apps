// GET /api/loves?ids=story:slug,reel:slug  — public net love totals for the requested posts only.
// No days, no other events, nothing about the visitor. Used to show the number next to the heart.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../lib/edge.mjs';

const POST_RE = /^(reel|audio|devotion|verse|story):[a-z0-9-]{1,80}$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=15' }
});

export async function onRequestGet(context) {
  const raw = new URL(context.request.url).searchParams.get('ids') || '';
  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter((s) => POST_RE.test(s)))].slice(0, 80);
  if (!ids.length) return json({});
  try {
    const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/get_post_love_counts', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_ids: ids })
    });
    if (!r.ok) return json({}, r.status === 404 ? 200 : 502);
    const rows = await r.json();
    const out = {};
    for (const row of rows || []) out[row.post_id] = Number(row.loves || 0);
    return json(out);
  } catch {
    return json({}, 502);
  }
}

export const onRequest = (context) => {
  if (context.request.method === 'GET') return onRequestGet(context);
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'private, no-store' } });
};
