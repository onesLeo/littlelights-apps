// Renders the social sharing image (Open Graph / X card), 1200 x 630: the Salt and Light wordmark with
// its candle "i", the night sky, moon and owl from the Today screen, and the site's tagline.
// Run: npm run og   (needs Playwright's Chromium: npx playwright install chromium)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
// The wordmark and the owl, exactly as the app draws them.
const wordmark = html.match(/<a class="p-rwm"[^>]*>(<span class="wm"[\s\S]*?<\/svg>ght<\/span><\/span>)<\/a>/)[1].replace(/ style="--wm-d:[^"]*"/, '');
const owl = html.match(/<button class="p-owl"[^>]*>\s*(<svg[\s\S]*?<\/svg>)\s*<\/button>/)[1];
const branch = html.match(/<svg class="p-branch"[\s\S]*?<\/svg>/)[0];
const font = (file) => `url(data:font/woff2;base64,${readFileSync('fonts/' + file).toString('base64')}) format('woff2')`;

const browser = await chromium.launch();
const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await og.setContent(`<!doctype html><html><head><style>
  @font-face { font-family: Parisienne; src: ${font('parisienne-normal-400.woff2')}; }
  @font-face { font-family: B; font-weight: 800; src: ${font('bricolage-normal-800.woff2')}; }
  @font-face { font-family: B; font-weight: 600; src: ${font('bricolage-normal-600.woff2')}; }
  @font-face { font-family: N; font-style: italic; font-weight: 400; src: ${font('newsreader-italic-400.woff2')}; }
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; }
  body { position: relative; color: #f6eedc; font-family: B, sans-serif;
    background: radial-gradient(70% 90% at 80% 20%, #33296a 0%, #1b1640 45%, #0f0d20 100%); }
  .stars { position: absolute; inset: 0; opacity: .85; background:
    radial-gradient(2px 2px at 7% 12%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 19% 31%, #fff 50%, transparent 51%),
    radial-gradient(2px 2px at 38% 8%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 52% 20%, #fff 50%, transparent 51%),
    radial-gradient(2px 2px at 66% 9%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 94% 44%, #fff 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 58% 90%, #fff 50%, transparent 51%), radial-gradient(2px 2px at 29% 94%, #fff 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 3% 66%, #fff 50%, transparent 51%), radial-gradient(1.5px 1.5px at 47% 56%, #fff 50%, transparent 51%),
    radial-gradient(1.5px 1.5px at 76% 52%, #fff 50%, transparent 51%), radial-gradient(2px 2px at 88% 6%, #fff 50%, transparent 51%); }
  .moon { position: absolute; right: 120px; top: 64px; width: 150px; height: 150px; border-radius: 50%;
    background: radial-gradient(circle at 38% 36%, #fffbe8 0%, #fff1c4 55%, #f5d98a 100%);
    box-shadow: 0 0 60px 18px rgba(255,224,137,.35), 0 0 160px 60px rgba(245,194,107,.16); }
  .moon::after { content: ""; position: absolute; width: 22px; height: 22px; border-radius: 50%; left: 44px; top: 70px; background: rgba(214,180,110,.35);
    box-shadow: 46px -26px 0 -6px rgba(214,180,110,.3), 34px 30px 0 -8px rgba(214,180,110,.28); }
  .perch { position: absolute; right: 0; bottom: 96px; width: 470px; height: 220px; }
  /* Mirrored, so the trunk runs off the right edge and the branch reaches into the picture. */
  .perch .p-branch { position: absolute; right: -14px; bottom: 0; width: 470px; height: 70px; overflow: visible; transform: scaleX(-1); }
  .p-branch .bark { fill: #4a3529; } .p-branch .hi { fill: none; stroke: #7a5a43; stroke-width: 1.6; stroke-linecap: round; opacity: .7; }
  .p-branch .twig { fill: none; stroke: #4a3529; stroke-width: 3; stroke-linecap: round; } .p-branch .leaf { fill: #3f6a4f; }
  .owl { position: absolute; left: 120px; bottom: 44px; width: 210px; height: 196px; }
  .owl .lid { display: none; }
  .copy { position: absolute; left: 80px; top: 0; bottom: 0; width: 700px; display: flex; flex-direction: column; justify-content: center; gap: 18px; }
  .kicker { font-weight: 600; font-size: 22px; letter-spacing: .16em; text-transform: uppercase; color: #ffe08a; }
  .wm { --wm-s: #F6EEDC; --wm-g1: #F5C26B; --wm-g2: #F4A38C; --wm-g0: #FFF6D8; --wm-glow: rgba(245,194,107,.45);
    font-family: Parisienne, cursive; font-size: 128px; line-height: 1.1; white-space: nowrap; display: inline-block; margin-left: -6px; }
  .wm-s { color: var(--wm-s); }
  .wm-l { background: linear-gradient(90deg, var(--wm-g1), var(--wm-g2)); -webkit-background-clip: text; background-clip: text; color: transparent; filter: drop-shadow(0 0 .2em var(--wm-glow)); }
  .wm-i { display: inline-block; width: .18em; height: .49em; vertical-align: baseline; overflow: visible; margin: 0 .02em 0 .04em; }
  .wm-a { stop-color: var(--wm-g1); } .wm-b { stop-color: var(--wm-g2); } .wm-c { stop-color: var(--wm-g0); }
  .wm-wick { stroke: var(--wm-g2); stroke-width: 1.4; stroke-linecap: round; fill: none; }
  .wm-halo { opacity: .8; } .wm-halo2, .wm-ember { opacity: 0; }
  .tag { margin: 0; font-weight: 800; font-size: 46px; line-height: 1.1; letter-spacing: -.01em; color: #f6eedc; max-width: 640px; }
  .sub { margin: 0; font-family: N, serif; font-style: italic; font-size: 30px; color: #d9d1ee; }
  .dots { display: flex; gap: 12px; margin-top: 6px; }
  .dots i { width: 18px; height: 18px; border-radius: 50%; }
  .url { position: absolute; left: 80px; bottom: 40px; font-weight: 600; font-size: 22px; color: #bdb6d6; letter-spacing: .02em; }
</style></head><body>
  <div class="stars"></div>
  <div class="moon"></div>
  <div class="perch">${branch}<div class="owl">${owl}</div></div>
  <div class="copy">
    <div class="kicker">Gentle encouragement for families</div>
    <div>${wordmark}</div>
    <p class="tag">Bible devotions, stories &amp; audio for families</p>
    <p class="sub">Read, watch, listen and pray together.</p>
    <div class="dots"><i style="background:#f7c23f"></i><i style="background:#ee8fb2"></i><i style="background:#e46a4c"></i><i style="background:#a07fd6"></i><i style="background:#69ba7e"></i></div>
  </div>
  <div class="url">littlesaltandlight.com</div>
</body></html>`);
await og.evaluate(() => document.fonts.ready);
await og.screenshot({ path: 'icons/og-image.png' });
await browser.close();
console.log('icons/og-image.png rendered (1200 x 630)');
