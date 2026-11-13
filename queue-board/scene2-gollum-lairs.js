// scene2-gollum-lairs.js: where the Gollums of the map from above live (scene2-gollum.js). Each machine has a Gollum of
// his own (2026-11-09), and each hides in a lair in his own realm's land, chosen to suit it: in Rivendell a
// hollow among the rocks on the lip of the ravine, just east of where the Bruinen falls over it; in the Shire a hollow
// under the south bank of the Water, between the Mill and Bywater pool; in Edoras a cave at the foot of the White
// Mountains behind its stations; in Erebor and Gondor's fields a cleft in a rock as near the water as the open ground
// allows (in Erebor the bank of the river Running below the yard, or the Lonely Mountain's rocks where the yard leaves
// no room). A lair is a back piece (rocks, a bank or an outcrop) with a black mouth low in it, Gollum's crouching place
// in front of the mouth and his heap beside it to the west, all in a box that keeps clear of every standing thing,
// every station with its worker, name and walking room, every worker's spot, the Sentry's and the wanderers' places,
// roads, paths and water, the landmarks' zones, the eagles' crags, the other lairs and the map's edges. Rivendell's,
// the Shire's and Edoras's lairs are planned with the realm (m2eGolPlan, which scene2-core-places.js's m2PlanAfter
// calls), so their zone keeps the trees and the peaks off them; the others are found by a search once the world is
// built, which also takes over when a planned place turns out taken. Each lair's back piece is baked into the world as
// a standing thing (walkers go round it), and scene2-gollum.js's m2eLairs.by gets, per host: { r, kind, x, y } (his
// crouching place), heap (its middle), mouth (where his eyes shine), box, and roam (the places he creeps out to for a
// trinket, each reached in a straight line over open ground).

// The lair's box round his crouching place (x, y), as offsets: the back piece and the heap west of him, his frame east.
const M2E_LAIR_BOX = [-21, -14, 8, 2];
const m2eLairBox = (x, y) => [x + M2E_LAIR_BOX[0], y + M2E_LAIR_BOX[1], x + M2E_LAIR_BOX[2], y + M2E_LAIR_BOX[3]];
// Ground a lair or a creeping Gollum may not take: road, path, water, cliff, paving, terraces, tilled soil, snow.
const M2E_LAIR_BAD = new Set([6, 7, 8, 10, 11, 12, 13, 17]);

// The planned lair of each realm whose own layout says where it goes, with a zone so nothing is planted on it (and none
// of the trees in front of it, whose crowns would hide it). Called once the realms have their final size.
function m2eGolPlan(plan) {
  plan.gollum = {};
  for (const r of plan.realms) {
    let at = null;
    let below = 0;
    if (r.kind === 'elf' && plan.river) {
      // On the cliff top just east of the falls, his rocks at the falls' lip and his feet a unit behind the cliff's
      // edge (scene2-rivendell.js puts the lip 8 rows under the region's top), west of where the Last Homely House can
      // begin (33 units east of the pool's middle); the trees at the cliff's foot grow as tall as 44 units.
      // He may step up to three units further back from the lip (at.back) when Rivendell's reading bench by the pool
      // (its lower valley holding the healing house) takes the room in front of him.
      at = { x: plan.river.pool.x + 24, y: r.y + 6.5, back: 3 };
      below = plan.river.cliff + 44 - 6.5;
    } else if (r.kind === 'hobbit') {
      // scene2-shire-front.js's Water: the mill's wheel at its west, Bywater pool at its east, the stream between them
      // 4.5 to 7 rows under the mill's foot (mz). The bank's turf meets the stream's south edge, the hollow under it.
      const span = r.ux1 - r.ux0;
      const wheel = r.ux0 + Math.min(8, span * 0.05) + 22;
      const prx = Math.min(22, span * 0.14);
      const pool = r.ux1 - prx - 2 - prx - 2;
      const mz = r.y + r.h - 16;
      at = { x: (wheel + pool) / 2 + 6.5, y: mz + 19 };
      below = 32;
    } else if (r.kind === 'man' && r === plan.edoras && r.y + r.h + 6 <= plan.H - 4) {
      // Edoras: its hall, barrows, stables and paddock fill the land round its stations, so he lives at the foot of the
      // White Mountains behind them (the range's peaks keep out of his zone, scene2-land-peaks.js), under the middle of
      // the stations, where the Paths of the Dead go into the same mountains.
      at = { x: (r.block.x0 + r.block.x1) / 2 + 6.5, y: r.y + r.h + 4 };
      below = 6;
    }
    if (!at) continue;
    plan.gollum[r.m.host] = at;
    const [x0, y0, x1, y1] = m2eLairBox(at.x, at.y);
    plan.zones[`gollum:${r.m.host}`] = { x0: x0 - 2, y0: y0 - 4, x1: x1 + 2, y1: at.y + below };
  }
}

// Once the world is built (the late pass after every build hook), each realm's lair: its planned place if that is
// clear, else the best place the search finds, then its back piece baked in and its shadow on the ground.
m2.builds.push((L, plan, season, add) => add.late(() => {
  m2eLairs.by.clear();
  m2eLairs.key = m2.key;
  const grid = m2eGolGrid(L, plan);
  for (const r of plan.realms) {
    const want = plan.gollum?.[r.m.host];
    const at = (want && m2eGolNear(grid, want)) ?? m2eGolSearch(grid, plan, r);
    if (!at) continue;
    const lair = { r, kind: r.kind, x: at.x, y: at.y, heap: { x: at.x - 12, y: at.y - 1.5 }, mouth: { x: at.x - 3, y: at.y - 4 },
      box: m2eLairBox(at.x, at.y), roam: m2eGolRoam(grid, at) };
    grid.mark(lair.box, 1);
    m2eLairs.by.set(r.m.host, lair);
    const [bx, by] = [at.x - 20, at.y - 12.5];
    m2Shadow(L, at.x - 7, at.y - 0.5, 12, 1.8, 0.7);
    add.obj({ x: bx, y: by, w: 24, h: 12, z: at.y - 1, foot: [bx + 2, at.y - 4, bx + 22, at.y - 0.5], draw: (g) => g.drawImage(m2eLairArt(r.kind), bx, by, 24, 12) });
  }
}));

// The ground as cells a unit square, each marked with what keeps a lair off it: 1 the hard things (standing things,
// stations with the worker behind, where a worker, a rider or a wanderer stands, the map's edges, the lairs placed),
// 2 bad ground, 4 where an eagle comes down, 8 the landmarks' zones, 16 the room round the stations and those places.
// Each mark is summed so a box is tested at once, and each cell knows how far it is from water.
function m2eGolGrid(L, plan) {
  const { W, H } = plan;
  const cells = new Uint8Array(W * H);
  const mark = ([x0, y0, x1, y1], bit) => {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, Math.ceil(y1)); y += 1) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, Math.ceil(x1)); x += 1) cells[y * W + x] |= bit;
    }
  };
  const water = new Int16Array(W * H).fill(99);
  const queue = [];
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      const m = m2MatAt(L, x + 0.5, y + 0.5);
      if (M2E_LAIR_BAD.has(m)) cells[y * W + x] |= 2;
      if (m === M2_MAT.water) { water[y * W + x] = 0; queue.push(y * W + x); }
    }
  }
  for (let k = 0; k < queue.length; k += 1) {
    const i = queue[k];
    if (water[i] >= 40) continue;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < W * H && water[j] > water[i] + 1) { water[j] = water[i] + 1; queue.push(j); }
  }
  mark([0, 0, W, 1], 1);
  mark([0, H - 2, W, H], 1);
  mark([0, 0, 2, H], 1);
  mark([W - 2, 0, W, H], 1);
  // Every standing thing where it is drawn, not its whole box: a range's peaks are wide canvases that keep clear of
  // the zones cell by cell, and a tree's crown leaves its box's corners open. Each is drawn at a pixel a unit and the
  // cells it covers are taken.
  const { c: shape, g: sg } = m2Canvas(W / 4, H / 4);
  sg.setTransform(1, 0, 0, 1, 0, 0);
  sg.imageSmoothingEnabled = true;
  for (const o of m2.objects) if (o.w) o.draw(sg, 0);
  const alpha = sg.getImageData(0, 0, W, H).data;
  for (let i = 0; i < W * H; i += 1) if (alpha[i * 4 + 3] > 40) cells[i] |= 1;
  shape.width = 0;
  // A station with its worker behind it, the name and bubble over the worker, and room to walk round it.
  for (const s of plan.stations) {
    const [x0, y0, x1, y1] = m2StationBox(s);
    mark([x0, Math.min(y0, s.hy - 22), x1, y1 + 1], 1);
    mark([x0 - 5, Math.min(y0, s.hy - 32), x1 + 5, y1 + 6], 16);
  }
  const body = (p, w = 6, h = 22) => { mark([p.x - w / 2, p.y - h + 2, p.x + w / 2, p.y + 2], 1); mark([p.x - w, p.y - h, p.x + w, p.y + 3], 16); };
  for (const r of plan.realms) {
    for (const s of r.spots) body(s);
    for (const slot of [0, 1]) { const c = m2eCragAt(r, slot); mark([c.x - 15, c.y - 50, c.x + 15, c.y + 10], 4); }
  }
  for (const list of Object.values(plan.roam ?? {})) for (const p of list) body(p);
  for (const loop of Object.values(plan.patrols ?? {})) for (const p of loop) body(p, 15, 30);
  for (const [k, z] of Object.entries(plan.zones ?? {})) if (!k.startsWith('gollum:')) mark([z.x0, z.y0, z.x1, z.y1], 8);
  // Erebor's carved facade and gate are painted on the ground (scene2-erebor-gate.js), so they keep their own box.
  for (const r of plan.realms) {
    if (r.kind !== 'dwarf' || typeof m2EreLayout !== 'function') continue;
    const E = m2EreLayout(r);
    mark([E.cx - E.fw / 2 - 3, E.top - 4, E.cx + E.fw / 2 + 3, E.courtTop + 3], 1);
  }
  const sums = {};
  const sum = (bits) => {
    if (sums[bits]) return sums[bits];
    const S = new Int32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y += 1) {
      let row = 0;
      for (let x = 0; x < W; x += 1) { row += cells[y * W + x] & bits ? 1 : 0; S[(y + 1) * (W + 1) + x + 1] = S[y * (W + 1) + x + 1] + row; }
    }
    sums[bits] = S;
    return S;
  };
  // Whether the box is clear of everything in bits (an edge cut off by the map counts as taken).
  const clear = ([x0, y0, x1, y1], bits) => {
    const [a, b, c, d] = [Math.floor(x0), Math.floor(y0), Math.ceil(x1), Math.ceil(y1)];
    if (a < 0 || b < 0 || c > W || d > H) return false;
    const S = sum(bits);
    return S[d * (W + 1) + c] - S[b * (W + 1) + c] - S[d * (W + 1) + a] + S[b * (W + 1) + a] === 0;
  };
  const free = (x, y, bits = 3) => x >= 0 && y >= 0 && x < W && y < H && !(cells[Math.floor(y) * W + Math.floor(x)] & bits);
  // A lair once placed takes its box from the next one (the sums are worked out again).
  const markAgain = (box, bit) => { mark(box, bit); for (const k of Object.keys(sums)) delete sums[k]; };
  return { W, H, clear, free, mark: markAgain, water: (x, y) => water[Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)))] };
}

// The planned place, or the nearest one beside it (a few units either way, and up to at.back units north) that is clear
// of everything but bad ground, then of everything but bad ground and the crags. Its ground is the realm's own choice,
// so it is not tested.
function m2eGolNear(grid, at) {
  for (const bits of [29, 25]) {
    for (const dx of [0, -2, 2, -4, 4, -6, 6, -8, 8, -10, 10]) {
      for (let dy = 0; dy >= -(at.back ?? 0); dy -= 1) {
        if (grid.clear(m2eLairBox(at.x + dx, at.y + dy), bits)) return { x: at.x + dx, y: at.y + dy };
      }
    }
  }
  return null;
}

// The best clear place in and round the realm (up to 32 units out): the nearer its region and the water the better,
// out of the strip at the realm's back where its landmark stands unless the water is there, and off an eagle's crag
// unless nothing better is near the water (an eagle stays only while its call does, and he hides from it anyway). Only
// the lair's foot (the back piece's base, the heap, his feet) needs good ground; his head may rise over a road behind.
// A realm packed too tight for that (Rohan at Edoras, its hall, stables and the White Mountains close round its
// stations) looks up to 64 units out, then lets him into a landmark's zone where nothing stands, then into the room
// round its stations.
function m2eGolSearch(grid, plan, r) {
  for (const [bits, m] of [[25, 32], [25, 64], [17, 32], [17, 64], [1, 32], [1, 64]]) {
    let best = null;
    for (let y = r.y - m; y <= r.y + r.h + m; y += 2) {
      for (let x = r.x - m; x <= r.x + r.w + m; x += 2) {
        const box = m2eLairBox(x, y);
        if (!grid.clear(box, bits) || !grid.clear([box[0], y - 5, box[2], box[3]], 2)) continue;
        const [cx, cy] = [x - 6.5, y - 6];
        const out = Math.hypot(Math.max(0, r.x - cx, cx - r.x - r.w), Math.max(0, r.y - cy, cy - r.y - r.h));
        const score = out * 2 + grid.water(cx, y) + (y < r.roadY ? 20 : 0) + (grid.clear(box, 4) ? 0 : 30);
        if (!best || score < best.score) best = { x, y, score };
      }
    }
    if (best) return best;
  }
  return null;
}

// The places round his crouching place he creeps out to, in front of his lair (south and to the sides), each with room
// for him there and a straight way to it over open ground.
function m2eGolRoam(grid, at) {
  const out = [];
  for (let k = 0; k <= 8; k += 1) {
    const a = (k / 8) * Math.PI;
    for (const d of [13, 10, 7]) {
      const p = { x: at.x + Math.cos(a) * d, y: at.y + 1 + Math.sin(a) * d * 0.6 };
      if (!grid.clear([p.x - 5, p.y - 12, p.x + 5, p.y + 1], 25)) continue;
      let ok = true;
      for (let s = 1; s <= d && ok; s += 1) ok = grid.free(at.x + ((p.x - at.x) * s) / d, at.y + 1 + ((p.y - at.y - 1) * s) / d);
      if (ok) { out.push(p); break; }
    }
  }
  return out;
}
