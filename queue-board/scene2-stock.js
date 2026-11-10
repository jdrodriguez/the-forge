// scene2-stock.js: what the linked rounds of the map from above (scene2-haul.js) fill and drain, kept for each realm by
// its machine for the session as the side view keeps them (scene-work.js's workRealm), so a new snapshot or a new
// layout never resets them: Erebor's gem chest, the hoard in the gate, the armor stand and the forge's flare; the
// Shire's cart and the pen's trough; Rivendell's scroll rack and the arrows in the target; the Men's cart and the
// horses' trough. Each is drawn growing and shrinking where its thing stands (scene2-stock-art.js), from the
// geometry the realm's file puts on the spot that uses it (spot.cart, spot.vault, spot.stand, spot.chest, spot.rack,
// spot.pen, spot.trough), and the beasts at a trough eat or drink it down. With reduced motion the stocks
// hold still and are drawn as they stand.

const M2S_FEED = 300;
const M2S_MAX = { gems: 21, hoard: 24, armor: 4, load: 16, scrolls: 9 };
const m2s = new Map();
// A realm's stocks, made on first use with the side view's starting tallies (the hoard and the stand as the map drew
// them before they moved).
function m2sOf(r) {
  const host = r?.m?.host ?? '';
  let st = m2s.get(host);
  if (!st) {
    st = { kind: r?.kind, gems: 4, hoard: 6, armor: 2, flare: 0, load: 2, scrolls: 5, arrows: 0, trough: { food: 0, water: 0 }, lamps: null };
    m2s.set(host, st);
  }
  return st;
}
const m2sAdd = (st, k, d) => { st[k] = Math.max(0, Math.min(M2S_MAX[k] ?? Infinity, st[k] + d)); };

// The forge's flare when ore goes in: embers fly and the fire leaps for a second (drawn by m2sFlames).
function m2sFlare(r) {
  const s = m2hSpot(r, 'forge');
  m2sOf(r).flare = m2.tick + 12;
  if (s?.fire) m2mPuff(s.fire.x, s.fire.y - 4, M2M_SPARK, 12, { up: 1.2, spread: 1.6, fall: 0.05, life: 9, kind: 'spark' });
}

// Each frame: the stocks drawn at their things, in the depth sort with the figures, each with its box so a thing baked in
// front of it is stamped again over it.
m2.layers.items.push(m2mSafe((add, tick, reduced) => {
  for (const r of m2.realms) {
    const st = m2sOf(r);
    for (const s of r.spots) {
      if (s.fire && st.flare > tick) {
        const { x, y } = s.fire;
        m2.glow?.add(x, y - 5, 16, '#ff9a3c', 0.9);
        add(y + 0.7, (g) => m2sFlames(m2G, x, y, tick), [x - 4, y - 12, x + 4, y + 0.7]);
      }
      if (s.vault) add(s.vault.gy - 0.6, () => m2sHoard(m2G, s.vault, st.hoard, tick, reduced));
      if (s.chest) add(s.chest.y - 0.05, () => m2sChest(m2G, s.chest.x, s.chest.y, st.gems), [s.chest.x - 2.5, s.chest.y - 4.5, s.chest.x + 2.5, s.chest.y - 2]);
      if (s.stand) add(s.stand.y + 0.55, () => m2sArmor(m2G, s.stand.x, s.stand.y, st.armor), [s.stand.x - 6, s.stand.y - 13, s.stand.x + 9, s.stand.y + 0.5]);
      if (s.cart) add(s.cart.z + 0.05, () => m2sCart(m2G, s.cart, st.load), [s.cart.x, s.cart.y, s.cart.x + 15, s.cart.y + 7]);
      if (s.rack) add(s.rack.z + 0.05, () => m2sRack(m2G, s.rack.x, s.rack.y, st.scrolls), [s.rack.x - 4, s.rack.y - 13, s.rack.x + 4, s.rack.y - 6]);
      const T = s.pen ?? s.trough;
      if (T) add(T.z + 0.05, () => m2sTrough(m2G, T, st.trough, tick), [T.x0, T.y0, T.x1, T.y1]);
    }
  }
}, 'stock'));

// A trough's beasts eat or drink what is in it: each beast at it takes one a tick, food first. Called by the pen's and
// the paddock's own beasts (scene2-shire-pen.js, scene2-edoras-stable.js); true while there is anything in it.
function m2sTroughFor(host) {
  const st = m2s.get(host);
  return st ? st.trough : null;
}
function m2sEat(trough, n) {
  if (!trough) return false;
  const k = trough.food > 0 ? 'food' : trough.water > 0 ? 'water' : null;
  if (!k) return false;
  trough[k] = Math.max(0, trough[k] - n);
  return true;
}
