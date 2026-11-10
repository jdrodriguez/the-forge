#!/bin/sh
# Renders the PNGs that manifest.webmanifest and page.html name, and forge.icns for the herald's notifier app, from
# icon.svg and maskable.svg. Run it after changing either one. Needs rsvg-convert (brew install librsvg) and, for the
# .icns, a Mac (iconutil).
set -e
cd "$(dirname "$0")"
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 512 -h 512 maskable.svg -o maskable-512.png
# iOS only rounds the corners, so its icon is the full-bleed art cropped in a little closer.
rsvg-convert -w 204 -h 204 --page-width 180 --page-height 180 --left=-12 --top=-12 maskable.svg -o apple-touch-icon.png
# The Mac icon keeps Apple's margin: the tile fills 824 of every 1024 pixels, centered.
set_dir=$(mktemp -d)/forge.iconset
mkdir "$set_dir"
for size in 16 32 128 256; do
  for scale in 1 2; do
    px=$((size * scale)); tile=$((px * 824 / 1024)); off=$(((px - tile) / 2))
    name="icon_${size}x${size}"; [ "$scale" = 2 ] && name="${name}@2x"
    rsvg-convert -w "$tile" -h "$tile" --page-width "$px" --page-height "$px" --left="$off" --top="$off" icon.svg -o "$set_dir/$name.png"
  done
done
iconutil -c icns "$set_dir" -o forge.icns
rm -r "$(dirname "$set_dir")"
