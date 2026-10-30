// GET /dl/<path> — free printables (bedtime story PDFs), counted per file, day and country.
// <path> is media/printables/<name>.pdf (a file in this site) or stories/<name>.pdf (Cloudflare R2, uploaded in
// the Studio). Anything else is a 404, so this can never send visitors to another site.
//
// What is counted: public.increment_download(file, country) adds 1 to one number for today. The country is the
// two-letter code Cloudflare already works out for every request (request.cf.country); nothing else about the
// visitor is read or stored: no IP, user agent, cookie or id. Not counted: HEAD requests, ?nc=1 (devices set to
// "don't count me", added by js/app.js), and requests from crawlers and link-preview bots.
// The count runs after the redirect is sent (waitUntil), so the download is never slowed down or blocked by it.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './edge.mjs';

export const MEDIA_ORIGIN = 'https://media.littlesaltandlight.com';
const PATH = /^(stories|media\/printables)\/[a-z0-9][a-z0-9._-]{0,150}\.pdf$/;
const BOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|pinterest|headless|lighthouse|python|curl|wget|httpclient|go-http|java\//i;

// The count key: the file name without its folder, 8-character fingerprint and .pdf (same as LL_SEO.dlKey).
export function dlKey(path) {
  const m = /\/([a-z0-9][a-z0-9._-]*?)(?:\.[0-9a-f]{8})?\.pdf$/.exec('/' + String(path || ''));
  return m ? m[1].slice(0, 100) : '';
}

export function target(path, origin) {
  if (!PATH.test(path) || path.includes('..')) return null;
  return path.startsWith('stories/') ? MEDIA_ORIGIN + '/' + path : new URL('/' + path, origin).toString();
}

export function shouldCount(request, url) {
  if (request.method !== 'GET' || url.searchParams.get('nc') === '1') return false;
  const ua = request.headers.get('User-Agent') || '';
  return !!ua && !BOTS.test(ua);
}

export function countryOf(request) {
  const c = String((request.cf && request.cf.country) || '').toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== 'T1' ? c : 'XX'; // XX = unknown (T1 = Tor)
}

export async function count(file, country, fetchImpl = fetch) {
  try {
    await fetchImpl(SUPABASE_URL + '/rest/v1/rpc/increment_download', {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_file: file, p_country: country })
    });
  } catch { /* a missed count never breaks a download */ }
}

export async function download(context, fetchImpl = fetch) {
  const { request } = context;
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  const raw = context.params && context.params.path;
  const path = Array.isArray(raw) ? raw.join('/') : String(raw || '');
  const to = target(path, url.origin);
  if (!to) return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  if (shouldCount(request, url)) {
    const job = count(dlKey(path), countryOf(request), fetchImpl);
    if (context.waitUntil) context.waitUntil(job); else await job;
  }
  return new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' } });
}
