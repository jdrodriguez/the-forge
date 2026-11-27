// scenery-erebor.js: Erebor in the Middle-earth view, in 32-bit (a quarter unit a pixel), in the same places and sizes
// as before: the wall of the mountain, a rough crest of rubble over courses of dressed stone; the great gate, pillars
// banded with carving under a lintel inlaid with gold runes, a dark doorway that steps in at its top and two steps
// before it; and the forge, a hood of sooty stone over a hearth of firebrick whose mouth is an arch of voussoirs over a
// bed of coals, with a leather bellows at its side. All of it is painted into the realm's layer by scenery-land.js's
// landStill. After the night shade ereborLights draws the forge's coals and fire and its glow and, after dark, the glow
// of the halls within the gate. Loaded after scenery-falls.js.

const EREBOR_WALL = ['#8e8a96', '#77727d', '#635f69', '#5b5761', '#4b4750', '#36333b'];
const EREBOR_GATE = ['#d0cbd6', '#aba6b2', '#8b8692', '#6d6974', '#504c57', '#2e2b34'];
const EREBOR_RUNES = ['#.##.#.#..#..#.', '#..##.#.##..#..', '.#..#.###.#..#.', '##.#.###.#..#..', '..#.###.#..#..#', '#..#.###.#.##..', '.#.#.##.##.#.#.', '#.#####.#.#.#.#'];
const EREBOR_CROWN = ['#.#.#', '#####', '.###.'];

// The wall, pixel by pixel. Above, rubble of the mountain's rock in rough lumps, lit along their tops and left and
// cracked between, under a crest lit along its edge; below, six courses of dressed blocks, each bevelled (lit along its
// top and left, shaded along its bottom and right) with a grain of its own, chips here and there, and mortar between.
function ereborWall(g, r) {
  const { x0, w } = r;
  const [Sh, L, A, B, S, M] = EREBOR_WALL;
  const top = GROUND_Y - 30;
  const courses = [0, 1, 2, 3, 4, 5].map((k) => {
    const starts = [];
    for (let x = -(k % 2 ? 3 : 0); x < w; x += 6 + Math.floor(rnd(x0 + x + k * 13) * 5)) starts.push(x);
    return starts;
  });
  const rubble = [0, 1, 2, 3, 4].map((k) => {
    const starts = [];
    for (let x = -rnd(x0 + k) * 2; x < w; x += 1.5 + Math.floor(rnd(x0 * 3 + x * 7 + k * 11) * 8) / 4) starts.push(x);
    return starts;
  });
  const crests = Float32Array.from({ length: w * SC_RES }, (_, i) => {
    const X = x0 + i / SC_RES;
    return Math.round((top + Math.sin(X / 3.7) * 0.6 + Math.sin(X / 1.3) * 0.3 + 0.9 + Math.sin(X * 2.9) * 0.2) * 4) / 4;
  });
  qdPut(g, qdPixels(w, 32, (x, y, i, j) => {
    const X = x0 + x;
    const crest = crests[i];
    const Y = top + y;
    if (Y < crest) return null;
    if (Y - crest < 0.25) return Sh;
    if (Y < GROUND_Y - 22) {
      if (Y >= GROUND_Y - 22.5) return Y >= GROUND_Y - 22.25 ? M : S;
      const row = Math.floor((Y - top) / 1.75);
      const lumps = rubble[row];
      let c = lumps.length - 1;
      while (c > 0 && lumps[c] > x) c -= 1;
      const [u, v] = [(x + 0.125 - lumps[c]) / ((lumps[c + 1] ?? w + 4) - lumps[c]), (Y - top) / 1.75 - row];
      if (Y - crest < 0.5 || v < 0.15 || u < 0.06) return L;
      if (u > 0.94 || v > 0.86) return M;
      if (v > 0.7) return S;
      return u + v * 0.8 < 0.75 ? (qdHash(c, row) < 0.5 ? A : L) : qdHash(c, row) < 0.5 ? B : A;
    }
    const k = Math.floor((Y - GROUND_Y + 22) / 4);
    const v = j - (32 + k * 16);
    const starts = courses[k];
    let b = starts.length - 1;
    while (b > 0 && starts[b] > x) b -= 1;
    const [u, bw] = [Math.round((x - starts[b]) * 4), Math.round(((starts[b + 1] ?? w + 12) - starts[b]) * 4)];
    if (v === 15 || u === bw - 1) return M;
    if (v === 0 || u === 0) return v === 0 && u < 3 ? Sh : L;
    if (v === 14 || u === bw - 2) return S;
    if (qdHash(i, j) < 0.025) return S;
    if (qdHash(i, j - 1) < 0.025) return L;
    const face = qdHash(b + k * 50, x0) < 0.5 ? A : B;
    return qdHash(Math.floor(i / 3), Math.floor((j + i) / 2)) < 0.2 ? (face === A ? B : A) : face;
  }), x0, top);
}

// The gate: a dark doorway, deepest at its top, its far jamb catching the light and its floor faintly lit, stepping in
// under corbels; pillars of pale dressed stone, fluted and banded with carving; a lintel inlaid with gold runes, a
// keystone with a gold crown, and two steps before it.
// Where the first column of a realm's stations stands (scene.js's scLayout passes the centred one, left): in Erebor,
// moved by less than half a column so the gate stands in the gap between the back row's anvils, since a dwarf at an
// anvil before it stood in its doorway with Gollum (2026-11-27).
function ereborLeft(p, x0, w, left) {
  if (p.kind !== 'dwarf' || p.cols < 2) return left;
  const cx = x0 + Math.floor(w / 2);
  const j = Math.max(0, Math.min(p.cols - 2, Math.round((cx - left - SC_COL / 2) / SC_COL)));
  return cx - SC_COL / 2 - j * SC_COL;
}

function ereborGate(g, cx) {
  const [Sh, L, B, S, D, O] = EREBOR_GATE;
  pxBox(g, cx - 5.5, GROUND_Y - 15, 11, 17, '#17141c');
  pxBox(g, cx - 5.5, GROUND_Y - 15, 11, 2, '#0f0d13');
  pxBox(g, cx - 3, GROUND_Y - 16.5, 6, 1.5, '#0f0d13');
  pxBox(g, cx + 4.5, GROUND_Y - 15, 0.25, 17, '#2a2630');
  pxBox(g, cx + 4.75, GROUND_Y - 15, 0.75, 17, '#3d3944');
  pxBox(g, cx - 5.5, GROUND_Y + 1.25, 11, 0.75, '#221e29');
  for (const [x, y, w] of [[cx - 4.5, GROUND_Y - 16, 1.5], [cx + 3, GROUND_Y - 16, 1.5], [cx - 3.5, GROUND_Y - 17, 0.5], [cx + 3, GROUND_Y - 17, 0.5]]) {
    [L, B, S, O].forEach((c, k) => pxBox(g, x, y + k / 4, w, 0.25, c));
  }
  pxBox(g, cx - 3, GROUND_Y - 17, 6, 0.5, O);
  for (const px of [cx - 8, cx + 5.5]) {
    [L, Sh, L, B, S, B, B, S, D, O].forEach((c, k) => pxBox(g, px + k / 4, GROUND_Y - 17, 0.25, 19, c));
    for (let y = GROUND_Y - 14; y < GROUND_Y + 1; y += 4) {
      [D, S, Sh].forEach((c, k) => pxBox(g, px + 0.25, y + k / 4, 2, 0.25, c));
      pxBox(g, px + 1, y - 1, 0.5, 0.5, D);
      qdDot(g, px + 1, y - 1, PAV_GOLD[1]);
    }
  }
  [Sh, L, B, B, B, B, B, B, S, O].forEach((c, k) => pxBox(g, cx - 8.5, GROUND_Y - 19.5 + k / 4, 17, 0.25, c));
  pxBox(g, cx - 8.5, GROUND_Y - 19.5, 0.25, 2.25, L);
  pxBox(g, cx + 8.25, GROUND_Y - 19.5, 0.25, 2.25, D);
  // Twelve runes three pixels by five across the lintel, each pixel inlaid in gold with its groove's shadow below right.
  for (let n = 0; n < 12; n += 1) {
    const rune = EREBOR_RUNES[(n * 5 + 3) % EREBOR_RUNES.length];
    const x = cx - 7.75 + n * 1.25 + (n >= 6 ? 0.25 : 0);
    for (let p = 0; p < 15; p += 1) {
      if (rune[p] !== '#') continue;
      const [px, py] = [x + (p % 3) / 4, GROUND_Y - 19 + Math.floor(p / 3) / 4];
      if (rune[p + 1] !== '#' || p % 3 === 2) qdDot(g, px + 0.25, py + 0.25, S);
      qdDot(g, px, py, p < 3 ? '#fff1a8' : PX.gold);
    }
  }
  [Sh, L, B, B, S, D].forEach((c, k) => pxBox(g, cx - 3, GROUND_Y - 21 + k / 4, 6, 0.25, c));
  pxBox(g, cx - 3, GROUND_Y - 21, 0.25, 1.5, L);
  pxBox(g, cx + 2.75, GROUND_Y - 21, 0.25, 1.5, D);
  qdMap(g, EREBOR_CROWN, { '#': PX.gold }, cx - 0.625, GROUND_Y - 20.5);
  for (const [dx, y] of [[6.5, GROUND_Y + 2], [7.5, GROUND_Y + 3]]) {
    [Sh, L, B, S].forEach((c, k) => pxBox(g, cx - dx, y + k / 4, dx * 2, 0.25, c));
    pxBox(g, cx + dx - 0.25, y, 0.25, 1, D);
  }
}

// The forge's firebrick, its sooty hood, and the bellows, a pixel map in quarter units: two boards lit along their
// edges, hinged at a brass nozzle into the hearth, with oxblood leather in folds between them, on a little stand.
const FORGE_BRICK = ['#d39070', '#b06a4c', '#8e4f3a', '#6e392b', '#4c241b', '#2e1c16'];
const FORGE_HOOD = ['#7a7480', '#5f5966', '#4a4550', '#36323b', '#24212a'];
const FORGE_BELLOWS = ['hh................', 'hHHHHHHHHHH.......', '.bBBBBBBBBBBHH....', '..LlDLlDLlDLlbBH..', '..LlDLlDLlDLlDlbBn',
  '..LlDLlDLlDLlDlbNn', '..LlDLlDLlDLlDlbBn', '..LlDLlDLlDLlbBH..', '.bBBBBBBBBBBHH....', 'hHHHHHHHHHH.......', 'hh..w......w......',
  '....w......w......', '...ww.....ww......'];
const FORGE_BELLOWS_PAL = { h: '#8a5a32', H: '#d9a066', B: '#a8703c', b: '#5e3a1c', L: '#a65a3e', l: '#7a3b2a', D: '#3f1a12', N: '#e9b746', n: '#a07a22', w: '#55361b' };
// The mouth's arch: the opening's top at column mx from the mouth's middle, and the arch of voussoirs round it.
const forgeArch = (mx, rx, ry) => GROUND_Y - 1.5 - ry * Math.sqrt(Math.max(0, 1 - (mx / rx) ** 2));
function ereborForge(g, x0) {
  for (let y = GROUND_Y - 10; y < GROUND_Y - 6; y += 0.25) {
    const half = Math.round((3 + (y - (GROUND_Y - 10)) * 0.75) * 4) / 4;
    const row = Math.floor((y - (GROUND_Y - 10)) / 1);
    pxBox(g, x0 + 14.5 - half, y, half * 2, 0.25, FORGE_HOOD[Math.min(3, 1 + Math.floor(row / 2))]);
    if ((y * 4) % 4 === 3) pxBox(g, x0 + 14.5 - half, y, half * 2, 0.25, FORGE_HOOD[4]);
    else for (let x = x0 + 12 + (row % 2) * 1.25; x < x0 + 14.5 + half; x += 2.5) if (x > x0 + 14.5 - half) qdDot(g, x, y, FORGE_HOOD[4]);
    qdDot(g, x0 + 14.5 - half, y, FORGE_HOOD[0]);
    qdDot(g, x0 + 14.25 + half, y, FORGE_HOOD[4]);
  }
  qdPut(g, qdPixels(15.5, 9.5, (x, y, i, j) => {
    const [X, Y] = [x0 + 6 + x + 0.125, GROUND_Y - 6 + y + 0.125];
    const mx = X - (x0 + 14.5);
    const inside = Math.abs(mx) < 6 && Y >= forgeArch(mx, 6, 2);
    if (inside) {
      if (Y >= GROUND_Y + 3) return FORGE_BRICK[5];
      if (Y >= GROUND_Y + 2) return qdHash(i, j) < 0.2 ? '#8a2a14' : '#5a1a10';
      return Y < GROUND_Y - 2 ? '#1a0e09' : Y < GROUND_Y + 0.5 ? '#24140c' : '#3a1c10';
    }
    if (Y < GROUND_Y - 1.25 && Math.abs(mx) < 7.5 && Y >= forgeArch(mx, 7.5, 3.25)) {
      const seg = Math.floor(((Math.atan2(Y - (GROUND_Y - 1.5), mx) + Math.PI) / Math.PI) * 11);
      if (Y < forgeArch(mx, 7.5, 3.25) + 0.25) return FORGE_BRICK[1];
      if (Y >= forgeArch(mx, 6, 2) - 0.25) return FORGE_BRICK[4];
      return seg === 5 ? FORGE_BRICK[1] : seg % 2 ? FORGE_BRICK[2] : FORGE_BRICK[3];
    }
    if (X > x0 + 21.25) return FORGE_BRICK[5];
    const course = Math.floor(j / 6);
    const u = Math.floor(i + (course % 2 ? 6 : 0)) % 12;
    const v = j % 6;
    if (v === 5 || u === 11) return FORGE_BRICK[5];
    const soot = Y < GROUND_Y - 4.5 ? 1 : 0;
    if (v === 0 || u === 0) return FORGE_BRICK[Math.min(4, 1 + soot)];
    if (v === 4 || u === 10) return FORGE_BRICK[Math.min(4, 3 + soot)];
    return FORGE_BRICK[Math.min(4, (qdHash(Math.floor((i + (course % 2 ? 6 : 0)) / 12), course) < 0.3 ? 3 : 2) + soot)];
  }), x0 + 6, GROUND_Y - 6);
  [EREBOR_GATE[1], EREBOR_GATE[2], EREBOR_GATE[3], EREBOR_GATE[4]].forEach((c, k) => pxBox(g, x0 + 5, GROUND_Y + 3.5 + k / 4, 17, 0.25, c));
  qdMap(g, FORGE_BELLOWS, FORGE_BELLOWS_PAL, x0 + 1.75, GROUND_Y + 0.5);
}

// A tongue of fire w units wide on a base at (x, y), h units tall, its tip leaning by s: a red rim round an orange
// body, a yellow heart and a pale core low down, narrowing to its tip.
const EREBOR_FIRE = ['#e0453a', PX.ember, PX.emberL, '#fff3c4'];
function qdTongue(g, x, y, w, h, s) {
  for (let k = 0; k < h * 4; k += 1) {
    const t = k / (h * 4);
    const ww = Math.max(0.25, Math.round((1 - t) ** 0.8 * w * 4) / 4);
    const left = Math.round((x + (w - ww) / 2 + s * t * t) * 4) / 4;
    const y0 = y - 0.25 - k / 4;
    pxBox(g, left, y0, ww, 0.25, EREBOR_FIRE[0]);
    if (ww > 0.5) pxBox(g, left + 0.25, y0, ww - 0.5, 0.25, EREBOR_FIRE[1]);
    if (ww > 1 && t < 0.7) pxBox(g, left + 0.5, y0, ww - 1, 0.25, EREBOR_FIRE[2]);
    if (ww > 1.5 && t < 0.35) pxBox(g, left + 0.75, y0, ww - 1.5, 0.25, EREBOR_FIRE[3]);
  }
}

// After the night shade: the forge's glow on the wall (scene-glow.js's halo, flickering with the fire and growing through
// dusk) and at night its pool of firelight on the ground before it; its coals, flickering pixel by pixel, and six
// tongues of fire under the arch of its mouth (where scene-work.js's flare rises too); and after dark a glow from the
// halls within the gate, tall in the doorway, that spills down the steps.
function ereborLights(g, r, tick, night) {
  const G = typeof sc !== 'undefined' ? sc.glow : null;
  const dark = G ? G.night : Number(night);
  const cx = r.x0 + Math.floor(r.w / 2);
  G?.draw(g, r.x0 + 14.5, GROUND_Y + 0.5, 12, PX.ember, 0.4 + 0.55 * dark, { flame: r.x0 + 1, ry: 0.8, pool: [r.x0 + 14.5, GROUND_Y + 6.5, 14] });
  if (dark > 0) G?.draw(g, cx, GROUND_Y - 3, 5.5, '#ff9a3c', 0.75 * dark, { flame: r.x0 + 2, wobble: 0.35, ry: 1.9, pool: [cx, GROUND_Y + 5, 10] });
  const beat = Math.floor(tick / 2);
  for (let x = r.x0 + 8.75; x < r.x0 + 20.25; x += 0.25) {
    const q = qdHash(Math.round(x * 4), beat);
    pxBox(g, x, GROUND_Y + 2.25, 0.25, 0.5, q < 0.45 ? '#8a2a14' : q < 0.85 ? PX.ember : PX.emberL);
    if (q > 0.6) qdDot(g, x, GROUND_Y + 2, q > 0.92 ? '#fff3c4' : PX.ember);
  }
  for (let i = 0; i < 6; i += 1) {
    const x = r.x0 + 9 + i * 1.85;
    const room = GROUND_Y + 2.25 - forgeArch(x + 1 - (r.x0 + 14.5), 6, 2) - 0.5;
    const h = Math.min(room, 1.5 + rnd(i + beat * 7) * 3.5);
    qdTongue(g, x, GROUND_Y + 2.25, 2, h, Math.sin(tick * 0.9 + i * 1.7) * 0.5);
  }
}
