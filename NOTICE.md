# NOTICE

**OsirisEdit Web**
Copyright (C) 2026 Modbap Modular (Beatppl Inc.)
Portions Copyright (C) 2017 Andrew Belt, developed for Synthesis Technology.

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version. The full license text is in [`LICENSE`](LICENSE).

---

## 1. Upstream lineage

OsirisEdit Web descends from prior GPL-licensed work in three stages:

| Stage | Project | Author / holder | License |
|---|---|---|---|
| 1 | [**WaveEdit**](https://github.com/AndrewBelt/WaveEdit): C++ / OpenGL / ImGui wavetable editor | (C) 2017 Andrew Belt, developed for Synthesis Technology | GPL-3.0 |
| 2 | [**OsirisEdit**](https://github.com/modbap/OsirisEdit): C++ fork adapted to the Modbap Osiris hardware spec | (C) 2021 Modbap Modular (Beatppl Inc.), portions (C) 2017 Andrew Belt | GPL-3.0 (inherited) |
| 3 | **OsirisEdit Web** (this repository): browser edition | (C) 2026 Modbap Modular (Beatppl Inc.), portions (C) 2017 Andrew Belt | GPL-3.0 (inherited) |

### Not a Git fork, but a derivative work

This repository is **not** a GitHub fork of WaveEdit or of the C++ OsirisEdit.
It shares no build system, no language, and no commit history with them.

That is a statement about repository mechanics, not about copyright. **OsirisEdit
Web is a derivative work of WaveEdit under the GNU GPL v3.** Its DSP core was
*ported* from the upstream C++, not independently reimplemented: `src/wave.js` is
a line-for-line translation of `src/wave.cpp` and `src/math.cpp`, and
`src/wavpak.js` carries option arrays verbatim from `src/ui.cpp`. The whole
program is therefore licensed under the GPL v3, and every copy or modified copy
must be distributed under the same terms.

Neither Andrew Belt nor Synthesis Technology endorses this edition or is
responsible for it.

---

## 2. Statement of modifications (GPL v3, section 5(a))

The files below are the modified and added work of Modbap Modular. All changes
were made in 2026 unless noted.

| File | Relationship to upstream | What changed |
|---|---|---|
| `src/wave.js` | Port of upstream `src/wave.cpp` + `src/math.cpp` | Translated from C++ to ES modules. The **pffft** dependency was removed and replaced with an in-tree real FFT that reproduces pffft's "ordered" packing (`[DC, Nyquist, Re1, Im1, ...]`). Effect math, effect order, FFT scaling (`1/N`), harmonic convention (`magnitude x 2`), cycle and normalize are unchanged from upstream. |
| `src/wavpak.js` | Port of upstream `src/ui.cpp` `menuConvert` plus the `Bank::saveWAV` overload | Convert option arrays (sample rates, bit depths, bank sizes, wave lengths) carried verbatim from `src/ui.cpp`. The desktop folder-tree output was replaced with an in-browser ZIP download whose internal paths mirror the desktop `A`/`B`/`C`/`D` layout. ZIP writing is in-tree (CRC-32 + STORE); no ZIP library is used. |
| `src/app.js` | Replaces the upstream ImGui / OpenGL / SDL2 presentation layer | The entire UI was rebuilt on HTML, Canvas 2D and the Web Audio API (`AudioWorklet` for morph playback). Editor tools, WAV I/O, audio import and the morph engine were re-authored for the browser against upstream behavior. |
| `src/generate.js` | New work by Modbap Modular | Wavetable generators (Harmonic Morph, Additive Random, Catalog Shapes, Glitch/Chaos, FM/Phase Distortion) and the Coherence control. No upstream counterpart. |
| `serve.mjs` | New work by Modbap Modular | Zero-dependency static dev server. No upstream counterpart. |
| `test/` | New work by Modbap Modular | Verification harness. **Exception:** `test/c_ref.json` is captured numeric output from a build of the upstream C++ DSP (compiled against the real pffft) and is used as the fidelity reference. |
| `manual/`, `docs/` | New work by Modbap Modular | Web manual, addendum, model and parity documentation, and this license page. |
| `index.html` | New work by Modbap Modular | Single-page application shell and styles. No upstream counterpart. |

---

## 3. Third-party components

The web edition of this program **bundles no third-party code**. The native
upstream dependencies were all replaced or dropped in the port:

| Upstream dependency | Status in the web edition |
|---|---|
| **pffft** (FFT) | Not present. `src/wave.js` contains an in-tree real FFT that reproduces pffft's ordered packing. pffft appears in source comments only, describing the convention being matched. |
| **Dear ImGui** (UI) | Not present. UI rebuilt on HTML and Canvas 2D. |
| **SDL2** (windowing / input) | Not present. Replaced by browser event handling. |
| **libsamplerate** (resampling) | Not present. Import resampling is in-tree. |
| **libsndfile** (audio file I/O) | Not present. WAV encode/decode is in-tree. |
| ZIP writing | In-tree in `src/wavpak.js` (CRC-32 + STORE). No library. |
| **jsdom** | `devDependency` only, used by the test suite. Never served to the browser and never shipped. |

Because no third-party code is redistributed with the web edition, this
repository carries no separate third-party notice file.

## 4. Fonts

The interface loads **Barlow Condensed**, **Montserrat** and **Inter** from the
Google Fonts CDN at runtime. No font files are self-hosted or redistributed by
this repository. The SIL Open Font License (OFL) files bundled in the C++
OsirisEdit repository were **not** carried over.

> If any of these faces is ever self-hosted in this repository, the OFL text and
> its copyright notices must travel with the font files, and this section must be
> updated accordingly.

## 5. Upstream assets not yet ported

The C++ OsirisEdit repository contains two asset directories that are
**byte-identical to upstream WaveEdit**:

- `catalog/`: 43 WAV files
- `banks/`: 4 files

These are Andrew Belt / Synthesis Technology content, not Modbap content. **They
are not currently shipped by the web edition** and are not present in this
repository.

> **Action required before release:** the "Catalog presets" roadmap item in
> `CLAUDE.md` would port that WAV catalog into the web edition. If it is
> implemented, this NOTICE must be updated to attribute `catalog/` and `banks/`
> to Andrew Belt / Synthesis Technology **before** that release ships.

## 6. Source availability

Complete corresponding source for this program is available at:

**https://github.com/modbap/OsirisEditWeb**

Upstream source is available at **https://github.com/AndrewBelt/WaveEdit**
(GPL-3.0) and **https://github.com/modbap/OsirisEdit** (GPL-3.0).

## 7. No warranty

This program is distributed in the hope that it will be useful, but **WITHOUT ANY
WARRANTY**; without even the implied warranty of **MERCHANTABILITY** or **FITNESS
FOR A PARTICULAR PURPOSE**. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this
program. If not, see <https://www.gnu.org/licenses/>.
