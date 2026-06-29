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

console.log(fails===0 ? '\nWAVPAK / CONVERT TEST PASS ✓' : `\n${fails} FAILURE(S) ✗`);
process.exit(fails===0?0:1);
