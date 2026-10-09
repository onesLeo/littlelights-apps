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
   Then create your own sign-in: *Authentication → Users → Add user → Send invitation* (or *Create new user* with *Auto Confirm User* ticked). The Studio never creates accounts by itself (see "Adding someone to the team").
4. **Turn on sign-in.** *Authentication → Sign In / Providers*:
   - **Email** is on by default (one-time links).
   - Turn **off** *Allow new users to sign up*. The Studio's email link already refuses unknown emails; this also stops "Continue with Google" from creating accounts for strangers. Invited users can still sign in.
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

## Adding someone to the team

Nobody can create a Studio account by themself: the email link is only sent to people who already have one (`shouldCreateUser: false` in `js/store.js`), and anyone else sees "This email isn’t on the Little Light team". So adding a person takes two steps:

1. In the Studio, **Team → Add to team** with their email and role. This decides what they may do.
2. In Supabase, **Authentication → Users → Add user → Send invitation** with the same email. This creates their sign-in. (Supabase's invitation email opens the main site; after that they open `/studio/` and are signed in, or sign in with the email link.)

To remove someone, press **Remove** in the Studio (they lose access at once), then delete their user under *Authentication → Users*.

## Visitors can't see who wrote a post

The app asks the database only for the columns it shows (never `author_email`), and the migration `supabase/migrations/20261009120000_hide_author_email.sql` takes away the anonymous key's right to read that column at all, so it can't be read with a direct API call either. Team members still see it. Run that file once in the SQL Editor after the app update that contains it is live.

## How the security works

The rules live in the database (`supabase/schema.sql`), so they hold even if someone calls the database directly instead of using the Studio:

- Anyone can read posts that are **published, or scheduled and due**. Drafts and future posts are never sent to visitors, and visitors can't read who wrote a post (`author_email`).
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

The devotions, audio, reels and verses that used to live only in `js/content.js` are in the Studio as **drafts**. Until a draft is published, the app keeps showing the built-in version; once it is published, the Studio version takes its place (same address, for example `#read/brave`), so nothing is shown twice. These posts carry a hidden `builtin` field that links them to the original; the Studio keeps it when you edit the post.

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
