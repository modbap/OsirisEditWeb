# OsirisEdit Web

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](LICENSE)

**Live:** https://osirisedit.modbap.com · **Repo:** https://github.com/modbap/OsirisEditWeb

A browser-based wavetable editor for the **Modbap Osiris** synthesizer. Draw and morph 256-sample waves, shape them with the full effect chain, and export banks as 44.1 kHz / 16-bit WAV — on any modern browser (macOS, Windows, Linux, iPad). No install, no native binary, no Rosetta.

The native OsirisEdit (built for Intel architecture) relies on Apple's Rosetta 2 translation to run on Apple Silicon Macs. As Apple phases Rosetta 2 out, the desktop binary will eventually stop running on new machines. This web edition was built in anticipation of that shift — so whether you're on any Mac (or Windows, Linux, or iPad), the tool keeps working. It isn't a replacement for the desktop app; it's a forward-compatible version of the same application, keeping the DSP faithful while adapting the platform for permanence.

## Lineage & credit

This project stands on prior open-source work, all of it GPL-3.0:

- **[WaveEdit](https://github.com/AndrewBelt/WaveEdit)** by **Andrew Belt**, developed for **Synthesis Technology**: the original C++ / OpenGL wavetable editor this descends from. Copyright (C) 2017 Andrew Belt.
- **[OsirisEdit](https://github.com/modbap/OsirisEdit)**: the C++ desktop editor, a modified version of WaveEdit adapted to the Osiris hardware spec.
- **OsirisEditWeb** (this repo): the browser edition.

**Not a Git fork, but a derivative work.** This repo is not a GitHub fork: it shares no build system, no language, and no commit history with the C++ original. That is a statement about repository mechanics, not about copyright. The DSP was *ported* from the upstream C++, not independently reimplemented: `src/wave.js` is a 1:1 translation of `wave.cpp` + `math.cpp`, and `src/wavpak.js` carries Convert option arrays verbatim from `ui.cpp`. OsirisEditWeb is therefore a **derivative work of WaveEdit** and is licensed under the GPL v3 accordingly. The file-by-file statement of modifications is in [`NOTICE.md`](NOTICE.md).

Note that **WaveEdit itself is cross-platform** (macOS, Windows and Linux). The Rosetta 2 constraint described above applies to the OsirisEdit desktop build, not to the upstream project.

Neither Andrew Belt nor Synthesis Technology endorses this edition or is responsible for it.

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
src/wavpak.js       Convert / WavPak export: WAV re-encode + in-browser ZIP
src/app.js          UI, editor tools, WAV I/O, import, Web Audio morph engine
src/generate.js     wavetable generators (harmonic morph, FM, glitch, ...)
test/verify-dsp.mjs effect-by-effect diff vs. the C reference
test/check-logic.mjs WAV encode, resampler, harmonic round-trip checks
test/c_ref.json     captured output of the original C++ DSP
serve.mjs           zero-dependency static dev server
LICENSE             GNU GPL v3, byte-identical to upstream WaveEdit's
NOTICE.md           lineage, statement of modifications, third-party notes
docs/license.html   in-app Appropriate Legal Notices page (Help menu)
CLAUDE.md           orientation notes for Claude Code sessions
```

## License

**GPL-3.0-or-later.**
Copyright (C) 2026 Modbap Modular (Beatppl Inc.).
Portions copyright (C) 2017 Andrew Belt, developed for Synthesis Technology.

OsirisEditWeb is free software: you may run, study, modify and redistribute it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version. The full text is in [`LICENSE`](LICENSE), byte-identical to upstream WaveEdit's copy.

- **Source availability.** Complete corresponding source is at <https://github.com/modbap/OsirisEditWeb>. Upstream source: [WaveEdit](https://github.com/AndrewBelt/WaveEdit) and [OsirisEdit](https://github.com/modbap/OsirisEdit).
- **Reciprocity.** Anything you distribute that is built on this program must also be released under the GPL v3, with complete corresponding source, retaining these copyright notices and stating what you changed.
- **Third party.** The web edition bundles no third-party code. pffft, Dear ImGui, SDL2, libsamplerate and libsndfile were all replaced during the port; ZIP writing is in-tree; `jsdom` is a test-only dependency and is never served. Fonts load from the Google Fonts CDN and are not redistributed here. Details in [`NOTICE.md`](NOTICE.md).
- **No warranty.** This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for more details.

In-app notices live at [`docs/license.html`](docs/license.html), linked from the Help menu.
