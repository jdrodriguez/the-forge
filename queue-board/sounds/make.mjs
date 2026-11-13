#!/usr/bin/env node
// make.mjs: renders the queue herald's alert cues (herald.mjs) into sounds/*.wav, mono 16-bit PCM at 44.1 kHz, each
// mastered to the same loudness. Every cue is synthesized here from dsp.mjs, with melodies written for this board and
// taken from no film or game, and the noise is seeded, so running it again writes the same files.
//   node sounds/make.mjs            writes every cue
//   node sounds/make.mjs needs ci   writes only those
import path from 'node:path';
import { SR, track, strike, pluck, horn, drum, knock, master, writeWav, rng } from './dsp.mjs';

const DIR = path.dirname(new URL(import.meta.url).pathname);

// A hand bell: a strong fundamental and a few inharmonic partials, the lowest two a hair apart so the tone shimmers.
const HANDBELL = [[1, 1, 0.9], [1.003, 0.35, 0.9], [2, 0.42, 0.55], [2.76, 0.26, 0.38], [4.07, 0.14, 0.24], [5.4, 0.07, 0.15]];
// A big tower bell, struck once: hum, prime, minor-third tierce, quint, nominal and the upper partials over it.
const TOWER = [[0.5, 0.55, 3.2], [1, 0.6, 2.4], [1.19, 0.45, 1.9], [1.5, 0.22, 1.4], [2, 0.85, 1.6], [2.006, 0.3, 1.6],
  [2.5, 0.18, 0.9], [3, 0.24, 0.7], [4.2, 0.12, 0.45]];
// A small steel bar, as a marimba's or glockenspiel's: the fundamental and two far partials that die fast.
const BAR = [[1, 1, 0.32], [3.93, 0.22, 0.07], [9.2, 0.05, 0.025]];

const CUES = {
  // Needs you: a clear two-tone hand bell, E5 then the B5 a fifth above.
  needs() {
    const x = track(2.0);
    strike(x, 0.01, 659.26, HANDBELL, 0.8);
    strike(x, 0.3, 987.77, HANDBELL, 1);
    return x;
  },
  // Reminder: three soft taps on a bar rising up an E major chord, gentler than the bell.
  reminder() {
    const x = track(1.4);
    [[415.3, 0], [493.88, 0.15], [659.26, 0.3]].forEach(([f, t], i) => strike(x, t, f, BAR, 0.7 + 0.15 * i));
    strike(x, 0.3, 1318.5, BAR, 0.12);
    return x;
  },
  // Trouble: a low tower bell tolled twice, with the clapper's knock under each strike.
  trouble() {
    const x = track(4.8);
    for (const [t, g] of [[0.02, 1], [1.75, 0.85]]) {
      strike(x, t, 146.83, TOWER, g, 0.004);
      knock(x, t, 0.25 * g, 1800, 0.012, 7 + t * 100);
    }
    return x;
  },
  // CI failing: a short orc drum, a heavy beat, a pair of quick ones and a last heavy one.
  ci() {
    const x = track(2.0);
    [[0, 1], [0.36, 0.6], [0.5, 0.75], [0.82, 1.15]].forEach(([t, v], i) => drum(x, t, v, 11 + i));
    return x;
  },
  // Rivendell merge: a harp run up a D major pentatonic, ending on a two-string chord.
  'merge-rivendell'() {
    const x = track(3.0);
    const run = [293.66, 369.99, 440, 493.88, 587.33, 739.99, 880];
    run.forEach((f, i) => pluck(x, 0.02 + i * 0.085, f, 0.5, 21 + i, { bright: 0.35, sustain: 0.997 }));
    const end = 0.02 + run.length * 0.085 + 0.08;
    pluck(x, end, 587.33, 0.42, 31, { bright: 0.3, sustain: 0.998 });
    pluck(x, end + 0.02, 1174.66, 0.32, 32, { bright: 0.3, sustain: 0.997 });
    return x;
  },
  // Shire merge: a little whistled jig in G, with a slide into each note and a breath of air around the tone.
  'merge-shire'() {
    const notes = [[783.99, 0.11], [987.77, 0.11], [880, 0.11], [783.99, 0.11], [1174.66, 0.22], [987.77, 0.11],
      [1046.5, 0.11], [880, 0.11], [783.99, 0.42]];
    return whistle(notes);
  },
  // Erebor merge: a dwarvish horn call in B-flat (2026-11-06: the dwarves of the stories use horns a lot), apart from the war
  // horn's D and the victory call's D major. A short low blast, then a second that climbs a fifth and an octave to a
  // held note, with a fifth below it for weight, and that note coming back fainter and darker off the mountain's halls.
  'merge-erebor'() {
    const x = track(3.0);
    horn(x, 0.02, [[116.54, 0.3]], { gain: 0.17, cutoff: 1100, attack: 0.05 });
    horn(x, 0.44, [[116.54, 0.16], [174.61, 0.16], [233.08, 1.05]], { gain: 0.17, cutoff: 1300, attack: 0.05 });
    horn(x, 0.76, [[116.54, 0.85]], { gain: 0.07, cutoff: 700, attack: 0.12 });
    horn(x, 1.62, [[233.08, 0.95]], { gain: 0.045, cutoff: 650, attack: 0.15 });
    return x;
  },
  // Rohan merge: a horn of the Mark in F, brighter and higher than Erebor's B-flat and the war horn's D, as a rider's horn
  // carries across open grassland. Two short calls on the tonic, a rise through the fifth to the octave held long over a
  // soft fifth below, and the octave answered twice, fainter each time, from the hills round the plain.
  'merge-rohan'() {
    const x = track(3.4);
    horn(x, 0.02, [[174.61, 0.12]], { gain: 0.15, cutoff: 1700, attack: 0.03 });
    horn(x, 0.2, [[174.61, 0.12]], { gain: 0.15, cutoff: 1700, attack: 0.03 });
    horn(x, 0.4, [[174.61, 0.14], [261.63, 0.14], [349.23, 1.0]], { gain: 0.16, cutoff: 1900, attack: 0.04 });
    horn(x, 0.68, [[174.61, 0.82]], { gain: 0.06, cutoff: 800, attack: 0.1 });
    horn(x, 1.62, [[349.23, 0.6]], { gain: 0.05, cutoff: 900, attack: 0.12 });
    horn(x, 2.3, [[349.23, 0.6]], { gain: 0.025, cutoff: 700, attack: 0.15 });
    return x;
  },
  // Main red: the war horn, as horn.js played it in the browser. Four bars of marching drums under two low calls, the
  // first rising a fifth, the second climbing a minor triad over a held fifth below.
  'main-red'() {
    const x = track(7.6);
    const eighth = 0.22;
    const bar = [[0, 1], [3, 0.55], [4, 0.85], [6, 0.55], [7, 0.6]];
    let seed = 50;
    for (let b = 0; b < 4; b += 1) {
      for (const [e, v] of b < 3 ? bar : [[0, 1], [2, 0.6], [4, 1.2]]) drum(x, 0.05 + (b * 8 + e) * eighth, v, (seed += 1));
    }
    horn(x, 0.3, [[73.42, 1.3], [110, 1.6]], { gain: 0.2 });
    horn(x, 3.75, [[73.42, 0.55], [87.31, 0.55], [110, 2.2]], { gain: 0.2 });
    horn(x, 3.75, [[55, 3.3]], { gain: 0.12, cutoff: 500 });
    return x;
  },
  // Main green again: the short victory call, rising up a D major chord, with a soft voice an octave below.
  'main-green'() {
    const x = track(1.6);
    const call = [[293.66, 0.16], [369.99, 0.16], [440, 0.16], [587.33, 0.75]];
    horn(x, 0.03, call, { gain: 0.07, wave: 'triangle', cutoff: 2200, attack: 0.03 });
    horn(x, 0.03, call.map(([f, d]) => [f / 2, d]), { gain: 0.035, wave: 'saw', cutoff: 900, attack: 0.03 });
    return x;
  },
};

// A whistle: a sine with a little second harmonic, a vibrato that grows on held notes, a 25 ms slide into each note, a
// quick chirp up into the first, and filtered breath noise that follows the level.
function whistle(notes) {
  const total = notes.reduce((s, [, d]) => s + d, 0) + 0.15;
  const x = track(total);
  const r = rng(77);
  let ph = 0, t = 0, k = 0, breath = 0;
  const starts = [];
  notes.reduce((s, [, d]) => (starts.push(s), s + d), 0.02);
  for (let i = 0; i < x.length; i += 1) {
    t = i / SR;
    while (k + 1 < notes.length && t >= starts[k + 1]) k += 1;
    const into = t - starts[k];
    const from = k ? notes[k - 1][0] : notes[0][0] * 0.84;
    const f = into < 0.025 ? from * (notes[k][0] / from) ** (Math.max(0, into) / 0.025) : notes[k][0];
    const vib = 1 + Math.min(1, Math.max(0, into - 0.08) / 0.2) * 0.006 * Math.sin(2 * Math.PI * 6 * t);
    ph += (2 * Math.PI * f * vib) / SR;
    const end = starts.at(-1) + notes.at(-1)[1];
    let env = Math.min(1, (t - 0.02) / 0.03);
    if (t > end - 0.12) env *= Math.max(0, (end - t) / 0.12);
    // Each note swells a little and eases off just before the next one.
    const left = (k + 1 < notes.length ? starts[k + 1] : end) - t;
    env *= Math.max(0, 0.82 + 0.18 * Math.min(1, into / 0.04)) * (left < 0.02 ? 0.75 + 12.5 * left : 1);
    breath += 0.25 * ((r() * 2 - 1) - breath);
    x[i] = Math.max(0, env) * (Math.sin(ph) + 0.08 * Math.sin(2 * ph) + 0.05 * breath);
  }
  return x;
}

// Loudness per cue, in dBFS over its loudest 400 ms; the reminder sits a little under the rest.
const LEVEL = { reminder: -21 };
const only = process.argv.slice(2);
for (const [name, render] of Object.entries(CUES)) {
  if (only.length && !only.includes(name)) continue;
  const x = master(render(), LEVEL[name] ?? -18);
  writeWav(path.join(DIR, `${name}.wav`), x);
  console.log(`${name}.wav ${(x.length / SR).toFixed(2)}s`);
}
