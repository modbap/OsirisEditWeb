# CLAUDE.md — orientation for Claude Code

Read this first, every session. It pins the project's rules so work doesn't drift.

## What this is

A browser/Web Audio port of **OsirisEdit** — the wavetable editor for the Modbap Osiris
eurorack module. Lineage: Andrew Belt's **WaveEdit** -> **switchupcb/OsirisEdit** ->
**modbap/OsirisEdit** (C++) -> this independent JS repo. The native x86 binary stopped
running when Apple dropped Rosetta 2; this web version replaces it permanently. New codebase,
not a GitHub fork.

## Build OsirisEdit, not WaveEdit

OsirisEdit is a fork of WaveEdit. The two share the entire DSP engine **unchanged**, but
OsirisEdit added the features that make it Osiris-specific. **This port must match OsirisEdit's
behavior, not WaveEdit's.** The authoritative diff and parity checklist is in
`docs/OSIRISEDIT_VS_WAVEEDIT.md`. Terminology and data model are in `docs/OSIRIS_MODEL.md`.
The official manual is the hosted manual (https://cdn.shopify.com/s/files/1/0597/8665/7952/files/OsirisEdit_User_Manual_v1.pdf). Consult these before UI work.

Vocabulary (Osiris terms — use these in all user-facing text):
- **Waveform** = 256 samples (one wav). Code: `Wave`, `WAVE_LEN = 256`.
- **Wavetable** = a set of 16/32/64 waveforms (default 32). The thing the editor edits.
  WaveEdit called it a "bank" — do NOT call it a bank in the UI.
- **Bank / WavPak** = the SD-card container (folders A/B/C/D) produced by **Convert**.

Internal identifiers `Bank` / `BANK_LEN` may remain to limit churn, but every user-facing
string says "wavetable" for the 32-waveform set.

## The non-negotiable rule: DSP fidelity

`src/wave.js` is a faithful port of `wave.cpp` (identical in WaveEdit and OsirisEdit — Osiris
did not touch the DSP). It is verified against the original C++ compiled with the real pffft
library, not merely unit-tested. **Any DSP change must keep `npm test` passing**, worst-case
error vs the C reference ~1e-5 (float/double rounding). Higher error = the sound changed = wrong
unless intentional and re-baselined.

- `test/verify-dsp.mjs` — diffs JS vs `test/c_ref.json` across all 12 effects + cycle + normalize.
- `test/check-logic.mjs` — WAV encode, resampler, harmonic round-trips.
- `npm test` runs both.

Preserve conventions exactly: RFFT scaled by 1/N; harmonics = magnitude x 2; pffft "ordered"
packing [DC, Nyquist, Re1, Im1, ...]; effect order = pre-gain, phase shift, harmonic shift,
comb, ring, Chebyshev, sample & hold, quantization, slew, lowpass, highpass, post-gain, then
cycle, normalize, hard-clip.

## Osiris spec constants (do not let these drift)

- `WAVE_LEN = 256` — samples per waveform
- wavetable length — selectable 16 / 32 / 64, default 32
- 8x8 morph grid (for the 32 case)
- 12 effects, fixed order
- Save Wavetable: mono WAV, length x 256 samples, 44.1 kHz / 16-bit
- WavPak (Convert): folders A/B/C/D, <=32 wavetables each, <=128 total, 16-bit/44.1k on card

## Outstanding work to reach OsirisEdit parity (priority order)

See `docs/OSIRISEDIT_VS_WAVEEDIT.md` for exact behavior. Summary:
1. **Convert -> WavPak export** — defining Osiris feature; NOT yet built. In-browser: select
   saved wavetable WAVs -> downloadable ZIP with A/B/C/D structure, re-encoded to chosen
   rate/bit-depth/length. Match C++ byte semantics (re-container + re-quantize, no sample-data
   resampling).
2. **Selectable wavetable length 16/32/64** — currently hard-coded 32.
3. **Effect Editor all-waveforms model** — Average slider + 32 per-waveform bars per effect,
   Cycle/Normalize All/None. Current port edits only the selected waveform.
4. **Catalog presets** — port the real Digital/Analog/FM/Glitch WAV catalog (currently 4 stubs).
5. **Copy All / Paste All**, and Import **Replace Partial + Trim** controls.
6. (Optional) sinc resampler for import parity; WASM DSP for bit-exactness.

## Conventions

- Pure ES modules, no framework, no bundler for dev. Dependency-light (only `jsdom`, for tests).
- No browser storage APIs; state lives in memory.
- Touch `src/wave.js` -> run `npm test` before calling it done.
- Touch UI -> check against the manual and the parity spec, not memory of WaveEdit.

## Deploy / custom domain (do not break this)

Served via GitHub Pages at **https://osirisedit.modbap.com** (CNAME `osirisedit` → `modbap.github.io` at GoDaddy).
The repo-root **`CNAME`** file contains `osirisedit.modbap.com` and binds the custom
domain. It MUST stay in the repo root. Installer drops use `git add -A`, so never
delete or overwrite `CNAME` — if a drop omits it, GitHub unbinds the domain and the
site 404s on the subdomain until it's restored.
