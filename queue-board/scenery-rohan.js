// scenery-rohan.js: Meduseld, the golden hall of Rohan, in the Middle-earth view, in 32-bit (a quarter unit a pixel). It
// stands on a green hill at the back of the realm between the back row's first two stations: a long timber hall under
// a roof of golden thatch whose ridge ends in crossed gable boards, a gabled porch on carved pillars over its doors, lamps
// on the pillars, small windows, and a stair of stone down the hill's face. At the stair's foot water falls from a
// carved spout into a stone basin, and a fence of sharpened stakes runs along the hill's foot either side. A banner pole
// beside the hall flies Rohan's green pennant the way the wind blows. scenery-land.js paints the hill and the hall into
// the realm's layer (landStill) and draws the pennant and the falling water each frame (drawRealm); the stables are
// scenery-rohan-stables.js's and the lights at night rohanLights, called from scenery-lights.js. Loaded right after
// scenery-land-qd.js.

const ROHAN_HILL = ['#25461f', '#335e28', '#437733', '#56903f', '#6fa84c', '#94c46a'];
const ROHAN_GOLD = ['#4a3010', '#7a561a', '#a87e2a', '#d0a63c', '#ecc85a', '#fff0a2'];
const ROHAN_WOOD = ['#24140e', '#40261a', '#5e3a24', '#80542f', '#a8763f', '#cf9e5e'];
const ROHAN_STONE = ['#4a4640', '#6e6a64', '#8d887f', '#b4afa5', '#d6d0c4', '#ece6da'];

// Where Rohan's landmarks stand in realm r: the hall's middle (mx), between the back row's two stations nearest the
// realm's middle (or beside a lone one), and the stables along the left edge (sx0 to sx1). The stations are part of
// the key, since a realm keeps its width when its number of workers changes.
function rohanSite(r) {
  const back = sc.stations.filter((s) => s.realm === r && !s.sentry && s.y < PROP_MID).map((s) => s.x).sort((a, b) => a - b);
  const key = `${r.x0},${r.w},${back}`;
  if (r.rohan?.key === key) return r.rohan;
  const cx = r.x0 + Math.floor(r.w / 2);
  let mx = cx;
  if (back.length > 1) [mx] = back.slice(1).map((x, i) => (x + back[i]) / 2).sort((a, b) => Math.abs(a - cx) - Math.abs(b - cx));
  else if (back.length) mx = back[0] + 23;
  mx = Math.round(Math.max(r.x0 + 52, Math.min(r.x0 + r.w - 23, mx)));
  r.rohan = { key, mx, sx0: r.x0 + 2, sx1: r.x0 + 30 };
  return r.rohan;
}

// A colour from ramp R at t (0 its darkest, 1 its lightest), dithered between its two nearest steps.
function rohanPick(R, t, i, j) {
  const v = Math.max(0, Math.min(R.length - 1.001, t * (R.length - 1)));
  const k = Math.floor(v);
  return R[qdDith(i, j, v - k) ? k + 1 : k];
}
// Paints fn(X, Y, i, j) over the box w by h units from (x0, y0), X and Y the middle of each pixel in scene units.
const rohanPaint = (g, x0, y0, w, h, fn) => qdPut(g, qdPixels(w, h, (x, y, i, j) => fn(x0 + x + 0.125, y0 + y + 0.125, i, j)), x0, y0);
const rohanEase = (t) => t * t * (3 - 2 * t);
// The hill's top edge at a units from its middle: a broad low dome, then a slope down to its foot 22 units out.
const rohanHillTop = (a) => (a <= 13 ? GROUND_Y - 8 + (a / 13) ** 2 * 0.5 : GROUND_Y - 7.5 + 12 * rohanEase(Math.min(1, (a - 13) / 9)));

// The hill, lit on its west slope and shaded on its east, darker down its face, with flecks of lighter and darker grass,
// and the stair of stone down its face: light treads, darker risers and shaded sides, widening toward the foot.
function rohanHill(g, m) {
  rohanPaint(g, m - 22, GROUND_Y - 9, 44, 13.75, (X, Y, i, j) => {
    const dx = X - m;
    const a = Math.abs(dx);
    const top = rohanHillTop(a);
    if (a > 22 || Y < top) return null;
    const half = 3 + (Y - (GROUND_Y - 8)) / 12;
    if (Y >= GROUND_Y - 8 && Math.abs(dx + 0.25) <= half) {
      const f = (Y - (GROUND_Y - 8)) % 0.75;
      if (Math.abs(dx + 0.25) > half - 0.3) return ROHAN_STONE[dx < 0 ? 1 : 0];
      if (f < 0.25) return ROHAN_STONE[dx < 0 ? 5 : 4];
      return ROHAN_STONE[(f < 0.5 ? 3 : 2) - (dx > 1.5 ? 1 : 0)];
    }
    const slope = (rohanHillTop(a + 0.25) - top) * 4 * Math.sign(dx);
    let t = 0.62 - slope * 0.32 - (Y - top) * 0.03 + (qdHash(i, j) - 0.5) * 0.14;
    if (Y - top < 0.3) t += 0.28;
    const fleck = qdHash(i * 3 + 1, j * 5 + 2);
    if (fleck > 0.95) t += 0.2;
    else if (fleck < 0.04) t -= 0.2;
    return rohanPick(ROHAN_HILL, t, i, j);
  });
}

// Sharpened stakes along the hill's foot either side of the stair and the basin, each a half unit wide, lit on its
// left, pointed, of seeded heights.
function rohanStakes(g, m) {
  for (const [a, b] of [[m - 21, m - 5], [m + 11, m + 21]]) {
    for (let x = a; x <= b; x += 1) {
      const h = 3 + Math.floor(rnd(x * 3 + 7) * 3) / 4;
      const foot = GROUND_Y + 4.5;
      pxBox(g, x, foot - h + 0.5, 0.25, h - 0.5, ROHAN_WOOD[4]);
      pxBox(g, x + 0.25, foot - h + 0.5, 0.25, h - 0.5, ROHAN_WOOD[2]);
      qdDot(g, x + (x % 2 ? 0 : 0.25), foot - h + 0.25, ROHAN_WOOD[5]);
      pxBox(g, x, foot - h + 1.25, 0.5, 0.25, ROHAN_WOOD[1]);
    }
    pxBox(g, a, GROUND_Y + 2.25, b - a + 0.5, 0.25, ROHAN_WOOD[3]);
  }
}

// The basin at the stair's foot: stone blocks under a lit rim holding water, and above it a carved horse's head in the
// hill's face whose mouth the water falls from (drawn each frame by rohanWater).
function rohanBasin(g, m) {
  const [x, y] = [m + 4, GROUND_Y + 1.5];
  rohanPaint(g, x, y, 6, 3, (X, Y, i, j) => {
    const [u, v] = [X - x, Y - y];
    if (v < 0.25) return u < 0.25 || u > 5.75 ? ROHAN_STONE[1] : ROHAN_STONE[5];
    if (v < 0.75 && u > 0.5 && u < 5.5) return v < 0.5 ? '#9fd0ff' : '#5a9ad0';
    if (u < 0.25 || u > 5.75 || v > 2.75) return ROHAN_STONE[0];
    if ((v - 0.75) % 1 < 0.25 || (Math.floor(u + Math.floor(v) * 1.5) % 3 === 0 && (u * 4) % 4 < 1)) return ROHAN_STONE[1];
    return rohanPick(ROHAN_STONE, 0.75 - u * 0.08 - v * 0.05, i, j);
  });
  qdMap(g, ['.oo...', 'oSSo..', 'oSSSoo', '.oSSSs', '..oSso', '...oo.'], { o: ROHAN_STONE[0], S: ROHAN_STONE[4], s: ROHAN_STONE[2] }, m + 6, GROUND_Y - 2.5);
}

// The hall on the hilltop: timber walls of upright planks between dark posts over a stone footing, a gold band under
// the eaves and four small windows; the roof of golden thatch in courses, lit on its west half and shaded on its east,
// a dark ridge beam along its top; the gabled porch on two carved pillars over a pair of studded doors; lamps on the
// pillars; and crossed gable boards at both ends of the ridge.
const ROHAN_WINDOWS = [-11, -7.5, 5.5, 9];
function rohanHall(g, m) {
  const G = GROUND_Y;
  rohanPaint(g, m - 16, G - 24, 32, 16, (X, Y, i, j) => {
    const dx = X - m;
    const a = Math.abs(dx);
    // The porch's gable roof, then its pillars and doors.
    const porch = G - 14 - (5.25 - a) * 0.8;
    if (a < 5.25 && Y >= porch && Y < G - 13.5) {
      if (Y - porch < 0.3) return dx < 0 ? ROHAN_GOLD[5] : ROHAN_GOLD[3];
      if (Y > G - 14) return ROHAN_GOLD[0];
      return rohanPick(ROHAN_GOLD, (dx < 0 ? 0.7 : 0.45) + (qdHash(i, j * 3) - 0.5) * 0.2, i, j);
    }
    if (Y >= G - 13.5 && Y < G - 8) {
      if (a >= 3 && a < 4) return Y % 1.5 < 0.25 ? ROHAN_GOLD[4] : (dx < 0) !== (a < 3.5) ? ROHAN_WOOD[5] : ROHAN_WOOD[3];
      if (a < 2.25 && Y >= G - 13) {
        if (a < 0.25 || a > 2) return ROHAN_WOOD[0];
        if ((Y - G + 13) % 1.25 < 0.25 && a > 0.5 && a < 1.75) return ROHAN_GOLD[a < 1 ? 4 : 3];
        return (a * 4) % 2 < 1 ? ROHAN_WOOD[2] : ROHAN_WOOD[1];
      }
    }
    // The main roof: a trapezoid from the eaves up to the ridge, thatch in courses with strands, and its hips.
    const hw = 10 + (5 * (Y - (G - 23))) / 9;
    if (Y >= G - 23 && Y < G - 14 && a <= hw) {
      if (Y < G - 22.75) return ROHAN_GOLD[1];
      if (Y < G - 22.5) return ROHAN_GOLD[dx < 0 ? 4 : 2];
      if (Y >= G - 14.25) return ROHAN_GOLD[0];
      if (hw - a < 0.25) return ROHAN_GOLD[1];
      const course = (Y - G + 22.5) % 1.5;
      let t = dx < -2 ? 0.72 : dx > 2 ? 0.42 : 0.58;
      if (hw - a < 3) t += dx < 0 ? 0.12 : -0.14;
      t += course < 0.25 ? 0.2 : course > 1.2 ? -0.18 : 0;
      t += (qdHash(i, Math.floor((Y - G) / 1.5)) - 0.5) * 0.3;
      return rohanPick(ROHAN_GOLD, t, i, j);
    }
    // The walls.
    if (a < 13.5 && Y >= G - 14 && Y < G - 8) {
      if (Y < G - 13.5) return ROHAN_GOLD[Y < G - 13.75 ? 4 : 2];
      if (Y >= G - 9) return (X + (Y > G - 8.5 ? 0.75 : 0)) % 1.5 < 0.25 ? ROHAN_STONE[1] : rohanPick(ROHAN_STONE, 0.6 - dx * 0.015, i, j);
      for (const w of ROHAN_WINDOWS) {
        if (X >= m + w && X < m + w + 1.5 && Y >= G - 12.5 && Y < G - 10.5) {
          const edge = X < m + w + 0.25 || X >= m + w + 1.25 || Y < G - 12.25 || Y >= G - 10.75;
          return edge ? ROHAN_GOLD[2] : X - m - w > 0.6 && X - m - w < 0.9 ? ROHAN_WOOD[1] : '#1a1014';
        }
      }
      if ((a + 0.5) % 4.5 < 0.5) return ROHAN_WOOD[dx < 0 ? 1 : 0];
      return rohanPick(ROHAN_WOOD, (X * 4) % 4 < 1 ? 0.75 : 0.55 - (dx > 0 ? 0.12 : 0) - (Y - G + 13.5) * 0.02, i, j);
    }
    return null;
  });
  // The crossed gable boards at the ridge's ends, each a diagonal plank lit along its upper edge, carved at its tip into
  // a horse's head that turns outward; and the lamps hung on the porch's pillars.
  for (const e of [m - 10, m + 10]) {
    for (const s of [1, -1]) {
      for (let k = 0; k < 14; k += 1) {
        const [x, y] = [e - s * 1.75 + s * k * 0.25, G - 22.25 - k * 0.25];
        pxBox(g, x - 0.25, y, 0.75, 0.25, ROHAN_GOLD[s > 0 ? 3 : 2]);
        qdDot(g, s > 0 ? x - 0.25 : x + 0.25, y, ROHAN_GOLD[s > 0 ? 5 : 4]);
        qdDot(g, s > 0 ? x + 0.5 : x - 0.5, y, ROHAN_GOLD[0]);
      }
      const tx = e - s * 1.75 + s * 3.5;
      pxBox(g, tx - 0.25 + s * 0.25, G - 26, 0.75, 0.5, ROHAN_GOLD[4]);
      qdDot(g, tx + s * 0.75, G - 25.75, ROHAN_GOLD[1]);
    }
  }
  for (const lx of [m - 4.25, m + 3.75]) qdMap(g, ['.oo.', 'oyyo', 'oYyo', '.oo.'], { o: '#2e2b33', y: '#d0a63c', Y: '#fff0a2' }, lx, G - 12.5);
}

// The banner pole beside the hall, with a gold cap.
function rohanPole(g, m) {
  const x = m + 16;
  const foot = Math.round(rohanHillTop(16.5) * 4) / 4;
  [SHIRE_WOOD[1], SHIRE_WOOD[2], SHIRE_WOOD[3], SHIRE_WOOD[4]].forEach((c, k) => pxBox(g, x + k / 4, GROUND_Y - 30, 0.25, foot - GROUND_Y + 30, c));
  pxBox(g, x + 0.25, GROUND_Y - 30.75, 0.5, 0.25, PAV_GOLD[1]);
  pxBox(g, x, GROUND_Y - 30.5, 1, 0.5, PAV_GOLD[2]);
  qdDot(g, x + 0.25, GROUND_Y - 30.5, PAV_GOLD[0]);
}

// Meduseld, painted into the realm's layer.
function rohanMeduseld(g, r) {
  const { mx } = rohanSite(r);
  rohanPole(g, mx);
  rohanHall(g, mx);
  rohanHill(g, mx);
  rohanStakes(g, mx);
  rohanBasin(g, mx);
}

// The water falling from the spout into the basin, its stream shifting by tick, with a ripple where it lands.
function rohanWater(g, r, tick) {
  const x = rohanSite(r).mx + 7.25;
  for (let y = GROUND_Y - 1; y < GROUND_Y + 1.5; y += 0.25) pxBox(g, x + ((y * 4 + tick) % 3 === 0 ? 0.25 : 0), y, 0.25, 0.25, (y * 4 + tick) % 2 ? '#cfe6ff' : '#8fc3ff');
  qdDot(g, x - 0.5 - (tick % 2) * 0.25, GROUND_Y + 1.5, '#ffffff');
  qdDot(g, x + 0.75 + (tick % 2) * 0.25, GROUND_Y + 1.5, '#cfe6ff');
}

// The pennant on the pole: five units long, tapering to a forked tail, with a white sun near the pole; ripples run
// down it (faster in a gust) and each column is lit or shaded by how it faces, and it flies the way the wind blows.
// cx is the pole's column and top the row of its cap.
function rohanPennant(g, cx, top, tick) {
  const wind = landWind();
  const lean = wind?.at(cx, tick) ?? 0.5;
  const left = (wind?.dir ?? 1) < 0;
  const ph = tick * (0.5 + Math.abs(lean)) * 0.9;
  const [L, B, S, O] = ['#7cc060', '#3f8a3a', '#2c6a30', '#1b4421'];
  for (let k = 0; k < 20; k += 1) {
    const u = k / 20;
    const y0 = Math.round((top + 1.25 + Math.sin(u * 5 - ph) * u * 0.7) * 4) / 4;
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
// What moves at Meduseld each frame: the pennant and the falling water.
function rohanMoving(g, r, tick) {
  rohanPennant(g, rohanSite(r).mx + 16, GROUND_Y - 30.75, tick);
  rohanWater(g, r, tick);
}

// After dark: the four windows and the crack of the doors lit from within, a soft glow along the hall's front, and the
// two lamps on the porch's pillars, each flickering on its own beat with a pool of light on the stair; and the lantern
// by the stables' door (scenery-rohan-stables.js). All of it fades up through dusk.
function rohanLights(g, G, r, tick, dark) {
  if (!G) return;
  const m = rohanSite(r).mx;
  const y = GROUND_Y;
  G.draw(g, m, y - 11, 11, '#ffc45a', 0.3 * dark, { ry: 0.4 });
  for (const w of ROHAN_WINDOWS) G.pane(g, m + w + 0.25, y - 12.25, 1, 1.5, w < 0 ? '#fff0c0' : '#ffb848', 0.85 * dark, y - 8);
  G.pane(g, m - 0.25, y - 13, 0.5, 5, '#ffb848', 0.6 * dark, y - 8);
  for (const [lx, seed] of [[m - 3.75, 11], [m + 4.25, 23]]) {
    G.draw(g, lx, y - 12, 4, '#ffc45a', 0.75 * dark, { flame: r.x0 + seed, pool: [lx, y - 7.5, 5] });
    if (dark > 0.4) pxBox(g, lx - 0.25, y - 12.25, 0.5, 0.5, '#fff3c4');
  }
  rohanStableLight(g, G, r, dark);
}
