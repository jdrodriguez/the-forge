// scene2-gollum.js: the Gollums of the map from above (scene2.js), one to each machine's realm (2026-11-09: one
// Gollum per machine, his findings in a view of their own), each counting only his own machine from gollum-data.js's
// grHost, the same report the Worktrees view's Forgotten filter and the side view's Gollums read. He hoards forgotten work:
// his machine's worktrees that no worker and no process uses, whose last commit is three days old or more (seven while
// the PR is still open). He lives in a lair in his realm's land (scene2-gollum-lairs.js) with his heap of trinkets
// beside its mouth, as big as his machine's count. He crouches by his heap counting, rocking over it, then creeps out
// on all fours to fetch another trinket, crouches to snatch it up, and creeps back with it glinting in his hand. He
// covets usage: while an account signed in on his machine has used 90% or more of its 5-hour or weekly window, he
// crouches at his heap clutching the Ring, which glows. When an eagle comes down in his realm or flies off from it, or
// the Eye's red gaze falls near him in the war, he scuttles home and hides a while. When his count falls (a worktree
// cleaned up or taken back into use) he slinks home and sulks hidden in his lair 24 seconds, as v1's Gollum does
// (scene-gollum.js's GOL_SULK; 2026-11-09: parity with the side view). A machine with nothing to report
// keeps its Gollum hidden in his lair, only his pale eyes showing at night. No text is drawn about him on the map: a
// click on him or his heap opens his machine's forgotten worktrees (#worktrees/<host>/forgotten). Each has his own seed, so they keep
// their own time. With reduced motion each simply crouches at his heap, or clutches the Ring.

const m2eGols = new Map();
// Each realm's lair, by host, for the current layout; scene2-gollum-lairs.js fills it once the world is built (a page
// without that file simply has no Gollums).
const m2eLairs = { key: '', by: new Map() };
// Ticks he lies low after a fright, and how long he counts before he goes for another trinket (each adds his seed).
const M2E_GOL_CALM = 40;
const M2E_GOL_COUNT = 140;
// Ticks he sulks hidden after his count falls.
const M2E_GOL_SULK = 240;

// His state for this layout, made at his crouching place the first time and again when the layout changes.
function m2eGolOf(host, L) {
  let G = m2eGols.get(host);
  if (!G || G.key !== m2eLairs.key) {
    const seed = pxHash(`gollum|${host}`) % 997;
    G = { host, key: m2eLairs.key, seed, x: L.x, y: L.y, face: 'left', mode: 'home', t: seed % M2E_GOL_COUNT, to: null, wait: 0 };
    m2eGols.set(host, G);
  }
  return G;
}

// Whether something frightens him: an eagle coming down in his realm or taking off from it (scene2-eagle.js), or the
// Eye's gaze on the land within a few strides of him while main is red (scene2-eye.js).
function m2eGolFear(G, r) {
  if (typeof m2eBirds === 'object') {
    for (const b of m2eBirds.values()) {
      const t = m2.tick - b.t0;
      const mine = b.crag && b.crag.x >= r.x - 10 && b.crag.x <= r.x + r.w + 10 && b.crag.y >= r.y - 10 && b.crag.y <= r.y + r.h + 10;
      if (mine && ((b.state === 'arrive' && t < M2E_ARRIVE + 10) || (b.state === 'leave' && t < M2E_LEAVE))) return true;
    }
  }
  if ((m2.war ?? 0) > 0.2 && typeof m2eGaze === 'function') {
    const at = m2eGaze(m2eEyeAt(m2.plan.places), m2.tick).at;
    if (at && Math.hypot(at.x - G.x, (at.y - G.y) * 1.4) < 26) return true;
  }
  return false;
}

// One tick of one Gollum: hidden, counting at home, out for a trinket and back, clutching the Ring, or fleeing home.
function m2eGolStep(G, L, rep, reduced) {
  const n = rep?.rows.length ?? 0;
  const ring = (rep?.ring.length ?? 0) > 0;
  const home = { x: L.x, y: L.y };
  const at = () => Object.assign(G, { x: home.x, y: home.y });
  // His count fell since the last tick, and he still has something to keep: he sulks.
  const fell = G.n != null && n < G.n && n > 0;
  G.n = n;
  if (!n && !ring) { Object.assign(G, { mode: 'hidden', wait: 0 }); at(); return; }
  if (reduced) { Object.assign(G, { mode: ring ? 'ring' : 'home', face: 'left' }); at(); return; }
  G.t += 1;
  const run = (p, speed) => {
    const [dx, dy] = [p.x - G.x, p.y - G.y];
    const d = Math.hypot(dx, dy);
    if (d < 0.4) { Object.assign(G, { x: p.x, y: p.y }); return false; }
    G.x += (dx / d) * Math.min(speed, d);
    G.y += (dy / d) * Math.min(speed, d);
    G.face = dx < 0 ? 'left' : 'right';
    return true;
  };
  const go = (mode, more = {}) => Object.assign(G, { mode, t: 0, ...more });
  const fear = m2eGolFear(G, L.r);
  // A loss: from his heap he slips into his lair; from out on the ground he slinks home first.
  if (fell) {
    if (G.mode === 'hidden') G.wait = Math.max(G.wait, M2E_GOL_SULK);
    else if (G.x === home.x && G.y === home.y) return go('hidden', { wait: M2E_GOL_SULK });
    else if (G.mode !== 'flee') go('sulk', { wait: M2E_GOL_SULK });
  }
  if (G.mode === 'flee') { if (!run(home, 1.1)) go('hidden', { wait: Math.max(G.wait, M2E_GOL_CALM + (G.seed % 20)) }); return; }
  if (G.mode === 'sulk') { if (fear) go('flee'); else if (!run(home, 0.25)) go('hidden', { wait: G.wait }); return; }
  if (G.mode === 'hidden') {
    if (fear) G.wait = Math.max(G.wait, M2E_GOL_CALM);
    if ((G.wait -= 1) > 0) return;
    at();
    go('home', { face: 'left', t: G.seed % 60 });
  }
  if (fear) { if (G.x === home.x && G.y === home.y) go('hidden', { wait: M2E_GOL_CALM + (G.seed % 20) }); else go('flee'); return; }
  if (ring && (G.mode === 'out' || G.mode === 'snatch')) go('back');
  if (G.mode === 'ring' && !ring) go('home', { face: 'left', t: G.seed % 60 });
  if (G.mode === 'home' && ring) go('ring');
  else if (G.mode === 'home' && n && L.roam.length && G.t > M2E_GOL_COUNT + (G.seed % 50)) {
    G.to = L.roam[pxHash(`${G.host}|${m2.tick}`) % L.roam.length];
    go('out');
  } else if (G.mode === 'out' && !run(G.to, 0.35)) go('snatch');
  else if (G.mode === 'snatch' && G.t > 24) go('back');
  else if (G.mode === 'back' && !run(home, 0.35)) go('home', { face: 'left' });
}

// Each Gollum, every frame: his step, then his heap (as big as his count) and himself in the depth sort.
m2.layers.items.push((add, tick, reduced) => {
  if (m2eLairs.key !== m2.key) return;
  for (const [host, L] of m2eLairs.by) {
    const rep = grHost(host);
    const G = m2eGolOf(host, L);
    m2eGolStep(G, L, rep, reduced);
    const n = rep?.rows.length ?? 0;
    if (n) add(L.y - 0.2, () => m2G.drawImage(m2eHoard(n), L.heap.x - 7, L.heap.y - 5, 14, 8), [L.heap.x - 7, L.heap.y - 5, L.heap.x + 7, L.heap.y + 3]);
    if (G.mode === 'hidden') continue;
    const t = tick + G.seed;
    const [pose, frame] = G.mode === 'ring' ? ['clutch', Math.floor(t / 6) % 2] : G.mode === 'flee' ? ['scuttle', hdWalkFrame(t, 1)]
      : G.mode === 'out' || G.mode === 'back' ? ['creep', hdWalkFrame(t, 1)] : G.mode === 'sulk' ? ['creep', hdWalkFrame(t >> 1, 1)]
        : G.mode === 'snatch' ? ['crouch', 1]
        : [(Math.floor(t / 30) % 3 ? 'count' : 'crouch'), Math.floor(t / 5) % 2];
    const art = m2eGollum(pose, frame);
    // On the move he faces his way; at home he turns to his heap, which lies west of him.
    const flip = pose === 'creep' || pose === 'scuttle' ? G.face === 'left' : pose !== 'clutch';
    add(G.y + 0.2, () => {
      const g = m2G;
      const [x, y] = [Math.round(G.x * 4) / 4, Math.round(G.y * 4) / 4];
      g.globalAlpha = 0.3;
      g.drawImage(m2Foot(), x - 3.5, y - 0.25, 7, 2);
      g.globalAlpha = 1;
      g.save();
      g.translate(x, y);
      if (flip) g.scale(-1, 1);
      // The frame's size and feet point (v1's Gollum gives its own, scene2-foes-v1.js).
      const [fw, fh, fx, fy] = art.w ? [art.w, art.h, art.ax, art.ay] : [18, 16, 9, 15];
      g.drawImage(art.c, -fx, -fy, fw, fh);
      // A trinket glinting in his hand on the way home.
      if (G.mode === 'back') { g.fillStyle = tick % 6 < 3 ? '#fff4b0' : '#f8d860'; g.fillRect(art.hand[0] - fx, art.hand[1] - fy - 0.5, 0.5, 0.5); }
      g.restore();
    }, [G.x - 9, G.y - 15, G.x + 9, G.y + 1]);
  }
});
// The Ring's glow in his hands, and his eyes in his lair's black mouth when he hides at night.
m2.layers.light.push((g, tick) => {
  if (m2eLairs.key !== m2.key) return;
  const dark = typeof m2Dark === 'function' ? m2Dark(m2.sky?.hour ?? 12)[0] : 0;
  for (const [host, L] of m2eLairs.by) {
    const G = m2eGols.get(host);
    if (!G) continue;
    if (G.mode === 'ring') {
      const [hx, hy] = [G.x, G.y - 6.6 + (Math.floor((tick + G.seed) / 6) % 2) * 0.25];
      // A small glow at his hands, fainter by day: a bigger or brighter one washed him out into a yellow blob, by night most.
      g.globalAlpha = (0.35 + 0.15 * Math.sin((tick + G.seed) * 0.3)) * (0.5 + 0.5 * dark);
      g.drawImage(m2Glow(2, '#ffd040'), hx - 2, hy - 1.5, 4, 4);
      g.globalAlpha = 1;
      // The Ring: a band of gold three pixels across, hollow, its lit edge white.
      const [rx, ry] = [Math.round(hx * 4) / 4 - 0.375, Math.round(hy * 4) / 4 - 0.5];
      g.fillStyle = '#e8b030';
      g.fillRect(rx, ry, 0.75, 0.25);
      g.fillRect(rx, ry + 0.5, 0.75, 0.25);
      g.fillRect(rx, ry + 0.25, 0.25, 0.25);
      g.fillRect(rx + 0.5, ry + 0.25, 0.25, 0.25);
      g.fillStyle = '#fffbe8';
      g.fillRect(rx, ry, 0.25, 0.25);
    }
    if (G.mode === 'hidden' && dark > 0.5 && (tick + G.seed) % 70 > 6) {
      g.fillStyle = '#d8f0c8';
      g.fillRect(L.mouth.x - 1.25, L.mouth.y, 0.5, 0.25);
      g.fillRect(L.mouth.x + 0.75, L.mouth.y, 0.5, 0.25);
    }
  }
});

// The Gollum (or the heap) under the pointer, as the host whose Gollum it is: the frontmost wins. A hidden Gollum's
// heap still counts while he has something to report.
function m2eGolAt(e) {
  if (m2eLairs.key !== m2.key) return null;
  const { x, y } = m2At(e);
  let hit = null;
  for (const [host, L] of m2eLairs.by) {
    const G = m2eGols.get(host);
    const rep = grHost(host);
    if (!G || !(rep?.rows.length || rep?.ring.length)) continue;
    const onHim = G.mode !== 'hidden' && Math.abs(x - G.x) <= 6 && y >= G.y - 12 && y <= G.y + 1;
    const onHeap = rep.rows.length && Math.abs(x - L.heap.x) <= 7 && Math.abs(y - L.heap.y) <= 4;
    if ((onHim || onHeap) && (!hit || G.y > hit.y)) hit = { host, y: G.y };
  }
  return hit?.host ?? null;
}
// Hooked once every script has run, so these come after scene2-tags.js's own: a click that a worker or a landed eagle
// did not take opens his machine's forgotten worktrees, and the pointer turns to a hand over him.
function m2eGolHook() {
  m2View.addEventListener('click', (e) => {
    if (m2Hit(e) || m2EagleUnder(e)) return;
    const host = m2eGolAt(e);
    if (!host) return;
    history.pushState(null, '', '#worktrees/' + encodeURIComponent(host) + '/forgotten');
    applyView(true);
  });
  m2View.addEventListener('mousemove', (e) => { if (!m2View.style.cursor && m2eGolAt(e)) m2View.style.cursor = 'pointer'; });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', m2eGolHook, { once: true });
else m2eGolHook();
