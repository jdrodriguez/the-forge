// scene2-helm.js: Helm's Deep on the map from above (scene2.js), in the White Mountains' northwest. The Deeping-coomb
// opens north onto Rohan's plain, crossed by Helm's Dike, and narrows south into a gorge cut deep into the mountains.
// The Deeping Wall closes the gorge's mouth, its battlements on its north side and the Deeping-stream running out
// through its culvert. At the wall's north end the Hornburg stands on its spur of rock: a walled court, the gatehouse
// facing the coomb with its causeway ramp, and the great tower. Behind the wall the gorge turns west to the mouth of
// the Glittering Caves (scene2-helm-caves.js glitters it and lights it at night). The whole site is one height field
// of rock, stone and turf, painted from overhead by a ray down each column (the nearest solid point shows its top or
// its south face) and cut into bands by ground row, so each band sorts with the walkers by its own front row.

// The site's extent round the wall's middle, in units, and the band depth for sorting.
const M2_HELM = { x0: -22, x1: 26, y0: -22, y1: 23, band: 3 };
const M2_HELM_STONE = ['#3a342c', '#5a5246', '#7c7366', '#9e9486', '#c0b6a6', '#e2d9c8'];
const M2_HELM_ROCK = M2_STONE.white[0];
const M2_HELM_SNOW = M2_STONE.white[1];
// Materials in the height field.
const M2_HM = { rock: 1, stone: 2, pave: 3, turf: 4 };

const m2HelmSmooth = (a, b, v) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
// The gorge's floor at (x, y) relative to the wall's middle, with the caves' mouth at (cx, cy): the narrowing cut
// southward from the wall, then the stretch west along the foot of the caves' cliff.
function m2HelmGorge(x, y, cx, cy) {
  const t = Math.max(0, Math.min(1, (y + 3) / (cy + 4)));
  const [l, r] = [-5.5 + t * 4.5, 13.5 - t * 6];
  if (y > -3.5 && y < cy + 7.5 && x > l && x < r) return true;
  return y > cy + 0.6 && y < cy + 7 && x > cx - 5 + Math.abs(y - cy - 3.8) * 0.4 && x < r;
}
// The height and material at (x, y) relative to the wall's middle.
function m2HelmAt(x, y, cx, cy) {
  const n = m2Noise(x + 40, y + 40, 3.4, 31) * 0.65 + m2Noise(x + 40, y + 40, 1.5, 32) * 0.35;
  // Helm's Dike: a low turf bank curving across the coomb, open for the road and the stream.
  const dike = y + 19 - 0.01 * (x - 4) ** 2;
  if (Math.abs(dike) < 1.2 && x > -9 && x < 24 && Math.abs(x - 2) > 2.4 && Math.abs(x - 6.6) > 1.4) return [1.1 - 0.7 * dike * dike, M2_HM.turf];
  // The Hornburg: the great tower, the gatehouse, the curtain round the court, the court and ramp, the spur of rock.
  const [tx, ty] = [x + 12, y + 6.5];
  const tr = Math.hypot(tx, ty * 1.15);
  if (tr < 2.4) return [tr > 1.8 && Math.floor((Math.atan2(ty, tx) + 4) * 1.6) % 2 ? 31.2 : 30, M2_HM.stone];
  const merlon = (a) => (Math.floor(a / 1.5) % 2 ? 1.1 : 0);
  if (x > -6.6 && x < -2.4 && y > -14.6 && y < -11) {
    const rim = x < -6 || x > -3 || y < -14;
    return [15.5 + (rim ? merlon(x + y + 40) : 0), M2_HM.stone];
  }
  // The court's curtain follows the spur round, its corners rounded.
  const [qx, qy] = [Math.max(0, Math.abs(x + 11) - 3.1), Math.max(0, Math.abs(y + 6.25) - 2.85)];
  const e = qx && qy ? 2.5 - Math.hypot(qx, qy) : Math.min(5.6 - Math.abs(x + 11), 5.35 - Math.abs(y + 6.25));
  if (e > 0) {
    if (e < 1.4) return [14 + (e < 0.5 ? merlon((qy ? x : y) + 40) : 0), M2_HM.stone];
    return [5, M2_HM.pave];
  }
  if (x > -6.2 && x < -2.4 && y >= -11 && y < -5.5) return [Math.max(0, 5 * (1 - (y + 11) / 5.5)), M2_HM.pave];
  const spur = (x > -18 + n * 1.5 && x < -5.5 && y > -12.5 - n && y < 1.5) || (x > -6.6 && x < -2.2 && y > -15 && y < -11);
  // The Deeping Wall across the gorge's mouth, its battlements along its north side.
  if (x > -5.6 && x < 14.2 && y > -2.6 && y < 0.5) return [9.5 + (y < -1.9 ? merlon(x + 40) : 0), M2_HM.stone];
  // The mountains round the gorge: low craggy rock with short cliffs down to its floor, kept low enough near the gorge
  // that from overhead its floor and the Hornburg's faces still show, rising towards the site's south and fading at its
  // edges into the range's own peaks.
  if (!m2HelmGorge(x, y, cx, cy)) {
    let h = 0;
    if (x < -5.5 && y > 1 && y < cy + 1) h = 1.6 + 1.0 * (y - 1);
    else if (x > 13.2 && y > -3) h = 3 + Math.min(0.45 * (x - 13.2), 0.3 * (y + 3) + 1.5);
    else if (y > -3.5) {
      const g = y > cy + 6.5 ? y - cy - 6.5 : Math.max(0, Math.min(x - 13.2, -5.5 - x, y + 3.5));
      h = 2 + 0.8 * g;
    }
    if (h > 0) {
      const edge = (Math.min(x - M2_HELM.x0, M2_HELM.x1 - x, M2_HELM.y1 - y) + (n - 0.5) * 7) / 5;
      h = (Math.min(12, h) + n * 2.6) * m2HelmSmooth(0, 1, edge);
      if (h > 0.4) return [h, M2_HM.rock];
    }
  }
  if (spur) return [5 + n * 0.8, M2_HM.rock];
  return [0, 0];
}

// The site painted once per cave offset: per canvas pixel its colour and band, each band's box, and each band's
// footprints (runs of solid ground).
const m2HelmCache = new Map();
function m2HelmPaint(cx, cy) {
  const key = `${cx},${cy}`;
  if (m2HelmCache.has(key)) return m2HelmCache.get(key);
  const { x0, x1, y0, y1, band } = M2_HELM;
  const GW = (x1 - x0) * 4;
  const GH = (y1 - y0) * 4;
  const hgt = new Float32Array(GW * GH);
  const mat = new Uint8Array(GW * GH);
  const colMax = new Float32Array(GW);
  for (let j = 0; j < GH; j += 1) {
    for (let i = 0; i < GW; i += 1) {
      const [h, m] = m2HelmAt(x0 + (i + 0.5) / 4, y0 + (j + 0.5) / 4, cx, cy);
      hgt[j * GW + i] = h;
      mat[j * GW + i] = m;
      if (h > colMax[i]) colMax[i] = h;
    }
  }
  const top = 31;
  const SH = GH + top * 4;
  const H = (i, j) => (i < 0 || j < 0 || i >= GW || j >= GH ? 0 : hgt[j * GW + i]);
  const col = new Array(GW * SH).fill(null);
  const bandOf = new Int8Array(GW * SH).fill(-1);
  const nb = Math.ceil((y1 - y0) / band);
  const box = Array.from({ length: nb }, () => [1e9, 1e9, -1, -1]);
  // Front to back down each column: a ground point at row j and height h covers the screen rows from j (its foot) up
  // to h rows higher, and a row already covered by a point nearer the viewer keeps that point.
  const T = top * 4;
  const done = new Uint8Array(SH);
  for (let i = 0; i < GW; i += 1) {
    if (!colMax[i]) continue;
    done.fill(0);
    for (let j = GH - 1; j >= 0; j -= 1) {
      const h = hgt[j * GW + i] * 4;
      if (h === 0) continue;
      for (let z = 0; z <= h; z += 1) {
        const s = j + T - z;
        if (s < 0) break;
        if (s >= SH || done[s]) continue;
        done[s] = 1;
        const c = m2HelmColour(i, j, z / 4, h - z < 1, mat[j * GW + i], H, x0, y0, cx, cy);
        if (!c) continue;
        const k = s * GW + i;
        col[k] = c;
        const b = Math.min(nb - 1, Math.floor(j / 4 / band));
        bandOf[k] = b;
        const bx = box[b];
        if (i < bx[0]) bx[0] = i;
        if (s < bx[1]) bx[1] = s;
        if (i > bx[2]) bx[2] = i;
        if (s > bx[3]) bx[3] = s;
      }
    }
  }
  // Each band's footprints: runs along its rows where the ground stands more than a unit high.
  const feet = Array.from({ length: nb }, () => []);
  for (let b = 0; b < nb; b += 1) {
    let run = -1;
    for (let i = 0; i <= GW; i += 4) {
      let solid = false;
      for (let j = b * band * 4; i < GW && j < Math.min(GH, (b + 1) * band * 4); j += 2) if (hgt[j * GW + i] > 1) { solid = true; break; }
      if (solid && run < 0) run = i;
      if (!solid && run >= 0) { feet[b].push([run / 4, i / 4]); run = -1; }
    }
  }
  const out = { GW, SH, top, col, bandOf, box, feet, hgt, GH };
  m2HelmCache.set(key, out);
  return out;
}

// The colour of the solid point at grid (i, j), height z units, on its top (top) or its south face: rock lit by its
// slope with snow high up, dressed stone in courses, paving, turf; scene2-helm-caves.js cuts the gate, the culvert and
// the caves' mouth into the faces (m2HelmCut).
function m2HelmColour(i, j, z, top, m, H, x0, y0, cx, cy) {
  const [x, y] = [x0 + (i + 0.5) / 4, y0 + (j + 0.5) / 4];
  const b = M2_BAYER[(j & 3) * 4 + (i & 3)];
  const cut = typeof m2HelmCut === 'function' ? m2HelmCut(x, y, z, top, cx, cy) : null;
  if (cut) return cut;
  const R = M2_HELM_ROCK;
  const S = M2_HELM_STONE;
  if (top) {
    const lit = (H(i + 2, j) - H(i - 2, j)) * 0.9 + (H(i, j + 2) - H(i, j - 2)) * 0.7;
    if (m === M2_HM.rock) {
      // The lip of a cliff catches the light.
      if (H(i, j + 3) < z - 1.6) return z > 8.6 ? M2_HELM_SNOW[3] : R[5];
      if (z > 8.6 + m2Noise(x, y, 1.6, 33) * 2.5) return M2_HELM_SNOW[lit > 0.6 ? 3 : lit > -0.4 ? 2 : 1];
      const k = lit > 1.4 ? 4 : lit > 0.2 ? 3 : lit > -1 ? 2 : 1;
      return R[k + (b > 0.94 && k < 4 ? 1 : 0)];
    }
    if (m === M2_HM.turf) return ['#3f552d', '#536c38', '#678344', '#809a54'][lit > 0.4 ? 3 : lit > -0.2 ? 2 : 1];
    if (m === M2_HM.pave) return (Math.floor(x * 2) + Math.floor(y * 2)) % 3 === 0 && (i & 1) ? S[2] : lit > 0.5 ? S[4] : S[3];
    // A wall's walkway or a merlon's top.
    return z > 12.5 && (i + j) % 7 === 0 ? S[3] : S[z % 1 > 0.5 ? 5 : 4];
  }
  const side = H(i + 3, j + 2) * 4 >= z * 4 ? 1 : H(i - 3, j + 2) * 4 >= z * 4 ? -1 : 0;
  if (m === M2_HM.rock) {
    let k = side > 0 ? 4 : side < 0 ? 1 : 2;
    if (m2Hash(i >> 2, Math.floor(z / 2), 34) < 0.16) k -= 1;
    if (z < 0.8) k = 0;
    return R[Math.max(0, k)];
  }
  if (m === M2_HM.turf) return z < 0.5 ? '#2e3f24' : '#3f552d';
  // Dressed stone: courses a unit high with staggered joints, lit where the face turns west, dark at its foot. The
  // tower is round, so its face goes from lit on its west to dark on its east.
  const row = Math.floor(z);
  const tw = (x + 12) / 2.4;
  const round = Math.abs(tw) < 1 && Math.hypot(x + 12, (y + 6.5) * 1.15) < 2.6 && z > 5;
  if (round) {
    if (z % 1 < 0.25 || (Math.floor(x * 4) + (row % 2) * 3) % 6 === 0) return S[tw < -0.4 ? 3 : tw < 0.3 ? 2 : 1];
    return S[tw < -0.6 ? 5 : tw < -0.1 ? 4 : tw < 0.5 ? 3 : 2];
  }
  const joint = (Math.floor(x * 4) + (row % 2) * 4) % 8 === 0;
  if (z % 1 < 0.25 || joint) return S[side > 0 ? 2 : 1];
  if (z < 0.6) return S[0];
  return S[side > 0 ? 4 : side < 0 ? 2 : 3];
}

function m2Helm(L, plan, season, add) {
  const t0 = performance.now();
  const Hp = plan.places.helmsDeep;
  const C = plan.places.glitteringCaves ?? { x: Hp.x - 7, y: Hp.y + 8 };
  const [cx, cy] = [Math.round((C.x - Hp.x) * 2) / 2, Math.round((C.y - Hp.y) * 2) / 2];
  const { x0, x1, y0, y1, band } = M2_HELM;
  const [ox, oy] = [Hp.x + x0, Hp.y + y0];
  // The range's own peaks standing on the site step aside for it.
  const inSite = (o) => o.z > Hp.y - 6 && o.z < Hp.y + y1 + 8 && o.x + o.w * 0.5 > Hp.x + x0 + 2 && o.x + o.w * 0.5 < Hp.x + x1 - 2;
  m2.objects = m2.objects.filter((o) => !(o.w && !o.c && inSite(o) && /drawImage\(art,/.test(String(o.draw))));
  const D = m2HelmPaint(cx, cy);
  // The ground: the coomb's road up to the ramp, the gorge's stony floor, the stream from the caves out through the
  // culvert and across the coomb, and the ditch north of the dike; under the rock, cliff, so no walker climbs it.
  for (let j = 0; j < D.GH; j += 1) {
    for (let i = 0; i < D.GW; i += 1) {
      const [px, py] = [Math.round(ox * 4) + i, Math.round(oy * 4) + j];
      if (px < 0 || py < 0 || px >= L.pw || py >= L.ph) continue;
      const k = py * L.pw + px;
      const h = D.hgt[j * D.GW + i];
      L.shade[k] = 0;
      if (h > 1.2) { L.mat[k] = M2_MAT.cliff; L.under[k] = M2_MAT.cliff; L.aux[k] = 120; } else if (m2HelmGorge(x0 + i / 4, y0 + j / 4, cx, cy)) { L.mat[k] = M2_MAT.wild; L.under[k] = M2_MAT.wild; }
    }
  }
  const P = (dx, dy) => [Hp.x + dx, Hp.y + dy];
  m2Path(L, [P(14, -24), P(9, -17), P(3, -10), P(-2, -6)], 1.6, M2_MAT.road);
  m2Path(L, [P(cx + 1, cy + 3.2), P(3, cy + 3.5), P(4.5, 2)], 1.2, M2_MAT.path);
  m2Stroke(L, [P(cx, cy + 2), P(cx + 4, cy + 3.6), P(3.5, cy + 3), P(5, 2), P(5, 0.5)], 0.7, M2_MAT.water);
  m2Stroke(L, [P(5, -2.5), P(6, -9), P(6.6, -16), P(8, -22), P(11, -28)], (t) => 0.7 + t * 0.4, M2_MAT.water);
  m2Stroke(L, [P(-8, -20), P(4, -21.2), P(22, -18.4)], 0.5, M2_MAT.soil);
  m2Path(L, [P(5, -10.6), P(7.5, -10.4)], 1.1, M2_MAT.terrace);
  // The bands, each its own standing thing with its footprints.
  for (let b = 0; b < D.box.length; b += 1) {
    const [bx0, by0, bx1, by1] = D.box[b];
    if (bx1 < 0) continue;
    const [w, h] = [(bx1 - bx0 + 1) / 4, (by1 - by0 + 1) / 4];
    const c = m2SouthArt(`helm${cx},${cy}|${b}`, w, h, (px, py) => {
      const k = (py + by0) * D.GW + px + bx0;
      return D.bandOf[k] === b ? D.col[k] : null;
    });
    const [x, y] = [ox + bx0 / 4, oy - D.top + by0 / 4];
    const z = Hp.y + y0 + (b + 1) * band;
    const runs = D.feet[b];
    add.obj({ x, y, w, h, z, c, foot: runs.length ? [ox + runs[0][0], z - band, ox + runs[0][1], z] : undefined, draw: (dst) => dst.drawImage(c, x, y, w, h) });
    for (const [a, e] of runs.slice(1)) add.obj({ x: ox + a, y: z - band, w: 0.01, h: 0.01, z, foot: [ox + a, z - band, ox + e, z], draw: () => {} });
  }
  if (typeof m2HelmLife === 'function') m2HelmLife(L, plan, add, Hp, cx, cy);
  m2.south = { ...(m2.south ?? {}), helm: true };
  window.m2HelmMs = performance.now() - t0;
}

m2.builds.push(m2Helm);
