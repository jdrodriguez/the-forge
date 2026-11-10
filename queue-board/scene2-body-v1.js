// scene2-body-v1.js: the map from above draws v1's own characters. Each frame is v1's drawFigure (sprites.js, with
// sprites-hd-folk.js, sprites-qd.js, sprites-captains.js and sprites-wanderers*.js behind it) drawn into a canvas at
// v1's own four pixels a unit, then stamped into the map's frame pixel for pixel at M2V_K (1.3) times v1's size: a
// 15-unit elf stands 19.5 units on the map (2026-11-08, asked twice for smaller: 1.6, then 1.44, then 1.3). v1's files are only called, never changed. Facing you and in profile the
// figure is v1's front view, as v1 shows a walker going left or right. Walking away (up) it is the same frame with the
// face covered: v1's own head rows with the face's skin and features recoloured from the hair (or a hood's cloth) that
// frames it, so the back of the head reads in the same parts and palette. Loaded after the scene2-body-*.js files, so
// these entries replace theirs in M2_BODY.

const M2V_K = 1.3;
// Kinds whose head from behind is a hood's cloth.
const M2V_HOODED = ['ranger', 'ithilien', 'codex', 'grok'];
// Kinds whose beard hangs in front, hidden from behind.
const M2V_BEARDED = ['dwarf'];
const M2V_KINDS = ['elf', 'man', 'hobbit', 'dwarf', 'wizard', 'ranger', 'ithilien', 'gondor', 'rohirrim', 'ent', 'beorn', 'bombadil', 'codex', 'grok'];
// The map's poses as v1 names them: v1 has no smoke (a seated rest instead) and rides on the reins.
const M2V_POSE = { walk: 'walk', stand: 'stand', work: 'work', sleep: 'sleep', ask: 'ask', cheer: 'cheer', sit: 'sit', smoke: 'sit', ride: 'reins' };
// Room round v1's figure in its own units: across for a tool or shield, above for a hat or a raised tool.
const M2V_PAD = { side: 6, top: 9 };

// v1's measures for a kind, and its frame's size and feet point in v1 units.
function m2vFrameOf(kind) {
  const p = PEOPLE[kind] ?? PEOPLE.man;
  const W = p.w + M2V_PAD.side * 2;
  const H = p.h + M2V_PAD.top;
  return { p, W, H, fx: W / 2, fy: H - 1 };
}

// The face's box in v1's head rows (the eyes, mouth and blush with the skin round them) and the ramp that frames it:
// hair, or a hood's cloth for the hooded Rangers. Ents and orcs keep their bark or bare skin and lose only the features.
const m2vBacks = new Map();
function m2vBackRows(kind, trail) {
  const key = `${kind}|${trail ? 1 : 0}`;
  if (m2vBacks.has(key)) return m2vBacks.get(key);
  const hd = HD_PEOPLE[kind] ?? HD_PEOPLE.man;
  const rows = hdHeadRows(hd, false, trail);
  const feat = 'wxijk*vzu';
  let [r0, r1, c0, c1] = [Infinity, -1, Infinity, -1];
  rows.forEach((row, r) => [...row].forEach((ch, c) => {
    if (feat.includes(ch)) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  }));
  // A hood's cloth for the hooded Rangers, else the hair.
  const ramp = kind === 'ent' || kind === 'orc' ? null : M2V_HOODED.includes(kind) ? 'O12345' : 'oabcde';
  const skin = 'pqrstuvzkjixw*';
  // Inside the face's box every skin or feature cell becomes the ramp in falling strands: the base, a shade every third
  // column, a lit band across the top, the deep step at the box's edge.
  const out = rows.map((row, r) => [...row].map((ch, c) => {
    const inFace = r >= r0 - 4 && r <= r1 + 3 && c >= c0 - 2 && c <= c1 + 2;
    // A gem set at the brow faces front: from behind the band is plain gold.
    if (ch === 'm' || ch === 'n') return ch === 'm' ? 'y' : 'Y';
    // A helm's nose guard faces front: from behind that strip is the hair under the helm.
    if (inFace && ramp && r >= r0 - 2 && '67890#'.includes(ch)) return ramp[3];
    if (!inFace || !skin.includes(ch)) return ch;
    if (!ramp) return feat.includes(ch) ? 's' : ch;
    if (ch === 'p' || c === c0 - 2 || c === c1 + 2) return ramp[1];
    if (r < r0 - 2) return ramp[4];
    return ramp[(c + (r >> 2)) % 3 === 0 ? 2 : 3];
  }).join(''));
  // A dwarf's beard hangs in front: from behind it is hidden by his head and back, and only the hair under the helm
  // falls a few rows down the back of his neck.
  if (M2V_BEARDED.includes(kind)) {
    for (let r = r1 + 4; r < out.length; r += 1) {
      const row = [...out[r]];
      const cells = row.map((ch, c) => (ch !== '.' ? c : -1)).filter((c) => c >= 0);
      const [lo, hi] = [cells[0], cells[cells.length - 1]];
      out[r] = row.map((ch, c) => (r <= r1 + 6 && 'oabcde'.includes(ch) && c > lo + 3 && c < hi - 3 ? ch : '.')).join('');
    }
  }
  m2vBacks.set(key, out);
  return out;
}

// From behind, the front-only details on v1's body rows (gold trim and clasps, the cream panel, belts and buckles, gems,
// bone) take the cloth's own tone, so the back is a plain robe, tunic or cloak in the worker's colours.
// Each becomes the cloth's base, its outlines the cloth's shade, so no shape of a panel or device shows through. The legs
// keep their boots (leather) and lose only the gold hem.
const M2V_PLAIN = { G: '2', g: '3', y: '3', Y: '3', '+': '3', m: '3', n: '3', W: '3', V: '3', U: '3', X: '2', D: '2', E: '3', F: '3', H: '3', T: '3', B: '3' };
const M2V_HEM = 'GgyY+mnWVUXTB';
const m2vPlain = (rows, legs = false) => rows.map((row) => [...row].map((ch) => (legs && !M2V_HEM.includes(ch) ? ch : M2V_PLAIN[ch] ?? ch)).join(''));
// A figure from behind standing or walking, put together from v1's own parts as drawFigure lays them out (legs, body,
// arms, the staff), with no gear a people's own poses add in front (shields, baldrics, a bow). Returns the head's top,
// or null for a people that draws this pose its own way (ent, Tom's skip), which keeps drawFigure's frame.
function m2vBackBody(g, kind, name, F, use, frame, P) {
  const p = F.p;
  const hd = HD_PEOPLE[kind] ?? HD_PEOPLE.man;
  if (kind === 'ent' || (kind === 'bombadil' && use === 'walk')) return null;
  const step = use === 'walk' ? frame : -1;
  const drop = -(step % 1 ? 0.5 : 0);
  const top = F.fy - p.h + 1 + drop;
  const lx = F.fx - p.w / 2;
  const bodyTop = top + 5;
  const legTop = F.fy - p.legs + 1 + drop;
  hdMap(g, m2vPlain(hd.legs((p.legs - drop) * 4, step), true), P, lx + hd.legsX, legTop + hd.legsY, 0.25);
  hdMap(g, m2vPlain(hd.body((legTop - bodyTop) * 4)), P, lx, bodyTop, 0.25);
  const swing = use === 'walk' && step % 1 === 0 ? (frame ? 1 : -1) : 0;
  hdArm(g, P, hd, lx - 1, bodyTop, bodyTop + 2, bodyTop + 3, true, swing);
  hdArm(g, P, hd, lx + p.w, bodyTop, bodyTop + 2, bodyTop + 3, false, p.staff ? 0 : -swing);
  if (p.staff) hdStaff(g, P, lx + p.w + 1, top, F.fy);
  return top;
}

// v1's tool for a hand: the map's tool name when v1 draws it, else the people's own.
const m2vTool = (tool) => (typeof TOOLS === 'object' && TOOLS[tool]) || (typeof GEAR_TOOLS === 'object' && GEAR_TOOLS[tool]) ? tool : undefined;

// One frame of a kind in v1's units: v1's figure facing you, and for 'up' with its face covered.
function m2vNative(kind, name, facing, pose, frame, shut, tool) {
  const F = m2vFrameOf(kind);
  const c = document.createElement('canvas');
  c.width = F.W * 4;
  c.height = F.H * 4;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.setTransform(4, 0, 0, 4, 0, 0);
  // A pose v1 has by name (sprites-work.js, sprites-chores.js: carry, stir, harp, crank...) passes straight through.
  const own = !M2V_POSE[pose] && typeof POSES === 'object' && POSES[pose];
  const vp = M2V_POSE[pose] ?? (own ? pose : 'stand');
  const back = facing === 'up' && (vp === 'walk' || vp === 'stand');
  const use = facing === 'up' && !back ? 'stand' : vp;
  const armed = use === 'work';
  const P0 = qdFigurePal(kind, name);
  const backTop = back ? m2vBackBody(g, kind, name, F, use, frame, P0) : null;
  if (backTop == null) drawFigure(g, kind, name, F.fx, F.fy, use, frame, own ? tool : armed ? m2vTool(tool) : undefined);
  // The head drawFigure drew, covered again: from behind, or with its eyes shut for a blink.
  const hd = HD_PEOPLE[kind] ?? HD_PEOPLE.man;
  const step = use === 'walk' ? frame : -1;
  const top = F.fy - F.p.h + 1 - (step % 1 ? 0.5 : 0);
  const trail = step === 0 || step === 1;
  const P = qdFigurePal(kind, name);
  if (back && hd.head) hdMap(g, m2vBackRows(kind, trail), P, F.fx - 4.5, top - hd.up / 4, 0.25);
  else if (shut && hd.head && (use === 'stand' || use === 'walk')) hdHead(g, hd, P, F.fx - 4, top, true, trail);
  return c;
}

for (const kind of M2V_KINDS) {
  if (!PEOPLE[kind] || !HD_PEOPLE[kind]) continue;
  const F = m2vFrameOf(kind);
  const K = M2V_K;
  const p = F.p;
  M2_BODY[kind] = {
    w: F.W * K, h: F.H * K, fx: F.fx * K, fy: F.fy * K,
    head: (p.h + (p.hat ? 1.5 : 0)) * K, sleepHead: (p.sleepTop ?? p.h - 2) * K, shadow: (p.w + 2) * K * 0.9,
    seat: p.legs * K, v1: true,
    // Stamps v1's frame into the map's frame canvas (w by h units at four pixels a unit) pixel for pixel.
    draw(g, P, facing, pose, frame, shut, tool, name) {
      const c = m2vNative(kind, name ?? kind, facing, pose, frame, shut, tool);
      g.imageSmoothingEnabled = false;
      g.drawImage(c, 0, 0, F.W * K, F.H * K);
    },
  };
}
