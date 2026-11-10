// scenery-sun.js: the Middle-earth view's clock. The scene keeps the owner's time wherever the page is opened: the time
// zone and place in the board's config (queueBoard.weather, which every snapshot carries as snap.config.place), with the
// sun up when it is up there on that date. With no place set, or before the first snapshot, it keeps this browser's
// time zone and a place at 40 degrees north on that zone's own meridian, which puts sunrise and sunset within the hour.
// The scene's own day is a fixed timetable with sunrise at 6:30 and sunset at 18:30: scenery.js's sky colours, the
// sun's and moon's paths and the night flag, and the lanterns in scene-elves.js. sceneHour stretches the real day onto
// its 12 daylight hours and the real night onto the other 12, so a November evening is dark by about 6 and a June one
// stays light past 8:30. Loaded before scenery.js.
const scZoneHere = Intl.DateTimeFormat().resolvedOptions().timeZone;
const scClockFor = (timeZone) => new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
let scClockZone = scZoneHere, scClock = scClockFor(scZoneHere);

// The place the scene keeps time by, read from the newest snapshot: its latitude and longitude (lon null when only the
// zone is known), with the clock moved to its time zone. A zone the browser does not know keeps the browser's own.
function scHome() {
  let place = null;
  try { place = snap?.config?.place ?? null; } catch { /* the page's own script has not run yet */ }
  const zone = place?.timezone || scZoneHere;
  if (zone !== scClockZone) {
    try { scClock = scClockFor(zone); scClockZone = zone; } catch { scClock = scClockFor(scZoneHere); scClockZone = scZoneHere; }
  }
  return { lat: Number.isFinite(place?.latitude) ? place.latitude : 40, lon: Number.isFinite(place?.longitude) ? place.longitude : null };
}

// The place's hour (with its minutes), month (0 to 11), day of the year, and offset from UTC in hours, at date.
function sceneNow(date = new Date()) {
  scHome();
  const p = Object.fromEntries(scClock.formatToParts(date).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  const day = (Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(p.year, 0, 1)) / 864e5 + 1;
  const offset = Math.round(((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - date) / 36e5) * 4) / 4;
  return { hour: p.hour + p.minute / 60, month: p.month - 1, day, offset };
}

// Sunrise and sunset at the place on a day of the year, as hours on its clock (NOAA's approximation, within a minute or two).
function sunTimes(day, offset) {
  const y = ((2 * Math.PI) / 365) * (day - 1);
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(y) - 0.032077 * Math.sin(y) - 0.014615 * Math.cos(2 * y) - 0.040849 * Math.sin(2 * y));
  const decl = 0.006918 - 0.399912 * Math.cos(y) + 0.070257 * Math.sin(y) - 0.006758 * Math.cos(2 * y) + 0.000907 * Math.sin(2 * y)
    - 0.002697 * Math.cos(3 * y) + 0.00148 * Math.sin(3 * y);
  const home = scHome();
  const lat = (home.lat * Math.PI) / 180;
  const ha = (Math.acos(Math.cos((90.833 * Math.PI) / 180) / (Math.cos(lat) * Math.cos(decl)) - Math.tan(lat) * Math.tan(decl)) * 180) / Math.PI;
  const at = (m) => (720 - 4 * (home.lon ?? offset * 15) - m - eq) / 60 + offset;
  return { rise: at(4 * ha), set: at(-4 * ha) };
}

// The scene's hour at date: 6.5 at sunrise, 18.5 at sunset.
function sceneHour(date = new Date()) {
  const now = sceneNow(date);
  const { rise, set } = sunTimes(now.day, now.offset);
  if (now.hour >= rise && now.hour < set) return 6.5 + ((now.hour - rise) * 12) / (set - rise);
  return (18.5 + (((now.hour - set + 24) % 24) * 12) / (24 - set + rise)) % 24;
}
