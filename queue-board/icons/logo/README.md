# The Forge's logo: The Anvil Door

A shining silver arch on pillars, an anvil in outline, five stars and one ember spark, on deep night. It is original
art in the manner of Middle-earth's door emblems, chosen on 2026-11-11.

| File | What it is |
|---|---|
| `the-anvil-door.svg` | The master artwork, 512 by 512 on a rounded tile. Paths and gradients only, so any renderer draws it |
| `the-anvil-door.vectorcraft` | The editable source, in VectorCraft's own format |
| `the-anvil-door-1024.png` | A 1024 pixel render, for anywhere that wants a picture |

## How the board uses it

The files the board serves sit one folder up, and all come from this artwork:

- `../icon.svg` is the same drawing with a comment at the top. The browser tab and the sidebar use it.
- `../maskable.svg` is the drawing without the rounded corners and at 80% size, for launchers that cut their own shape.
- `../build.sh` renders the PNG sizes, the touch icon and `forge.icns` (the notifier's Mac icon) from those two.

## Changing it

1. Edit `the-anvil-door.vectorcraft` in VectorCraft and export the SVG over `the-anvil-door.svg`.
2. Put the new drawing into `../icon.svg` and `../maskable.svg` (keep their comments, and keep the 80% scale in the second).
3. Run `../build.sh`.
4. Run `../../install-herald.sh` so the notifier takes the new Mac icon, and raise `CACHE` in `../../sw.js` by one so
   installed apps take the new files.
