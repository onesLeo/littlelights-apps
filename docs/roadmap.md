# Roadmap

## Next
1. **Feedback from testers**: share the app with 5–20 parents and church friends; ask which tab they would use most, how often, and what is missing.
2. **Real media**: record the first audio devotions and short reels; add them through `src` in `js/content.js`.
3. **Publish**: pick the domain, deploy to GitHub Pages or Cloudflare Pages, connect the domain.
4. **Newsletter**: connect the sign-up form to an email service (for example MailerLite or Kit) with an adults-only notice.
5. **Privacy-friendly analytics** on the website only (for example Plausible or Cloudflare Web Analytics): tab use, audio plays, articles read to the end, sign-ups. Never track children.

## Later
- **One Markdown file per post** instead of `js/content.js`, with a small build step (for example Astro) so posting stays quick.
- **Store listings** from the same code with PWABuilder: Google Play (Trusted Web Activity) and Microsoft Store. Apple's App Store only once there are native features, because "website in a wrapper" apps are often rejected.
- **Gentle notifications** for "New devotion this week" (opt-in, adults).
- **More languages**, starting with the families who ask for them.
