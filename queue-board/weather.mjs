// weather.mjs: the real weather at the owner's place, for the Middle-earth view's weather (scene-weather.js). It comes
// from Open-Meteo's free forecast API (no key needed, https://open-meteo.com) and uses its WMO weather codes. The place
// is queueBoard.weather ({ latitude, longitude, timezone, place }); with no place set there is no weather and the scene
// stays dry. The board asks for the current conditions (and the last 8 hours' rain and snow) at most every 15 minutes,
// in the background, and every snapshot carries the last answer as `weather`; a failed ask keeps the last answer with
// an error, and a page treats an answer over an hour old as none.
import { boardConfig } from './sound.mjs';

const place = boardConfig().qb.weather ?? {};
const HOME = { lat: Number(place.latitude), lon: Number(place.longitude) };
const HERE = Number.isFinite(HOME.lat) && Number.isFinite(HOME.lon);
const TIMEZONE = place.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
const PLACE = place.place || '';
const EVERY_MS = 15 * 60_000;
const WMO = {
  0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog',
  51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle', 56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
  61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain', 66: 'Light freezing rain', 67: 'Heavy freezing rain',
  71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
  80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers', 85: 'Slight snow showers', 86: 'Heavy snow showers',
  95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};
const w = { last: null, at: 0, busy: false };

async function refresh() {
  w.busy = true;
  try {
    const params = new URLSearchParams({
      latitude: String(HOME.lat),
      longitude: String(HOME.lon),
      current: 'weather_code,temperature_2m,cloud_cover,precipitation,rain,showers,snowfall,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day',
      hourly: 'weather_code,rain,showers,snowfall',
      past_hours: '8',
      forecast_hours: '1',
      timezone: TIMEZONE,
      temperature_unit: 'fahrenheit',
      wind_speed_unit: 'mph',
      precipitation_unit: 'inch',
    });
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`Open-Meteo answered ${res.status}`);
    const j = await res.json();
    const c = j.current;
    const h = j.hourly ?? {};
    w.last = {
      at: Date.now(), time: c.time, code: c.weather_code, label: WMO[c.weather_code] ?? `Code ${c.weather_code}`,
      temp: c.temperature_2m, cloud: c.cloud_cover, precip: c.precipitation, rain: (c.rain ?? 0) + (c.showers ?? 0), snow: c.snowfall,
      wind: c.wind_speed_10m, gusts: c.wind_gusts_10m, windFrom: c.wind_direction_10m, isDay: c.is_day === 1, place: PLACE,
      // The last 8 hours, oldest first, so settled snow and puddles can follow what really fell.
      recent: (h.time ?? []).map((t, i) => ({ time: t, code: h.weather_code[i], rain: (h.rain[i] ?? 0) + (h.showers[i] ?? 0), snow: h.snowfall[i] ?? 0 })),
    };
  } catch (e) {
    if (w.last) w.last = { ...w.last, error: e.message };
  } finally {
    w.at = Date.now();
    w.busy = false;
  }
}

// The last answer, asking again in the background when it is 15 minutes old.
export function weatherNow() {
  if (HERE && !w.busy && Date.now() - w.at > EVERY_MS) refresh();
  return w.last;
}
// Asked once at start, so the first snapshot after a restart usually has it.
weatherNow();
