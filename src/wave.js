/*
 * OsirisEdit Web: DSP core (wave.js)
 *
 * Copyright (C) 2026 Modbap Modular (Beatppl Inc.)
 * Portions Copyright (C) 2017 Andrew Belt, developed for Synthesis Technology.
 *
 * MODIFIED WORK. This file is a port of the upstream sources src/wave.cpp
 * and src/math.cpp, translated from C++ to ES modules by Modbap Modular in
 * 2026. The pffft dependency was replaced with an in-tree real FFT that
 * reproduces pffft's "ordered" packing. The effect math, effect order, FFT
 * scaling and harmonic conventions are unchanged from upstream.
 * Upstream: https://github.com/AndrewBelt/WaveEdit (GPL-3.0)
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

// wave.js — faithful 1:1 port of OsirisEdit src/wave.cpp + src/math.cpp
// Constants and conventions match the original exactly.
//   WAVE_LEN = 256, RFFT scaled by 1/N, harmonics = magnitude * 2.
// FFT here is a plain (unscaled forward / unnormalized inverse) real-input
// complex-output transform laid out to mirror pffft's "ordered" packing:
//   out[0]   = DC (real),          out[1]   = Nyquist (real)
//   out[2k], out[2k+1] = Re,Im of bin k   for k = 1 .. N/2-1
// RFFT() then multiplies by 1/N (as in math.cpp), IRFFT() does the inverse.

export const WAVE_LEN = 256;

export const EffectID = {
  PRE_GAIN: 0, PHASE_SHIFT: 1, HARMONIC_SHIFT: 2, COMB: 3, RING: 4,
  CHEBYSHEV: 5, SAMPLE_AND_HOLD: 6, QUANTIZATION: 7, SLEW: 8,
  LOWPASS: 9, HIGHPASS: 10, POST_GAIN: 11, EFFECTS_LEN: 12,
};
export const EFFECTS_LEN = EffectID.EFFECTS_LEN;

export const effectNames = [
  'Pre-Gain', 'Phase Shift', 'Harmonic Shift', 'Comb Filter', 'Ring Modulation',
  'Chebyshev Wavefolding', 'Sample & Hold', 'Quantization', 'Slew Limiter',
  'Lowpass Filter', 'Highpass Filter', 'Post-Gain',
];

// ---- scalar math (math.cpp inlines) ----
const clampf = (x, lo, hi) => (x > hi ? hi : x < lo ? lo : x);
const crossf = (a, b, f) => (1.0 - f) * a + f * b;
const rescalef = (x, xMin, xMax, yMin, yMax) =>
  yMin + ((x - xMin) / (xMax - xMin)) * (yMax - yMin);
const eucmodi = (a, base) => { const m = a % base; return m < 0 ? m + base : m; };
function linterpf(p, x) {
  const xi = Math.trunc(x);
  const xf = x - xi;
  if (xf < 1e-6) return p[xi];
  return crossf(p[xi], p[xi + 1], xf);
}

// ---- real FFT (radix-2, N must be power of two; 256 is) ----
// Produces full complex spectrum, then repacks to pffft-ordered real layout.
function fftRadix2(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cwr - im[i + k + len / 2] * cwi;
        const vi = re[i + k + len / 2] * cwi + im[i + k + len / 2] * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncwr = cwr * wr - cwi * wi;
        cwi = cwr * wi + cwi * wr; cwr = ncwr;
      }
    }
  }
}

// forward real transform -> pffft-ordered packing (NOT yet 1/N scaled)
function rfftRaw(input, out) {
  const n = input.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = input[i];
  fftRadix2(re, im, false);
  out[0] = re[0];          // DC
  out[1] = re[n / 2];      // Nyquist
  for (let k = 1; k < n / 2; k++) { out[2 * k] = re[k]; out[2 * k + 1] = im[k]; }
}

// inverse from pffft-ordered packing -> real samples (unnormalized, matches pffft BACKWARD)
function irfftRaw(spec, out) {
  const n = out.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  re[0] = spec[0]; im[0] = 0;
  re[n / 2] = spec[1]; im[n / 2] = 0;
  for (let k = 1; k < n / 2; k++) {
    re[k] = spec[2 * k]; im[k] = spec[2 * k + 1];
    re[n - k] = spec[2 * k]; im[n - k] = -spec[2 * k + 1];
  }
  fftRadix2(re, im, true);
  for (let i = 0; i < n; i++) out[i] = re[i];
}

// math.cpp RFFT: forward then * (1/len)
export function RFFT(input, out) {
  rfftRaw(input, out);
  const a = 1.0 / input.length;
  for (let i = 0; i < out.length; i++) out[i] *= a;
}
// math.cpp IRFFT: plain backward (the 1/N already applied on the forward side)
export function IRFFT(spec, out) { irfftRaw(spec, out); }

const cmult = (ar, ai, br, bi) => [ar * br - ai * bi, ar * bi + ai * br];

export class Wave {
  constructor() {
    this.samples = new Float32Array(WAVE_LEN);
    this.spectrum = new Float32Array(WAVE_LEN);
    this.harmonics = new Float32Array(WAVE_LEN / 2);
    this.postSamples = new Float32Array(WAVE_LEN);
    this.postSpectrum = new Float32Array(WAVE_LEN);
    this.postHarmonics = new Float32Array(WAVE_LEN / 2);
    this.effects = new Float32Array(EFFECTS_LEN);
    this.cycle = false;
    this.normalize = false;
  }

  clear() {
    this.samples.fill(0); this.spectrum.fill(0); this.harmonics.fill(0);
    this.postSamples.fill(0); this.postSpectrum.fill(0); this.postHarmonics.fill(0);
    this.effects.fill(0); this.cycle = false; this.normalize = false;
  }

  updatePost() {
    const N = WAVE_LEN;
    const e = this.effects;
    const out = new Float32Array(this.samples); // copy

    // Pre-gain
    if (e[EffectID.PRE_GAIN]) {
      const gain = Math.pow(20.0, e[EffectID.PRE_GAIN]);
      for (let i = 0; i < N; i++) out[i] *= gain;
    }

    // Temporal & Harmonic Shift
    if (e[EffectID.PHASE_SHIFT] > 0.0 || e[EffectID.HARMONIC_SHIFT] > 0.0) {
      const tmp = new Float32Array(N);
      RFFT(out, tmp);
      for (let k = 0; k < N / 2; k++) {
        const phase = clampf(e[EffectID.HARMONIC_SHIFT], 0, 1) +
                      clampf(e[EffectID.PHASE_SHIFT], 0, 1) * k;
        const br = Math.cos(2 * Math.PI * phase);
        const bi = -Math.sin(2 * Math.PI * phase);
        const [cr, ci] = cmult(tmp[2 * k], tmp[2 * k + 1], br, bi);
        tmp[2 * k] = cr; tmp[2 * k + 1] = ci;
      }
      IRFFT(tmp, out);
    }

    // Comb filter
    if (e[EffectID.COMB] > 0.0) {
      const base = 0.75, taps = 40;
      const kernel = new Float32Array(N);
      for (let k = 0; k < N / 2; k++) {
        for (let j = 0; j < taps; j++) {
          let amplitude = Math.pow(base, j) * (1.0 - base);
          const phase = -2.0 * Math.PI * k * e[EffectID.COMB] * j;
          kernel[2 * k] += amplitude * Math.cos(phase);
          kernel[2 * k + 1] += amplitude * Math.sin(phase);
        }
      }
      const fft = new Float32Array(N);
      RFFT(out, fft);
      for (let k = 0; k < N / 2; k++) {
        const [cr, ci] = cmult(fft[2 * k], fft[2 * k + 1], kernel[2 * k], kernel[2 * k + 1]);
        fft[2 * k] = cr; fft[2 * k + 1] = ci;
      }
      IRFFT(fft, out);
    }

    // Ring modulation
    if (e[EffectID.RING] > 0.0) {
      const ring = Math.ceil(Math.pow(e[EffectID.RING], 2) * (N / 2 - 2));
      for (let i = 0; i < N; i++) {
        const phase = (i / N) * ring;
        out[i] *= Math.sin(2 * Math.PI * phase);
      }
    }

    // Chebyshev waveshaping
    if (e[EffectID.CHEBYSHEV] > 0.0) {
      const n = Math.pow(50.0, e[EffectID.CHEBYSHEV]);
      for (let i = 0; i < N; i++) {
        if (out[i] >= -1.0 && out[i] <= 1.0) out[i] = Math.sin(n * Math.asin(out[i]));
        else out[i] = Math.sin(n * Math.asin(1.0 / out[i]));
      }
    }

    // Sample & Hold
    if (e[EffectID.SAMPLE_AND_HOLD] > 0.0) {
      const frameskip = Math.pow(N / 2.0, clampf(e[EffectID.SAMPLE_AND_HOLD], 0, 1));
      const tmp = new Float32Array(N + 1);
      tmp.set(out); tmp[N] = out[0];
      for (let i = 0; i < N; i++) {
        const index = Math.round(i / frameskip) * frameskip;
        out[i] = linterpf(tmp, clampf(index, 0, N - 1));
      }
    }

    // Quantization
    if (e[EffectID.QUANTIZATION] > 1e-3) {
      const levels = Math.pow(clampf(e[EffectID.QUANTIZATION], 0, 1), -1.5);
      for (let i = 0; i < N; i++) out[i] = Math.round(out[i] * levels) / levels;
    }

    // Slew limiter
    if (e[EffectID.SLEW] > 0.0) {
      const slew = Math.pow(0.001, e[EffectID.SLEW]);
      let y = out[0];
      for (let i = 1; i < N; i++) {
        const dxdt = out[i] - y;
        y += clampf(dxdt, -slew, slew);
        out[i] = y;
      }
    }

    // Brick-wall LP/HP
    if (e[EffectID.LOWPASS] > 0.0 || e[EffectID.HIGHPASS]) {
      const fft = new Float32Array(N);
      RFFT(out, fft);
      const lowpass = 1.0 - e[EffectID.LOWPASS];
      const highpass = e[EffectID.HIGHPASS];
      for (let i = 1; i < N / 2; i++) {
        const v = clampf(N / 2 * lowpass - i, 0, 1) * clampf(-N / 2 * highpass + i, 0, 1);
        fft[2 * i] *= v; fft[2 * i + 1] *= v;
      }
      IRFFT(fft, out);
    }

    // Post gain
    if (e[EffectID.POST_GAIN]) {
      const gain = Math.pow(20.0, e[EffectID.POST_GAIN]);
      for (let i = 0; i < N; i++) out[i] *= gain;
    }

    // Cycle
    if (this.cycle) {
      const start = out[0];
      const end = out[N - 1] / (N - 1) * N;
      for (let i = 0; i < N; i++) out[i] -= (end - start) * (i - N / 2) / N;
    }

    // Normalize
    if (this.normalize) {
      let max = -Infinity, min = Infinity;
      for (let i = 0; i < N; i++) { if (out[i] > max) max = out[i]; if (out[i] < min) min = out[i]; }
      if (max - min >= 1e-6) for (let i = 0; i < N; i++) out[i] = rescalef(out[i], min, max, -1, 1);
      else out.fill(0);
    }

    // Hard clip
    for (let i = 0; i < N; i++) out[i] = clampf(out[i], -1, 1);

    this.postSamples.set(out);
    RFFT(this.postSamples, this.postSpectrum);
    for (let i = 0; i < N / 2; i++)
      this.postHarmonics[i] = Math.hypot(this.postSpectrum[2 * i], this.postSpectrum[2 * i + 1]) * 2.0;
  }

  commitSamples() {
    RFFT(this.samples, this.spectrum);
    for (let i = 0; i < WAVE_LEN / 2; i++)
      this.harmonics[i] = Math.hypot(this.spectrum[2 * i], this.spectrum[2 * i + 1]) * 2.0;
    this.updatePost();
  }

  commitHarmonics() {
    const N = WAVE_LEN;
    for (let i = 0; i < N / 2; i++) {
      const oldH = Math.hypot(this.spectrum[2 * i], this.spectrum[2 * i + 1]);
      const newH = this.harmonics[i] / 2.0;
      if (oldH > 1e-6) {
        const ratio = newH / oldH;
        if (i === 0) { this.spectrum[0] *= ratio; this.spectrum[1] = 0.0; }
        else { this.spectrum[2 * i] *= ratio; this.spectrum[2 * i + 1] *= ratio; }
      } else {
        if (i === 0) { this.spectrum[0] = newH; this.spectrum[1] = 0.0; }
        else { this.spectrum[2 * i] = 0.0; this.spectrum[2 * i + 1] = -newH; }
      }
    }
    IRFFT(this.spectrum, this.samples);
    this.updatePost();
  }

  clearEffects() {
    this.effects.fill(0); this.cycle = false; this.normalize = false; this.updatePost();
  }
  bakeEffects() { this.samples.set(this.postSamples); this.clearEffects(); }
}
