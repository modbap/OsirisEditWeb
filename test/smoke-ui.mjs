import { JSDOM } from 'jsdom';
import { readFileSync } from 'fs';
const html = readFileSync(new URL('../index.html', import.meta.url),'utf8');
const htmlNoScript = html.replace(/<script type="module"[^>]*><\/script>/,'');
const dom = new JSDOM(htmlNoScript, { runScripts:'outside-only', pretendToBeVisual:true, url:'http://localhost/' });
const { window } = dom;
const ctxStub = new Proxy({}, { get:()=>(()=>{}) });
window.HTMLCanvasElement.prototype.getContext = ()=>ctxStub;
window.HTMLCanvasElement.prototype.getBoundingClientRect = ()=>({width:600,height:300,left:0,top:0});
window.devicePixelRatio = 1;
window.AudioContext = class { resume(){return Promise.resolve();} suspend(){} get audioWorklet(){return {addModule:()=>Promise.resolve()};} };
window.AudioWorkletNode = class { constructor(){this.port={postMessage(){}};} connect(){} };
window.URL.createObjectURL = ()=> 'blob:stub'; window.URL.revokeObjectURL = ()=>{};
const errors=[];
window.addEventListener('error',e=>errors.push(e.message));
// load the real module via dynamic import, binding globals
globalThis.window = window; globalThis.document = window.document; globalThis.devicePixelRatio = 1;
globalThis.HTMLCanvasElement = window.HTMLCanvasElement; globalThis.Event = window.Event;
globalThis.AudioContext = window.AudioContext; globalThis.AudioWorkletNode = window.AudioWorkletNode;
globalThis.Blob = window.Blob || class{constructor(){}}; globalThis.URL = window.URL;
globalThis.TextEncoder = TextEncoder; globalThis.TextDecoder = TextDecoder;
globalThis.devicePixelRatio = 1; globalThis.requestAnimationFrame = (f)=>setTimeout(f,0);
try { await import('../src/app.js'); } catch(e){ errors.push('IMPORT THROW: '+e.message); }
const click=(sel)=>{const el=window.document.querySelector(sel); if(el) el.dispatchEvent(new window.Event('click',{bubbles:true}));};
try {
  click('#mConvert');                 // open convert modal
  const modal = window.document.querySelector('#convertModal');
  console.log('Convert modal opens:', modal && modal.style.display==='flex' ? 'yes ✓':'NO');
  console.log('Rate options populated:', window.document.querySelectorAll('#cvRate option').length, '(expect 9)');
  console.log('Depth options:', window.document.querySelectorAll('#cvDepth option').length, '(expect 3)');
  click('#cvAddCurrent'); click('#cvAddCurrent');
  console.log('Queue rows after 2 adds:', (window.document.querySelector('#cvQueue').innerHTML.match(/<br>/g)||[]).length+1);
  click('#cvDoConvert');              // should build zip + close, no throw
  console.log('Modal closed after convert:', modal.style.display==='none' ? 'yes ✓':'NO');
  // Generate feature
  click('#mGenerate');
  const gm = window.document.querySelector('#generateModal');
  console.log('Generate modal opens:', gm && gm.style.display==='flex' ? 'yes ✓':'NO');
  console.log('Generator buttons:', window.document.querySelectorAll('#genButtons button').length, '(expect 5)');
  const firstGen = window.document.querySelector('#genButtons button');
  if(firstGen) firstGen.dispatchEvent(new window.Event('click',{bubbles:true}));
  console.log('Re-roll visible after generate:', window.document.querySelector('#genReroll').style.display!=='none' ? 'yes ✓':'NO');
  // Help menu
  click('#mHelp');
  console.log('Help menu opens:', window.document.querySelector('#helpMenu').classList.contains('open') ? 'yes ✓':'NO');
  console.log('Manual links present:', window.document.querySelectorAll('#helpMenu a').length, '(expect 2)');
} catch(e){ errors.push('UI THROW: '+e.message); }
console.log('Errors:', errors.length); errors.slice(0,6).forEach(e=>console.log('  •',e));
console.log(errors.length===0?'UI SMOKE TEST PASS ✓':'see errors');
process.exit(errors.length===0?0:1);
