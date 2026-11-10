// realm-art.js: the pixel dioramas across the top of the Machines cards (machines.js). Rivendell has a pointed arch
// between elven trees and a waterfall off a cliff, the Shire a green hill with a round door, a round window and a
// smoking chimney, Erebor a lone mountain with a carved gate and the forge glowing inside it, Rohan a tent on a golden
// plain, and Codex and Grok a pair of seeing-stones on stone plinths. The landmarks keep to the right so the realm's
// name, lettered in HTML over the left, stays clear. Everything is drawn in code at 32-bit, as in the Middle-earth view:
// a quarter unit to the pixel, each material in a ramp of its own colour lit from the upper left, with stone courses and
// mortar, grain in wood, bark, leaf clusters, streaks and foam in water. The sky is day in the light theme and night in
// the dark one, with stars, a moon and lit windows; the seeing-stones are always at night. The sky, hills, ground,
// trees and the shading are realm-art-kit.js's. A band is painted once per realm, time of day and width, then copied.
const ART_H = 30;
const ART_GROUND = ART_H - 5;
const artBox = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
// A fixed pseudo-random number in [0, 1) for a seed, so stars and flowers stay put between paints.
const artRnd = (seed) => { const x = Math.sin(seed * 78.233) * 43758.5453; return x - Math.floor(x); };
const ART_SKY = { day: ['#7fb2de', '#9fc6e6', '#c3dbea', '#e8e6d0'], night: ['#0b1029', '#121a3c', '#1b224c', '#2b2f5e'] };
// A pointed arch's outer half-width at row y: two arcs that spring from row 15, 6.5 either side of the middle, and meet
// at row 6.
const artArch = (y) => (y >= 15 ? 6.5 : Math.max(0, Math.sqrt(9.48 ** 2 - (15 - y) ** 2) - 2.98));
// A row of a picture drawn in quarter units.
const artMap = (g, rows, pal, x, y) => hdMap(g, rows, pal, x, y, 0.25);

function artElf(g, W, night) {
  artHills(g, W, 8, night ? '#222a50' : '#94a6c8', 3);
  artGround(g, W, night ? '#24503f' : '#4f8f6a', night ? '#1c4134' : '#3f7656', 5);
  // The cliff at the right edge, grey stone in slanting ledges lit along their tops, with moss along its crown and on
  // its ledges; the falls come off it in streaks of white, foam where they pour over and where they land in the pool.
  const rock = night ? artRamp('#3b4762', '#2f3a52', true) : artRamp('#8293a6', '#62748a');
  const ledge = (x, y) => (Math.floor(y * 4 + (x - W) * 1.6) % 9 + 9) % 9;
  artShape(g, [W - 13, 2, 13, ART_GROUND - 1], (x, y) => x > W - 13 + (y < 3 ? 1 : 0) + (y > 14 ? 0.5 : 0), rock,
    { floor: ART_GROUND, cx: W - 9, rx: 6, tex: (x, y) => (ledge(x, y) === 0 ? -0.5 : ledge(x, y) === 1 ? 0.3 : 0) + (artRnd(Math.floor(x * 2) + Math.floor(y) * 31) - 0.5) * 0.2 });
  const moss = night ? ['#1f4a37', '#2f6a4e', '#3f7f5f'] : ['#3f7f4f', '#5aa070', '#86c48c'];
  for (let c = 0; c < 52; c += 1) {
    const h = 1 + Math.floor(artRnd(c * 3) * 3);
    for (let k = 0; k < h; k += 1) artBox(g, W - 13 + c / 4, 2.25 - k / 4 + (c < 4 ? 0.75 : 0), 0.25, 0.25, moss[k === h - 1 ? 2 : k ? 1 : 0]);
  }
  const water = night ? ['#3e6593', '#5a7fae', '#7ea5cf', '#d0e2fa'] : ['#5b9bd6', '#86bde8', '#b4dcff', '#ffffff'];
  for (let c = 0; c < 16; c += 1) {
    for (let y = 2; y < ART_GROUND + 0.5; y += 0.25) {
      const s = artRnd(c * 17 + Math.floor((y * 4 + c * 7) / (5 + (c % 3) * 2)));
      artBox(g, W - 10 + c / 4, y, 0.25, 0.25, c === 0 || c === 15 ? water[0] : c === 1 || c === 14 ? water[1] : s > 0.78 ? water[3] : s > 0.4 ? water[2] : water[1]);
    }
  }
  artMap(g, ['..wwwwwwwwwwwwwwwww.', '.wWWWWWWWWWWWWWWWWw.', 'wWWwWWWwWWWwWWWwWWWw'], { w: water[2], W: water[3] }, W - 10.5, 1.75);
  const pool = night ? ['#2b5180', '#35618f', '#4c7cb0', '#7ea5cf'] : ['#3e83c2', '#4f93d0', '#6fb6f0', '#a9d6ff'];
  artBox(g, W - 16, ART_GROUND, 13, 1.75, pool[1]);
  artBox(g, W - 15.5, ART_GROUND, 12, 0.25, pool[3]);
  artBox(g, W - 15.75, ART_GROUND + 0.25, 12.5, 0.5, pool[2]);
  artBox(g, W - 15.5, ART_GROUND + 1.5, 12, 0.25, pool[0]);
  for (let i = 0; i < 9; i += 1) artBox(g, W - 15.5 + Math.floor(artRnd(i * 5) * 40) / 4, ART_GROUND + 0.5 + (i % 3) * 0.25, 0.5 + (i % 2) * 0.5, 0.25, i % 2 ? pool[3] : pool[2]);
  for (let i = 0; i < 18; i += 1) {
    const [fx, fy] = [W - 11 + Math.floor(artRnd(i * 7 + 1) * 24) / 4, ART_GROUND - 0.75 + Math.floor(artRnd(i * 3 + 2) * 6) / 4];
    artBox(g, fx, fy, 0.25 + (i % 3 ? 0.25 : 0), 0.25, i % 4 ? water[3] : water[2]);
  }
  // A pavilion: two slender pillars under a pointed arch of pale stone with a groove carved round it, the west side lit
  // and the east in shade, on a stepped plinth, with capitals under the arch, a gold finial on top and a lantern hung on a
  // chain inside, lit at night.
  const ax = W - 32;
  const mid = ax + 0.5;
  const stone = night ? artRamp('#c9c2b0', '#958e7c', true) : artRamp('#f3eddf', '#c8bfa8');
  artShape(g, [ax - 8, 6, 17, ART_GROUND - 7], (x, y) => { const d = Math.abs(x - mid); const o = artArch(y); return d < o && d > o - 2; }, stone,
    { floor: ART_GROUND - 1, cx: mid - 2, rx: 6, cy: 10, ry: 6, tex: (x, y) => (Math.abs(Math.abs(x - mid) - artArch(y) + 1) < 0.13 && y < 15 ? -0.6 : 0) });
  artShape(g, [ax - 8, ART_GROUND - 1.5, 17, 1.5], (x, y) => Math.abs(x - mid) < (y < ART_GROUND - 0.75 ? 7.75 : 8.5), stone, { floor: ART_GROUND, cx: mid - 3, rx: 8 });
  for (const x of [mid - 7.25, mid + 4.25]) artMap(g, ['GGGGGGGGGGGG', 'yyyyyyyyyyyy', '.SSSSSSSSSS.', '..ssssssss..'], { G: stone[5], y: stone[4], S: stone[2], s: stone[1] }, x, 14.75);
  artMap(g, ['...q...', '..qYy..', '..qYG..', '...Y...', '..qYG..', '.qYYyG.', '.qYyyG.', 'GGyyyGG'], { q: '#fff1b8', Y: '#f2cf6a', y: '#d8ab45', G: '#94702c' }, ax - 0.25, 3.5);
  artBox(g, ax + 0.25, 7, 0.25, 7.25, night ? '#8a7c58' : '#a08c5a');
  if (night) artLamp(g, ax, 15.75, 3.5, '#1b224c', '#ffd86b');
  artMap(g, ['.GGG.', 'GqyYG', 'GyyYG', 'GyYYG', '.GGG.', '..G..'], { G: '#6e5c30', q: night ? '#fffbe0' : '#f4dc8a', y: night ? '#fff1b0' : '#d8b452', Y: night ? '#ffc24a' : '#a5822f' }, ax - 0.375, 14.25);
  artTree(g, ax - 15, 2, 14, night);
  artTree(g, W - 20, 9, 9, night);
}

// A round canopy of leaf clusters over a short trunk, for the Shire's tree.
function artBush(g, cx, cy, night) {
  const leaves = night ? artRamp('#2c5228', '#203f1d', true) : artRamp('#559a38', '#3b7026');
  const back = night ? artRamp('#244520', '#1a3417', true) : artRamp('#44822e', '#2e5c1f');
  [[0, -3, 2.6, back], [-3, -0.5, 2.4, back], [3, -0.3, 2.4, leaves], [-1.2, 0.8, 2.8, leaves], [1.3, -1.6, 2.7, leaves], [-2, -2.6, 2, leaves]]
    .forEach(([dx, dy, r, ramp], i) => artCluster(g, cx + dx, cy + dy, r, ramp, i * 5));
}

function artHobbit(g, W, night) {
  artHills(g, W, 5, night ? '#203c33' : '#a3c784', 7);
  artGround(g, W, night ? '#2b4a28' : '#5f9a3a', night ? '#223d20' : '#4f8530', 9);
  const hx = W - 24;
  const top = ART_GROUND - 13;
  // The hill: grass lit on its west shoulder and shaded on the east, in tufts.
  artShape(g, [hx - 22, top - 1, 45, ART_GROUND - top + 1], (x, y) => y < ART_GROUND && y > ART_GROUND - Math.sqrt(Math.max(0, 22.5 ** 2 - (x - hx - 0.5) ** 2)) * 0.6,
    night ? artRamp('#305a2c', '#264522', true) : artRamp('#68a842', '#4d8a32'),
    { floor: ART_GROUND, cx: hx + 2, rx: 28, cy: top + 7, ry: 20, tex: (x, y) => (artRnd(Math.floor(x) * 11 + Math.floor(y * 2) * 3) - 0.5) * 0.12 });
  const turf = night ? { l: '#3f7036', d: '#22401f' } : { l: '#8cc65a', d: '#43802c' };
  for (let i = 0; i < 34; i += 1) {
    const tx = hx - 19 + Math.floor(artRnd(i * 7 + 2) * 152) / 4;
    const ty = ART_GROUND - Math.sqrt(Math.max(0, 22.5 ** 2 - (tx - hx - 0.5) ** 2)) * 0.6 + 0.75 + Math.floor(artRnd(i * 3 + 5) * 24) / 4;
    if (ty < ART_GROUND - 1.5 && Math.hypot(tx - hx + 2.5, ty - ART_GROUND + 4.5) > 6 && Math.hypot(tx - hx - 9.5, ty - ART_GROUND + 7.5) > 3.5) artMap(g, ART_TUFT.slice(0, 3), turf, tx, ty);
  }
  // The chimney on the hill, stone in courses under a capstone, and its smoke drifting up and away in widening puffs.
  const cap = (x, y) => (x > hx + 6 && x < hx + 8 && y > top - 2) || (x > hx + 5.5 && x < hx + 8.5 && y > top - 2.5 && y < top - 1.75);
  artShape(g, [hx + 5.5, top - 2.5, 3, 4.5], cap, night ? artRamp('#5b5752', '#46433f', true) : artRamp('#9a9692', '#6e6b67'),
    { floor: top + 1.5, ry: 40, tex: (x, y) => (Math.floor(y * 4) % 4 === 3 || (Math.floor(x * 4) + Math.floor(y) * 3) % 6 === 0 ? -0.45 : 0) });
  const [puff, puffD] = night ? ['#4b4e66', '#3a3c52'] : ['#eef0f2', '#c3c9d2'];
  for (let k = 0; k < 4; k += 1) {
    g.globalAlpha = 1 - k * 0.17;
    const r = 0.4 + k * 0.3;
    artShape(g, [hx + 5 + k, top - 7 - k * 2, 5, 4], artInDisc(hx + 7 + k, top - 5 - k * 2, r), [puffD, puffD, hdMix(puff, puffD, 0.5), puff, hdMix(puff, HD_LIGHT, 0.4), hdMix(puff, HD_LIGHT, 0.7)]);
  }
  g.globalAlpha = 1;
  // The round door in its wooden ring, green planks and a brass knob, on a stone step; a round window beside it with a
  // cross of glazing bars, sky in its glass by day and lamplight at night.
  const wood = night ? artRamp('#5a3b20', '#432b16', true) : artRamp('#86572f', '#5e3b1f');
  artShape(g, [hx - 9, ART_GROUND - 11, 13, 11], artInDisc(hx - 3, ART_GROUND - 5, 5.2), wood, { floor: ART_GROUND, tex: (x, y) => (Math.floor(Math.atan2(y - ART_GROUND + 4.5, x - hx + 2.5) * 5) % 2 ? -0.15 : 0.1) });
  artShape(g, [hx - 8, ART_GROUND - 10, 11, 10], artInDisc(hx - 3, ART_GROUND - 5, 4.2), night ? artRamp('#24563a', '#1b432d', true) : artRamp('#33844f', '#245f3b'),
    { floor: ART_GROUND, tex: (x) => (Math.floor(x * 4) % 6 === 0 ? -0.5 : Math.floor(x * 4) % 6 === 1 ? 0.2 : 0) });
  artMap(g, ['.GGG.', 'GqgyG', 'GgyyG', 'GyyGG', '.GGG.'], { q: '#fff6c0', g: '#f0c85a', y: '#c99a30', G: '#7a5418' }, hx - 3.125, ART_GROUND - 5.125);
  artMap(g, ['lllllllllllllllllllllllllllllllllllllllll', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbs', 'ssssssssssssssssssssssssssssssssssssssssss'],
    { l: night ? '#8f8a80' : '#c9c2b4', b: night ? '#6f6a62' : '#a8a090', s: night ? '#4a4640' : '#7a7468' }, hx - 8.25, ART_GROUND - 0.25);
  if (night) artLamp(g, hx + 9, ART_GROUND - 8, 4.5, '#2c5228', '#ffd36b');
  artShape(g, [hx + 6, ART_GROUND - 11, 7, 6], artInDisc(hx + 9, ART_GROUND - 8, 2.4), wood);
  const glass = night ? ['#ffe089', '#ffc24a', '#fff6cf'] : ['#a9cde6', '#6f97b8', '#ffffff'];
  artShape(g, [hx + 7, ART_GROUND - 10, 5, 5], artInDisc(hx + 9, ART_GROUND - 8, 1.5), [glass[1], glass[1], glass[1], glass[0], glass[0], glass[2]], { rim: false, cx: hx + 8.5, cy: ART_GROUND - 8.5 });
  artBox(g, hx + 9.375, ART_GROUND - 9.5, 0.25, 3, wood[2]);
  artBox(g, hx + 8, ART_GROUND - 7.625, 3, 0.25, wood[2]);
  artBox(g, hx + 8.25, ART_GROUND - 9, 0.5, 0.25, glass[2]);
  artBox(g, hx + 8.25, ART_GROUND - 8.75, 0.25, 0.25, glass[2]);
  // Flowers along the foot of the hill, each a bloom with a pale heart and a lit petal on a stem with a leaf, then a
  // fence to its left and a round tree beyond that, on a band wide enough that they stay clear of the lettered name.
  const bloom = ['#e0453a', '#f2c14e', '#ef8fbc', '#fbf6ea', '#9b6fd0'];
  for (let x = hx - 20; x < hx + 21; x += 1.75) {
    if (Math.abs(x - hx + 3) <= 6.5) continue;
    const y = ART_GROUND - 1.75 - (Math.round(x * 4) % 3 ? 0 : 0.5);
    const c = bloom[Math.floor(artRnd(x) * 5)];
    artMap(g, ['.pp.', 'pqcP', 'pccP', '.PP.', '.s..', 'ls..', '.sl.', '.s..'],
      { p: hdMix(c, HD_LIGHT, 0.35), c, P: hdMix(c, HD_DARK, 0.25), q: '#fff3b0', s: night ? '#2e5226' : '#3f7a2a', l: night ? '#3c6a30' : '#5aa040' }, x, y);
  }
  if (W < 140) return;
  const [rail, railL, railD] = night ? ['#4a3524', '#5e4430', '#33241a'] : ['#7b4f2b', '#a3713f', '#55361b'];
  for (const y of [ART_GROUND - 3.25, ART_GROUND - 1.75]) { artBox(g, hx - 36, y, 12, 0.25, railL); artBox(g, hx - 36, y + 0.25, 12, 0.5, rail); artBox(g, hx - 36, y + 0.75, 12, 0.25, railD); }
  for (let x = hx - 36; x < hx - 24; x += 3) artMap(g, ['.ll.', 'lbbs', 'lbbs', ...Array(15).fill('lbsd')], { l: railL, b: rail, s: railD, d: hdMix(railD, HD_DARK, 0.4) }, x, ART_GROUND - 4.5);
  artShape(g, [hx - 44.5, ART_GROUND - 6, 3, 6], (x) => x > hx - 44 && x < hx - 42, night ? artRamp('#4a3524', '#33241a', true) : artRamp('#6b4a2e', '#4f3520'),
    { floor: ART_GROUND, ry: 40, tex: (x) => (Math.floor(x * 4) % 3 === 1 ? -0.3 : 0) });
  artBush(g, hx - 43.5, ART_GROUND - 9.5, night);
}

function artDwarf(g, W, night) {
  artHills(g, W, 7, night ? '#2a2a3e' : '#a6a3b2', 11);
  artGround(g, W, night ? '#37343e' : '#7b736a', night ? '#2c2a32' : '#665f57', 13);
  // The lone mountain: rock lit on its west face and shaded on the east, scored with gullies and ledges, with a ragged
  // cap of snow.
  const mx = W - 26;
  const peak = (x, y) => y > 1.5 + Math.abs(x - mx - 0.5);
  const gully = (x, y) => (Math.floor((x - mx) * 1.4 + y * 0.6) % 6 === 0 ? -0.3 : 0) + (Math.floor(y * 4 - Math.abs(x - mx) * 0.8) % 11 === 0 ? 0.25 : 0);
  artShape(g, [mx - 27, 2, 55, ART_GROUND - 2], (x, y) => peak(x, y) && y < ART_GROUND, night ? artRamp('#45414f', '#302d38', true) : artRamp('#6a6672', '#4c4852'),
    { floor: ART_GROUND, cx: mx + 2.5, rx: 10, cy: 10, ry: 30, tex: (x, y) => (artRnd(Math.floor(x * 2) * 7 + Math.floor(y * 2) * 13) - 0.5) * 0.25 + gully(x, y) });
  const [snow, snowD] = night ? ['#a9b1c6', '#7d869c'] : ['#eef1f6', '#c4ccda'];
  artShape(g, [mx - 6, 2, 14, 6], (x, y) => peak(x, y) && y < 6.5 + (artRnd(Math.floor(x * 4) * 3) - 0.5) * 1.5 + (Math.floor(x * 2) % 3 ? 0 : 0.75),
    [snowD, hdMix(snowD, '#6a78a8', 0.2), snowD, snow, hdMix(snow, HD_LIGHT, 0.5), '#ffffff'], { cx: mx + 1.5, rx: 4, cy: 4, ry: 6 });
  // The gate: a stepped frame of dressed stone in courses with its doorway cut back into dark, carved pillars either
  // side, and the forge burning in the doorway with sparks going up.
  const frame = night ? artRamp('#7d7885', '#5d5966', true) : artRamp('#99949f', '#716c78');
  const ashlar = (x, y) => (Math.floor(y * 4) % 6 === 5 || (Math.floor(x * 4) + (Math.floor(y / 1.5) % 2) * 6) % 12 === 0 ? -0.5 : Math.floor(y * 4) % 6 === 0 ? 0.25 : 0);
  const gate = (x, y) => (Math.abs(x - mx) < 6 && y > ART_GROUND - 12) || (Math.abs(x - mx) < 4 && y > ART_GROUND - 13) || (Math.abs(x - mx) < 2 && y > ART_GROUND - 14);
  const door = (x, y) => (Math.abs(x - mx) < 4 && y > ART_GROUND - 10) || (Math.abs(x - mx) < 3 && y > ART_GROUND - 11);
  artShape(g, [mx - 6, ART_GROUND - 14, 12, 14], (x, y) => gate(x, y) && !door(x, y), frame, { floor: ART_GROUND, cx: mx - 2, rx: 8, ry: 40, tex: ashlar });
  artBox(g, mx - 4, ART_GROUND - 10, 8, 10, '#15121a');
  artBox(g, mx - 3, ART_GROUND - 11, 6, 1, '#0e0c12');
  artBox(g, mx - 4, ART_GROUND - 10, 8, 0.75, '#0e0c12');
  artBox(g, mx - 4, ART_GROUND - 9.25, 0.25, 9.25, '#0a080d');
  for (const px of [mx - 10, mx + 8]) {
    artShape(g, [px - 1, ART_GROUND - 14, 4, 14], (x, y) => (x > px && x < px + 2) || (x > px - 1 && x < px + 3 && y < ART_GROUND - 12), frame,
      { floor: ART_GROUND, cx: px, rx: 3, ry: 40, tex: (x, y) => (y > ART_GROUND - 12 && Math.floor(x * 4) % 4 === 1 ? -0.4 : 0) + (Math.floor(y * 4) % 8 === 0 ? -0.3 : 0) });
  }
  artHalo(g, mx - 0.5, ART_GROUND - 2.5, 4, hdMix('#15121a', '#ff7a1a', night ? 0.42 : 0.32));
  const fire = [night ? '#c4561c' : '#a8481a', '#e8681e', '#ff9a30', '#ffd35a', '#fff1a8'];
  for (let c = 0; c < 24; c += 1) {
    const h = Math.max(1, Math.round((3.6 * Math.sin((c + 0.5) / 24 * Math.PI) + (artRnd(c * 7) - 0.3) * 1.6) * 4));
    for (let d = 0; d < h; d += 1) {
      const heat = (d / h) * 0.8 + (1 - Math.abs(c - 11.5) / 12) * 0.6 - 0.1;
      artBox(g, mx - 3 + c / 4, ART_GROUND - h / 4 + d / 4, 0.25, 0.25, fire[Math.max(0, Math.min(4, Math.floor(heat * 4 + artRnd(c * 13 + d) * 0.5)))]);
    }
  }
  for (let i = 0; i < 10; i += 1) artBox(g, mx - 2 + Math.floor(artRnd(i + 40) * 16) / 4, ART_GROUND - 5 - Math.floor(artRnd(i + 50) * 18) / 4, 0.25, 0.25, i % 3 ? '#ffd35a' : '#ff8a2a');
  // The road out of the gate in rows of cobbles, each lit along its top and shaded at its foot, warmed by the forge at
  // night.
  const road = night ? ['#2c2932', '#3a3640', '#4a4550', '#5a5460'] : ['#6a645d', '#7d766e', '#968f86', '#b0a99f'];
  artBox(g, mx - 4, ART_GROUND, 8, ART_H - ART_GROUND, road[0]);
  for (let r = 0; r < 5; r += 1) {
    for (let x = mx - 4 - (r % 2) * 0.75; x < mx + 4; x += 1.5) {
      const [x0, w] = [Math.max(mx - 4, x), Math.min(x + 1.25, mx + 4) - Math.max(mx - 4, x)];
      if (w <= 0) continue;
      artBox(g, x0, ART_GROUND + r + 0.25, w, 0.5, road[2]);
      artBox(g, x0, ART_GROUND + r, w, 0.25, road[3]);
      artBox(g, x0, ART_GROUND + r + 0.75, w, 0.25, road[1]);
    }
  }
  if (night) for (let i = 0; i < 10; i += 1) artBox(g, mx - 5 + Math.floor(artRnd(i + 3) * 40) / 4, ART_GROUND + Math.floor(artRnd(i + 9) * 12) / 4, 0.25, 0.25, '#b0602a');
}

function artMan(g, W, night) {
  artHills(g, W, 6, night ? '#2b2c48' : '#c7b98a', 17);
  artGround(g, W, night ? '#4b4630' : '#b9a35a', night ? '#3d3926' : '#9c8846', 19);
  // A tent of pale canvas, lit on its west side, seams running down from its peak and a green hem picked out in gold;
  // its door flap pinned open on a dark inside, or lamplight at night.
  const cx = W - 22;
  const mid = cx + 0.5;
  const apex = ART_GROUND - 9;
  artShape(g, [cx - 8.5, apex, 18, 9], (x, y) => y > apex - 0.5 + Math.abs(x - mid) && y < ART_GROUND, night ? artRamp('#cfc6b0', '#a69d88', true) : artRamp('#f5eedd', '#d2c6aa'),
    { floor: ART_GROUND, cx: mid + 1, rx: 6, cy: ART_GROUND - 5, ry: 8, tex: (x, y) => (Math.abs(Math.abs(x - mid) - (y - apex) * 0.45) < 0.13 || Math.abs(x - mid) < 0.13 ? -0.45 : 0) });
  for (const [y, color] of [[ART_GROUND - 1.25, night ? '#3a7a40' : '#4aa656'], [ART_GROUND - 1, night ? '#2f6a36' : '#3f9a4a'], [ART_GROUND - 0.5, night ? '#245a2c' : '#2f7a3a']]) {
    const half = Math.floor((y + 0.125 - apex + 0.5) * 4) / 4;
    artBox(g, mid - half, y, half * 2, y === ART_GROUND - 0.5 ? 0.5 : 0.25, color);
  }
  for (let x = mid - 7.5; x < mid + 8; x += 1) artMap(g, ['.y.', 'yYy'], { y: '#c99a30', Y: '#f5d98a' }, x, ART_GROUND - 1);
  for (let y = ART_GROUND - 4.5; y < ART_GROUND - 1.25; y += 0.25) {
    const half = Math.round((0.25 + (y - ART_GROUND + 4.5) * 0.4) * 4) / 4;
    artBox(g, mid - half - 0.5, y, 0.5, 0.25, night ? '#8a826e' : '#c2b796');
    artBox(g, mid - half - 0.75, y, 0.25, 0.25, night ? '#6a6250' : '#a69a78');
    artBox(g, mid - half, y, half * 2, 0.25, night ? (y > ART_GROUND - 2.75 ? '#fff1b0' : y > ART_GROUND - 3.5 ? '#ffd36b' : '#e0a040') : (y < ART_GROUND - 3.25 ? '#2e2218' : '#4a3a28'));
  }
  if (night) artLamp(g, mid, ART_GROUND + 0.75, 4, '#4b4630', '#ffd36b', 0.4, ART_GROUND);
  // The pole, lit wood with a gold knob, and a green pennant on it with a white horse and a forked tail, rippling.
  artBox(g, cx, ART_GROUND - 17, 0.25, 8, night ? '#6a4a30' : '#9a6a3e');
  artBox(g, cx + 0.25, ART_GROUND - 17, 0.5, 8, night ? '#5a3d26' : '#7a5230');
  artBox(g, cx + 0.75, ART_GROUND - 17, 0.25, 8, night ? '#35231a' : '#4a2f18');
  artMap(g, ['.yy.', 'yYYy', 'yYyy', '.yy.'], { y: '#c99a30', Y: '#f5d98a' }, cx, ART_GROUND - 18);
  artMap(g, ['lllllllllllllllllllllllllllllllllll...', 'llllllllllllllllllllllllllllllllllll..', ...Array(3).fill('gggggggggggggggggggggggggggggggggggs..'),
    'gggggggggggggggggggggggggggggggggss...', 'ggggggggggggggggggggggggggggggggs.....', 'gggggggggggggggggggggggggggggggggss...', ...Array(2).fill('gggggggggggggggggggggggggggggggggggs..'),
    'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSS..', 'SSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSSs...'], { l: '#62b466', g: '#2f7a3a', s: '#245f2e', S: '#1c4c24' }, cx + 1, ART_GROUND - 17);
  artMap(g, ['..........ww..', '.........wwww.', '........ww.www', '.wwwwwwwwww...', 'wwwwwwwwwww...', 'w.wwwwwwwww...', '..w.w...w.w...', '.w...w.w...w..'],
    { w: '#f4efe0' }, cx + 3.5, ART_GROUND - 16.5);
}

// Two seeing-stones on carved plinths: Codex's glows cold blue, Grok's amber, the same colours as their orbs in the
// table. Each orb is dark glass lit from deep inside, brightest a little up and left of its middle, with a swirl of
// light and a glint, inside a dithered halo and a ring of motes.
// The two seeing-stones' colours, [deep, glow, core]: Codex's blue and Grok's amber. Saruman's palantír in the
// Middle-earth view (scene-saruman.js) glows in the same ones.
const ART_STONE_TINT = { codex: ['#3d6ea6', '#9fd4ff', '#eaf7ff'], grok: ['#9a5a1e', '#ffb35c', '#fff0cf'] };
function artStones(g, W) {
  artHills(g, W, 6, '#1e2140', 23);
  artGround(g, W, '#25233a', '#1c1b2e', 29);
  [[W - 40, ...ART_STONE_TINT.codex], [W - 16, ...ART_STONE_TINT.grok]].forEach(([px, deep, glow, core]) => {
    const plinth = (x, y) => (x > px - 3 && x < px + 4 && y > ART_GROUND - 5) || (x > px - 4 && x < px + 5 && y > ART_GROUND - 6 && y < ART_GROUND - 5) || (x > px - 3.5 && x < px + 4.5 && y > ART_GROUND - 1);
    const panel = (x, y) => Math.abs(Math.abs(x - px - 0.5) - 2) < 0.13 && y > ART_GROUND - 4 && y < ART_GROUND - 1.5;
    artShape(g, [px - 4, ART_GROUND - 6, 9, 6], plinth, artRamp('#6f6c7c', '#55525f', true), { floor: ART_GROUND, cx: px - 1, rx: 4, ry: 40, tex: (x, y) => (panel(x, y) || Math.floor(y * 4) === (ART_GROUND - 4) * 4 ? -0.5 : 0) });
    artMap(g, ['.ssss.', 'sGGGGs', '.ssss.'], { s: hdMix(glow, '#55525f', 0.6), G: hdMix(glow, '#55525f', 0.3) }, px - 0.25, ART_GROUND - 3.25);
    artHalo(g, px, ART_GROUND - 12, 7.5, hdMix('#1b224c', glow, 0.22));
    for (let a = 0; a < 16; a += 1) {
      const t = (a / 16) * Math.PI * 2;
      artBox(g, Math.floor((px + 0.5 + Math.cos(t) * 8) * 4) / 4, Math.floor((ART_GROUND - 11.5 + Math.sin(t) * 7) * 4) / 4, 0.25 + (a % 4 ? 0 : 0.25), 0.25, a % 3 ? deep : glow);
    }
    artDisc(g, px, ART_GROUND - 12, 5.3, '#0f1120');
    const r = (x, y) => Math.hypot(x - px - 0.1, y - ART_GROUND + 12.4) / 4.4;
    const swirl = (x, y) => (Math.abs(Math.sin(Math.atan2(y - ART_GROUND + 11.5, x - px - 0.5) * 2 + r(x, y) * 5)) < 0.18 ? 0.18 : 0);
    artShape(g, [px - 4.5, ART_GROUND - 16.5, 10, 10], artInDisc(px, ART_GROUND - 12, 4.1), [hdMix(deep, '#121424', 0.6), hdMix(deep, '#121424', 0.3), deep, hdMix(deep, glow, 0.5), glow, core],
      { rim: false, rx: 14, ry: 14, cx: px + 0.5, cy: ART_GROUND - 11.5, tex: (x, y) => 0.35 - r(x, y) * 0.62 + swirl(x, y) });
    artMap(g, ['.cc.', 'cWWc', 'cWWc', '.cc.'], { c: core, W: '#ffffff' }, px - 0.5, ART_GROUND - 12.75);
    artMap(g, ['.WW', 'WW.', 'W..'], { W: '#ffffff' }, px - 2.75, ART_GROUND - 15.5);
  });
}

const REALM_ART = { elf: artElf, hobbit: artHobbit, dwarf: artDwarf, man: artMan, stones: artStones };
const artPainted = new Map();
// Paints a band's canvas to fill width CSS pixels at scale CSS pixels to the unit. The art is painted once per realm,
// time of day and width into a canvas of its own at four pixels to the unit (its drawing scaled by four, so the art
// places everything in units and draws inside them in quarter units), then copied onto the band's canvas at the
// screen's own pixels: shrunk with smoothing where the screen has fewer pixels than the art, so no row of detail is
// dropped, and otherwise enlarged with every pixel kept square.
function drawRealmArt(canvas, kind, night, width, scale = 3) {
  const W = Math.ceil(width / scale);
  const dark = night || kind === 'stones';
  const key = `${kind},${dark},${W}`;
  let art = artPainted.get(key);
  if (!art) {
    art = document.createElement('canvas');
    art.width = W * 4;
    art.height = ART_H * 4;
    const g = art.getContext('2d');
    g.setTransform(4, 0, 0, 4, 0, 0);
    artSky(g, W, dark, kind.length * 17);
    (REALM_ART[kind] ?? artMan)(g, W, dark);
    if (artPainted.size > 24) artPainted.delete(artPainted.keys().next().value);
    artPainted.set(key, art);
  }
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(W * scale * dpr);
  canvas.height = Math.round(ART_H * scale * dpr);
  canvas.style.width = `${W * scale}px`;
  canvas.style.height = `${ART_H * scale}px`;
  const v = canvas.getContext('2d');
  v.imageSmoothingEnabled = canvas.width < art.width;
  v.imageSmoothingQuality = 'high';
  v.drawImage(art, 0, 0, canvas.width, canvas.height);
}
