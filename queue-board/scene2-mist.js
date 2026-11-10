// scene2-mist.js: the mist over a realm whose machine the board can't reach, or a paused one, on the map from above
// (scene2.js), as the side view lays one over such a realm (scenery-props-qd.js drawMist). Seen from above it is a fog
// bank lying over the realm's land: banks of pale vapour drifting slowly east across it, thicker in some places and
// thinner in others, its opacity rising in steps joined by a 4 by 4 ordered dither like the side view's, white where it
// is thick and a grey-blue where it thins, its ragged edge fading out over the realm's border (and running straight off
// the map where the realm meets the map's edge), with the side view's own pale wisps streaming through it the other way.
// The figures under it keep the last report the board got, seen dimly through it; their bubbles and names stay over it,
// and the realm's note (scene2-notes.js) says how long ago that was. It is drawn over everything that stands
// (m2.layers.air), before the night's shade, so it darkens at night with the land. With reduced motion it lies still.
// The bank and its edge are painted once per realm size; each frame slides the bank under the edge on a scratch canvas.

const M2MIST_PAD = 4;
const M2MIST_FADE = 14;
const M2MIST_ALPHA = [0, 0.06, 0.11, 0.17, 0.23, 0.3, 0.38, 0.47, 0.55];
const m2mistArt = new Map();

// The fog bank's box for a realm: its region, grown a little on every side that is inside the map, so the edge fades
// across the border, and cut to the map.
function m2mistBox(r) {
  const x0 = Math.max(0, r.x - M2MIST_PAD);
  const y0 = Math.max(0, r.y - M2MIST_PAD);
  const x1 = Math.min(m2.W, r.x + r.w + M2MIST_PAD);
  const y1 = Math.min(m2.H, r.y + r.h + M2MIST_PAD);
  return { x0, y0, w: Math.round(x1 - x0), h: Math.round(y1 - y0), open: [x0 <= 0, y0 <= 0, x1 >= m2.W, y1 >= m2.H] };
}

// The bank (repeating east to west every w units, so it can slide forever) and the edge, painted once for a box.
function m2mistPaint(b, seed) {
  const key = `${b.w},${b.h},${b.open},${seed}`;
  if (m2mistArt.has(key)) return m2mistArt.get(key);
  const [W, H] = [b.w * 4, b.h * 4];
  const lo = hdRgb('#b9c0d2');
  const hi = hdRgb('#f4f6fb');
  const tau = Math.PI * 2;
  const bank = m2Canvas(b.w, b.h);
  const edge = m2Canvas(b.w, b.h);
  const bi = bank.g.createImageData(W, H);
  const ei = edge.g.createImageData(W, H);
  const dense = (x, y) => {
    const u = x / b.w + 0.025 * Math.sin(y / 9 + seed);
    return 0.6 * Math.sin(tau * 2 * u + seed) * Math.sin(y / 8 + seed * 1.3) + 0.28 * Math.sin(tau * 5 * u + seed * 2) * Math.sin(y / 3.6 + 0.7)
      + 0.12 * Math.sin(tau * 11 * u + seed) * Math.sin(y / 1.9 + seed);
  };
  for (let py = 0; py < H; py += 1) {
    const y = (py + 0.5) / 4;
    for (let px = 0; px < W; px += 1) {
      const x = (px + 0.5) / 4;
      const d = M2_BAYER[(py & 3) * 4 + (px & 3)];
      // Rounded banks a couple of dozen units across with smaller ones among them, a whole number of each across the
      // box so it repeats, lit on their upper left where they rise toward the light.
      const n = dense(x, y);
      const lit = Math.max(-1, Math.min(1, (n - dense(x - 1.5, y - 1.5)) * 2.5));
      const f = Math.max(1, Math.min(8, 5.6 + 2.6 * n));
      const lv = Math.floor(f) + (f - Math.floor(f) > d ? 1 : 0);
      const t = Math.min(1, Math.max(0, (lv - 3) / 5 + 0.3 * lit));
      const i = (py * W + px) * 4;
      [bi.data[i], bi.data[i + 1], bi.data[i + 2]] = lo.map((v, k) => Math.round(v + (hi[k] - v) * t));
      bi.data[i + 3] = Math.round(255 * M2MIST_ALPHA[Math.min(8, lv)]);
      // The edge: ragged, in eighths, open along any side that runs off the map.
      const rag = 2.5 * Math.sin(y / 5.3 + seed) + 1.6 * Math.sin(y / 2.1) + 2.5 * Math.sin(x / 6.1 + seed) + 1.4 * Math.sin(x / 2.6);
      const side = (dist, open) => (open ? 1 : Math.max(0, Math.min(1, (dist + rag) / M2MIST_FADE)));
      const e = side(x, b.open[0]) * side(y, b.open[1]) * side(b.w - x, b.open[2]) * side(b.h - y, b.open[3]);
      const e8 = Math.floor(e * 8) + (e * 8 - Math.floor(e * 8) > M2_BAYER[(py & 3) * 4 + ((px + 2) & 3)] ? 1 : 0);
      ei.data[i + 3] = Math.round((255 * Math.min(8, e8)) / 8);
    }
  }
  bank.g.putImageData(bi, 0, 0);
  edge.g.putImageData(ei, 0, 0);
  const out = { bank: bank.c, edge: edge.c, scratch: m2Canvas(b.w, b.h).c };
  if (m2mistArt.size > 8) m2mistArt.delete(m2mistArt.keys().next().value);
  m2mistArt.set(key, out);
  return out;
}

// One realm's mist this frame: the bank slid east by a quarter unit every few ticks and wrapped, cut to the edge, then
// the wisps drifting west through it (the side view's MIST_WISP art), fading in and out near the edge.
function m2mistDraw(g, r, k, tick, reduced) {
  const b = m2mistBox(r);
  if (b.w < 8 || b.h < 8) return;
  const art = m2mistPaint(b, k * 1.7 + 0.4);
  const s = art.scratch.getContext('2d');
  s.setTransform(1, 0, 0, 1, 0, 0);
  const W = b.w * 4;
  const off = reduced ? 0 : Math.floor(tick * 0.35) % W;
  s.globalCompositeOperation = 'source-over';
  s.clearRect(0, 0, W, b.h * 4);
  s.drawImage(art.bank, off, 0);
  s.drawImage(art.bank, off - W, 0);
  s.globalCompositeOperation = 'destination-in';
  s.drawImage(art.edge, 0, 0);
  s.globalCompositeOperation = 'source-over';
  g.drawImage(art.scratch, b.x0, b.y0, b.w, b.h);
  if (typeof mistWisp !== 'function' || typeof propArt !== 'function') return;
  const n = Math.max(3, Math.round((b.w * b.h) / 1400));
  for (let i = 0; i < n; i += 1) {
    const len = 8 + (i % 3) * 3;
    const span = b.w + len;
    const at = (i * 53 + k * 29 + (reduced ? 0 : Math.floor(tick * (i % 2 ? 0.9 : 0.6)) / 4)) % span;
    const x = b.x0 + b.w - at;
    const y = b.y0 + 6 + ((i * 37 + k * 11) % Math.max(1, b.h - 12)) + (i % 2) / 2;
    const [o0, o1, o2, o3] = b.open;
    const near = Math.min(o0 ? 99 : x - b.x0, o2 ? 99 : b.x0 + b.w - x - len, o1 ? 99 : y - b.y0, o3 ? 99 : b.y0 + b.h - y);
    if (near <= 2) continue;
    g.globalAlpha = Math.min(1, (near - 2) / 10);
    propArt(g, `wisp${len}`, MIST_WISP, () => mistWisp(len), Math.round(x * 4) / 4, y);
  }
  g.globalAlpha = 1;
}
m2.layers.air.push(m2mSafe((g, tick, reduced) => {
  m2.realms.forEach((r, k) => { if (!r.m.ok || r.m.paused) m2mistDraw(g, r, k, tick, reduced); });
}, 'mist'));
