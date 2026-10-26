// Writes a STUB read-along timings file for a bedtime story: every sentence of the story, prayer and
// goodnight, with times spread evenly (by letters) over the story's `dur`. Only for placeholder audio;
// real narration needs real timings (docs/media-r2.md, "Read-along timings").
// Run: npm run stub-timings -- jonah-and-the-whale-bedtime-story
import vm from 'node:vm';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ctx = vm.createContext({ window: {}, console });
ctx.self = ctx.window;
for (const f of ['js/content.js', 'js/seo.js']) vm.runInContext(await readFile(resolve(root, f), 'utf8'), ctx, { filename: f });
const C = ctx.window.LL_CONTENT || ctx.LL_CONTENT, S = ctx.window.LL_SEO || ctx.LL_SEO;
const slug = process.argv[2];
const x = (C.bedtimeStories || []).find((s) => s.slug === slug);
if (!x || !x.timings) { console.error('No bedtime story with timings for slug: ' + slug); process.exit(1); }

// What the narrator reads, in order. "Let's pray." is spoken but not shown; the matcher skips it.
const spoken = [...x.story.flatMap(S.raSentences), 'Let\u2019s pray.', ...S.raSentences(x.prayer), ...S.raSentences(x.goodnight || '')]
  .filter((t) => S.raNorm(t));
const gap = 0.4, lead = 0.5;
const letters = spoken.reduce((n, t) => n + S.raNorm(t).replace(/ /g, '').length, 0);
const per = (x.dur - lead - gap * spoken.length) / letters;
let t = lead;
const r = (v) => Math.round(v * 100) / 100;
const out = spoken.map((text) => {
  const start = t;
  const words = text.split(/\s+/).filter((w) => S.raNorm(w)).map((w) => {
    const s = t; t += S.raNorm(w).replace(/ /g, '').length * per;
    return { text: w, start: r(s), end: r(t) };
  });
  const s = { text, start: r(start), end: r(t), words };
  t += gap;
  return s;
});
await writeFile(resolve(root, x.timings), '[\n' + out.map((s) => JSON.stringify(s)).join(',\n') + '\n]\n');
console.log(`Wrote ${x.timings}: ${out.length} sentences over ${x.dur} s (stub)`);
