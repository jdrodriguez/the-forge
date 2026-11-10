// scenery.js: the backdrop for the Middle-earth view (scene.js), drawn in 32-bit, a quarter unit to the pixel on
// scene.js's canvas: the scene's constants, its sky colours by hour (skyAt, from scenery-sun.js's clock), the road, the
// war fires and the particles (sparks, runes, dust, leaves, fireworks, smoke, the sleepers' z). drawBackdrop draws the
// whole of it in order: the sky and the mountains are scenery-sky.js's and scenery-sky-qd.js's, each realm's ground and
// landmark and the lights that stay bright at night are scenery-land.js's, and Rivendell's waterfall is
// scenery-falls.js's. While main is red (scene.war, faded in and out by scene-orcs.js from 0 to 1) the sky turns red,
// two fires burn in each realm and the dark tower rises in the east (scene-tower.js). Drawn with sprites.js's pxBox and
// sprites-hd.js's qdMap. The road runs from ROAD_Y to the scene's bottom, 60 rows.
const SCENE_H = 224;
const GROUND_Y = 112;
const ROAD_Y = 164;
// A random row for a walker's feet on the road, clear of its shoulder and its near verge (drawRoad).
const roadRow = () => ROAD_Y + 8 + Math.floor(Math.random() * (SCENE_H - ROAD_Y - 13));

// Sky colours by the scene's hour (sunrise at 6.5, sunset at 18.5), [hour, top, horizon], blended between neighbours;
// scenery-sky.js runs each hour's pair down the sky in dithered steps.
const SKY = [[0, '#0b1026', '#1b2245'], [5, '#141a3a', '#4b3f6e'], [6.5, '#5d79b8', '#f0b48a'], [9, '#5fa6e6', '#cbe6f6'],
  [16.5, '#5fa6e6', '#d6ecf5'], [18.5, '#4a4b8f', '#f09a6a'], [20, '#151b3d', '#3d3466'], [24, '#0b1026', '#1b2245']];
const rgbOf = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hexOf = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const blend = (a, b, t) => hexOf(rgbOf(a).map((v, i) => v + (rgbOf(b)[i] - v) * t));
function skyAt(date = new Date()) {
  const hour = sceneHour(date);
  const i = SKY.findIndex(([h]) => h > hour);
  const [h0, t0, b0] = SKY[i - 1];
  const [h1, t1, b1] = SKY[i];
  const t = (hour - h0) / (h1 - h0);
  return { hour, top: blend(t0, t1, t), low: blend(b0, b1, t), night: hour < 6 || hour >= 19.5 };
}

const GROUND = { elf: ['#4f8f6a', '#3f7656'], hobbit: ['#6fae4a', '#5a943a'], dwarf: ['#7b736a', '#665f57'], man: ['#b9a35a', '#9c8846'] };
// A fixed pseudo-random number in [0, 1) for a seed, so textures and stars stay put between frames.
const rnd = (seed) => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };

// Two fires near the back of each realm, behind the stations; scene-orcs.js sends their smoke up. Each is a pair of
// logs, the upper laid across the lower, their bark lit on top with grain along it, charred at the burning ends and
// cracked with embers that pulse, their cut ends pale with rings; over them tongues of flame from a dark red edge to a
// pale heart that sway, leap and fall by tick, as tall as the war is strong, each fire out of step with the others.
// scenery-lights.js's drawLights adds their glow and draws the flames again over it (warFlames).
const warFires = (r) => [0.22, 0.78].map((f, k) => ({ x: r.x0 + Math.floor(r.w * f + (rnd(r.x0 + k) - 0.5) * 10), y: GROUND_Y + 5 + Math.floor(rnd(r.x0 + k + 40) * 3), k }));
const FIRE_LOGS = [
  '....cBllhllllhllllhllRrr....',
  '...cbbwlwwgwwlwwwgwwbRkkr...',
  '...cebwwgbbwwgbbwwbbbRrrR...',
  '....cBBbbBBbbbBBbBBBB.RR....',
  'cBllhllllhlllllhllllllhlRrr.',
  'cebwwlwwgwwwlwwfwwgwwlwRkkr.',
  'ccfbbwbbbebbwbbbbgbbebbbRrrR',
  '.cBBBBBBBBBBBBBBBBBBBBBB.RR.',
];
// The cracks' glow by tick, from a dull red to yellow and back.
const FIRE_PULSE = ['#5a1a0e', '#8e2c14', '#c2441c', PX.ember, PX.emberL, PX.ember, '#c2441c', '#8e2c14'];
const fireArt = new Map();
function drawFires(g, r, tick, war) {
  warFires(r).forEach((f) => {
    const s = (Math.floor((tick + f.k * 3 + r.x0) / 2)) % FIRE_PULSE.length;
    if (!fireArt.has(s)) {
      const cv = document.createElement('canvas');
      [cv.width, cv.height] = [7 * SC_RES, 2 * SC_RES];
      const lg = cv.getContext('2d');
      lg.scale(SC_RES, SC_RES);
      qdMap(lg, FIRE_LOGS, { c: '#1e1210', B: '#3a2414', b: '#55361b', w: PX.wood, g: '#6a4325', l: '#9a6a3a', h: '#b98a54', r: '#e0bc86', R: '#a87e4e',
        k: '#c79a62', e: FIRE_PULSE[s], f: FIRE_PULSE[(s + 4) % FIRE_PULSE.length] }, 0, 0);
      fireArt.set(s, cv);
    }
    g.drawImage(fireArt.get(s), f.x - 3, f.y - 1, 7, 2);
    warFlames(g, f, r.x0, tick, war);
  });
}
// Each tongue of a fire as [x from the fire's middle, half width at its base, tallest height, how fast it leaps], in
// units. Its colours run from the rim in, each step shorter and narrower, so a tongue is red at its edge and tip,
// orange in its body and pale at its heart near the base.
const FLAME_TONGUES = [[-2.5, 0.5, 2.25, 2], [-1.5, 0.75, 4, 3], [-0.5, 1, 5.5, 2], [0.5, 1, 6, 3], [1.5, 0.75, 4.5, 4], [2.5, 0.5, 2.5, 3], [0, 0.75, 3.5, 5]];
const FLAME_RAMP = [['#a8241a', 1, 1], [PX.red, 0.88, 0.86], [PX.ember, 0.74, 0.7], [PX.emberL, 0.56, 0.5], ['#fff3c4', 0.38, 0.28]];
const flameArt = new Map();
// A war fire's flames for this tick, from 24 frames painted once each at the war's strength (in eighths): the tongues
// sway and leap in a loop of 24 ticks, a flicker of fire sometimes breaks off a tip, and sparks rise; a bed of coals
// glows under them.
function warFlames(g, f, x0, tick, war) {
  const q = Math.max(1, Math.round(war * 8)) / 8;
  const n = (tick + f.k * 7 + x0 * 3) % 24;
  let art = flameArt.get(n);
  if (art?.q !== q) {
    art = { q, cv: art?.cv ?? document.createElement('canvas') };
    [art.cv.width, art.cv.height] = [8 * SC_RES, 9 * SC_RES];
    const lg = art.cv.getContext('2d');
    lg.setTransform(SC_RES, 0, 0, SC_RES, 0, 0);
    paintFlames(lg, n, q);
    flameArt.set(n, art);
  }
  g.drawImage(art.cv, f.x - 3, f.y - 9, 8, 9);
}
function paintFlames(g, n, q) {
  const a = (n / 24) * Math.PI * 2;
  const tongues = FLAME_TONGUES.map(([dx, w, h, k], i) => [3.5 + dx, w, Math.max(1, h * q * (0.64 + 0.22 * Math.sin(a * k + i * 1.9) + 0.14 * Math.sin(a * (k + 2) + i))), 0.7 * Math.sin(a * 2 + i * 1.3)]);
  for (const [c, kw, kh] of FLAME_RAMP) {
    for (const [cx, w, h, lean] of tongues) {
      const [ww, hh] = [w * kw, Math.max(0.5, h * kh)];
      for (let k = 0; k < hh * 4; k += 1) {
        const t = k / (hh * 4);
        const half = Math.max(0.25, Math.round(ww * (1 - t) ** 0.6 * Math.min(1, 0.8 + t * 1.5) * 4) / 4);
        pxBox(g, Math.round((cx + lean * t ** 1.5 - half) * 4) / 4, 8 - (k + 1) / 4, half * 2, 0.25, c);
      }
    }
  }
  for (let x = 1.5; x < 6; x += 0.25) if (rnd(x * 4 + n) < 0.6) pxBox(g, x, 8, 0.25, 0.25, FIRE_PULSE[(Math.floor(x * 4) + n) % FIRE_PULSE.length]);
  if (q > 0.5 && n % 6 < 3) {
    const [x, y] = [3 + (n % 3) * 0.5, 8 - tongues[3][2] - 0.75 - (n % 6) * 0.5];
    pxBox(g, x, y, 0.5, 0.5, PX.red);
    pxBox(g, x + 0.25, y, 0.25, 0.25, PX.ember);
  }
  for (let i = 0; i < 3; i += 1) pxBox(g, 1 + rnd(n * 3 + i) * 6, 8 - q * (3 + rnd(n * 5 + i) * 5) - 0.5, 0.25, 0.25, i ? PX.emberL : '#fff3c4');
}

// The top row of wheel rut i's trough (0 the far rut, 1 the near one) at column x, in units: it wanders a row or so up
// and down, a quarter unit at a time. scenery-snow.js's puddles sit in it.
const ROAD_RUTS = [[17, 0], [38, 40]];
const roadRut = (x, i) => ROAD_Y + ROAD_RUTS[i][0] + Math.round((Math.sin((x + ROAD_RUTS[i][1]) / 19) * 0.7 + Math.sin((x + ROAD_RUTS[i][1] * 3) / 7) * 0.3) * 4) / 4;
function drawBackdrop(g, scene, tick) {
  drawSky(g, scene.W, scene.sky, tick);
  if (scene.war) { drawWarSky(g, scene.W, scene.war, tick); drawTower(g, scene); }
  skNightEdge(g, scene.W, scene.sky);
  drawMountains(g, scene.W, scene.realms, scene.sky, tick);
  for (const r of scene.realms) {
    drawRealm(g, r, tick, scene.sky);
    if (scene.war) drawFires(g, r, tick, scene.war);
  }
  drawRoad(g, scene.W, scene.realms);
}

// Short-lived particles: forge sparks, elven runes, garden dust, falling leaves, petals and snow, fireworks, clashing
// blades, smoke (size 2) and the "z" rising from a sleeping worker (a glyph). They move in quarter units. A bit is a
// round unit lit on its upper left and shaded on its lower right that shrinks in steps to a pixel as it dies; one that
// sways (a leaf or petal) tumbles through three tilts as it swings, and a white one is a flake; smoke is a soft puff that
// swells and thins; a firework's spark trails a fading tail and crackles out after a white flash at its heart; a glyph
// is lit along its tops, casts a fine shadow and fades. A particle pushed by another file without max (its first life)
// keeps its size to the end.
const particles = [];
function spray(x, y, colors, n, { up = 1, spread = 1, life = 8, fall = 0.15, size = 1 } = {}) {
  for (let i = 0; i < n; i += 1) {
    const l = life + Math.random() * life;
    particles.push({ x, y, vx: (Math.random() - 0.5) * spread, vy: -Math.random() * up, life: l, max: l, color: colors[i % colors.length], fall, size });
  }
}
const Z_GLYPH = ['111', '001', '010', '111'];
function snore(x, y, color) {
  particles.push({ x, y, vx: 0.1, vy: -0.22, life: 26, max: 26, color, fall: 0, glyph: Z_GLYPH, sway: 0.25 });
}
// Two rings of sparks, the outer faster, and a flash where it bursts.
function burst(x, y) {
  const colors = [[PX.gold, PX.emberL], [PX.red, '#ff9a8a'], [PX.green, '#b9ffd8'], [PX.blue, '#e5f1ff']][Math.floor(Math.random() * 4)];
  for (let i = 0; i < 28; i += 1) {
    const a = ((i % 14) / 14) * Math.PI * 2 + (i < 14 ? 0 : Math.PI / 14);
    const v = i < 14 ? 1.4 : 0.85;
    const l = 12 + Math.random() * 6;
    particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, color: colors[i % 2], fall: 0.05, spark: true });
  }
  particles.push({ x, y, vx: 0, vy: 0, life: 3, max: 3, color: '#ffffff', fall: 0, flash: true });
}
// A colour's lit, base and shade, worked out once.
const partPals = new Map();
const partPal = (c) => partPals.get(c) ?? partPals.set(c, { l: hdMix(c, '#ffffff', 0.45), b: c, s: hdMix(c, HD_DARK, 0.3), w: '#ffffff' }).get(c);
const litOf = (c) => partPal(c).l;
// A bit's shapes as it dies, largest first, and a tumbling leaf's three tilts.
const PART_BIT = [['.lb.', 'lbbs', 'bbss', '.ss.'], ['.l.', 'lbs', '.s.'], ['lb', 'bs'], ['b']];
const PART_LEAF = [['lb..', '.bbs', '..ss'], ['.lbb', 'bbss'], ['..lb', '.bbs', 'ss..']];
const PART_FLAKE = ['.l.', 'lwl', '.l.'];
const PART_SPARK = ['.b.', 'blb', '.b.'];
// Smoke puffs by colour and size step, painted once: a soft round puff, its rim half clear, lit on its upper left and a
// shade darker on its lower right.
const partSmoke = new Map();
function smokePuff(c, k) {
  const key = `${c}${k}`;
  if (!partSmoke.has(key)) {
    const r = 1 + k * 0.25;
    const [l, b, s, e] = [skPack(hdMix(c, '#ffffff', 0.25)), skPack(c), skPack(hdMix(c, HD_DARK, 0.15)), skPack(c, 0.5)];
    const cv = document.createElement('canvas');
    cv.width = cv.height = 4 * SC_RES;
    skBody(cv, 4, (u, v, d) => (d >= r ? null : d > r * 0.7 ? e : u + v < -r * 0.5 ? l : u + v > r * 0.6 ? s : b));
    partSmoke.set(key, cv);
  }
  return partSmoke.get(key);
}
function stepParticles(g, frozen) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    if (!frozen) { p.x += p.vx + (p.sway ? Math.sin(p.life / 3) * p.sway : 0); p.y += p.vy; p.vy += p.fall; p.life -= 1; }
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const x = Math.round(p.x * 4) / 4;
    const y = Math.round(p.y * 4) / 4;
    const left = p.max ? p.life / p.max : 1;
    g.globalAlpha = Math.min(1, left * 2.5);
    if (p.glyph) partGlyph(g, p, x, y);
    else if (p.flash) {
      skQDisc(g, x + 0.5, y + 0.5, p.life * 0.75, '#fff6d8');
      pxBox(g, x + 0.5 - p.life * 1.5, y + 0.5, p.life * 3, 0.25, '#ffffff');
      pxBox(g, x + 0.5, y + 0.5 - p.life * 1.5, 0.25, p.life * 3, '#ffffff');
    } else if (p.spark) {
      for (const k of [4, 3, 2, 1]) {
        g.globalAlpha = (1 - k * 0.2) * Math.min(1, left * 2);
        pxBox(g, Math.round((p.x + 0.25 - p.vx * k * 0.5) * 4) / 4, Math.round((p.y + 0.25 - p.vy * k * 0.5) * 4) / 4, 0.25, 0.25, k > 2 ? p.color : litOf(p.color));
      }
      g.globalAlpha = 1;
      if (left > 0.5) qdMap(g, PART_SPARK, partPal(p.color), x, y);
      else if (left > 0.3) qdMap(g, PART_BIT[2], partPal(p.color), x, y);
      else if (left > 0.18) pxBox(g, x, y, 0.25, 0.25, p.color);
      else if (Math.floor(p.life * 2) % 2) qdMap(g, PART_FLAKE, { l: p.color, w: '#ffffff' }, x - 0.25, y - 0.25);
    } else if ((p.size || 1) >= 2) {
      g.globalAlpha *= 0.9;
      g.drawImage(smokePuff(p.color, Math.min(3, Math.floor((1 - left) * 4))), x - 1, y - 1, 4, 4);
    } else if (p.sway && p.color === '#ffffff') qdMap(g, PART_FLAKE, { l: '#dce8f8', w: '#ffffff' }, x, y);
    else if (p.sway) qdMap(g, PART_LEAF[Math.sign(Math.round(Math.sin(p.life / 3) * 1.6)) + 1], partPal(p.color), x, y);
    else {
      const k = left > 0.55 ? 0 : left > 0.3 ? 1 : left > 0.15 ? 2 : 3;
      qdMap(g, PART_BIT[k], partPal(p.color), x + [0, 0.25, 0.25, 0.375][k], y + [0, 0.25, 0.25, 0.375][k]);
    }
  }
  g.globalAlpha = 1;
}
// A glyph ("z", a note) in unit cells: a fine shadow down and right, the cells, and a lit edge along the top of each
// stroke.
function partGlyph(g, p, x, y) {
  const P = partPal(p.color);
  for (const [dx, c] of [[0.25, hdMix(p.color, HD_DARK, 0.7)], [0, p.color]]) {
    p.glyph.forEach((row, r) => [...row].forEach((on, k) => { if (on === '1') pxBox(g, x + k + dx, y + r + dx, 1, 1, c); }));
  }
  p.glyph.forEach((row, r) => [...row].forEach((on, k) => { if (on === '1' && p.glyph[r - 1]?.[k] !== '1') pxBox(g, x + k, y + r, 1, 0.25, P.l); }));
}
