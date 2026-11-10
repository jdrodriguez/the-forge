// scene2-gondor-sea.js: the Sea on the map from above (scene2.js), in the map's southwest corner where the Brandywine
// and the Greyflood run out. The wild grass gives way to a sandy shore, then shallows over a pale bottom and the deep
// water beyond; surf rolls in and breaks along the whole coast, and a white-sailed ship rides at anchor offshore.
// Trees the world scattered where the water now lies are taken up again.

const M2SEA_STATE = {};
// The coast's line: how far east the water reaches at row y (none above the Sea's top row).
function m2SeaCoast(plan, y) {
  const { W, H } = plan;
  const top = (plan.places.sea?.y ?? 0.86 * H) - 0.07 * H;
  if (y < top) return -1;
  const t = (y - top) / (H - top);
  return W * (-0.025 + Math.sqrt(t) * 0.12 + t * 0.08) + (m2Noise(y, 0, 6, 91) - 0.5) * 6 + (m2Noise(y, 0, 2, 92) - 0.5) * 1.5;
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  const { H } = plan;
  const top = Math.max(0, Math.floor((plan.places.sea?.y ?? 0.86 * H) - 0.07 * H));
  const coast = [];
  let east = 0;
  for (let py = top * 4; py < L.ph; py += 1) {
    const y = py / 4;
    const c = m2SeaCoast(plan, y);
    coast.push(c);
    if (c < 0) continue;
    east = Math.max(east, c + 4);
    for (let px = 0; px < Math.min(L.pw, (c + 3) * 4); px += 1) {
      const d = c - px / 4;
      const i = py * L.pw + px;
      if (d < 0) { if (L.mat[i] !== M2_MAT.water) { L.mat[i] = M2_MAT.sand; L.under[i] = M2_MAT.sand; L.aux[i] = 0; } continue; }
      L.mat[i] = M2_MAT.water;
      L.under[i] = M2_MAT.water;
      L.shade[i] = 0;
      L.aux[i] = Math.max(0, Math.min(255, 245 - d * 24));
    }
  }
  // The world's trees and bushes standing in the new water go.
  const wet = (x, y) => { const c = m2SeaCoast(plan, y); return c >= 0 && x < c + 2.5; };
  for (let i = m2.objects.length - 1; i >= 0; i -= 1) {
    const o = m2.objects[i];
    if (o.w && o.w < 16 && wet(o.x + o.w / 2, o.z ?? o.y + o.h)) m2.objects.splice(i, 1);
  }
  // Surf in four frames: lines of foam rolling in toward the shore and a white wash where they break.
  const [bw, bh] = [Math.ceil(east), H - top];
  const frames = [0, 1, 2, 3].map((f) => m2SouthArt(`sea${f}`, bw, bh, (px, py) => {
    const c = coast[py];
    if (c === undefined || c < 0) return null;
    const d = c - (px + 0.5) / 4;
    if (d < 0 || d > 6) return null;
    if (d < 0.35) return m2Hash(px, py + f * 7, 93) < 0.7 ? '#ffffff' : '#d4eef4';
    const wave = (d + f * 0.45) % 1.8;
    const brk = m2Noise(py / 4, d * 0.5 + f, 1.5, 94) > 0.42;
    if (Math.abs(wave - 0.9) < 0.14 && brk && d < 4.5) return d < 1.5 ? '#f4fbfc' : '#cbe8f0';
    return null;
  }));
  const surf = (g, tick, reduced) => g.drawImage(frames[reduced ? 0 : Math.floor(tick / 4) % 4], 0, top, bw, bh);
  surf.under = true;
  add.anim(surf);
  // A ship of Gondor at anchor: a dark hull, a white sail with a grey seam, rocking a little on the swell.
  const sy = Math.min(H - 6, top + bh * 0.62);
  const sx = Math.max(6, (coast[Math.round((sy - top) * 4)] ?? 20) * 0.45);
  const ship = m2SouthArt('seaShip', 9, 9, (px, py) => {
    const [u, v] = [px / 4, py / 4];
    if (v >= 6 && v < 8.2 && Math.abs(u - 4.5) < 4.2 - (v - 6) * 1.2) return v < 6.5 ? '#8a5a34' : v > 7.6 ? '#2a1810' : '#5a3620';
    if (u >= 4.3 && u < 4.7 && v < 6.2 && v > 0.4) return '#3a2616';
    if (v > 1 && v < 5.4 && u > 2 && u < 7.2 && Math.abs(u - 4.6) < 2.6 - Math.abs(v - 3.2) * 0.15) return Math.abs(u - 4.5) < 0.26 ? '#9aa6b4' : u < 4.5 ? '#ffffff' : '#dfe6ee';
    if (v <= 1 && u > 4.6 && u < 6.4 && v > 0.2) return '#f0f4f8';
    return null;
  });
  const boat = (g, tick, reduced) => {
    const bob = reduced ? 0 : Math.round(Math.sin(tick * 0.12) * 1) / 4;
    g.globalAlpha = 0.35;
    g.fillStyle = '#0c2238';
    g.fillRect(sx - 4, sy + 0.25, 8, 0.75);
    g.globalAlpha = 1;
    g.drawImage(ship, sx - 4.5, sy - 8 + bob, 9, 9);
  };
  boat.item = true;
  boat.z = sy;
  add.anim(boat);
  add.light({ x: sx + 2.5, y: sy - 2, r: 2.5, c: '#ffd890' });
  plan.places.seaShore = { x: Math.max(0, (coast[Math.round((sy - top) * 4)] ?? 0) + 2), y: sy };
  M2SEA_STATE.ms = performance.now() - t0;
});
