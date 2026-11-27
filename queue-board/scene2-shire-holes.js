// scene2-shire-holes.js: the hobbit holes on the map from above, set into the stone faces scene2-shire-hill.js cuts in
// the Shire's hills. Each has a round door of painted planks (green, yellow, red, blue or plum) in a ring of timber and
// stone with a brass knob in its very middle and a half-moon doorstep below it, round windows with crossed glazing bars
// either side, each over a box of flowers, a lantern on a post by the door, and a stone chimney with a pot poking up
// through the turf above. Some have a little porch roof over the door, a bench, or a water butt. Holes at a hill's foot
// have a white picket fence along the front of their garden with the gate standing open; Bag End's yard has its own
// gate at the head of its path. Everything is drawn onto the hills' canvas (it is baked with them), and each hole gives
// back where its lights and smoke go. People are 20 units tall, so a door is about 9 units tall.

const M2_SHIRE_PAINT = {
  green: ['#173a1e', '#24502a', '#2f6a34', '#3f8a44', '#5aa65a', '#8acb7a'],
  yellow: ['#5a3e0c', '#8a6214', '#b0841e', '#cc9c2e', '#e8bc4c', '#fbe08a'],
  red: ['#3e1210', '#64201a', '#8a2e22', '#ad4232', '#cc5e48', '#e88e70'],
  blue: ['#141f3a', '#1f3258', '#2c4a7a', '#3c629a', '#5a80b8', '#8eaedc'],
  plum: ['#2a1226', '#46203e', '#5e2e54', '#7a406c', '#9a5a8a', '#c48ab4'],
};
const M2_SHIRE_DOORART = new Map();

// A round door d units across, cut flat at its foot, painted from ramp P: planks lit on the left, a ring of oak and a
// ring of stones round it, iron hinge straps, and the brass knob in the middle. Painted once per size and colour.
function m2ShireDoorArt(d, P) {
  const key = `${d}${P[2]}`;
  if (M2_SHIRE_DOORART.has(key)) return M2_SHIRE_DOORART.get(key);
  const R = (d / 2 + 1.5) * 4;
  const cut = Math.round(R + (d / 2) * 4 * 0.8);
  const { c, g } = m2Canvas(R / 2, cut / 4);
  const W = M2_PAL.wood;
  const St = M2_PAL.stone;
  m2Raster(g, 0, 0, R * 2, cut, (px, py) => {
    const [dx, dy] = [px + 0.5 - R, py + 0.5 - R];
    const r = Math.hypot(dx, dy);
    if (r > R) return null;
    if (r > R - 5) {
      const seg = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (2 * Math.PI)) * 22);
      const lit = dx + dy < 0;
      if (r > R - 1) return St[0];
      return Math.abs(r - (R - 5)) < 1 || (seg % 2 === 0 && (Math.atan2(dy, dx) * 22) % 1 < 0.1) ? St[1] : St[lit ? (seg % 3 ? 4 : 5) : seg % 3 ? 2 : 3];
    }
    if (r > R - 7) return W[r > R - 6 ? 0 : dx + dy < 0 ? 4 : 2];
    if (r < 2.3) return M2_PAL.gold[dx + dy < -1 ? 4 : r > 1.6 ? 1 : 2];
    if (r < 3 && dy > 0) return P[0];
    if (Math.abs(dy - (R - 7) * -0.45) < 1 || Math.abs(dy - (R - 7) * 0.45) < 1) return dx < -R * 0.15 ? '#2a2420' : null;
    const plank = Math.floor((px - 2) / 5);
    const edge = (px - 2) % 5 === 0;
    const lit = dx < -R * 0.35 ? 4 : dx < R * 0.3 ? 3 : 2;
    return edge ? P[1] : P[lit + (m2Hash(plank, py >> 3, 3) < 0.15 ? -1 : 0)];
  });
  // The hinge straps on the left half, drawn over the planks.
  for (const sy of [-0.45, 0.45]) pxBox(g, R / 4 - (R - 7) / 4 + 0.5, R / 4 + (sy * (R - 7)) / 4 - 0.25, (R - 7) / 4 * 0.75, 0.5, '#2a2420');
  const art = { c, w: R / 2, h: cut / 4 };
  M2_SHIRE_DOORART.set(key, art);
  return art;
}
// A round window w units across centred at (x, y) with a box of flowers under it. Returns its pane for the night.
function m2ShireWindow(g, x, y, w, seed, P) {
  const R = w * 2;
  m2Raster(g, x - w / 2, y - w / 2, R * 2, R * 2, (px, py) => {
    const [dx, dy] = [px + 0.5 - R, py + 0.5 - R];
    const d = Math.hypot(dx, dy);
    if (d > R) return null;
    if (d > R - 1) return P[0];
    if (d > R - 3) return P[dx + dy < 0 ? 4 : 2];
    if (Math.abs(dx) < 0.6 || Math.abs(dy) < 0.6) return P[dx < 0 && dy < 0 ? 4 : 3];
    return M2_PAL.glass[dx < 0 && dy < 0 ? (d < R * 0.5 && dx - dy > -2 ? 5 : 3) : dx > 0 && dy > 0 ? 1 : 2];
  });
  const pane = { x: x - w / 2, y: y - w / 2, w, h: w, kind: 'round' };
  m2Raster(g, x - w / 2 - 0.5, y + w / 2 - 0.25, (w + 1) * 4, 7, (px, py) => {
    if (py < 3) {
      const h = m2Hash(px, py, seed);
      if (py < 2 && h < 0.35) return null;
      return h < 0.55 ? M2_SHIRE_BED[Math.floor(h * 41) % 6] : ['#3f7a2c', '#5a9a3c', '#2f5a24'][(px + py) % 3];
    }
    return py === 6 || px === 0 || px === (w + 1) * 4 - 1 ? M2_PAL.wood[0] : M2_PAL.wood[py === 3 ? 4 : 2];
  });
  return pane;
}
// A lantern on a post standing on (x, y). Returns the lantern's place for its light.
function m2ShireLantern(g, x, y) {
  pxBox(g, x, y - 7, 0.5, 7, M2_PAL.wood[1]);
  pxBox(g, x - 0.25, y - 7, 0.25, 7, M2_PAL.wood[3]);
  pxBox(g, x - 0.75, y - 9, 1.75, 2, '#2a2420');
  pxBox(g, x - 0.5, y - 8.75, 1.25, 1.5, '#f2c14e');
  pxBox(g, x - 0.5, y - 8.75, 0.5, 0.5, '#fff3c4');
  return { x, y: y - 8 };
}
// A white picket fence len units long with its foot on row y, its posts every 1.5 units.
function m2ShirePickets(g, x, y, len) {
  for (const ry of [3, 1.5]) { pxBox(g, x, y - ry - 0.5, len, 0.5, '#d8d2c4'); pxBox(g, x, y - ry, len, 0.25, '#8a8478'); }
  for (let i = 0; i <= len - 0.5; i += 1.5) {
    pxBox(g, x + i, y - 4.5, 0.75, 4.5, '#f4f1ea');
    pxBox(g, x + i + 0.5, y - 4.25, 0.25, 4.25, '#b8b2a6');
    pxBox(g, x + i + 0.25, y - 4.75, 0.25, 0.25, '#f4f1ea');
  }
  pxBox(g, x, y - 0.25, len, 0.25, '#5a6a3a');
}
// A stone chimney standing on the turf at (x, y), 4 units of coursed stone lit on its left, a cap and a clay pot.
function m2ShireChimney(g, x, y) {
  g.globalAlpha = 0.35;
  pxBox(g, x + 0.5, y - 0.5, 3.5, 1.25, '#1a2a14');
  g.globalAlpha = 1;
  m2Raster(g, x, y - 4, 11, 16, (px, py) => {
    if (py < 3) return py === 0 ? M2_PAL.stone[5] : M2_PAL.stone[py === 2 ? 1 : 4];
    if (px === 0 || px === 10 || py === 15) return M2_PAL.stone[0];
    if ((py - 3) % 4 === 3 || (px + (Math.floor((py - 3) / 4) % 2) * 3) % 6 === 0) return M2_PAL.stone[1];
    return M2_PAL.stone[px < 4 ? 4 : px < 8 ? 3 : 2];
  });
  pxBox(g, x + 0.75, y - 5.5, 1.25, 1.5, '#8a4a2a');
  pxBox(g, x + 0.75, y - 5.5, 0.5, 1.5, '#b06a3e');
  pxBox(g, x + 0.75, y - 5.75, 1.25, 0.25, '#2a1a12');
  return { x: x + 1.4, y: y - 6 };
}

// Draws hole o onto the hills' canvas g (H from m2ShireHills): door, windows, step, lantern, chimney, and its gate or
// fence. Returns its lights (in canvas units) and where its smoke rises.
function m2ShireHole(g, H, P, o) {
  const lights = [];
  const at = (x, y) => H.at(x, y);
  const [, floorY] = at(o.x, o.face + 0.4);
  const big = o.big;
  const d = big ? 10.5 : o.small ? 8 : 9;
  const art = m2ShireDoorArt(d, M2_SHIRE_PAINT[o.paint]);
  const dx = o.x - H.x;
  g.drawImage(art.c, dx - art.w / 2, floorY - art.h, art.w, art.h);
  // The half-moon doorstep and its shadow.
  m2Raster(g, dx - d / 2, floorY - 0.25, d * 4, 7, (px, py) => {
    const e = ((px + 0.5 - d * 2) / (d * 2)) ** 2 + (py / 7) ** 2;
    if (e > 1) return null;
    return py === 0 ? M2_PAL.stone[5] : e > 0.75 ? M2_PAL.stone[1] : M2_PAL.stone[py < 3 ? 4 : 3];
  });
  if (o.porch) {
    const pw = d + 5;
    m2Roof(g, dx - pw / 2, floorY - art.h - 2.75, pw, 1, 2.5, M2_PAL.thatch, 0.75);
    for (const sx of [dx - pw / 2 + 0.5, dx + pw / 2 - 1.25]) { pxBox(g, sx, floorY - art.h + 0.5, 0.75, art.h - 0.5, M2_PAL.wood[2]); pxBox(g, sx, floorY - art.h + 0.5, 0.25, art.h - 0.5, M2_PAL.wood[4]); }
  }
  lights.push({ x: dx, y: floorY - 0.5, r: 4 });
  // Tufts of grass and flowers where the face meets the turf at its sides.
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 4; i += 1) {
      const [tx, ty] = [dx + sd * (o.hw * 0.8 + (i % 2) * 1.25), floorY - 1 - i * 2.25];
      pxBox(g, tx, ty, 0.25, 1, '#3f7a2c'); pxBox(g, tx + 0.5, ty - 0.25, 0.25, 1.25, '#5a9a3c'); pxBox(g, tx + 1, ty + 0.25, 0.25, 0.75, '#2f5a24');
      if (i % 2 === 0) { pxBox(g, tx + 0.25, ty - 0.75, 0.5, 0.5, M2_SHIRE_BED[(i + o.seed) % 6]); pxBox(g, tx + 0.25, ty - 0.75, 0.25, 0.25, '#ffffff'); }
    }
  }
  // The windows either side, as many as the face is wide.
  const ww = big ? 5 : o.small ? 3.75 : 4.5;
  const offs = [];
  for (let k = 0; k < o.windows; k += 1) {
    const ox = (k % 2 ? 1 : -1) * (art.w / 2 + 0.75 + ww / 2 + Math.floor(k / 2) * (ww + 1.5));
    if (Math.abs(ox) + ww / 2 <= o.hw - (o.small ? 0.25 : 0.75)) offs.push(ox);
  }
  for (const ox of offs) {
    const [wx, wy] = at(o.x + ox, o.face + ((ox / o.hw) ** 2) * o.bow + 0.4);
    const pane = m2ShireWindow(g, wx, wy - ww / 2 - 3.25, ww, o.x + ox, M2_SHIRE_PAINT[o.frame ?? o.paint]);
    lights.push({ pane });
  }
  // The lantern on its post beside the path below the door, on the side away from the bench.
  const side = o.seed % 2 ? 1 : -1;
  const ln = m2ShireLantern(g, dx + side * 3, floorY + Math.min(7.5, o.front - o.face - 1.5));
  lights.push({ x: ln.x, y: ln.y, r: 5, lamp: true });
  if (o.bench) {
    const bx = dx - side * (art.w / 2 + 6);
    pxBox(g, bx, floorY + 0.5, 5, 1, M2_PAL.wood[3]);
    pxBox(g, bx, floorY + 0.5, 5, 0.25, M2_PAL.wood[5]);
    pxBox(g, bx, floorY + 1.5, 5, 0.5, M2_PAL.wood[1]);
    for (const lx of [bx + 0.25, bx + 4.25]) pxBox(g, lx, floorY + 2, 0.5, 1, M2_PAL.wood[0]);
  }
  if (o.butt) {
    const bx = dx - side * (o.hw - 3.5);
    m2Raster(g, bx, floorY - 2.5, 12, 14, (px, py) => (py < 2 ? (py ? '#1f3a4a' : '#2a1a12') : py % 4 === 0 ? '#2a2420' : M2_PAL.wood[px < 4 ? 4 : px < 9 ? 3 : 1]));
  }
  // The chimney up on the turf above, toward one side.
  // It goes where no other hole's garden is near, on the side away from Bag End first, close above the face and over
  // the hole's own width, so it rises out of the turf the hole is dug into (2026-11-27: stacks stood off to the side).
  const be = P.holes.find((q) => q.big);
  const away = big || !be ? -side : Math.sign(o.x - be.x) || 1;
  let spot = null;
  for (const dy of [2.5, big ? 4.5 : 3.5]) {
    for (const u of [0.4 * away, 0.55 * away, -0.4 * away, 0.25 * away]) {
      const [x, y] = [o.x + o.hw * u, o.face - dy];
      if (!spot && !P.holes.some((q) => q !== o && [0, 3, 6, 9].some((e) => m2ShireInYard(q, x + (e % 6 ? 2 : -2), y - e)))) spot = [x, y];
    }
  }
  const [cx, cy] = at(...(spot ?? [o.x - o.hw * 0.4 * side, o.face - 3]));
  const smoke = m2ShireChimney(g, cx - 1.4, cy);
  // A hole at a hill's foot has its picket fence along the garden's front with the gate open on the path.
  if (!o.ledge) {
    const fy = o.front - H.y;
    m2ShirePickets(g, dx - o.hw, fy, o.hw - 2.25);
    m2ShirePickets(g, dx + 2.25, fy, o.hw - 2.25);
    m2ShirePickets(g, dx + 2.25, fy - 0.5, 0.75);
    m2ShireGate(g, dx + 2.25, fy, side);
  } else {
    const fy = o.front - o.ledge - H.y + 0.25;
    for (const px of [dx - 3, dx + 2]) {
      pxBox(g, px, fy - 3.5, 1, 3.5, M2_PAL.stone[3]); pxBox(g, px, fy - 3.5, 0.25, 3.5, M2_PAL.stone[5]); pxBox(g, px + 0.75, fy - 3.5, 0.25, 3.5, M2_PAL.stone[1]);
      pxBox(g, px - 0.25, fy - 4, 1.5, 0.5, M2_PAL.stone[4]); pxBox(g, px - 0.25, fy - 4, 1.5, 0.25, M2_PAL.stone[5]);
    }
    // The notice on the gatepost: no admittance except on party business.
    pxBox(g, dx - 5.75, fy - 3.5, 3, 2, M2_PAL.wood[1]);
    pxBox(g, dx - 5.5, fy - 3.25, 2.5, 1.5, '#ece4d0');
    for (const ly of [-2.75, -2.25]) pxBox(g, dx - 5.25, fy + ly, 2, 0.25, '#6a5a48');
  }
  return { lights, smoke: { x: smoke.x + H.x, y: smoke.y + H.y } };
}
// A gate of white pickets standing open, hinged at (x, y).
function m2ShireGate(g, x, y, side) {
  pxBox(g, x, y - 5, 0.75, 5, '#d8d2c4');
  pxBox(g, x + 0.75, y - 4.5, 1.25, 3.5, '#f4f1ea');
  pxBox(g, x + 1.5, y - 4.5, 0.5, 3.5, '#9a948a');
  pxBox(g, x + 0.75, y - 3.25, 1.25, 0.25, '#8a8478');
}
