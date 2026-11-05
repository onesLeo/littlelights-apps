#!/usr/bin/env python3
"""Video thumbnails for Watch: 16:9 centre crops of each reel poster (media/reels/*-poster.jpg), the
way the cards show them (object-fit: cover), at 360 and 720 px wide, as AVIF and WebP, plus a WebP copy of the poster itself for the player.
The app picks the right one with <picture>/srcset; the JPEG poster stays as the fallback.
Run: python3 scripts/make-thumbs.py   (needs Pillow with AVIF and WebP support)

Studio reel posters live on R2 (posts.fields->>'poster', for example
https://media.littlesaltandlight.com/reels/slice-of-life-ep01-exact-change-poster.7543b119.jpg) and are a
full-size JPEG (about 115 KB). Their phone-sized copies are made the same way into media/reels/studio/
(read-only: the poster is downloaded, nothing on R2 is changed) and listed in js/seo.js POSTER_COPIES:
  python3 scripts/make-thumbs.py --studio <poster URL> <name>
  e.g. python3 scripts/make-thumbs.py --studio https://media.littlesaltandlight.com/reels/slice-of-life-ep01-exact-change-poster.7543b119.jpg slice-of-life-ep01-exact-change"""
import io
import sys
import urllib.request
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / 'media' / 'reels'


def make(im, out_dir, base):
    im = im.convert('RGB')
    w, h = im.size
    ch = round(w * 9 / 16)
    top = (h - ch) // 2
    crop = im.crop((0, top, w, top + ch))
    for width in (360, 720):
        out = crop.resize((width, round(width * 9 / 16)), Image.LANCZOS) if width != w else crop
        out.save(out_dir / f'{base}-thumb-{width}.avif', quality=55)
        out.save(out_dir / f'{base}-thumb-{width}.webp', quality=78, method=6)
    # The player's poster (9:16, full size) as WebP too: about a third of the JPEG's weight.
    im.save(out_dir / f'{base}-poster.webp', quality=78, method=6)
    print(base, '->', base + '-thumb-{360,720}.{avif,webp}', base + '-poster.webp')


if len(sys.argv) == 4 and sys.argv[1] == '--studio':
    url, base = sys.argv[2], sys.argv[3]
    if not url.startswith('https://media.littlesaltandlight.com/reels/') or not url.endswith('.jpg'):
        sys.exit('only reel posters on media.littlesaltandlight.com')
    req = urllib.request.Request(url, headers={'User-Agent': 'littlelights-make-thumbs'})
    with urllib.request.urlopen(req) as r:
        im = Image.open(io.BytesIO(r.read()))
    out_dir = root / 'studio'
    out_dir.mkdir(exist_ok=True)
    make(im, out_dir, base)
else:
    for poster in sorted(root.glob('*-poster.jpg')):
        make(Image.open(poster), root, poster.name[:-len('-poster.jpg')])
