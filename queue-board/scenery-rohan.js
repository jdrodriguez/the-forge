// scenery-rohan.js: Rohan's tent and pennant in the Middle-earth view, in 32-bit (a quarter unit a pixel), in the same
// place and size as before: a peaked tent of green and white gores that meet at its pole, lit on its left and shaded to
// its right, a valance with a gold trim and a scalloped hem, an open flap at the front, guy ropes to pegs, and the pole
// rising above it with a gold cap; and on the pole a pennant that ripples and flies the way the wind blows.
// scenery-land.js paints the tent into the realm's layer (landStill) and draws the pennant each frame (drawRealm). Loaded
// right after scenery-land-qd.js.

// Rohan's tent, pixel by pixel: green and white gores meeting at the pole, lit on the left and shaded to the right,
// a lit roofline, a valance with a gold trim and a scalloped hem, and an open flap at the front.
const TENT_W = ['#fffdf6', '#f3ecdc', '#dccfb4', '#b9a888'];
const TENT_G = ['#7cbc5e', '#57984a', '#3f7a3a', '#2c5d2e'];
function rohanTent(g, cx) {
  const c = cx + 0.5;
  qdPut(g, qdPixels(21, 10.25, (x, y, i, j) => {
    const [X, Y] = [cx - 10 + x + 0.125, GROUND_Y - 8 + y + 0.125];
    const dx = X - c;
    const top = Math.round((GROUND_Y - 8 + 6 * (Math.abs(dx) / 10) ** 0.85) * 4) / 4;
    const wall = Math.abs(dx) <= 8.5;
    if (Math.abs(dx) > 10 || Y < top || Y >= (wall ? GROUND_Y + 2 : GROUND_Y - 1.5)) return null;
    if (Y > GROUND_Y - 1) {
      const half = (Y - GROUND_Y + 1.25) * 0.62;
      if (Math.abs(dx) < half) return Y > GROUND_Y + 1.5 ? '#24180f' : '#3a2a1c';
      if (Math.abs(dx) < half + 0.3) return dx < 0 ? TENT_W[0] : TENT_W[2];
    }
    const q = (dx / Math.max(0.5, Math.min(6, Y - (GROUND_Y - 8)))) * 2.2 + 10;
    const R = Math.floor(q) % 2 ? TENT_G : TENT_W;
    const shade = 1 + dx / 7 + (Y > GROUND_Y - 1 ? 0.4 : 0);
    let k = Math.round(shade);
    if (q - Math.floor(q) < 0.07) k += 1;
    if (Y - top < 0.25) return dx < 0 ? R[0] : R[3];
    if (Y >= GROUND_Y - 2 && Y < GROUND_Y - 1) {
      const u = (((X - c) % 1) + 1) % 1;
      if (Y < GROUND_Y - 1.75) return (i & 3) === 1 ? '#fff1a8' : '#d9a53a';
      if (Y < GROUND_Y - 1.5 || Y - (GROUND_Y - 1.5) < 0.5 * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2))) return TENT_G[Math.max(0, Math.min(3, k))];
    }
    if (wall && Y > GROUND_Y + 1.75) return R[3];
    return R[Math.max(0, Math.min(3, k))];
  }), cx - 10, GROUND_Y - 8);
  pxBox(g, cx - 9, GROUND_Y + 2, 19, 0.25, landSteps('man')[0]);
  for (const [ax, bx] of [[cx - 9.5, cx - 11], [cx + 10.25, cx + 11.75]]) {
    for (let k = 0; k <= 16; k += 1) qdDot(g, Math.round((ax + ((bx - ax) * k) / 16) * 4) / 4, Math.round((GROUND_Y - 1.75 + k / 4) * 4) / 4, k % 2 ? '#7d6c4c' : '#a8966c');
    pxBox(g, bx - 0.25, GROUND_Y + 1.75, 0.5, 0.75, SHIRE_WOOD[3]);
    qdDot(g, bx - 0.25, GROUND_Y + 1.75, SHIRE_WOOD[1]);
  }
  [SHIRE_WOOD[1], SHIRE_WOOD[2], SHIRE_WOOD[3], SHIRE_WOOD[4]].forEach((c, k) => pxBox(g, cx + k / 4, GROUND_Y - 15, 0.25, 7.25, c));
  pxBox(g, cx + 0.25, GROUND_Y - 15.75, 0.5, 0.25, PAV_GOLD[1]);
  pxBox(g, cx, GROUND_Y - 15.5, 1, 0.5, PAV_GOLD[2]);
  qdDot(g, cx + 0.25, GROUND_Y - 15.5, PAV_GOLD[0]);
}
// The pennant on the pole: five units long, tapering to a forked tail, with a white sun near the pole; ripples run
// down it (faster in a gust) and each column is lit or shaded by how it faces, and it flies the way the wind blows.
function rohanPennant(g, cx, tick) {
  const wind = landWind();
  const lean = wind?.at(cx, tick) ?? 0.5;
  const left = (wind?.dir ?? 1) < 0;
  const ph = tick * (0.5 + Math.abs(lean)) * 0.9;
  const [L, B, S, O] = ['#7cc060', '#3f8a3a', '#2c6a30', '#1b4421'];
  for (let k = 0; k < 20; k += 1) {
    const u = k / 20;
    const y0 = Math.round((GROUND_Y - 14.5 + Math.sin(u * 5 - ph) * u * 0.7) * 4) / 4;
    const h = Math.round(2.5 * (1 - u * 0.45) * 4) / 4;
    const slope = Math.cos(u * 5 - ph);
    const body = slope > 0.35 ? L : slope < -0.35 ? S : B;
    const x = left ? cx - 0.25 - k / 4 : cx + 1 + k / 4;
    const gap = u > 0.75 ? Math.round((u - 0.75) * 3.2 * 4) / 4 : 0;
    const mid = y0 + Math.round((h / 2) * 4) / 4;
    for (const [a, b] of gap ? [[y0, mid - gap], [mid + gap, y0 + h]] : [[y0, y0 + h]]) if (b > a) pxBox(g, x, a, 0.25, b - a, body);
    qdDot(g, x, y0, hdMix(body, '#ffffff', 0.3));
    qdDot(g, x, y0 + h - 0.25, O);
    if (k >= 2 && k <= 4) pxBox(g, x, mid - (k === 3 ? 0.5 : 0.25), 0.25, k === 3 ? 0.75 : 0.5, '#f5f1e6');
  }
}
