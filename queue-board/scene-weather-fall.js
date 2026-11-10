// scene-weather-fall.js: the rain and snow falling over the Middle-earth view, in 32-bit pixels a quarter unit across.
// scene-weather.js says what falls and how hard (sc.weather) and calls wxFall from its layer passes: rain in three depths
// of fine slanted streaks leaning with the wind (short faint far ones, longer near ones with a faint tail and a white
// head), snow in five depths from a far speck to near clumps and six-armed crystals that turn as they fall, each lit on
// its upper left, drifting and swaying. They fall through the scene (the air layer, over the figures) and through the
// sky the view adds above it (the above layer); at night they move to the light layer, after the night shade, in paler
// colours, so they catch a little light. Under a red sky they pick up its glow. With reduced motion nothing falls: a
// third of the streaks or flakes hang still. Loaded right after scene-weather.js.

// Rain's three depths, far to near: [streaks per 10,000 square units at full strength, length, fall per tick].
const WX_RAIN = [[28, 1.75, 5], [16, 3, 7.5], [8, 5, 10]];
// Snow's five depths, far to near: [flakes per 10,000 square units, fall per tick, sway, which flake (WX_FLAKES)].
const WX_SNOW = [[40, 0.3, 0.4, 0], [22, 0.45, 0.6, 1], [12, 0.6, 0.9, 2], [7, 0.8, 1.1, 3], [4, 1.1, 1.5, 4]];
// Their colours by day and by night, each with its strength. Rain: the far and middle streaks, then the near streak's
// faint tail, its body and its white head. Snow: each depth's lit, body and shaded pixels, the far ones dimmest.
const WX_FALL = {
  rain: { day: ['#b7c6d8', '#d2dded', '#d9e2ee', '#eef4fb', '#ffffff'], night: ['#4e5a76', '#6e7a99', '#76829f', '#a3afca', '#d4dcee'],
    alpha: [0.42, 0.55, 0.45, 0.8, 0.95] },
  snow: { day: ['#ffffff', '#ffffff', '#ffffff', '#f4f7fb', '#e6ecf4', '#cdd7e6', '#ffffff', '#eef3f9', '#c9d4e6', '#ffffff', '#f1f5fa',
    '#c3cfe2', '#ffffff', '#f3f7fb', '#bccadf'], night: ['#c2cbdc', '#c2cbdc', '#c2cbdc', '#a9b3ca', '#949fb9', '#7a86a2', '#c2cbdc',
    '#a8b2c9', '#808ca8', '#d3dae8', '#b4bdd2', '#8692ae', '#dde3ef', '#bcc5d8', '#8a96b2'],
    alpha: [0.8, 0.8, 0.8, 0.75, 0.75, 0.75, 0.95, 0.95, 0.95, 1, 1, 1, 1, 1, 1] },
};
// The flakes as quarter-unit pixel maps (l lit from the upper left, b body, s shaded): a speck, a soft far flake, a small
// lit one, a plus, and for the nearest a soft clump or a six-armed crystal that shows its arms square on or turned as it
// falls.
const WX_FLAKES = [['l'], ['bb', 'bb'], ['ll', 'lb'], ['.l.', 'lbb', '.b.'], ['.ll.', 'lbbb', 'bbbs', '.ss.'],
  ['..l..', '..b..', 'lbbbs', '..b..', '..s..'], ['l...l', '.b.b.', '..b..', '.b.s.', 's...s']];
// A shape's rects as [colour, dx, dy, w, h] from its top-left: a flake's runs along each row (a run the same as the one
// above it joins it), or a streak len units long leaning slant (sideways per unit down) in quarter-unit columns, at most
// cap of them (the far depths' few steps jump a little), split for the near depth into its tail, body and head.
const wxShapes = new Map();
function wxFlake(k, d) {
  const key = `f${k},${d}`;
  if (!wxShapes.has(key)) {
    const out = [];
    let above = [];
    WX_FLAKES[k].forEach((row, r) => {
      const runs = [];
      for (let c = 0; c < row.length;) {
        let e = c + 1;
        while (e < row.length && row[e] === row[c]) e += 1;
        if (row[c] !== '.') {
          const colour = d * 3 + 'lbs'.indexOf(row[c]);
          const up = above.find((q) => q[0] === colour && q[1] === c / 4 && q[3] === (e - c) / 4 && q[2] + q[4] === r / 4);
          if (up) { up[4] += 0.25; runs.push(up); } else { const q = [colour, c / 4, r / 4, (e - c) / 4, 0.25]; out.push(q); runs.push(q); }
        }
        c = e;
      }
      above = runs;
    });
    wxShapes.set(key, out);
  }
  return wxShapes.get(key);
}
function wxStreak(d, len, slant) {
  const key = `r${d},${slant}`;
  if (!wxShapes.has(key)) {
    const n = Math.max(1, Math.min(len * 4, Math.round(Math.abs(slant) * len * 4) + 1, [2, 4, 99][d]));
    const bands = d < 2 ? [[len, d]] : [[Math.round(len * 1.6) / 4, 2], [len - 0.25, 3], [len, 4]];
    const out = [];
    for (let k = 0; k < n; k += 1) {
      let y = Math.round((k * len * 4) / n) / 4;
      const y1 = Math.round(((k + 1) * len * 4) / n) / 4;
      const dx = Math.round(slant * ((y + y1) / 2) * 4) / 4;
      for (const [end, colour] of bands) {
        const e = Math.min(y1, end);
        if (e > y) { out.push([colour, dx, y, 0.25, e - y]); y = e; }
      }
    }
    wxShapes.set(key, out);
  }
  return wxShapes.get(key);
}

// The rain or snow falling, over the whole canvas (the scene and the sky added above it). Each streak or flake falls
// from a seeded place at its own speed, takes a new place each time it starts again at the top, and falls that time only
// if its draw beats the amount, so the weather thickens and thins without any popping mid-air. Snow drifts with the wind
// and sways, and gusts (scene-wind.js's sc.wind) push it about. They are placed once a frame, in canvas rows, every rect
// of one colour gathered into one list; each pass then fills the rows it covers, a path per colour.
const wxRuns = [];
const wxFallAt = { tick: null, n: 0 };
function wxFallPlace(tick) {
  const w = sc.weather;
  const still = scReduced.matches;
  const t = still ? 0 : tick;
  const amount = still ? w.amount * 0.35 : w.amount;
  const snow = w.kind === 'snow';
  for (let c = 0; c < 15; c += 1) (wxRuns[c] ??= []).length = 0;
  const { W, H } = sc;
  const area = (W * H) / 1e4;
  const slant = Math.round(w.wind * (snow ? 6 : 5.5)) / 10;
  const gust = snow && !still ? (sc.wind?.at?.(W / 2, tick) ?? 0) * 0.6 : 0;
  (snow ? WX_SNOW : WX_RAIN).forEach(([per, a, b], d) => {
    const len = snow ? 1.25 : a;
    const v = snow ? a : b;
    const span = H + len;
    const streak = snow ? null : wxStreak(d, len, slant);
    for (let i = 0, n = Math.ceil(per * area); i < n; i += 1) {
      const s = wxHash(i, d * 10) * span + v * (0.85 + 0.3 * wxHash(i, d * 10 + 1)) * t;
      const cyc = Math.floor(s / span);
      if (wxHash(i * 3 + d, cyc) >= amount) continue;
      const fall = s - cyc * span;
      const y = Math.round((fall - len) * 4) / 4;
      let x = wxHash(i * 5 + d, cyc) * (W + 4) + slant * fall;
      if (snow) x += b * Math.sin(t * (0.1 + 0.05 * wxHash(i, d * 10 + 2)) + i) + gust * (d + 1) * 0.6;
      x = Math.round(((((x % (W + 4)) + W + 4) % (W + 4)) - 2) * 4) / 4;
      const k = snow ? WX_SNOW[d][3] : 0;
      const shape = streak ?? wxFlake(k < 4 ? k : i % 2 ? 4 : 5 + (Math.floor(t * 0.15 + i * 0.37) & 1), d);
      for (const [c, dx, dy, rw, rh] of shape) wxRuns[c].push(x + dx, y + dy, rw, rh);
    }
  });
}
// Fills the falling rain or snow from canvas row top to bottom, on a pass whose g starts oy rows down the canvas.
function wxFall(g, tick, oy, top, bottom) {
  const w = sc.weather;
  if (w.amount <= 0.01 || (w.kind !== 'rain' && w.kind !== 'snow')) return;
  if (wxFallAt.tick !== tick || wxFallAt.n !== sc.W * 1e4 + sc.H) { wxFallPlace(tick); Object.assign(wxFallAt, { tick, n: sc.W * 1e4 + sc.H }); }
  const set = WX_FALL[w.kind];
  const war = sc.war || 0;
  (sc.sky.night ? set.night : set.day).forEach((c, k) => {
    const r = wxRuns[k];
    if (!r.length) return;
    g.globalAlpha = set.alpha[k];
    g.fillStyle = war ? hdMix(c, '#ffb48c', war * 0.3) : c;
    g.beginPath();
    for (let i = 0; i < r.length; i += 4) if (r[i + 1] + r[i + 3] > top && r[i + 1] < bottom) g.rect(r[i], r[i + 1] - oy, r[i + 2], r[i + 3]);
    g.fill();
  });
  g.globalAlpha = 1;
}
