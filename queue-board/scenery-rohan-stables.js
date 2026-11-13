// scenery-rohan-stables.js: the stables of Rohan in the Middle-earth view, in 32-bit (a quarter unit a pixel), along the
// realm's left edge behind the back row (rohanSite's sx0 to sx1): a long low barn of timber boards under a roof of straw
// thatch, an open bay stacked with hay where the Men fork up an armful, two stalls behind half doors with a horse
// looking out over one, a hitching post in front where a horse is tied to be groomed, and a lantern by the door that
// burns at night. Gollum hides behind its east end (rohanHide, for scene-gollum.js). scenery-land.js paints it into the
// realm's layer with Meduseld (scenery-rohan.js). Loaded after scenery-rohan.js.

const ROHAN_STRAW = ['#4e3a18', '#7a6028', '#a48838', '#c8ad52', '#e2cc78', '#f6e8a8'];
// The horse looking out of the stall, facing east: a bay with a white blaze, its ear up and its chin on the door.
const ROHAN_STALL_HORSE = ['...oo.......', '..oCCo......', '..oCCCoo....', '.oCCCCCCoo..', 'oNCCCCCwCCo.', 'oNCCkCCwwCCo',
  'oNNCCCCCwCCo', '.oNNCCCCCwCo', '..oNNCCCCCCo', '...oNNCCCcco', '...oNNNoooo.', '...oNNNo....'];
const ROHAN_STALL_PAL = { o: '#231914', C: '#8a5a32', N: '#3a2416', w: '#f2ece0', k: '#160d14', c: '#5e3a24' };

// The barn, painted into the layer: its roof, its walls of boards between dark posts, the hay bay, the two stalls and
// their half doors braced with a cross, a shadow along its foot, the horse in the first stall, the lantern's bracket and
// the hitching post.
function rohanStables(g, r) {
  const { sx0, sx1 } = rohanSite(r);
  const G = GROUND_Y;
  const bays = [[sx0 + 1, sx0 + 8.5, 'hay'], [sx0 + 10, sx0 + 17, 'stall'], [sx0 + 19, sx0 + 26, 'stall']];
  rohanPaint(g, sx0 - 1, G - 12, sx1 - sx0 + 2, 16.75, (X, Y, i, j) => {
    // The roof: a trapezoid of thatch from the eaves to the ridge, in courses, lit to the west.
    const hw = (sx1 - sx0) / 2 - 3 + ((Y - (G - 11)) * 4) / 7.5;
    const mid = (sx0 + sx1) / 2;
    const dx = X - mid;
    if (Y >= G - 11 && Y < G - 3.5) {
      if (Math.abs(dx) > hw + 1) return null;
      if (Y < G - 10.75) return ROHAN_STRAW[1];
      if (Y >= G - 3.75) return ROHAN_STRAW[0];
      if (hw + 1 - Math.abs(dx) < 0.25) return ROHAN_STRAW[1];
      const course = (Y - G + 10.75) % 1.25;
      let t = (dx < 0 ? 0.62 : 0.45) + (course < 0.25 ? 0.2 : course > 1 ? -0.2 : 0);
      t += (qdHash(i, Math.floor((Y - G) / 1.25) + 50) - 0.5) * 0.35;
      return rohanPick(ROHAN_STRAW, t, i, j);
    }
    if (Y < G - 3.5 || X < sx0 || X >= sx1) return null;
    if (Y >= G + 4) return Y < G + 4.25 ? ROHAN_WOOD[0] : null;
    for (const [a, b, kind] of bays) {
      if (X < a || X >= b || Y < G - 2.5) continue;
      if (X < a + 0.25 || X >= b - 0.25 || Y < G - 2.25) return ROHAN_WOOD[1];
      if (kind === 'hay') {
        const heap = G + 0.5 - Math.sin(((X - a) / (b - a)) * Math.PI) * 1.5;
        if (Y < heap) return Y < G - 1 ? '#140c08' : '#1e140e';
        return rohanPick(ROHAN_STRAW, 0.85 - (Y - heap) * 0.12 + (qdHash(i * 2, j) - 0.5) * 0.4, i, j);
      }
      if (Y < G + 0.75) return Y < G - 1 ? '#140c08' : '#1e140e';
      const [u, v] = [(X - a) / (b - a), (Y - G - 0.75) / 3.25];
      if (Y < G + 1 || Math.abs(u - v) < 0.06 || Math.abs(u + v - 1) < 0.06) return ROHAN_WOOD[4];
      return (X * 4) % 6 < 1 ? ROHAN_WOOD[1] : rohanPick(ROHAN_WOOD, 0.62 - u * 0.15, i, j);
    }
    if (bays.some(([a, b]) => X >= a - 1 && X < a) || X >= sx1 - 1) return ROHAN_WOOD[X % 1 < 0.5 ? 2 : 1];
    if ((Y - G + 3.5) % 1.5 < 0.25) return ROHAN_WOOD[1];
    return rohanPick(ROHAN_WOOD, 0.66 - (X - sx0) * 0.008 + (qdHash(i, Math.floor(Y * 0.67)) - 0.5) * 0.18, i, j);
  });
  qdMap(g, ROHAN_STALL_HORSE, ROHAN_STALL_PAL, sx0 + 12, G - 2.25);
  qdMap(g, ['oo..', 'oKKo', '.oKo', '.oo.'], { o: '#2e2b33', K: '#5a6078' }, sx1 - 1.5, G - 3.25);
  const post = rohanTie(r).post;
  pxBox(g, post, G + 1.5, 0.5, 7, ROHAN_WOOD[4]);
  pxBox(g, post + 0.5, G + 1.5, 0.25, 7, ROHAN_WOOD[2]);
  pxBox(g, post - 0.25, G + 1.25, 1.25, 0.25, ROHAN_WOOD[5]);
  qdMap(g, ['.oo.', 'o..o', '.oo.'], { o: ROHAN_GOLD[1] }, post - 0.25, G + 2);
}

// Where a horse is tied to be groomed: its middle (x, y), facing east, its nose by the hitching post, and the place in
// front of its barrel where the groom stands.
function rohanTie(r) {
  const { sx0 } = rohanSite(r);
  return { x: sx0 + 13, y: GROUND_Y + 8, post: sx0 + 25, groom: { x: sx0 + 12, y: GROUND_Y + 10, face: 1 } };
}

// The lantern by the stables' door at night: a small warm light with a pool on the ground below it.
function rohanStableLight(g, G, r, dark) {
  const x = rohanSite(r).sx1 - 0.75;
  G.draw(g, x, GROUND_Y - 2.5, 3.5, '#ffc45a', 0.7 * dark, { flame: r.x0 + 37, pool: [x, GROUND_Y + 5, 4] });
  if (dark > 0.4) pxBox(g, x - 0.25, GROUND_Y - 2.75, 0.5, 0.5, '#fff3c4');
}

// Gollum's hiding place in Rohan (scene-gollum.js's golPlace): behind the stables' east end, peeking round its corner,
// coming out onto the open ground beyond it. cut(points) makes the clip that hides what is behind the barn's outline.
function rohanHide(r, cut) {
  const { sx0, sx1 } = rohanSite(r);
  const G = GROUND_Y;
  return { hide: [sx1 - 3, G + 1], peek: [sx1 + 0.75, G + 1], exit: [sx1 + 4, G + 6], behind: (x, y) => y < G + 4 && x > sx0 - 1 && x < sx1 + 1,
    clip: cut([[sx0 - 1, G + 4.25], [sx0 - 1, G - 3.5], [sx0 + 4, G - 11], [sx1 - 4, G - 11], [sx1 + 1, G - 3.5], [sx1 + 1, G + 4.25]]) };
}
