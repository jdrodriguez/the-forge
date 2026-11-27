// scenery-shire.js: the Shire's own trees in the Middle-earth view, drawn at 32-bit (a quarter unit a pixel): broad old
// oaks with thick gnarled trunks and wide spreading crowns, and apple trees, standing on the open ground among the
// hobbits' work. Each follows the season of the date (seasonNow, scenery-elves.js): an oak is fresh yellow-green in
// spring, deep green in summer, russet and gold in autumn, and in winter it stands bare, its crooked limbs and twigs
// dusted with snow and a few dead leaves still clinging; an apple tree is white and pink with blossom in spring, green
// in summer, hung with red apples in autumn (a few fallen in the grass under it), and bare with a little snow in
// winter. realmProps (scenery-props.js) places them through PROP_LATE.hobbit, two to four as the ground allows, each
// clear of the hill and its door, the gardens, the well, the pen, the cart, the kettle, the stations and their names,
// the war fires, the chimney's smoke and the road. Each is a prop drawn through PROP_DRAW, so a hobbit passes in front
// of it or behind it, with a foot only as wide as its trunk, which the workers walk round (scene-path.js). The crowns
// sway with the wind (scene-wind.js) as Rivendell's do, each tree casts a soft shadow on the grass, and a robin sits on
// top of the first. The painting is scenery-elves.js's (treeClumps, treeLimbs, treeOutline, treeArt, treeSway, and
// drawBird for the robin). Loaded after scenery-elves.js.

// Each kind's size in units at scale 1 (its box, crown and trunk together) and its colours: the bark's [mid, lit,
// shade] and each season's leaves [mid, lit, shade]; autumn's oak has a second colour for some of its clumps.
const SHIRE_TREE = {
  oak: { w: 20, h: 22, bark: ['#76664e', '#9c8868', '#52463a'], spring: ['#7cb044', '#a4cc5c', '#548a34'], summer: ['#437c30', '#67a042', '#2d5a28'],
    autumn: ['#9c5428', '#c97a3a', '#6c3620'], gold: ['#b07a2c', '#daa44c', '#7c5222'] },
  apple: { w: 12, h: 14, bark: ['#6c5244', '#94755e', '#4a372e'], spring: ['#6aa84c', '#90c866', '#4a8238'], summer: ['#4f9038', '#78b450', '#356a2c'],
    autumn: ['#73983c', '#9fc058', '#50762f'] },
};
// The trees to plant, biggest first: an oak, an apple tree, a smaller oak and another apple tree, each at the largest
// of its scales that fits, or left out.
const SHIRE_PLANT = [['oak', [1.25, 1, 0.8]], ['apple', [1, 0.85]], ['oak', [1, 0.8]], ['apple', [0.85]]];
const shireBox = (kind, s) => [Math.round(SHIRE_TREE[kind].w * s), Math.round(SHIRE_TREE[kind].h * s)];
const shireTrunk = (kind, s) => (kind === 'oak' ? 14 : 6) * s;
// A seeded generator of numbers from 0 to 1, so each tree grows the same way every time.
const shireRng = (seed) => { let k = 0; return () => rnd(seed + (k += 1) * 7.31); };

// A branching skeleton of limbs from (x, y) leaning a (radians from upright, positive to the right), len pixels long and
// w wide, bent once partway as old wood is, forking into two or three thinner limbs depth times over. reach(a) is how
// far the crown reaches in the direction a, so the limbs fill it. Each twig's end goes in tips.
function shireBranch(out, tips, x, y, a, len, w, depth, rng) {
  const bend = (rng() - 0.5) * 0.8;
  const [mx, my] = [x + Math.sin(a + bend) * len * 0.5, y - Math.cos(a + bend) * len * 0.5];
  const [ex, ey] = [mx + Math.sin(a - bend * 0.6) * len * 0.5, my - Math.cos(a - bend * 0.6) * len * 0.5];
  out.push([x, y, mx, my, w, w * 0.88], [mx, my, ex, ey, w * 0.88, w * 0.72]);
  if (depth <= 0) { tips.push([ex, ey]); return; }
  const n = rng() < 0.35 ? 3 : 2;
  for (let i = 0; i < n; i += 1) {
    const b = a + ((i + 0.5) / n - 0.5) * 1.4 + (rng() - 0.5) * 0.5;
    shireBranch(out, tips, ex, ey, b, len * (0.62 + rng() * 0.16), Math.max(1, w * 0.64), depth - 1, rng);
  }
}

// One tree's art: its trunk rising from the middle of the bottom row, flaring into roots, then its limbs; then in leaf
// its crown of clumps over them (a few gaps low down, where the limbs show), or in winter only the bare limbs down to
// their twigs. W and H are its size in pixels; the crown is an ellipse in the upper part, flatter underneath.
function shireTreeArt(kind, s, seed, season) {
  return treeArt(`shire|${kind}|${s}|${seed}|${season}`, () => {
    const T = SHIRE_TREE[kind];
    const [w, h] = shireBox(kind, s);
    const [W, H] = [w * 4, h * 4];
    const G = treeGrid(W, H);
    const oak = kind === 'oak';
    const rng = shireRng(seed);
    const [cx, cy, rx, ry] = [W / 2, H * (oak ? 0.36 : 0.37), W * (oak ? 0.46 : 0.45), H * (oak ? 0.29 : 0.3)];
    const trunk = shireTrunk(kind, s);
    const lean = (rng() - 0.5) * (oak ? 4 : 6);
    const fork = [cx + lean, cy + ry * (oak ? 0.55 : 0.65)];
    const limbs = [[cx, H - 1, fork[0], fork[1], trunk, trunk * 0.82]];
    // Roots spreading into the grass either side of the foot.
    for (const d of [-1, 1]) limbs.push([cx + d * trunk * 0.25, H - trunk * 0.55, cx + d * trunk * 0.95, H - 0.5, trunk * 0.45, 1.5]);
    if (oak) limbs.push([cx - trunk * 0.1, H - 2, cx - trunk * 0.5, H - 0.5, trunk * 0.4, 2]);
    const tips = [];
    const reach = (a) => 1 / Math.hypot(Math.sin(a) / rx, Math.cos(a) / (fork[1] - cy + ry));
    const main = oak ? [-1.15, -0.45, 0.3, 1.05] : [-0.85, 0.05, 0.8];
    const depth = season === 'winter' ? (oak ? 3 : 3) : 1;
    for (const a0 of main) {
      const a = a0 + (rng() - 0.5) * 0.25;
      shireBranch(limbs, tips, fork[0], fork[1], a, reach(a) * (season === 'winter' ? (oak ? 0.42 : 0.5) : 0.42), trunk * 0.55, depth, rng);
    }
    treeLimbs(G, limbs);
    // Old oak bark: deep furrows down the trunk and its biggest limbs, a knot hole with a lit lower lip.
    if (oak) {
      G.forEach((row, j) => row.forEach((ch, c) => {
        if ('BCD'.includes(ch) && j > fork[1] - 6 && (c + Math.round(Math.sin(j / 3 + seed) * 1.4)) % 4 === 0) G[j][c] = ch === 'B' ? 'C' : 'E';
      }));
      const [kx, ky] = [Math.round(cx - trunk * 0.2), Math.round(H - trunk * 1.3)];
      treeStamp(G, ['.EE.', 'EFFE', 'EFFE', '.AB.'], kx, ky);
    }
    const leaf = T[season] ?? T.summer;
    let pal = treeKeys('123456', treeRamp(leaf), treeKeys('ABCDEF', treeRamp(T.bark), { x: '#ffffff', y: '#dce8f2', l: '#9a5a2c', L: '#6e3e22' }));
    if (season === 'winter') shireSnow(G, tips, oak, rng);
    else {
      const clumps = [];
      const rad = (oak ? 6.5 : 5) * s;
      for (let j = cy - ry, i = 0; j <= cy + ry; j += rad * 1.05, i += 1) {
        for (let c = cx - rx + (i % 2) * rad * 0.65; c <= cx + rx; c += rad * 1.3) {
          const [x, y] = [c + (rng() - 0.5) * rad * 0.7, j + (rng() - 0.5) * rad * 0.6];
          const [vx, vy] = [(x - cx) / (rx - rad * 0.6), (y - cy) / ((y > cy ? ry * 0.8 : ry) - rad * 0.5)];
          if (vx * vx + vy * vy > 1 || (vy > 0.45 && rng() < 0.3)) continue;
          const other = oak && season === 'autumn' && rng() < 0.3;
          clumps.push([x, y, rad * (0.85 + rng() * 0.3), vy * 0.85 + vx * 0.4 - 0.25, other ? 'abcde' : '12345']);
        }
      }
      treeClumps(G, clumps, seed);
      pal = treeKeys('abcde', treeRamp(T.gold ?? leaf), pal);
      shireDress(G, kind, season, seed, H);
    }
    treeOutline(G);
    // Where a bird can perch: the top of the crown (or of the bare limbs) a little left of the middle.
    const perch = Math.round(cx - W * 0.12);
    const top = G.findIndex((row) => row[perch] !== '.' || row[perch + 1] !== '.');
    return { rows: G, pal: Object.assign(pal, SHIRE_DOTS), crown: cy + ry, perch: [perch / 4, Math.max(0, top) / 4] };
  });
}
// Blossom, apples, catkins and the like: the characters shireDress adds to a crown.
const SHIRE_DOTS = { p: '#ffffff', q: '#fbd3df', r: '#e5799b', s: '#fff3a0', R: '#ff8f74', S: '#d8302a', U: '#8c1c22', V: '#4f2a16' };
// The crown's season: an apple tree's blossom (clusters of white and pink petals over the crown) or its apples (round
// and red, lit on their upper left, with a few fallen in the grass), an oak's pale catkins in spring, and a few leaves
// of a paler or darker green in summer.
function shireDress(G, kind, season, seed, H) {
  const leafy = (ch) => ch && '12345abcde'.includes(ch);
  const put = (c, j, rows) => rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && (leafy(G[j + y]?.[c + x]) || j + y >= H - 3)) treeSet(G, c + x, j + y, ch); }));
  const apple = ['RS.', 'SSU', '.UU'];
  G.forEach((row, j) => row.forEach((ch, c) => {
    if (!leafy(ch)) return;
    const r = rnd(seed * 7 + j * 37 + c * 11);
    if (kind === 'apple' && season === 'spring' && r < 0.05) put(c, j, r < 0.025 ? ['pq', 'qr'] : ['.p.', 'pqp', '.q.']);
    else if (kind === 'apple' && season === 'autumn' && r < 0.014 && j < H * 0.62) put(c, j, apple);
    else if (kind === 'oak' && season === 'spring' && r < 0.02 && '23'.includes(ch)) G[j][c] = 's';
    else if (season === 'summer' && r < 0.008) G[j][c] = r < 0.004 ? '1' : '4';
  }));
  if (kind === 'apple' && season === 'autumn') {
    for (const k of [0, 1, 2]) put(Math.floor(G[0].length * (0.18 + 0.27 * k + rnd(seed + k) * 0.1)), H - 3, apple);
  }
}
// Winter on bare limbs: snow along the top of every limb thick enough to hold it, and on an oak a few brown leaves
// still clinging at the twigs' ends.
function shireSnow(G, tips, oak, rng) {
  G.forEach((row, j) => row.forEach((ch, c) => {
    if ('ABCDE'.includes(ch) && (G[j - 1]?.[c] ?? '.') === '.' && 'ABCDE'.includes(G[j + 1]?.[c] ?? '.') && rng() < 0.75) G[j][c] = rng() < 0.6 ? 'x' : 'y';
  }));
  if (oak) for (const [x, y] of tips) if (rng() < 0.18) { treeSet(G, Math.round(x), Math.round(y), 'l'); treeSet(G, Math.round(x) + 1, Math.round(y) + 1, 'L'); }
}

// Plants the Shire's trees once its other props are placed. Each tree's whole box, crown and all, must clear what
// realmProps keeps its props off (outs), each station's figure and the name above it, the war fires and their flames,
// and the smoke over the chimney; and it stands a little apart from the trees already planted. Its foot is on one of
// the Shire's ground lines (shireRows). Of the places left, a tree takes the one farthest from the other trees, then
// away from the hill, then nearer the back.
function shirePlant(r, P, fit, outs, desks) {
  const cx = r.x0 + Math.floor(r.w / 2);
  const keep = [...outs, ...warFires(r).map((f) => [f.x - 5, f.y - 10, f.x + 6, f.y + 3]), [cx + 5, 0, cx + 17, GROUND_Y - 12],
    ...sc.stations.filter((s) => s.realm === r && !s.sentry).map((s) => [s.x - 11, s.y - 25, s.x + 11, s.y + 2])];
  P.shireTrees = [];
  if (!shireShade && sc.layers) { sc.layers.ground.push(shireShadows); shireShade = true; }
  SHIRE_PLANT.forEach(([kind, scales], i) => {
    let best = null;
    for (const s of scales) {
      const [w, h] = shireBox(kind, s);
      for (const base of shireRows()) {
        for (let x = r.x0 + 1; x + w <= r.x0 + r.w - 1; x += 1) {
          if (!boxClear([x, base - h + 1, x + w - 1, base], keep)) continue;
          const mid = x + w / 2;
          const apart = Math.min(40, ...P.shireTrees.map((t) => Math.hypot(t.x + t.w / 2 - mid, (t.base - base) * 1.5)));
          const score = apart + Math.abs(mid - cx) * 0.15 - (base - GROUND_Y) * 0.1;
          if (!best || score > best.score) best = { score, x, base, s, w, h };
        }
      }
      if (best) break;
    }
    if (!best) return;
    const { x, base, s, w, h } = best;
    const [t, half] = [x + w / 2, shireTrunk(kind, s) / 8 + 1];
    const tree = { type: 'shireTree', kind, s, seed: 1127 + i * 131, bird: i === 0, x, y: base - h + 1, w, h, base, foot: [t - half, base - 3, t + half, base + 1] };
    keep.push([x - 2, tree.y - 2, x + w + 1, base + 2]);
    outs.push(tree.foot);
    desks.push(tree.foot);
    P.list.push(tree);
    P.shireTrees.push(tree);
  });
}
(PROP_LATE.hobbit ??= []).push(shirePlant);

// Each tree's shadow on the grass, a soft oval round its foot reaching a little to the lower right (the light is from
// the upper left), in two steps, drawn in the ground layer so the hobbits walk over it. scene.js makes sc.layers after
// this file loads, so the pass joins the ground layer the first time the trees are planted.
let shireShade = false;
function shireShadows(g, scene) {
  for (const r of scene.realms) {
    for (const p of (r.kind === 'hobbit' && realmProps(r).shireTrees) || []) {
      const [cx, cy, rx, ry] = [p.x + p.w * 0.56, p.base + 0.25, p.w * 0.42, Math.max(1.5, p.h * 0.1)];
      g.fillStyle = '#1e3a1a';
      for (const k of [1, 0.7]) {
        g.globalAlpha = 0.13;
        for (let y = -ry * k; y <= ry * k; y += 0.25) {
          const half = Math.round(rx * k * Math.sqrt(Math.max(0, 1 - (y / (ry * k)) ** 2)) * 4) / 4;
          g.fillRect(cx - half, Math.round((cy + y) * 4) / 4, half * 2, 0.25);
        }
      }
      g.globalAlpha = 1;
    }
  }
}

// Draws a Shire tree in its season, its crown bending with the wind at its trunk (an oak's heavy crown less than an
// apple tree's, and hardly at all when bare): the top row moves most and the trunk not at all.
PROP_DRAW.shireTree = (g, p, st, tick) => {
  const season = seasonNow();
  const art = shireTreeArt(p.kind, p.s, p.seed, season);
  const mid = p.x + p.w / 2;
  const sway = sc.wind ? (sc.wind.tree ? sc.wind.tree(mid, p.seed, tick) : sc.wind.at(mid, tick)) : 0;
  const amp = Math.round(sway * (p.kind === 'oak' ? 5 : 4) * p.s * (season === 'winter' ? 0.4 : 1));
  treeSway(g, art, p.x, p.y, amp, art.crown);
  // On the first tree a robin sits at the top of the crown, moving as its row of the crown moves, and hops now and then.
  if (!p.bird) return;
  const [bx, by] = art.perch;
  const shift = Math.round(amp * Math.max(0, 1 - (by * 4) / art.crown) ** 1.4) / 4;
  drawBird(g, p.x + bx + shift - 1, p.y + by - 0.25, false, !scReduced.matches && (tick + p.seed) % 41 < 2 ? 1 : 0, '#7a4a32');
};
