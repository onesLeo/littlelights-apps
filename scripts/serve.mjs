// Tiny static server for local development and tests. Run: npm start (http://localhost:8080)
import { createServer } from 'node:http';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};

// The rules in _headers, the way Cloudflare Pages reads them: a path line ("/*", "/studio/*"), then
// indented "Name: value" lines; "! Name" removes a header. Rules for absolute https:// URLs are skipped.
export function parseHeaders(text) {
  const rules = [];
  let rule = null;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) { rule = { path: raw.trim(), set: {}, remove: [] }; rules.push(rule); continue; }
    const line = raw.trim();
    if (!rule) continue;
    if (line.startsWith('!')) { rule.remove.push(line.slice(1).trim().toLowerCase()); continue; }
    const at = line.indexOf(':');
    rule.set[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return rules;
}
function headersFor(rules, path) {
  const out = {};
  for (const r of rules) {
    if (!r.path.startsWith('/')) continue;
    const re = new RegExp('^' + r.path.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace('*', '.*') + '$');
    if (!re.test(path)) continue;
    Object.assign(out, r.set);
  }
  return out;
}

// serve(port, { headers: true }) also sends the security headers from _headers, like the live site.
export function serve(port = 8080, options = {}) {
  const rules = options.headers ? parseHeaders(readFileSync(join(ROOT, '_headers'), 'utf8')) : [];
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = normalize(join(ROOT, path.endsWith('/') ? path + 'index.html' : path));
    if (!file.startsWith(ROOT) || file.includes('node_modules')) { res.writeHead(403).end(); return; }
    const extra = headersFor(rules, path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', ...extra });
      res.end(body);
    } catch {
      // Like Cloudflare Pages: an address with no file gets 404.html, with status 404.
      try {
        res.writeHead(404, { 'Content-Type': TYPES['.html'], ...extra }).end(await readFile(join(ROOT, '404.html')));
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      }
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 8080;
  // Another program can hold the port on IPv4 while this server still starts on IPv6; the browser
  // then reaches the other program and shows its "Not Found". So check that nothing answers first.
  const inUse = (p) => new Promise((resolve) => {
    const sock = connect({ port: p, host: '127.0.0.1' });
    sock.setTimeout(700, () => { sock.destroy(); resolve(false); });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
  if (await inUse(port)) {
    let free = port + 1;
    while (await inUse(free)) free++;
    console.error(`Port ${port} is already used by another program, so http://localhost:${port} would open that program, not Little Light.`);
    console.error(`Port ${free} is free. Start Little Light there instead:`);
    console.error(`  Windows (cmd):  set PORT=${free}&& npm start`);
    console.error(`  macOS / Linux:  PORT=${free} npm start`);
    console.error(`For Studio sign-in, add http://localhost:${free}/studio/ to Supabase's Redirect URLs (docs/studio.md).`);
    process.exit(1);
  }
  await serve(port, { headers: process.env.HEADERS !== '0' });
  console.log(`Little Light running at http://localhost:${port}`);
}
