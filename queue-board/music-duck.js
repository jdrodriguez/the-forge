// music-duck.js: alerts come before the music (2026-11-06: the alerts supersede the music, so the owner hears
// every one). Just before each alert sound plays, the herald (or a Test button in the sound settings) tells the board, and
// the board passes it at once to every page playing music on its event stream (GET /api/events, music.mjs). The music
// then fades to silence within 0.3 seconds, before the cue starts, stays silent for the cue's length and a second more,
// and fades back in over 1.5 seconds; another alert in that time stretches the silence to cover it too. The fades are
// scheduled on the audio clock, so the silence always ends by itself, whatever happens to the stream. The stream is
// open only while the music is on (music.js calls musicAlerts from its control), so a tab without music holds no
// connection to the board, and a dropped stream reconnects by itself. Uses music.js's music.
const DUCK_LEAD = 0.4; // seconds from the warning to the cue: ALERT_LEAD_MS in sound.mjs
const DUCK_DOWN = 0.3;
const DUCK_AFTER = 1;
const DUCK_UP = 1.5;
const duck = { source: null, end: 0, retry: null };

function musicAlerts(open) {
  if (open && !duck.source) {
    duck.source = new EventSource('/api/events');
    duck.source.addEventListener('alert', (e) => {
      let a;
      try { a = JSON.parse(e.data); } catch { return; }
      musicDuck(Number(a.seconds) > 0 ? Math.min(Number(a.seconds), 60) : 3);
    });
    // The browser retries a dropped stream itself; one it gave up on (the board answered with an error) opens again
    // a little later.
    duck.source.addEventListener('error', () => {
      if (duck.source?.readyState !== EventSource.CLOSED) return;
      duck.source = null;
      clearTimeout(duck.retry);
      duck.retry = setTimeout(() => musicAlerts(music.on), 5000);
    });
  } else if (!open && duck.source) {
    duck.source.close();
    duck.source = null;
  }
}

// Silences the music for an alert of seconds that starts DUCK_LEAD from now, then brings it back.
function musicDuck(seconds) {
  if (!music.live || !music.duck) return;
  const g = music.duck.gain;
  const t = music.ctx.currentTime;
  duck.end = Math.max(duck.end, t + DUCK_LEAD + seconds + DUCK_AFTER);
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  g.linearRampToValueAtTime(0, t + DUCK_DOWN);
  g.setValueAtTime(0, duck.end);
  g.linearRampToValueAtTime(1, duck.end + DUCK_UP);
}
