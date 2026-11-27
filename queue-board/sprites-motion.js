// sprites-motion.js: how a worker moves when its work is in front of it, added to sprites.js's POSES for both views
// (the side view's drawFigure, and the map from above, whose peoples are drawFigure's too: scene2-body-v1.js). The
// figures are drawn facing you, so a worker behind its plot, anvil or desk has its work below its hands, not out to
// one side. strike: both hands on the haft, raised over the head near the body's middle (0), brought down in front with
// the tool pointing at you, so short (0.5), and struck down onto the work below the hands, its head on the ground's
// front (1). write: both forearms forward onto the desk, the head bowed a little, the quill hand stroking a pixel either
// way over the page. sprinkle: a watering can held in front in both hands, tipped over the plot below. tend: both hands
// brought in front and down to the work (a knock, a handful of seed, a basket). motionBack draws the same work from
// behind for the map's 'up' facing. A worker in profile beside its work keeps sprites.js's own swing toward it.
// Pixels in quarter units in code, lit from the upper left, in sprites-gear.js's GEAR_PX; no image files.

// The tools struck down onto the work; a quill writes; anything else is held or handled.
const MOTION_STRIKE = ['hoe', 'pick', 'hammer', 'axe', 'blade', 'sword'];
// Each struck tool's head as seen from the front, in quarter-unit rows: edge-on when raised over the head (up), its face
// toward you mid-swing (at), and biting the work (down).
const MOTION_HEAD = {
  hoe: { up: ['NNNNNNNN', 'nLLMMmmn', 'NNNNNNNN'], at: ['NNNNNNNNNN', 'NLLMMMMmnN', 'NLMMMMmmnN', 'NMmmmmmnnN', '.NNNNNNNN.'],
    down: ['..NNNNNNNNNN..', '.NLLLMMMMmmnN.', 'NLLMMMMmmmmnnN', 'NMMMmmmmmnnnnN', '.NNNNNNNNNNNN.'] },
  hammer: { up: ['.NNNNNN.', 'NLLMMMmN', 'NLMMMmmN', 'JqqqqjjJ', 'NMMmmmnN', '.NNNNNN.'], at: ['.NNNNNN.', 'NL*MMMmN', 'NLMMMmnN', 'JqqqqjjJ', 'NMMmmnnN', '.NNNNNN.'] },
  pick: { up: ['N..........N', 'nNNNNNNNNNNn', '.nLLMMMmmnn.', '..NNNNNNNN..'], at: ['.NN.', 'NLMN', 'NMnN', '.NN.'],
    down: ['..NNNNNNNN..', '.nLLMMMmmnn.', 'nNNNNNNNNNNn', 'N..........N'] },
};
MOTION_HEAD.hammer.down = MOTION_HEAD.hammer.up;
const motionHead = (tool) => MOTION_HEAD[tool] ?? MOTION_HEAD.hammer;
// A haft two pixels wide down from row y0 to y1 at column x (units), lit on its left.
function motionHaft(g, x, y0, y1) {
  pxBox(g, x - 0.25, Math.min(y0, y1), 0.25, Math.abs(y1 - y0), GEAR_PX[4]);
  pxBox(g, x, Math.min(y0, y1), 0.25, Math.abs(y1 - y0), GEAR_PX[2]);
}
// A struck tool held at the fists (centre x, fists on row hy): way up, at you, or down to row floor.
function motionTool(g, tool, x, hy, way, floor) {
  const H = motionHead(tool);
  if (way === 'up') {
    const end = hy - (tool === 'hammer' ? 2 : 3);
    motionHaft(g, x, end, hy);
    gearMap(g, H.up, GEAR_PX, x - H.up[0].length / 8, end - H.up.length / 4);
    return { x, y: end - 1 };
  }
  if (way === 'at') {
    gearMap(g, H.at, GEAR_PX, x - H.at[0].length / 8, hy - H.at.length / 4 + 0.25);
    return { x, y: hy };
  }
  const end = Math.max(hy + 1, floor);
  motionHaft(g, x, hy + 1, end);
  gearMap(g, H.down, GEAR_PX, x - H.down[0].length / 8, end - 0.25);
  return { x, y: end + 0.5 };
}
// Where a struck tool's head lands: on the anvil's top edge just below a dwarf's fists, else on the ground in front
// of the feet (a hobbit's plot).
const motionFloor = (f) => (f.p === PEOPLE.dwarf ? f.bodyTop + 1.5 : f.y + 0.75);
// The fists on the strike: a dwarf's stay chest high, so the hammer's head shows on the anvil's edge in front of
// him; a hobbit's come down to the hips.
const motionLow = (f) => f.bodyTop + (f.p === PEOPLE.dwarf ? 0.5 : 3);
// Both arms from the shoulders to fists side by side at the body's middle on row hy, each sleeve bent at the elbow
// (the elbow out beside the body on row ey).
function motionArms(f, hy, ey) {
  const b = f.bodyTop;
  const [l, r] = [Math.round(f.x) - 1, Math.round(f.x)];
  if (ey !== undefined) { f.sleeve(f.armL, b, f.armL, ey); f.sleeve(f.armR, b, f.armR, ey); }
  const e = ey ?? b;
  f.sleeve(f.armL, e, l, hy);
  f.sleeve(f.armR, e, r, hy);
  f.hand(l, hy);
  f.hand(r, hy);
}
// A quill in the hand at (x, y), its nib on the page under the hand and its feather leaning back up to the right.
function motionQuill(g, x, y) {
  toolThread(g, x + 0.5, y + 1, x + 2.25, y - 2, '#3a3346');
  gearMap(g, ['....ff', '...fgP', '..fgPP', '.fgPP.', 'fgPP..', 'gPP...', 'PP....', 'P.....'], { f: '#7c8496', g: '#c9cdd6', P: '#f5f3ec' }, x + 1, y - 3.25);
}

Object.assign(POSES, {
  strike: {
    arms(g, f) {
      const b = f.bodyTop;
      // Raised over the head: the upper arms up beside it, the fists together over its crown.
      if (f.frame === 0) { motionArms(f, f.top - 2, f.top + 1); return { x: f.x, y: f.top - 5 }; }
      // Coming down at you: the elbows bent at the sides, the fists together on the haft in front of the chest.
      if (f.frame === 0.5) { motionArms(f, b + 1, b + 3); return { x: f.x, y: b + 1 }; }
      motionArms(f, motionLow(f), f.p === PEOPLE.dwarf ? b + 3 : undefined);
      return { x: f.x, y: motionFloor(f) + 0.5 };
    },
    // The tool and the fists on it are in front of the body, so they go over the head's beard or hair: the tool
    // raised above the fists, its head at you over the chest, then struck onto the work's top edge.
    over(g, f) {
      const b = f.bodyTop;
      const tool = MOTION_STRIKE.includes(f.tool) ? f.tool : f.p.tool;
      if (f.frame === 0) return motionTool(g, tool, f.x, f.top - 2, 'up');
      const [l, r] = [Math.round(f.x) - 1, Math.round(f.x)];
      const hy = f.frame === 0.5 ? b + 1 : motionLow(f);
      if (f.frame === 0.5 || f.p === PEOPLE.dwarf) { f.sleeve(f.armL, b + 3, l, hy); f.sleeve(f.armR, b + 3, r, hy); }
      else { f.sleeve(f.armL, b + 1, l, hy); f.sleeve(f.armR, b + 1, r, hy); }
      if (f.frame === 1) motionTool(g, tool, f.x, hy, 'down', motionFloor(f));
      f.hand(l, hy);
      f.hand(r, hy);
      if (f.frame === 0.5) motionTool(g, tool, f.x, hy - 0.25, 'at');
    },
  },
  write: {
    nod: 0.5,
    arms(g, f) {
      // Upper arms down at the sides, forearms forward onto the desk, the fists near the middle on the page; the quill
      // hand strokes a pixel left, then right, lifting between.
      const b = f.bodyTop;
      const hy = b + 4;
      const dx = f.frame === 0 ? -0.25 : f.frame === 1 ? 0.25 : 0;
      f.sleeve(f.armL, b, f.armL, b + 2);
      f.sleeve(f.armR, b, f.armR, b + 2);
      f.sleeve(f.armL, b + 3, Math.round(f.x) - 2, hy);
      f.sleeve(f.armR, b + 3, Math.round(f.x) + 1, hy);
      f.hand(Math.round(f.x) - 2, hy);
      const qx = Math.round(f.x) + 1 + dx;
      const qy = hy - (f.frame === 0.5 ? 0.25 : 0);
      f.hand(qx, qy);
      return { x: qx + 0.5, y: qy + 1 };
    },
    // The quill over everything, since long hair falls over the chest and would hide it.
    over(g, f) {
      const dx = f.frame === 0 ? -0.25 : f.frame === 1 ? 0.25 : 0;
      const qx = Math.round(f.x) + 1 + dx;
      const qy = f.bodyTop + 4 - (f.frame === 0.5 ? 0.25 : 0);
      motionQuill(g, qx, qy);
      hdHand(g, f.P, qx, qy, false);
    },
  },
  sprinkle: {
    arms(g, f) {
      // The can in front of the body in both hands, its spout down over the plot; on frame 1 it tips further and pours.
      const b = f.bodyTop;
      const c = f.x - 2;
      const tip = f.frame ? 1 : 0;
      motionArms(f, b + 2);
      gearMap(g, POSE_ART.can, POSE_ART.canPx, c, b + 1.5 + tip * 0.25);
      for (const [d, col] of [[0, '#2f3d48'], [0.25, CAN[0]], [0.5, CAN[1]], [0.75, '#2f3d48']]) toolThread(g, c + 3.75, b + 3 + d, c + 4.75, b + 4.5 + d + tip, col);
      gearMap(g, POSE_ART.rose, POSE_ART.canPx, c + 4.5, b + 4.5 + tip);
      return { x: c + 5, y: b + 6 + tip };
    },
  },
  tend: {
    arms(g, f) {
      // Both hands brought in front, chest high (0), then down to the work (1); a basket held is drawn in them.
      const hy = f.bodyTop + (f.frame === 0 ? 1 : f.frame === 0.5 ? 2 : 3);
      motionArms(f, hy);
      return { x: f.x, y: hy + 1 };
    },
    over(g, f) { if (f.tool === 'basket') drawLoad(g, 'basket', f.x, f.bodyTop + (f.frame === 0 ? 3 : 4)); },
  },
});

// What a worker does at its own station, its work in front of it: elves and Men write, every other people strikes.
const stationPose = (kind) => (PEOPLE[kind]?.tool === 'quill' ? 'write' : 'strike');

// The same work seen from behind (the map's 'up' facing), for scene2-body-v1.js's back figure: the arms the body draws
// instead of its hanging ones, what lies beyond the worker (drawn before the body, so the body hides it) and what is
// over the back of the head. way: strike, stir or tend. Coordinates as drawFigure's: x the figure's middle, top its
// head's top, b its body's top, y its feet.
function motionBack(g, P, hd, way, frame, tool, F) {
  const { x, top, b, armL, armR } = F;
  const sleeve = (x0, y0, x1, y1) => hdSleeve(g, P, hd, x0, y0, x1, y1, x0 < x);
  const hand = (hx, hy) => hdHand(g, P, hx, hy, hx < x);
  const [l, r] = [Math.round(x) - 1, Math.round(x)];
  // From behind, arms reaching forward to work in front show only as far as the elbow.
  const stubs = () => { sleeve(armL, b, armL, b + 1); sleeve(armR, b, armR, b + 1); };
  const t = MOTION_STRIKE.includes(tool) ? tool : null;
  if (way === 'stir') {
    return { before() { poseRod(g, r + 1 + frame, top - 3, r, b + 3, PADDLE, 'paddle'); }, arms: stubs };
  }
  if (way === 'strike' && frame === 0) {
    // Raised: the fists over the crown, the tool hanging back over the head toward you, its head on the shoulders.
    return { arms() { sleeve(armL, b, l, top - 1); sleeve(armR, b, r, top - 1); hand(l, top - 2); hand(r, top - 2); },
      after() { motionHaft(g, x, top - 1, b - 1); const H = motionHead(t ?? 'hammer'); gearMap(g, H.at, GEAR_PX, x - H.at[0].length / 8, b - 1); } };
  }
  if (way === 'strike' && frame === 0.5) {
    // Coming over: the fists at the crown, the tool pointing away, short, its head above.
    return { arms() { sleeve(armL, b, l, top); sleeve(armR, b, r, top); hand(l, top - 0.5); hand(r, top - 0.5); },
      after() { const H = motionHead(t ?? 'hammer'); motionHaft(g, x, top - 2, top - 0.5); gearMap(g, H.up, GEAR_PX, x - H.up[0].length / 8, top - 2 - H.up.length / 4); } };
  }
  if (way === 'tend' && frame === 0) {
    // A hand up in front of the face (a knock, a reach into the trough), the other forward.
    return { arms() { sleeve(armL, b, armL, b + 1); sleeve(armR, b, armR, top + 2); hand(armR, top + 1); } };
  }
  // Struck, or tending low: both hands in front, out of sight past the body.
  return { arms: stubs };
}
