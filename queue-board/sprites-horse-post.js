// sprites-horse-post.js: the Sentry's post on the road's upper shoulder, at 32-bit (four pixels a unit): a hitching
// post of oak, lit on its left with grain and a knot, under a bevelled cap, on a footing of two courses of dressed stone;
// an arm out to the lantern with end grain at its tip, braced to the post; an iron ring on a staple for the horse; and a
// lantern of iron and glass hung on a strap and ring. The lantern is lit while the Ranger's ticket is under way (stage 1
// to 4, as for any station): its glass glows, its flame flickers by tick and a soft light spreads round it (scene-glow.js).
// The art is pixel maps made once in code with sprites-horse-art.js's grid; no image files. Loaded after
// sprites-horse-art.js.

// Draws the post with its foot on row y and its shaft over column x, its lantern lit from stage 1.
function drawPost(g, x, y, stage, tick) {
  const lit = stage > 0;
  const hot = tick % 6 < 3;
  const art = postArt(lit);
  haDraw(g, art.post, art.pal, x, y);
  haDraw(g, art.lamp, art.pal, x, y);
  if (!lit) return;
  // Its light is scene-glow.js's, added after the night shade: a flickering halo, brighter after dark, and at night a
  // pool on the road beneath.
  if (typeof sc !== 'undefined' && sc.glow) sc.glow.add(x + 4.5, y - 9.5, 7, '#ffc45a', 0.3 + 0.55 * sc.glow.night, { flame: x * 3 + 1, pool: [x + 4.5, y + 1, 9] });
  // The flame inside the glass, a teardrop with a white core whose tip leaps higher on alternate beats.
  qdMap(g, POST_FLAME[hot ? 1 : 0], POST_FIRE, x + 3.75, y - 10.25);
}
const POST_FIRE = { o: PX.ember, y: PX.emberL, w: '#fff3c4', W: '#ffffff' };
const POST_FLAME = [['......', '......', '..o...', '..yo..', '.oyyo.', '.ywwy.', 'oywWyo', 'oywwyo', '.oyyo.', '..oo..'],
  ['...o..', '..oy..', '..yyo.', '.oywo.', '.ywwyo', 'oywWwy', 'oywWyo', 'oywwyo', '.oyyo.', '..oo..']];

// The post and its lantern, unlit or lit, made once each: x outline, l L w v V oak (highlight, light, base, shade,
// deep), u grain, e end grain, t s T stone (light, base, shade) with m mortar and X its outline, i j I iron (light, mid,
// dark), a A glass (and its sheen), dark or glowing. Places are in quarter units from the post's column and row.
const POST_ARTS = [];
function postArt(lit) {
  if (POST_ARTS[+lit]) return POST_ARTS[+lit];
  const G = haGrid(-7, -60, 33, 64);
  const put = (X, Y, ...rows) => haPut(G, X, Y, rows);
  // The shaft, lit on its left, with grain and a knot, under a bevelled cap, flaring onto its footing.
  put(-1, -60, 'xxxxxxxx');
  put(-2, -59, 'xllLLwvVx', 'xlLwwwvVx');
  const grain = [[1, -52, -45], [3, -40, -33], [4, -55, -50], [2, -28, -21], [4, -16, -9], [1, -12, -6]];
  for (let Y = -57; Y < -4; Y += 1) {
    const row = [...'xlLwwwvVx'];
    grain.forEach(([c, a, b]) => { if (Y >= a && Y <= b) row[c + 1] = 'u'; });
    put(-2, Y, row.join(''));
  }
  put(1, -31, '.uu.', 'uLvu', 'uvVu', '.uu.');
  put(-3, -5, 'xxlLwwwvVxx');
  // The arm out to the lantern, lit along its top, with end grain at its tip, and the brace under it.
  put(7, -56, 'x'.repeat(18), `x${'l'.repeat(16)}x`);
  for (let Y = -54; Y <= -51; Y += 1) put(7, Y, `V${Y === -52 ? 'wwuuwwwwwwuuuwww' : 'w'.repeat(16)}x`);
  put(7, -50, `V${'v'.repeat(16)}x`, 'x'.repeat(18));
  put(23, -55, 'lx', 'ex', 'Lx', 'ex', 'vx', 'Vx');
  for (let t = 0; t < 8; t += 1) put(7 + (t >> 1), -42 - t, t === 7 ? 'xLv' : 'xLvx');
  // The iron ring on its staple, for the horse.
  put(-4, -34, 'IIx');
  put(-7, -33, '.iI.', 'i..I', 'i..I', 'I..I', '.II.');
  // The footing: two courses of dressed stone with mortar between, lit along the top.
  const course = (Y0, joints) => {
    for (let Y = Y0; Y < Y0 + 4; Y += 1) {
      let s = '';
      for (let X = -6; X <= 13; X += 1) {
        const shade = joints.includes(X + 1) || X === 12 || Y === Y0 + 3;
        s += X === -6 || X === 13 || Y === 3 ? 'X' : joints.includes(X) ? 'm' : Y === Y0 ? 't' : shade ? 'T' : 's';
      }
      put(-6, Y, s);
    }
  };
  course(-4, [3]);
  course(0, [-1, 7]);
  put(-6, -4, `X${'t'.repeat(18)}X`);
  // The lantern on a strap round the arm: a ring, a cap with a finial, glass in an iron frame and a base.
  const L = haGrid(10, -52, 16, 24);
  const glass = lit ? 'xiAaaaaaIx' : 'xiaaaaaaIx';
  haPut(L, 10, -52, ['......xIIx', '......xiIx', '......xiIx', '.......xx.', '......x..x', '.......xx.', '.......iI.', '......xiIx',
    '.....xiiIIx', '....xiiiIIjx', '...xiiiiIIjjx', '..xIIIIIIIIIIx', '..xjjjjjjjjjjx', ...Array(8).fill(`...${glass}`),
    '..xIIIIIIIIIIx', '...xjjjjjjjjx', '.....xxxxxx']);
  haPut(L, 15, -39, lit ? ['A', 'A', 'A'] : ['.A', 'A.', '..', '..', '.A']);
  const pal = { x: '#2a1a0e', l: '#c08a52', L: '#9a6a3c', w: PX.wood, v: PX.woodD, V: '#3f2614', u: '#5e3c20', e: '#a87a4a',
    t: '#c4c0b8', s: PX.stone, T: PX.stoneD, m: '#4a4644', X: '#2e2b2a', i: '#8a8594', j: '#4a4652', I: '#34313c',
    a: lit ? '#ffcf5a' : '#3c4660', A: lit ? '#fff1a8' : '#6c7894' };
  POST_ARTS[+lit] = { post: haPart(G), lamp: haPart(L), pal };
  return POST_ARTS[+lit];
}
