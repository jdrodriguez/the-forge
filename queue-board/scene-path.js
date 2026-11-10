// scene-path.js: how the Middle-earth view's workers find their way round things. Each realm's solid ground is the
// landmarks' (P.solid: the falls, the pavilion's pillars, the Shire's hill, Erebor's wall, gate and forge, Rohan's tent),
// every prop's (the healing house, the well, the pen, the vault, the armor stand, carts, racks, lantern posts and the
// rest, a little wider than drawn so a figure's body clears it) and the other workers' desks. A walk whose straight line
// would cross any of them goes from corner to corner round them instead, by the shortest such way (a visibility graph
// over the corners). A box the walker starts or ends in doesn't count, so a worker can still reach its spot at a prop
// and its own desk. Mounted Rangers and walkers on the road keep to the road, where nothing stands. Loaded after
// scene.js; scMove asks sc.path.via for the next place to head for.
const PATH_TOP = GROUND_Y + 1;
const PATH_BOTTOM = SCENE_H - 2;

// A realm's boxes [x0, y0, x1, y1] that feet may not cross, worked out once per layout.
function pathBoxes(r) {
  const P = realmProps(r);
  if (r.pathBoxes?.key !== P.key) {
    r.pathBoxes = { key: P.key, list: [
      ...P.solid,
      // A prop with a foot of its own (a tree's trunk) is walked round at its foot only.
      ...P.list.map((p) => p.foot ?? [p.x - 2, p.y + 2, p.x + p.w + 1, p.base]),
      ...sc.stations.filter((s) => s.realm === r && !s.sentry).map((s) => [s.x - 7, s.y - 4, s.x + 7, s.y]),
    ] };
  }
  // What comes and goes (an eagle's crag, scene-eagle.js) is asked for each time, never cached.
  const extra = sc.path?.extra?.(r) ?? [];
  return extra.length ? [...r.pathBoxes.list, ...extra] : r.pathBoxes.list;
}

const pathInside = (b, x, y) => x >= b[0] - 0.5 && x <= b[2] + 0.5 && y >= b[1] - 0.5 && y <= b[3] + 0.5;
// Whether the line from (ax, ay) to (bx, by) passes through the inside of box b (Liang and Barsky's clipping); running
// along its edge or touching a corner doesn't count.
function pathCuts(ax, ay, bx, by, b) {
  const dx = bx - ax;
  const dy = by - ay;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, ax - b[0] + 0.5], [dx, b[2] + 0.5 - ax], [-dy, ay - b[1] + 0.5], [dy, b[3] + 0.5 - ay]]) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) {
      if (t >= t1) return false;
      t0 = Math.max(t0, t);
    } else {
      if (t <= t0) return false;
      t1 = Math.min(t1, t);
    }
  }
  return t1 - t0 > 1e-6;
}

// The places to pass on the way from a to p, round the realm's boxes: none when the straight line is clear, or when no
// way round is found (then the walker goes straight, as before).
function pathPlan(a, p, r) {
  const live = pathBoxes(r).filter((b) => !pathInside(b, a.x, a.y) && !pathInside(b, p.x, p.y));
  const clear = (u, v) => !live.some((b) => pathCuts(u.x, u.y, v.x, v.y, b));
  if (clear(a, p)) return [];
  const nodes = [{ x: a.x, y: a.y }, { x: p.x, y: p.y }];
  for (const b of live) {
    for (const x of [b[0] - 1, b[2] + 1]) {
      for (const y of [b[1] - 1, b[3] + 1]) {
        if (y < PATH_TOP || y > PATH_BOTTOM || x < 1 || x > sc.W - 1) continue;
        if (!live.some((o) => pathInside(o, x, y))) nodes.push({ x, y });
      }
    }
  }
  // Dijkstra's shortest way from the walker (node 0) to its goal (node 1), testing a leg only when it would help.
  const dist = nodes.map((_, i) => (i ? Infinity : 0));
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i += 1) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || dist[u] === Infinity) return [];
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < nodes.length; v += 1) {
      const d = dist[u] + Math.hypot(nodes[v].x - nodes[u].x, nodes[v].y - nodes[u].y);
      if (!done[v] && d < dist[v] && clear(nodes[u], nodes[v])) { dist[v] = d; prev[v] = u; }
    }
  }
  const pts = [];
  for (let v = prev[1]; v > 0; v = prev[v]) pts.unshift(nodes[v]);
  return pts;
}

// The next place for a to head for on its way to p: the next corner of its way round, or p itself. The way is worked
// out again whenever the goal or the realm's layout changes.
function pathVia(a, p) {
  if (!a.realm || a.mounted || a.road) return p;
  const key = `${Math.round(p.x * 2)},${Math.round(p.y * 2)},${realmProps(a.realm).key}`;
  if (a.route?.key !== key) a.route = { key, pts: pathPlan(a, p, a.realm) };
  const pts = a.route.pts;
  while (pts.length && Math.hypot(pts[0].x - a.x, pts[0].y - a.y) < 0.6) pts.shift();
  // There: the next walk to the same place starts afresh, from wherever the walker is by then.
  if (!pts.length && Math.hypot(p.x - a.x, p.y - a.y) < 0.6) a.route = null;
  return pts[0] ?? p;
}

sc.path = { via: pathVia, boxes: pathBoxes };
