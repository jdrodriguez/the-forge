// sprites-wanderers-gear.js: what the wise wanderers of sprites-wanderers.js and sprites-wanderers-folk.js hold, in
// sprites.js's shared TOOLS registry (sprites-gear.js's drawTool looks a tool up there first). Treebeard works and fights
// with a staff of living wood with leaves sprouting from it; Tom Bombadil works with a water-lily on its long stem and
// fights with a knobbly hazel stick; Beorn swings his woodsman's axe. Each is drawn raised, in between (with the swing's
// pale smear, as sprites-gear.js draws its own) and striking, composed once at 32-bit with sprites-gear.js's gearGrid and
// kept. No image files. Loaded after sprites-wanderers-folk.js.

// The colours beyond sprites-gear.js's GEAR_PX: living wood a, c, d, g, v (outline to shine); leaves w, y, C, D, F; the
// lily's petals T, O, H, G (outline to white) and its heart Z, Y.
const WAN_GEAR = { ...GEAR_PX, a: '#2e2a1c', c: '#5a5236', d: '#857c55', g: '#b0a676', v: '#d8d0a0', w: '#1f3d17', y: '#33662a',
  C: '#4f9a3a', D: '#86c95a', F: '#c8ef9a', T: '#8a6a80', O: '#d9b8cc', H: '#f4e6ee', G: '#ffffff', Z: '#e0a020', Y: '#ffd84a' };

// Registers a tool drawn raised (art[0]), in between (art[1], with a smear) and striking (art[2]), each a gearGrid
// built on first use, at the hand drawFigure gives.
function wanTool(name, art) {
  const done = [];
  TOOLS[name] = (g, x, y, up, mid) => {
    const k = up ? 0 : mid ? 1 : 2;
    done[k] ??= art[k]().done();
    const [rows, dx, dy] = done[k];
    if (k === 1) {
      const alpha = g.globalAlpha;
      g.globalAlpha = alpha * 0.5;
      gearMap(g, rows, GEAR_SMEAR[0], x + dx, y + dy);
      g.globalAlpha = alpha * 0.25;
      gearMap(g, rows, GEAR_SMEAR[1], x + dx, y + dy);
      g.globalAlpha = alpha;
    }
    gearMap(g, rows, WAN_GEAR, x + dx, y + dy);
  };
}
// A tool's three frames from its upright grid: as it is, turned halfway down with a smear of radius rad, and turned
// level for the strike.
const wanSwing = (grid, rad) => [grid, () => gearSmear(gearGrid(), rad, -1.5, -0.85).turn(grid(), Math.PI / 4), () => gearGrid().turn(grid(), Math.PI / 2, 4)];

// Treebeard's staff of living wood: pale bark with knots and a green tinge, a twig with leaves from its side, and a
// crown of leaves where it was broken from the tree.
function wanLivingStaff() {
  const G = gearGrid();
  for (let r = -15; r < 10; r += 1) G.put(r, 0, r % 7 === 3 ? 'adca' : r % 5 === 1 ? 'vgdc' : 'gddc');
  G.all(-4, -1, ['a', 'ca', 'dca']);
  qdWalk(-9, 4, -12, 7, (r, c) => G.put(r, c, 'gc'));
  G.all(-14, 6, ['.yC.', 'yDCw', 'wCyw', '.ww.']);
  qdWalk(-15, 1, -19, -2, (r, c) => G.put(r, c, 'gc'));
  qdWalk(-15, 2, -20, 4, (r, c) => G.put(r, c, 'dc'));
  G.all(-22, -4, ['.yC.', 'yDFw', 'wCyw', '.w..']);
  G.all(-23, 3, ['..yC', '.yDw', 'yDCw', 'wCw.']);
  return G.all(-19, 0, ['.yD.', 'yDCw', '.ww.']);
}
wanTool('livingstaff', wanSwing(wanLivingStaff, 26));

// Tom's water-lily: a white flower with a golden heart on a long green stem that bends, and a round pad on the stem.
function wanLily() {
  const G = gearGrid();
  qdWalk(3, 1, -12, 3, (r, c) => G.put(r, c, 'Dy'));
  G.all(-7, 4, ['.wCCw', 'wDDCy', 'wCCyw', '.ww..']);
  return G.all(-18, -2, ['...G..G....', '..GHGTHG...', '.THHGHHGT..', 'GHHYYYYHHG.', 'THGYZZYGHT.', '.TOHHHHOT..', '..TTOOTT...', '....yy.....']);
}
wanTool('lily', wanSwing(wanLily, 20));

// Tom's hazel stick: a knobbly brown stick, lit on its left, forking near its top.
function wanHazel() {
  const G = gearGrid();
  for (let r = -16; r < 6; r += 1) G.put(r, r < -12 ? 1 : 0, r % 6 === 0 ? '5321' : r % 6 === 3 ? '4210' : '4321');
  qdWalk(-12, 3, -16, 6, (r, c) => G.put(r, c, '31'));
  return G.all(-18, 0, ['.0', '01', '21']);
}
wanTool('hazel', wanSwing(wanHazel, 22));

// Beorn's woodsman's axe: a long haft of grained wood wrapped in leather at the grip, and a broad bearded steel head
// with a bright edge, its blade forward.
const WAN_AXE = ['.NNNNNN........', 'NLMMmnN........', 'NLMmmnNNN......', 'NLMmmnNmMNN....', 'NLMmmnNmMMLNN..', 'NMMmmnNmMMML*N.',
  'NMMmmnNnmMMML*N', 'NMmmnnNnmmMML*N', '.NNNNNNnmmMML*N', '.......NnmmML*N', '........NnmML*N', '.........NnnL*N', '..........NNNN.'];
wanTool('woodaxe', wanSwing(() => gearHaft(gearGrid(), -15, 6, 0, 5).all(-18, -1, WAN_AXE), 26));
