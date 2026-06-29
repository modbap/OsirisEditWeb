# OsirisEdit vs WaveEdit — parity spec

This document pins **what makes OsirisEdit different from WaveEdit**, measured by diffing
the actual source: `AndrewBelt/WaveEdit` → `switchupcb/OsirisEdit` (== `modbap/OsirisEdit`,
whose `src/` is byte-identical to switchupcb's).

**The web port must reproduce OsirisEdit's behavior, not WaveEdit's.** Where this port was
first drafted with generic/WaveEdit-style UI, those spots are flagged below as TODO.

## What OsirisEdit did NOT change (inherited verbatim — keep faithful)

The **entire DSP** is unchanged from WaveEdit. The `wave.cpp` diff between the two is only:
an include rename, added clipboard helpers, and an added `saveWAV` overload. The
`updatePost()` effect chain, FFT conventions, and all 12 effects are **identical**.

→ Implication: our `src/wave.js`, verified to ~1e-5 against the compiled C++ DSP, is correct
for OsirisEdit too. The DSP is not where Osiris diverged; do not "Osiris-ify" the math.

## What OsirisEdit DID change (the fork's real identity — must match)

Measured divergence is almost entirely in `ui.cpp` (~1120 changed lines). The Osiris-specific
features are:

### 1. Vocabulary: "Wavetable", not "Bank"  ✅ corrected in this port
WaveEdit's File menu said "New/Open/Save **Bank**". OsirisEdit renamed every one to
"**Wavetable**". The 32-waveform set the editor works on is a **wavetable**. "Bank"/"WavPak"
is reserved for the Convert output (SD-card A/B/C/D structure). See `docs/OSIRIS_MODEL.md`.

Exact OsirisEdit File menu:
- New Wavetable (Cmd+N)
- Open Wavetable… (Cmd+O)
- Save Wavetable (Cmd+S)
- Save Wavetable As… (Cmd+Shift+S)
- Save Waves to Folder
- **Convert** ← opens the WavPak export popup
Edit menu adds: Select All, **Copy All** (Cmd+C), **Paste All** (Cmd+V), Clear (Del),
Randomize Effects (R), Copy / Cut / Paste, Open Wave…, Save Wave As…

### 2. Convert → WavPak export  ✅ BUILT (Stage 1 + Stage 2)
`menuConvert()` popup. This is the whole reason the tool exists — getting wavetables onto
the Osiris module. **Accurate behavior, verified against `Bank::saveWAV(info, bank_len, wave_len)`
and `Bank::loadWAV` in the C++ source:**

- **It is a folder→folder batch processor**, not an exporter of the in-app wavetable.
  It reads every `.wav` in a *source folder* (sorted alphabetically), re-encodes each, and
  writes to a *destination folder*. The web port accepts **either** uploaded saved `.wav`
  files **or** the current in-app wavetable (a useful web extension).
- **Input is always 32 × 256.** `loadWAV` hard-codes reading `BANK_LEN(32) × WAVE_LEN(256)`
  floats per file, then `commitSamples()` on each. The output dropdowns do not change input.
- **Output honors the dropdowns** via `Bank::saveWAV(filename, info, bank_len, wave_len)`:
  writes `bank_len` waves, each `wave_len` samples, at the chosen sample rate + bit depth.
  - `wave_len ≤ 256` → clean truncation (shorter waves).
  - `wave_len > 256` (dropdown goes to 2048) → the C++ reads **past** each 256-float
    `postSamples` buffer into adjacent memory (out-of-bounds). This is a real bug, but it is
    what the module-tested WavPaks contain. **Faithful mode reproduces it** by reading
    contiguously into the next wave's data; **Corrected mode** zero-pads beyond 256.
  - `bank_len > 32` → similar OOB past the 32-wave array. Faithful spills; Corrected clamps
    to the last available wave.
- **Sample rate** = header field (no sample-data resampling). **Bit depth** {8,16,32} = real
  re-quantization. 8-bit is unsigned (silence → 128); 16/32-bit signed LE.
- **"Separate Into WavPak Banks A-D"**: distribute files across `Osiris/A|B|C|D` at 32 files
  per letter (`fileIndex / 32`), capped at 32×4 = 128. Filenames `Osiris_<name>.wav`.
  Unchecked → all into a single `Osiris/` folder.
- **Web implementation**: produces a downloadable `.zip` whose internal paths are
  `Osiris/A/Osiris_<name>.wav` etc., matching the desktop output layout.
- **Faithful (default)** matches the original exactly, OOB quirks included, so existing banks
  reproduce bit-for-bit. **Corrected (toggle)** does the musically-sane thing for
  wave_len > 256 / bank_len > 32. Tested in `test/check-wavpak.mjs`.

### 3. Selectable wavetable length 16/32/64  ⛔ NOT YET BUILT (hard-coded 32)
`bankLens[] = {"16","32","64"}`, `BANK_LEN = atoi(...)`. The length dropdown (top-left of the
editor) sets how many waveforms the wavetable holds. WaveEdit was effectively fixed; Osiris
made it selectable. Default 32.

### 4. Copy All / Paste All across the whole wavetable  ⛔ NOT YET BUILT
`clipboardCopyAll` / `clipboardPasteAll` — copy the entire set of waveforms and paste into
another wavetable. Plus per-waveform Copy/Cut/Paste and Select All.

### 5. Effect Editor edits ALL waveforms at once  ⚠️ PARTIAL (mine edits only selected)
Per the manual (p20–21) and `ui.cpp`: the Effect Editor page shows, for each of the 12
effects, an **Average** slider plus a **per-waveform bar graph** (32 bars) that can be dragged
individually. "Average X" adjusts the mean across all waveforms; bars set each waveform.
Also: Cycle All / Cycle None / Normalize All / Normalize None apply to all waveforms.
The current port's Effect Editor only edits the selected waveform — needs the all-waveforms model.

### 6. Catalog presets are real WAV files  ⚠️ STUBBED (4 seed waves only)
`catalog/` ships folders `00Digital 01Analog 02FM 03Glitch`, each full of `.wav` presets,
loaded at runtime (`catalog.cpp`). The "Digital/Analog/FM/Glitch" buttons populate from these.
The port currently seeds 4 hard-coded shapes. Port the real catalog (bundle the WAVs or a
generated JSON of their samples).

### 7. Import: Replace Partial + Trim controls  ⚠️ PARTIAL
Manual p24: modes are Replace All / Replace Partial / Mix / Ring Modulate, plus Left/Right
Trim and Snap Trim. The port has Replace All / Mix / Ring and dropped Replace Partial + Trim.

## Priority order for matching OsirisEdit
1. ~~Convert → WavPak (#2)~~ ✅ DONE (Stage 1 + Stage 2, faithful + corrected).
2. Selectable length 16/32/64 in the editor (#3).
3. Effect Editor all-waveforms model (#5).
4. Catalog presets (#6).
5. Copy/Paste All (#4) and Import Replace Partial + Trim (#7).
