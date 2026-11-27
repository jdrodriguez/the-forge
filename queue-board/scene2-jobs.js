// scene2-jobs.js: what a worker of the map from above (scene2.js) does at a place, by the job its realm gives the
// spot (r.spots[i].job) or a wanderer's roam spot gives (plan.roam), as v1's rounds did it (scene-work.js,
// scene-farm.js, scene-hoard.js, scene-elves.js): in the Shire hobbits wind the well's crank, scatter feed in the pen,
// stir the kettle, hoe the garden, reach up for apples and load the cart; in Rivendell elves gaze at the falls, play
// the harp in the pavilion, tend the healing house and its herbs, read, and tend the lamps; in Erebor dwarves hammer
// at the forge, mine ore, dig gems and stack the hoard; in Edoras and Gondor Men feed the horses, draw water and train
// with the sword. A wanderer's jobs are its own: Beorn chops wood and tends his hives, Radagast feeds his birds,
// Treebeard tends his trees and hums, Bombadil sings and dances by the river, Gandalf smokes and looks about. Each job
// gives, tick by tick, the pose, frame, facing and tool the worker shows (as a.posed and a.tool) and the bits that fly
// off its hands (scene2-life-fx.js). A spot with no job gets its people's own kind of work, or a look about.

const m2mSwing = (t, k) => hdSwingFrame(t, k);
// An empty hand: work with nothing in it (knocking, healing, lighting a lamp).
M2_TOOLS.none ??= () => {};
// Where a worker's working hand is, in world units, facing f: out to the side, in front and low, or held up ahead.
function m2mHand(a, f) {
  const h = m2BodyOf(a.kind).head;
  if (f === 'left' || f === 'right') return { x: a.x + (f === 'left' ? -1 : 1) * (h * 0.22 + 2), y: a.y - h * 0.42 };
  if (f === 'up') return { x: a.x + 1, y: a.y - h * 0.62 };
  return { x: a.x + h * 0.15 + 1, y: a.y - h * 0.35 };
}
const m2mDir = (f) => (f === 'left' ? -1 : f === 'right' ? 1 : 0);
// The ground row a few units in front of a worker facing f, where scattered bits land.
const m2mFloor = (a, f) => a.y + (f === 'down' ? 2 : f === 'up' ? -3 : 0.5);
// On the frame a swing strikes (it turns 1), true once.
const m2mStrike = (t, k) => m2mSwing(t, k) === 1 && m2mSwing(t - 1, k) !== 1;

const M2M_SOIL = ['#5a3d24', '#7a5634', '#3e2a18'];
const M2M_SPARK = ['#ffd27a', '#ff9a3c', '#fff3c4'];
const M2M_WATER = ['#8fc3ff', '#cfe6ff', '#6fb6f0'];
const M2M_SEED = ['#f2d27a', '#c99a30', '#a8c070'];
const M2M_CHIP = ['#d9b27a', '#b88a52', '#8a6236'];
const M2M_GREEN = ['#c8f7d4', '#7fe0a0'];

// A worker swinging its tool at something, every k ticks, with fx on each strike.
const m2mWork = (tool, k, fx) => ({ n: [50, 90], act: (a, t, f) => ({ pose: 'work', frame: m2mSwing(t, k), face: f, tool }),
  fx: (a, t, f) => { if (m2mStrike(t, k)) fx?.(a, m2mHand(a, f), f, t); } });
// A worker held in one pose for a while, with fx every tick.
const m2mHold = (pose, frames, fx) => ({ n: [70, 140], act: (a, t, f) => ({ pose, frame: frames(t), face: pose === 'sit' || pose === 'smoke' || pose === 'harp' ? 'down' : f }), fx });
// A slow breath for a sitter or sleeper: frame 0 for 15 ticks, 1 for 15 (a rhythm of its own by its seed).
const m2mBreath = (a, t) => ((t + a.seed * 3) % 30 < 15 ? 0 : 1);
// Looking about: the way it faces, then a glance one way, back, the other way, back, a beat at each.
const m2mLook = (f, t) => {
  const k = Math.floor(t / 14) % 6;
  const side = f === 'left' || f === 'right' ? 'down' : 'left';
  return [f, f, side, f, side === 'left' ? 'right' : 'down', f][k];
};

const M2M_JOBS = {
  // The Shire.
  water: m2mWork('bucket', 4, (a, h, f) => m2mPuff(h.x, h.y + 1, M2M_WATER, 2, { up: 0.1, spread: 0.3, fall: 0.08, life: 7, floor: m2mFloor(a, f) })),
  feed: m2mWork('seed', 5, (a, h, f) => m2mPuff(h.x, h.y, M2M_SEED, 4, { up: 0.3, spread: 0.9, fall: 0.07, life: 14, floor: m2mFloor(a, f) + 1, dir: m2mDir(f) })),
  brew: { n: [70, 120], act: (a, t, f) => ({ pose: 'stir', frame: (t >> 2) % 2, face: f }),
    fx: (a, t, f) => { if (t % 5 === 0) { const h = m2mHand(a, f); m2mWisp(h.x + m2mDir(f) * 2, h.y - 1); } } },
  garden: m2mWork('hoe', 3, (a, h, f) => m2mPuff(h.x + m2mDir(f) * 2, a.y, M2M_SOIL, 3, { up: 0.5, spread: 0.8, fall: 0.09, life: 7, floor: a.y + 0.5 })),
  apples: { n: [50, 90], act: (a, t, f) => ({ pose: t % 24 < 14 ? 'cheer' : 'stand', frame: 0, face: t % 24 < 14 ? 'down' : f }),
    fx: (a, t) => { if (t % 24 === 6) m2mPuff(a.x + (Math.random() - 0.5) * 6, a.y - m2BodyOf(a.kind).head - 2, ['#d8402c', '#9ac040'], 1, { up: 0, spread: 0.2, fall: 0.1, life: 18, size: 0.5, floor: a.y + 1 }); } },
  cart: m2mWork('basket', 5, (a, h, f) => m2mPuff(h.x, h.y, ['#e8902c', '#7aa83a', '#d8402c'], 2, { up: 0.3, spread: 0.6, fall: 0.08, life: 7, floor: m2mFloor(a, f) })),
  door: { n: [40, 70], act: (a, t, f) => (t < 30 && t % 12 < 6 ? { pose: 'work', frame: t % 6 < 3 ? 0 : 1, face: f, tool: 'none' } : { pose: 'stand', frame: 0, face: m2mLook(f, t) }) },
  smoke: m2mHold('smoke', (t) => (t % 40 < 16 ? 1 : 0), (a, t) => m2mPipe(a, t)),
  // Rivendell.
  falls: { n: [60, 110], act: (a, t, f) => ({ pose: 'stand', frame: 0, face: t % 70 < 50 ? f : m2mLook(f, t) }) },
  harp: m2mHold('harp', (t) => (t % 8 < 4 ? 0 : 1), (a, t) => { if (t % 9 === 0) m2mNote(a.x + 2, a.y - m2BodyOf(a.kind).sleepHead - 1, 1); }),
  heal: m2mWork('none', 5, (a, h) => { for (let i = 0; i < 3; i += 1) m2mGlint(h.x, h.y, M2M_GREEN[i % 2]); }),
  herbs: m2mWork('basket', 4, (a, h, f) => m2mPuff(h.x, h.y + 1, ['#7fc27a', '#4f9a5a'], 2, { up: 0.4, spread: 0.6, fall: 0.07, life: 8, floor: m2mFloor(a, f) })),
  read: m2mHold('sit', (t) => 0),
  lamp: { n: [24, 40], act: (a, t, f) => ({ pose: 'work', frame: t < 12 ? 0 : 0.5, face: f, tool: 'none' }),
    fx: (a, t, f) => { if (t === 12) { const h = m2mHand(a, f); m2mPuff(h.x, h.y - 2, ['#ffe9a0', '#fff3c4'], 4, { up: 0.3, spread: 0.6, fall: -0.01, life: 10 }); } } },
  // Erebor.
  forge: m2mWork('hammer', 3, (a, h, f) => m2mPuff(h.x + m2mDir(f) * 2, h.y + 1, M2M_SPARK, 5, { up: 0.7, spread: 1.2, fall: 0.06, life: 6, kind: 'spark' })),
  ore: m2mWork('pick', 3, (a, h, f) => {
    m2mPuff(h.x + m2mDir(f) * 2, h.y, ['#a5a1ab', '#7e7a86', '#5a5662'], 3, { up: 0.5, spread: 1, fall: 0.08, life: 7, floor: a.y + 0.5 });
    if (Math.random() < 0.3) m2mGlint(h.x, h.y - 1, ['#7fd8ff', '#ff7aa8', '#9aff9a'][Math.floor(Math.random() * 3)]);
  }),
  gems: m2mWork('pick', 4, (a, h) => m2mGlint(h.x, h.y - 1, ['#7fd8ff', '#ff7aa8', '#9aff9a', '#ffe27a'][Math.floor(Math.random() * 4)])),
  hoard: m2mWork('basket', 6, (a, h) => { m2mGlint(h.x, h.y, '#ffd84a'); m2mGlint(h.x, h.y, '#fff3c4'); }),
  armor: m2mWork('hammer', 3, (a, h, f) => m2mPuff(h.x + m2mDir(f) * 2, h.y + 1, M2M_SPARK, 4, { up: 0.6, spread: 1, fall: 0.06, life: 5, kind: 'spark' })),
  // Edoras and Gondor.
  horses: m2mWork('seed', 5, (a, h, f) => m2mPuff(h.x, h.y, ['#e3cf86', '#ccb55e'], 3, { up: 0.3, spread: 0.7, fall: 0.07, life: 10, floor: m2mFloor(a, f) })),
  hall: null,
  train: { n: [50, 90], act: (a, t, f) => ({ pose: 'work', frame: m2mSwing(t, 2), face: f === 'up' || f === 'down' ? (a.seed % 2 ? 'left' : 'right') : f, tool: 'sword' }),
    fx: (a, t, f) => { if (m2mStrike(t, 2) && t % 8 < 2) { const h = m2mHand(a, a.posed?.face ?? f); m2mPuff(h.x, h.y - 1, ['#ffffff', '#cfe0ff'], 2, { up: 0.4, spread: 0.8, life: 3, kind: 'spark' }); } } },
  well: null,
  // The wanderers.
  wood: { n: [90, 160], act: (a, t, f) => ({ pose: 'work', frame: m2mSwing(t, 4), face: f === 'left' || f === 'right' ? f : 'right', tool: 'axe' }),
    fx: (a, t, f) => { if (m2mStrike(t, 4)) { const s = f === 'left' ? 'left' : 'right'; const h = m2mHand(a, s); m2mPuff(h.x + m2mDir(s) * 3, a.y - 3, M2M_CHIP, 5, { up: 0.8, spread: 1.4, fall: 0.09, life: 22, size: 0.5, kind: 'chip', floor: a.y + 1.5, dir: m2mDir(s) }); } } },
  hives: { n: [90, 150], act: (a, t, f) => (t % 60 < 36 ? { pose: 'stand', frame: 0, face: f } : { pose: 'work', frame: m2mSwing(t, 6), face: f, tool: 'basket' }) },
  birds: m2mWork('seed', 5, (a, h, f) => m2mPuff(h.x, h.y, M2M_SEED, 5, { up: 0.3, spread: 1.2, fall: 0.07, life: 26, floor: a.y + 1 + Math.random() * 3, dir: m2mDir(f) })),
  tend: { n: [80, 140], act: (a, t, f) => ({ pose: 'stand', frame: 0, face: Math.floor(t / 22) % 2 ? f : f === 'down' ? 'left' : 'down' }),
    fx: (a, t) => { if (t % 16 === 0) m2mNote(a.x + 3, a.y - m2BodyOf(a.kind).head + 4, 1); } },
  drink: { n: [60, 100], act: (a, t, f) => ({ pose: 'stand', frame: 0, face: f }) },
  fish: m2mHold('sit', (t) => (t % 30 < 15 ? 0 : 1), (a, t) => { if (t % 30 === 0) m2mNote(a.x + 2, a.y - m2BodyOf(a.kind).sleepHead, 1); }),
  sing: { n: [70, 120], act: (a, t, f) => ({ pose: t % 16 < 8 ? 'cheer' : 'stand', frame: 0, face: ['down', 'left', 'down', 'right'][Math.floor(t / 8) % 4] }),
    fx: (a, t) => { a.hop = Math.abs(Math.sin((t / 8) * Math.PI)) * 2; if (t % 8 === 0) m2mNote(a.x + (t % 16 ? -3 : 3), a.y - m2BodyOf(a.kind).head - 1, t % 16 ? -1 : 1); } },
  palantir: { n: [80, 140], act: (a, t, f) => ({ pose: 'stand', frame: 0, face: f }) },
  look: { n: [60, 110], act: (a, t, f) => ({ pose: 'stand', frame: 0, face: m2mLook(f, t) }) },
};
// The mill: a sack heaved up onto the shoulder and set down by the door, flour puffing from it each time.
M2M_JOBS.mill = { n: [60, 100], act: (a, t, f) => ({ pose: t % 32 < 14 ? 'carry' : 'stand', frame: (t >> 2) % 2, face: 'down', tool: 'sack' }),
  fx: (a, t, f) => { if (t % 32 === 0 || t % 32 === 14) { const h = m2mHand(a, f); m2mPuff(h.x, h.y + 1, ['#f4f0e4', '#e0d8c4', '#ffffff'], 7, { up: 0.35, spread: 1.4, fall: 0.01, life: 16, size: 0.75, kind: 'dot' }); } } };
// The gate: a guard with his spear, his back to the gate and facing out, turning to look up and down the road, now and then grounding the spear.
M2M_JOBS.gate = { n: [90, 160], act: (a, t, f) => ({ pose: 'work', frame: t % 70 < 6 ? 0.5 : 0, face: m2mLook(f === 'up' ? 'down' : f, t), tool: 'spear' }) };
// The brazier: hands held out to the warmth a while, then a poke at the coals with a stick, sparks flying up.
M2M_JOBS.brazier = { n: [80, 140], act: (a, t, f) => (t % 60 < 36 ? { pose: 'work', frame: 0.5, face: f, tool: 'none' } : { pose: 'work', frame: m2mSwing(t, 3), face: f, tool: 'staff' }),
  fx: (a, t, f) => {
    const h = m2mHand(a, f);
    if (t % 60 >= 36 && m2mStrike(t, 3)) m2mPuff(h.x + m2mDir(f) * 2, h.y, M2M_SPARK, 6, { up: 0.9, spread: 0.8, fall: -0.01, life: 10, kind: 'spark' });
    else if (t % 9 === 0) m2mWisp(h.x + m2mDir(f), h.y - 2);
  } };
// The bridge: leaning to look down at the water, then along the river.
M2M_JOBS.bridge = { n: [60, 110], act: (a, t, f) => ({ pose: 'stand', frame: 0, face: t % 50 < 30 ? f : m2mLook(f, t) }) };
M2M_JOBS.hall = M2M_JOBS.door;
M2M_JOBS.well = M2M_JOBS.water;
// A people's own work at a spot with no job of its own.
const M2M_KIND_JOB = { hobbit: 'garden', dwarf: 'forge', elf: 'falls', man: 'horses' };
const m2mJobOf = (a, spot) => M2M_JOBS[spot?.job] ?? M2M_JOBS[M2M_KIND_JOB[a.kind]] ?? M2M_JOBS.look;

// A pipe's smoke: a wisp while it is drawn on (frame 1), and a ring blown as it is lowered.
// Where a worker's pipe bowl is, facing as it does (mirrored facing left).
function m2mPipeAt(a) {
  const b = m2BodyOf(a.kind);
  const p = b.pipe ?? { x: 3.75, y: -b.sleepHead + 3 };
  return [a.x + (a.face === 'left' ? -p.x : p.x), a.y + p.y];
}
function m2mPipe(a, t) {
  // The pipe's bowl, where the body draws it (M2_BODY[kind].pipe, units from the feet), else about the mouth.
  const [x, y] = m2mPipeAt(a);
  if (t % 40 === 16 || (t % 80 === 21 && a.seed % 2)) m2mRing(x, y - 1.5);
  else if (t % 40 < 16 && t % 6 === 0) m2mWisp(x, y - 0.5);
}

// One tick of a job at its spot for worker a: sets a.posed, a.tool and a.hop from the job and makes its fx.
function m2mDoJob(a, job, t, face, reduced) {
  a.hop = 0;
  const p = job.act(a, reduced ? 0 : t, face);
  a.posed = { pose: p.pose, frame: p.frame, face: p.face };
  a.tool = p.tool && p.tool !== 'none' ? p.tool : p.pose === 'work' ? 'none' : null;
  if (!reduced) job.fx?.(a, t, face);
}
