// scene2-fireworks.js: a merge in the last 15 minutes sets off fireworks over its realm on the map from above
// (scene2.js), as it does over the realm in the side view (scene.js scFrame, scenery.js burst). Seen from above and a
// little to the south, a rocket goes up from a spot behind the realm's road as a bright point trailing sparks, rising up
// the map as it climbs, and bursts high over its launch spot into the side view's two rings of sparks, the outer
// faster, with a white flash at the heart; the sparks trail fading tails, sink a little as they fall, and crackle out.
// At night each burst lights the ground under it for a moment in its colour. Each recent merge sends one up about every
// 1.2 seconds (the side view's pace), at its own moment so two merges don't fire together; the realm's note says what
// merged and who merged it (scene2-notes.js, which keeps m2.recent). They are drawn after the night's shade
// (m2.layers.light), so they shine at night, and under the bubbles. With reduced motion there are none, as in the side
// view. The sparks are drawn the side view's way, from its own spark art (scenery.js PART_SPARK, PART_BIT, PART_FLAKE),
// at twice its size and with the rings 1.3 times as wide (the map's figures are v1's at 1.3 times, and the map stands at a
// smaller scale than the side view, where a spark the side view's size is two pixels across).

const M2FW_MAX = 700;
const M2FW_K = 1.3;
const m2fw = { rockets: [], sparks: [], pools: [] };
const M2FW_COLOURS = () => [[PX.gold, PX.emberL], [PX.red, '#ff9a8a'], [PX.green, '#b9ffd8'], [PX.blue, '#e5f1ff']];

// A rocket from a spot in the realm's back strip, behind its road where its landmark stands, to burst 18 to 34 units
// above it, kept on the map: the bursts hang over the realm's north side and its note, clear of the workers' rows in
// front of the road (the map's rule that nothing hides a worker, scene2.js).
function m2fwLaunch(r) {
  const x = Math.max(8, Math.min(m2.W - 8, r.x + 14 + Math.random() * Math.max(1, r.w - 28)));
  const y0 = Math.max(16, r.y + 12);
  const y1 = Math.max(y0 + 1, (r.roadY ?? r.y + r.h / 2) - 4);
  const ground = y0 + Math.random() * (y1 - y0);
  const top = Math.max(8, ground - 18 - Math.random() * 16);
  const colours = M2FW_COLOURS()[Math.floor(Math.random() * 4)];
  m2fw.rockets.push({ x, y: ground, ground, top, vy: -Math.max(2.2, (ground - top) / 9), colours });
}
// The side view's burst (scenery.js burst): two rings of sparks and a flash where it bursts, and its pool on the ground.
function m2fwBurst(x, y, ground, colours) {
  for (let i = 0; i < 28 && m2fw.sparks.length < M2FW_MAX; i += 1) {
    const a = ((i % 14) / 14) * Math.PI * 2 + (i < 14 ? 0 : Math.PI / 14);
    const v = (i < 14 ? 1.4 : 0.85) * M2FW_K;
    const l = 12 + Math.random() * 6;
    m2fw.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.85, life: l, max: l, color: colours[i % 2], fall: 0.05, spark: true });
  }
  m2fw.sparks.push({ x, y, vx: 0, vy: 0, life: 3, max: 3, color: '#ffffff', fall: 0, flash: true });
  m2fw.pools.push({ x, y: ground, c: colours[0], life: 10, max: 10 });
}

// One tick: each recent merge's rocket on its beat, the rockets climbing (slowing as they near the top) with a spark
// left behind every tick, and every spark moving.
function m2fwStep(tick) {
  for (const t of m2.recent ?? []) {
    if (Date.now() - Date.parse(t.mergedAt) >= 15 * 60000 || (tick + pxHash(t.id)) % 12) continue;
    const r = m2.realms.find((x) => x.m.host === t.host);
    if (r) m2fwLaunch(r);
  }
  for (let i = m2fw.rockets.length - 1; i >= 0; i -= 1) {
    const k = m2fw.rockets[i];
    k.y += k.vy;
    k.vy = Math.min(-0.6, k.vy * 0.9);
    if (m2fw.sparks.length < M2FW_MAX) m2fw.sparks.push({ x: k.x + (Math.random() - 0.5) * 0.5, y: k.y + 0.5, vx: 0, vy: 0.08, life: 5, max: 5, color: k.colours[0], fall: 0.02, trail: true });
    if (k.y <= k.top) { m2fwBurst(k.x, k.y, k.ground, k.colours); m2fw.rockets.splice(i, 1); }
  }
  for (let i = m2fw.sparks.length - 1; i >= 0; i -= 1) {
    const p = m2fw.sparks[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += p.fall;
    p.life -= 1;
    if (p.life <= 0) m2fw.sparks.splice(i, 1);
  }
  for (let i = m2fw.pools.length - 1; i >= 0; i -= 1) if ((m2fw.pools[i].life -= 1) <= 0) m2fw.pools.splice(i, 1);
}

// Art of the side view's quarter-unit pixels drawn at twice the size, so each of its pixels is two of the map's.
function m2fwArt(g, rows, pal, x, y) {
  g.save();
  g.translate(x, y);
  g.scale(2, 2);
  qdMap(g, rows, pal, 0, 0);
  g.restore();
}
// The pools on the ground (only in the dark), the rockets' heads, then the sparks as scenery.js stepParticles draws them.
function m2fwDraw(g) {
  const dark = typeof m2Dark === 'function' ? m2Dark(m2.sky?.hour ?? 12)[0] : 0;
  if (dark > 0.05) {
    g.globalCompositeOperation = 'lighter';
    for (const p of m2fw.pools) {
      g.globalAlpha = dark * 0.5 * (p.life / p.max);
      g.drawImage(m2Pool(12, p.c), p.x - 12, p.y - 12, 24, 24);
    }
    g.globalCompositeOperation = 'source-over';
  }
  for (const k of m2fw.rockets) {
    g.globalAlpha = 1;
    pxBox(g, Math.round(k.x * 4) / 4 - 0.5, Math.round(k.y * 4) / 4 - 0.5, 1, 1, '#fffbe8');
  }
  for (const p of m2fw.sparks) {
    const x = Math.round(p.x * 4) / 4;
    const y = Math.round(p.y * 4) / 4;
    const left = p.life / p.max;
    g.globalAlpha = Math.min(1, left * 2.5);
    if (p.flash) {
      skQDisc(g, x + 0.5, y + 0.5, p.life * 1.25, '#fff6d8');
      pxBox(g, x + 0.5 - p.life * 2.5, y + 0.5, p.life * 5, 0.5, '#ffffff');
      pxBox(g, x + 0.5, y + 0.5 - p.life * 2.5, 0.5, p.life * 5, '#ffffff');
    } else if (p.trail) pxBox(g, x, y, 0.5, 0.5, left > 0.5 ? litOf(p.color) : p.color);
    else {
      for (const k of [4, 3, 2, 1]) {
        g.globalAlpha = (1 - k * 0.2) * Math.min(1, left * 2);
        pxBox(g, Math.round((p.x + 0.5 - p.vx * k * 0.5) * 4) / 4, Math.round((p.y + 0.5 - p.vy * k * 0.5) * 4) / 4, 0.5, 0.5, k > 2 ? p.color : litOf(p.color));
      }
      g.globalAlpha = 1;
      if (left > 0.5) m2fwArt(g, PART_SPARK, partPal(p.color), x, y);
      else if (left > 0.3) m2fwArt(g, PART_BIT[2], partPal(p.color), x, y);
      else if (left > 0.18) pxBox(g, x, y, 0.5, 0.5, p.color);
      else if (Math.floor(p.life * 2) % 2) m2fwArt(g, PART_FLAKE, { l: p.color, w: '#ffffff' }, x - 0.5, y - 0.5);
    }
  }
  g.globalAlpha = 1;
}
m2.layers.light.push(m2mSafe((g, tick, reduced) => {
  if (reduced) { m2fw.rockets.length = m2fw.sparks.length = m2fw.pools.length = 0; return; }
  m2fwStep(tick);
  m2fwDraw(g);
}, 'fireworks'));
