// scene-tower.js: the dark tower of the Middle-earth view (scene.js). While main is red it rises out of the haze in the
// east, behind the far mountains and right of the last realm's title, and fades with the red sky (sc.war, scene-orcs.js).
// On its crown, between two horns, a burning Eye looks around: its slit swings toward what it watches and a faint beam
// falls from it on the land, resting on a worker, an orc or open ground for a few seconds before moving on. scenery.js's
// drawBackdrop draws the tower, before the mountains so they hide its foot; scene.js draws the Eye and its beam after the
// night shade, so they glow. With reduced motion the Eye stares straight out and casts no beam. It is all 32-bit, a
// quarter unit to the pixel: black stone in bevelled blocks lit red down the west edge by the sky and cool in the east,
// lipped ledges, spiked shoulders, ridged horns with an ember glint inside, an iris of fire round the slit, and the halo
// and beam in fine steps.
const TOWER_TOP = 30;
// The tiers down from the crown, [first row, width]; the last runs to the ground behind the mountains.
const TOWER_TIERS = [[TOWER_TOP, 11], [42, 13], [56, 17], [72, 23]];
// The stone: Q the brightest rim where a lip meets the red sky, R the rim, r its fall-off; h l m b S D a ramp from the
// lit tops of blocks to the deep shade, warm in the light and cool in the shade; o outline, d mortar and n mortar on the
// lit edge; e and E ember glints where the Eye's fire catches the inside of a horn.
const TOWER_PAL = { Q: '#b0503f', R: '#7e3a3c', r: '#55282e', h: '#4a3331', l: '#36272d', m: '#282029', b: '#1d1821', S: '#141118',
  D: '#0d0b11', o: '#060409', d: '#09070b', n: '#2c1b21', e: '#8a361c', E: '#d0582a' };
const TOWER_RAMP = ['D', 'S', 'b', 'm', 'l', 'h'];
// Slit windows lit from within, [units from the middle column, row].
const TOWER_WINDOWS = [[-2, 34], [2.5, 38], [-3.5, 46], [4, 51], [-6, 61], [5.5, 66], [-2.5, 76], [8, 80]];
// The left horn's spine, a curve in quarter-unit pixels of the tower's map from its root in the crown to its tip: it
// bows out past the crown's shoulder and curls back in over the Eye. The right horn is its mirror.
const TOWER_HORN = [[29, 63], [19, 44], [19, 16], [33, 1]];
// A spike at either corner of a shoulder, lit red on the west one and in shade on the east one; and a tooth every other
// unit between them.
const TOWER_SPIKES = ('R.../...o R.../...o Rh../..So Rh../..So Rl../..Do Rl../..Do Rlb./.SDo Rlb./.SDo Rlbo/bSDo Rlbo/bSDo '
  + 'Rmbo/bSDo Rmbo/bSDo Rmbo/bSDo Rmbo/bSDo Rbbo/bSDo Rbbo/bSDo').split(' ').map((pair) => pair.split('/'));
const TOWER_TOOTH = ['.h..', '.hS.', 'mlSo', 'mlSo', 'mbSo', 'mbSo'];
const eye = { x: 0, w: 0, gx: 0, gy: 0, to: null, hold: 0, at: -99, right: 0, art: null, iris: null };

// Where the tower stands: midway across the room between the last realm's note and the east edge, or hard against the
// edge when there is too little. Measured every couple of seconds, since the notes come, go and change width.
function towerX(scene) {
  if (scene.tick - eye.at < 20 && eye.w === scene.W) return eye.x;
  Object.assign(eye, { at: scene.tick, w: scene.W });
  const titles = scTags.querySelectorAll('.sc-realm');
  const box = scStage.getBoundingClientRect();
  eye.right = titles.length ? Math.max(...[...titles].map((t) => (t.getBoundingClientRect().right - box.left) / scene.scale)) : scene.W - 40;
  const room = scene.W - eye.right;
  eye.x = room >= 20 ? Math.round(eye.right + room / 2) : scene.W - 13;
  return eye.x;
}

// A step of the stone's ramp for a light level, dithered by the ordered pattern only where two steps meet, so the
// faces read as smooth shading rather than speckle.
const towerTone = (L, c, k) => TOWER_RAMP[Math.max(0, Math.min(5, Math.floor(L * 5 + 0.5 + (BAYER[(k & 3) * 4 + (c & 3)] / 16 - 0.5) * 0.7)))];

// One pixel of a tier n pixels wide, c across and k down from its top: the lip (a lit top, its face, a dark underside
// and the shadow it casts, with corbels under it), the red rim and its fall-off on the west edge, shade and outline on
// the east, a groove down the middle of every tier but the crown, and between them blocks three units high and four
// long, staggered, each lit along its top and west edge and shaded along its foot and east edge, set in dark mortar.
function towerStone(c, n, k, i) {
  const u = c / (n - 1);
  if (k === 0) return c === 0 ? 'Q' : c >= n - 2 ? 'S' : u < 0.35 ? 'h' : u < 0.7 ? 'l' : 'm';
  if (k <= 2) return c === 0 ? 'R' : c === n - 1 ? 'o' : towerTone(0.82 - 0.7 * u - (k - 1) * 0.2, c, k);
  if (k === 3) return c === 0 ? 'r' : 'o';
  const corbel = c % 8;
  if (k <= 6 && (corbel === 3 || corbel === 4) && c > 2 && c < n - 3) return k === 6 ? (corbel === 3 ? 'S' : 'o') : corbel === 3 ? 'l' : 'S';
  if (c === 0 || c >= n - 2) return c ? (c === n - 1 ? 'o' : 'D') : 'R';
  if (k <= 5) return k === 4 || (c + k) % 2 ? 'D' : 'S';
  if (i && k >= 8) {
    const gr = c - n / 2;
    if (gr >= -2 && gr <= 1) return ['S', 'o', 'D', 'l'][gr + 2];
  }
  const kk = k - 6;
  const course = Math.floor(kk / 12);
  const rr = kk % 12;
  const cc = (c + (course % 2) * 8 + 4) % 16;
  if (rr === 11 || cc === 15) return c <= 3 ? 'n' : 'd';
  if (c === 1) return 'r';
  let L = 0.74 - 0.78 * u + (rnd(i * 97 + course * 13 + Math.floor((c + (course % 2) * 8 + 4) / 16) * 7) - 0.5) * 0.12;
  L += (rr === 0 ? 0.28 : rr === 10 ? -0.2 : 0) + (cc === 0 ? 0.18 : cc === 14 ? -0.16 : 0);
  if (c === 2) return (k + c) % 2 ? 'r' : towerTone(L, c, k);
  return towerTone(L, c, k);
}

// The two horns: each pixel near the spine takes its place along it (t, root to tip) and across it (u, +1 on the
// outer edge, -1 on the inner one facing the Eye). The left horn is lit red on its outer edge and shaded inside; the
// right is in shade outside and lit inside; both carry ridges every few pixels and an ember glint inside, brightest
// level with the Eye, and taper to a point.
function towerHorns(m) {
  const P = TOWER_HORN;
  const pts = [];
  for (let j = 0; j <= 240; j += 1) {
    const t = j / 240;
    const s = 1 - t;
    const at = (a) => s * s * s * P[0][a] + 3 * s * s * t * P[1][a] + 3 * s * t * t * P[2][a] + t * t * t * P[3][a];
    pts.push([at(0), at(1), t]);
  }
  for (let r = 0; r < 68; r += 1) {
    for (let c = 6; c < 44; c += 1) {
      let best = 0;
      let bd = Infinity;
      pts.forEach(([x, y], j) => { const d = (x - c - 0.5) ** 2 + (y - r - 0.5) ** 2; if (d < bd) { bd = d; best = j; } });
      const [[x, y, t], [x2, y2], [x1, y1]] = [pts[best], pts[Math.min(240, best + 1)], pts[Math.max(0, best - 1)]];
      const w = 0.6 + 4.4 * (1 - t) ** 1.15;
      if (Math.sqrt(bd) > w) continue;
      const [dx, dy] = [x2 - x1, y2 - y1];
      const u = ((c + 0.5 - x) * dy - (r + 0.5 - y) * dx) / Math.hypot(dx, dy) / w;
      const ridge = t > 0.08 && t < 0.9 ? (t * 13) % 1 : 0.5;
      const glint = t > 0.12 && t < 0.78 && u < -0.6 ? (t > 0.3 && t < 0.62 && u < -0.8 ? 'E' : 'e') : null;
      const left = glint ?? (u > 0.72 ? 'R' : u > 0.3 ? 'l' : u > -0.2 ? 'm' : u > -0.62 ? 'b' : 'o');
      const right = glint ?? (u > 0.72 ? 'o' : u > 0.3 ? 'D' : u > -0.2 ? 'S' : u > -0.62 ? 'b' : 'm');
      const tone = (ch) => (glint ? ch : ridge < 0.13 ? { R: 'r', l: 'm', m: 'b', b: 'S', S: 'D', D: 'o' }[ch] ?? ch : ridge < 0.24 ? { m: 'l', b: 'm', S: 'b' }[ch] ?? ch : ch);
      for (const [col, ch] of [[c, tone(left)], [91 - c, tone(right)]]) if (r < 60 || m[r][col] === '.') m[r][col] = ch;
    }
  }
}

// The whole tower as a pixel map, 23 units across (the middle between columns 45 and 46) from 15 units over the crown
// down to the ground: the tiers, the horns, a spiked tooth every other unit along each shoulder and a tall spike at each
// corner below the crown, then the dark recess of each window with a lit sill.
function towerRows() {
  const top = TOWER_TOP - 15;
  const m = Array.from({ length: (GROUND_Y - top) * 4 }, () => Array(92).fill('.'));
  const put = (c, r, row) => [...row].forEach((ch, j) => { if (ch !== '.' && m[r]?.[c + j] === '.') m[r][c + j] = ch; });
  TOWER_TIERS.forEach(([y, w], i) => {
    const r0 = (y - top) * 4;
    const r1 = ((TOWER_TIERS[i + 1]?.[0] ?? GROUND_Y) - top) * 4;
    for (let r = r0; r < r1; r += 1) for (let c = 0; c < w * 4; c += 1) m[r][46 - 2 * w + c] = towerStone(c, w * 4, r - r0, i);
  });
  towerHorns(m);
  TOWER_TIERS.forEach(([y, w], i) => {
    const r0 = (y - top) * 4;
    const c0 = 46 - 2 * w;
    const n = w * 4;
    if (i) TOWER_SPIKES.forEach(([west, east], k) => { put(c0, r0 - 16 + k, west); put(c0 + n - 4, r0 - 16 + k, east); });
    for (const c of [...Array(Math.ceil(n / 8) - 1).keys()].map((k) => k * 8).concat(n - 4)) {
      TOWER_TOOTH.forEach((row, k) => put(c0 + c, r0 - 6 + k, !c ? row.replace('m', 'R') : c === n - 4 ? row.replace(/[hl]/g, 'S').replace('m', 'b') : row));
    }
  });
  for (const [dx, y] of TOWER_WINDOWS) {
    const [c, r] = [(dx + 11) * 4 - 1, (y - top) * 4 - 2];
    ['.oo.', 'oDDo', 'oDDo', 'oDDo', 'oDDo', 'oDDo', 'oDDo', 'oDDo', 'hlmS'].forEach((row, k) => [...row].forEach((ch, j) => { if (ch !== '.') m[r + k][c + j] = ch; }));
  }
  return m.map((row) => row.join(''));
}

// The tower, painted once into a canvas of its own at the scene's resolution and laid down whole each frame, so it
// fades with the war as one piece; then its windows, each flickering on its own, lit hottest at the foot of the slit.
function drawTower(g, scene) {
  const cx = towerX(scene);
  const H = GROUND_Y - TOWER_TOP + 15;
  if (!eye.art) {
    eye.art = document.createElement('canvas');
    eye.art.width = 23 * SC_RES;
    eye.art.height = H * SC_RES;
    const t = eye.art.getContext('2d');
    t.scale(SC_RES, SC_RES);
    qdMap(t, towerRows(), TOWER_PAL, 0, 0);
  }
  g.save();
  g.globalAlpha = scene.war;
  g.imageSmoothingEnabled = false;
  g.drawImage(eye.art, cx - 11, TOWER_TOP - 15, 23, H);
  TOWER_WINDOWS.forEach(([dx, y], i) => {
    g.globalAlpha = scene.war * (0.55 + 0.45 * rnd(i * 7 + Math.floor(scene.tick / 4)));
    pxBox(g, cx + dx, y - 0.25, 0.5, 0.25, '#7a2210');
    pxBox(g, cx + dx, y, 0.5, 0.75, '#d8401a');
    pxBox(g, cx + dx, y + 0.75, 0.5, 0.75, '#ff8a2a');
    pxBox(g, cx + dx + 0.25, y + 1.25, 0.25, 0.25, '#ffd27a');
  });
  g.restore();
}

// The next thing the Eye watches: a worker half the time, an orc of the swarm when there is one, or else open ground.
function eyeTarget(scene) {
  const workers = [...scene.actors.values()];
  const swarm = orcs.swarm.filter((o) => !o.flee);
  const roll = Math.random();
  if (workers.length && roll < 0.5) return workers[Math.floor(Math.random() * workers.length)];
  if (swarm.length && roll < 0.8) return swarm[Math.floor(Math.random() * swarm.length)];
  return { x: 8 + Math.random() * (scene.W - 16), y: GROUND_Y + 8 + Math.random() * (SCENE_H - GROUND_Y - 12) };
}

// Moves the gaze: it sweeps toward what it watches, slowing as it nears, keeps on it while it moves, then picks another.
function eyeStep(scene) {
  if (!eye.to) {
    eye.to = eyeTarget(scene);
    if (!eye.gx) Object.assign(eye, { gx: eye.to.x, gy: eye.to.y });
  }
  const [dx, dy] = [eye.to.x - eye.gx, eye.to.y - 3 - eye.gy];
  const d = Math.hypot(dx, dy);
  if (d > 1) {
    const v = Math.min(6, Math.max(1, d * 0.14));
    eye.gx += (dx / d) * v;
    eye.gy += (dy / d) * v;
    return;
  }
  // Arrived: it rests here two to five seconds.
  if (!eye.hold) eye.hold = 20 + Math.floor(Math.random() * 30);
  eye.hold -= 1;
  if (!eye.hold) eye.to = null;
}

// The Eye's picture in quarter-unit pixels: the almond, 9 units by 5 (36 by 20), its half-width row by row, pointed at
// either corner; a margin round it for the tongues of flame; and its fire from white heat beside the slit out to the
// deep red at its rim.
const EYE_ROWS = Array.from({ length: 20 }, (_, r) => Math.round(18 * (1 - Math.abs((r + 0.5) / 10 - 1)) ** 0.4));
const EYE_FIRE = ['#fffbe2', '#fff1a8', '#ffd65a', '#ffaa30', '#ff7a1a', '#f0521a', '#c0320e'].map((h) => [...rgbOf(h), 255]);
const [EYE_MX, EYE_MT, EYE_MB] = [10, 16, 6];

// Paints the Eye for this frame: each pixel of the almond takes a ring of fire by its distance from the slit, rippled
// by fibres raying out from it that shift every few frames and a waver frame to frame, dithered where two rings meet; a dark red rim; the slit
// itself, black between dark red lips, four pixels wide at its middle and pointed at its ends, p pixels off the middle
// toward what the Eye watches; and tongues of flame licking up from the rim, each its own height.
function eyeArt(p, tick, still) {
  eye.iris ??= Object.assign(document.createElement('canvas'), { width: 36 + EYE_MX * 2, height: 20 + EYE_MT + EYE_MB });
  const W = eye.iris.width;
  const img = new ImageData(W, eye.iris.height);
  const set = (x, y, c) => img.data.set(c, (y * W + x) * 4);
  const sx = 18 + p;
  const wob = still ? 0 : tick;
  const inside = (x, y) => y >= 0 && y < 20 && Math.abs(x + 0.5 - 18) <= EYE_ROWS[y];
  for (let y = 0; y < 20; y += 1) {
    const hw = EYE_ROWS[y];
    for (let x = 18 - hw; x < 18 + hw; x += 1) {
      const [dx, dy] = [x + 0.5 - sx, y + 0.5 - 10];
      const fibre = rnd(Math.floor((Math.atan2(dy, dx) / Math.PI + 1) * 15) * 7 + Math.floor(wob / 3) * 3) - 0.5;
      const d = Math.hypot(dx / 17, dy / 10.5) * (1 + fibre * 0.16) + (still ? 0 : (rnd(x * 31 + y * 7 + Math.floor(tick / 2) * 13) - 0.5) * 0.05);
      const rim = x === 18 - hw || x === 18 + hw - 1 || y === 0 || y === 19;
      const band = Math.floor(d * 6.4 + BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.3);
      set(x + EYE_MX, y + EYE_MT, rim ? [106, 20, 8, 255] : EYE_FIRE[Math.max(0, Math.min(6, band))]);
    }
    const half = Math.abs(y + 0.5 - 10) < 3.5 ? 2 : Math.abs(y + 0.5 - 10) < 8 ? 1 : 0;
    const lips = half ? [sx - half - 1, sx + half] : [sx - 1, sx];
    for (let x = lips[0]; x <= lips[1]; x += 1) {
      if (!inside(x, y)) continue;
      const lip = half && (x === lips[0] || x === lips[1]);
      set(x + EYE_MX, y + EYE_MT, !half ? [106, 20, 8, 255] : lip ? [74, 10, 6, 255] : [12, 3, 4, 255]);
    }
  }
  // The tongues: their feet along the almond's upper rim and out at its corners, licking up, hot at the foot and red at
  // the tip, tallest over the middle.
  const FLAME = [[255, 214, 90], [255, 154, 48], [240, 90, 26], [176, 36, 10]];
  for (let i = 0; i < 18; i += 1) {
    const fx = Math.floor(rnd(i * 5 + Math.floor(wob / 2) * 17) * 40) - 2;
    let fy = 10;
    while (fy > 0 && inside(fx, fy - 1)) fy -= 1;
    if (!inside(fx, fy)) fy = 9;
    const h = Math.round((2 + rnd(i * 3 + wob) * 6) * (1.3 - Math.abs(fx - 18) / 30));
    for (let k = 1; k <= h; k += 1) {
      for (const x of k <= h / 2 ? [fx, fx + 1] : [fx + (k % 3 === 2 ? 1 : 0)]) {
        const y = fy - k;
        if (inside(x, y) || x < -EYE_MX || x >= 36 + EYE_MX || y < -EYE_MT) continue;
        set(x + EYE_MX, y + EYE_MT, [...FLAME[Math.min(3, Math.floor(((k - 1) / h) * 4))], 255]);
      }
    }
  }
  eye.iris.getContext('2d').putImageData(img, 0, 0);
  return eye.iris;
}

// The Eye between the horns: a halo laid on in fine dithered steps (scene-glow.js's, so it brightens the sky behind it),
// the almond, its slit and its flames; and its beam down to the spot it watches.
function drawEye(g, scene, tick) {
  const still = scReduced.matches;
  const ex = towerX(scene);
  const ey = TOWER_TOP - 9;
  if (!still) eyeStep(scene);
  const war = scene.war;
  if (!still) drawBeam(g, ex, ey, eye.gx, eye.gy, war * (scene.sky.night ? 0.2 : 0.15));
  if (typeof glowPaint === 'function') {
    glowPaint(g, ex + 0.5, ey + 0.5, 12, 7, '#ff6a1a', 0.5 * war);
    glowPaint(g, ex + 0.5, ey + 0.5, 7, 4, '#ffb347', 0.35 * war);
  }
  // The slit leans toward what it watches, a pixel for every 15 units across, up to two units either way.
  const p = still ? 0 : Math.max(-8, Math.min(8, Math.round((eye.gx - ex) / 15)));
  g.globalAlpha = war;
  g.drawImage(eyeArt(p, tick, still), ex - 4 - EYE_MX / 4, ey - 2 - EYE_MT / 4, 14, 10.5);
  g.globalAlpha = 1;
}

// A cone of pale fire from the Eye, widening toward the ground, in three layers from a faint fringe to a bright core,
// each one filled shape whose edges step a quarter unit at a time, so they run smooth; and a pool of light where it
// lands, laid on like any other light.
function drawBeam(g, ex, ey, gx, gy, alpha) {
  const rows = gy - ey - 3;
  if (rows < 4) return;
  const n = Math.round(rows * 4);
  const q = (v) => Math.round(v * 4) / 4;
  for (const [a, w, color] of [[alpha * 0.6, 7, '#ff9a3a'], [alpha * 0.8, 4.5, '#ffb347'], [alpha * 1.2, 1.5, '#ffd27a']]) {
    Object.assign(g, { globalAlpha: a, fillStyle: color }).beginPath();
    const right = [];
    for (let r = 0; r <= n; r += 1) {
      const t = r / n;
      const x = ex + 0.5 + (gx - ex - 0.5) * t;
      const [L, R, y] = [q(x - 0.125 - t * w), q(x + 0.125 + t * w), ey + 3 + r / 4];
      if (r) g.lineTo(L, y); else g.moveTo(L, y);
      g.lineTo(L, y + 0.25);
      right.push([Math.max(R, L + 0.25), y]);
    }
    for (let k = right.length - 1; k >= 0; k -= 1) { g.lineTo(right[k][0], right[k][1] + 0.25); g.lineTo(right[k][0], right[k][1]); }
    g.fill();
  }
  g.globalAlpha = 1;
  if (typeof glowPaint === 'function') glowPaint(g, gx, gy + 0.5, 7.5, 2.4, '#ffb347', alpha * 2.4);
}
