// scenery-props-qd.js: more of the 32-bit art of scenery-props.js, a quarter unit a pixel (scenery-props-hd.js has the
// rest): the mist over a realm the board can't reach, and the props in Rivendell and Rohan, registered in PROP_DRAW: the
// scroll rack, the straw target and its arrows, and the sacks of grain. Loaded after scenery-props-hd.js.

// A realm the board can't reach, or a paused one, sits under a drifting mist that thins at its edges and rolls up from
// the road over the stations: a faint fringe over a thin veil over the thick of it, its opacity rising in steps joined
// by a 4 by 4 ordered dither and its white dimming to a grey-blue below, with paler wisps drifting through. The figures
// under it keep the last report the board got; the realm's tag says how long ago that was. scene.js draws it after the
// figures and before the night and the lights. The body is painted once per realm width (mistBody) and drawn in strips
// that follow its rolling top a quarter unit at a time.
const MIST_DEEP = 74;
const MIST_BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const MIST_ALPHA = [0, 0.06, 0.11, 0.17, 0.23, 0.3, 0.38, 0.47, 0.55];
const MIST_BODY = new Map();
function mistBody(w) {
  if (MIST_BODY.has(w)) return MIST_BODY.get(w);
  const cv = document.createElement('canvas');
  cv.width = w * SC_RES;
  cv.height = MIST_DEEP * SC_RES;
  const c = cv.getContext('2d');
  const img = c.createImageData(cv.width, cv.height);
  const [hi, lo] = [hdRgb('#f4f6fb'), hdRgb('#c3c8d6')];
  for (let py = 0; py < cv.height; py += 1) {
    const d = (py + 0.5) / SC_RES;
    const f = d < 1 ? 0.6 + d * 1.6 : d < 5.5 ? 2.2 + ((d - 1) / 4.5) * 2.8 : Math.min(8, 5 + (d - 5.5) * 2);
    const col = hi.map((v, i) => Math.round(v + (lo[i] - v) * Math.min(1, d / 7)));
    for (let px = 0; px < cv.width; px += 1) {
      const x = (px + 0.5) / SC_RES;
      const edge = Math.min(1, (Math.min(x, w - x) + 0.25) / 8);
      const lv = Math.floor(f) + (f - Math.floor(f) > (MIST_BAYER[(py % 4) * 4 + (px % 4)] + 0.5) / 16 ? 1 : 0);
      const e = edge * 8 - Math.floor(edge * 8) > (MIST_BAYER[(py % 4) * 4 + ((px + 2) % 4)] + 0.5) / 16 ? Math.ceil(edge * 8) / 8 : Math.floor(edge * 8) / 8;
      const i = (py * cv.width + px) * 4;
      [img.data[i], img.data[i + 1], img.data[i + 2]] = col;
      img.data[i + 3] = Math.round(255 * MIST_ALPHA[Math.min(8, lv)] * e);
    }
  }
  c.putImageData(img, 0, 0);
  MIST_BODY.set(w, cv);
  return cv;
}
// A wisp len units long: a pale streak two or three pixels deep, fading to a dither at both ends.
const MIST_WISP = { a: 'rgba(244,246,251,0.24)', b: 'rgba(244,246,251,0.12)' };
const mistWisp = (len) => [0, 1, 2].map((row) => Array.from({ length: len * 4 }, (_, c) => {
  const t = Math.min(c, len * 4 - 1 - c) / (len * 2);
  if (row === 0) return t > 0.5 ? 'a' : t > 0.3 && c % 2 ? 'b' : '.';
  if (row === 1) return t > 0.25 ? 'a' : t > 0.08 ? (c % 2 ? 'b' : 'a') : c % 2 ? '.' : 'b';
  return t > 0.35 && c % 2 ? 'b' : '.';
}).join(''));
function drawMist(g, r, tick) {
  const body = mistBody(r.w);
  const topAt = (x) => GROUND_Y - 13 + Math.round(12 * Math.sin((x + tick * 0.4) / 9) + 8 * Math.sin((x - tick * 0.25) / 4)) / 4;
  // Runs of quarter-unit columns whose top is the same are drawn as one strip.
  for (let q = 0, n = r.w * 4; q < n;) {
    const top = topAt(r.x0 + q / 4);
    let e = q + 1;
    while (e < n && topAt(r.x0 + e / 4) === top) e += 1;
    const h = ROAD_Y + 3 - top;
    g.drawImage(body, (q * SC_RES) / 4, 0, ((e - q) * SC_RES) / 4, h * SC_RES, r.x0 + q / 4, top, (e - q) / 4, h);
    q = e;
  }
  // The wisps: pale streaks at a few heights, drifting one way and the next the other a quarter unit at a time.
  g.save();
  g.beginPath();
  g.rect(r.x0, GROUND_Y - 20, r.w, ROAD_Y - GROUND_Y + 30);
  g.clip();
  for (let i = 0; i < Math.ceil(r.w / 40) * 3; i += 1) {
    const len = 8 + (i % 3) * 3;
    const y = GROUND_Y + 2 + ((i * 7) % 6) * 8 + (i % 2) / 2;
    const at = (i * 37 + Math.floor(tick * (i % 2 ? 1.2 : -0.8)) / 4) % (r.w + len);
    propArt(g, `wisp${len}`, MIST_WISP, () => mistWisp(len), r.x0 + ((at + r.w + len) % (r.w + len)) - len, y);
  }
  g.restore();
}

// The scroll rack: a frame of pale wood with a line of gold inlaid along its top rail, three shelves of three cubbies, each dark
// inside with the shadow of the shelf and the post above and beside it, on two short legs. Its posts are lit on their
// left with a streak of grain, its shelves lit along their top edge.
const RACK_PAL = { ...propRamp6('#a07a4e', 'abcdeo'), k: '#120c09', i: '#24180f', j: '#33241a', G: '#f2c14e', g: '#b5852a' };
function rackArt() {
  const G = propGrid(40, 48);
  const post = (c) => G.rect(0, c, 40, 4, (r, x) => ['a', 'b', (r * 3 + c) % 7 ? 'c' : 'd', 'd'][x - c]);
  for (const c of [0, 12, 24, 36]) post(c);
  for (const r of [0, 12, 24, 36]) G.rect(r, 0, 4, 40, (y) => 'abce'[y - r]);
  for (let s = 0; s < 3; s += 1) for (let k = 0; k < 3; k += 1) {
    G.rect(4 + s * 12, 4 + k * 12, 8, 8, (r, c) => (r - s * 12 < 6 || c - k * 12 < 6 ? 'k' : r - s * 12 === 11 ? 'j' : 'i'));
  }
  G.rect(2, 4, 1, 32, (r, c) => (c % 6 === 1 ? 'G' : 'g')).rect(40, 0, 8, 4, (r, c) => 'abdd'[c]).rect(40, 36, 8, 4, (r, c) => 'bcdd'[c - 36]);
  G.edge((k, side) => (side === 't' || side === 'l' ? 'e' : 'o'));
  return G.rows();
}
// A scroll lying in its cubby, seen end on: a roll of parchment lit at its upper left with the turn of its spiral showing, and the
// tail of its ribbon, gold, red or teal by turns.
const SCROLL_PAL = { a: '#fffbf0', b: '#efe5cc', c: '#d6c6a0', d: '#a8977a', e: '#7d6c55', o: '#5a4a38' };
const SCROLL_TIE = [['#f2c14e', '#b5852a'], ['#e0453a', '#9a2a22'], ['#5aac94', '#2a6a6e']];
function scrollArt() {
  const G = propGrid(8, 8);
  G.rect(0, 0, 8, 8, (r, c) => {
    const [dx, dy] = [c - 3.5, r - 3.5];
    const d = Math.hypot(dx, dy);
    if (d > 3.9) return '.';
    if (d > 3.1) return dx + dy < 0 ? 'b' : 'o';
    if (d > 1.2 && d <= 2.1 && !(dx < 0 && dy < 0 && dy > dx)) return 'e';
    return dx + dy < -1.5 ? 'a' : dx + dy < 1.5 ? 'c' : 'd';
  });
  return G.put(5, 6, 'R').put(6, 6, 'Rr').put(7, 7, 'r').rows();
}
// The rack fills from the top shelf down, a scroll in each cubby.
PROP_DRAW.rack = (g, p, st) => {
  propArt(g, 'rack', RACK_PAL, rackArt, p.x, p.y);
  for (let i = 0; i < Math.min(9, st.scrolls ?? 0); i += 1) {
    const [lit, dark] = SCROLL_TIE[i % 3];
    propArt(g, `scroll${i % 3}`, { ...SCROLL_PAL, R: lit, r: dark }, scrollArt, p.x + 1 + (i % 3) * 3, p.y + 1 + Math.floor(i / 3) * 3);
  }
};

// The straw target: a drum of coiled straw, its braided rim lit at the upper left and its side showing below and to the
// right, its face painted with a red ring, a white one, a red one and a gold eye, each shaded toward the lower right, on
// a splayed stand of two legs.
const TARGET_PAL = { o: '#5a4220', ...propRamp6('#e0c06e', 'ABCDE.'), ...propRamp6(PX.red, 'FRrs..'), ...propRamp6('#ece6d6', 'WwV...'),
  ...propRamp6(PX.gold, 'YGg...'), ...propRamp6('#8a5a32', 'LlM.m.') };
function targetArt() {
  const G = propGrid(28, 32);
  const at = (r, c, ox = 0, oy = 0) => [(c + 0.5 - 13.5 - ox) / 13.5, (r + 0.5 - 11.5 - oy) / 11.5];
  // The legs behind the drum, splayed from its middle to the ground.
  for (let r = 16; r < 32; r += 1) {
    const s = (r - 16) / 15;
    G.put(r, Math.round(9 - s * 7), 'lM').put(r, Math.round(17 + s * 7), 'Mm');
  }
  G.rect(0, 0, 25, 28, (r, c) => {
    const [dx, dy] = at(r, c, 0.6, 0.8);
    return dx * dx + dy * dy <= 1 ? (dx + dy > 0.6 ? 'E' : 'D') : '.';
  });
  G.rect(0, 0, 24, 28, (r, c) => {
    const [dx, dy] = at(r, c);
    const d = Math.hypot(dx, dy);
    if (d > 1) return '.';
    const lum = -0.5 * dx - 0.6 * dy;
    const t = lum > 0.3 ? 0 : lum > -0.25 ? 1 : 2;
    if (d > 0.8) {
      const braid = (Math.atan2(dy, dx) * 7 + d * 9) % 2 < 1;
      return 'ABCDE'[Math.min(4, t + (braid ? 0 : 1))];
    }
    return d > 0.62 ? 'Rrs'[t] : d > 0.44 ? 'WwV'[t] : d > 0.27 ? 'Rrs'[t] : d > 0.1 ? 'YGg'[t] : 'Y';
  });
  G.edge((k, side) => ('Llm'.includes(k) ? 'm' : side === 't' || side === 'l' ? 'C' : 'o'));
  return G.rows();
}
// An arrow standing out of the face, its tail toward the archer: a pale shaft, white and red fletching and a dark nock,
// and the dark of the hole where it went in.
const ARROW = ['.WWFF...........', 'kWFFsssssssssssh', '.wwrr...........'];
const ARROW_PAL = { W: '#fbf8ee', w: '#cfc6b0', F: PX.red, r: '#a8302a', s: '#e0bf86', k: '#3a2216', h: '#2a1c10' };
PROP_DRAW.target = (g, p, st) => {
  propArt(g, 'target', TARGET_PAL, targetArt, p.x, p.y);
  [[3, 0], [1, 1], [5, 0]].slice(0, st.arrows ?? 0).forEach(([row, dx]) => {
    const fx = p.side < 0 ? p.x + 2 + dx : p.x + 4 + dx;
    propArt(g, 'arrow', ARROW_PAL, () => ARROW, p.side < 0 ? fx - 4 : fx + 1, p.y + row + 0.25, p.side > 0);
  });
};

// Two sacks of grain, the right one in front: each bunched at its neck and tied with twine, its burlap bulging and
// settling at the foot, lit at its upper left, the weave a faint dot here and there and a faded green band round it.
const SACK_PAL = { ...propRamp6('#d8c296', 'abcdeo'), p: '#8a7552', ...propRamp6(hdMix('#6f8f4a', '#d8c296', 0.3), 'FGHI..'), t: '#5c3f26', T: '#a0703f' };
const SACK_W = [3.5, 5, 6.2, 7.1, 7.7, 8.1, 8.3, 8.4, 8.4, 8.3, 8.2, 8, 7.6, 6.6];
function sackArt() {
  const G = propGrid(36, 20);
  for (const ox of [0, 17]) {
    G.cut(0, ox, 20, 18);
    SACK_W.forEach((hw, i) => {
      const r = i + 5;
      for (let c = ox; c < ox + 18; c += 1) {
        const dx = (c + 0.5 - ox - 9) / hw;
        if (Math.abs(dx) > 1) continue;
        const dy = (r - 11) / 8;
        const lum = -0.5 * dx - 0.6 * dy + 0.6 * Math.sqrt(Math.max(0, 1 - dx * dx - dy * dy * 0.5));
        let t = lum > 0.75 ? 0 : lum > 0.45 ? 1 : lum > 0.1 ? 2 : lum > -0.2 ? 3 : 4;
        if (t === 2 && r % 3 === 0 && (c + r) % 4 === 0) t = 3;
        G.set(r, c, r === 12 || r === 13 ? 'FGHII'[t] : 'abcde'[t]);
      }
    });
    G.map(0, ox + 5, ['..a.bc..', '.abbccd.', '..bccd..', '..tTTt..', '..bccd..']);
  }
  G.edge((k, side) => (side === 't' || side === 'l' ? 'p' : 'o'));
  return G.rows();
}
PROP_DRAW.sacks = (g, p) => propArt(g, 'sacks', SACK_PAL, sackArt, p.x, p.y);
