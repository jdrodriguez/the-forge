// scene2-rider-draw.js: how a Sentry rider on the map from above (scene2.js) is drawn on his horse (a.draw while he is
// mounted, scene2-rider.js), and his horse waiting by the post while he is on foot. The horse first (scene2-horse.js),
// then the rider on its saddle: the body's ride pose when its file gives a seat (M2_BODY[kind].seat, how far above the
// feet the hips sit), else its standing frame cut at the waist, with his legs astride the horse in his boots. Riding
// along, he bobs with the horse's stride; in a charge his sword is raised and cuts as he passes the orc.

const M2M_BOOT = ['#1c140e', '#3a2a1e', '#5a4230'];

// The rider's legs astride in his boots: in profile the near leg down the horse's side, from the hip to the knee and
// down to a boot in the stirrup; from the front or behind (with no ride pose), one down each side.
function m2mLegs(g, sx, sy, facing) {
  const B = M2M_BOOT;
  if (facing === 'side') {
    // The thigh from the hip forward to the knee, the shin down and back to the stirrup, the boot's toe forward.
    g.fillStyle = B[0];
    g.fillRect(sx - 1.25, sy - 0.5, 4.5, 2.25);
    g.fillRect(sx + 1.25, sy + 1.25, 2, 4.5);
    g.fillStyle = B[1];
    g.fillRect(sx - 1, sy - 0.25, 4, 1.75);
    g.fillRect(sx + 1.5, sy + 1.25, 1.5, 4);
    g.fillStyle = B[2];
    g.fillRect(sx - 1, sy - 0.25, 4, 0.5);
    g.fillRect(sx + 1.5, sy + 1.5, 0.5, 3.5);
    g.fillStyle = B[0];
    g.fillRect(sx + 1.25, sy + 5.25, 3, 1);
    g.fillStyle = '#8a94a6';
    g.fillRect(sx + 1.25, sy + 6, 2.5, 0.5);
    return;
  }
  const leg = (x, y, w, h) => {
    g.fillStyle = B[1];
    g.fillRect(x, y, w, h - 1.5);
    g.fillStyle = B[0];
    g.fillRect(x, y + h - 1.5, w, 1.5);
    g.fillRect(x + w - 0.25, y, 0.25, h - 1.5);
    g.fillStyle = B[2];
    g.fillRect(x, y, 0.25, h - 1.5);
  };
  leg(sx - 5.25, sy - 0.5, 1.5, 5);
  leg(sx + 3.75, sy - 0.5, 1.5, 5);
}

const m2mDrawMounted = m2mSafe((g, a) => m2mDrawRider(g, a), 'rider');
function m2mDrawRider(g, a) {
  const R = a.rr;
  const facing = a.face === 'left' || a.face === 'right' ? 'side' : a.face;
  // In profile the rider and horse are v1's own (scene2-rider-v1.js).
  if (facing === 'side' && typeof m2vDrawRider === 'function') return m2vDrawRider(g, a);
  const [x, y] = [Math.round(a.x * 4) / 4, Math.round(a.y * 4) / 4];
  if (a.mood === 'gone') g.globalAlpha = 0.4;
  // The end-on horse has no rear (v1's, in profile, has): it stands.
  R.gait = R.gait === 'rear' ? 'stand' : R.gait;
  m2mDrawHorse(g, a.kind, x, y, a.face, R.gait, R.gf);
  const b = m2BodyOf(a.kind);
  const ride = b.seat != null;
  // End on the gallop's bob is the horse's larger one (scene2-horse.js's m2mEndForms), and he rides it.
  const bob = ((M2M_BOB[R.gait]?.[R.gf] ?? 0) * (R.gait === 'gallop' ? 2.6 : 1)) / 4;
  const [sx, sy] = [x + M2M_SEAT[facing][0], y + M2M_SEAT[facing][1] + bob];
  const hip = b.seat ?? Math.round(b.head * 0.42 * 4) / 4;
  const P = qdFigurePal(a.kind, a.name);
  const frame = ride ? ((R.gait === 'stand' || R.gait === 'graze') ? 0 : R.gf % 2) : 0;
  const art = m2FigFrame(P, facing, ride ? 'ride' : 'stand', frame, m2Blink(a), a.tool ?? M2_TOOL[a.kind] ?? 'sword', a.kind, a.name);
  g.save();
  if (a.face === 'left') { g.translate(2 * x, 0); g.scale(-1, 1); }
  // His far leg is behind the horse, his near leg over it; the body sits on the saddle.
  const top = sy + hip - b.fy;
  // In profile his coat stops at the saddle and his own leg goes down the horse's side (thigh, knee, boot in the
  // stirrup), so the barrel shows below; end on the body's ride pose spreads its legs over the flanks.
  const cut = !ride || facing === 'side';
  const rows = cut ? b.fy - hip + 1 : b.h;
  g.drawImage(art, 0, 0, art.width, Math.round(rows * 4), sx - b.fx, top, b.w, Math.round(rows * 4) / 4);
  if (cut) m2mLegs(g, sx, sy, facing);
  // The parts of the horse nearer than the rider are drawn over him: in profile its near legs, neck and head; coming
  // toward you its head and breast; going away its haunches and tail.
  m2mDrawHorse(g, a.kind, x, y, a.face === 'left' ? 'right' : a.face, R.gait, R.gf, true);
  // A raised sword in a charge, and its cut as he passes.
  if ((R.sword || R.cheer) && facing === 'side') {
    const hand = { x: sx + 2.5, y: sy - hip * 0.55, up: R.sword !== 'cut' };
    m2DrawTool(g, 'sword', hand);
  }
  g.restore();
  g.globalAlpha = 1;
}

// The horses of riders on foot, waiting by their posts, grazing and swishing their tails.
m2.layers.items.push(m2mSafe((add, tick) => {
  for (const a of m2.actors.values()) {
    const R = a.rr;
    if (!R || R.mounted || R.hx == null || !a.station?.sentry) continue;
    add(R.hy, () => {
      if (a.mood === 'gone') m2G.globalAlpha = 0.4;
      if ((R.face === 'left' || R.face === 'right') && typeof m2vDrawHorse === 'function') m2vDrawHorse(m2G, a, R.hx, R.hy, R.face, R.gait, R.gf);
      else m2mDrawHorse(m2G, a.kind, R.hx, R.hy, R.face, R.gait, R.gf);
      m2G.globalAlpha = 1;
    }, [R.hx - 18, R.hy - 26, R.hx + 18, R.hy + 1]);
  }
}, 'horses'));
