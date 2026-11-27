// scene2-shire-front.js: where the Shire's things go in the open ground south of the road (scene2-shire.js): the Mill
// on the Water and Bywater pool along the realm's bottom; the big pen; and three groups (the well and the kettle, the
// vegetable garden and the cart, the apple trees and the beehives) in whatever room is left beside the plots' grid,
// each with clear ground below it where a hobbit stands to use it. Nothing goes inside the grid. scene2-shire-fill.js
// fills the gaps that are left.

function m2ShireFront(L, r, plan, season, add) {
  const span = r.ux1 - r.ux0;
  const left = [];
  // The plots stand on one grid, kept clear as a block: each row of plots with the hobbits, bubbles and names above
  // them, the lanes between the plots and the ground between the rows, so nothing is wedged among them (2026-11-27:
  // trees, beehives and a bench stood between the plots). A part-filled last row keeps only its own width.
  const keep = m2ShireGrid(plan.stations.filter((s) => s.realm === r));
  keep.push({ x0: r.x, y0: r.roadY - 12, x1: r.x + r.w, y1: r.roadY + 6 });
  const y1 = r.y + r.h - 2;
  // The Water along the bottom, the mill on its north bank at the west and the pool at the east.
  const mw = 22;
  const mz = y1 - 14;
  const mx = r.ux0 + Math.min(8, span * 0.05);
  const pool = { rx: Math.min(22, span * 0.14), ry: 6 };
  pool.x = r.ux1 - pool.rx - 2;
  pool.y = mz + 7;
  const line = m2ShireWater(L, add, r, mx, mw, mz, pool);
  add.late(() => { plan.rivers.shireWater = line; });
  r.spots.push(m2ShireMill(L, add, mx, mw, mz));
  keep.push({ x0: mx - 3, y0: mz - 20, x1: mx + mw + 3, y1: mz + 6 }, { x0: pool.x - pool.rx - 3, y0: pool.y - pool.ry - 3, x1: pool.x + pool.rx + 3, y1: y1 + 6 },
    { x0: r.x, y0: mz + 1, x1: r.x + r.w, y1: y1 + 6 });
  // The open ground the yard's things go in, anywhere clear of those.
  const area = { x0: r.ux0, y0: r.roadY + 6, x1: r.ux1, y1: mz + 4 };
  // The pen and three groups, each group one spot with its parts side by side on one baseline (2026-11-27:
  // loose props read as clutter): the vegetable garden with its cart, the well with the kettle and a bench beside it,
  // and the apple trees with the beehives under them. The pen takes the biggest size that leaves room for every group;
  // a group with no room for all of it keeps its working parts together, or else places them on their own (m2ShireYard).
  const yard = m2ShireYard(area, keep, span);
  keep.push(...yard.boxes);
  const pen = yard.pen;
  r.pen = pen;
  if (pen) r.spots.push(m2ShirePen(L, add, pen.x, pen.y, pen.w, pen.h, season, r.m.host));
  const make = {
    garden: (p) => m2ShireGarden(L, add, p.x, p.y + 6, 22, 14, season, r.x),
    cart: (p) => m2ShireCart(L, add, p.x, p.y + 13, season, r.x),
    well: (p) => m2ShireWell(L, add, p.x + 6, p.y + 18),
    kettle: (p) => m2ShireKettle(L, add, p.x, p.y + 11, season),
    // A hobbit sits on the bench beside the kettle with a pipe.
    bench: (p) => { m2ShireBench(L, add, p.x + 1, p.y + 5); return { x: Math.round(p.x + 4), y: p.y + 7.5, face: 'down', job: 'smoke' }; },
    apples: (p) => m2ShireApples(L, add, p.x, p.y + 16, season),
    hives: (p) => { m2ShireHives(L, add, p.x + 1, p.y + 8); return null; },
  };
  for (const [name, p] of yard.parts) {
    const spot = make[name](p);
    if (spot) r.spots.push(spot);
  }
  left.push(...yard.left);
  // Fields and Shire oaks in the free ground, clear of everything placed and the spots.
  const avoid = [...keep, ...r.spots.map((s) => ({ x0: s.x - 5, y0: s.y - 20, x1: s.x + 5, y1: s.y + 3 }))];
  m2ShireFill(L, add, r, avoid, { x0: r.ux0, y0: r.roadY + 6, x1: r.ux1, y1: y1 }, season);
  m2Flowers(L, r.ux0, r.roadY + 6, span, y1 - r.roadY - 6, Math.round(span * 0.5), M2_FLOWERS.hobbit, [M2_MAT.hobbit], 93);
  return { left };
}

// The yard's groups: [name, width, height, works] for each part; a part that does no work (the bench, the hives) is
// left out when its group has no room as a whole. A layout scores first by the working parts it places, then
// by the groups it keeps together. The garden and the cart come first, since the hobbits' linked
// rounds need them.
const M2_SHIRE_GROUPS = [
  [['garden', 22, 25, true], ['cart', 20, 20, true]],
  [['well', 12, 25, true], ['kettle', 16, 16, true], ['bench', 8, 9, false]],
  [['apples', 26, 21, true], ['hives', 14, 9, false]],
];
// Lays out the pen and the groups in area clear of keep, trying the pen's sizes from the biggest and the groups in each
// order, and keeping the first layout that places every group whole (else the one that places the most): { pen, parts: [[name, {x, y}]], boxes,
// left }. Nothing is drawn here.
function m2ShireYard(area, keep0, span) {
  let best = null;
  const pens = [[Math.round(Math.max(36, Math.min(56, span * 0.44))), 22], [40, 18], [36, 18], [32, 14]];
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  for (const [pw, ph] of pens) for (const order of orders) {
    const keep = [...keep0];
    const boxes = [];
    const place = (w, h, m) => {
      const at = m2ShireFree(area, keep, w, h, m);
      if (at) { const b = { x0: at.x, y0: at.y, x1: at.x + w, y1: at.y + h }; keep.push(b); boxes.push(b); }
      return at;
    };
    const at = place(pw + 2, ph + 18, 3);
    const pen = at && { x: at.x + 1, y: at.y + 13, w: pw, h: ph };
    const parts = [];
    const left = pen ? [] : ['pen'];
    let whole = 0;
    let split = 0;
    for (const all of order.map((k) => M2_SHIRE_GROUPS[k])) {
      // The whole group, else its working parts still together, else those parts each on their own.
      const gap = 3;
      let g = null;
      let group = all;
      for (const part of [all, all.filter((q) => q[3])]) {
        const w = part.reduce((sum, q) => sum + q[1], 0) + gap * (part.length - 1);
        const h = Math.max(...part.map((q) => q[2]));
        g = place(w, h, 3);
        if (g) { group = part; g.h = h; break; }
      }
      if (g && group === all) whole += 1;
      if (!g) split += 1;
      let x = g?.x;
      for (const [name, qw, qh, works] of g ? group : all) {
        const p = g ? { x, y: g.y + g.h - qh } : works ? place(qw, qh, 3) : null;
        if (g) x += qw + gap;
        if (p) parts.push([name, p]);
        else if (works) left.push(name);
      }
    }
    const score = (pen ? 20 + pw / 100 : 0) - left.length * 10 + whole * 3 - split * 5;
    if (!best || score > best.score) best = { score, pen, parts, boxes, left };
    if (pen && whole === M2_SHIRE_GROUPS.length) return best;
  }
  return best;
}

// The plots' grid as boxes, one a row: from the row above's foot (or its own names' top) down to the plank fronts,
// across its plots and a lane's width beyond them.
function m2ShireGrid(sts) {
  const rows = [...new Set(sts.map((s) => s.y))].sort((a, b) => a - b);
  return rows.map((y, i) => {
    const xs = sts.filter((s) => s.y === y).map((s) => s.x);
    return { x0: Math.min(...xs) - 15, y0: i ? rows[i - 1] + 4 : y - 40, x1: Math.max(...xs) + 15, y1: y + 4 };
  });
}

// Two apple trees side by side with their feet on row y from x, a hobbit's spot under the first.
function m2ShireApples(L, add, x, y, season) {
  for (const [dx, dy, seed] of [[6, 0, 2], [19, -2, 5]]) m2ShireOak(L, add, x + dx, y + dy, 5, season, seed, false, true);
  if (season === 'autumn' || season === 'summer') {
    L.decals.push((g) => { for (let i = 0; i < 7; i += 1) pxBox(g, Math.round((x + 3 + m2Hash(i, 1, 98) * 20) * 4) / 4, Math.round((y + 0.5 + m2Hash(i, 2, 98) * 2) * 4) / 4, 0.5, 0.5, '#c0302a'); });
  }
  return { x: Math.round(x + 12.5), y: y + 3, face: 'up', job: 'apples' };
}
