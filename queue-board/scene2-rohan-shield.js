// scene2-rohan-shield.js: the Men's station on the map from above (scene2-stations.js), in the desk's footprint (15
// by 18 units, its front legs on the bottom row): a round shield of Rohan leaning back on a wooden trestle. It shows
// the PR's progress as the other stations do: stage 1 (building) a bare shield of planks with its iron rim half fitted,
// nails on the beam and a strip of rim iron below, 2 (a PR open) painted green with a white horse taking shape over its
// chalk outline and the paint pot below, 3 (CI failing) a red crack across it, 4 (green) a gilded rim and the white
// horse whole, sparkling. 0 (nobody there) is the bare shield with no work on it. Each stage's art is painted once and
// cached (scene2-stations.js's m2StCanvas).

const M2_SHIELD_GREEN = ['#163a1a', '#215226', '#2f6a30', '#3f8a3a', '#5aa64e'];
const M2_SHIELD_WHITE = ['#9aa69a', '#dcdcd0', '#f6f4ea'];
const M2_SHIELD_IRON = ['#14141c', '#3e4256', '#5a6078', '#8a95a6', '#c7d0dc'];
// The white horse running east, in blocks of 2 by 2 pixels (half a unit): head and mane up front, the tail streaming.
const M2_SHIELD_HORSE = [
  '..........##......',
  '.........#####....',
  '........###.####..',
  '.......####..####.',
  '......#####....##.',
  '#....######.......',
  '.###########......',
  '..##########......',
  '..###....####.....',
  '.##.......#..#....',
  '#.........#...#...',
];
// The shield's face is an ellipse round (30, 33) pixels, 24 across and 17 down: a circle leaning back.
const M2_SHIELD_C = { x: 30, y: 33, rx: 24, ry: 17 };

// True where the horse covers pixel (px, py) of the face; part 'front' is only its head, neck and forelegs.
function m2ShieldHorse(px, py, part) {
  const [c, r] = [Math.floor((px - 12) / 2), Math.floor((py - 22) / 2)];
  if (part === 'front' && c < 9) return false;
  return M2_SHIELD_HORSE[r]?.[c] === '#';
}
// The chalk line round the horse: pixels just outside it.
const m2ShieldChalk = (px, py) => !m2ShieldHorse(px, py) && [[2, 0], [-2, 0], [0, 2], [0, -2]].some(([dx, dy]) => m2ShieldHorse(px + dx, py + dy));

// The trestle: a beam across with its end grain, and two splayed legs at each end (the back ones shorter and darker).
function m2ShieldTrestle(g, px) {
  const W = M2_PAL.wood;
  for (const [x0, x1, top, foot, k] of [[9, 13, 34, 64, 1], [50, 46, 34, 64, 1], [7, 2, 34, 72, 3], [52, 57, 34, 72, 3]]) {
    for (let y = top; y < foot; y += 1) {
      const x = Math.round(x0 + ((x1 - x0) * (y - top)) / (foot - top));
      px(x, y, 3, 1, W[k]); px(x, y, 1, 1, W[k + 1]); px(x + 2, y, 1, 1, W[0]);
    }
    px(x1 - 1, foot - 1, 5, 1, W[0]);
  }
  m2Raster(g, 0, 7.5, 60, 6, (x, y) => (y === 0 || y === 5 || x === 0 || x === 59 ? W[0] : y === 1 ? W[5] : x < 3 || x > 56 ? W[2] : W[(x + y * 5) % 11 === 0 ? 2 : 3]));
}

// The face of the shield at stage, pixel by pixel: the field (planks, or green paint lit on the upper left), the horse,
// the rim (wood, iron with rivets, or gold), and the shield's thickness showing under its lower edge.
function m2ShieldFace(stage) {
  return (px, py) => {
    const { x, y, rx, ry } = M2_SHIELD_C;
    const [u, v] = [(px + 0.5 - x) / rx, (py + 0.5 - y) / ry];
    const d = u * u + v * v;
    if (d > 1) {
      const [u2, v2] = [u, (py - 1.5 - y) / ry];
      return u2 * u2 + v2 * v2 <= 1 && v > 0 ? M2_PAL.wood[0] : null;
    }
    const lit = -(u + v) * 0.7;
    if (d > 0.8) {
      // The rim: on the bare shield none of it is fitted, while it builds the iron runs over its top from east to
      // west, and the rest is the planks' raw edge. Rivets every twentieth of the way round.
      const ang = Math.atan2(v, u);
      if (stage === 4) return M2_PAL.gold[d > 0.93 ? 1 : lit > 0.2 ? 4 : lit > -0.3 ? 3 : 2];
      if (stage === 0 || (stage === 1 && !(ang < 0.3 && ang > -2.6))) return M2_PAL.wood[d > 0.93 ? 0 : 2];
      const turn = (((ang + Math.PI) / (Math.PI * 2)) * 20) % 1;
      if ((turn < 0.06 || turn > 0.94) && d < 0.9) return M2_SHIELD_IRON[4];
      return M2_SHIELD_IRON[d > 0.93 ? 0 : lit > 0.2 ? 3 : 2];
    }
    if (stage <= 1) {
      // Planks running up and down, their seams dark, grain flecked.
      const plank = Math.floor((px - 6) / 8);
      if ((px - 6) % 8 === 0) return M2_PAL.wood[1];
      const k = lit > 0.3 ? 4 : lit > -0.3 ? 3 : 2;
      return M2_PAL.wood[m2Hash(px, py >> 2, plank) < 0.12 ? k - 1 : k];
    }
    if (m2ShieldHorse(px, py, stage === 2 ? 'front' : 'all')) return M2_SHIELD_WHITE[lit > 0.2 ? 2 : lit > -0.4 ? 1 : 0];
    if (stage === 2 && m2ShieldChalk(px, py) && (px + py) % 2) return '#b9c8a8';
    // The green in bands, lighter toward the upper left, a sheen of fresh paint near the rim.
    return M2_SHIELD_GREEN[lit > 0.45 ? 4 : lit > 0 ? 3 : lit > -0.45 ? 2 : 1];
  };
}

// The station at stage: the trestle, the shield, and what lies about it.
function m2ShieldAt(stage) {
  return m2StCanvas(`shield${stage}`, 15, 18, (g, px) => {
    m2ShieldTrestle(g, px);
    m2Raster(g, 0, 0, 60, 54, m2ShieldFace(stage));
    if (stage === 1) {
      // Nails on the beam's west end and a strip of rim iron waiting.
      for (const [nx, ny] of [[1, 31], [3, 32], [2, 34]]) { px(nx, ny, 2, 1, M2_SHIELD_IRON[3]); px(nx, ny, 1, 1, M2_SHIELD_IRON[4]); }
      for (let i = 0; i < 12; i += 1) px(18 + i, 60 + Math.round(Math.sin(i / 3) * 1.5), 1, 2, M2_SHIELD_IRON[i % 3 ? 2 : 3]);
    }
    if (stage === 2 || stage === 3) {
      // The paint pot under the shield, green to its brim, a brush across it.
      px(23, 60, 10, 10, '#2a1810'); px(24, 61, 8, 8, '#6e4422'); px(24, 61, 2, 8, '#a8703f');
      px(24, 60, 8, 2, M2_SHIELD_GREEN[3]); px(25, 60, 3, 1, M2_SHIELD_GREEN[4]);
      for (let i = 0; i < 9; i += 1) px(21 + i, 59 - Math.round(i * 0.4), 1, 1, i < 3 ? '#f6f4ea' : M2_PAL.wood[3]);
    }
    if (stage === 3) {
      // A crack from the upper rim down through the horse, red along its edges.
      const crack = [[18, 18], [20, 21], [19, 24], [22, 27], [24, 30], [23, 33], [26, 36], [28, 39], [27, 42], [30, 45], [32, 48]];
      crack.forEach(([cx, cy], i) => {
        const [nx, ny] = crack[i + 1] ?? [cx, cy];
        for (let t = 0; t <= 3; t += 1) {
          const [qx, qy] = [Math.round(cx + ((nx - cx) * t) / 3), Math.round(cy + ((ny - cy) * t) / 3)];
          px(qx - 1, qy, 1, 1, M2_ST_RED[2]); px(qx, qy, 1, 1, '#160808'); px(qx + 1, qy, 1, 1, M2_ST_RED[3]);
        }
      });
    }
  });
}

// The station at stage with its front on row y, centred on x: green sparkles off the gilded shield.
function m2DrawShield(g, x, y, stage, tick) {
  g.drawImage(m2ShieldAt(stage), x - 7.5, y - 18, 15, 18);
  if (stage === 4) { m2StSpark(g, x - 4.5, y - 13, tick % 12 < 6); m2StSpark(g, x + 5, y - 9.5, tick % 12 >= 6); }
}

// The Men's swing at their station, added to v1's poses for the map only (no side view uses it): the hammer raised over
// the right shoulder, thrown forward, then brought down across the body onto the shield's top rim, the other arm at
// rest. scene2-life.js's m2mStationFx poses a Man at his station with it.
if (typeof POSES === 'object') {
  POSES.m2rim = {
    arms(g, f) {
      const b = f.bodyTop;
      const tool = f.tool ?? 'hammer';
      f.arm(f.armL, b, b + 2, b + 3);
      if (f.frame === 0) {
        f.arm(f.armR, b - 1, b, b - 2);
        drawTool(g, tool, { x: f.armR, y: b - 2, up: true });
        return { x: f.armR, y: b - 2 };
      }
      if (f.frame === 0.5) {
        const hand = hdMidArm(g, f.P, HD_PEOPLE.man, f.armR, b);
        drawTool(g, tool, hand);
        return hand;
      }
      f.sleeve(f.armR, b + 1, f.x - 1, b + 3);
      f.hand(f.x - 2, b + 3);
      drawTool(g, tool, { x: f.x - 2, y: b + 3, up: false });
      return { x: f.x + 1, y: b + 4 };
    },
  };
}
