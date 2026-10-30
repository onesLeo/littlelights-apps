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

export async function handleUpload(request, env, fetchImpl = fetch) {
  if (request.method !== 'PUT' && request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env || !env.MEDIA) return json({ error: 'R2 binding MEDIA is not configured' }, 500);
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sign in first' }, 401);
  const member = await teamMember(token, fetchImpl).catch(() => null);
  if (!member) return json({ error: 'Only the Salt and Light team can upload' }, 403);
  const k = keyFor(new URL(request.url));
  if (!k) return json({ error: 'Bad path' }, 400);
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES.test(type)) return json({ error: 'File type not allowed: ' + (type || 'unknown') }, 415);
  const len = Number(request.headers.get('Content-Length') || 0);
  if (!len) return json({ error: 'Content-Length required' }, 411);
  if (len > MAX_BYTES) return json({ error: 'File too large (max 100 MB)' }, 413);
  const url = MEDIA_ORIGIN + '/' + k.key;
  if (k.fixed && await env.MEDIA.head(k.key)) return json({ url, key: k.key, existed: true });
  await env.MEDIA.put(k.key, request.body, {
    httpMetadata: { contentType: type, cacheControl: CACHE },
    customMetadata: { uploadedBy: member.email }
  });
  return json({ url, key: k.key }, 201);
}

export const onRequest = (context) => handleUpload(context.request, context.env);
