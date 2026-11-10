// sprites-wanderers.js: the wise wanderers of the Middle-earth view who are no wizards, for workers outside the queue
// named after them (page.html's wandererKind picks the people by nickname): Treebeard the Ent here, Tom Bombadil and
// Beorn in sprites-wanderers-folk.js, their tools in sprites-wanderers-gear.js. All are drawn as the books tell them,
// in 32-bit with sprites-hd.js's parts like the other peoples, one character per quarter-unit pixel in their colours
// (hdPal), lit from the upper left. Treebeard is the tallest figure in the scene, about fourteen feet in the book: a
// man-like tree with a tall head of moss and bark and hardly any neck, deep brown eyes with a green light, heavy mossy
// brows, a long knobbly nose, a sweeping grey-green beard twiggy at the roots and mossy at the ends, leaves and twigs in
// his hair, a trunk of green-grey bark, long arms barked near the trunk and smooth brown beyond, long-fingered hands, and
// legs like trunks on seven-toed feet. He sleeps standing, as a tree does. Loaded after sprites-qd.js.

Object.assign(PEOPLE, {
  // pace: how many times slower than others the Ent walks ("don't be hasty"), for scene.js to slow his steps.
  ent: { h: 24, w: 10, legs: 12, tool: 'livingstaff', pace: 2, skin: ['#8d6a4a', '#5c4330'], iris: ['#7a4e2a'],
    helm: ['#5f9c3c', '#3a6a28'], hair: [['#9ba486', '#69735d']], cloth: [['#6f755b', '#4a503f']] },
});

// Draws a pose the usual way (sprites.js's drawFigure), with this people's own poses set aside for the call, so an own
// pose can build on the ordinary one.
function wanBase(g, kind, name, x, y, pose, frame, tool) {
  const hd = HD_PEOPLE[kind];
  const own = hd.poses;
  hd.poses = null;
  try { return drawFigure(g, kind, name, x, y, pose, frame, tool); } finally { hd.poses = own; }
}

// Moss and hair in clumps a row at a time across a shape from column lo to hi: each clump lit at its top left and
// shaded below, lighter on the shape's left and darker on its right.
function wanMoss(r, c, lo, hi) {
  const t = (c - lo) / Math.max(1, hi - lo);
  const k = ((c + ((r >> 1) % 2) * 2) >> 1) % 3 + (r % 2);
  const ramp = t < 0.28 ? 'eddc' : t < 0.62 ? 'dccb' : t < 0.85 ? 'cbba' : 'bbaa';
  return ramp[k];
}
// A beard in locks three pixels wide from row r0 to r1, wid(r) pixels wide about column 16, each lock lit on its left
// and the whole lighter on the beard's left, the locks ending raggedly at their own lengths, their last rows in the
// tips' two colours (tips) when given.
function wanBeard(G, r0, r1, wid, tips) {
  for (let r = r0; r < r1; r += 1) {
    const w = wid(r);
    const [lo, hi] = [16 - w / 2, 15 + w / 2];
    for (let c = lo; c <= hi; c += 1) {
      const lock = Math.floor((c - lo) / 3);
      const end = r1 - 9 + ((lock * 5) % 7);
      if (r > end) continue;
      const side = (c - lo) / (hi - lo);
      const ramp = side < 0.3 ? 'edc' : side < 0.7 ? 'dcb' : 'cba';
      let ch = c === lo || c === hi || r === end ? 'o' : ramp[((c - lo) % 3 + (lock % 2) * ((r >> 3) % 2)) % 3];
      if (tips && r > end - 3 && ch !== 'o') ch = tips[(c + r) % 2];
      G.put(r, c, ch);
    }
  }
}
// Hair in thick locks a row at a time from column lo to hi, lit on the left and shining here and there.
function wanLocks(G, r, lo, hi) {
  for (let c = lo; c <= hi; c += 1) {
    const side = (c - lo) / Math.max(1, hi - lo);
    const k = (c + (r >> 2)) % 4;
    G.put(r, c, c === lo || c === hi ? 'o' : k === 0 ? (side < 0.5 ? 'e' : 'c') : k === 3 ? 'a' : side < 0.35 ? 'd' : side < 0.7 ? 'c' : 'b');
  }
}
// A twig along a line, its lit side to the left: dark wood with a light edge.
const wanTwig = (G, r0, c0, r1, c1) => qdWalk(r0, c0, r1, c1, (r, c) => G.put(r, c, 'HE'));

// The Ent's face under its moss, 18 pixels wide: brown bark with short furrows of grain, heavy brows of moss over
// deep sockets, the eyes brown with a green light in them, and a long nose ending in a knob above the beard.
const ENT_FACE = [
  '..ttrsssssssrsrq..', '.ttrtsssssssrssrq.', 'ttrtssssssssrssqrq', 'tcdddcbstsbcdddcbq', 'odeeddcatsacddccbo',
  'qbbaaqqqtsqqqaabbq', 'rqkkkkqtssrqkkkkqq', 'rqk0jwqtssrqw0jkqq', 'sqxijxqttsrqxijxqr', 'ssqqqqsttsrrqqqqrq',
  'tssrsstttssrqsrssq', 'tsssstttsssrqssrrq', 'tsrssttsssssrqsrrq', 'sssssqqqqqqqqrsrrq',
];
const ENT_SHUT = [...ENT_FACE.slice(0, 6), 'rqqqqqqtssrqqqqqqq', 'rrppppqtssrqppppqr', 'srqqrrqttsrqrrqqrr', ...ENT_FACE.slice(9)];

// The Ent's head, 32 pixels wide: twigs with leaves rising from a crown of moss, moss hanging either side of the long
// face, and a sweeping beard, bushy and twiggy at the roots, thin and mossy at its ends, down over the trunk.
function entHead(shut) {
  const G = qdGrid(32, 56);
  wanTwig(G, 5, 8, 1, 3);
  wanTwig(G, 3, 6, 1, 8);
  wanTwig(G, 4, 16, 0, 17);
  wanTwig(G, 2, 17, 0, 14);
  wanTwig(G, 5, 23, 1, 28);
  wanTwig(G, 3, 25, 0, 24);
  // The moss: a domed crown and the locks either side of the face, down into the beard.
  const half = [4, 7, 9, 10, 11, 12, 12, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13];
  half.forEach((h, k) => {
    const r = 1 + k;
    for (let c = 16 - h; c < 16 + h; c += 1) {
      const edge = c === 16 - h || c === 15 + h || (k > 0 && Math.abs(c - 15.5) > half[k - 1] && (c + r) % 2 === 0) || (k < 2 && (c + r) % 3 === 0);
      G.put(r, c, edge ? 'o' : wanMoss(r, c, 16 - h, 15 + h));
    }
  });
  G.all(6, 7, shut ? ENT_SHUT : ENT_FACE);
  // The beard: locks of moss from the cheeks and under the nose, ending in thin mossy tips.
  wanBeard(G, 20, 56, (r) => (r < 30 ? 26 : r < 37 ? 24 : r < 43 ? 22 : r < 47 ? 18 : r < 51 ? 14 : 10), 'ec');
  for (let r = 16; r < 20; r += 1) { G.put(r, 3, 'odcb'); G.put(r, 25, 'cbao'); }
  // The moustache sweeps from under the nose round the mouth, and twigs poke from the beard's roots.
  G.all(18, 9, ['..odddccbbo..', '.oddcbaaabbbo', 'oddcbaqqqabcbo', 'odcbdcccccbbco']);
  wanTwig(G, 22, 5, 25, 3);
  wanTwig(G, 23, 25, 26, 27);
  // Leaves on the twigs and in the moss.
  G.all(0, 1, ['.#9', '#98', '987', '76.']);
  G.all(0, 8, ['#9', '98']);
  G.all(0, 18, ['9#.', '890', '.87']);
  G.all(0, 12, ['#9', '87']);
  G.all(0, 27, ['.#9.', '#990', '9887', '.77.']);
  G.all(3, 11, ['09', '87']);
  G.all(4, 21, ['9#', '78']);
  return G.rows();
}

// The Ent's trunk, 40 pixels wide: green-grey bark in furrows that wander down it, a knot or two, moss on the
// shoulders; the beard covers its middle.
function entBody(h) {
  const G = hdTorso(40, h);
  for (let r = 2; r < h; r += 1) {
    for (const c0 of [3, 7, 32, 36]) {
      const c = c0 + ((r >> 2) % 3 === 1 ? 1 : 0);
      G.put(r, c, c < 20 ? '41' : '21');
    }
  }
  // The shoulders slope down to the arms.
  [5, 3, 2, 1].forEach((k, r) => { G.put(r, 0, ' '.repeat(k) + 'O'); G.put(r, 39 - k, 'O' + ' '.repeat(k)); });
  G.all(Math.min(h - 4, 18), 4, ['.11.', '1221', '.11.']);
  G.all(Math.min(h - 4, 10), 33, ['.1.', '121', '.1.']);
  G.all(0, 3, ['..obco', '.ocdedcbo', 'ocddcdcbo', '.obcbbo']);
  G.all(0, 30, ['.obcco.', 'obcddcbo', 'oacbccbo', '.oabo.']);
  return G.rows();
}

// The Ent's legs, each a trunk of bark lit on its left with furrows, on broad feet with seven toes like roots. On a
// stride the striding leg's foot lifts and comes forward, stiffly.
function entLegs(n, step) {
  const G = qdGrid(44, n);
  for (const [at, i] of [[5, 0], [24, 1]]) {
    const lift = step === i ? 3 : 0;
    const fwd = step === i ? 1 : 0;
    const foot = n - 4 - lift;
    for (let r = 0; r < foot; r += 1) {
      const wob = (r >> 2) % 3 === 1 ? 1 : 0;
      const row = i ? 'O243223222211O' : 'O454333323221O';
      G.put(r, at + (r > foot - 6 ? fwd : 0), [...row].map((ch, k) => (k === 3 + wob || k === 9 - wob ? (k < 6 ? '2' : '1') : ch)).join(''));
    }
    G.all(foot, at - 1 + fwd, i ? ['.O223222221O.....', 'O23222222211O....', 'O3OsO3OsO2O1O1O..', '.OO.OO.OO.OO.OO..']
      : ['.O443333221O.....', 'O45433322211O....', 'O4OtO3OsO3O2O1O..', '.OO.OO.OO.OO.OO..']);
  }
  return G.rows();
}

// Treebeard's long arms: his hands hang ENT_REACH units lower than other peoples' do, on long fingers.
const ENT_REACH = 4;
// Near the trunk his arms are barked like it, and they end in long fingers.
const ENT_ARM = { L: ['OO432', 'O4432', 'O4421', 'O4532', 'O4432', 'O4321', 'O443s', 'O42ts', '.Otts', '..Ot.'],
  R: ['3221O', '3221O', '2211O', '3221O', '3211O', '2221O', 's221O', 'sr21O', 'srr1O', '.rqO.'] };
const ENT_FINGERS = { L: ['tsrq', 's.rq', 'r.r.', 'q.q.'], R: ['srqp', 'r.qp', 'r.q.', 'q.p.'] };
function entArm(g, P, hd, ax, at, left, s) {
  const hand = at + 3 + ENT_REACH;
  hdArm(g, P, hd, ax, at, hand - 1, hand, left, s);
  hdStamp(g, P, `entb${left ? 'L' : 'R'}`, () => ENT_ARM[left ? 'L' : 'R'], left ? ax - 0.25 : ax, at + 0.25);
  const dx = (left ? s : -s) / 2;
  hdStamp(g, P, `entf${left ? 'L' : 'R'}`, () => ENT_FINGERS[left ? 'L' : 'R'], ax + dx, hand - (s > 0 ? 1 : s ? 0.5 : 0) + 0.75);
}
// The Ent's own stand, walk, sleep, work, fight, cheer and ask: drawFigure's, with his long arms where they hang.
function entFigure(pose) {
  return (g, kind, name, x, y, frame, tool) => {
    const p = PEOPLE[kind];
    const hd = HD_PEOPLE[kind];
    const n = pxHash(name);
    const P = qdFigurePal(kind, name);
    const sleep = pose === 'sleep';
    const armed = pose === 'work' || pose === 'fight';
    const step = pose === 'walk' ? frame : -1;
    const drop = step % 1 ? -0.5 : 0;
    const top = y - p.h + 1 + (sleep ? 1 - hdBreath(g, n) : 0) + drop;
    const lx = x - p.w / 2;
    const bt = top + 5;
    const legTop = y - p.legs + 1 + drop;
    hdStamp(g, P, `legs${kind}${(p.legs - drop) * 4},${step}`, () => hd.legs((p.legs - drop) * 4, step), lx + hd.legsX, legTop + hd.legsY);
    hdStamp(g, P, `body${kind}${(legTop - bt) * 4}`, () => hd.body((legTop - bt) * 4), lx, bt);
    const [armL, armR] = [lx - 1, lx + p.w];
    const arm = (ax, from, to, at) => hdArm(g, P, hd, ax, from, to, at, ax < x, 0);
    let hand = { x: armR, y: bt + 3 + ENT_REACH, up: false };
    const swing = pose === 'walk' && step % 1 === 0 ? (frame ? 1 : -1) : 0;
    if (pose === 'cheer') { arm(armL, bt - 5, bt, bt - 6); arm(armR, bt - 5, bt, bt - 6); }
    else if (pose === 'ask') { arm(armL, bt - 2 + frame, bt, bt - 3 + frame); entArm(g, P, hd, armR, bt, false, 0); }
    else entArm(g, P, hd, armL, bt, true, swing);
    if (armed && frame === 0) { arm(armR, bt - 1, bt, bt - 2); hand = { x: armR, y: bt - 2, up: true }; }
    else if (armed && frame === 0.5) hand = hdMidArm(g, P, hd, armR, bt);
    else if (armed) { hdReach(g, P, hd, armR, bt + 1, 3); hand = { x: armR + 3, y: bt + 1, up: false }; }
    else if (pose !== 'cheer' && pose !== 'ask') entArm(g, P, hd, armR, bt, false, -swing);
    hdHead(g, hd, P, x - 4, top + (sleep ? 1 : 0), sleep || hdBlink(g, n), step === 0 || step === 1);
    if (armed) drawTool(g, tool ?? (pose === 'fight' ? p.weapon ?? p.tool : p.tool), hand);
    return hand;
  };
}

hdPeople('ent', {
  poses: Object.fromEntries(['stand', 'walk', 'sleep', 'work', 'fight', 'cheer', 'ask'].map((k) => [k, entFigure(k)])),
  head: entHead,
  body: entBody,
  legs: entLegs,
  legsX: -0.5,
  arm: { L: 'pttsr', R: 'srrqp', cuff: ['c', 'b', 'o'] },
  // The beard's mossy ends swing back on a stride.
  sway: [[40, 60]],
});
