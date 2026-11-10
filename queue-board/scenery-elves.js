// scenery-elves.js: Rivendell's living things in the Middle-earth view, drawn at 32-bit (a quarter unit a pixel): its
// trees through the seasons of the real date, and the art of its deer and birds (scene-wild.js moves them). Spring
// (March to May) dots the canopies with white and pink blossom; summer (June to August) keeps them green; autumn
// (September to November) turns each tree gold, orange or russet with clumps and leaves of the other two among them;
// winter (December to February) darkens them to evergreen with snow along every ledge of the canopy. scenery-land.js's
// drawRealm draws the trees each frame with drawElfTree, at the places elfTrees (scenery-props.js) gives, their crowns
// swaying with the wind (scene-wind.js). The painting of trees here (treeClumps, treeLimbs, treeOutline, treeArt and
// treeSway) is shared with the Shire's trees (scenery-shire.js). Loaded after scenery-props.js.

// The season of the date on the place's clock (scenery-sun.js): spring, summer, autumn or winter.
const SEASONS = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const seasonNow = () => SEASONS[sceneNow().month];

// Each season's canopy: [mid, lit, shade] and the dots scattered over it. Autumn picks one of three by the tree's seed.
const AUTUMN = [['#d39a36', '#ecc25e', '#a8742a'], ['#d0702c', '#ee9147', '#9c4e1f'], ['#a5502e', '#c46a40', '#7a3a22']];
const CANOPY = {
  spring: [['#56a079', '#70bb90', '#3d7c5e'], ['#fbe3ef', '#ffffff', '#ef8fbc']],
  summer: [['#4a9370', '#62ad86', '#367256'], ['#86c9a2', '#a6dcb6', '#e0c766']],
  winter: [['#2f6352', '#3f7a66', '#244b3e'], ['#e8f1f5', '#ffffff', '#cfe0ea']],
};
function canopyOf(season, seed) {
  if (season !== 'autumn') return CANOPY[season];
  const k = Math.floor(rnd(seed + 3) * 3);
  return [AUTUMN[k], [AUTUMN[(k + 1) % 3][1], AUTUMN[(k + 2) % 3][0], '#f2d27a']];
}

// A material's six steps from [mid, lit, shade]: a highlight warmer than the lit, the lit, the mid and the shade, a
// deep shade cooler than the shade, and an outline in the material's own darkest hue. Light comes from the upper left.
const treeRamp = ([mid, lit, shade]) => [hdMix(lit, '#fff2b8', 0.4), lit, mid, shade, hdMix(shade, '#1a2448', 0.4), hdMix(shade, HD_DARK, 0.62)];
// A map's palette: the characters of keys take the colours of ramp in order (a '.' skips one), plus any extras.
const treeKeys = (keys, ramp, extra = {}) => Object.assign(Object.fromEntries([...keys].map((k, i) => [k, ramp[i]]).filter(([k]) => k !== '.')), extra);
// The bark of Rivendell's trees: pale and silvery, lit on the left.
const ELF_BARK = ['#efe7d2', '#d2c7ad', '#aea38b', '#8a806d', '#655e54', '#46403b'];

// A tree is painted as a grid of characters, one a pixel, '.' clear: digits 1 to 5 the leaves (highlight to deep), 6
// their outline, A to E the bark (highlight to deep), F its outline, and letters of the tree's own for the rest.
const treeGrid = (w, h) => Array.from({ length: h }, () => Array(w).fill('.'));
const treeSet = (G, c, j, ch) => { if (j >= 0 && j < G.length && c >= 0 && c < G[0].length) G[j][c] = ch; };
// Leaf clumps, the lower ones first, so each higher clump laps over the one below and its shaded underside shows as a
// dark scallop against that one's lit top. A clump [x, y, rad, dark, ramp] is a disc with a lobed rim, lit on its upper
// left and shaded to its lower right, dark (about -0.5 to 1) more for the clumps low and to the right in the crown,
// painted in ramp's five characters (highlight to deep). Here and there a leaf catches the light or falls into shade.
function treeClumps(G, clumps, seed) {
  clumps.sort((a, b) => b[1] - a[1]).forEach(([x, y, rad, dark, ramp = '12345'], n) => {
    for (let j = Math.floor(y - rad * 1.2); j <= y + rad * 1.2; j += 1) {
      for (let c = Math.floor(x - rad * 1.2); c <= x + rad * 1.2; c += 1) {
        const [dx, dy] = [c + 0.5 - x, j + 0.5 - y];
        const [a, cut] = [Math.atan2(dy, dx), n * 1.7 + seed];
        const rim = rad * (1 + 0.1 * Math.sin(a * 5 + cut) + 0.06 * Math.sin(a * 9 + cut * 0.6));
        if (Math.hypot(dx, dy) > rim || !G[j] || c < 0 || c >= G[0].length) continue;
        const leaf = rnd(seed + c * 17 + j * 131);
        const l = Math.hypot(dx + rim * 0.35, dy + rim * 0.4) / rim - 0.8 + dark + (leaf < 0.03 ? -0.5 : leaf > 0.97 ? 0.5 : 0);
        G[j][c] = ramp[l < -0.58 ? 0 : l < -0.12 ? 1 : l < 0.38 ? 2 : l < 0.82 ? 3 : 4];
      }
    }
  });
}
// Limbs of bark: each [x0, y0, x1, y1, w0, w1] runs between its ends, w0 pixels wide narrowing to w1, lit on its side
// toward the upper left.
function treeLimbs(G, limbs) {
  for (const [x0, y0, x1, y1, w0, w1] of limbs) {
    const len = Math.hypot(x1 - x0, y1 - y0) || 1, [ux, uy] = [(x1 - x0) / len, (y1 - y0) / len];
    const [nx, ny] = uy * 0.6 - ux * 0.8 > 0 ? [-uy, ux] : [uy, -ux];
    for (let t = 0; t <= 1; t += 0.4 / len) {
      const [px, py, hw] = [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, Math.max(0.5, (w0 + (w1 - w0) * t) / 2)];
      for (let j = Math.floor(py - hw); j <= py + hw; j += 1) {
        for (let c = Math.floor(px - hw); c <= px + hw; c += 1) {
          const [dx, dy] = [c + 0.5 - px, j + 0.5 - py];
          if (dx * dx + dy * dy > hw * hw + 0.15) continue;
          const s = (dx * nx + dy * ny) / hw;
          treeSet(G, c, j, s > 0.6 && hw > 2.5 ? 'A' : s > 0.2 ? 'B' : s > -0.35 ? 'C' : s > -0.75 ? 'D' : 'E');
        }
      }
    }
  }
}
// Each shape's edge in its material's outline: the darkest step on its lower and right edges, one lighter on its upper
// and left ones, where the light falls (a selective outline).
function treeOutline(G) {
  const at = (c, j) => G[j]?.[c] ?? '.';
  const marks = [];
  G.forEach((row, j) => row.forEach((ch, c) => {
    const kind = '123456abcde'.includes(ch) ? '56' : 'ABCDEF'.includes(ch) ? 'EF' : null;
    if (!kind) return;
    if (at(c + 1, j) === '.' || at(c, j + 1) === '.') marks.push([c, j, kind[1]]);
    else if (at(c - 1, j) === '.' || at(c, j - 1) === '.') marks.push([c, j, kind[0]]);
  }));
  for (const [c, j, ch] of marks) G[j][c] = ch;
}
// A grid painted once into a canvas of its own at SC_RES (scene.js) and kept by key, its rows as a pixel map.
const TREE_ART = new Map();
function treeArt(key, make) {
  if (TREE_ART.has(key)) return TREE_ART.get(key);
  const { rows, pal, ...rest } = make(), cv = document.createElement('canvas');
  [cv.width, cv.height] = [(rows[0].length * SC_RES) / 4, (rows.length * SC_RES) / 4];
  const g = cv.getContext('2d');
  g.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
  qdMap(g, rows.map((r) => (typeof r === 'string' ? r : r.join(''))), pal, 0, 0);
  TREE_ART.set(key, { cv, w: rows[0].length / 4, h: rows.length / 4, ...rest });
  return TREE_ART.get(key);
}
// Draws a tree's art with its left edge at x and top at y, its crown bending with the wind: amp quarter units at the
// top row, less and less down to row still (in quarter units), and the rows below that (the trunk) not at all. Rows
// that shift alike go in one copy.
function treeSway(g, art, x, y, amp, still) {
  const { cv } = art;
  const shift = (j) => { const m = (j * 4) / SC_RES; return m < still ? Math.round(amp * (1 - m / still) ** 1.4) : 0; };
  for (let j = 0; j < cv.height;) {
    let [k, e] = [shift(j), j + 1];
    while (e < cv.height && shift(e) === k) e += 1;
    g.drawImage(cv, 0, j, cv.width, e - j, x + k / 4, y + j / SC_RES, cv.width / SC_RES, (e - j) / SC_RES);
    j = e;
  }
}

// Rivendell's canopy: a tall teardrop of leaf clumps (ELF_CANOPY, its half width in half units down its height, at size
// 1), darker toward its lower right. Autumn sets clumps of a second colour among the first and scatters leaves of the
// third; spring dots it with blossom; summer with a few paler leaves; winter lays snow along every ledge, on the top of
// each clump that faces the sky and under each one that overhangs another. size scales it: 1 for the tall trees,
// smaller for the line along the back of the valley.
const ELF_CANOPY = [3, 7, 9, 11, 13, 13, 13, 11, 11, 9, 7, 3];
function elfCanopy(G, seed, size, season, mid, rad) {
  const rows = Math.max(8, Math.round(96 * size));
  const half = (j) => { const t = Math.min(11, Math.max(0, ((j + 0.5) / rows) * 12 - 0.5)); const k = Math.floor(t); return (ELF_CANOPY[k] + (ELF_CANOPY[Math.min(11, k + 1)] - ELF_CANOPY[k]) * (t - k)) * size * 2; };
  const clumps = [[mid, rad * 0.8, rad * 0.85, -0.45]];
  for (let j = rad * 1.4, i = 0; j < rows - rad * 0.5; j += rad * 1.05, i += 1) {
    const w = Math.max(0, half(j) - rad * 0.9);
    const n = Math.round((w * 2) / (rad * 1.25));
    for (let k = 0; k <= n; k += 1) {
      const x = mid + (n ? -w + (k * 2 * w) / n : 0) + (rnd(seed + i * 7 + k) - 0.5) * 3 + (n ? (i % 2 ? 1.5 : -1.5) : 0);
      const dark = (j / rows) * 1.05 + ((x - mid) / (w + rad)) * 0.5 - 0.55;
      const other = season === 'autumn' && rnd(seed * 3 + i * 11 + k) < 0.2;
      clumps.push([x, j + (rnd(seed + i + k * 5) - 0.5) * 3, rad * (0.85 + rnd(seed + k + i * 3) * 0.3), dark, other ? 'abcde' : '12345']);
    }
  }
  treeClumps(G, clumps, seed);
  const leafy = (ch) => ch && '12345abcde'.includes(ch);
  G.forEach((row, j) => row.forEach((ch, c) => {
    if (!leafy(ch)) return;
    const r = rnd(seed * 13 + j * 31 + c * 7);
    const up = G[j - 1]?.[c] ?? '.';
    if (season === 'winter') {
      if (up === '.') { G[j][c] = 'x'; if (leafy(G[j + 1]?.[c]) && r < 0.7) G[j + 1][c] = 'y'; }
      else if (ch === '1' || (ch === '2' && !'12xy'.includes(up) && r < 0.5)) G[j][c] = r < 0.3 ? 'x' : 'y';
    } else if (season === 'spring' && '123'.includes(ch) && r < 0.03) {
      [[0, 0, 'p'], [1, 0, 'q'], [0, 1, 'q'], [1, 1, 'r']].forEach(([u, v, k]) => { if (leafy(G[j + v]?.[c + u])) G[j + v][c + u] = k; });
    } else if ((season === 'autumn' || ('23'.includes(ch) && season === 'summer')) && r < 0.012) G[j][c] = 'l';
  }));
}
// The whole tree, trunk and canopy, painted once into a canvas of its own: a pale silvery trunk h units tall, lit on its
// left, with dark marks in its bark under a lit lip, shaded just under the canopy, its foot flaring into roots.
function elfTreeArt(h, seed, size, season) {
  return treeArt(`elf|${h}|${seed}|${size}|${season}`, () => {
    const [rad, tall] = [7.5 * Math.sqrt(size), h + Math.round(8 * size)];
    const cw = Math.round(13 * size) * 4 + 2 * Math.ceil(rad + 2);
    const [G, mid, foot] = [treeGrid(cw, tall * 4), cw / 2, tall * 4];
    for (let y = foot - h * 4; y < foot; y += 1) {
      const f = Math.max(0, y - (foot - 8)) / 7;
      const hw = 4 + Math.round(f * f * 2.5) + (y === foot - 1);
      for (let c = mid - hw; c < mid + hw; c += 1) { const u = (c + 0.5 - mid + hw) / (2 * hw); G[y][c] = u < 0.3 ? 'A' : u < 0.55 ? 'B' : u < 0.8 ? 'C' : 'D'; }
    }
    for (let y = foot - h * 4 + 4; y < foot - 8; y += 6 + Math.floor(rnd(seed + y) * 5)) {
      const x = mid - 3 + Math.floor(rnd(seed * 3 + y) * 4);
      for (let k = 0; k < 2 + (rnd(seed + y * 7) < 0.4); k += 1) { treeSet(G, x + k, y, 'D'); treeSet(G, x + k, y - 1, x + k < mid ? 'A' : 'B'); }
    }
    elfCanopy(G, seed, size, season, mid, rad);
    // The trunk darkens a step in the canopy's shade, two just under it.
    const darker = { A: 'B', B: 'C', C: 'D', D: 'E' };
    for (let y = G.length - 1; y > 0; y -= 1) {
      for (let c = mid - 9; c < mid + 9; c += 1) {
        const near = darker[G[y][c]] ? [1, 2, 3, 4, 5, 6].findIndex((k) => '12345abcdexylpqr'.includes(G[y - k]?.[c] ?? '.')) : -1;
        if (near >= 0) G[y][c] = (near < 2 && darker[darker[G[y][c]]]) || darker[G[y][c]];
      }
    }
    treeOutline(G);
    const [main, dots] = canopyOf(season, seed);
    const other = season === 'autumn' ? AUTUMN[Math.floor(rnd(seed + 3) * 3) === 1 ? 0 : 1] : main;
    const pal = treeKeys('123456', treeRamp(main), treeKeys('abcde', treeRamp(other), treeKeys('ABCDEF', ELF_BARK, {
      p: '#ffffff', q: dots[0], r: dots[2], l: season === 'autumn' ? dots[1] : dots[0], x: '#ffffff', y: '#dfe9f2',
    })));
    return { rows: G, pal, left: -mid / 4 + 1, canopy: Math.round(96 * size) };
  });
}
// Draws one of Rivendell's trees with its trunk's left edge at x, h units of trunk under the canopy, and returns the
// canopy's top row, where birds perch. sway (-1 to 1, from the wind, scene-wind.js) bends the canopy: its top most, its
// lower quarter not at all, so the crown bends over a still trunk. Winter's trees barely move. elfTopShift is how far
// the top moves, in units, so a bird on it moves with it (scene-wild.js).
const elfTopShift = (size, season, sway) => Math.round(sway * 8 * Math.sqrt(size) * (season === 'winter' ? 0.3 : 1)) / 4;
function drawElfTree(g, x, h, seed, size = 1, season = seasonNow(), sway = 0) {
  const art = elfTreeArt(h, seed, size, season);
  const top = GROUND_Y + 6 - art.h;
  treeSway(g, art, x + art.left, top, elfTopShift(size, season, sway) * 4, art.canopy * 0.75);
  return top;
}

// A deer, eleven units from tail to nose and nine tall, facing right, in quarter units: a body of rounded shapes lit
// from the upper left, warm brown along its back shading down its flank to a cream belly, a white flag of a tail, and a
// head drawn by hand with big ears pink inside, a dark eye with a glint, a long muzzle and a black nose. Its thin legs
// stand, walk or stretch out at a run (its tail up), the far pair darker, each with a dark hoof. Grazing, its neck
// reaches down and its muzzle is in the grass. A stag (stag true) carries branched antlers of pale bone. Each pose is
// painted once, six rows above the deer's own for the antlers.
const DEER_HEAD = {
  up: ['..66..........', '.6236.........', '.62p46.66.....', '..62p46236....', '..6324p2p46...', '...6322p446...',
    '...632112336..', '..63211kg3336.', '..632223333336', '..6333333ccnn6', '...6333cccccn6', '...6334ccc666.', '...6334c6.....'],
  down: ['.66.......', '623p6.66..', '6224p6236.', '.622p2p46.', '..6322446.', '..632113336', '..63kg13336', '..6333333c6',
    '...633333c6', '...6333ccc6', '....633cc6.', '....63cnn6.', '.....6nn6..'],
};
const DEER_TAIL = ['.66..', '6tt6.', '6tT6.', '.6T6.', '..6..'];
// Each pose: its legs as [top, knee, hoof] (the far pair first), the neck's two ends, where the head's map goes and
// whether it is up, and the tail's row.
const DEER_STAND = [[13, 24, 11.5, 29.5, 12.5, 34], [30, 25, 30.5, 30, 30.5, 34], [9, 24, 7, 29.5, 8, 34], [26, 25, 26, 30, 26, 34]];
const DEER_POSE = {
  stand: { legs: DEER_STAND, neck: [29, 19, 35, 10], head: [30, 0, 'up'], tail: 12 },
  walk: { legs: [[13, 24, 13, 29.5, 15, 34], [30, 25, 28.5, 30, 27, 34], [9, 24, 6, 29.5, 5, 34], [27, 25, 29, 29.5, 30, 34]], neck: [29, 19, 35, 10], head: [30, 0, 'up'], tail: 12 },
  run: { legs: [[12, 25, 7, 28.5, 2, 31], [30, 25, 35, 29, 40, 30], [9, 24, 4, 27, 0, 29], [27, 24, 33, 27, 38, 27]], neck: [29, 19, 37, 11], head: [32, 1, 'up'], tail: 9 },
  graze: { legs: DEER_STAND, neck: [29, 19, 36, 26], head: [33, 22, 'down'], tail: 12 },
};
const DEER_PAL = { 1: '#e3ae72', 2: '#ca9056', 3: '#ab6f3d', 4: '#87522f', 5: '#643c29', 6: '#3d2419', c: '#f3e8cf', C: '#d2c09e', t: '#ffffff', T: '#d6d3cc',
  p: '#e2a69a', k: '#1d1418', g: '#ffffff', n: '#2a1d1c', L: '#b57a44', M: '#7a4a2b', P: '#8d5732', Q: '#5f3a26', h: '#2a1d18', v: '#efe2bd', x: '#a48e64', y: '#6e5b3e' };
// Copies a map's characters onto grid G with its top-left at column c, row j, through map tr if given; '.' is clear.
function treeStamp(G, rows, c, j, tr) {
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') treeSet(G, c + x, j + y, tr?.[ch] ?? ch); }));
}
function deerArt(pose, stag, mirror) {
  return treeArt(`deer|${pose}|${stag}|${mirror}`, () => {
    const P = DEER_POSE[pose] ?? DEER_POSE.stand;
    const [G, T, lift] = [treeGrid(44, 42), treeGrid(44, 42), pose === 'run' ? -1 : 0];
    const [nx0, ny0, nx1, ny1] = P.neck;
    treeLimbs(T, [[nx0, ny0 + 6 + lift, nx1, ny1 + 6, 8, 5.5]]);
    treeStamp(G, T.map((r) => r.join('')), 0, 0, { A: '1', B: '2', C: '3', D: '4', E: '5' });
    // The haunch, the barrel and the chest as one rounded body, lit along its back and shading down its flank to a
    // cream belly, the haunch and the shoulder each catching the light on their upper left.
    const B = [[20.5, 19.6, 12.5, 5, 2.2], [9.5, 19.8, 6.8, 6, 2], [28.5, 20.6, 6.2, 6, 2]];
    const inB = (c, j, [ex, ey, rx, ry, k]) => Math.abs((c + 0.5 - ex) / rx) ** k + Math.abs((j + 0.5 - ey) / ry) ** k <= 1;
    for (let c = 0; c < 44; c += 1) {
      const col = [];
      for (let j = 8; j < 30; j += 1) if (B.some((e) => inB(c, j, e))) col.push(j);
      for (const j of col) {
        const vy = ((j - col[0]) / Math.max(1, col[col.length - 1] - col[0])) * 2 - 1;
        const bump = [B[1], B[2]].some((e) => inB(c, j, e) && (c + 0.5 - e[0]) / e[2] + (j + 0.5 - e[1]) / e[3] < -0.6);
        const l = vy * 0.9 + ((c - 19) / 17) * 0.15 - (bump ? 0.35 : 0);
        treeSet(G, c, j + 6 + lift, vy > 0.7 && c > 5 && c < 33 ? 'C' : '12345'[l < -0.6 ? 0 : l < -0.15 ? 1 : l < 0.3 ? 2 : l < 0.62 ? 3 : 4]);
      }
    }
    const [hx, hy, way] = P.head;
    treeStamp(G, DEER_HEAD[way], hx, hy + 6);
    treeOutline(G);
    treeStamp(G, DEER_TAIL, 1, P.tail + 6);
    // The legs, two pixels wide, lit on the left: the far pair behind the body, the near pair over it.
    P.legs.forEach((leg, i) => {
      const [lit, dark] = i < 2 ? ['P', 'Q'] : ['L', 'M'];
      for (let s = 0; s < 2; s += 1) {
        const [ax, ay, bx, by] = leg.slice(s * 2, s * 2 + 4);
        const steep = Math.abs(by - ay) >= Math.abs(bx - ax);
        const n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2);
        for (let t = 0; t <= n; t += 1) {
          const [c, j] = [Math.floor(ax + ((bx - ax) * t) / n), Math.floor(ay + ((by - ay) * t) / n) + 6 + (s ? 0 : lift)];
          if (i < 2 && G[j]?.[c] !== '.' && G[j]?.[c] !== 'P' && G[j]?.[c] !== 'Q') continue;
          treeSet(G, c, j, lit);
          treeSet(G, steep ? c + 1 : c, steep ? j : j + 1, dark);
        }
      }
      treeStamp(G, ['hh', 'hh'], Math.floor(leg[4]), Math.floor(leg[5]) + 6);
    });
    if (stag) {
      // Two antlers rising from the crown, the far one darker behind: a beam curving up and back, two pixels thick at
      // its base, with a brow tine and two more reaching up and forward.
      const [bx, by] = way === 'up' ? [hx + 6, hy + 8] : [hx + 3, hy + 7];
      const line = (x0, y0, x1, y1, ch) => { const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))); for (let t = 0; t <= n; t += 1) treeSet(G, Math.round(x0 + ((x1 - x0) * t) / n), Math.round(y0 + ((y1 - y0) * t) / n), ch); };
      for (const [d, lit, dark] of [[-3, 'x', 'y'], [0, 'v', 'x']]) {
        const x = bx + d;
        line(x + 1, by, x, by - 3, dark);
        for (const [x0, y0, x1, y1] of [[x, by, x - 1, by - 3], [x - 1, by - 3, x - 2, by - 6], [x - 2, by - 6, x - 1, by - 9], [x, by - 1, x + 2, by - 2], [x - 1, by - 4, x + 2, by - 6], [x - 2, by - 6, x, by - 8]]) line(x0, y0, x1, y1, lit);
      }
    }
    const rows = G.map((r) => r.join(''));
    return { rows: mirror ? rows.map((r) => [...r].reverse().join('')) : rows, pal: DEER_PAL };
  });
}
function drawDeer(g, x, y, face, pose, stag) { const art = deerArt(pose, Boolean(stag), face < 0); g.drawImage(art.cv, x, y - 9.5, art.w, art.h); }

// A small bird, three units across and two tall, in quarter units: perched (wings folded, frame 1 a little hop) or
// flying (wings up, then down), its back and wings in its colour lit on top, a paler breast, a dark eye and a yellow
// beak. Each is painted once in each colour.
const BIRD = {
  perch: ['.......666..', '......6HHH6.', '......6CCkbb', '66..66CCCcB.', '6S66SHCCccc6', '.6SSSSCcccc6', '..666SScc66.', '.....6f6f...'],
  up: ['.6......6...', '.6H6...6H6..', '..6H6.6H6...', '...6HHCCC6..', '6666SCCCkbb.', '.6SSSCcccB..', '...666666...', '............'],
  down: ['............', '............', '.......666..', '6666..6CCkbb', '.6SS66CCccB.', '..66SHHcc6..', '....6HH666..', '.....66.....'],
};
function drawBird(g, x, y, flying, frame, color) {
  const which = flying ? (frame ? 'up' : 'down') : 'perch';
  const art = treeArt(`bird|${which}|${color}`, () => ({ rows: BIRD[which], pal: { 6: hdMix(color, HD_DARK, 0.55), H: hdMix(color, HD_LIGHT, 0.3), C: color,
    S: hdMix(color, '#1a2448', 0.35), c: hdMix(color, '#f6dfbc', 0.6), k: '#140d12', b: '#f0b840', B: '#b07820', f: '#5a4030' } }));
  g.drawImage(art.cv, x, flying ? (frame ? y - 1 : y) : y - 1 - frame, art.w, art.h);
}
