// scenery-qd.js: the 32-bit art of scenery.js that does not fit there: the road, from its grassy top edge through the
// ruts to its verge. Loaded right after scenery.js; drawBackdrop there draws it last, over each realm's ground.

// The road's dirt: lit, base, shade and dark, then the ruts' troughs and lips.
const ROAD_DIRT = ['#ad8d63', '#9b7b55', '#85684a', '#6c5239', '#a4855d', '#c2a374', '#b8996b', '#a88a5f', '#7a5e42'];
// Stones in quarter units, lit on the upper left with a shadow on the dirt below, in three sizes and three kinds of rock.
const PEBBLE = [['.lb.', 'lbbs', '.sso', '..dd'], ['.hll..', 'hlbbs.', 'lbbbss', '.bssso', '..dddd'],
  ['..hlll...', '.hllbbb..', 'hlbbbbbs.', 'lbbbbbsss', '.bbbsssso', '..ossooo.', '...dddddd']];
const PEBBLE_PAL = [['#e6e1d8', '#c9c3b8', '#a19b92', '#78726b', '#57524d'], ['#ecd9b8', '#cdb48c', '#a88d68', '#7f6a4f', '#5e4d39'],
  ['#d6dbe0', '#aeb4bc', '#878e98', '#646a73', '#484d55']].map(([h, l, b, s, o]) => ({ h, l, b, s, o, d: '#735a40' }));
// A tuft of grass at (x, y) on the road: blades a quarter unit wide, the middle ones tallest, leaning out from their
// root, lit at the tips, over a shadow on the dirt (none in the verge's grass).
function roadTuft(g, x, y, [tip, blade, root], tall, dirt = true) {
  if (dirt) pxBox(g, x - 0.25, y, 1.75, 0.25, ROAD_DIRT[2]);
  [[0, 0.5, -1], [0.25, 0.75, -0.5], [0.5, 1, 0], [0.75, 0.75, 0.5], [1, 0.5, 1]].forEach(([dx, h, lean]) => {
    const hh = h * tall;
    for (let k = 0; k < hh; k += 0.25) pxBox(g, x + dx + Math.round(lean * (k / hh) ** 2 * 2) / 4, y - k - 0.25, 0.25, 0.25, k + 0.5 > hh ? tip : k < 0.5 ? root : blade);
  });
}

// The road, ROAD_Y down to the bottom of the scene. From the top: each realm's grass hanging over its edge in blades
// with a shadow under them, a pale shoulder dithered into the dirt, patches of lighter and darker earth with clods lit
// on top, the far and the near wheel rut (roadRut), each a trough dark under its far lip and lit along its near one with
// tread marks along its floor, tufts of dry grass along the crown between them, stones and grit, and along the bottom
// a ragged verge of each realm's own ground: blades lit at the tips, long in Rohan, and kerb stones under Erebor.
// Nothing on it moves, so it is painted once per layout into a layer (skLayer, scenery-sky.js); everything is placed by
// a fixed seed.
function drawRoad(g, W, realms) {
  const key = `${W},${realms.map((r) => `${r.kind}${r.x0}`).join()}`;
  g.drawImage(skLayer('road', key, W, SCENE_H - ROAD_Y, (lg, cv) => { roadDirt(cv); lg.translate(0, -ROAD_Y); paintRoad(lg, W, realms); }), 0, ROAD_Y, W, SCENE_H - ROAD_Y);
}
// The bare earth pixel by pixel: the shoulder, the shadow under the grass and broad patches, each edge dithered.
function roadDirt(cv) {
  const P = skPixels(cv);
  const [L, B, S, , M] = ROAD_DIRT.map((c) => skPack(c));
  for (let j = 0; j < P.h; j += 1) {
    const y = j / SC_RES;
    for (let i = 0; i < P.w; i += 1) {
      const x = i / SC_RES;
      const b = BAYER[(j & 3) * 4 + (i & 3)] / 16;
      const n = Math.sin(x / 3.1 + Math.sin(y / 1.7) * 2) * Math.cos(y / 2.3 + x / 7.3) + 0.45 * Math.sin(x / 1.3 + y * 0.9);
      let c = n + b * 0.2 > 1.1 ? M : n - b * 0.2 < -1.1 ? S : B;
      if (y < 4.5 && b < (4.5 - y) / 3.5) c = y < 2.5 && n + b > 1.3 ? L : M;
      if (y >= 0.5 && y < 1 + (i % 7 === 0 ? 0.25 : 0)) c = S;
      P.px[j * P.w + i] = c;
    }
  }
  P.done();
}
function paintRoad(g, W, realms) {
  const H = SCENE_H - ROAD_Y;
  const [dirtL, , dirtS, dirtD, , lipL, lip, lipS, floor] = ROAD_DIRT;
  for (let i = 0; i < W * 1.2; i += 1) {
    const [x, y] = [Math.floor(rnd(i + 500) * W * 4) / 4, ROAD_Y + 2 + Math.floor(rnd(i + 900) * (H - 7) * 4) / 4];
    pxBox(g, x, y, 0.5, 0.25, dirtL);
    pxBox(g, x, y + 0.25, 0.5, 0.25, dirtS);
  }
  for (const k of [0, 1]) {
    for (let x = 0; x < W; x += 0.25) {
      const y = roadRut(x, k);
      pxBox(g, x, y - 0.25, 0.25, 0.25, dirtL);
      pxBox(g, x, y, 0.25, 0.5, dirtD);
      pxBox(g, x, y + 0.5, 0.25, 0.75, floor);
      pxBox(g, x, y + 1.25, 0.25, 0.75, dirtS);
      if ((x * 4) % 6 < 1) pxBox(g, x, y + 1, 0.25, 0.5, dirtD);
      pxBox(g, x, y + 2, 0.25, 0.25, lipL);
      pxBox(g, x, y + 2.25, 0.25, 0.25, lip);
      pxBox(g, x, y + 2.5, 0.25, (x * 4) % 3 ? 0.5 : 0.25, lipS);
    }
  }
  for (let i = 0; i < W / 9; i += 1) roadTuft(g, Math.floor(rnd(i + 1300) * W * 4) / 4, ROAD_Y + 13.5 + Math.floor(rnd(i + 1700) * 10) / 4, ['#c4c27a', '#9aa356', '#6f7a3c'], 1 + rnd(i + 1900) * 1.25);
  for (let i = 0; i < W / 7; i += 1) {
    const big = rnd(i + 2300);
    const at = [Math.floor(rnd(i + 2100) * W * 4) / 4, ROAD_Y + 2.5 + Math.floor(rnd(i + 2500) * (H - 9) * 4) / 4];
    qdMap(g, PEBBLE[big < 0.6 ? 0 : big < 0.9 ? 1 : 2], PEBBLE_PAL[i % 3], ...at);
  }
  for (const r of realms) roadVerge(g, r);
}
// A realm's edges of the road: its grass hanging over the top in blades, and its verge along the bottom, from the
// colours of its own ground.
function roadVerge(g, r) {
  const [grass, grassD] = GROUND[r.kind] ?? GROUND.man;
  const [lit, tip, deep] = [hdMix(grass, HD_LIGHT, 0.16), hdMix(grass, HD_LIGHT, 0.35), hdMix(grassD, HD_DARK, 0.25)];
  for (let x = r.x0; x < r.x0 + r.w; x += 0.25) {
    const s = x * 4;
    pxBox(g, x, ROAD_Y, 0.25, 0.5, rnd(s + 3000) < 0.5 ? grassD : deep);
    if (rnd(s + 3100) < 0.45) pxBox(g, x, ROAD_Y + 0.5, 0.25, 0.25 * (1 + Math.floor(rnd(s + 3300) * 3)), s % 3 ? grassD : grass);
  }
  if (r.kind === 'dwarf') return roadKerb(g, r, [hdMix(grass, HD_LIGHT, 0.4), '#a39b90', grass, '#857d73', grassD, deep]);
  const long = r.kind === 'man' ? 1.5 : 0;
  for (let x = r.x0; x < r.x0 + r.w; x += 0.25) {
    const s = x * 4;
    const clump = Math.abs(Math.sin(s * 0.55 + Math.sin(s * 0.13) * 3));
    const h = 2.75 + clump * (1.25 + long) + Math.floor(rnd(s + 3500) * 3) / 4;
    const back = rnd(s + 3700) < 0.3;
    pxBox(g, x, SCENE_H - h, 0.25, h, back ? grassD : grass);
    pxBox(g, x, SCENE_H - h, 0.25, 0.25, back ? grass : tip);
    if (!back) pxBox(g, x, SCENE_H - h + 0.25, 0.25, 0.5, lit);
    if (rnd(s + 3900) > 0.75) pxBox(g, x, SCENE_H - 1.5 - Math.floor(rnd(s + 4100) * 4) / 4, 0.25, 0.5, deep);
  }
  for (let i = 0; i < r.w / 8; i += 1) roadTuft(g, r.x0 + Math.floor(rnd(r.x0 + i + 4300) * (r.w - 2) * 4) / 4, SCENE_H - 2.5 - long + Math.floor(rnd(i + 4500) * 4) / 4, [tip, grass, grassD], 2.5 + long, false);
}
// Erebor's edge of the road: a row of kerb stones of its grey rock, each lit along its top and left and shaded below,
// with dark joints between them.
function roadKerb(g, r, [hi, l, b, s, d, o]) {
  let x = r.x0;
  for (let i = 0; x < r.x0 + r.w; i += 1) {
    const w = Math.min(r.x0 + r.w - x, 2.5 + Math.floor(rnd(r.x0 + i + 4700) * 6) / 4);
    const top = SCENE_H - 2.5 - Math.floor(rnd(i + 4900) * 3) / 4;
    pxBox(g, x, top, w, SCENE_H - top, b);
    pxBox(g, x, top, w - 0.25, 0.25, hi);
    pxBox(g, x, top + 0.25, 0.25, SCENE_H - top - 0.5, l);
    pxBox(g, x + w - 0.5, top + 0.5, 0.25, SCENE_H - top - 0.5, s);
    pxBox(g, x, SCENE_H - 0.5, w, 0.5, d);
    pxBox(g, x + w - 0.25, top, 0.25, SCENE_H - top, o);
    if (rnd(i + 5100) < 0.5) pxBox(g, x + 0.75, top + 1, 0.5, 0.25, s);
    x += w;
  }
}
