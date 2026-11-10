// sprites-wanderers-folk.js: Tom Bombadil and Beorn, two of sprites-wanderers.js's wise wanderers, drawn as the books
// tell them in 32-bit with sprites-hd.js's parts and sprites-wanderers.js's helpers. Tom is short and stout ("too large
// and heavy for a hobbit"), red in the face as a ripe apple and creased with laughter, with bright blue eyes, a long
// brown beard, a bright blue jacket, great yellow boots and a battered hat with a tall crown and a long blue feather, and
// he skips as he walks. Beorn is a huge man with a thick black beard and black hair, great bare arms and legs, a wool
// tunic to his knees with a leather belt, and a woodsman's axe; asleep he takes his bear's shape, a great black bear
// lying with his head on his paws, breathing slowly. Loaded after sprites-wanderers.js.

Object.assign(PEOPLE, {
  bombadil: { h: 13, w: 8, legs: 3, hat: true, tool: 'lily', weapon: 'hazel', skin: ['#eda27e', '#c06c52'], iris: ['#3a8fe8'],
    helm: ['#7a6a4c', '#544630'], hair: [['#7a4c28', '#55331b']], cloth: [['#2f72d8', '#1e4ea0']] },
  // sleepTop: how tall Beorn is asleep in his bear's shape, for the snore and the bubble over the bear.
  beorn: { h: 17, w: 9, legs: 5, sleepTop: 8, tool: 'woodaxe', skin: ['#d9a47a', '#a5704e'], iris: ['#5a3a22'],
    hair: [['#3a3038', '#1d171f']], cloth: [['#bba98a', '#86765a']] },
});

// Tom Bombadil's face, 16 pixels wide under the brim's shadow: bushy brows lifted, bright blue eyes creased with
// laughter, a round red nose, red cheeks, and a wide smile above his beard.
const TOM_FACE = ['qrrrrrrrrrrrrrqq', 'tsddcbsttsbcddcq', 'tskkkksttskkkksq', 'tsk*jwsttsw*jksq', 'trxijxsttsxijxrq', 'tsrrrsttttsrrrsq',
  'tuuusstttussuuuq', 'suuusrtuuurssuuq', 'ssuusrqqqqrssusq', 'sqvsssssssssrvqq', 'ssqvwwwwwwwwvqsq', 'pssqvvvvvvvvqsqp'];
// Asleep his eyes close in two happy arcs.
const TOM_SHUT = [...TOM_FACE.slice(0, 2), 'tssqqssttssqqssq', 'tsqssqsttsqssqsq', 'trsssssttssssrrq', ...TOM_FACE.slice(5)];
// His head, the hat 6 units over it: a tall crown dented on top and creased, a band with a long blue feather stuck in
// it sweeping up and back, a broad floppy brim; brown hair under it, and a long brown beard.
function tomHead(shut) {
  const G = qdGrid(32, 60);
  for (let r = 5; r < 21; r += 1) {
    const [a, b] = r === 5 ? [11, 21] : [11 - Math.floor((r - 5) / 6), 21 + Math.floor((r - 5) / 5)];
    for (let c = a; c <= b; c += 1) {
      if (r === 5 && c > 13 && c < 18) continue;
      const ch = c === a || c === b || (r === 6 && c > 13 && c < 18) ? '6' : c < a + 3 ? '0' : c < b - 4 ? '9' : c < b - 1 ? '8' : '7';
      G.put(r, c, r === 5 || (r === 6 && (c <= 13 || c >= 18)) ? '6' : ch);
    }
  }
  G.all(7, 14, ['77777', '.888.']);
  qdWalk(10, 18, 13, 21, (r, c) => G.put(r, c, '78'));
  G.all(16, 8, ['6777777777777776', '6m7777777777777G', '6666666666666666']);
  // The feather: a long blue quill from the band up and back over the crown.
  qdWalk(17, 9, 1, 3, (r, c) => G.put(r, c, 'W'));
  for (let r = 1; r < 16; r += 1) {
    const c = Math.round(3 + ((r - 1) * 6) / 16);
    G.put(r, c - 2, r < 3 ? 'n4' : r < 12 ? 'O4' + (r % 3 ? '3' : 'n') : 'O3');
    G.put(r, c + 1, r < 3 ? '' : r < 12 ? '21O' : '1O');
  }
  G.all(0, 1, ['.O5O', 'O45n']);
  // The brim, lit on top and shading the brow, drooping at its ends.
  G.all(19, 0, ['..6600999999999999999999988766..', '.69999999999999999999999988887766', '6800887777777777777777778877667.', '76666...............666666...76', '.66...........................6.']);
  // Hair under the brim and the face.
  for (let r = 22; r < 33; r += 1) { wanLocks(G, r, 4, 8); wanLocks(G, r, 23, 27); }
  G.all(22, 8, shut ? TOM_SHUT : TOM_FACE);
  // The long brown beard from the jaw over the coat.
  wanBeard(G, 33, 58, (r) => (r < 40 ? 20 : r < 46 ? 18 : r < 51 ? 14 : 10), null);
  G.all(31, 7, ['ocd..........cbo', 'ocdd........cbbo']);
  return G.rows();
}
// A bright blue jacket over a stout middle, lit where it rounds, its lapels open, brass buttons down its front, a
// collar, and its skirts below over the breeches.
function tomBody(h) {
  const G = hdTorso(32, h, [4, 27], 3);
  for (let r = 2; r < h - 4; r += 1) { G.put(r, 6 + (r >> 2), '1'); G.put(r, 25 - (r >> 2), '1'); }
  for (let r = 6; r < h - 5; r += 1) G.put(r, 8 + (r > 9 ? 0 : 1), r > 7 && r < h - 7 ? '45' : '4');
  G.all(0, 9, ['O1555555551O', '.O1444442O.']);
  for (let r = 3; r < h; r += 1) G.put(r, 15, r % 4 === 1 ? 'Gy' : '21');
  for (let r = 5; r < h; r += 4) { G.put(r, 15, 'GY'); G.put(r + 1, 15, 'Gg'); }
  G.all(h - 4, 0, ['O4444443333333333333332222221O', 'O55444433333333333333332222211O', 'O1111111111111111111111111111O']);
  return G.rows();
}
// Brown breeches into great yellow boots, their tops turned down.
const TOM_LEGS = { W: 32, at: [7, 17], L: 'EHFFFE', R: 'EFFEEE', lift: 3, bootX: [-1, 0],
  bootL: ['GY++YYygG', 'GgggggggG', '.GYyyyggG', '.GYyyyggG', 'GYyyyyyggG', 'GGGGGGGGGG'], bootR: ['GY+YyyggG', 'GgggggggG', 'GYyyyygG.', 'GYyyyygG.', 'GYyyyyyggG', 'GGGGGGGGGGG'] };
function tomLegs(n, step) {
  const G = qdGrid(32, n);
  G.all(0, 0, hdLegs(n, step, TOM_LEGS));
  const sway = step === 0 ? 1 : step === 1 ? -1 : 0;
  ['O44333333333331O13333333222211O', 'O4433333333331O.O1333332222211O', 'O1111111111O1O...O1O11111111111O'].forEach((row, r) => G.put(r, 1 + (r ? sway : 0), row));
  return G.rows();
}
// Tom skips as he walks: on each stride he is off the ground.
function tomWalk(g, kind, name, x, y, frame, tool) {
  return wanBase(g, kind, name, x, y - (frame % 1 ? 0 : 1.5), 'walk', frame, tool);
}
hdPeople('bombadil', {
  up: 24,
  head: tomHead,
  body: tomBody,
  legs: tomLegs,
  arm: { L: '14432', R: '3221O', cuff: ['W', 'V', 'X'] },
  poses: { walk: tomWalk },
  // The feather and the beard's end swing back on a stride.
  sway: [[0, 12], [50, 60]],
});

// Beorn's face, 18 pixels wide: heavy black brows, dark eyes, a strong nose and high cheekbones above his beard.
const BEORN_FACE = ['ttssssssssssssssrq', 'tobccbssssssbccboq', 'tssabccassaccbasrq', 'tsskkkkssttskkkksq', 'tssk*jwssttsw*jksq', 'tssxijxssttsxijxrq',
  'tssrrrsssttrrrrsrq', 'tsssssssttrrssssrq', 'tssssssrtssrqsssrq', 'tssssrrqqqqqrssssq'];
const BEORN_SHUT = [...BEORN_FACE.slice(0, 3), 'tssssssssttssssssq', 'tssrppprsttrppprsq', 'tssrqqrssttsrqqrrq', ...BEORN_FACE.slice(6)];
// His head: thick black hair in locks over his brow and down to his shoulders, and a great black beard to his chest.
function beornHead(shut) {
  const G = qdGrid(32, 46);
  [6, 9, 11, 12, 13, 14, 14, 15, 15].forEach((h, r) => wanLocks(G, r, 16 - h, 15 + h));
  // The mane falls behind the ears to the shoulders, a little wider as it goes, its ends ragged.
  for (let r = 9; r < 30; r += 1) {
    const out = r < 16 ? 0 : 1;
    wanLocks(G, r, 2 - out, 7);
    wanLocks(G, r, 24, 29 + out);
    if (r > 24) for (let c = 0; c < 32; c += 1) if ((c * 5) % 6 < r - 24 && (c < 8 || c > 23)) G.put(r, c, ' ');
  }
  G.all(9, 7, shut ? BEORN_SHUT : BEORN_FACE);
  G.all(7, 7, ['.dcdcbbo..obbcdcb', 'ocb..........bcbo']);
  wanBeard(G, 17, 44, (r) => (r < 19 ? 20 : r < 34 ? 28 : r < 39 ? 24 : 18), null);
  G.all(17, 9, ['..oddcbbbcbo..', '.oddcbvvvbcbbo', 'oddcbbqzzqbbcbo']);
  return G.rows();
}
// A wool tunic, its twill in faint slanting lines, across broad shoulders; a leather belt with an iron buckle.
function beornBody(h) {
  const G = hdTorso(36, h, [5, 30], 4);
  for (let r = 3; r < h; r += 1) for (let c = 2; c < 34; c += 1) if ((r + c) % 4 === 0 && G.cells[r][c] === '3') G.put(r, c, '2');
  G.all(0, 13, ['OrsssrO', '.OrsrO.', '..OrO..']);
  const belt = h - 8;
  G.all(belt, 0, ['DHHHHHHHHHHHHH6000966FFFFFFFFFFFEED', 'DFFFFFFFFFFFFF69#9F66EEEEEEEEEEEEED', 'DEEEEEEEEEEEEE666666EEEEEEEEEEEEDDD']);
  return G.rows();
}
// The tunic's skirt to the knees, swinging on a stride, over bare calves and leather shoes.
const BEORN_LEGS = { W: 36, at: [7, 20], L: 'ptsssr', R: 'srrrqp', lift: 3, bootX: [-1, 0],
  bootL: ['DHFFFED', 'DHFFFFEED', 'DDDDDDDDD'], bootR: ['DFFFEED', 'DFFFEEEED', 'DDDDDDDDDD'] };
function beornLegs(n, step) {
  const G = qdGrid(36, n);
  G.all(0, 0, hdLegs(n, step, BEORN_LEGS));
  const sway = step === 0 ? 1 : step === 1 ? -1 : 0;
  for (let r = 0; r < 9; r += 1) {
    const off = r > 4 ? sway : 0;
    const row = r < 7 ? 'O443333333333333333333333222221111O' : r === 7 ? 'O222222222222222222222222221111111O' : 'OOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOOO';
    G.put(r, 1 + off, row);
  }
  return G.rows();
}
hdPeople('beorn', {
  up: 4,
  head: beornHead,
  body: beornBody,
  legs: beornLegs,
  arm: { L: 'pttsr', R: 'srrqp', cuff: ['H', 'F', 'D'] },
  poses: { sleep: beornSleep },
  // The beard's end swings back on a stride.
  sway: [[36, 46]],
});

// Beorn's bear: shapes lit from the upper left onto a ramp of six steps from outline to shine (black fur, or the brown
// fur of the muzzle), each part edged where it lies over another and the whole ringed with the outline: the big body
// with the hump of the shoulders, the haunch, round ears, the head laid on the front paws, the eye shut, pale claws.
const WAN_BEAR_PAL = { key: 'bear', 0: '#0c0a0a', 1: '#191515', 2: '#262020', 3: '#352d2b', 4: '#4e443f', 5: '#71655c',
  m: '#3a2e26', n: '#5e4c3e', M: '#806a56', N: '#a08870', k: '#050404', '*': '#d8d2cc', T: '#e0d6bc', e: '#0c0a0a' };
const WAN_FUR = '012345';
const WAN_MUZZLE = '0mmnMN';
// One round part of the bear centred on (cx, cy) with radii rx and ry, in pixels, shaded by how its surface faces the
// light, with short slanting strokes of fur a step lighter or darker. An edged part is outlined where it lies over the
// parts before it; the body's own lumps run into one another unedged.
function wanBlob(B, cx, cy, rx, ry, ramp = WAN_FUR, edged = true) {
  for (let r = Math.floor(cy - ry); r <= Math.ceil(cy + ry); r += 1) {
    for (let c = Math.floor(cx - rx); c <= Math.ceil(cx + rx); c += 1) {
      const [nx, ny] = [(c + 0.5 - cx) / rx, (r + 0.5 - cy) / ry];
      const d = nx * nx + ny * ny;
      if (d > 1 || r < 0 || r >= B.cells.length || c < 0 || c >= B.cells[0].length) continue;
      const lit = -0.5 * nx - 0.7 * ny + 0.5 * Math.sqrt(1 - d) + (((c + 2 * r) % 7 === 0) - ((c + 2 * r) % 7 === 3)) * 0.12;
      B.cells[r][c] = ramp[lit > 0.86 ? 5 : lit > 0.62 ? 4 : lit > 0.3 ? 3 : lit > -0.1 ? 2 : 1];
      B.part[r][c] = edged ? B.n : -2;
    }
  }
  B.n += 1;
}
// The bear, 66 by 32 pixels, its back and haunch a pixel higher and rounder while it breathes in (breath 1).
function wanBear(breath) {
  const [W, H] = [66, 32];
  const B = { cells: Array.from({ length: H }, () => Array(W).fill('.')), part: Array.from({ length: H }, () => Array(W).fill(-1)), n: 0 };
  wanBlob(B, 45.5, 12, 3.5, 3.5);
  wanBlob(B, 30, 19.5 - breath, 24, 11.5 + breath, WAN_FUR, false);
  wanBlob(B, 38, 15 - breath, 11, 8, WAN_FUR, false);
  wanBlob(B, 14, 19.5 - breath, 11, 11, WAN_FUR, false);
  wanBlob(B, 12, 28, 9, 3.5);
  wanBlob(B, 48, 28.5, 13, 3);
  wanBlob(B, 51, 19.5, 9.5, 7.5);
  wanBlob(B, 53.5, 12, 3.5, 3.5);
  wanBlob(B, 59.5, 23, 5.5, 3.8, WAN_MUZZLE);
  // Each part edged where it lies over an earlier one, the whole ringed with the outline, its top rough with fur.
  const at = (r, c) => (r >= 0 && r < H && c >= 0 && c < W && B.cells[r][c] !== '.' ? B.part[r][c] : -1);
  const out = B.cells.map((row, r) => row.map((ch, c) => {
    if (ch === '.') return ch;
    const nb = [at(r - 1, c), at(r + 1, c), at(r, c - 1), at(r, c + 1)];
    if (nb.some((q) => q === -1)) return r < 22 && (c * 7) % 5 === 0 && at(r - 1, c) === -1 ? '.' : '0';
    return B.part[r][c] >= 0 && nb.some((q) => q < B.part[r][c]) ? '1' : ch;
  }));
  const put = (r, c, s) => [...s].forEach((ch, k) => { if (ch !== '.') out[r][c + k] = ch; });
  // The ears' hollows, the shut eye, the nose, and pale claws at the front paws' tips.
  put(11, 45, '11');
  put(12, 44, '111');
  put(11, 53, '11');
  put(12, 53, '111');
  put(18, 54, '000');
  put(17, 53, '1');
  [[21, 64, 'k'], [22, 63, 'k*k'], [23, 63, 'kkk'], [24, 64, 'k']].forEach(([r, c, t]) => put(r, c, t));
  [[28, 61], [29, 61], [30, 60]].forEach(([r, c]) => put(r, c, 'T'));
  return out.map((row) => row.join(''));
}
// Beorn asleep: the bear lying with its feet on row y, centred on x, breathing as sprites-hd.js's sleepers do.
function beornSleep(g, kind, name, x, y) {
  const breath = hdBreath(g, pxHash(name)) ? 1 : 0;
  hdStamp(g, WAN_BEAR_PAL, `wanbear${breath}`, () => wanBear(breath), x - 8.25, y - 7);
  return { x: x + 6, y: y - 3, up: false };
}
