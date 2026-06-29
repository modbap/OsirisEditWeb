# Osiris terminology & data model (authoritative)

Source: *OSIRISedit User Manual v1* (`docs/OsirisEdit_User_Manual_v1.pdf`), Definitions page.
This is the canonical vocabulary. It differs from the upstream WaveEdit naming —
**follow Osiris terms, not WaveEdit terms**, in all UI text and user-facing docs.

## Hierarchy (smallest → largest)

| Osiris term  | What it is                                              | WaveEdit called it | In code |
|--------------|--------------------------------------------------------|--------------------|---------|
| **Waveform** | 256 samples — a single wav (one cycle)                 | "wave"             | `Wave`, `WAVE_LEN = 256` |
| **Wavetable**| A set of waveforms (16, 32, or 64). Default 32.        | **"bank"**         | the array of 32 `Wave`s |
| **Bank / WavPak** | The SD-card container: 4 folders A/B/C/D, each holding up to 32 wavetables | (n/a) | produced by **Convert** |

So the 32-waveform structure the editor works on is a **WAVETABLE**, not a "bank".
The word "bank" in Osiris refers to the larger WavPak/SD-card grouping created by Convert.

> ⚠️ The original WaveEdit C++ source (and the first draft of this port) used class
> name `Bank` and `BANK_LEN` for the 32-waveform set. Those internal identifiers can
> stay as-is to avoid churn, but **every user-facing string must say "wavetable"** for
> the 32-waveform set, and "bank"/"WavPak" only for the Convert output.

## Wavetable length
Selectable: **16 / 32 / 64** waveforms (manual Definitions + length dropdown). Default 32.
Current port hard-codes 32 — should become a dropdown.

## Save vs Convert (two different exports)

**Save Wavetable** (`File > Save Wavetable`):
- One mono WAV containing `wavetableLength × 256` samples of each waveform's post-effect output.
- Default format: 44.1 kHz, 16-bit, mono. This is the OSIRISedit working file.

**Convert** (`File > Convert`) → produces Osiris **WavPaks**:
- Batch operation over a *folder* of saved wavetable WAVs.
- Re-encodes each to chosen **Sample Rate / Bit Depth (8/16/32) / Bank Length / Wave Length (256)**.
- If "Separate Into WavPak Banks A–D" is checked: distributes files into subfolders
  `Osiris/A`, `/B`, `/C`, `/D` at 32 files per letter (`fileIndex / 32` → letter),
  capping at 32×4 = 128 wavetables. Output filenames are `Osiris_<original>.wav`.
- The C++ does NOT resample sample data on convert — it re-containers at the declared
  rate and writes `wave_len` samples per waveform. Bit depth is a real re-quantization.

## WavPak on the SD card (manual WavPak overview)
- 4 folders **A, B, C, D** on the Micro SD card.
- Each Osiris bank = 32 wavetables; a full WavPak set = up to 128 wavetables.
- Audio format on card: 16-bit, 44.1 kHz.

## The two-dimensional WavPak structure (manual, "32 sets of 32")
A full WavPak is described as 32 sets of 32 wavetables. For the editor's purposes the
unit of work is one 32-waveform **wavetable**; Convert + A–D distribution builds toward
the larger card structure.
