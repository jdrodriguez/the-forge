// scene2-gondor-fields.js: the lands round the White City on the map from above (scene2.js). The Pelennor's farms
// east of Minas Tirith down to the Anduin, a patchwork of wheat, greens and plough between hedgerows with white
// steadings, ringed by the long low Rammas Echor with its small towers and its gate on the causeway; Osgiliath's ruined
// bridge and broken domes across the river; and Gondor's green southern fields, Lossarnach and Lebennin, in strips and
// orchard rows. Ground goes in as materials and decals, the few standing things as cached canvases with footprints.

const M2GF_STATE = {};
const M2GF_STONE = ['#4a4c54', '#74767e', '#9c9ea4', '#c0c0c0', '#dcdad4', '#f2f0ea'];
const M2GF_SLATE = ['#2a3646', '#3a4a5e', '#4e6278', '#6a8098'];

// Where the Anduin runs at row y (its meandered line once the world has painted it).
function m2GfRiverX(plan, y) {
  const pts = plan.rivers?.anduin ?? [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [[ax, ay], [bx, by]] = [pts[i], pts[i + 1]];
    if ((y - ay) * (y - by) <= 0 && ay !== by) return ax + ((bx - ax) * (y - ay)) / (by - ay);
  }
  return plan.W * 0.71;
}
const m2GfFree = (L, plan, x, y) => {
  const m = m2MatAt(L, x, y);
  return m !== M2_MAT.water && m !== M2_MAT.rock && m !== M2_MAT.road && !plan.realms.some((r) => x > r.x - 3 && x < r.x + r.w + 3 && y > r.y - 3 && y < r.y + r.h + 3);
};

// A patchwork of fields in the box: each cell a crop as ground, its edge a hedgerow decal; cells off the land are left.
function m2GfPatch(L, plan, x0, y0, x1, y1, seed, keep) {
  const hedges = [];
  for (let y = y0, row = 0; y < y1; row += 1) {
    const h = 4.5 + m2Hash(row, seed, 3) * 2.5;
    for (let x = x0 + m2Hash(row, seed, 4) * 3; x < x1;) {
      const w = 7 + m2Hash(Math.floor(x), row + seed, 5) * 6;
      const [cx, cy] = [x + w / 2, y + h / 2];
      if (keep(cx, cy) && m2GfFree(L, plan, cx, cy) && m2GfFree(L, plan, x + 0.5, y + 0.5) && m2GfFree(L, plan, x + w - 0.5, y + h - 0.5)) {
        const k = m2Hash(Math.floor(x * 3), row, seed + 6);
        m2Rect(L, x + 0.5, y + 0.5, w - 1, h - 1, k < 0.38 ? M2_MAT.wheat : k < 0.52 ? M2_MAT.greens : k < 0.62 ? M2_MAT.soil : k < 0.8 ? M2_MAT.hobbit : M2_MAT.man);
        hedges.push([x, y, w, h, k]);
      }
      x += w;
    }
    y += h;
  }
  L.decals.push((g) => {
    for (const [x, y, w, h, k] of hedges) {
      g.fillStyle = '#2c4a22';
      g.fillRect(x + 0.25, y + h - 0.75, w - 0.5, 0.5);
      g.fillRect(x + 0.25, y + 0.25, 0.5, h - 0.75);
      g.fillStyle = '#4a7a34';
      for (let t = x + 0.75; t < x + w - 0.5; t += 1.5 + m2Hash(Math.floor(t * 4), Math.floor(y), 9)) g.fillRect(t, y + h - 1, 0.75, 0.5);
      if (k < 0.38) { g.fillStyle = 'rgba(120,80,20,0.35)'; for (let t = y + 1.5; t < y + h - 1; t += 1) g.fillRect(x + 1, t, w - 2, 0.25); }
      if (k > 0.52 && k < 0.62) { g.fillStyle = 'rgba(30,16,8,0.4)'; for (let t = x + 1.25; t < x + w - 1; t += 1) g.fillRect(t, y + 1, 0.25, h - 2); }
    }
  });
  return hedges;
}

// A white steading of Gondor under slate: a house with a door and a window and a lean-to barn, cached once.
function m2GfFarm(add, x, y, flip) {
  const rule = (px, py) => {
    const [u, v] = [flip ? 39 - px : px, py];
    if (v < 9) { const half = 5 + v * 0.9; if (Math.abs(u - 14) > half) return null; return M2GF_SLATE[v < 2 ? 3 : u < 14 ? 2 : 1]; }
    if (v < 18 && u >= 4 && u < 24) return u === 4 || u === 23 ? M2GF_STONE[1] : (u >= 16 && u < 19 && v > 11) ? M2_PAL.wood[1] : (u >= 8 && u < 11 && v > 11 && v < 15) ? '#2a3040' : M2GF_STONE[u < 12 ? 5 : 4];
    if (v >= 7 && v < 18 && u >= 24 && u < 38) return v < 11 ? M2_PAL.thatch[v < 9 ? 4 : 3] : u === 37 ? M2_PAL.wood[0] : M2_PAL.wood[(u & 3) === 0 ? 1 : 2];
    return null;
  };
  const o = m2SouthThing(add, `gfFarm${flip ? 1 : 0}`, x - 5, y - 4.5, 10, 4.5, y, rule, [x - 4, y - 1.5, x + 4.5, y]);
  add.light({ x: x + (flip ? 1.5 : -1.5), y: y - 1.5, r: 3, c: '#ffc56a' });
  return o;
}

// The Rammas Echor: a low wall in an arc round the Pelennor from the mountains north of the city to the river and back,
// a small tower every so often and a gate where the causeway to Osgiliath passes through.
function m2GfRammas(L, plan, P, gateAt) {
  const east = m2GfRiverX(plan, P.y) - 2.5;
  const [cx, cy, rx, ry] = [P.x + 6, P.y + 2, east - P.x - 6, 24];
  const pts = [];
  for (let a = -1.75; a <= 1.75; a += 0.012) pts.push([cx + Math.cos(a) * rx * (a > 0 ? 1 : 0.96), cy + Math.sin(a) * ry, a]);
  L.decals.push((g) => {
    let n = 0;
    for (const [x, y, a] of pts) {
      if (Math.hypot(x - gateAt.x, y - gateAt.y) < 2.2 || m2MatAt(L, x, y) === M2_MAT.water || m2MatAt(L, x, y) === M2_MAT.rock) continue;
      const lit = a < 0.2;
      g.fillStyle = '#2a2c30';
      g.fillRect(x - 0.3, y - 1.25, 0.85, 1.85);
      g.fillStyle = M2GF_STONE[lit ? 3 : 2];
      g.fillRect(x - 0.25, y - 0.5, 0.75, 0.9);
      g.fillStyle = M2GF_STONE[lit ? 5 : 4];
      g.fillRect(x - 0.25, y - 1, 0.75, 0.5);
      if (n % 2 === 0) g.fillRect(x - 0.25, y - 1.5, 0.5, 0.5);
      if (n++ % 40 === 0) {
        g.fillStyle = '#2a2c30';
        g.fillRect(x - 1.25, y - 3.25, 2.5, 3.75);
        g.fillStyle = M2GF_STONE[3];
        g.fillRect(x - 1, y - 2.25, 2, 2.5);
        g.fillStyle = M2GF_STONE[5];
        g.fillRect(x - 1, y - 3, 2, 0.75);
        g.fillStyle = '#2a3040';
        g.fillRect(x - 0.25, y - 1.75, 0.5, 0.75);
      }
    }
    for (const s of [-1, 1]) {
      g.fillStyle = M2GF_STONE[1];
      g.fillRect(gateAt.x + s * 1.9 - 1, gateAt.y - 2.75, 2, 3.25);
      g.fillStyle = M2GF_STONE[s < 0 ? 5 : 4];
      g.fillRect(gateAt.x + s * 1.9 - 1, gateAt.y - 3, 2, 1);
    }
  });
  return { cx, cy, rx, ry };
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  const P = plan.places.minasTirith;
  const gate = plan.places.minasGate ?? { x: P.x + 8.4, y: P.y + 6.5 };
  const os = plan.places.osgiliath;
  if (!P || !os) return;
  const rx = m2GfRiverX(plan, os.y);
  // The causeway from the Great Gate to Osgiliath's bridge, and the Rammas's gate where it crosses the wall.
  const road = [[gate.x, gate.y + 1], [gate.x + 6, gate.y + 2], [(gate.x + rx) / 2, (gate.y + os.y) / 2 + 2], [rx - 3, os.y + 0.5]];
  const ring = { cx: P.x + 6, cy: P.y + 2, rx: m2GfRiverX(plan, P.y) - 2.5 - P.x - 6, ry: 24 };
  const inRing = (x, y) => ((x - ring.cx) / ring.rx) ** 2 + ((y - ring.cy) / ring.ry) ** 2 < 0.92;
  const city = (x, y) => x > P.x - 31 && x < P.x + 31 && y > P.y - 17 && y < P.y + 8.5;
  m2GfPatch(L, plan, P.x - 4, P.y - 22, rx + 2, P.y + 26, 7, (x, y) => inRing(x, y) && !city(x, y) && x > P.x + 4);
  m2Path(L, road, 1.6, M2_MAT.road);
  let gateAt = road[2];
  for (let t = 0; t <= 1; t += 0.02) {
    const [x, y] = [road[1][0] + (road[3][0] - road[1][0]) * t, road[1][1] + (road[3][1] - road[1][1]) * t];
    if (Math.abs(((x - ring.cx) / ring.rx) ** 2 + ((y - ring.cy) / ring.ry) ** 2 - 1) < 0.08) { gateAt = { x, y }; break; }
  }
  m2GfRammas(L, plan, P, gateAt);
  plan.places.rammasGate = gateAt;
  // Steadings on the Pelennor, then Lossarnach's and Lebennin's strips and orchards to the south.
  for (const [dx, dy, f] of [[16, -12, 0], [22, 13, 1], [12, 17, 0], [26, -4, 1]]) {
    const [x, y] = [P.x + dx, P.y + dy];
    if (x < m2GfRiverX(plan, y) - 6 && m2GfFree(L, plan, x, y) && inRing(x, y)) m2GfFarm(add, x, y, f);
  }
  const south = (k, seed) => {
    const q = plan.places[k];
    if (!q) return;
    m2GfPatch(L, plan, q.x - 22, q.y - 8, q.x + 22, Math.min(plan.H - 2, q.y + 12), seed, (x, y) => !city(x, y) && x < m2GfRiverX(plan, y) - 3);
    if (m2GfFree(L, plan, q.x, q.y)) m2GfFarm(add, q.x + 2, q.y + 1, seed & 1);
  };
  south('lossarnach', 13);
  south('lebennin', 17);
  m2GfOsgiliath(L, plan, add, os, rx);
  M2GF_STATE.ms = performance.now() - t0;
});
