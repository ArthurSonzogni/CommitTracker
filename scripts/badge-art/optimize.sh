#!/bin/bash
# Downscale the generated images to 512x512 WebP into public/img/badges/.
set -euo pipefail
cd "$(dirname "$0")"
for input in out/*.png out/*.jpg; do
  [[ -f "$input" ]] || continue
  name="$(basename "$input")"
  output="../../public/img/badges/${name%.*}.webp"
  magick "$input" -resize 512x512^ -gravity center -extent 512x512 -quality 82 "$output"
done
du -ch ../../public/img/badges/*.webp | tail -1
