// scene-hoard.js: Erebor's treasure storehouse and armor stand in the Middle-earth view (scene.js). Two more dwarf jobs
// join the ones in scene-work.js (through scene-jobs.js's workAdd, so they share its seeded choice and its
// one-worker-per-spot rule): store gems in the vault, either a pouch taken from the gem chest when it has gems to spare
// or a gem dug straight from the gem rock, and the hoard inside grows; or forge armor: take hot metal from the forge,
// hammer it into a plate on the stand's anvil (sparks fly), quench it in the trough (a hiss of steam) and hang it on
// the stand, whose pegs fill and are then cleared. The vault and stand are scenery-hoard.js's, placed by realmProps.
// Loaded after scene-jobs.js.

// The hoard and the finished pieces, kept in the realm's tally for the session; the vault starts with some gold in it.
function hoardState(st) {
  st.hoard ??= 6;
  st.armor ??= 0;
  return st;
}

workAdd('dwarf', (a, P, st, rng) => {
  const { vault, armor } = P;
  const r = a.realm;
  const jobs = [];
  hoardState(st);
  if (vault) {
    const store = (tool) => ({ pose: 'tip', tool, n: 10, anim: then(4), face: vault.spot.face, at: 4, fn: (b) => {
      b.carry = null;
      st.hoard = Math.min(HOARD_MAX, st.hoard + 1);
      spray(vault.spot.x + 6 * vault.spot.face, vault.y + 8, [PX.gold, '#fff3c4', GEMS[1][0]], 4, { up: 0.6, spread: 1, life: 5 });
    } });
    const toVault = (from, tool) => [...workWay(r, from, vault.spot), { go: vault.spot, claim: true }, store(tool)];
    if (P.chest && st.gems >= 6) {
      jobs.push({ w: 2, spot: 'vault', steps: [
        { go: P.chest.spot, claim: true },
        { pose: 'bend', n: 8, face: P.chest.spot.face, fn: (b) => { b.carry = 'pouch'; st.gems = Math.max(0, st.gems - 3); } },
        ...toVault(P.chest.spot, 'pouch'),
      ] });
    }
    if (P.gems) {
      const gem = `gem${span(rng, 0, 3)}`;
      jobs.push({ w: 2, spot: 'vault', steps: [
        { go: P.gems.spot, claim: true },
        { pose: 'dig', tool: 'pick', n: span(rng, 40, 60), anim: alt(3), face: P.gems.spot.face },
        { pose: 'carry', tool: gem, n: 10, anim: () => 2, face: P.gems.spot.face, fn: (b) => { b.carry = gem; } },
        ...toVault(P.gems.spot, gem),
      ] });
    }
  }
  if (armor && P.forge) {
    const s = armor.spot;
    jobs.push({ w: 2, spot: 'armor', steps: [
      { go: P.forge, claim: true },
      { pose: 'tip', n: 8, anim: then(4), face: P.forge.face, at: 4, fn: (b) => { b.carry = 'hot'; workFlare(b.realm); } },
      ...workWay(r, P.forge, s),
      { go: s, claim: true },
      { pose: 'work', n: span(rng, 36, 56), anim: swing(3), face: s.face, at: 0, armor: 'hammer', fn: (b) => { b.carry = null; } },
      { pose: 'quench', n: 16, anim: then(5), face: s.face, fn: (b) => { b.carry = 'plate'; } },
      ...workWay(r, s, armor.hang),
      { go: armor.hang, claim: true },
      { pose: 'tip', tool: 'plate', n: 10, anim: then(4), face: armor.hang.face, at: 4, fn: (b) => {
        b.carry = null;
        st.armor = st.armor >= ARMOR_MAX ? 1 : st.armor + 1;
      } },
    ] });
  }
  return jobs;
});

// Each frame: whether a plate lies hot on the stand's anvil, for drawProp.
JOB_HOOKS.items.push(() => {
  for (const r of sc.realms) {
    if (r.kind !== 'dwarf' || !realmProps(r).armor) continue;
    hoardState(workRealm(r)).anvil = Boolean(workDoing(r, (s) => s.armor === 'hammer'));
  }
});

// Steam off the quench trough: a burst as the hot plate goes in, then a wisp while it cools; and a pouch of gems glints.
JOB_HOOKS.fx.push((a, pose, frame, hand, changed) => {
  if (pose === 'quench' && frame === 1) {
    if (changed) spray(hand.x, hand.y - 1, ['#ffffff', '#ecebf0', '#cfcfd6'], 7, { up: 0.9, spread: 1.4, life: 8, fall: -0.03 });
    else if (sc.tick % 2 === 0) spray(hand.x, hand.y - 1, ['#ecebf0', '#cfcfd6'], 1, { up: 0.4, spread: 0.5, life: 10, fall: -0.02 });
  }
  if (pose === 'quench' && frame === 0 && sc.tick % 2 === 0) spray(hand.x, hand.y, [PX.emberL, PX.ember], 1, { up: 0.4, spread: 0.6, life: 3 });
  if (pose === 'carry' && a.carry === 'pouch' && sc.tick % 4 === 0) spray(hand.x, hand.y - 2, ['#ffffff', PX.gold], 1, { up: 0.3, spread: 0.6, life: 3, fall: 0 });
});
