// sprites-gear.js: what the Middle-earth view's workers hold: each people's tool or weapon raised, in between and
// striking (drawTool), an orc's torch (drawTorch) and an arrow (drawArrow), with the helpers that compose 32-bit art
// in code (gearGrid and its kin), which sprites-gear-stations.js, sprites-work.js and sprites-chores.js use too.
// sprites.js's drawFigure calls drawTool. Moved out of sprites.js on 2026-11-07 so the figures and their gear can be
// drawn by different hands, and redrawn at 32-bit the same day: one character per quarter-unit pixel (sprites-hd.js's
// qdMap), each piece composed once on first use and kept. Loaded right after sprites.js, so nothing here calls
// sprites-hd.js until it draws.

// The 32-bit colours of the tools and the torch, each material a ramp from its outline to its shine whose hue runs warm
// in the light and cool in the shade: wood 0 to 5, steel N n m M L *, gold J j q Q +, leather K k l o, an orc's iron X R
// r i I and its rust x z, a wizard's stone V U u B b, fire A f E e h, a feather P p s S with its shaft t and ink &.
const GEAR_PX = {
  0: '#2a1614', 1: '#4e2c1c', 2: '#74462a', 3: '#9c6538', 4: '#c48a52', 5: '#e6b77c',
  N: '#23243a', n: '#4b5266', m: '#77839a', M: '#a9b5c4', L: '#d6dfe8', '*': '#ffffff',
  J: '#5e3a12', j: '#a8742a', q: '#e2b043', Q: '#fbdd86', '+': '#fffbe8',
  K: '#2a160c', k: '#553218', l: '#7e5230', o: '#a87a4c',
  X: '#1e1b24', R: '#3f3c48', r: '#615e69', i: '#86838a', I: '#aaa69f', x: '#7a3a20', z: '#b0602e',
  V: '#16285e', U: '#2c5fb5', u: '#5aa0e6', B: '#a9e2ff', b: '#effaff',
  A: '#8a2418', f: '#e0452c', E: '#ff8a2a', e: '#ffd35a', h: '#fff6d2',
  P: '#ffffff', p: '#e3e9f0', s: '#a6b4c6', S: '#6e7d94', t: '#d9cba6', '&': '#231a2c',
};
// The wizard's stone burns like fire while the staff is raised, flashes white as it comes down, and is blue at rest.
const GEAR_STONE = [{ ...GEAR_PX, V: GEAR_PX.A, U: GEAR_PX.f, u: GEAR_PX.E, B: GEAR_PX.e, b: GEAR_PX.h },
  { ...GEAR_PX, V: '#3a3f86', U: '#8a9ae6', u: '#cfd8ff', B: '#fff3d0', b: '#ffffff' }, GEAR_PX];

// The swing's smear, drawn in two passes, the inner line brighter.
const GEAR_SMEAR = [{ '~': '#fff4d6' }, { '^': '#fff4d6' }];

// Walks the cells of a line from (r0, c0) to (r1, c1), calling fn for each.
function gearWalk(r0, c0, r1, c1, fn) {
  const [dr, dc, sr, sc] = [Math.abs(r1 - r0), Math.abs(c1 - c0), r0 < r1 ? 1 : -1, c0 < c1 ? 1 : -1];
  let err = dc - dr;
  for (;;) {
    fn(r0, c0);
    if (r0 === r1 && c0 === c1) return;
    const e2 = 2 * err;
    if (e2 > -dr) { err -= dr; c0 += sc; }
    if (e2 < dc) { err += dc; r0 += sr; }
  }
}
// Quarter-unit pixels to compose art in, at rows and columns counted from the hand's unit (its top-left is row 0,
// column 0). put writes a string at (row, column) skipping '.', so later parts cover earlier ones; rod lays a ramp
// across a line (across the columns where it runs steep, down the rows where it runs flat, its first character on the
// lit side); arc traces a curve of one character round (cx, cy) from angle a0 to a1; done gives the rows and their
// top-left in units from the hand.
function gearGrid() {
  const cells = new Map();
  const G = {
    put(r, c, s) { [...s].forEach((ch, k) => { if (ch !== '.') cells.set(`${r},${c + k}`, ch); }); return G; },
    all(r, c, rows) { rows.forEach((s, k) => G.put(r + k, c, s)); return G; },
    rod(r0, c0, r1, c1, ramp) {
      const steep = Math.abs(r1 - r0) >= Math.abs(c1 - c0);
      gearWalk(r0, c0, r1, c1, (r, c) => (steep ? G.put(r, c, ramp) : [...ramp].forEach((ch, k) => G.put(r + k, c, ch))));
      return G;
    },
    arc(cx, cy, rad, a0, a1, ch) {
      for (let a = a0; a <= a1; a += 0.02) G.put(Math.round(cy + rad * Math.sin(a)), Math.round(cx + rad * Math.cos(a)), ch);
      return G;
    },
    // Another grid's cells turned clockwise by ang round the hand's unit's top-left corner (the point a raised tool
    // swings round), each pixel taking the one it came from, then moved dc columns along.
    turn(src, ang, dc = 0) {
      const [ca, sa] = [Math.cos(ang), Math.sin(ang)];
      const at = [...src.cells.keys()].map((k) => k.split(',').map(Number));
      const reach = Math.ceil(Math.max(...at.map(([r, c]) => Math.hypot(r + 1, c + 1)))) + 1;
      for (let r = -reach; r <= reach; r += 1) {
        for (let c = -reach; c <= reach; c += 1) {
          const [x, y] = [c + 0.5, r + 0.5];
          const ch = src.cells.get(`${Math.floor(y * ca - x * sa)},${Math.floor(x * ca + y * sa)}`);
          if (ch) G.put(r, c + dc, ch);
        }
      }
      return G;
    },
    cells,
    done() {
      const at = [...cells.keys()].map((k) => k.split(',').map(Number));
      const [r0, c0] = [Math.min(...at.map((p) => p[0])), Math.min(...at.map((p) => p[1]))];
      const [r1, c1] = [Math.max(...at.map((p) => p[0])), Math.max(...at.map((p) => p[1]))];
      const rows = Array.from({ length: r1 - r0 + 1 }, (_, r) => Array.from({ length: c1 - c0 + 1 }, (_, c) => cells.get(`${r + r0},${c + c0}`) ?? '.').join(''));
      return [rows, c0 / 4, r0 / 4];
    },
  };
  return G;
}

// Each picture is painted once into a canvas at 4 pixels a unit and kept, then stamped with one drawImage: on scene.js's
// canvas, smoothing off, it lands pixel for pixel however detailed it is. paint draws it with its top-left at (0, 0)
// and size gives its width and height in units, both called only the first time. A map is known by its rows and its
// palette, which are kept in constants; key names a picture whose rows are made fresh.
const gearStamps = new Map();
const gearIds = new WeakMap();
let gearIdN = 0;
const gearId = (o) => gearIds.get(o) ?? (gearIds.set(o, (gearIdN += 1)), gearIdN);
function gearPaint(g, key, size, paint, x, y) {
  let c = gearStamps.get(key);
  if (!c) {
    const [w, h] = size();
    c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w * 4));
    c.height = Math.max(1, Math.ceil(h * 4));
    const cg = c.getContext('2d');
    cg.setTransform(4, 0, 0, 4, 0, 0);
    paint(cg);
    gearStamps.set(key, c);
  }
  g.drawImage(c, x, y, c.width / 4, c.height / 4);
}
const gearMap = (g, rows, pal, x, y, key = `${gearId(rows)}/${gearId(pal)}`) =>
  gearPaint(g, key, () => [Math.max(...rows.map((r) => r.length)) / 4, rows.length / 4], (c) => qdMap(c, rows, pal, 0, 0), x, y);

// Each tool raised, in between and striking, built once on first use. The in-between leaves a pale smear (~, ^) along
// the arc its head came down, round the shoulder (6 pixels behind the hand and 4 below it), radius rad from angle a0.
const GEAR_TOOLS = {};
const gearCache = new Map();
const gearArt = (tool, k) => {
  const key = tool + k;
  if (!gearCache.has(key)) gearCache.set(key, GEAR_TOOLS[tool][k]());
  return gearCache.get(key);
};
const gearSmear = (G, rad, a0, a1) => G.arc(-6, 4, rad + 2, a0 + 0.15, a1, '^').arc(-6, 4, rad, a0, a1, '~').arc(-6, 4, rad - 2, a0 + 0.3, a1, '^');

// The working hand's tool or weapon at the hand drawFigure returns: raised (hand.up), in between (hand.mid) or striking.
// A tool with no art of its own is a quill.
function drawTool(g, tool, hand) {
  if (TOOLS[tool]) { TOOLS[tool](g, hand.x, hand.y, hand.up, hand.mid); return; }
  const t = GEAR_TOOLS[tool] ? tool : 'quill';
  const k = hand.up ? 0 : hand.mid ? 1 : 2;
  const [rows, dx, dy] = gearArt(t, k);
  if (k === 1) {
    const alpha = g.globalAlpha;
    g.globalAlpha = alpha * 0.5;
    gearMap(g, rows, GEAR_SMEAR[0], hand.x + dx, hand.y + dy);
    g.globalAlpha = alpha * 0.25;
    gearMap(g, rows, GEAR_SMEAR[1], hand.x + dx, hand.y + dy);
    g.globalAlpha = alpha;
  }
  gearMap(g, rows, t === 'staff' ? GEAR_STONE[k] : GEAR_PX, hand.x + dx, hand.y + dy);
}

// A haft down column c from row r0 to r1, lit on its left with a fleck of grain, wrapped in leather for its last
// wrap rows.
function gearHaft(G, r0, r1, c, wrap = 4) {
  for (let r = r0; r <= r1; r += 1) G.put(r, c, r1 - r < wrap ? (r % 2 ? 'olkK' : 'lkkK') : r % 5 === 2 ? '4221' : '4321');
  return G;
}
// The same haft running right from column c0 to c1 at row r, lit along its top.
function gearHaftAcross(G, r, c0, c1, wrap = 3) {
  for (let c = c0; c <= c1; c += 1) [...(c - c0 < wrap ? (c % 2 ? 'olkK' : 'lkkK') : c % 5 === 2 ? '4221' : '4321')].forEach((ch, k) => G.put(r + k, c, ch));
  return G;
}

// A dwarf's hammer: a steel head with a gold band round its socket, on a grained haft wrapped in leather at the grip.
const HAMMER = ['.NNNJJJJNNN.', 'NLLLQQQqLLMN', 'NL*LQqqjLMmN', 'NLMMQqqjMMmN', 'NLMMQqqjMmnN', 'NMMMqqjjMmnN', 'NmmmjjjjmnnN',
  '.NNNJJJJNNN.'];
const HAMMER_DOWN = ['.NNNNNN.', 'NLLLLLmN', 'NL*MMMmN', 'NLMMMMmN', 'JQQQQqjJ', 'JQqqqqjJ', 'JqqqqjjJ', 'JqjjjjjJ', 'NLMMMmnN',
  'NMMMmmnN', 'NmmmnnnN', '.NNNNNN.'];
GEAR_TOOLS.hammer = [
  () => gearHaft(gearGrid(), -10, -1, 0).all(-17, -4, HAMMER).done(),
  () => gearSmear(gearGrid(), 22, -1.5, -0.85).turn(gearHaft(gearGrid(), -10, -1, 0).all(-17, -4, HAMMER), Math.PI / 4).done(),
  () => gearHaftAcross(gearGrid(), 0, 4, 11).all(-4, 12, HAMMER_DOWN).done(),
];

// A pickaxe: a curved steel head drawn to a point at each end, its back lit, on a haft. The head is an arc of radius
// rad round (cx, cy), facing the way dir points.
function gearPickHead(G, cx, cy, dir, rad) {
  ['N', 'L', 'M', 'm', 'n', 'N'].forEach((ch, k) => {
    const span = 0.55 + k * 0.06;
    G.arc(cx, cy, rad + 2 - k, dir - span, dir + span, ch);
  });
  return G;
}
GEAR_TOOLS.pick = [
  () => gearPickHead(gearHaft(gearGrid(), -12, -1, 0), 2, 0, -Math.PI / 2, 13).done(),
  () => gearSmear(gearGrid(), 22, -1.5, -0.85).turn(gearPickHead(gearHaft(gearGrid(), -12, -1, 0), 2, 0, -Math.PI / 2, 13), Math.PI / 4).done(),
  () => gearPickHead(gearHaftAcross(gearGrid(), 0, 4, 12), 2, 2, 0, 13).done(),
];

// A hobbit's hoe: a thin haft with a flat iron blade at its end, hanging down.
const HOE_BLADE = ['1NNN..', 'NLMmN.', 'NLMmnN', 'NLMmnN', 'NLMmnN', 'NLMmnN', 'NMmmnN', 'NnnnnN', '.NNNN.'];
GEAR_TOOLS.hoe = [
  () => gearGrid().rod(0, 1, -11, 12, '432').all(-12, 12, HOE_BLADE).done(),
  () => gearHaftAcross(gearSmear(gearGrid(), 23, -0.9, -0.3), 0, 4, 17, 0).all(0, 18, HOE_BLADE).done(),
  () => gearGrid().rod(4, 4, 14, 14, '234').all(14, 15, HOE_BLADE).done(),
];

// A sword: a bright blade with a fuller down its middle, a gold crossguard set with a blue stone, and a leather grip.
const SWORD_BLADE = (n) => ['..*N', '.*LN', ...Array(n - 2).fill('*LmN')].map((s, r) => (r > 2 && r % 7 === 3 ? 'LLmN' : s));
const SWORD_GUARD = ['.JJJJJJJJJJ.', 'JQQq+UuqqqjJ', '.JJJJJJJJJJ.'];
GEAR_TOOLS.sword = [
  () => gearGrid().all(-30, 0, SWORD_BLADE(22)).all(-8, -4, SWORD_GUARD).all(-5, 1, ['ok', 'lK', 'ok', 'JJ', 'qj']).done(),
  () => {
    const S = gearGrid().all(-30, 0, SWORD_BLADE(22)).all(-8, -4, SWORD_GUARD).all(-5, 1, ['ok', 'lK', 'ok', 'JJ', 'qj']);
    return gearSmear(gearGrid(), 30, -1.45, -0.95).turn(S, Math.PI / 4).done();
  },
  () => {
    const G = gearGrid();
    ['*'.repeat(22), 'L'.repeat(22), 'mmmmmMmmmmmmMmmmmmmMmm', 'N'.repeat(22)].forEach((row, k) => G.put(k, 7, row));
    return G.all(0, 29, ['*.', 'LN', 'N.']).all(-4, 4, ['.J.', 'JQJ', 'JqJ', 'JqJ', 'J+J', 'JUJ', 'JuJ', 'JqJ', 'JjJ', 'JjJ', 'JjJ', '.J.']).done();
  },
];

// An orc's blade: broad, dull and rusted, its edge notched, on a crude grip.
const BLADE = ['......X.', '.....XIX', '....XIrX', '...XIirX', '..XIiirX', '.XIiirrX', 'XIiizrRX', 'XIizxrRX', 'XIiirR..',
  'XIiirX..', 'XIiirRX.', 'XIiiirRX', 'XIixirRX', 'XIzxirRX', 'XIiirrRX', 'XIiirR..', 'XIiirRX.', 'XIiiirRX', 'XIiiirRX',
  'XIiirrRX', 'XRRRRRRX', 'XXXXXXXX', 'KolK....', 'KlkK....', 'KolK....', 'KkkK....'];
GEAR_TOOLS.blade = [
  () => gearGrid().all(-26, 0, BLADE).done(),
  () => gearSmear(gearGrid(), 26, -1.5, -0.9).turn(gearGrid().all(-26, 0, BLADE), Math.PI / 4).done(),
  () => gearGrid().turn(gearGrid().all(-26, 0, BLADE), Math.PI / 2, 4).done(),
];

// A wizard's staff: a crystal in a gnarled crook atop a long knotted haft that runs on below the hand.
const STAFF_TOP = ['....VV......', '...VbBV.....', '..VbBBuV....', '.0VBBuuV.0..', '.3VBuuUV40..', '.23VuUV431..', '..23VV431...',
  '...2344321..', '....4321....'];
GEAR_TOOLS.staff = [0, 1, 2].map(() => () => {
  const G = gearGrid();
  for (let r = -19; r < 12; r += 1) if (r < 0 || r > 3) G.put(r, 0, r % 9 === 4 ? '5421' : r % 6 === 0 ? '4221' : '4321');
  return G.all(-28, -4, STAFF_TOP).done();
});

// A quill: a white feather, barbed grey on its shaded side, on a pale shaft with an inked nib.
function gearQuill(G, nr, nc, tr, tc) {
  const n = Math.max(Math.abs(tr - nr), Math.abs(tc - nc));
  let i = 0;
  gearWalk(nr, nc, tr, tc, (r, c) => {
    i += 1;
    G.put(r, c, i === 1 ? '&' : 't');
    if (i > n * 0.35) G.put(r, c - 1, i < n ? 'PPps' : 'Pp');
  });
  return G;
}
GEAR_TOOLS.quill = [
  () => gearQuill(gearGrid(), 1, 1, -9, 8).done(),
  () => gearQuill(gearGrid(), 2, 2, -7, 11).done(),
  () => gearQuill(gearGrid(), 1, 1, -9, 8).done(),
];

// A torch in a running orc's hand: a rag head bound with cord on a stick, and a flame of four shapes that sways and
// flickers by tick, a quarter unit taller now and then.
const TORCH_FLAME = [
  ['.....f......', '.....Ef.....', '....fEf.....', '....fEEf....', '...fEeEf..f.', '...fEeeEf...', '..fEeheEf...', '..fEehheEf..',
    '.fEeehheEEf.', '.fEehhhheEf.', 'fEeehhhheeEf', 'fEeehhhheeEf', '.fEeehheeEf.', '..fEEeeEEf..', '...ffEEff...'],
  ['......f.....', '......fE....', '.....fEf....', '..f..fEEf...', '.....fEeEf..', '....fEeeEf..', '...fEeheEf..', '..fEeehheEf.',
    '.fEeehhheEf.', '.fEehhhheEf.', 'fEeehhhheeEf', 'fEeehhhheeEf', '.fEeehheeEf.', '..fEEeeEEf..', '...ffEEff...'],
  ['............', '....f.......', '....Ef......', '...fEf...f..', '...fEEf.....', '..fEeEEf....', '..fEeeEf....', '.fEeheEEf...',
    '.fEehheEf...', '.fEehhheEff.', 'fEeehhhheEf.', 'fEeehhhheeEf', '.fEeehheeEf.', '..fEEeeEEf..', '...ffEEff...'],
  ['............', '............', '......f.....', '.....fEf....', '....fEEf....', '....fEeEf...', '...fEeeEf...', '..fEeheEEf..',
    '.fEeehheEf..', '.fEehhhheEf.', 'fEeehhhheeEf', 'fEeehhhheeEf', '.fEeehheeEf.', '..fEEeeEEf..', '...ffEEff...'],
];
const TORCH_STICK = ['..AKKKKKKA..', '.KolllllkkK.', '.KlkKKKKkkK.', '.KolllllkkK.', '.KlkKKKKkkK.', '..KKllkkKK..', '....4321....',
  '....4321....', '....4221....', '....4321....', '....4321....', '....4321....', '....5321....', '....4321....', '....4321....',
  '....4221....', '....4321....', '....4321....', '....3210....', '....0000....'];
function drawTorch(g, { x, y }, tick) {
  gearMap(g, TORCH_STICK, GEAR_PX, x, y - 4);
  gearMap(g, TORCH_FLAME[tick % 4], GEAR_PX, x, y - 7.75 - (tick % 3 === 0 ? 0.25 : 0));
}

const GEAR_ARROW = { head: ['N...', 'mM..', 'LMMN', 'mn..', 'N...'], fletch: ['ff..', '.fP.', '....', '....', '.sS.', 'ss..'],
  pal: { ...GEAR_PX, f: '#e0452c' } };
for (const k of ['head', 'fletch']) GEAR_ARROW[`${k}L`] = GEAR_ARROW[k].map((row) => [...row].reverse().join(''));
// An arrow along row y from x0 to its head at x1, pointing the way dir does: a wooden shaft lit along its top, a steel
// head and red and white fletching. scene-work.js draws one in flight the same way.
function drawArrow(g, x0, x1, y, dir = 1) {
  toolRod(g, Math.min(x0, x1), y, Math.max(x0, x1), y, [GEAR_PX[4], GEAR_PX[2]], 1);
  const A = GEAR_ARROW;
  gearMap(g, dir > 0 ? A.head : A.headL, A.pal, dir > 0 ? x1 + 0.75 : x1 - 0.75, y - 0.25);
  gearMap(g, dir > 0 ? A.fletch : A.fletchL, A.pal, dir > 0 ? x0 : x0 + 0.25, y - 0.25);
}
