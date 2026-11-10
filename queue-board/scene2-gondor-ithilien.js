// scene2-gondor-ithilien.js: Ithilien on the map from above (scene2.js), the garden of Gondor east of the Anduin under
// the black Ephel Duath. Streams run down from the mountains through the woods to the river; glades open among the
// trees, bright with herbs and flowers; and at the northern stream's head the falls of Henneth Annun pour over a lip
// of rock into a pool before the hidden refuge. Faramir's patrol posts keep their ground: nothing stands near them,
// and the streams pass north and south of his round.

const M2ITH_STATE = {};
const M2ITH_FLOWERS = ['#f4f0ff', '#c9a6f0', '#ffd23a', '#f7a6c8', '#a9c8ff', '#ffffff'];

// Where the Ephel Duath's foot runs at row y.
function m2IthRangeX(plan, y) {
  const pts = plan.ranges?.ephel ?? [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [[ax, ay], [bx, by]] = [pts[i], pts[i + 1]];
    if ((y - ay) * (y - by) <= 0 && ay !== by) return ax + ((bx - ax) * (y - ay)) / (by - ay) - 8;
  }
  return plan.W * 0.78;
}

// The falls of Henneth Annun: a lip of dark rock 10 units wide, mossy on top, with the water curtain painted by the
// river's falls (scene2-gondor-river.js) over its face.
function m2IthCliffRule(px, py) {
  const [u, v] = [px / 4, py / 4];
  const top = 1 + Math.sin(u * 1.3) * 0.5 + (m2Hash(px >> 2, 1, 71) - 0.5) * 0.8;
  if (v < top || u < 0.3 || u > 9.7) return null;
  if (v < top + 1.2) return m2Hash(px, py, 72) < 0.3 ? '#5c8a44' : '#3f6a32';
  const lit = u < 3.5 ? 4 : u < 7 ? 3 : 2;
  const seam = m2Hash(px >> 1, py >> 2, 73) < 0.14;
  return ['#1e1c22', '#2e2c34', '#423f48', '#58545e', '#6e6a72'][seam ? lit - 2 : lit];
}

m2.builds.push((L, plan, season, add) => {
  const t0 = performance.now();
  const I = plan.places.ithilien;
  if (!I) return;
  const posts = plan.patrols?.ithilien ?? [];
  const nearPost = (x, y, r) => posts.some((p) => Math.hypot(p.x - x, p.y - y) < r);
  const river = (y) => (typeof m2GfRiverX === 'function' ? m2GfRiverX(plan, y) : plan.W * 0.72);
  const ys = posts.length ? posts.map((p) => p.y) : [I.y - 24, I.y + 24];
  const [n0, s0] = [Math.min(...ys) - 6, Math.max(...ys) + 7];
  // Two streams from the mountains' foot down to the Anduin, north and south of Faramir's round.
  const streams = [];
  for (const [y, seed] of [[n0, 1], [s0, 2]]) {
    if (y < 8 || y > plan.H - 4) continue;
    const [x0, x1] = [m2IthRangeX(plan, y), river(y + 3) + 1];
    if (x0 - x1 < 8) continue;
    const pts = m2Meander([[x0, y], [(x0 + x1) / 2, y + 2], [x1, y + 3]], seed + 70, 1.6);
    m2Stroke(L, pts, 0.75, M2_MAT.water, { over: M2_LAND_MATS });
    streams.push({ x0, y, pts });
  }
  // Glades among the trees: soft green clearings strewn with flowers and herbs.
  const glades = [[I.x - 5, I.y - 22, 5, 3.2], [I.x + 6, I.y + 19, 4.5, 3], [I.x - 4, I.y + 33, 5, 3]];
  for (const [x, y, rx, ry] of glades) {
    if (m2MatAt(L, x, y) === M2_MAT.water) continue;
    m2Blob(L, x, y, rx, ry, M2_MAT.elf, { wob: 1.2, seed: Math.round(x + y) });
    for (let i = m2.objects.length - 1; i >= 0; i -= 1) {
      const o = m2.objects[i];
      if (o.w && o.w < 16 && !o.foot && Math.hypot((o.x + o.w / 2 - x) / rx, ((o.z ?? o.y + o.h) - y) / ry) < 1) m2.objects.splice(i, 1);
    }
  }
  L.decals.push((g) => {
    for (const [x, y, rx, ry] of glades) {
      for (let k = 0; k < 22; k += 1) {
        const [a, r] = [m2Hash(k, Math.round(x), 74) * Math.PI * 2, Math.sqrt(m2Hash(k, Math.round(y), 75)) * 0.9];
        const [fx, fy] = [x + Math.cos(a) * rx * r, y + Math.sin(a) * ry * r];
        g.fillStyle = '#2f5a2c';
        g.fillRect(fx, fy + 0.25, 0.25, 0.25);
        g.fillStyle = M2ITH_FLOWERS[k % M2ITH_FLOWERS.length];
        g.fillRect(fx, fy, 0.25 + (k % 3 === 0 ? 0.25 : 0), 0.25);
      }
    }
  });
  // The woods of Ithilien, planted clear of Faramir's round: inside his loop, and on the river's bank west of it.
  const onRound = (x, y) => {
    for (let i = 0; i < posts.length; i += 1) {
      const [a, b] = [posts[i], posts[(i + 1) % posts.length]];
      const [dx, dy] = [b.x - a.x, b.y - a.y];
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
      if (Math.hypot(x - a.x - dx * t, y - a.y - dy * t) < 5) return true;
    }
    return false;
  };
  // Trees on a jittered grid across the land between the river and the mountains' foot, thick but with room between.
  const kinds = [['elf', 5], ['ever', 4], ['oak', 5], ['elf', 4], ['ever', 5], ['bush', 2]];
  let k = 0;
  for (let y = I.y - 40; y < Math.min(plan.H - 3, I.y + 44); y += 5.5) {
    for (let x = river(y) + 4; x < m2IthRangeX(plan, y) - 1; x += 6.5, k += 1) {
      const [tx, ty] = [x + (m2Hash(k, 1, 77) - 0.5) * 3.5, y + (m2Hash(k, 2, 77) - 0.5) * 3];
      if (m2Hash(k, 3, 77) < 0.18 || tx > m2IthRangeX(plan, ty) - 1.5 || tx < river(ty) + 3.5) continue;
      if (Math.hypot((tx - I.x) / 17, (ty - I.y - 2) / 12) < 1 || onRound(tx, ty) || nearPost(tx, ty, 7)) continue;
      if (m2MatAt(L, tx, ty) === M2_MAT.water || m2MatAt(L, tx, ty + 1.5) === M2_MAT.water) continue;
      if (glades.some(([gx, gy, rx, ry]) => Math.hypot((tx - gx) / rx, (ty - gy) / ry) < 1.2)) continue;
      if (streams.some((st) => Math.abs(ty - st.y - 1.5) < 3.5)) continue;
      const [kind, r] = kinds[Math.floor(m2Hash(k, 4, 77) * kinds.length)];
      m2Tree(L, add, tx, ty, kind, r, season, k + 30);
    }
  }
  // Henneth Annun at the northern stream's head: the lip of rock, the falling curtain, the pool and its spray.
  const north = streams[0];
  if (north && !nearPost(north.x0 - 1, north.y, 8)) {
    const [x, y] = [north.x0 - 1, north.y];
    m2Blob(L, x - 1, y + 1.5, 3.2, 1.6, M2_MAT.water, { wob: 0.5, seed: 76, aux: (nx, ny) => Math.hypot(nx, ny) * 235 });
    m2SouthThing(add, 'ithCliff', x - 5, y - 7, 10, 7, y - 0.5, m2IthCliffRule, [x - 5, y - 2.5, x + 5, y - 0.5]);
    const f = (g, tick, reduced) => {
      if (typeof m2GrFallsArt !== 'function') return;
      g.drawImage(m2GrFallsArt(4, 6, reduced ? 0 : Math.floor(tick / 2) % 4), x - 3, y - 5.5, 4, 6);
    };
    f.item = true;
    f.z = y - 0.4;
    add.anim(f);
    add.light({ x: x - 1, y: y - 3, r: 3, c: '#ffd890' });
    plan.places.hennethAnnun = { x: x - 1, y: y + 2 };
  }
  M2ITH_STATE.ms = performance.now() - t0;
});
