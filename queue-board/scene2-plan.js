// scene2-plan.js: where things go on the map from above (scene2.js). The map is Middle-earth as the books lay it out
// (2026-11-07), compressed and stylized to fill the view, with places given as fractions of its width (west to
// east) and height (north to south). The Shire in the west with the Old Forest east of it; the East Road to Rivendell
// in its valley under the Misty Mountains, which run north to south down the middle; east of them the Anduin's vale,
// Mirkwood, and Erebor in the far northeast above Dale and the Long Lake; in the south Isengard, Fangorn, Rohan's
// plains, the White Mountains, Gondor and Minas Tirith, Ithilien, and Mordor in the southeast. A machine's realm is a
// region at its place (the Shire, Rivendell or Erebor for a machine the config gives a realm, Edoras in Rohan for any other),
// its landmark at the back (north), a road across it and its workers' stations in front. The rest is land, quiet for
// now: the Sentry's riders keep posts in their own lands (as many as the machines' Sentry slots need), wanderers roam
// theirs, and later phases find every place here.

const M2_AT = {
  shire: [0.11, 0.37], oldForest: [0.17, 0.75], bree: [0.24, 0.37], weathertop: [0.255, 0.24],
  highPass: [0.5, 0.3], caves: [0.505, 0.37], oldFord: [0.59, 0.3], beorn: [0.645, 0.21], gladden: [0.595, 0.44], lorien: [0.585, 0.625],
  rhosgobel: [0.648, 0.4], mirkwood: [0.71, 0.25], dale: [0.86, 0.4], longLake: [0.9, 0.48], isengard: [0.425, 0.69], fangorn: [0.51, 0.67],
  edoras: [0.41, 0.775], riddermark: [0.475, 0.745], minasTirith: [0.605, 0.875], pelennor: [0.66, 0.888], ithilien: [0.758, 0.82],
  baradDur: [0.93, 0.82], doom: [0.865, 0.86], gap: [0.37, 0.73],
};
// The realms' regions [west, north, east, south]; a second machine with no realm of its own gets Gondor's fields.
const M2_REGION = { hobbit: [0.0, 0.11, 0.188, 0.75], elf: [0.29, 0.06, 0.5, 0.57], dwarf: [0.745, 0.0, 1.0, 0.36] };
const M2_MEN = [[0.3, 0.685, 0.555, 0.835], [0.47, 0.885, 0.655, 0.995]];
// Gondor's fields beside Edoras: south of the White City and east of the White Mountains' end. It has no room at #map's
// usual scale, so its stations falling off the map mark the plan as not fitting and m2Fit steps down a scale.
const M2_FIELDS = [0.555, 0.892, 0.665, 0.998];
// With a Men's realm at Edoras the south makes room for it: the realm runs from the Misty Mountains' foot down to the White
// Mountains, which step south with Helm's Deep, while Isengard, Fangorn and the Gap close up under the mountains' tip and
// Eomer rides north of the city.
const M2_ROHAN = {
  region: [0.318, 0.645, 0.52, 0.93],
  places: { isengard: [0.365, 0.668], fangorn: [0.48, 0.64], gap: [0.31, 0.67], helmsDeep: [0.262, 0.925], glitteringCaves: [0.25, 0.945], riddermark: [0.575, 0.665] },
  ranges: { misty: [[0.5, -0.03], [0.515, 0.14], [0.508, 0.29], [0.512, 0.44], [0.502, 0.58], [0.45, 0.61], [0.38, 0.618]],
    white: [[0.24, 0.95], [0.3, 0.955], [0.4, 0.95], [0.5, 0.95], [0.56, 0.9], [0.592, 0.876]] },
};
// The rivers and mountain ranges, as lines of places. The Brandywine runs down the Shire's east side to the Sea.
const M2_RIVERS = {
  brandywine: [[0.19, -0.02], [0.192, 0.2], [0.19, 0.4], [0.2, 0.62], [0.2, 0.72], [0.13, 0.84], [0.075, 0.93]],
  anduin: [[0.59, -0.02], [0.595, 0.15], [0.587, 0.3], [0.595, 0.46], [0.612, 0.58], [0.642, 0.66], [0.675, 0.74], [0.715, 0.81], [0.728, 0.86], [0.725, 0.92], [0.71, 1.02]],
  celduin: [[0.9, 0.53], [0.93, 0.58], [0.97, 0.62], [1.02, 0.64]],
};
const M2_RANGES = {
  misty: [[0.5, -0.03], [0.515, 0.14], [0.508, 0.29], [0.512, 0.44], [0.502, 0.58], [0.47, 0.64], [0.44, 0.665]],
  grey: [[0.58, 0.06], [0.66, 0.065], [0.73, 0.055]],
  white: [[0.25, 0.875], [0.3, 0.86], [0.4, 0.85], [0.5, 0.86], [0.575, 0.852], [0.592, 0.866]],
  ephel: [[0.815, 0.7], [0.81, 0.8], [0.817, 0.9], [0.81, 1.03]],
  lithui: [[0.83, 0.69], [0.88, 0.685], [0.96, 0.695], [1.03, 0.69]],
};
// Where each Sentry captain keeps watch, by name: Aragorn the wilds of Eriador on the East Road, Faramir Ithilien,
// Boromir Gondor's fields before Minas Tirith, Eomer the Riddermark. Anyone else rides with Aragorn.
const M2_WATCH = { aragorn: 'weathertop', strider: 'weathertop', faramir: 'ithilien', boromir: 'pelennor', eomer: 'riddermark' };
// Where each wanderer outside the queue roams, by name; anyone else walks the roads, as Gandalf does.
const M2_ROAM = { radagast: ['rhosgobel', 22], treebeard: ['fangorn', 20], bombadil: ['oldForest', 16], tom: ['oldForest', 16], beorn: ['beorn', 22], saruman: ['isengard', 12] };
const m2Plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const m2WatchOf = (name) => M2_WATCH[Object.keys(M2_WATCH).find((k) => m2Plain(name).includes(k))] ?? 'weathertop';
const m2RoamOf = (name) => M2_ROAM[Object.keys(M2_ROAM).find((k) => m2Plain(name).includes(k))] ?? null;

// The plan for a world W by H units: places, regions, rivers, ranges, roads and stations. A region whose stations need
// more room than its place gives grows south into the land below it.
function m2Plan(W, H) {
  const at = (u, v) => [u * W, v * H];
  const plan = { W, H, wide: true, fits: W >= 480 && H >= 300, minW: 320, realms: [], stations: [], roads: [], places: {}, river: null };
  for (const [k, [u, v]] of Object.entries(M2_AT)) plan.places[k] = { x: u * W, y: v * H };
  // The named places and zones the other areas build on (scene2-core-places.js; the south, the patrols and the roam
  // spots follow once the realms have their final size, in m2PlanAfter).
  if (typeof m2PlanLands === 'function') m2PlanLands(plan);
  const rohan = snap.machines.some((m) => !scRealm(m.host));
  if (rohan) {
    for (const [k, [u, v]] of Object.entries(M2_ROHAN.places)) {
      plan.places[k] = { x: u * W, y: v * H };
      const z = typeof M2_ZONE === 'object' && M2_ZONE[k];
      if (z && plan.zones) plan.zones[k] = { x0: u * W - z[0], y0: v * H - z[1], x1: u * W + z[2], y1: v * H + z[3] };
    }
    plan.places.orthancTop = { x: plan.places.isengard.x, y: plan.places.isengard.y - 26 };
  }
  plan.rivers = Object.fromEntries(Object.entries(M2_RIVERS).map(([k, pts]) => [k, pts.map(([u, v]) => at(u, v))]));
  plan.ranges = Object.fromEntries(Object.entries({ ...M2_RANGES, ...(rohan ? M2_ROHAN.ranges : {}) }).map(([k, pts]) => [k, pts.map(([u, v]) => at(u, v))]));
  plan.mordor = { x0: 0.81 * W, y0: 0.69 * H, x1: W, y1: H };
  let men = 0;
  plan.realms = snap.machines.map((m) => {
    const [kind, title] = scRealm(m.host) ?? ['man', 'Rohan'];
    const live = snap.tickets.filter((t) => t.live && !t.adhoc && t.host === m.host);
    const n = Math.max(m.maxWorkers || 0, live.filter((t) => !t.sentry).length);
    const fields = kind === 'man' && men > 0 && rohan;
    const box = M2_REGION[kind] ?? (men++ ? (fields ? M2_FIELDS : M2_MEN[1]) : M2_ROHAN.region);
    const [x, y] = at(box[0], box[1]);
    const r = { m, kind, title, n, x: Math.round(x), y: Math.round(y), w: Math.round((box[2] - box[0]) * W), h: Math.round((box[3] - box[1]) * H), spots: [], plan };
    // Edoras keeps a shallow back strip for Meduseld's hill, so its stations clear the White Mountains.
    // The fields' back strip (its steading) takes what is left above one desk row before the map's edge.
    r.back = fields ? Math.max(24, Math.min(52, H - 42 - r.y)) : kind === 'man' ? 52 : Math.max(46, Math.min(112, Math.round(r.h * 0.36)));
    r.roadY = r.y + r.back + 8;
    r.f0 = r.roadY + 7;
    r.ux0 = r.x + 6;
    r.ux1 = r.x + r.w - 6;
    // The fields' one desk row sits closer under its road, so the steading clears the White City above it.
    if (fields) r.row0 = 22;
    return r;
  });
  m2PlanRiver(plan);
  plan.realms.forEach((r) => m2PlanStations(plan, r));
  // A second Men realm whose stations fall off the map does not fit at this scale (m2Fit then tries a smaller one).
  const second = plan.realms.filter((r) => r.kind === 'man')[1];
  if (second && plan.stations.some((st) => st.realm === second && st.y > H - 2)) plan.fits = false;
  // Places that follow a realm's final size, such as Dale and the Long Lake below Erebor (scene2-core-places.js).
  if (typeof m2PlanAfter === 'function') m2PlanAfter(plan);
  m2PlanRoads(plan);
  m2PlanPosts(plan);
  return plan;
}

// The Bruinen: it falls from the cliffs at the head of Rivendell's valley, runs down the region's west side, and on
// southwest across Eriador to the map's edge. Rivendell keeps its things east of it.
function m2PlanRiver(plan) {
  const r = plan.realms.find((x) => x.kind === 'elf');
  if (!r) return;
  const base = r.x + (r.w < 90 ? 3 : 8);
  const cliff = Math.max(16, Math.min(32, Math.round(r.back * 0.3)));
  const top = r.y + cliff;
  const cx = (y) => base + 3.5 * Math.sin((y - top) / 21) + 1.5 * Math.sin(y / 7.3);
  const hw = (y) => 5 + Math.min(1.5, (y - top) / 120);
  plan.river = { r, base, cliff, top, cx, hw, pool: { x: base, y: top + 6, rx: 14, ry: 6.5 } };
  r.ux0 = Math.max(r.ux0, base + (r.w < 90 ? 9 : 10));
}
// The Bruinen's line, once the region has its final height.
function m2Bruinen(plan) {
  const { river } = plan;
  if (!river) return;
  const pts = [];
  for (let y = river.top + 2; y < river.r.y + river.r.h; y += 4) pts.push([river.cx(y), y]);
  const [u, v] = [plan.W, plan.H];
  // Below the valley it runs south as the Greyflood between the Old Forest and Rohan, past the White Mountains' west end to
  // the Sea.
  plan.rivers.bruinen = [...pts, [pts.at(-1)[0], Math.max(pts.at(-1)[1] + 10, 0.62 * v)], [0.278 * u, 0.7 * v], [0.265 * u, 0.76 * v], [0.22 * u, 0.86 * v], [0.19 * u, 1.02 * v]];
}

// The roads: the East Road from the map's west edge through the Shire, over the Brandywine, by Bree and Weathertop to
// the Ford of Bruinen and Rivendell, then over the High Pass and the Old Ford, through Mirkwood to Dale and Erebor's gate;
// the Greenway south from Bree by Tharbad to the Gap of Rohan, Isengard and Edoras; and the Great West Road along the
// White Mountains to Minas Tirith. A realm's stretch of road runs straight across it at its road row.
function m2PlanRoads(plan) {
  const { W, H } = plan;
  m2Bruinen(plan);
  const p = (k) => [plan.places[k].x, plan.places[k].y];
  const of = (kind) => plan.realms.find((r) => r.kind === kind);
  const across = (r, fallback) => (r ? [[r.x, r.roadY], [r.x + r.w, r.roadY]] : [fallback]);
  const shire = of('hobbit');
  const riv = of('elf');
  const ere = of('dwarf');
  const men = plan.realms.filter((r) => r.kind === 'man');
  const sy = shire?.roadY ?? 0.38 * H;
  const east = [[0, sy], ...across(shire, p('shire')), [0.19 * W, sy + 1], p('bree'), p('weathertop'), ...across(riv, [0.42 * W, 0.32 * H]),
    p('highPass'), p('oldFord'), [0.62 * W, 0.3 * H], [0.76 * W, 0.31 * H], ...(ere ? [[ere.x, ere.roadY], [ere.x + ere.w * 0.55, ere.roadY]] : [p('dale')])];
  const edoras = men[0] ? [[men[0].x, men[0].roadY], [men[0].x + men[0].w, men[0].roadY]] : [p('edoras')];
  // The Greenway, the Great West Road and Isengard's road go round a realm that grew across their way
  // (scene2-plan-south.js), and the West Road leaves out a bend that lies back behind Edoras.
  const I = plan.places.isengard;
  const ring = [{ x0: I.x - 20, y0: I.y - 18, x1: I.x + 20, y1: I.y + 15 }];
  const around = typeof m2SthAround === 'function' ? (pts, also = ring) => m2SthAround(plan, pts, also) : (pts) => pts;
  const green = around([p('bree'), [0.235 * W, 0.5 * H], [0.24 * W, 0.6 * H], [0.33 * W, 0.66 * H], p('gap'), edoras[0]]);
  const bends = [[0.6 * W, 0.8 * H], [0.64 * W, 0.83 * H]].filter(([x]) => x > edoras.at(-1)[0] + 12);
  const west = around([...edoras, ...bends, p('minasTirith')]);
  plan.roads.push({ pts: east, hw: 3.5 }, { pts: green, hw: 3 }, { pts: west, hw: 3.5 }, { pts: around([p('gap'), p('isengard')], []), hw: 2.5 });
  if (ere) plan.roads.push({ pts: [p('dale'), [ere.x + ere.w * 0.5, ere.roadY]], hw: 3 });
  if (men[1]) plan.roads.push({ pts: [p('minasTirith'), [men[1].x, men[1].roadY], [men[1].x + men[1].w, men[1].roadY]], hw: 3 });
}

// [footprint width, worker's place behind the front edge, a column's least step] by people, and the rows: the first one's front this far
// below the road's edge, each next one this much further down (a 19.5-unit elf behind its desk, its bubble and name).
const M2_STATION = { elf: [15, 8, 24], man: [15, 8, 24], hobbit: [22, 15, 30], dwarf: [10, 9, 21] };
const M2_ROW0 = 30;
const M2_ROW = 46;
// The stations, in staggered rows in the open ground in front of the road, as many to a row as the region's width
// takes; a worker stands behind its station (hx, hy), facing out. A region too short for them grows south.
function m2PlanStations(plan, r) {
  // Stations keep clear of the Misty Mountains' western flank, where its peaks and foothills stand.
  const misty = plan.ranges.misty ?? [];
  const mx = (y) => { const k = misty.findIndex(([, py]) => py > y); if (k < 1) return Infinity; const [[ax, ay], [bx, by]] = [misty[k - 1], misty[k]]; return ax + ((bx - ax) * (y - ay)) / (by - ay); };
  const edge = Math.min(mx(r.roadY), mx(r.roadY + M2_ROW0 + M2_ROW));
  if (edge > r.x && edge < r.x + r.w + 30) r.ux1 = Math.min(r.ux1, edge - 16);
  const room = r.ux1 - r.ux0 - 4;
  // Each people's station at the 1.4 times scale (STYLE4.md): its footprint's width, how far behind its front edge the
  // worker stands, and the room a column needs (the footprint and a walkway beside it).
  const [fw, behind, need] = M2_STATION[r.kind] ?? M2_STATION.elf;
  const cols = Math.max(1, Math.min(r.n, Math.floor((room - fw) / need) + 1, Math.ceil(r.n / Math.max(1, Math.ceil(r.n / 3)))));
  const rows = Math.max(1, Math.ceil(r.n / cols));
  // Rows stagger by half a column where there is room for it; a narrow region packs its desks in straight columns.
  const stagger = rows > 1 && cols > 1 && (room - fw) / (cols - 1) >= need * 1.6;
  const step = cols > 1 ? Math.min(need + 22, (room - fw - (stagger ? need / 2 : 0)) / (cols - 1)) : 0;
  const blockW = (cols - 1) * step + (stagger ? step / 2 : 0);
  const left = Math.round((r.ux0 + r.ux1) / 2 - blockW / 2);
  r.block = { x0: left - fw / 2 - 8, x1: left + blockW + fw / 2 + 8, y0: r.f0 + 4, y1: r.f0 + (r.row0 ?? M2_ROW0) + (rows - 1) * M2_ROW + 8 };
  // Rivendell keeps room below its desks for the healing house and the pavilion (the 46 keeps the valley as deep as it
  // was before the rows tightened, so the pavilion stays clear of the Misty Mountains' foot), and the Shire for the Mill
  // on the Water below its last row of plots (2026-11-09: the Mill stood on the last plot at a typical window).
  r.h = Math.max(r.h, r.block.y1 + (r.kind === 'elf' ? 46 : r.kind === 'hobbit' ? 30 : 10) - r.y);
  r.f1 = r.y + r.h - 3;
  for (let j = 0; j < r.n; j += 1) {
    const row = Math.floor(j / cols);
    const x = Math.round(left + (j % cols) * step + (row % 2 && stagger ? step / 2 : 0));
    const y = r.f0 + (r.row0 ?? M2_ROW0) + row * M2_ROW;
    plan.stations.push({ id: `${r.m.host}:r${j}`, realm: r, kind: r.kind, sentry: false, x, y, hx: x, hy: y - behind });
  }
}

// The Sentry riders' posts, as many as the side view gives (scene.js's scLayout; 2026-11-09: parity): each
// machine keeps a post for every Sentry slot it has, or for every Sentry rider it has if that is more (a rider parked on
// another person's review keeps one while the next fix holds the slot). A rider's post stands in its captain's own land; a slot
// with no rider keeps a quiet post in the land with the fewest posts, in the captains' order. A land holds two at most
// (the second rider waits beside the first; there is no room for a third among Bree, the river and the hills), and a
// rider past that walks the road, as before. Each realm's key (r.k, in scene2.js's layout key) says what its posts
// depend on, so the map is laid out again when they change. Each post is a lantern post that stands quiet until a rider
// comes.
function m2PlanPosts(plan) {
  const lands = [...new Set(Object.values(M2_WATCH))];
  const need = Object.fromEntries(lands.map((l) => [l, 0]));
  const riders = snap.tickets.filter((t) => t.live && !t.adhoc && t.sentry);
  for (const t of riders) need[m2WatchOf(t.nickname)] += 1;
  let idle = 0;
  for (const m of snap.machines) {
    const mine = riders.filter((t) => t.host === m.host);
    const quiet = Math.max(0, (m.sentryWorkers || 0) - mine.length);
    idle += quiet;
    const r = plan.realms.find((x) => x.m === m);
    if (r) r.k = `${quiet}:${mine.map((t) => m2WatchOf(t.nickname)).sort().join('+')}`;
  }
  for (let i = 0; i < idle; i += 1) {
    const land = lands.filter((l) => need[l] < 2).sort((p, q) => need[p] - need[q])[0];
    if (!land) break;
    need[land] += 1;
  }
  for (const land of lands) {
    // Boromir's posts stand in the Pelennor's fields east of the Great Gate, the second south of the first, clear of the city.
    const mt = plan.places.minasTirith;
    // Aragorn's posts stand on the road between Weathertop's hill and Bree's hedge, in front of the hill.
    const { x, y } = land === 'pelennor' && mt ? { x: mt.x + 38, y: mt.y + 2 } : land === 'weathertop' ? { x: plan.places.weathertop.x + 4, y: plan.places.weathertop.y + 6 } : plan.places[land];
    const [dx, dy] = land === 'pelennor' ? [0, 16] : [-22, 0];
    for (let j = 0; j < Math.min(2, need[land]); j += 1) {
      plan.stations.push({ id: `watch:${land}:${j}`, land, realm: null, kind: 'ranger', sentry: true, shared: j > 0,
        x: Math.round(x + 8 + j * dx), y: Math.round(y + 4 + j * dy), hx: Math.round(x + j * dx), hy: Math.round(y + 3 + j * dy) });
    }
  }
}

// Where a worker outside the queue goes next: somewhere in its own land (Radagast round Rhosgobel, Treebeard in Fangorn,
// Tom Bombadil in the Old Forest, Beorn in the Anduin's vale), or else somewhere along a road, by its seed.
function m2RoadSpot(plan, name, seed0) {
  const seed = Math.abs(Math.floor(seed0)) >>> 0;
  const roam = m2RoamOf(name);
  if (roam) {
    const c = plan.places[roam[0]];
    const a = ((seed % 360) * Math.PI) / 180;
    const d = roam[1] * (((seed >>> 3) % 100) / 100);
    return { x: Math.max(4, Math.min(plan.W - 4, c.x + Math.cos(a) * d)), y: Math.max(16, Math.min(plan.H - 2, c.y + Math.sin(a) * d * 0.7)) };
  }
  const road = plan.roads[seed % plan.roads.length];
  const k = (seed >>> 4) % (road.pts.length - 1);
  const t = ((seed >>> 8) % 100) / 100;
  const [[ax, ay], [bx, by]] = [road.pts[k], road.pts[k + 1]];
  return { x: Math.max(4, Math.min(plan.W - 4, ax + (bx - ax) * t)), y: Math.max(16, Math.min(plan.H - 2, ay + (by - ay) * t + 1)) };
}
