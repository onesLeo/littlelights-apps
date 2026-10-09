#!/usr/bin/env python3
"""Build the Little Light legal site: src/pages/*.html fragments + static/ -> public/.
Plain HTML and one CSS file. No JavaScript, no external requests."""
import shutil, pathlib, re, html

ROOT = pathlib.Path(__file__).parent
OUT = ROOT / "public"
LAST_UPDATED = "6 October 2026"
EMAIL = "customers-support@littlesaltandlight.com"

def ph(text):
    return f'<mark class="ph">[{text}]</mark>'

MACROS = {
    "EMAIL": f'<a class="email" href="mailto:{EMAIL}">{EMAIL}</a>',
    "EMAIL_PLAIN": EMAIL,
    "DEV": ph("Developer legal name"),
    "ADDR": ph("Postal address"),
    "AGE": "aged 5 to 8",
    "LAW": ph("Governing law, to confirm, e.g. Republic of Indonesia"),
    "SUPA_REGION": ph("Supabase project region, to confirm"),
    "MAILBOX": ph("Inbox provider, e.g. Gmail, to confirm"),
    "GAME_PERMS": "The version on Google Play asks for no permissions at all: it cannot use the internet.",
    "GAME_RESET": "Inside the game, the grown-ups area of the Faith Journal has a button that removes a child's name, journal and settings from the device.",
    "ML_TRACKING": ph("To confirm: turn MailerLite open and click tracking off, or keep this sentence"),
    "SUPPORT_HOURS": ph("Optional: support hours and time zone, e.g. Mon–Fri, WITA (UTC+8)"),
    "DEVICES": "It needs Android 10 or newer on a 64-bit device.",
    "EFFECTIVE": "6 October 2026",
    "UPDATED": LAST_UPDATED,
}

# path (folder, "" = root) | file name | nav key | title | description
PAGES = [
    ("", "index", "home", "Little Light: privacy, terms and support",
     "Privacy policies, terms of use, parents' notice and support for the Little Light Bible game and web app."),
    ("privacy", "privacy", "privacy", "Privacy Policy: Little Light game",
     "How the Little Light Bible game for children handles privacy: no personal data collected, no ads, no tracking."),
    ("privacy/web", "privacy-web", "privacy", "Privacy Notice: Little Light web app",
     "How the Little Light web app and newsletter handle personal data."),
    ("parents", "parents", "parents", "For parents and guardians: Little Light",
     "A plain-language privacy and safety summary of Little Light for parents and guardians."),
    ("terms", "terms", "terms", "Terms of Use: Little Light",
     "The simple terms for using the Little Light game and web app."),
    ("support", "support", "support", "Support and contact: Little Light",
     "Get help with Little Light, ask a privacy question, or request data deletion."),
]

NAV = [("privacy", "/privacy/", "Privacy"), ("parents", "/parents/", "Parents"),
       ("terms", "/terms/", "Terms"), ("support", "/support/", "Support")]

def nav(current):
    return "".join(
        f'<a href="{href}"{" aria-current=\"page\"" if key == current else ""}>{label}</a>'
        for key, href, label in NAV)

def page(body, title, desc, current, canonical):
    for k, v in MACROS.items():
        body = body.replace("{{" + k + "}}", v)
    left = re.findall(r"\{\{[A-Z_]+\}\}", body)
    assert not left, left
    canon = f'<link rel="canonical" href="https://legal.littlesaltandlight.com{canonical}">\n' if canonical else '<meta name="robots" content="noindex">\n'
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta name="theme-color" content="#fbf3dd">
{canon}<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/bricolage-800-subset.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/css/site.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top">
  <a class="brand" href="/"><img src="/favicon.svg" alt="" width="34" height="34">Little Light</a>
  <nav class="nav" aria-label="Main">{nav(current)}</nav>
</header>
<main id="main">
{body.strip()}
</main>
<footer>
  <nav aria-label="Footer"><a href="/">Home</a><a href="/privacy/">Game privacy</a><a href="/privacy/web/">Web app privacy</a><a href="/parents/">Parents</a><a href="/terms/">Terms</a><a href="/support/">Support</a></nav>
  <div>Little Light · {MACROS["DEV"]} · <a href="mailto:{EMAIL}">{EMAIL}</a></div>
  <div>Last updated {LAST_UPDATED}.</div>
  <div class="draft">Draft pending final review. Wording may change before launch.</div>
</footer>
</body>
</html>
"""

def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(ROOT / "static", OUT)
    for folder, name, current, title, desc in PAGES:
        body = (ROOT / "src" / "pages" / f"{name}.html").read_text()
        dest = OUT / folder / "index.html"
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(page(body, title, desc, current, f"/{folder}/" if folder else "/"))
    body = (ROOT / "src" / "pages" / "404.html").read_text()
    (OUT / "404.html").write_text(page(body, "Page not found: Little Light", "This page doesn't exist.", "", None))
    print("built", sorted(str(p.relative_to(OUT)) for p in OUT.rglob("*") if p.is_file()))

if __name__ == "__main__":
    main()
