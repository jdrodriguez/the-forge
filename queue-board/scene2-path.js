// scene2-path.js: how the walkers of the map from above (scene2.js) find their way. Once per layout the world is cut
// into cells two units square, and a cell is closed where feet may not go: water (except where a bridge's paving is
// laid over it), cliffs, the footprint of every standing thing (o.foot when its artist gives one, else a band along the
// bottom of its box where it meets the ground: a trunk, a wall, a rock, a range's foot) and every station (a desk, a
// garden plot, an anvil, a lantern post). m2.paths.route(a, from, to) finds the shortest way through the open cells
// (A*, eight ways from each cell), then pulls it tight into a few straight legs that stay clear, and returns them as
// waypoints ending at the goal, or null when no way reaches it (across a range, or over water with no bridge). A walker that starts or ends inside something closed (its own desk, a spot on a bank)
// steps out to the nearest open cell first, and one whose goal is deep inside something stops at its edge. Ways are kept per pair of ends, and at most two are searched in a frame (a
// walker asking for a third waits a tick where it is). Building the cells takes a few ms; a search well under one.
// A walker's body is wider than its feet, so a second grid (wide) also marks the ground a body keeps off: each standing
// thing's footprint widened by half a body each side, and reaching back over the floor it stands on (a house to its back
// wall, a tree the roots behind its trunk). Ways keep off that ground, squeezing through it only at a high cost when
// there is no other way, and only near their ends (a door step, a bench by a tree), so nobody walks through a wall, a
// trunk or a house (2026-11-08: they were walking through buildings and trees).

const M2M_CELL = 2;
// Half a body's width (an elf is 7.8 units across at the map's scale), and what a step through a body's ground costs.
const M2M_BODY = 4;
const M2M_SQUEEZE = 8;
// Wraps a motion step or layer so that a fault in it is reported once on the console and skipped, never breaking the
// whole map's frame.
const m2mSafe = (f, name) => function (...x) {
  try { return f.apply(this, x); } catch (e) { if (!m2mSafe.seen.has(name)) { m2mSafe.seen.add(name); console.error(`motion ${name}:`, e); } return undefined; }
};
m2mSafe.seen = new Set();
const m2mPath = { L: null, key: '', open: null, gw: 0, gh: 0, cache: new Map(), tick: -1, used: 0 };
m2.builds.push((L) => { m2mPath.L = L; m2mPath.key = ''; });

// The box a standing thing's feet take on the ground.
function m2mFoot(o) {
  if (o.foot) return o.foot;
  const deep = Math.max(0.75, Math.min(o.h * 0.15, o.w * 0.2, 4));
  return [o.x + o.w * 0.3, o.z - deep, o.x + o.w * 0.7, o.z + 0.25];
}
// The ground a standing thing keeps a walker's body off. A thing as wide at its foot as it is drawn (a house, a wall, a
// rock) covers its floor back about half its height, at most as deep as it is wide; a trunk under a wider crown keeps
// only the ground round the trunk.
function m2mBlock(o) {
  const [x0, y0, x1, y1] = m2mFoot(o);
  const fw = x1 - x0;
  const back = fw >= o.w * 0.5 ? Math.min(o.h * 0.5, Math.max(fw * 0.6, 3), 24) : 4;
  return [x0 - M2M_BODY, Math.max(o.y, y0 - back), x1 + M2M_BODY, y1 + 1];
}
// What each station's footprint is, from its front row s.y: the desk, the plot and its edging, the anvil's stump, the post.
function m2mStationFoot(s) {
  if (s.sentry) return [s.x - 2, s.y - 1.5, s.x + 2, s.y + 0.5];
  // The station's width and depth (STYLE4: desk 18 by 8, plot 22 by 14, anvil 10 by 8), never reaching back to where
  // its worker stands behind it.
  const [w, behind] = (typeof M2_STATION !== 'undefined' && M2_STATION[s.kind]) || [14, 6];
  const deep = Math.min(s.kind === 'hobbit' ? 14 : 8, (s.y - s.hy || behind) - 1.5);
  return [s.x - w / 2 - 0.5, s.y - deep, s.x + w / 2 + 0.5, s.y + 0.5];
}

// Builds the open cells for the current layout.
function m2mCells() {
  if (m2mPath.key === m2.key && m2mPath.open) return m2mPath;
  const L = m2mPath.L;
  const gw = Math.ceil(m2.W / M2M_CELL);
  const gh = Math.ceil(m2.H / M2M_CELL);
  const open = new Uint8Array(gw * gh).fill(1);
  if (L) {
    for (let cy = 0; cy < gh; cy += 1) {
      for (let cx = 0; cx < gw; cx += 1) {
        const m = m2MatAt(L, (cx + 0.5) * M2M_CELL, (cy + 0.5) * M2M_CELL);
        if (m === M2_MAT.water || m === M2_MAT.cliff) open[cy * gw + cx] = 0;
      }
    }
  }
  const shut = (grid, [x0, y0, x1, y1], m = 0.75) => {
    for (let cy = Math.max(0, Math.floor(y0 / M2M_CELL)); cy <= Math.min(gh - 1, Math.floor(y1 / M2M_CELL)); cy += 1) {
      for (let cx = Math.max(0, Math.floor(x0 / M2M_CELL)); cx <= Math.min(gw - 1, Math.floor(x1 / M2M_CELL)); cx += 1) {
        const [mx, my] = [(cx + 0.5) * M2M_CELL, (cy + 0.5) * M2M_CELL];
        if (mx > x0 - m && mx < x1 + m && my > y0 - m && my < y1 + m) grid[cy * gw + cx] = 0;
      }
    }
  };
  for (const o of m2.standing ?? []) shut(open, m2mFoot(o));
  for (const s of m2.stations) shut(open, m2mStationFoot(s));
  const wide = open.slice();
  for (const o of m2.standing ?? []) shut(wide, m2mBlock(o), 0);
  Object.assign(m2mPath, { key: m2.key, open, wide, gw, gh });
  m2mPath.cache.clear();
  return m2mPath;
}

const m2mCellOf = (P, x, y) => Math.max(0, Math.min(P.gh - 1, Math.floor(y / M2M_CELL))) * P.gw + Math.max(0, Math.min(P.gw - 1, Math.floor(x / M2M_CELL)));
// The nearest open cell to cell i, searching outward ring by ring up to r cells; i itself if none.
function m2mNearOpen(P, i, r = 8) {
  if (P.open[i]) return i;
  const [cx, cy] = [i % P.gw, Math.floor(i / P.gw)];
  for (let d = 1; d <= r; d += 1) {
    let best = -1;
    let bd = Infinity;
    for (let y = cy - d; y <= cy + d; y += 1) {
      for (let x = cx - d; x <= cx + d; x += 1) {
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== d || x < 0 || y < 0 || x >= P.gw || y >= P.gh) continue;
        const k = y * P.gw + x;
        const e = Math.hypot(x - cx, y - cy);
        if (P.open[k] && e < bd) { bd = e; best = k; }
      }
    }
    if (best >= 0) return best;
  }
  return i;
}

// A* from cell s to cell t through open cells, a step onto a body's ground (P.wide) costing M2M_SQUEEZE: the cells of
// the way, or null.
function m2mSearch(P, s, t) {
  const n = P.gw * P.gh;
  const g = (m2mSearch.g ??= new Float32Array(0)).length >= n ? m2mSearch.g : (m2mSearch.g = new Float32Array(n));
  const from = m2mSearch.from?.length >= n ? m2mSearch.from : (m2mSearch.from = new Int32Array(n));
  const seen = m2mSearch.seen?.length >= n ? m2mSearch.seen : (m2mSearch.seen = new Uint32Array(n));
  const stamp = (m2mSearch.stamp = (m2mSearch.stamp ?? 0) + 1);
  const [tx, ty] = [t % P.gw, Math.floor(t / P.gw)];
  const h = (i) => { const dx = Math.abs((i % P.gw) - tx); const dy = Math.abs(Math.floor(i / P.gw) - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  // A binary heap of [f, cell].
  const heap = [];
  const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1; const r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  seen[s] = stamp; g[s] = 0; from[s] = -1;
  push(h(s), s);
  for (let steps = 0; heap.length && steps < 60000; steps += 1) {
    const [f, u] = pop();
    if (u === t) {
      const out = [];
      for (let v = t; v >= 0; v = from[v]) out.push(v);
      return out.reverse();
    }
    if (f - h(u) > g[u] + 1e-4) continue;
    const [ux, uy] = [u % P.gw, Math.floor(u / P.gw)];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const [vx, vy] = [ux + dx, uy + dy];
        if (vx < 0 || vy < 0 || vx >= P.gw || vy >= P.gh) continue;
        const v = vy * P.gw + vx;
        if (!P.open[v] || (dx && dy && (!P.open[uy * P.gw + vx] || !P.open[vy * P.gw + ux]))) continue;
        const d = g[u] + (dx && dy ? 1.414 : 1) * (P.wide[v] ? 1 : M2M_SQUEEZE);
        if (seen[v] === stamp && d >= g[v]) continue;
        seen[v] = stamp; g[v] = d; from[v] = u;
        push(d + h(v), v);
      }
    }
  }
  return null;
}

// Whether the straight leg from (ax, ay) to (bx, by) keeps to open cells, sampled every half unit, and off a body's
// ground (P.wide) except in the cells ok(cell) allows: those the way itself squeezes through, and near its ends.
function m2mClear(P, ax, ay, bx, by, ok = () => true) {
  const n = Math.ceil(Math.hypot(bx - ax, by - ay) * 2);
  for (let i = 1; i < n; i += 1) {
    const c = m2mCellOf(P, ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
    if (!P.open[c] || (!P.wide[c] && !ok(c))) return false;
  }
  return true;
}
// The cells within 6 units of a way's ends, where it may squeeze past what stands by its start or goal.
const m2mNearEnds = (P, from, to) => (c) => [from, to].some((e) => Math.hypot((c % P.gw + 0.5) * M2M_CELL - e.x, (Math.floor(c / P.gw) + 0.5) * M2M_CELL - e.y) < 6);

// The way for walker a from `from` to `to`, as waypoints.
// The way round people standing in it too: avoid is a list of places where someone stands, each closed for this one
// search (a little ring of cells round it), so a walker goes round a worker at its desk instead of through it.
function m2mRoute(a, from, to, avoid) {
  const P = m2mCells();
  const shut = [];
  for (const p of avoid ?? []) {
    if (Math.hypot(p.x - from.x, p.y - from.y) < 11 || Math.hypot(p.x - to.x, p.y - to.y) < 11) continue;
    for (let y = p.y - 5; y <= p.y + 4; y += M2M_CELL) {
      // Their body's half width (its shadow's, not the drawing's frame, which leaves room for tools) and a walker's.
      const r = Math.max(8, (m2BodyOf(p.kind ?? '').shadow ?? 8) / 2 + M2M_BODY + 1);
      for (let x = p.x - r; x <= p.x + r; x += M2M_CELL) {
        const i = m2mCellOf(P, x, y);
        if (P.open[i]) { P.open[i] = 0; shut.push(i); }
      }
    }
  }
  let way;
  try { way = m2mWay(P, from, to, shut.length > 0); } finally { for (const i of shut) P.open[i] = 1; }
  // Someone stands in the only way through (on a bridge): then through past them after all.
  return way === null && shut.length ? m2mWay(P, from, to, false) : way;
}
function m2mWay(P, from, to, fresh) {
  const key = `${Math.round(from.x)},${Math.round(from.y)}>${Math.round(to.x * 2)},${Math.round(to.y * 2)}`;
  const hit = fresh ? undefined : P.cache.get(key);
  if (hit !== undefined) return hit && hit.map((p) => ({ ...p }));
  const nearEnds = m2mNearEnds(P, from, to);
  if (m2mClear(P, from.x, from.y, to.x, to.y, nearEnds) && P.open[m2mCellOf(P, from.x, from.y)] && P.open[m2mCellOf(P, to.x, to.y)]) return [{ x: to.x, y: to.y }];
  if (m2mPath.tick !== m2.tick) Object.assign(m2mPath, { tick: m2.tick, used: 0 });
  if (m2mPath.used >= 2) return [{ x: from.x, y: from.y }];
  m2mPath.used += 1;
  const s = m2mNearOpen(P, m2mCellOf(P, from.x, from.y));
  const t = m2mNearOpen(P, m2mCellOf(P, to.x, to.y));
  const cells = m2mSearch(P, s, t);
  if (!cells) { if (!fresh) P.cache.set(key, null); return null; }
  const mid = (i) => ({ x: (i % P.gw + 0.5) * M2M_CELL, y: (Math.floor(i / P.gw) + 0.5) * M2M_CELL });
  // Out of the closed thing it starts in, along the cells, then legs pulled tight from each corner to the farthest
  // cell it can see.
  const pts = cells.map(mid);
  const onWay = new Set(cells);
  const ok = (c) => onWay.has(c) || nearEnds(c);
  const end = P.open[m2mCellOf(P, to.x, to.y)] ? { x: to.x, y: to.y } : null;
  if (end) pts[pts.length - 1] = end;
  const out = [];
  let at = P.open[m2mCellOf(P, from.x, from.y)] ? { x: from.x, y: from.y } : pts[0];
  if (at === pts[0]) out.push(pts[0]);
  for (let i = 0; i < pts.length - 1;) {
    let j = pts.length - 1;
    while (j > i + 1 && !m2mClear(P, at.x, at.y, pts[j].x, pts[j].y, ok)) j -= 1;
    out.push(pts[j]);
    at = pts[j];
    i = j;
  }
  // A goal inside something closed is reached from its nearest open cell when that is a step away (a door step, a
  // bench); one far inside (a spot out in the river) is given up for that open cell.
  const last = out.at(-1) ?? at;
  const wet = m2mPath.L && m2MatAt(m2mPath.L, to.x, to.y) === M2_MAT.water;
  if (!end && !wet && Math.hypot(last.x - to.x, last.y - to.y) <= 4) out.push({ x: to.x, y: to.y });
  if (P.cache.size > 400) P.cache.clear();
  if (!fresh) P.cache.set(key, out);
  return out.map((p) => ({ ...p }));
}

m2.paths = { route: m2mSafe(m2mRoute, 'route'), cells: m2mCells };
