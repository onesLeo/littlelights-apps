import { access, cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = resolve(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ['index.html', 'manifest.webmanifest', 'sw.js']) {
  await cp(resolve(root, file), resolve(output, file));
}

for (const directory of ['css', 'js', 'icons', 'studio']) {
  await cp(resolve(root, directory), resolve(output, directory), { recursive: true });
}

try {
  await access(resolve(root, 'media'));
  await cp(resolve(root, 'media'), resolve(output, 'media'), { recursive: true });
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
