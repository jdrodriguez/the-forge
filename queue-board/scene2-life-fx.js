// scene2-life-fx.js: the small things that fly off the people of the map from above (scene2.js) as they go about
// their lives: wood chips off Beorn's axe, sparks off an anvil, soil off a hoe, drops from a bucket, seed scattered for
// birds, steam off a kettle, smoke rings rising from a pipe and drifting with the wind, the Zzz of a sleeper, the notes
// of a harp or a song, and green sparkles from a healer's hands. Each is a particle in world units, moved and drawn in
// quarter-unit pixels over everything (m2.layers.air), so the night's shade still darkens it. Glyphs (a ring, a z, a
// note) are drawn once into small canvases. Nothing moves with reduced motion. Other motion files call m2mPuff,
// m2mRing, m2mZ and m2mNote.

const m2mFx = [];
const M2M_FX_MAX = 360;
const m2mGlyphs = new Map();

// A glyph from rows of characters ('#' the colour, '+' its shade), one quarter unit a pixel, in colour c.
function m2mGlyph(key, rows, c, shade) {
  const k = `${key}|${c}`;
  if (m2mGlyphs.has(k)) return m2mGlyphs.get(k);
  const { c: cv, g } = m2Canvas(rows[0].length / 4, rows.length / 4);
  m2Raster(g, 0, 0, rows[0].length, rows.length, (px, py) => (rows[py][px] === '#' ? c : rows[py][px] === '+' ? shade : null));
  const out = { c: cv, w: rows[0].length / 4, h: rows.length / 4 };
  m2mGlyphs.set(k, out);
  return out;
}
// The glyphs: a z in three sizes, an eighth note and a pair of beamed notes, and smoke rings in four sizes (an outline
// lit on its upper left, with the ring's far side fainter).
// A z of n pixels with a dark shadow one pixel down and right, so it reads on grass and on snow.
function m2mZRows(n) {
  const on = (x, y) => x >= 0 && y >= 0 && x < n && y < n && (y === 0 || y === n - 1 || x === n - 1 - y);
  return Array.from({ length: n + 1 }, (_, y) => Array.from({ length: n + 1 }, (_, x) => (on(x, y) ? '#' : on(x - 1, y - 1) ? '+' : '.')).join(''));
}
const M2M_Z = [5, 7, 9].map(m2mZRows);
const M2M_NOTE = [
  ['..##', '..#+', '..#.', '..#.', '###.', '##+.'],
  ['.#####', '.#+..#', '.#...#', '.#...#', '##..##', '#+..#+'],
];
const M2M_RING = [
  ['.##.', '#..+', '#..+', '.++.'],
  ['..###.', '.#...+', '#....+', '.#..+.', '..++..'],
  ['..####..', '.#....+.', '#......+', '.#....+.', '..++++..'],
  ['...####...', '.##....++.', '#........+', '#........+', '.++....++.', '...++++...'],
];

// Adds a particle; o: { x, y, vx, vy, life, c, kind ('dot', 'chip', 'spark', 'puff', 'ring', 'z', 'note', 'glint'),
// fall (gravity), size (units), floor (the row it lands on, then lies there fading), sway, wind }.
function m2mAdd(o) {
  if (m2mFx.length >= M2M_FX_MAX) m2mFx.shift();
  m2mFx.push({ vx: 0, vy: 0, fall: 0, size: 0.25, kind: 'dot', ...o, max: o.life, age: 0 });
}
// A spray of n bits from (x, y): up is how hard they fly up, spread how far sideways, colours taken in turn.
function m2mPuff(x, y, colours, n, { up = 0.6, spread = 0.6, life = 8, fall = 0.06, size = 0.25, kind = 'dot', floor = null, dir = 0 } = {}) {
  for (let i = 0; i < n; i += 1) {
    const l = life * (0.7 + Math.random() * 0.6);
    m2mAdd({ x, y, vx: (Math.random() - 0.5) * spread + dir * 0.25, vy: -Math.random() * up, life: l, c: colours[i % colours.length], fall, size, kind, floor });
  }
}
// A smoke ring leaving a pipe at (x, y): it rises, widens through its four sizes and fades, drifting with the wind.
const m2mRing = (x, y) => m2mAdd({ x, y, vx: 0.04, vy: -0.16, life: 34, kind: 'ring', c: '#e8e6ee', wind: 1 });
// A small grey wisp of pipe smoke between rings.
const m2mWisp = (x, y) => m2mAdd({ x, y, vx: 0.02, vy: -0.12, life: 16, kind: 'puff', c: '#cfcdd8', size: 0.5, wind: 1 });
// A sleeper's z, rising and growing from above its head.
const m2mZ = (x, y) => m2mAdd({ x, y, vx: 0.07, vy: -0.11, life: 36, kind: 'z', c: '#f4f2ff', sway: 0.25 });
// A note of music, gold or pale blue, floating up.
const m2mNote = (x, y, dir = 1) => m2mAdd({ x, y, vx: 0.08 * dir, vy: -0.14, life: 28, kind: 'note', c: Math.random() < 0.5 ? '#ffe9a0' : '#d8ecff', sway: 0.3 });
// Sparkles that hang and twinkle, for healing, gold and gems.
const m2mGlint = (x, y, c) => m2mAdd({ x: x + (Math.random() - 0.5) * 3, y: y + (Math.random() - 0.5) * 2, vy: -0.05, life: 12, kind: 'glint', c });

// Moves every particle one tick: gravity, the wind on smoke, a gentle sway on glyphs, and bits that land on their
// floor lie there until they fade.
function m2mFxStep(tick) {
  for (let i = m2mFx.length - 1; i >= 0; i -= 1) {
    const p = m2mFx[i];
    p.age += 1;
    if (p.age >= p.max) { m2mFx.splice(i, 1); continue; }
    if (p.landed) continue;
    p.vy += p.fall;
    if (p.wind) p.vx = p.vx * 0.9 + (0.04 + (m2.wind?.at?.(p.x, p.y, tick) ?? 0) * 0.12) * 0.1;
    p.x += p.vx + (p.sway ? Math.sin((p.age + i) * 0.35) * p.sway * 0.15 : 0);
    p.y += p.vy;
    if (p.floor != null && p.y >= p.floor && p.vy > 0) { p.y = p.floor; p.landed = true; }
  }
}
// Draws every particle: dots and chips as squares, sparks white at birth cooling to their colour, puffs as soft
// squares that grow, rings and glyphs from their canvases, all fading over the last third of their life.
function m2mFxDraw(g) {
  for (const p of m2mFx) {
    const k = p.age / p.max;
    g.globalAlpha = k < 0.66 ? 1 : (1 - k) * 3;
    const x = Math.round(p.x * 4) / 4;
    const y = Math.round(p.y * 4) / 4;
    if (p.kind === 'ring' || p.kind === 'z' || p.kind === 'note') {
      const set = p.kind === 'ring' ? M2M_RING : p.kind === 'z' ? M2M_Z : M2M_NOTE;
      const n = p.kind === 'note' ? (p.max % 2) : Math.min(set.length - 1, Math.floor(k * set.length * 1.1));
      const gl = m2mGlyph(`${p.kind}${n}`, set[n], p.c, p.kind === 'ring' ? '#9a98a8' : p.kind === 'z' ? '#3a3458' : '#a07c30');
      if (p.kind === 'ring') g.globalAlpha *= 0.85;
      g.drawImage(gl.c, x - gl.w / 2, y - gl.h / 2, gl.w, gl.h);
    } else if (p.kind === 'puff') {
      const s = 0.5 + Math.floor(k * 3) * 0.25;
      g.globalAlpha *= 0.55;
      g.fillStyle = p.c;
      g.fillRect(x - s / 2, y - s / 2, s, s);
    } else if (p.kind === 'glint') {
      const on = p.age % 4 < 2;
      g.fillStyle = on ? '#ffffff' : p.c;
      g.fillRect(x, y - 0.25, 0.25, 0.75);
      g.fillRect(x - 0.25, y, 0.75, 0.25);
    } else {
      g.fillStyle = p.kind === 'spark' && p.age < 2 ? '#fffbe8' : p.c;
      g.fillRect(x, y, p.size, p.kind === 'chip' ? p.size * 0.5 + 0.25 : p.size);
    }
  }
  g.globalAlpha = 1;
}
m2.layers.air.push(m2mSafe((g, tick, reduced) => {
  if (reduced) { m2mFx.length = 0; return; }
  m2mFxStep(tick);
  m2mFxDraw(g);
}, 'fx'));
