// scene2-rohan.js: the Men's realms on the map from above (scene2.js). Rohan (plan.edoras: the realm keyed rohan, else
// the first machine with no realm of its own) is Edoras (scene2-edoras.js, scene2-edoras-stable.js): Meduseld's golden
// hall on its green hill inside its wall of stakes, the stables and horses, and the barrows white with simbelmyne. Any
// other Men's realm, such as a fifth machine, is Gondor's fields (scene2-edoras-gondor.js): a white stone steading among
// wheat and greens. The world's composer that calls it is scene2-world.js.

function m2Rohan(L, r, plan, season, add) {
  const t0 = performance.now();
  if (r !== plan.edoras) m2EdoGondor(L, r, plan, season, add);
  else m2EdoEdoras(L, r, plan, season, add);
  m2.edoMs = (r !== plan.edoras ? m2.edoMs ?? 0 : 0) + performance.now() - t0;
}

// Edoras's stations, once m2PlanUnder has moved its region below the realms above it. Edoras keeps its desks in one
// row while there is room for them: the region widens east, up to the first landmark's zone across the row (Minas
// Tirith's), never west, where Isengard needs its ground, and the row takes the region's whole width, at 4 units more
// than the least step where it can. More desks than a row holds (m2PlanStations) take rows as usual.
function m2PlanEdoras(plan, r) {
  const [fw, , need] = M2_STATION.man;
  const fit = (step) => fw + (r.n - 1) * step + 4;
  if (r.n > 3 || Math.floor((r.ux1 - r.ux0 - 4 - fw) / need) + 1 >= r.n) return m2PlanStations(plan, r);
  const [y0, y1] = [r.f0, r.f0 + M2_ROW0 + 8];
  // Landmarks across the row, and the other realms beside it (a second Men realm), cap how far east it widens.
  const others = plan.realms.filter((o) => o !== r).map((o) => ({ x0: o.x - 4, y0: o.y, y1: o.y + o.h }));
  const zones = [...Object.values(plan.zones ?? {}), ...others].filter((z) => z.y0 < y1 && z.y1 > y0 && z.x0 >= r.x + r.w - 8);
  const east = Math.min(r.x + r.w + 32, ...zones.map((z) => z.x0 - 2));
  const ux0 = r.x;
  if (east - ux0 >= fit(need)) {
    const ux1 = Math.max(r.ux1, Math.min(east, ux0 + fit(need + 4)));
    Object.assign(r, { ux0, ux1, w: Math.max(r.w, Math.ceil(ux1 + 2 - r.x)) });
  }
  m2PlanStations(plan, r);
}
