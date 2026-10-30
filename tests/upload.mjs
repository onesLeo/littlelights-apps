// /api/upload test (functions/api/upload.js): team check, path rules, type/size limits and streaming into R2.
// R2 and Supabase are faked. Run: npm test
import { handleUpload, keyFor, MEDIA_ORIGIN } from '../functions/api/upload.js';
let failures = 0;
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures++; };

const fakeFetch = (role) => async (url, init) => {
  const tok = (init.headers.Authorization || '').replace('Bearer ', '');
  if (url.includes('/auth/v1/user')) return tok === 'good' || tok === 'outsider' ? new Response(JSON.stringify({ email: tok === 'good' ? 'Ed@Example.org' : 'x@y.z' })) : new Response('{}', { status: 401 });
  if (url.includes('/rest/v1/team_members')) return new Response(JSON.stringify(tok === 'good' && role ? [{ role }] : []));
  return new Response('{}', { status: 404 });
};
function fakeR2(existing = []) {
  const puts = [];
  return { puts, head: async (k) => (existing.includes(k) ? { key: k } : null),
    put: async (k, body, opts) => { const bytes = new Uint8Array(await new Response(body).arrayBuffer()); puts.push({ k, bytes, opts }); return {}; } };
}
const req = (q, { token = 'good', type = 'video/mp4', body = new Uint8Array(6 * 1024 * 1024), method = 'PUT' } = {}) =>
  new Request('https://x.pages.dev/api/upload?' + q, { method, body: method === 'GET' ? undefined : body,
    headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': type, 'Content-Length': String(body.length) } });

let r2 = fakeR2();
let res = await handleUpload(req('name=My%20Reel.MP4'), { MEDIA: r2 }, fakeFetch('editor'));
let b = await res.json();
check(res.status === 201 && b.url.startsWith(MEDIA_ORIGIN + '/uploads/') && /-my-reel\.mp4$/.test(b.url), 'editor upload returns media.littlesaltandlight.com URL');
check(r2.puts.length === 1 && r2.puts[0].bytes.length === 6 * 1024 * 1024, 'file over 5 MB streamed into R2 whole');
check(r2.puts[0].opts.httpMetadata.cacheControl === 'public, max-age=31536000, immutable' && r2.puts[0].opts.httpMetadata.contentType === 'video/mp4', 'immutable cache-control and content-type stored');

res = await handleUpload(req('name=a.mp4'), { MEDIA: fakeR2() }, fakeFetch('contributor'));
check(res.status === 201, 'contributors may upload (same as the Supabase "Team uploads media" rule)');
res = await handleUpload(req('name=a.mp4', { token: 'outsider' }), { MEDIA: fakeR2() }, fakeFetch(null));
check(res.status === 403, 'non-team user refused');
res = await handleUpload(req('name=a.mp4', { token: 'bad' }), { MEDIA: fakeR2() }, fakeFetch('owner'));
check(res.status === 403, 'invalid token refused');
res = await handleUpload(req('name=a.mp4', { token: '' }), { MEDIA: fakeR2() }, fakeFetch('owner'));
check(res.status === 401, 'missing token refused');
res = await handleUpload(req('name=a.exe', { type: 'application/x-msdownload' }), { MEDIA: fakeR2() }, fakeFetch('owner'));
check(res.status === 415, 'disallowed type refused');
res = await handleUpload(req('path=../etc/passwd'), { MEDIA: fakeR2() }, fakeFetch('owner'));
check(res.status === 400, 'path traversal refused');
res = await handleUpload(req('path=other/x.mp3', { type: 'audio/mpeg' }), { MEDIA: fakeR2() }, fakeFetch('owner'));
check(res.status === 400, 'only stories/, reels/, uploads/ prefixes');
r2 = fakeR2(['stories/pip.5b2dcc24.mp3']);
res = await handleUpload(req('path=stories/pip.5b2dcc24.mp3', { type: 'audio/mpeg' }), { MEDIA: r2 }, fakeFetch('owner'));
b = await res.json();
check(res.status === 200 && b.existed && b.url === MEDIA_ORIGIN + '/stories/pip.5b2dcc24.mp3' && !r2.puts.length, 'same hashed path again is not an error and not rewritten');
res = await handleUpload(req('name=a.mp4'), {}, fakeFetch('owner'));
check(res.status === 500, 'missing MEDIA binding reported');
res = await handleUpload(req('name=a.mp4', { method: 'GET' }), { MEDIA: fakeR2() }, fakeFetch('owner'));
check(res.status === 405, 'GET refused');
check(keyFor(new URL('https://x/?path=stories/a-timings.5868925c.json')).key === 'stories/a-timings.5868925c.json', 'fixed story path kept');
process.exit(failures ? 1 : 0);
