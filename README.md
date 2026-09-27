# Little Light — apps

The Little Light ministry web app: encouragement for families in one place.

| Tab | What it holds |
|---|---|
| **Today** | A Reels-style feed of this week's posts, with story circles to jump to each topic |
| **Watch** | Short vertical Bible-story reels |
| **Listen** | Audio devotions, prayers and stories, with a player that keeps going across tabs |
| **Read** | Devotions that open as full, shareable pages |
| **Verses** | Bible verses by topic ("When I'm afraid", "Trust", …), saved as ready-to-post images |
| **Play** | The Little Light: Bible Journeys game |

It is a **progressive web app (PWA)**: it works in any browser on phone or computer, can be installed to the home screen or desktop, and keeps working offline once visited. Bible text is the World English Bible (WEB), which is public domain.

## Run it locally

Requires Node.js 18 or newer.

```bash
npm install      # installs Playwright for the tests and icon rendering
npm start        # http://localhost:8080
npm test         # app smoke test + Studio test; screenshots in test-results/
```

There is no build step. Open `index.html` through the local server (the offline service worker does not run from `file://`).

## Project layout

```
index.html              the whole app shell
css/app.css             styles: phone layout first, computer layout at 900px and wider
js/content.js           built-in posts shown alongside Studio posts
js/config.js            Supabase connection (empty = local mode)
js/store.js             data layer shared by the app and the Studio
studio/                 the Studio (sign in, posts, editor, media, team)
supabase/schema.sql     database tables, security rules and file storage
js/app.js               tabs, feed, player, verse images, sharing, install, offline
sw.js                   offline cache (bump VERSION when a cached file changes)
manifest.webmanifest    app name, colours and icons for installing
icons/                  SVG sources and rendered PNG icons (npm run icons)
scripts/serve.mjs       tiny static server used by npm start and the tests
tests/smoke.mjs         end-to-end smoke test
docs/                   studio setup, backlog, improvements and roadmap
```

## Posting with the Studio

Open **`/studio/`** to write, schedule and publish verses, devotions, audio, reels and game updates, with a live preview. It runs in **local mode** out of the box (posts stay in your browser) and switches to a real shared database when you connect Supabase. Setup and security: [docs/studio.md](docs/studio.md).

## Adding built-in content

Edit `js/content.js`. Each devotion, episode, reel and verse is one entry.

- **Audio:** put the file in `media/` and set the episode's `src` (for example `"media/brave.mp3"`). Until then the player runs in a silent demo mode and says so.
- **Reels:** set the reel's `src` to an `.mp4`. Until then an animated placeholder is shown.
- **Game preview:** set `gamePreviewUrl` when the Godot browser build is published.

After changing any cached file, bump `VERSION` in `sw.js` so installed copies update.

## Installing as an app

- **Android (Chrome):** menu → *Install app*, or the **Install app** button on a computer.
- **iPhone / iPad (Safari):** Share → *Add to Home Screen*.
- **Windows / macOS (Chrome, Edge):** the install icon in the address bar, or **Install app** in the top bar.

The same PWA can later be listed on Google Play and the Microsoft Store with [PWABuilder](https://www.pwabuilder.com/). See `docs/roadmap.md`.

## Publishing

Any static host works (GitHub Pages, Cloudflare Pages, Netlify). A manual GitHub Pages workflow is in `.github/workflows/pages.yml`. Enable Pages (Settings → Pages → Source: GitHub Actions), then run the workflow. GitHub Pages on a private repository needs a paid GitHub plan; Cloudflare Pages is free for private repositories.

## Privacy

The app has no accounts, no ads and no tracking. Day/night, calm mode, the swipe hint and saved reels are remembered only in the visitor's own browser. The newsletter form is for adults and is not connected to an email service yet.
