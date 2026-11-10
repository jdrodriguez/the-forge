// scene2-foes-v1.js: the orcs and Gollum of the map from above are v1's own, drawn by v1's code in a canvas at v1's four
// pixels a unit and stamped into the map pixel for pixel at M2V_K (scene2-body-v1.js) times v1's size. The orcs are
// sprites.js's drawFigure orc (sprites-qd.js's art): v1 has one orc, so goblins and Uruk-hai both wear it, the Uruk-hai
// by another name so their colours differ. Facing you and in profile an orc is v1's front view (as v1 shows it walking);
// going away its face is covered from its own head rows (scene2-body-v1.js's m2vBackRows). Gollum is
// sprites-gollum.js's drawGollum. This file replaces scene2-orc-art.js's m2eOrcFrame and scene2-gollum-art.js's
// m2eGollum, which scene2-orc-draw.js and scene2-gollum.js call; their own art stays loaded and unused.

// v1's poses for the orcs' (v1 has no fall: a stagger, which the caller turns on its back).
const M2V_ORC_POSE = { walk: 'walk', stand: 'stand', attack: 'fight', stagger: 'stagger', fall: 'stagger' };
const m2vOrcs = new Map();
m2eOrcFrame = function m2vOrcFrame(kind, facing, pose, frame, torch = false) {
  const key = `${kind}|${facing}|${pose}|${frame}|${torch ? 1 : 0}`;
  if (m2vOrcs.has(key)) return m2vOrcs.get(key);
  const p = PEOPLE.orc;
  const [W, H] = [p.w + 12, p.h + 9];
  const [fx, fy] = [W / 2, H - 1];
  const name = kind === 'uruk' ? 'Ugluk' : 'Shagrat';
  const c = document.createElement('canvas');
  c.width = W * 4;
  c.height = H * 4;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.setTransform(4, 0, 0, 4, 0, 0);
  const vp = M2V_ORC_POSE[pose] ?? 'stand';
  const back = facing === 'up' && (vp === 'walk' || vp === 'stand');
  const hand = drawFigure(g, 'orc', torch ? 'torch' : name, fx, fy, vp, frame) ?? { x: fx + 3, y: fy - 7 };
  if (back) {
    const hd = HD_PEOPLE.orc;
    const step = vp === 'walk' ? frame : -1;
    const top = fy - p.h + 1 - (step % 1 ? 0.5 : 0);
    hdMap(g, m2vBackRows('orc', step === 0 || step === 1), qdFigurePal('orc', torch ? 'torch' : name), fx - 4.5, top - hd.up / 4, 0.25);
  }
  // Stamped at the map's size into a canvas of its own, so the caller draws it at K's measures.
  const k = M2V_K;
  const out = document.createElement('canvas');
  out.width = Math.round(W * k * 4);
  out.height = Math.round(H * k * 4);
  const o = out.getContext('2d');
  o.imageSmoothingEnabled = false;
  o.drawImage(c, 0, 0, out.width, out.height);
  const art = { c: out, hand: [hand.x * k, hand.y * k], K: { W: W * k, H: H * k, FX: fx * k, FY: fy * k, k: (p.w * k) / 10 } };
  m2vOrcs.set(key, art);
  return art;
};

// v1's Gollum, for every realm's Gollum alike: the map's poses as v1 names them (v1's rocking is his counting, and his
// scuttle the bounding run home from a fright), in a frame of v1's size times M2V_K with its feet point (ax, ay) and
// the hand that carries a trinket home, all in map units.
const M2V_GOL_POSE = { creep: 'creep', scuttle: 'scuttle', crouch: 'crouch', count: 'rock', clutch: 'clutch' };
const m2vGols = new Map();
const m2vGolBase = m2eGollum;
m2eGollum = function m2vGollum(pose, frame) {
  // drawGollum paints at v1's scene resolution (scene.js's SC_RES); a page without v1's scene keeps the map's own.
  if (typeof SC_RES === 'undefined') return m2vGolBase(pose, frame);
  const key = `${pose}|${frame}`;
  if (m2vGols.has(key)) return m2vGols.get(key);
  const [W, H, ax, ay] = [GOL_W / 4, GOL_H / 4, GOL_AX / 4, GOL_AY / 4];
  const c = document.createElement('canvas');
  const k = M2V_K;
  c.width = Math.round(W * k * 4);
  c.height = Math.round(H * k * 4);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const n = document.createElement('canvas');
  n.width = W * 4;
  n.height = H * 4;
  const ng = n.getContext('2d');
  ng.imageSmoothingEnabled = false;
  ng.setTransform(4, 0, 0, 4, 0, 0);
  const vp = M2V_GOL_POSE[pose] ?? 'crouch';
  drawGollum(ng, ax, ay, vp, Math.floor(frame * 2));
  g.drawImage(n, 0, 0, c.width, c.height);
  const art = { c, w: W * k, h: H * k, ax: ax * k, ay: ay * k, hand: [ax * k + 2, ay * k - 5] };
  m2vGols.set(key, art);
  return art;
};
