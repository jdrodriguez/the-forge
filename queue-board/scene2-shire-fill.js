// scene2-shire-fill.js: what fills the Shire's free ground once its working things are placed (scene2-shire-front.js),
// so the realm looks lived in: the sheep's pasture by the pen and a few Shire oaks in the gaps (2026-11-27: the small
// hedged fields went, a wheat field read as a thatched roof on a hedge); and the row of straw
// beehives (coiled skeps on a plank stand) with bees about them that stands with the apple trees, and the garden
// bench that stands by the kettle. Everything keeps clear of the boxes it is given (the stations and the
// rows above them, the things placed and the ground in front of them where hobbits stand) and of the realm's edges.

// Finds the first place for a box w by h units inside area, clear of every box in keep (with a margin); or null.
function m2ShireFree(area, keep, w, h, m = 2) {
  for (let y = area.y0; y + h <= area.y1; y += 2) {
    for (let x = area.x0; x + w <= area.x1; x += 2) {
      if (!keep.some((b) => x - m < b.x1 && x + w + m > b.x0 && y - m < b.y1 && y + h + m > b.y0)) return { x, y };
    }
  }
  return null;
}

function m2ShireFill(L, add, r, keep, area, season) {
  const made = [];
  // The sheep's pasture: open grass beside the pen where they graze loose. The flock comes once the rivers and roads are
  // down, and only if its pasture is all the Shire's own grass; with no room by the pen there is no flock (2026-11-27:
  // sheep scattered over the yard read as clutter).
  const pen = r.pen;
  const near = pen && { x0: Math.max(area.x0, pen.x - 30), y0: Math.max(area.y0, pen.y - 20), x1: Math.min(area.x1, pen.x + pen.w + 40), y1: Math.min(area.y1, pen.y + pen.h + 30) };
  let pasture = null;
  for (const [w, h] of near ? [[34, 18], [28, 15], [22, 13]] : []) {
    const at = m2ShireFree(near, keep, w, h, 3);
    if (at) { pasture = { x0: at.x, y0: at.y, x1: at.x + w, y1: at.y + h }; break; }
  }
  if (pasture) {
    keep.push(pasture);
    made.push('pasture');
    add.late(() => {
      const { x0, y0, x1, y1 } = pasture;
      const grass = [0, 0.5, 1].every((u) => [0, 0.5, 1].every((v) => m2MatAt(L, x0 + u * (x1 - x0), y0 + v * (y1 - y0)) === M2_MAT.hobbit));
      if (grass) m2ShireFlock(add, pasture, x1 - x0 >= 28 ? 3 : 2);
    });
  }
  // A few Shire oaks in what is left, once the rivers and roads are down, each well clear of everything else.
  add.late(() => {
    let oaks = 0;
    for (let i = 0; i < 40 && oaks < Math.max(2, Math.round((area.x1 - area.x0) / 30)); i += 1) {
      const rr = 6 + (i % 2);
      const at = m2ShireFree({ x0: area.x0 + m2Hash(i, 1, 97) * 20, y0: area.y0, x1: area.x1, y1: area.y1 }, keep, rr * 2.4, rr * 2.2 + 2, 3);
      if (!at) break;
      const [x, y] = [at.x + rr * 1.2, at.y + rr * 2.2];
      keep.push({ x0: at.x, y0: at.y, x1: at.x + rr * 2.4, y1: y + 2 });
      if (m2MatAt(L, x, y) !== M2_MAT.hobbit) continue;
      m2ShireOak(L, add, x, y, rr, season, i * 7 + 2);
      oaks += 1;
    }
  });
  return made;
}

// Three straw skeps on a plank stand, its feet on row y from x, and bees about them.
function m2ShireHives(L, add, x, y) {
  m2Shadow(L, x + 7, y - 0.5, 7, 1.25, 0.8);
  const o = m2Thing(add, x, y - 7, 12, 7.25, y, (g) => {
    pxBox(g, 0, 4.5, 12, 1, M2_PAL.wood[3]); pxBox(g, 0, 4.5, 12, 0.25, M2_PAL.wood[5]); pxBox(g, 0, 5.5, 12, 0.25, M2_PAL.wood[0]);
    for (const lx of [0.5, 10.75]) pxBox(g, lx, 5.5, 0.75, 1.75, M2_PAL.wood[1]);
    for (const sx of [0.5, 4.25, 8]) {
      m2Raster(g, sx, 0, 14, 18, (px, py) => {
        const e = ((px + 0.5 - 7) / 7) ** 2 + ((py + 0.5 - 13) / 13) ** 2;
        if (e > 1 || py > 17) return null;
        if (py > 14 && px > 5 && px < 9) return '#2a1a10';
        return e > 0.82 ? M2_PAL.thatch[0] : M2_PAL.thatch[py % 3 === 0 ? 1 : px < 6 ? 5 : px < 10 ? 4 : 2];
      });
    }
  });
  o.foot = [x, y - 2, x + 12, y];
  const bees = (g, tick, reduced) => {
    for (let i = 0; i < 4; i += 1) {
      const a = (reduced ? i : tick / 7 + i * 1.7) * (i % 2 ? 1 : -1);
      pxBox(g, Math.round((x + 6 + Math.cos(a) * (3 + i)) * 4) / 4, Math.round((y - 6 + Math.sin(a * 1.3) * 2) * 4) / 4, 0.25, 0.25, i % 2 ? '#ffd23a' : '#2a2420');
    }
  };
  bees.over = true;
  add.anim(bees);
}

// A garden bench of oak, its feet on row y from x.
function m2ShireBench(L, add, x, y) {
  m2Shadow(L, x + 3.5, y - 0.25, 3.5, 0.8, 0.8);
  const o = m2Thing(add, x, y - 4, 6, 4.25, y, (g) => {
    const W = M2_PAL.wood;
    pxBox(g, 0, 0, 6, 1.5, W[2]); pxBox(g, 0, 0, 6, 0.25, W[4]); pxBox(g, 0, 0.75, 6, 0.25, W[1]);
    pxBox(g, 0, 2, 6, 1, W[3]); pxBox(g, 0, 2, 6, 0.25, W[5]);
    for (const lx of [0.25, 5.25]) pxBox(g, lx, 3, 0.5, 1.25, W[0]);
  });
  o.foot = [x, y - 1.5, x + 6, y];
}
