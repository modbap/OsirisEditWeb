import { generateWavetable, GENERATORS } from '../src/generate.js';
let fails=0; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fails++;};

const N=256, BANK=32;
// adjacency metric: mean abs diff between consecutive waves (lower = more coherent)
function adjacency(waves){ let s=0,n=0; for(let j=1;j<waves.length;j++){let d=0; for(let i=0;i<N;i++)d+=Math.abs(waves[j][i]-waves[j-1][i]); s+=d/N; n++; } return s/n; }

for(const [kind,g] of Object.entries(GENERATORS)){
  const waves = generateWavetable(kind, {N,bank:BANK,coherence:0.7,seed:12345});
  ok(waves.length===BANK, `${kind}: ${waves.length} waves`);
  ok(waves[0].length===N, `${kind}: ${N} samples/wave`);
  let inRange=true, finite=true, nonzero=0;
  for(const w of waves){ for(let i=0;i<N;i++){ if(w[i]<-1.001||w[i]>1.001)inRange=false; if(!Number.isFinite(w[i]))finite=false; }
    let e=0; for(let i=0;i<N;i++)e+=w[i]*w[i]; if(e>1e-6)nonzero++; }
  ok(inRange, `${kind}: all samples in [-1,1]`);
  ok(finite, `${kind}: all finite (no NaN/Inf)`);
  ok(nonzero>=BANK-2, `${kind}: ${nonzero}/${BANK} waves non-silent`);
}

// coherence: high coherence -> smaller adjacency than low coherence (for morphing gens)
for(const kind of ['harmonic','additive','fm']){
  const hi = adjacency(generateWavetable(kind,{N,bank:BANK,coherence:1.0,seed:999}));
  const lo = adjacency(generateWavetable(kind,{N,bank:BANK,coherence:0.0,seed:999}));
  ok(hi<=lo*1.05, `${kind}: coherence=1 smoother than coherence=0 (hi ${hi.toFixed(3)} <= lo ${lo.toFixed(3)})`);
}

// determinism: same seed -> identical table
{
  const a=generateWavetable('additive',{seed:42}), b=generateWavetable('additive',{seed:42});
  let same=true; for(let j=0;j<BANK;j++)for(let i=0;i<N;i++) if(a[j][i]!==b[j][i])same=false;
  ok(same,'same seed reproduces identical wavetable');
}

console.log(fails===0?'\nGENERATE TEST PASS ✓':`\n${fails} FAILURE(S) ✗`);
process.exit(fails?1:0);
