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

## How the security works

The rules live in the database (`supabase/schema.sql`), so they hold even if someone calls the database directly instead of using the Studio:

- Anyone can read posts that are **published, or scheduled and due**. Drafts and future posts are never sent to visitors.
- Only people in `team_members` can read drafts or upload files.
- Owners and editors can publish and delete. Contributors can only create and edit their **own drafts**.
- Only owners can add or remove team members, and an owner cannot remove themself.

Scheduled posts need no server job: a post appears as soon as its time has passed, because the app only asks for posts whose time is due.

## Writing tips built into the Studio

- The phone preview shows exactly how the post will look on the Today feed.
- Devotions support **bold** (`**text**`), _italic_ (`_text_`) and quotes (a paragraph starting with `> `). Leave an empty line between paragraphs.
- Audio and video lengths are read from the file. Files are limited to 50 MB.
- Posts marked **Show on the Today feed** appear at the top of Today (the newest five).

## Not yet built

- **Insights** (views, finished, saves, shares): designed in the Studio mockup; next step.
- A custom domain email for sign-in links (Supabase’s built-in email service has a low hourly limit; connect your own SMTP under *Authentication → Emails* before launch).
