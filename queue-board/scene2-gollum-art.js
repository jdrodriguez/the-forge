// scene2-gollum-art.js: the Gollums, their heaps and their lairs on the map from above (scene2.js), painted with
// scene2-orc-art.js's kit. Gollum is about 13 units tall crouched: pallid skin gone grey-green in the dark, a big round
// head with a few lank hairs, huge pale lamp-like eyes, thin limbs with big flat feet and long hands, a ragged
// loincloth. Poses: 'crouch' (facing you, hands on his knees, frames 0 and 1 rocking), 'count' (one long finger
// pointing out at his hoard, 0 and 1 tapping), 'clutch' (hands cupped at his chest round the Ring, which
// scene2-gollum.js draws glowing) and 'creep' or 'scuttle' (in profile on all fours, frames 0, 0.5, 1, 1.5). The map
// draws v1's own Gollum in his place (scene2-foes-v1.js); this one stays for a page without v1's scene. A heap is a
// mound of trinkets (coins, cups, rings, gems and keys), more of them the more of its machine's worktrees are
// forgotten. Each realm's lair (scene2-gollum-lairs.js) has a back piece of its own, a black mouth low in its face:
// Rivendell's grey boulders with moss and ferns on the ravine's lip, the Shire's earth bank under a lip of turf with
// roots hanging over the hollow, Erebor's dark granite outcrop split by a crack, and Rohan's pale chalk with dry grass
// on top.

const M2E_GOL = {
  skin: ['#141814', '#2e342c', '#4c5446', '#6e7662', '#959a82', '#c2c4a8'],
  rag: ['#120c08', '#261a10', '#3c2a1a', '#523c26', '#6a5034', '#866a48'],
  stone: ['#16161c', '#2a2a32', '#3e3d46', '#55535a', '#6e6b70', '#8e8a8c'],
};
const m2eGolArt = new Map();

// Gollum in a pose and frame, 18 by 16 units with his feet at (9, 15). Returns { c, hand } (the hand in frame units).
function m2eGollum(pose, frame) {
  const key = `${pose}|${frame}`;
  if (m2eGolArt.has(key)) return m2eGolArt.get(key);
  const S = M2E_GOL.skin;
  const b = m2eBuf(18, 16);
  const p = (x, y) => [9 + x, 15 - y];
  const out = { c: null, hand: p(0, 7) };
  if (pose === 'creep' || pose === 'scuttle') {
    // On all fours in profile, facing right: hind legs folded like a frog's, fore limbs reaching, head low and forward.
    const st = { 0: [1.4, -1], 0.5: [0.4, 0], 1: [-1, 1.4], 1.5: [0, 0.4] }[frame];
    m2eLimb(b, p(-2.2, 4), p(-3.6, 6.2), 1, 0.8, m2eDim(S));
    m2eLimb(b, p(-3.6, 6.2), p(-2 + st[1], 0.4), 0.8, 0.6, m2eDim(S));
    m2eLimb(b, p(2, 4.4), p(3.2 + st[1] * 0.8, 0.4), 0.7, 0.55, m2eDim(S));
    m2eOval(b, ...p(-0.2, 4.6), 3.6, 2.2, S, { tex: (px, py, v) => v - (px % 3 === 0 && py % 2 ? 1 : 0) });
    m2eOval(b, ...p(-2.2, 3.4), 1.6, 1.3, M2E_GOL.rag);
    m2eLimb(b, p(-1.8, 4), p(-3, 6.6), 1.1, 0.85, S);
    m2eLimb(b, p(-3, 6.6), p(-1.6 + st[0], 0.4), 0.85, 0.6, S);
    m2eOval(b, ...p(-1.2 + st[0], 0.4), 1.4, 0.6, S);
    m2eLimb(b, p(2.4, 4.6), p(3.8 + st[0] * 0.8, 0.4), 0.75, 0.55, S);
    m2eOval(b, ...p(4.2 + st[0] * 0.8, 0.4), 1.2, 0.5, S);
    m2eOval(b, ...p(4.6, 6.2), 2.8, 2.5, S);
    m2eDot(b, ...p(5.6, 7.2), '#e8f0d8', 4, 3);
    m2eDot(b, ...p(6.1, 6.7), '#18242a', 2, 2);
    m2eDot(b, ...p(5.4, 8.2), S[1], 6, 1);
    m2eDot(b, ...p(6.2, 5.4), '#1a1410', 4, 1);
    for (const dx of [2.6, 3.4]) m2eDot(b, ...p(dx, 8.4), '#1c1c18', 3, 1);
    out.hand = p(4.2 + st[0] * 0.8, 1);
  } else {
    // Crouched facing you: knees up either side of a thin chest, big feet flat.
    for (const s of [-1, 1]) {
      m2eLimb(b, p(s * 1.4, 3.4), p(s * 3.6, 6), 1.15, 0.95, S);
      m2eLimb(b, p(s * 3.6, 6), p(s * 3, 0.8), 0.95, 0.75, S);
      m2eOval(b, ...p(s * 3.4, 0.5), 1.7, 0.7, S);
    }
    m2eOval(b, ...p(0, 2.6), 2.4, 1.4, M2E_GOL.rag);
    m2eOval(b, ...p(0, 5.8), 2.5, 2.9, S, { tex: (px, py, v) => v - (py % 3 === 0 && Math.abs(px - 36) > 2 ? 1 : 0) });
    const rock = frame ? 0.25 : 0;
    // The arms, by pose: on the knees, one pointing out, or both cupped at the chest.
    for (const s of [-1, 1]) {
      const sh = p(s * 2.2, 7.4 + rock);
      if (pose === 'clutch') { m2eLimb(b, sh, p(s * 3, 5.6), 0.7, 0.6, S); m2eLimb(b, p(s * 3, 5.6), p(s * 0.7, 6.4), 0.6, 0.55, S); }
      else if (pose === 'count' && s > 0) { m2eLimb(b, sh, p(4.6, 6.6), 0.7, 0.6, S); m2eLimb(b, p(4.6, 6.6), p(7.2, 5.4 + frame * 0.6), 0.6, 0.35, S); }
      else { m2eLimb(b, sh, p(s * 3.4, 7.2), 0.7, 0.6, S); m2eLimb(b, p(s * 3.4, 7.2), p(s * 3.2, 5.6), 0.6, 0.5, S); m2eOval(b, ...p(s * 3.2, 5.4), 0.8, 0.6, S); }
    }
    if (pose === 'clutch') { m2eOval(b, ...p(0, 6.3), 1.4, 0.9, S); out.hand = p(0, 6.6); }
    if (pose === 'count') out.hand = p(7.2, 5.4);
    // The head: big and round, small pointed ears, lank hairs, huge pale eyes.
    const hy = 10.2 + rock;
    for (const s of [-1, 1]) m2eLimb(b, p(s * 2.8, hy + 0.4), p(s * 4.4, hy + 1.2), 0.6, 0.2, S);
    m2eOval(b, ...p(0, hy), 3.6, 3.1, S);
    for (const s of [-1, 1]) {
      m2eOval(b, ...p(s * 1.5, hy + 0.1), 1.25, 1.1, ['#4a5850', '#9aaaa0', '#c8d6cc', '#e0ecdf', '#f2f8ec', '#ffffff'], { flat: 0.4 });
      m2eDot(b, ...p(s * 1.5 - 0.25, hy + 0.2), '#16222a', 2, 2);
      m2eDot(b, ...p(s * 1.5 - 0.25 - s * 0.25, hy + 0.45), '#ffffff', 1, 1);
    }
    m2eDot(b, ...p(-0.75, hy - 1.5), '#1a1410', 6, 1);
    for (const [dx, dy] of [[-2.5, 2.4], [-1.75, 2.9], [1.5, 2.9], [2.25, 2.4]]) m2eDot(b, ...p(dx, hy + dy), '#1c1c18', 1, 4);
  }
  out.c = m2ePaint(b);
  m2eGolArt.set(key, out);
  return out;
}

// The hoard of n trinkets, heaped in rings from the middle out, 14 by 8 units with its middle at (7, 5).
const M2E_TRINKETS = [['#f8d860', '#a8741a'], ['#d8dce4', '#7a808c'], ['#ffe27a', '#c08a1a'], ['#e83a4a', '#7a1020'], ['#c08a3a', '#5a3a12'], ['#7ad0ff', '#1a5a8a']];
function m2eHoard(n) {
  const key = `hoard|${n}`;
  if (m2eGolArt.has(key)) return m2eGolArt.get(key);
  const { c, g } = m2Canvas(14, 8);
  const k = Math.min(n, 30);
  // The heap itself: a low mound of dull gold and dirt, bigger the more there is.
  const rx = 2 + Math.sqrt(k) * 1.1;
  m2Raster(g, 0, 0, 56, 32, (px, py) => {
    const d = ((px / 4 - 7) / rx) ** 2 + ((py / 4 - 5.4) / (rx * 0.45)) ** 2;
    if (d > 1) return null;
    return d > 0.8 ? '#3a2a10' : py / 4 < 5.4 - rx * 0.2 ? '#8a6a24' : '#5e4618';
  });
  for (let i = k - 1; i >= 0; i -= 1) {
    const a = i * 2.4;
    const r = Math.sqrt(i) * 1.15;
    const [x, y] = [7 + Math.cos(a) * r * 1.4, 5 + Math.sin(a) * r * 0.6 - (k - i) * 0.04];
    const [hi, lo] = M2E_TRINKETS[(i * 7) % M2E_TRINKETS.length];
    const q = (v) => Math.round(v * 4) / 4;
    g.fillStyle = lo;
    g.fillRect(q(x - 0.5), q(y - 0.25), 1, 0.75);
    g.fillStyle = hi;
    g.fillRect(q(x - 0.5), q(y - 0.25), 0.75, 0.5);
    g.fillStyle = '#fffbe8';
    g.fillRect(q(x - 0.5), q(y - 0.25), 0.25, 0.25);
  }
  m2eGolArt.set(key, c);
  return c;
}
// Each kind of lair: its rock's ramp, the ramp on top of it (moss, turf, dry grass) or none, its parts as ovals
// [cx, cy, rx, ry, ramp ('rock', 'dim' for the far side, 'top' clipped to the cap's height)], where its mouth is
// [cx, cy, rx, ry], and its own touches.
const M2E_LAIR_KIND = {
  elf: { rock: ['#151820', '#283040', '#3c4658', '#566074', '#748094', '#98a4b4'], top: ['#10261a', '#1e3c28', '#2c5636', '#3e7044', '#568a52', '#78a868'],
    parts: [[11, 6.6, 9.4, 5, 'dim'], [4.8, 8.4, 4.4, 3.4, 'rock'], [11.5, 5.6, 6.6, 4.4, 'rock'], [18.2, 5.4, 5.4, 3.6, 'rock'], [10, 2.6, 6, 2.2, 'top'], [18.4, 2.6, 3.8, 1.5, 'top']],
    mouth: [17, 9.6, 3.4, 3], ferns: ['#2c5636', '#568a52'] },
  hobbit: { rock: ['#1c1008', '#3a2414', '#563820', '#704c2c', '#8a6238', '#a87c4a'], top: ['#183214', '#2b5520', '#3b742a', '#4f8f37', '#66a843', '#82bf52'],
    parts: [[12, 8.2, 11.6, 3.8, 'dim'], [12, 7, 10.8, 4, 'rock'], [12, 4.4, 11.8, 3.4, 'top']],
    mouth: [17, 9.4, 3.6, 3.2], roots: true, ferns: ['#4f7a2c', '#8cae4a'] },
  dwarf: { rock: ['#0e0e12', '#202028', '#33333c', '#4a4954', '#64626c', '#86838c'], top: null,
    parts: [[12, 7, 10.4, 5, 'dim'], [7, 6.4, 6, 5.4, 'rock'], [15.6, 5.2, 6.4, 5.2, 'rock'], [11.4, 3, 4, 2.6, 'rock'], [20.4, 8.6, 3.2, 3, 'rock']],
    mouth: [16.6, 9.2, 2.6, 3.6], crack: true },
  man: { rock: ['#2a2418', '#4c4430', '#6e6448', '#908466', '#b0a686', '#d2c8a8'], top: ['#3a3010', '#5a4a1c', '#7a6628', '#9a8436', '#b8a24a', '#d2bc62'],
    parts: [[12, 7.4, 10.6, 4.4, 'dim'], [9, 6.2, 7, 4.6, 'rock'], [17, 6.4, 5.8, 4.2, 'rock'], [10.6, 2.6, 6.2, 1.8, 'top']],
    mouth: [17, 9.6, 3.4, 3], ferns: ['#7a6628', '#b8a24a'] },
};
const M2E_LAIR_DARK = ['#000000', '#020203', '#050508', '#08080c', '#0c0c12', '#12121a'];
// A lair's back piece, 24 by 12 units, its foot along the bottom edge and its mouth low at the east (x 17).
function m2eLairArt(kind) {
  const key = `lair|${kind}`;
  if (m2eGolArt.has(key)) return m2eGolArt.get(key);
  const K = M2E_LAIR_KIND[kind] ?? M2E_LAIR_KIND.man;
  const b = m2eBuf(24, 12);
  const grain = (px, py, v) => v - ((px * 5 + py * 3) % 13 === 0 ? 1 : 0) + ((px * 7 + py * 11) % 23 === 0 ? 1 : 0);
  for (const [cx, cy, rx, ry, ramp] of K.parts) {
    if (ramp === 'top') { if (K.top) m2eOval(b, cx, cy, rx, ry, K.top, { clip: (x, y) => y < cy + ry * 0.4 }); continue; }
    m2eOval(b, cx, cy, rx, ry, ramp === 'dim' ? m2eDim(K.rock) : K.rock, { tex: grain, clip: (x, y) => y < 11.9 });
  }
  const [mx, my, mrx, mry] = K.mouth;
  // The crack runs from the outcrop's top down into the mouth's west side (west of where he crouches, so he never hides
  // it), a pixel or two wide, zigzagging.
  if (K.crack) {
    for (let y = 1.8; y < my - mry + 1; y += 0.25) {
      const t = (y - 1.8) / (my - mry - 0.8);
      m2eDot(b, mx - 6 + t * 4 + Math.round(Math.sin(y * 1.7) * 2) / 4, y, '#06060a', t > 0.5 ? 2 : 1, 1);
    }
  }
  m2eOval(b, mx, my, mrx, mry, M2E_LAIR_DARK, { line: false, clip: (x, y) => y < 11.9 });
  // Roots hang from the turf over the hollow's mouth.
  if (K.roots) for (const [rx, len] of [[-2.2, 2.2], [-0.8, 1.4], [0.6, 2.6], [2, 1.6]]) for (let k = 0; k < len; k += 0.25) m2eDot(b, mx + rx + (k > 1 ? 0.25 : 0), my - mry + 0.25 + k, k < 0.5 ? '#3b742a' : '#8a6238');
  // Ferns, reeds or dry grass at its feet either side.
  if (K.ferns) for (const [fx, h] of [[1.2, 2.5], [2.2, 3.2], [22.4, 2.8], [23.2, 2]]) for (let k = 0; k < h; k += 0.25) m2eDot(b, fx + (k > h / 2 ? (fx < 12 ? -0.25 : 0.25) : 0), 11.75 - k, K.ferns[k > h * 0.6 ? 1 : 0]);
  const c = m2ePaint(b);
  m2eGolArt.set(key, c);
  return c;
}
