# Addresses, page heads and search engines

Every screen and post has a real address:

| Address | Screen |
|---|---|
| `/` (also `/today`) | Today |
| `/watch`, `/watch/<video>`, `/watch/series/<series>` | Watch, one video, one series |
| `/listen` | Listen |
| `/read`, `/read/<devotion>` | Read, one devotion |
| `/play` | The game |
| `/verses` | Verses (kept out of search while it is "coming soon" or hidden) |

Old `#` links (`/#watch`, `/#read/brave`) still work: the app swaps them for the new address.

## How each page gets its own `<head>`

1. **Build (`scripts/prerender.mjs`, run by `npm run build` and by Cloudflare Pages).** It reads the
   built-in posts from `js/content.js` and the published Studio posts and site settings from Supabase
   (the same public, read-only request the app makes) and writes one HTML file per address:
   `dist/watch.html` is served at `/watch`, `dist/read/brave.html` at `/read/brave`. Each has its own
   title, description, canonical link, Open Graph and X card tags, and JSON-LD (WebSite, Organization,
   plus Article, VideoObject, PodcastEpisode or VideoGame for the page). The devotion text and the
   right screen are in the HTML, so search engines and link previews need no JavaScript.
   It also writes `sitemap.xml`. If Supabase can't be reached the build still succeeds with the
   built-in posts.
2. **Posts published after the last build (`functions/read/[slug].js`, `functions/watch/[slug].js`).**
   These Pages Functions only run when `/read/<slug>` or `/watch/<slug>` has no file. They look the
   post up (published and live only) and answer with the page and its head; an unknown slug stays a
   real 404. Everything else is plain static files.
3. **In the browser (`js/app.js` with `js/seo.js`).** Changing screen updates the address (History
   API), the title, description, canonical and share tags, from the same `js/seo.js` the build uses.

There is no catch-all rewrite, so any address that isn't a screen or a post returns the 404 page with
status 404. `/studio/` is untouched and stays out of search (`X-Robots-Tag` and `robots.txt`).

New posts appear in `sitemap.xml` at the next deploy (any push to `main`).
