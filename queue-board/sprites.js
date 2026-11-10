// sprites.js: the figures for the Middle-earth view (scene.js). Every figure, station and bubble is drawn in code on
// scene.js's offscreen canvas (SC_RES detail pixels per unit), which it scales up with smoothing off. The figures are
// 32-bit, a quarter unit a pixel: each people draws its head, body, arms and legs from the pixel maps of sprites-hd.js,
// sprites-hd-folk.js and sprites-qd.js. There are no image files, so the art is the board's own. Each machine's people
// match its worker nicknames: elves (the first realm's machine), hobbits (the second's), dwarves (the third's), Rangers (the Sentry slot, on
// horseback: sprites-horse.js), wizards (outside the queue), and Men of Rohan for a machine with no realm of its own.
// Orcs are no one's people: scene-orcs.js sets them on a worker whose CI fails and loose in the realms while main is
// red. Loaded after page.html's own script.
const PX = {
  ink: '#1d1b27', skin: '#f0c49b', skinD: '#c98f68', white: '#f5f1e6', gold: '#f2c14e', metal: '#b8c1cb', metalD: '#6c7582',
  wood: '#7b4f2b', woodD: '#55361b', soil: '#6b4a2e', soilD: '#4f3520', leaf: '#62a03d', leafD: '#3f7027', red: '#e0453a',
  green: '#4cc27f', blue: '#8fc3ff', ember: '#ff8a2a', emberL: '#ffd35a', stone: '#8d8a86', stoneD: '#615e5b', shirt: '#efe6cf',
};
const pxBox = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
const pxDot = (g, x, y, c) => pxBox(g, x, y, 1, 1, c);
// A stable number from a name, so each worker keeps its own hair and cloth colors.
const pxHash = (s) => [...String(s)].reduce((n, ch) => (n * 31 + ch.charCodeAt(0)) >>> 0, 7);

// h: height in units, w: body width, legs: leg rows. Each worker gets one hair, one cloth and one eye colour from its
// people's lists. weapon: what it fights with when its tool is no weapon; skin, eyes and helm override the usual
// colours; hat: a wizard's hat over the head's top; staff: a staff held while standing and walking.
const PEOPLE = {
  elf: { h: 15, w: 6, legs: 4, tool: 'quill', weapon: 'sword', iris: ['#3f8fc0', '#6f9aa8', '#5a8f6a'],
    hair: [['#efdc93', '#cdb56a'], ['#2b2433', '#1c1722'], ['#e8e4dc', '#bdb8ae']], cloth: [['#3e8f86', '#2b6a63'], ['#5a6fb0', '#43528a'], ['#7d9f4a', '#5b7a33']] },
  hobbit: { h: 11, w: 6, legs: 2, tool: 'hoe', iris: ['#6b4a2b', '#4f7f4a', '#3f6f9a'],
    hair: [['#6b3f22', '#4d2c17'], ['#a0662f', '#7a4a1f'], ['#3b2416', '#28180e']], cloth: [['#6f9a3a', '#4f7428'], ['#b0672f', '#874d21'], ['#c9a640', '#9c7f2c']] },
  dwarf: { h: 12, w: 8, legs: 2, tool: 'hammer', iris: ['#5a3a22', '#3f5f7a'],
    hair: [['#c2622d', '#93461e'], ['#9a9a9a', '#717171'], ['#3a2618', '#24170e'], ['#7a4a26', '#5a3519']], cloth: [['#9b3434', '#702424'], ['#3f5f9e', '#2d4677'], ['#6b4a8a', '#4e3566']] },
  ranger: { h: 15, w: 6, legs: 4, tool: 'sword', iris: ['#5d6b78'], hair: [['#3a2a20', '#2a1d16']], cloth: [['#3e5a3c', '#2c422b']] },
  wizard: { h: 15, w: 6, legs: 4, hat: true, staff: true, tool: 'staff', iris: ['#4a6a9a', '#5d6b78'],
    hair: [['#ececec', '#c4c4c4']], cloth: [['#9aa1a8', '#717880']] },
  man: { h: 14, w: 6, legs: 4, tool: 'quill', weapon: 'sword', iris: ['#3f7fae', '#6b4a2b', '#5d6b78'],
    hair: [['#8a5a2b', '#6a4220'], ['#d6b25e', '#ad8e44']], cloth: [['#5b6fa8', '#43528a'], ['#8f3d3d', '#6b2c2c']] },
  orc: { h: 13, w: 8, legs: 3, tool: 'blade', skin: ['#8c9a6a', '#66744b'], eyes: PX.red, helm: ['#4e4a55', '#2e2b33'],
    hair: [['#1d1a1c', '#121012']], cloth: [['#3c3940', '#28262b'], ['#4a3a30', '#30251d'], ['#38403a', '#262c27']] },
};
// How far above the feet a figure's head ends (its hat included), so scene.js can place bubbles and names over it.
const figureTop = (kind) => (PEOPLE[kind] ?? PEOPLE.man).h + (PEOPLE[kind]?.hat ? 6 : 0);
// The poses and tools beyond the ones drawn here (carrying, bending, stirring, shooting, parrying and the rest) come from
// sprites-work.js. A pose there can step its legs as in a walk (frame 0 or 1; 2 stands still), drop the body onto bent
// legs, nod the head lower, lean the upper body, draw the arms and what they hold (arms, returning the working hand) and
// draw anything in front of the head (over).
const POSES = {};
const TOOLS = {};
// Each people's 32-bit parts (sprites-hd.js's hdPeople fills this in).
const HD_PEOPLE = {};

// The 32-bit colours of the worker of this name and people (sprites-hd.js's hdPal), the palette its maps and f.P use.
// Each of the five wizards wears his own colour, as Tolkien gives it, found by his name in the worker's nickname (2026-11-07): Gandalf the Grey a long grey cloak under a tall pointed blue hat (The Hobbit, ch. 1); Saruman white
// (Fellowship, II.2); Radagast earthen brown, and Alatar and Pallando, the Ithryn Luin, sea-blue (Unfinished Tales, "The
// Istari"). A wizard with none of those names takes one of the five by its name's hash.
const WIZARDS = {
  gandalf: { cloth: ['#9aa0a6', '#6f757c'], hat: ['#3f5f9f', '#2a4277'] },
  saruman: { cloth: ['#eeeef2', '#c3c5d0'] },
  radagast: { cloth: ['#7c5a3a', '#5a3f27'] },
  alatar: { cloth: ['#2f86a6', '#1f6280'] },
  pallando: { cloth: ['#2f86a6', '#1f6280'] },
};
const wizardOf = (name, n) => {
  const keys = Object.keys(WIZARDS);
  return WIZARDS[keys.find((k) => String(name).toLowerCase().includes(k)) ?? keys[(n >>> 3) % keys.length]];
};
function qdFigurePal(kind, name) {
  const p = PEOPLE[kind] ?? PEOPLE.man;
  const n = pxHash(name);
  const w = kind === 'wizard' ? wizardOf(name, n) : null;
  const [skin, skinD] = p.skin ?? [PX.skin, PX.skinD];
  // A wizard's hat is drawn in the helm's colours: its own, or else his robe's.
  const [helm, helmD] = w ? w.hat ?? w.cloth : p.helm ?? [PX.metal, PX.metalD];
  const hair = w?.hair ?? p.hair[n % p.hair.length];
  const cloth = w?.cloth ?? p.cloth[(n >>> 3) % p.cloth.length];
  return hdPal(...hair, ...cloth, skin, skinD, helm, helmD, p.eyes ?? p.iris[(n >>> 6) % p.iris.length]);
}

// Draws one figure whose feet stand on row y, centred on x, facing right. pose: stand, walk, work, fight, cheer, ask,
// sleep (slumped, eyes shut, head down) or one of POSES; frame: 0 or 1, with in-betweens for a walk and a swing
// (sprites-hd.js's hdWalkFrame, hdSwingFrame): work and fight raise the tool on 0, swing it on 0.5 and strike on 1. tool
// overrides the people's own (a pickaxe) or names a load being carried. Returns the working hand, for sparks and dust.
function drawFigure(g, kind, name, x, y, pose, frame, tool) {
  const p = PEOPLE[kind] ?? PEOPLE.man;
  const hd = HD_PEOPLE[kind] ?? HD_PEOPLE.man;
  const ex = POSES[pose];
  const n = pxHash(name);
  const P = qdFigurePal(kind, name);
  // A people may draw a pose its own way (sprites-wanderers.js: Beorn sleeps in his bear's shape, Tom Bombadil skips).
  const own = hd.poses?.[pose];
  if (own) return own(g, kind, name, x, y, frame, tool);
  const armed = pose === 'work' || pose === 'fight';
  const step = pose === 'walk' || ex?.step ? frame : -1;
  // A walk's passing step straightens the legs, lifting the body half a unit; a sleeper's chest rises as it breathes in.
  const drop = Math.min(p.legs - 1, ex?.drop ?? 0) - (step % 1 ? 0.5 : 0);
  const lean = ex?.lean ?? 0;
  const top = y - p.h + 1 + (pose === 'sleep' ? 1 - hdBreath(g, n) : 0) + drop;
  const lx = x - p.w / 2;
  const bx = lx + lean;
  const bodyTop = top + 5;
  const legTop = y - p.legs + 1 + drop;
  const legs = (p.legs - drop) * 4;
  const bodyH = (legTop - bodyTop) * 4;
  hdStamp(g, P, `legs${kind}${legs},${step}`, () => hd.legs(legs, step), lx + hd.legsX, legTop + hd.legsY);
  hdStamp(g, P, `body${kind}${bodyH}`, () => hd.body(bodyH), bx, bodyTop);

  const armL = bx - 1;
  const armR = bx + p.w;
  const arm = (ax, from, to, at, s) => hdArm(g, P, hd, ax, from, to, at, ax < x, s);
  let hand = { x: armR, y: bodyTop + 3, up: false };
  const f = ex && { p, x: x + lean, y, top, bodyTop, armL, armR, cloth: p.cloth[(n >>> 3) % p.cloth.length][0],
    skin: (p.skin ?? [PX.skin])[0], frame, arm, tool: tool ?? (ex.fight ? p.weapon ?? p.tool : null), P,
    sleeve: (x0, y0, x1, y1) => hdSleeve(g, P, hd, x0, y0, x1, y1, x0 < x + lean), hand: (hx, hy) => hdHand(g, P, hx, hy, hx < x + lean) };
  if (ex) hand = ex.arms(g, f) ?? hand;
  else if (pose === 'cheer') {
    arm(armL, bodyTop - 2, bodyTop, bodyTop - 3);
    arm(armR, bodyTop - 2, bodyTop, bodyTop - 3);
  } else if (pose === 'ask') {
    arm(armL, bodyTop - 2 + frame, bodyTop, bodyTop - 3 + frame);
    arm(armR, bodyTop, bodyTop + 2, bodyTop + 3);
  } else if (armed) {
    arm(armL, bodyTop, bodyTop + 2, bodyTop + 3);
    if (frame === 0) {
      arm(armR, bodyTop - 1, bodyTop, bodyTop - 2);
      hand = { x: armR, y: bodyTop - 2, up: true };
    } else if (frame === 0.5) hand = hdMidArm(g, P, hd, armR, bodyTop);
    else {
      hdReach(g, P, hd, armR, bodyTop + 1, 2);
      hand = { x: armR + 2, y: bodyTop + 1, up: false };
    }
  } else {
    // On a stride each arm swings opposite its leg, the front one forward with the back leg's stride.
    const swing = pose === 'walk' && step % 1 === 0 ? (frame ? 1 : -1) : 0;
    arm(armL, bodyTop, bodyTop + 2, bodyTop + 3, swing);
    arm(armR, bodyTop, bodyTop + 2, bodyTop + 3, p.staff ? 0 : -swing);
  }

  const ht = top + (pose === 'sleep' ? 1 : 0) + (ex?.nod ?? 0);
  hdHead(g, hd, P, x - 4 + lean, ht, pose === 'sleep' || hdBlink(g, n), step === 0 || step === 1);
  if (p.staff && !armed && !ex && pose !== 'cheer') hdStaff(g, P, armR + 1, top, y);
  if (armed) drawTool(g, tool ?? (pose === 'fight' ? p.weapon ?? p.tool : p.tool), hand);
  ex?.over?.(g, f);
  return hand;
}
