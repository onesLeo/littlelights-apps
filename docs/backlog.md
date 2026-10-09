# Backlog

Work to do before and after launch, in order. The domain is **littlesaltandlight.com** (Cloudflare); `your-domain` below means that. **Owner** says who does it: *You* for purchases, accounts and settings only the ministry can make; *Dev* for changes in this repository. When an item is finished, set its **Status** to *Done* with the date.

Big-picture goals live in [roadmap.md](roadmap.md); finished work is listed in [improvements.md](improvements.md).

## Placeholders still in the app

These look finished but don't work yet. Each one points to the item that fixes it.

| Feature | What happens now | Fixed by |
|---|---|---|
| Newsletter "Join the list" (computer side panel) | Shows a thank-you message; the email is not saved | 2.5, 2.6 |
| Built-in audio in Listen | Progress bar moves with no sound ("Recording coming soon") | 5.2 |
| Built-in reels in Watch | Animated drawings instead of video | 5.2 |
| "Play the free preview" (Play tab, game updates) | Shows "opens here once the browser build is published" | 6.1 |
| App Store / Google Play (Play tab) | "Coming soon" text, not links | 6.2 |
| "Continue with Google" (Studio sign-in) | Hidden until Google is set up in Supabase | 3.4 |
| Studio sign-in emails | Supabase's built-in sender, a few emails an hour | 3.1, 3.2 |

## 1. Domain and email (do first: everything else depends on it)

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 1.1 | **Buy the domain** (for example at Cloudflare or Namecheap, about $10–15 a year). Pick one short name for both the website and email. Turn on auto-renew. | You | – | The domain is in the ministry's account, with at least two people able to log in | Done 2026-09-28: **littlesaltandlight.com** on Cloudflare |
| 1.2 | **Create the email addresses** on the domain: `news-letter@` (MailerLite/newsletter), `no-reply@` (informational messages), `customers-support@` (customer support), and `feedback@` (feedback). Route reply-handling addresses to the owner's Gmail inbox. | You | 1.1 | Test emails to the forwarding addresses arrive in Gmail; `no-reply@` inbound behavior is intentional | In progress: Cloudflare Email Routing is ready and has enabled rules for all four addresses. `news-letter@`, `customers-support@`, and `feedback@` forward to Gmail; `no-reply@` drops inbound mail. Test delivery to the three forwarding addresses. |
| 1.3 | **Add a DMARC record** to the domain's DNS (start with `p=none`), so mail providers trust email from it. | You (Dev can list the exact record) | 1.1 | A DMARC checker shows the record | Done 2026-09-28: Cloudflare DNS has `_dmarc.littlesaltandlight.com` with `v=DMARC1; p=none;`. |

## 2. Newsletter (MailerLite)

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 2.1 | **Create a MailerLite account** with `news-letter@littlesaltandlight.com` as the login. Apply for the nonprofit discount if the ministry qualifies. | You | 1.2 | Account is active | Done 2026-09-28: MailerLite account is active. Nonprofit discount application is optional. |
| 2.2 | **Verify the domain in MailerLite**: copy the SPF and DKIM records it shows into the domain's DNS. | You | 1.1, 2.1 | MailerLite shows the domain as verified | Done 2026-09-28: MailerLite shows `littlesaltandlight.com` as Authenticated. |
| 2.3 | **Create the list and sign-up form**: a group called "Weekly encouragement", **double opt-in on**, and the ministry's postal address in the footer (required by law). Send the form's embed or action URL to Dev. | You | 2.1 | A test sign-up receives the confirmation email | To do |
| 2.4 | **Design the Monday email template**: verse, devotion teaser with a link to the app, family idea, prayer, unsubscribe footer. Use the app's colours and logo. | You | 2.1 | A test email looks right on a phone and a computer | To do |
| 2.5 | **Connect the app's form to MailerLite** (`js/app.js`, "newsletter"): send sign-ups to the list, say "Check your inbox to confirm", keep the "For grown-ups" note, handle errors and offline. | Dev | 2.3 | A sign-up from the app appears in MailerLite after confirming | To do |
| 2.6 | **Show the sign-up on phones**: today it is only in the computer side panel. Add it to the end of the Today feed or the Read tab. | Dev | 2.5 | The form is reachable on a 375px-wide screen | To do |
| 2.7 | **Update the privacy note** in the app and README: what the email is used for, the service that stores it, how to unsubscribe. | Dev | 2.5 | Text is live | To do |
| 2.8 | **Later:** build the Monday email automatically from the week's Studio posts (RSS feed, or a MailerLite RSS campaign). May need a paid plan. | Dev | 2.4, 4.1 | – | To do |

## 3. Studio sign-in email

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 3.1 | **Pick an email sender (SMTP) for Supabase**, for example Brevo or Resend (free tiers), and verify the domain there. MailerLite's newsletter account does not provide SMTP. | You | 1.1 | Sender shows the domain as verified | To do |
| 3.2 | **Connect it in Supabase**: *Authentication → Emails → SMTP settings*, sender `no-reply@`, name "Little Light". Supabase's built-in email only allows a few messages an hour. | You (Dev can guide) | 3.1 | A sign-in link arrives from `no-reply@` | To do |
| 3.3 | **Word the sign-in email** in *Authentication → Emails → Templates* (Magic Link) in the app's voice. | You / Dev | 3.2 | – | To do |
| 3.4 | **Set up "Continue with Google"**: create an OAuth client in Google Cloud Console with the redirect URI `https://svlvlmyugyadmehjwudm.supabase.co/auth/v1/callback`, then paste its ID and secret in Supabase under *Authentication → Sign In / Providers → Google*. The button is hidden until this is configured. | You (Dev can guide) | 4.3 for the live address | A team member signs in with Google and lands in the Studio | In progress: Google sign-in is disabled and its button is hidden; OAuth setup remains |

## 4. Publishing the website

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 4.1 | **Deploy the site** with the GitHub Pages workflow (Settings → Pages → Source: GitHub Actions, then run *Deploy to GitHub Pages*), or Cloudflare Pages. | You / Dev | – | The app opens at the Pages address | Done 2026-10-09: Cloudflare Pages project `littlelights-apps`, live at https://littlelights-apps.pages.dev (checked in a browser: app, Studio page, fonts, offline mode) |
| 4.2 | **Trim the deploy list** in `.github/workflows/pages.yml`: publish `studio`, but not `docs` or `supabase`, which visitors don't need. | Dev | – | Workflow updated | Done 2026-09-28: both hosting paths use `scripts/build-pages.mjs`, which omits `docs` and `supabase`. |
| 4.3 | **Connect the domain** to the site, with HTTPS. | You | 1.1, 4.1 | The app opens at `https://your-domain/` | Done 2026-10-09: https://littlesaltandlight.com is live with HTTPS (`www` is not set up) |
| 4.4 | **Update Supabase URLs**: *Authentication → URL Configuration*, Site URL = the domain, and add `https://your-domain/studio/` to Redirect URLs. | You | 4.3 | Signing in on the live Studio returns to the Studio | To do |
| 4.5 | **Bump `VERSION` in `sw.js`** with each release so installed copies update. | Dev | – | Ongoing | To do |

## 5. Content

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 5.1 | **Fix the Ephesians 6:10–18 post**: its text is the NIV but it is labelled WEB. Relabel it, or replace it with the WEB text (public domain). Copyrighted translations need the publisher's notice and quoting limits. | You | – | Label matches the text | To do |
| 5.2 | **Record the first audio devotions and reels** and upload them in the Studio. | You | – | – | To do |

## 6. The game

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 6.1 | **Publish the free preview**: export the Godot game for the web, host it (for example on itch.io or next to the site), and set `gamePreviewUrl` in `js/content.js`. | You / Dev | Game build | "Play the free preview" opens the game | To do |
| 6.2 | **Store listings**: package the app with PWABuilder, Google Play first (Microsoft Store next; Apple only once there are native features). Replace the "coming soon" text with real store links. | You / Dev | 4.3 | The Play tab links to a live listing | To do |
| 6.3 | **Journey map**: make finished journeys open the game or their story once the game is published. | Dev | 6.1 | – | To do |

## 7. App improvements

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 7.1 | **Keep Studio posts offline**: save the last posts the app loaded, and show them when there's no connection or Supabase takes over 4 seconds. Tested in `tests/offline.mjs`. | Dev | – | Studio posts show in airplane mode after one online visit | Done 2026-09-27 |
| 7.2 | **Move the built-in content into the Studio**, so every devotion, verse, audio and reel is edited in one place instead of `js/content.js`. Copies were added to Supabase as drafts (2026-09-27); each one replaces its built-in item as soon as it is published. **Next:** review and publish them in the Studio, then Dev removes the posts from `content.js` (the journeys and `gamePreviewUrl` stay). | You, then Dev | – | `content.js` holds no posts | In progress |

## 8. Instagram and Facebook

One post in the Studio, two outputs: the app keeps its own format, and the Studio also makes a version that follows Instagram's and Facebook's rules.

| Post type | Instagram / Facebook version |
|---|---|
| Verse | 1080×1350 JPEG (4:5), from the existing verse image |
| Devotion | Carousel of 2–4 images (title, key verse, family idea, prayer) and a caption linking to the full reading |
| Reel | 1080×1920 MP4 (9:16), the same file |
| Audio | Video with a cover image (Instagram has no audio posts); later |
| Game update | Image and caption |

Captions are built from the post: text, reference and translation, a link back to the app, a few hashtags (Instagram allows 2,200 characters and 30 hashtags). Check Meta's current specs when building.

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 8.1 | **Share kit in the Studio**: for each post, download the Instagram-ready image(s) and copy the ready caption. Post or schedule to both Instagram and Facebook with Meta Business Suite (free). No API or Meta approval needed. | Dev | – | A verse and a devotion can be posted to Instagram from the kit | To do |
| 8.2 | **Accounts**: an Instagram professional account (Business or Creator) and a Facebook Page for the ministry, linked in Meta Business Suite. | You | – | Both accounts exist, with at least two admins | To do |
| 8.3 | **Post automatically from the Studio** with Meta's API: an "Also post to Instagram / Facebook" choice. Needs a Meta developer app, Meta's app review (asks for a privacy policy on the domain), a Supabase Edge Function to keep the Meta key secret, and a timed job for scheduled posts (the Instagram API can't schedule). | You / Dev | 1.1, 4.3, 8.1, 8.2 | A Studio post appears on Instagram and Facebook without manual steps | To do |

## 9. Later

- **Insights**: done 2026-10-09 (visitors per day, time per menu, opens, plays, saves and shares per post; anonymous counts). Still open: how many people finish a devotion or recording, and removing counts older than a year.
- **Tester feedback**: share with 5–20 parents and church friends (roadmap).
- **Privacy page**: a short page in the app that says what is counted and why (the README and docs/studio.md explain it today).
- **Gentle notifications** for new posts, opt-in, adults only (roadmap).
