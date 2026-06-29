import { Wave, WAVE_LEN, EffectID } from '../src/wave.js';
import fs from 'fs';
const ref = JSON.parse(fs.readFileSync(new URL('./c_ref.json', import.meta.url),'utf8'));
function testWave(){ const w=new Wave(); for(let i=0;i<WAVE_LEN;i++){const t=i/WAVE_LEN; w.samples[i]=Math.sin(2*Math.PI*t)+0.5*Math.sin(2*Math.PI*3*t)+0.3*(2*t-1);} return w; }
const map={pre:'PRE_GAIN',phase:'PHASE_SHIFT',harm:'HARMONIC_SHIFT',comb:'COMB',ring:'RING',cheby:'CHEBYSHEV',snh:'SAMPLE_AND_HOLD',quant:'QUANTIZATION',slew:'SLEW',lp:'LOWPASS',hp:'HIGHPASS',post:'POST_GAIN'};
let worst=0, worstName='';
function cmp(name, arr){ let m=0; for(let i=0;i<WAVE_LEN;i++){const d=Math.abs(arr[i]-ref[name][i]); if(d>m)m=d;} if(m>worst){worst=m;worstName=name;} console.log(name.padEnd(7), 'max abs diff =', m.toExponential(3)); }
for(const [k,eid] of Object.entries(map)){ const w=testWave(); w.effects.fill(0); w.effects[EffectID[eid]]=0.37; w.updatePost(); cmp(k, w.postSamples); }
{ const w=testWave(); w.cycle=true; w.updatePost(); cmp('cycle', w.postSamples); }
{ const w=testWave(); w.normalize=true; w.updatePost(); cmp('norm', w.postSamples); }
console.log('\nWORST overall:', worstName, '=', worst.toExponential(3));
console.log(worst < 1e-4 ? 'PASS ✓  (within float tolerance — DSP is faithful)' : 'FAIL ✗  (investigate)');
