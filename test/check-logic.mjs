import { Wave, WAVE_LEN } from '../src/wave.js';
const BANK_LEN=32;
// WAV encode/decode round-trip
function encodeWAV(f32,sr=44100){const n=f32.length,buf=new ArrayBuffer(44+n*2),dv=new DataView(buf);
 const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
 w(0,'RIFF');dv.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);
 dv.setUint16(22,1,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*2,true);dv.setUint16(32,2,true);dv.setUint16(34,16,true);
 w(36,'data');dv.setUint32(40,n*2,true);for(let i=0;i<n;i++)dv.setInt16(44+i*2,Math.round(Math.max(-1,Math.min(1,f32[i]))*32767),true);return buf;}
const test=new Float32Array(BANK_LEN*WAVE_LEN); for(let i=0;i<test.length;i++)test[i]=Math.sin(i*0.05);
const buf=encodeWAV(test); const dv=new DataView(buf);
console.log('WAV header RIFF:',String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3)));
console.log('WAV size bytes:',buf.byteLength,'expected',44+BANK_LEN*WAVE_LEN*2);
console.log('samplerate field:',dv.getUint32(24,true),'channels:',dv.getUint16(22,true),'bits:',dv.getUint16(34,true));
// decode back
const n=(buf.byteLength-44)/2,out=new Float32Array(n); for(let i=0;i<n;i++)out[i]=dv.getInt16(44+i*2,true)/32767;
let maxerr=0;for(let i=0;i<n;i++)maxerr=Math.max(maxerr,Math.abs(out[i]-test[i]));
console.log('WAV round-trip max err (16-bit quant):',maxerr.toExponential(2), maxerr<2e-4?'OK':'FAIL');
// resampler
function resampleLinear(a,al,o,ol){if(al<=0||ol<=0)return 0;for(let i=0;i<ol;i++){const x=i*(al-1)/(ol-1||1);const xi=Math.floor(x),xf=x-xi;o[i]=xi+1<al?(1-xf)*a[xi]+xf*a[xi+1]:a[xi];}return ol;}
const src=new Float32Array(1000);for(let i=0;i<1000;i++)src[i]=Math.sin(i*0.01);
const dst=new Float32Array(BANK_LEN*WAVE_LEN);resampleLinear(src,1000,dst,dst.length);
console.log('resample out len:',dst.length,'first/last:',dst[0].toFixed(3),dst[dst.length-1].toFixed(3));
// bank commit/harmonics round trip
const w=new Wave();for(let i=0;i<WAVE_LEN;i++)w.samples[i]=Math.sin(2*Math.PI*i/WAVE_LEN);w.commitSamples();
console.log('fundamental harmonic (should ~1):',w.harmonics[1].toFixed(4),'DC(~0):',w.harmonics[0].toFixed(4));
console.log('post == samples when no fx:', Math.max(...w.postSamples.map((v,i)=>Math.abs(v-w.samples[i]))).toExponential(2));
