// scene2-land-peaks.js: the mountain ranges of the map from above (scene2.js), seen in 3/4 overhead. A range is a
// height field along its line of places: big peaks of varied height and shape, each with ridges running down from its
// summit and gullies between, a lower crest joining them, foothills on its flanks and passes where roads cross. The
// field is lit from the upper left, the high peaks carry snow (none in Mordor), peaks cast their shadows east into the
// valleys and onto the land, a dark line marks each ridge where it stands in front of another, and Caradhras, the
// Redhorn, stands tallest above Moria in red stone. The field is projected (each spot drawn as high as it stands) into
// bands a few units deep, each a standing thing sorted by the row where it meets the ground, so a walker in a pass
// goes behind the near slopes. Nothing tall stands on a realm or in front of another area's landmark (plan.zones).

// Per range: peak heights (low, high), crest height, foothill height, snowline, heath height, ridges, jaggedness,
// the heath (foothill) ramp, and how far a shadow falls per unit east.
const M2_MT = {
  misty: { cross: 0.6, lo: 22, hi: 44, crest: 12, foot: 8, snow: 26, heath: 4, spur: 0.4, jag: 0.2, gap: 0.6, heathC: ['#33452a', '#4b6236', '#657e42', '#849c58'] },
  grey: { cross: 0.8, lo: 16, hi: 32, crest: 10, foot: 7, snow: 21, heath: 4, spur: 0.35, jag: 0.2, gap: 0.8, heathC: ['#2e3628', '#424c36', '#5a6446', '#747e58'] },
  white: { cross: 0.8, lo: 20, hi: 40, crest: 11, foot: 8, snow: 23, heath: 4, spur: 0.4, jag: 0.2, gap: 0.8, heathC: ['#36482a', '#4f6834', '#6a8640', '#8aa656'] },
  ephel: { cross: 0.55, lo: 14, hi: 28, crest: 9, foot: 4, snow: 99, heath: 2, spur: 0.5, jag: 0.55, gap: 0.45, heathC: ['#140e0c', '#22160f', '#302014', '#3e2a1a'] },
};
M2_MT.lithui = M2_MT.ephel;
const M2_MT_RED = ['#2a1414', '#4a2220', '#6e3428', '#8e4a34', '#ad6442', '#c88a62'];
const M2_MT_STRIP = 10;
// How tall a unit of height stands on the map: a little under a unit, as a 3/4 view foreshortens it.
const M2_MT_K = 0.8;
const m2MtCache = new Map();
let m2MtLat = null;
const m2MtLatInit = () => { if (!m2MtLat) { m2MtLat = new Float32Array(65536); for (let i = 0; i < 65536; i += 1) m2MtLat[i] = m2Hash(i & 255, i >> 8, 917); } };
// Smooth value noise on a 256-cell lattice, fast enough to call per pixel.
const m2MtN = (x, y) => {
  const [ix, iy] = [Math.floor(x), Math.floor(y)];
  let [fx, fy] = [x - ix, y - iy];
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const [a, b] = [(ix & 255) + ((iy & 255) << 8), (ix & 255) + (((iy + 1) & 255) << 8)];
  const [a1, b1] = [((ix + 1) & 255) + ((iy & 255) << 8), ((ix + 1) & 255) + (((iy + 1) & 255) << 8)];
  return (m2MtLat[a] * (1 - fx) + m2MtLat[a1] * fx) * (1 - fy) + (m2MtLat[b] * (1 - fx) + m2MtLat[b1] * fx) * fy;
};
const m2MtRgb = (hex) => { const [r, g, b] = hdRgb(hex); return (255 << 24) | (b << 16) | (g << 8) | r; };

// The peaks along a range's line: { x, y, h, ra (along), rb (across), ux, uy, k (spurs), ph (spur phase), p (shape),
// big }. Big peaks every gap * size units, a low crest between, foothills on both flanks, Caradhras where it stands.
function m2MtPeaks(pts, range, size, seed, plan) {
  const S = M2_MT[range];
  const line = m2Meander(pts, seed, 2);
  const out = [];
  let k = 0;
  // Each range sinks toward its two ends instead of stopping short.
  const total = line.slice(1).reduce((a, [x, y], j) => a + Math.hypot(x - line[j][0], y - line[j][1]), 0);
  let run = 0;
  for (let s = 0; s < line.length - 1; s += 1) {
    const [[ax, ay], [bx, by]] = [line[s], line[s + 1]];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const [ux, uy] = [(bx - ax) / len, (by - ay) / len];
    for (let d = (k * 3.1) % 3; d < len; d += 3, k += 1) {
      const [x, y] = [ax + ux * d, ay + uy * d];
      const r = (j) => m2Hash(k, j, seed);
      const end = Math.min(1, (run + d) / 18, (total - run - d) / 18) * 0.6 + 0.4;
      out.push({ x, y, h: S.crest * end * (0.75 + r(1) * 0.5), ra: 5 + r(2) * 3, rb: size * 0.32, ux, uy, k: 3, ph: r(3) * 6, p: 1, big: false });
      if (k % Math.max(2, Math.round((S.gap * size) / 3)) === 0) {
        const tall = r(4) < 0.25 ? 1.3 : r(4) > 0.8 ? 0.75 : 1;
        const h = (S.lo + (S.hi - S.lo) * r(5) ** 1.3) * tall * end;
        const off = (r(6) - 0.5) * size * 0.35;
        out.push({ x: x - uy * off, y: y + ux * off, h, ra: h * (0.8 + r(7) * 0.35), rb: h * S.cross * (0.85 + r(8) * 0.3), ux, uy, k: 3 + Math.floor(r(9) * 3), ph: r(10) * 6, p: r(11) < 0.5 ? 1.15 : 0.9, big: true });
      }
      for (const side of [-1, 1]) {
        if (r(12 + side) > 0.45) continue;
        const off = side * size * (0.48 + r(14 + side) * 0.22);
        const h = S.foot * (0.6 + r(16 + side) * 0.6);
        out.push({ x: x - uy * off, y: y + ux * off, h, ra: h * 1.2, rb: h * 0.9, ux, uy, k: 2, ph: r(18) * 6, p: 1.6, big: false });
      }
    }
    run += len;
  }
  const red = plan.places.caradhras;
  // Caradhras stands just behind (north of) Moria's gates, so its summit rises over them.
  const gate = Math.min(plan.zones?.moriaWest?.y0 ?? 1e9, plan.zones?.moriaEast?.y0 ?? 1e9);
  if (range === 'misty' && red) out.push({ x: red.x, y: Math.min(red.y, gate - 8), h: S.hi * 1.4, ra: S.hi * 0.8, rb: S.hi * 0.7, ux: 0, uy: 1, k: 6, ph: 1.3, p: 1.1, big: true, red: true });
  return out;
}

// The boxes nothing tall may stand on or in front of: the realms, and the zones of other areas' landmarks.
function m2MtKeep(plan, bb) {
  // A realm's box, with its edges drawn in toward its stations by up to 16 units, so the slopes may come down into its
  // empty margins (a valley's sides) but stand clear of every desk, plot and anvil.
  const boxes = plan.realms.map((r) => {
    const st = plan.stations.filter((t) => t.realm === r);
    const [sx0, sx1] = st.length ? [Math.min(...st.map((t) => t.x)) - 12, Math.max(...st.map((t) => t.x)) + 12] : [r.x + 20, r.x + r.w - 20];
    const sy1 = st.length ? Math.max(...st.map((t) => t.y)) + 6 : r.y + r.h - 20;
    return { x0: Math.min(sx0, r.x + 20), y0: r.y, x1: Math.max(sx1, r.x + r.w - 20), y1: Math.min(r.y + r.h, Math.max(sy1, r.y + r.h - 24)), realm: true };
  });
  for (const [k, z] of Object.entries(plan.zones ?? {})) if (k !== 'caradhras') boxes.push(z);
  return boxes.filter((b) => [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) && b.x1 > bb.x0 - 20 && b.x0 < bb.x1 + 20 && b.y1 > bb.y0 - 20 && b.y0 < bb.y1 + 60);
}
// The road crossings: segments of plan.roads that pass through the range's box.
function m2MtRoads(plan, bb) {
  const segs = [];
  for (const road of plan.roads ?? []) {
    for (let s = 0; s < road.pts.length - 1; s += 1) {
      const [[ax, ay], [bx, by]] = [road.pts[s], road.pts[s + 1]];
      if (Math.max(ax, bx) < bb.x0 || Math.min(ax, bx) > bb.x1 || Math.max(ay, by) < bb.y0 || Math.min(ay, by) > bb.y1) continue;
      segs.push([ax, ay, bx, by, road.hw]);
    }
  }
  return segs;
}
// Fits each peak clear of the boxes and the rivers: a peak that would stand on a realm or in front of a landmark is
// pushed away from it, then shrunk until its foot and the land its height hides stay clear.
function m2MtFit(peaks, keep, rivers) {
  const away = (p, R) => {
    let best = { d: 1e9, vx: 0, vy: 0 };
    for (const z of keep) {
      // A realm's empty front margin may be hidden a little by the peaks before it, by a different amount for each.
      const [y0, y1] = [z.y0 - R * 0.3, z.y1 + p.h * (z.realm ? 0.15 + m2Hash(p.x | 0, p.y | 0, 5) * 0.45 : 1)];
      const qx = Math.max(z.x0, Math.min(z.x1, p.x));
      const qy = Math.max(y0, Math.min(y1, p.y));
      const d = Math.hypot(p.x - qx, p.y - qy) * (p.x > z.x0 && p.x < z.x1 && p.y > y0 && p.y < y1 ? -1 : 1);
      if (d < best.d) best = { d, vx: p.x - qx || (p.x < (z.x0 + z.x1) / 2 ? -1 : 1), vy: p.y - qy };
    }
    for (const [ax, ay, bx, by] of rivers) {
      const [vx, vy] = [bx - ax, by - ay];
      const t = Math.max(0, Math.min(1, ((p.x - ax) * vx + (p.y - ay) * vy) / (vx * vx + vy * vy || 1)));
      const [qx, qy] = [ax + vx * t, ay + vy * t];
      const d = Math.hypot(p.x - qx, p.y - qy) - 3;
      if (d < best.d) best = { d, vx: p.x - qx, vy: p.y - qy };
    }
    return best;
  };
  // The peak's reach toward the nearest thing to keep clear (its ellipse's radius that way).
  const reach = (p, b) => {
    const n = Math.hypot(b.vx, b.vy) || 1;
    const c = (b.vx * p.ux + b.vy * p.uy) / n;
    return 1 / Math.sqrt((c / p.ra) ** 2 + ((1 - c * c) / (p.rb * p.rb)));
  };
  for (const p of peaks) {
    if (p.red) continue;
    let b = away(p, Math.max(p.ra, p.rb));
    let R = reach(p, b);
    if (b.d < R) {
      const n = Math.hypot(b.vx, b.vy) || 1;
      const push = Math.min(R * 0.8, R - b.d);
      p.x += (b.vx / n) * push;
      p.y += (b.vy / n) * push * 0.5;
      b = away(p, R);
      R = reach(p, b);
    }
    if (b.d < R) {
      const k = Math.max(0, b.d / R);
      p.h *= k; p.ra *= k; p.rb *= k;
    }
  }
  return peaks.filter((p) => p.h > 2);
}

// The ground under a range: rock where it rises, cliff (closed to walkers) where it is steep and high, and the
// shadows the peaks cast onto the land.
function m2MtGround(L, F) {
  const { bb, gw, gh, Hf, shadow } = F;
  for (let cy = 0; cy < gh; cy += 1) {
    for (let cx = 0; cx < gw; cx += 1) {
      const i = cy * gw + cx;
      const h = Hf[i];
      if (h < 0.3 && !shadow[i]) continue;
      // Each cell is a unit: the 4 by 4 pixels round its middle.
      const [px, py] = [Math.round((bb.x0 + cx) * 4) - 2, Math.round((bb.y0 + cy) * 4) - 2];
      if (px < 0 || py < 0 || px >= L.pw - 4 || py >= L.ph - 4) continue;
      for (let dy = 0; dy < 4; dy += 1) {
        for (let j = (py + dy) * L.pw + px, e = j + 4; j < e; j += 1) {
          if (h >= 3) L.mat[j] = M2_MAT.cliff;
          else if (h >= 0.3) L.mat[j] = M2_MAT.rock;
          else if (L.mat[j] !== M2_MAT.water) L.shade[j] = Math.max(L.shade[j], shadow[i]);
        }
      }
    }
  }
}

// The height of a range's field at (x, y), 0 off it.
function m2MtHeightAt(F, x, y) {
  if (!F) return 0;
  const [cx, cy] = [Math.round(x - F.bb.x0), Math.round(y - F.bb.y0)];
  return cx < 0 || cy < 0 || cx >= F.gw || cy >= F.gh ? 0 : F.Hf[cy * F.gw + cx];
}
// A range along pts: its bands as standing things, its ground, and its summits (north to south) for the eyries.
function m2MtRange(L, add, pts, range, size, seed, plan, season) {
  m2MtLatInit();
  const keyOf = [range, size, seed, season, plan.W, plan.H, JSON.stringify(pts.map(([x, y]) => [x | 0, y | 0])),
    JSON.stringify(plan.realms.map((r) => [r.x, r.y, r.w, r.h])), JSON.stringify(plan.zones ?? {}), JSON.stringify((plan.roads ?? []).map((r) => r.pts))].join('|');
  let got = m2MtCache.get(keyOf);
  if (!got) {
    const F = m2MtField(pts, range, size, seed, plan, season);
    got = { F, ...m2MtRender(F, range, season) };
    m2MtCache.set(keyOf, got);
  }
  m2MtGround(L, got.F);
  for (const s of got.strips) {
    const o = { x: s.x, y: s.y, w: s.w, h: s.h, z: s.z, draw: (g) => g.drawImage(s.c, s.x, s.y, s.w, s.h) };
    o.foot = [s.x + s.w / 2, s.z, s.x + s.w / 2, s.z];
    add.obj(o);
  }
  (plan.peaks ??= {})[range] = got.tops;
  (plan.fields ??= {})[range] = got.F;
  return got.tops;
}
