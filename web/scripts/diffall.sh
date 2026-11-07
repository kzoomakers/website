#!/bin/zsh
# Needs legacy site on :8080 (python3 -m http.server 8080 in repo root) and `npm run dev` on :3000.
# usage: scripts/diffall.sh <outdir> [results-file-to-resume-from]   -> prints "slug  pct" for every page in data/pages
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; D=${1:-/tmp/shots}; mkdir -p $D
cd "$(dirname $0)/.."
for f in data/pages/*.json; do s=$(basename $f .json)
  grep -q "^$s  " "${2:-/dev/null}" 2>/dev/null && continue  # resume: skip slugs already in results file ($2)
  for t in old:8080/$s.html new:3000/$s; do
    perl -e 'alarm 40; exec @ARGV' "$CH" --headless=new --disable-gpu --hide-scrollbars --window-size=1280,2400 --virtual-time-budget=6000 --screenshot=$D/$s.${t%%:*}.png http://localhost:${t#*:} >/dev/null 2>&1
  done
  echo "$s  $(node scripts/shotdiff.mjs $D/$s.old.png $D/$s.new.png 2>&1 | head -1)"
done
