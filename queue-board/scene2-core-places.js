// scene2-core-places.js: the named places of the map from above (scene2.js) that the other areas build on, added to
// scene2-plan.js's plan once its realms are laid out (m2PlanLands). Each place sits where the books' map puts it,
// compressed like the rest: Moria's two gates either side of the Misty Mountains with Mirrormere in the Dimrill Dale,
// Lothlorien between the Silverlode and the Anduin, Isengard at the mountains' southern tip with Fangorn east of it,
// Helm's Deep in the White Mountains' northwest, Minas Tirith at their east end with the Pelennor and Osgiliath, the
// Emyn Muil, Rauros and the Argonath on the great river, the Dead Marshes and the Black Gate at Mordor's northwest
// corner, and the wilds of Eriador and the Anduin's vale. Then the reserved boxes (zones) where an area draws a
// landmark, so no tree or flower is scattered there; the Sentry riders' patrol loops; and the wanderers' roam spots.

// Places as [west to east, north to south] fractions of the world.
const M2_AT2 = {
  moriaWest: [0.47, 0.612], moriaEast: [0.53, 0.6], mirrormere: [0.546, 0.616], caradhras: [0.5, 0.585],
  silverlode: [0.562, 0.612], helmsDeep: [0.31, 0.836], glitteringCaves: [0.297, 0.858], osgiliath: [0.727, 0.86],
  lossarnach: [0.64, 0.95], lebennin: [0.57, 0.965], emynMuil: [0.68, 0.68], rauros: [0.666, 0.725], argonath: [0.648, 0.695],
  deadMarshes: [0.76, 0.64], blackGate: [0.826, 0.69], carrock: [0.592, 0.235], trollshaws: [0.255, 0.13],
  barrowDowns: [0.245, 0.6], oldForest: [0.25, 0.735], withywindle: [0.24, 0.755], lakeTown: [0.893, 0.53],
  gollumCave: [0.505, 0.37], sea: [0.0, 0.86],
};
// The reserved boxes round places, as [half width, above, half width, below] in units: what an area draws there.
const M2_ZONE = {
  moriaWest: [14, 18, 14, 8], moriaEast: [10, 12, 18, 10], mirrormere: [8, 5, 8, 5], lorien: [20, 22, 20, 12],
  helmsDeep: [24, 22, 22, 20], minasTirith: [30, 56, 30, 8], pelennor: [16, 12, 20, 16], osgiliath: [10, 6, 10, 6],
  isengard: [18, 41, 18, 12], blackGate: [14, 22, 14, 6], baradDur: [12, 52, 12, 6], doom: [16, 24, 16, 6],
  deadMarshes: [16, 8, 16, 8], bree: [24, 34, 26, 46], weathertop: [20, 52, 18, 4], trollshaws: [30, 44, 12, 14],
  barrowDowns: [24, 42, 30, 20], carrock: [12, 16, 12, 10], beorn: [20, 48, 34, 24], rhosgobel: [18, 30, 20, 16],
  dale: [34, 14, 34, 34], lakeTown: [16, 12, 16, 12], argonath: [6, 14, 6, 4], rauros: [6, 8, 6, 6], emynMuil: [14, 8, 14, 8],
  gollumCave: [6, 6, 6, 4],
};

function m2PlanLands(plan) {
  const { W, H, places: P } = plan;
  for (const [k, [u, v]] of Object.entries(M2_AT2)) P[k] = { x: u * W, y: v * H };
  P.orthancTop = { x: P.isengard.x, y: P.isengard.y - 26 };
  P.eye = { x: P.baradDur.x, y: P.baradDur.y - 44 };
  P.eyries = P.eyries ?? [[0.497, 0.06], [0.503, 0.13], [0.6, 0.06]].map(([u, v]) => ({ x: u * W, y: v * H, foot: v * H + 8 }));
  plan.zones = {};
  for (const [k, [l, t, r, b]] of Object.entries(M2_ZONE)) {
    const p = P[k];
    if (p) plan.zones[k] = { x0: p.x - l, y0: p.y - t, x1: p.x + r, y1: p.y + b };
  }
}

// The Sentry riders' patrol loops and the wanderers' roam spots, round their places once the south has its final
// places (m2PlanAfter).
function m2PlanRounds(plan) {
  const { W, H, places: P } = plan;
  plan.patrols = {};
  for (const land of ['weathertop', 'ithilien', 'pelennor', 'riddermark']) {
    // Weathertop's loop keeps to the open ground south of the hill, so the hill never stands over a rider behind it.
    const c = land === 'pelennor' ? { x: P.minasTirith.x + 24, y: P.minasTirith.y + 6 } : land === 'weathertop' ? { x: P.weathertop.x, y: P.weathertop.y + 10 } : P[land];
    const [rx, ry] = land === 'weathertop' ? [24, 6] : land === 'ithilien' ? [8, 24] : land === 'pelennor' ? [12, 8] : [26, 10];
    // A point of the loop that would fall in a realm (with the room round it) or on Isengard is drawn in toward the
    // loop's middle until it is clear, so a rider never patrols through the elves' valley or the ring.
    const off = [...plan.realms.map((r) => ({ x0: r.x - 4, y0: r.y - 4, x1: r.x + r.w + 4, y1: r.y + r.h + 4 })), plan.zones.isengard].filter(Boolean);
    plan.patrols[land] = [0, 1, 2, 3, 4, 5].map((i) => {
      const a = (i / 6) * Math.PI * 2;
      let f = 1;
      while (f > 0.2 && off.some((z) => { const [x, y] = [c.x + Math.cos(a) * rx * f, c.y + Math.sin(a) * ry * f]; return x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1; })) f -= 0.1;
      return { x: Math.max(6, Math.min(W - 6, c.x + Math.cos(a) * rx * f)), y: Math.max(20, Math.min(H - 4, c.y + Math.sin(a) * ry * f)) };
    });
  }
  const at = (k, dx, dy, face, job) => ({ x: P[k].x + dx, y: P[k].y + dy, face, job });
  plan.roam = {
    beorn: [at('beorn', -13, 10.5, 'up', 'hives'), at('beorn', 18, 8, 'down', 'wood'), at('beorn', 9, 9, 'down', 'garden'), at('beorn', 27, 1, 'up', 'feed')],
    rhosgobel: [at('rhosgobel', -6, 7, 'up', 'birds'), at('rhosgobel', 0, 10, 'down', 'birds'), at('rhosgobel', 8, 6, 'right', 'herbs')],
    fangorn: [at('fangorn', -10, 4, 'down', 'tend'), at('fangorn', 8, -2, 'up', 'tend'), at('fangorn', 2, 10, 'right', 'drink')],
    oldForest: [at('withywindle', -20, -7, 'down', 'fish'), at('oldForest', 4, 8, 'down', 'sing'), at('oldForest', -6, -4, 'up', 'tend')],
    isengard: [at('isengard', 0, 8, 'up', 'palantir')],
    roads: [at('bree', 6, 11, 'up', 'smoke'), at('weathertop', -14, 4, 'down', 'look'), at('dale', 0, 12, 'up', 'look'), at('osgiliath', -14, 4, 'right', 'look')],
  };
}

// Places that follow a realm's final size once its stations are laid out: Dale just south of Erebor's region, the Long
// Lake and Lake-town below it with the River Running leaving the lake, their zones, the south below Rivendell (Isengard,
// Helm's Deep, the Gap, Edoras, Fangorn, the Riddermark), the patrols and roam spots round them, and the Gollums'
// planned lairs.
function m2PlanAfter(plan) {
  const { W, H, places: P } = plan;
  const r = plan.realms.find((x) => x.kind === 'dwarf');
  P.longLake = { x: 0.905 * W, y: 0.55 * H, rx: 0.04 * W, ry: 0.05 * H };
  if (r) {
    P.dale = { x: r.x + r.w * 0.42, y: Math.min(H * 0.62, r.y + r.h + 16) };
    P.longLake.y = Math.min(0.6 * H, Math.max(P.longLake.y, P.dale.y + 18 + P.longLake.ry));
  }
  P.lakeTown = { x: P.longLake.x - 0.012 * W, y: P.longLake.y - 0.03 * H };
  // The River Running leaves the lake's east shore for the map's edge, north of Mordor's wall.
  const { x: lx, y: ly, rx } = P.longLake;
  plan.rivers.celduin = [[lx + rx - 2, ly + 2], [lx + rx + 0.03 * W, ly + 0.015 * H], [1.02 * W, ly + 0.01 * H]];
  for (const k of ['dale', 'lakeTown']) {
    const [l, t, rr, b] = M2_ZONE[k];
    plan.zones[k] = { x0: P[k].x - l, y0: P[k].y - t, x1: P[k].x + rr, y1: P[k].y + b };
  }
  // Isengard, Helm's Deep, the Gap, Edoras, Fangorn and the Riddermark below the realms as they grew
  // (scene2-plan-south.js), then the patrols and roam spots round the final places.
  if (typeof m2PlanSouth === 'function') m2PlanSouth(plan);
  m2PlanRounds(plan);
  // Each realm's Gollum's lair, where the realm's own layout places it, with a zone that keeps the trees off it
  // (scene2-gollum-lairs.js).
  if (typeof m2eGolPlan === 'function') m2eGolPlan(plan);
}
