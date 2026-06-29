import { Wave, WAVE_LEN, EFFECTS_LEN, EffectID, effectNames, RFFT, IRFFT } from './wave.js';
import { convertToWavPak, parseWavetableWav, SAMPLE_RATES, BIT_DEPTHS, BANK_SIZES, WAVE_LENGTHS, WAVETABLE_LENGTHS } from './wavpak.js';
import { generateWavetable, GENERATORS } from './generate.js';

const BANK_LEN = 32, GW = 8, GH = 8;
const clampf = (x,a,b)=> x>b?b:x<a?a:x;
const crossf = (a,b,f)=> (1-f)*a+f*b;
const rescalef=(x,a,b,c,d)=> c+(x-a)/(b-a)*(d-c);
const eucmodi=(a,b)=>{const m=a%b;return m<0?m+b:m;};

// ---------------- Bank ----------------
const bank = Array.from({length:BANK_LEN}, ()=>new Wave());
bank.forEach(w=>w.commitSamples());
let selectedId = 0;

function newBank(){ bank.forEach(w=>{w.clear();w.commitSamples();}); refreshAll(); status('New empty bank.'); }
function shuffleBank(){ for(let j=BANK_LEN-1;j>=3;j--){const i=Math.floor(Math.random()*j);[bank[i],bank[j]]=[bank[j],bank[i]];} refreshAll(); }
function dupToAll(){ const src=bank[selectedId]; for(let j=0;j<BANK_LEN;j++) if(j!==selectedId) cloneWave(src,bank[j]); refreshAll(); }
function cloneWave(src,dst){ dst.samples.set(src.samples); dst.effects.set(src.effects); dst.cycle=src.cycle; dst.normalize=src.normalize; dst.commitSamples(); }

// ---------------- WAV I/O ----------------
function encodeWAV(float32, sampleRate=44100){
  const n=float32.length, buf=new ArrayBuffer(44+n*2), dv=new DataView(buf);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
  w(0,'RIFF'); dv.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt ');
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,1,true);
  dv.setUint32(24,sampleRate,true); dv.setUint32(28,sampleRate*2,true);
  dv.setUint16(32,2,true); dv.setUint16(34,16,true); w(36,'data'); dv.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){ const s=Math.round(clampf(float32[i],-1,1)*32767); dv.setInt16(44+i*2,s,true); }
  return new Blob([buf],{type:'audio/wav'});
}
async function decodeAudio(file){
  const ab=await file.arrayBuffer();
  const ctx=new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,1,44100);
  const ab2=ab.slice(0);
  const audio=await ctx.decodeAudioData(ab2).catch(()=>null);
  if(audio) return audio.getChannelData(0).slice();
  // fallback: raw 16-bit PCM WAV reader
  const dv=new DataView(ab); if(String.fromCharCode(dv.getUint8(0),dv.getUint8(1),dv.getUint8(2),dv.getUint8(3))!=='RIFF') return null;
  const n=(ab.byteLength-44)/2, out=new Float32Array(n);
  for(let i=0;i<n;i++) out[i]=dv.getInt16(44+i*2,true)/32767; return out;
}
function download(blob,name){ const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000); }

let wtCounter=1;
function pad2(n){ return String(n).padStart(2,'0'); }
function saveBankWAV(){ const all=new Float32Array(BANK_LEN*WAVE_LEN); for(let j=0;j<BANK_LEN;j++) all.set(bank[j].postSamples,j*WAVE_LEN);
  const name=`Osiris_WT_${pad2(wtCounter)}.wav`; download(encodeWAV(all),name); wtCounter++;
  if(window.__libAuto && window.__libAuto()) window.__libAdd(name.replace(/\.wav$/,''),'saved');
  status(`Saved wavetable → ${name} (32 waveforms · 32×256 @ 44.1k/16-bit).`); }
function saveWaveWAV(){ download(encodeWAV(bank[selectedId].postSamples),`Osiris_waveform_${pad2(selectedId)}.wav`); status(`Saved waveform ${selectedId}.`); }

function loadBankFromSamples(flat){ // flat length BANK_LEN*WAVE_LEN
  for(let j=0;j<BANK_LEN;j++){ bank[j].clear(); bank[j].samples.set(flat.subarray(j*WAVE_LEN,(j+1)*WAVE_LEN)); bank[j].commitSamples(); }
  refreshAll();
}

// ---------------- Resampler (linear; SRC_SINC_FASTEST analog) ----------------
function resampleLinear(inArr, inLen, out, outLen){
  if(inLen<=0||outLen<=0) return 0;
  for(let i=0;i<outLen;i++){ const x=i*(inLen-1)/(outLen-1||1); const xi=Math.floor(x), xf=x-xi;
    out[i]= xi+1<inLen ? crossf(inArr[xi],inArr[xi+1],xf) : inArr[xi]; }
  return outLen;
}

// ---------------- Canvas wave plot ----------------
function fitCanvas(cv){ const r=cv.getBoundingClientRect(); const dpr=devicePixelRatio||1;
  if(cv.width!==Math.round(r.width*dpr)||cv.height!==Math.round(r.height*dpr)){cv.width=Math.round(r.width*dpr);cv.height=Math.round(r.height*dpr);} return cv.getContext('2d'); }

function drawWave(cv, samples, opts={}){
  const ctx=fitCanvas(cv), W=cv.width, H=cv.height, dpr=devicePixelRatio||1;
  ctx.clearRect(0,0,W,H);
  // grid
  ctx.strokeStyle=cssVar('--grid','#cfcfcf'); ctx.lineWidth=1*dpr;
  for(let g=0;g<=8;g++){const x=g/8*W; ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  ctx.strokeStyle=cssVar('--grid2','#bdbdbd'); ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
  if(opts.ghost){ ctx.strokeStyle=cssVar('--accent','#c0392b')+'';ctx.globalAlpha=.28; ctx.lineWidth=1*dpr; plot(ctx,opts.ghost,W,H,opts.ghost.length); ctx.globalAlpha=1; }
  ctx.strokeStyle=opts.color||cssVar('--plot','#2b2b2b'); ctx.lineWidth=(opts.lw||1.6)*dpr; plot(ctx,samples,W,H,samples.length);
}
function plot(ctx,arr,W,H,n){ ctx.beginPath(); for(let i=0;i<n;i++){const x=i/(n-1)*W; const y=rescalef(arr[i],1,-1,0,H); i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.stroke(); }

function drawHarm(cv, harm){
  const ctx=fitCanvas(cv),W=cv.width,H=cv.height,dpr=devicePixelRatio||1; ctx.clearRect(0,0,W,H);
  const n=harm.length, show=Math.min(n,64), bw=W/show;
  let max=1e-6; for(let i=0;i<show;i++) max=Math.max(max,harm[i]);
  ctx.strokeStyle=cssVar('--grid','#cfcfcf');ctx.lineWidth=1*dpr;ctx.beginPath();ctx.moveTo(0,H-1);ctx.lineTo(W,H-1);ctx.stroke();
  for(let i=0;i<show;i++){ const h=harm[i]/max*(H-4); const x=i*bw;
    ctx.fillStyle= i===0 ? cssVar('--muted','#888') : cssVar('--accent2','#2d6cdf'); ctx.fillRect(x+1,H-h,bw-2,h); }
}

// ---------------- Editor tool behaviors (faithful to widgets.cpp) ----------------
function waveLine(pts,n,si,ei,sv,ev){ if(si>ei){[si,ei]=[ei,si];[sv,ev]=[ev,sv];} const a=Math.max(0,Math.round(si)),b=Math.min(n-1,Math.round(ei)); for(let i=a;i<=b;i++){const f=si<ei?rescalef(i,si,ei,0,1):0; pts[i]=crossf(sv,ev,f);} }
function waveBrush(pts,n,si,_ei,sv,_ev){ const sigma=10; for(let i=0;i<n;i++){const x=i-si; const a=Math.exp(-x*x/(2*sigma)); pts[i]=crossf(pts[i],sv,a);} }
function waveSmooth(pts,n,index){ const a=0.05; for(let i=0;i<n;i++){const w=Math.exp(-a*Math.pow(i-index,2)); pts[i]=clampf(pts[i]+0.01*w,-1,1);} }

function attachEditor(cv, getWave, onChange){
  let active=false, originIndex=0, originValue=0, lastIndex=0, lastValue=0;
  const toIdx=(e)=>{const r=cv.getBoundingClientRect(); const px=(e.clientX-r.left)/r.width; const py=(e.clientY-r.top)/r.height;
    return {index:clampf(px*(WAVE_LEN-1),0,WAVE_LEN-1), value:clampf(rescalef(py,0,1,1,-1),-1,1)};};
  const apply=(p)=>{ const w=getWave(); const pts=w.samples; const t=currentTool;
    if(t==='pencil') waveLine(pts,WAVE_LEN,lastIndex,p.index,lastValue,p.value);
    else if(t==='grab') waveLine(pts,WAVE_LEN,originIndex,originIndex,p.value,p.value);
    else if(t==='brush') waveBrush(pts,WAVE_LEN,lastIndex,p.index,lastValue,p.value);
    else if(t==='line') waveLine(pts,WAVE_LEN,originIndex,p.index,originValue,p.value);
    else if(t==='eraser') waveLine(pts,WAVE_LEN,lastIndex,p.index,0,0);
    else if(t==='smooth') waveSmooth(pts,WAVE_LEN,lastIndex);
    for(let i=0;i<WAVE_LEN;i++) pts[i]=clampf(pts[i],-1,1);
    lastIndex=p.index; lastValue=p.value; w.commitSamples(); onChange(); };
  cv.addEventListener('pointerdown',e=>{active=true;cv.setPointerCapture(e.pointerId);const p=toIdx(e);originIndex=lastIndex=p.index;originValue=lastValue=p.value;apply(p);});
  cv.addEventListener('pointermove',e=>{if(active)apply(toIdx(e));});
  const up=()=>{active=false;}; cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up);
}

// ---------------- Harmonic editor ----------------
function attachHarm(cv,getWave,onChange){
  let active=false;
  const apply=(e)=>{const w=getWave();const r=cv.getBoundingClientRect();const show=Math.min(WAVE_LEN/2,64);
    let i=Math.floor((e.clientX-r.left)/r.width*show); i=clampf(i,0,show-1);
    let max=1e-6; for(let k=0;k<show;k++)max=Math.max(max,w.harmonics[k]);
    const v=clampf(1-(e.clientY-r.top)/r.height,0,1)*max; w.harmonics[i]=v; w.commitHarmonics(); onChange();};
  cv.addEventListener('pointerdown',e=>{active=true;cv.setPointerCapture(e.pointerId);apply(e);});
  cv.addEventListener('pointermove',e=>{if(active)apply(e);});
  const up=()=>active=false; cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
}

// ---------------- Web Audio morph engine ----------------
let audioCtx=null, node=null;
const audio={vol:-12,freq:220,playing:false,modeXY:false,interp:true,morphX:0,morphY:0,morphZ:0};
function buildPostTable(){ // Float32 BANK_LEN*WAVE_LEN of postSamples
  const t=new Float32Array(BANK_LEN*WAVE_LEN); for(let j=0;j<BANK_LEN;j++)t.set(bank[j].postSamples,j*WAVE_LEN); return t; }

async function startAudio(){
  if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  await audioCtx.resume();
  const code=`
    const WAVE_LEN=${WAVE_LEN},BANK_LEN=${BANK_LEN},GW=${GW},GH=${GH};
    const crossf=(a,b,f)=>(1-f)*a+f*b, clampf=(x,a,b)=>x>b?b:x<a?a:x, eucmodi=(a,b)=>{const m=a%b;return m<0?m+b:m;};
    class P extends AudioWorkletProcessor{
      constructor(){super(); this.table=new Float32Array(BANK_LEN*WAVE_LEN); this.phase=0;
        this.mx=0;this.my=0;this.mz=0; this.s={vol:-12,freq:220,modeXY:false,interp:true,morphX:0,morphY:0,morphZ:0};
        this.port.onmessage=e=>{const d=e.data; if(d.table)this.table=d.table; if(d.s)Object.assign(this.s,d.s);};}
      wv(idx,i){return this.table[idx*WAVE_LEN+i];}
      process(_in,out){ const ch=out[0][0]; const sr=sampleRate; const gain=Math.pow(10,this.s.vol/20);
        for(let n=0;n<ch.length;n++){
          const lm=Math.min(0.1/Math.max(this.s.freq,1),0.5);
          if(this.s.interp){ this.mx=crossf(this.mx,clampf(this.s.morphX,0,GW-1),lm);
            this.my=crossf(this.my,clampf(this.s.morphY,0,GH-1),lm); this.mz=crossf(this.mz,clampf(this.s.morphZ,0,BANK_LEN-1),lm);
          } else { this.mx=Math.round(this.s.morphX);this.my=Math.round(this.s.morphY);this.mz=Math.round(this.s.morphZ); }
          const ip=this.phase*WAVE_LEN; const i0=Math.floor(ip)%WAVE_LEN; const fr=ip-Math.floor(ip); const i1=(i0+1)%WAVE_LEN;
          let s;
          if(this.s.modeXY){ const xi=Math.floor(this.mx),xf=this.mx-xi, yi=Math.floor(this.my),yf=this.my-yi;
            const at=(yy,xx,ii)=>this.wv(eucmodi(yy,GH)*GW+eucmodi(xx,GW),ii);
            const samp=(ii)=>{const v0=crossf(at(yi,xi,ii),at(yi,xi+1,ii),xf);const v1=crossf(at(yi+1,xi,ii),at(yi+1,xi+1,ii),xf);return crossf(v0,v1,yf);};
            s=crossf(samp(i0),samp(i1),fr);
          } else { const zi=Math.floor(this.mz),zf=this.mz-zi;
            const samp=(ii)=>crossf(this.wv(zi,ii),this.wv(eucmodi(zi+1,BANK_LEN),ii),zf); s=crossf(samp(i0),samp(i1),fr); }
          ch[n]=clampf(s*gain,-1,1);
          this.phase+=this.s.freq/sr; if(this.phase>=1)this.phase-=1;
        }
        return true; }
    }
    registerProcessor('osiris',P);`;
  const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));
  await audioCtx.audioWorklet.addModule(url);
  node=new AudioWorkletNode(audioCtx,'osiris',{outputChannelCount:[1]});
  node.connect(audioCtx.destination); pushAudio();
}
function pushAudio(){ if(node){ node.port.postMessage({table:buildPostTable(),s:{...audio}}); } }
function pushParams(){ if(node) node.port.postMessage({s:{...audio}}); }

// ---------------- UI wiring ----------------
let currentTool='pencil';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const cssVar=(n,f)=>{try{const v=getComputedStyle(document.documentElement).getPropertyValue(n).trim();return v||f;}catch{return f;}};
function status(t){ $('#status').textContent=t; }

function buildBankGrid(container){ container.innerHTML='';
  for(let i=0;i<BANK_LEN;i++){ const cell=document.createElement('div'); cell.className='cell'+(i===selectedId?' sel':'');
    cell.dataset.i=i; const idx=document.createElement('div');idx.className='idx';idx.textContent=i; const c=document.createElement('canvas'); c.height=80;
    cell.append(idx,c); cell.addEventListener('click',()=>selectWave(i)); container.append(cell); }
}
function paintBankGrid(container){ [...container.children].forEach((cell,i)=>{ cell.classList.toggle('sel',i===selectedId);
  const c=cell.querySelector('canvas'); drawMini(c,bank[i].postSamples); }); }
function drawMini(cv,s){ const ctx=fitCanvas(cv),W=cv.width,H=cv.height; ctx.clearRect(0,0,W,H);
  ctx.strokeStyle=cssVar('--grid2','#bbb');ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();
  ctx.strokeStyle=cssVar('--plot','#2b2b2b');ctx.lineWidth=1;plot(ctx,s,W,H,s.length); }

function selectWave(i){ selectedId=i; audio.morphX=i%GW; audio.morphY=Math.floor(i/GW); audio.morphZ=i;
  $('#morphZ').value=i; pushParams(); refreshAll(); }

function buildFx(){ const g=$('#fxGrid'); g.innerHTML='';
  for(let e=0;e<EFFECTS_LEN;e++){ const w=bank[selectedId];
    const lab=document.createElement('label');lab.textContent=effectNames[e];
    const r=document.createElement('input');r.type='range';r.min=e===EffectID.PRE_GAIN||e===EffectID.POST_GAIN?-1:0;r.max=1;r.step=0.001;r.value=w.effects[e];
    const v=document.createElement('span');v.className='val';v.textContent=w.effects[e].toFixed(3);
    const reset=document.createElement('button');reset.className='mbtn';reset.textContent='0';reset.style.padding='1px 7px';
    r.addEventListener('input',()=>{bank[selectedId].effects[e]=+r.value;v.textContent=(+r.value).toFixed(3);bank[selectedId].updatePost();refreshPost();});
    reset.addEventListener('click',()=>{r.value=0;bank[selectedId].effects[e]=0;v.textContent='0.000';bank[selectedId].updatePost();refreshPost();});
    g.append(lab,r,v,reset); }
}
function refreshFxValues(){ const w=bank[selectedId]; const rows=$('#fxGrid').children;
  for(let e=0;e<EFFECTS_LEN;e++){ rows[e*4+1].value=w.effects[e]; rows[e*4+2].textContent=w.effects[e].toFixed(3); }
  $('#cyc').checked=w.cycle; $('#nrm').checked=w.normalize; }

function refreshPost(){ const w=bank[selectedId];
  drawWave($('#waveCanvas'),w.samples,{ghost:w.postSamples}); drawHarm($('#harmCanvas'),w.harmonics);
  drawWave($('#fxSrc'),w.samples); drawWave($('#fxPost'),w.postSamples,{color:cssVar('--accent','#c0392b')});
  paintBankGrid($('#bankGridEditor')); if($('#page-grid').classList.contains('active'))paintBankGrid($('#bankGridXY'));
  if($('#page-waterfall').classList.contains('active'))drawWaterfall();
  pushAudio(); }
function refreshAll(){ $('#selLabel').textContent=selectedId; $('#selLabel2').textContent=selectedId;
  refreshFxValues(); refreshPost(); }

// Waterfall
function drawWaterfall(){ const cv=$('#waterfall'),ctx=fitCanvas(cv),W=cv.width,H=cv.height,dpr=devicePixelRatio||1;
  ctx.clearRect(0,0,W,H); const angle=+$('#wfAngle').value, amp=+$('#wfAmp').value;
  const dx=W*0.12*angle, dy=H*0.5*angle, baseY=H*0.78, ampPx=H*0.16*amp;
  for(let j=BANK_LEN-1;j>=0;j--){ const ox=j*dx*0.0+ (W*0.0), shiftX=(j)/(BANK_LEN)* (W*0.18);
    const oy=baseY - j*dy*(0.9/BANK_LEN)*BANK_LEN/ (BANK_LEN) ; // simple stack
    const yOff=baseY - j*( (H*0.5)/BANK_LEN );
    ctx.beginPath(); const s=bank[j].postSamples;
    for(let i=0;i<WAVE_LEN;i++){ const x= (i/(WAVE_LEN-1))*(W*0.8) + shiftX + W*0.02;
      const y= yOff - s[i]*ampPx; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    const t=j/(BANK_LEN-1); ctx.strokeStyle=j===selectedId?cssVar('--accent','#c0392b'):cssVar('--plot','#2b2b2b');if(j!==selectedId)ctx.globalAlpha=0.35+0.5*(1-t);
    ctx.lineWidth=(j===selectedId?2:1)*dpr; ctx.stroke(); ctx.globalAlpha=1; }
}

// XY pad
function attachXY(){ const cv=$('#xyPad'); let active=false;
  const set=e=>{const r=cv.getBoundingClientRect();audio.morphX=clampf((e.clientX-r.left)/r.width,0,1)*(GW-1);
    audio.morphY=clampf((e.clientY-r.top)/r.height,0,1)*(GH-1);pushParams();drawXY();};
  cv.addEventListener('pointerdown',e=>{active=true;cv.setPointerCapture(e.pointerId);audio.modeXY=true;setMorphMode('xy');set(e);});
  cv.addEventListener('pointermove',e=>{if(active)set(e);});
  cv.addEventListener('pointerup',()=>active=false);
}
function drawXY(){ const cv=$('#xyPad'),ctx=fitCanvas(cv),W=cv.width,H=cv.height; ctx.clearRect(0,0,W,H);
  ctx.strokeStyle=cssVar('--grid','#cfcfcf');for(let i=0;i<=GW;i++){const x=i/GW*W;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let j=0;j<=GH;j++){const y=j/GH*H;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  const px=audio.morphX/(GW-1)*W, py=audio.morphY/(GH-1)*H;
  ctx.fillStyle=cssVar('--accent','#c0392b');ctx.beginPath();ctx.arc(px,py,7,0,7);ctx.fill(); }

// ---------------- Import ----------------
const imp={audio:null,len:0,gain:0,offset:0,zoom:1,mode:0};
async function impLoad(file){ const a=await decodeAudio(file); if(!a){$('#impStatus').textContent='Cannot load audio.';return;}
  imp.audio=a; imp.len=a.length; imp.zoom=clampf(imp.len/(BANK_LEN*WAVE_LEN),0.01,100); $('#impZoom').value=imp.zoom; impVals();
  $('#impStatus').textContent=`${file.name}: ${imp.len} samples`; impRender(); }
function impVals(){ $('#impGainV').textContent=imp.gain.toFixed(1)+' dB'; $('#impOffsetV').textContent=imp.offset.toFixed(4); $('#impZoomV').textContent=imp.zoom.toFixed(2); }
function computeImport(){ const out=new Float32Array(BANK_LEN*WAVE_LEN); if(!imp.audio)return out;
  const wl=imp.offset*imp.len, wr=wl+BANK_LEN*WAVE_LEN*imp.zoom;
  const xl=clampf(wl,0,imp.len), xr=clampf(wr,0,imp.len);
  let yl=rescalef(xl,wl,wr,0,BANK_LEN*WAVE_LEN), yr=rescalef(xr,wl,wr,0,BANK_LEN*WAVE_LEN);
  yl=clampf(yl,0,BANK_LEN*WAVE_LEN); yr=clampf(yr,0,BANK_LEN*WAVE_LEN);
  const xli=Math.round(xl),xri=Math.round(xr),yli=Math.round(yl),yri=Math.round(yr);
  const seg=imp.audio.subarray(xli,xri); const dst=new Float32Array(yri-yli);
  resampleLinear(seg,xri-xli,dst,yri-yli); for(let i=0;i<dst.length;i++)out[yli+i]=dst[i];
  const amp=Math.pow(10,imp.gain/20); const base=new Float32Array(BANK_LEN*WAVE_LEN);
  if(imp.mode!==0) for(let j=0;j<BANK_LEN;j++)base.set(bank[j].postSamples,j*WAVE_LEN);
  for(let i=0;i<out.length;i++){ out[i]*=amp;
    if(imp.mode===2)out[i]=base[i]+out[i]; else if(imp.mode===3)out[i]=base[i]*out[i]; }
  return out; }
function impRender(){ const prev=new Float32Array(BANK_LEN*WAVE_LEN);
  if(imp.audio)resampleLinear(imp.audio,imp.len,prev,BANK_LEN*WAVE_LEN);
  const amp=Math.pow(10,imp.gain/20); for(let i=0;i<prev.length;i++)prev[i]*=amp;
  drawWave($('#impPreview'),prev,{lw:1}); drawWave($('#impTable'),computeImport(),{lw:1,color:cssVar('--accent','#c0392b')}); }

// ---------------- Bind everything ----------------
function setMorphMode(m){ audio.modeXY=(m==='xy'); $$('#morphMode button').forEach(b=>b.classList.toggle('on',b.dataset.m===m));
  $('#morphZwrap').style.opacity=m==='z'?1:0.4; pushParams(); }

function bind(){
  $$('.tab').forEach(t=>t.addEventListener('click',()=>{ $$('.tab').forEach(x=>x.classList.remove('active'));t.classList.add('active');
    $$('.page').forEach(p=>p.classList.remove('active')); $('#page-'+t.dataset.page).classList.add('active');
    if(t.dataset.page==='grid'){buildBankGrid($('#bankGridXY'));paintBankGrid($('#bankGridXY'));drawXY();}
    if(t.dataset.page==='waterfall')drawWaterfall(); }));
  $$('#tools .tool').forEach(el=>el.addEventListener('click',()=>{ $$('#tools .tool').forEach(x=>x.classList.remove('active'));el.classList.add('active');currentTool=el.dataset.tool; }));

  $('#mNewBank').onclick=newBank; $('#mShuffle').onclick=shuffleBank; $('#mDupAll').onclick=dupToAll;

  // Theme toggle (persists; repaints canvases so plot colors follow theme)
  const applyTheme=(t)=>{ if(t==='dark') document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
    try{ localStorage.setItem('osiris-theme', t); }catch{}
    refreshPost(); if($('#page-grid').classList.contains('active'))drawXY();
    if($('#page-waterfall').classList.contains('active'))drawWaterfall(); };
  let savedTheme='light'; try{ savedTheme=localStorage.getItem('osiris-theme')||'light'; }catch{}
  if(savedTheme==='dark') document.documentElement.setAttribute('data-theme','dark');
  $('#mTheme').onclick=()=>{ const cur=document.documentElement.getAttribute('data-theme')==='dark'?'dark':'light';
    applyTheme(cur==='dark'?'light':'dark'); };
  $('#mSaveBank').onclick=saveBankWAV; $('#mSaveWave').onclick=saveWaveWAV;
  let loadTarget='bank';
  $('#mLoadBank').onclick=()=>{loadTarget='bank';$('#fileInput').click();};
  $('#mLoadWave').onclick=()=>{loadTarget='wave';$('#fileInput').click();};
  $('#impBrowse').onclick=()=>{loadTarget='import';$('#fileInput').click();};
  $('#fileInput').onchange=async e=>{const f=e.target.files[0]; if(!f)return;
    if(loadTarget==='import'){await impLoad(f);} else { const a=await decodeAudio(f); if(!a){status('Cannot load file.');return;}
      if(loadTarget==='wave'){ const w=bank[selectedId];w.clear();w.samples.set(a.subarray(0,WAVE_LEN));w.commitSamples();refreshAll();status('Loaded wave.'); }
      else { const flat=new Float32Array(BANK_LEN*WAVE_LEN); for(let j=0;j<BANK_LEN;j++)flat.set(a.subarray(j*WAVE_LEN,(j+1)*WAVE_LEN),j*WAVE_LEN); loadBankFromSamples(flat); status('Loaded bank.'); } }
    e.target.value=''; };

  $('#playBtn').onclick=async()=>{ audio.playing=!audio.playing;
    if(audio.playing){ await startAudio(); $('#playBtn').classList.remove('off'); $('#playBtn').textContent='■ Stop'; }
    else { if(audioCtx)audioCtx.suspend(); $('#playBtn').classList.add('off'); $('#playBtn').textContent='▶ Play'; } };
  $('#vol').oninput=e=>{audio.vol=+e.target.value;$('#volV').textContent=audio.vol.toFixed(1)+' dB';pushParams();};
  $('#freq').oninput=e=>{audio.freq=+e.target.value;$('#freqV').textContent=audio.freq+' Hz';pushParams();};
  $('#morphInterp').onchange=e=>{audio.interp=e.target.checked;pushParams();};
  $('#morphZ').oninput=e=>{audio.morphZ=+e.target.value;pushParams();};
  $$('#morphMode button').forEach(b=>b.onclick=()=>setMorphMode(b.dataset.m));

  $('#cyc').onchange=e=>{bank[selectedId].cycle=e.target.checked;bank[selectedId].updatePost();refreshPost();};
  $('#nrm').onchange=e=>{bank[selectedId].normalize=e.target.checked;bank[selectedId].updatePost();refreshPost();};
  $('#fxRandom').onclick=()=>{const w=bank[selectedId];for(let i=0;i<EFFECTS_LEN;i++)w.effects[i]=Math.random()>0.5?Math.pow(Math.random(),2):0;w.updatePost();refreshFxValues();refreshPost();};
  $('#fxBake').onclick=()=>{bank[selectedId].bakeEffects();refreshAll();status('Baked effects into wave.');};
  $('#fxClear').onclick=()=>{bank[selectedId].clearEffects();refreshFxValues();refreshPost();};

  $('#impGain').oninput=e=>{imp.gain=+e.target.value;impVals();impRender();};
  $('#impOffset').oninput=e=>{imp.offset=+e.target.value;impVals();impRender();};
  $('#impZoom').oninput=e=>{imp.zoom=+e.target.value;impVals();impRender();};
  $$('#page-import [data-mode]').forEach(b=>b.onclick=()=>{imp.mode=+b.dataset.mode;$$('#page-import [data-mode]').forEach(x=>x.classList.toggle('on',x===b));impRender();});
  $('#impApply').onclick=()=>{ if(!imp.audio)return; const flat=computeImport(); loadBankFromSamples(flat); status('Imported audio into bank.'); $('#tab')&&0; };
  $('#impCancel').onclick=()=>{imp.audio=null;$('#impStatus').textContent='No file loaded.';impRender();};

  $('#wfAngle').oninput=drawWaterfall; $('#wfAmp').oninput=drawWaterfall;

  // --- Wavetable Library (collect up to 128 → package A/B/C/D) ---
  const LIB_MAX=128;
  const library=[]; // {name, waveforms:Float32Array(256)[], source}
  const libLetter=i=> i<32?'A':i<64?'B':i<96?'C':'D';
  function renderLibrary(){
    $('#libCount').textContent=library.length;
    $('#libN').textContent=library.length;
    const banks=library.length? [...new Set(library.map((_,i)=>libLetter(i)))].join('/') : '—';
    $('#libBanks').textContent=banks;
    const el=$('#libList');
    if(!library.length){ el.innerHTML='<div class="libempty">Empty — add the current wavetable, or turn on auto-collect and generate a few.</div>'; return; }
    el.innerHTML=library.map((w,i)=>`<div class="librow"><span class="lbletter">${libLetter(i)}</span><span class="lbname">${w.name}</span><span class="lbsrc">${w.source}</span><button class="lbdel" data-i="${i}" title="Remove">✕</button></div>`).join('');
    el.querySelectorAll('.lbdel').forEach(b=>b.onclick=()=>{ library.splice(+b.dataset.i,1); renderLibrary(); });
  }
  function libSnapshot(name,source){ return {name:name||`Osiris_WT_${pad2(library.length+1)}`, waveforms:bank.map(w=>Float32Array.from(w.postSamples)), source:source||'current'}; }
  function addToLibrary(name,source){
    if(library.length>=LIB_MAX){ status(`Library full (${LIB_MAX} max). Package or remove some.`); return false; }
    library.push(libSnapshot(name,source)); renderLibrary(); return true; }
  $('#libAdd').onclick=()=>{ if(addToLibrary()) status(`Added wavetable ${library.length} to library.`); };
  $('#libClear').onclick=()=>{ library.length=0; renderLibrary(); };
  $('#libImport').onclick=()=>{ fileTarget='library'; $('#cvFileInput').click(); };
  $('#libPackage').onclick=()=>{
    if(!library.length){ status('Library is empty — add wavetables first.'); return; }
    const zip=convertToWavPak(library, {
      sampleRate:'44100', bitDepth:'16', bankLen:'32', waveLen:'256', separateAD:true, corrected:false });
    download(new Blob([zip],{type:'application/zip'}),'Osiris_WavPak.zip');
    status(`Packaged ${library.length} wavetable(s) → Osiris_WavPak.zip (A/B/C/D, 16-bit/44.1k).`); };
  renderLibrary();
  // expose auto-collect hooks
  window.__libAuto=()=>$('#libAuto').checked;
  window.__libAdd=(name,source)=>addToLibrary(name,source);
  const genSubs={harmonic:'smooth · musical',additive:'evolving texture',catalog:'classic shapes',glitch:'chaotic · bright',fm:'metallic · swept'};
  const gb=$('#genButtons');
  Object.entries(GENERATORS).forEach(([kind,g])=>{ const b=document.createElement('button');
    b.innerHTML=`${g.label}<span class="gen-sub">${genSubs[kind]||''}</span>`; b.dataset.kind=kind;
    b.onclick=()=>runGenerate(kind); gb.append(b); });
  let lastGenKind=null;
  function runGenerate(kind){ const coh=+$('#genCoh').value;
    const waves=generateWavetable(kind,{coherence:coh});
    for(let j=0;j<BANK_LEN;j++){ bank[j].clear(); bank[j].samples.set(waves[j]); bank[j].commitSamples(); }
    lastGenKind=kind; $('#genReroll').style.display='';
    refreshAll();
    if(window.__libAuto && window.__libAuto()) window.__libAdd(`Osiris_WT_${pad2(library.length+1)}`,'generated');
    $('#genStatus').textContent=`Generated 32 waveforms — ${GENERATORS[kind].label}, coherence ${coh.toFixed(2)}. Re-roll for a new random set.`;
    status(`Generated wavetable: ${GENERATORS[kind].label} (coherence ${coh.toFixed(2)})`); }
  $('#mGenerate').onclick=()=>{ $('#generateModal').style.display='flex'; };

  // Help / Manual dropdown
  $('#mHelp').onclick=(e)=>{ e.stopPropagation(); $('#helpMenu').classList.toggle('open'); };
  document.addEventListener('click',()=>$('#helpMenu').classList.remove('open'));
  $('#helpMenu').onclick=(e)=>e.stopPropagation();
  $('#genClose').onclick=()=>{ $('#generateModal').style.display='none'; };
  $('#genCoh').oninput=e=>{ $('#genCohV').textContent=(+e.target.value).toFixed(2); };
  $('#genReroll').onclick=()=>{ if(lastGenKind) runGenerate(lastGenKind); };
  const cvFill=(sel,opts,def)=>{const e=$(sel);e.innerHTML='';opts.forEach(o=>{const op=document.createElement('option');op.value=o;op.textContent=o;if(o===def)op.selected=true;e.append(op);});};
  cvFill('#cvRate',SAMPLE_RATES,'44100'); cvFill('#cvDepth',BIT_DEPTHS,'16');
  cvFill('#cvBankLen',WAVETABLE_LENGTHS,'32'); cvFill('#cvWaveLen',WAVE_LENGTHS,'256');
  const cvQueue=[];  // each: {name, waveforms:Float32Array(256)[], source:'current'|'file'}
  function snapshotWavetable(name){ return {name, waveforms: bank.map(w=>Float32Array.from(w.postSamples)), source:'current'}; }
  function renderQueue(){ const q=$('#cvQueue');
    if(!cvQueue.length){q.innerHTML='<span style="color:var(--muted)">Empty — add the current wavetable or saved .wav files.</span>';return;}
    q.innerHTML=cvQueue.map((w,i)=>`${$('#cvSeparate').checked?(i<32?'A':i<64?'B':i<96?'C':'D')+' · ':''}${w.name} <span style="color:var(--muted)">(${w.source})</span>`).join('<br>'); }
  $('#mConvert').onclick=()=>{ renderQueue(); $('#convertModal').style.display='flex'; };
  $('#cvCancel').onclick=()=>{ $('#convertModal').style.display='none'; };
  $('#cvSeparate').onchange=renderQueue;
  $('#cvAddCurrent').onclick=()=>{ cvQueue.push(snapshotWavetable(`wavetable_${cvQueue.length}`)); renderQueue(); };
  let fileTarget='convert'; // 'convert' | 'library'
  $('#cvAddFiles').onclick=()=>{ fileTarget='convert'; $('#cvFileInput').click(); };
  $('#cvFileInput').onchange=async e=>{ const files=[...e.target.files]; let added=0, failed=0;
    for(const f of files){ try{ const ab=await f.arrayBuffer(); const {waveforms}=parseWavetableWav(ab);
        const item={name:f.name.replace(/\.wav$/i,''), waveforms, source:'file'};
        if(fileTarget==='library'){ if(library.length<LIB_MAX){library.push(item);added++;} }
        else { cvQueue.push(item); added++; } }
      catch(err){ failed++; } }
    if(fileTarget==='library'){ renderLibrary(); status(`Added ${added} file(s) to library${failed?`, ${failed} skipped (not 32×256 WAV)`:''}.`); }
    else { renderQueue(); status(`Added ${added} file(s) to convert queue${failed?`, ${failed} skipped (not 32×256 WAV)`:''}.`); }
    fileTarget='convert'; e.target.value=''; };
  $('#cvClearQueue').onclick=()=>{ cvQueue.length=0; renderQueue(); };
  $('#cvDoConvert').onclick=()=>{
    const list = cvQueue.length ? cvQueue : [snapshotWavetable('wavetable_0')];
    const zip = convertToWavPak(list, {
      sampleRate:$('#cvRate').value, bitDepth:$('#cvDepth').value,
      bankLen:$('#cvBankLen').value, waveLen:$('#cvWaveLen').value,
      separateAD:$('#cvSeparate').checked, corrected:$('#cvCorrected').checked });
    download(new Blob([zip],{type:'application/zip'}), 'Osiris_WavPak.zip');
    $('#convertModal').style.display='none';
    status(`Converted ${list.length} wavetable(s) → Osiris_WavPak.zip (${$('#cvCorrected').checked?'corrected':'faithful'} mode)`);
  };

  attachEditor($('#waveCanvas'),()=>bank[selectedId],refreshPost);
  attachHarm($('#harmCanvas'),()=>bank[selectedId],()=>{refreshFxValues();refreshPost();});
  attachXY();
  window.addEventListener('resize',()=>{refreshPost(); if($('#page-grid').classList.contains('active'))drawXY();});
}

// Seed with a few classic waves so it's not blank
function seed(){ for(let i=0;i<WAVE_LEN;i++){ const t=i/WAVE_LEN;
  bank[0].samples[i]=Math.sin(2*Math.PI*t);
  bank[1].samples[i]=2*t-1;
  bank[2].samples[i]=t<0.5?1:-1;
  bank[3].samples[i]=2*Math.abs(2*t-1)-1;
} for(let j=0;j<4;j++)bank[j].commitSamples(); }

seed(); bind(); buildFx(); buildBankGrid($('#bankGridEditor')); refreshAll();
