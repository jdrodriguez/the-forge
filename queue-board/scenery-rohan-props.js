// scenery-rohan-props.js: where Rohan's props go in the Middle-earth view and how the paddock, its trough and the training
// yard's straw man look, in 32-bit (a quarter unit a pixel). realmProps (scenery-props.js) calls PROP_MORE.man, which
// makes the stables and Meduseld's hill solid ground and places: the places a Man stands at the basin by the stair, at
// the hay bay and beside a horse tied at the stables (rohanTie); the paddock in the lower band left of the front row,
// with its gate and its trough on the side toward the stations; the straw man of the training yard on the open ground;
// and the pile of sacks and the cart. A prop that finds no room is left out, and so is the work that needs it. drawProp
// draws the paddock's front fence and the straw man through PROP_DRAW; scene-rohan-horses.js draws the paddock's back
// and side fences, the trough and the horses as depth-sorted items, so the horses stand between the fences. Loaded after
// scenery-farm.js.
const ROHAN_PAD_H = 15;

PROP_MORE.man = (r, P, fit, outs, desks) => {
  const { mx, sx0, sx1 } = rohanSite(r);
  const G = GROUND_Y;
  const solid = (b) => { outs.push(b); desks.push(b); P.solid.push(b); };
  solid([sx0 - 1, G - 12, sx1 + 1, G + 4.5]);
  solid([mx - 22, G - 9, mx + 22, G + 4.5]);
  const stand = (s) => { const b = [s.x - 3, s.y - 12, s.x + 3, s.y + 1]; outs.push(b); desks.push(b); return s; };
  P.basin = stand({ x: mx + 2, y: G + 5, face: 1 });
  P.hay = stand({ x: sx0 + 3, y: G + 5, face: 1 });
  const tie = rohanTie(r);
  outs.push([tie.x - 12, G - 10, tie.post + 1, tie.y + 1]);
  P.groom = stand(tie.groom);
  P.tie = tie;
  P.paddock = rohanPaddock(r, P, outs, desks);
  P.dummy = fit('dummy', 7, 11, PROP_MID, [...xsFrom(mx + 4, r.x0 + r.w - 9), ...xsFrom(mx - 4, r.x0 + 2)], 6);
  P.pile = fit('sacks', 9, 5, G + 5, [...xsFrom(mx + 23, r.x0 + r.w - 11), ...xsFrom(mx - 32, sx1 + 2)], 6);
  P.cart = fit('cart', 13, 8, PROP_MID, xsFrom(r.x0 + r.w - 15, r.x0 + 2), 6);
};

// The paddock: from the realm's left edge to 15 units short of the first front-row station (or the realm's right
// edge), at most 64 wide and left out under 38; its gate and its trough's place on its right side, the trough inside
// against that side, and the air over it kept clear for the horses' heads.
function rohanPaddock(r, P, outs, desks) {
  const front = sc.stations.filter((s) => s.realm === r && !s.sentry && s.y > PROP_MID).map((s) => s.x - 15);
  const x = r.x0 + 2;
  const w = Math.min(64, Math.min(r.x0 + r.w - 9, ...front) - x);
  if (w < 38) return null;
  const base = FARM_LOW;
  const y = base - ROHAN_PAD_H + 1;
  const gate = { x: x + w + 3, y: y + 7, face: -1 };
  const water = { x: x + w + 3, y: base - 1, face: -1 };
  const p = { type: 'paddock', x, y, w, h: ROHAN_PAD_H, base, side: 1, spot: gate, spots: [gate, water], gate, water,
    trough: { x: x + w - 9.5, y: base - 3 }, inside: { x0: x + 12, x1: x + w - 13, y0: y + 6, y1: base - 1 } };
  outs.push([x, PROP_MID - 8, x + w, base]);
  desks.push([x, y, x + w, base]);
  for (const s of p.spots) { outs.push([s.x - 3, s.y - 12, s.x + 3, s.y + 1]); desks.push([s.x - 3, s.y - 12, s.x + 3, s.y + 1]); }
  P.list.push(p);
  return p;
}

// A fence post a unit wide with its foot on row y, h tall, lit on its left, with a pale cut top.
function rohanPost(g, x, y, h) {
  pxBox(g, x, y - h, 0.5, h, ROHAN_WOOD[4]);
  pxBox(g, x + 0.5, y - h, 0.25, h, ROHAN_WOOD[2]);
  pxBox(g, x + 0.75, y - h, 0.25, h, ROHAN_WOOD[1]);
  pxBox(g, x, y - h, 0.75, 0.25, ROHAN_WOOD[5]);
}
// A run of fence along row y from x0 to x1: posts every eight units or so and two rails, lit along their tops.
function rohanRails(g, x0, x1, y) {
  for (const ry of [y - 3.25, y - 1.75]) {
    pxBox(g, x0, ry, x1 - x0, 0.25, ROHAN_WOOD[5]);
    pxBox(g, x0, ry + 0.25, x1 - x0, 0.25, ROHAN_WOOD[3]);
    pxBox(g, x0, ry + 0.5, x1 - x0, 0.25, ROHAN_WOOD[1]);
  }
  const n = Math.max(1, Math.round((x1 - x0) / 8));
  for (let k = 0; k <= n; k += 1) rohanPost(g, Math.round(x0 + ((x1 - x0 - 1) * k) / n), y, 4.25);
}
// A side of the paddock seen end on: its rails as a strip running back from the front post to the back one, with a
// post in the middle; on the gate side, a gap where the gate stands open while a horse goes in or out.
function rohanSide(g, x, y0, y1, open) {
  const strip = (a, b) => { pxBox(g, x + 0.25, a - 3.25, 0.25, b - a, ROHAN_WOOD[3]); pxBox(g, x + 0.5, a - 3.25, 0.25, b - a, ROHAN_WOOD[1]); };
  const mid = Math.round((y0 + y1) / 2);
  if (open) { strip(y0, y0 + 1); strip(mid + 1.5, y1); } else strip(y0, y1);
  rohanPost(g, x, y0, 4.25);
  rohanPost(g, x, mid + (open ? 1.5 : 0), 4.25);
  if (open) for (let k = 0; k < 6; k += 1) pxBox(g, x + 1 + k * 0.5, mid - 3 + k * 0.25, 0.5, 0.25, k % 2 ? ROHAN_WOOD[3] : ROHAN_WOOD[4]);
}
// The back of the paddock, behind the horses: its back fence and both sides.
function rohanPaddockBack(g, p, open) {
  rohanRails(g, p.x, p.x + p.w, p.y + 4);
  rohanSide(g, p.x, p.y + 4, p.base, false);
  rohanSide(g, p.x + p.w - 1, p.y + 4, p.base, open);
}
// The front fence, in front of the horses (drawProp).
PROP_DRAW.paddock = (g, p) => rohanRails(g, p.x, p.x + p.w, p.base);

// The trough inside the gate side: a box of planks on short legs, full of water (with a glint) or hay when filled, the
// level dropping as the horses take it.
function rohanTrough(g, p, trough) {
  const { x, y } = p.trough;
  const hay = trough.hay > 0;
  const fill = Math.max(trough.hay, trough.water);
  pxBox(g, x, y - 2.5, 8, 0.25, ROHAN_WOOD[0]);
  if (fill > 0) {
    const top = y - 2.25 + (1 - Math.min(1, fill / ROHAN_FEED)) * 0.75;
    pxBox(g, x + 0.25, top, 7.5, 0.5, hay ? ROHAN_STRAW[4] : '#6fb6f0');
    for (let k = 0; k < 7; k += 1) qdDot(g, x + 0.5 + k + (hay ? (k % 2) * 0.25 : 0), top, hay ? (k % 2 ? ROHAN_STRAW[5] : ROHAN_STRAW[2]) : k === 2 ? '#ffffff' : '#9fd0ff');
  }
  pxBox(g, x, y - 1.75, 8, 1.5, ROHAN_WOOD[3]);
  pxBox(g, x, y - 1.75, 8, 0.25, ROHAN_WOOD[5]);
  pxBox(g, x, y - 0.5, 8, 0.25, ROHAN_WOOD[1]);
  for (const lx of [x + 0.5, x + 6.75]) pxBox(g, lx, y - 0.25, 0.75, 0.5, ROHAN_WOOD[1]);
  pxBox(g, x, y - 1.75, 0.25, 1.5, ROHAN_WOOD[0]);
  pxBox(g, x + 7.75, y - 1.75, 0.25, 1.5, ROHAN_WOOD[0]);
}
// How long a trough's water or hay lasts, in ticks of the horses taking it.
const ROHAN_FEED = 160;

// The straw man of the training yard, 7 by 11 units: a sack head with a stitched face on a post, a bundle of straw for a
// body bound with rope, straw arms out on a crossbar, standing in a patch of trampled sand.
const ROHAN_DUMMY_PAL = { ...propRamp6('#d8b85a', 'ABCDEo'), ...propRamp6('#c8b48a', 'abcdeO'), ...propRamp6('#8a5a32', 'pqrsuP'),
  k: '#2a1c12', y: '#e4d29a', Y: '#cbb57c' };
function rohanDummyArt() {
  const G = propGrid(28, 44);
  G.ball(42, 14, 1.6, 13, 'yyYYY');
  G.rect(10, 13, 32, 3, (r, c) => 'pqr'[c - 13]);
  G.rect(14, 2, 2, 24, (r) => (r === 14 ? 'q' : 's'));
  G.ball(15, 3, 1.6, 2.4, 'ABCDE', 0.6, 3).ball(15, 25, 1.6, 2.4, 'ABCDE', 0.6, 9);
  G.ball(23, 14, 8, 6, 'ABCDE', 0.8, 5);
  G.rect(24, 8, 1, 12, 's');
  for (const c of [10, 14, 18]) G.put(31, c, 'D').put(32, c, 'E');
  G.ball(7, 14, 5, 5, 'abcde', 0.3, 7).put(6, 12, 'k...k').put(9, 12, 'k.k.k');
  G.edge((k) => (/[a-e]/.test(k) ? 'O' : /[pqrsu]/.test(k) ? 'P' : /[yY]/.test(k) ? '.' : 'o'));
  return G.rows();
}
// The straw man, shaken a quarter unit while it is being hit (st.dummyHit, scene-rohan.js).
PROP_DRAW.dummy = (g, p, st, tick) => {
  const shake = st.dummyHit > tick - 3 ? (tick % 2 ? 0.25 : -0.25) : 0;
  propArt(g, 'rohandummy', ROHAN_DUMMY_PAL, rohanDummyArt, p.x + shake, p.y);
};
