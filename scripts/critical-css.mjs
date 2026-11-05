// Writes css/critical.css: the part of css/app.css that the first screen needs, so the public pages can
// paint without waiting for the whole 134 KB stylesheet (scripts/build-pages.mjs inlines it and loads the
// full stylesheet afterwards; every rule is still in app.css, so nothing changes visually).
// One section per screen (Today, Watch, Listen, Read, Play, Verses: `/* group: listen */`): each page
// inlines only its own screen's section (pages of a screen share one: /listen and /listen/<story>), so a
// page does not carry the first-screen rules of the other five.
//
// How: build the site (built-in posts only, PRERENDER_STUDIO=0) so the pages hold their prerendered markup (the
// Listen intro, story rows and so on, which the first screen shows before the app starts), then
// open each screen's addresses (GROUPS below) in a real browser at phone and computer sizes, with scripts
// off and on, walk the stylesheet
// (CSS object model) and keep every rule whose last selector part matches a visible element on the page
// (ignoring :hover, ::before, .night and the like, so it errs on the side of keeping more), plus
// :root variables, @font-face and the @keyframes those rules use. Rules inside @media / @supports keep
// their wrapper. Run: npm run critical   (tests/build.mjs fails if css/critical.css is out of date).
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const sourceHash = () => createHash('sha256').update(readFileSync(resolve(root, 'css/app.css'))).digest('hex').slice(0, 12);

export const GROUPS = {
  today: ['/'],
  watch: ['/watch', '/watch/the-broken-crayon'],
  listen: ['/listen', '/listen/jonah-and-the-whale-bedtime-story'],
  read: ['/read', '/read/brave'],
  play: ['/play'],
  verses: ['/verses'],
};
// The screen a built page belongs to, from its file in dist/ (index.html, listen/<slug>.html, ...).
export function groupOf(file) {
  const first = file.replace(/\\/g, '/').replace(/^\/+/, '').split('/')[0].replace(/\.html$/, '');
  return first === 'index' || first === 'today' ? 'today' : Object.prototype.hasOwnProperty.call(GROUPS, first) ? first : 'today';
}
// The sections of css/critical.css: { today: '...', listen: '...' }.
export function criticalGroups(text) {
  const out = {};
  for (const m of text.matchAll(/\/\* group: ([a-z]+) \*\/\n([\s\S]*?)(?=\/\* group: |$)/g)) out[m[1]] = m[2].trim();
  return out;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  execFileSync(process.execPath, [resolve(root, 'scripts/build-pages.mjs')], { stdio: 'inherit', env: { ...process.env, PRERENDER_STUDIO: '0' } });
  const server = await serve(8094, { root: 'dist' });
  // The full stylesheet: /assets/app.<hash>.css on the built pages (switched on by the app; switched on
  // here too, so visibility is measured with every rule applied), /css/app.css elsewhere.
  const APP_CSS = '/(?:assets/app\\.[0-9a-f]+|css/app)\\.css$';
  const browser = await chromium.launch();
  const kept = {}; // group -> Map(path of the rule in the stylesheet -> true)
  // Each address is read twice: as the page arrives (scripts off: the prerendered first screen, with its
  // placeholders such as the Watch skeleton cards) and once the app has started.
  for (const [width, height, javaScriptEnabled] of [[412, 823, false], [412, 823, true], [1280, 800, false], [1280, 800, true]]) {
    const page = await browser.newPage({ viewport: { width, height }, javaScriptEnabled });
    await page.route(/supabase\.co/, (r) => r.abort());
    for (const [group, routes] of Object.entries(GROUPS)) {
    kept[group] = kept[group] || new Map();
    for (const route of routes) {
    await page.goto('http://localhost:8094' + route, { waitUntil: 'load' });
    await page.evaluate(() => document.querySelectorAll('link[data-late]').forEach((l) => { l.media = 'all'; }));
    await page.waitForTimeout(600);
    const paths = await page.evaluate((APP_CSS) => {
      const sheet = [...document.styleSheets].find((s) => s.href && new RegExp(APP_CSS).test(s.href));
      const out = [];
      const strip = (sel) => {
        // last compound selector, without pseudo-classes / pseudo-elements / state classes
        let last = sel.trim().split(/\s*[>+~]\s*|\s+(?![^(\[]*[)\]])/).filter(Boolean).pop() || '*';
        last = last.replace(/::?[a-z-]+(\([^)]*\))?/gi, '').replace(/\[[^\]]*\]/g, '');
        return last || '*';
      };
      const matches = (selectorText) => selectorText.split(/,(?![^(]*\))/).some((s) => {
        if (/^(html|body|:root|\*)\b/.test(s.trim()) && !/\s/.test(s.trim())) return true;
        try { return [...document.querySelectorAll(strip(s))].some((e) => e.getClientRects().length > 0); } catch (e) { return true; }
      });
      const walk = (rules, prefix) => rules.forEach((rule, i) => {
        const here = prefix + i;
        if (rule.type === 1) { if (matches(rule.selectorText)) out.push(here); }
        else if (rule.cssRules && (rule.type === 4 || rule.type === 12)) walk(Array.from(rule.cssRules), here + '.');
        else if (rule.type === 7 || rule.type === 5) out.push(here); // keyframes / font-face (filtered below)
      });
      walk(Array.from(sheet.cssRules), '');
      return out;
    }, APP_CSS);
    paths.forEach((p) => kept[group].set(p, true));
    }
    }
    await page.close();
  }
  // Rebuild each section's text from its kept paths (read the rules again in one page to get their text).
  const page = await browser.newPage({ viewport: { width: 412, height: 823 } });
  await page.route(/supabase\.co/, (r) => r.abort());
  await page.goto('http://localhost:8094/', { waitUntil: 'load' });
  const sections = [];
  for (const [group, paths] of Object.entries(kept)) {
  const css = await page.evaluate(([keptPaths, APP_CSS]) => {
    const keep = new Set(keptPaths);
    const sheet = [...document.styleSheets].find((s) => s.href && new RegExp(APP_CSS).test(s.href));
    const parts = [];
    const emit = (rules, prefix) => {
      const out = [];
      rules.forEach((rule, i) => {
        const here = prefix + i;
        if (rule.type === 4 || rule.type === 12) {
          const inner = emit(Array.from(rule.cssRules), here + '.');
          if (inner) out.push(`@${rule.type === 4 ? 'media' : 'supports'} ${rule.type === 4 ? rule.media.mediaText : rule.conditionText} {\n${inner}\n}`);
        } else if (keep.has(here) && rule.type !== 7) out.push(rule.cssText);
      });
      return out.join('\n');
    };
    let body = emit(Array.from(sheet.cssRules), '');
    // keyframes used by what was kept
    Array.from(sheet.cssRules).forEach((rule) => { if (rule.type === 7 && new RegExp('[: ,]' + rule.name.replace(/[-]/g, '\\-') + '[ ;,}]').test(body)) parts.push(rule.cssText); });
    return parts.join('\n') + '\n' + body;
  }, [[...paths.keys()], APP_CSS]);
  sections.push(`/* group: ${group} */\n${css.trim()}\n`);
  }
  await browser.close();
  server.close?.();
  const header = `/* Generated by scripts/critical-css.mjs from css/app.css (${sourceHash()}). Do not edit; run npm run critical. */\n`;
  const out = header + sections.join('');
  writeFileSync(resolve(root, 'css/critical.css'), out);
  console.log(`css/critical.css: ${Object.entries(criticalGroups(out)).map(([g, t]) => `${g} ${t.length}`).join(', ')} bytes (app.css ${readFileSync(resolve(root, 'css/app.css')).length})`);
  process.exit(0);
}
