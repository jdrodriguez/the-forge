// scene2-rohan.js: the Men's realms on the map from above (scene2.js), for machines with no realm of their own. The
// first is Edoras in Rohan (scene2-edoras.js, scene2-edoras-stable.js): Meduseld's golden hall on its green hill inside
// its wall of stakes, the stables and horses, and the barrows white with simbelmyne. A second is Gondor's fields
// (scene2-edoras-gondor.js): a white stone steading among wheat and greens. The world's composer that calls it is
// scene2-world.js.

function m2Rohan(L, r, plan, season, add) {
  const t0 = performance.now();
  const men = plan.realms.filter((x) => x.kind === 'man');
  if (men.indexOf(r) > 0) m2EdoGondor(L, r, plan, season, add);
  else m2EdoEdoras(L, r, plan, season, add);
  m2.edoMs = (men.indexOf(r) > 0 ? m2.edoMs ?? 0 : 0) + performance.now() - t0;
}
