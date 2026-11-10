// scene2-erebor-river.js: the river Running on the map from above (scene2-erebor.js lays it out). It issues from an
// arch of dressed stone at the foot of the Lonely Mountain's eastern spur, beside the Front Gate, falling in a short
// white cascade into a straight-walled stone channel that the dwarves cut for it: south a little, east along the
// court's front, then south down the realm's east side through the paved yard, with a stone bridge wherever a walk or a
// rune band crosses it. Below the yard it leaves its channel and runs on as a natural stream, bending between sandy
// banks to the Long Lake. This file lays its water once the world's rivers are down and gives its line to plan.rivers
// so its glints move with theirs (scene2-fx.js).

// The river's line, a point every two units: the channel's straight runs, then the stream's bends; and a test for
// whether a place lies in its bed, which the court and yard leave open.
function m2EreRiverRoute(E, plan) {
  const { r } = E;
  const xs = Math.min(E.right.x1 - 6, E.cx + E.fw / 2 + 6);
  const ys = E.foot(xs) + 0.5;
  const rx = Math.max(xs + 2, Math.round((E.right.x0 + E.right.x1) / 2));
  const ya = E.courtBot - 7;
  const yb = E.yardBot ?? r.y + r.h - 2;
  const lake = plan.places.longLake;
  const yEnd = r.y + r.h + 4;
  const line = (ax, ay, bx, by) => { const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2)); const out = []; for (let j = 0; j < n; j += 1) out.push([ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]); return out; };
  const channel = [...line(xs, ys, xs, ya), ...line(xs, ya, rx, ya), ...line(rx, ya, rx, yb), [rx, yb]];
  const tail = [[rx, yb]];
  const ends = lake && lake.y > yEnd ? [[rx, yEnd], [(rx + lake.x) / 2 + 3, (yEnd + lake.y) / 2], [lake.x + 2, lake.y - plan.H * 0.04]] : [[rx, yEnd + 6]];
  for (const [bx, by] of ends) {
    const [ax, ay] = tail.at(-1);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 2));
    for (let j = 1; j <= n; j += 1) {
      const t = j / n;
      tail.push([ax + (bx - ax) * t + Math.sin(t * Math.PI) * Math.sin((ay + (by - ay) * t) / 5) * 1.6, ay + (by - ay) * t]);
    }
  }
  const pts = [...channel, ...tail.slice(1)];
  E.river = pts;
  E.channel = { xs, ys, ya, rx, yb, hw: 2.4 };
  E.tail = tail;
  E.riverKey = `${Math.round(xs)},${rx},${Math.round(yb)}`;
  // Its bed as a mask at half a unit, stamped from discs round each point, for the court to leave open.
  const [mx0, my0, mw, mh] = [r.x - 4, r.y, (r.w + 8) * 2, (r.h + 8) * 2];
  const mask = new Uint8Array(mw * mh);
  for (const [px, py] of pts) {
    for (let j = -8; j <= 8; j += 1) {
      for (let i = -8; i <= 8; i += 1) {
        const [u, v] = [Math.round((px - mx0) * 2) + i, Math.round((py - my0) * 2) + j];
        if (u >= 0 && v >= 0 && u < mw && v < mh && i * i + j * j <= 52) mask[v * mw + u] = 1;
      }
    }
  }
  E.wet = (x, y) => { const [u, v] = [Math.round((x - mx0) * 2), Math.round((y - my0) * 2)]; return u >= 0 && v >= 0 && u < mw && v < mh && mask[v * mw + u] === 1; };
  for (let k = 0; k < pts.length - 1; k += 3) {
    const [x, y] = pts[k];
    E.keep.push({ x0: x - 5, y0: y - 3, x1: x + 5, y1: y + 3 });
  }
}

// The arch the river issues from, the channel's walls, the stream's banks below the yard, the cascade, the bridges.
function m2EreRiver(L, add, E, plan) {
  const pts = E.river;
  if (!pts) return;
  const C = E.channel;
  const tail = E.tail;
  const G = M2_ERE_GATE;
  // The water goes down once the world's rivers and roads are down, and its glints move with theirs.
  add.late(() => {
    m2Stroke(L, pts.slice(0, pts.length - tail.length + 1), C.hw, M2_MAT.water);
    m2Stroke(L, tail, (t) => C.hw + 1.4 + t * 1.6, M2_MAT.sand, { over: [...M2_LAND_MATS, M2_MAT.plaza] });
    m2Stroke(L, tail, (t) => C.hw - 0.2 + t * 1.2, M2_MAT.water);
    for (const b of E.bridgeDecks ?? []) m2Rect(L, b[0], b[1], b[2], b[3], M2_MAT.terrace, 60);
    plan.rivers.running = pts;
  });
  const [ax, ay] = pts[0];
  L.decals.push((g) => {
    m2Raster(g, ax - 4, ay - 6, 32, 24, (px, py) => {
      const d = Math.hypot(px + 0.5 - 16, Math.max(0, 11 - py) * 1.2);
      if (d > 15 || py > 23) return null;
      if (d > 11) return d > 14 ? G[0] : (Math.floor(Math.atan2(11 - py, px - 16) * 5) % 2 ? G[4] : G[3]);
      return py > 17 ? '#0e1c2a' : '#070608';
    });
    // The channel's walls: a coping of pale dressed stone either side, lit along its top, its inner face dark.
    const wall = (x, y, w, h) => { pxBox(g, x, y, w, h, G[4]); pxBox(g, x, y, w, 0.25, G[5]); };
    const k = C.hw;
    wall(C.xs - k - 1, C.ys + 1.5, 1, C.ya - C.ys + k);
    wall(C.xs + k, C.ys + 1.5, 1, C.ya - C.ys - k);
    wall(C.xs + k, C.ya - k - 1, C.rx - C.xs, 1);
    wall(C.xs - k - 1, C.ya + k, C.rx - C.xs + 1, 1);
    wall(C.rx + k, C.ya - k - 1, 1, C.yb - C.ya + k + 1);
    wall(C.rx - k - 1, C.ya + k, 1, C.yb - C.ya - k);
    pxBox(g, C.rx - k, C.ya + k, 0.25, C.yb - C.ya - k, G[1]);
    pxBox(g, C.xs + k, C.ya + k + 1, C.rx - C.xs - k * 2, 0.25, '#0e1c2a');
    // Below the yard, stones along the stream's banks.
    for (let i = 2; i < tail.length; i += 2) {
      const [x, y] = tail[i];
      const sd = m2Hash(i, 2, 81) < 0.5 ? 1 : -1;
      const w = C.hw + 1.4 + (i / tail.length) * 1.6;
      pxBox(g, Math.round((x + sd * w) * 4) / 4, Math.round(y * 4) / 4, 0.75, 0.5, '#5a5662');
      pxBox(g, Math.round((x + sd * w) * 4) / 4, Math.round(y * 4) / 4, 0.5, 0.25, '#a8a2aa');
    }
  });
  // The cascade out of the arch: white water falling in three frames, foam spreading at its foot.
  const frames = m2EreArt.get('fall') ?? [0, 1, 2].map((k) => {
    const { c, g } = m2Canvas(6, 4);
    m2Raster(g, 0, 0, 24, 16, (px, py) => {
      const fall = px > 5 && px < 19 && py < 11;
      const foam = py >= 9 && Math.abs(px + 0.5 - 12) < 4 + (py - 9) * 1.4;
      if (!fall && !foam) return null;
      const s = (py * 3 + px * 5 + k * 7) % 9;
      if (foam) return s < 3 ? '#ffffff' : s < 6 ? '#d8f2f6' : '#a6dbe4';
      return (py + k * 2 + (px % 3)) % 4 === 0 ? '#ffffff' : px % 4 === 1 ? '#a6dbe4' : '#7fc0d4';
    });
    return c;
  });
  m2EreArt.set('fall', frames);
  const fall = (g, tick, reduced) => g.drawImage(frames[reduced ? 0 : tick % 3], ax - 3, ay - 2.5, 6, 4);
  fall.under = true;
  fall.m2own = true;
  add.anim(fall);
  // Bridges where the court's front walk and the yard's rune bands cross the channel.
  for (const by of [E.courtBot - 3, ...(E.bands ?? [])]) if (by > C.ya + 5 && by < C.yb - 3) m2EreBridge(L, add, E, C.rx, by);
}
// A bridge over the channel at (x, y): flags across it over a low arch with a parapet each side, sorted at its rows.
function m2EreBridge(L, add, E, x, by) {
  const G = M2_ERE_GATE;
  const [bx0, bw] = [x - 5, 10];
  (E.bridgeDecks ??= []).push([bx0, by - 2.5, bw, 5.5]);
  m2Shadow(L, x + 1, by + 3.5, 5.5, 1.3, 0.9);
  L.decals.push((g) => {
    m2Raster(g, bx0, by - 2.5, bw * 4, 22, (px, py) => (px === 0 || px === bw * 4 - 1 || py === 21 ? M2_ERE_FLAG[0] : M2_ERE_FLAG[(px % 12 === 0) ? 1 : py < 2 ? 5 : 3]));
    m2Raster(g, bx0 + 1, by + 3, (bw - 2) * 4, 3, (px) => (Math.abs(px - (bw - 2) * 2) < 12 ? '#0e1c2a' : null));
  });
  for (const [top, z] of [[by - 4, by - 2.25], [by + 2.5, by + 3.5]]) {
    const o = m2Thing(add, bx0 - 0.5, top, bw + 1, 2.5, z, (g) => {
      m2Raster(g, 0, 0, (bw + 1) * 4, 10, (px, py) => (py < 3 ? G[py === 0 ? 1 : 5] : px === 0 || px === (bw + 1) * 4 - 1 || py === 9 ? G[0] : G[(px + (py > 6 ? 6 : 0)) % 12 === 0 ? 1 : 3]));
    });
    o.foot = [bx0 - 0.5, z - 1, bx0 + bw + 0.5, z];
  }
}
