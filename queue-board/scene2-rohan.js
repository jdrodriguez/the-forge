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
