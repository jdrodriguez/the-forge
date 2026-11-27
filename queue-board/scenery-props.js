// scenery-props.js: the props the Middle-earth workers use on their rounds (scene-work.js), and where each realm has room
// for them. Erebor has rocks of ore and a rock of gems at the foot of its wall and a chest whose pile of gems grows over
// the session; the Shire a brewing kettle with a barrel and a cart that fills with vegetables; Rivendell a rack of scrolls
// under the pavilion and a straw target; Rohan's are scenery-rohan-props.js's. Each prop is placed from its
// realm's own layout, so it clears the stations, the landmarks and the other props at any width, and so does the spot
// where a worker stands to use it; a prop that finds no room is left out, and so is the work that needs it. The props
// are drawn as depth-sorted items (scene-work.js), so a worker in front of one hides it. Also elfTrees, the trees of
// Rivendell, which scenery.js draws and the elves tend, and the Shire's gardens (drawGardens, in scenery-props-hd.js),
// which scenery.js draws and realmProps keeps the props off. Later files add props of their own through PROP_MORE (a
// realm kind's extra placement, given fit) and PROP_DRAW (a prop type's own drawing). The art is in scenery-props-hd.js
// and scenery-props-qd.js (with the mist over an unreachable realm). Loaded after scenery.js and sprites-work.js.
const PROP_MORE = {};
// More hooks of the same kind, any number per people, for files that add props of their own (scenery-shire.js's trees).
const PROP_LATE = {};
const PROP_DRAW = {};

// The props are drawn in half units, like the figures (sprites-hd.js). propRamp gives a material's four colours, from
// its base colour c, to the characters of keys in order: highlight, base, shade and an outline of its own hue (a '.'
// skips one), plus any extra entries. propMap draws a pixel map with hdMap, mirrored left to right when mirror is set;
// each map's mirror image is made once and kept, so it takes the art's constant maps only.
function propRamp(c, keys, extra = {}) {
  const shade = hdMix(c, HD_DARK, 0.32);
  const ramp = [hdMix(c, HD_LIGHT, 0.3), c, shade, hdMix(shade, HD_DARK, 0.6)];
  const pal = {};
  [...keys].forEach((k, i) => { if (k !== '.') pal[k] = ramp[i]; });
  return Object.assign(pal, extra);
}
// propStrip draws a unit-wide upright as two half-unit strips, lit on the left: a post, a rope, a crank's arm.
const propStrip = (g, x, y, h, lit, dark) => { pxBox(g, x, y, 0.5, h, lit); pxBox(g, x + 0.5, y, 0.5, h, dark); };
const PROP_MIRROR = new Map();
function propMap(g, rows, pal, x, y, mirror = false) {
  if (mirror && !PROP_MIRROR.has(rows)) PROP_MIRROR.set(rows, rows.map((row) => [...row].reverse().join('')));
  hdMap(g, mirror ? PROP_MIRROR.get(rows) : rows, pal, x, y);
}

// At 32-bit the props are drawn a quarter unit a pixel. propRamp6 gives a material's six colours from its base c, to the
// characters of keys in order: shine, light, base, shade, deep and an outline in its own darkest hue, the lit steps
// warmer and the shaded ones cooler, as the figures are.
const PROP_COOL = '#25234f';
function propRamp6(c, keys, extra = {}) {
  const ramp = [hdMix(c, HD_LIGHT, 0.55), hdMix(c, HD_LIGHT, 0.26), c, hdMix(c, PROP_COOL, 0.27), hdMix(c, PROP_COOL, 0.5), hdMix(c, HD_DARK, 0.7)];
  const pal = {};
  [...keys].forEach((k, i) => { if (k !== '.') pal[k] = ramp[i]; });
  return Object.assign(pal, extra);
}
// A grid of w by h quarter-unit pixels to compose a prop in, each a key of its palette ('.' is clear). put writes a string
// along a row ('.' skips), rect fills a box with a key or with fn(r, c), ball fills an ellipse lit from the upper left
// with keys from lit to dark (rough breaks up its bands), and edge rings what is drawn with the outline key out(k, side)
// gives for the key it touches and the side of it the ring is on ('b' below, 'r' right, 'l' left, 't' top).
function propGrid(w, h) {
  const cells = Array.from({ length: h }, () => Array(w).fill('.'));
  const G = {
    w, h, cells,
    at: (r, c) => cells[r]?.[c] ?? '.',
    set(r, c, k) { if (k && k !== '.' && r >= 0 && r < h && c >= 0 && c < w) cells[r][c] = k; },
    put(r, c, s) { [...s].forEach((k, i) => G.set(r, c + i, k)); return G; },
    map(r, c, rows) { rows.forEach((s, i) => G.put(r + i, c, s)); return G; },
    rect(r, c, rh, cw, k) { for (let y = r; y < r + rh; y += 1) for (let x = c; x < c + cw; x += 1) G.set(y, x, typeof k === 'function' ? k(y, x) : k); return G; },
    cut(r, c, rh, cw) { for (let y = Math.max(0, r); y < Math.min(h, r + rh); y += 1) cells[y].fill('.', Math.max(0, c), Math.min(w, c + cw)); return G; },
    ball(cy, cx, ry, rx, keys, rough = 0, seed = 0) {
      G.rect(Math.floor(cy - ry), Math.floor(cx - rx), Math.ceil(ry * 2) + 1, Math.ceil(rx * 2) + 1, (r, c) => {
        const [dx, dy] = [(c + 0.5 - cx) / rx, (r + 0.5 - cy) / ry];
        const d = dx * dx + dy * dy;
        if (d > 1) return '.';
        const lum = -0.5 * dx - 0.62 * dy + 0.6 * Math.sqrt(1 - d) + rough * (rnd(seed + r * 61 + c * 7) - 0.5);
        return keys[lum > 0.72 ? 0 : lum > 0.45 ? 1 : lum > 0.12 ? 2 : lum > -0.2 ? 3 : 4];
      });
      return G;
    },
    edge(out) {
      const was = cells.map((row) => row.slice());
      for (let r = 0; r < h; r += 1) for (let c = 0; c < w; c += 1) {
        if (was[r][c] !== '.') continue;
        const k = [[r - 1, c, 'b'], [r, c - 1, 'r'], [r, c + 1, 'l'], [r + 1, c, 't']].map(([y, x, s]) => [was[y]?.[x] ?? '.', s]).find(([n]) => n !== '.');
        if (k) G.set(r, c, out(k[0], k[1]));
      }
      return G;
    },
    rows: () => cells.map((row) => row.join('')),
  };
  return G;
}
// Each prop's art is painted once on a canvas of SC_RES pixels per unit, kept by key (its mirror image too), so a prop
// costs one drawImage a frame. make() returns the art's rows of keys, a quarter unit a character; propArt draws it with
// its top-left at (x, y), mirrored left to right when mirror is set.
const PROP_ROWS = new Map();
const PROP_CANVAS = new Map();
const propRows = (key, make) => { if (!PROP_ROWS.has(key)) PROP_ROWS.set(key, make()); return PROP_ROWS.get(key); };
function propArt(g, key, pal, make, x, y, mirror = false) {
  const k = mirror ? `${key}|m` : key;
  let cv = PROP_CANVAS.get(k);
  if (!cv) {
    const rows = propRows(key, make);
    cv = document.createElement('canvas');
    cv.width = Math.ceil((rows[0].length * SC_RES) / 4);
    cv.height = Math.ceil((rows.length * SC_RES) / 4);
    const c = cv.getContext('2d');
    c.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
    qdMap(c, mirror ? rows.map((row) => [...row].reverse().join('')) : rows, pal, 0, 0);
    PROP_CANVAS.set(k, cv);
  }
  g.drawImage(cv, x, y, cv.width / SC_RES, cv.height / SC_RES);
}

// The bottom row of the props on the open ground between the two rows of stations: low enough that a prop clears the
// back row's desks and workers, high enough that it clears the front row and the fights below it (scene-duel.js).
const PROP_MID = 136;

// Rivendell's trees, as scenery.js draws them: a line of small ones along the back of the valley and tall ones by the
// falls, beyond the pavilion and at the far edge, each kept only where it clears the falls, the pavilion and its neighbour.
function elfTrees(r) {
  const cx = r.x0 + Math.floor(r.w / 2);
  const small = [];
  for (let x = r.x0 + 22; x < r.x0 + r.w - 8; x += 13) {
    if (Math.abs(x - cx) > 21) small.push([x + Math.floor(rnd(x) * 5), 12 + Math.floor(rnd(x + 9) * 6), x * 7]);
  }
  const tall = [];
  let last = -99;
  for (const [x, h] of [[r.x0 + 26, 30], [cx + 30, 38], [r.x0 + r.w - 14, 28]]) {
    if (x - last < 12 || Math.abs(x - cx) < 24 || x > r.x0 + r.w - 6) continue;
    tall.push([x, h]);
    last = x;
  }
  return { small, tall };
}

const boxHits = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
const boxClear = (box, list) => !list.some((o) => boxHits(o, box));
const xsFrom = (a, b) => { const xs = []; for (let x = a; a <= b ? x <= b : x >= b; x += a <= b ? 1 : -1) xs.push(x); return xs; };

// Where a realm's props go, worked out once per layout (scene.js builds new realms on every snapshot and resize). outs
// are what a prop must clear: each station with room for its worker, the landmarks and the props already placed. desks
// are what a worker's spot must clear: the station art itself, the landmarks marked solid and the props. A Sentry's post
// stands on the road, below every prop, so it needs neither. key names the layout, so scene-work.js can tell when its
// spots have moved.
function realmProps(r) {
  if (r.props) return r.props;
  const mine = sc.stations.filter((s) => s.realm === r);
  const P = { key: `${r.x0},${r.w},${mine.map((s) => `${s.x}:${s.y}`).join(',')}`, list: [], solid: [] };
  const outs = [];
  const desks = [];
  const seats = mine.filter((s) => !s.sentry);
  const front = seats.filter((s) => s.y > PROP_MID).map((s) => s.x);
  for (const s of seats) {
    outs.push([s.x - 5, s.y - 21, s.x + 5, s.y + 2], [s.x - 8, s.y - 6, s.x + 8, s.y + 2]);
    desks.push([s.x - 8, s.y - 6, s.x + 8, s.y + 2]);
  }
  // The landmarks' own ground, which workers also walk round (P.solid, for scene-path.js).
  const solid = (b) => { outs.push(b); desks.push(b); P.solid.push(b); };
  // A prop w by h on row base at the first x in xs that clears, with its worker's spot gap pixels off one of its ends
  // (or, with both, a spot off each end that has room). The spot must clear the desks and should clear the back row's
  // workers: the first place whose spot does is taken, or else the one whose spot stands farthest from them.
  const back = seats.filter((s) => s.y < PROP_MID).map((s) => s.x);
  const fit = (type, w, h, base, xs, gap, both = false) => {
    // On the open ground, a prop under a front-row worker's name is tried last.
    const named = (x) => front.some((fx) => Math.abs(x + w / 2 - fx) < 16);
    let best = null;
    for (const x of base === PROP_MID ? [...xs].sort((a, b) => named(a) - named(b)) : xs) {
      const box = [x, base - h + 1, x + w - 1, base];
      if (x < r.x0 + 2 || x + w > r.x0 + r.w - 2 || !boxClear(box, outs)) continue;
      const spots = [-1, 1].map((side) => ({ side, sx: side < 0 ? x - gap : x + w - 1 + gap }))
        .filter(({ sx }) => sx - 4 >= r.x0 && sx + 4 <= r.x0 + r.w && boxClear([sx - 3, base - 12, sx + 3, base + 1], desks))
        .map(({ side, sx }) => ({ x: sx, y: base + 1, face: -side, room: Math.min(99, ...back.map((bx) => Math.abs(sx - bx))) }))
        // Erebor's back row stands under its wall, so a spot there must clear its dwarves (2026-11-27: Bofur mined in Kili).
        .filter((sp) => r.kind !== 'dwarf' || base > PROP_MID || sp.room >= 9)
        .sort((p, q) => q.room - p.room).slice(0, both ? 2 : 1);
      if (spots.length && (!best || spots[0].room > best.spots[0].room)) best = { x, spots };
      if (best?.spots[0].room >= 9) break;
    }
    if (!best) return null;
    const { x, spots } = best;
    const prop = { type, x, y: base - h + 1, w, h, base, side: -spots[0].face, spot: spots[0], spots };
    outs.push([x, prop.y, x + w - 1, base]);
    desks.push([x, prop.y, x + w - 1, base]);
    for (const sp of spots) { outs.push([sp.x - 3, base - 12, sp.x + 3, base + 1]); desks.push([sp.x - 3, base - 12, sp.x + 3, base + 1]); }
    P.list.push(prop);
    return prop;
  };
  const cx = r.x0 + Math.floor(r.w / 2);
  const wallFoot = GROUND_Y + 3;
  if (r.kind === 'dwarf') {
    solid([r.x0 + 2, GROUND_Y - 10, r.x0 + 21, GROUND_Y + 6]);
    solid([cx - 9, GROUND_Y - 21, cx + 9, GROUND_Y + 6]);
    // Ore goes into the forge from its right-hand side.
    P.forge = { x: r.x0 + 28, y: GROUND_Y + 6, face: -1 };
    solid([P.forge.x - 3, GROUND_Y - 6, P.forge.x + 3, GROUND_Y + 7]);
    const wall = xsFrom(r.x0 + 26, r.x0 + r.w - 10);
    // The gem rock picks first: a worker kneeling at it would be lost behind one at an anvil.
    P.gems = fit('gems', 7, 6, wallFoot, wall, 8);
    P.ore = [0, 1, 2].map(() => fit('ore', 6, 6, wallFoot, wall, 8, true)).filter(Boolean);
    P.chest = fit('chest', 11, 8, PROP_MID, xsFrom(r.x0 + 3, r.x0 + r.w - 14), 6);
  } else if (r.kind === 'hobbit') {
    solid([cx - 20, GROUND_Y - 13, cx + 20, GROUND_Y + 6]);
    outs.push([cx - 24, GROUND_Y - 2, cx + 24, GROUND_Y + 10], ...shirePosts(r));
    // The vegetable patch and its fence (shirePatch, scenery-farm.js), and the hobbits' places in its rows.
    const patch = shirePatch(r);
    P.veg = [];
    if (patch) {
      const y1 = patch.y + 10;
      outs.push(patch.fence, [patch.left, patch.y, patch.right, y1]);
      for (let x = patch.left + 3; x <= patch.right - 9 && P.veg.length < 2; x += 1) {
        const stand = [x - 3, y1 - 13, x + 3, y1];
        if (boxClear(stand, desks)) { P.veg.push({ x, y: y1 - 1, face: 1 }); desks.push(stand); x += 7; }
      }
    }
    // The kettle by the hill's foot, and the cart, on a row of plots' line (the middle ones first) where there is room.
    const rows = shireRows().slice(1).sort((a, b) => Math.abs(a - PROP_MID) - Math.abs(b - PROP_MID));
    const onRows = (type, w, h, xs, gap) => { for (const base of rows) { const p = fit(type, w, h, base, xs, gap); if (p) return p; } return null; };
    P.brew = fit('brew', 11, 5, GROUND_Y + 6, xsFrom(r.x0 + 2, cx - 31), 5) ?? onRows('brew', 11, 5, xsFrom(r.x0 + 2, r.x0 + r.w - 13), 5);
    P.cart = onRows('cart', 13, 8, xsFrom(r.x0 + r.w - 15, r.x0 + 2), 6);
  } else if (r.kind === 'elf') {
    for (const b of [[r.x0, GROUND_Y - 44, r.x0 + 19, GROUND_Y + 21], [cx - 17, GROUND_Y - 18, cx - 14, GROUND_Y + 4], [cx + 15, GROUND_Y - 18, cx + 18, GROUND_Y + 4]]) {
      outs.push(b);
      P.solid.push(b);
    }
    // The rack stands under the pavilion, as near its middle as the stations allow.
    const under = xsFrom(cx - 13, cx + 4).sort((a, b) => Math.abs(a - cx + 5) - Math.abs(b - cx + 5));
    P.rack = fit('rack', 10, 12, GROUND_Y + 4, under, 5);
    P.harp = { x: r.x0 + 24, y: GROUND_Y + 19, face: -1 };
    desks.push([P.harp.x - 3, GROUND_Y + 6, P.harp.x + 3, GROUND_Y + 20]);
    P.target = fitTarget(r, outs, desks, P);
    const trees = elfTrees(r);
    // A place beside each tree's trunk, where a tree stands clear of the stations and of the place beside another tree.
    P.trees = [];
    for (const t of [...trees.small.map(([x, h]) => ({ x, top: GROUND_Y + 6 - h - 5 })), ...trees.tall.map(([x, h]) => ({ x, top: GROUND_Y + 6 - h - 8 }))]) {
      const stand = [t.x + 1, GROUND_Y - 6, t.x + 7, GROUND_Y + 7];
      if (t.x + 8 > r.x0 + r.w || !boxClear(stand, desks) || !boxClear(stand, outs)) continue;
      desks.push(stand);
      P.trees.push({ ...t, spot: { x: t.x + 4, y: GROUND_Y + 6, face: -1 } });
    }
  }
  PROP_MORE[r.kind]?.(r, P, fit, outs, desks);
  for (const f of PROP_LATE[r.kind] ?? []) f(r, P, fit, outs, desks);
  r.props = P;
  return P;
}
// The straw target and the archer's place: a little way off on the open ground, the archer facing the target.
function fitTarget(r, outs, desks, P) {
  for (const x of [...xsFrom(r.x0 + r.w - 10, r.x0 + Math.floor(r.w / 2)), ...xsFrom(r.x0 + 3, r.x0 + Math.floor(r.w / 2))]) {
    const box = [x, PROP_MID - 7, x + 6, PROP_MID];
    if (!boxClear(box, outs)) continue;
    const side = x > r.x0 + r.w / 2 ? -1 : 1;
    for (let d = 26; d <= 36; d += 1) {
      const sx = side < 0 ? x - d : x + 6 + d;
      const stand = [sx - 3, PROP_MID - 13, sx + 3, PROP_MID + 2];
      if (sx - 4 < r.x0 + 19 || sx + 4 > r.x0 + r.w || !boxClear(stand, desks)) continue;
      const prop = { type: 'target', x, y: PROP_MID - 7, w: 7, h: 8, base: PROP_MID, side, spot: { x: sx, y: PROP_MID + 1, face: -side } };
      outs.push(box, stand);
      desks.push(box, stand);
      P.list.push(prop);
      return prop;
    }
  }
  return null;
}

const VEG = ['#5fae3a', PX.ember, '#7fc24a', PX.red, '#e0b13a'];
// One piece of a heap in its unit square, lit at its upper left and a pixel bigger than its square to the right and
// above, so each piece laps over the one before it and a pile reads as round lumps (a vegetable, a sack of grain, a coin)
// or cut gems with a bright table and a dark point.
const HEAP_SHAPES = {
  lump: ['.abb.', 'abbcd', 'bbccd', 'bccde', '.dde.'],
  gem: ['.aab.', 'abbcc', '.ccd.', '..d..', '.....'],
  sack: ['..d..', '.abc.', 'abbcd', 'abccd', '.dde.'],
};
function heapPiece(g, x, y, c, shape = 'lump') {
  propArt(g, `heap:${shape}:${c}`, propRamp6(c, 'abcde'), () => HEAP_SHAPES[shape], x, y - 0.25);
}
// A glint: a four-pointed sparkle of white centred on (x, y).
function heapGlint(g, x, y) {
  pxBox(g, x - 0.25, y - 0.5, 0.25, 1, '#fffbe8');
  pxBox(g, x - 0.5, y - 0.25, 0.75, 0.25, '#fffbe8');
  pxBox(g, x - 0.25, y - 0.25, 0.25, 0.25, '#ffffff');
}
// The heap a count builds on a prop: rows of slots from the bottom up, each row narrower than the one under it. Gems
// alternate cut and round; a gem in the pile catches the light now and then.
function drawHeap(g, x, y, widths, count, colors, tick) {
  let n = 0;
  const gems = colors === GEM_PILE;
  const shape = (k) => (gems ? (k % 3 ? 'gem' : 'lump') : colors.length === 2 ? 'sack' : 'lump');
  widths.forEach((w, row) => {
    for (let i = 0; i < w && n < count; i += 1, n += 1) {
      heapPiece(g, x + row + i, y - row, colors[(n * 7 + row) % colors.length], shape(n));
      if (gems && tick % 40 === n % 40) heapGlint(g, x + row + i + 0.5, y - row + 0.25);
    }
  });
}
const GEM_PILE = GEMS.flatMap(([light, dark]) => [light, dark]);

// Draws one prop through its type's art in PROP_DRAW (scenery-props-hd.js and the later files). st is its realm's state
// in scene-work.js: gems in the chest, vegetables or sacks in the cart, scrolls on the rack, arrows in the target, and
// when the forge last flared and the kettle last bubbled.
function drawProp(g, p, st, tick) {
  PROP_DRAW[p.type](g, p, st, tick);
}
