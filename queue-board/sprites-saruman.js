// sprites-saruman.js: Saruman and his palantír for the Middle-earth view (scene-saruman.js), drawn whole here at 32-bit,
// a quarter unit to the pixel, from pixel maps in code. He is as the books give him: white hair and beard with strands of
// black still about his lips and ears, a long face with deep dark eyes and a black staff (The Two Towers, III.10), and
// white robes that shimmer and change hue as he moves (Fellowship, II.2): the robe's tones are painted through a hue that
// sweeps across the cloth in a slow diagonal band. He stands about 16 units tall with his feet on (x, y). The poses are
// the gaze (leaning over the stone, both hands held over it, his head bowed into it), the same with his head lifted
// and with it turned to look out of the scene, and a four-step walk with the staff in his near hand. While he gazes the
// staff leans against his back. The stone is a ball of dark glass on a dark stone pedestal, lit from within by the
// engines' colours, with swirls inside it. Each frame is painted once into a small canvas at SC_RES and copied.

// The figure's canvas: 13 by 18 units, his feet on its bottom row, his body's middle 5 units from its left edge.
const SAR_W = 52;
const SAR_H = 72;
const SAR_MID = 20;
const SAR_PAL = {
  // hair and beard, white: outline, deep, shade, base, light, shine; and the black strands
  o: '#55566c', a: '#a2a4b8', b: '#c6c8d6', c: '#e2e3eb', d: '#f2f2f6', e: '#ffffff', K: '#17151d', k: '#3c3846',
  // old pale skin: outline, deep, shade, base, light
  p: '#5c3a36', q: '#9c7064', r: '#c4978a', s: '#e2bcab', t: '#f3d8c8',
  // deep dark eyes: the socket's shadow, the iris, a glint; the lip
  x: '#4a3038', i: '#120c16', w: '#cfc6cc', v: '#7c4a46',
  // the black staff: outline, body, sheen
  S: '#07060b', Z: '#25222f', z: '#4c4860',
  // shoes
  D: '#231e2a', E: '#463e4e',
};
const sarFill = (s, n) => (s + '.'.repeat(n)).slice(0, n);
// A map from rows of [column, run] pieces, w pixels wide.
const sarSegs = (w, rows) => rows.map((segs) => {
  const row = Array(w).fill('.');
  for (const [c, s] of segs) [...s].forEach((ch, k) => { if (ch !== '.') row[c + k] = ch; });
  return row.join('');
});

// The head in profile, facing right, looking level: hair swept back and falling behind, a bushy brow over a deep eye,
// a long nose, the moustache with a black strand at the lip, a black strand by the ear, and the beard's top.
const SAR_HEAD_SIDE = sarSegs(24, [
  [[8, 'oooooo']],
  [[6, 'oodeeeddoo']],
  [[5, 'odeeddeeddco']],
  [[4, 'odeedceedcdcbo']],
  [[3, 'odedcedddcdcdcbo']],
  [[2, 'odedcedccdcedccbbo']],
  [[1, 'odedcedccdcedcbba'], [18, 'ttsp']],
  [[1, 'oedcedccdcedcbba'], [17, 'tttssp']],
  [[1, 'odcedccdcedccba'], [16, 'qttsssp']],
  [[1, 'oecdccdcedccbb'], [15, 'Kqddddddo']],
  [[1, 'oddcdcccbK'], [11, 'psrqrsxxxssp']],
  [[1, 'odcdccbcbK'], [11, 'prrqrsxixtssp']],
  [[1, 'oddcdccbbK'], [11, 'pqrqrssrsttsp']],
  [[1, 'oedcdcccba'], [11, 'ppqrsssrsttsp']],
  [[1, 'odcdcccbba'], [11, 'Kkqrssrqrrqp']],
  [[1, 'oddcdccbba'], [11, 'KkqrsscddKp']],
  [[1, 'odcdccbcba'], [11, 'oqrcdeeddkdo']],
  [[1, 'oedcdccbba'], [11, 'ocdeedddcdco']],
  [[0, 'oddcdcccbba'], [11, 'ocddeddcccbo']],
  [[0, 'odcdccbcbba'], [11, 'ocdeddccbcbo']],
  [[0, 'oddcdccbcba'], [11, 'ocddecdcbbo']],
  [[0, 'oedcdccbcbo'], [11, '.ocdddccbbo']],
  [[1, 'odcdcccbo'], [11, '.ocddcdcbo']],
  [[1, 'oddcdcbo'], [11, '..ocdcbbo']],
]);
// The same head bowed over the stone, the eyes cast down toward it.
const SAR_HEAD_DOWN = SAR_HEAD_SIDE.map((row, r) => (r === 11 ? row.slice(0, 17) + 'xxit' + row.slice(21) : row));

// The head turned to look out of the scene: a long face between falling white hair, white brows over deep dark eyes, a
// long nose, the moustache with black strands at its corners and black at the ears.
const SAR_HEAD_FRONT = [
  '.......oooooooo',
  '.....oodeeeddddoo',
  '....odeeedddddccco',
  '...odeedddccccccbbo',
  '...oddddcccccccbbbo',
  '..oddddcatttsacbbbbo',
  '..oddcatttttsssacbbbo',
  '..odccpttttsssssrqbbbo',
  '..odcKpddddtsddddqKbbo',
  '..obcKpxxisstsxixrqKbbo',
  '..obcKqrssssttssrrqKbbo',
  '..obcKqrsssstssssrqKbbo',
  '..obbkqrssssttsssrqkbbo',
  '..obbaqrrssrrrrssrqabbo',
  '..obbaaqKddddddddKqabbo',
  '..obbaaKdeeeddeeedKaabo',
  '..obbaaodeeedddeeddoabo',
  '..obbaoccdddddddddcoabo',
  '..obaaoccddeeeeddccoaao',
  '..oaaooccdddddddddcooaao',
  '...oao.occddddddcco.oao',
  '...oo..occddddddcco..o',
  '.......occdddddcco',
  '........occdddcco',
].map((s) => sarFill(s, 23));

// The beard's fall below the head, as wide as the chin and narrowing to a point at the belt, in locks of white with a
// shine down each, drifting forward as it falls.
function sarBeard(G, r0, c0, n, drift = 6) {
  for (let r = 0; r < n; r += 1) {
    const w = Math.max(3, 11 - Math.floor(r / 2.2));
    const left = c0 + Math.floor((11 - w) / 2) + Math.floor(r / drift);
    const lock = (k) => (k + (r >> 3)) % 3;
    G.put(r0 + r, left, 'o' + [...Array(w - 2)].map((_, k) => (lock(k) === 0 ? (k < w * 0.6 ? 'e' : 'd') : lock(k) === 1 ? (k < w * 0.5 ? 'd' : 'c') : k < w * 0.5 ? 'c' : 'b')).join('') + 'o');
  }
}

// The robe from the shoulders to the hem, as tones 1 to 5 (deep to shine) and O its outline, the upper body leaning
// lean pixels forward: lit down its back and shaded down its front, the shoulders sloping, with folds down the skirt and
// a cord girdle at the waist.
function sarRobe(G, top, lean, hemLift = 0) {
  const waist = 44 - hemLift;
  const hem = 68 - hemLift;
  for (let r = top; r <= hem; r += 1) {
    const sh = r < waist ? Math.round((lean * (waist - r)) / (waist - top)) : 0;
    const spread = r > waist ? Math.round(((r - waist) * 5) / (hem - waist)) : 0;
    const round = [5, 3, 2, 1, 1][r - top] ?? 0;
    const L = 10 + sh - spread + round;
    const R = 30 + sh + spread - Math.min(round, 3);
    let row = '';
    for (let c = L; c <= R; c += 1) {
      const k = c - L;
      const fromR = R - c;
      const m = r > waist + 2 ? (k + Math.floor((r - waist) / 8)) % 5 : -1;
      let t = k === 0 || fromR === 0 || r === hem ? 'O' : k < 2 ? '4' : k < 4 && r < waist ? '5' : fromR < 2 ? '1' : fromR < 5 ? (m === 0 ? '1' : '2') : m === 0 ? '2' : m === 1 ? '5' : k < 7 ? '4' : '3';
      if (r === hem - 1 && t !== 'O') t = '2';
      row += t;
    }
    G.put(r, L, row);
  }
  G.put(waist, 11 + Math.round(lean / 3), '2'.repeat(19));
  G.put(waist - 1, 11 + Math.round(lean / 3), '4'.repeat(19));
  G.all(waist, 24, ['O4O', '.3.', '.3.', '.2.', '.O.']);
}

// The gaze, with the head's left edge at column hc: the far arm reaching past the beard to a hand over the far side of
// the stone (sarFarArm, drawn before the beard), and the near arm's wide sleeve from the shoulder down to the elbow and
// up to a hand held palm down over the stone, its fingers spread (sarNearArm).
function sarFarArm(G) {
  G.all(26, 33, ['OOOOO', 'O22222OO', '.O1222222OO', '..OO1222222O', '....OO11111O']);
  G.all(25, 44, ['.ppp', 'pqrrp', 'pqrrrqp', '.pq.q.qp', '..p.p..p']);
}
function sarNearArm(G) {
  G.all(25, 22, ['..OOOO', '.O4443O', 'O444332O', 'O4443322O', 'O44433322O', '.O4443332O', '..O4443332OOOO', '...O44433334443O',
    '....O444333344432O', '.....O44333333332O', '......OO433322222O', '........OOOOOOOO']);
  G.all(28, 40, ['.ppp', 'ptssp', 'pstsssp', '.psrssrqp', '.p.pp.p.p']);
}

// The walk: the near arm in its wide sleeve, down from the shoulder and forward at the elbow to the hand round the staff,
// which he carries planted ahead of him.
const SAR_ARM_WALK = ['..OOOO', '.O4443O', 'O444332O', 'O444332O', 'O444332O', 'O4443322O', 'O44433322O', '.O444333322OOO',
  '..O44433333222OOO', '...O444333333322222OO', '....OO4443333333322222O', '......OOO44433333222222O', '.........OOOOO4443322O',
  '..............OOOOOOO'];
function sarArmWalk(G, hand) {
  G.all(25, 16, SAR_ARM_WALK);
  G.all(35, hand - 2, ['.ppp.', 'pstsp', 'psssp', '.ppp.']);
}

// The black staff along a line from its foot (r0, c0) to its head (r1, c1), with a knob at its head.
function sarStaff(G, r0, c0, r1, c1) {
  qdWalk(r1, c1, r0, c0, (r, c) => G.put(r, c - 1, 'SZS'));
  G.all(r1 - 3, c1 - 2, ['.SS.', 'SzZS', 'SZZS', '.SS.']);
}
// Where the staff's line crosses row r.
const sarAlong = (r0, c0, r1, c1, r) => Math.round(c0 + ((c1 - c0) * (r - r0)) / (r1 - r0));

const SAR_FEET = { gaze: ['....DEEED.DEEEEED', '...DDDDDDDDDDDDDD'], stride: ['DEEED......DEEEEED', 'DDDDD......DDDDDDD'], pass: ['......DEEEEED', '.....DDDDDDDD'] };

// One frame's map: pose 'gaze' with head 'down', 'level' or 'front', or 'walk' with step 0, 0.5, 1 or 1.5.
const sarRows = new Map();
function sarFrame(pose, k) {
  const key = `${pose}${k}`;
  if (sarRows.has(key)) return sarRows.get(key);
  const G = qdGrid(SAR_W, SAR_H);
  const gaze = pose === 'gaze';
  const bob = !gaze && (k === 0.5 || k === 1.5) ? 1 : 0;
  const lean = gaze ? 3 : 0;
  const front = gaze && k === 'front';
  const down = gaze && k === 'down' ? 2 : 0;
  const hc = gaze ? 11 + lean + (down ? 1 : 0) : 9;
  if (gaze) sarStaff(G, 71, 3, 2, 10);
  sarRobe(G, 22 - bob, lean, bob);
  // The hair falls down his back to the shoulder blades, in locks, ending in wisps.
  for (let r = 0; r < 12; r += 1) G.put(24 + r + down - bob, hc + (front ? 2 : 1) + Math.floor(r / 6), r < 10 ? (r % 4 < 2 ? 'oedcdcbcba' : 'odecdcbcba') : r === 10 ? '.odedcbo' : '..o.o.o');
  if (gaze) sarFarArm(G);
  G.all(1 + down - bob, hc - (front ? 1 : 0), front ? SAR_HEAD_FRONT : down ? SAR_HEAD_DOWN : SAR_HEAD_SIDE);
  sarBeard(G, 24 + down - bob, hc + (front ? 5 : 11), gaze ? 18 : 16, front ? 99 : 6);
  if (gaze) {
    sarNearArm(G);
    G.all(70, 12, SAR_FEET.gaze);
  } else {
    const sw = k === 0 ? 2 : k === 1 ? -2 : 0;
    G.all(70, 10, k === 0 || k === 1 ? SAR_FEET.stride : SAR_FEET.pass);
    sarStaff(G, 71, 40 + sw, 4 - bob, 37);
    sarArmWalk(G, sarAlong(71, 40 + sw, 4 - bob, 37, 36));
  }
  const rows = G.rows();
  sarRows.set(key, rows);
  return rows;
}

// The robe's colour for a tone at a pixel: white, its shades taking a hue that sweeps in a diagonal band across the cloth
// as phase (0 to 11) turns, so it shimmers and changes hue.
function sarRobeColour(t, c, r, phase) {
  const L = { O: 0.36, 1: 0.66, 2: 0.79, 3: 0.89, 4: 0.95, 5: 0.99 }[t];
  const S = { O: 0.22, 1: 0.3, 2: 0.26, 3: 0.12, 4: 0.08, 5: 0 }[t];
  const h = (phase * 30 + (c + r * 0.7) * 3.5) % 360;
  return hdHex(h, S, L);
}

// The cached frames, each at SC_RES pixels a unit.
const sarCans = new Map();
function sarCanvas(pose, k, phase) {
  const key = `${pose}${k}:${phase}`;
  let cv = sarCans.get(key);
  if (cv) return cv;
  const rows = sarFrame(pose, k);
  cv = document.createElement('canvas');
  cv.width = (SAR_W / 4) * SC_RES;
  cv.height = (SAR_H / 4) * SC_RES;
  const g = cv.getContext('2d');
  g.scale(SC_RES / 4, SC_RES / 4);
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c += 1) {
      const ch = row[c];
      const col = SAR_PAL[ch] ?? ('O12345'.includes(ch) ? sarRobeColour(ch, c, r, phase) : null);
      if (col) { g.fillStyle = col; g.fillRect(c, r, 1, 1); }
    }
  });
  if (sarCans.size > 160) sarCans.delete(sarCans.keys().next().value);
  sarCans.set(key, cv);
  return cv;
}

// Draws Saruman with his feet on (x, y) in a pose ('gaze' with head 'down', 'level' or 'front'; 'walk' with step 0,
// 0.5, 1 or 1.5), the robe's shimmer at phase (0 to 11), facing right or (face < 0) left.
function drawSaruman(g, x, y, pose, k, phase, face = 1) {
  const cv = sarCanvas(pose, k, phase);
  if (face < 0) {
    g.save();
    g.translate(2 * x, 0);
    g.scale(-1, 1);
  }
  g.drawImage(cv, x - SAR_MID / 4, y - SAR_H / 4, SAR_W / 4, SAR_H / 4);
  if (face < 0) g.restore();
}
