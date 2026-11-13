// scene2-tool.js: the tools the peoples hold on the map from above, at the bodies' new size (scene2-body-parts.js), in
// M2_TOOLS so m2DrawTool draws them: the elves' quill, the hobbit's hoe, the dwarf's and Men's hammer, the captains'
// sword, the wizards' staff and Saruman's black staff, Beorn's axe, Eomer's spear, Faramir's bow, Boromir's horn, a
// pipe and Radagast's handful of seed. Each is a pixel map pointing right from the grip, turned to the swing's angle
// (hand.ang in degrees; -90 points straight up) and cached once per angle, its grip landing on the fist at hand.x,
// hand.y. Light falls from the upper left.

const M2B_TOOLPAL = {
  a: '#2a1a10', b: '#4f3320', c: '#7a5232', d: '#a57a4c', e: '#cfa774', // wood, outline to light
  k: '#1c2230', l: '#4e5868', m: '#8a95a6', n: '#c7d0dc', o: '#f4f8ff', // steel
  f: '#5a5a66', g: '#c9c9d4', h: '#ffffff', // a quill's feather
  D: '#2a1a14', E: '#4a3024', F: '#7b5a3c', H: '#a5825c', // leather
  G: '#6b4317', y: '#e9b746', Y: '#fde08a', // gold
  K: '#0d0b10', L: '#26222c', M: '#3e3946', N: '#9aa0b4', // black wood and its silver
  T: '#efe6cc', B: '#b9a67c', V: '#7f6f52', // horn and bone
  s: '#3a2a1c', t: '#8b6a40', u: '#e6c873', // seed
  P: '#c8302a', Q: '#f06a4a', // apples
  R: '#1f5ab8', S: '#4f9cf2', U: '#d8f2ff', // a blue stone
};

// A haft along a row band: an outline over and under the wood, lit along its top, flecked with grain.
function m2bHaft(G, c0, c1, r, wood = 'abcd') {
  for (let c = c0; c <= c1; c += 1) {
    m2bAt(G, r - 1, c, wood[0]);
    m2bAt(G, r, c, c % 7 === 3 ? wood[1] : wood[3]);
    m2bAt(G, r + 1, c, c % 5 === 1 ? wood[1] : wood[2]);
    m2bAt(G, r + 2, c, wood[0]);
  }
}
// Each tool pointing right: its rows and the grip's place in them.
const M2B_TOOLART = {
  quill() {
    const G = qdGrid(26, 9);
    for (let c = 0; c < 8; c += 1) m2bAt(G, 4, c, 'f');
    m2bPut(G, 1, 6, ['....fffffff..', '..fgghhhhhgff', 'fgghhhhhhhhhgf', 'ffgggggggggggf', '..ffggggggff..', '....fffff....']);
    return { rows: G.rows(), gr: 4, gc: 1 };
  },
  hammer() {
    const G = qdGrid(30, 14);
    m2bHaft(G, 0, 22, 6);
    m2bPut(G, 0, 20, ['.kkkkkkk.', 'klnooonmk', 'klnnnnmmk', 'klmmmmmlk', 'kyYyyyyGk', 'klmmmmmlk', 'klmmmmllk', 'klmmmlllk', 'klmlllllk', 'kklllllkk', '.kkkkkkk.']);
    return { rows: G.rows(), gr: 7, gc: 2 };
  },
  hoe() {
    const G = qdGrid(40, 14);
    m2bHaft(G, 0, 34, 3);
    m2bPut(G, 0, 32, ['.kkkk..', 'knnmk..', 'knmmlk.', 'kmmllk.', 'kmllk..', 'kmllk..', 'kmlk...', 'kmlk...', 'klk....', 'kk.....']);
    return { rows: G.rows(), gr: 4, gc: 2 };
  },
  sword() {
    const G = qdGrid(36, 11);
    m2bPut(G, 3, 0, ['DFHHFFD', 'DEFFEED', 'DDDDDDD']);
    m2bPut(G, 0, 7, ['GG.', 'yG.', 'YyG', 'yyG', 'yyG', 'GyG', '.G.']);
    for (let c = 10; c < 33; c += 1) { m2bAt(G, 2, c, 'k'); m2bAt(G, 3, c, 'o'); m2bAt(G, 4, c, c % 9 ? 'n' : 'o'); m2bAt(G, 5, c, 'm'); m2bAt(G, 6, c, 'k'); }
    m2bPut(G, 2, 33, ['kk.', 'onk', 'nmk', 'mk.', 'k..']);
    m2bPut(G, 2, 0, ['.....', '.....']);
    m2bPut(G, 3, 10, ['y']);
    return { rows: G.rows(), gr: 4, gc: 3 };
  },
  staff() {
    const G = qdGrid(64, 12);
    m2bHaft(G, 0, 56, 5, 'abcd');
    for (const c of [9, 22, 41]) { m2bAt(G, 4, c, 'ce'); m2bAt(G, 6, c, 'ab'); }
    m2bPut(G, 1, 54, ['..aaaa..', '.abcdda.', 'abcddeda', 'abccdcba', 'abbccbba', '.abbbba.', '..aaaa..']);
    return { rows: G.rows(), gr: 6, gc: 28 };
  },
  silverstaff() {
    const G = qdGrid(64, 12);
    m2bHaft(G, 0, 55, 5, 'abbc');
    m2bPut(G, 0, 53, ['...kkk...', '..knnnk..', '.knooonk.', 'knooonmlk', 'knnonmmlk', 'knnnmmllk', '.knmmllk.', '..kllk...', '...kk....']);
    return { rows: G.rows(), gr: 6, gc: 28 };
  },
  bluestaff() {
    const G = qdGrid(64, 12);
    m2bHaft(G, 0, 54, 5, 'abcd');
    m2bPut(G, 1, 51, ['..aa..aa..', '.acd..dca.', '..aRRRRa..', '.aRSUURRa.', 'aRSUURRRRa', '.aRRRRRRa.', '..aRRRa...', '...aaa....']);
    return { rows: G.rows(), gr: 6, gc: 28 };
  },
  blackstaff() {
    const G = qdGrid(64, 12);
    m2bHaft(G, 0, 56, 5, 'KLMM');
    m2bPut(G, 1, 54, ['..LLL...', '.LNNNL..', 'LNhNNNL.', 'LNNNNML.', 'LMNNMML.', '.LMMML..', '..LLL...']);
    return { rows: G.rows(), gr: 6, gc: 28 };
  },
  axe() {
    const G = qdGrid(36, 22);
    m2bHaft(G, 0, 30, 10);
    m2bPut(G, 1, 22, ['....kkk....', '...knnlk...', '..knoomlk..', '.knonmmlk..', 'knonmmllk..', 'knnmmmllkk.', 'knmmmmlllkk', 'kkkkkkkkkkk', 'kmmmlllkkk.', 'knmmllk....', 'knmllk.....', '.kmlk......', '..kk.......']);
    return { rows: G.rows(), gr: 11, gc: 3 };
  },
  spear() {
    const G = qdGrid(70, 11);
    m2bHaft(G, 0, 58, 5, 'abcd');
    m2bPut(G, 2, 57, ['..kkkk.......', '.knnoonkk....', 'GkooonnnmmkK.', 'yknnnmmmlllkk', 'GkmmmlllkkK..', '.kllllkk.....', '..kkkk.......']);
    m2bPut(G, 3, 54, ['GyY', 'yYy', 'Gyg'.replace('g', 'G')]);
    return { rows: G.rows(), gr: 6, gc: 24 };
  },
  bow() {
    // Held upright at its grip: the limbs curve away and back, the string straight behind.
    const G = qdGrid(12, 60);
    for (let r = 0; r < 60; r += 1) {
      const t = (r - 30) / 30;
      const c = Math.round(7 - 6 * (1 - t * t));
      m2bAt(G, r, c, Math.abs(t) < 0.12 ? 'DFHD' : 'acdb');
      m2bAt(G, r, 9 + (r % 2), '');
      m2bAt(G, r, 10, 'g');
    }
    return { rows: G.rows(), gr: 30, gc: 3, upright: true };
  },
  horn() {
    const G = qdGrid(20, 12);
    m2bPut(G, 0, 0, ['..............VV', '............VBTV', '.........VVBTTTV', '......VVBBTTTTBV', '.yyVVBBTTTTTTBV.', 'GYyBBTTTTTTBBV..', 'GyyBTTTTBBBVV...', '.GGVVVVVVVV.....']);
    return { rows: G.rows(), gr: 5, gc: 2 };
  },
  pipe() {
    const G = qdGrid(14, 8);
    m2bPut(G, 0, 0, ['.........aaa..', '........abcda.', '........abcca.', 'aaaaaaaabccba.', 'cddddddcbbba..', 'abbbbbbbaaa...']);
    return { rows: G.rows(), gr: 4, gc: 0 };
  },
  seed() {
    // A leather pouch in the open hand, and seed falling from it in a little spray.
    const G = qdGrid(16, 22);
    m2bPut(G, 0, 3, ['.DDDD.', 'DHFFED', 'DFFEED', '.DDDD.']);
    [[6, 6], [8, 3], [9, 8], [11, 5], [13, 9], [14, 2], [16, 6], [18, 10], [19, 4], [21, 7]].forEach(([r, c], i) => m2bAt(G, r, c, i % 3 ? 'tu' : 'su'));
    return { rows: G.rows(), gr: 2, gc: 5, still: true };
  },
};
M2B_TOOLART.lily = M2B_TOOLART.seed;
// A pick: a curved iron head pointed at both ends on a haft.
M2B_TOOLART.pick = () => {
  const G = qdGrid(34, 22);
  m2bHaft(G, 0, 26, 11);
  m2bPut(G, 0, 22, ['...k....', '..knk...', '..knmk..', '..kmmk..', '.knmlk..', '.knmlk..', 'knmmllk.', 'knmmllk.', 'kkkkkkkk', 'kmmllkk.',
    '.kmllk..', '.kmllk..', '..kmlk..', '..kmlk..', '..klk...', '...kk...']);
  return { rows: G.rows(), gr: 12, gc: 3 };
};
// A wooden bucket hanging from the fist by its handle, banded in iron, with water showing.
M2B_TOOLART.bucket = () => {
  const G = qdGrid(16, 18);
  m2bPut(G, 0, 3, ['..kkkk..', '.k....k.', 'k......k']);
  m2bPut(G, 3, 0, ['abbbbbbbbbbbba', 'aHnnnnnnnmmlba', 'acddddcccbbbba', 'akkkkkkkkkkkka', 'acdddccccbbbba', 'acddcccccbbba.', '.acdcccccbbba.',
    '.akkkkkkkkkka.', '.acdcccccbba..', '..aaaaaaaaa...']);
  return { rows: G.rows(), gr: 0, gc: 7, still: true };
};
// A wicker basket hanging from the fist, with red apples in it.
M2B_TOOLART.basket = () => {
  const G = qdGrid(18, 16);
  m2bPut(G, 0, 4, ['..aaaaa...', '.a.....a..', 'a.......a.']);
  m2bPut(G, 2, 1, ['...PP..PP.....', '..PQPPPQPP.PP.', 'adcdcdcdcdcdca', 'acdcdcdcdcdcda', 'adcdcdcdcdcdca', '.acdcdcdcdcda.', '.adcdcdcdcdca.', '..aaaaaaaaaa..']);
  return { rows: G.rows(), gr: 0, gc: 8, still: true };
};

// The tool turned to an angle, as a canvas at 4 pixels a unit with the grip's place in it, cached.
const m2bToolCache = new Map();
function m2bToolAt(name, ang) {
  const key = `${name}|${ang}`;
  if (m2bToolCache.has(key)) return m2bToolCache.get(key);
  const art = M2B_TOOLART[name]();
  const a = ((art.still ? 0 : art.upright ? ang + 90 : ang) * Math.PI) / 180;
  const [cs, sn] = [Math.cos(a), Math.sin(a)];
  const pts = [];
  art.rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (!M2B_TOOLPAL[ch]) return;
    const [x, y] = [c - art.gc, r - art.gr];
    pts.push([x * cs - y * sn, x * sn + y * cs]);
  }));
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const [x0, y0] = [Math.floor(Math.min(...xs)) - 1, Math.floor(Math.min(...ys)) - 1];
  const [W, H] = [Math.ceil(Math.max(...xs)) - x0 + 2, Math.ceil(Math.max(...ys)) - y0 + 2];
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  // Each target pixel takes the source pixel it turns back to, so the turned art has no holes.
  for (let py = 0; py < H; py += 1) for (let px = 0; px < W; px += 1) {
    const [x, y] = [px + x0 + 0.5, py + y0 + 0.5];
    const [u, v] = [x * cs + y * sn + art.gc, -x * sn + y * cs + art.gr];
    const ch = art.rows[Math.floor(v)]?.[Math.floor(u)];
    if (M2B_TOOLPAL[ch]) { g.fillStyle = M2B_TOOLPAL[ch]; g.fillRect(px, py, 1, 1); }
  }
  const t = { c, x0, y0 };
  m2bToolCache.set(key, t);
  return t;
}
// Draws a tool with its grip at (x, y) units, turned to ang degrees.
function m2bTool(g, name, x, y, ang) {
  const t = m2bToolAt(name, Math.round(ang ?? 0));
  g.drawImage(t.c, Math.round(x * 4) / 4 + t.x0 / 4, Math.round(y * 4) / 4 + t.y0 / 4, t.c.width / 4, t.c.height / 4);
}
for (const name of Object.keys(M2B_TOOLART)) {
  M2_TOOLS[name] = (g, hand) => m2bTool(g, name, hand.x, hand.y, hand.ang ?? (hand.up ? -105 : hand.mid ? -35 : 35));
}
