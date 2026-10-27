# Little Light Studio

The Studio is the private area where the team writes and publishes posts. Visitors never sign in; only people on the team list can open it.

- **Address:** `/studio/` (for example `http://localhost:8080/studio/` when running locally)
- **Kinds of post:** Verse, Devotion, Audio, Reel, Game update
- **Publishing:** publish now, schedule for a date and time, or save a draft
- **Roles:** Owner (everything, including the team), Editor (writes, publishes and deletes), Contributor (writes drafts only)

## Two modes

| | Local mode | Supabase mode |
|---|---|---|
| Set up | Nothing. It is the default | Fill in `js/config.js` (below) |
| Where posts are saved | This browser only | The Supabase database, for everyone |
| Who sees posts | Only this browser’s copy of the app | Every visitor |
| Sign in | Email only; the first email becomes the owner | One-time email link, or Google |
| Uploaded audio and video | Stored in this browser (IndexedDB) | Supabase Storage, `media` bucket |

Local mode is for trying the Studio and for development. Use Supabase mode before sharing the app.

## Setting up Supabase (about 15 minutes)

1. **Create a project** at <https://supabase.com> (the free plan is enough to start). Pick a region close to your families.
2. **Create the tables, security rules and file storage.** Open *SQL Editor → New query*, paste the whole of `supabase/schema.sql`, and press *Run*.
3. **Make yourself the owner.** In the SQL Editor run, with your own email:
   ```sql
   insert into public.team_members (email, role) values ('you@example.com', 'owner');
   ```
4. **Turn on sign-in.** *Authentication → Sign In / Providers*:
   - **Email** is on by default (one-time links).
   - **Google** (optional): follow Supabase’s Google guide to create a Google OAuth client, then paste its ID and secret here.
5. **Allow the Studio address.** *Authentication → URL Configuration*: set **Site URL** to where the app is published, and add `https://your-domain/studio/` (and `http://localhost:8080/studio/` for local testing) to **Redirect URLs**.
6. **Connect the app.** *Project Settings → API*: copy the **Project URL** and the **anon public** key into `js/config.js`:
   ```js
   window.LL_CONFIG = {
     supabaseUrl: 'https://abcdefgh.supabase.co',
     supabaseAnonKey: 'eyJhbGciOi...'
   };
   ```
   The anon key is designed to be public. What anyone can do is decided by the security rules in `schema.sql`.
7. Bump `VERSION` in `sw.js`, publish, open `/studio/`, and sign in with your email.

## This project's database

The Studio is connected to the Supabase project **svlvlmyugyadmehjwudm** (region ap-northeast-2). `supabase/schema.sql` has been applied to it as the migration `little_light_studio`, and the security rules were checked with test accounts (visitor, owner, contributor, and a signed-in stranger) before the test data was removed.

The Supabase client library is bundled in `js/vendor/` (MIT licence), so the Studio does not load code from a CDN.

## How the security works

The rules live in the database (`supabase/schema.sql`), so they hold even if someone calls the database directly instead of using the Studio:

- Anyone can read posts that are **published, or scheduled and due**. Drafts and future posts are never sent to visitors.
- Only people in `team_members` can read drafts or upload files.
- Owners and editors can publish and delete. Contributors can only create and edit their **own drafts**.
- Only owners can add or remove team members, and an owner cannot remove themself.
- The helper functions the rules use live in a private schema, so the public API cannot call them.

Scheduled posts need no server job: a post appears as soon as its time has passed, because the app only asks for posts whose time is due.

## Editing and history

Published posts can be edited: open the post, change it and press **Update**. The app shows the new version on the next visit, at the same address.

Every change is kept in the post's **History** (under the form): created, edited, published, scheduled, moved to drafts and deleted, with who made the change and when. Open **changes** on a version to see what changed, before and after. **Restore this version** loads an older version into the form; nothing changes until you press **Update** or **Save draft**, and the restore itself becomes a new version, so no history is ever lost.

In Supabase mode the history is written by a database trigger (`post_revisions` in `supabase/schema.sql`), so it is kept even for changes made outside the Studio, and nobody can edit or delete it. The team can read it; visitors can't. A deleted post disappears from the Studio, but its last version stays in `post_revisions` and can be recovered from the SQL Editor. Only owners and editors can change a published or scheduled post; contributors see a note instead.

## Posts moved from the built-in content

The devotions, audio, reels and verses that used to live only in `js/content.js` are in the Studio as **drafts**. Until a draft is published, the app keeps showing the built-in version; once it is published, the Studio version takes its place (same address, for example `/read/brave`), so nothing is shown twice. These posts carry a hidden `builtin` field that links them to the original; the Studio keeps it when you edit the post.

## Writing tips built into the Studio

- The phone preview shows exactly how the post will look on the Today feed.
- Devotions support **bold** (`**text**`), _italic_ (`_text_`) and quotes (a paragraph starting with `> `). Leave an empty line between paragraphs.
- Verses keep their line breaks, so a passage can have one line per verse. Over 200 characters, the Today card shows the first lines with a **Read full passage** button, and the full passage opens in a scrolling view.
- Verse topics: pick one or add your own with **Add topic**. New topics get their own filter in the app's Verses tab.
- Translation: type any name. WEB, KJV, ASV and BSB are public domain. Copyrighted translations (NIV, ESV, NLT…) have their own quoting rules, so check them before posting.
- Audio and video lengths are read from the file. Files are limited to 50 MB.
- Posts marked **Show on the Today feed** appear at the top of Today (the newest five).

## Not yet built

- **Insights** (views, finished, saves, shares): designed in the Studio mockup; next step.
- A custom domain email for sign-in links (Supabase’s built-in email service has a low hourly limit; connect your own SMTP under *Authentication → Emails* before launch).

## Series and episodes

Reels can be grouped into a series (like a show). In the Studio's reel editor fill in **Series** (pick an
existing name from the list or type a new one) and **Episode #**. Optionally add a **Series description**.

- Stored as `fields.series` (text), `fields.episode` (number) and `fields.series_description` (text).
- Reels with the same series name form one series on the Watch page, ordered by episode number.
- Cover art: the first episode's art. Description: the first `series_description` found on any of the
  series' episodes, otherwise the first episode's caption.
- Reels without a series show as standalone cards. Built-ins in `js/content.js` take the same `series`
  and `episode` keys.
- Each episode plays on its own with one progress bar. The older `parts` field is no longer read.

## Bedtime stories

Studio → New post → **Bedtime story** makes a story that shows like the built-in Jonah and Elijah stories: its own page at `/listen/<slug>`, a row in the "Goodnight Little Light" section on /listen, read-along words, the prayer, the verse and three questions.

- **Narration**: an MP3 only (`audio/mpeg`, checked by its first bytes), up to 50 MB, so a full 6–15 MB mix is fine. Its length is read and saved. It is stored as `stories/<slug>.<hash>.mp3`. The name includes a hash of the content, so a new mix always gets a new address and can be cached for a year.
- **Timings**: the read-along JSON (`{ "words": [...], "sentences": [...] }`). It is checked before upload: times must go forward, sentences must not overlap, and nothing may end after the audio.
- **Cover** (optional): JPG, PNG or WebP, 1200×630 is best.
- **Publish date**: a date in Singapore time. The story stays hidden until 00:00 SGT that day (the database rule "Live posts are public" enforces this, as well as the app).

A story with the same slug as a built-in one replaces it from its publish date.

### One-time steps for Taman

1. Apply the migration `supabase/migrations/20261027120000_bedtime_story_posts.sql` (Supabase → SQL Editor, or `supabase db push`). It only widens the allowed post types to include `story`.
2. Optional: run `supabase/seed/20261027_elijah_story.sql` to add Elijah as a Studio story scheduled for Mon 9 Nov 2026 (00:00 SGT). It does nothing if a post with that slug already exists. Fix its audio first (see the TODO in the file).

## Daily rebuild

`.github/workflows/daily-rebuild.yml` runs every day at 05:00 SGT (21:00 UTC). It calls a Cloudflare Pages deploy hook, so the prerendered pages and sitemap pick up stories whose day has come. Before the rebuild, a newly due story still shows in the app, just without its prerendered page.

Setup (once):

1. Cloudflare dashboard → Workers & Pages → the project → Settings → Builds → **Deploy hooks** → Add, name it `daily-rebuild`, branch `main`. Copy the URL.
2. GitHub → the repo → Settings → Secrets and variables → Actions → New repository secret named `CF_PAGES_DEPLOY_HOOK`. Paste the URL there.
3. Actions → Daily rebuild → **Run workflow** to test it. A new deployment should appear in Cloudflare.

If the secret is missing, the workflow skips with a warning instead of failing. Treat the hook URL like a password: anyone who has it can start builds.
