import { encodeWavPCM, wavetableToSamples, convertToWavPak, makeZip,
         SAMPLE_RATES, BIT_DEPTHS, WAVETABLE_LENGTHS } from '../src/wavpak.js';

let fails = 0;
const ok = (cond, msg) => { console.log((cond?'  ok   ':'  FAIL ')+msg); if(!cond) fails++; };
const u32 = (b,o)=> b[o] | b[o+1]<<8 | b[o+2]<<16 | b[o+3]<<24;
const u16 = (b,o)=> b[o] | b[o+1]<<8;

// --- WAV header correctness across bit depths ---
for (const bd of [8,16,32]) {
  const samples = new Float32Array(256); for (let i=0;i<256;i++) samples[i]=Math.sin(i*0.1);
  const wav = encodeWavPCM(samples, 44100, bd);
  const riff = String.fromCharCode(wav[0],wav[1],wav[2],wav[3]);
  const bytesPer = bd/8;
  ok(riff==='RIFF', `${bd}-bit: RIFF magic`);
  ok(u16(wav,34)===bd, `${bd}-bit: bitsPerSample field = ${u16(wav,34)}`);
  ok(u16(wav,22)===1, `${bd}-bit: mono`);
  ok(u32(wav,24)===44100, `${bd}-bit: samplerate field`);
  ok(u16(wav,32)===bytesPer, `${bd}-bit: blockAlign = ${u16(wav,32)}`);
  ok(wav.length===44+256*bytesPer, `${bd}-bit: file size ${wav.length} = 44+${256*bytesPer}`);
}

// --- 8-bit is unsigned: silence -> 128 ---
{
  const wav = encodeWavPCM(new Float32Array(8), 44100, 8);
  ok(wav[44]===128, `8-bit silence encodes to 128 (unsigned midpoint), got ${wav[44]}`);
}

// --- wavetableToSamples produces bankLen*waveLen ---
{
  const wfs = Array.from({length:32}, ()=>{ const a=new Float32Array(256); a.fill(0.5); return a; });
  const flat = wavetableToSamples(wfs, 32, 256);
  ok(flat.length===32*256, `flatten 32x256 = ${flat.length}`);
  const flat64 = wavetableToSamples(wfs, 32, 64);
  ok(flat64.length===32*64, `flatten 32x64 (waveLen truncation) = ${flat64.length}`);
}

// --- ZIP structure: end-of-central-directory signature + file count ---
{
  const z = makeZip([{name:'a.txt',data:new Uint8Array([1,2,3])},{name:'b/c.txt',data:new Uint8Array([4,5])}]);
  // find EOCD sig 0x06054b50 near the end
  const eocdOff = z.length-22;
  ok(u32(z,eocdOff)===0x06054b50, 'ZIP: end-of-central-directory signature present');
  ok(u16(z,eocdOff+8)===2, `ZIP: records this disk = ${u16(z,eocdOff+8)}`);
  ok(u32(z,0)===0x04034b50, 'ZIP: first local file header signature');
}

// --- Convert: A/B/C/D distribution + naming ---
{
  const mk = (name)=>({ name, waveforms: Array.from({length:32},()=>new Float32Array(256)) });
  const wts = Array.from({length:70}, (_,i)=>mk(`t${i}`));
  const zip = convertToWavPak(wts, {sampleRate:'44100',bitDepth:'16',bankLen:'32',waveLen:'256',separateAD:true});
  // decode central directory file names crudely: search for "Osiris/"
  const text = new TextDecoder('latin1').decode(zip);
  ok(text.includes('Osiris/A/Osiris_t0.wav'), 'Convert: first file in A/');
  ok(text.includes('Osiris/B/Osiris_t32.wav'), 'Convert: 33rd file in B/');
  ok(text.includes('Osiris/C/Osiris_t64.wav'), 'Convert: 65th file in C/');
  ok(!text.includes('Osiris_t99'), 'Convert: capped (no overflow beyond input)');
}

// --- option sets match the C++ source values ---
ok(SAMPLE_RATES.includes('44100') && SAMPLE_RATES.includes('96000'), 'sample-rate options');
ok(BIT_DEPTHS.join(',')==='8,16,32', 'bit-depth options');
ok(WAVETABLE_LENGTHS.join(',')==='16,32,64', 'wavetable-length options');

// (summary printed at end, after Stage 2 tests)

// ===== Stage 2: faithful vs corrected, WAV parse round-trip =====
import { parseWavetableWav } from '../src/wavpak.js';
console.log('\n-- Stage 2: faithful/corrected + parse --');

// WAV parse round-trip: encode a known 32x256, parse it back
{
  const wfs = Array.from({length:32}, (_,w)=>{ const a=new Float32Array(256); for(let i=0;i<256;i++)a[i]=Math.sin((w+1)*i*0.05); return a; });
  const flat = new Float32Array(32*256); wfs.forEach((wf,w)=>flat.set(wf,w*256));
  const wav = encodeWavPCM(flat, 44100, 16);
  const parsed = parseWavetableWav(wav.buffer);
  ok(parsed.waveforms.length===32, `parse: 32 waveforms back (${parsed.waveforms.length})`);
  ok(parsed.waveforms[0].length===256, `parse: 256 samples per waveform`);
  let maxerr=0; for(let w=0;w<32;w++)for(let i=0;i<256;i++)maxerr=Math.max(maxerr,Math.abs(parsed.waveforms[w][i]-wfs[w][i]));
  ok(maxerr<2e-4, `parse round-trip err ${maxerr.toExponential(2)} (16-bit quant)`);
}

// wave_len <= 256: faithful and corrected agree (clean truncation)
{
  const wfs = Array.from({length:32}, ()=>{ const a=new Float32Array(256); for(let i=0;i<256;i++)a[i]=i/256; return a; });
  const f = wavetableToSamples(wfs, 32, 128, false);
  const c = wavetableToSamples(wfs, 32, 128, true);
  let same=true; for(let i=0;i<f.length;i++) if(Math.abs(f[i]-c[i])>1e-9) same=false;
  ok(same, 'wave_len=128: faithful == corrected (truncation only)');
  ok(f.length===32*128, `wave_len=128 length ${f.length}`);
}

// wave_len > 256: faithful reads past (cross into next wave), corrected zero-pads
{
  const wfs = Array.from({length:32}, (_,w)=>{ const a=new Float32Array(256); a.fill(w); return a; }); // wave w is all value w
  const f = wavetableToSamples(wfs, 32, 512, false);
  const c = wavetableToSamples(wfs, 32, 512, true);
  // faithful: wave 0 samples 256..511 spill into wave 1's data (value 1)
  ok(Math.abs(f[300]-1)<1e-6, `faithful wave_len>256 reads into next wave (got ${f[300]}, expect 1)`);
  // corrected: wave 0 samples 256..511 are zero-padded
  ok(Math.abs(c[300]-0)<1e-6, `corrected wave_len>256 zero-pads (got ${c[300]}, expect 0)`);
  ok(Math.abs(c[100]-0)<1e-6 && Math.abs(c[10]-0)<1e-6, 'corrected keeps first 256 of wave 0 (value 0)');
}

// bank_len > available (64 from 32): faithful spills, corrected clamps to last wave
{
  const wfs = Array.from({length:32}, (_,w)=>{ const a=new Float32Array(256); a.fill(w); return a; });
  const c = wavetableToSamples(wfs, 64, 256, true);
  ok(Math.abs(c[63*256+0]-31)<1e-6, `corrected bank_len=64 clamps wave 63 to last available (31), got ${c[63*256]}`);
}

console.log(fails===0 ? '\nWAVPAK / CONVERT TEST PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails===0?0:1);
