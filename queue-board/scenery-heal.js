// scenery-heal.js: Rivendell's healing house and lanterns in the Middle-earth view. realmProps (scenery-props.js) places
// them through PROP_MORE. The healing house goes in the lower band beside the front row of stations, clear of the falls,
// the pavilion and the archery target: a white cottage with a teal roof, a gold leaf finial and a round window, a bench
// along its front where a hurt worker sits, a stone mortar at the end its spot is on, and a bed of herbs at the other.
// Four lantern posts stand where the elves go after dark (2026-11-07: six were too many): beside the healing
// house, by the harp at the falls, at the pavilion's front corner and on the lower path toward the far side, each with
// room beside it for the elf who lights it, clear of the stations, the props, the archer's line of fire and the deer's
// grazing at the valley's far edge. drawProp draws them through PROP_DRAW; whether a lantern is lit is scene-elves.js's
// state in the realm's tally, and its glow is drawn after the night shade. All of it is 32-bit art, a quarter unit a
// pixel, lit from the upper left whichever way it faces, painted once (propArt). Loaded after scenery-elves.js.
const HEAL_W = 29;

PROP_MORE.elf = (r, P, fit, outs, desks) => {
  const H = fit('heal', HEAL_W, 16, FARM_LOW, xsFrom(r.x0 + 2, r.x0 + r.w - HEAL_W - 2), 3);
  P.heal = H;
  if (H) {
    // Columns from the mortar end: the mortar 0 to 4, the house 5 to 18 (its door 13 to 16), the herb bed 19 to 28.
    const at = (c) => (H.side > 0 ? H.x + HEAL_W - 1 - c : H.x + c);
    const toward = H.side > 0 ? 1 : -1;
    Object.assign(H, {
      bench: { x: at(9), y: H.base + 1, face: -toward },
      healer: { x: at(16), y: H.base + 1, face: toward },
      herbs: { x: at(20), y: H.base + 3, face: -toward },
    });
  }
  // The deer's pasture and the archer's line of fire stay clear of lanterns.
  outs.push([r.x0 + r.w - 30, GROUND_Y, r.x0 + r.w - 2, GROUND_Y + 12]);
  if (P.target) outs.push([Math.min(P.target.spot.x, P.target.x), PROP_MID - 9, Math.max(P.target.spot.x, P.target.x + 6), PROP_MID + 1]);
  // Four lanterns where the elves go after dark, each at the clear place nearest its mark on its row: beside the healing
  // house (far enough out that an elf at the mortar stands clear of it), by the harp at the falls, at the pavilion's front
  // corner, and on the lower path toward the far side.
  P.lamps = [];
  const mid = r.x0 + Math.floor(r.w / 2);
  const marks = [H && [H.side > 0 ? H.x + HEAL_W + 12 : H.x - 13, H.base], [P.harp.x + 8, PROP_MID], [mid + 21, GROUND_Y + 8], [r.x0 + r.w - 18, FARM_LOW]];
  for (const mark of marks.filter(Boolean)) {
    const [mx, base] = mark;
    for (const x of xsFrom(mx - 14, mx + 14).sort((a, b) => Math.abs(a - mx) - Math.abs(b - mx))) {
      const post = [x - 1, base - 11, x + 1, base];
      if (x < r.x0 + 4 || x > r.x0 + r.w - 4 || P.lamps.some((l) => Math.abs(l.x + 1 - x) < 18 && Math.abs(l.base - base) < 12)) continue;
      if (!boxClear(post, outs) || !boxClear(post, desks)) continue;
      const sx = [x - 6, x + 6, x - 5, x + 5].find((s) => s - 4 >= r.x0 && s + 4 <= r.x0 + r.w && boxClear([s - 3, base - 14, s + 3, base + 1], desks) && boxClear([s - 3, base - 14, s + 3, base + 1], outs));
      if (sx === undefined) continue;
      const lamp = { type: 'lamp', i: P.lamps.length, x: x - 1, y: base - 11, w: 3, h: 12, base, spot: { x: sx, y: base + 1, face: sx < x ? 1 : -1 } };
      P.lamps.push(lamp);
      P.list.push(lamp);
      outs.push(post, [sx - 3, base - 14, sx + 3, base + 1]);
      desks.push(post, [sx - 3, base - 14, sx + 3, base + 1]);
      break;
    }
  }
};

// The healing house, 14 units by 16, a quarter unit a pixel: a gold leaf on its finial, a flared roof of teal tiles in
// scalloped courses lit toward the left over a cream eave board, white walls in the eave's shadow with faint courses in
// the plaster, a round window of four warm panes in a ring of pale stone, a carved leaf over an arched door of dark
// planks with a gold knob, and a footing of stone blocks. flip puts the window at the right and the door at the left,
// the light still from the left.
const HOUSE_PAL = {
  G: PX.gold, g: '#b5852a', O: '#1c3a37', ...propRamp6('#4f958a', 'QRrst.'), E: '#e4dcc4', e: '#b8ae96',
  x: '#b9b2a2', w: '#ece6d6', L: '#fbf8ee', W: '#cfc6b0', y: '#ddd5c2', o: '#6e6656', q: '#5a4630', F: '#f2d27a', f: '#c9a24e', h: '#fff6d0',
  l: '#6fc28a', n: '#3f8f5a', A: '#e2dccb', a: '#b9b0a0', D: '#5a3c24', v: '#3d2818', k: PX.gold, S: '#c4bfb5', z: '#9d988f', m: '#6e6a64',
};
function houseArt(flip) {
  const G = propGrid(56, 64);
  const X = (c, w = 1) => (flip ? 56 - c - w : c);
  G.map(0, 26, ['..G.', '.GGg', 'GGgg', '.Gg.']);
  for (let r = 4; r < 28; r += 1) {
    const w = Math.round(16 + 40 * ((r - 4) / 21) ** 1.6 / 2) * 2;
    const c0 = Math.max(0, (56 - Math.min(56, w)) / 2);
    G.rect(r, c0, 1, 56 - c0 * 2, (y, c) => {
      const x = c - c0;
      if (r === 4 || r === 26 || x === 0 || x === 55 - c0 * 2) return 'O';
      if (r >= 24) return r === 24 ? 'E' : r === 25 ? 'e' : 'O';
      if (r === 27) return '.';
      const j = (r - 5) % 4;
      const hip = x < 4 ? -1 : x > 51 - c0 * 2 ? 1 : 0;
      if (j === 3) return (c + Math.floor((r - 5) / 4) * 2) % 4 < 2 ? 't' : 's';
      return 'QRrst'[Math.max(0, Math.min(4, (c < 20 ? 1 : c > 38 ? 3 : 2) + hip - (j === 0 ? 1 : 0)))];
    });
  }
  // The walls under the eave, lit at their left edge and shaded at their right.
  G.rect(27, 2, 33, 52, (r, c) => (c === 2 || c === 53 ? 'o' : r < 29 ? 'x' : c < 5 ? 'L' : c > 49 ? 'W' : (r - 29) % 6 === 5 && c % 3 ? 'y' : 'w'));
  // The round window: a ring of pale stone round four panes and a cross of dark wood.
  const wc = X(8, 9) + 4;
  G.rect(33, wc - 7, 15, 15, (r, c) => {
    const d = Math.hypot(r - 40, c - wc);
    if (d > 6.6) return undefined;
    if (d > 4.8) return r + c < 40 + wc ? 'A' : 'a';
    if (r === 40 || c === wc) return 'q';
    return r < 40 ? (r === 37 && c < wc && c > wc - 3 ? 'h' : 'F') : 'f';
  });
  // The door: an arch of pale stone round dark planks, a gold knob, and a carved leaf over it.
  const dc = X(34, 12) + 6;
  G.rect(31, dc - 8, 29, 16, (r, c) => {
    const dx = Math.abs(c + 0.5 - dc);
    const top = r < 39 ? Math.hypot(c + 0.5 - dc, r + 0.5 - 39) : dx;
    if (top > 7.5) return undefined;
    if (top > 5.5) return c < dc ? 'A' : 'a';
    return (c - dc + 8) % 3 === 0 ? 'v' : 'D';
  });
  G.put(48, flip ? dc - 4 : dc + 3, 'k').map(28, dc - 3, ['.lln..', 'llnnn.', '.nn...']);
  // The footing: stone blocks lit along their top.
  G.rect(60, 0, 4, 56, (r, c) => (r === 63 ? 'm' : c === 0 || c === 55 ? 'm' : (c + (r > 61 ? 4 : 0)) % 8 === 0 ? 'm' : r === 60 ? 'S' : 'z'));
  return G.rows();
}
// The stone mortar on its pedestal, green with crushed herbs, and its pestle.
const MORTAR = ['.oooooooooooooooooo.', 'oSSSSSssssssssssssqo', 'oSgGGGgggggggggggsqo', 'osSgGgggggggggggsqqo', '.osSsssssssssssqqqo.',
  '..osSssssssssssqqo..', '...ossssssssssqqo...', '....oossssssqqoo....', ...Array(6).fill('......osSssqqo......'),
  '.....oSSsssqqqo.....', '....oSSssssqqqqo....', '...oSSsssssqqqqqo...', '..oSSSssssssqqqqqo..', '..oooooooooooooooo..'];
const MORTAR_PAL = { o: '#4e4a44', S: '#e2ddd3', s: '#b5b0a6', q: '#857f76', g: '#6fae5a', G: '#a8dc94', P: '#ece0c0', p: '#b8a77a' };
const PESTLE = ['PP', 'Pp', 'Pp', 'Pp', 'Pp', 'pp'];
// The bed of herbs: lavender spikes and white and yellow flowers over leaves lit and shaded, edged with pale stones over
// its soil.
function herbsArt() {
  const G = propGrid(40, 16);
  G.rect(4, 0, 6, 40, (r, c) => { const n = rnd(r * 17 + c * 5); return r === 4 && n < 0.5 ? undefined : n > 0.8 ? 'b' : (r + c) % 3 === 0 ? 'd' : r > 7 ? 'd' : 'c'; });
  for (const c of [2, 15, 28, 36]) G.map(0, c, ['.V.', 'VUv', '.Vv', '.Uv', '..c', '..c']);
  for (const [c, k] of [[8, 'w'], [21, 'y'], [32, 'w'], [11, 'y'], [25, 'w']]) G.map(c % 2 ? 2 : 3, c, [`.${k}.`, `${k}${k === 'w' ? 'Y' : 'Z'}${k}`, `.${k}.`]);
  G.rect(10, 0, 3, 40, (r, c) => (c % 7 === 6 ? 'C' : r === 10 ? 'A' : r === 11 ? 'a' : 'C'));
  return G.rect(13, 0, 3, 40, (r) => (r === 15 ? 'o' : r === 13 ? 's' : 'S')).rows();
}
const HERBS_PAL = { b: '#9fd08a', c: '#5f9e5a', d: '#2f6b3c', V: '#c9b3ec', U: '#9a7fd0', v: '#6a52a0', w: '#fbf6ea', Y: '#f2c14e', y: '#f2c14e',
  Z: '#b5652a', A: '#e2ddd3', a: '#b5b0a6', C: '#857f76', s: PX.soil, S: PX.soilD, o: '#3d2818' };
// The bench: a plank lit along its top on two waisted legs.
const BENCH = ['oooooooooooooooooooooooo', 'abbbbbbbbbbbbbbbbbbbbbbc', 'cccccccccccccccccccccccd', 'oooooooooooooooooooooooo',
  '.abd................abd.', '..bd................bd..', '..bd................bd..', '.abdd..............abdd.'];
const BENCH_PAL = propRamp6('#c4a070', 'abcd.o');
// The healing house, its mortar at the end its spot is on (a pestle stands in it while no one grinds) and its bench in
// front of the window.
function drawHeal(g, p, st) {
  const m = p.side > 0;
  const col = (c, w = 1) => (m ? p.x + HEAL_W - c - w : p.x + c);
  propArt(g, `house${m}`, HOUSE_PAL, () => houseArt(m), col(5, 14), p.y);
  propArt(g, 'mortar', MORTAR_PAL, () => MORTAR, col(0, 5), p.base - 4);
  if (!st?.grinding) propArt(g, 'pestle', MORTAR_PAL, () => PESTLE, col(3) + 0.25, p.base - 5);
  propArt(g, 'herbs', HERBS_PAL, herbsArt, col(19, 10), p.base - 3);
  propArt(g, 'bench', BENCH_PAL, () => BENCH, col(6, 6), p.base - 2);
}
PROP_DRAW.heal = drawHeal;

// A lantern post: a gold finial, a silver cap and frame round panes of glass, dim until it is lit, on a slender pale
// post with a gold band and a flared foot.
const LAMP = ['.....GG.....', '....GGgg....', '....oSSo....', '...oSSSso...', '..oSSSSsso..', '.oFFFFFFffo.', '...FAAaaf...',
  '...FAaaaf...', '...Faaaaf...', '...Faaaaf...', '...Faaaaf...', '...Faaaaf...', '..oFFFFffo..', '...oSSSso...',
  ...Array(28).fill('.....Pp.....').map((s, i) => (i === 10 || i === 11 ? '....GGgg....' : s)),
  '....PPpp....', '...PPPppp...', '..PPPPpppp..', '.BBBBBbbbbb.', 'oooooooooooo', '............'];
const LAMP_PAL = [false, true].map((lit) => ({
  G: PX.gold, g: '#b5852a', S: '#e4e9ef', s: '#a9b3bf', o: '#5a6270', F: '#c9d2dc', f: '#8a95a4', P: '#f4efe2', p: '#cfc6b0', B: '#e9e3d3', b: '#b9b09c',
  a: lit ? '#ffe58a' : '#4e5c6e', A: lit ? '#fff8d8' : '#8a9aae',
}));
function drawLamp(g, p, st) {
  const lit = st?.lamps?.[p.i] ? 1 : 0;
  propArt(g, `lamp${lit}`, LAMP_PAL[lit], () => LAMP, p.x, p.y);
}
PROP_DRAW.lamp = drawLamp;

// After the night shade: each lit lantern's flame on its halo (scene-glow.js's, a steadier flicker than a fire's, growing
// through dusk) with a pool of light round the post's foot at night, and after dark the healing house's window, light
// added onto its four panes (so a worker on the bench before it is lit, not covered) fading up through dusk, with a halo
// on the wall and a pool on the ground below it. Each flame sways and stretches on its own beat; with reduced motion it
// holds still.
function drawElfLights(g, r, P, st) {
  const G = sc.glow;
  const dark = G ? G.night : Number(sc.sky.night);
  const still = typeof scReduced !== 'undefined' && scReduced.matches;
  for (const p of P.lamps ?? []) {
    if (!st.lamps?.[p.i]) continue;
    const [x, y] = [p.x + 1, p.y + 1];
    G?.draw(g, x + 0.5, y + 1.25, 7, '#ffaa48', 0.35 + 0.55 * dark, { flame: p.x + p.i * 11, wobble: 0.5, pool: [x + 0.5, p.base + 1, 8] });
    const beat = still ? 0 : (sc.tick + p.i * 4) % 9;
    pxBox(g, x, y + 0.75, 1, 1.25, '#ffd870');
    pxBox(g, x + 0.25, y + 1, 0.5, 0.75, '#ffe9a0');
    pxBox(g, x + 0.25, y + 1.25, 0.5, 0.5, '#fff8d8');
    pxBox(g, x + (beat < 4 ? 0.25 : 0.5), y + (beat ? 0.75 : 0.5), 0.25, beat ? 0.5 : 0.75, '#fffdf0');
  }
  if (P.heal && dark > 0) {
    const H = P.heal;
    const wx = H.side > 0 ? H.x + 19.75 : H.x + 7;
    if (!G) return;
    G.draw(g, wx + 1.125, H.y + 10.125, 4, '#ffc45a', 0.55 * dark, { pool: [wx + 1.125, H.base + 1.5, 6] });
    // The four panes round the window's cross, each a half unit at a time but for its outer corner, which the round
    // frame covers.
    for (const [px, py, cx, cy] of [[wx, H.y + 9, 0, 0], [wx + 1.25, H.y + 9, 0.5, 0], [wx, H.y + 10.25, 0, 0.5], [wx + 1.25, H.y + 10.25, 0.5, 0.5]]) {
      for (const [dx, dy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5]]) {
        if (dx !== cx || dy !== cy) G.pane(g, px + dx, py + dy, 0.5, 0.5, '#ffb848', 0.9 * dark, H.base);
      }
    }
    G.pane(g, wx + 0.5, H.y + 9, 0.5, 0.5, '#fff0c0', 0.6 * dark, H.base);
  }
}
