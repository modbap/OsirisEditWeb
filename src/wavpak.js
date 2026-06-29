// wavpak.js — Osiris Convert / WavPak export.
//
// Faithful to OsirisEdit's Convert (src/ui.cpp menuConvert + Bank::saveWAV overload):
//   - Each wavetable is written as one mono WAV containing `bankLen * waveLen` samples
//     (postSamples of each waveform, truncated/limited to waveLen).
//   - Re-encoded at the chosen sample rate (header field) and bit depth (real requant).
//   - The C++ does NOT resample sample data on convert; it re-containers + re-quantizes.
//   - "Separate Into WavPak Banks A-D": distribute files across folders A/B/C/D at
//     32 files per letter (index/32 -> letter), capped at 32*4 = 128 files.
//
// In the browser there is no folder tree, so Convert produces a downloadable .zip whose
// internal paths are Osiris/A/Osiris_<name>.wav etc., matching the desktop output layout.

// ---- Convert option sets (verbatim from src/ui.cpp) ----
export const SAMPLE_RATES = ['8000','11025','16000','22050','32000','44100','48000','88200','96000'];
export const BIT_DEPTHS   = ['8','16','32'];
export const BANK_SIZES   = ['16','32','64'];       // wavetables-per-letter grouping (bankSizes)
export const WAVE_LENGTHS = ['8','16','32','64','128','256','512','1028','2048'];
export const WAVETABLE_LENGTHS = ['16','32','64'];  // bankLens — waveforms per wavetable

const clampf = (x,a,b)=> x>b?b:x<a?a:x;

// ---- WAV encoder: mono, PCM, 8 / 16 / 32-bit integer ----
// 8-bit WAV is unsigned (per spec); 16/32-bit are signed little-endian.
export function encodeWavPCM(samples, sampleRate, bitDepth) {
  const n = samples.length;
  const bytesPerSample = bitDepth / 8;
  const dataBytes = n * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataBytes);
  const dv = new DataView(buf);
  const w = (o,s)=>{ for(let i=0;i<s.length;i++) dv.setUint8(o+i, s.charCodeAt(i)); };
  w(0,'RIFF'); dv.setUint32(4, 36+dataBytes, true); w(8,'WAVE'); w(12,'fmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate*bytesPerSample, true);
  dv.setUint16(32, bytesPerSample, true);
  dv.setUint16(34, bitDepth, true);
  w(36,'data'); dv.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i=0;i<n;i++) {
    const s = clampf(samples[i], -1, 1);
    if (bitDepth === 8)       dv.setUint8(o, Math.round((s*0.5+0.5)*255));            // unsigned 8-bit
    else if (bitDepth === 16) dv.setInt16(o, Math.round(s*32767), true);
    else                      dv.setInt32(o, Math.round(s*2147483647), true);         // 32-bit int
    o += bytesPerSample;
  }
  return new Uint8Array(buf);
}

// ---- WAV parser: read a saved wavetable WAV into 32 x 256 floats ----
// Mirrors Bank::loadWAV: always reads BANK_LEN(32) waves x WAVE_LEN(256) samples,
// regardless of the file's declared length. Supports PCM 8/16/32-bit int and 32-bit float.
const SRC_BANK_LEN = 32, SRC_WAVE_LEN = 256;
export function parseWavetableWav(arrayBuffer) {
  const dv = new DataView(arrayBuffer);
  const tag = (o)=> String.fromCharCode(dv.getUint8(o),dv.getUint8(o+1),dv.getUint8(o+2),dv.getUint8(o+3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  // walk chunks to find fmt + data
  let off = 12, fmt = null, dataOff = -1, dataLen = 0;
  while (off + 8 <= dv.byteLength) {
    const id = tag(off), sz = dv.getUint32(off+4, true);
    if (id === 'fmt ') {
      fmt = { format: dv.getUint16(off+8,true), channels: dv.getUint16(off+10,true),
              rate: dv.getUint32(off+12,true), bits: dv.getUint16(off+22,true) };
    } else if (id === 'data') { dataOff = off+8; dataLen = sz; }
    off += 8 + sz + (sz & 1); // chunks are word-aligned
  }
  if (!fmt || dataOff < 0) throw new Error('WAV missing fmt/data');
  const ch = fmt.channels || 1;
  const readSample = (i) => {
    if (fmt.format === 3) return dv.getFloat32(dataOff + i*4, true);            // IEEE float
    if (fmt.bits === 8)  return (dv.getUint8(dataOff + i) - 128) / 128;          // unsigned 8
    if (fmt.bits === 16) return dv.getInt16(dataOff + i*2, true) / 32768;
    if (fmt.bits === 32) return dv.getInt32(dataOff + i*4, true) / 2147483648;
    throw new Error('Unsupported bit depth '+fmt.bits);
  };
  // De-interleave channel 0 only, take the first 32*256 frames.
  const need = SRC_BANK_LEN * SRC_WAVE_LEN;
  const waveforms = [];
  for (let w=0; w<SRC_BANK_LEN; w++) {
    const wf = new Float32Array(SRC_WAVE_LEN);
    for (let s=0; s<SRC_WAVE_LEN; s++) {
      const frame = w*SRC_WAVE_LEN + s;
      wf[s] = frame < need ? readSample(frame*ch) : 0; // channel 0
    }
    waveforms.push(wf);
  }
  return { waveforms, sourceRate: fmt.rate, sourceBits: fmt.bits };
}

// Build the flat sample stream for one converted wavetable file.
//   bankLen waves x waveLen samples, taken from each wave's 256-sample buffer.
//
// FAITHFUL mode reproduces the original Bank::saveWAV(info, bank_len, wave_len):
//   it writes bank_len waves of wave_len samples each, reading straight out of the
//   waves array / the 256-float postSamples buffer. When wave_len > 256 or
//   bank_len > 32 the C++ reads PAST the buffers (out-of-bounds). We emulate that
//   read by continuing into the next wave's data (flat contiguous memory model),
//   which is the closest deterministic match to what the module-tested files contain.
//
// CORRECTED mode does the musically-sane thing: truncate to <=256, zero-pad beyond,
// and clamp bank_len to the available waves.
export function wavetableToSamples(waveforms, bankLen, waveLen, corrected=false) {
  const out = new Float32Array(bankLen * waveLen);
  if (corrected) {
    const avail = waveforms.length;
    for (let j=0; j<bankLen; j++) {
      const wf = waveforms[Math.min(j, avail-1)] || new Float32Array(SRC_WAVE_LEN);
      for (let i=0; i<waveLen; i++) out[j*waveLen + i] = i < SRC_WAVE_LEN ? (wf[i]||0) : 0;
    }
    return out;
  }
  // FAITHFUL: model the source as one contiguous float array (waves laid end to end,
  // each 256 long), then read bankLen*waveLen from it starting at wave j*256 — exactly
  // how the C++ pointer arithmetic walks memory, including reading past wave boundaries.
  const flat = new Float32Array(Math.max(waveforms.length, bankLen) * SRC_WAVE_LEN);
  for (let w=0; w<waveforms.length; w++) flat.set(waveforms[w].subarray(0,SRC_WAVE_LEN), w*SRC_WAVE_LEN);
  for (let j=0; j<bankLen; j++) {
    for (let i=0; i<waveLen; i++) {
      const src = j*SRC_WAVE_LEN + i;            // contiguous read, may cross into next wave
      out[j*waveLen + i] = src < flat.length ? flat[src] : 0;
    }
  }
  return out;
}

// ---- Minimal ZIP writer (STORE / no compression — a valid .zip) ----
// Zero dependencies. Good for tens of small WAVs.
function crc32(bytes) {
  let c, crc = 0 ^ -1;
  for (let i=0;i<bytes.length;i++) {
    c = (crc ^ bytes[i]) & 0xff;
    for (let k=0;k<8;k++) c = c & 1 ? (c>>>1) ^ 0xEDB88320 : c>>>1;
    crc = (crc>>>8) ^ c;
  }
  return (crc ^ -1) >>> 0;
}
const enc = new TextEncoder();
export function makeZip(files) { // files: [{name, data:Uint8Array}]
  const chunks = [], central = [];
  let offset = 0;
  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const local = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);  // local file header sig
    dv.setUint16(4, 20, true);          // version needed
    dv.setUint16(6, 0, true);           // flags
    dv.setUint16(8, 0, true);           // method 0 = store
    dv.setUint16(10, 0, true); dv.setUint16(12, 0, true); // time/date
    dv.setUint32(14, crc, true);
    dv.setUint32(18, size, true);       // compressed
    dv.setUint32(22, size, true);       // uncompressed
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);          // extra len
    local.set(nameBytes, 30);
    chunks.push(local, f.data);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cdv = new DataView(cen.buffer);
    cdv.setUint32(0, 0x02014b50, true); // central dir sig
    cdv.setUint16(4, 20, true); cdv.setUint16(6, 20, true);
    cdv.setUint16(8, 0, true); cdv.setUint16(10, 0, true);
    cdv.setUint16(12, 0, true); cdv.setUint16(14, 0, true);
    cdv.setUint32(16, crc, true);
    cdv.setUint32(20, size, true); cdv.setUint32(24, size, true);
    cdv.setUint16(28, nameBytes.length, true);
    cdv.setUint32(42, offset, true);    // local header offset
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + size;
  }
  let centralSize = 0; for (const c of central) centralSize += c.length;
  const end = new Uint8Array(22);
  const edv = new DataView(end.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  let total = 0; for (const a of all) total += a.length;
  const out = new Uint8Array(total);
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// ---- Convert: given named wavetables, produce the WavPak zip bytes ----
// wavetables: [{ name, waveforms: Float32Array(256)[] }]  (32 waveforms each)
// opts: { sampleRate, bitDepth, bankLen, waveLen, separateAD, corrected }
export function convertToWavPak(wavetables, opts) {
  const sampleRate = parseInt(opts.sampleRate, 10);
  const bitDepth   = parseInt(opts.bitDepth, 10);
  const bankLen    = parseInt(opts.bankLen, 10);
  const waveLen    = parseInt(opts.waveLen, 10);
  const corrected  = !!opts.corrected;
  const files = [];
  const list = opts.separateAD ? wavetables.slice(0, 32*4) : wavetables;
  list.forEach((wt, idx) => {
    const samples = wavetableToSamples(wt.waveforms, bankLen, waveLen, corrected);
    const wav = encodeWavPCM(samples, sampleRate, bitDepth);
    const base = (wt.name || `wavetable_${idx}`).replace(/\.wav$/i,'');
    if (opts.separateAD) {
      const letter = 'ABCD'[Math.floor(idx / 32)];
      files.push({ name: `Osiris/${letter}/Osiris_${base}.wav`, data: wav });
    } else {
      files.push({ name: `Osiris/Osiris_${base}.wav`, data: wav });
    }
  });
  return makeZip(files);
}
