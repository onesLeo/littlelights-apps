#!/usr/bin/env python3
"""Video thumbnails for Watch: 16:9 centre crops of each reel poster (media/reels/*-poster.jpg), the
way the cards show them (object-fit: cover), at 360 and 720 px wide, as AVIF and WebP, plus a WebP copy of the poster itself for the player.
The app picks the right one with <picture>/srcset; the JPEG poster stays as the fallback.
Run: python3 scripts/make-thumbs.py   (needs Pillow with AVIF and WebP support)"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parent.parent / 'media' / 'reels'
for poster in sorted(root.glob('*-poster.jpg')):
    im = Image.open(poster).convert('RGB')
    w, h = im.size
    ch = round(w * 9 / 16)
    top = (h - ch) // 2
    crop = im.crop((0, top, w, top + ch))
    base = poster.name[:-len('-poster.jpg')]
    for width in (360, 720):
        out = crop.resize((width, round(width * 9 / 16)), Image.LANCZOS) if width != w else crop
        out.save(root / f'{base}-thumb-{width}.avif', quality=55)
        out.save(root / f'{base}-thumb-{width}.webp', quality=78, method=6)
    # The player's poster (9:16, full size) as WebP too: about a third of the JPEG's weight.
    im.save(root / f'{base}-poster.webp', quality=78, method=6)
    print(poster.name, '->', base + '-thumb-{360,720}.{avif,webp}', base + '-poster.webp')
