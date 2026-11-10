// scene2-eye.js: the Eye of Barad-dur and Mordor's cloud on the map from above (scene2.js), as the side view's tower has
// it (scene-tower.js). The Eye is always there on the tower's crown (plan.places.eye, else Barad-dur): a lidless eye
// wreathed in flame, an almond of fire round a black slit, slowly looking about, the slit sliding to where it looks and
// its flames licking up. While main is red (m2.war) it blazes: its flames grow and brighten, its halo widens, and its
// gaze falls on the land as a red glow (no beam, no column: only the glow on the ground). As in v1 (2026-11-09:
// parity with the side view) the gaze picks what to watch: a worker half the time (following one that walks), an orc of
// the swarm when there is one, or else open ground in a realm or on a road; it sweeps there, slowing as it nears, rests
// two to five seconds, then sweeps on. With reduced motion the Eye stares straight out and casts no gaze. Mount Doom's
// fire glows at the Sammath Naur's door, always, and more in the war. Mordor always lies under a dark cloud that drifts
// slowly east to west and thickens in the war; it covers only Mordor, an empty land, and the Eye and Mount Doom glow
// through it.

const m2eEye = { art: new Map(), cloud: null, cloudKey: '', gaze: { gx: null, gy: null, to: null, hold: 0 } };

// One frame of the Eye, 12 by 9 units, its slit at offset s (-1 to 1 pixels of look) and its flames in step f (0 to 3),
// hot when blazing. Painted once per look, step and heat.
function m2eEyeArt(s, f, hot) {
  const key = `${s}|${f}|${hot}`;
  if (m2eEye.art.has(key)) return m2eEye.art.get(key);
  const [W, H] = [48, 36];
  const [cx, cy] = [24, 21];
  const fire = hot ? ['#5a0800', '#a8180a', '#e8461a', '#ff8a2a', '#ffc24a', '#fff2b0'] : ['#3a0600', '#7a1408', '#b8340e', '#e8641e', '#ffa23a', '#ffe08a'];
  const { c, g } = m2Canvas(12, 9);
  m2Raster(g, 0, 0, W, H, (px, py) => {
    const [x, y] = [px + 0.5 - cx, py + 0.5 - cy];
    // The almond: two arcs meeting in points at either side, a little taller when blazing.
    const half = 7.5 * (1 - (x / 19) ** 2) * (hot ? 1.1 : 1);
    const inAlmond = Math.abs(x) < 19 && Math.abs(y) < half;
    if (inAlmond) {
      const slit = Math.abs(x - s * 3) < 1.6 * (1 - (y / half) ** 2) + 0.4;
      if (slit) return Math.abs(x - s * 3) < 0.9 ? '#000000' : '#1a0200';
      const d = Math.hypot(x / 19, y / half);
      const v = 5 - Math.floor(d * 4 + M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.9);
      return fire[Math.max(1, Math.min(5, v))];
    }
    // The rim of flame round it: tongues that lick up, longer above than below, moving with the step.
    const ang = Math.atan2(y, x);
    const tongue = (Math.sin(ang * 7 + f * 1.6) * 0.5 + 0.5) * (y < 0 ? 9 : 3) * (hot ? 1.3 : 1);
    const out = Math.hypot(x / 21, y / (half + 2)) - 1;
    const reach = out * 20;
    if (Math.abs(x) < 23 && reach < tongue && reach > -2) {
      const t = reach / Math.max(1, tongue);
      return t < 0.25 ? fire[3] : t < 0.6 ? fire[2] : (px + py) % 2 ? fire[1] : null;
    }
    return null;
  });
  m2eEye.art.set(key, c);
  return c;
}

// Mordor's cloud: dark soft billows dithered in two tones, in a tile as wide as Mordor that wraps, painted once per
// layout.
function m2eCloud(box) {
  const key = `${m2.key}`;
  if (m2eEye.cloudKey === key) return m2eEye.cloud;
  const w = Math.ceil(box.x1 - box.x0);
  const h = Math.ceil(box.y1 - box.y0);
  const { c, g } = m2Canvas(w, h);
  m2Raster(g, 0, 0, w * 4, h * 4, (px, py) => {
    const [x, y] = [px / 4, py / 4];
    // Noise that wraps across the tile's width, so the drift has no seam.
    const n = (m2Noise(x, y, 14, 7) * (w - x) + m2Noise(x - w, y, 14, 7) * x) / w;
    const m = (m2Noise(x, y, 5, 3) * (w - x) + m2Noise(x - w, y, 5, 3) * x) / w;
    const v = n * 0.75 + m * 0.35 + M2_BAYER[(py & 3) * 4 + (px & 3)] * 0.18;
    return v > 0.78 ? '#2e2228' : v > 0.6 ? '#1a1218' : v > 0.48 && (px + py) % 2 ? '#1a1218' : null;
  });
  Object.assign(m2eEye, { cloud: { c, w, h }, cloudKey: key });
  return m2eEye.cloud;
}
m2.layers.air.push((g, tick, reduced) => {
  const box = m2.plan?.mordor;
  if (!box) return;
  const cl = m2eCloud(box);
  const off = reduced ? 0 : (tick * 0.04) % cl.w;
  g.save();
  g.beginPath();
  g.rect(box.x0, box.y0, cl.w, cl.h);
  g.clip();
  g.globalAlpha = 0.5 + m2.war * 0.3;
  const x0 = Math.round((box.x0 - off) * 4) / 4;
  g.drawImage(cl.c, x0, box.y0, cl.w, cl.h);
  g.drawImage(cl.c, x0 + cl.w, box.y0, cl.w, cl.h);
  g.restore();
  g.globalAlpha = 1;
});

// The next thing the gaze watches, as v1's eyeTarget picks it: a worker half the time, an orc of the swarm when there
// is one (30%), or else open ground in a realm or on a road.
function m2eEyeTarget() {
  const workers = [...m2.actors.values()];
  const swarm = (typeof m2e === 'object' ? m2e.swarm : []).filter((o) => !o.flee);
  const roll = Math.random();
  if (workers.length && roll < 0.5) return workers[Math.floor(Math.random() * workers.length)];
  if (swarm.length && roll < 0.8) return swarm[Math.floor(Math.random() * swarm.length)];
  const r = m2.realms[Math.floor(Math.random() * m2.realms.length)];
  const road = m2.plan.roads?.[Math.floor(Math.random() * (m2.plan.roads?.length ?? 0))];
  if (!r || (road && Math.random() < 0.4)) {
    const [x, y] = road?.pts[Math.floor(Math.random() * road.pts.length)] ?? [m2.W / 2, m2.H / 2];
    return { x, y };
  }
  return { x: r.x + 8 + Math.random() * (r.w - 16), y: r.y + 10 + Math.random() * (r.h - 14) };
}
// One step of the gaze, once a frame in the war: it sweeps toward what it watches (where that is now, so it follows a
// walker), slowing as it nears, and once there rests 20 to 50 ticks, then picks another. A worker who left the board
// or an orc that fled ends the watch.
function m2eGazeStep() {
  const z = m2eEye.gaze;
  const gone = z.to && ((z.to.key && m2.actors.get(z.to.key) !== z.to) || z.to.flee);
  if (!z.to || gone) {
    z.to = m2eEyeTarget();
    z.hold = 0;
    if (z.gx === null) Object.assign(z, { gx: z.to.x, gy: z.to.y });
  }
  const [dx, dy] = [z.to.x - z.gx, z.to.y - 2 - z.gy];
  const d = Math.hypot(dx, dy);
  if (d > 1) {
    const v = Math.min(6, Math.max(1, d * 0.14));
    z.gx += (dx / d) * v;
    z.gy += (dy / d) * v;
    return;
  }
  if (!z.hold) z.hold = 20 + Math.floor(Math.random() * 30);
  z.hold -= 1;
  if (!z.hold) z.to = null;
}
// Where the Eye looks (e is its place): in peace a slow glance about Mordor; in the war at the gaze, whose place on the
// land is at. Gives the look (-1 to 1) and at. With reduced motion it stares straight out.
function m2eGaze(e, tick) {
  const z = m2eEye.gaze;
  if (m2Reduced.matches) return { look: 0, at: null };
  if (!m2.war || z.gx === null) return { look: Math.sin(tick / 47) * 0.8 + Math.sin(tick / 13) * 0.2, at: null };
  const at = { x: z.gx, y: z.gy };
  return { look: Math.max(-1, Math.min(1, (at.x - e.x) / 120)), at };
}
// The Eye sits in the socket at Barad-dur's crown, which the tower's art sets as plan.places.eye.
function m2eEyeAt(P) {
  return P?.eye ?? (P?.baradDur && { x: P.baradDur.x, y: P.baradDur.y - 44 });
}
// Mount Doom's fire at the Sammath Naur's door (plan.places.sammathNaur): always glowing, flickering, and stronger in
// the war, through the shared glow (scene2-glow.js) so it lights the slope round it, more at night.
m2.layers.ground.push((g, tick, reduced) => {
  const d = m2.plan?.places?.sammathNaur;
  if (!d || !m2.glow) return;
  const f = reduced ? 1 : 0.85 + 0.15 * Math.sin(tick * 0.7) + 0.05 * Math.sin(tick * 2.3);
  m2.glow.add(d.x, d.y, 6 + m2.war * 3, '#ff7a2a', (0.55 + m2.war * 0.35) * f);
  m2.glow.add(d.x, d.y, 2.5 + m2.war, '#ffd060', (0.5 + m2.war * 0.3) * f);
});
m2.layers.light.push((g, tick, reduced) => {
  const P = m2.plan?.places;
  const e = m2eEyeAt(P);
  if (!e) return;
  const t = reduced ? 0 : tick;
  const hot = m2.war > 0.5;
  // The gaze moves only while the war is on and the map is moving; when peace comes it starts afresh next time.
  if (m2.war > 0.05 && !reduced) m2eGazeStep();
  else if (!m2.war) Object.assign(m2eEye.gaze, { gx: null, gy: null, to: null, hold: 0 });
  const { look, at } = m2eGaze(e, t);
  // The gaze: a red glow on the land, faint, that never hides what it rests on.
  if (at && m2.war > 0.05) {
    g.globalAlpha = m2.war * 0.22;
    g.drawImage(m2Glow(14, '#d8281a'), at.x - 34, at.y - 20, 68, 40);
    g.globalAlpha = m2.war * 0.12;
    g.drawImage(m2Glow(14, '#ff6a2a'), at.x - 16, at.y - 10, 32, 20);
  }
  // The halo round the Eye, then the Eye.
  const pulse = 0.85 + 0.15 * Math.sin(t * 0.3);
  g.globalAlpha = (0.3 + m2.war * 0.4) * pulse;
  const r = 8 + m2.war * 6;
  g.drawImage(m2Glow(10, '#ff5a1a'), e.x - r, e.y - r * 0.8, r * 2, r * 1.6);
  g.globalAlpha = 1;
  const s = Math.round(look * 1.5);
  g.drawImage(m2eEyeArt(s, reduced ? 0 : Math.floor(t / 2) % 4, hot), Math.round((e.x - 6) * 4) / 4, Math.round((e.y - 5.25) * 4) / 4, 12, 9);
});
