// scene2-erebor-works.js: the dwarves' works in Erebor on the map from above (scene2-erebor.js lays them out). The forge
// on the court's west side against the mountain's rock: a hearth of stone blocks, its arched mouth full of fire that
// flickers, a hood and chimney stack smoking, a leather bellows at its side and a quench trough before it, glowing at
// night. The mine's mouth in the western spur, a dark adit framed in timber, with rails on sleepers running south from
// it down the realm's west side to a heap of ore, and a cart loaded with ore that rolls up to the mine and back. The
// armor stand (an anvil on its stump and a stand its pieces hang on) and the gem rock below them.

const M2_ERE_IRON = ['#1a1a20', '#2e2e36', '#46464f', '#62626c', '#85858f', '#b0b0ba'];
const M2_ERE_ORE = ['#3a3640', '#58525e', '#7a7480'];
const M2_ERE_GEM = ['#7fd8ff', '#ff7aa8', '#9aff9a', '#ffe27a'];

function m2EreWorks(L, add, E, season) {
  const { r, cx } = E;
  const fx = Math.max(r.x + 30, Math.round(cx - E.fw / 2 - 11));
  const fy = Math.round(E.courtBot - 5);
  m2EreForge(L, add, fx, fy, E);
  // The mine's mouth in the western spur and the rails down the west side to the ore heap.
  const mx = Math.round(Math.max(r.x + 7, (E.left.x0 + E.left.x1) / 2 - 1));
  const my = Math.round(E.foot(mx));
  const end = Math.min(r.y + r.h - 30, E.courtBot + 30);
  m2EreAdit(L, add, mx, my);
  m2EreRails(L, mx, my + 1, end);
  m2EreCart(L, add, mx, my + 6, end - 4);
  m2EreHeap(L, add, mx + 7, end);
  E.spots.push({ x: mx - 6, y: my + 6, face: 'right', job: 'ore' }, { x: mx + 7, y: end + 5, face: 'up', job: 'cart' });
  E.rails = { x: mx, y0: my, y1: end };
  E.keep.push({ x0: mx - 5, y0: my - 10, x1: mx + 5, y1: end + 2 }, { x0: mx, y0: end - 5, x1: mx + 12, y1: end + 8 });
  const ay = end + 22;
  if (ay + 4 < r.y + r.h - 2) {
    m2EreArmor(L, add, mx - 1, ay);
    // The stand's pieces are drawn as many as are hung (scene2-stock-art.js's m2sArmor).
    E.spots.push({ x: mx + 9, y: ay + 1, face: 'left', job: 'armor', stand: { x: mx - 1, y: ay } });
    E.keep.push({ x0: mx - 8, y0: ay - 16, x1: mx + 14, y1: ay + 4 });
  }
}

// The forge with its fire's foot at (x, y): hearth, hood, chimney, bellows and trough, its fire four frames painted once.
function m2EreForge(L, add, x, y, E) {
  const S = M2_PAL.stone;
  m2Shadow(L, x + 3, y + 0.5, 11, 2.5, 0.8);
  const o = m2Thing(add, x - 9, y - 26, 20, 27, y + 0.5, (g) => {
    // The chimney stack rising from the hood, its top capped and sooty.
    m2Wall(g, 5, 0, 7, 14, S, 'stone');
    pxBox(g, 4.5, 0, 8, 1, S[1]);
    pxBox(g, 5, 0.25, 7, 0.5, '#1c1612');
    // The hood: a sloped top of slabs, lit along its front edge.
    m2Raster(g, 0, 12, 72, 16, (px, py) => (px < 4 - py * 0.3 || px > 68 + py * 0.3 ? null : py === 0 ? S[1] : py < 3 ? S[5] : S[4]));
    // The hearth's face of blocks with the mouth's arch of voussoirs in firebrick, dark round the fire.
    m2Wall(g, 0, 16, 18, 10.5, S, 'stone');
    m2Raster(g, 4, 17.5, 40, 36, (px, py) => {
      const d = Math.hypot(px + 0.5 - 20, Math.max(0, 16 - py) * 1.2);
      if (d > 19 || py > 35) return null;
      if (d > 14) return Math.floor(Math.atan2(16 - py, px - 20) * 6) % 2 ? '#8a3a22' : '#b05030';
      return py > 30 ? '#3a1a10' : '#140a08';
    });
    // The bellows at the east side: two boards and oxblood leather in folds on a little stand.
    m2Raster(g, 16, 19.5, 14, 26, (px, py) => {
      if (py > 20) return px === 2 || px === 11 ? M2_PAL.wood[1] : null;
      const w = 6 - Math.abs(py - 10) * 0.45;
      if (Math.abs(px + 0.5 - 7) > w) return null;
      return py < 2 || py > 18 ? M2_PAL.wood[py < 2 ? 3 : 1] : py % 4 === 0 ? '#2e1410' : px < 7 ? '#6a3424' : '#4a2218';
    });
  });
  o.foot = [x - 9, y - 3, x + 9, y + 0.5];
  // The quench trough before the hearth's west end.
  m2Shadow(L, x - 6, y + 4, 4, 1, 0.8);
  const t = m2Thing(add, x - 10, y + 0.5, 7, 4, y + 4.5, (g) => {
    m2Raster(g, 0, 0, 28, 16, (px, py) => (py < 4 ? (px === 0 || px === 27 || py === 0 ? M2_PAL.wood[0] : py === 1 ? '#a6dbe4' : '#2f7a9e') : px === 0 || px === 27 || py === 15 ? M2_PAL.wood[0] : M2_PAL.wood[px % 8 === 0 ? 2 : 3]));
  });
  t.foot = [x - 10, y + 2, x - 3, y + 4.5];
  const flames = m2EreArt.get('forge') ?? [0, 1, 2, 3].map((k) => {
    const { c, g } = m2Canvas(7, 5.5);
    m2Raster(g, 0, 0, 28, 22, (px, py) => {
      const d = Math.hypot(px + 0.5 - 14, (py + 0.5 - 22) * 0.9);
      if ((py < 8 && Math.abs(px - 14) > py * 1.6) || d > 14) return null;
      const f = d + ((px + k * 3) % 5) - py * 0.1;
      return f < 6 ? '#fff3c4' : f < 10 ? '#ffd35a' : f < 13 ? '#ff8a2a' : '#c2441c';
    });
    return c;
  });
  m2EreArt.set('forge', flames);
  const fire = (g, tick, reduced) => g.drawImage(flames[reduced ? 0 : tick % 4], x - 3.5, y - 5.5, 7, 5.5);
  fire.item = true;
  fire.z = y + 0.6;
  fire.m2own = true;
  add.anim(fire);
  m2Smoke(add, x - 0.5, y - 26.5, 7, true);
  add.light({ x, y: y - 4, r: 13, c: '#ff9a40', fire: true });
  E.forge = { x, y };
  // The forge's spot carries where its fire is, for the flare when ore goes in (scene2-stock.js).
  // A dwarf works the forge from beside its mouth, so the fire and its flare show past him.
  E.spots.push({ x: x + 8, y: y + 4, face: 'left', job: 'forge', mid: x, fire: { x, y } });
  E.keep.push({ x0: x - 12, y0: y - 26, x1: x + 12, y1: y + 6 });
}

// The mine's mouth at (x, y) on the spur's foot: a dark adit under a timber frame, two posts and a lintel beam.
function m2EreAdit(L, add, x, y) {
  const W = M2_PAL.wood;
  L.decals.push((g) => {
    m2Raster(g, x - 5, y - 9, 40, 37, (px, py) => {
      const post = (px < 6 || px > 33) && py > 4;
      if (py < 5) return py === 0 || py === 4 ? W[0] : W[py < 2 ? 3 : 2];
      if (post) return px === 0 || px === 5 || px === 34 || px === 39 ? W[0] : W[px < 3 || (px > 34 && px < 37) ? 3 : 1];
      return py < 14 ? '#070608' : py < 26 ? '#120d0c' : '#1e1612';
    });
  });
}
// Rails from (x, y0) south to y1: sleepers of oak every unit and a half under two iron rails, lit on their west edge.
function m2EreRails(L, x, y0, y1) {
  L.decals.push((g) => {
    for (let y = y0; y < y1; y += 1.5) pxBox(g, x - 3, y, 6, 0.75, M2_PAL.wood[(Math.round(y * 2) % 3) + 1]);
    for (const rx of [x - 2, x + 1.5]) { pxBox(g, rx, y0, 0.5, y1 - y0, M2_ERE_IRON[1]); pxBox(g, rx, y0, 0.25, y1 - y0, M2_ERE_IRON[5]); }
    pxBox(g, x - 3, y1 - 0.5, 6, 1, M2_PAL.wood[1]);
  });
}
// The ore cart on the rails between y0 (the mine) and y1 (the heap): an iron-bound box heaped with ore and a gem's glint,
// resting at the heap, then rolling up to the mine and back.
function m2EreCart(L, add, x, y0, y1) {
  const art = m2EreCartArt();
  const at = (tick) => {
    const t = tick % 420;
    const ease = (u) => u * u * (3 - 2 * u);
    if (t < 160) return y1;
    if (t < 240) return y1 + (y0 - y1) * ease((t - 160) / 80);
    if (t < 320) return y0;
    return y0 + (y1 - y0) * ease((t - 320) / 100 > 1 ? 1 : (t - 320) / 100);
  };
  const cart = (g, tick, reduced) => {
    const y = reduced ? y1 : at(tick);
    cart.z = y;
    g.drawImage(art, x - 3.5, y - 6.5, 7, 7);
  };
  cart.item = true;
  cart.z = y1;
  cart.m2own = true;
  add.anim(cart);
}
// The ore cart's art, an iron-bound box heaped with ore and a gem's glint, painted once.
function m2EreCartArt() {
  if (m2EreArt.has('cart')) return m2EreArt.get('cart');
  const { c, g } = m2Canvas(7, 7);
  m2Raster(g, 0, 0, 28, 28, (px, py) => {
    if (py < 9) return Math.abs(px + 0.5 - 14) < 12 - Math.abs(py - 6) * 0.8 ? M2_ERE_ORE[(px * 3 + py * 5) % 7 === 0 ? 2 : (px + py) % 3 ? 1 : 0] : null;
    if (py < 22) return px < 1 || px > 26 || py === 9 || py === 21 ? M2_ERE_IRON[0] : px % 9 === 4 ? M2_ERE_IRON[3] : M2_PAL.wood[py < 12 ? 4 : px < 14 ? 3 : 2];
    return (px > 2 && px < 8) || (px > 19 && px < 25) ? M2_ERE_IRON[py === 22 ? 4 : 1] : null;
  });
  pxBox(g, 2, 1, 0.5, 0.5, M2_ERE_GEM[0]);
  pxBox(g, 4.5, 0.75, 0.5, 0.5, M2_ERE_GEM[1]);
  m2EreArt.set('cart', c);
  return c;
}
// The heap of ore at the rails' foot, grey lumps with a few gems winking in it.
function m2EreHeap(L, add, x, y) {
  m2Shadow(L, x + 1, y + 0.5, 4, 1.2, 0.8);
  const o = m2Thing(add, x - 4, y - 3.5, 8, 4, y + 0.5, (g) => {
    m2Raster(g, 0, 0, 32, 16, (px, py) => {
      const top = 14 - Math.sqrt(Math.max(0, 1 - ((px + 0.5 - 16) / 16) ** 2)) * 13;
      if (py < top || py > 15) return null;
      if (py - top < 1) return M2_ERE_ORE[0];
      if ((px * 7 + py * 11) % 23 === 0) return M2_ERE_GEM[(px + py) % 4];
      return M2_ERE_ORE[(px >> 1) % 3 === 0 ? 0 : px < 14 ? 2 : 1];
    });
  });
  o.foot = [x - 4, y - 1, x + 4, y + 0.5];
}
// The armor stand at (x, y): an anvil on a stump and a bare stand, crossbar and post; the pieces hung on it (a
// breastplate, a helm, gauntlets and a shield) come and go with the dwarves' work (scene2-stock-art.js's m2sArmor).
function m2EreArmor(L, add, x, y) {
  m2Shadow(L, x + 3, y + 0.5, 8, 1.6, 0.8);
  const I = M2_ERE_IRON;
  const o = m2Thing(add, x - 6, y - 13, 15, 13.5, y + 0.5, (g) => {
    pxBox(g, 9, 2, 0.75, 11.5, M2_PAL.wood[2]);
    pxBox(g, 6, 3.5, 7, 0.75, M2_PAL.wood[3]);
    // The anvil on its stump at the west end.
    m2Raster(g, 0, 7.5, 24, 24, (px, py) => {
      if (py < 6) return (px > 2 && px < 22) || (px < 3 && py > 1 && py < 4) ? I[py === 0 ? 5 : py < 3 ? 4 : 2] : null;
      if (py < 10) return px > 8 && px < 16 ? I[2] : null;
      return px > 3 && px < 20 ? (py === 10 ? '#d9b27a' : M2_PAL.wood[px < 9 ? 3 : 2]) : null;
    });
  });
  o.foot = [x - 6, y - 2, x + 9, y + 0.5];
}

// The gem chest that dug gems go into, and pouches of gems go from into the hoard (scene2-haul-jobs.js): on the court
// east of the gate's east brazier, or else in the yard as near the gem rock as it finds room, where its box and the
// place east of it where a dwarf stands are dry, inside the realm and off its rails, off the stations' ground and the
// dwarves' heads over it, off the yard's things (taken) and clear of the other spots. The box with its lid thrown back is baked; the gems in
// it are drawn as many as there are (scene2-stock-art.js's m2sChest).
function m2EreChest(L, add, E, taken) {
  const { r } = E;
  // The stations' ground and the rows over it where a dwarf, its bubble and its name show.
  const clear = r.plan.stations.filter((s) => s.realm === r).map((s) => {
    const b = typeof m2StationBox === 'function' ? m2StationBox(s) : [s.x - 6, s.y - 17, s.x + 6, s.y + 1];
    return { x0: b[0], y0: b[1] - 14, x1: b[2], y1: b[3] + 2 };
  });
  const gw = m2EreGateSize(E).gw;
  const gem = E.spots.find((s) => s.job === 'gems');
  const yard = [];
  for (let y = Math.round(E.courtBot + 12); y < r.y + r.h - 5; y += 3) for (let x = r.x + 10; x < r.x + r.w - 14; x += 3) yard.push([x, y]);
  const near = gem ?? { x: r.x, y: r.y + r.h };
  yard.sort((p, q) => Math.hypot(p[0] - near.x, p[1] - near.y) - Math.hypot(q[0] - near.x, q[1] - near.y));
  const court = [5, 8].map((dy) => [E.cx + gw / 2 + 8, E.courtTop + dy]);
  const hit = (b, x0, y0, x1, y1) => x1 > b.x0 && x0 < b.x1 && y1 > b.y0 && y0 < b.y1;
  // Off the rails along the yard's foot too (scene2-erebor-yard.js lays them five rows above it).
  const ok = ([x, y]) => x - 3 > r.x + 2 && x + 13 < r.x + r.w - 2 && y + 2 < (E.yardBot ?? r.y + r.h) - 8
    && [x - 3, x, x + 3, x + 8, x + 11].every((u) => !E.wet?.(u, y - 1) && !E.wet?.(u, y + 1.5))
    && !clear.some((b) => hit(b, x - 3, y - 5, x + 13, y + 2)) && !taken.some((b) => hit(b, x - 3, y - 4, x + 12, y + 2))
    && !E.spots.some((s) => Math.hypot(s.x - (x + 8), s.y - (y + 1.5)) < 9 || Math.hypot(s.x - x, s.y - y) < 6);
  const at = [...court, ...yard].find(ok);
  if (!at) return;
  const [x, y] = at;
  m2Shadow(L, x + 1, y + 0.4, 3.5, 1, 0.8);
  const W = M2_PAL.wood;
  // The lid and the box stand apart in the depth sort, so the gems heaped between them show over the lid.
  m2Thing(add, x - 3, y - 5, 6, 2.5, y - 3, (g) => m2Raster(g, 0.5, 0, 20, 10, (px, py) => (py === 0 || px === 0 || px === 19 ? W[0] : py < 4 ? W[1] : py < 5 ? '#1a1008' : null)));
  const o = m2Thing(add, x - 3, y - 2.5, 6, 2.75, y, (g) => {
    m2Raster(g, 0.5, 0, 20, 10, (px, py) => {
      if (py === 0 || py === 9 || px === 0 || px === 19) return W[0];
      if (px === 4 || px === 15) return '#46464f';
      if (py === 1) return W[5];
      if (px >= 9 && px <= 10 && py >= 3 && py <= 5) return M2_PAL.gold[py === 3 ? 3 : 2];
      return W[px < 8 ? 4 : 3];
    });
  });
  o.foot = [x - 3, y - 2.5, x + 3, y];
  taken.push({ x0: x - 3, y0: y - 5, x1: x + 12, y1: y + 2 });
  E.spots.push({ x: x + 8, y: y + 1.5, face: 'left', job: 'chest', link: true, chest: { x, y } });
}
