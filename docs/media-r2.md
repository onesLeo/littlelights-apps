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
