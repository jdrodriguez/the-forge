// scene-gollum-tag.js: what goes with each Gollum in the Middle-earth view (scene-gollum.js): the Ring, a fish from
// the falls' pool and his hoard of trinkets, in 32-bit; after the night shade, his shining eyes and their glint from
// his hiding place; the wisps of his muttering; and the clicks on him or his hoard, which open his machine in the
// Gollum view (#gollum/<host>). The file is named for the HTML tag he wore over his head until 2026-11-09, when it was
// dropped for taking too much room; the Gollum view shows what he found now. Loaded after
// scene-gollum.js. Uses sprites-hd.js's qdMap, scenery-land.js's qdOval, scenery-props.js's heapGlint, scene.js's sc,
// scCanvas and scHit, scene-call.js's callEnvoyAt, and page.html's applyView.

// The Ring: plain gold, lit on its upper left, with a white glint that flashes when glint is set.
const GOL_RING = ['.ab.', 'a..c', 'b..d', '.cd.'];
const GOL_GOLD = { a: '#fff6c0', b: '#f6cf5a', c: '#d9a53a', d: '#a7742a' };
function drawGolRing(g, x, y, glint) {
  qdMap(g, GOL_RING, GOL_GOLD, Math.round(x * 4) / 4 - 0.5, Math.round(y * 4) / 4 - 0.5);
  if (!glint) return;
  pxBox(g, x - 0.75, y - 1, 0.25, 0.75, '#ffffff');
  pxBox(g, x - 1, y - 0.75, 0.75, 0.25, '#ffffff');
}
// A silver fish, its tail flicking up or down by frame, facing right (or left with face -1), ringed in dark blue so it
// shows against the water.
const GOL_FISH = [['....ab..', '.abbbbbc', 'abkbbcc.', '.cddc...'], ['........', '.abbbb.c', 'abkbbbcc', '.cddcc..']];
const GOL_FISH_PAL = { a: '#f4fbff', b: '#b8cfe0', c: '#7d97ae', d: '#566e86', k: '#16202c' };
const GOL_FISH_RIM = Object.fromEntries('abcdk'.split('').map((k) => [k, '#1c2a3c']));
function drawGolFish(g, x, y, frame, face = 1) {
  const rows = GOL_FISH[frame % 2].map((r) => (face < 0 ? [...r].reverse().join('') : r));
  const [fx, fy] = [Math.round(x * 4) / 4 - 1, Math.round(y * 4) / 4 - 0.5];
  for (const [dx, dy] of [[-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25]]) qdMap(g, rows, GOL_FISH_RIM, fx + dx, fy + dy);
  qdMap(g, rows, GOL_FISH_PAL, fx, fy);
}

// His hoard: a low mound of earth he scraped together, and on it up to nine small things he found, heaped from the
// middle out: gold coins, a red and a green gem, a silver cup, an old key, a bright button, a spoon and a fish's bones.
// Each heap is painted once by its size; one thing catches the light now and then (glint, its number, or -1).
const GOL_TRINKET = {
  coin: [['.ab.', 'abbc', '.cd.'], { a: '#fff4b0', b: '#f2c14e', c: '#c99a2e', d: '#8a6418' }],
  ruby: [['.a.', 'abc', '.c.'], { a: '#ffb3a6', b: '#e0453a', c: '#8e1e1a' }],
  emerald: [['.a.', 'abc', '.c.'], { a: '#c4ffd8', b: '#3fbf73', c: '#1d6b3c' }],
  cup: [['abbc', '.bc.', '.bc.', 'abcd'], { a: '#ffffff', b: '#c9d2dc', c: '#8a96a6', d: '#5a6474' }],
  key: [['ab...', 'bcccc', 'ab.c.'], { a: '#e9d38a', b: '#b8964a', c: '#7a6230' }],
  button: [['ab', 'bc'], { a: '#ffe8f0', b: '#d8749a', c: '#8e3a5c' }],
  spoon: [['.ab', 'bbc', 'c..'], { a: '#ffffff', b: '#b9c3cf', c: '#6f7a88' }],
  bones: [['a.a.a', 'bbbbb', 'a.a.a'], { a: '#e9e4d2', b: '#b9b29c' }],
};
const GOL_HEAP = [['coin', 0, 0], ['ruby', 0.75, -0.25], ['cup', -1, -0.5], ['coin', 1.5, 0.25], ['key', -2, 0.25], ['button', 2.25, -0.25],
  ['emerald', -0.25, -0.75], ['spoon', 2.75, 0.25], ['bones', -3, 0]];
const GOL_HEAPS = new Map();
function drawGolHoard(g, x, y, n, glint = -1) {
  const k = Math.max(1, Math.min(9, n));
  if (!GOL_HEAPS.has(k)) {
    const cv = Object.assign(document.createElement('canvas'), { width: 10 * SC_RES, height: 4 * SC_RES });
    const c = cv.getContext('2d');
    c.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
    const w = 1.5 + k * 0.32;
    qdOval(c, 5, 3.25, w + 0.25, 0.85, '#241b14');
    qdOval(c, 5, 3.25, w, 0.6, '#4e3e2c');
    qdOval(c, 4.75, 3, w - 0.75, 0.35, '#6e583e');
    GOL_HEAP.slice(0, k).forEach(([kind, dx, dy]) => {
      const [rows, pal] = GOL_TRINKET[kind];
      qdMap(c, rows, pal, Math.round((5 + dx - rows[0].length / 8) * 4) / 4, Math.round((3.25 + dy - rows.length / 4) * 4) / 4);
    });
    GOL_HEAPS.set(k, cv);
  }
  const q = (v) => Math.round(v * 4) / 4;
  g.drawImage(GOL_HEAPS.get(k), q(x) - 5, q(y) - 3.75, 10, 4);
  if (glint >= 0 && glint < k) heapGlint(g, q(x + GOL_HEAP[glint][1]), q(y - 0.5 + GOL_HEAP[glint][2] - 0.5));
}

// After the night shade, for every Gollum: his eyes, which shine at night and in Erebor's dark doorway; now and then,
// at night or in that doorway, the glint of them from his hiding place while his machine has something for him to
// keep; and the Ring's glint lighting his hands at night.
function golLight(g) {
  const night = golNight();
  const shine = (pts, a) => {
    for (const [ex, ey] of pts) {
      g.globalAlpha = a * 0.3;
      pxBox(g, golQ(ex) - 0.5, golQ(ey) - 0.25, 1, 0.5, '#d8ffc0');
      g.globalAlpha = a;
      pxBox(g, golQ(ex) - 0.25, golQ(ey) - 0.25, 0.5, 0.25, '#f2ffe6');
    }
    g.globalAlpha = 1;
  };
  for (const gol of gols.values()) {
    if (!gol.realm) continue;
    const H = golPlace(gol.realm);
    const look = gol.look;
    const dark = H.dark && look && (gol.mode === 'peek' || H.behind?.(look[3], look[4]));
    if (look && (night > 0.3 || dark)) shine(golEyes(look[0], look[1], look[2]).map(([dx, dy]) => [look[3] + dx, look[4] + dy]), dark ? 0.85 : 0.75 * night);
    const k = (sc.tick + gol.seed * 3) % 150;
    if (!look && gol.job && gol.mode === 'hidden' && (night > 0.5 || H.dark) && k < 14 && k !== 6 && !scReduced.matches) {
      const [px, py, pose] = H.dark ? [H.hide[0], H.hide[1], 'crouch'] : [H.peek[0], H.peek[1], 'peek'];
      shine(golEyes(pose, 0, 1).map(([dx, dy]) => [px + dx, py + dy]), H.dark ? 0.8 : 0.7 * night);
    }
    if (look?.[0] === 'clutch' && night > 0.3 && (sc.tick + gol.seed) % 36 < 4) sc.glow?.add(look[3], look[4] - 3.4, 2.5, '#ffd65a', 0.5 * night);
  }
}

// Muttering: now and then while a Gollum rocks, a little wisp drifts up from his mouth and fades.
function golAir(g) {
  for (const gol of gols.values()) {
    const look = gol.look;
    if (look?.[0] === 'rock' && look[1] % 2 && (sc.tick + gol.seed) % 24 === 0 && gol.mutter.length < 3) gol.mutter.push({ x: look[3] + 0.5, y: look[4] - 5.25, t: 0 });
    gol.mutter = gol.mutter.filter((m) => (m.t += 1) < 14);
    for (const m of gol.mutter) {
      g.globalAlpha = 0.8 * (1 - m.t / 14);
      const [x, y] = [golQ(m.x + m.t * 0.06), golQ(m.y - m.t * 0.12)];
      pxBox(g, x, y, 0.25, 0.25, '#e6eedb');
      pxBox(g, x + 0.25, y - 0.25, 0.25, 0.25, '#e6eedb');
      pxBox(g, x + 0.5, y, 0.25, 0.25, '#e6eedb');
    }
  }
  g.globalAlpha = 1;
}

// Which Gollum a pointer event falls on, by him or his hoard, as his machine's host (or null): only one whose machine
// has something for him, since a click opens what he found. The hoard's box is its mound and the heap on it.
function golAt(e) {
  const box = scCanvas.getBoundingClientRect();
  const x = ((e.clientX - box.left) / box.width) * sc.W;
  const y = ((e.clientY - box.top) / box.height) * sc.H - sc.dy;
  for (const gol of gols.values()) {
    const [look, at] = [gol.look, gol.hoard];
    if (!gol.job) continue;
    if (look && Math.abs(x - look[3]) <= 4.5 && y >= look[4] - (look[0] === 'peek' ? 6 : 9) && y <= look[4] + 2.5) return gol.host;
    if (at && Math.abs(x - at[0]) <= 4 && y >= at[1] - 2.5 && y <= at[1] + 1.75) return gol.host;
  }
  return null;
}
// Opens his machine in the Gollum view.
function golOpen(host) {
  history.pushState(null, '', '#gollum/' + encodeURIComponent(host));
  applyView(true);
}
scCanvas.addEventListener('click', (e) => {
  if (scHit(e) || (typeof callEnvoyAt === 'function' && callEnvoyAt(e))) return;
  const host = golAt(e);
  if (host) golOpen(host);
});
scCanvas.addEventListener('mousemove', (e) => { if (golAt(e)) scCanvas.style.cursor = 'pointer'; });

if (typeof golItems === 'function') {
  sc.layers.air.push(golAir);
  sc.layers.light.push(golLight);
}
