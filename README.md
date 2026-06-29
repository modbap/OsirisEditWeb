# OsirisEdit Web

**Live:** https://osirisedit.modbap.com · **Repo:** https://github.com/modbap/OsirisEditWeb

A browser-based wavetable editor for the **Modbap Osiris** synthesizer. Draw and morph 256-sample waves, shape them with the full effect chain, and export banks as 44.1 kHz / 16-bit WAV — on any modern browser (macOS, Windows, Linux, iPad). No install, no native binary, no Rosetta.

This is a from-scratch web port of the native desktop editor, built because the original x86 binary stopped running once Apple discontinued Rosetta 2 support on Apple Silicon. The web version solves that permanently.

## Lineage & credit

This project stands on prior open-source work:

- **[WaveEdit](https://github.com/AndrewBelt/WaveEdit)** by **Andrew Belt** — the original C++/OpenGL wavetable editor this descends from.
- **[OsirisEdit](https://github.com/switchupcb/OsirisEdit)** — a fork of WaveEdit adapted to the Osiris hardware spec.
- **OsirisEditWeb** (this repo) — an independent JavaScript / Web Audio reimplementation of that editor. It is a new codebase, not a GitHub fork, since it shares no build system or language with the C++ original. The DSP, however, is ported faithfully and verified against it (see below).

## What it does

- **Waveform editor** — pencil, brush, grab, line, smooth, and eraser tools over a 256-sample wave.
- **Harmonic editor** — drag harmonic magnitudes directly; phase is preserved.
- **Effect chain** — 12 effects applied in fixed order (pre-gain, phase/harmonic shift, comb, ring mod, Chebyshev wavefold, sample & hold, quantization, slew, lowpass, highpass, post-gain), plus cycle, normalize, and hard-clip.
- **Bank** — 32 waves, 8×8 morph grid, shuffle, duplicate-to-all.
- **Morph playback** — real-time Z (1-D) and XY (2-D) morphing via Web Audio `AudioWorklet`.
- **Waterfall** view of the whole bank.
- **Audio import** — resample arbitrary audio into the wavetable (gain / offset / zoom, replace / mix / ring-mod modes).
- **Export** — bank or single-wave WAV in the Osiris format (32 × 256 mono, 44.1 kHz, 16-bit).

## DSP fidelity

The DSP core (`src/wave.js`) is a faithful port of the original `wave.cpp`. It is verified — not just unit-tested — against the original C++ compiled against the real **pffft** library. The harness in `test/` diffs JS output against a captured C reference across all 12 effects plus cycle and normalize; the worst-case error is ~1e-5 (float-vs-double rounding, not a logic difference).

```
npm test          # run DSP-fidelity + WAV/resampler/round-trip checks
npm run test:dsp  # DSP effect diff against the C reference only
```

The Osiris spec constants are fixed and must not drift:

| Constant   | Value | Meaning                       |
|------------|-------|-------------------------------|
| `WAVE_LEN` | 256   | samples per wave              |
| `BANK_LEN` | 32    | waves per bank                |
| morph grid | 8×8   | XY morph layout               |
| effects    | 12    | in a fixed, ordered chain     |
| export     | —     | 32×256 mono 16-bit 44.1 kHz   |

## Run it

```
npm install        # only needed for the test suite (jsdom)
npm run serve      # → http://localhost:5173
```

Or just open `index.html` directly in a browser for the app alone.

## Project layout

```
index.html          single-page app shell + styles
src/wave.js         DSP core: Wave model, FFT, 12 effects (verified)
src/app.js          UI, editor tools, WAV I/O, import, Web Audio morph engine
test/verify-dsp.mjs effect-by-effect diff vs. the C reference
test/check-logic.mjs WAV encode, resampler, harmonic round-trip checks
test/c_ref.json     captured output of the original C++ DSP
serve.mjs           zero-dependency static dev server
CLAUDE.md           orientation notes for Claude Code sessions
```

## License

GPL-3.0, inherited from the WaveEdit lineage.
