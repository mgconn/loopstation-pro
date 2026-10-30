'use strict';
const $=id=>document.getElementById(id);
const MAXT=8, CAPSEC=120;
let ctx,sr,inSrc,hp,inGainN,inAn,capNode,master,outAn,monGain,revIn,dlyIn,dly,clickBus,mixTap;
const cap={buf:null,n:0,t0:null};
let M=null; // master loop {len (frames), t0 (ctx sec)}
let playing=false, sel=0, tracks=[], pending=[];
const S={sync:true,snap:true,met:false,countIn:true,bpm:100,latMan:0};
const now=()=>ctx.currentTime;
const latency=()=>((ctx.baseLatency||0)+(ctx.outputLatency||0))+S.latMan/1000;

/* ---------- audio setup ---------- */
async function startAudio(){
  ctx=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
  await ctx.resume(); sr=ctx.sampleRate; cap.buf=new Float32Array(sr*CAPSEC);
  master=ctx.createGain(); outAn=ctx.createAnalyser(); outAn.fftSize=1024;
  master.connect(outAn); outAn.connect(ctx.destination);
  // FX returns
  const conv=ctx.createConvolver(); conv.buffer=makeIR(2.4); revIn=ctx.createGain(); revIn.connect(conv); conv.connect(master);
  dlyIn=ctx.createGain(); dly=ctx.createDelay(4); const fb=ctx.createGain(); fb.gain.value=.38;
  const dlf=ctx.createBiquadFilter(); dlf.type='lowpass'; dlf.frequency.value=4500;
  dlyIn.connect(dly); dly.connect(dlf); dlf.connect(fb); fb.connect(dly); dlf.connect(master); setDelayTime();
  clickBus=ctx.createGain(); clickBus.gain.value=+$('clickVol').value; clickBus.connect(ctx.destination);
  // mix recorder tap
  mixTap=ctx.createScriptProcessor(4096,2,2); const sil=ctx.createGain(); sil.gain.value=0;
  outAn.connect(mixTap); mixTap.connect(sil); sil.connect(ctx.destination);
  mixTap.onaudioprocess=e=>{ if(mixRec){ mixRec.L.push(new Float32Array(e.inputBuffer.getChannelData(0))); mixRec.R.push(new Float32Array(e.inputBuffer.getChannelData(1))); } };
  // input
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,latency:0}});
  inSrc=ctx.createMediaStreamSource(stream);
  hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=10;
  inGainN=ctx.createGain(); inAn=ctx.createAnalyser(); inAn.fftSize=1024;
  monGain=ctx.createGain(); monGain.gain.value=0;
  capNode=ctx.createScriptProcessor(1024,1,1); const sil2=ctx.createGain(); sil2.gain.value=0;
  inSrc.connect(hp); hp.connect(inGainN); inGainN.connect(inAn); inGainN.connect(capNode); inGainN.connect(monGain); monGain.connect(master);
  capNode.connect(sil2); sil2.connect(ctx.destination);
  capNode.onaudioprocess=e=>{
    const d=e.inputBuffer.getChannelData(0), N=cap.buf.length;
    if(cap.t0===null) cap.t0=e.playbackTime-d.length/sr;
    for(let i=0;i<d.length;i++) cap.buf[(cap.n+i)%N]=d[i];
    cap.n+=d.length;
  };
  $('latAuto').textContent=Math.round(((ctx.baseLatency||0)+(ctx.outputLatency||0))*1000)+' ms';
  setInterval(tick,20); requestAnimationFrame(draw);
}
function makeIR(sec){const n=Math.floor(sr*sec),b=ctx.createBuffer(2,n,sr);for(let c=0;c<2;c++){const d=b.getChannelData(c);for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/n,3)}return b}
function setDelayTime(){ if(dly) dly.delayTime.value=Math.min(3.9,60/S.bpm*0.75); }
function capRead(t,len){ // read len frames of captured input beginning at ctx time t
  const out=new Float32Array(len),N=cap.buf.length,f0=Math.round((t-cap.t0)*sr);
  for(let i=0;i<len;i++){const f=f0+i; if(f>=0&&f<cap.n&&f>=cap.n-N) out[i]=cap.buf[f%N];}
  return out;
}

/* ---------- tracks ---------- */
function mkTrack(i){
  const t={i,layers:[],redo:[],len:0,origin:0,originRel:0,free:false,state:'empty',vol:.9,pan:0,rev:0,dlyS:0,mute:false,solo:false,reverse:false,half:false,buffer:null,src:null,el:null};
  t.g=ctx.createGain(); t.p=ctx.createStereoPanner?ctx.createStereoPanner():ctx.createGain();
  t.rs=ctx.createGain(); t.ds=ctx.createGain(); t.rs.gain.value=0; t.ds.gain.value=0;
  t.g.connect(t.p); t.p.connect(master); t.p.connect(t.rs); t.p.connect(t.ds); t.rs.connect(revIn); t.ds.connect(dlyIn);
  buildTrackUI(t); tracks.push(t); updateGains(); return t;
}
function buildTrackUI(t){
  const el=document.createElement('div'); el.className='track'; el.dataset.state='empty';
  const a=x=>`data-act="t${t.i}:${x}"`;
  el.innerHTML=`<div class="thead"><span class="tname">Track ${t.i+1}</span><span class="len small"></span><span class="st">empty</span></div>
  <div class="wave"><canvas></canvas><div class="ph"></div></div>
  <div class="tbtns"><button class="r" ${a('rec')}>● Rec</button><button class="o" ${a('dub')}>⊕ Dub</button><button class="p" ${a('play')}>▶ Play</button><button class="x" ${a('stop')}>■ Stop</button>
  <button class="u" ${a('undo')}>↶ Undo</button><button class="y" ${a('redo')}>↷ Redo</button><button class="m" ${a('mute')}>Mute</button><button class="s" ${a('solo')}>Solo</button>
  <button class="rv" ${a('reverse')}>Rev ⇄</button><button class="h" ${a('half')}>½ spd</button><button class="fr" ${a('free')}>Sync</button><button class="c" ${a('clear')}>Clear</button></div>
  <div class="knobs"><label>Vol<input type="range" class="kv" min="0" max="1.5" step="0.01" value="${t.vol}"></label>
  <label>Pan<input type="range" class="kp" min="-1" max="1" step="0.01" value="0"></label>
  <label>Reverb<input type="range" class="kr" min="0" max="1" step="0.01" value="0"></label>
  <label>Delay<input type="range" class="kd" min="0" max="1" step="0.01" value="0"></label></div>
  <div class="row"><button class="wav" ${a('wav')}>⤓ Export WAV</button></div>`;
  el.addEventListener('pointerdown',()=>selectTrack(t.i));
  el.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',e=>{ if(learning){e.preventDefault();return learnPick(b);} doAct(b.dataset.act); }));
  el.querySelector('.kv').oninput=e=>{t.vol=+e.target.value;updateGains()};
  el.querySelector('.kp').oninput=e=>{t.pan=+e.target.value; if(t.p.pan)t.p.pan.value=t.pan};
  el.querySelector('.kr').oninput=e=>{t.rev=+e.target.value;t.rs.gain.value=t.rev};
  el.querySelector('.kd').oninput=e=>{t.dlyS=+e.target.value;t.ds.gain.value=t.dlyS};
  t.el=el; t.cv=el.querySelector('canvas'); t.ph=el.querySelector('.ph'); $('tracks').appendChild(el);
}
function setState(t,s){t.state=s;t.el.dataset.state=s;t.el.querySelector('.st').textContent=s;refreshUI(t)}
function refreshUI(t){
  const q=c=>t.el.querySelector(c);
  q('.m').classList.toggle('on',t.mute);q('.s').classList.toggle('on',t.solo);q('.rv').classList.toggle('on',t.reverse);
  q('.h').classList.toggle('on',t.half);q('.fr').textContent=t.free?'Free':'Sync';q('.fr').classList.toggle('on',t.free);
  q('.p').classList.toggle('on',t.state==='playing'||t.state==='overdubbing');
  q('.len').textContent=t.len?(t.len/sr).toFixed(2)+'s'+(M&&!t.free?' ×'+Math.round(t.len/M.len):'')+' · '+t.layers.length+' layer'+(t.layers.length==1?'':'s'):'';
}
function selectTrack(i){ if(i>=tracks.length)return; sel=i; tracks.forEach(t=>t.el.classList.toggle('sel',t.i===i)); }
function updateGains(){ const anySolo=tracks.some(t=>t.solo);
  tracks.forEach(t=>t.g.gain.setTargetAtTime(t.vol*(t.mute?0:1)*(anySolo&&!t.solo?0:1),now(),.01)); }
function renderTrack(t){
  if(!t.layers.length){t.buffer=null;drawWave(t);return}
  const b=ctx.createBuffer(1,t.len,sr),d=b.getChannelData(0);
  for(const L of t.layers) for(let i=0;i<t.len;i++) d[i]+=L[i];
  if(t.reverse) d.reverse();
  t.buffer=b; drawWave(t);
}
function startSrc(t,when){
  stopSrc(t); if(!t.buffer) return;
  const s=ctx.createBufferSource(); s.buffer=t.buffer; s.loop=true; const rate=t.half?.5:1; s.playbackRate.value=rate;
  const dur=t.len/sr, eff=dur/rate; let ph=((when-t.origin)%eff+eff)%eff; let off=ph*rate;
  if(t.reverse) off=(dur-off)%dur;
  s.connect(t.g); s.start(when,off); t.src=s;
}
function stopSrc(t,when){ if(t.src){try{t.src.stop(when||0)}catch(e){} t.src=null;} }
function anyContent(){return tracks.some(t=>t.layers.length)}

/* ---------- recording ---------- */
const barLen=()=>60/S.bpm*4;
function nextBoundary(t,origin,L){ return origin+Math.ceil((t-origin)/L-1e-6)*L; }
function beginRec(t,mode){ // mode: 'rec' | 'dub'
  if(pending.some(p=>p.t===t))return;
  const n=now(); let start=n+0.01;
  if(!M){
    if(S.met){ if(!metGrid) metGrid=n; start=nextBoundary(n+0.05,metGrid,barLen()); if(S.countIn&&start-n<barLen()-0.05) start+=barLen(); }
  } else if(S.snap && S.sync){ start=nextBoundary(n,M.t0,M.len/sr); }
  if(M&&S.snap&&S.sync){ // tolerance: pressed just after a boundary -> start at that boundary
    const L=M.len/sr, prev=nextBoundary(n,M.t0,L)-L; if(n-prev<0.15*L) start=prev;
  }
  if(mode==='rec'){ t.free=!S.sync||t.free; }
  pending.push({t,mode,start,end:null}); setState(t,start>n+0.03?'armed':(mode==='dub'?'overdubbing':'recording'));
  if(mode==='dub'&&!t.src&&playing) startSrc(t,now()+.02);
}
function endRec(p){
  const n=now(), t=p.t; if(n<p.start){ pending.splice(pending.indexOf(p),1); setState(t,t.layers.length?(t.src?'playing':'stopped'):'empty'); return; }
  let end=n;
  if(!M){ if(S.met){ const B=barLen(); end=p.start+Math.max(1,Math.round((n-p.start)/B))*B; } }
  else if(S.sync&&!(p.mode==='rec'&&t.free)){
    const L=M.len/sr; if(S.snap||p.mode==='rec'){ const k=(n-p.start)/L; end=p.start+Math.max(1,(k%1<0.15?Math.floor(k):Math.ceil(k)))*L; }
  }
  if(p.mode==='dub'&&S.sync&&S.snap&&t.len){ } 
  p.end=end; setState(t,end>n+0.03?(p.mode==='dub'?'overdubbing':'recording'):t.state);
}
function finalize(p){
  const t=p.t, lat=latency(); pending.splice(pending.indexOf(p),1);
  let len=Math.round((p.end-p.start)*sr);
  if(M&&p.mode==='rec'&&S.sync&&!t.free) len=Math.max(1,Math.round(len/M.len))*M.len;
  const data=capRead(p.start+lat,len); const F=Math.min(Math.round(sr*.003),len>>2);
  for(let i=0;i<F;i++){const g=i/F;data[i]*=g;data[len-1-i]*=g}
  if(p.mode==='rec'){
    if(!M){ M={len,t0:p.start}; t.origin=p.start; t.free=false; if(!S.met)metGrid=p.start; else metGrid=p.start; playing=true; }
    else t.origin=t.free?p.start:M.t0;
    t.len=len; t.originRel=t.origin-M.t0;
    const L=new Float32Array(len), off=Math.round((p.start-t.origin)*sr);
    for(let i=0;i<len;i++) L[(((off+i)%len)+len)%len]=data[i];
    t.layers=[L]; t.redo=[];
  } else {
    const L=new Float32Array(t.len), off=Math.round((p.start-t.origin)*sr)*(t.half?.5:1);
    const N=t.len, rev=t.reverse, step=t.half?.5:1;
    for(let i=0;i<data.length;i++){ let j=(((Math.floor(off+i*step))%N)+N)%N; if(rev) j=N-1-j; L[j]+=data[i]; }
    t.layers.push(L); t.redo=[];
  }
  renderTrack(t); if(playing) startSrc(t,now()+0.02); setState(t,playing?'playing':'stopped'); loopInfo();
}
function tick(){
  const n=now();
  for(const p of [...pending]){
    if(p.end===null && n>=p.start && p.t.state==='armed') setState(p.t,p.mode==='dub'?'overdubbing':'recording');
    if(p.end!==null && n>=p.end+latency()+0.12) finalize(p);
  }
  metSchedule();
}
function loopInfo(){ $('loopInfo').textContent=M?`Master loop ${(M.len/sr).toFixed(2)} s${S.met?` · ${S.bpm} BPM`:''} · ${tracks.filter(t=>t.layers.length).length} track(s) with audio · ${playing?'playing':'stopped'}`:'No loop yet — record track 1 to set the loop length.'; }

/* ---------- actions ---------- */
function doAct(a){
  if(!ctx) return;
  const [scope,cmd]=a.split(':');
  if(scope==='master'){
    if(cmd==='play'){ playing?masterStop():masterPlay(); } else if(cmd==='stop') masterStop();
    else if(cmd==='rec') toggleMix(); else if(cmd==='tap') tap(); else if(cmd==='met'){ $('metOn').click(); }
    return;
  }
  const t=tracks[+scope.slice(1)]; if(!t) return; selectTrack(t.i);
  const p=pending.find(p=>p.t===t);
  switch(cmd){
    case 'cycle':
      if(p){ p.end===null?endRec(p):0; }
      else if(!t.layers.length) beginRec(t,'rec');
      else if(t.state==='playing') beginRec(t,'dub');
      else trackPlay(t); break;
    case 'rec': if(p) endRec(p); else beginRec(t,t.layers.length?'dub':'rec'); break;
    case 'dub': if(p) endRec(p); else if(t.layers.length) beginRec(t,'dub'); else beginRec(t,'rec'); break;
    case 'play': trackPlay(t); break;
    case 'stop': if(p&&p.end===null) endRec(p); stopSrc(t); if(t.layers.length&&!p) setState(t,'stopped'); break;
    case 'undo': if(t.layers.length&&!p){t.redo.push(t.layers.pop()); afterEdit(t);} break;
    case 'redo': if(t.redo.length&&!p){t.layers.push(t.redo.pop()); afterEdit(t);} break;
    case 'clear': if(p) pending.splice(pending.indexOf(p),1); stopSrc(t); t.layers=[];t.redo=[];t.len=0;t.buffer=null;t.free=false; setState(t,'empty'); drawWave(t); if(!anyContent()){M=null;playing=false;} loopInfo(); break;
    case 'mute': t.mute=!t.mute; updateGains(); refreshUI(t); break;
    case 'solo': t.solo=!t.solo; updateGains(); refreshUI(t); break;
    case 'reverse': t.reverse=!t.reverse; renderTrack(t); if(t.src) startSrc(t,now()+.02); refreshUI(t); break;
    case 'half': t.half=!t.half; if(t.src) startSrc(t,now()+.02); refreshUI(t); break;
    case 'free': if(!t.layers.length){t.free=!t.free; refreshUI(t);} break;
    case 'wav': if(t.buffer) download(encodeWav([t.buffer.getChannelData(0)]),`track${t.i+1}.wav`); break;
  }
}
function afterEdit(t){ renderTrack(t); if(!t.layers.length){stopSrc(t);setState(t,'empty'); if(!anyContent()){M=null;playing=false}} else { if(t.src||t.state==='playing') startSrc(t,now()+.02); refreshUI(t);} loopInfo(); }
function trackPlay(t){ if(!t.layers.length) return; if(!playing) { masterPlay(); return; } startSrc(t,now()+.02); setState(t,'playing'); }
function masterPlay(){ if(!M) return; const w=now()+0.05; M.t0=w; metGrid=w; playing=true;
  tracks.forEach(t=>{ if(t.layers.length){ t.origin=w+(t.free?0:0); startSrc(t,w); setState(t,'playing'); } }); loopInfo(); }
function masterStop(){ playing=false; pending.slice().forEach(p=>{ if(p.end===null) endRec(p); }); tracks.forEach(t=>{ stopSrc(t); if(t.layers.length&&!pending.some(p=>p.t===t)) setState(t,'stopped'); }); loopInfo(); }

/* ---------- metronome / tempo ---------- */
let metGrid=null, nextClick=null, taps=[];
function metSchedule(){
  if(!S.met){nextClick=null;return}
  const grid=M?M.t0:(metGrid??(metGrid=now())), beat=60/S.bpm, n=now();
  if(nextClick===null||nextClick<n) nextClick=nextBoundary(n+0.01,grid,beat);
  while(nextClick<n+0.12){ const idx=Math.round((nextClick-grid)/beat); click(nextClick, ((idx%4)+4)%4===0); nextClick+=beat; }
}
function click(t,acc){ const o=ctx.createOscillator(),g=ctx.createGain(); o.frequency.value=acc?1600:1000; g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(1,t+.001); g.gain.exponentialRampToValueAtTime(.001,t+.05); o.connect(g); g.connect(clickBus); o.start(t); o.stop(t+.06); }
function tap(){ const n=performance.now(); taps=taps.filter(x=>n-x<2500); taps.push(n); if(taps.length>1){ const iv=(taps[taps.length-1]-taps[0])/(taps.length-1); setBpm(Math.round(60000/iv)); } $('tapBtn').classList.add('on'); setTimeout(()=>$('tapBtn').classList.remove('on'),100); }
function setBpm(b){ S.bpm=Math.max(40,Math.min(240,b)); $('bpm').value=S.bpm; setDelayTime(); nextClick=null; loopInfo(); }

/* ---------- latency auto-calibration ---------- */
async function calibrate(){
  $('calMsg').textContent='Listening…'; const T=now()+0.3;
  const o=ctx.createOscillator(),g=ctx.createGain(); o.frequency.value=2000; g.gain.setValueAtTime(0,T); g.gain.linearRampToValueAtTime(1,T+.001); g.gain.setValueAtTime(1,T+.01); g.gain.linearRampToValueAtTime(0,T+.012); o.connect(g); g.connect(ctx.destination); o.start(T); o.stop(T+.02);
  await new Promise(r=>setTimeout(r,1300));
  const pre=capRead(T-0.3,Math.round(sr*.25)); let noise=0; for(const v of pre) noise=Math.max(noise,Math.abs(v));
  const d=capRead(T,Math.round(sr*.6)), th=Math.max(0.05,noise*4); let idx=-1;
  for(let i=0;i<d.length;i++) if(Math.abs(d[i])>th){idx=i;break}
  if(idx<0){ $('calMsg').textContent='No click heard — unplug headphones, raise speaker volume, retry.'; return null; }
  const measured=idx/sr*1000, auto=((ctx.baseLatency||0)+(ctx.outputLatency||0))*1000;
  S.latMan=Math.round(measured-auto); $('latMan').value=S.latMan; $('latManV').textContent=S.latMan; saveSettings();
  $('calMsg').textContent=`Measured ${measured.toFixed(0)} ms round-trip.`; return measured;
}

/* ---------- mix recording / WAV ---------- */
let mixRec=null;
function toggleMix(){
  if(!mixRec){ mixRec={L:[],R:[]}; $('mRec').classList.add('on'); $('mRec').textContent='■ Stop mix rec'; $('mixInfo').textContent='● Recording performance…'; }
  else { const r=mixRec; mixRec=null; $('mRec').classList.remove('on'); $('mRec').textContent='● Record mix';
    const cat=a=>{const n=a.reduce((s,x)=>s+x.length,0),o=new Float32Array(n);let k=0;for(const x of a){o.set(x,k);k+=x.length}return o};
    const L=cat(r.L),R=cat(r.R); download(encodeWav([L,R]),`performance-${new Date().toISOString().slice(0,19).replace(/[:T]/g,'-')}.wav`);
    $('mixInfo').textContent=`Saved mix ${(L.length/sr).toFixed(1)} s`; }
}
function encodeWav(chs){
  const nc=chs.length,n=chs[0].length,b=new ArrayBuffer(44+n*nc*2),v=new DataView(b);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  ws(0,'RIFF');v.setUint32(4,36+n*nc*2,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,nc,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*nc*2,true);v.setUint16(32,nc*2,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,n*nc*2,true);
  let o=44;for(let i=0;i<n;i++)for(let c=0;c<nc;c++){const s=Math.max(-1,Math.min(1,chs[c][i]));v.setInt16(o,s<0?s*0x8000:s*0x7fff,true);o+=2}
  return new Blob([b],{type:'audio/wav'});
}
function download(blob,name){ window.__lastExport={name,size:blob.size}; const u=URL.createObjectURL(blob),a=document.createElement('a'); a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000); }

/* ---------- drawing ---------- */
function drawWave(t){
  const c=t.cv,dpr=devicePixelRatio||1,w=c.clientWidth*dpr,h=c.clientHeight*dpr; c.width=w;c.height=h; const g=c.getContext('2d'); g.clearRect(0,0,w,h);
  if(!t.buffer)return; const d=t.buffer.getChannelData(0),step=Math.max(1,Math.floor(d.length/w)); g.fillStyle='#7088d0';
  let pk=0.001; for(let i=0;i<d.length;i+=16) pk=Math.max(pk,Math.abs(d[i]));
  for(let x=0;x<w;x++){let m=0;const s=Math.floor(x*d.length/w);for(let i=s;i<s+step&&i<d.length;i++)m=Math.max(m,Math.abs(d[i]));const y=m/pk*h/2*.95;g.fillRect(x,h/2-y,1,Math.max(1,y*2))}
  if(M&&!t.free){ const k=Math.round(t.len/M.len); g.fillStyle='#ffffff30'; for(let j=1;j<k;j++) g.fillRect(j*w/k,0,1,h); }
}
function peak(an){const a=new Float32Array(an.fftSize);an.getFloatTimeDomainData(a);let m=0;for(const v of a)m=Math.max(m,Math.abs(v));return m}
function draw(){
  const n=now();
  $('inMeter').style.width=Math.min(100,Math.sqrt(peak(inAn))*100)+'%'; $('outMeter').style.width=Math.min(100,Math.sqrt(peak(outAn))*100)+'%';
  for(const t of tracks){ if(t.src&&t.len){ const rate=t.half?.5:1, eff=t.len/sr/rate; const ph=(((n-(ctx.outputLatency||0)-t.origin)%eff)+eff)%eff/eff; t.ph.style.display='block'; t.ph.style.left=(ph*100)+'%'; } else t.ph.style.display='none'; }
  requestAnimationFrame(draw);
}

/* ---------- keyboard ---------- */
document.addEventListener('keydown',e=>{
  if(e.target.matches('input[type=text],input:not([type]),input[type=number],select')) return;
  const k=e.key;
  if(k==='?'){toggleHelp();return} if(k==='Escape'){$('help').classList.add('hidden');return}
  if(!ctx)return;
  if(/^[1-8]$/.test(k)){ const i=+k-1; while(tracks.length<=i&&tracks.length<MAXT) mkTrack(tracks.length); selectTrack(i); return; }
  const map={' ':'cycle',o:'dub',p:'play',s:'stop',z:'undo',y:'redo',m:'mute',l:'solo',r:'reverse',h:'half'};
  const lk=k.toLowerCase();
  if(k===' '||(map[lk]&&!e.ctrlKey&&!e.metaKey)){ e.preventDefault(); doAct(`t${sel}:${map[lk]||'cycle'}`); return; }
  if(k==='C'&&e.shiftKey){ doAct(`t${sel}:clear`); return; }
  if(k==='Enter'){ e.preventDefault(); doAct('master:play'); } else if(lk==='t') tap(); else if(lk==='k') $('metOn').click(); else if(lk==='w') toggleMix();
});
function toggleHelp(){ $('help').classList.toggle('hidden'); }

/* ---------- MIDI ---------- */
let learning=false, learnTarget=null, midiMap=JSON.parse(localStorage.getItem('lp.midi')||'{}');
async function enableMidi(){
  if(!navigator.requestMIDIAccess){ $('midiMsg').textContent='Web MIDI not supported here (use Chrome/Edge; not iOS Safari).'; return; }
  try{ const acc=await navigator.requestMIDIAccess(); const hook=()=>{ let c=0; acc.inputs.forEach(i=>{i.onmidimessage=onMidi;c++}); $('midiMsg').textContent=c+' MIDI input(s) · '+Object.keys(midiMap).length+' mapping(s)'; }; hook(); acc.onstatechange=hook; }
  catch(e){ $('midiMsg').textContent='MIDI blocked: '+e.message; }
}
function onMidi(m){ const [st,d1,d2]=m.data, type=st&0xf0; let key=null;
  if(type===0x90&&d2>0) key='n'+d1; else if(type===0xb0&&d2>63) key='c'+d1; else if(type===0xc0) key='p'+d1;
  if(!key)return;
  if(learning&&learnTarget){ midiMap[key]=learnTarget.dataset.act; localStorage.setItem('lp.midi',JSON.stringify(midiMap)); $('midiMsg').textContent=`Mapped ${key} → ${learnTarget.dataset.act}`; learnTarget.classList.remove('learnSel'); learnTarget=null; return; }
  if(midiMap[key]){ const a=midiMap[key]; const ti=/^t(\d)/.exec(a); if(ti) while(tracks.length<=+ti[1]&&tracks.length<MAXT) mkTrack(tracks.length); doAct(a); }
}
function learnPick(b){ if(learnTarget) learnTarget.classList.remove('learnSel'); learnTarget=b; b.classList.add('learnSel'); $('midiMsg').textContent='Now press a pedal/pad/key on your controller…'; }
window.__midiTest=onMidi;

/* ---------- sessions (IndexedDB) ---------- */
function db(){ return new Promise((res,rej)=>{ const r=indexedDB.open('looperpro',1); r.onupgradeneeded=()=>r.result.createObjectStore('sessions',{keyPath:'name'}); r.onsuccess=()=>res(r.result); r.onerror=()=>rej(r.error); }); }
async function dbDo(mode,fn){ const d=await db(); return new Promise((res,rej)=>{ const tx=d.transaction('sessions',mode),st=tx.objectStore('sessions'); const r=fn(st); tx.oncomplete=()=>res(r&&r.result); tx.onerror=()=>rej(tx.error); }); }
async function listSessions(){ const all=await dbDo('readonly',s=>s.getAll()); $('sessList').innerHTML=all.map(s=>`<option>${s.name.replace(/</g,'&lt;')}</option>`).join(''); return all.map(s=>s.name); }
async function saveSession(){
  const name=$('sessName').value.trim()||'Session';
  const data={name,date:Date.now(),sr,S:{...S},M:M?{len:M.len}:null,tracks:tracks.map(t=>({layers:t.layers,len:t.len,originRel:t.originRel,free:t.free,vol:t.vol,pan:t.pan,rev:t.rev,dlyS:t.dlyS,mute:t.mute,solo:t.solo,reverse:t.reverse,half:t.half}))};
  await dbDo('readwrite',s=>s.put(data)); await listSessions(); $('sessList').value=name; $('mixInfo').textContent='Saved session "'+name+'"';
}
async function loadSession(name){
  const d=await dbDo('readonly',s=>s.get(name)); if(!d) return;
  masterStop(); tracks.forEach(t=>doAct(`t${t.i}:clear`));
  while(tracks.length<d.tracks.length) mkTrack(tracks.length);
  M=d.M?{len:d.M.len,t0:now()}:null; Object.assign(S,d.S); syncSettingsUI();
  d.tracks.forEach((s,i)=>{ const t=tracks[i]; Object.assign(t,{layers:s.layers,redo:[],len:s.len,originRel:s.originRel,free:s.free,vol:s.vol,pan:s.pan,rev:s.rev,dlyS:s.dlyS,mute:s.mute,solo:s.solo,reverse:s.reverse,half:s.half});
    const q=c=>t.el.querySelector(c); q('.kv').value=t.vol;q('.kp').value=t.pan;q('.kr').value=t.rev;q('.kd').value=t.dlyS; if(t.p.pan)t.p.pan.value=t.pan; t.rs.gain.value=t.rev; t.ds.gain.value=t.dlyS;
    renderTrack(t); setState(t,t.layers.length?'stopped':'empty'); });
  if(d.sr!==sr) $('mixInfo').textContent='Note: session sample rate differs ('+d.sr+')';
  updateGains(); loopInfo(); $('sessName').value=name;
}

/* ---------- settings ---------- */
function saveSettings(){ localStorage.setItem('lp.settings',JSON.stringify(S)); }
function syncSettingsUI(){ $('syncOn').checked=S.sync;$('snapOn').checked=S.snap;$('metOn').checked=S.met;$('countIn').checked=S.countIn;$('bpm').value=S.bpm;$('latMan').value=S.latMan;$('latManV').textContent=S.latMan; }
Object.assign(S,JSON.parse(localStorage.getItem('lp.settings')||'{}')); S.met=false; syncSettingsUI();
$('syncOn').onchange=e=>{S.sync=e.target.checked;saveSettings()}; $('snapOn').onchange=e=>{S.snap=e.target.checked;saveSettings()};
$('metOn').onchange=e=>{S.met=e.target.checked;nextClick=null;loopInfo()}; $('countIn').onchange=e=>{S.countIn=e.target.checked;saveSettings()};
$('bpm').onchange=e=>{setBpm(+e.target.value);saveSettings()}; $('tapBtn').onclick=e=>{ if(learning)return learnPick(e.target); tap(); };
$('latMan').oninput=e=>{S.latMan=+e.target.value;$('latManV').textContent=S.latMan;saveSettings()};
$('clickVol').oninput=e=>{ if(clickBus) clickBus.gain.value=+e.target.value };
$('lowCut').onchange=e=>{ hp&&(hp.frequency.value=e.target.checked?100:10) };
$('inGain').oninput=e=>{ inGainN&&(inGainN.gain.value=+e.target.value) };
$('mVol').oninput=e=>{ master&&(master.gain.value=+e.target.value) };
$('monOn').onchange=e=>{ if(e.target.checked&&!confirm('Monitoring plays your mic through the output. Use headphones or you will get feedback. Turn on?')){e.target.checked=false;return} monGain&&(monGain.gain.value=e.target.checked?1:0) };
['mPlay','mStop','mRec'].forEach(id=>$(id).addEventListener('click',e=>{ if(learning)return learnPick(e.currentTarget); doAct(e.currentTarget.dataset.act); }));
$('calBtn').onclick=calibrate; $('helpBtn').onclick=toggleHelp; $('helpClose').onclick=toggleHelp;
$('saveBtn').onclick=saveSession; $('loadBtn').onclick=()=>$('sessList').value&&loadSession($('sessList').value);
$('delBtn').onclick=async()=>{ const n=$('sessList').value; if(n&&confirm('Delete session "'+n+'"?')){ await dbDo('readwrite',s=>s.delete(n)); listSessions(); } };
$('midiBtn').onclick=enableMidi;
$('learnBtn').onclick=()=>{ learning=!learning; document.body.classList.toggle('learning',learning); $('learnBtn').classList.toggle('on',learning); $('learnBtn').textContent=learning?'Done learning':'MIDI learn'; if(learning){enableMidi(); $('midiMsg').textContent='Click a button, then press a controller pedal/pad.'} };
$('addTrack').onclick=()=>{ if(ctx&&tracks.length<MAXT){ mkTrack(tracks.length); } };
$('startBtn').onclick=async()=>{ try{ await startAudio(); for(let i=0;i<4;i++) mkTrack(i); selectTrack(0); $('startOverlay').classList.add('hidden'); listSessions().catch(()=>{}); }
  catch(e){ $('startBtn').textContent='Mic error: '+e.message+' — tap to retry'; ctx&&ctx.close(); ctx=null; } };
window.addEventListener('resize',()=>tracks.forEach(drawWave));
if('serviceWorker' in navigator && location.protocol!=='file:') navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).catch(()=>{});
window.__lp={get tracks(){return tracks},get M(){return M},get sr(){return sr},S,doAct,calibrate,saveSession,loadSession,listSessions,latency};
