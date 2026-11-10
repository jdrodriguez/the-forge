// scene2-body-parts.js: composes a people's body on the map from above from scene2-body-kit.js's volumes, in every
// facing (down toward you, up away, side to the right; scene2-folk.js mirrors it for left) and pose: walk (frames 0,
// 0.5, 1, 1.5, the body half a unit up on the passing frames, one foot lifting on each stride, the arms swinging
// against the legs), stand, work (0 raised, 0.5 swinging, 1 striking, the tool in the fist), sleep (sat slumped, head
// bowed, arms folded, breathing), ask (a hand up, waving), cheer (both arms up), sit (hands in the lap), smoke (sat,
// the pipe lowered then at the mouth) and ride (astride: the legs spread over a horse's flanks, the hands forward on
// the reins). A people gives its measures in pixels (a quarter unit) and its overlays as hooks (see m2bPeople); this
// file lays out the skeleton for the pose and calls them in depth order.

// The hand's place for each arm pose: [elbow, hand] as [row, col] offsets from the shoulder, for the arm on the image's
// right (the left arm mirrors the column), L the arm's length.
function m2bArmPose(name, L, f) {
  const P = {
    hang: [[L * 0.5, 0.5], [L, 1]],
    fore: [[L * 0.48, 0], [L - 3, -1.5]],
    back: [[L * 0.5, 1], [L - 1, 3]],
    up: [[-L * 0.3, 3.5], [-L * 0.72, 5]],
    wave: [[-L * 0.15, 4], [-L * (0.62 + 0.08 * f), 3 + 2 * f]],
    raised: [[-2, 5], [-L * 0.6, 3]],
    mid: [[1, 6], [-1, L * 0.78]],
    strike: [[L * 0.42, 4], [L * 0.72, 7]],
    fold: [[L * 0.55, 1], [L * 0.42, -7]],
    lap: [[L * 0.5, 0.5], [L * 0.8, -4]],
    rein: [[L * 0.45, 1], [L * 0.62, -4]],
    pipe: [[L * 0.5, 1.5], [L * (f ? 0.02 : 0.38), f ? -6 : -3]],
    // In profile, facing right: hanging, swung forward and back, the swing's three steps and the reins.
    sHang: [[L * 0.5, -1], [L, 0]],
    sFore: [[L * 0.48, 1.5], [L - 2, 6]],
    sBack: [[L * 0.48, -2], [L - 1, -5]],
    sRaised: [[-3, -3], [-L * 0.62, -1]],
    sMid: [[-2, 4], [-L * 0.5, 9]],
    sStrike: [[L * 0.35, 5], [L * 0.45, L * 0.75]],
    sRein: [[L * 0.45, 2], [L * 0.55, 8]],
    sUp: [[-L * 0.3, 2], [-L * 0.7, 3]],
    // Holding a staff or spear upright beside the body.
    staff: [[L * 0.45, 2.5], [L * 0.7, 5]],
    sStaff: [[L * 0.42, 6], [L * 0.55, 15]],
  };
  return P[name] ?? P.hang;
}
// The tool's angle in the fist (degrees, 0 pointing right, -90 straight up) for each swing step.
const M2B_SWING = { raised: -105, mid: -35, strike: 35, sRaised: -125, sMid: -50, sStrike: 25 };

// Lays out one frame's skeleton: rows from the head's top, the stride, the seat, and each arm's pose.
function m2bLayout(S, facing, pose, frame) {
  const seated = pose === 'sleep' || pose === 'sit' || pose === 'smoke';
  const walk = pose === 'walk';
  const bob = walk && frame % 1 ? 2 : 0;
  const breath = (pose === 'sleep' || pose === 'sit') && frame ? 1 : 0;
  const foot = S.fy * 4;
  const legLen = S.H - S.hip;
  const seat = seated ? Math.round(legLen * (S.seatK ?? 0.45)) : 0;
  const top = seated ? foot - seat - S.hip - breath : foot - S.H - bob;
  const K = { S, facing, pose, frame, seated, walk, bob, breath, foot, top, legLen, cx: S.fx * 4, side: facing === 'side' };
  K.neck = top + S.neck;
  K.waist = top + S.waist;
  K.hip = top + S.hip;
  K.step = walk && frame % 1 === 0 ? frame : -1;
  K.ride = pose === 'ride';
  K.bow = pose === 'sleep' ? 3 : 0;
  K.headTop = top + K.bow;
  K.hcx = K.cx + (K.side ? (S.headFwd ?? 2) : 0);
  const sw = K.step === 0 ? 1 : K.step === 1 ? -1 : 0;
  let arms;
  if (K.side) {
    const work = pose === 'work' ? ['sRaised', 'sMid', 'sStrike'][frame * 2] : null;
    arms = { near: work ?? (K.ride ? 'sRein' : pose === 'cheer' || pose === 'ask' ? 'sUp' : sw ? (sw > 0 ? 'sFore' : 'sBack') : 'sHang'),
      far: K.ride ? 'sRein' : sw ? (sw > 0 ? 'sBack' : 'sFore') : 'sHang' };
    K.toolArm = work ? 'near' : null;
  } else {
    const work = pose === 'work' ? ['raised', 'mid', 'strike'][frame * 2] : null;
    const both = { cheer: 'up', sleep: 'fold', sit: 'lap', ride: 'rein' }[pose];
    arms = { L: both ?? (pose === 'ask' ? 'wave' : sw ? (sw > 0 ? 'fore' : 'back') : 'hang'),
      R: both ?? work ?? (pose === 'smoke' ? 'pipe' : sw ? (sw > 0 ? 'back' : 'fore') : 'hang') };
    if (pose === 'smoke') arms.L = 'lap';
    K.toolArm = work ? 'R' : null;
    // From behind the image's right arm is the figure's left, so the working arm swaps over.
    if (work && facing === 'up') { arms.L = work; arms.R = 'hang'; K.toolArm = 'L'; }
  }
  // A people that carries a staff or spear holds it upright in its working hand while it stands or walks.
  K.carry = !K.toolArm && S.carry && (pose === 'stand' || pose === 'walk') ? (K.side ? 'near' : facing === 'up' ? 'L' : 'R') : null;
  if (K.carry) arms[K.carry] = K.side ? 'sStaff' : 'staff';
  K.arms = arms;
  K.swingName = K.toolArm ? arms[K.toolArm] : null;
  return K;
}

// One arm from its shoulder: the sleeve as two limbs bent at the elbow, a cuff, and the hand (a fist when it grips);
// returns the hand's place in pixels. flip mirrors the pose for the arm on the image's left; bias darkens a far arm.
function m2bArm(G, K, sr, sc, name, flip, o = {}) {
  const S = K.S;
  const A = S.arm;
  const [[er, ec], [hr, hc]] = S.armPose?.(name, A.len, K.frame) ?? m2bArmPose(name, A.len, K.frame);
  const m = flip ? -1 : 1;
  const [e, h] = [[sr + er, sc + ec * m], [sr + hr, sc + hc * m]];
  const ramp = o.ramp ?? S.R.sleeve;
  const vo = { bias: o.bias ?? 0, tex: o.tex };
  m2bLimb(G, sr, sc, e[0], e[1], A.rad, ramp, vo, A.rad - 0.3);
  m2bLimb(G, e[0], e[1], h[0], h[1], A.rad - 0.3, o.fore ?? ramp, vo, A.rad - (A.taper ?? 0.8));
  if (A.cuff) {
    const t = 0.82;
    m2bBall(G, e[0] + (h[0] - e[0]) * t, e[1] + (h[1] - e[1]) * t, A.rad - 0.5, A.rad - 0.2, A.cuff, { bias: vo.bias });
  }
  (K.hands ??= []).push({ h, e, bias: vo.bias });
  const hand = o.handLayer ?? G;
  m2bBall(hand, h[0] + 1, h[1], A.hand ?? 2.6, A.hand ?? 2.6, S.R.hand ?? M2B.skin, { bias: vo.bias + 0.1 });
  return h;
}

// The legs in front or back view: each leg down from the hip to its boot, a stride lifting one foot; seated, the
// knees come up toward you and the shins stand under them; riding, the legs spread over the horse's flanks.
function m2bLegsFront(G, K) {
  const S = K.S;
  const [lw, gap] = [S.legW, S.legGap];
  for (const s of [-1, 1]) {
    const lift = K.step === (s < 0 ? 0 : 1) ? 3 : 0;
    const c = K.cx + s * gap - (s > 0 ? 1 : 0);
    const bias = s > 0 ? -0.08 : 0;
    let fr = K.foot - lift;
    let fc = c + s * 0.5;
    if (K.seated) {
      const knee = K.hip + 1;
      m2bBall(G, knee, c + s, lw + 0.5, lw + 1, S.R.legs, { bias: bias + 0.1 });
      m2bLimb(G, knee + 1, c + s, K.foot - S.footH, c + s * 1.5, lw, S.R.legs, { bias, open: 't' });
      fc = c + s * 1.5;
    } else if (K.ride) {
      const kn = [K.hip + K.legLen * 0.32, c + s * 9];
      fr = K.hip + K.legLen * 0.86;
      fc = c + s * 10;
      m2bLimb(G, K.hip, c, kn[0], kn[1], lw + 0.5, S.R.legs, { bias });
      m2bLimb(G, kn[0], kn[1], fr - S.footH, fc, lw, S.R.legs, { bias });
    } else m2bLimb(G, K.hip - 1, c, fr - S.footH, c, S.legW0 ?? lw, S.R.legs, { bias, tex: S.legTex }, lw);
    m2bFoot(G, K, fr, fc, s, bias);
  }
}
// A boot or bare foot whose sole is on row fr: seen from the front or back, a rounded toe lit on its left.
function m2bFoot(G, K, fr, fc, s, bias) {
  const S = K.S;
  if (S.foot) return S.foot(G, K, fr, fc, s, bias);
  m2bBall(G, fr - S.footH / 2, fc + s * 0.5, S.footH / 2 + 0.5, S.footW, S.R.boot, { bias: bias + (K.facing === 'up' ? -0.15 : 0.1) });
}
// The legs in profile, facing right: the near leg lit and the far one in shade, scissoring on a stride and passing
// with the far knee forward; riding, only the near leg, its knee forward over the flank and its boot in the stirrup.
function m2bLegsSide(G, K) {
  const S = K.S;
  const L = K.legLen;
  const hc = K.cx - 1;
  const legs = [];
  if (K.ride) legs.push({ near: 1, knee: [K.hip + 2, hc + 8], foot: [K.hip + L * 0.78, hc + 6] });
  else if (K.step === 0 || K.step === 1) {
    const fwd = { knee: [K.hip + L * 0.5, hc + 4], foot: [K.foot, hc + 7] };
    const bck = { knee: [K.hip + L * 0.5, hc - 3], foot: [K.foot - 2, hc - 7] };
    legs.push(K.step === 0 ? { near: 0, ...bck } : { near: 0, ...fwd }, K.step === 0 ? { near: 1, ...fwd } : { near: 1, ...bck });
  } else if (K.walk) {
    legs.push({ near: 0, knee: [K.hip + L * 0.48, hc + 3], foot: [K.foot - 4, hc - 1] }, { near: 1, knee: [K.hip + L * 0.5, hc], foot: [K.foot, hc] });
  } else legs.push({ near: 0, knee: [K.hip + L * 0.5, hc - 2], foot: [K.foot, hc - 2] }, { near: 1, knee: [K.hip + L * 0.5, hc + 1], foot: [K.foot, hc + 1] });
  for (const l of legs) {
    const bias = l.near ? 0 : -0.25;
    const fr = l.foot[0];
    m2bLimb(G, K.hip - 1, hc - 1 + l.near * 2, l.knee[0], l.knee[1], S.legW + 0.3, S.R.legs, { bias });
    m2bLimb(G, l.knee[0], l.knee[1], fr - S.footH, l.foot[1], S.legW, S.R.legs, { bias });
    if (S.footSide) S.footSide(G, K, fr, l.foot[1], bias);
    else m2bBall(G, fr - S.footH / 2, l.foot[1] + 2, S.footH / 2 + 0.5, S.footW + 1.5, S.R.boot, { bias: bias + 0.1 });
  }
}

// The trunk: shoulders rounding into a chest narrowing to the waist, then the hips (or a robe to its hem, flaring and
// lifting on the striding side). In profile it is deeper at the chest than the back.
function m2bTrunk(G, K) {
  const S = K.S;
  const R = S.R;
  if (K.side) {
    const [b, f] = [S.depthB ?? S.waW - 1, S.depthF ?? S.waW];
    m2bRows(G, K.neck, K.hip, (r) => {
      const t = (r - K.neck) / Math.max(1, K.hip - K.neck);
      const round = r - K.neck < 3 ? 3 - (r - K.neck) : 0;
      return [Math.round(K.cx - b + round), Math.round(K.cx + f - (t > 0.6 ? 1 : 0) - round)];
    }, R.body, { ny: -0.2, tex: S.bodyTex });
    if (S.robe) {
      const rw = S.robe;
      const end = K.top + rw.end;
      const lift = K.step === 0 || K.step === 1 ? 2 : 0;
      m2bPoly(G, [[K.waist, K.cx - b], [K.waist, K.cx + f], [end - lift, K.cx + rw.front + (lift ? 2 : 0)], [end, K.cx - rw.back]], R.robe ?? R.body, { tex: S.robeTex, open: 't' });
    }
    return;
  }
  const up = K.facing === 'up';
  m2bTaper(G, K.neck, K.waist, K.cx, S.shW, S.waW, R.body, { round: 0.18, ny: -0.15, bulge: S.bulge ?? 0, tex: up ? S.backTex : S.bodyTex });
  if (S.robe && (!K.ride || S.robe.short)) {
    const rw = S.robe;
    const end = K.seated ? (rw.short ? K.hip + 5 : K.foot - 1) : K.top + rw.end;
    const hem = K.seated ? rw.hem + (rw.short ? 1 : 3) : rw.hem;
    const st = K.step;
    m2bRows(G, K.waist, end, (r) => {
      const t = (r - K.waist) / Math.max(1, end - K.waist);
      const w = S.waW + (hem - S.waW) * t ** 1.3;
      const a = Math.round(K.cx - w);
      const b = Math.round(K.cx + w) - 1;
      // The hem lifts over the striding foot, so the boot shows under it.
      if (r > end - 3 && (st === 0 || st === 1)) return st === 0 ? [Math.round(K.cx) - 1, b] : [a, Math.round(K.cx)];
      return [a, b];
    }, R.robe ?? R.body, { tex: S.robeTex, open: 't' });
  } else {
    m2bTaper(G, K.waist, K.hip + 1, K.cx, S.waW, S.hipW, R.hips ?? R.body, { open: S.hipOpen ?? 't', tex: S.hipTex });
  }
}

// A people's body as scene2-folk.js's M2_BODY wants it: S gives the frame (w, h, fx, fy in units), the height H and the
// rows of the neck (shoulder line), waist and hip from the head's top in pixels, half widths shW, waW, hipW, the legs
// (legW, legGap, footW, footH), the arm { len, rad, hand, cuff }, an optional robe { end, hem, front, back }, its ramps
// R { body, sleeve, legs, boot, hand, robe, hips }, its colours mats (m2bPal), its tool, and hooks called in depth
// order with (G, K): behind (before everything), torso (over the trunk), head (the whole head for K.facing), over (after
// the head), gear (things carried when not working). head, sleepHead and shadow are the folk's measures in units.
function m2bPeople(kind, S) {
  const measures = { w: S.w, h: S.h, fx: S.fx, fy: S.fy, head: S.headU ?? (S.H + (S.hat ?? 0)) / 4, sleepHead: S.sleepU ?? (S.H * 0.72) / 4, shadow: S.shadow ?? (S.shW * 2.4) / 4, seat: (S.H - S.hip) / 4 };
  // Where the pipe's bowl sits when smoking (frame 1), in units from the feet point: smoke rings rise from there.
  const L = m2bLayout(S, 'down', 'smoke', 1);
  const mouthY = (L.headTop + S.face.cy + S.face.eye + 7) / 4 - S.fy;
  measures.mouth = { x: 0, y: mouthY };
  measures.pipe = { x: 0.75 + 3, y: mouthY - 1 };
  M2_BODY[kind] = { ...measures, draw(g, P, facing, pose, frame, shut, tool) { m2bDraw(S, kind, g, P, facing, pose, frame, shut, tool); } };
}
// The poses each facing has; anything else falls back to standing in that facing.
const M2B_FACES = { walk: 'dus', stand: 'dus', work: 'dus', sleep: 'd', ask: 'd', cheer: 'd', sit: 'd', smoke: 'd', ride: 'dus' };
function m2bDraw(S, kind, g, P, facing, pose, frame, shut, tool) {
  if (!M2B_FACES[pose]) pose = 'stand';
  if (!M2B_FACES[pose].includes(facing[0])) { if (pose === 'work' || pose === 'walk' || pose === 'ride') facing = 'down'; else pose = 'stand'; }
  if (pose === 'ride' && !S.rides) pose = 'stand';
  const G = qdGrid(S.w * 4, S.h * 4);
  const T = qdGrid(S.w * 4, S.h * 4);
  const K = m2bLayout(S, facing, pose, frame);
  K.shut = shut || pose === 'sleep';
  K.P = P;
  K.tool = S.toolOf ? S.toolOf(P, tool) : S.tools?.[tool] ?? (tool === 'quill' && S.tool ? S.tool : tool);
  const sr = K.neck + S.arm.at;
  S.behind?.(G, K);
  // The hair that falls behind the body is drawn first, from the front and the side.
  if (K.facing !== 'up') { K.stage = 'back'; S.head(G, K); }
  K.stage = 'front';
  // The neck, from under the chin to the shoulders.
  if (S.neckW !== 0) {
    const chin = K.headTop + S.face.cy + S.face.ry - 4;
    m2bTaper(G, chin, K.neck + 2, K.hcx - (K.side ? 4 : 0), S.neckW ?? 5, (S.neckW ?? 5) + 1, M2B.skin, { bias: K.facing === 'up' ? 0 : -0.15 });
  }
  let hand = null;
  if (K.side) {
    const sc = K.cx - 1;
    if (!K.ride || S.farRein) m2bArm(G, K, sr + 1, sc - 2, K.arms.far, false, { bias: -0.3 });
    m2bLegsSide(G, K);
    m2bTrunk(G, K);
    S.torso?.(G, K);
    S.head(G, K);
    const h = m2bArm(G, K, sr, sc, K.arms.near, false, { handLayer: K.toolArm || K.carry ? T : G });
    if (K.toolArm) hand = h;
    if (K.carry) K.carryAt = h;
  } else {
    if (S.robe && !K.ride) { if (!K.seated) m2bLegsFront(G, K); } else m2bLegsFront(G, K);
    if (S.robe && K.seated) m2bLegsFront(G, K);
    m2bTrunk(G, K);
    S.torso?.(G, K);
    const scL = K.cx - S.shW + S.arm.rad;
    const scR = K.cx + S.shW - S.arm.rad - 1;
    const up = K.facing === 'up';
    const folded = K.pose === 'sleep' || K.pose === 'ride' || K.pose === 'sit';
    if (!folded) S.head(G, K);
    m2bArm(G, K, sr, scL, up ? K.arms.R : K.arms.L, true, { bias: up ? -0.05 : 0 });
    const h = m2bArm(G, K, sr, scR, up ? K.arms.L : K.arms.R, false, { bias: -0.08, handLayer: K.toolArm || K.carry ? T : G });
    if (K.toolArm) hand = h;
    if (K.carry) K.carryAt = h;
    if (folded) S.head(G, K);
  }
  S.over?.(G, K);
  if (!hand && S.gear) S.gear(G, K, T);
  // A people that rocks as it strides (S.rock: pixels at the head per walk frame) leans its body above the hips.
  if (S.rock && K.walk) for (const L of [G, T]) m2bShear(L, K.top, K.hip, S.rock(K));
  const rim = S.rimOf ? S.rimOf(P) : S.rim;
  if (rim) m2bRim(G, rim);
  const pal = m2bPal(P, kind, S.mats);
  hdMap(g, G.rows(), pal, 0, 0, 0.25);
  if (hand && K.tool) m2DrawTool(g, K.tool, { x: hand[1] / 4, y: hand[0] / 4, ang: M2B_SWING[K.swingName], face: facing, up: K.frame === 0, mid: K.frame === 0.5 });
  if (K.carryAt) m2bTool(g, typeof S.carry === 'function' ? S.carry(P) : S.carry, K.carryAt[1] / 4, K.carryAt[0] / 4 + 0.5, S.carryAng ?? -90);
  if (K.pose === 'smoke' && K.frame && M2_TOOLS.pipe) M2_TOOLS.pipe(g, { x: K.hcx / 4 + 0.75, y: (K.headTop + S.face.cy + S.face.eye + 7) / 4, ang: 0 });
  hdMap(g, T.rows(), pal, 0, 0, 0.25);
}
