// scene2-land-peaks-draw.js: builds a range from scene2-land-peaks.js's peaks. The height field is laid a unit a
// cell, clamped low on realms, in front of other landmarks and along roads (a pass cut down to the road), then lit:
// each cell gets its light from the upper left and its stuff (heath low down, rock, snow high up, Caradhras's red).
// The field is projected column by column, front to back, at 4 pixels a unit; a dark line marks every edge where a
// slope stands in front of land further back, and the shadow each peak casts east falls on the slopes and the ground.

// A bearing round a summit as one of 256 steps (a fast atan2, close enough for a slope's ridges).
const m2MtBearing = (y, x) => {
  const [ax, ay] = [Math.abs(x) + 1e-9, Math.abs(y)];
  const r = Math.min(ax, ay) / Math.max(ax, ay);
  let t = r * (0.7854 + 0.273 * (1 - r));
  if (ay > ax) t = 1.5708 - t;
  if (x < 0) t = 3.1416 - t;
  if (y < 0) t = -t;
  return ((t + 3.1416) * 40.74) & 255;
};

// The height field and its light, cached by everything it depends on.
function m2MtField(pts, range, size, seed, plan, season) {
  const S = M2_MT[range];
  const raw = m2MtPeaks(pts, range, size, seed, plan);
  const bb0 = raw.reduce((b, p) => ({ x0: Math.min(b.x0, p.x - 30), y0: Math.min(b.y0, p.y - 30), x1: Math.max(b.x1, p.x + 30), y1: Math.max(b.y1, p.y + 30) }), { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 });
  const rivers = [];
  for (const line of Object.values(plan.rivers ?? {})) {
    for (let s = 0; s < line.length - 1; s += 1) {
      const [[ax, ay], [bx, by]] = [line[s], line[s + 1]];
      if (Math.max(ax, bx) > bb0.x0 && Math.min(ax, bx) < bb0.x1 && Math.max(ay, by) > bb0.y0 && Math.min(ay, by) < bb0.y1) rivers.push([ax, ay, bx, by]);
    }
  }
  const peaks = m2MtFit(raw, m2MtKeep(plan, bb0), rivers);
  const bb = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const p of peaks) {
    const R = Math.max(p.ra, p.rb) * 1.4;
    bb.x0 = Math.min(bb.x0, p.x - R); bb.x1 = Math.max(bb.x1, p.x + R); bb.y0 = Math.min(bb.y0, p.y - R); bb.y1 = Math.max(bb.y1, p.y + R);
  }
  bb.x0 = Math.max(-4, Math.floor(bb.x0)); bb.y0 = Math.max(-4, Math.floor(bb.y0));
  bb.x1 = Math.min(plan.W + 4, Math.ceil(bb.x1)); bb.y1 = Math.min(plan.H + 4, Math.ceil(bb.y1));
  // The peaks are laid on a grid a unit a cell.
  const [cw, ch] = [Math.ceil(bb.x1 - bb.x0) + 2, Math.ceil(bb.y1 - bb.y0) + 2];
  const Hc = new Float32Array(cw * ch);
  const redC = new Float32Array(cw * ch);
  const pkC = new Float32Array(cw * ch);
  // Tallest first, so a cell already higher than a peak's summit is skipped without working out the peak's slope.
  for (const p of peaks.slice().sort((a, b) => b.h - a.h)) {
    const R = Math.max(p.ra, p.rb) * (1 + S.spur);
    // The spurs: how far the slope reaches out at each of 256 bearings round the summit.
    const spurs = p.big ? Float32Array.from({ length: 256 }, (_, j) => {
      const t = (j / 256) * 2 * Math.PI - Math.PI;
      return S.spur * (0.6 * Math.sin(p.k * t + p.ph) + 0.4 * Math.sin((2 * p.k + 1) * t + p.ph * 2));
    }) : null;
    const [cx0, cx1] = [Math.max(0, Math.floor(p.x - R - bb.x0)), Math.min(cw - 1, Math.ceil(p.x + R - bb.x0))];
    const [cy0, cy1] = [Math.max(0, Math.floor(p.y - R - bb.y0)), Math.min(ch - 1, Math.ceil(p.y + R - bb.y0))];
    for (let cy = cy0; cy <= cy1; cy += 1) {
      for (let cx = cx0; cx <= cx1; cx += 1) {
        const i = cy * cw + cx;
        if (Hc[i] >= p.h && !p.red) continue;
        const dx = bb.x0 + cx - p.x;
        const dy = bb.y0 + cy - p.y;
        const a = (dx * p.ux + dy * p.uy) / p.ra;
        const b = (dy * p.ux - dx * p.uy) / p.rb;
        let q = Math.sqrt(a * a + b * b);
        if (q > 1 + S.spur) continue;
        if (spurs) q *= 1 + Math.min(1, q * 2.5) * spurs[m2MtBearing(b, a)];
        if (q >= 1) continue;
        const v = p.p > 1.4 ? p.h * (1 - q * q) : p.p === 1 ? p.h * (1 - q) : p.h * (1 - q) ** p.p;
        if (v > Hc[i]) { Hc[i] = v; pkC[i] = p.big ? p.h : 0; }
        if (p.red) redC[i] = Math.max(redC[i], 1 - q);
      }
    }
  }
  // The roughness (jagged crests and broken slopes) and two noises, laid on the coarse grid too.
  const Nc = new Float32Array(cw * ch);
  const Sc = new Float32Array(cw * ch);
  for (let cy = 0; cy < ch; cy += 1) {
    for (let cx = 0; cx < cw; cx += 1) {
      const k = cy * cw + cx;
      if (Hc[k] <= 0) continue;
      const [x, y] = [bb.x0 + cx, bb.y0 + cy];
      const n = m2MtN(x / 4.5 + seed, y / 4.5);
      const n2 = m2MtN(x / 2.6 + 50, y / 2.6 + seed);
      Nc[k] = n;
      Sc[k] = n2;
      Hc[k] *= 1 - S.jag * 0.5 + S.jag * (1 - Math.abs(2 * n - 1)) + (0.5 - Math.abs(2 * n2 - 1)) * 0.2;
    }
  }
  // The field is the coarse grid itself, a unit a cell; the projection smooths it.
  const [gw, gh] = [cw, ch];
  const [Hf, redF, pk, nz, sn] = [Hc, redC, pkC, Nc, Sc];
  // Realms only fit their peaks (m2MtFit); the zones of landmarks are also kept clear cell by cell.
  const keep = m2MtKeep(plan, bb).filter((z) => !z.realm);
  const roads = m2MtRoads(plan, bb);
  // Each clamp visits only the cells it can bind: rule(x, y, h, n) gives the height allowed there.
  const clampIn = (x0, y0, x1, y1, rule) => {
    const [c0, c1] = [Math.max(0, Math.floor(x0 - bb.x0)), Math.min(gw - 1, Math.ceil(x1 - bb.x0))];
    const [r0, r1] = [Math.max(0, Math.floor(y0 - bb.y0)), Math.min(gh - 1, Math.ceil(y1 - bb.y0))];
    for (let cy = r0; cy <= r1; cy += 1) {
      for (let cx = c0; cx <= c1; cx += 1) {
        const i = cy * gw + cx;
        if (Hf[i] > 0) Hf[i] = Math.max(0, rule(bb.x0 + cx, bb.y0 + cy, Hf[i], nz[i]));
      }
    }
  };
  const tall = S.hi * 1.5;
  for (const z of keep) {
    // Beside a landmark the slopes sink smoothly over 18 units; in front of it they stay low enough to hide none of it.
    clampIn(z.x0 - tall, z.y0 - 2, z.x1 + tall, z.y1 + tall * 1.2, (x, y, h, n) => {
      const dx = Math.max(z.x0 - x, 0, x - z.x1);
      const t = y > z.y1 + 4 ? 1 : Math.min(1, dx / 18);
      return Math.min(h * t * t * (3 - 2 * t), (dx * 1.6 + Math.max(0, y - z.y1) * 0.9) * (0.7 + n * 0.6));
    });
  }
  for (const [ax, ay, bx, by, hw] of roads) {
    const [vx, vy] = [bx - ax, by - ay];
    const reach = hw + 1 + tall / 2;
    clampIn(Math.min(ax, bx) - reach, Math.min(ay, by) - reach, Math.max(ax, bx) + reach, Math.max(ay, by) + reach, (x, y, h, n) => {
      const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1)));
      return Math.min(h, Math.max(0, Math.hypot(x - ax - vx * t, y - ay - vy * t) - hw - 1) * (2 + n * 1.5));
    });
  }
  // Light, shadow and stuff per cell: class 0 heath, 1 rock, 2 snow, 3 red rock; light 0..1.
  const lit = new Float32Array(gw * gh);
  const cls = new Uint8Array(gw * gh);
  const shadow = new Uint8Array(gw * gh);
  const snowAt = S.snow - (season === 'winter' ? 8 : season === 'summer' ? -3 : 0);
  for (let cy = 1; cy < gh - 1; cy += 1) {
    let cast = 0;
    for (let cx = 1; cx < gw - 1; cx += 1) {
      const i = cy * gw + cx;
      const h = Hf[i];
      cast -= 1.1;
      if (h >= cast) cast = h; else if (cast - h > 0.6) shadow[i] = cast - h > 4 ? 2 : 1;
      if (h <= 0) continue;
      const gx = (Hf[i + 1] - Hf[i - 1]) / 2;
      const gy = (Hf[i + gw] - Hf[i - gw]) / 2;
      const l = (gx * 0.62 + gy * 0.12 + 0.72) / Math.sqrt(gx * gx + gy * gy + 1);
      // Ridges (the field curving down either side) catch the light; gullies (curving up) hold the shade.
      const lap = Hf[i - 1] + Hf[i + 1] + Hf[i - gw] + Hf[i + gw] - 4 * h;
      const crease = Math.max(-0.22, Math.min(0.22, -lap * 0.05));
      let shade = 0;
      if (l < 0.6) {
        // A shaded face is ramped: dark at its foot and in the valleys round it, lighter up toward its ridges.
        const rel = h / (pk[i] || S.hi);
        const o = cy > 3 && cy < gh - 4 && cx > 3 && cx < gw - 4
          ? (Hf[i - 3] + Hf[i + 3] + Hf[i - 3 * gw] + Hf[i + 3 * gw]) / 4 - h : 0;
        // Gullies run down it: stripes across the slope, cut where a ridged noise pinches to a line.
        const g = Math.sqrt(gx * gx + gy * gy) || 1;
        const across = ((bb.x0 + cx) * -gy + (bb.y0 + cy) * gx) / g;
        const v = m2MtN(across * 0.7 + seed, h * 0.12);
        const gully = Math.abs(v - 0.5) < 0.05 ? -0.14 : Math.abs(v - 0.5) < 0.1 ? -0.05 : 0;
        // A ridge on the shaded side catches a rim of light.
        const rim = lap < -1.6 ? 0.28 : lap < -0.8 ? 0.12 : 0;
        shade = (rel - 0.5) * 0.4 - Math.max(0, o) * 0.04 + gully + rim + (nz[i] - 0.5) * 0.12;
      }
      // The shade never sinks to one flat darkest tone: the deepest face still keeps its gradient and its marks.
      lit[i] = Math.max(0.04, Math.min(1, 0.16 + 0.84 * (l * 0.9 + crease + (h / S.hi) * 0.1 - (shadow[i] ? 0.18 : 0)) + shade));
      const n = sn[i];
      const steep = gx * gx + gy * gy;
      const line = Math.min(snowAt, pk[i] * 0.6) + (n - 0.5) * 6;
      if (pk[i] > S.lo * 0.7 && h > line && steep < 3.5 + (h - line) * 0.3) cls[i] = 2;
      else if (h < S.heath + (n - 0.5) * 4) cls[i] = 0;
      // Caradhras's red stone shows in bands (strata) across its slopes, thickest high up.
      else cls[i] = redF[i] > 0.2 + n * 0.3 && Math.sin(h * 0.9 + n * 5) > 0.55 - redF[i] * 1.2 ? 3 : 1;
    }
  }
  return { bb, gw, gh, Hf, lit, cls, shadow, peaks };
}

// The range's ramps as packed pixels: heath (4), rock (6), snow (4), red (6), seasoned.
function m2MtRamps(range, season) {
  const S = M2_MT[range];
  const [R, Sn] = M2_STONE[range];
  const tint = season === 'winter' ? ['#d8e0e6', 0.5] : season === 'autumn' ? ['#8a6a30', 0.25] : null;
  const heath = S.heathC.map((c) => m2MtRgb(tint ? hdMix(c, tint[0], tint[1]) : c));
  return { heath, rock: R.map(m2MtRgb), snow: (Sn ?? R.slice(2)).map(m2MtRgb), red: M2_MT_RED.map(m2MtRgb), ink: m2MtRgb(R[0]), edge: m2MtRgb(R[1]) };
}

// Projects the field into bands of standing pixels: { strips: [{ c, x, y, w, h, z, foot }], tops }.
function m2MtRender(F, range, season) {
  const { bb, gw, gh, Hf, lit, cls } = F;
  const P = m2MtRamps(range, season);
  let top = 0;
  for (let i = 0; i < Hf.length; i += 1) if (Hf[i] > top) top = Hf[i];
  const [SW, GH] = [Math.round((bb.x1 - bb.x0) * 4), Math.round((bb.y1 - bb.y0) * 4)];
  const TM = Math.ceil(top * 4 * M2_MT_K) + 2;
  const SH = GH + TM;
  const col = new Uint32Array(SW * SH);
  // Cut into bands by the ground row each pixel stands on.
  const y00 = Math.floor(bb.y0 / M2_MT_STRIP) * M2_MT_STRIP;
  const nb = Math.ceil((bb.y1 - y00) / M2_MT_STRIP) + 1;
  const box = Array.from({ length: nb }, () => [1e9, 1e9, -1, -1]);
  const bandOf = new Int16Array(GH + 2);
  for (let d = 1; d <= GH + 1; d += 1) bandOf[d] = Math.floor((bb.y0 + (d - 1) / 4 - y00) / M2_MT_STRIP);
  const dep = new Int16Array(SW * SH);
  for (let c = 0; c < SW; c += 1) {
    const fx = c / 4;
    const cx = Math.min(gw - 2, Math.floor(fx));
    const tx = fx - cx;
    let horizon = SH;
    // Ground rows every half unit: the runs between them fill the slope.
    for (let r = GH - 1; r >= 0; r -= 2) {
      const fy = r / 4;
      const cy = Math.min(gh - 2, Math.floor(fy));
      const ty = fy - cy;
      const i0 = cy * gw + cx;
      const h = (Hf[i0] * (1 - tx) + Hf[i0 + 1] * tx) * (1 - ty) + (Hf[i0 + gw] * (1 - tx) + Hf[i0 + gw + 1] * tx) * ty;
      if (h < 0.3) continue;
      const sy = TM + r - Math.round(h * 4 * M2_MT_K);
      if (sy >= horizon) continue;
      // The cell's stuff dithered across the cells' edges; its light smoothed between the four cells round it.
      const dq = M2_BAYER[(r & 3) * 4 + (c & 3)];
      const k = cls[(ty + dq * 0.9 - 0.45 < 0.5 ? cy : cy + 1) * gw + (tx + (1 - dq) * 0.9 - 0.45 < 0.5 ? cx : cx + 1)];
      const li = (lit[i0] * (1 - tx) + lit[i0 + 1] * tx) * (1 - ty) + (lit[i0 + gw] * (1 - tx) + lit[i0 + gw + 1] * tx) * ty;
      const end = Math.min(horizon, TM + r + 2);
      for (let s = Math.max(0, sy); s < end; s += 1) {
        // Deep down a long run the slope is a sheer face: bare rock in broken ledges, whatever lies on top.
        // It keeps the light of the slope above it, darkening down toward its foot, cut by crevices that run down it
        // (dark columns) and broken by ledges (lighter rows), with a lit lip along its top.
        const face = s - sy > 7 && k !== 0;
        const ledge = m2MtLat[(((c / 3) | 0) & 255) + ((((s + (r >> 3)) >> 1) & 255) << 8)];
        const crevice = m2MtLat[(((c + r) >> 1) & 255) + 7936] < 0.16 ? -0.3 : 0;
        const v = face ? li * 0.85 + 0.05 - Math.min(0.3, (s - sy - 7) * 0.012) + (ledge - 0.5) * 0.25 + crevice + (s - sy < 10 ? 0.12 : 0) + (M2_BAYER[(s & 3) * 4 + (c & 3)] - 0.5) * 0.2
          : li + (M2_BAYER[(s & 3) * 4 + (c & 3)] - 0.5) * 0.2 - Math.min(0.08, (s - sy) * 0.006);
        const ramp = k === 0 ? P.heath : face ? P.rock : k === 2 ? P.snow : k === 3 ? P.red : P.rock;
        const lo = k === 0 || k === 2 ? 0 : 1;
        col[s * SW + c] = ramp[Math.max(lo, Math.min(ramp.length - 1, Math.floor(lo + v * (ramp.length - lo))))];
        dep[s * SW + c] = r + 1;
      }
      // The band this row stands in grows to hold its run.
      const b = box[bandOf[r + 1]];
      if (c < b[0]) b[0] = c; if (sy < b[1]) b[1] = Math.max(0, sy); if (c > b[2]) b[2] = c; if (end - 1 > b[3]) b[3] = end - 1;
      horizon = sy;
    }
  }
  // Ink round the silhouette and along every ridge that stands in front of land further back.
  for (let s = SH - 1; s >= 0; s -= 1) {
    for (let c = 0; c < SW; c += 1) {
      const j = s * SW + c;
      const d = dep[j];
      if (!d) continue;
      const up = s ? dep[j - SW] : 0;
      if (!up || (c && !dep[j - 1]) || (c < SW - 1 && !dep[j + 1])) col[j] = P.ink;
      else if (d - up > 10) col[j] = P.edge;
    }
  }
  const strips = [];
  const out = box.map(([c0, s0, c1, s1], k) => {
    if (c1 < 0) return null;
    const [w, h] = [c1 - c0 + 1, s1 - s0 + 1];
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const img = g.createImageData(w, h);
    strips.push({ c: cv, x: bb.x0 + c0 / 4, y: bb.y0 - TM / 4 + s0 / 4, w: w / 4, h: h / 4, z: y00 + (k + 0.5) * M2_MT_STRIP });
    return { g, img, px: new Uint32Array(img.data.buffer), c0, s0, w };
  });
  for (let s = 0; s < SH; s += 1) {
    for (let c = 0, j = s * SW; c < SW; c += 1, j += 1) {
      const d = dep[j];
      if (!d) continue;
      const o = out[bandOf[d]];
      o.px[(s - o.s0) * o.w + c - o.c0] = col[j];
    }
  }
  for (const o of out) if (o) o.g.putImageData(o.img, 0, 0);
  const tops = [];
  for (const p of F.peaks) {
    if (!p.big) continue;
    const [cx, cy] = [Math.round(p.x - bb.x0), Math.round(p.y - bb.y0)];
    if (cx < 1 || cy < 1 || cx >= gw - 1 || cy >= gh - 1) continue;
    const h = Hf[cy * gw + cx];
    if (h > 10) tops.push({ x: p.x, y: p.y - h, foot: p.y, h, red: !!p.red });
  }
  tops.sort((a, b) => a.foot - b.foot);
  return { strips, tops };
}
