// scene2-rohan-banner.js: Rohan's chore on the map from above, in the pattern of Rivendell's lamplighter
// (scene2-chores.js). Meduseld flies Rohan's banner, green with the white horse, from a tall staff beside the guard
// post at the head of the stair, from dawn (the hour 6.5, sunrise) to dusk (18.5, sunset). When the hour turns, one Man
// of the realm leaves what he is doing (an idle one first, never one asking for you), walks up to the staff and hauls
// the banner up hand over hand at dawn, or hauls it down at dusk, the banner climbing or dropping as he hauls. With no
// Man free it rises or falls by itself; with reduced motion it simply flies by day. m2.banner() reports its state for
// the tests.

const m2bnFlies = (hour) => hour >= 6.5 && hour < 18.5;
const M2_BANNER_HAUL = 48;
const m2bnArt = new Map();

// The staff, 3 by 28 units with its foot on the bottom row: a stone socket, an ash staff lit on its left, an iron cleat
// for the halyard and a gilded knob on its top.
function m2bnStaff() {
  if (m2bnArt.has('staff')) return m2bnArt.get('staff');
  const { c, g } = m2Canvas(3, 28);
  const W = M2_PAL.wood;
  m2Raster(g, 1, 1, 4, 105, (x) => (x === 0 ? W[4] : x === 3 ? W[0] : W[x === 1 ? 3 : 2]));
  m2Raster(g, 0.75, 0, 6, 5, (x, y) => (Math.hypot(x - 2.5, y - 2.5) > 2.6 ? null : x + y < 4 ? M2_PAL.gold[4] : x + y < 7 ? M2_PAL.gold[2] : M2_PAL.gold[1]));
  m2Raster(g, 0.5, 23, 8, 2, (x, y) => (y === 0 ? '#8a95a6' : '#3e4256'));
  m2Raster(g, 0, 26, 12, 8, (x, y) => (y === 7 || x === 0 || x === 11 ? M2_PAL.stone[0] : y === 0 ? M2_PAL.stone[5] : M2_PAL.stone[x < 4 ? 4 : 3]));
  m2bnArt.set('staff', c);
  return c;
}
// The banner, 10 by 6 units on four rippling frames: a long green cloth with a swallowtail at its fly, a gold hem
// along its top, and the white horse (scene2-rohan-shield.js's, a pixel to a cell) near the hoist.
function m2bnCloth(k) {
  const key = `cloth${k}`;
  if (m2bnArt.has(key)) return m2bnArt.get(key);
  const { c, g } = m2Canvas(10, 6);
  m2Raster(g, 0, 0, 40, 24, (px, py) => {
    const wave = Math.round(Math.sin((px + k * 6) / 5) * 1.5 * Math.min(1, px / 8));
    const y = py - wave - 2;
    const notch = px > 32 && Math.abs(y - 9) < (px - 32) * 0.9;
    if (y < 0 || y > 18 || px > 39 || notch) return null;
    if (y === 0) return M2_PAL.gold[px % 4 ? 2 : 3];
    if (y === 18 || px === 0) return '#163a1a';
    if (M2_SHIELD_HORSE[y - 4]?.[px - 6] === '#') return wave > 0 ? '#ffffff' : '#dcdcd0';
    return M2_SHIELD_GREEN[wave > 0 ? 4 : wave < 0 ? 2 : 3];
  });
  m2bnArt.set(key, c);
  return c;
}

// The staff on Edoras's hill and the place the hauler stands, from the hill's layout (scene2-edoras.js): west of the
// guard post at the stair's head, on the same row.
m2.builds.push((L, plan, season, add) => {
  const r = plan.edoras;
  if (!r || typeof m2EdoLayout !== 'function') return;
  const D = m2EdoLayout(r);
  const [x, y] = [D.hx - 10, Math.round((D.pcy + D.pry + 0.5) * 4) / 4];
  m2Shadow(L, x + 1.5, y + 0.25, 2, 0.6, 0.8);
  const o = m2Thing(add, x - 1.5, y - 27.5, 3, 28, y + 0.5, (g) => g.drawImage(m2bnStaff(), 0, 0, 3, 28));
  o.foot = [x - 1, y - 1, x + 1, y + 0.5];
  r.banner = { x, y, top: y - 26, spot: { x: x - 6.5, y: y + 1, face: 'right' } };
});

// One tick of the banner: a Man sent to haul it when the hour wants it otherwise, or it moving by itself.
function m2bnTick(r, st, reduced) {
  const B = r.banner;
  const hour = m2.sky.hour;
  const want = m2bnFlies(hour) ? 1 : 0;
  st.banner ??= { flag: hour >= 7.5 && hour < 19.5 ? 1 : 0 };
  const S = st.banner;
  if (reduced) { S.flag = want; return; }
  if (S.flag === want) return;
  const men = m2kElves(r);
  if (men.some((b) => b.chore?.banner)) return;
  const man = men.filter((b) => !b.chore && !b.fight && b.mood !== 'blocked').sort((p, q) => Number(m2kBusy(p)) - Number(m2kBusy(q)))[0];
  if (!man) {
    S.flag = want ? Math.min(1, S.flag + 0.01) : Math.max(0, S.flag - 0.01);
    return;
  }
  const from = S.flag;
  m2kGive(man, [{ go: B.spot }, {
    pose: 'reach', n: M2_BANNER_HAUL, anim: (t) => Math.floor(t / 5) % 2, face: 'right', at: M2_BANNER_HAUL - 1,
    fx: (b, t) => { S.flag = from + ((want - from) * (t + 1)) / M2_BANNER_HAUL; },
    fn: () => { S.flag = want; },
  }], { banner: true });
}

// The halyard down the staff to its cleat, and the banner where it has got to; taken in when it is all the way down.
function m2bnDraw(g, B, flag, tick, reduced) {
  pxBox(g, B.x + 0.75, B.top + 1, 0.25, B.y - B.top - 5, '#c9bfa6');
  if (flag < 0.04) return;
  const by = B.y - 9 - (B.y - 9 - (B.top + 1)) * flag;
  const dir = (m2.wind?.at?.(B.x, by, tick) ?? 1) < 0 ? -1 : 1;
  const c = m2bnCloth(reduced ? 0 : (tick >> 1) % 4);
  if (dir > 0) g.drawImage(c, B.x + 0.75, by - 0.5, 10, 6);
  else { g.save(); g.translate(B.x + 0.25, 0); g.scale(-1, 1); g.drawImage(c, 0, by - 0.5, 10, 6); g.restore(); }
}

m2.layers.items.push(m2mSafe((add, tick, reduced) => {
  for (const r of m2.realms) {
    const B = r.banner;
    if (!B || r !== m2.plan?.edoras || !m2.sky) continue;
    const st = m2sOf(r);
    m2bnTick(r, st, reduced);
    const flag = st.banner.flag;
    add(B.y + 0.1, () => m2bnDraw(m2G, B, flag, tick, reduced), [B.x - 11, B.top - 1, B.x + 11, B.y]);
  }
}, 'banner'));

// For the tests: where the banner is, how high it flies, and who is hauling it.
m2.banner = () => {
  const r = m2.plan?.edoras;
  const B = r?.banner;
  if (!B) return null;
  const man = [...m2.actors.values()].find((b) => b.chore?.banner);
  return { at: [B.x, B.y], spot: [B.spot.x, B.spot.y], flag: m2sOf(r).banner?.flag ?? null, hour: m2.sky?.hour, hauler: man ? { name: man.name, x: Math.round(man.x), y: Math.round(man.y), pose: man.shown?.[0] } : null };
};
