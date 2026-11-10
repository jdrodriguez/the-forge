// scene2-shire-props.js: the Shire's yard things on the map from above, as v1 had them (scenery-farm.js, scenery-
// props): the well, a round wall of coursed stone with dark water in it, two posts and a little shingled roof, a crank,
// and a rope whose bucket goes down and comes up full while a hobbit winds it; the kettle, black and hung from a tripod
// over a ring of stones with a fire that flickers and steam that curls off its spout, a barrel and a little table with
// two mugs beside it; the cart, two big wheels and resting shafts, heaped with the harvest of the season (pumpkins and
// apples in autumn, cabbages in summer, sacks in winter) as full as it is loaded; and the vegetable garden, rows of
// cabbages, carrots and leeks, a wigwam of bean poles and, in autumn, fat pumpkins, inside a low wattle fence with a
// gap at its front. Each returns the spot where a hobbit stands to use it. People are 20 units tall; the well is
// about 17 units high.

const M2_SHIRE_PROP = new Map();
const m2ShireArt = (key, w, h, paint) => {
  if (!M2_SHIRE_PROP.has(key)) { const { c, g } = m2Canvas(w, h); paint(g); M2_SHIRE_PROP.set(key, c); }
  return M2_SHIRE_PROP.get(key);
};
// Whether a hobbit is at work on spot s (standing on it, not walking).
const m2ShireBusy = (s) => { for (const a of m2.actors.values()) if (!a.moving && Math.abs(a.x - s.x) < 0.8 && Math.abs(a.y - s.y) < 0.8) return true; return false; };

// The well, 12 units wide with its foot on row y, centred on x.
function m2ShireWell(L, add, x, y) {
  const c = m2ShireArt('well', 12, 18, (g) => {
    const St = M2_PAL.stone;
    // The wall: its rim an ellipse round dark water, its face in courses below it.
    m2Raster(g, 1, 9, 40, 36, (px, py) => {
      const e = ((px + 0.5 - 20) / 20) ** 2 + ((py + 0.5 - 8) / 8) ** 2;
      const inner = ((px + 0.5 - 20) / 15.5) ** 2 + ((py + 0.5 - 8) / 5) ** 2;
      if (py < 8 && e > 1) return null;
      if (py >= 8 && (px + 0.5 - 20) ** 2 > 400 - (py > 30 ? (py - 30) * 30 : 0)) return null;
      if (inner < 1) return inner > 0.7 ? '#141c28' : py < 6 ? '#1f2c3d' : '#2c3e52';
      if (py < 16 && e <= 1) return e > 0.88 ? St[0] : py < 8 ? St[5] : St[4];
      const row = Math.floor((py - 12) / 5);
      const j = (px + (row % 2) * 4) % 8;
      if (py === 35) return St[0];
      if ((py - 12) % 5 === 0 || j === 0) return St[1];
      return St[px < 12 ? 4 : px < 28 ? 3 : 2];
    });
    // The posts, the roof, the crank.
    for (const px of [1.25, 9.75]) { pxBox(g, px, 4, 1, 11, M2_PAL.wood[2]); pxBox(g, px, 4, 0.25, 11, M2_PAL.wood[4]); pxBox(g, px + 0.75, 4, 0.25, 11, M2_PAL.wood[0]); }
    pxBox(g, 1.5, 5, 9, 0.75, M2_PAL.wood[1]);
    m2Roof(g, 0, 0, 12, 1.25, 3.25, M2_PAL.thatch, 1);
    pxBox(g, 10.75, 5.75, 1.25, 0.5, M2_PAL.wood[1]);
    pxBox(g, 11.5, 5.75, 0.5, 2, M2_PAL.wood[3]);
  });
  m2Shadow(L, x + 2, y - 0.5, 7, 2, 0.8);
  const o = m2Thing(add, x - 6, y - 17.5, 12, 18, y, (g) => g.drawImage(c, 0, 0, 12, 18));
  o.foot = [x - 5.5, y - 4, x + 5.5, y];
  const spot = { x: Math.round(x), y: y + 4, face: 'up', job: 'water' };
  // The rope and bucket: down in the water while nobody winds, rising and falling with the crank while someone does.
  const f = (g, tick, reduced) => {
    const busy = !reduced && m2ShireBusy(spot);
    const k = busy ? (tick % 80) / 80 : 0;
    const drop = busy ? 6 * Math.abs(Math.cos(k * Math.PI)) : 6;
    pxBox(g, x - 0.25, y - 12.25, 0.25, drop + 0.5, '#c9b48a');
    if (drop < 5.5) {
      pxBox(g, x - 1, y - 11.75 + drop, 1.75, 1.5, M2_PAL.wood[2]);
      pxBox(g, x - 1, y - 11.75 + drop, 1.75, 0.25, M2_PAL.wood[4]);
      pxBox(g, x - 0.75, y - 11.5 + drop, 1.25, 0.25, '#4f9dbb');
    }
    if (busy) pxBox(g, x + 5.5 + Math.round(Math.cos(tick / 4) * 3) / 4, y - 10.5 + Math.round(Math.sin(tick / 4) * 3) / 4, 0.75, 0.75, M2_PAL.wood[4]);
  };
  f.item = true;
  f.z = y + 0.05;
  add.anim(f);
  return spot;
}

// The kettle over its fire, with a barrel and a table: 16 units wide, its foot on row y, its left edge at x.
function m2ShireKettle(L, add, x, y, season) {
  const c = m2ShireArt('kettle', 16, 11, (g) => {
    // The barrel, staves lit on the left, iron hoops.
    m2Raster(g, 0.5, 2, 20, 36, (px, py) => {
      const bulge = Math.round(Math.sin((py / 35) * Math.PI) * 2);
      if (px < 2 - bulge || px > 17 + bulge) return null;
      if (py < 3) return py === 0 ? M2_PAL.wood[0] : M2_PAL.wood[py === 1 ? 4 : 3];
      if (py % 11 === 5 || py === 35) return '#2a2420';
      return M2_PAL.wood[(px - 2 + bulge) % 4 === 0 ? 1 : px < 7 ? 4 : px < 13 ? 3 : 2];
    });
    // The table and its two mugs.
    pxBox(g, 11, 5.5, 5, 1, M2_PAL.wood[4]);
    pxBox(g, 11, 6.5, 5, 0.5, M2_PAL.wood[1]);
    for (const lx of [11.25, 15.25]) pxBox(g, lx, 7, 0.5, 3.5, M2_PAL.wood[1]);
    for (const mx of [12, 14]) { pxBox(g, mx, 4.25, 1, 1.25, '#e8e0cc'); pxBox(g, mx + 1, 4.5, 0.5, 0.5, '#e8e0cc'); pxBox(g, mx + 0.5, 4.25, 0.5, 1.25, '#b8ae98'); }
    // The ring of stones under the fire, the tripod and the kettle.
    for (let i = 0; i < 7; i += 1) { const a = (i / 7) * Math.PI * 2; pxBox(g, 7.5 + Math.cos(a) * 2.25 - 0.5, 9.25 + Math.sin(a) * 0.9 - 0.5, 1, 0.75, M2_PAL.stone[i % 2 ? 3 : 4]); }
    for (const [ax, bx] of [[5.5, 7.5], [9.5, 7.5]]) for (let t = 0; t <= 1; t += 0.1) pxBox(g, Math.round((ax + (bx - ax) * t) * 4) / 4, Math.round((9.5 - t * 7.5) * 4) / 4, 0.25, 0.75, '#2a2420');
    pxBox(g, 7.5, 2, 0.25, 2, '#5a5040');
    m2Raster(g, 5.5, 3.75, 16, 12, (px, py) => {
      const e = ((px + 0.5 - 8) / 8) ** 2 + ((py + 0.5 - 6.5) / 5.5) ** 2;
      if (py < 2) return px > 4 && px < 11 ? (py ? '#3a3640' : '#1a1820') : null;
      if (e > 1) return px > 13 && py > 3 && py < 6 ? '#22202a' : null;
      return e > 0.8 ? '#121018' : px < 6 && py < 6 ? '#6a6878' : px < 9 ? '#3a3846' : '#22202a';
    });
  });
  m2Shadow(L, x + 9, y - 0.5, 8, 1.5, 0.8);
  const o = m2Thing(add, x, y - 10.5, 16, 11, y, (g) => g.drawImage(c, 0, 0, 16, 11));
  o.foot = [x, y - 3, x + 16, y];
  // The fire flickers under the kettle and steam curls from its spout.
  const fire = (g, tick, reduced) => {
    const k = reduced ? 0 : (tick >> 2) % 3;
    for (let i = 0; i < 4; i += 1) {
      const fh = 1 + ((i + k) % 3) * 0.5;
      pxBox(g, x + 6.5 + i * 0.5, y - 1.5 - fh, 0.5, fh, i % 2 ? '#ff9a3c' : '#ffd27a');
    }
    pxBox(g, x + 6.75, y - 1.75, 1.5, 0.5, '#fff3c4');
    for (let i = 0; i < 3; i += 1) {
      const t = ((reduced ? i * 7 : tick) + i * 7) % 21;
      g.globalAlpha = 0.7 - t / 30;
      pxBox(g, Math.round((x + 13 + t * 0.15 + Math.sin(t / 3) * 0.5) * 4) / 4, Math.round((y - 6 - t * 0.3) * 4) / 4, 0.75, 0.5, '#f4f2ee');
    }
    g.globalAlpha = 1;
  };
  fire.item = true;
  fire.z = y + 0.05;
  add.anim(fire);
  add.light({ x: x + 7.5, y: y - 2, r: 6, c: '#ffb050', fire: true });
  return { x: Math.round(x + 7.5), y: y + 4, face: 'up', job: 'brew' };
}

// The cart, 20 units long with its wheels' feet on row y and its left edge at x. Its heap of the season's harvest is
// drawn as full as the hobbits have loaded it (scene2-stock-art.js's m2sCart, from the spot's cart).
function m2ShireCart(L, add, x, y, season, seed) {
  const c = m2ShireArt('cart', 20, 13, (g) => {
    const W = M2_PAL.wood;
    // The shafts resting on the ground to the right, the bed, then the near wheel.
    for (const sy of [8.5, 9.5]) for (let t = 0; t <= 1; t += 0.05) pxBox(g, Math.round((13 + t * 6.5) * 4) / 4, Math.round((sy + t * 2.75) * 4) / 4, 0.5, 0.5, W[t < 0.5 ? 3 : 2]);
    m2Raster(g, 1, 4.5, 56, 22, (px, py) => (py === 0 || py === 21 || px === 0 || px === 55 ? W[0] : py < 3 ? W[4] : py % 7 === 3 ? W[1] : W[px < 20 ? 3 : 2]));
    for (const wx of [3.5, 11.5]) {
      m2Raster(g, wx - 3, 7, 24, 24, (px, py) => {
        const r = Math.hypot(px + 0.5 - 12, py + 0.5 - 12);
        if (r > 12) return null;
        if (r > 10) return r > 11.3 ? W[0] : W[px + py < 22 ? 4 : 2];
        if (r < 2) return r < 1 ? '#2a2420' : W[1];
        const a = Math.atan2(py + 0.5 - 12, px + 0.5 - 12);
        return Math.abs(Math.sin(a * 3)) < 0.18 ? W[2] : null;
      });
    }
  });
  m2Shadow(L, x + 11, y - 0.5, 10, 1.75, 0.8);
  const o = m2Thing(add, x, y - 12.5, 20, 13, y, (g) => g.drawImage(c, 0, 0, 20, 13));
  o.foot = [x, y - 4, x + 20, y];
  return { x: Math.round(x + 8), y: y + 4, face: 'up', job: 'cart', mid: x + 8, cart: { x, y: y - 12.5, z: y, season, seed } };
}

// The vegetable garden, w by h units with its top-left at (x, y): tilled rows and their crops in a wattle fence.
function m2ShireGarden(L, add, x, y, w, h, season, seed) {
  m2Rect(L, x + 1, y + 1, w - 2, h - 2, M2_MAT.soil);
  const rows = Math.floor((h - 4) / 3.5);
  const crops = season === 'autumn' ? ['pumpkin', 'cabbage', 'leek', 'carrot'] : season === 'winter' ? ['cabbage', 'leek'] : ['cabbage', 'carrot', 'leek', 'beans'];
  const o = m2Thing(add, x, y - 6, w, h + 6, y + h, (g) => {
    for (let j = 0; j < rows; j += 1) {
      const kind = crops[(j + seed) % crops.length];
      const ry = 6 + 2.5 + j * 3.5;
      for (let i = 0; i < Math.floor((w - 4) / 2.5); i += 1) {
        const px = 2 + i * 2.5 + (j % 2) * 0.75;
        if (kind === 'pumpkin' && i % 2 === 0) {
          pxBox(g, px, ry - 1, 2.25, 1.75, '#c8641c'); pxBox(g, px + 0.25, ry - 1, 1.5, 1.25, '#e8902c'); pxBox(g, px + 0.5, ry - 0.75, 0.5, 0.5, '#ffc070'); pxBox(g, px + 1, ry - 1.5, 0.25, 0.5, '#3f7a2c');
        } else if (kind === 'cabbage') {
          pxBox(g, px, ry - 1, 2, 1.5, '#3f7a2c'); pxBox(g, px + 0.25, ry - 1.25, 1.5, 1.25, '#7ab84a'); pxBox(g, px + 0.5, ry - 1, 0.75, 0.5, '#b8e08a');
        } else if (kind === 'leek') {
          for (const lx of [0, 1]) { pxBox(g, px + lx, ry - 2, 0.25, 2, '#2f6a34'); pxBox(g, px + lx + 0.25, ry - 2.25, 0.25, 1.75, '#7ab84a'); pxBox(g, px + lx, ry - 0.5, 0.5, 0.5, '#e8e0cc'); }
        } else if (kind === 'carrot') {
          for (const lx of [0, 0.75, 1.25]) pxBox(g, px + lx, ry - 1.5 + (lx === 0.75 ? -0.25 : 0), 0.25, 1.25, lx === 0.75 ? '#8cc25a' : '#5a9a3c');
          pxBox(g, px + 0.5, ry - 0.25, 0.5, 0.25, '#e8902c');
        }
      }
      if (kind === 'beans') for (let i = 0; i < 3; i += 1) {
        const bx = 3 + i * ((w - 6) / 2.5);
        for (let t = 0; t <= 1; t += 0.1) { pxBox(g, bx + t * 1.5, ry - 6 + t * 6, 0.25, 0.5, M2_PAL.wood[3]); pxBox(g, bx + 3 - t * 1.5, ry - 6 + t * 6, 0.25, 0.5, M2_PAL.wood[2]); }
        for (let k = 0; k < 6; k += 1) pxBox(g, bx + 0.5 + m2Hash(i, k, seed) * 2, ry - 5 + k * 0.8, 0.75, 0.5, k % 2 ? '#3f7a2c' : '#7ab84a');
      }
    }
    // The wattle fence: woven hazel along the back and sides and either side of the front gap.
    const wattle = (fx, fy, len) => { for (let i = 0; i < len * 4; i += 1) for (let r = 0; r < 3; r += 1) pxBox(g, fx + i / 4, fy - 2 + r * 0.75, 0.25, 0.5, M2_PAL.wood[(i + r * 2) % 4 < 2 ? 3 : 1]); for (let i = 0; i <= len; i += 3) pxBox(g, fx + Math.min(i, len - 0.5), fy - 2.75, 0.5, 2.75, M2_PAL.wood[1]); };
    wattle(0, 6.5, w);
    for (let k = 0; k < h - 1; k += 1) { pxBox(g, 0, 6 + k, 0.5, 1, M2_PAL.wood[k % 2 ? 1 : 3]); pxBox(g, w - 0.5, 6 + k, 0.5, 1, M2_PAL.wood[k % 2 ? 1 : 3]); }
    wattle(0, h + 5.75, w / 2 - 2.5);
    wattle(w / 2 + 2.5, h + 5.75, w / 2 - 2.5);
  });
  o.foot = [x, y, x + w, y + h];
  return { x: Math.round(x + w / 2), y: y + h + 3, face: 'up', job: 'garden' };
}
