// sprites-captains.js: the Sentry slot's captains in the Middle-earth view, each drawn as himself at 32-bit (a quarter
// unit a pixel, in sprites-hd.js's parts and colours) where page.html's captainKind names him; Aragorn stays the Ranger
// of sprites-hd-folk.js. Faramir, Captain of Gondor leading the Rangers of Ithilien (The Two Towers, IV.4): dark hair,
// grey eyes and a grave face under a hood, clad in green and brown mottled to hide in the woods, green gauntlets, a long
// bow in his hand, a quiver of green-feathered arrows and a sword. Boromir, Captain of Gondor (Fellowship, II.2): tall,
// dark-haired and grey-eyed, richly clad in sable with a cloak lined with fur, a collar of silver set with a white stone,
// his locks cut at the shoulders, the great horn tipped with silver on a baldric, a round shield bearing the White Tree
// in silver, and a sword. Éomer, Third Marshal of the Riddermark (The Two Towers, III.2): fair hair long under a helm
// whose crest is a long white horse-tail, a shirt of bright mail, a green cloak, a tall spear and a green shield with
// the white horse; his horse Firefoot is grey. Each keeps the Ranger's height, seat and anchors, so the horse
// (sprites-horse.js) and the post still fit. drawFigure draws each pose through the people's own poses (sprites.js):
// the figure as any other, with his gear drawn behind it (the bow, the quiver, the spear, a shield slung on the back)
// and in front of it (a shield on the arm). Original art in code; no image files. Loaded after sprites-wanderers.js and
// before sprites-work.js and the horse, so their names are read only when a figure is drawn.

// Each rides his own coat (sprites-horse.js's HORSE_COATS, read when drawn, since that file loads after this one):
// Faramir a dark brown, Boromir a bay, and Éomer Firefoot, a grey with a white mane.
PEOPLE.ithilien = { h: 15, w: 6, legs: 4, tool: 'sword', iris: ['#8a96a2'], hair: [['#3a2c24', '#241a15']], cloth: [['#4f6a37', '#33482a']],
  get coat() { return HORSE_COATS[1]; } };
PEOPLE.gondor = { h: 15, w: 6, legs: 4, tool: 'sword', iris: ['#8c98a6'], hair: [['#2f2629', '#1d171a']], cloth: [['#3a3946', '#24232d']],
  get coat() { return HORSE_COATS[0]; } };
PEOPLE.rohirrim = { h: 15, w: 6, legs: 4, tool: 'spear', iris: ['#6f93b0'], hair: [['#e8cf84', '#c0a257']], cloth: [['#3f7d3c', '#2a5a2b']],
  helm: ['#a3adb9', '#5a6371'], get coat() { return HORSE_COATS[2]; } };

// Green and brown in leafy patches over the cloth's own light and shade: b a patch of brown, d one of deeper green.
const CAP_MOTTLE = ['..bbb...........', '.bbbbb.....dd...', '..bbb.....dddd..', '...b.......dd...', '.......bb.......', '......bbbb....d.',
  '.dd....bb....ddd', 'dddd..........d.', '.dd.......bbb...', '.........bbbbb..', '....d.....bbb...', '...ddd..........', '..ddddd.....bb..',
  '...ddd.....bbbb.', '..........bbbb..', '.bb..........b..'];
const CAP_PATCH = { b: { 5: 'H', 4: 'F', 3: 'F', 2: 'E', 1: 'E' }, d: { 5: '3', 4: '3', 3: '2', 2: '1', 1: '1' } };
const capMottle = (rows) => rows.map((row, r) => [...row].map((ch, c) => CAP_PATCH[CAP_MOTTLE[r % 16][c % 16]]?.[ch] ?? ch).join(''));
// A face under its brows, grave: no blush on the cheeks.
const capFace = (brow, shut) => hdBrowFace(brow, shut).map((row) => row.replace(/u/g, 's'));
// The cloak over the shoulders, from row r: four widening rows with folds, its hem a row of deep shade.
function capMantle(G, r, wide = [26, 30, 32, 32]) {
  wide.forEach((w, k) => qdSpan(G, r + k, 16, w, 'O44', '3', '2221O'));
  for (let k = 1; k < 4; k += 1) for (const c of [6, 12, 19, 25]) G.put(r + k, c, c < 16 ? '42' : '21');
  qdSpan(G, r + 4, 16, 30, 'O', '1', 'O');
}

// Faramir's hood is pushed back from his brow: dark hair parted under it with a shine, a lock either side of the face,
// and a cloak over the shoulders tied with a leather toggle, hood and cloak mottled.
function ithilienHead(shut) {
  const G = qdGrid(32, 26);
  [10, 14, 16, 18, 20, 22, 22, 24].forEach((w, r) => qdSpan(G, r, 16, w, r ? 'O445' : 'O', r ? '3' : 'O', r ? '2221O' : 'O'));
  G.put(7, 7, '1odcdddccbbbbo1');
  G.put(8, 4, 'O44odeedddcbcbbbbao21O');
  for (let r = 9; r < 20; r += 1) { G.put(r, 4, r < 17 ? 'O44dc' : 'O44oc'); G.put(r, 23, r < 17 ? 'ba21O' : 'bo21O'); }
  G.all(9, 9, capFace('sabbbssssbbbas', shut));
  capMantle(G, 20);
  G.all(19, 14, ['.D.', 'DHF', '.E.']);
  return capMottle(G.rows());
}
// A tunic under the quiver's strap from the right shoulder to the left hip, a belt with a bronze buckle.
function ithilienBody(h) {
  const G = hdTorso(24, h, [5, 18], h - 5);
  const belt = h - 8;
  for (let r = 2; r < belt; r += 1) G.put(r, 18 - Math.round(((r - 2) * 14) / (belt - 2)), 'DHFE');
  G.all(belt, 0, ['DHHHHHHHHHFGYYGFFFFFFEED', 'DFFFFFFFFFFgy+gEEEEEEEED', 'DEEEEEEEEEEGggGEEEEEEDDD']);
  return capMottle(G.rows());
}
const CAP_BOOTS = { bootL: ['DHFFFEED', 'DHHFFEED', 'DHFFFEED', 'DHFFFFEED', 'DDDDDDDDD'],
  bootR: ['DFFEEEED', 'DFFFEEED', 'DFFEEEED', 'DFFFEEEEED', 'DDDDDDDDDD'] };
const ITHILIEN_LEGS = { W: 24, at: [4, 12], L: 'DHFFFEED', R: 'DFFEEEED', lift: 3, bootX: [-1, 0], ...CAP_BOOTS };
hdPeople('ithilien', {
  head: ithilienHead,
  body: ithilienBody,
  legs: (n, step) => hdLegs(n, step, ITHILIEN_LEGS),
  arm: { L: 'DHHFE', R: 'FFEED', cuff: ['4', '2', 'O'] },
  sway: [[20, 26]],
});

// Boromir's dark hair parted with a shine and cut at the shoulders, over a sable cloak with a collar of fur, and at his
// throat a collar of silver set with a single white stone.
function gondorHead(shut) {
  const G = qdGrid(32, 26);
  capMantle(G, 21, [24, 28, 32, 32]);
  qdSpan(G, 19, 16, 24, 'E', 'HF', 'E');
  qdSpan(G, 20, 16, 26, 'EH', 'FHFE', 'FE');
  qdSpan(G, 21, 16, 26, 'E', 'EF', 'E');
  G.all(0, 5, ['......oooooooooo......', '....oocddeedccbbboo....', '...ocdeeeddcccbcbbbo...', '..ocdeeddccbcccbbbbao..',
    '..ocddddcbccbbcbbbbbao.', '.ocddcbbcbbsbbbbcbbbao.', '.ocdcbbcbssttssbbcbbao.', '.ocdcbbsstttsssssbbbao.', '.ocdcbssttssssssssbbao.']);
  for (let r = 9; r < 23; r += 1) {
    G.put(r, 5, r < 15 ? 'ocdc' : r % 3 ? 'ocdcb' : 'ocddc');
    G.put(r, 23, r < 15 ? 'bbao' : r % 3 ? 'cbbao' : 'bcbao');
  }
  G.all(23, 4, ['ocdcbo', '.o.oo.']);
  G.all(23, 23, ['obcbao', '.oo.o.']);
  G.all(9, 9, capFace('sabbbssssbbbas', shut));
  G.all(12, 6, ['.op', 'opt', 'ops', '.oq']);
  G.all(12, 23, ['po.', 'rpo', 'qpo', 'po.']);
  G.all(20, 12, ['.698896.', '..6w*6..', '...66...']);
  return G.rows();
}
// A sable surcoat edged in silver, the baldric across it studded with silver, and on it the Horn of Gondor: a great
// horn of pale bone bound and tipped with silver; a belt with a silver buckle.
const GONDOR_HORN = ['.#0.............', '.090............', '..9TB...........', '..TTWB.......6#.', '...TWWVB....6#0.', '....XWWVVBBU6#09',
  '......XVVVUU6098', '........XXXX6886', '............666.'];
function gondorBody(h) {
  const G = hdTorso(24, h, [4, 19], h - 6);
  const belt = h - 8;
  for (let r = 2; r < belt; r += 1) G.put(r, 3 + Math.round(((r - 2) * 14) / (belt - 2)), r % 4 === 1 ? 'D0#D' : 'DFED');
  G.all(Math.max(3, belt - 9), 8, GONDOR_HORN);
  G.all(belt, 0, ['DFFFFFFFFF60#06FFFFFFFEED', 'DEEEEEEEEE6#906EEEEEEEEED', 'DDDDDDDDDD69986DDDDDDDDDD'].map((s) => s.slice(0, 24)));
  for (let r = belt + 3; r < h; r += 1) { G.put(r, 0, '0'); G.put(r, 23, '8'); }
  if (h > belt + 4) G.put(h - 1, 0, '0'.repeat(10) + '9'.repeat(8) + '8'.repeat(6));
  return G.rows();
}
const GONDOR_LEGS = { W: 24, at: [4, 12], L: 'O2221111', R: '1111111O', lift: 3, bootX: [-1, 0],
  bootL: ['DFEEEEED', 'DFFEEEED', 'DFEEEEED', 'DFEEEEEED', 'DDDDDDDDD'], bootR: ['DEEEEEDD', 'DFEEEEDD', 'DEEEEEDD', 'DFEEEEEEDD', 'DDDDDDDDDD'] };
hdPeople('gondor', {
  head: gondorHead,
  body: gondorBody,
  legs: (n, step) => hdLegs(n, step, GONDOR_LEGS),
  arm: { L: '14432', R: '3221O', cuff: ['0', '8', '6'] },
  sway: [[21, 26]],
});

// Éomer's steel helm with a gold rim and cheek guards, the long white horse-tail of its crest flowing back over it and
// down; his fair hair long beneath it, and a green cloak pinned with a gold brooch.
function rohirrimHead(shut) {
  const G = qdGrid(32, 29);
  capMantle(G, 23);
  G.all(22, 14, ['.G.', 'GY+', 'gyG', '.G.']);
  for (let r = 12; r < 25; r += 1) { G.put(r, 4, r < 23 ? 'odde' : '.odd'); G.put(r, 24, r < 23 ? 'cbbo' : 'cbo.'); }
  // The tail of the crest, behind the helm: white strands from the crest's socket back over the helm and down its side.
  G.all(0, 0, ['.........XXVWWX.', '......XXVWWWVUX.', '....XVWWWVVUUX..', '...XWWVVUUX.....', '..XWVVUX........', '.XWWVUX.........',
    '.XWVUUX.........', 'XWWVUX..........']);
  for (let r = 8; r < 26; r += 1) G.put(r, r < 22 ? 0 : 1, r > 23 ? ['XVX', '.X.'][r - 24] : ['XWVUX', 'XWWUX', 'XVWUX', 'XWVVX'][r % 4]);
  // The helm, lit from the upper left with a ridge from brow to crown, over a gold rim.
  [12, 16, 20, 22, 24, 24, 26, 26].forEach((w, k) => {
    for (let c = 0; c < w; c += 1) {
      const t = c / (w - 1);
      const lit = k < 3 && t > 0.2 && t < 0.4 ? '#' : t < 0.18 ? '0' : t < 0.45 ? (c === w / 2 - 1 ? '#' : '9') : t < 0.52 ? '0' : '';
      const ch = !k || !c || c === w - 1 ? '6' : lit || (t < 0.8 ? '8' : '7');
      G.put(3 + k, 16 - w / 2 + c, ch);
    }
  });
  qdSpan(G, 11, 16, 26, '6Y', 'y', 'gG6');
  G.all(12, 5, ['60#9', '6098', '6098', '6098', '.698', '..66']);
  G.all(12, 23, ['9876', '9876', '9876', '8876', '876.', '66..']);
  G.all(12, 9, capFace('sabbbssssbbbas', shut));
  G.all(0, 14, ['.GG.', 'GYyG', 'Gyg6']);
  return G.rows();
}
// A shirt of bright mail, its rings catching the light in rows; a leather belt with a gold buckle, the mail's hem below.
const CAP_MAIL = { 5: ['#0', '0#'], 4: ['0#', '90'], 3: ['90', '89'], 2: ['98', '87'], 1: ['87', '77'], O: ['66', '66'] };
function rohirrimBody(h) {
  const G = hdTorso(24, h, [], h);
  G.cells.forEach((row, r) => row.forEach((ch, c) => { if (CAP_MAIL[ch]) row[c] = CAP_MAIL[ch][r % 2][(c + (r >> 1)) % 2]; }));
  const belt = h - 8;
  G.all(belt, 0, ['DHHHHHHHHHFGYYGFFFFFFEED', 'DFFFFFFFFFFgy+gEEEEEEEED', 'DEEEEEEEEEEGggGEEEEEEDDD']);
  return G.rows();
}
const ROHIRRIM_LEGS = { W: 24, at: [4, 12], L: 'DFFFEEED', R: 'DEEEEEED', lift: 3, bootX: [-1, 0], ...CAP_BOOTS };
hdPeople('rohirrim', {
  up: 3,
  head: rohirrimHead,
  body: rohirrimBody,
  legs: (n, step) => hdLegs(n, step, ROHIRRIM_LEGS),
  arm: { L: '60098', R: '99876', cuff: ['H', 'F', 'D'] },
  sway: [[23, 29]],
});

// The captains' gear, each piece a map made once per worker's colours (sprites-hd.js's hdStamp). A round shield 20
// pixels across lit from the upper left: its rim's light, base and shade and its outline, its field's three, and its
// device in the middle.
function capShield(rim, field, device) {
  const G = qdGrid(20, 20);
  for (let r = 0; r < 20; r += 1) for (let c = 0; c < 20; c += 1) {
    const d = Math.hypot(r - 9.5, c - 9.5);
    const lit = r + c < 15 ? 0 : r + c > 23 ? 2 : 1;
    if (d < 10) G.put(r, c, d > 9 ? rim[3] : d > 7.4 ? rim[lit] : field[lit]);
  }
  G.all(10 - (device.length >> 1), 10 - (device[0].length >> 1), device);
  return G.rows();
}
// Boromir's: sable, rimmed in silver, the White Tree in silver under three stars.
const CAP_TREE = ['..w..w..x..', '...........', '.w.w.w.x.x.', 'w.wwwwwxx.x', '.ww.www.xx.', 'w..wwwxx..x', '.ww..w..xx.', '...wwwxx...',
  '.....wx....', '.....wx....', '....wwxx...', '...w.w.x...'];
// Éomer's: green, rimmed in gold, the white horse of Rohan running.
const CAP_HORSE = ['.........ww.', '........wwww', '.......wwx.w', '......wwx...', 'ww.wwwwwx...', '.wwwwwwwx...', '..wwxxwwx...', '..w.x...wx..',
  '.w...x...x..'];
const CAP_SHIELDS = { gondor: () => capShield('0986', '321', CAP_TREE), rohirrim: () => capShield('YygG', '432', CAP_HORSE) };

// Faramir's long bow, held at its grip (the fist's unit at row 32, column 4 of the map): a stave of yew bending out from
// the grip to its nocked tips, its string straight on the outer side.
function capBowRows() {
  const G = qdGrid(9, 60);
  for (let r = 0; r < 60; r += 1) {
    const t = (r - 33.5) / (r < 34 ? 34 : 27);
    const c = 5 - Math.round(5 * t * t);
    G.put(r, c, r < 2 || r > 57 ? 'D' : r > 31 && r < 36 ? 'DFF' : 'DHE');
  }
  for (let r = 2; r < 58; r += 1) G.put(r, 0, 'V');
  return G.rows();
}
// His quiver over the right shoulder, its mouth tilted back and the green feathers of his arrows showing.
const CAP_QUIVER = ['..D.......', '.555.D....', '.545555.D.', '.434545555', '..4.434545', '..T..4.434', '..T..T..4.', '.DHHHFFFED',
  '.DHFFFFEED', '..DHFFFED.', '..DFFFEED.', '...DFFED..'];

// Éomer's spear of ash with a leaf-shaped steel head, in sprites-gear.js's colours: held at rest beside him (its grip
// at the fist's unit), raised upright, swung through and thrust straight out (drawTool, as his tool and weapon).
const CAP_SPEARHEAD = ['..L..', '.*LN.', '.*LmN', 'N*LmN', 'N*LmN', 'N*LmN', '.*LmN', '.NLN.', '..n..', '.nMn.'];
function capSpear(G, from, to, skip = true) {
  G.all(from - 10, -1, CAP_SPEARHEAD);
  for (let r = from; r <= to; r += 1) if (!skip || r < 0 || r > 3) G.put(r, 1, r === to ? '21' : r % 9 === 4 ? '31' : '41');
  return G;
}
GEAR_TOOLS.spear = [
  () => capSpear(gearGrid(), -40, 20).done(),
  () => gearSmear(gearGrid(), 34, -1.45, -0.95).turn(capSpear(gearGrid(), -40, 20), Math.PI / 4).done(),
  () => {
    const G = gearGrid();
    for (let c = -8; c <= 44; c += 1) if (c < 0 || c > 3) G.put(1, c, c % 9 === 4 ? '3' : '4').put(2, c, '1');
    return G.all(-1, 45, ['.nN.....', 'nMMLLN..', 'nMm**LLN', 'nMmmmmmN', '.nNNmmN.', '...NN...']).done();
  },
];
const CAP_REST = capSpear(gearGrid(), -46, 27, false).done();

// Which hand each pose leaves hanging, raised or on the reins (sprites.js, sprites-horse.js): the riding poses hide the
// far (left) arm, and in a pose not named the hand is busy.
const CAP_LEFT = { stand: 'hang', walk: 'hang', work: 'hang', fight: 'hang', sleep: 'hang', block: 'hang', cheer: 'up',
  reins: 'hid', slash: 'hid', hail: 'hid', brandish: 'hid' };
const CAP_RIGHT = { stand: 'hang', walk: 'hang', ask: 'hang', sleep: 'hang', cheer: 'up', reins: 'rein', hail: 'rein' };
// Where drawFigure puts this figure's body and fists in this pose, worked out as it does.
function capWhere(g, kind, name, x, y, pose, frame) {
  const p = PEOPLE[kind];
  const ex = POSES[pose];
  const step = pose === 'walk' || ex?.step ? frame : -1;
  const drop = Math.min(p.legs - 1, ex?.drop ?? 0) - (step % 1 ? 0.5 : 0);
  const top = y - p.h + 1 + (pose === 'sleep' ? 1 - hdBreath(g, pxHash(name)) : 0) + drop;
  const b = top + 5;
  const bx = x - p.w / 2 + (ex?.lean ?? 0);
  const swing = pose === 'walk' && step % 1 === 0 ? (frame ? 1 : -1) : 0;
  const lift = (s) => (s > 0 ? 1 : s ? 0.5 : 0);
  const at = (side, ax, s) => ({ hang: [ax + side * s * 0.5, b + 3 - lift(s)], up: [ax, b - 3], hid: [ax, b + 3], rein: [ax + 2, b + 2] });
  return { x, y, top, b, bx, pose, left: at(1, bx - 1, swing)[CAP_LEFT[pose]], right: at(-1, bx + p.w, -swing)[CAP_RIGHT[pose]],
    armed: pose === 'work' || pose === 'fight' || Boolean(ex?.fight) };
}
// Each captain's gear behind him (back) and in front of him (front), from where his body and fists are.
const CAP_GEAR = {
  ithilien: {
    back(g, P, a) {
      hdStamp(g, P, 'capQuiver', () => CAP_QUIVER, a.x + 2.25, a.top + 2);
      // In the pose that shoots (sprites-work.js) the bow drawn is his own.
      const [hx, hy] = a.left ?? [a.bx - 1, a.b + 3];
      if (a.pose !== 'shoot') hdStamp(g, P, 'capBow', capBowRows, hx - 1.25, Math.min(hy, a.y - 6) - 8);
    },
  },
  gondor: {
    back: (g, P, a) => capShieldAt(g, P, a, 'gondor', false),
    front: (g, P, a) => capShieldAt(g, P, a, 'gondor', true),
  },
  rohirrim: {
    back(g, P, a) {
      const [hx, hy] = a.right ?? [a.bx + 7, a.b + 3];
      // Raised in his fist it is the spear held high, as for a fight; at rest its butt is on the ground.
      if (CAP_RIGHT[a.pose] === 'up') drawTool(g, 'spear', { x: hx, y: hy, up: true });
      else if (a.right || !a.armed) {
        gearMap(g, CAP_REST[0], GEAR_PX, hx + CAP_REST[1], Math.min(hy, a.y - 6) + CAP_REST[2], 'capSpearRest');
      }
      capShieldAt(g, P, a, 'rohirrim', false);
    },
    front: (g, P, a) => capShieldAt(g, P, a, 'rohirrim', true),
  },
};
// A shield on the left forearm where that arm hangs (or is hidden behind the rider), else slung on the back.
function capShieldAt(g, P, a, kind, front) {
  const arm = Boolean(a.left) && CAP_LEFT[a.pose] !== 'up';
  if (arm !== front) return;
  const [hx, hy] = arm ? a.left : [a.bx - 0.25, a.b + 1.5];
  hdStamp(g, P, `capShield${kind}`, CAP_SHIELDS[kind], hx - 2, hy - 2.75);
}
// Every pose is drawn as any figure's (drawFigure, with this people's own poses set aside for the call), between the
// gear behind and the gear in front. Éomer fights with his spear on horseback: the cut is a thrust, as in sprites.js's
// fight, and the cheer the spear held high.
const CAP_RIDE = { slash: (f) => ['fight', f], brandish: () => ['fight', 0] };
function capDraw(hd, kind, pose, g, k, name, x, y, frame, tool) {
  const [as, f] = kind === 'rohirrim' && CAP_RIDE[pose] ? CAP_RIDE[pose](frame) : [pose, frame];
  const P = qdFigurePal(k, name);
  const a = capWhere(g, k, name, x, y, as, f);
  const gear = CAP_GEAR[kind];
  gear.back?.(g, P, a);
  const own = hd.poses;
  hd.poses = null;
  let hand;
  try { hand = drawFigure(g, k, name, x, y, as, f, tool); } finally { hd.poses = own; }
  gear.front?.(g, P, a);
  return hand;
}
// Any pose drawFigure asks for, made once per pose name.
['ithilien', 'gondor', 'rohirrim'].forEach((kind) => {
  const hd = HD_PEOPLE[kind];
  const made = new Map();
  const make = (pose) => (g, k, name, x, y, frame, tool) => capDraw(hd, kind, pose, g, k, name, x, y, frame, tool);
  hd.poses = new Proxy({}, { get: (_, pose) => (typeof pose === 'string' ? made.get(pose) ?? made.set(pose, make(pose)).get(pose) : undefined) });
});
