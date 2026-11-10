// scene2-station-art.js: two of the map from above's stations (scene2-stations.js) at the 1.4 times scale. The
// hobbits' garden plot, 22 by 14 units: tilled soil in furrows on the ground inside flat edging boards, a plank front
// with corner posts, and fifteen plants in three rows that sprout, leaf out, wither (a crow pecks among them) and
// ripen into cabbages, a pumpkin and a row of carrots, sparkling. The dwarves' anvil on its stump, 10 by 8 units: the
// stump's ringed top over its barked side and roots, the anvil with its horn west and heel east, its top face lit, and
// the blade on it: steel glowing at its point and throwing sparks while it builds, orange hot with a PR open, cracked
// red and smoking when CI fails, gold when green. Each stage's art is painted once and cached.

const M2_LEAF = ['#1d3a1c', '#2f5e27', '#4a8a32', '#72b347', '#a5d76a', '#d8f2a0'];
const M2_DRY = ['#3e2312', '#6e4322', '#9c6a36', '#c4964f'];
const M2_SOIL = ['#2a1a10', '#402618', '#563521', '#6c462c', '#83593a', '#9e724c'];

// The plot's ground: soil in furrows across it, clods, and flat edging boards along its back and sides.
function m2PlotGround(L, s) {
  const [x0, y0] = [s.x - 11, s.y - 14];
  m2Rect(L, x0, y0, 22, 14, M2_MAT.soil);
  m2Shadow(L, s.x + 1, s.y + 0.5, 11, 1.2, 0.6);
  L.decals.push((g) => {
    m2Raster(g, x0, y0, 88, 56, (px, py) => {
      if (px < 3 || px > 84 || py < 3) return M2_PAL.wood[px === 0 || px === 87 || py === 0 ? 0 : px === 1 || py === 1 ? 4 : 3];
      const f = (py - 3) % 13;
      let k = f < 2 ? 5 : f < 5 ? 4 : f < 9 ? 3 : f < 11 ? 2 : 1;
      if (m2Hash(px, py, s.x) < 0.06) k = Math.max(0, k - 2);
      else if (m2Hash(px >> 1, py, s.y) < 0.05) k = Math.min(5, k + 1);
      return M2_SOIL[k];
    });
  });
}
// A rosette of leaves round (cx, fy) units with radius r: lobes lit on their upper left, a dark rim; head (a pale
// round heart) makes it a cabbage.
function m2Rosette(g, cx, fy, r, head, seed) {
  const R = r * 4;
  m2Raster(g, cx - r - 0.25, fy - r * 1.6, R * 2 + 2, R * 1.6 + 2, (px, py) => {
    const [dx, dy] = [px + 0.5 - R - 1, (py + 0.5 - R * 0.85) * 1.25];
    const a = Math.atan2(dy, dx);
    const d = Math.hypot(dx, dy);
    const lobe = R * (0.72 + 0.28 * Math.abs(Math.cos(a * 2.5 + seed)));
    if (d > lobe) return null;
    if (d > lobe - 1.2) return M2_LEAF[0];
    if (head && d < R * 0.5) {
      const vein = Math.abs(Math.sin(a * 3 + seed)) < 0.18 && d > R * 0.2;
      return vein ? M2_LEAF[3] : (dx + dy < -R * 0.2 ? M2_LEAF[5] : M2_LEAF[4]);
    }
    const lit = -(dx + dy) / R + (Math.abs(Math.sin(a * 2.5 + seed)) < 0.2 ? -0.6 : 0);
    return M2_LEAF[lit > 0.5 ? 4 : lit > 0 ? 3 : lit > -0.6 ? 2 : 1];
  });
}
// One plant of the plot's at stage, its foot at (cx, fy) units in the plot's canvas; carrot marks the front row.
function m2PlotPlant(g, px, cx, fy, stage, i, carrot) {
  const X = Math.round(cx * 4);
  const Y = Math.round(fy * 4);
  px(X - 3, Y - 1, 7, 2, M2_SOIL[1]);
  if (stage === 1) {
    px(X, Y - 6, 1, 6, M2_LEAF[2]);
    px(X - 3, Y - 7, 3, 2, M2_LEAF[3]); px(X - 3, Y - 7, 1, 1, M2_LEAF[5]);
    px(X + 1, Y - 8, 3, 2, M2_LEAF[3]); px(X + 3, Y - 7, 1, 1, M2_LEAF[1]);
  } else if (stage === 2) {
    m2Rosette(g, cx, fy, 1.6, false, i);
  } else if (stage === 3) {
    for (let k = -1; k <= 1; k += 1) {
      for (let j = 0; j < 10; j += 1) px(X + k * 2 + Math.round(k * j * 0.35), Y - j - 1, j < 7 ? 2 : 1, 1, M2_DRY[j > 6 ? 3 : j > 3 ? 2 : 1]);
      px(X + k * 4 - 2, Y - 8 + Math.abs(k) * 2, 4, 1, M2_DRY[3]); px(X + k * 4 + (k < 0 ? -2 : 2), Y - 7 + Math.abs(k) * 2, 1, 3, M2_DRY[2]);
    }
  } else if (carrot) {
    for (const [dx, h] of [[-2, 7], [0, 9], [2, 7]]) {
      for (let j = 0; j < h; j += 1) px(X + dx + (j > 4 ? Math.sign(dx) : 0), Y - 2 - j, 1, 1, M2_LEAF[j % 2 ? 3 : 2]);
      px(X + dx - 1, Y - 2 - h, 3, 1, M2_LEAF[4]);
    }
    px(X - 2, Y - 2, 5, 2, '#e8762a'); px(X - 2, Y - 2, 2, 1, '#ffb05a');
  } else {
    m2Rosette(g, cx, fy, 1.8, true, i);
  }
}
// The pumpkin in the middle of a ripe plot: ribbed, lit on its upper left, a stalk and a leaf.
function m2Pumpkin(g, px, cx, fy) {
  m2Raster(g, cx - 2.75, fy - 4, 22, 16, (x, y) => {
    const [nx, ny] = [(x + 0.5 - 11) / 11, (y + 0.5 - 9) / 7];
    const d = nx * nx + ny * ny;
    if (d > 1) return null;
    if (d > 0.82) return '#5a1e0a';
    const rib = Math.abs(Math.sin(nx * 4.6)) < 0.22;
    const lit = -(nx + ny);
    return rib ? '#9a3a14' : lit > 0.7 ? '#ffe1a2' : lit > 0.2 ? '#ffb452' : lit > -0.5 ? '#f08a2a' : '#cc5d1c';
  });
  px(Math.round(cx * 4), Math.round(fy * 4) - 17, 2, 3, '#2f5e27');
  px(Math.round(cx * 4) + 2, Math.round(fy * 4) - 18, 5, 3, M2_LEAF[3]); px(Math.round(cx * 4) + 3, Math.round(fy * 4) - 18, 2, 1, M2_LEAF[5]);
}
// The plot at stage, 22 by 18 units with its front edging on the bottom row: the plants, and the plank front with
// its corner posts.
function m2PlotAt(stage) {
  return m2StCanvas(`plot${stage}`, 22, 18, (g, px) => {
    if (stage) {
      [7, 11, 15].forEach((fy, row) => [3.5, 7.5, 11, 14.5, 18.5].forEach((cx, col) => {
        if (stage === 4 && row === 1 && col === 2) return m2Pumpkin(g, px, cx, fy + 0.5);
        m2PlotPlant(g, px, cx + (row % 2 ? 0.5 : 0), fy, stage, row * 5 + col, row === 2);
      }));
    }
    const W = M2_PAL.wood;
    m2Raster(g, 0, 16, 88, 8, (x, y) => {
      if (y === 7 || x === 0 || x === 87) return W[0];
      if (y === 0) return W[5];
      return W[x % 22 === 0 ? 1 : y < 3 ? 4 : y < 6 ? 3 : 2];
    });
    for (const cx of [0, 21]) { px(cx * 4, 61, 4, 11, W[0]); px(cx * 4 + 1, 62, 1, 9, W[4]); px(cx * 4 + 2, 62, 1, 9, W[2]); px(cx * 4, 60, 4, 2, W[5]); }
  });
}
// The plot at stage with its front on row y, centred on x: a crow hops among the withered plants; the ripe plot
// sparkles over its pumpkin.
function m2DrawPlot(g, x, y, stage, tick) {
  g.drawImage(m2PlotAt(stage), x - 11, y - 18, 22, 18);
  if (stage === 3) {
    const t = (tick >> 3) % 8;
    const [bx, by] = [x - 6 + (t < 4 ? t : 8 - t) * 2.5, y - 8 - (tick % 8 < 2 ? 0.5 : 0)];
    pxBox(g, bx, by, 2, 1.25, '#14121a'); pxBox(g, bx + (t < 4 ? 1.75 : -0.75), by - 0.75, 1, 1, '#14121a');
    pxBox(g, bx + (t < 4 ? 2.5 : -1), by - 0.5, 0.5, 0.25, '#e2b043'); pxBox(g, bx + 0.25, by, 1, 0.25, '#3a3848');
  }
  if (stage === 4) m2StSpark(g, x + 2.5, y - 13.5, tick % 12 < 6);
}

// The stump and the anvil on it, 12 by 17 units with the stump's foot on the bottom row: the stump's side in bark
// with grooves and its roots, its top in rings, the anvil's foot, waist, horned body and lit top face.
function m2AnvilBase() {
  return m2StCanvas('anvil', 12, 17, (g, px) => {
    const B = ['#2a1810', '#4a2e1c', '#6e4a2e', '#8f6640', '#b38654', '#d4aa76'];
    const I = ['#14141c', '#262838', '#3e4256', '#5a6078', '#808aa2', '#b8c4d4'];
    m2Raster(g, 0, 0, 48, 68, (x, y) => {
      const [u, v] = [(x + 0.5) / 4 - 6, (y + 0.5) / 4];
      const flare = v > 15 ? (v - 15) * 0.6 : 0;
      const e = (u / 4.6) ** 2;
      const top = 10.75 - 2.3 * Math.sqrt(Math.max(0, 1 - e));
      const bot = 15.4 + 1.2 * Math.sqrt(Math.max(0, 1 - (u / (4.6 + flare)) ** 2));
      if (Math.abs(u) <= 4.6 + flare && v >= top && v <= bot) {
        const inTop = ((v - 10.75) / 2.3) ** 2 + e <= 1;
        if (inTop) {
          const d = Math.hypot(u / 4.6, (v - 10.75) / 2.3);
          if (d > 0.9) return B[1];
          if (d < 0.12) return B[2];
          return Math.round(d * 9) % 2 ? B[4] : B[5];
        }
        if (v > bot - 0.3 || Math.abs(u) > 4.35 + flare) return B[0];
        const groove = m2Hash(Math.round(u * 1.6), 1, 11) < 0.35 && (x % 5 === 0);
        return groove ? B[0] : B[u < -2.5 ? 3 : u > 2.8 ? 1 : 2];
      }
      return null;
    });
    // The anvil: foot, waist, body with its horn tapering west and square heel east, and the lit top face.
    px(15, 37, 18, 7, I[0]); px(16, 37, 16, 6, I[2]); px(16, 37, 3, 6, I[3]); px(29, 37, 3, 6, I[1]);
    px(19, 30, 10, 7, I[0]); px(20, 30, 8, 7, I[2]); px(20, 30, 2, 7, I[3]); px(26, 30, 2, 7, I[1]);
    m2Raster(g, 0, 4.5, 48, 13, (x, y) => {
      const left = 2 + Math.abs(y - 5) * 1.6;
      if (x < left || x > 44) return null;
      if (y === 0 || x < left + 1 || x === 44 || y === 12) return I[0];
      if (y < 4) return I[x < 14 ? 4 : 3];
      if (y === 4) return I[4];
      return I[y > 9 ? 1 : x < 12 ? 3 : x > 38 ? 1 : 2];
    });
    // Tongs lying on the stump's top by the anvil's foot.
    for (let i = 0; i < 10; i += 1) { px(34 + i, 40 + Math.round(i * 0.2), 1, 1, I[0]); px(34 + i, 42 + Math.round(i * 0.1), 1, 1, I[1]); }
  });
}
// The blade's colours at each stage: steel, hot orange, cracked red, gold (light, mid, shade, dark).
const M2_BLADE = [null, ['#ffffff', '#d6dfe8', '#a9b5c4', '#4b5266'], ['#fff1c0', '#ffc24a', '#ff8a2a', '#b8461c'],
  ['#ff9a80', '#e0452c', '#a82a20', '#5e1414'], ['#fffbe8', '#fbdd86', '#e2b043', '#8a5a1a']];
// The anvil at stage with its blade on the top face, its wooden tang west and its point east.
function m2AnvilAt(stage) {
  return m2StCanvas(`anvil${stage}`, 12, 17, (g, px) => {
    g.drawImage(m2AnvilBase(), 0, 0, 12, 17);
    if (!stage) return;
    const C = M2_BLADE[stage];
    px(8, 17, 7, 3, M2_PAL.wood[0]); px(9, 17, 5, 2, M2_PAL.wood[3]); px(14, 16, 2, 5, M2_PAL.gold[1]);
    for (let x = 16; x < 42; x += 1) {
      const w = x > 36 ? 41 - x : 5;
      px(x, 16, 1, w, C[3]);
      if (w > 1) px(x, 16, 1, 1, C[0]);
      if (w > 2) px(x, 17, 1, w - 2, C[x % 7 === 0 ? 2 : 1]);
    }
    px(16, 16, 25, 1, C[0]);
    if (stage === 3) [[27, 16], [26, 17], [27, 18], [28, 19], [26, 20]].forEach(([cx, cy]) => px(cx, cy, 1, 1, '#160808'));
  });
}
// The anvil at stage with its stump's foot on row y, centred on x: the glow creeping up the point and sparks while
// it builds, smoke from the crack, a sparkle when green.
function m2DrawAnvil(g, x, y, stage, tick) {
  g.drawImage(m2AnvilAt(stage), x - 6, y - 17, 12, 17);
  if (!stage) return;
  const [tx, ty] = [x - 6 + 9.5, y - 17 + 4.5];
  if (stage === 1) {
    const n = tick % 4 < 2 ? 2.5 : 3.25;
    pxBox(g, tx - n, ty - 0.25, n, 1, '#ff8a2a');
    pxBox(g, tx - n + 0.5, ty, n - 1, 0.5, '#ffd35a');
    for (let i = 0; i < 4; i += 1) {
      const t = (tick + i * 5) % 12;
      if (t > 7) continue;
      pxBox(g, tx - 1 + Math.cos(i * 1.7) * t * 0.5, ty - 0.5 - t * 0.45 + t * t * 0.03, 0.25, 0.25, t < 3 ? '#fff3c4' : '#ffb040');
    }
    m2.glow?.add?.(tx - 1, ty, 5, '#ff8a2a', 0.5);
  } else if (stage === 2) {
    m2.glow?.add?.(tx - 3, ty, 6, '#ff8a2a', 0.45);
  } else if (stage === 3) {
    const t = (tick >> 2) % 6;
    g.globalAlpha = 0.5 - t * 0.07;
    pxBox(g, x - 0.5 + t * 0.25, y - 13.5 - t * 0.75, 1 + t * 0.25, 0.75, '#6a6470');
    g.globalAlpha = 1;
  } else {
    m2StSpark(g, tx - 1, ty - 2.5, tick % 12 < 6);
  }
}
