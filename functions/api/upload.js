// PUT /api/upload — Studio media uploads to Cloudflare R2 (bucket littlesaltandlight-media, binding MEDIA),
// served from https://media.littlesaltandlight.com with year-long immutable caching (no Supabase egress).
// 1. Verifies the caller's Supabase session token (Authorization: Bearer <jwt>) with Supabase Auth.
// 2. Checks team membership exactly like Supabase Storage did ("Team uploads media": any team_members row,
//    read as that user so RLS applies) — same check as /api/insights.
// 3. Streams the request body straight into R2 (no buffering), so large videos work (up to the
//    Cloudflare request-body limit, 100 MB on Free; the old Supabase bucket allowed 50 MB).
// Query: ?path=stories/<name>.<hash>.mp3 for a fixed content-hashed path (re-uploading the same path is
// not an error), or ?name=<original file name> to get a fresh uploads/<date>/<time>-<slug>.<ext> path.
import { teamMember } from './insights.js';

export const MEDIA_ORIGIN = 'https://media.littlesaltandlight.com';
export const MAX_BYTES = 100 * 1024 * 1024;
const CACHE = 'public, max-age=31536000, immutable';
const TYPES = /^(video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|wav|x-wav|ogg|webm)|image\/(jpeg|png|webp|gif)|application\/(json|pdf))$/;

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }
});

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';

export function keyFor(url, now = new Date()) {
  const path = url.searchParams.get('path');
  if (path != null) return /^(stories|reels|uploads)\/[a-z0-9][a-z0-9._-]{0,150}$/.test(path) && !path.includes('..') ? { key: path, fixed: true } : null;
  const name = String(url.searchParams.get('name') || 'file');
  const ext = ((name.match(/\.[a-z0-9]{1,5}$/i) || [''])[0]).toLowerCase();
  const rnd = Math.random().toString(36).slice(2, 8);
  return { key: 'uploads/' + now.toISOString().slice(0, 10) + '/' + now.getTime() + '-' + rnd + '-' + slugify(name.replace(/\.[^.]+$/, '')) + ext, fixed: false };
}

// Cloudflare refuses request bodies over 100 MB at the edge (413 before the function runs) and the
// browser then reports a bare network error, so big files (phone videos) go up in parts with R2
// multipart upload: ?action=create, then PUT ?action=part&part=N (PART_BYTES each, the last smaller),
// then ?action=complete (JSON list of { partNumber, etag }), or ?action=abort. Every call is checked.
export const PART_BYTES = 20 * 1024 * 1024;
export const MAX_MULTIPART_BYTES = 2 * 1024 * 1024 * 1024;
const okKey = (key) => /^(stories|reels|uploads)\/[a-z0-9][a-z0-9._\/-]{0,180}$/.test(key || '') && !key.includes('..');

export async function handleUpload(request, env, fetchImpl = fetch) {
  if (request.method !== 'PUT' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env || !env.MEDIA) return json({ error: 'R2 binding MEDIA is not configured' }, 500);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first' }, 401);
  const member = await teamMember(token, fetchImpl).catch(() => null);
  if (!member) return json({ error: 'Only the Salt and Light team can upload' }, 403);
  const u = new URL(request.url), action = u.searchParams.get('action') || '';
  const len = Number(request.headers.get('Content-Length') || 0);

  if (action === 'part' || action === 'complete' || action === 'abort') {
    const key = u.searchParams.get('key'), uploadId = u.searchParams.get('uploadId');
    if (!okKey(key) || !uploadId) return json({ error: 'Bad upload' }, 400);
    const mp = env.MEDIA.resumeMultipartUpload(key, uploadId);
    if (action === 'abort') { await mp.abort().catch(() => {}); return json({ aborted: true }); }
    if (action === 'part') {
      const n = Number(u.searchParams.get('part'));
      if (!Number.isInteger(n) || n < 1 || n > 10000) return json({ error: 'Bad part number' }, 400);
      if (!len) return json({ error: 'Content-Length required' }, 411);
      if (len > PART_BYTES) return json({ error: 'Part too large' }, 413);
      const part = await mp.uploadPart(n, request.body);
      return json({ partNumber: part.partNumber, etag: part.etag });
    }
    const body = await request.json().catch(() => null);
    const parts = body && Array.isArray(body.parts) ? body.parts.map((p) => ({ partNumber: Number(p.partNumber), etag: String(p.etag) })) : null;
    if (!parts || !parts.length) return json({ error: 'No parts' }, 400);
    await mp.complete(parts);
    return json({ url: MEDIA_ORIGIN + '/' + key, key }, 201);
  }

  const k = keyFor(u);
  if (!k) return json({ error: 'Bad path' }, 400);
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  const url = MEDIA_ORIGIN + '/' + k.key;
  if (action === 'create') {
    const ftype = String(u.searchParams.get('type') || '').toLowerCase();
    if (!TYPES.test(ftype)) return json({ error: 'File type not allowed: ' + (ftype || 'unknown') }, 415);
    const size = Number(u.searchParams.get('size') || 0);
    if (size > MAX_MULTIPART_BYTES) return json({ error: 'File too large (max 2 GB)' }, 413);
    if (k.fixed && await env.MEDIA.head(k.key)) return json({ url, key: k.key, existed: true });
    const mp = await env.MEDIA.createMultipartUpload(k.key, {
      httpMetadata: { contentType: ftype, cacheControl: CACHE }, customMetadata: { uploadedBy: member.email }
    });
    return json({ key: k.key, uploadId: mp.uploadId, partBytes: PART_BYTES });
  }
  if (!TYPES.test(type)) return json({ error: 'File type not allowed: ' + (type || 'unknown') }, 415);
  if (!len) return json({ error: 'Content-Length required' }, 411);
  if (len > MAX_BYTES) return json({ error: 'File too large for one request; use parts' }, 413);
  if (k.fixed && await env.MEDIA.head(k.key)) return json({ url, key: k.key, existed: true });
  await env.MEDIA.put(k.key, request.body, {
    httpMetadata: { contentType: type, cacheControl: CACHE },
    customMetadata: { uploadedBy: member.email }
  });
  return json({ url, key: k.key }, 201);
}

export const onRequest = (context) => handleUpload(context.request, context.env);
