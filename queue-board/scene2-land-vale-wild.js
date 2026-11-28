// scene2-land-vale-wild.js: Rhosgobel on the map from above (scene2.js), called by scene2-land-vale.js. Radagast's hut in
// a clearing on the eaves of Mirkwood: low walls of rough logs and fieldstone under a deep roof of turf grown thick with
// moss and ferns, a crooked stone chimney smoking, a round-topped door and a lit window; old trees close round it. In
// front stand his bird table (a roofed tray on a post) with small birds hopping and pecking on it and fluttering round
// it, a stone bird bath where more birds hop on the ground, and his herb patch in rows. Each spot he works at is listed
// in M2_RHOS_AT.

// Radagast's spots, as offsets from plan.places.rhosgobel: where he stands and which way he faces.
const M2_RHOS_AT = { birds: [-6, 7, 'up'], bath: [0, 10, 'down'], herbs: [8, 6, 'right'] };
const M2_MOSS = ['#1a2a14', '#2a4020', '#3a5a2a', '#4e7434', '#6a9044', '#8cae5a'];

function m2Rhosgobel(L, plan, season, add) {
  const R = plan.places.rhosgobel;
  if (!R) return;
  const [rx, ry] = [Math.round(R.x), Math.round(R.y)];
  m2ValeClear(L, rx - 18, ry - 28, rx + 20, ry + 16);
  m2Blob(L, rx, ry + 2, 15, 10, M2_MAT.elf, { wob: 3, seed: 62, keep: M2_MAT.water });
  m2Path(L, [[rx - 1, ry - 3], [rx - 2, ry + 6], [rx + 1, ry + 16]], 1.6);
  // The herb patch: rows of tilled earth with herbs in them.
  m2Rect(L, rx + 11, ry + 2, 7, 8, M2_MAT.soil);
  L.decals.push((g) => {
    for (let row = 0; row < 3; row += 1) {
      for (let i = 0; i < 4; i += 1) {
        const [hx, hy] = [rx + 11.5 + i * 1.6, ry + 3.25 + row * 2.5];
        const c = [['#4e8a3a', '#7ab45a'], ['#7a6aa8', '#a894d8'], ['#6a8a6a', '#9ab89a']][(row + i) % 3];
        pxBox(g, hx, hy, 1, 0.75, c[0]);
        pxBox(g, hx + 0.25, hy - 0.25, 0.5, 0.5, c[1]);
        pxBox(g, hx, hy + 0.75, 1, 0.25, '#2a1a10');
      }
    }
    // Toadstools at the clearing's edge.
    for (let i = 0; i < 6; i += 1) {
      const [mx, my] = [rx - 14 + m2Hash(i, 1, 63) * 30, ry + 8 + m2Hash(i, 2, 63) * 5];
      pxBox(g, Math.round(mx * 4) / 4, Math.round(my * 4) / 4, 0.75, 0.25, i % 2 ? '#c8322a' : '#d8b878');
      pxBox(g, Math.round(mx * 4) / 4 + 0.25, Math.round(my * 4) / 4 + 0.25, 0.25, 0.25, '#e8e0d0');
    }
  });
  m2Flowers(L, rx - 14, ry - 2, 28, 14, 18, ['#c9a6f0', '#ffffff', '#f2e27a'], [M2_MAT.elf], 64);
  // The hut.
  m2Shadow(L, rx + 3, ry - 4, 11, 2.4, 0.8);
  m2ValeThing(add, `rhosHut,${season}`, rx - 10, ry - 31, 18, 27.25, ry - 4, (g) => m2RhosHut(g, season), [rx - 9, ry - 12, rx + 7, ry - 4]);
  add.light({ pane: { x: rx - 10 + 12.75, y: ry - 31 + 15.5, w: 3, h: 3, kind: 'round' } });
  add.light({ x: rx + 4.25, y: ry - 14, r: 6, c: '#ffc56a' });
  m2Smoke(add, rx - 6.5, ry - 33, 9);
  // The bird table and the bird bath.
  m2Shadow(L, rx - 5.5, ry + 4.3, 2.5, 0.8, 0.7);
  m2ValeThing(add, 'rhosTable', rx - 9, ry - 6, 6, 10.5, ry + 4.25, m2RhosTable, [rx - 6.5, ry + 3.5, rx - 5.5, ry + 4.25]);
  m2Shadow(L, rx + 0.5, ry + 13.3, 2.5, 0.8, 0.7);
  m2ValeThing(add, 'rhosBath', rx - 2, ry + 9.5, 4.5, 4, ry + 13.25, m2RhosBath, [rx - 1.5, ry + 12.5, rx + 2.5, ry + 13.25]);
  m2RhosBirds(add, rx, ry);
  // The old trees round the clearing, close behind the hut and down its sides.
  const trees = [[-15, -20, 'dark', 7], [-8, -28, 'dark', 8], [4, -30, 'ever', 7], [14, -24, 'dark', 7], [-17, -6, 'oak', 6], [18, -10, 'oak', 6], [19, 3, 'dark', 6], [-17, 8, 'ever', 5]];
  trees.forEach(([dx, dy, kind, r], i) => m2Tree(L, add, rx + dx, ry + dy, kind, r, season, 300 + i * 17));
  plan.places.rhosSpots = Object.fromEntries(Object.entries(M2_RHOS_AT).map(([k, [dx, dy, face]]) => [k, { x: rx + dx, y: ry + dy, face, job: k === 'herbs' ? 'herbs' : 'birds' }]));
}

// The hut, 18 by 27 units: a deep turf roof, mossy and lumpy, ferns along its eave; the chimney of piled stones; walls of
// logs on a fieldstone footing; the round-topped door and a round window.
function m2RhosHut(g, season) {
  const M = season === 'winter' ? M2_MOSS.map((c, i) => (i > 1 ? hdMix(c, '#eef4f8', 0.5) : c)) : M2_MOSS;
  m2Raster(g, 0, 2, 72, 42, (px, py) => {
    const bulge = Math.sin((px / 71) * Math.PI);
    const top = 6 - bulge * 6 + (m2Hash(px >> 2, 1, 65) < 0.3 ? 1 : 0);
    const bottom = 38 + Math.round(Math.sin(px / 3.1) * 1.5 + 1.5);
    if (py < top || py > bottom) return null;
    if (py < top + 1 || py >= bottom - 0.5) return M[0];
    const lump = m2Noise(px / 4, py / 4, 1.6, 66);
    let k = 2 + Math.floor(lump * 2.6) + (px < 30 ? 1 : 0) - (py > 30 ? 1 : 0);
    if (m2Hash(px, py, 67) < 0.03 && season !== 'winter') return ['#f2e27a', '#ffffff', '#c9a6f0'][px % 3];
    return M[Math.max(1, Math.min(5, k))];
  });
  // The chimney of piled stones, leaning a little.
  m2Raster(g, 2, 0, 12, 22, (px, py) => {
    const lean = Math.round(py / 10);
    if (px < lean || px > 10 + lean) return null;
    const row = Math.floor(py / 3);
    const j = (px + (row % 2) * 3) % 6;
    if (py % 3 === 0 || j === 0) return M2_PAL.stone[1];
    return M2_PAL.stone[px < 5 + lean ? 4 : 3];
  });
  pxBox(g, 2.5, 0, 2.5, 0.75, '#141010');
  // The walls of rough logs over a footing of fieldstones.
  m2Raster(g, 1, 12, 64, 61, (px, py) => {
    if (py > 52) {
      const row = Math.floor((py - 53) / 4);
      const j = (px + row * 5) % 9;
      return py % 4 === 1 || j === 0 ? M2_PAL.stone[1] : M2_PAL.stone[px < 30 ? 4 : 3];
    }
    const r = (py + (px > 32 ? 1 : 0)) % 8;
    const k = r === 0 ? 0 : r < 3 ? 4 : r < 6 ? 3 : 2;
    if (px === 0 || px === 63) return M2_LOGS[0];
    if (m2Hash(px >> 2, py >> 1, 68) < 0.07) return M[2];
    return M2_LOGS[k];
  });
  pxBox(g, 1, 12, 16, 1.5, '#1a0e08');
  // The door: round-topped planks, a latch, a step of flat stone.
  m2Raster(g, 4, 13, 24, 56, (px, py) => {
    const [ax, ay] = [px + 0.5 - 12, py + 0.5];
    const ok = ay < 12 ? ax * ax + (ay - 12) ** 2 <= 144 : Math.abs(ax) <= 12;
    if (!ok) return null;
    const inner = ay < 12 ? ax * ax + (ay - 12) ** 2 <= 100 : Math.abs(ax) <= 10;
    if (!inner) return M2_LOGS[0];
    return ['#2f6a34', '#3f8a44', '#5aa65a'][px % 6 === 0 ? 0 : ax < 0 ? 2 : 1];
  });
  pxBox(g, 8.75, 21, 0.75, 0.75, '#e8bc4c');
  pxBox(g, 3.5, 26.75, 8, 0.5, M2_PAL.stone[4]);
  m2Window(g, 12.75, 15.5, 3, 3, M2_LOGS, 'round');
  // Ferns along the eave.
  for (let i = 0; i < 9; i += 1) pxBox(g, 0.5 + i * 2, 11.5 - (i % 2) * 0.5, 0.75, 0.75, M[i % 2 ? 4 : 3]);
}
// The bird table: a tray with a little roof on a post, 6 by 10.5 units.
function m2RhosTable(g) {
  const eave = m2Roof(g, 0.5, 0, 5, 0.5, 1.5, M2_PAL.wood, 0.5);
  pxBox(g, 1, eave, 0.5, 4.75 - eave, M2_PAL.wood[2]);
  pxBox(g, 4.5, eave, 0.5, 4.75 - eave, M2_PAL.wood[2]);
  pxBox(g, 0.25, 4.5, 5.5, 1, M2_PAL.wood[3]);
  pxBox(g, 0.25, 4.5, 5.5, 0.25, M2_PAL.wood[5]);
  pxBox(g, 0.25, 5.25, 5.5, 0.25, M2_PAL.wood[0]);
  for (let i = 0; i < 5; i += 1) pxBox(g, 0.75 + i, 4.5, 0.25, 0.25, '#e8d090');
  pxBox(g, 2.5, 5.5, 1, 5, M2_PAL.wood[2]);
  pxBox(g, 2.5, 5.5, 0.5, 5, M2_PAL.wood[3]);
  pxBox(g, 1.75, 10, 2.5, 0.5, M2_PAL.wood[1]);
}
// The bird bath: a stone basin on a short pedestal, water glinting in it.
function m2RhosBath(g) {
  const S = M2_PAL.stone;
  pxBox(g, 1.5, 2, 1.5, 1.75, S[3]);
  pxBox(g, 1.5, 2, 0.5, 1.75, S[4]);
  pxBox(g, 1, 3.5, 2.5, 0.5, S[2]);
  m2Raster(g, 0, 0, 18, 9, (px, py) => {
    const d = ((px + 0.5 - 9) / 9) ** 2 + ((py + 0.5 - 4) / 4) ** 2;
    if (d > 1) return null;
    if (d > 0.55) return py > 4 ? S[2] : S[4];
    return py < 3 && px < 9 ? '#a6dbe4' : '#4f9dbb';
  });
}
// The birds: a robin, a blue tit and a finch at the table pecking and hopping, two on the ground by the bath, and two
// fluttering in loops round the table and the hut's roof. Each frame is painted once; they roost still at night, and
// while main is red (m2.war) they are gone from the table, the bath and the air, as Radagast's other beasts flee
// (scene2-life-beasts.js), and come back when it clears.
const M2_BIRDS = [['#5a3a22', '#8a5a34', '#e0602e'], ['#2a4a7a', '#4a78b8', '#f2d24a'], ['#5a4a2a', '#8a7a4a', '#d8c070'], ['#3a3a3a', '#6a6a6a', '#e8e0d0']];
function m2RhosBirdArt(kind, pose) {
  return m2ValeCanvas(`bird${kind},${pose}`, 2, 2, (g) => {
    const [d, m, c] = M2_BIRDS[kind];
    if (pose < 2) {
      pxBox(g, 0.5, 0.75 + pose * 0.25, 1, 0.75, m);
      pxBox(g, 0.5, 1.25, 0.75, 0.25, c);
      pxBox(g, pose ? 1.25 : 1, pose ? 1 : 0.5, 0.5, 0.5, d);
      pxBox(g, pose ? 1.75 : 1.5, pose ? 1.25 : 0.75, 0.25, 0.25, '#e8b030');
      pxBox(g, 0.25, 1, 0.25, 0.25, d);
      pxBox(g, 0.75, 1.75, 0.25, 0.25, '#2a1a10');
    } else {
      pxBox(g, 0.75, 0.75, 0.5, 0.75, m);
      pxBox(g, 0.75, 1.25, 0.5, 0.25, c);
      const up = pose === 2;
      pxBox(g, 0, up ? 0.25 : 1, 0.75, 0.5, d);
      pxBox(g, 1.25, up ? 0.25 : 1, 0.75, 0.5, d);
    }
  });
}
function m2RhosBirds(add, rx, ry) {
  const night = () => (m2.sky?.hour ?? 12) < 6.5 || (m2.sky?.hour ?? 12) > 18.5;
  const war = () => (m2.war ?? 0) > 0.3;
  // Sitting birds: on the table's tray (sorted just in front of the table) and on the ground by the bath.
  const perch = (z, birds) => {
    const f = (g, tick, reduced) => {
      if (war()) return;
      const [t, n] = [reduced ? 0 : tick, night()];
      for (const [x, y, kind, ph] of birds) {
        const k = (t + ph) % 60;
        const hop = !n && k > 40 && k < 44 ? 0.5 : 0;
        const dx = !n && k >= 44 ? 0.5 : 0;
        g.drawImage(m2RhosBirdArt(kind, !n && k % 20 > 14 ? 1 : 0), x + dx, y - 1.5 - hop, 2, 2);
      }
    };
    f.item = true;
    f.z = z;
    add.anim(f);
  };
  perch(ry + 4.3, [[rx - 8.25, ry - 3, 0, 0], [rx - 6.5, ry - 3, 1, 23], [rx - 5, ry - 3, 2, 51]]);
  perch(ry + 13.6, [[rx - 1.5, ry + 13, 3, 11], [rx + 2.5, ry + 13.5, 0, 37]]);
  // Fliers: two loops in the air, over everything; by night they are roosting.
  const fly = [[rx - 6, ry - 8, 5, 3, 1, 0], [rx - 2, ry - 30, 7, 3, 2, 40]];
  const f = (g, tick, reduced) => {
    if (night() || war()) return;
    const t = reduced ? 0 : tick;
    for (const [cx, cy, ax, ay, kind, ph] of fly) {
      const a = (((t + ph) % 80) / 80) * Math.PI * 2;
      g.drawImage(m2RhosBirdArt(kind, 2 + ((t >> 1) % 2)), Math.round((cx + Math.cos(a) * ax) * 4) / 4, Math.round((cy + Math.sin(a) * ay) * 4) / 4, 2, 2);
    }
  };
  f.over = true;
  add.anim(f);
}
