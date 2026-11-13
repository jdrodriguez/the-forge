// scene-wind.js: the breeze through the Middle-earth view (scene.js). sc.wind.at(x, tick) is how far things at column x
// lean with the wind, -1 to 1 (positive toward the east): a steady push plus gusts, bumps of stronger wind that travel
// downwind across the scene, summed from three slow waves of different lengths and speeds so they come irregularly, and
// a slow swell that eases them all. It blows harder, and the way sc.weather.wind says (scene-weather.js), in rough
// weather; with reduced motion it is still. sc.wind.tree is a tree's sway: the wind at its column a moment late,
// rocking on its own beat. What it moves: the grass tufts on each realm's ground (not Erebor's stone) and the Shire's
// garden plants, here in the ground layer; Rivendell's trees, the chimney smoke and Rohan's pennant (scenery-land.js,
// scenery-elves.js); and in autumn a leaf now and then torn from a tree that drifts down and away (the air layer). The
// grass and the leaves are drawn in 32-bit, in pixels a quarter unit across. Loaded after scene.js.

// The gusts: [weight, wavelength in units, speed in units a tick, phase].
const WIND_WAVES = [[0.6, 31, 2.4, 0], [0.45, 53, 1.7, 2], [0.3, 19, 3.2, 4]];
const windPush = () => sc.weather?.wind ?? 0;
const windDir = () => (windPush() < -0.05 ? -1 : 1);
const windStrength = () => 0.55 + 0.45 * Math.min(1, Math.abs(windPush()));
// The slow part of the wind at column x: what the trees answer to.
function windGust(x, t) {
  if (scReduced.matches) return 0;
  const dir = windDir();
  let s = 0;
  for (const [a, len, v, p] of WIND_WAVES) {
    const q = Math.sin((x * dir - v * t) / len + p);
    if (q > 0) s += a * q * q;
  }
  const swell = 0.75 + 0.25 * Math.sin(t / 173 + 1);
  return dir * windStrength() * (0.2 + 0.8 * Math.min(1, s) * swell);
}
sc.wind = {
  get dir() { return windDir(); },
  // The gusts and a light flutter on top, which the grass catches.
  at: (x, tick) => (scReduced.matches ? 0 : windGust(x, tick) + 0.1 * windStrength() * Math.sin(tick * 0.9 + x * 0.41)),
  // A tree answers its column's gusts a few ticks late, by its seed, and rocks on a beat of its own as they push it.
  tree(x, seed, tick) {
    const g = windGust(x, tick - 2 - (seed % 4));
    return g + Math.abs(g) * 0.3 * Math.sin(tick / (4 + (seed % 3)) + seed);
  },
};

// The grass. A realm's small tufts (landTufts, scenery-land.js) and a sparser scatter of taller clumps, longer in Rohan,
// are kept off its landmarks and props, the places its workers stand and its desks, the war fires and the road, then
// grouped into strips WIND_CHUNK units wide, the Shire's garden plants with them. Each strip is painted at each of nine
// bends as it is first needed (a canvas each, kept for the layout, and another set while deep snow lies) and drawn each
// frame at the bend of the wind at its middle, so a gust's front crosses strip by strip.
const WIND_CHUNK = 6;
const windFields = new Map();

// Every place a worker stands in a realm's props (its spot, its spots, the harp, the forge, a tree's or a bench's
// place): anything with a column, a row and a facing.
function windSpots(o, add, seen = new Set()) {
  if (!o || typeof o !== 'object' || seen.has(o)) return;
  seen.add(o);
  if (typeof o.x === 'number' && typeof o.y === 'number' && 'face' in o) add(o);
  for (const v of Object.values(o)) windSpots(v, add, seen);
}
// The boxes [x0, y0, x1, y1] the grass must stay out of.
function windKeepOut(r, P) {
  const cx = r.x0 + Math.floor(r.w / 2);
  const out = [...P.solid, ...P.list.map((p) => [p.x - 1, p.y - 1, p.x + p.w, p.base + 1])];
  for (const s of sc.stations) if (s.realm === r && !s.sentry) out.push([s.x - 9, s.y - 7, s.x + 9, s.y + 2]);
  for (const f of warFires(r)) out.push([f.x - 4, f.y - 4, f.x + 5, f.y + 2]);
  windSpots(P, (s) => out.push([s.x - 3, s.y - 4, s.x + 3, s.y + 1]));
  if (r.kind === 'elf') for (const [x] of Object.values(elfTrees(r)).flat()) out.push([x - 2, GROUND_Y - 4, x + 4, GROUND_Y + 8]);
  // The Shire's beds and hill, its fence and its vegetable patch. Rohan's hill and stables are its solid ground.
  if (r.kind === 'hobbit') out.push([cx - 25, GROUND_Y - 4, cx + 25, GROUND_Y + 11], [r.x0 + r.w - 24, GROUND_Y, r.x0 + r.w, GROUND_Y + 8], [cx + 26, GROUND_Y + 9, r.x0 + r.w - 4, GROUND_Y + 21]);
  return out;
}
// A realm's strips, worked out again when its layout changes. Each blade of grass is [x, y, tall, clump]: a tuft's
// middle blade tall units taller, or a clump whose tallest blade is clump half units.
function windField(r) {
  const P = realmProps(r);
  const key = `${r.kind},${r.x0},${r.w},${P.key}`;
  const old = windFields.get(r.x0);
  if (old?.key === key) return old;
  for (const k of windFields.keys()) if (!sc.realms.some((q) => q.x0 === k)) windFields.delete(k);
  const keep = windKeepOut(r, P);
  const strips = [];
  const strip = (i) => (strips[i] ??= { i, grass: [], garden: false, art: [] });
  const plant = (x, y, tall, clump) => {
    const [x1, top] = clump ? [x + 4, clump / 2 + 0.5] : [x + 2, 3];
    if (y > ROAD_Y - 1.5 || keep.some((b) => x1 > b[0] && x - 0.5 < b[2] + 1 && y + 0.5 > b[1] && y - top < b[3] + 1)) return;
    strip(Math.floor((x - r.x0) / WIND_CHUNK)).grass.push([x, y, tall, clump]);
  };
  for (const [x, y, tall] of landTufts(r)) plant(x, y, tall, 0);
  const man = r.kind === 'man';
  for (let i = 0; i < Math.ceil(r.w / (man ? 6 : 10)); i += 1) {
    const h = man ? 7 + (i % 2) : 6;
    plant(r.x0 + 1 + Math.floor(rnd(r.x0 * 5 + i * 7 + 900) * (r.w - 5) * 2) / 2, GROUND_Y + 5 + Math.floor(rnd(r.x0 * 7 + i * 11 + 950) * (ROAD_Y - GROUND_Y - 7) * 2) / 2, 0, h);
  }
  const cx = r.x0 + Math.floor(r.w / 2);
  if (r.kind === 'hobbit') for (let x = cx - 24; x < r.x0 + r.w; x += WIND_CHUNK) strip(Math.floor((x - r.x0) / WIND_CHUNK)).garden = true;
  for (const s of strips) {
    if (!s) continue;
    const xa = r.x0 + s.i * WIND_CHUNK;
    s.grass.sort((a, b) => a[1] - b[1]);
    s.span = [xa, xa + WIND_CHUNK];
    s.mid = xa + WIND_CHUNK / 2;
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const [x, y, tall, clump] of s.grass) [x0, y0, x1, y1] = [Math.min(x0, x - 3.5), Math.min(y0, y - (clump ? clump / 2 : 1.5 + tall) - 0.5), Math.max(x1, x + 6.5), Math.max(y1, y + 0.5)];
    if (s.garden) [x0, y0, x1, y1] = [Math.min(x0, xa - 1.5), Math.min(y0, GROUND_Y - 8), Math.max(x1, xa + WIND_CHUNK + 3), Math.max(y1, GROUND_Y + 21)];
    s.box = [x0, y0, x1 - x0, y1 - y0];
  }
  const f = { key, r, cx, strips: strips.filter(Boolean) };
  windFields.set(r.x0, f);
  return f;
}

// One blade of grass n pixels tall from its foot at (x, y), in quarter units: each pixel up the blade leans further, by
// rest (where its tip points with no wind, in units) and bend (how far the wind pushes its tip), more near the tip, so
// it curves; dark low down, then its own tone, its tip lit. Runs of one colour down a column are one rect. From cut up
// only (the rest under snow).
function windBlade(g, x, y, n, rest, bend, [tip, , , , deep], tone, cut = 0) {
  let run = null;
  const flush = () => { if (run) pxBox(g, run[0], run[1], 0.25, run[2], run[3]); };
  for (let i = cut; i < n; i += 1) {
    const t = (i + 1) / n;
    const px = x + Math.round((rest * t ** 1.3 + bend * t ** 1.8) * 4) / 4;
    const c = i === n - 1 ? tip : i < n * 0.3 ? deep : tone;
    const py = y - 0.25 - i / 4;
    if (run && run[0] === px && run[3] === c) { run[1] = py; run[2] += 0.25; continue; }
    flush();
    run = [px, py, 0.25, c];
  }
  flush();
}
// The ramp of a realm's grass from its ground's colours (scenery.js's GROUND), so the blades stand out from the ground
// both ways: a sunlit tip and lit blades paler than it, and blades, shade and a dark foot darker, warmer in the light
// and cooler in the shade.
function windRamp(kind) {
  const [grass, grassD] = GROUND[kind] ?? GROUND.man;
  const shade = hdMix(hdMix(grassD, HD_DARK, 0.22), '#1d3a4a', 0.1);
  return [hdMix(hdMix(grass, HD_LIGHT, 0.55), '#fff2b0', 0.15), hdMix(grass, HD_LIGHT, 0.32), hdMix(grassD, HD_DARK, 0.08), shade, hdMix(grassD, HD_DARK, 0.45)];
}
// A tuft's five blades, [foot, rest, share of the tallest, tone (1 lit, 2 base, 3 shade)]: the middle tallest, the
// outer ones splaying, the left ones lit from the upper left. A clump's seven fan wider and taller. In Rohan the clumps'
// three tallest blades carry a head of seed.
const WIND_TUFT = [[-0.25, -0.6, 0.55, 3], [0.25, -0.3, 0.8, 1], [0.5, 0.05, 1, 1], [0.75, 0.4, 0.75, 2], [1.25, 0.75, 0.5, 3]];
const WIND_FAN = [[0.5, -1.25, 0.55, 3], [0.75, -0.6, 0.8, 1], [1, -0.1, 0.95, 1], [1.25, 0.4, 1, 2], [1.5, 0.9, 0.85, 1], [1.75, 1.6, 0.7, 2], [2, 2.3, 0.45, 3]];
const WIND_SEED = ['#e9d595', '#c9ad62'];
// A tuft (tall half units taller in the middle) or a clump (its tallest h half units) at (x, y), bent k (-4 to 4), over
// its foot's shadow; with snow, its lower part buried under a small mound and its tips frosted.
function windGrass(g, x, y, tall, h, k, pal, seeds, snow) {
  const fan = h ? WIND_FAN : WIND_TUFT;
  const most = h ? h * 2 : (1.5 + tall) * 4;
  const cut = snow ? Math.round(most * 0.35) : 0;
  if (!snow) pxBox(g, x - 0.5 + (h ? 0.5 : 0), y, h ? 2.5 : 2, 0.25, pal[4]);
  fan.forEach(([foot, rest, share, tone], b) => {
    const n = Math.max(2, Math.round(most * share));
    const bend = (k / 4) * 0.85 * (n / 4);
    windBlade(g, x + foot, y, n, rest * (n / most), bend, snow ? ['#f4f8ff', ...pal.slice(1)] : pal, pal[tone], cut);
    if (seeds && share >= 0.85) {
      const tx = x + foot + Math.round((rest * (n / most) + bend) * 4) / 4;
      pxBox(g, tx, y - n / 4 - 0.25, 0.25, 0.5, WIND_SEED[0]);
      pxBox(g, tx + (k > 0 ? 0.25 : -0.25), y - n / 4, 0.25, 0.25, WIND_SEED[1]);
    }
  });
  if (snow) {
    const w = h ? 2.25 : 1.75;
    const x0 = x - 0.5 + (h ? 0.5 : 0);
    pxBox(g, x0, y - cut / 4 + 0.25, w, cut / 4, '#eaf0f8');
    pxBox(g, x0 + 0.25, y - cut / 4, w - 0.5, 0.25, '#fbfdff');
    pxBox(g, x0, y, w, 0.25, '#c4d0e4');
  }
}
// One strip of a realm painted at bend k (-4 to 4): its garden plants (their tops lean at most a half unit) and its
// grass, the nearer over the farther.
function windArt(f, s, k, snow) {
  const [bx, by, bw, bh] = s.box;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(bw * SC_RES);
  cv.height = Math.ceil(bh * SC_RES);
  const g = cv.getContext('2d');
  g.setTransform(SC_RES, 0, 0, SC_RES, -bx * SC_RES, -by * SC_RES);
  const pal = windRamp(f.r.kind);
  const kg = Math.max(-1, Math.min(1, k / 2));
  if (s.garden) drawGardens(g, f.r, f.cx, (x) => (x >= s.span[0] && x < s.span[1] ? kg : null), 'plants');
  for (const [x, y, tall, clump] of s.grass) windGrass(g, x, y, tall, clump, k, pal, clump && f.r.kind === 'man', snow);
  return cv;
}
// At most four new paintings a frame, so a first gust or a new layout doesn't stall a frame; a strip whose bend isn't
// painted yet shows the nearest bend it has meanwhile. While snow lies at least half deep, the snowy set is drawn.
const windNear = (art, k) => [0, 1, -1, 2, -2, 3, -3, 4, -4].map((d) => art[k + 4 + d]).find(Boolean);
sc.layers.ground.push((g, s, tick) => {
  let budget = 4;
  const snow = (s.weather?.snow ?? 0) >= 0.5;
  for (const r of s.realms) {
    if (r.kind === 'dwarf') continue;
    const f = windField(r);
    for (const st of f.strips) {
      const art = snow ? (st.snow ??= []) : st.art;
      const k = Math.max(-4, Math.min(4, Math.round(s.wind.at(st.mid, tick) * 4.2)));
      const near = art[k + 4] ?? (budget > 0 || !art.some(Boolean) ? null : windNear(art, k));
      if (!near) budget -= 1;
      const cv = near ?? (art[k + 4] = windArt(f, st, k, snow));
      g.drawImage(cv, st.box[0], st.box[1], st.box[2], st.box[3]);
    }
  }
});

// Autumn's leaves: now and then, more often in a gust, a leaf comes off one of Rivendell's trees from the middle of its
// canopy, in one of the tree's own colours, and drifts down and away with the wind at its column, tumbling through four
// turns (flat, tipped, on edge, tipped the other way), lit at its tip and dark at its stalk, until it settles on the
// ground for a moment and fades.
const WIND_LEAF = [['lmm.', '.mdd'], ['..l', '.md', 'md.'], ['l', 'm', 'd'], ['l..', 'dm.', '.dm']];
const windLeaves = [];
const windSeason = { at: -999, name: '' };
sc.layers.air.push((g, s, tick) => {
  if (scReduced.matches) { windLeaves.length = 0; return; }
  if (Math.abs(tick - windSeason.at) > 50) Object.assign(windSeason, { at: tick, name: seasonNow() });
  for (const r of s.realms) {
    if (r.kind !== 'elf' || windSeason.name !== 'autumn' || windLeaves.length >= 14 || Math.random() > 0.05) continue;
    const t = elfTrees(r);
    const all = [...t.small.map(([x, h, seed]) => [x, h, seed, 0.6]), ...t.tall.map(([x, h]) => [x, h, x, 1])];
    if (!all.length) continue;
    const [x, h, seed, size] = all[Math.floor(Math.random() * all.length)];
    const lean = s.wind.at(x, tick);
    if (Math.random() > 0.3 + Math.abs(lean)) continue;
    const [[mid, lit], dots] = canopyOf('autumn', seed);
    const c = [mid, lit, dots[0]][Math.floor(Math.random() * 3)];
    windLeaves.push({ x: x + 1 + (Math.random() - 0.5 + Math.sign(lean) * 0.25) * 10 * size, y: GROUND_Y + 6 - h - 8 * size + (0.25 + Math.random() * 0.4) * 24 * size,
      vx: 0, life: 0, max: 80 + Math.random() * 60, land: GROUND_Y + 6 + Math.random() * 40, c, l: hdMix(c, HD_LIGHT, 0.4), d: hdMix(c, HD_DARK, 0.35), phase: Math.random() * 6 });
  }
  for (let i = windLeaves.length - 1; i >= 0; i -= 1) {
    const lf = windLeaves[i];
    lf.life += 1;
    if (lf.life > lf.max || lf.x < -4 || lf.x > s.W + 4) { windLeaves.splice(i, 1); continue; }
    const down = lf.y >= lf.land;
    if (down) lf.max = Math.min(lf.max, lf.life + 8);
    else {
      lf.vx += (s.wind.at(lf.x, tick) * 0.9 - lf.vx) * 0.15;
      lf.x += lf.vx + Math.sin(lf.life / 3 + lf.phase) * 0.12;
      lf.y += 0.15 + 0.08 * Math.sin(lf.life / 4 + lf.phase);
    }
    const [x, y] = [Math.round(lf.x * 4) / 4, Math.round(lf.y * 4) / 4];
    const shape = WIND_LEAF[down ? 0 : Math.floor(lf.life / 2 + lf.phase) % 4];
    g.globalAlpha = Math.min(1, (lf.max - lf.life) / 8);
    shape.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') pxBox(g, x + i / 4, y + j / 4, 0.25, 0.25, ch === 'l' ? lf.l : ch === 'm' ? lf.c : lf.d); }));
  }
  g.globalAlpha = 1;
});
