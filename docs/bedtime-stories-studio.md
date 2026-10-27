# Bedtime stories in the Studio

A bedtime story is a Studio post of type **Bedtime story** (`posts.type = 'story'`). It gets its own page at
`/listen/<title>-bedtime-story` with the audio, the story text with read-along highlighting, the Bible
verse, the prayer, three questions and a "Coming next" card. Like every post it goes live by itself when
its publish time passes: no pull request, no merge.

## Publishing one
1. Studio → **New post** → **Bedtime story**.
2. **Title, series, episode, one-line description.** Series with "Bible" in the name are labelled
   "Bedtime Bible story"; others (Goodnight Little Light) "Bedtime story".
3. **Narration:** upload the finished MP3 (up to 50 MB), or paste a link to a file that is already online
   (for example `https://media.littlesaltandlight.com/audio/<name>.<hash>.mp3` on R2). The length is read
   from an uploaded file; type it for a link.
4. **The story:** exactly what the narrator says before "Let's pray", without the `[tags]`, an empty line
   between paragraphs. Then the verse, reference and translation, the prayer, the goodnight line and three
   questions (one per line). A "word to know" is optional.
5. **Read-along timings (optional):** upload the `.json` made by `tools/build_timings.py` (littlelights-growth).
   The Studio checks it against the story text, prayer and goodnight line with the site's own matcher and
   says how many sentences line up. If it doesn't match, it is refused, so fix the text first. If you edit
   the text later, upload the timings again.
6. **Schedule** (for example Monday 18:00) or **Publish now**.

## What happens behind the scenes
- `js/seo.js` `storyFromPost()` turns the post into the same shape as `js/content.js` `bedtimeStories`, and
  `mergeStories()` adds Studio stories to the built-in ones (same slug replaces the built-in story).
- The app (`js/app.js`), the build (`scripts/prerender.mjs`) and the Pages Function
  `functions/listen/[slug].js` (`lib/edge.mjs`) all use it, so a story published after the last build still
  gets its full page for visitors and search engines, and `/sitemap.xml` lists it.
- Files uploaded in the Studio go to the Supabase `media` bucket (public). Audio can also stay on R2.

## One-time database change
`supabase/migrations/20261027120000_story_posts.sql` allows the new post type. It is purely additive.
