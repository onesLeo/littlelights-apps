// Build test: the packaged site (dist/, made by scripts/build-pages.mjs) contains every file the
// app and the Studio load, and nothing private. No browser needed.
// Run: npm test
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
let failures = 0;
function check(ok, label) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures++;
}

execFileSync(process.execPath, [join(root, 'scripts', 'build-pages.mjs')], { stdio: 'inherit' });

// Everything the offline service worker caches on install; one missing file stops it installing.
const shell = readFileSync(join(root, 'sw.js'), 'utf8').match(/const SHELL = \[([\s\S]*?)\];/)[1]
  .match(/'[^']+'/g).map((s) => s.slice(1, -1)).filter((f) => f !== './');
const missingShell = shell.filter((f) => !existsSync(join(dist, f)));
check(missingShell.length === 0, `offline list: all ${shell.length} cached files are in the build ${missingShell.join(', ')}`);

// Every local file a page or stylesheet points at.
function refs(file) {
  const text = readFileSync(join(dist, file), 'utf8');
  const found = [...text.matchAll(/(?:src|href)="([^"#?]+)"|url\((['"]?)([^'")]+)\2\)/g)].map((m) => m[1] || m[3]);
  return found.filter((u) => !/^(https?:|data:|mailto:|#|\/\/)/.test(u)).map((u) => join(dirname(file), u));
}
for (const page of ['index.html', 'studio/index.html', 'fonts/fonts.css', 'css/app.css', 'studio/studio.css']) {
  const missing = refs(page).filter((f) => !existsSync(join(dist, f)));
  check(missing.length === 0, `${page}: every linked file is in the build ${missing.join(', ')}`);
}

check(existsSync(join(dist, 'studio', 'index.html')), 'the Studio is included');
for (const hidden of ['docs', 'supabase', 'tests', 'scripts', 'package.json', 'node_modules', '.github', 'wrangler.jsonc']) {
  check(!existsSync(join(dist, hidden)), `${hidden} is not published`);
}

console.log(failures ? `\n${failures} build check(s) failed` : '\nAll build checks passed');
process.exit(failures ? 1 : 0);
