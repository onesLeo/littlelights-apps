# Little Light legal site

Static legal pages for Little Light, served at https://legal.littlesaltandlight.com (Cloudflare Pages project `little-light-legal`, direct upload).

This folder lives in the littlelights-apps repository but is **not part of the web app build**: `scripts/build-pages.mjs` copies only the app's own files into `dist/`, so nothing here is published on littlesaltandlight.com, and merging changes here does not redeploy the legal site. Run every command below from this `legal/` folder (`cd legal`).

- `src/pages/*.html`: page content (fragments). `{{MACROS}}` are filled in by `build.py`.
- `static/`: CSS, self-hosted fonts (subset made from the repository's `../fonts/`), favicon, `_headers`, `robots.txt`, `sitemap.xml`.
- `python3 build.py` writes the site to `legal/public/` (build output, gitignored).

Placeholders that still need confirmation are defined once in `MACROS` in `build.py` and render as highlighted `[...]` text. Replace them there, rebuild and redeploy.

Heading font: `./make-font.sh` (reads `../fonts/bricolage-normal-800.woff2` by default) makes the subset of Bricolage Grotesque 800 in `static/fonts/` (SIL OFL). Body text uses system serif fonts, to keep the site tiny.

No JavaScript and no external requests. CSP is `default-src 'self'`, so don't use inline `style=""` attributes.

## Deploying

Live: https://legal.littlesaltandlight.com (proxied CNAME `legal` → `little-light-legal.pages.dev`).

The first deploy (6 Oct 2026) went through the Cloudflare connector. The connector can't call the JWT-authenticated Pages asset upload endpoints, so `make-worker.py` bundles `public/` into one `dist/_worker.js` (Pages advanced mode; `public/` and `dist/` are build output under `legal/`, gitignored). That worker serves the files and sets the same security headers as `static/_headers`, plus `X-Robots-Tag: noindex` on `*.pages.dev`. To redeploy the same way: `cd legal && python3 build.py && python3 make-worker.py`, then upload `dist/_worker.js` as a Pages deployment with an empty manifest.

If a Cloudflare API token with Pages:Edit is available later, plain static hosting is simpler: `cd legal && python3 build.py && npx wrangler pages deploy public --project-name little-light-legal --branch main`. A static deploy uses `static/_headers`. Wrangler won't upload a `_worker.js` unless one is in `public/`, so the worker isn't used after that.
