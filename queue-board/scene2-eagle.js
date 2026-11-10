// scene2-eagle.js: the Great Eagles that bring a Claude app session's call on the map from above (scene2.js), as the
// side view's do (scene-eagle.js). A call a few seconds old when the map first sees it sends an eagle from the nearest
// eyrie on the Misty Mountains (plan.places.eyries): it flies across the land high up, its shadow sliding over the
// ground below and closing in under it as it comes down, flapping and then gliding, flares its wings over its crag at
// the edge of the calling session's realm, lands and folds them. Only then do the pool of light and the rings of sound
// come up (scene2-call.js) and its name, a button that says every call it carries, sit beside it (scene2-call-bar.js);
// there is no light column. Perched, it looks about now and then. An older call (after a reload) finds it already
// perched; a caller that had been folded into another eagle until now flies in, as in the side view. When the call goes
// it raises its wings, takes off and flies back to its eyrie, and its crag goes with it. Two eagles to a realm at most,
// on crags at either end of its road, clear of the stations in front; an eagle keeps its crag while it stays, and a new
// one takes the free crag. With reduced motion there is no flight: the eagle is perched while its call shows. A click
// on an eagle, landed or flying in, opens what called and dismisses its calls, as the side view's does. Art: v1's own
// eagle and crag (sprites-eagle.js, sprites-eagle-fly.js) at M2V_K times v1's size, side on as v1 has them (2026-11-08,
// v1's eagle was better); scene2-eagle-art.js's eagle from above only where v1's is not loaded (a test page).

const M2E_ARRIVE = 80;
const M2E_LEAVE = 56;
const m2eBirds = new Map();
const M2E_V1 = typeof drawEaglePerched === 'function' && typeof drawEagleFlying === 'function';
const M2E_K = typeof M2V_K === 'number' ? M2V_K : 1.3;
// v1's perched poses for the map's, and its wingbeat.
const M2E_V1_POSE = { perch: 'sit', look: 'look', flare: 'mantle' };
const M2E_FLAP = ['up', 'mid', 'down', 'level'];

// Where an eagle of realm r in slot 0 or 1 perches: on a crag just behind the road, at the realm's west or east end.
function m2eCragAt(r, slot) {
  return { x: Math.round(slot ? (r.ux1 ?? r.x + r.w) - 14 : (r.ux0 ?? r.x) + 14), y: Math.round(r.roadY - 9) };
}
// Matches the eagles to the sessions calling: a caller gone sends its eagle home, then a new caller sends one to its
// realm's free crag (flying in if its call is fresh, or it had been folded into another eagle until the frame before).
function m2eEagleSync(reduced) {
  const want = new Set(m2eCall.birds.map((e) => e.key));
  for (const [k, b] of m2eBirds) {
    if (want.has(k) || b.state === 'leave') continue;
    if (reduced) m2eBirds.delete(k);
    else Object.assign(b, { state: 'leave', t0: m2.tick });
  }
  for (const e of m2eCall.birds) {
    let b = m2eBirds.get(e.key);
    if (!b) {
      const host = e.realm.m.host;
      const taken = new Set([...m2eBirds.values()].filter((o) => o.host === host && o.state !== 'leave').map((o) => o.slot));
      const slot = taken.has(0) ? 1 : 0;
      const crag = m2eCragAt(e.realm, slot);
      const P = m2.plan.places;
      const ey = (P.eyries ?? [P.highPass]).slice().sort((p, q) => Math.hypot(p.x - crag.x, p.y - crag.y) - Math.hypot(q.x - crag.x, q.y - crag.y))[0];
      const fresh = Date.now() - e.calls[0].at < 8000 || m2eCall.folded.has(e.key);
      b = { key: e.key, host, slot, home: { x: ey.x, y: ey.y }, t0: m2.tick, state: !reduced && fresh ? 'arrive' : 'perch', seed: pxHash(e.key) % 97 };
      m2eBirds.set(e.key, b);
    }
    Object.assign(b, { crag: m2eCragAt(e.realm, b.slot), call: e.calls[0], calls: e.calls, more: e.more, name: e.name });
  }
  m2eCall.folded = m2eCall.foldNow;
}
// Where an eagle is this tick: on the ground (gx, gy), how high above it (h), its heading in eighths, its flap step,
// and whether it stands perched (and in which pose) and how far its light is up (0 to 1).
function m2eEagleNow(b) {
  const t = m2.tick - b.t0;
  const top = { x: b.crag.x, y: b.crag.y + 0.5 };
  const perch = (pose, light) => ({ gx: top.x, gy: top.y, h: 0, perch: pose, light });
  if (b.state === 'perch') {
    const look = (m2.tick + b.seed * 9) % 90 < 14 ? 'look' : 'perch';
    return perch(look, Math.min(1, t / 6));
  }
  const fly = (from, to, k, up) => {
    const e = up ? k * k : 1 - (1 - k) ** 2;
    const [dx, dy] = [to.x - from.x, to.y - from.y];
    const h = up ? 46 * k : 46 * (1 - k) ** 1.4;
    const heading = (Math.round((Math.atan2(dx, -dy) / (Math.PI / 4)) + 8) % 8);
    const flap = k < 0.75 || up;
    const step = flap ? [0, 1, 2, 1][Math.floor(m2.tick / 3) % 4] : 1;
    const frame = flap ? M2E_FLAP[Math.floor(m2.tick / 2) % 4] : 'level';
    return { gx: from.x + dx * e, gy: from.y + dy * e, h, heading, step, frame, face: dx < 0 ? -1 : 1 };
  };
  if (b.state === 'arrive') {
    if (t >= M2E_ARRIVE) { Object.assign(b, { state: 'perch', t0: m2.tick }); return perch('perch', 0); }
    if (t >= M2E_ARRIVE - 10) return perch('flare', 0);
    return fly(b.home, top, t / (M2E_ARRIVE - 10), false);
  }
  if (t < 8) return perch('flare', 0);
  if (t >= M2E_LEAVE) return null;
  return fly(top, b.home, (t - 8) / (M2E_LEAVE - 8), true);
}

// A flight frame's silhouette in one dark colour, for its shadow. Made once per frame.
function m2eShade(step, h) {
  const key = `shade|${step}|${h}`;
  if (!m2eEagleArt.has(key)) {
    const src = m2eEagleFlyFrame(step, h);
    const c = document.createElement('canvas');
    [c.width, c.height] = [src.width, src.height];
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#0c1018';
    g.fillRect(0, 0, c.width, c.height);
    m2eEagleArt.set(key, c);
  }
  return m2eEagleArt.get(key);
}
// The same for v1's flying eagle: its frame (68 by 50 units, shoulders 34 in and 26 down) in one dark colour.
function m2eV1Shade(frame, face) {
  const key = `v1shade|${frame}|${face}`;
  if (!m2eEagleArt.has(key)) {
    const c = document.createElement('canvas');
    [c.width, c.height] = [68 * 4, 50 * 4];
    const g = c.getContext('2d');
    g.setTransform(4, 0, 0, 4, 0, 0);
    drawEagleFlying(g, 34, 26, frame, face);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#0c1018';
    g.fillRect(0, 0, c.width, c.height);
    m2eEagleArt.set(key, c);
  }
  return m2eEagleArt.get(key);
}
// Each frame: sync, then the shadows of the flying eagles on the ground.
m2.layers.ground.push((g, tick, reduced) => {
  m2eEagleSync(reduced);
  for (const [k, b] of m2eBirds) {
    const n = m2eEagleNow(b);
    if (!n) { m2eBirds.delete(k); continue; }
    b.now = n;
    if (n.perch) continue;
    // The shadow: the bird's own shape, dark and soft, smaller and fainter the higher it flies.
    const s = 1 - n.h / 120;
    g.globalAlpha = 0.28 * s;
    if (M2E_V1) {
      const k = M2E_K * s;
      g.drawImage(m2eV1Shade(n.frame, n.face), n.gx - 34 * k, n.gy - 26 * k * 0.6, 68 * k, 50 * k * 0.6);
    } else g.drawImage(m2eShade(n.step, n.heading), n.gx - 42 * s, n.gy - 42 * s * 0.6, 84 * s, 84 * s * 0.6);
    g.globalAlpha = 1;
  }
});
// The crags and the perched eagles, in the depth sort at the crag's foot, each on its pool of light once landed.
m2.layers.items.push((add) => {
  for (const b of m2eBirds.values()) {
    const n = b.now;
    if (!n) continue;
    const { x, y } = b.crag;
    const t = m2.tick - b.t0;
    const rock = b.state === 'leave' ? Math.max(0, 1 - Math.max(0, t - 8) / 20) : b.state === 'arrive' ? Math.min(1, t / 10) : 1;
    if (M2E_V1) {
      // v1's crag with its base on y + 9 and the eagle on its top, facing into its realm (v1's faces west).
      add(y + 4, () => {
        const g = m2G;
        if (n.perch && b.state === 'perch' && n.light) m2ePool(g, x, y + 6, 44, b.call, n.light);
        g.save();
        g.imageSmoothingEnabled = false;
        g.translate(x, y + 9);
        g.scale(M2E_K, M2E_K);
        g.globalAlpha = rock;
        drawEagleRock(g, 0, 0);
        g.globalAlpha = 1;
        if (!b.slot) g.scale(-1, 1);
        if (n.perch) drawEaglePerched(g, 0, -EAGLE_STAND, M2E_V1_POSE[n.perch]);
        g.restore();
      }, [x - 15, y - 58, x + 15, y + 10]);
      continue;
    }
    add(y + 4, () => {
      const g = m2G;
      if (n.perch && b.state === 'perch' && n.light) m2ePool(g, x, y + 6, 44, b.call, n.light);
      g.globalAlpha = rock;
      g.drawImage(m2eCrag(), x - 13, y - 4, 26, 13);
      g.globalAlpha = 1;
      // It faces into its realm: the west crag's eagle looks east, the east crag's west.
      if (n.perch) {
        const ex = Math.round(n.gx * 4) / 4;
        g.save();
        if (b.slot) { g.translate(2 * ex, 0); g.scale(-1, 1); }
        g.drawImage(m2eEaglePerch(n.perch), ex - 22, Math.round((n.gy - 40) * 4) / 4, 44, 42);
        g.restore();
      }
    }, [x - 22, y - 44, x + 22, y + 9]);
  }
});
// Eagles in flight, over everything.
m2.layers.air.push((g) => {
  for (const b of m2eBirds.values()) {
    const n = b.now;
    if (!n || n.perch) continue;
    if (M2E_V1) {
      g.save();
      g.imageSmoothingEnabled = false;
      g.translate(Math.round(n.gx * 4) / 4, Math.round((n.gy - n.h) * 4) / 4);
      g.scale(M2E_K, M2E_K);
      drawEagleFlying(g, 0, 0, n.frame, n.face);
      g.restore();
    } else g.drawImage(m2eEagleFlyFrame(n.step, n.heading), Math.round((n.gx - 42) * 4) / 4, Math.round((n.gy - n.h - 42) * 4) / 4, 84, 84);
  }
});
// The eagle under the pointer (map units x, y), as its caller: a landed one by its crag and the bird on it, one flying
// in by its wings (v1's flying frame's shoulders, 26 v1 units either side and 10 above and below, at the map's size).
// One flying home has no call left.
function m2eEagleAt(x, y) {
  for (const b of m2eBirds.values()) {
    const n = b.now;
    if (!n || b.state === 'leave') continue;
    if (n.perch && Math.abs(x - b.crag.x) <= 14 && y >= b.crag.y - 42 && y <= b.crag.y + 9) return b;
    if (!n.perch && Math.abs(x - n.gx) <= 26 * M2E_K && Math.abs(y - (n.gy - n.h)) <= 10 * M2E_K) return b;
  }
  return null;
}
// The landed eagles' names, counting any callers folded in ("Orchestrator +1"), for scene2-call-bar.js to place: beside the
// breast, 12 v1 units over the feet, on the side away from the realm's other crag first (out: -1 west, 1 east), its
// tail 8 v1 units out that way and its head 10 the other; else over its head (top).
function m2eEagleTags() {
  const feet = (b) => b.crag.y + 9 - M2E_K * (M2E_V1 ? EAGLE_STAND : 0);
  return [...m2eBirds.values()].filter((b) => b.now?.perch && b.state === 'perch').map((b) => ({
    key: b.key, calls: b.calls, name: b.more ? `${b.name} +${b.more}` : b.name, x: b.crag.x, y: feet(b) - 12 * M2E_K,
    out: b.slot ? 1 : -1, tail: 8 * M2E_K, head: 10 * M2E_K, top: feet(b) - (M2E_V1 ? EAGLE_TALL : 31) * M2E_K - 1,
  }));
}
// The landed eagle's rings, after the night's shade (its pool is drawn with its crag).
m2.layers.light.push((g, tick, reduced) => {
  for (const b of m2eBirds.values()) {
    const n = b.now;
    if (!n?.perch || b.state !== 'perch' || !n.light) continue;
    m2eRings(g, n.gx, n.gy - 36, b.call, tick + b.seed, reduced);
  }
});
