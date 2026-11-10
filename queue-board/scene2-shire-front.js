// scene2-shire-front.js: where the Shire's things go in the open ground south of the road (scene2-shire.js): the Mill
// on the Water and Bywater pool along the realm's bottom; the big pen; and the well, the vegetable garden, the kettle,
// the cart and a pair of apple trees packed into whatever room is left round the plots, between them too, each with
// clear ground below it where a hobbit stands to use it. Nothing goes on a plot or the rows above it where its hobbit,
// bubble and name show. scene2-shire-fill.js fills the gaps that are left.

function m2ShireFront(L, r, plan, season, add) {
  const span = r.ux1 - r.ux0;
  const left = [];
  // Each plot, the hobbit behind it, its bubble and its name; and the road.
  const plots = plan.stations.filter((s) => s.realm === r).map((s) => ({ x0: s.x - 12, y0: s.y - 40, x1: s.x + 12, y1: s.y + 3 }));
  const keep = [...plots, { x0: r.x, y0: r.roadY - 12, x1: r.x + r.w, y1: r.roadY + 6 }];
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
  // The open ground the yard's things go in, anywhere clear of those (between the plots too, 2026-11-09: at a typical
  // window the plots took the whole width and nothing fitted beside their block).
  const area = { x0: r.ux0, y0: r.roadY + 6, x1: r.ux1, y1: mz + 4 };
  const place = (w, h, m = 2) => {
    const at = m2ShireFree(area, keep, w, h, m);
    if (at) keep.push({ x0: at.x, y0: at.y, x1: at.x + w, y1: at.y + h });
    return at;
  };
  // The pen first, as big as the room allows: its back fence and sty above it, its trough's spot below.
  let pen = null;
  for (const [pw, ph] of [[Math.round(Math.max(36, Math.min(56, span * 0.44))), 22], [36, 18], [32, 14]]) {
    const at = place(pw + 2, ph + 18);
    if (at) { pen = { x: at.x + 1, y: at.y + 13, w: pw, h: ph }; break; }
  }
  r.pen = pen;
  if (pen) r.spots.push(m2ShirePen(L, add, pen.x, pen.y, pen.w, pen.h, season, r.m.host));
  else left.push('pen');
  // The rest, in order, wherever there is room, each at the first of its sizes that fits (a smaller garden where the
  // full one does not); the garden and the cart before the kettle, since the hobbits' linked rounds need them.
  const things = [
    ['well', [[12, 25]], (p) => m2ShireWell(L, add, p.x + 6, p.y + 18)],
    ['garden', [[22, 25], [18, 22], [16, 20, 1]], (p, w, h) => m2ShireGarden(L, add, p.x, p.y + 6, w, h - 11, season, r.x)],
    ['cart', [[20, 20]], (p) => m2ShireCart(L, add, p.x, p.y + 13, season, r.x)],
    ['kettle', [[16, 16]], (p) => m2ShireKettle(L, add, p.x, p.y + 11, season)],
    ['apples', [[26, 21]], (p) => m2ShireApples(L, add, p.x, p.y + 16, season)],
  ];
  for (const [name, sizes, make] of things) {
    let fit = null;
    for (const [w, h, m] of sizes) { const p = place(w, h, m); if (p) { fit = [p, w, h]; break; } }
    if (!fit) { left.push(name); continue; }
    r.spots.push(make(...fit));
  }
  // Fields, beehives, a bench and Shire oaks in the free ground, clear of everything placed and the spots.
  const avoid = [...keep, ...r.spots.map((s) => ({ x0: s.x - 5, y0: s.y - 20, x1: s.x + 5, y1: s.y + 3 }))];
  const before = avoid.length;
  const made = m2ShireFill(L, add, r, avoid, { x0: r.ux0, y0: r.roadY + 6, x1: r.ux1, y1: y1 }, season);
  // A hobbit sits on the bench with a pipe.
  const bench = made.includes('bench') ? avoid[before + made.indexOf('bench')] : null;
  if (bench) r.spots.push({ x: Math.round(bench.x0 + 4), y: bench.y0 + 7.5, face: 'down', job: 'smoke' });
  m2Flowers(L, r.ux0, r.roadY + 6, span, y1 - r.roadY - 6, Math.round(span * 0.5), M2_FLOWERS.hobbit, [M2_MAT.hobbit], 93);
  return { left };
}

// Two apple trees side by side with their feet on row y from x, a hobbit's spot under the first.
function m2ShireApples(L, add, x, y, season) {
  for (const [dx, dy, seed] of [[6, 0, 2], [19, -2, 5]]) m2ShireOak(L, add, x + dx, y + dy, 5, season, seed, false, true);
  if (season === 'autumn' || season === 'summer') {
    L.decals.push((g) => { for (let i = 0; i < 7; i += 1) pxBox(g, Math.round((x + 3 + m2Hash(i, 1, 98) * 20) * 4) / 4, Math.round((y + 0.5 + m2Hash(i, 2, 98) * 2) * 4) / 4, 0.5, 0.5, '#c0302a'); });
  }
  return { x: Math.round(x + 12.5), y: y + 3, face: 'up', job: 'apples' };
}
