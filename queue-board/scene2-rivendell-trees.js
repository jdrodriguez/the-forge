// scene2-rivendell-trees.js: Rivendell's own woods on the map from above (scene2.js), for scene2-rivendell.js: tall
// firs in drooping tiers, dark blue-green with snow on each tier in winter; beeches with broad domed crowns over smooth
// grey trunks, fresh lime in spring, deep green in summer, copper, bronze or rust in autumn, and in winter bare grey
// twigs holding a few dry copper leaves; and birches, slender white trunks marked with black, under airy crowns of small
// leaves that let the trunk show through, gold in autumn and bare drooping twigs in winter. Each kind is painted once per
// size, season and seed into a canvas and shared, so a valley thick with trees costs a handful of paintings.
// m2RivWoods plants them over boxes of ground, clear of whatever must stay in sight.

// Paints like m2Raster (rule(px, py) gives each quarter-unit pixel's colour or nothing) but into pixel memory, stamped
// onto g at (x, y) units in one draw: far faster than a rectangle per run for the large, busy pieces.
const m2RivHex = new Map();
let m2RivScratch = null;
function m2RivRaster(g, x, y, w, h, rule) {
  const [W, H] = [Math.ceil(w), Math.ceil(h)];
  if (W < 1 || H < 1) return;
  if (!m2RivScratch || m2RivScratch.width < W || m2RivScratch.height < H) {
    m2RivScratch = document.createElement('canvas');
    [m2RivScratch.width, m2RivScratch.height] = [Math.max(W, m2RivScratch?.width ?? 0, 256), Math.max(H, m2RivScratch?.height ?? 0, 256)];
  }
  const sg = m2RivScratch.getContext('2d');
  const img = sg.createImageData(W, H);
  const px32 = new Uint32Array(img.data.buffer);
  for (let py = 0; py < H; py += 1) {
    for (let px = 0; px < W; px += 1) {
      const c = rule(px, py);
      if (!c) continue;
      let v = m2RivHex.get(c);
      if (v === undefined) { v = m2Pack(c); m2RivHex.set(c, v); }
      px32[py * W + px] = v;
    }
  }
  sg.putImageData(img, 0, 0);
  g.drawImage(m2RivScratch, 0, 0, W, H, x, y, W / 4, H / 4);
}

const m2RivArt = new Map();
// Leaf colours [mid, lit, shade] by kind and season; autumn beeches pick copper, bronze or rust by seed.
const M2_RIV_LEAF = {
  beech: { spring: [['#78bc48', '#a2d866', '#4c8a30']], summer: [['#3c7a34', '#5a9a40', '#285428']],
    autumn: [['#b4602a', '#de8c40', '#7a3a1c'], ['#c27e2a', '#eaa848', '#86501a'], ['#9a4422', '#c86a3c', '#682c18']] },
  birch: { spring: [['#94cc58', '#bce47c', '#66a03a']], summer: [['#6aa442', '#8ec458', '#467a2e']], autumn: [['#deb02c', '#f6d658', '#a87c1a'], ['#e6c23a', '#fae47a', '#b08a20']] },
};
const M2_RIV_FIR = ['#0b221c', '#12352a', '#1b4a38', '#265e46', '#387858', '#5a9670'];
const M2_RIV_BARK = { beech: ['#3e4248', '#646a70', '#8c9298', '#b8bdc0'], birch: ['#2e2a2c', '#a8a6a0', '#dad8d0', '#f6f4ee'] };

// A tree's art {c, w, h} with its foot at the middle of its bottom row: kind 'fir', 'beech' or 'birch', size 0 to 2.
function m2RivTreeArt(kind, size, season, seed) {
  const key = `${kind}${size}${season}${seed}`;
  if (!m2RivArt.has(key)) m2RivArt.set(key, kind === 'fir' ? m2RivFir(size, season, seed) : m2RivLeafy(kind, size, season, seed));
  return m2RivArt.get(key);
}

// A tree's size {w, h} in units without painting it, as m2RivFir and m2RivLeafy make it.
function m2RivDims(kind, size) {
  if (kind === 'fir') return { w: (4.5 + size) * 2 + 1, h: 31 + size * 7 };
  const [rx, ry] = kind === 'beech' ? [7.5 + size * 1.5, (7.5 + size * 1.5) * 0.82] : [4.5 + size, 9 + size * 2];
  return { w: rx * 2 + 1, h: ry * 2 + (kind === 'beech' ? 5 : 8 + size) + 1 };
}
// A fir: a spire of tiers, each narrow at its top and spreading to a ragged skirt of boughs, lit on the upper left of
// each tier and dark under it, on a short trunk.
function m2RivFir(size, season, seed) {
  const [R, H] = [4.5 + size, 30 + size * 7];
  const yb = H - 3;
  const n = 6 + size;
  const { c, g } = m2Canvas(R * 2 + 1, H + 1);
  pxBox(g, R - 0.25, yb - 2, 1.5, 4.5, '#3a2618');
  pxBox(g, R - 0.25, yb - 2, 0.5, 4.5, '#6a4a30');
  const P = M2_RIV_FIR;
  const half = (py) => {
    const t = py / (yb * 4);
    const k = Math.min(n - 1, Math.floor(t * n));
    const u = t * n - k;
    const jag = (m2Hash(Math.floor(py / 2), k, seed) - 0.5) * 2.2;
    return [R * 4 * Math.pow((k + 0.3 + 0.7 * u) / n, 0.85) + jag * u, u];
  };
  const inside = (px, py) => py >= 0 && py < yb * 4 && Math.abs(px + 0.5 - R * 4 - 2) <= half(py)[0];
  m2RivRaster(g, 0, 0, R * 8 + 4, yb * 4, (px, py) => {
    if (!inside(px, py)) return null;
    if (!inside(px - 1, py) || !inside(px + 1, py) || !inside(px, py + 1) || !inside(px, py - 1)) return P[0];
    const [hw, u] = half(py);
    const dx = (px + 0.5 - R * 4 - 2) / Math.max(1, hw);
    if (season === 'winter' && u < 0.26 && dx < 0.5 && m2Hash(px, py, seed + 3) < 0.55) return u < 0.12 ? '#ffffff' : '#dce8ee';
    const v = -dx * 0.75 - u * 1.1 + 0.55 + (m2Hash(px >> 1, py >> 1, seed) - 0.5) * 0.3;
    return P[v > 0.8 ? 5 : v > 0.35 ? 4 : v > -0.1 ? 3 : v > -0.55 ? 2 : 1];
  });
  return { c, w: R * 2 + 1, h: H + 1 };
}

// A beech or a birch: a crown of leaf clumps (a broad dense dome for a beech, a tall airy oval for a birch) over its
// trunk; bare twigs in winter, a beech keeping a few dry copper leaves.
function m2RivLeafy(kind, size, season, seed) {
  const beech = kind === 'beech';
  const [rx, ry] = beech ? [7.5 + size * 1.5, (7.5 + size * 1.5) * 0.82] : [4.5 + size, 9 + size * 2];
  const trunk = beech ? 5 : 8 + size;
  const [w, h] = [rx * 2 + 1, ry * 2 + trunk + 1];
  const { c, g } = m2Canvas(w, h);
  const B = M2_RIV_BARK[kind];
  const tw = beech ? 2 + size * 0.5 : 1.25;
  const tx = rx + 0.5 - tw / 2;
  // The trunk, lit on its left: smooth grey for a beech, white with black marks for a birch, up into the crown.
  m2RivRaster(g, tx - 0.5, ry * 0.5, tw * 4 + 4, (h - ry * 0.5) * 4, (px, py) => {
    const foot = py > (h - ry * 0.5) * 4 - 5;
    const lean = beech ? 0 : Math.round(Math.sin(py / 30 + seed) * 1.2);
    const x = px - 2 - lean;
    if (x < (foot ? -1 : 0) || x > tw * 4 - 1 + (foot ? 1 : 0)) return null;
    if (x <= 0 || x >= tw * 4 - 1) return B[0];
    if (!beech && m2Hash(Math.floor(py / 2), x > 2 ? 1 : 0, seed) < 0.16) return B[0];
    if (!beech && foot) return B[x < 2 ? 1 : 0];
    return B[x < tw * 1.4 ? 3 : x < tw * 2.6 ? 2 : 1];
  });
  const winter = season === 'winter';
  const leaves = winter ? null : M2_RIV_LEAF[kind][season] ?? M2_RIV_LEAF[kind].summer;
  const ramp = leaves ? treeRamp(leaves[seed % leaves.length]) : null;
  // The clumps: a main mass and a ring of smaller ones, more and smaller for a birch, each [x, y, r] in pixels.
  const [RX, RY] = [rx * 4, ry * 4];
  const cl = [[RX, RY * 1.05, Math.min(RX, RY) * (beech ? 0.78 : 0.6)]];
  const n = beech ? 9 : 16;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + m2Hash(seed, i, 71) * 0.6;
    const d = beech ? 0.52 + m2Hash(seed, i, 72) * 0.16 : 0.25 + m2Hash(seed, i, 72) * 0.55;
    cl.push([RX + Math.cos(a) * RX * d, RY + Math.sin(a) * RY * d * 0.95, Math.min(RX, RY) * (beech ? 0.42 : 0.29) * (0.85 + m2Hash(seed, i, 73) * 0.35)]);
  }
  // Which clump each pixel belongs to and how far into it, worked out once into a grid (null outside the crown).
  const [GW, GH] = [Math.ceil(RX * 2) + 2, Math.ceil(RY * 2) + 6];
  const grid = new Array(GW * GH).fill(null);
  for (let py = 0; py < GH - 1; py += 1) {
    for (let px = 0; px < GW - 1; px += 1) {
      let [best, bd] = [null, 9];
      for (const k of cl) {
        const dx = px + 0.5 - k[0];
        const dy = py + 0.5 - k[1];
        if (Math.abs(dx) > k[2] || Math.abs(dy) > k[2]) continue;
        const d = Math.sqrt(dx * dx + dy * dy) / k[2];
        if (d < bd) [best, bd] = [k, d];
      }
      if (bd > 1 || (!beech && bd > 0.62 && m2Hash(px >> 1, py >> 1, seed + 9) < 0.5)) continue;
      grid[py * GW + px] = [best, bd];
    }
  }
  const near = (px, py) => (px < 0 || py < 0 || px >= GW || py >= GH ? null : grid[py * GW + px]);
  if (winter) {
    m2RivTwigs(g, rx, ry, beech, seed);
    return { c, w, h };
  }
  m2RivRaster(g, 0.5, 0, RX * 2, RY * 2 + 4, (px, py) => {
    const hit = near(px, py);
    if (!hit) return null;
    if (!near(px - 1, py) || !near(px + 1, py) || !near(px, py + 1) || !near(px, py - 1)) return ramp[5];
    const [k, d] = hit;
    const [nx, ny] = [(px + 0.5 - k[0]) / k[2], (py + 0.5 - k[1]) / k[2]];
    let v = -(nx * 0.6 + ny * 0.8) - (py / (RY * 2)) * 0.55 + 0.35;
    if (d > 0.86 && ny > -0.1) return ramp[4];
    // Beech leaves lie in flat sprays (a dark seam every few rows); birch leaves glint in single lit specks.
    if (beech && (py + Math.floor(m2Hash(px >> 2, 0, seed) * 5)) % 5 === 0) v -= 0.35;
    if (!beech && m2Hash(px, py, seed + 5) < 0.08) v += 0.6;
    return ramp[v > 0.75 ? 0 : v > 0.3 ? 1 : v > -0.15 ? 2 : v > -0.55 ? 3 : 4];
  });
  if (season === 'spring' && !beech) for (let i = 0; i < 10; i += 1) pxBox(g, 1 + m2Hash(seed, i, 74) * (rx * 2 - 2), ry * 0.6 + m2Hash(seed, i, 75) * ry, 0.25, 0.75, '#c8b860');
  return { c, w, h };
}

// Bare winter twigs over a crown's oval: limbs forking up and out from the trunk, fine twigs at their ends, snow along
// their upper sides, and on a beech a few dry copper leaves still hanging.
function m2RivTwigs(g, rx, ry, beech, seed) {
  const col = beech ? ['#5a5258', '#7e767a'] : ['#4e3e46', '#6e5a62'];
  const limb = (x, y, a, len, wd, depth) => {
    const steps = Math.ceil(len * 4);
    for (let s = 0; s < steps; s += 1) {
      const [px, py] = [x + Math.cos(a) * s / 4, y + Math.sin(a) * s / 4 + (beech ? 0 : (s / steps) ** 2 * len * 0.25)];
      pxBox(g, Math.round(px * 4) / 4, Math.round(py * 4) / 4, Math.max(0.25, wd), 0.25, col[s % 3 ? 0 : 1]);
      if (s % 3 === 0 && depth < 1) pxBox(g, Math.round(px * 4) / 4, Math.round(py * 4) / 4 - 0.25, 0.25, 0.25, '#eef4f6');
    }
    if (depth < 2) for (const t of [-0.5, 0.45]) limb(x + Math.cos(a) * len, y + Math.sin(a) * len, a + t + (m2Hash(seed, depth, x | 0) - 0.5) * 0.4, len * 0.6, wd / 2, depth + 1);
  };
  for (let i = 0; i < 5; i += 1) limb(rx + 0.5, ry * 1.5, -Math.PI / 2 + (i - 2) * 0.42, ry * 0.75, beech ? 0.75 : 0.5, 0);
  if (beech) for (let i = 0; i < 14; i += 1) pxBox(g, 1 + m2Hash(seed, i, 76) * (rx * 2 - 2), ry * 0.4 + m2Hash(seed, i, 77) * ry * 1.2, 0.5, 0.25, i % 2 ? '#c08a52' : '#9a6232');
}

// Plants one tree with its foot at (x, y): its shadow on the ground, fallen leaves under it in autumn, the tree in the
// depth order with its trunk as the ground it blocks. Returns its box.
function m2RivTree(L, add, x, y, kind, size, season, seed) {
  const art = m2RivTreeArt(kind, size, season, seed);
  const r = art.w / 2;
  m2Shadow(L, x + r * 0.5, y - 0.6, r * (kind === 'fir' ? 0.8 : 1), r * 0.45, 0.75);
  if (season === 'autumn' && kind !== 'fir') {
    const cols = (M2_RIV_LEAF[kind].autumn[seed % M2_RIV_LEAF[kind].autumn.length]);
    L.decals.push((g) => {
      for (let i = 0; i < r * 3; i += 1) {
        const [a, d] = [m2Hash(seed, i, 78) * 6.28, r * (0.3 + m2Hash(seed, i, 79) * 0.9)];
        pxBox(g, Math.round((x + Math.cos(a) * d) * 4) / 4, Math.round((y + Math.sin(a) * d * 0.5) * 4) / 4, 0.25, 0.25, cols[i % 3]);
      }
    });
  }
  const [bx, by] = [x - art.w / 2, y - art.h + 0.5];
  add.obj({ x: bx, y: by, w: art.w, h: art.h, z: y, foot: [x - 1, y - 1, x + 1, y + 0.5], draw: (g) => g.drawImage(art.c, bx, by, art.w, art.h) });
  return { x0: bx, y0: by, x1: bx + art.w, y1: y };
}

// Plants woods over a box of ground: trees on a jittered grid of the given step, of the kinds mix [[kind, weight]],
// sizes from small to big, each only on the given grounds, its crown clear of every box in avoid, its foot clear of
// every box in feet, and apart from the others. Returns how many it planted.
function m2RivWoods(L, add, { area, step, mix, sizes = [0, 2], avoid = [], feet = [], mats, season, seed, keep = null }) {
  const placed = keep ?? [];
  const total = mix.reduce((s, [, w]) => s + w, 0);
  let count = 0;
  for (let gy = area.y0; gy <= area.y1; gy += step * 0.8) {
    for (let gx = area.x0 + ((gy / step) % 2) * step * 0.5; gx <= area.x1; gx += step) {
      const i = Math.round(gx * 31 + gy * 17);
      const [x, y] = [gx + (m2Hash(i, 1, seed) - 0.5) * step * 0.8, gy + (m2Hash(i, 2, seed) - 0.5) * step * 0.6];
      if (x < area.x0 || x > area.x1 || y < area.y0 || y > area.y1) continue;
      let pick = m2Hash(i, 3, seed) * total;
      const [kind0] = mix.find(([, w]) => (pick -= w) < 0) ?? mix[0];
      const size0 = m2Hash(i, 4, seed) < 0.5 ? sizes[0] : sizes[1];
      const s = Math.floor(m2Hash(i, 5, seed) * 2);
      if (mats && ![[0, 0], [-1.5, 0], [1.5, 0]].every(([dx, dy]) => mats.includes(m2MatAt(L, x + dx, y + dy)))) continue;
      if (feet.some((b) => x + 2 > b.x0 && x - 2 < b.x1 && y + 1 > b.y0 && y - 2 < b.y1)) continue;
      // The tree picked, or else a slimmer one (a small fir or birch) that squeezes into a tight gap.
      const fits = ([kind, size]) => {
        const art = m2RivDims(kind, size);
        const box = { x0: x - art.w / 2, y0: y - art.h, x1: x + art.w / 2, y1: y + 1 };
        if (avoid.some((b) => (b.z === undefined || y > b.z - 4) && box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return false;
        const rr = art.w * (kind === 'fir' ? 0.32 : 0.38);
        return !placed.some((t) => Math.hypot(t.x - x, (t.y - y) * 1.5) < (t.r + rr) * 0.72);
      };
      const pickd = [[kind0, size0], [kind0, sizes[0]], ['fir', 0], ['birch', 0]].find(fits);
      if (!pickd) continue;
      const [kind, size] = pickd;
      const rr = m2RivDims(kind, size).w * (kind === 'fir' ? 0.32 : 0.38);
      placed.push({ x, y, r: rr, kind, h: m2RivDims(kind, size).h });
      m2RivTree(L, add, x, y, kind, size, season, s);
      count += 1;
    }
  }
  return count;
}

// Rivendell's woods, once the river and roads are down: two rows of trees along the cliff top (none over the falls),
// then the valley floor and slopes wherever the ground is the elves' own grass, every crown clear of the desks and the
// rows above them, the road, the house's front, the garden's things, the spots and the paths an elf walks.
function m2RivPlant(L, add, r, plan, season, { solid, spots, paths, top, cliff, house }) {
  const t0 = performance.now();
  const avoid = solid.map((b) => (b === house.box ? { ...b, z: house.base } : b));
  for (const s of spots) avoid.push({ x0: s.x - 7, y0: s.y - 34, x1: s.x + 7, y1: s.y + 4 });
  for (const p of paths) {
    for (let i = 0; i < p.length - 1; i += 1) {
      const [[ax, ay], [bx, by]] = [p[i], p[i + 1]];
      const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 4));
      for (let j = 0; j <= n; j += 1) {
        const [x, y] = [ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n];
        avoid.push({ x0: x - 4, y0: y - 32, x1: x + 4, y1: y + 3 });
      }
    }
  }
  const river = plan.river;
  if (river) avoid.push({ x0: river.base - 9, y0: r.y - 60, x1: river.base + 9, y1: r.y + cliff + 2 });
  // The desk gardens keep open ground round them: no crown over the desk block or the 8 rows below it (pass 2).
  if (r.block) avoid.push({ x0: r.block.x0 - 4, y0: r.block.y0 - 30, x1: r.block.x1 + 4, y1: r.block.y1 + 8 });
  const held = [];
  const woods = (o) => m2RivWoods(L, add, { avoid, season, keep: held, ...o });
  const grass = [M2_MAT.elf, M2_MAT.wild, M2_MAT.forest];
  woods({ area: { x0: r.x + 1, y0: r.y - 4, x1: r.x + r.w - 1, y1: r.y + top - 1 }, step: 5.5, mix: [['fir', 4], ['beech', 2], ['birch', 3]], sizes: [1, 2], mats: grass, seed: 81 });
  const floor = held.length;
  woods({ area: { x0: r.x - 8, y0: r.y + cliff + 3, x1: r.x + r.w + 6, y1: r.f1 + 4 }, step: 6.5, mix: [['fir', 3], ['beech', 3], ['birch', 3]], sizes: [0, 2], mats: grass, seed: 82 });
  m2RivLeafSpots(L, r, held.slice(floor), [...solid, ...avoid.slice(solid.length, solid.length + spots.length)], grass);
  r.rivLateMs = performance.now() - t0;
  r.rivTrees = held.length;
}

// Up to two beeches or birches on the valley floor where an elf gathers golden leaves (scene2-haul-jobs.js's elf.leaves,
// as v1's elves do): each the place under its crown, on the elves' own ground inside the realm, clear of the desks, the
// other things and their spots, and apart from each other.
function m2RivLeafSpots(L, r, trees, solid, grass) {
  const made = [];
  for (const t of trees.filter((q) => q.kind !== 'fir').sort((p, q) => q.y - p.y)) {
    if (made.length >= 2) break;
    const [x, y] = [Math.round(t.x), Math.round(t.y + 3.5)];
    const body = { x0: x - 5, y0: y - 3, x1: x + 5, y1: y + 2 };
    if (x < r.x + 4 || x > r.x + r.w - 4 || y > r.y + r.h - 2) continue;
    if (![[0, 0], [-3, 0], [3, 0], [0, 2]].every(([dx, dy]) => grass.includes(m2MatAt(L, x + dx, y + dy)))) continue;
    if (solid.some((b) => body.x0 < b.x1 && body.x1 > b.x0 && body.y0 < b.y1 && body.y1 > b.y0)) continue;
    if ([...r.spots, ...made].some((s) => Math.hypot(s.x - x, s.y - y) < 12)) continue;
    made.push({ x, y, face: 'up', job: 'leaves', tree: { x: t.x, top: t.y - t.h } });
  }
  r.spots.push(...made);
}
