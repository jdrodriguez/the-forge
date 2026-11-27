// scene-gollum.js: Gollum in the Middle-earth view (scene.js), one in each realm whose machine gives him something to
// keep (2026-11-07; one per machine from 2026-11-09, when a single Gollum in the busiest realm hid the others).
// What each one keeps is his machine's entry in gollum-data.js's report (grHost), counted as the Worktrees view's Forgotten filter counts
// it: the worktrees forgotten there, and the Claude accounts signed in there that have used 90% or more of a 5-hour or
// weekly window. He creeps out of his hiding place in his own realm and hunches over a little hoard of trinkets, more
// of them the more is forgotten on his machine, rocking and muttering; while a hot account is signed in there he
// clutches the Ring and gazes at it instead. When his count falls he slinks off to hide a while; with nothing to keep,
// he stays hidden. He hides in Rivendell's pool at the foot of the falls, behind the Shire's hill, in the shadow of
// Erebor's gate and behind Rohan's stables, peeks out before he comes, creeps on all fours, and scuttles back fast when an
// eagle comes down in his realm or flies off from it, or the Eye's beam falls near him. He is out mostly at night; by
// day he keeps near his hiding place and ducks back into it now and then. In Rivendell he snatches at a fish in the
// pool now and then. With reduced motion he is simply crouched at his hoard, still. Each has his own seed, so they
// don't rock, creep or go home in step. He walks with scMove, so scene-path.js takes him round things. He wears no
// tag: a click on him or his hoard opens his machine's forgotten worktrees. The art is sprites-gollum.js; the Ring, the
// fish, the hoard, his shining eyes, his muttering and the clicks are scene-gollum-tag.js. Uses gollum-data.js's
// grHost, scene.js's sc, scG, scMove and scReduced, sprites.js's pxHash, scenery-props.js's realmProps and boxClear,
// scenery.js's warFires, scene-eagle.js's eagles and scene-tower.js's eye.
// Ticks (a tenth of a second) for a peek before he comes out, and how long he lies low after a scare or a loss.
const GOL_PEEK = 30;
const GOL_CALM = 30;
const GOL_SULK = 240;
// Every Gollum by his machine's host: where he is (x, y, face), what he is doing (mode, counting its ticks in t; wait,
// how long he stays hidden; leg, which leg of a walk), his seed (from his host, somewhere in his 160-tick rocking, so
// the Gollums keep apart), his realm and path (realm, route, rkey), his job this frame, the count he last saw (n), his
// fishing and muttering, and what he looks like (look) and where his hoard lies (hoard) this frame, for the light pass
// and the clicks.
const gols = new Map();
const golQ = (v) => Math.round(v * 4) / 4;

// What his machine's report gives him to do: how many worktrees are forgotten there (n), and whether a hot account is
// signed in there (ring); null with neither.
function golJob(host) {
  const rep = grHost(host);
  if (!rep || (!rep.rows.length && !rep.ring.length)) return null;
  return { n: rep.rows.length, ring: rep.ring.length > 0 };
}

// His hiding place in realm r: hide, where he waits unseen; peek, where he looks out (the edge he grips, or in Erebor
// the dark of the doorway); exit, the open ground in front of it; behind and clip, whether a point is behind the
// landmark and the clip that hides what is; the ground props leave no box for; and in the Shire and Erebor, where the
// ground by the hiding place is full, his spot, kept at the hill's foot and on the gate's steps.
function golPlace(r) {
  const key = `${r.x0},${r.w}`;
  if (r.golPlace?.key === key) return r.golPlace;
  const [G, x0, cx] = [GROUND_Y, r.x0, r.x0 + Math.floor(r.w / 2)];
  const poly = (g, pts) => { g.moveTo(...pts[0]); pts.slice(1).forEach((p) => g.lineTo(...p)); g.closePath(); };
  const cut = (pts) => (g) => { g.beginPath(); g.rect(x0 - 20, G - 60, r.w + 40, 120); poly(g, pts); g.clip('evenodd'); };
  const curve = (f, a, b, base) => [[a, base], ...Array.from({ length: (b - a) * 2 + 1 }, (_, i) => [a + i / 2, f(a + i / 2)]), [b, base]];
  let p;
  if (r.kind === 'elf') p = { hide: [x0 + 7.5, G + 18], peek: [x0 + 7.5, G + 17.5], exit: [x0 + 8.5, G + 22.5], pool: true, fish: [x0 + 9.5, G + 23.5] };
  else if (r.kind === 'hobbit') {
    const top = (x) => G + 6 - Math.sqrt(Math.max(0, 576 - (x - cx) ** 2)) * 0.62;
    p = { hide: [cx + 21, G + 1], peek: [cx + 20.5, golQ(top(cx + 20.5)) + 0.25], exit: [cx + 26, G + 8], spot: [cx + 26.5, G + 8], behind: (x, y) => y < G + 6 && Math.abs(x - cx) < 27,
      clip: cut(curve(top, cx - 24, cx + 24, G + 6.5)), keep: [[cx - 24, G - 2, cx + 24, G + 10], [x0 + r.w - 23, G + 1, x0 + r.w - 1, G + 7], [cx + 27, G + 10, x0 + r.w - 5, G + 20]] };
  } else if (r.kind === 'dwarf') {
    p = { hide: [cx - 2.5, G + 1.75], peek: [cx + 2.5, G + 1.75], dark: true, exit: [cx - 2.5, G + 4], spot: [cx - 2.5, G + 4], behind: (x, y) => y < G + 2.1 && Math.abs(x - cx) < 6,
      clip: (g) => { g.beginPath(); g.rect(cx - 5.5, G - 15, 11, 17.25); g.clip(); } };
  } else p = rohanHide(r, cut);
  r.golPlace = { key, ...p };
  return r.golPlace;
}

// Where his hoard goes in realm r: the nearest open ground to his way out that he and it clear of the landmarks, the
// props and the places workers stand to use them, the stations with their workers and names, the war fires, and any
// eagle perched at the road's edge; or, failing that, right at his way out.
const GOL_TRY = [];
for (let dy = -3; dy <= 22; dy += 1) for (let dx = -24; dx <= 24; dx += 1) GOL_TRY.push([dx, dy]);
const golCost = ([dx, dy]) => Math.hypot(dx * 1.3, dy) + (dy < 2 ? 3 : 0);
GOL_TRY.sort((p, q) => golCost(p) - golCost(q));
function golSpot(r) {
  const H = golPlace(r);
  const P = realmProps(r);
  const crags = sc.path?.extra?.(r) ?? [];
  const key = `${P.key}|${crags.map((b) => b[0]).join(',')}`;
  if (r.golSpot?.key === key) return r.golSpot.at;
  const near = [...(H.keep ?? []), ...crags.map(([a, , b]) => [a - 2, ROAD_Y - 26, b + 2, ROAD_Y + 4])];
  const spot = (s) => near.push([s.x - 3, s.y - 12, s.x + 3, s.y + 1]);
  for (const p of P.list) { near.push([p.x - 1, p.y - 1, p.x + p.w, p.base + 1]); (p.spots ?? (p.spot ? [p.spot] : [])).forEach(spot); }
  [P.harp, P.forge, ...(P.trees ?? []).map((t) => t.spot), ...(P.veg ?? [])].filter(Boolean).forEach(spot);
  for (const s of sc.stations) if (s.realm === r && !s.sentry) near.push([s.x - 9, s.y - 24, s.x + 9, s.y + 3], [s.x - 18, s.y - 34, s.x + 18, s.y - 14]);
  for (const f of warFires(r)) near.push([f.x - 4, f.y - 10, f.x + 5, f.y + 1]);
  let at = H.spot ?? null;
  for (const [dx, dy] of H.spot ? [] : GOL_TRY) {
    const [x, y] = [H.exit[0] + dx, H.exit[1] + dy];
    if (Math.hypot(dx, dy) < 4 || x - 5 < r.x0 + 2 || x + 5 > r.x0 + r.w - 2 || y > ROAD_Y - 3 || y < GROUND_Y + 5) continue;
    if (boxClear([x - 3, y - 1, x + 3, y + 2], P.solid) && boxClear([x - 4.5, y - 9, x + 4.5, y + 2], near)) { at = [x, y]; break; }
  }
  r.golSpot = { key, at: at ?? H.exit };
  return r.golSpot.at;
}

// Whether something frightens this Gollum: an eagle coming down in his realm or flying off from it, or the Eye's beam
// within twenty units of him.
function golFear(gol) {
  if (typeof eagles === 'object') {
    for (const b of [...eagles.live.values(), ...eagles.gone]) {
      const t = sc.tick - b.t0;
      if (b.host === gol.host && ((b.state === 'arrive' && t < EAGLE_ARRIVE + 10) || (b.state === 'leave' && t < EAGLE_LEAVE))) return true;
    }
  }
  return sc.war > 0.2 && typeof eye === 'object' && eye.gx > 0 && Math.hypot(eye.gx - gol.x, eye.gy + 3 - gol.y) < 20;
}
const golNight = () => sc.glow?.night ?? (sc.sky.night ? 1 : 0);
const golGo = (gol, mode, wait = 0, leg = 0) => Object.assign(gol, { mode, t: 0, wait, leg, fishing: null });

// One step of his day: hidden, peeking, out to his hoard, at it, fishing, slinking home or fleeing. Each mode counts
// its ticks in t; wait is how long he stays hidden.
function golStep(gol, job, r) {
  const H = golPlace(r);
  const spot = golSpot(r);
  const fear = golFear(gol);
  gol.t += 1;
  if (gol.mode === 'hidden') {
    Object.assign(gol, { x: H.hide[0], y: H.hide[1] });
    if (fear) gol.wait = Math.max(gol.wait, GOL_CALM);
    if ((gol.wait -= 1) > 0 || !job) return;
    golGo(gol, 'peek');
  } else if (gol.mode === 'peek') {
    if (fear) golGo(gol, 'hidden', GOL_CALM);
    else if (gol.t > GOL_PEEK) { Object.assign(gol, H.pool ? { x: H.exit[0], y: H.exit[1] } : {}); golGo(gol, 'out', 0, H.pool ? 1 : 0); }
  } else if (gol.mode === 'out' || gol.mode === 'home' || gol.mode === 'flee') {
    const home = gol.mode !== 'out';
    if (gol.mode === 'out' && fear) return golGo(gol, 'flee');
    const legs = home ? [H.exit, H.hide] : [H.exit, spot];
    if (home && H.pool && gol.leg === 1) return golGo(gol, 'hidden', gol.wait || GOL_CALM);
    if (!scMove(gol, { x: legs[gol.leg][0], y: legs[gol.leg][1] }, gol.mode === 'flee' ? 1.1 : 0.3) && (gol.leg += 1) > 1) {
      if (home) golGo(gol, 'hidden', gol.wait || GOL_CALM);
      else golGo(gol, 'hoard');
    }
  } else if (gol.mode === 'hoard' || gol.mode === 'fish') {
    Object.assign(gol, gol.mode === 'hoard' ? { x: spot[0], y: spot[1] } : {});
    if (fear) return golGo(gol, 'flee');
    if (!job) return golGo(gol, 'home', 20);
    if (job.n < gol.n && job.n > 0) { gol.n = job.n; return golGo(gol, 'home', GOL_SULK); }
    gol.n = job.n;
    if (gol.mode === 'fish') return golFish(gol, H);
    const day = golNight() < 0.5;
    if (day && gol.t > 200) return golGo(gol, 'home', 50 + ((sc.tick + gol.seed) % 30));
    if (H.pool && gol.t > 120 && gol.t % (day ? 400 : 220) === 0) golGo(gol, 'fish');
  }
}
// Fishing in Rivendell's pool: he creeps to its front edge, watches the water, lunges at the fish that leaps, and holds
// it up wriggling under his open mouth or comes up empty, then goes back to his hoard.
function golFish(gol, H) {
  gol.fishing ??= { caught: (sc.tick * 7) % 10 < 6, at: 0 };
  const F = gol.fishing;
  if (!F.at) {
    if (scMove(gol, { x: H.fish[0], y: H.fish[1] }, 0.3)) return;
    F.at = gol.t;
  }
  gol.face = 1;
  const t = gol.t - F.at;
  if (t > (F.caught ? 70 : 46)) golGo(gol, 'out', 0, 1);
}

// What he looks like this tick: [pose, frame, face, x, y], or null while hidden. His seed shifts his frames, so two
// Gollums doing the same thing are not in step.
function golLook(gol) {
  const t = sc.tick + gol.seed;
  const H = golPlace(gol.realm);
  if (gol.mode === 'peek') return H.dark ? ['crouch', t % 40 < 20 ? 2 : 0, 1, H.peek[0], H.peek[1]] : ['peek', Math.floor(gol.t / 12) % 2, 1, H.peek[0], H.peek[1]];
  if (gol.mode === 'out' || gol.mode === 'home') return ['creep', Math.floor(t / 2), gol.face, gol.x, gol.y];
  if (gol.mode === 'flee') return ['scuttle', t, gol.face, gol.x, gol.y];
  if (gol.mode === 'fish') {
    const F = gol.fishing;
    const k = F?.at ? gol.t - F.at : -1;
    if (k < 0) return ['creep', Math.floor(t / 2), gol.face, gol.x, gol.y];
    if (k < 24) return ['crouch', 0, 1, gol.x, gol.y];
    if (k < 32) return ['snatch', 0, 1, gol.x, gol.y];
    return F.caught ? ['hold', 0, 1, gol.x, gol.y] : ['crouch', 2, -1, gol.x, gol.y];
  }
  if (gol.mode !== 'hoard') return null;
  if (scReduced.matches) return [gol.job?.ring ? 'clutch' : 'crouch', 0, 1, gol.x, gol.y];
  if (gol.job?.ring) return ['clutch', Math.floor(t / 5), 1, gol.x, gol.y];
  const k = t % 160;
  if (k < 70) return ['rock', Math.floor(t / 4), 1, gol.x, gol.y];
  return ['crouch', k < 100 ? 0 : k < 110 ? 2 : k < 125 ? 1 : k < 140 ? 3 : 0, 1, gol.x, gol.y];
}

// Each frame, from the items layer, for every realm: its Gollum (made the first time the realm is seen), his job from
// his machine's report, a step of his day (with reduced motion, straight to his hoard), and him and his hoard
// depth-sorted with the figures. A page opened while his machine has something for him finds him at his hoard, a few
// ticks into it by his seed so the Gollums don't all go home together. A machine that leaves the scene takes its
// Gollum with it.
function golItems(list) {
  const still = scReduced.matches;
  for (const r of sc.realms) {
    const host = r.m.host;
    const first = !gols.has(host);
    if (first) gols.set(host, { host, x: 0, y: 0, face: 1, mode: 'hidden', t: 0, wait: 0, leg: 0, seed: pxHash(host) % 160, n: 0, rkey: '', fishing: null, mutter: [] });
    const gol = gols.get(host);
    const job = golJob(host);
    Object.assign(gol, { realm: r, job });
    const rkey = `${r.x0},${r.w}`;
    if (first || still || gol.rkey !== rkey) {
      const moved = gol.rkey && gol.rkey !== rkey;
      Object.assign(gol, { rkey, route: null });
      if (job && (first || still || (moved && gol.mode !== 'hidden'))) Object.assign(golGo(gol, 'hoard'), { n: job.n, t: first ? gol.seed : 0 });
      else if (first || still || moved) golGo(gol, 'hidden', 10);
    }
    if (!still) golStep(gol, job, r);
    if (gol.mode === 'hoard') [gol.x, gol.y] = golSpot(r);
    const look = golLook(gol);
    gol.look = look;
    gol.hoard = job?.n && typeof drawGolHoard === 'function' ? golSpot(r) : null;
    if (gol.hoard) {
      const [hx, hy] = gol.hoard;
      const k = Math.min(9, job.n + 2);
      const t = sc.tick + gol.seed;
      const glint = still || (t + 11) % 34 > 3 ? -1 : Math.floor(t / 34) % k;
      list.push({ z: hy + 1.25, draw: () => drawGolHoard(scG, hx, hy + 1.25, k, glint) });
    }
    if (look) list.push({ z: look[4], draw: () => golDraw(gol, look) });
  }
  for (const host of gols.keys()) if (!sc.realms.some((r) => r.m.host === host)) gols.delete(host);
}
// Draws him: in shadow by day beside his hiding place and deep in it in Erebor's doorway, clipped where he is behind a
// landmark; ripples round his head when he peeks out of the pool; the Ring in his hands, glinting; a fish he caught;
// and the water he splashes and the rings where the fish rose.
function golDraw(gol, [pose, frame, face, x, y]) {
  const g = scG;
  const H = golPlace(gol.realm);
  const inside = H.behind?.(x, y);
  const shade = H.dark && (gol.mode === 'peek' || inside) ? 2 : golNight() < 0.5 && Math.hypot(x - H.exit[0], y - H.exit[1]) < 5 ? 1 : 0;
  const still = scReduced.matches;
  if (pose === 'peek' && H.pool) {
    const k = Math.floor((sc.tick + gol.seed) / 3) % 4;
    for (const s of [-1, 1]) pxBox(g, golQ(x + s * (2.25 + k * 0.5)) - (s < 0 ? 0.5 : 0), y + 0.25, 0.75, 0.25, k < 3 ? '#d4f0ff' : '#9fd4f6');
  }
  if (inside) { g.save(); H.clip(g); }
  drawGollum(g, x, y, pose, frame, face, shade);
  if (inside) g.restore();
  const sway = (GOL_POSES[pose][frame % GOL_POSES[pose].length].sway?.[0] ?? 0) / 4;
  if (typeof drawGolRing !== 'function') return;
  if (pose === 'clutch') drawGolRing(g, x + 0.075 + sway, y - 3.375, !still && (sc.tick + gol.seed) % 36 < 4);
  if (pose === 'hold') drawGolFish(g, x + 0.075, y - 4, Math.floor(sc.tick / 2), 1);
  const F = gol.fishing;
  if (gol.mode !== 'fish' || !F?.at) return;
  // The fish rises in a ring of ripples, leaps from the pool's front, and he lunges at it: it is in his hands or gone
  // back into the water with a splash.
  const k = gol.t - F.at;
  const [sx, sy] = [x + 3.25, y - 4];
  if (k > 4 && k < 16) { const w = 0.5 + ((k - 4) % 6) * 0.35; pxBox(g, golQ(sx - w), sy, golQ(w * 2), 0.25, '#d4f0ff'); }
  if (k >= 14 && k < 26) { const u = (k - 14) / 12; drawGolFish(g, sx + u * 1.5, sy - Math.sin(u * Math.PI) * 3.5, k, u < 0.5 ? 1 : -1); }
  if (k >= 24 && k < 34) for (let i = 0; i < 6; i += 1) pxBox(g, golQ(sx + 1 + (i - 2.5) * 0.5 * (1 + (k - 24) / 6)), golQ(sy - Math.sin((i + 1) / 2.2) * (k - 23) * 0.3), 0.25, 0.25, i % 2 ? '#ffffff' : '#bfe6fb');
}

if (typeof drawGollum === 'function') sc.layers.items.push(golItems);
