// dsp.mjs: the few signal-processing pieces sounds/make.mjs builds the board's alert cues from. A seeded random source,
// struck partials (bells, bars, anvils), a plucked string, band-limited saw and triangle voices through a low-pass
// filter, a drum, a peak limiter, loudness matching and a 16-bit WAV writer. Everything works on plain Float32Arrays at
// one sample rate and uses no outside library, so a cue renders the same bytes every time.
import fs from 'node:fs';

export const SR = 44100;
export const track = (sec) => new Float32Array(Math.ceil(sec * SR));
const at = (t) => Math.max(0, Math.round(t * SR));

// A small xorshift generator, so the noise in a cue is the same on every run.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

// Adds a struck object at t seconds: sine partials at ratios of f, each [ratio, level, decay seconds]. A short attack
// keeps the strike from clicking. Partials above the Nyquist frequency are left out.
export function strike(out, t, f, partials, gain = 1, attack = 0.002) {
  const i0 = at(t);
  for (const [ratio, level, decay] of partials) {
    const hz = f * ratio;
    if (hz >= SR / 2) continue;
    const w = (2 * Math.PI * hz) / SR;
    const n = Math.min(out.length - i0, Math.ceil(decay * 7 * SR));
    const rise = attack * SR;
    for (let i = 0; i < n; i += 1) {
      out[i0 + i] += gain * level * Math.min(1, i / rise) * Math.exp(-i / (decay * SR)) * Math.sin(w * i);
    }
  }
}

// A plucked string (Karplus-Strong): a burst of softened noise circulating in a delay line one period long, averaged
// on every pass so the high partials fade first, as on a harp. bright (0 to 1) sets how hard the pluck is.
export function pluck(out, t, f, gain, seed, { sustain = 0.996, bright = 0.5, length = 2.5 } = {}) {
  const r = rng(seed);
  const period = SR / f;
  const n = Math.max(2, Math.floor(period));
  const frac = period - n;
  const line = new Float32Array(n + 1);
  let lp = 0;
  for (let i = 0; i < line.length; i += 1) {
    lp += (1 - bright * 0.9) * ((r() * 2 - 1) - lp);
    line[i] = lp;
  }
  const i0 = at(t);
  const len = Math.min(out.length - i0, Math.ceil(length * SR));
  let pos = 0;
  let prev = 0;
  for (let i = 0; i < len; i += 1) {
    const a = line[pos];
    const b = line[(pos + 1) % line.length];
    const v = a + (b - a) * frac;
    out[i0 + i] += gain * v;
    line[pos] = sustain * 0.5 * (v + prev);
    prev = v;
    pos = (pos + 1) % line.length;
  }
}

// A low-pass biquad (the RBJ cookbook's) whose cutoff can move: cutoff(i) gives it per sample, recomputed every 16.
// high turns it into the matching high-pass, which master() uses to weigh loudness.
export function lowpass(x, cutoff, q = 0.707, high = false) {
  let b0 = 0, b1 = 0, b2 = 0, a1 = 0, a2 = 0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i += 1) {
    if (i % 16 === 0) {
      const w = (2 * Math.PI * Math.min(cutoff(i), SR * 0.45)) / SR;
      const alpha = Math.sin(w) / (2 * q);
      const cos = Math.cos(w);
      const a0 = 1 + alpha;
      const sign = high ? -1 : 1;
      b0 = (1 - sign * cos) / 2 / a0; b1 = (sign * (1 - sign * cos)) / a0; b2 = b0; a1 = (-2 * cos) / a0; a2 = (1 - alpha) / a0;
    }
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    x[i] = y;
  }
  return x;
}

// A saw with its jumps smoothed (polyBLEP), so low notes don't alias into a buzz.
function blep(p, dt) {
  if (p < dt) { const q = p / dt; return q + q - q * q - 1; }
  if (p > 1 - dt) { const q = (p - 1) / dt; return q * q + q + q + 1; }
  return 0;
}

// One horn voice, as horn.js played it in the browser: two waves detuned a few cents, a short glide to each new note,
// a vibrato that sets in after the attack, a dip in level between notes, and a low-pass that opens as the note swells.
// notes: [[frequency, seconds], ...]. Adds it to out at t.
export function horn(out, t, notes, { gain = 0.2, wave = 'saw', cutoff = 800, attack = 0.32 } = {}) {
  const total = notes.reduce((s, [, d]) => s + d, 0);
  const v = track(total + 0.05);
  const starts = [];
  notes.reduce((s, [, d]) => (starts.push(s), s + d), 0);
  const phases = [0, 0.37];
  for (let i = 0; i < v.length; i += 1) {
    const s = i / SR;
    let k = starts.findLastIndex((x) => x <= s);
    if (k < 0) k = 0;
    const into = s - starts[k];
    const f0 = k ? notes[k - 1][0] : notes[0][0];
    const f = k && into < 0.06 ? f0 * (notes[k][0] / f0) ** (into / 0.06) : notes[k][0];
    const vib = Math.min(1, Math.max(0, s / (attack + 0.5))) * 14 * Math.sin(2 * Math.PI * 5.3 * s);
    let env = Math.min(1, s / attack);
    if (k && into < 0.07) env *= 1 - 0.4 * (1 - into / 0.07);
    if (s > total - 0.35) env *= Math.max(0, (total - s) / 0.35);
    let sum = 0;
    [-7, 6].forEach((cents, j) => {
      const hz = f * 2 ** ((cents + vib) / 1200);
      const dt = hz / SR;
      phases[j] = (phases[j] + dt) % 1;
      const p = phases[j];
      sum += wave === 'saw' ? 2 * p - 1 - blep(p, dt) : 1 - 4 * Math.abs(p - 0.5);
    });
    v[i] = gain * env * sum;
  }
  lowpass(v, (i) => cutoff * (0.3 + 0.7 * Math.min(1, i / (attack * SR))), 0.8);
  mix(out, v, t);
}

// A war drum: a low sine thump whose pitch drops fast, the skin's next two modes over it, gently overdriven so a
// laptop's small speakers still carry it, and a short burst of muffled noise for the stick.
export function drum(out, t, v, seed) {
  const len = Math.ceil((0.9 + 0.3 * v) * SR);
  const d = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i += 1) {
    const s = i / SR;
    const f = s < 0.13 ? 130 * (48 / 130) ** (s / 0.13) : 48;
    ph += (2 * Math.PI * f) / SR;
    const rise = Math.min(1, s / 0.008);
    const body = Math.sin(ph) + 0.35 * Math.exp(-s / 0.06) * Math.sin(1.59 * ph) + 0.2 * Math.exp(-s / 0.04) * Math.sin(2.14 * ph);
    d[i] = 0.9 * v * Math.tanh(1.8 * rise * Math.exp(-s / ((0.5 + 0.3 * v) / 6.9)) * body) / Math.tanh(1.8);
  }
  const r = rng(seed);
  const skin = new Float32Array(Math.ceil(0.12 * SR));
  for (let i = 0; i < skin.length; i += 1) skin[i] = 0.4 * v * Math.exp(-i / (0.09 / 6.9 * SR)) * (r() * 2 - 1);
  lowpass(skin, () => 1100);
  mix(d, skin, 0);
  mix(out, d, t);
}

// Adds a short burst of filtered noise: a clapper's or hammer's contact.
export function knock(out, t, gain, cutoff, decay, seed) {
  const r = rng(seed);
  const n = new Float32Array(Math.ceil(decay * 7 * SR));
  for (let i = 0; i < n.length; i += 1) n[i] = gain * Math.exp(-i / (decay * SR)) * (r() * 2 - 1);
  mix(out, lowpass(n, () => cutoff), t);
}

export function mix(out, x, t) {
  const i0 = at(t);
  for (let i = 0; i < x.length && i0 + i < out.length; i += 1) out[i0 + i] += x[i];
}

// Matches loudness: scales the cue so its loudest 400 ms stretch has the target RMS (in dBFS), then holds every peak
// under the ceiling with a limiter that sees 5 ms ahead and lets go over 80 ms, and fades the last 30 ms. Loudness is
// weighed through a high-pass at 120 Hz, near where a laptop's speakers fall off, so a drum is not left too quiet there.
export function master(x, targetDb = -18, ceilingDb = -1) {
  const win = Math.round(0.4 * SR);
  const hop = Math.round(0.05 * SR);
  const heard = lowpass(Float32Array.from(x), () => 120, 0.707, true);
  let loud = 0;
  for (let s = 0; s + win <= Math.max(x.length, win); s += hop) {
    let e = 0;
    for (let i = s; i < Math.min(s + win, x.length); i += 1) e += heard[i] * heard[i];
    loud = Math.max(loud, Math.sqrt(e / win));
  }
  const g = loud ? 10 ** (targetDb / 20) / loud : 1;
  const ceiling = 10 ** (ceilingDb / 20);
  const need = new Float32Array(x.length);
  for (let i = 0; i < x.length; i += 1) need[i] = Math.min(1, ceiling / Math.max(1e-9, Math.abs(x[i] * g)));
  const look = Math.round(0.005 * SR);
  const release = Math.exp(-1 / (0.08 * SR));
  let gain = 1;
  for (let i = 0; i < x.length; i += 1) {
    let want = 1;
    for (let j = i; j < Math.min(i + look, x.length); j += 1) want = Math.min(want, need[j]);
    gain = want < gain ? want : want - (want - gain) * release;
    x[i] *= g * gain;
  }
  const fade = Math.round(0.03 * SR);
  for (let i = 0; i < fade && i < x.length; i += 1) x[x.length - 1 - i] *= i / fade;
  return x;
}

// Writes mono 16-bit PCM.
export function writeWav(file, x) {
  const data = Buffer.alloc(x.length * 2);
  for (let i = 0; i < x.length; i += 1) data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), i * 2);
  const head = Buffer.alloc(44);
  head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
  head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
  head.writeUInt32LE(SR, 24); head.writeUInt32LE(SR * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
  head.write('data', 36); head.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([head, data]));
}
