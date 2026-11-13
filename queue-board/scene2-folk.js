// scene2-folk.js: the figures of the map from above (scene2.js) in four facings: toward you (the approved 32-bit
// sample's front, sprites-hd-folk.js and sprites-hd.js), away and in profile (scene2-elf.js); left is the profile's
// mirror. Each facing walks in four steps (a stride, passing with the body half a unit up, the other stride, passing);
// at its station a figure turns toward you to work (its tool raised, swinging through, striking: the elves' quill,
// as in the side view), to sleep (sat down, arms folded, head bowed, eyes shut, breathing), to ask (a hand up) or to
// cheer. Each people's body is registered in M2_BODY (scene2-body-v1.js stamps v1's own figures), in its own colours
// from sprites.js's PEOPLE (qdFigurePal); a people with none wears the elf's body drawn here. Each frame is composed
// once per worker's colours into a small canvas and stamped; a soft shadow sits under every figure.

// A frame is M2_FW by M2_FH units with the feet on row M2_FY, centred on column M2_FX.
const M2_FW = 14;
const M2_FH = 24;
const M2_FX = 7;
const M2_FY = 21;
const m2Frames = new Map();
// Each people's own body from above, by kind, registered by the files that draw them: { w, h, fx, fy, head, sleepHead,
// shadow, draw(g, P, facing, pose, frame, shut, tool) }, a frame w by h units with the feet at fx, fy, the head's top
// that far above the feet standing and asleep, a shadow that wide, and draw composing one frame (facing down, up or
// side for right; the poses below). A people with none wears the elf's body. m2BodyOf gives the frame's measures.
const M2_BODY = {};
const M2_ELF_BODY = { w: M2_FW, h: M2_FH, fx: M2_FX, fy: M2_FY, head: 15, sleepHead: 12, shadow: 8 };
const m2BodyOf = (kind) => M2_BODY[kind] ?? M2_ELF_BODY;
// The tool each people works with (sprites-gear.js draws them): Men hammer the rim of the shield at their station.
const M2_TOOL = { elf: 'quill', hobbit: 'hoe', dwarf: 'hammer', man: 'hammer', ranger: 'sword', wizard: 'staff' };
// Tools only the map draws, by name, registered by the files that draw them: draw(g, hand) with hand { x, y, up }, as
// sprites-gear.js's drawTool takes it. A body draws its tool with m2DrawTool, which falls back to drawTool.
const M2_TOOLS = {};
const m2DrawTool = (g, tool, hand) => (M2_TOOLS[tool] ? M2_TOOLS[tool](g, hand) : drawTool(g, tool, hand));

// One frame in a worker's colours P, facing down, up or side (right), for pose walk (frame 0, 0.5, 1, 1.5), stand,
// work (0 raised, 0.5 swinging, 1 striking), sleep (0 or 1, breathing in), ask (0 or 1) or cheer, eyes shut or not.
// The feet stand on row M2_FY, centred on column M2_FX.
function m2FigFrame(P, facing, pose, frame, shut, tool, kind, name) {
  const key = `${kind}|${P.key}|${facing}|${pose}|${frame}|${shut ? 1 : 0}|${tool}`;
  if (m2Frames.has(key)) return m2Frames.get(key);
  const own = M2_BODY[kind];
  if (own) {
    const { c, g } = m2Canvas(own.w, own.h);
    own.draw(g, P, facing, pose, frame, shut, tool, name);
    m2Frames.set(key, c);
    return c;
  }
  const { c, g } = m2Canvas(M2_FW, M2_FH);
  const hd = HD_PEOPLE.elf;
  const [x, y] = [M2_FX, M2_FY];
  const step = pose === 'walk' ? frame : -1;
  const lift = pose === 'walk' && frame % 1 ? 0.5 : 0;
  const sleep = pose === 'sleep';
  const top = y - 14 - lift + (sleep ? 3 - frame * 0.25 : 0);
  const bodyTop = top + 5;
  const legTop = sleep ? y - 1 : y - 3 - lift;
  const legs = sleep ? 4 : (4 + lift) * 4;
  const bodyH = Math.max(8, Math.round((legTop - bodyTop) * 4));
  const [armL, armR] = [x - 4, x + 3];
  const arm = (ax, from, to, at, s = 0) => hdArm(g, P, hd, ax, from, to, at, ax < x, s);
  if (facing === 'side') {
    hdMap(g, m2ElfRobe(legs, step, 'side'), P, x - 3.25, legTop - 0.25, 0.25);
    hdMap(g, m2ElfTorsoSide(bodyH), P, x - 2.75, bodyTop, 0.25);
    hdMap(g, m2ElfHeadSide(shut), P, x - 4, top, 0.25);
    hdMap(g, m2ElfArmSide(step === 0 ? 1 : step === 1 ? -1 : 0), P, x - 1.5, bodyTop + 0.25, 0.25);
  } else if (facing === 'up') {
    hdMap(g, m2ElfRobe(legs, step, 'up'), P, x - 3.5, legTop - 0.25, 0.25);
    hdMap(g, m2ElfTorsoBack(bodyH), P, x - 3, bodyTop, 0.25);
    const s = step === 0 ? -1 : step === 1 ? 1 : 0;
    arm(armL, bodyTop, bodyTop + 2, bodyTop + 3, s);
    arm(armR, bodyTop, bodyTop + 2, bodyTop + 3, -s);
    hdMap(g, m2ElfHeadBack(), P, x - 4, top, 0.25);
  } else {
    hdMap(g, m2ElfRobe(legs, step, 'down'), P, x - 3.5, legTop - 0.25, 0.25);
    hdMap(g, elfBody(bodyH), P, x - 3, bodyTop, 0.25);
    let hand = null;
    if (sleep) {
      hdMap(g, elfHead(true), P, x - 4.5 + 0.5, top + 1.5, 0.25);
      for (const flip of [false, true]) {
        g.save();
        if (flip) { g.translate(2 * x, 0); g.scale(-1, 1); }
        hdReach(g, P, hd, x - 3.25, bodyTop + 2.5, 2.75);
        g.restore();
      }
    } else {
      if (pose === 'work') {
        arm(armL, bodyTop, bodyTop + 2, bodyTop + 3);
        if (frame === 0) { arm(armR, bodyTop - 1, bodyTop, bodyTop - 2); hand = { x: armR, y: bodyTop - 2, up: true }; }
        else if (frame === 0.5) hand = hdMidArm(g, P, hd, armR, bodyTop);
        else { hdReach(g, P, hd, armR, bodyTop + 1, 2); hand = { x: armR + 2, y: bodyTop + 1, up: false }; }
      } else if (pose === 'ask') {
        arm(armL, bodyTop - 2 + frame, bodyTop, bodyTop - 3 + frame);
        arm(armR, bodyTop, bodyTop + 2, bodyTop + 3);
      } else if (pose === 'cheer') {
        arm(armL, bodyTop - 2, bodyTop, bodyTop - 3);
        arm(armR, bodyTop - 2, bodyTop, bodyTop - 3);
      } else {
        const s = step === 0 ? 1 : step === 1 ? -1 : 0;
        arm(armL, bodyTop, bodyTop + 2, bodyTop + 3, s);
        arm(armR, bodyTop, bodyTop + 2, bodyTop + 3, -s);
      }
      hdMap(g, elfHead(shut), P, x - 4.5 + 0.5, top, 0.25);
      if (hand) m2DrawTool(g, tool, hand);
    }
  }
  m2Frames.set(key, c);
  return c;
}

// A soft shadow under a figure's feet, dithered at its rim, drawn once.
let m2FootShadow = null;
function m2Foot() {
  if (!m2FootShadow) {
    const { c, g } = m2Canvas(8, 2.5);
    m2Raster(g, 0, 0, 32, 10, (px, py) => {
      const d = ((px + 0.5 - 16) / 16) ** 2 + ((py + 0.5 - 5) / 5) ** 2;
      return d < 0.55 || (d < 1 && (px + py) % 2) ? '#0c1018' : null;
    });
    m2FootShadow = c;
  }
  return m2FootShadow;
}

// A figure blinks for a tick every 4 to 6 seconds at a rhythm of its own, only while the map moves.
const m2Blink = (a) => !m2Reduced.matches && (m2.tick + a.seed * 13) % (40 + (a.seed % 21)) === 0;
// How far above its feet a figure's head ends, for bubbles, names and clicks: lower while it sits asleep, higher by
// a.headUp on horseback.
const m2Head = (a) => m2BodyOf(a.kind)[a.pose === 'sleep' ? 'sleepHead' : 'head'] + (a.headUp ?? 0);

// Draws a worker where it stands, in its pose (scene2-move.js's m2Pose), faded once its session has ended. At a desk
// only what shows over the desk is drawn, and the desk (drawn first) hides the rest.
// A worker that draws itself (a.draw, as a mounted rider does) is drawn that way instead. a.posed ({ pose, frame, face })
// overrides the pose for a frame, and a.hop lifts the figure off its shadow (a dance, a cheer's jump).
// again (true) draws it as it was last drawn, at the alpha already set, with no shadow: the night's moonlit pass.
function m2DrawActor(g, a, again = false) {
  if (a.draw) return a.draw(g, a);
  const [pose, frame, facing] = again && a.shown ? a.shown : a.posed ? [a.posed.pose, a.posed.frame ?? 0, a.posed.face ?? 'down'] : m2Pose(a);
  a.pose = pose;
  a.shown = [pose, frame, facing];
  const base = g.globalAlpha;
  // The map's own palette lookup when the bodies give one (it tells apart wizards who share colours).
  const P = (typeof m2PalOf === 'function' ? m2PalOf : qdFigurePal)(a.kind, a.name);
  const b = m2BodyOf(a.kind);
  const art = m2FigFrame(P, facing === 'left' ? 'side' : facing, pose, frame, pose === 'sleep' || m2Blink(a), a.tool ?? M2_TOOL[a.kind] ?? 'quill', a.kind, a.name);
  const [x, y] = [Math.round(a.x * 4) / 4, Math.round(a.y * 4) / 4];
  if (again) g.globalAlpha = base;
  else {
    if (a.mood === 'gone') g.globalAlpha = 0.4;
    if (!a.atDesk) {
      g.globalAlpha *= 0.32;
      g.drawImage(m2Foot(), x - b.shadow / 2, y - 0.25, b.shadow, 2.5);
      g.globalAlpha = a.mood === 'gone' ? 0.4 : 1;
    }
  }
  g.save();
  if (a.hop) g.translate(0, -Math.round(a.hop * 4) / 4);
  if (facing === 'left') { g.translate(2 * x, 0); g.scale(-1, 1); }
  // At a desk the worker shows down to the desk top's back edge (scene2-stations.js's M2_STATION_TOP, or the station's
  // own clipY), so the night's second stamp, drawn after the desk, never shows the body through it.
  // The night's second stamp, drawn after everything, also clips a worker standing behind its own station.
  const behind = again && a.station && !a.station.sentry && y < a.station.y && Math.abs(a.x - a.station.x) < 9;
  const desk = (a.atDesk || behind) && a.station;
  const top = desk ? desk.clipY ?? desk.y - ((typeof M2_STATION_TOP === 'object' && M2_STATION_TOP[desk.kind]) || 5) : 0;
  const clip = desk ? Math.max(1, top - (y - b.fy)) : b.h;
  g.drawImage(art, 0, 0, art.width, Math.round(clip * 4), x - b.fx, y - b.fy, b.w, Math.round(clip * 4) / 4);
  g.restore();
  g.globalAlpha = 1;
}
