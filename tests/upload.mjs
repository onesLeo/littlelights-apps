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

// Multipart (files over 100 MB are refused at Cloudflare's edge, so phones send 20 MB parts).
function fakeMpR2() {
  const done = {}, parts = {};
  return { done, parts, head: async () => null,
    createMultipartUpload: async (key, opts) => ({ uploadId: 'up1', key, opts }),
    resumeMultipartUpload: (key, id) => ({
      uploadPart: async (n, body) => { parts[n] = new Uint8Array(await new Response(body).arrayBuffer()).length; return { partNumber: n, etag: 'e' + n }; },
      complete: async (list) => { done[key] = list; return {}; }, abort: async () => {} }) };
}
const mpReq = (q, init = {}) => new Request('https://x.pages.dev/api/upload?' + q, { method: init.method || 'POST', body: init.body,
  headers: { Authorization: 'Bearer good', ...(init.body ? { 'Content-Length': String(init.body.length) } : {}), ...(init.headers || {}) } });
const mp = fakeMpR2();
res = await handleUpload(mpReq('name=Big.mp4&action=create&type=video/mp4&size=150000000'), { MEDIA: mp }, fakeFetch('owner'));
b = await res.json();
check(res.status === 200 && b.uploadId === 'up1' && /^uploads\//.test(b.key) && b.partBytes === 20 * 1024 * 1024, 'multipart create returns key, uploadId, part size');
const big = new Uint8Array(20 * 1024 * 1024);
res = await handleUpload(mpReq('key=' + encodeURIComponent(b.key) + '&uploadId=up1&action=part&part=1', { method: 'PUT', body: big }), { MEDIA: mp }, fakeFetch('owner'));
check(res.status === 200 && (await res.json()).etag === 'e1' && mp.parts[1] === big.length, 'part streamed into R2');
res = await handleUpload(mpReq('key=' + encodeURIComponent(b.key) + '&uploadId=up1&action=part&part=2', { method: 'PUT', body: new Uint8Array(21 * 1024 * 1024) }), { MEDIA: mp }, fakeFetch('owner'));
check(res.status === 413, 'oversized part refused');
res = await handleUpload(mpReq('key=' + encodeURIComponent(b.key) + '&uploadId=up1&action=complete', { body: new TextEncoder().encode(JSON.stringify({ parts: [{ partNumber: 1, etag: 'e1' }] })) }), { MEDIA: mp }, fakeFetch('owner'));
const cb = await res.json();
check(res.status === 201 && cb.url === MEDIA_ORIGIN + '/' + b.key && mp.done[b.key].length === 1, 'complete returns media URL');
res = await handleUpload(mpReq('key=../x&uploadId=up1&action=part&part=1', { method: 'PUT', body: big }), { MEDIA: mp }, fakeFetch('owner'));
check(res.status === 400, 'bad multipart key refused');
res = await handleUpload(mpReq('name=a.exe&action=create&type=application/x-msdownload&size=1'), { MEDIA: mp }, fakeFetch('owner'));
check(res.status === 415, 'multipart type checked');
res = await handleUpload(mpReq('key=uploads/x.mp4&uploadId=up1&action=part&part=1', { method: 'PUT', body: big, headers: { Authorization: 'Bearer outsider' } }), { MEDIA: mp }, fakeFetch(null));
check(res.status === 403, 'parts need a team member too');

// Client driver (js/store.js LLUploadParts): 150 MB file -> create, 8 parts with one retry, complete.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
const block = src.slice(src.indexOf('  var LLUploadParts'), src.indexOf('  function friendly(msg)'));
const window = {}; new Function('window', block)(window);
const P = window.LLUploadParts;
const fileSize = 150 * 1024 * 1024;
const fakeFile = { size: fileSize, name: 'Big.mp4', slice: (a, z) => ({ size: z - a }) };
const seen = []; let failedOnce = false;
const url = await P.send(fakeFile, 'name=Big.mp4', 'video/mp4', async (q, init) => {
  seen.push(q.replace(/key=[^&]*&uploadId=[^&]*&/, ''));
  if (q.includes('action=create')) return { key: 'uploads/big.mp4', uploadId: 'u', partBytes: 20 * 1024 * 1024 };
  if (q.includes('action=part')) { if (q.endsWith('part=3') && !failedOnce) { failedOnce = true; throw new Error('net'); } return { partNumber: Number(q.split('part=')[1]), etag: 'x' }; }
  if (q.includes('action=complete')) { const n = JSON.parse(init.body).parts.length; return { url: 'https://media.littlesaltandlight.com/uploads/big.mp4', n }; }
});
check(url === 'https://media.littlesaltandlight.com/uploads/big.mp4' && seen.filter((q) => q.startsWith('action=part')).length === 9, '150 MB file sent as 8 parts (one retried) and completed');
check(P.SINGLE_MAX <= 100 * 1024 * 1024, 'single-request uploads stay under Cloudflare 100 MB limit');
check(!/could not reach the database/i.test(src.slice(src.indexOf('_r2Put'), src.indexOf('uploadMedia: function (file) {\n      return this._r2Put'))), 'upload errors are not reported as database errors');
process.exit(failures ? 1 : 0);
