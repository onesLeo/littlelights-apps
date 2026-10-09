#!/bin/sh
# Subset Bricolage Grotesque 800 (from the repository's fonts/) to printable ASCII plus the punctuation used on the site.
# Needs: pip install fonttools brotli
set -e
cd "$(dirname "$0")"
SRC=${1:-../fonts/bricolage-normal-800.woff2}
python3 -m fontTools.subset "$SRC" --unicodes="U+0020-007E,U+00A0,U+00A9,U+00B7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+203A" \
  --flavor=woff2 --layout-features='kern,liga' --output-file=static/fonts/bricolage-800-subset.woff2
ls -l static/fonts/bricolage-800-subset.woff2
