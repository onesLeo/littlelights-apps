# Backlog

Work to do before and after launch, in order. **Owner** says who does it: *You* for purchases, accounts and settings only the ministry can make; *Dev* for changes in this repository. When an item is finished, set its **Status** to *Done* with the date.

Big-picture goals live in [roadmap.md](roadmap.md); finished work is listed in [improvements.md](improvements.md).

## 1. Domain and email (do first: everything else depends on it)

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 1.1 | **Buy the domain** (for example at Cloudflare or Namecheap, about $10–15 a year). Pick one short name for both the website and email. Turn on auto-renew. | You | – | The domain is in the ministry's account, with at least two people able to log in | To do |
| 1.2 | **Create the email addresses** on the domain: `hello@` (newsletter sender, replies from parents) and `no-reply@` (Studio sign-in links). Cloudflare Email Routing forwards them to an existing inbox for free; Zoho Mail or Google Workspace give a full mailbox. | You | 1.1 | A test email to `hello@` arrives | To do |
| 1.3 | **Add a DMARC record** to the domain's DNS (start with `p=none`), so mail providers trust email from it. | You (Dev can list the exact record) | 1.1 | A DMARC checker shows the record | To do |

## 2. Newsletter (MailerLite)

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 2.1 | **Create a MailerLite account** with `hello@` as the login. Apply for the nonprofit discount if the ministry qualifies. | You | 1.2 | Account is active | To do |
| 2.2 | **Verify the domain in MailerLite**: copy the SPF and DKIM records it shows into the domain's DNS. | You | 1.1, 2.1 | MailerLite shows the domain as verified | To do |
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

## 4. Publishing the website

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 4.1 | **Deploy the site** with the GitHub Pages workflow (Settings → Pages → Source: GitHub Actions, then run *Deploy to GitHub Pages*), or Cloudflare Pages. | You / Dev | – | The app opens at the Pages address | To do |
| 4.2 | **Trim the deploy list** in `.github/workflows/pages.yml`: publish `studio`, but not `docs` or `supabase`, which visitors don't need. | Dev | – | Workflow updated | To do |
| 4.3 | **Connect the domain** to the site, with HTTPS. | You | 1.1, 4.1 | The app opens at `https://your-domain/` | To do |
| 4.4 | **Update Supabase URLs**: *Authentication → URL Configuration*, Site URL = the domain, and add `https://your-domain/studio/` to Redirect URLs. | You | 4.3 | Signing in on the live Studio returns to the Studio | To do |
| 4.5 | **Bump `VERSION` in `sw.js`** with each release so installed copies update. | Dev | – | Ongoing | To do |

## 5. Content

| # | Item | Owner | Depends on | Done when | Status |
|---|---|---|---|---|---|
| 5.1 | **Fix the Ephesians 6:10–18 post**: its text is the NIV but it is labelled WEB. Relabel it, or replace it with the WEB text (public domain). Copyrighted translations need the publisher's notice and quoting limits. | You | – | Label matches the text | To do |
| 5.2 | **Record the first audio devotions and reels** and upload them in the Studio. | You | – | – | To do |

## 6. Later

- **Insights** in the Studio: views, finished, saves and shares per post (roadmap).
- **Tester feedback**: share with 5–20 parents and church friends (roadmap).
- **Privacy-friendly analytics** on the website only, never tracking children (roadmap).
- **Gentle notifications** for new posts, opt-in, adults only (roadmap).
