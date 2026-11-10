// scene2-moria-east.js: Moria's East-gate and the Dimrill Dale on the map from above (scene2.js), at
// plan.places.moriaEast and plan.places.mirrormere: the Great Gates as a dark doorway in the mountain's foot between
// carved posts, with broad steps down to the dale and a road winding down past Durin's Stone; Mirrormere, a long oval
// of deep blue that mirrors the mountains by day, with the faint crown of seven stars in it, and the stars of the sky
// at night; and the Silverlode running out of the dale east-southeast to Lothlorien and on into the Anduin. Its course
// is left in plan.silverlode for scene2-lorien.js. The kit (m2MoriaThing, m2MoriaMark, m2MoriaGlows) is scene2-moria.js's.

// The gate's rock: dark and rough, outline to shine.
const M2_MORIA_DARK = ['#121118', '#24222c', '#35333f', '#484654', '#5e5c6a', '#7a7886', '#9c9aa6'];
// The face w by h units: a rough dark rock bay whose top meets the mountain's rock, the great doorway in its middle
// (posts carved in steps, a deep lintel, the hall within black), its sides falling to the ground as rocky slopes.
function m2MoriaEastRule(w, h) {
  const [W4, H4] = [w * 4, h * 4];
  const R = M2_RAMPS[9];
  const D = M2_MORIA_DARK;
  const [gw, gh] = [40, 50];
  const g0 = Math.round(W4 / 2 - gw / 2);
  return (px, py) => {
    const end = Math.min(px, W4 - 1 - px);
    const west = px < W4 / 2;
    const top = Math.round(m2Noise(px, 0, 6, 101) * 9 + Math.max(0, 16 - end) * 1.2);
    if (py < top) return null;
    const lip = 22 + Math.round((m2Noise(px, 3, 5, 102) - 0.5) * 6);
    const t = Math.max(0, (py - lip) / (H4 - lip));
    const edge = 18 - t * 8 + (m2Noise(py, west ? 1 : 2, 4, 103) - 0.5) * 4;
    if (end < 2 + Math.max(0, (lip - py) / 3)) return null;
    const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
    if (py < lip - 1 || end < edge) {
      if (end < 3 + Math.max(0, (lip - py) / 3)) return R[0];
      let n = m2Noise(px, py, 3, 104) * 2.4 + b * 0.9 + (py - top < 2 ? 0.8 : 0);
      if (end < edge && py >= lip - 1) n += west ? -0.9 : 0.7;
      return R[Math.max(1, Math.min(5, Math.floor(n + 1.2)))];
    }
    const [gx, gy] = [px - g0, py - (H4 - gh)];
    if (gx >= 0 && gx < gw && gy >= 0) {
      const inner = gx >= 7 && gx < gw - 7 && gy >= 9;
      if (inner) {
        const d = (gy - 9) / (gh - 9);
        if (gy > gh - 3) return D[2];
        return d > 0.75 && (gx + gy) % 2 ? '#141420' : d > 0.45 ? '#0b0b14' : '#050509';
      }
      if (gy < 9) {
        if (gy === 0 || gy === 8) return D[gy ? 0 : 6];
        if (gy === 1) return D[5];
        return D[(gx % 8 === 0 ? 2 : 4) - (gx > gw - 4 ? 1 : 0)];
      }
      if (gx === 0 || gx === gw - 1 || gx === 6 || gx === gw - 7) return D[0];
      const post = gx < 7 ? gx : gw - 1 - gx;
      return D[(gy % 10 === 0 ? 2 : post < 3 ? (gx < 7 ? 6 : 4) : (gx < 7 ? 5 : 3))];
    }
    if (py === lip - 1) return D[6];
    if (py >= H4 - 1 || end < edge + 1) return D[0];
    let k = 3 + (t < 0.15 ? 1 : 0) - (t > 0.7 ? 1 : 0) + (m2Noise(px, py, 2.5, 105) > 0.6 ? 1 : 0) - (m2Hash(px >> 1, py >> 2, 106) < 0.08 ? 1 : 0);
    if (m2Hash(px >> 1, 1, 107) < 0.1) k -= 1;
    if (end < edge + 5 && west) k -= 1;
    return D[Math.max(1, Math.min(6, k))];
  };
}
// Mirrormere's water by its place in the oval (nx, ny each -1 to 1) and its pixel: deep blue, darker at its heart,
// the snowy mountains mirrored upside down along its north shore, a pale band of sky down its middle.
const M2_MIRROR = ['#071226', '#0b1a36', '#10264c', '#173564', '#24497e', '#7f9cc6', '#c8d6ea'];
function m2MirrorPx(nx, ny, px, py, d) {
  const b = M2_BAYER[(py & 3) * 4 + (px & 3)];
  if (d > 0.92) return M2_MIRROR[4];
  // Reflected peaks: inverted teeth hanging from the north shore.
  const tooth = 0.55 + 0.35 * Math.abs(Math.sin(nx * 7.3 + 1.1)) * (0.6 + m2Hash(Math.floor(nx * 3.7 + 9), 1, 108) * 0.6);
  const depth = ny + 1;
  if (depth < tooth * 0.75 && depth < 0.9) return depth < tooth * 0.22 ? (b < 0.6 ? M2_MIRROR[5] : M2_MIRROR[4]) : M2_MIRROR[2];
  if ((py + (px >> 4)) % 6 === 0 && m2Hash(px >> 3, py, 109) < 0.3) return M2_MIRROR[4];
  return M2_MIRROR[d < 0.45 ? 1 : d < 0.75 ? 2 : b < 0.5 ? 3 : 2];
}

function m2MoriaEast(L, plan, season, add) {
  const E = plan.places.moriaEast;
  const M = plan.places.mirrormere;
  if (!E || !M) return;
  const [x, y] = [E.x, E.y];
  const [w, h] = [28, 19];
  m2MoriaThing(add, 'moriaEast', x - w / 2, y - h, w, h, y, m2MoriaEastRule(w, h), [x - w / 2 + 3, y - 2.5, x + w / 2 - 3, y]);
  L.decals.push((g) => m2Steps(g, x - 4.5, y - 0.25, 9, 3, M2_MORIA_DARK.slice(1)));
  // Mirrormere, a long oval leaning down toward the east.
  const [rx, ry, lean] = [8.5, 3.6, 0.18];
  const oval = (u, v) => {
    const [dx, dy] = [u - M.x, v - M.y];
    const [a, b] = [dx * Math.cos(lean) + dy * Math.sin(lean), -dx * Math.sin(lean) + dy * Math.cos(lean)];
    return [a / rx, b / ry, Math.hypot(a / rx, b / ry) / (1 + 0.06 * Math.sin(Math.atan2(b, a) * 3 + 1))];
  };
  const [bx0, by0, bw, bh] = [M.x - rx - 3, M.y - ry - 4, rx * 2 + 6, ry * 2 + 8];
  m2MoriaMark(L, bx0, by0, bx0 + bw, by0 + bh, M2_MAT.sand, (u, v) => oval(u, v)[2] <= 1.28 && m2MatAt(L, u, v) !== M2_MAT.water && 140);
  m2MoriaMark(L, bx0, by0, bx0 + bw, by0 + bh, M2_MAT.water, (u, v) => oval(u, v)[2] <= 1 && 160);
  L.decals.push((g) => m2Raster(g, bx0, by0, bw * 4, bh * 4, (px, py) => {
    const [nx, ny, d] = oval(bx0 + px / 4, by0 + py / 4);
    if (d > 1.28) return null;
    if (d > 1) return d > 1.2 ? (m2Hash(px >> 1, py >> 1, 110) < 0.5 ? M2_STONE.misty[0][3] : null) : M2_STONE.misty[0][(px + py) % 5 ? 2 : 4];
    return m2MirrorPx(nx, ny, px, py, d);
  }));
  // The crown of seven stars in the water: faint by day, and bright with the sky's stars at night.
  const stars = [0, 1, 2, 3, 4, 5, 6].map((s) => [M.x - 3 + s, M.y + 0.6 - Math.sin((s / 6) * Math.PI) * 1.4]);
  L.decals.push((g) => { for (const [sx, sy] of stars) pxBox(g, Math.round(sx * 4) / 4, Math.round(sy * 4) / 4, 0.25, 0.25, M2_MIRROR[5]); });
  const sky = [...stars, ...[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => [M.x + (m2Hash(i, 1, 111) - 0.5) * rx * 1.6, M.y + (m2Hash(i, 2, 111) - 0.3) * ry * 1.2])].filter(([u, v]) => oval(u, v)[2] < 0.85);
  m2MoriaGlows.push({ c: m2MoriaArt(`mmStars${sky.length}${Math.round(M.x)}`, bw, bh, (px, py) => {
    for (const [i, [sx, sy]] of sky.entries()) {
      const [dx, dy] = [px - Math.round((sx - bx0) * 4), py - Math.round((sy - by0) * 4)];
      if (!dx && !dy) return i < 7 ? '#ffffff' : '#dfe8ff';
      if (Math.abs(dx) + Math.abs(dy) === 1 && i < 7) return '#8fa8e0';
    }
    return null;
  }), x: bx0, y: by0, w: bw, h: bh, pulse: 0.09 });
  // Durin's Stone on the slope above the lake's west end: a broken pillar.
  const [sx, sy] = [M.x - rx - 1, M.y - ry - 1.5];
  m2Shadow(L, sx + 1, sy + 0.2, 1.6, 0.6, 0.7);
  m2MoriaThing(add, 'durinStone', sx - 1, sy - 5, 2, 5, sy, (px, py) => {
    if (py < 2 - (px > 4 ? 1 : 0) || px > 7) return null;
    return px === 0 || px === 7 || py === 19 ? M2_PAL.stone[0] : M2_PAL.stone[py < 3 ? 5 : px < 3 ? 4 : px < 6 ? 3 : 2];
  }, [sx - 0.8, sy - 0.8, sx + 0.8, sy + 0.2]);
  // The road down from the gate's steps, round the lake's north shore, and on beside the Silverlode.
  m2Path(L, [[x, y + 4], [x + 1.5, y + 7], [M.x - 2, M.y - ry - 2.2], [M.x + rx * 0.8, M.y - ry - 0.6], [M.x + rx + 4, M.y - 0.5]], 1.2);
  m2MoriaSilverlode(L, plan, [M.x + rx * 0.95, M.y + rx * Math.sin(lean) * 0.9]);
}
// Where the Golden Wood stands: round plan.places.lorien, moved south of Mirrormere and west as far as it must be to
// keep its east edge on the Anduin's west bank. Returns { x, y, rx, ry } (scene2-lorien.js plants it).
function m2LorienAt(plan) {
  const lo = plan.places.lorien ?? plan.places.silverlode;
  const [rx, ry] = [21, 17];
  const anduin = plan.rivers?.anduin ?? [];
  const ax = (y) => anduin.reduce((b, p) => (Math.abs(p[1] - y) < Math.abs(b[1] - y) ? p : b), anduin[0] ?? [lo.x + 99, y])[0];
  const M = plan.places.mirrormere;
  const y = M ? Math.max(lo.y, M.y + 8) : lo.y;
  const east = Math.min(ax(y - ry * 0.5), ax(y), ax(y + ry * 0.5));
  return { x: Math.min(lo.x, east - rx - 1), y, rx, ry, ax };
}
// The Silverlode from Mirrormere's east end, past its place, through the Golden Wood and into the Anduin below it.
// Its course goes to plan.silverlode.
function m2MoriaSilverlode(L, plan, from) {
  const c = m2LorienAt(plan);
  const sl = plan.places.silverlode ?? c;
  const ty = c.y + 9;
  const pts = [from, [from[0] + 3, from[1] + 2.5], [Math.min(sl.x, c.x - 2), Math.max(sl.y, from[1] + 5)], [c.x + 3, c.y + 4], [c.ax(ty) - 1, ty]];
  plan.silverlode = m2River(L, pts, 0.8, 1.4, 6);
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  m2MoriaEast(L, plan, season, add);
  m2.cost_moriaEast = performance.now() - t0;
});
