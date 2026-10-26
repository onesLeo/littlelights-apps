# Reel videos on Cloudflare R2

Built-in reel videos (the `.mp4` files) are not in the repo: Cloudflare Pages allows at most 25 MiB per
file, and big binaries bloat every clone. They live in the R2 bucket **`littlesaltandlight-media`**, served
publicly from **`https://media.littlesaltandlight.com/`** (custom domain on the littlesaltandlight.com zone).

Posters and thumbnails (`*-poster.jpg`, `*-thumb-360/720.avif|webp`) stay in `media/reels/`: the
prerender/LCP pipeline preloads them from the site itself.

Studio-uploaded reels are unchanged: they still use Supabase storage.

## Naming

`reels/<slug>.<hash>.mp4`, where `<hash>` is the first 8 hex characters of the file's SHA-256:

```sh
sha256sum the-new-reel.mp4 | cut -c1-8      # e.g. 4e507a9c -> reels/the-new-reel.4e507a9c.mp4
```

A changed video gets a new name, so the long immutable cache below is always safe. Never overwrite an
existing key with different bytes.

## Adding a reel

1. Make the poster and thumbnails as before and commit them to `media/reels/`.
2. Upload the video (needs a Cloudflare login with R2 write access):

   ```sh
   npx wrangler r2 object put littlesaltandlight-media/reels/the-new-reel.4e507a9c.mp4 \
     --file the-new-reel.mp4 --remote \
     --content-type video/mp4 \
     --cache-control "public, max-age=31536000, immutable"
   ```

   (S3-compatible tools such as `aws s3 cp --content-type video/mp4 --cache-control ...` against
   `https://<account-id>.r2.cloudflarestorage.com` work too.)
3. Check it: `curl -I https://media.littlesaltandlight.com/reels/the-new-reel.4e507a9c.mp4` should give
   `200`, `content-type: video/mp4`, `accept-ranges: bytes`, and the same `content-length` as the file;
   `curl -s -o /dev/null -w '%{http_code}' -r 0-1023 <url>` should give `206` (iOS needs range requests).
4. In `js/content.js` set `src: MEDIA_BASE + 'reels/the-new-reel.4e507a9c.mp4'` (poster/thumb keep their
   `media/reels/...` paths) and bump `VERSION` in `sw.js`.

## Bucket settings (already done)

- CORS: GET/HEAD from `https://littlesaltandlight.com`, `https://www.littlesaltandlight.com` and
  `https://*.littlesaltandlight.pages.dev`, `Range` request header allowed.
- `_headers` CSP: `media-src` includes `https://media.littlesaltandlight.com`.
- The service worker only handles same-site requests, so videos from R2 stream straight from the
  network (range requests work; nothing large goes into the offline cache).

## Bedtime story audio (`/listen/<slug>`)

Bedtime story pages (`bedtimeStories` in `js/content.js`) play their narration from the same bucket, under
`audio/`. **Jonah now:** `audio/jonah-and-the-whale.fe8ea840.mp3` (v2 narration, 99.84 s, uploaded 27 Oct 2026).
Until the real file arrives an entry points at a small silent placeholder in
`media/audio/<name>-placeholder.mp3` and has `placeholder: true` (the page then shows a
"[PLACEHOLDER AUDIO]" note). To swap in the real narration:

1. `sha256sum jonah-and-the-whale-bedtime-story.mp3 | cut -c1-8` (e.g. `1a2b3c4d`).
2. Upload with `--content-type audio/mpeg --cache-control "public, max-age=31536000, immutable"` to
   `littlesaltandlight-media/audio/jonah-and-the-whale-bedtime-story.1a2b3c4d.mp3` (same command as above).
3. Check it with the same two `curl` lines (expect `content-type: audio/mpeg` and `206` for a range).
4. In `js/content.js`: `src: MEDIA_BASE + 'audio/jonah-and-the-whale-bedtime-story.1a2b3c4d.mp3'`, set `dur`
   to the length in seconds, remove `placeholder: true`, delete the placeholder file from `media/audio/`,
   and bump `VERSION` in `sw.js`. `media-src` in `_headers` already allows the R2 address.

### Bedtime story share image (cover)

Each story's share image (og:image, twitter:image, JSON-LD `image`) is set in one place: `image`,
`imageWidth`, `imageHeight` on its `bedtimeStories` entry in `js/content.js`. The file is committed in
`media/audio/` (small, served from the site so link previews never depend on R2). Jonah:
`media/audio/jonah-and-the-whale-cover.jpg`, 1200x630 JPEG. To swap it, replace the file (or point `image`
at a new one) and keep the width/height equal to the real size; `tests/listen-story.mjs` checks this.
Empty `image` falls back to the site's default share image.

## Read-along timings (bedtime stories)

The highlight on `/listen/<slug>` (current sentence in soft gold, current word underlined, tap a sentence to jump) reads one JSON file per story. **Single swap point:** `timings:` on the story in `js/content.js` (`bedtimeStories`), today `media/audio/jonah-and-the-whale-timings.json`.

Shape, times in seconds from the start of the audio, one entry per spoken sentence, in order:

```json
[{"text":"Hi, little light.","start":0.5,"end":2.24,"words":[{"text":"Hi,","start":0.5,"end":0.77}, …]}, …]
```

- Jonah's file is Audio Bot's word alignment of the v2 recording (24 spoken sentences; "Let’s pray." is spoken but is the heading, so 23 are highlighted). `npm run stub-timings -- <slug>` can write an evenly spread stub for a story that only has placeholder audio.
- Text and timings change together. When the narration is re-recorded: (1) update `story`, `prayer`, `goodnight` in `js/content.js` if the words changed, (2) swap the audio (`src`/`dur`, section above), (3) replace the timings file with real timings for that recording (e.g. a forced-alignment export converted to the shape above), keeping the same file name, or change `timings:` **and** the matching line in `sw.js` `SHELL` (the test checks they agree), (4) run `npm test`.
- Matching ignores case, punctuation and curly/straight quotes. Spoken lines that aren't on the page (e.g. "Let’s pray.") are skipped. A narration line may cover two shown sentences. If anything else doesn't line up (missing file, broken JSON, changed or missing sentence, times out of order), the page quietly stays plain text with no toggle. If only a sentence's words don't line up, that sentence still highlights without the word underline.
- Offline: `sw.js` precaches the timings file (SHELL), and it is also kept by the normal same-site cache. The file is served from the site, not R2, and nothing else is fetched.
- The on/off toggle is stored only on the device (`localStorage` `ll.readAlong`), never sent anywhere.
