// sprites-saruman-stone.js: Saruman's palantír for the Middle-earth view (scene-saruman.js), at 32-bit like his figure
// (sprites-saruman.js): a ball of dark glass 3.5 units across in the cup of a dark stone pedestal 7 units tall, a capital
// over a fluted column on a plinth of two blocks, lit from the upper left. Unlit, the glass is near black with a cold
// glint and a faint rim. Lit, it glows from deep inside in an engine's colour (blue for Codex,
// amber for Grok), brightest at its heart, with two arms of light turning inside it; when both engines
// run the arms take the other engine's colour. Its halo and the light it casts on the ground and on Saruman's face, beard,
// hands and robe are added with the canvas's 'lighter' blend in the colour itself, so a blue light stays blue. Each
// picture is painted once at SC_RES and copied.

// The pedestal's tiers from its cup down to the ground: half its width in pixels, and how each row is shaded.
const SAR_PED = [[6, 'rim'], [6, 'cup'], [5, 'cup'], [4, 'cup'], [3, 'neck'], [7, 'top'], [7, 'slab'], [7, 'under'],
  ...Array.from({ length: 12 }, (_, i) => [4, i === 5 || i === 6 ? 'band' : 'shaft']), [6, 'top'], [6, 'slab'], [6, 'under'],
  [8, 'top'], [8, 'block'], [8, 'joint'], [8, 'block'], [9, 'foot']];
const SAR_ROCK = { O: '#0f0d14', 1: '#1b1822', 2: '#27232f', 3: '#35303e', 4: '#48424f', 5: '#5f5868' };
const sarArt = new Map();
// A picture w by h pixels (quarter units) painted once by paint(set), set(c, r, colour) filling one pixel.
function sarPaint(key, w, h, paint) {
  let cv = sarArt.get(key);
  if (cv) return cv;
  cv = document.createElement('canvas');
  cv.width = (w * SC_RES) / 4;
  cv.height = (h * SC_RES) / 4;
  const g = cv.getContext('2d');
  g.scale(SC_RES / 4, SC_RES / 4);
  paint((c, r, col) => { g.fillStyle = col; g.fillRect(c, r, 1, 1); });
  if (sarArt.size > 600) sarArt.delete(sarArt.keys().next().value);
  sarArt.set(key, cv);
  return cv;
}

// The pedestal with the middle of its foot on (x, y).
function drawSarPedestal(g, x, y) {
  const cv = sarPaint('pedestal', 18, SAR_PED.length, (set) => SAR_PED.forEach(([half, kind], r) => {
    for (let c = 9 - half; c < 9 + half; c += 1) {
      const u = (c - (9 - half)) / (2 * half - 1);
      let t = u < 0.12 ? 5 : u < 0.34 ? 4 : u < 0.62 ? 3 : u < 0.86 ? 2 : 1;
      if (kind === 'rim' || kind === 'top') t = Math.min(5, t + 1);
      if (kind === 'under' || kind === 'neck') t = Math.max(1, t - 1);
      if (kind === 'shaft' && c % 2 === 0 && t > 1 && t < 5) t -= 1;
      if (kind === 'band') t = Math.min(5, t + (r % 2 ? 0 : 1));
      if (kind === 'joint' && (c === 9 - half + 5 || c === 9 + half - 6)) t = 1;
      const edge = c === 9 - half || c === 8 + half || kind === 'foot' || (kind === 'cup' && c === 9 - half + 1 && r > 2);
      set(c, r, edge ? SAR_ROCK.O : SAR_ROCK[t]);
    }
  }));
  g.drawImage(cv, x - 2.25, y - SAR_PED.length / 4, 4.5, SAR_PED.length / 4);
}
// Where the stone's middle is over the pedestal's foot at (x, y), and its radius, in units.
const SAR_STONE_UP = SAR_PED.length / 4 + 1.5;
const SAR_STONE_R = 1.75;

// The ball itself, its middle at (x, y). look: null for dark, or { a, b, w, level, turn }: a and b the two engines'
// [deep, glow, core] (b null when one runs), w how far the glow has shifted from a to b, level 1 to 4 (more calls,
// brighter), turn 0 to 15 where the arms of light have got to.
function drawSarStone(g, x, y, look) {
  const key = look ? `stone${look.a}${look.b}${Math.round(look.w * 8)}${look.level}${look.turn}` : 'stone-dark';
  const cv = sarPaint(key, 14, 14, (set) => {
    const lit = look && [0, 0.62, 0.76, 0.9, 1][look.level];
    const tint = look && (look.b ? look.a.map((c, i) => hdMix(c, look.b[i], Math.round(look.w * 8) / 8)) : look.a);
    const arm = look && (look.b ? look.b.map((c, i) => hdMix(c, look.a[i], Math.round(look.w * 8) / 8)) : tint);
    for (let j = 0; j < 14; j += 1) {
      for (let i = 0; i < 14; i += 1) {
        const [dx, dy] = [(i + 0.5 - 7) / 7, (j + 0.5 - 7) / 7];
        const d = Math.hypot(dx, dy);
        if (d > 1) continue;
        let col = hdMix('#08070d', '#1a1828', Math.max(0, 0.6 - d * 0.5 - dy * 0.3));
        if (d > 0.82 && dx + dy > 0.4) col = '#2a2840';
        if (lit) {
          const swirl = Math.sin(2 * Math.atan2(dy, dx) + d * 7 - (look.turn * Math.PI) / 8);
          const onArm = swirl > 0.55 && d > 0.18 && d < 0.88;
          const I = lit * (1 - d ** 1.6) + (onArm ? 0.3 * lit : 0);
          const ramp = onArm ? arm : tint;
          const steps = [col, hdMix(ramp[0], '#08070d', 0.55), ramp[0], ramp[1], ramp[2], '#ffffff'];
          col = steps[Math.max(0, Math.min(look.level > 3 && d < 0.2 ? 5 : 4, Math.floor(I * 4.6)))];
        }
        if (d > 0.93) col = '#06050a';
        set(i, j, col);
      }
    }
    [[3, 3], [4, 3], [3, 4]].forEach(([i, j]) => set(i, j, lit ? '#ffffff' : '#9aa2c4'));
    set(4, 4, lit ? hdMix(tint[2], '#ffffff', 0.5) : '#4c5068');
  });
  g.drawImage(cv, x - SAR_STONE_R, y - SAR_STONE_R, 2 * SAR_STONE_R, 2 * SAR_STONE_R);
}

const SAR_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
// A halo of light rx by ry units about (x, y) in colour, added at strength (0 to 1): six bands from a bright heart to
// nothing, each dithered into the next, the colour kept pure.
function drawSarHalo(g, x, y, rx, ry, colour, strength) {
  if (strength <= 0.01) return;
  const [w, h] = [Math.round(rx * 8), Math.round(ry * 8)];
  const cv = sarPaint(`halo${w},${h},${colour}`, w, h, (set) => {
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        const d = Math.hypot((i + 0.5 - w / 2) / (w / 2), (j + 0.5 - h / 2) / (h / 2));
        if (d >= 1) continue;
        const band = Math.min(6, Math.floor((1 - d) ** 1.4 * 6 + SAR_BAYER[(j & 3) * 4 + (i & 3)] / 16));
        if (band) set(i, j, hdMix('#000000', colour, band / 6));
      }
    }
  });
  const q = (v) => Math.round(v * 4) / 4;
  const [op, alpha] = [g.globalCompositeOperation, g.globalAlpha];
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, strength);
  g.drawImage(cv, q(x - w / 8), q(y - h / 8), w / 4, h / 4);
  g.globalCompositeOperation = op;
  g.globalAlpha = alpha;
}

// The stone's light on Saruman in a frame of his (sprites-saruman.js's sarFrame), added in colour at strength, in three
// flat bands so it doesn't speckle: brightest on his hands over the stone, then his face from below (the lower the
// brighter), the front of his beard and the robe within five units of the stone, most on the edges that face it.
function drawSarLit(g, x, y, pose, k, colour, strength) {
  if (strength <= 0.01) return;
  const rows = sarFrame(pose, k);
  const cv = sarPaint(`lit${pose}${k}${colour}`, SAR_W, SAR_H, (set) => {
    const at = (c, r) => rows[r]?.[c] ?? '.';
    const [sc0, sr0] = [SAR_MID + 24, SAR_H - SAR_STONE_UP * 4];
    rows.forEach((row, r) => {
      for (let c = 0; c < row.length; c += 1) {
        const ch = row[c];
        if (ch === '.' || 'SZzDE'.includes(ch)) continue;
        const d = Math.hypot(c - sc0, (r - sr0) * 1.2) / 22;
        const open = (at(c + 1, r) === '.' ? 0.25 : 0) + (at(c, r + 1) === '.' || 'pqrstxiv'.includes(at(c, r + 1)) !== 'pqrstxiv'.includes(ch) ? 0.2 : 0);
        let v = d < 1 ? (1 - d) ** 1.3 * (0.6 + open) : 0;
        if ('pqrst'.includes(ch) && r > 22) v = Math.max(v, 0.95);
        else if ('pqrstxiv'.includes(ch)) v = Math.max(v, 0.2 + (r - 6) * 0.025 + open);
        else if ('cdeKk'.includes(ch) && r > 13 && r < 46 && c > SAR_MID + 6) v = Math.max(v, 0.12 + open * 1.4);
        const band = Math.min(3, Math.floor(v * 3));
        if (band > 0) set(c, r, hdMix('#000000', colour, band / 3));
      }
    });
  });
  const [op, alpha] = [g.globalCompositeOperation, g.globalAlpha];
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.min(1, strength);
  g.drawImage(cv, x - SAR_MID / 4, y - SAR_H / 4, SAR_W / 4, SAR_H / 4);
  g.globalCompositeOperation = op;
  g.globalAlpha = alpha;
}
