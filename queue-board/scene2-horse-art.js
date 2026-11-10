// scene2-horse-art.js: how a horse of the map from above (scene2.js) is painted, at 32-bit (four pixels a unit). A
// horse is a list of rounded forms (scene2-horse.js lays them out for each facing, gait and frame): ellipses for the
// haunch, barrel, chest and rump, capsules for the neck, head, muzzle and the two joints of each leg, strands for the
// mane and tail, and the tack. Each form is lit as a rounded solid from the upper left, its light stepped into a ramp of
// six (the light warming toward gold, the shade cooling toward violet), with strands combed along the hair, a hard
// outline in the form's own darkest hue where it meets the ground, and a softer edge where it overlaps a form behind
// it. The far legs and far ear take a step of shade. Each frame is painted once into a canvas and kept.

// A ramp of six from a colour and its shade: outline, deep, shade, base, light, highlight.
function m2mRamp(base, shade, pale = false) {
  const deep = hdMix(shade, '#2a1b38', 0.45);
  return [hdMix(deep, HD_DARK, 0.62), deep, shade, base, hdMix(base, pale ? '#fffaf0' : '#ffd890', pale ? 0.45 : 0.26), hdMix(base, pale ? '#ffffff' : '#ffe8b8', pale ? 0.75 : 0.5)];
}
// A horse's colours: coat, mane and tail, lower legs, hooves, and the tack (leather, the saddle cloth in the rider's
// colours, its trim, and the bit and buckles in steel).
function m2mHorsePal(coat, cloth) {
  return {
    body: m2mRamp(coat.base, coat.shade, coat.pale),
    hair: m2mRamp(coat.mane, coat.maneShade, coat.paleMane),
    low: m2mRamp(coat.low, hdMix(coat.low, '#1c1428', 0.35), coat.pale),
    hoof: ['#120c0a', '#2a201a', '#3e3028', '#56463a', '#6e5c4c', '#8a7664'],
    leather: m2mRamp('#6e4426', '#4a2c18'),
    cloth: m2mRamp(cloth[0], cloth[1]),
    trim: m2mRamp(cloth[2], hdMix(cloth[2], '#3a2a10', 0.4), true),
    steel: ['#22262e', '#3a404c', '#5a6272', '#8a94a6', '#c8d0dc', '#ffffff'],
    eye: '#0e0a0c',
  };
}
// Which ramp each part takes, and whether it is hair (combed in strands) or far (a step darker).
const M2M_PART = { body: 'body', far: 'body', head: 'body', leg: 'body', farleg: 'body', low: 'low', farlow: 'low', hoof: 'hoof', farhoof: 'hoof',
  mane: 'hair', tail: 'hair', ear: 'body', farear: 'body', leather: 'leather', cloth: 'cloth', trim: 'trim', steel: 'steel' };
const M2M_FAR = new Set(['far', 'farleg', 'farlow', 'farhoof', 'farear']);

// Paints a horse of w by h pixels from its forms into a new canvas. Each form: { t: 'e' (ellipse cx, cy, rx, ry) or
// 'c' (capsule x0, y0, x1, y1, r0, r1), part, lit (an extra lift of light), flat (no rounding: tack) }.
function m2mPaintHorse(w, h, forms, P) {
  const order = new Int16Array(w * h).fill(-1);
  const light = new Float32Array(w * h);
  const along = new Float32Array(w * h);
  forms.forEach((f, k) => {
    let x0;
    let x1;
    let y0;
    let y1;
    if (f.t === 'e') [x0, x1, y0, y1] = [f.cx - f.rx, f.cx + f.rx, f.cy - f.ry, f.cy + f.ry];
    else { const r = Math.max(f.r0, f.r1); [x0, x1, y0, y1] = [Math.min(f.x0, f.x1) - r, Math.max(f.x0, f.x1) + r, Math.min(f.y0, f.y1) - r, Math.max(f.y0, f.y1) + r]; }
    for (let py = Math.max(0, Math.floor(y0)); py <= Math.min(h - 1, Math.ceil(y1)); py += 1) {
      for (let px = Math.max(0, Math.floor(x0)); px <= Math.min(w - 1, Math.ceil(x1)); px += 1) {
        const [x, y] = [px + 0.5, py + 0.5];
        let nx;
        let ny;
        let s = 0;
        if (f.t === 'e') {
          nx = (x - f.cx) / f.rx;
          ny = (y - f.cy) / f.ry;
          if (nx * nx + ny * ny > 1) continue;
        } else {
          const [dx, dy] = [f.x1 - f.x0, f.y1 - f.y0];
          const len2 = dx * dx + dy * dy || 1;
          s = Math.max(0, Math.min(1, ((x - f.x0) * dx + (y - f.y0) * dy) / len2));
          const r = f.r0 + (f.r1 - f.r0) * s;
          const [qx, qy] = [x - (f.x0 + dx * s), y - (f.y0 + dy * s)];
          if (qx * qx + qy * qy > r * r) continue;
          nx = qx / r;
          ny = qy / r;
          // Hair runs along the form: the distance across it, for strands.
          along[py * w + px] = (qx * -dy + qy * dx) / Math.sqrt(len2);
        }
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const i = py * w + px;
        order[i] = k;
        light[i] = f.flat ? 0.35 + (f.lit ?? 0) - ny * 0.25 : -0.45 * nx - 0.6 * ny + 0.42 * nz - 0.1 + (f.lit ?? 0);
      }
    }
  });
  const { c, g } = m2Canvas(w / 4, h / 4);
  // Where a form meets one behind it: a hard edge, except between two parts of the same mass (the haunch, barrel and
  // chest; the neck and head), which blend into one body.
  const mass = (part) => (['body', 'head', 'far'].includes(part) ? 'body' : part);
  const edge = (i, k) => (order[i] < 0 ? 2 : order[i] < k && mass(forms[order[i]].part) !== mass(forms[k].part) ? 1 : 0);
  m2Raster(g, 0, 0, w, h, (px, py) => {
    const i = py * w + px;
    const k = order[i];
    if (k < 0) return null;
    const f = forms[k];
    if (f.part === 'eye') return P.eye;
    const ramp = P[M2M_PART[f.part]] ?? P.body;
    // A hard outline against the ground, a softer step where it meets a form behind it.
    const around = [px > 0 ? i - 1 : -1, px < w - 1 ? i + 1 : -1, py > 0 ? i - w : -1, py < h - 1 ? i + w : -1].map((j) => (j < 0 ? 2 : edge(j, k)));
    if (around.includes(2)) return ramp[0];
    let v = light[i];
    if (M2M_PART[f.part] === 'hair') v += ((Math.floor(along[i] * 1.6 + px * 0.15) % 3) - 1) * 0.22;
    let step = v > 0.62 ? 5 : v > 0.32 ? 4 : v > 0.02 ? 3 : v > -0.3 ? 2 : 1;
    if (M2M_FAR.has(f.part)) step = Math.max(1, Math.min(3, step - 1));
    // A head, leg or haunch in front of the body behind it gets a firmer edge, so the forms read apart.
    if (around.includes(1)) step = Math.max(1, step - (['head', 'leg', 'low', 'ear'].includes(f.part) ? 2 : 1));
    return ramp[step];
  });
  return c;
}
