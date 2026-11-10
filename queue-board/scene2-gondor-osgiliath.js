// scene2-gondor-osgiliath.js: Osgiliath on the map from above (scene2.js), the old capital of Gondor in ruins astride
// the Anduin: its great stone bridge of arches with its middle span broken and the river running through the gap, and
// on either bank the shells of domed halls, their domes cracked open, roofless walls with empty arched windows, a
// broken column or two and rubble in the grass. Called by scene2-gondor-fields.js's build with the river's line.

const M2OS_STONE = ['#3e4048', '#686a72', '#8e9096', '#b2b2b0', '#cfcdc6', '#e8e6de'];

// A ruined domed hall w units wide: a wall face with arched windows whose top is broken away, and a dome cracked open.
function m2OsHallRule(w, h, seed) {
  const [W4, H4] = [w * 4, h * 4];
  const S = M2OS_STONE;
  return (px, py) => {
    const wallTop = H4 * 0.45 + Math.floor(m2Hash(px >> 1, seed, 3) * 5) * (px > W4 * 0.55 ? 1.6 : 0.6);
    const dr = W4 * 0.3;
    const [dx, dy] = [px + 0.5 - W4 * 0.4, py + 0.5 - H4 * 0.45];
    const broken = px > W4 * 0.4 + dr * 0.15 && py < H4 * 0.45 - dr * (0.35 + m2Hash(px >> 1, seed, 4) * 0.4);
    if (dy < 0 && dx * dx + dy * dy <= dr * dr && !broken) {
      if (dx * dx + dy * dy > (dr - 1.2) ** 2) return S[0];
      const l = -dx / dr * 0.5 - dy / dr * 0.4;
      return S[l > 0.35 ? 5 : l > 0.05 ? 4 : l > -0.25 ? 3 : 2];
    }
    if (dy < 0 && dx * dx + dy * dy <= dr * dr && broken && dx * dx + dy * dy > (dr - 1.6) ** 2) return S[1];
    if (py < wallTop || px < 1 || px >= W4 - 1) return null;
    if (px < 2 || px >= W4 - 2 || py >= H4 - 1) return S[0];
    const col = (px - 3) % 8;
    const arch = col >= 2 && col < 6 && py > H4 * 0.62 && py < H4 - 3 && (py > H4 * 0.68 || col === 3 || col === 4);
    if (arch) return py > H4 * 0.78 && m2Hash(px, seed, 5) < 0.4 ? '#4a6a3a' : '#22242c';
    if (py < wallTop + 1) return S[3];
    return S[(px < W4 * 0.5 ? 4 : 3) - (py % 5 === 0 ? 1 : 0)];
  };
}
// A broken column standing alone, its top snapped off at its own height.
const m2OsColRule = (h, seed) => (px, py) => {
  const top = Math.floor(m2Hash(seed, 1, 6) * 6) + (px === 2 ? 2 : 0);
  if (py < top || px > 4) return null;
  if (py >= h * 4 - 2) return px < 5 ? M2OS_STONE[1] : null;
  return px === 0 || px === 4 ? M2OS_STONE[0] : M2OS_STONE[px < 2 ? 5 : px < 3 ? 4 : 2];
};

function m2GfOsgiliath(L, plan, add, os, rx) {
  const y = os.y;
  const half = 7.5;
  // The bridge: a deck of paving on arches over the water, its middle span fallen, piers standing in the stream.
  const gap = [rx - 1.6 + (m2Hash(Math.floor(rx), 2, 9) - 0.5), rx + 1.6];
  for (let x = rx - half; x < rx + half; x += 0.5) if (x < gap[0] || x > gap[1]) m2Rect(L, x, y - 1.6, 0.5, 3, M2_MAT.plaza);
  L.decals.push((g) => {
    for (let x = rx - half; x < rx + half; x += 0.25) {
      if (x >= gap[0] && x <= gap[1]) continue;
      g.fillStyle = M2OS_STONE[5];
      g.fillRect(x, y - 1.75, 0.25, 0.5);
      g.fillStyle = M2OS_STONE[1];
      g.fillRect(x, y + 1.25, 0.25, 0.5);
      const arch = ((x - rx + half) % 3) / 3;
      g.fillStyle = arch > 0.2 && arch < 0.8 ? '#22303e' : M2OS_STONE[2];
      g.fillRect(x, y + 1.75, 0.25, arch > 0.2 && arch < 0.8 ? 0.5 + Math.sin((arch - 0.2) / 0.6 * Math.PI) * 0.5 : 1.25);
    }
    g.fillStyle = M2OS_STONE[3];
    for (const x of [gap[0] - 0.75, gap[1] + 0.25]) for (let k = 0; k < 4; k += 1) g.fillRect(x + m2Hash(k, Math.floor(x), 3) * 0.75, y - 1 + k * 0.7, 0.5, 0.5);
    g.fillStyle = '#e8f4f8';
    g.fillRect(gap[0] + 0.5, y + 2.25, gap[1] - gap[0] - 1, 0.25);
  });
  // Halls on both banks, columns and rubble.
  const halls = [[-half - 6, -3, 8, 7, 1], [-half - 3.5, 4.5, 6, 6, 2], [half + 5.5, -2.5, 8, 7, 3], [half + 3, 5, 6, 5.5, 4]];
  for (const [dx, dy, w, h, seed] of halls) {
    const [x, z] = [rx + dx, y + dy];
    if (!m2GfFree(L, plan, x, z - 0.5) && m2MatAt(L, x, z - 0.5) !== M2_MAT.road) continue;
    m2Shadow(L, x + 1, z, w / 2 + 0.5, 1.2, 0.8);
    m2SouthThing(add, `osHall${w}_${seed}`, x - w / 2, z - h, w, h, z, m2OsHallRule(w, h, seed), [x - w / 2, z - 1.5, x + w / 2, z]);
  }
  for (const [dx, dy, seed] of [[-half - 1.5, -4, 1], [half + 1.5, -4.5, 2], [-half - 9.5, 2.5, 3], [half + 9, 1.5, 4]]) {
    const [x, z] = [rx + dx, y + dy];
    if (m2MatAt(L, x, z) === M2_MAT.water) continue;
    m2SouthThing(add, `osCol${seed}`, x - 0.6, z - 4.5, 1.25, 4.5, z, m2OsColRule(4.5, seed), [x - 0.6, z - 0.5, x + 0.6, z]);
  }
  L.decals.push((g) => {
    for (let k = 0; k < 26; k += 1) {
      const [x, z] = [rx + (m2Hash(k, 1, 77) - 0.5) * 34, y + (m2Hash(k, 2, 77) - 0.5) * 14];
      if (Math.abs(x - rx) < half + 0.5 || m2MatAt(L, x, z) === M2_MAT.water) continue;
      g.fillStyle = M2OS_STONE[1];
      g.fillRect(x, z + 0.25, 0.75, 0.25);
      g.fillStyle = M2OS_STONE[m2Hash(k, 3, 77) < 0.5 ? 4 : 3];
      g.fillRect(x, z - 0.25, 0.75, 0.5);
    }
  });
  add.light({ x: rx - half - 6, y: y - 3, r: 3, c: '#ffc070' });
  plan.places.osgiliathBridge = { x: rx, y, gap };
}
