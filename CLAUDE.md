# Instructions for Claude (same as AGENTS.md)

1. **The project's main checklist is [`ACTION-PLAN.md` in littlelights-growth](https://github.com/onesLeo/littlelights-growth/blob/main/ACTION-PLAN.md).** Read it before you start; when you finish website, Studio or database work, update its item (☑ with date and PR link) and its Done log there too.
2. Use the item ID (for example `A10`) in commit messages and pull request titles.
3. How the Studio, bedtime stories, printables and download counts work: [`docs/studio.md`](docs/studio.md). Media on R2: [`docs/media-r2.md`](docs/media-r2.md).
4. Every site change goes on a preview (pull request) first; Taman merges. Database changes: put the SQL in `supabase/migrations/` or `supabase/seed/`, show it, and say what it does and doesn't touch before anyone runs it.
5. Run `npm test` (Playwright). After changing a cached file, bump `VERSION` in `sw.js` (and the check in `tests/video.mjs`); after changing `css/app.css`, run `npm run critical`.
6. House rules: kid-safe, no tracking pixels or third-party scripts on public pages, Scripture quoted exactly (WEB/WEBBE), no children's faces.
