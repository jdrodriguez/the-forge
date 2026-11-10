// scene2-wind.js: the breeze over the map from above (scene2.js), the same wind as the side view's (scene-wind.js) laid
// over two dimensions. m2.wind.at(x, y, tick) is how far a thing at (x, y) leans with the wind, -1 to 1, positive toward
// the east: a steady push the way the weather blows (m2.weather.wind, scene2-weather.js), plus gusts that travel downwind
// across the map as bumps of stronger air, summed from three slow waves of different lengths and speeds so they come
// irregularly, and a slow swell that eases them all. m2.wind.tree(x, y, seed, tick) is a tree's sway: the gust at its
// place a few ticks late, rocking on a beat of its own. m2.wind.dir is the way it blows (1 east, -1 west). With reduced
// motion everything is still. The grass and the trees (the land's art) and the smoke (scene2-fx.js) read it.

// The gusts: [weight, wavelength in units, speed in units a tick, phase, how much they also run north to south].
const M2_GUSTS = [[0.6, 37, 2.4, 0, 0.35], [0.45, 61, 1.7, 2, -0.25], [0.3, 23, 3.2, 4, 0.5]];
const m2WindPush = () => m2.weather?.wind ?? 0.25;
const m2WindDir = () => (m2WindPush() < -0.05 ? -1 : 1);
const m2WindStrength = () => 0.5 + 0.5 * Math.min(1, Math.abs(m2WindPush()));

// The slow part of the wind at (x, y): what the trees answer to.
function m2Gust(x, y, t) {
  if (m2Reduced.matches) return 0;
  const dir = m2WindDir();
  let s = 0;
  for (const [a, len, v, p, k] of M2_GUSTS) {
    const q = Math.sin((x * dir + y * k - v * t) / len + p);
    if (q > 0) s += a * q * q;
  }
  const swell = 0.75 + 0.25 * Math.sin(t / 173 + 1);
  return dir * m2WindStrength() * (0.2 + 0.8 * Math.min(1, s) * swell);
}

m2.wind = {
  get dir() { return m2WindDir(); },
  get strength() { return m2WindStrength(); },
  // The gusts and a light flutter on top, which grass and smoke catch.
  at: (x, y, tick) => (m2Reduced.matches ? 0 : m2Gust(x, y, tick) + 0.1 * m2WindStrength() * Math.sin(tick * 0.9 + x * 0.41 + y * 0.29)),
  // A tree answers its place's gusts a few ticks late, by its seed, and rocks on a beat of its own as they push it.
  tree(x, y, seed, tick) {
    const g = m2Gust(x, y, tick - 2 - (seed % 4));
    return g + Math.abs(g) * 0.3 * Math.sin(tick / (4 + (seed % 3)) + seed);
  },
};
