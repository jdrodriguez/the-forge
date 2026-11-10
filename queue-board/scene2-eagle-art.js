// scene2-eagle-art.js: the Great Eagles of the map from above (scene2.js), painted with scene2-orc-art.js's kit. In flight
// an eagle is seen from straight above: broad wings about 76 units across, deep brown with a lighter band of coverts and
// five long fingered primaries at each tip, a fanned tail and a golden head with a pale hooked beak; three flap steps
// (wings up, level, down), turned to eight headings. Perched it faces you, about 38 units tall: a golden head that flows
// through a golden ruff into the brown body (head and body one bird, never a head floating above it), a paler barred
// breast, wings folded down its sides with their tips crossed over the tail, feathered legs and yellow talons; it may
// turn its head, or hold its wings half raised as it lands or takes off. The crag is a rough grey rock it stands on.

const M2E_EAGLE = {
  feather: ['#0e0805', '#21140b', '#382313', '#52331b', '#714a27', '#986a3a'],
  breast: ['#1e1208', '#3e2812', '#64401c', '#8a5e2a', '#b0803c', '#d4a65a'],
  gold: ['#341f06', '#684012', '#9a6a1c', '#c8962e', '#e6bc56', '#f8e29a'],
  pale: ['#4a3816', '#8a7038', '#c4a464', '#e6d096', '#f6e8c4', '#fffbec'],
  beak: ['#3a2a08', '#7a5c12', '#b48a1c', '#dcb432', '#f6d862', '#fff2b4'],
  stone: ['#1c1c22', '#34343c', '#4c4b52', '#67656a', '#858186', '#a9a5a6'],
};
const m2eEagleArt = new Map();

// One flight frame heading up: half the span, how far the wings lift (negative, forward) and a buffer to paint into,
// centred on (cx, cy).
function m2eEagleFly(b, cx, cy, step) {
  const E = M2E_EAGLE;
  const [half, lift] = [[29, -3], [37, 0], [32, 3]][step];
  const p = (x, y) => [cx + x, cy + y];
  // The tail fans out behind, its feathers' ends scalloped.
  m2eLimb(b, p(0, 6), p(0, 14.5), 2.2, 4.8, m2eDim(E.feather), { tex: (px, py, v) => v - (px % 4 === 0 ? 1 : 0) });
  for (const s of [-1, 1]) {
    const wrist = [s * half * 0.6, -1.5 + lift * 0.6];
    // The trailing secondaries, then the broad arm of the wing with its lighter coverts, then six fingered primaries.
    m2eLimb(b, p(s * 3, 4), p(wrist[0] * 0.95, wrist[1] + 4.5), 4.2, 3.4, m2eDim(E.feather), { tex: (px, py, v) => v - ((px + py * 3) % 6 === 0 ? 1 : 0) });
    for (let i = 0; i < 6; i += 1) {
      const tip = [s * (half - i * 1.1), wrist[1] - 3.4 + lift * 0.5 + i * 2.1];
      m2eLimb(b, p(wrist[0] - s * 1.5, wrist[1] + i * 0.7), p(...tip), 1.5, 0.6, i % 2 ? E.feather : m2eDim(E.feather));
    }
    m2eLimb(b, p(s * 3, -0.5), p(...wrist), 5, 3.6, E.feather);
    m2eLimb(b, p(s * 4, -2.6), p(wrist[0] * 0.9, wrist[1] - 1.8), 1.7, 1.1, E.breast, { line: false });
  }
  m2eOval(b, ...p(0, 1.5), 4.8, 9, E.feather);
  m2eOval(b, ...p(0, -4), 3.2, 3, E.pale, { line: false });
  m2eOval(b, ...p(0, -8.2), 2.8, 3.2, E.pale);
  m2eLimb(b, p(0, -10.6), p(0, -12.8), 1.05, 0.5, E.beak);
}
// A flight frame (step 0 to 2) at heading h (0 up, then clockwise in eighths): painted heading up, then turned by
// nearest pixel into a square canvas 84 units across, its centre the bird's.
function m2eEagleFlyFrame(step, h) {
  const key = `fly|${step}|${h}`;
  if (m2eEagleArt.has(key)) return m2eEagleArt.get(key);
  const S = 84;
  const src = m2eBuf(S, S);
  m2eEagleFly(src, S / 2, S / 2, step);
  const out = m2eBuf(S, S);
  const a = (h * Math.PI) / 4;
  const [co, si] = [Math.cos(a), Math.sin(a)];
  const c0 = (S * 4) / 2;
  for (let py = 0; py < out.h; py += 1) {
    for (let px = 0; px < out.w; px += 1) {
      const [x, y] = [px + 0.5 - c0, py + 0.5 - c0];
      const sx = Math.floor(co * x + si * y + c0);
      const sy = Math.floor(-si * x + co * y + c0);
      if (sx >= 0 && sy >= 0 && sx < src.w && sy < src.h) out.px[py * out.w + px] = src.px[sy * src.w + sx];
    }
  }
  const c = m2ePaint(out);
  m2eEagleArt.set(key, c);
  return c;
}

// The perched eagle, 44 by 42 units with its feet at (22, 40), standing three-quarters on and facing right (the left
// crag's eagle is drawn mirrored): pose 'perch', 'look' (its head turned back over its shoulder) or 'flare' (wings
// half raised, landing or taking off). Its pale golden-white head and nape stand out against the dark brown body, its
// strong yellow beak hooks in profile, its folded wing's long primaries cross past the tail, and yellow talons grip the
// rock.
function m2eEaglePerch(pose) {
  const key = `perch|${pose}`;
  if (m2eEagleArt.has(key)) return m2eEagleArt.get(key);
  const E = M2E_EAGLE;
  const b = m2eBuf(44, 42);
  const p = (x, y) => [22 + x, 40 - y];
  const wing = (from, to, r0, R, n, back) => {
    m2eLimb(b, p(...from), p(...to), r0, 1.4, R, { tex: (px, py, v) => v - ((py * 2 + px) % 7 === 0 ? 1 : 0) });
    for (let i = 0; i < n; i += 1) m2eLimb(b, p(to[0] + i * 0.5 * back, to[1] + i * 1.2), p(to[0] + back * (3 + i * 0.8), to[1] - 4 + i * 2.2), 0.9, 0.35, i % 2 ? R : m2eDim(R));
  };
  if (pose === 'flare') {
    wing([-1, 25], [-11, 35], 4, m2eDim(E.feather), 5, -1);
  }
  // The tail, long and dark, angled down behind the feet.
  m2eLimb(b, p(-2, 12), p(-6.5, 1.5), 2.6, 1.8, m2eDim(E.feather), { tex: (px, py, v) => v - (px % 3 === 0 ? 1 : 0) });
  m2eOval(b, ...p(0.4, 14.5), 8.2, 10.4, E.feather);
  m2eOval(b, ...p(3.4, 15.5), 4.6, 8.4, E.breast, { tex: (px, py, v) => v - (py % 4 === 0 && (px + py) % 3 ? 1 : 0) });
  // Feathered thighs, yellow legs and talons curled round the rock.
  m2eOval(b, ...p(2, 6), 3.2, 3, E.breast);
  for (const dx of [0.4, 3]) {
    m2eLimb(b, p(dx, 4), p(dx + 0.3, 1), 0.75, 0.7, E.beak);
    for (const t of [-1.3, 0, 1.3]) {
      m2eLimb(b, p(dx + 0.3, 1), p(dx + 0.3 + t, 0.1), 0.5, 0.4, E.beak);
      m2eDot(b, ...p(dx + 0.3 + t * 1.15, -0.3), '#1c1408');
    }
  }
  // The near wing folded along the side, its primaries crossing past the tail.
  if (pose === 'flare') wing([1, 24], [12, 34], 4.2, E.feather, 5, 1);
  else {
    m2eLimb(b, p(0.2, 21.5), p(-3.2, 9.5), 6.4, 3.6, E.feather, { tex: (px, py, v) => v - ((py * 2 + px) % 7 === 0 ? 1 : 0) });
    for (let i = 0; i < 4; i += 1) m2eLimb(b, p(-3.4 + i * 0.6, 9 - i * 0.4), p(-8.2 + i * 0.7, 1 - i * 0.5), 1.1, 0.35, i % 2 ? E.feather : m2eDim(E.feather));
  }
  // The pale head and nape, one with the body, and the hooked beak in profile (turned back when it looks round).
  const P = M2E_EAGLE.pale;
  const d = pose === 'look' ? -1 : 1;
  const hx = d * 2.2 + 0.6;
  // The nape tapers from the head down into the shoulders' brown, drawn first so the head's outline closes over it.
  m2eLimb(b, p(hx * 0.6, 28.5), p(0.6, 22.5), 4.4, 4.8, P, { line: false });
  m2eOval(b, ...p(0.6, 21.6), 5.4, 1.6, E.gold, { line: false, clip: (x, y) => y > 40 - 22.4 });
  m2eOval(b, ...p(hx, 29.6), 4.7, 4.1, P);
  m2eLimb(b, p(hx + d * 3.4, 29.6), p(hx + d * 6.6, 29), 1.25, 0.95, E.beak);
  m2eLimb(b, p(hx + d * 6.6, 29), p(hx + d * 7.1, 27.4), 0.85, 0.35, E.beak);
  m2eDot(b, ...p(hx + d * 7.1 - 0.125, 27.3), '#3a2a08', 1, 2);
  m2eDot(b, ...p(hx + d * 3.6 - (d < 0 ? 0.75 : 0), 28.9), '#5a4210', 4, 1);
  m2eDot(b, ...p(hx + d * 1.6 - 0.25, 31.2), '#2a1c08', 3, 1);
  m2eDot(b, ...p(hx + d * 1.6 - 0.25, 30.7), '#e8a020', 2, 2);
  m2eDot(b, ...p(hx + d * 1.6 + (d > 0 ? 0 : -0.25), 30.7), '#140c02', 1, 1);
  const c = m2ePaint(b);
  m2eEagleArt.set(key, c);
  return c;
}
// The crag an eagle lands on, 26 by 13 units with its top (where the feet stand) at (13, 4): a rough grey rock in
// lit and shaded boulders, with tufts of grass at its foot.
function m2eCrag() {
  if (m2eEagleArt.has('crag')) return m2eEagleArt.get('crag');
  const E = M2E_EAGLE;
  const b = m2eBuf(26, 13);
  m2eOval(b, 13, 9, 12.4, 3.6, m2eDim(E.stone));
  m2eOval(b, 7, 7.6, 6, 4.4, E.stone, { tex: (px, py, v) => v - ((px * 3 + py * 5) % 11 === 0 ? 1 : 0) });
  m2eOval(b, 19, 7.4, 6.2, 4.6, E.stone, { tex: (px, py, v) => v - ((px * 5 + py * 3) % 13 === 0 ? 1 : 0) });
  m2eOval(b, 13, 5.2, 7.6, 3.6, E.stone);
  for (const [x, y] of [[2.5, 11.5], [21.5, 11.8], [11, 12.2]]) {
    m2eDot(b, x, y, '#3e6a2c', 4, 1);
    m2eDot(b, x + 0.25, y - 0.25, '#5a8a3a', 1, 1);
    m2eDot(b, x + 0.75, y - 0.5, '#5a8a3a', 1, 2);
  }
  const c = m2ePaint(b);
  m2eEagleArt.set('crag', c);
  return c;
}
