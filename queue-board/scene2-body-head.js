// scene2-body-head.js: heads for the peoples' bodies on the map from above (scene2-body-parts.js), at 32-bit. A head is
// a skin ball with a face (scene2-body-kit.js's m2bFace from the front, m2bProfile looking right), ears (round, or an
// elf's long points), and hair built as volumes: a fall down the back and sides, a cap over the crown with a fringe and
// a parting, strands and a shine band; from behind the hair covers the whole head. Hoods, hats, helms and beards are
// each people's own overlays, drawn after with the place m2bHead returns.

// The head's places for a frame: the face ball's centre and radii, the lash row and the facing.
function m2bHeadAt(K) {
  const F = K.S.face;
  const cy = K.headTop + F.cy;
  return { cy, cx: K.hcx, rx: F.rx, ry: F.ry, eye: cy + F.eye, facing: K.facing, shut: K.shut, gap: F.gap ?? 4 };
}

// Ears either side of the face at the eyes: round, or an elf's long points sweeping up and out.
function m2bEars(G, f, kind, side) {
  const sk = M2B.skin;
  const ear = (c, s) => {
    if (kind === 'point') {
      m2bLimb(G, f.eye + 4, c, f.eye - 4, c + s * 7, 2.2, sk, {}, 0.6);
      m2bAt(G, f.eye + 1, c + s * 2 - (s < 0 ? 0 : 0), 'r');
      m2bAt(G, f.eye - 1, c + s * 3, 'r');
    } else {
      m2bBall(G, f.eye + 3, c + s * 1.5, 3.5, 2.5, sk);
      m2bAt(G, f.eye + 3, c + s * 1.5 - 0.5, 'r');
    }
  };
  if (side && kind === 'point') { m2bLimb(G, f.eye + 4, f.cx - 2, f.eye - 3, f.cx - 8, 2.8, sk, { bias: 0.15 }, 0.8); m2bAt(G, f.eye + 1, f.cx - 4, 'rr'); }
  else if (side) { m2bBall(G, f.eye + 3, f.cx - 2, 3.6, 2.8, sk, { bias: 0.15 }); m2bPut(G, f.eye + 2, f.cx - 2, ['r', 'rq', 'r']); }
  else for (const s of [-1, 1]) ear(f.cx + s * (f.rx - 1), s);
}

// The hair's light: strands, a shine band near the crown that follows the head's curve, and o.tex on top.
function m2bHairTex(f, o) {
  const strands = o.curls ? m2bCurls : m2bStrands(o.k ?? 3, 0.28);
  const band = f.cy - f.ry * 0.62;
  return (r, c) => {
    const dc = (c - f.cx) / (f.rx + 3);
    const br = band + dc * dc * 5;
    let t = strands(r, c);
    if (!o.curls && Math.abs(r - br) < 1.3 && Math.abs(dc) < 0.75) t += 0.42;
    if (o.part != null && Math.abs(c - (f.cx + o.part)) < 0.6 && r < f.eye - 2) t -= 0.5;
    return t + (o.tex ? o.tex(r, c) : 0);
  };
}

// A whole head in K's facing. o: skin ball and ears (ears: 'round', 'point' or null), hair { ramp, out (how far the
// hair stands off the skull), lift, fringe (rows above the lashes the fringe ends), side (how far down the hair covers
// the temples), fall (rows of hair below the face's centre, down the back and sides), fallW, curls, part }, face
// options (m2bFace), and o.front / o.back / o.profile to draw instead of the face. Returns the head's places.
function m2bHead(G, K, o = {}) {
  const f = m2bHeadAt(K);
  const H = o.hair;
  const hr = H?.ramp ?? M2B.hair;
  const out = H?.out ?? 3;
  const lift = H?.lift ?? 2;
  const tex = H ? m2bHairTex(f, H) : null;
  const capIn = (r, c) => ((c + 0.5 - f.cx) / (f.rx + out)) ** 2 + ((r + 0.5 - f.cy + lift) / (f.ry + out)) ** 2 <= 1;
  const fall = (cx, w0, w1, r0) => H?.fall && (K.stage === 'back' || f.facing === 'up') && m2bTaper(G, r0, f.cy + H.fall, cx, w0, w1, hr, { tex, ny: -0.3, bulge: 1 });
  if (K.stage === 'back') {
    if (f.facing === 'side') fall(f.cx - f.rx * 0.45, f.rx * 0.6, (H?.fallW ?? f.rx) * 0.6, f.cy - 2);
    else if (H?.fall) fall(f.cx, f.rx + out - 1, H.fallW ?? f.rx + 1, f.cy - 4);
    return f;
  }
  if (f.facing === 'up') {
    fall(f.cx, f.rx + out - 1, H?.fallW ?? f.rx, f.cy - 2);
    if (o.ears) m2bEars(G, f, o.ears, false);
    if (H) m2bVol(G, f.cy - f.ry - out - lift, f.cy + f.ry, f.cx - f.rx - out, f.cx + f.rx + out, (r, c) => capIn(r, c) && r < f.cy + f.ry - 2, (r, c) => {
      const [nx, ny] = [(c + 0.5 - f.cx) / (f.rx + out), (r + 0.5 - f.cy + lift) / (f.ry + out)];
      return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
    }, hr, { tex, bias: 0.2 });
    else m2bBall(G, f.cy, f.cx, f.ry, f.rx, M2B.skin);
    if (o.ears === 'point') m2bEars(G, f, o.ears, false);
    return f;
  }
  if (f.facing === 'side') {
    fall(f.cx - f.rx * 0.45, f.rx * 0.6, (H?.fallW ?? f.rx) * 0.6, f.cy - 2);
    m2bBall(G, f.cy, f.cx, f.ry, f.rx, M2B.skin, { bias: 0.2 });
    m2bProfile(G, f.eye, f.cx + f.rx, { shut: f.shut, ...o.faceSide, ...o.face });
    if (H) {
      const front = (r) => (r < f.eye - (H.fringe ?? 4) ? f.cx + f.rx - 3 : f.cx - 2 + (r < f.eye + 4 ? 1 : 0));
      m2bVol(G, f.cy - f.ry - out - lift, f.cy + f.ry, f.cx - f.rx - out, f.cx + f.rx + out, (r, c) => capIn(r, c) && c <= front(r) && r < f.cy + (H.side ?? 6), (r, c) => {
        const [nx, ny] = [(c + 0.5 - f.cx) / (f.rx + out), (r + 0.5 - f.cy + lift) / (f.ry + out)];
        return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
      }, hr, { tex, open: 'b' });
    }
    if (o.ears) m2bEars(G, f, o.ears, true);
    return f;
  }
  if (H?.fall) fall(f.cx, f.rx + out - 1, H.fallW ?? f.rx + 1, f.cy - 4);
  if (o.ears && o.ears !== 'point') m2bEars(G, f, o.ears, false);
  m2bBall(G, f.cy, f.cx, f.ry, f.rx, M2B.skin, { bias: 0.22 });
  if (o.ears === 'point') m2bEars(G, f, o.ears, false);
  if (o.front) o.front(G, f); else m2bFace(G, f.eye, f.cx, { gap: f.gap, shut: f.shut, ...o.face });
  if (H) {
    const fr = H.fringe ?? 4;
    const sideDrop = H.side ?? 6;
    const fringe = (c) => {
      const d = Math.abs(c + 0.5 - f.cx);
      const edge = d > f.rx - 4 ? (d - (f.rx - 4)) * 2.2 : 0;
      return f.eye - fr + (H.sweep ?? 0.12) * d + Math.min(edge, sideDrop + fr) + ((c * 5) % 3 === 0 ? 1 : 0);
    };
    m2bVol(G, f.cy - f.ry - out - lift, f.cy + f.ry, f.cx - f.rx - out, f.cx + f.rx + out, (r, c) => capIn(r, c) && r < fringe(c), (r, c) => {
      const [nx, ny] = [(c + 0.5 - f.cx) / (f.rx + out), (r + 0.5 - f.cy + lift) / (f.ry + out)];
      return [nx, ny, Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny))];
    }, hr, { tex, open: 'b' });
  }
  return f;
}

// A beard from below the nose: a mass of locks from the cheeks to rows rows below the lashes, w wide at its top and
// narrowing to its tip, the mouth showing through as a dark line unless covered. Seen from the side it hangs from the
// jaw forward of the ear.
function m2bBeard(G, f, o = {}) {
  const ramp = o.ramp ?? M2B.hair;
  const len = o.len ?? 14;
  const w = o.w ?? f.rx;
  const tex = o.tex ?? m2bStrands(2, 0.3);
  if (f.facing === 'up') { if (o.back) m2bTaper(G, f.cy + 2, f.cy + 6, f.cx, w - 1, w, ramp, { tex }); return; }
  if (f.facing === 'side') {
    m2bPoly(G, [[f.eye + 3, f.cx - 1], [f.eye + 4, f.cx + f.rx + 1], [f.eye + len, f.cx + f.rx * 0.6], [f.eye + len - 2, f.cx - 3]], ramp, { tex });
    if (o.mouth !== false) m2bAt(G, f.eye + 7, f.cx + f.rx - 3, 'vv');
    return;
  }
  const top = f.eye + (o.from ?? 4);
  m2bRows(G, top, f.eye + len, (r) => {
    const t = (r - top) / Math.max(1, len);
    const half = r < f.eye + 6 ? w : w * (1 - t ** (o.point ?? 1.6) * 0.75);
    // The beard's top runs up the cheeks at its sides and leaves the lip clear in the middle.
    return [Math.round(f.cx - half), Math.round(f.cx + half) - 1];
  }, ramp, { tex, only: (r, c) => !(r < f.eye + 7 && Math.abs(c + 0.5 - f.cx) < (o.lip ?? 5) && r < f.eye + 6 + (o.lipDrop ?? 0)) });
  if (o.mouth !== false) m2bAt(G, f.eye + 7, Math.round(f.cx) - 2, 'vvvv');
  if (o.moustache !== false) m2bPut(G, f.eye + 6, Math.round(f.cx) - 5, [o.moustache ?? 'abccc..cccba'.slice(0, 10)]);
}
