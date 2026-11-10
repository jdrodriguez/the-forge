// scene2-isengard-orthanc.js: black Orthanc in the middle of the Circle of Isengard (scene2-isengard.js), seen from
// overhead. Four great piers of many-sided rock fused into one tower 14 units wide, ridged down its length and gleaming
// black, lit on its west faces from the upper left; cleft at the top into four horns keen as spear blades, two behind
// and two in front, round a flat top where Saruman stands at its centre (plan.places.orthancTop). A broad stair of
// many steps climbs its south face to the dark arched door, and one window high up burns red at night.

const M2_ORTH = { w: 18, body: 26, top: 4.5, horn: 9.5, stair: 4 };
const M2_ORTH_ROCK = ['#030305', '#0a0a0f', '#121219', '#1b1b24', '#262631', '#343442', '#4a4a5c', '#6e7088', '#9ea2bc'];

// The tower's half width (units) at height u above its foot: a flared foot, then a slow taper up to the top.
const m2OrthHalf = (u) => 6.3 + 0.5 * (1 - u / M2_ORTH.body) + Math.max(0, 1 - u / 2.5) * 0.9;

// A horn: a keen many-sided spike standing on the top's rim at hx, its foot at height base, tall units high, leaning
// out by lean at its tip; lit on its west faces with a gleam down its ridge.
function m2OrthHorn(x, u, hx, base, tall, lean, w) {
  const t = (u - base) / tall;
  if (t < 0 || t > 1) return null;
  const half = w * (1 - t) ** 0.85;
  const mid = hx + lean * t * t;
  const d = x - mid;
  if (Math.abs(d) > half) return null;
  const R = M2_ORTH_ROCK;
  if (Math.abs(d) > half - 0.26) return R[0];
  if (Math.abs(d + half * 0.25) < 0.14) return R[8];
  return R[d < -half * 0.25 ? 6 : d < half * 0.35 ? 4 : 2];
}

// One pixel of the tower, in a canvas w units wide whose top is horn + top + body units above its foot row.
function m2OrthPx(px, py) {
  const { w, body, top, horn, stair } = M2_ORTH;
  const R = M2_ORTH_ROCK;
  const x = (px + 0.5) / 4 - w / 2;
  const u = horn + top + body - (py + 0.5) / 4;
  const tw = m2OrthHalf(body);
  // The two horns at the back of the top, behind its flat.
  const back = m2OrthHorn(x, u, -tw + 2.2, body + top - 1, horn - 1.5, -0.9, 1.5) ?? m2OrthHorn(x, u, tw - 2.2, body + top - 1, horn - 1.5, 0.9, 1.5);
  // The flat top between the four horns, seen from above: dark polished stone, lit toward its west, with a ring of
  // paler stone round its middle where Saruman stands, and its front lip.
  const front = m2OrthHorn(x, u, -tw + 1.1, body - 0.6, horn, -1.4, 1.8) ?? m2OrthHorn(x, u, tw - 1.1, body - 0.6, horn, 1.4, 1.8);
  if (front) return front;
  if (u >= body && u < body + top) {
    const ny = (u - body - top / 2) / (top / 2);
    const nx = x / (tw - 0.2);
    if (nx * nx + ny * ny * 0.35 <= 1) {
      if (u < body + 0.35) return R[2];
      if (nx * nx + ny * ny * 0.35 > 0.86) return R[3];
      const ring = Math.abs(Math.hypot(x / 2.6, (u - body - top / 2) / 1.2) - 1) < 0.14;
      if (ring) return R[6];
      return R[nx < -0.3 ? 5 : nx < 0.4 ? 4 : 3];
    }
  }
  if (back) return back;
  if (u >= 0 && u < body) {
    const half = m2OrthHalf(u);
    if (Math.abs(x) > half) return null;
    const v = x / half;
    // Two windows high up (one burning red at night), and the door at the stair's head.
    if (Math.abs(x - 1.2) < 0.5 && u > 19.5 && u < 21.8) return u > 21.2 ? R[0] : '#4a0c08';
    if (Math.abs(x + 2.8) < 0.35 && u > 14 && u < 15.6) return R[0];
    const door = Math.abs(x) < 1.6 && u < stair + 6.4 - (1 - Math.sqrt(Math.max(0, 1 - (x / 1.6) ** 2))) * 1.3 && u >= stair - 0.2;
    if (door) return Math.abs(x) > 1.25 || u > stair + 5.8 ? R[5] : R[0];
    if (Math.abs(x) < 2.3 && u >= stair - 0.2 && u < stair + 7.1 && Math.abs(x) > 1.6) return R[x < 0 ? 6 : 4];
    if (Math.abs(v) > 0.975) return R[0];
    // Four piers fused into one, each of many sides: eleven narrow faces across, the west ones lit, the grooves where
    // the piers meet deep and dark, the east faces in shade.
    const edges = [-1, -0.78, -0.6, -0.5, -0.3, -0.1, -0.02, 0.18, 0.4, 0.5, 0.7, 1];
    const tone = [6, 4, 1, 5, 3, 0, 4, 2, 0, 2, 1];
    let f = 0;
    while (f < 10 && v > edges[f + 1]) f += 1;
    let k = tone[f];
    if (Math.abs(v - edges[f]) < 0.035 && k > 1) k += 2;
    if (u < 1.2) k = Math.max(0, k - 2);
    else if (u < 3) k = Math.max(0, k - 1);
    if (u > body - 1) k += 1;
    return R[Math.min(8, k)];
  }
  return null;
}
// The stair seen from above as its own piece, in front of the tower's foot: from the door's sill down to the ground.
function m2OrthStairPx(px, py) {
  const { stair } = M2_ORTH;
  const R = M2_ORTH_ROCK;
  const W = 5.6 * 4;
  const t = py / (stair * 2 * 4);
  const half = (2.1 + t * 0.7) * 4;
  const d = Math.abs(px + 0.5 - W / 2);
  if (d > half) return null;
  if (d > half - 1.5) return R[d > half - 0.5 ? 0 : 2];
  const step = py % 4;
  return step === 0 ? R[7] : step === 1 ? R[5] : step === 3 ? R[1] : R[3 + (px < W / 2 - 3 ? 1 : 0)];
}

// Stands Orthanc with its foot round (x, y + 2.5), its stair in front, its shadow, its red window and the top for
// Saruman.
function m2IsenOrthanc(L, plan, add, x, y) {
  const { w, body, top, horn, stair } = M2_ORTH;
  const foot = y + 2.5;
  const th = horn + top + body;
  const c = m2SouthArt('orthanc', w, th, m2OrthPx);
  add.obj({ x: x - w / 2, y: foot - th, w, h: th, z: foot, c, foot: [x - 7, foot - 5, x + 7, foot], draw: (dst) => dst.drawImage(c, x - w / 2, foot - th, w, th) });
  // The stair climbs from the ground in front up the face to the door; it stands in front of the foot.
  const sc = m2SouthArt('orthancStair', 5.6, stair * 2, m2OrthStairPx);
  const [sx, sy] = [x - 2.8, foot - stair];
  add.obj({ x: sx, y: sy, w: 5.6, h: stair * 2, z: foot + stair + 0.1, c: sc, foot: [x - 3, foot, x + 3, foot + stair], draw: (dst) => dst.drawImage(sc, sx, sy, 5.6, stair * 2) });
  add.light({ x: x + 1.2, y: foot - 20.6, r: 5, c: '#ff2a12' });
  add.light({ x: x + 1.2, y: foot - 20.6, r: 2, c: '#ff8a5a' });
  plan.places.orthancTop = { x, y: foot - body - top / 2 };
}
