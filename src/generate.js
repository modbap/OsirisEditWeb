/*
 * OsirisEdit Web: wavetable generators (generate.js)
 *
 * Copyright (C) 2026 Modbap Modular (Beatppl Inc.)
 *
 * Original work by Modbap Modular, 2026. No upstream counterpart. Part of the
 * combined OsirisEdit Web program and licensed under the same terms.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free
 * Software Foundation, either version 3 of the License, or (at your option)
 * any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
 * more details.
 *
 * You should have received a copy of the GNU General Public License along
 * with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * See NOTICE.md in this repository for the full lineage and the GPL v3
 * section 5(a) statement of modifications.
 */

// generate.js — full-wavetable generators for OsirisEdit Web.
// Fills all 32 waveforms (each WAVE_LEN=256 samples) with generated content.
// Coherence (0..1) controls how smoothly the 32 waves evolve across the morph axis:
//   1 = glide (interpolate between two endpoints), 0 = each wave independent.
//
// Each generator returns Float32Array[BANK_LEN] of 256-sample waves, normalized to ~[-1,1].
// Generators do NOT touch the DSP — app.js writes these into bank[j].samples then commitSamples().

const TAU = Math.PI * 2;

// seeded RNG (mulberry32) so a given seed reproduces a table
function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, f) => a + (b - a) * f;

function normalize(wave) {
  let max = -Infinity, min = Infinity;
  for (let i = 0; i < wave.length; i++) { if (wave[i] > max) max = wave[i]; if (wave[i] < min) min = wave[i]; }
  const span = max - min;
  if (span < 1e-9) { wave.fill(0); return wave; }
  const mid = (max + min) / 2;
  for (let i = 0; i < wave.length; i++) wave[i] = (wave[i] - mid) / (span / 2);
  return wave;
}

// Build one wave from a harmonic-amplitude + phase spec.
function fromHarmonics(N, amps, phases) {
  const w = new Float32Array(N);
  const H = amps.length;
  for (let i = 0; i < N; i++) {
    const t = i / N; let s = 0;
    for (let h = 1; h <= H; h++) {
      const a = amps[h - 1]; if (a === 0) continue;
      s += a * Math.sin(TAU * h * t + (phases ? phases[h - 1] : 0));
    }
    w[i] = s;
  }
  return normalize(w);
}

// ---- 1. HARMONIC MORPH — interpolate a start spectrum to an end spectrum ----
function genHarmonicMorph(N, BANK, coherence, seed) {
  const r = rng(seed);
  const H = 24;
  const mk = () => { const a = new Float32Array(H); for (let h = 0; h < H; h++) a[h] = Math.pow(r(), 2.2) / (h + 1); return a; };
  const startA = mk(), endA = mk();
  const out = [];
  for (let j = 0; j < BANK; j++) {
    const f = j / (BANK - 1);
    const amps = new Float32Array(H);
    for (let h = 0; h < H; h++) {
      const base = lerp(startA[h], endA[h], f);
      const jitter = (1 - coherence) * (r() - 0.5) * 0.6;
      amps[h] = Math.max(0, base + jitter);
    }
    out.push(fromHarmonics(N, amps));
  }
  return out;
}

// ---- 2. ADDITIVE RANDOM — random harmonic stacks with falloff, lightly correlated ----
function genAdditive(N, BANK, coherence, seed) {
  const r = rng(seed);
  const H = 32;
  let prev = new Float32Array(H);
  for (let h = 0; h < H; h++) prev[h] = Math.pow(r(), 1.8) / Math.pow(h + 1, 0.8);
  const out = [];
  for (let j = 0; j < BANK; j++) {
    const amps = new Float32Array(H);
    for (let h = 0; h < H; h++) {
      const fresh = Math.pow(r(), 1.8) / Math.pow(h + 1, 0.8);
      amps[h] = lerp(fresh, prev[h], coherence); // high coherence -> stays near previous
    }
    const phases = new Float32Array(H);
    for (let h = 0; h < H; h++) phases[h] = r() * TAU * (1 - coherence);
    out.push(fromHarmonics(N, amps, phases));
    prev = amps;
  }
  return out;
}

// ---- 3. CATALOG SHAPES — morph between classic waveforms ----
function shape(kind, N, param = 0.5) {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / N;
    switch (kind) {
      case 0: w[i] = Math.sin(TAU * t); break;                         // sine
      case 1: w[i] = 2 * t - 1; break;                                  // saw
      case 2: w[i] = t < 0.5 ? 1 : -1; break;                           // square
      case 3: w[i] = t < param ? 1 : -1; break;                         // pulse (param width)
      case 4: w[i] = 2 * Math.abs(2 * t - 1) - 1; break;                // triangle
      case 5: { const f1 = 3, f2 = 7;                                   // formant-ish
        w[i] = Math.sin(TAU * t) * (0.6 + 0.4 * Math.cos(TAU * f1 * t)) + 0.3 * Math.sin(TAU * f2 * t); break; }
      default: w[i] = Math.sin(TAU * t);
    }
  }
  return normalize(w);
}
function genCatalog(N, BANK, coherence, seed) {
  const r = rng(seed);
  const kinds = [0, 1, 2, 3, 4, 5];
  // pick a sequence of shapes to morph through
  const stops = 3 + Math.floor(r() * 3);
  const seq = Array.from({ length: stops }, () => kinds[Math.floor(r() * kinds.length)]);
  const params = Array.from({ length: stops }, () => 0.1 + r() * 0.8);
  const out = [];
  for (let j = 0; j < BANK; j++) {
    const pos = (j / (BANK - 1)) * (stops - 1);
    const i0 = Math.floor(pos), i1 = Math.min(stops - 1, i0 + 1);
    let f = pos - i0;
    f = lerp(j / (BANK - 1) > 0 ? (r() < (1 - coherence) ? Math.round(f) : f) : f, f, coherence); // less coherent -> snappier
    const a = shape(seq[i0], N, params[i0]);
    const b = shape(seq[i1], N, params[i1]);
    const w = new Float32Array(N);
    for (let i = 0; i < N; i++) w[i] = lerp(a[i], b[i], f);
    out.push(normalize(w));
  }
  return out;
}

// ---- 4. GLITCH / CHAOS — random spectra + sample noise, coherence tames it ----
function genGlitch(N, BANK, coherence, seed) {
  const r = rng(seed);
  const H = 40;
  let prev = null;
  const out = [];
  for (let j = 0; j < BANK; j++) {
    const amps = new Float32Array(H), phases = new Float32Array(H);
    for (let h = 0; h < H; h++) {
      const fresh = (r() < 0.5 ? 0 : r()) / Math.pow(h + 1, 0.3); // sparse, bright
      amps[h] = prev ? lerp(fresh, prev[h], coherence) : fresh;
      phases[h] = r() * TAU;
    }
    const w = fromHarmonics(N, amps, phases);
    // add a touch of sample-rate glitch when coherence is low
    const glitch = (1 - coherence) * 0.5;
    if (glitch > 0) for (let i = 0; i < N; i++) if (r() < glitch * 0.1) w[i] = r() * 2 - 1;
    out.push(normalize(w));
    prev = amps;
  }
  return out;
}

// ---- 5. FM / PHASE-DISTORTION — carrier modulated by swept ratio/index ----
function genFM(N, BANK, coherence, seed) {
  const r = rng(seed);
  const ratioStart = 1 + Math.floor(r() * 4);
  const ratioEnd = 1 + Math.floor(r() * 8);
  const idxStart = 0.5 + r() * 2;
  const idxEnd = 1 + r() * 6;
  const out = [];
  for (let j = 0; j < BANK; j++) {
    const f = j / (BANK - 1);
    const ratio = Math.round(lerp(ratioStart, ratioEnd, f) + (1 - coherence) * (r() - 0.5) * 3);
    const index = lerp(idxStart, idxEnd, f) + (1 - coherence) * (r() - 0.5) * 2;
    const w = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const t = i / N;
      w[i] = Math.sin(TAU * t + Math.max(0, index) * Math.sin(TAU * Math.max(1, ratio) * t));
    }
    out.push(normalize(w));
  }
  return out;
}

export const GENERATORS = {
  harmonic: { label: 'Harmonic Morph', fn: genHarmonicMorph },
  additive: { label: 'Additive Random', fn: genAdditive },
  catalog:  { label: 'Catalog Shapes', fn: genCatalog },
  glitch:   { label: 'Glitch / Chaos', fn: genGlitch },
  fm:       { label: 'FM / Phase Dist', fn: genFM },
};

// Returns Float32Array[BANK] of 256-sample waves.
export function generateWavetable(kind, { N = 256, bank = 32, coherence = 0.7, seed } = {}) {
  const g = GENERATORS[kind]; if (!g) throw new Error('Unknown generator: ' + kind);
  const s = (seed == null) ? (Math.random() * 0xffffffff) >>> 0 : seed;
  return g.fn(N, bank, Math.max(0, Math.min(1, coherence)), s);
}
