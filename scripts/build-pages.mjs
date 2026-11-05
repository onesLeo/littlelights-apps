// Packages the public site into dist/ for hosting (GitHub Pages, Cloudflare Pages).
// Only what visitors and the Studio need is copied: no docs, tests or database setup.
// tests/build.mjs checks that nothing the app loads is left out.
import { createHash } from 'node:crypto';
import { access, cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { prerender } from './prerender.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

// _headers (security headers) and 404.html are read by Cloudflare Pages; 404.html is also what
// Pages shows for any address that has no file, with status 404. Every real address gets its own
// file from scripts/prerender.mjs (dist/watch.html is served at /watch), so there is no catch-all.
for (const file of ['404.html', 'manifest.webmanifest', 'sw.js', '_headers', 'robots.txt', 'favicon.ico']) {
  await cp(resolve(root, file), resolve(output, file));
}

for (const directory of ['css', 'fonts', 'js', 'icons', 'studio']) {
  await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
}

try {
  await access(resolve(root, 'media'));
  await cp(resolve(root, 'media'), resolve(output, 'media'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

// Short links such as /join (Cloudflare Pages reads _redirects from the output folder).
await cp(resolve(root, '_redirects'), resolve(output, '_redirects'));

// index.html, one page per address, and sitemap.xml.
await prerender(root, output);

// The Studio's files keep their names, so its page asks for each with ?v=<hash of the file>: a phone
// that still holds yesterday's studio.css (HTTP cache or the service worker) fetches the new one,
// instead of mixing new markup with old styles.
{
  const studioPage = resolve(output, 'studio', 'index.html');
  let html = await readFile(studioPage, 'utf8');
  html = await replaceAsync(html, /(href|src)="((?:\.\.\/)?[\w/]+\.(?:css|js))"/g, async (m, attr, ref) => {
    const body = await readFile(resolve(root, 'studio', ref));
    return `${attr}="${ref}?v=${createHash('sha256').update(body).digest('hex').slice(0, 10)}"`;
  });
  await writeFile(studioPage, html);
}
async function replaceAsync(text, re, fn) {
  const parts = await Promise.all([...text.matchAll(re)].map((m) => fn(...m)));
  let i = 0;
  return text.replace(re, () => parts[i++]);
}

// Fingerprinted copies of the app's CSS and scripts, for the public pages only. A copy's name holds a
// hash of its contents (/assets/app.3f2a9c1b.js), so _headers lets browsers keep it for a year: a
// changed file gets a new name, the pages (served fresh every time) point at the new name, and sw.js
// lists the new names too, so the browser sees a new service worker and updates. The plain files
// (/js/app.js and so on) stay for the Studio and local development.
export const FINGERPRINTED = ['css/app.css', 'fonts/fonts.css', 'js/analytics.js'];
// The app's own scripts, in the order index.html loads them. On the public pages they are one file
// deferred file (/assets/bundle.<hash>.js, the same scripts one after another, in the same order): one
// request instead of six on a phone's slow first connection.
export const BUNDLED = ['js/config.js', 'js/store.js', 'js/content.js', 'js/seo.js', 'js/reel-text.js', 'js/app.js'];
await mkdir(resolve(output, 'assets'), { recursive: true });
const renamed = {};
// Minified (whitespace, comments, local names): the source files stay readable, the copies are smaller.
// Top-level names are kept, because these are classic scripts that share globals (LL_CONFIG, LLStore).
const minify = async (file, body) => (await transform(body, { loader: file.endsWith('.css') ? 'css' : 'js', minify: true, legalComments: 'none', charset: 'utf8' })).code;
const writeHashed = async (base, ext, body) => {
  const name = `${base}.${createHash('sha256').update(body).digest('hex').slice(0, 10)}.${ext}`;
  await writeFile(resolve(output, 'assets', name), body);
  return `assets/${name}`;
};
for (const file of FINGERPRINTED) {
  let body = await readFile(resolve(root, file), 'utf8');
  // fonts.css names its fonts relative to /fonts/.
  if (file === 'fonts/fonts.css') body = body.replace(/url\((?![a-z]+:|\/)([^)]+)\)/g, 'url(/fonts/$1)');
  const [base, ext] = file.split('/').pop().split(/\.(?=\w+$)/);
  renamed[file] = await writeHashed(base, ext, await minify(file, body));
}
// Each script is minified on its own and ends with a semicolon and a new line, so joining them runs exactly
// what the separate <script defer> tags ran, in the same order (each file keeps its own 'use strict' inside
// its own function; js/store.js finds js/vendor/ from document.currentScript, which is the bundle).
const bundle = (await Promise.all(BUNDLED.map(async (f) => (await minify(f, await readFile(resolve(root, f), 'utf8'))).trim().replace(/;?$/, ';')))).join('\n') + '\n';
const bundled = await writeHashed('bundle', 'js', bundle);
async function htmlFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'studio') out.push(...(await htmlFiles(path))); }
    else if (entry.name.endsWith('.html') && entry.name !== '404.html') out.push(path);
  }
  return out;
}
// Critical CSS (css/critical.css, made by scripts/critical-css.mjs) and the font faces go into the page
// itself, so the first screen paints without waiting for the stylesheet; the full stylesheet loads
// right after (media="print" until js/app.js switches it on, with a <noscript> copy). The browser only
// accepts an inline <style> if the policy lists its hash, so the hash goes into _headers.
const fontsCss = (await readFile(resolve(output, 'assets', renamed['fonts/fonts.css'].split('/').pop()), 'utf8')).replace(/\/\*[\s\S]*?\*\//g, '').trim();
// css/critical.css has one section per screen (`/* group: listen */`); a page inlines its own screen's
// section (pages of a screen share one), so it does not carry the other screens' first-screen rules.
const criticalText = (await readFile(resolve(root, 'css/critical.css'), 'utf8')).replace(/^\/\*[\s\S]*?\*\/\n/, '');
const criticalByGroup = {};
for (const m of criticalText.matchAll(/\/\* group: ([a-z]+) \*\/\n([\s\S]*?)(?=\/\* group: |$)/g)) criticalByGroup[m[1]] = m[2];
// (no sections: an older single-block file, used for every page while npm run critical rebuilds it)
if (!criticalByGroup.today) criticalByGroup.today = criticalText;
// The screen of a built page, from its path in dist/: index.html and today.html -> today, listen/<slug>.html -> listen.
const groupOf = (path) => {
  const first = relative(output, path).split(sep)[0].replace(/\.html$/, '');
  return first !== 'index' && Object.prototype.hasOwnProperty.call(criticalByGroup, first) ? first : 'today';
};
// Rules the prerendered markup needs before the stylesheet arrives: the hidden post title/text on
// /watch/<slug> (.p-seo) and the hidden "play" note in gallery buttons (.p-vh) must not take up room,
// and the sort-bar placeholder is dimmed (without these the page jumps when app.css loads).
const prerenderCss = '.p-seo,.p-vh{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.p-fskel{opacity:.5;pointer-events:none}';
const inlineCssByGroup = {};
for (const [group, critical] of Object.entries(criticalByGroup)) {
  inlineCssByGroup[group] = (await transform(fontsCss + '\n' + critical + '\n' + prerenderCss, { loader: 'css', minify: true, legalComments: 'none', charset: 'utf8' })).code.trim();
}
export const inlineCss = inlineCssByGroup.today;
const inlineHashes = [...new Set(Object.values(inlineCssByGroup))].map((css) => 'sha256-' + createHash('sha256').update(css).digest('base64'));
for (const path of await htmlFiles(output)) {
  let html = await readFile(path, 'utf8');
  const tags = BUNDLED.map((f) => `<script defer src="/${f}"></script>`);
  if (!tags.every((t) => html.includes(t))) throw new Error(`${path}: app scripts not found`);
  html = html.replace(tags[0], `<script defer src="/${bundled}"></script>`);
  for (const t of tags.slice(1)) html = html.replace(new RegExp(t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '\\n?'), '');
  for (const [file, name] of Object.entries(renamed)) html = html.split(`"/${file}"`).join(`"/${name}"`);
  const fontsLink = `<link rel="stylesheet" href="/${renamed['fonts/fonts.css']}">`;
  const appLink = `<link rel="stylesheet" href="/${renamed['css/app.css']}">`;
  if (!html.includes(fontsLink) || !html.includes(appLink)) throw new Error(`${path}: stylesheet links not found`);
  html = html.replace(fontsLink, `<style>${inlineCssByGroup[groupOf(path)]}</style>`)
    .replace(appLink, `<link rel="stylesheet" href="/${renamed['css/app.css']}" media="print" data-late>\n  <noscript>${appLink}</noscript>`);
  await writeFile(path, html);
}
{
  const headersPath = resolve(output, '_headers');
  const text = await readFile(headersPath, 'utf8');
  if (!text.includes("style-src-elem 'self'")) throw new Error("_headers: style-src-elem 'self' not found");
  await writeFile(headersPath, text.replace("style-src-elem 'self'", `style-src-elem 'self' ${inlineHashes.map((h) => `'${h}'`).join(' ')}`));
}
let sw = await readFile(resolve(output, 'sw.js'), 'utf8');
for (const [file, name] of Object.entries(renamed)) sw = sw.split(`'${file}'`).join(`'${name}'`);
// The service worker keeps the bundle the pages load instead of the separate scripts.
if (!BUNDLED.every((f) => sw.includes(`  '${f}',\n`))) throw new Error('sw.js: app scripts not found in SHELL');
sw = sw.replace(`  '${BUNDLED[0]}',\n`, `  '${bundled}',\n`);
for (const f of BUNDLED.slice(1)) sw = sw.replace(`  '${f}',\n`, '');
await writeFile(resolve(output, 'sw.js'), sw);
