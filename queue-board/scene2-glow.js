// scene2-glow.js: light that any part of the map from above (scene2.js) can add for one frame, and the storm's bolt.
// m2.glow.add(x, y, r, colour, strength) lights a pool of radius r round (x, y), added onto what is drawn (scene2-fx.js's
// m2Pool), stronger at night and a third as strong by day, so a call's ring, a torch, the palantir or a burning roof
// lights the land round it. The pools gather through the frame and are drawn in the light pass, after the night's shade;
// one added later than that shows on the next frame. At night the workers are stamped again over the shade. In a storm,
// when the lightning flashes (m2.weather.flash), a bolt forks down from a cloud over an empty land, never over a realm, a
// station or a worker.

m2.glow = {
  list: [],
  add(x, y, r, colour, strength = 1) { if (this.list.length < 200) this.list.push([x, y, Math.max(1, Math.round(r)), colour, strength]); },
};

// The night's depth at the scene's hour (scene2-fx.js's m2Dark), 0 by day.
const m2GlowDark = () => m2Dark(m2.sky?.hour ?? 12)[0];

// A bolt forked down from (x, y), 30 units long or so, by its seed: a white core with a pale blue edge, and a branch.
function m2Bolt(g, x, y, seed) {
  const seg = (x0, y0, n, k) => {
    let [px, py] = [x0, y0];
    for (let i = 0; i < n; i += 1) {
      const nx = px + (m2Hash(seed, i, k) - 0.5) * 5;
      const ny = py + 2.5 + m2Hash(seed, i, k + 1) * 2;
      const steps = Math.ceil(Math.max(Math.abs(nx - px), Math.abs(ny - py)) * 4);
      for (let s = 0; s <= steps; s += 1) {
        const [qx, qy] = [Math.round((px + ((nx - px) * s) / steps) * 4) / 4, Math.round((py + ((ny - py) * s) / steps) * 4) / 4];
        pxBox(g, qx - 0.25, qy, 0.75, 0.25, '#9fc4ff');
        pxBox(g, qx, qy, 0.25, 0.25, '#ffffff');
      }
      [px, py] = [nx, ny];
      if (k === 1 && i === 3) seg(px, py, 4, 7);
    }
  };
  seg(x, y, 9, 1);
}
// A place for the bolt in an empty land, by the flash's seed: one of a dozen tries, the first clear of the work.
function m2BoltSpot(seed) {
  for (let i = 0; i < 12; i += 1) {
    const [x, y] = [m2.W * (0.08 + m2Hash(seed, i, 61) * 0.84), m2.H * (0.05 + m2Hash(seed, i, 62) * 0.6)];
    if (typeof m2Clear !== 'function' || m2Clear(x - 4, y, x + 4, y + 34) > 10) return [x, y];
  }
  return null;
}

// At night every worker is stamped again over the shade, half strength by full dark, as if lit by the moon and its own
// lantern, so a figure always reads against the dark land round it.
m2.layers.light.unshift((g) => {
  const dark = m2GlowDark();
  if (dark < 0.05) return;
  for (const a of m2.actors.values()) {
    m2DrawActorLit(g, a, dark * 0.5 * (a.mood === 'gone' ? 0.4 : 1));
  }
});
// One worker drawn again at alpha k: its own drawing if it has one, else its body's frame (scene2-folk.js).
function m2DrawActorLit(g, a, k) {
  g.save();
  g.globalAlpha = k;
  if (a.draw) a.draw(g, a);
  else m2DrawActor(g, a, true);
  g.restore();
}
m2.layers.light.push((g, tick) => {
  const dark = m2GlowDark();
  if (m2.glow.list.length) {
    g.globalCompositeOperation = 'lighter';
    for (const [x, y, r, c, s] of m2.glow.list) {
      g.globalAlpha = Math.min(1, s * (0.33 + 0.67 * dark) * 0.7);
      g.drawImage(m2Pool(r, c), x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    m2.glow.list.length = 0;
  }
  const W = m2.weather;
  if (W?.storm && W.flash >= 1) {
    const at = m2BoltSpot(W.bolt ?? 0);
    if (at) m2Bolt(g, at[0], at[1], W.bolt ?? 0);
  }
});
