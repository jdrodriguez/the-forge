// scene2-stations.js: what the workers of the map from above (scene2.js) work at, seen from overhead at the 1.4 times
// scale, showing how far each one's PR has come as the side view's stations do (sprites-gear-stations.js): stage 1
// building, 2 a PR open, 3 CI failing, 4 green, 0 nobody there. The elves' writing desk, 15 by 8 units on
// the ground, shows its planked top raised over its front, with a stack of books, a brass candlestick and an inkwell
// with its quill; the scroll on it grows as the work goes on, half written while it builds, crossed red with a broken
// seal when CI fails, and tied with a gold ribbon and seal, sparkling, when green; the candle burns while anyone works.
// The Sentry's lantern post, 4 wide and 26 tall, stands by the road on its stone footing: an oak shaft, an arm with the
// lantern hung from it, lit from stage 1, and a pennant on its cap (white while a PR is open, red when CI fails, gold
// when green). scene2-station-art.js draws the hobbits' garden plot and the dwarves' anvil, scene2-rohan-shield.js the
// Men's shield on its trestle.

const m2StArt = new Map();
// A canvas w by h units painted once by paint(g, px), cached by key; px(x, y, w, h, colour) fills in quarter units.
function m2StCanvas(key, w, h, paint) {
  if (m2StArt.has(key)) return m2StArt.get(key);
  const { c, g } = m2Canvas(w, h);
  paint(g, (x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x / 4, y / 4, ww / 4, hh / 4); });
  m2StArt.set(key, c);
  return c;
}
const M2_ST_INK = ['#1d1b27', '#2b2440', '#6a5f80'];
const M2_ST_PAPER = ['#fbf4e0', '#e6dcc0', '#bfb08e', '#8f8064'];
const M2_ST_RED = ['#3a0c0c', '#7a1a16', '#b22a22', '#f0563c'];

// The desk, 15 by 18 units (about one and a half times a worker's width, as v1's) with its front legs on the bottom row: 4 units of headroom for the quill and the candle's
// flame, the top in four planks between breadboard ends (rows 16 to 47), its lit nose, the apron with two drawers and
// gold knobs, and turned front legs.
function m2DeskBase() {
  return m2StCanvas('desk', 15, 18, (g, px) => {
    const W = M2_PAL.wood;
    m2Raster(g, 0, 4, 60, 32, (x, y) => {
      if (x === 0 || x === 59 || y === 0) return W[0];
      if (x <= 4 || x >= 55) return x === 4 || x === 55 ? W[1] : W[(m2Hash(x, y >> 2, 3) < 0.2 ? 2 : 3) + (x < 3 ? 1 : 0)];
      if (y === 1) return W[4];
      const plank = (y - 2) >> 3;
      if ((y - 2) % 8 === 7) return W[1];
      const streak = m2Hash(Math.floor((x + plank * 13) / 7), y, 5);
      let k = streak < 0.12 ? 4 : streak > 0.9 ? 2 : 3;
      if (x < 20 && k === 3 && m2Hash(x, y, 6) < 0.3) k = 4;
      if (x > 46 && k === 3 && m2Hash(x, y, 7) < 0.25) k = 2;
      return W[k];
    });
    px(1, 48, 58, 2, W[5]);
    px(0, 48, 1, 3, W[0]); px(59, 48, 1, 3, W[0]);
    px(1, 50, 58, 1, W[3]);
    m2Raster(g, 0, 12.75, 60, 12, (x, y) => {
      if (x === 0 || x === 59 || y === 11) return W[0];
      if (y === 0) return W[1];
      return W[x < 3 ? 3 : x > 56 ? 1 : (x % 12 === 6 && y > 1) ? 1 : 2];
    });
    for (const dx of [8, 31]) {
      px(dx, 54, 21, 7, W[1]);
      px(dx + 1, 55, 19, 5, W[3]);
      px(dx + 1, 55, 19, 1, W[4]);
      px(dx + 9, 56, 4, 3, M2_PAL.gold[0]);
      px(dx + 9, 56, 3, 2, M2_PAL.gold[2]);
      px(dx + 9, 56, 1, 1, M2_PAL.gold[4]);
    }
    const prof = [6, 6, 4, 4, 5, 5, 4, 4, 6];
    for (const lx of [4, 55]) {
      prof.forEach((w, i) => {
        const x0 = lx - w / 2;
        px(x0, 63 + i, w, 1, W[0]);
        if (w > 2) { px(x0 + 1, 63 + i, 1, 1, W[4]); px(x0 + 2, 63 + i, Math.max(0, w - 3), 1, W[2]); }
      });
    }
  });
}
// What lies on the desk at each stage, over the base: the books and inkwell always, the candle, and the scroll.
function m2DeskAt(stage) {
  return m2StCanvas(`desk${stage}`, 15, 18, (g, px) => {
    g.drawImage(m2DeskBase(), 0, 0, 15, 18);
    // Two books stacked at the left, their page edges toward us.
    px(3, 27, 15, 9, '#1a2238'); px(4, 27, 13, 6, '#34508a'); px(4, 27, 13, 1, '#5a7cc0'); px(4, 33, 13, 2, M2_ST_PAPER[1]); px(4, 34, 13, 1, M2_ST_PAPER[2]);
    px(5, 21, 13, 8, '#3a1010'); px(6, 21, 11, 5, '#8a2a22'); px(6, 21, 11, 1, '#c24a3a'); px(6, 26, 11, 2, M2_ST_PAPER[0]); px(6, 27, 11, 1, M2_ST_PAPER[2]);
    px(6, 23, 1, 3, M2_PAL.gold[2]); px(15, 23, 1, 3, M2_PAL.gold[2]);
    // The inkwell at the back right and its quill leaning out of it.
    px(45, 21, 9, 7, M2_ST_INK[0]); px(46, 20, 7, 1, M2_ST_INK[0]); px(46, 22, 3, 3, M2_ST_INK[2]); px(47, 22, 1, 1, '#b8b0d0');
    px(47, 19, 5, 2, M2_ST_INK[1]);
    for (let i = 0; i < 12; i += 1) {
      const [qx, qy] = [50 + Math.round(i * 0.55), 19 - i];
      px(qx, qy, 1, 1, i < 2 ? M2_ST_INK[0] : '#e8e4da');
      if (i > 3) { px(qx - 1, qy, 1, 1, i % 2 ? '#c8c0b0' : '#f8f4ec'); px(qx + 1, qy + 1, 1, 1, '#a8a090'); }
    }
    // The brass candlestick behind the books.
    px(21, 26, 9, 3, M2_PAL.gold[0]); px(22, 26, 7, 2, M2_PAL.gold[2]); px(22, 26, 3, 1, M2_PAL.gold[3]);
    px(24, 15, 3, 11, M2_ST_PAPER[1]); px(24, 15, 1, 11, M2_ST_PAPER[0]); px(26, 15, 1, 11, M2_ST_PAPER[2]); px(25, 13, 1, 2, '#2a1a12');
    if (!stage) return;
    // The scroll: paper between two rollers capped in gold, lines of looped writing, its shadow on the wood.
    const len = [0, 22, 30, 30, 34][stage];
    const x0 = 32 - Math.round(len / 2);
    px(x0, 41, len + 6, 2, 'rgba(26,15,10,0.45)');
    px(x0 + 3, 29, len, 12, M2_ST_PAPER[0]);
    px(x0 + 3, 29, len, 1, '#fffaf0');
    px(x0 + 3, 39, len, 2, M2_ST_PAPER[2]);
    px(x0 + 3, 38, len, 1, M2_ST_PAPER[1]);
    const lines = stage === 1 ? [1, 0.5, 0] : [1, 1, 0.8];
    lines.forEach((f, li) => {
      for (let c = 2; c < len * f - 2; c += 1) if ('..kKk.kk.KkkK..kKk.kKkk.k.Kk.'[(c + li * 9) % 29] !== '.') px(x0 + 3 + c, 31 + li * 3, 1, 1, M2_ST_INK[(c + li) % 4 === 0 ? 1 : 0]);
    });
    for (const rx of [x0, x0 + len + 3]) {
      px(rx, 28, 3, 14, M2_PAL.wood[1]); px(rx, 29, 1, 12, M2_PAL.wood[4]); px(rx + 1, 29, 1, 12, M2_PAL.wood[3]);
      px(rx, 27, 3, 2, M2_PAL.gold[2]); px(rx, 41, 3, 2, M2_PAL.gold[1]); px(rx, 27, 1, 1, M2_PAL.gold[4]);
    }
    if (stage === 1) for (let i = 0; i < 9; i += 1) px(x0 + len - 6 + i, 37 - Math.round(i * 0.9), 1, 1, i < 2 ? M2_ST_INK[0] : '#f4f0e6');
    if (stage === 3) {
      // A red cross struck over the writing and the seal broken in two.
      for (let i = 0; i < 14; i += 1) for (const [sx, dir] of [[x0 + len / 2 - 4, 1], [x0 + len / 2 + 9, -1]]) {
        px(Math.round(sx + dir * i * 0.9), 28 + i, 2, 1, M2_ST_RED[i % 4 === 0 ? 3 : 2]);
        px(Math.round(sx + dir * i * 0.9) + (dir > 0 ? 2 : -1), 28 + i, 1, 1, M2_ST_RED[1]);
      }
      px(x0 + len + 2, 41, 4, 3, M2_ST_RED[1]); px(x0 + len + 7, 42, 3, 3, M2_ST_RED[2]); px(x0 + len + 7, 42, 1, 1, M2_ST_RED[3]);
    }
    if (stage === 4) {
      // A gold ribbon round the middle with its seal and tails.
      const mx = x0 + 3 + Math.round(len / 2);
      px(mx - 1, 29, 3, 12, M2_PAL.gold[2]); px(mx - 1, 29, 1, 12, M2_PAL.gold[3]);
      px(mx - 3, 39, 7, 6, M2_PAL.gold[0]); px(mx - 2, 39, 5, 5, M2_PAL.gold[2]); px(mx - 1, 40, 2, 2, M2_PAL.gold[4]);
      px(mx - 4, 45, 2, 3, M2_PAL.gold[1]); px(mx + 3, 45, 2, 3, M2_PAL.gold[1]);
    }
  });
}
// A four-pointed sparkle centred at (x, y) units, big or small by beat.
function m2StSpark(g, x, y, big) {
  const c = M2_PAL.gold;
  pxBox(g, x - 0.25, y - (big ? 1.25 : 0.75), 0.5, big ? 2.5 : 1.5, c[3]);
  pxBox(g, x - (big ? 1.25 : 0.75), y - 0.25, big ? 2.5 : 1.5, 0.5, c[3]);
  pxBox(g, x - 0.25, y - 0.25, 0.5, 0.5, c[4]);
}
// A candle's or a lantern's flame, a teardrop with a white heart whose tip leaps on alternate beats.
function m2StFlame(g, x, y, hot) {
  pxBox(g, x - 0.25, y - (hot ? 2 : 1.5), 0.5, 0.5, '#ff8a2a');
  pxBox(g, x - 0.5, y - (hot ? 1.5 : 1), 1, 1, '#ffd35a');
  pxBox(g, x - 0.25, y - 0.75, 0.5, 0.75, '#fff3c4');
}

// The Sentry's lantern post, 11 by 31 units with the shaft's middle on column 3 and its foot on the bottom row: a
// pennant's staff over the cap, the bevelled cap, the oak shaft lit on its left with grain and a knot, the iron ring
// for the horse on its west side, the arm east with its brace, the strap and the lantern, and the stone footing.
function m2PostArt(lit) {
  return m2StCanvas(`post${+lit}`, 11, 31, (g, px) => {
    const W = M2_PAL.wood;
    const S = M2_PAL.stone;
    px(11, 0, 2, 20, '#3a2c22'); px(11, 0, 1, 20, '#7a6450'); px(10, 0, 4, 2, M2_PAL.gold[2]);
    px(5, 18, 14, 2, W[0]); px(6, 19, 12, 2, W[5]); px(5, 21, 14, 3, W[0]); px(6, 21, 12, 2, W[3]);
    m2Raster(g, 1.75, 6, 9, 94, (x, y) => {
      if (x === 0 || x === 8) return W[0];
      const knot = Math.hypot(x - 5, y - 44) < 2;
      if (knot) return Math.hypot(x - 5, y - 44) < 1 ? W[0] : W[1];
      const grain = (x === 4 && y % 23 < 9) || (x === 6 && (y + 11) % 19 < 7);
      return grain ? W[2] : W[x < 3 ? 4 : x < 6 ? 3 : 2];
    });
    // The arm to the lantern, with end grain at its tip, and its brace.
    px(15, 27, 24, 5, W[0]); px(15, 28, 23, 2, W[4]); px(15, 30, 23, 1, W[2]); px(36, 27, 3, 5, W[0]); px(37, 28, 1, 3, W[5]);
    for (let i = 0; i < 9; i += 1) { px(15 + i, 40 - i, 2, 2, W[0]); px(15 + i, 40 - i, 1, 1, W[3]); }
    // The iron ring on its staple.
    px(6, 58, 2, 2, '#14141c');
    m2Raster(g, 0, 14.75, 9, 10, (x, y) => { const d = Math.hypot(x + 0.5 - 4.5, y + 0.5 - 5); return d < 4.3 && d > 2.4 ? (d > 3.6 ? '#14141c' : x + y < 8 ? '#a9b5c4' : '#5a6078') : null; });
    // The strap and ring, and the lantern: a pyramid cap, glass between iron bars, a base.
    px(34, 32, 1, 4, '#262838'); px(33, 35, 3, 2, '#5a6078');
    px(30, 37, 9, 2, '#262838'); px(31, 36, 7, 1, '#3e4256');
    px(29, 39, 11, 13, '#14141c');
    const glass = lit ? ['#fff3c4', '#ffd27a', '#e8a040'] : M2_PAL.glass.slice(1, 4).reverse();
    px(30, 40, 4, 11, glass[1]); px(35, 40, 4, 11, glass[2]); px(30, 40, 2, 5, glass[0]);
    px(34, 39, 1, 13, '#3e4256');
    px(28, 51, 13, 2, '#262838'); px(29, 51, 11, 1, '#5a6078');
    // The footing: two courses of dressed stone, the lower wider, with mortar joints.
    m2Raster(g, 0.5, 26.5, 20, 18, (x, y) => {
      const lower = y >= 9;
      if (!lower && (x < 2 || x > 17)) return null;
      if (y === 0 || y === 17 || x === 0 || x === 19 || (!lower && (x === 2 || x === 17)) || y === 9) return S[0];
      const joint = lower ? (x === 7 || x === 13) : x === 10;
      if (joint) return S[1];
      return S[y === 1 || y === 10 ? 5 : x < 5 ? 4 : x > 15 ? 2 : 3];
    });
  });
}
// The post at stage (0 dark, 1 to 4 lit), its shaft over column x and its foot on row y.
function m2DrawPost(g, x, y, stage, tick) {
  g.drawImage(m2PostArt(stage > 0), x - 3, y - 30.5, 11, 31);
  if (stage >= 2) {
    // The pennant on its staff, rippling: white for a PR open, red for CI failing, gold for green.
    const col = stage === 2 ? ['#f4f1e8', '#c8c2b0'] : stage === 3 ? [M2_ST_RED[2], M2_ST_RED[1]] : [M2_PAL.gold[3], M2_PAL.gold[1]];
    const ph = (tick >> 2) & 1;
    for (let i = 0; i < 5; i += 1) {
      const h = 2.5 - i * 0.45;
      const wy = y - 30 + 0.5 + i * 0.22 + (ph && i % 2 ? 0.25 : 0);
      pxBox(g, x + 0.25 + i * 0.75, wy, 0.75, h, col[i === 4 ? 1 : 0]);
      pxBox(g, x + 0.25 + i * 0.75, wy + h - 0.25, 0.75, 0.25, col[1]);
    }
  }
  if (!stage) return;
  m2StFlame(g, x + 5.6, y - 18, tick % 6 < 3);
  m2.glow?.add?.(x + 5.6, y - 19, 9, '#ffc45a', 0.6);
}

// What a station leaves on the ground, painted with the world: its shadow, and the plot's soil and edging.
function m2StationGround(L, s) {
  if (s.kind === 'hobbit') m2PlotGround(L, s);
  else if (s.kind === 'dwarf') m2Shadow(L, s.x + 1.5, s.y - 1.5, 6, 2.5, 0.7);
  else if (s.kind === 'ranger') m2Shadow(L, s.x + 1.5, s.y - 0.25, 3.5, 1.2, 0.7);
  else m2Shadow(L, s.x + 1.5, s.y - 1, 8.5, 2.2, 0.7);
}

// A station at stage (0 empty, then 1 to 4) with its front on row s.y, centred on s.x.
function m2DrawStation(g, s, stage, tick) {
  const { x, y } = s;
  if (s.kind === 'hobbit') return m2DrawPlot(g, x, y, stage, tick);
  if (s.kind === 'dwarf') return m2DrawAnvil(g, x, y, stage, tick);
  if (s.kind === 'ranger') return m2DrawPost(g, x, y, stage, tick);
  if (s.kind === 'man') return m2DrawShield(g, x, y, stage, tick);
  g.drawImage(m2DeskAt(stage), x - 7.5, y - 18, 15, 18);
  if (!stage) return;
  m2StFlame(g, x - 1.25, y - 14.75, tick % 8 < 4);
  m2.glow?.add?.(x - 1.25, y - 15.5, 6, '#ffc45a', 0.45);
  if (stage === 4) { m2StSpark(g, x - 5, y - 12, tick % 12 < 6); m2StSpark(g, x + 5.5, y - 13.5, tick % 12 >= 6); }
}
// The box a station fills on the map [x0, y0, x1, y1] (units), from its tallest part down to its front edge, for
// scene2.js's see-through pass; a worker at its station is hidden by it below row s.y - M2_STATION_TOP[kind].
const M2_STATION_TOP = { elf: 14, man: 12.5, hobbit: 1.5, dwarf: 12.5, ranger: 26 };
function m2StationBox(s) {
  if (s.kind === 'hobbit') return [s.x - 11, s.y - 18, s.x + 11, s.y + 1];
  if (s.kind === 'dwarf') return [s.x - 6, s.y - 17, s.x + 6, s.y + 1];
  if (s.kind === 'ranger') return [s.x - 3, s.y - 30.5, s.x + 8, s.y + 1];
  return [s.x - 7.5, s.y - 18, s.x + 7.5, s.y + 1];
}
// After the night's shade: a lit lantern's glass and flame, and a hot blade, keep their own light.
m2.layers.light.push((g, tick) => {
  for (const s of m2.stations) {
    const stage = s.actor?.stage ?? 0;
    if (!stage) continue;
    if (s.kind === 'ranger') {
      pxBox(g, s.x + 4.5, s.y - 20.5, 2.25, 2.75, '#ffd27a');
      pxBox(g, s.x + 4.5, s.y - 20.5, 1, 1.25, '#fff3c4');
      m2StFlame(g, s.x + 5.6, s.y - 18, tick % 6 < 3);
    } else if (s.kind === 'dwarf' && stage < 3) {
      pxBox(g, s.x - 2.5, s.y - 12.75, 3.5, 0.75, stage === 1 ? '#ffb040' : '#ffd35a');
    }
  }
});
