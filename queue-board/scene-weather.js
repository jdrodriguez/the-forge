// scene-weather.js: the weather over the Middle-earth view (scene.js). It follows the real weather at the owner's place (the
// board's config, queueBoard.weather): the board asks Open-Meteo every 15 minutes (weather.mjs) and every snapshot carries the
// answer as snap.weather. Its WMO code picks the weather (clear; overcast, with the cloud deck and the greyer light; fog;
// drizzle, rain and showers, light to heavy; snow; a thunderstorm, rain with a rare flash of lightning that lights the
// sky for a frame or two, no sound), the rain or snow it measures makes it heavier, the cloud cover sets the overcast,
// and its wind, gusts and the way it blows lean the rain, the snow, the grass and the trees. Changes fade in over five
// minutes. Snow settles and puddles gather from what really fell in the last eight hours, melting and drying as they do.
//
// With no report under an hour old it falls back to a schedule by the season on the place's clock (scenery-sun.js's
// sceneNow, scenery-elves.js's SEASONS): every two hours is a block whose weather comes from a hash of its date and
// hour with odds by season, so every screen shows the same; clear most of the time, spring showers, summer the odd
// thunder shower, autumn rain and morning fog, winter snow and fog, fading in and out, rain and snow coming in waves.
//
// sc.weather is { kind, amount, wind } for the other files (kind 'clear', 'rain', 'snow' or 'fog'; amount 0 to 1, fading
// in and out; wind -1 to 1, which way and how hard it blows), plus storm (rain with lightning), cover (the overcast, 0 to
// 1 in eighths), snow (how much has settled), wet (how wet the road is), flash (lightning this frame), bolt (its seed),
// and source ('real', 'schedule' or 'override') with label (the report's words).
//
// The art is in other files, every call guarded: the rain and snow falling scene-weather-fall.js's, the overcast, cloud
// deck and fog scenery-weather.js's, the puddles, splashes, rings and lightning scenery-storm.js's, the settled snow
// scenery-snow.js's. To see a weather now, run localStorage['board-weather'] = 'rain' (or 'storm' for rain with
// lightning, 'snow', 'fog', 'overcast' or 'clear') in the board's console; within a second it shows at full strength,
// with the snow settled or the puddles out. localStorage.removeItem('board-weather') goes back to the real weather.

// A fixed pseudo-random number in [0, 1) for a pair of integers, the same on every screen.
function wxHash(a, b) {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca77);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}
const wxClamp = (t) => Math.max(0, Math.min(1, t));
const wxEase = (t) => { const c = wxClamp(t); return c * c * (3 - 2 * c); };

// A block's odds, tried in order on one roll, by its season and the hour it starts (the night counts as morning).
function wxOdds(season, h) {
  const morning = h < 10 ? 1 : 0;
  const evening = h >= 18 ? 1 : 0;
  if (season === 'spring') return [['rain', 0.26], ['fog', 0.06 * morning]];
  if (season === 'summer') return [['storm', h >= 12 ? 0.15 : 0.05], ['rain', 0.03]];
  if (season === 'autumn') return [['rain', 0.2], ['fog', 0.3 * morning + 0.04 * evening]];
  return [['snow', 0.24], ['fog', 0.22 * morning + 0.12 * evening + 0.03]];
}
// Minutes a weather takes to fade in or out, and how hard each blows at most.
const WX_FADE = 5;
const WX_CALM = { clear: 0.35, rain: 0.7, storm: 1, snow: 0.45, fog: 0.12 };
const wx = { blocks: new Map(), offset: -5, settled: { snow: 0, wet: 0 }, settledAt: 0, forced: null, readAt: 0, reportAt: null, real: { t: 0 } };

// Block id is the hours since the epoch on the place's clock, halved: its weather, the minutes into it that weather starts
// and ends (when its neighbours differ), and its wind.
function wxBlock(id) {
  let B = wx.blocks.get(id);
  if (B) return B;
  const season = SEASONS[sceneNow(new Date((id * 2 - wx.offset) * 36e5)).month];
  let u = wxHash(id, 1);
  let kind = 'clear';
  for (const [k, p] of wxOdds(season, (id * 2) % 24)) { if (u < p) { kind = k; break; } u -= p; }
  B = { kind, a: wxHash(id, 2) * 35, b: 120 - wxHash(id, 3) * 35, wind: (wxHash(id, 4) * 2 - 1) * WX_CALM[kind] };
  if (wx.blocks.size > 300) wx.blocks.clear();
  wx.blocks.set(id, B);
  return B;
}
// Fog lifts from half past seven to half past ten and gathers again from four in the afternoon.
const wxFogHour = (h) => (h < 12 ? 1 - 0.85 * wxEase((h - 7.5) / 3) : 0.15 + 0.85 * wxEase((h - 16) / 3));
// The weather at E (hours since the epoch on the place's clock): its kind, env (how far it has faded in) and amount.
function wxAt(E) {
  const id = Math.floor(E / 2);
  const B = wxBlock(id);
  if (B.kind === 'clear') return { kind: 'clear', env: 0, amount: 0 };
  const m = (E - id * 2) * 60;
  const a = wxBlock(id - 1).kind === B.kind ? -WX_FADE : B.a;
  const b = wxBlock(id + 1).kind === B.kind ? 120 + WX_FADE : B.b;
  const env = wxEase((m - a) / WX_FADE) * wxEase((b - m) / WX_FADE);
  const swell = B.kind === 'fog' ? wxFogHour(E % 24) : 0.62 + 0.2 * Math.sin(E * 9) + 0.18 * Math.sin(E * 3.7 + 1.7);
  return { kind: B.kind, env, amount: env * swell };
}
// The wind, eased from each block's middle to the next.
function wxWind(E) {
  const c = (E - 1) / 2;
  const i = Math.floor(c);
  const f = wxEase(c - i);
  return wxBlock(i).wind * (1 - f) + wxBlock(i + 1).wind * f;
}
// Snow settles over half an hour or so of heavy snow and melts in about 45 minutes once it stops (sooner in rain); the
// road gets puddles over a quarter of an hour of rain and dries in an hour and a half. Stepped five minutes at a time
// through the last eight hours.
function wxSettled(E) {
  let snow = 0;
  let wet = 0;
  for (let t = E - 8; t <= E; t += 1 / 12) {
    const w = wxAt(t);
    const rain = w.kind === 'rain' || w.kind === 'storm';
    snow = wxClamp(w.kind === 'snow' ? snow + w.amount / 5 : snow - (rain ? 1 / 4 : 1 / 9));
    wet = wxClamp(rain ? wet + w.amount / 3 : wet - 1 / 18);
  }
  return { snow, wet };
}
// The test override, read at most once a second: a weather name, or null.
const WX_FORCE = { clear: 0.35, overcast: 0.4, rain: 0.45, storm: 0.8, snow: 0.3, fog: 0.05 };
function wxForced() {
  try {
    const v = localStorage.getItem('board-weather');
    return v in WX_FORCE ? v : null;
  } catch { return null; }
}

// The real weather: what each WMO code brings, [kind, how hard at most]. Drizzle and freezing rain fall as light rain,
// showers as rain, snow grains as light snow, thunder as a storm; partly cloudy leaves the sky its own clouds.
const WX_WMO = { 0: ['clear', 0], 1: ['clear', 0], 2: ['clear', 0], 3: ['overcast', 0], 45: ['fog', 0.85], 48: ['fog', 1],
  51: ['rain', 0.2], 53: ['rain', 0.3], 55: ['rain', 0.4], 56: ['rain', 0.25], 57: ['rain', 0.4], 61: ['rain', 0.4],
  63: ['rain', 0.65], 65: ['rain', 0.95], 66: ['rain', 0.45], 67: ['rain', 0.8], 71: ['snow', 0.35], 73: ['snow', 0.65],
  75: ['snow', 0.95], 77: ['snow', 0.25], 80: ['rain', 0.45], 81: ['rain', 0.7], 82: ['rain', 1], 85: ['snow', 0.55],
  86: ['snow', 0.9], 95: ['storm', 0.75], 96: ['storm', 0.85], 99: ['storm', 1] };
const wxWmo = (c) => WX_WMO[c] ?? (c >= 95 ? WX_WMO[95] : c >= 85 ? WX_WMO[85] : c >= 80 ? WX_WMO[80] : c >= 71 ? WX_WMO[73]
  : c >= 61 ? WX_WMO[63] : c >= 51 ? WX_WMO[53] : c >= 45 ? WX_WMO[45] : c >= 3 ? WX_WMO[3] : WX_WMO[0]);
// The report if it is under an hour old, else null.
function wxReport() {
  try {
    const R = typeof snap === 'object' && snap ? snap.weather : null;
    return R && R.code != null && Date.now() - R.at < 36e5 ? R : null;
  } catch { return null; }
}
// What the report asks for: its kind, how hard (the code's most, more as more rain or snow is measured, a fifth of an
// inch of rain or two fifths of snow in the hour being a lot), the overcast from the cloud cover, and the wind: calm
// under 3 mph and full near 30, a little more in gusts, positive when it blows east (from the west).
function wxRealTarget(R) {
  const [k, most] = wxWmo(R.code);
  const rate = wxClamp(k === 'snow' ? (R.snow ?? 0) / 0.4 : (R.rain ?? 0) / 0.2);
  const cloud = wxClamp((R.cloud ?? 100) / 100);
  const strength = wxClamp(((R.wind ?? 0) - 3) / 27 + 0.25 * wxClamp(((R.gusts ?? 0) - (R.wind ?? 0)) / 25));
  return { kind: k === 'storm' ? 'rain' : k === 'overcast' ? 'clear' : k, storm: k === 'storm', amount: k === 'fog' ? most : wxClamp(most * (0.7 + 0.5 * rate)),
    cover: k === 'clear' ? 0 : k === 'overcast' ? Math.max(0.5, cloud) : k === 'fog' ? 1 : Math.max(0.75, cloud),
    wind: strength * -Math.sin(((R.windFrom ?? 0) * Math.PI) / 180) };
}
// Snow settled and the road's wetness from the report's last eight hours, an hour at a time: half an inch of snow, or an
// hour of snowing whatever it measures, covers the ground; it melts in under an hour above 40 F, in a few hours just above
// freezing, hardly at all below, and fast in rain; a twentieth of an inch of rain, or an hour of raining, fills the
// puddles, and they dry in an hour and a half.
function wxRealSettled(R) {
  let [snow, wet] = [0, 0];
  const melt = R.temp == null || R.temp >= 40 ? 1.3 : R.temp > 32 ? 0.3 : 0.05;
  for (const h of R.recent ?? []) {
    if (R.time && h.time > R.time) continue;
    const [k, most] = wxWmo(h.code);
    const falls = k === 'rain' || k === 'storm';
    snow = wxClamp(k === 'snow' || h.snow > 0 ? snow + Math.max((h.snow ?? 0) / 0.5, most) : snow - (falls ? 3 : melt));
    wet = wxClamp(falls || h.rain > 0 ? wet + Math.max((h.rain ?? 0) / 0.05, most) : wet - 0.67);
  }
  return { snow, wet };
}
// The real weather as shown: eased toward the report over five minutes, a change of kind first fading the old one out.
// A page just opened, or one back after ten minutes away, starts where the report is.
function wxRealStep(T, now) {
  const S = wx.real;
  if (!S.t || now - S.t > 6e5) Object.assign(S, T);
  else {
    const k = (now - S.t) / (WX_FADE * 6e4);
    const to = (a, b) => a + Math.max(-k, Math.min(k, b - a));
    if (S.kind !== T.kind || S.storm !== T.storm) {
      S.amount = to(S.amount, 0);
      if (S.amount <= 0) Object.assign(S, { kind: T.kind, storm: T.storm });
    } else S.amount = to(S.amount, T.amount);
    S.cover = to(S.cover, T.cover);
    S.wind = to(S.wind, T.wind);
  }
  S.t = now;
  return S;
}
// Lightning in a storm: in about one 9-second window in seven, a flash at a set moment lasting a frame or two, often
// with a weaker flicker a fifth of a second later.
function wxFlash(ms) {
  const win = Math.floor(ms / 9000);
  if (wxHash(win, 7) > 0.15) return 0;
  const d = ms - win * 9000 - 400 - wxHash(win, 8) * 8000;
  if (d >= 0 && d < 140) return 1;
  return wxHash(win, 9) < 0.6 && d >= 240 && d < 340 ? 0.5 : 0;
}

sc.weather = { kind: 'clear', amount: 0, wind: 0, storm: false, cover: 0, snow: 0, wet: 0, flash: 0, bolt: 0, source: 'schedule', label: '' };
// Sets sc.weather for this frame: the override, else the report, else the schedule.
function wxUpdate() {
  const now = Date.now();
  if (now - wx.readAt > 1000) {
    wx.readAt = now;
    const f = wxForced();
    if (f !== wx.forced) { wx.forced = f; wx.settledAt = 0; }
  }
  const R = wx.forced ? null : wxReport();
  if (now - wx.settledAt > 30000 || (R && R.at !== wx.reportAt)) {
    [wx.settledAt, wx.reportAt] = [now, R?.at];
    wx.offset = sceneNow(new Date(now)).offset;
    wx.settled = R ? wxRealSettled(R) : wxSettled(now / 36e5 + wx.offset);
  }
  const E = now / 36e5 + wx.offset;
  const f = wx.forced;
  const w = sc.weather;
  if (f) {
    const k = f === 'overcast' ? 'clear' : f;
    Object.assign(w, { kind: k === 'storm' ? 'rain' : k, storm: k === 'storm', amount: k === 'clear' ? 0 : 1, wind: WX_FORCE[f], cover: f === 'clear' ? 0 : 1,
      snow: k === 'snow' ? 1 : 0, wet: k === 'rain' || k === 'storm' ? 1 : 0, source: 'override', label: f });
  } else if (R) {
    const S = wxRealStep(wxRealTarget(R), now);
    Object.assign(w, { kind: S.kind, storm: S.storm, amount: S.amount, wind: S.wind, cover: Math.round(S.cover * 8) / 8, source: 'real', label: R.label ?? '' });
  } else {
    const at = wxAt(E);
    wx.real.t = 0;
    Object.assign(w, { kind: at.kind === 'storm' ? 'rain' : at.kind, storm: at.kind === 'storm', amount: at.amount, wind: wxWind(E),
      cover: Math.round(at.env * 8) / 8, source: 'schedule', label: '' });
  }
  if (!f) [w.snow, w.wet] = [Math.round(wx.settled.snow * 16) / 16, Math.round(wx.settled.wet * 8) / 8];
  w.flash = w.storm && !scReduced.matches ? wxFlash(now) * Math.min(1, w.amount * 1.5) : 0;
  w.bolt = Math.floor(now / 9000);
}

// The passes. The sky pass, the first of each frame, sets sc.weather for every later file.
const wxCall = (name, ...args) => { if (typeof window[name] === 'function') window[name](...args); };
sc.layers.sky.push((g) => { wxUpdate(); wxCall('wxSkyArt', g, sc); });
// Fog lies under the figures and props (2026-11-07: weather never covers the work), so the ground and the far
// scenery fade into it while every worker, station, name and bubble stays clear in front.
sc.layers.ground.push((g, s, tick) => {
  wxCall('wxGroundArt', g, sc, tick);
  if (sc.weather?.kind === 'fog') wxCall('wxAirArt', g, sc, tick);
});
sc.layers.items.push((list) => wxCall('wxItems', list, sc));
sc.layers.air.push((g, s, tick) => {
  if (sc.weather?.kind !== 'fog') wxCall('wxAirArt', g, sc, tick);
  if (!sc.sky.night) wxCall('wxFall', g, tick, sc.dy, sc.dy, sc.H);
});
sc.layers.light.push((g, s, tick) => {
  if (sc.sky.night) wxCall('wxFall', g, tick, sc.dy, sc.dy, sc.H);
  wxCall('wxFlashArt', g, sc, true);
});
sc.layers.above.push((g, s, tick) => {
  if (sc.dy <= 0) return;
  g.save();
  g.beginPath();
  g.rect(0, 0, sc.W, sc.dy + 0.5);
  g.clip();
  wxCall('wxAboveArt', g, sc);
  wxCall('wxFall', g, tick, 0, 0, sc.dy + 0.5);
  wxCall('wxFlashArt', g, sc, false);
  g.restore();
});
wxUpdate();
