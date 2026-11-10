// sprites-hd.js: the parts every people shares in the Middle-earth view's 32-bit figures, drawn on scene.js's canvas
// of SC_RES (4) detail pixels per unit, a quarter unit per pixel. Each worker's hair, cloth, skin and helm come from
// sprites.js's lists as before, stretched here into ramps of six steps whose hue turns warm in the light and cool in the
// shade, with an outline in each material's own darkest hue; light comes from the upper left. A people in HD_PEOPLE
// (sprites-hd-folk.js and sprites-qd.js) gives its head, body and legs as pixel maps, one character per quarter-unit
// pixel, in the same places and sizes as before, so bubbles, names, clicks, hands and tools still fit. Each part is drawn
// once per worker and pose into a small canvas and stamped from there, so a frame costs a few image draws a figure. This
// file also keeps the shared helpers other files use (hdMix, hdMap, qdMap) and the walk, swing, blink and breath
// timing. Loaded after sprites.js.

const HD_DARK = '#140d1e';
const HD_LIGHT = '#fff4d6';
const hdRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hdMix = (a, b, t) => `#${hdRgb(a).map((v, i) => Math.round(v + (hdRgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('')}`;

// Hue, saturation and lightness, and back, for the ramps.
function hdHsl(hex) {
  const [r, g, b] = hdRgb(hex).map((v) => v / 255);
  const hi = Math.max(r, g, b);
  const lo = Math.min(r, g, b);
  const l = (hi + lo) / 2;
  if (hi === lo) return [0, 0, l];
  const d = hi - lo;
  const h = hi === r ? (g - b) / d + (g < b ? 6 : 0) : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, l > 0.5 ? d / (2 - hi - lo) : d / (hi + lo), l];
}
function hdHex(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = Math.min(1, s) * Math.min(l, 1 - l);
  return `#${[0, 8, 4].map((n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)))).toString(16).padStart(2, '0')).join('')}`;
}
// Turns hue h toward hue t by up to d degrees, the shorter way round.
const hdTurn = (h, t, d) => { const diff = ((t - h + 540) % 360) - 180; return (h + Math.sign(diff) * Math.min(Math.abs(diff), d) + 360) % 360; };
// Six steps from a colour and its shade: outline, deep, shade, base, light and shine. The shades turn toward blue and the
// lights toward warm yellow; a grey takes a cool tint in its shade and a warm one in its light, and a dark colour a
// fainter shine, so black hair stays black.
function hdRamp(base, shade) {
  const [h, s, l] = hdHsl(base);
  const [h2, s2, l2] = hdHsl(shade);
  const grey = s < 0.1;
  const cool = (d, k) => (grey ? [230, Math.max(s2, k)] : [hdTurn(h2, 235, d), Math.min(1, s2 * (1 + k))]);
  const warm = (d, k) => (grey ? [45, Math.max(s, k)] : [hdTurn(h, 50, d), s * (1 - k)]);
  const lift = l < 0.3 ? [0.14, 0.3] : [0.3, 0.58];
  return [hdHex(...cool(24, 0.14), l2 * 0.3), hdHex(...cool(14, 0.08), l2 * 0.66), hdHex(...cool(6, 0.04), l2), base,
    hdHex(...warm(8, 0.06), l + (1 - l) * lift[0]), hdHex(...warm(14, 0.12), l + (1 - l) * lift[1])];
}

// One worker's colours, by map character: hair o a b c d e (outline, deep, shade, base, light, shine); cloth O 1 2 3 4 5
// the same; skin p q r s t (outline to light) and u blush; helm and iron 6 7 8 9 0 # (outline to shine); eyes w x (white
// and its shade), i j (iris light and dark), k (lash and pupil), * glint; mouth v and lip z; gold G g y Y + (outline,
// shade, base, light, glint) and a gem m n; cream W V U (light, base, shade) and X its outline; leather D E F H
// (outline, dark, base, light); bone T B. key names the set, for the stamp cache.
const hdPals = new Map();
function hdPal(hair, hairD, cloth, clothD, skin, skinD, helm, helmD, eye) {
  const key = [hair, hairD, cloth, clothD, skin, skinD, helm, helmD, eye].join();
  if (!hdPals.has(key)) {
    const P = { key, w: '#f8f6ef', x: '#c4ccd8', k: '#231a2c', '*': '#ffffff', i: hdMix(eye, '#ffffff', 0.35), j: hdMix(eye, '#10131c', 0.3),
      v: hdMix(skinD, '#7a2e2a', 0.5), z: hdMix(skin, '#e0796a', 0.4), u: hdMix(skin, '#e8604c', 0.3),
      G: '#6b4317', g: '#b9822a', y: '#e9b746', Y: '#fde08a', '+': '#fffbe8', m: '#2c6fb5', n: '#a9e2ff',
      W: '#fbf4e0', V: '#e6dcc0', U: '#bfb08e', X: '#7d7058', D: '#2a1a14', E: '#4a3024', F: '#7b5a3c', H: '#a5825c', T: '#f1ead0', B: '#b9ab84' };
    [['oabcde', hair, hairD], ['O12345', cloth, clothD], ['pqrst', skin, skinD], ['67890#', helm, helmD]].forEach(([keys, a, b]) => {
      const ramp = hdRamp(a, b);
      [...keys].forEach((ch, i) => { P[ch] = ramp[i]; });
    });
    hdPals.set(key, P);
  }
  return hdPals.get(key);
}

// Draws a pixel map in half units (or px units a pixel) with its top-left at (x, y), one fillRect per run of a colour
// along a row; any character not in pal is clear.
function hdMap(g, rows, pal, x, y, px = 0.5) {
  rows.forEach((row, r) => {
    let c = 0;
    while (c < row.length) {
      let e = c + 1;
      while (e < row.length && row[e] === row[c]) e += 1;
      if (pal[row[c]]) { g.fillStyle = pal[row[c]]; g.fillRect(x + c * px, y + r * px, (e - c) * px, px); }
      c = e;
    }
  });
}
// The same in quarter units, one character per pixel of the 32-bit grid (scene.js's SC_RES of 4).
const qdMap = (g, rows, pal, x, y) => hdMap(g, rows, pal, x, y, 0.25);

// Each part's map (by its key) and its stamp in each worker's colours: a canvas at 4 pixels a unit, drawn with its
// top-left at (x, y) units. On scene.js's canvas, smoothing off, a stamp lands pixel for pixel.
const hdRows = new Map();
const hdStamps = new Map();
function hdStamp(g, P, key, build, x, y) {
  let s = hdStamps.get(P.key + key);
  if (!s) {
    if (!hdRows.has(key)) hdRows.set(key, build());
    const rows = hdRows.get(key);
    const c = document.createElement('canvas');
    c.width = Math.max(1, ...rows.map((r) => r.length));
    c.height = Math.max(1, rows.length);
    hdMap(c.getContext('2d'), rows, P, 0, 0, 1);
    s = { c, w: c.width / 4, h: c.height / 4 };
    hdStamps.set(P.key + key, s);
  }
  g.drawImage(s.c, x, y, s.w, s.h);
}

// A grid of characters to compose a part in: put writes a string at (row, col), skipping '.', so later strokes cover
// earlier ones; a space clears.
function qdGrid(w, h) {
  const cells = Array.from({ length: h }, () => Array(w).fill('.'));
  return {
    cells,
    put(r, c, s) { if (r >= 0 && r < h) [...s].forEach((ch, k) => { if (ch !== '.' && c + k >= 0 && c + k < w) cells[r][c + k] = ch; }); },
    all(r, c, rows) { rows.forEach((s, k) => this.put(r + k, c, s)); },
    rows() { return cells.map((row) => row.join('')); },
  };
}
// Walks the cells of a line from (r0, c0) to (r1, c1), calling fn for each.
function qdWalk(r0, c0, r1, c1, fn) {
  const [dr, dc, sr, sc0] = [Math.abs(r1 - r0), Math.abs(c1 - c0), r0 < r1 ? 1 : -1, c0 < c1 ? 1 : -1];
  let err = dc - dr;
  for (let i = 0; i <= dr + dc; i += 1) {
    fn(r0, c0);
    if (r0 === r1 && c0 === c1) return;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c0 += sc0; }
    if (e2 < dc) { err += dc; r0 += sr; }
  }
}
// A limb or rod down a line: where it runs down, the ramp lies across it from left to right (at columns from at); where
// it runs across, from top to bottom (at rows from at).
function qdRod(G, r0, c0, r1, c1, ramp, at) {
  const down = Math.abs(r1 - r0) >= Math.abs(c1 - c0);
  qdWalk(r0, c0, r1, c1, (r, c) => (down ? G.put(r, c + at, ramp) : [...ramp].forEach((ch, k) => G.put(r + at + k, c, ch))));
}

// A run across a shape w pixels wide centred on column mid: its left end L, its middle filled with the pattern m, its
// right end R.
// Hoods, hats, helms and beards are built a row at a time from these.
function qdSpan(G, r, mid, w, L, m, R) {
  const n = Math.max(0, w - L.length - R.length);
  G.put(r, Math.round(mid - w / 2), L + m.repeat(n).slice(0, n) + R);
}

// Hands, 4 pixels square: hanging with the fingers parted by shade, or closed in a fist round a grip; the near (left)
// hand lit, the far one in shade.
const HD_HANDS = {
  L: ['tssr', 'tssr', 'srsq', 'r.rq'], R: ['srrq', 'srrq', 'rqrp', 'q.qp'],
  fistL: ['.ts.', 'tssr', 'tsrq', '.rqp'], fistR: ['.sr.', 'srrq', 'srqp', '.qp.'],
};

// An arm as sprites.js's arm draws it: a sleeve down one column from row from to row to and the hand at row hand,
// hanging below the sleeve or raised above it. A hanging arm on a walk swings by s, bent at the elbow: forward (1), its
// hand a unit higher and half a unit in across the body, or back (-1), half a unit higher and half a unit out. The
// people's arm A gives its sleeve's ramp (L lit, R shaded, five pixels with the outline on the outer side), whether
// it flares to a bell at the wrist, and its cuff's light, dark and edge colours.
function hdArmRows(A, left, h, dh, s) {
  const hu = dh - (s > 0 ? 1 : s ? 0.5 : 0);
  const top = Math.min(0, hu);
  const G = qdGrid(14, (Math.max(h, hu + 1) - top) * 4 + 2);
  const r0 = 1 - top * 4;
  const hr = r0 + hu * 4;
  const up = hu < 0;
  const dx = (left ? s : -s) * 2;
  const end = up ? r0 + h * 4 : hr;
  const [cl, cd, ce] = A.cuff;
  for (let r = r0; r < end; r += 1) {
    const c = 4 + (!s || r < r0 + 6 ? 0 : r < r0 + 8 ? dx / 2 : dx);
    const bell = A.bell && !up && r >= end - 5 ? 1 : 0;
    const cuff = up ? r - r0 : r - end + 2;
    if (cuff === 0 || cuff === 1) {
      const band = cuff ? cd.repeat(4) : `${cl}${cl}${cl}${cd}`;
      G.put(r, left ? c - 1 - bell : c, left ? ce.repeat(1 + bell) + band : band + ce.repeat(1 + bell));
    } else if (r - r0 < 2 && !up) {
      // The shoulder rounds into the arm: its outline steps out over the first two rows.
      const k = r - r0;
      G.put(r, c, left ? (k ? A.L[0] + A.L.slice(1, 4) : A.L[0] + A.L[0] + A.L.slice(2, 4)) : k ? A.R.slice(0, 3) + A.R[4] : A.R.slice(0, 2) + A.R[4] + A.R[4]);
    }
    else if (left) G.put(r, c - 1 - bell, bell ? A.L[0] + A.L[1] + A.L.slice(1) : A.L);
    else G.put(r, c, bell ? A.R.slice(0, 4) + A.R[3] + A.R[4] : A.R);
  }
  G.all(hr, 4 + (up ? 0 : dx), HD_HANDS[(up ? 'fist' : '') + (left ? 'L' : 'R')]);
  return G.rows();
}
function hdArm(g, P, hd, ax, from, to, hand, left, s = 0) {
  const y0 = Math.min(from, to);
  const h = Math.abs(to - from) + 1;
  const hu = hand - y0 - (s > 0 ? 1 : s ? 0.5 : 0);
  hdStamp(g, P, `arm${hd.kind}${left ? 'L' : 'R'}${h},${hand - y0},${s}`, () => hdArmRows(hd.arm, left, h, hand - y0, s), ax - 1, y0 + Math.min(0, hu) - 0.25);
}
// An arm held straight out ahead, len units from x at row y, as a striking arm: the sleeve lit along its top, its cuff,
// and the fist at its end.
function hdReach(g, P, hd, x, y, len) {
  hdStamp(g, P, `reach${hd.kind}${len}`, () => {
    const G = qdGrid(len * 4 + 4, 5);
    const [cl, cd, ce] = hd.arm.cuff;
    for (let c = 0; c < len * 4; c += 1) [...(c >= len * 4 - 2 ? cl + cl + cd + cd + ce : hd.arm.L.slice(1) + hd.arm.R[4])].forEach((ch, r) => G.put(r, c, ch));
    G.all(0, len * 4, HD_HANDS.fistR);
    return G.rows();
  }, x, y);
}
// A sleeve through the cells from (x0, y0) to (x1, y1), and a fist in the unit at (x, y), for the poses of
// sprites-work.js, sprites-chores.js and sprites-horse.js (as f.sleeve and f.hand): the same ramp and width as the arms.
function hdSleeve(g, P, hd, x0, y0, x1, y1, left) {
  const [mx, my] = [Math.min(x0, x1), Math.min(y0, y1)];
  hdStamp(g, P, `sl${hd.kind}${left ? 'L' : 'R'}${x0 - mx},${y0 - my},${x1 - mx},${y1 - my}`, () => {
    const G = qdGrid((Math.abs(x1 - x0) + 1) * 4 + 2, (Math.abs(y1 - y0) + 1) * 4 + 2);
    const down = Math.abs(y1 - y0) >= Math.abs(x1 - x0);
    const ramp = down ? (left ? hd.arm.L : hd.arm.R) : left ? hd.arm.L.slice(1) + hd.arm.R[4] : hd.arm.R;
    // It runs from the near edge of its first cell to the far edge of its last along its main direction, so one cell
    // is a whole unit of sleeve.
    const ends = (a, b, m, main) => (main ? (b >= a ? [(a - m) * 4 + 1, (b - m) * 4 + 4] : [(a - m) * 4 + 4, (b - m) * 4 + 1]) : [(a - m) * 4 + 3, (b - m) * 4 + 3]);
    const [r0, r1] = ends(y0, y1, my, down);
    const [c0, c1] = ends(x0, x1, mx, !down);
    qdRod(G, r0, c0, r1, c1, ramp, down && left ? -3 : -2);
    return G.rows();
  }, mx - 0.25, my - 0.25);
}
const hdHand = (g, P, x, y, left) => hdStamp(g, P, left ? 'fistL' : 'fistR', () => HD_HANDS[left ? 'fistL' : 'fistR'], x, y);

// The swing's in-between (frame 0.5): the working arm thrown up and forward at a slant, halfway from raised to striking,
// its fist at (ax + 1.5, top - 1) where sprites-gear.js's drawTool draws the tool's in-between.
function hdMidArm(g, P, hd, ax, top) {
  hdStamp(g, P, `mid${hd.kind}`, () => {
    const G = qdGrid(16, 16);
    qdRod(G, 13, 4, 5, 9, hd.arm.R, -2);
    G.all(1, 8, HD_HANDS.fistR);
    return G.rows();
  }, ax - 0.5, top - 1.25);
  return { x: ax + 1.5, y: top - 1, up: false, mid: true };
}

// Legs in breeches or trousers, n pixels tall: S gives the map's width W, each leg's first column (at) and its ramp (L
// lit, R shaded), the boots or feet (bootL, bootR, each a few rows, set bootX from the leg), and how far a striding foot
// lifts. On a stride (step 0 or 1) that leg's foot lifts and its leg shortens; a leg shorter than its boot shows only
// the boot.
function hdLegs(n, step, S) {
  const G = qdGrid(S.W, n);
  [0, 1].forEach((i) => {
    const boot = i ? S.bootR : S.bootL;
    const b0 = n - boot.length - (step === i ? S.lift : 0);
    for (let r = 0; r < b0; r += 1) G.put(r, S.at[i], i ? S.R : S.L);
    G.all(b0, S.at[i] + S.bootX[i], boot);
  });
  return G.rows();
}

// A people's finer parts, for sprites.js's HD_PEOPLE: head(shut) the map over its head's 8 units across (up rows of it
// above the head's top), body(n) and legs(n, step) the torso's and legs' maps for their heights in pixels (step a
// walk's frame: 0 or 1 striding, 0.5 or 1.5 passing, -1 or 2 standing), set legsX and legsY units from where sprites.js
// puts the legs; arm its sleeves (hdArmRows). sway lists the head's rows [from, to) that trail back on a walk's stride
// (hair, a hood's skirt, a beard's end, a hat's tip): a pixel at first and two further down.
function hdPeople(kind, def) { HD_PEOPLE[kind] = { kind, up: 0, legsX: 0, legsY: 0, sway: [], ...def }; }
function hdHeadRows(hd, shut, trail) {
  return hd.head(shut).map((row, r) => {
    const band = trail && hd.sway.find(([a, b]) => r >= a && r < b);
    const k = band ? (r - band[0] < (band[1] - band[0]) / 3 ? 1 : 2) : 0;
    return '..'.slice(k) + row + '..'.slice(2 - k);
  });
}
// Draws a people's head with the left edge of its 8 units at x and its top (under any hat) at row y: eyes shut or open,
// the loose rows trailing or not.
function hdHead(g, hd, P, x, y, shut, trail) {
  hdStamp(g, P, `head${hd.kind}${shut ? 1 : 0}${trail ? 1 : 0}`, () => hdHeadRows(hd, shut, trail), x - 0.5, y - hd.up / 4);
}
// A face 14 pixels wide and 12 tall under the brows: lashed eyes with whites, an iris and a glint, a nose lit on its
// left, blush, a mouth and a chin. Shut, the lids close in a line that dips at the outer corners.
const HD_FACE = ['sssssttsssssss', 'skkkkstsskkkks', 'sk*jwstssw*jks', 'sxijxstrsxijxs', 'strrsstrssrrrr', 'stuussttrsuurr',
  'sssssrqsssssrq', 'ssssssvvsssssq', 'psssssszsssrpp', 'ppsstsssrqpp..', '..pppppppp....'];
const hdShut = (rows) => rows.map((row, r) => (r === 1 ? row.replace(/k/g, 's') : r === 2 ? 'srpppstssppprs' : r === 3 ? row.replace(/[xij]/g, 's') : row));

// The frames of a walk, k ticks a step: a stride (0, the back leg's foot lifted), passing (0.5, both feet down, the
// legs straight and the body half a unit up), the other stride (1) and passing again (1.5). Frames 0 and 1 mean what
// they always did, so a caller that knows only those still draws a walk, and 2 still stands still in a pose that steps.
const hdWalkFrame = (t, k = 2) => (Math.floor(t / k) % 4) / 2;
// The frames of a work or fight swing over 2k ticks: raised (0) for k ticks, one tick swinging through (0.5), then
// striking (1).
const hdSwingFrame = (t, k) => (t % (2 * k) < k ? 0 : t % (2 * k) === k ? 0.5 : 1);
// Idle life, only on the scene's own canvas while it moves: an avatar drawn elsewhere and the still frame of reduced
// motion keep their eyes open and their breath held. A figure blinks for a tick every 4 to 6 seconds, at a rhythm of its
// own (n, its name's hash) and now and then twice; a sleeper breathes in for 15 ticks, its chest and head a quarter
// unit up, and out for 20.
const hdLive = (g) => typeof scG !== 'undefined' && g === scG && !scReduced.matches;
function hdBlink(g, n) {
  if (!hdLive(g)) return false;
  const every = 40 + (n % 21);
  const t = (sc.tick + n) % every;
  return t === 0 || (t === 2 && Math.floor((sc.tick + n) / every) % 3 === 0);
}
const hdBreath = (g, n) => (hdLive(g) && (sc.tick + n) % 35 < 15 ? 0.25 : 0);
