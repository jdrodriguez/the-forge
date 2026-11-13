// scene2-plan-south.js: the south of the map from above (scene2.js), laid out once the realms have their final size
// (m2PlanSouth, which scene2-core-places.js's m2PlanAfter calls), as Dale is laid out under Erebor's. The books put
// Isengard at the Misty Mountains' southern tip with Fangorn east of it, the Gap of Rohan between Isengard and Helm's
// Deep in the White Mountains' northwest, Edoras on its hill under those mountains and the Riddermark's plains round it;
// scene2-plan.js gives those places as fractions of the map. A realm grows south when its stations need the room
// (m2PlanStations), and nothing told the south: at a typical window Rivendell's seven elves take three rows of desks and
// its lower valley reaches 0.78 of the map's height, past Isengard's 0.69, so Orthanc stood beside the elves' desks,
// the archery range never found room, and the Gap, Edoras, the Greenway and Eomer's ride sat in the valley too (2026-11-09: "Yes, fix it"). Now each of those places keeps its book place when its standing room is clear of every
// realm with the room its walkers use round it, every station, and every other landmark's zone, and otherwise moves to
// the nearest clear ground on the side the books put it: Helm's Deep first; then Isengard south of its book place and
// within reach of it across, all of Orthanc and Saruman clear where the map is tall enough, else up to Orthanc's horns,
// else up to Saruman's footing; the Gap between them; Edoras toward its book place; Fangorn and the Riddermark on the
// plains. The ranges' peaks keep out of these places' zones (scene2-land-peaks.js), so the White Mountains open round
// Isengard where it comes down among them (at a typical window most of their western massif gives way to it). Isengard
// or Helm's Deep with no clear ground in reach marks the plan as not fitting, so m2Fit tries the next scale down, and
// takes the nearest ground clear of the realms (or the least crowded); the Gap, Edoras, Fangorn and the Riddermark take
// their least crowded spot. The roads round them go round the realms and Isengard's ring (m2SthAround).

// Each place's standing room round its point, as [west, above, east, below] in units: Helm's Deep's zone; Edoras's hill
// with Meduseld's cottage on it; Fangorn's four ancient trees with Treebeard's places; and the Riddermark's two lantern
// posts with the middle of Eomer's ride round them. Isengard's ring with its shadow, Orthanc (40 units to its horns)
// and Saruman on its top beside his stone (his hat 50 units up, his walk west of the stone) are its zone; the rooms it
// tries in turn are all of that, then up to the horns' tips, then up to Saruman's footing.
const M2STH_ROOM = { helmsDeep: [24, 22, 22, 20], gap: [6, 5, 6, 5], edoras: [14, 20, 14, 9], fangorn: [16, 24, 19, 10], riddermark: [18, 30, 17, 8] };
const M2STH_ISEN = { zone: [22, 50, 20, 12], rooms: [[22, 50, 20, 12], [22, 38, 20, 12], [22, 27, 20, 12]] };
// How far from its book place Isengard looks for ground, across the map (as a share of its width) either way, and
// north (in units), so it stays south of the realm at the mountains' tip.
const M2STH_REACH = [0.12, 4];
// The Gap sits this share of the way from Isengard to Helm's Deep, as in the books' map.
const M2STH_FROM = { gap: 0.47 };
const m2SthHit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const m2SthBox = (p, [l, t, r, b]) => ({ x0: p.x - l, y0: p.y - t, x1: p.x + r, y1: p.y + b });
// How much of box q the boxes in keep cover.
const m2SthOver = (q, keep) => keep.reduce((s, k) => s + Math.max(0, Math.min(q.x1, k.x1) - Math.max(q.x0, k.x0)) * Math.max(0, Math.min(q.y1, k.y1) - Math.max(q.y0, k.y0)), 0);

// The best point for a place that wants to be at want: its box (room round it) on the map and clear of every box in
// hard, scored by how far it moves (score) and how much of the boxes in soft it covers (k units each square unit).
// want itself when it is clear of both; else the best point on a two-unit grid with a finite score, or null.
function m2SthFind(plan, hard, soft, want, room, score, k = 0.25) {
  const { W, H } = plan;
  const ok = (q) => q.x0 >= 1 && q.y0 >= 1 && q.x1 <= W - 1 && q.y1 <= H - 1 && !hard.some((k) => m2SthHit(q, k));
  const at = m2SthBox(want, room);
  if (ok(at) && !m2SthOver(at, soft)) return { x: want.x, y: want.y };
  let best = null;
  for (let y = room[1] + 1; y <= H - room[3] - 1; y += 2) {
    for (let x = room[0] + 1; x <= W - room[2] - 1; x += 2) {
      let d = score(x, y);
      if (!Number.isFinite(d) || (best && d >= best.d)) continue;
      const q = m2SthBox({ x, y }, room);
      if (!ok(q)) continue;
      d += m2SthOver(q, soft) * k;
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best && { x: best.x, y: best.y };
}
// The point whose box the boxes in keep cover least, nearest want among equals: a landmark with no clear ground.
function m2SthLeast(plan, keep, want, room, score) {
  let best = null;
  for (let y = room[1] + 1; y <= plan.H - room[3] - 1; y += 2) {
    for (let x = room[0] + 1; x <= plan.W - room[2] - 1; x += 2) {
      const d = m2SthOver(m2SthBox({ x, y }, room), keep) * 4 + score(x, y);
      if (!best || d < best.d) best = { x, y, d };
    }
  }
  return best ? { x: best.x, y: best.y } : want;
}

function m2PlanSouth(plan) {
  const { W, H, places: P, zones: Z } = plan;
  const men = Boolean(plan.edoras);
  const own = new Set(['isengard', 'helmsDeep']);
  // The realms with the room their walkers use round them, and each station with its worker: no place stands there.
  const realms = [
    ...plan.realms.map((r) => ({ x0: r.x - 4, y0: r.y - 4, x1: r.x + r.w + 4, y1: r.y + r.h + 4 })),
    ...plan.stations.map((s) => { const [x0, y0, x1, y1] = typeof m2StationBox === 'function' ? m2StationBox(s) : [s.x - 9, s.y - 20, s.x + 9, s.y + 1]; return { x0, y0, x1, y1 }; }),
  ];
  // The other landmarks' zones, and the boxes of the places placed here, each added as it is placed.
  const zones = Object.entries(Z).filter(([k]) => !own.has(k) && !k.startsWith('gollum:')).map(([, z]) => z);
  const mine = [];
  // A landmark (Helm's Deep, Isengard) keeps clear of the other landmarks too; with no clear ground anywhere it takes
  // the least crowded spot and the plan is marked as not fitting. A land (the Gap, Edoras's hill, the Riddermark,
  // Fangorn) keeps clear of the realms and the places here, and of the other zones where it can.
  const mark = (want, room, score) => {
    const at = m2SthFind(plan, [...realms, ...zones, ...mine], [], want, room, score);
    if (at) return at;
    plan.fits = false;
    return m2SthLeast(plan, [...realms, ...zones, ...mine], want, room, score);
  };
  const land = (want, room, score, k, also = []) => m2SthFind(plan, [...realms, ...mine, ...also], zones, want, room, score, k) ?? m2SthLeast(plan, [...realms, ...mine], want, room, score);
  // The mountain ranges' peaks along their lines, which a forest or the lantern posts need to keep off (a landmark's
  // zone keeps the peaks off it instead).
  const peaks = [];
  for (const pts of Object.values(plan.ranges ?? {})) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [[ax, ay], [bx, by]] = [pts[i], pts[i + 1]];
      const n = Math.ceil(Math.hypot(bx - ax, by - ay) / 6);
      for (let j = 0; j <= n; j += 1) { const [x, y] = [ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n]; peaks.push({ x0: x - 8, y0: y - 18, x1: x + 8, y1: y + 4 }); }
    }
  }
  // How far a point is from the place wanted, moving across costing kx a unit, north kn and south ks.
  const near = (want, kx, kn, ks) => (x, y) => Math.hypot((x - want.x) * kx, (y - want.y) * (y < want.y ? kn : ks));
  const helm = mark(P.helmsDeep, M2STH_ROOM.helmsDeep, near(P.helmsDeep, 2, 2, 1));
  if (P.glitteringCaves) P.glitteringCaves = { x: P.glitteringCaves.x + helm.x - P.helmsDeep.x, y: P.glitteringCaves.y + helm.y - P.helmsDeep.y };
  P.helmsDeep = helm;
  mine.push(Z.helmsDeep = m2SthBox(helm, M2STH_ROOM.helmsDeep));
  // Isengard south of its book place: all of it clear if the map has the room, else up to Orthanc's horns, else up to
  // Saruman's footing. With none of those, it keeps clear of the realms anywhere it can and the plan does not fit.
  const book = P.isengard;
  const south = near(book, 3, 3, 1);
  const reach = (x, y) => (Math.abs(x - book.x) > M2STH_REACH[0] * W || y < book.y - M2STH_REACH[1] ? Infinity : south(x, y));
  let isen = null;
  for (const room of M2STH_ISEN.rooms) if (!isen) isen = m2SthFind(plan, [...realms, ...zones, ...mine], [], book, room, reach);
  if (!isen) {
    plan.fits = false;
    const foot = M2STH_ISEN.rooms.at(-1);
    isen = m2SthFind(plan, [...realms, ...mine], zones, book, foot, south) ?? m2SthLeast(plan, [...realms, ...zones, ...mine], book, foot, south);
  }
  P.isengard = isen;
  P.orthancTop = { x: isen.x, y: isen.y - 26 };
  mine.push(Z.isengard = m2SthBox(isen, M2STH_ISEN.zone));
  // The Gap of Rohan between Isengard and Helm's Deep, where the Greenway comes south.
  const gw = { x: isen.x + (helm.x - isen.x) * M2STH_FROM.gap, y: isen.y + (helm.y - isen.y) * M2STH_FROM.gap };
  P.gap = land(gw, M2STH_ROOM.gap, near(gw, 1, 1, 1));
  // With no Men's realm, Edoras is a hall on its hill (scene2-places.js) at the Greenway's end, as near its book place
  // as there is room. Fangorn and the Riddermark (Eomer's lantern posts, scene2-plan.js m2PlanPosts) stay as near
  // theirs as the realms, these places and the mountains leave room for, on the plains rather than down in Gondor's
  // south, and out of the other landmarks' boxes where they can (the forest's trees keep out of every zone anyway).
  if (!men) {
    P.edoras = land(P.edoras, M2STH_ROOM.edoras, near(P.edoras, 1, 1, 1));
    mine.push(m2SthBox(P.edoras, M2STH_ROOM.edoras));
  }
  P.fangorn = land(P.fangorn, M2STH_ROOM.fangorn, near(P.fangorn, 1, 1, 2), 1 / 16, peaks);
  const wood = m2SthBox(P.fangorn, M2STH_ROOM.fangorn);
  // Eomer's posts may stand in Fangorn's eaves (its trees keep a clearing round each post) but not away north of it.
  P.riddermark = m2SthFind(plan, [...realms, ...mine, ...peaks], [...zones, wood], P.riddermark, M2STH_ROOM.riddermark, near(P.riddermark, 1, 3, 2), 1 / 16)
    ?? m2SthLeast(plan, [...realms, ...mine], P.riddermark, M2STH_ROOM.riddermark, near(P.riddermark, 1, 3, 2));
  mine.push(wood);
}

// A road's line with corners added where it would cross a realm (with the room round it) or one of the boxes in also:
// each leg that runs into a box takes the shortest way round by the boxes' corners (a corner inside another box is no
// way through), so a road passes a grown realm or Isengard's ring by its side instead of through its desks or its walls
// (2026-11-09: the Greenway crossed Rivendell's lower valley). A box a leg starts or ends in is the leg's own
// way in or out (the Greenway's end on Edoras's road, say) and does not count for that leg.
function m2SthAround(plan, pts, also = []) {
  const boxes = [...plan.realms.map((r) => ({ x0: r.x - 6, y0: r.y - 6, x1: r.x + r.w + 6, y1: r.y + r.h + 6 })), ...also];
  const inside = (p, b) => p[0] > b.x0 && p[0] < b.x1 && p[1] > b.y0 && p[1] < b.y1;
  const cuts = (a, b, q) => {
    for (let t = 0.02; t < 1; t += 0.02) if (inside([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], q)) return true;
    return false;
  };
  const kept = pts.filter((p, i) => i === 0 || i === pts.length - 1 || !boxes.some((q) => inside(p, q)));
  const out = [kept[0]];
  for (let i = 1; i < kept.length; i += 1) {
    const [a, b] = [out.at(-1), kept[i]];
    const live = boxes.filter((q) => !inside(a, q) && !inside(b, q));
    const open = (p, r) => !live.some((q) => cuts(p, r, q));
    if (!open(a, b)) {
      // The shortest way from a to b over the corners of the boxes in the way (Dijkstra on the few corners).
      const N = [a, b, ...live.flatMap((q) => [[q.x0, q.y0], [q.x1, q.y0], [q.x1, q.y1], [q.x0, q.y1]]).filter((c) => !live.some((q) => inside(c, q)))];
      const dist = N.map((_, k) => (k ? Infinity : 0));
      const prev = N.map(() => -1);
      const done = N.map(() => false);
      for (;;) {
        let u = -1;
        for (let k = 0; k < N.length; k += 1) if (!done[k] && dist[k] < Infinity && (u < 0 || dist[k] < dist[u])) u = k;
        if (u < 0 || u === 1) break;
        done[u] = true;
        for (let v = 0; v < N.length; v += 1) {
          const d = dist[u] + Math.hypot(N[v][0] - N[u][0], N[v][1] - N[u][1]);
          if (!done[v] && d < dist[v] && open(N[u], N[v])) { dist[v] = d; prev[v] = u; }
        }
      }
      const way = [];
      for (let k = prev[1]; k > 0; k = prev[k]) way.unshift(N[k]);
      out.push(...way);
    }
    out.push(b);
  }
  return out;
}
