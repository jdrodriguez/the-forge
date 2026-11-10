// scene2-body-wizard.js: the five wizards on the map from above, 29 units tall under a pointed hat of about 6, each in
// his colours by name (sprites.js's WIZARDS through qdFigurePal): a long robe to the feet with wide sleeves, a long
// white beard to the belt, bushy brows, a staff held upright beside him. Gandalf the Grey has a tall pointed blue hat
// with a wide brim, a silver scarf and black boots; Saruman's white shimmers with many colours as he moves (Fellowship
// II.2), with black strands in his beard and a heavy black staff; Radagast is earthen brown with a lit rim against the
// woods and birds on his hat and shoulder; Alatar and Pallando are sea-blue.

// The map's frames are cached by palette, and Alatar and Pallando share theirs, so the map asks for a wizard's palette
// through m2PalOf (scene2-folk.js), which hands out a copy tagged with his name (P.who) under a key of its own. v1's
// qdFigurePal is left as it is.
const m2bTagged = new Map();
const m2PalOf = (kind, name) => {
  const P = qdFigurePal(kind, name);
  if (kind !== 'wizard') return P;
  const who = Object.keys(WIZARDS).find((k) => String(name).toLowerCase().includes(k));
  if (!who) return P;
  const key = `${P.key}|${who}`;
  if (!m2bTagged.has(key)) m2bTagged.set(key, { ...P, key, who });
  return m2bTagged.get(key);
};
// Which wizard a palette belongs to: its tag, else by its robe's base colour.
const m2bWizardOf = (P) => P.who ?? Object.keys(WIZARDS).find((k) => WIZARDS[k].cloth[0] === P['3']) ?? 'gandalf';
// The shimmer's colours and a small bird's (a blue tit and a robin).
const M2B_WIZ_MATS = { ACIJKL: ['#2c2a30', '#18161c'], MNPQRS: ['#cfd6e0', '#8c96a6'], '!': '#f7d2e8', '@': '#cdeef6', $: '#f6edbd', '%': '#dccff8',
  '~': '#ffe25a', '^': '#ffffff', ')': '#4a3020',
  αβγδεζ: ['#aeb4be', '#6c7484'], '[]{}:;': ['#3f7fe0', '#24408a'], '=?&_|-': ['#ee5a2c', '#a8341a'], 'Zfhl,`': ['#8a6038', '#5a3c22'] };
// A small bird perched, facing dir (1 right, -1 left): a blue tit (blue back and cap, white cheek, yellow breast) or a
// robin (brown back, red breast), each a body, a head, a beak, a tail and legs.
function m2bBirdAt(G, r, c, kind, dir) {
  const tit = kind === 'tit';
  const back = tit ? '[]{}:;' : 'Zfhl,`';
  m2bLimb(G, r, c - dir * 3, r - 2.5, c - dir * 7.5, 1.4, back, {}, 0.8);
  m2bBall(G, r, c, 3.4, 4.4, back);
  m2bBall(G, r + 1, c + dir * 1.5, 2.2, 2.6, tit ? 'Gyy~~~' : '=?&_|-', { open: 'tlr' });
  m2bBall(G, r - 3.5, c + dir * 3, 2.8, 2.8, tit ? '[]{}:;' : back, { bias: 0.15 });
  if (tit) m2bAt(G, r - 3, Math.round(c + dir * 3) - 1, '^^');
  m2bAt(G, r - 4, Math.round(c + dir * 4), 'k');
  m2bAt(G, r - 3, Math.round(c + dir * 6), dir > 0 ? 'Gy' : 'yG');
  m2bAt(G, r + 3, Math.round(c) - 1, ')..)');
}
// Each wizard's staff: Saruman's heavy black staff, Alatar's dark staff with a silver head, Pallando's wooden staff
// topped with a blue stone.
const M2B_WIZ_STAFF = { saruman: 'blackstaff', alatar: 'silverstaff', pallando: 'bluestaff' };
const M2B_WIZARD = {
  w: 28, h: 41, fx: 14, fy: 40, H: 116, hat: 24, neck: 43, waist: 70, hip: 80, shW: 15.5, waW: 12.5, hipW: 14,
  legW: 3.5, legGap: 5, footW: 4.4, footH: 4, face: { cy: 25, rx: 14, ry: 15, eye: 0, gap: 6 }, headFwd: 2,
  arm: { len: 29, rad: 4.6, at: 3, hand: 2.8, taper: -0.6 },
  robe: { end: 114, hem: 19, front: 13, back: 12 },
  R: { body: M2B.cloth, sleeve: M2B.cloth, legs: M2B.cloth, boot: 'ACIJKL', robe: M2B.cloth },
  mats: M2B_WIZ_MATS, depthF: 10, depthB: 9, mouth: 32, neckW: 4,
  rimOf: (P) => (m2bWizardOf(P) === 'radagast' ? { O: '4', o: 'd', 6: '9' } : null),
  carry: (P) => M2B_WIZ_STAFF[m2bWizardOf(P)] ?? 'staff',
  toolOf: (P, tool) => (tool === 'staff' || tool === 'quill' ? M2B_WIZ_STAFF[m2bWizardOf(P)] ?? 'staff' : tool),
  robeTex: m2bFolds([], 0.3),
  head(G, K) {
    const who = m2bWizardOf(K.P);
    const f = m2bHead(G, K, { ears: 'round', hair: { out: 2, lift: -1, fringe: 9, side: 16, fall: 22, fallW: 16, k: 2 }, face: { brow: 'd', old: true, mouth: false } });
    if (K.stage === 'back') return;
    // Alatar's beard keeps a darker, iron-grey tinge.
    const dark = who === 'alatar';
    const beard = { len: K.side ? 30 : 42, w: f.rx + 1, from: 3, point: 1.1, lip: 4, moustache: dark ? 'βγδδδγγδδδγβ' : 'cdeeeddeeedc', tex: m2bStrands(2, 0.3), ramp: dark ? 'αβγδεζ' : undefined };
    if (K.facing !== 'up') m2bBeard(G, f, beard);
    // Saruman's beard keeps black strands about the lips.
    if (who === 'saruman' && K.facing === 'down') for (let r = f.eye + 6; r < f.eye + 16; r += 1) m2bAt(G, r, Math.round(f.cx) + ((r * 3) % 7) - 3, 'a');
    m2bHat(G, K, f);
  },
  torso(G, K) {
    const who = m2bWizardOf(K.P);
    if (K.facing !== 'up') m2bBelt(G, K, K.waist - 1, 12.5, 'MNPQRS', ['.MM.', 'MPQM', '.MM.']);
    // Gandalf's silver scarf about the neck, its ends hanging down the chest.
    if (who === 'gandalf' && !K.side) {
      m2bRows(G, K.neck - 2, K.neck + 3, () => [Math.round(K.cx - 11), Math.round(K.cx + 10)], 'MNPQRS', { ny: -0.5 });
      if (K.facing === 'down') m2bPoly(G, [[K.neck + 2, K.cx + 3], [K.neck + 2, K.cx + 9], [K.waist + 4, K.cx + 10], [K.waist + 5, K.cx + 5]], 'MNPQRS', {});
    }
  },
  over(G, K) {
    const who = m2bWizardOf(K.P);
    if (who === 'saruman') m2bShimmer(G, K);
    if (who === 'pallando') m2bTrim(G, K);
    if (who === 'radagast') {
      const f = m2bHeadAt(K);
      const sh = K.neck + 1;
      if (K.facing === 'down') { m2bBirdAt(G, sh - 3, K.cx - 13, 'robin', -1); m2bBirdAt(G, f.eye - 10, f.cx + 14, 'tit', 1); }
      else if (K.side) { m2bBirdAt(G, sh - 3, K.cx - 2, 'tit', 1); m2bBirdAt(G, f.eye - 10, f.cx - 12, 'robin', -1); }
      else m2bBirdAt(G, sh - 3, K.cx + 10, 'tit', 1);
    }
  },
};
// A pointed hat with a wide brim over the brows, in the helm's colours (Gandalf's blue, or the robe's own): the brim a
// flattened ring across the forehead, the cone rising from it to a tip bent back a little and swaying with the stride.
function m2bHat(G, K, f) {
  const H = M2B.helm;
  const brim = f.eye - 7;
  const sway = K.step === 0 ? -1 : K.step === 1 ? 1 : 0;
  const lean = K.side ? -5 : 0;
  const tip = [brim - 27, f.cx + 3 + lean + sway];
  m2bPoly(G, [[brim, f.cx - f.rx + 1], [brim, f.cx + f.rx - 1], [brim - 12, f.cx + 6 + lean / 2], tip, [brim - 14, f.cx - 4 + lean / 2]], H, { ny: -0.1 });
  const back = K.facing === 'up' ? 0 : 0.15;
  m2bBall(G, brim + 1, f.cx, 3.2, f.rx + 7, H, { bias: back });
  // A band round the cone above the brim, darker.
  m2bRows(G, brim - 3, brim - 1, (r) => [Math.round(f.cx - f.rx + 2), Math.round(f.cx + f.rx - 2)], H, { bias: -0.35 });
}
// Pallando's pale-gold trim: a line round his hat's brim and along his robe's hem, on the robe's own pixels only.
function m2bTrim(G, K) {
  const f = m2bHeadAt(K);
  const cells = G.cells;
  const gold = (r, a, b) => { for (let c = Math.max(0, a); c <= Math.min(cells[0].length - 1, b); c += 1) if ('67890#'.includes(cells[r]?.[c] ?? '.') && cells[r][c] !== '6') cells[r][c] = c < (a + b) / 2 ? 'Y' : 'y'; };
  if (K.facing !== 'up') gold(Math.round(f.eye - 6), Math.round(f.cx - f.rx - 8), Math.round(f.cx + f.rx + 8));
  // The hat's band above the brim in gold too.
  for (let r = Math.round(f.eye - 10); r <= Math.round(f.eye - 8); r += 1) gold(r, Math.round(f.cx - f.rx + 2), Math.round(f.cx + f.rx - 2));
  const hem = K.seated ? K.foot - 3 : K.top + K.S.robe.end - 3;
  for (let r = hem - 1; r <= hem; r += 1) for (let c = 0; c < cells[0].length; c += 1) if ('2345'.includes(cells[r][c])) cells[r][c] = r === hem ? 'g' : 'Y';
}
// Saruman's white robe: flecks of every colour that move as he does, over its lit and middle steps.
function m2bShimmer(G, K) {
  const tints = '!@$%';
  const k = Math.round((K.frame ?? 0) * 2) + (K.pose === 'walk' ? 0 : 1);
  const cells = G.cells;
  for (let r = K.neck; r < cells.length; r += 1) for (let c = 0; c < cells[r].length; c += 1) {
    const ch = cells[r][c];
    if ((ch === '4' || ch === '3' || ch === '5') && (r * 3 + c * 5 + k * 7) % 7 === 0) cells[r][c] = tints[(r + c + k) % 4];
  }
}
m2bPeople('wizard', M2B_WIZARD);
