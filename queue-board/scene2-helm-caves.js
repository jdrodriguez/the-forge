// scene2-helm-caves.js: the details of Helm's Deep (scene2-helm.js) cut into its faces and set going: the Hornburg's
// gate in its gatehouse with timber doors under a stone arch, arrow slits in the tower, the culvert where the
// Deeping-stream runs out under the wall, and the tall mouth of the Glittering Caves of Aglarond in the cliff at the
// gorge's head, its dark full of crystal that glints. Its glints twinkle in a loop of cached frames, and at night they
// burn through the dark over a soft glow; lamps hang at the gate, torches along the wall, a light in the tower and
// Rohan's green banner flies from its top.

const M2_HELM_GLINT = ['#ffffff', '#c8f6ff', '#e4d2ff', '#8fe2ff'];
// Arches cut in the faces: [centre x, ground row from, ground row to, half width, foot z, height] relative to the wall's
// middle, the caves' mouth relative to the caves' place.
const m2HelmArch = (x, z, ax, hw, z0, h) => {
  const dx = Math.abs(x - ax);
  if (dx > hw || z < z0) return -1;
  const roof = z0 + h - hw * (1 - Math.sqrt(Math.max(0, 1 - (dx / hw) ** 2)));
  return z > roof ? -1 : (dx > hw - 0.5 || z > roof - 0.5 ? 1 : 0);
};

// A face's own colour where something is cut into it, else null.
function m2HelmCut(x, y, z, top, cx, cy) {
  if (top) return null;
  // The Hornburg's gate: timber doors with iron bands and studs under a stone arch.
  if (y > -11.5 && y < -10.7) {
    const a = m2HelmArch(x, z, -4.5, 1.6, 5, 8.6);
    if (a === 1) return M2_HELM_STONE[5];
    if (a === 0) {
      if (Math.abs(x + 4.5) < 0.15) return '#120a06';
      if (Math.abs((z - 5) % 2.5) < 0.3) return '#3a3a40';
      return (Math.floor(x * 4) % 3 === 0 ? '#4a2c16' : '#6e4422');
    }
  }
  // Arrow slits round the tower and along the court's curtain.
  if (Math.hypot(x + 12, (y + 6.5) * 1.15) < 2.5 && y > -6.6) {
    if ((z > 22 && z < 24 && Math.abs(x + 12.3) < 0.35) || (z > 16 && z < 18 && Math.abs(x + 13.2) < 0.3)) return '#100c0a';
  }
  if (y > -1.4 && y < -0.8 && x > -14 && x < -8 && z > 9.5 && z < 11.5 && Math.abs(((x + 40) % 2.6) - 1.3) < 0.28) return '#100c0a';
  // The culvert under the Deeping Wall, the stream running into its dark.
  if (y > 0 && y < 0.6) {
    const a = m2HelmArch(x, z, 5, 1.4, 0, 2.6);
    if (a === 1) return M2_HELM_STONE[4];
    if (a === 0) return z < 0.6 ? '#2f7a9e' : '#0c0a0c';
  }
  // The mouth of the Glittering Caves: a tall arch of rock, crystal catching the light round its rim, deep dark inside.
  if (y > cy + 0.2 && y < cy + 1.6 && Math.abs(x - cx) < 3.4) {
    const a = m2HelmArch(x, z, cx, 3, 0, 8.5);
    if (a === 1) return m2Hash(Math.floor(x * 4), Math.floor(z * 4), 35) < 0.3 ? M2_HELM_GLINT[3] : M2_HELM_ROCK[0];
    if (a === 0) {
      const h = m2Hash(Math.floor(x * 4), Math.floor(z * 4), 36);
      if (h < 0.05) return M2_HELM_GLINT[1 + Math.floor(h * 60) % 3];
      return z > 6.5 || Math.abs(x - cx) > 2.2 ? '#14182a' : '#07080f';
    }
  }
  return null;
}

// The glints' frames: each spark in the caves' mouth with its own phase, a dot, a cross or a four-point star.
function m2HelmGlintFrames() {
  const sparks = Array.from({ length: 14 }, (_, k) => {
    const a = m2Hash(k, 1, 37) * Math.PI;
    const r = Math.sqrt(m2Hash(k, 2, 37));
    return { x: 12 + Math.cos(a) * r * 9, y: 34 - Math.sin(a) * r * 26, ph: Math.floor(m2Hash(k, 3, 37) * 8), c: M2_HELM_GLINT[k % 4] };
  });
  return [0, 1, 2, 3, 4, 5, 6, 7].map((f) => m2SouthArt(`helmGlint${f}`, 6, 9, (px, py) => {
    for (const s of sparks) {
      const t = (f + s.ph) % 8;
      const size = t === 0 ? 2 : t === 1 || t === 7 ? 1 : t < 4 ? 0 : -1;
      if (size < 0) continue;
      const [dx, dy] = [Math.abs(px - s.x), Math.abs(py - s.y)];
      if ((dx === 0 && dy <= size) || (dy === 0 && dx <= size)) return dx + dy === 0 ? '#ffffff' : s.c;
    }
    return null;
  }));
}

// The White Mountains' own peaks set round the site, where the range's were taken off: flanking the coomb east of the
// wall and standing behind the gorge, low enough that the gorge still shows.
function m2HelmPeaks(L, add, Hp, cx, cy) {
  for (const [dx, dy, w, seed] of [[19, 1, 15, 3], [24.5, 8, 17, 7], [-9, cy + 19, 13, 5], [3, cy + 20, 15, 9], [14, cy + 17, 14, 2], [-20, cy + 12, 12, 11], [26, cy + 18, 15, 4]]) {
    const c = m2Peak(w, 'white', seed);
    const [x, y, ph] = [Hp.x + dx, Hp.y + dy, c.height / 4];
    m2Shadow(L, x + w * 0.28, y - 0.5, w * 0.42, 2.2, 0.8);
    add.obj({ x: x - w / 2, y: y - ph, w, h: ph, z: y, c, foot: [x - w * 0.35, y - 3, x + w * 0.35, y], draw: (g) => g.drawImage(c, x - w / 2, y - ph, w, ph) });
  }
}

let m2HelmNight = null;
// Sets the caves' glints, the lamps and the banner going for the site at the wall's middle Hp, caves at (cx, cy).
function m2HelmLife(L, plan, add, Hp, cx, cy) {
  m2HelmPeaks(L, add, Hp, cx, cy);
  const frames = m2HelmGlintFrames();
  const [mx, my] = [Hp.x + cx - 3, Hp.y + cy + 0.6 - 9];
  const { y0, band } = M2_HELM;
  const z = Hp.y + y0 + (Math.floor((cy + 0.6 - y0) / band) + 1) * band + 0.05;
  const glint = (g, tick, reduced) => g.drawImage(frames[reduced ? 0 : (tick >> 2) & 7], mx, my, 6, 9);
  glint.item = true;
  glint.z = z;
  add.anim(glint);
  m2HelmNight = { frames, x: mx, y: my };
  add.light({ x: Hp.x + cx, y: Hp.y + cy - 3, r: 10, c: '#9fdcff' });
  add.light({ x: Hp.x + cx, y: Hp.y + cy - 1, r: 5, c: '#e8f8ff' });
  for (const dx of [-6.6, -2.4]) add.light({ x: Hp.x + dx, y: Hp.y - 22.5, r: 4.5, c: '#ffc56a', fire: true });
  add.light({ x: Hp.x - 4.5, y: Hp.y - 12, r: 6, c: '#ffb050', fire: true });
  for (const dx of [-1, 4, 9, 13]) add.light({ x: Hp.x + dx, y: Hp.y - 13, r: 3.5, c: '#ffb050', fire: true });
  add.light({ x: Hp.x - 12.3, y: Hp.y - 27.5, r: 3, c: '#ffd080' });
  // Rohan's banner on the tower's top: green with a white horse, flying east in a slow wave.
  const flags = [0, 1, 2, 3].map((f) => m2SouthArt(`helmFlag${f}`, 4, 5, (px, py) => {
    if (px < 1) return py < 20 ? '#4a3420' : null;
    const wave = Math.round(Math.sin(px / 3 - f * 1.6) * 1.2);
    const [t, b] = [1 + wave, 9 + wave];
    if (py < t || py > b || px > 15) return null;
    if (py === t || py === b || px === 15) return '#1c4a20';
    const horse = px > 5 && px < 12 && py > t + 2 && py < b - 1 && (py === t + 4 || px === 6 || px === 11 || (px > 9 && py < t + 4));
    return horse ? '#f4f0e0' : px < 8 ? '#3f8a3a' : '#2e6e2c';
  }));
  const [fx, fy] = [Hp.x - 12.2, Hp.y - 6.5 - 31 - 4.4];
  const flag = (g, tick, reduced) => g.drawImage(flags[reduced ? 0 : (tick >> 3) & 3], fx, fy, 4, 5);
  flag.item = true;
  flag.z = Hp.y - 3.9;
  add.anim(flag);
}

// At night the glints burn through the dark.
m2.layers.light.push((g, tick, reduced) => {
  const N = m2HelmNight;
  if (!N || typeof m2Dark !== 'function') return;
  const dark = m2Dark(m2.sky?.hour ?? 12)[0];
  if (dark < 0.05) return;
  g.globalAlpha = Math.min(1, dark * 1.2);
  g.drawImage(N.frames[reduced ? 0 : (tick >> 2) & 7], N.x, N.y, 6, 9);
  g.globalAlpha = 1;
});
