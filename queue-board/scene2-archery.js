// scene2-archery.js: Rivendell's archery range on the map from above, as the side view's elves shoot (scene-work.js's
// WORK.elf and workItems; 2026-11-09: parity). Where the lower valley has room (scene2-rivendell.js finds it),
// a straw target stands on an A-frame at the range's east end, and an elf takes its place at the west end, draws and
// looses three arrows (v1's shoot pose) that fly across and stick in the target, then walks up to it and pulls them
// out (scene2-haul-jobs.js's elf.archery, a linked round). The arrows in the target are the realm's stock (st.arrows,
// three at most, scene2-stock.js), so they stay lodged until fetched. With reduced motion nothing flies.

const m2bowShots = [];

// The range in box b (from the lower valley's find): the target with its feet on the box's lower rows at its east end,
// and its two spots: where an elf shoots from, and where it stands beside the target to pull the arrows out.
function m2bowRange(L, add, b) {
  const y = Math.round(b.y1 - 4);
  const tx = Math.round(b.x1 - 5);
  m2Shadow(L, tx + 1, y + 0.5, 3.5, 1, 0.8);
  const W = M2_PAL.wood;
  const o = m2Thing(add, tx - 3.5, y - 9, 7, 9.5, y, (g) => {
    // The A-frame's legs, lit on their left, then the round straw boss with its painted rings.
    for (const [x0, x1] of [[0.75, 3.25], [6, 3.75]]) for (let t = 0; t <= 1; t += 0.04) pxBox(g, Math.round((x0 + (x1 - x0) * t) * 4) / 4, Math.round((9 - t * 6) * 4) / 4, 0.5, 0.5, W[t > 0.5 ? 3 : 2]);
    m2Raster(g, 0.5, 0.5, 24, 24, (px, py) => {
      const d = Math.hypot(px + 0.5 - 12, py + 0.5 - 12) / 4;
      if (d > 3) return null;
      if (d > 2.6) return (px + py) % 3 ? '#b8954a' : '#8a6a30';
      if (d > 1.9) return px < 10 && py < 10 ? '#fff6e0' : '#efe2c0';
      if (d > 1.2) return px < 10 && py < 10 ? '#e0503a' : '#c0302a';
      if (d > 0.6) return '#fff6e0';
      return M2_PAL.gold[3];
    });
  });
  o.foot = [tx - 2.5, y - 1.5, tx + 2.5, y + 0.5];
  const target = { x: tx, y: y - 5.5, z: y };
  return [
    { x: Math.round(b.x0 + 5), y: y + 1, face: 'right', job: 'archery', target },
    { x: tx - 6.5, y: y + 1.5, face: 'right', job: 'arrows', link: true, target },
  ];
}

// An arrow loosed from worker a's bow at the target t, landing near its middle.
function m2bowLoose(a, t, host) {
  const h = m2mHand(a, 'right');
  const k = m2bowShots.length + m2.tick;
  m2bowShots.push({ x: h.x + 2, y: h.y - 0.5, tx: t.x - 0.75 + (m2Hash(k, 1, 81) - 0.5) * 1.5, ty: t.y + (m2Hash(k, 2, 81) - 0.5) * 1.5, host });
}

// An arrow pointing right with its point at (x, y): a pale shaft, a steel head, white fletching at the tail.
function m2bowArrow(g, x, y, len = 3) {
  const [px, py] = [Math.round(x * 4) / 4, Math.round(y * 4) / 4];
  pxBox(g, px - len, py, len - 0.5, 0.25, '#c9a85a');
  pxBox(g, px - 0.5, py - 0.25, 0.5, 0.75, '#d0d4dc');
  pxBox(g, px - len, py - 0.25, 0.75, 0.25, '#efe8f4');
  pxBox(g, px - len, py + 0.25, 0.75, 0.25, '#c8c0d8');
}
// Where the arrows stuck in a target show, by how many there are: their points in the straw, shafts out to the west.
const M2BOW_STUCK = [[-0.5, -0.75], [0.5, 0.5], [-0.25, 1]];

// Each frame: arrows in flight move on (one that reaches its target sticks there, a puff of straw flying), and the
// arrows stuck in each target are drawn in it, in front of the boss.
m2.layers.items.push(m2mSafe((add, tick, reduced) => {
  for (const r of m2.realms) {
    const s = m2hSpot(r, 'archery');
    if (!s) continue;
    const n = Math.min(3, m2sOf(r).arrows);
    const t = s.target;
    if (n) add(t.z + 0.05, (g) => { for (let i = 0; i < n; i += 1) m2bowArrow(m2G, t.x + M2BOW_STUCK[i][0], t.y + M2BOW_STUCK[i][1], 2.25); }, [t.x - 3, t.y - 2, t.x + 1, t.y + 2]);
  }
  if (reduced) { m2bowShots.length = 0; return; }
  for (const a of m2bowShots) {
    a.x = Math.min(a.tx, a.x + 3);
    a.y += Math.sign(a.ty - a.y) * Math.min(0.5, Math.abs(a.ty - a.y));
    if (a.x >= a.tx) {
      a.done = true;
      const r = m2.realms.find((q) => q.m.host === a.host);
      if (r) m2sOf(r).arrows = Math.min(3, m2sOf(r).arrows + 1);
      m2mPuff(a.tx, a.ty, ['#e4c97a', '#c9a85a'], 3, { up: 0.4, spread: 0.8, life: 6 });
      continue;
    }
    add(a.y + 8, () => m2bowArrow(m2G, a.x, a.y));
  }
  for (let i = m2bowShots.length - 1; i >= 0; i -= 1) if (m2bowShots[i].done) m2bowShots.splice(i, 1);
}, 'archery'));
