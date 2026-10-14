// Burn City Replay: day-by-day time-lapse of the real ecosystem history (history.js, built nightly by tools/history.py).
// Isolated from rendering: only drives existing tower params (group scale/visibility, n.h/n.w for flame layout,
// burn counts) and restores them exactly on exit.
const HEIGHT=mc=>Math.min(112,Math.max(12,16*Math.log10(mc+10)-14)), WIDTH=tv=>Math.min(9.5,Math.max(2.2,1.7+.042*Math.sqrt(tv)));
const DPS=4; // 1x = 4 days per second
let H=null;
function loadHistory(){if(window.HISTORY)return Promise.resolve(window.HISTORY);return new Promise((ok,no)=>{const s=document.createElement('script');s.src='history.js?v='+Date.now().toString(36).slice(0,-4);s.onload=()=>ok(window.HISTORY);s.onerror=no;document.head.appendChild(s)})}
const css=`#rpBar{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);width:min(760px,calc(100vw - 16px));z-index:65;display:none;box-sizing:border-box;padding:10px 12px 8px;
 background:rgba(8,10,24,.88);border:1px solid #ff7a1a88;border-radius:14px;color:#ffe2c4;font:13px/1.3 monospace;-webkit-user-select:none;user-select:none;touch-action:manipulation}
body.rpOn #rpBar{display:block}
#rpBar .r1{display:flex;align-items:center;gap:8px;flex-wrap:wrap}#rpBar button{min-width:48px;min-height:48px;border-radius:10px;border:1px solid #ff9a3a;background:#2a140a;color:#fff;font:600 16px monospace;cursor:pointer;padding:0 10px}
#rpBar button.on{background:#ff7a1a;color:#1a0800}#rpBar #rpDate{font:700 17px monospace;color:#ffcf6a;min-width:118px}#rpBar .sp{display:flex;gap:4px}#rpBar .sp button{min-width:44px;font-size:14px}
#rpBar #rpX{margin-left:auto}#rpBar .r2{position:relative;margin-top:8px}#rpRange{width:100%;height:36px;margin:0;accent-color:#ff7a1a;touch-action:none}
#rpTicks{position:relative;height:14px;font-size:11px;color:#ffe2c499}#rpTicks span{position:absolute;transform:translateX(-50%);white-space:nowrap}
#rpBar .r3{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#ffe2c4aa;margin-top:2px}#rpBar .r3 a{color:#9ffcff}#rpApx{color:#ffb000}
#rpCall{position:fixed;left:50%;top:76px;transform:translate(-50%,-10px);z-index:64;padding:10px 18px;border-radius:12px;background:rgba(10,14,30,.9);border:1px solid var(--c,#3cf3ff);color:#fff;
 font:600 16px monospace;text-align:center;opacity:0;transition:opacity .35s,transform .35s;pointer-events:none;max-width:90vw}#rpCall.on{opacity:1;transform:translate(-50%,0)}#rpCall small{display:block;font-weight:400;font-size:12px;color:#ffe2c4cc}
#rpFlash{position:fixed;inset:0;z-index:63;pointer-events:none;background:radial-gradient(circle at 50% 55%,rgba(255,120,30,.45),rgba(255,60,0,0) 60%);opacity:0;transition:opacity .5s}
body.rpOn #hud{opacity:.35}body.rpOn #recap{display:none!important}
@media (max-width:600px){#rpBar{bottom:6px;padding:8px}#rpBar #rpDate{font-size:15px;min-width:100px}#rpCall{top:60px;font-size:14px}}`;
export function init(B){
  const {E,N,bridges,layoutMarks,orbit,C,$}=B;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const bar=document.createElement('div');bar.id='rpBar';bar.setAttribute('role','region');bar.setAttribute('aria-label','City history replay');
  bar.innerHTML=`<div class="r1"><button id="rpPlay" aria-label="Play or pause">▶</button><span id="rpDate">loading…</span>
   <span class="sp" role="group" aria-label="Speed"><button data-s="1" class="on">1x</button><button data-s="4">4x</button><button data-s="16">16x</button></span>
   <button id="rpX" aria-label="Exit replay, back to live">✕ Live</button></div>
   <div class="r2"><input id="rpRange" type="range" min="0" max="1" step="0.01" value="0" aria-label="Replay date"><div id="rpTicks"></div></div>
   <div class="r3"><span id="rpStat"></span><span><span id="rpApx"></span> <a href="https://xrpl.to" target="_blank" rel="noopener">Data by xrpl.to</a> · XRPL</span></div>`;
  document.body.appendChild(bar);
  const call=document.createElement('div');call.id='rpCall';document.body.appendChild(call);const flash=document.createElement('div');flash.id='rpFlash';document.body.appendChild(flash);
  const q=s=>bar.querySelector(s),rng=q('#rpRange');
  let on=false,play=false,speed=1,x=0,last=-1,saved=null,callQ=[],callT=0,markT=0,camTw=null;
  const dateOf=i=>{const d=new Date(H.d0+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+i);return d};
  const ds=i=>dateOf(i).toISOString().slice(0,10),nice=i=>dateOf(i).toLocaleDateString([], {year:'numeric',month:'short',day:'numeric',timeZone:'UTC'});
  const val=(a,k)=>{if(!a)return null;const v=a[Math.max(0,Math.min(a.length-1,k))];return v==null?null:Math.pow(10,v/100)};
  function state(n,xx){const h=H.tok[n.name];if(!h)return {vis:true,sy:1,sx:1,tower:true};const i=Math.floor(xx),f=xx-i;
    if(i<h.l)return {vis:false};const bond=h.a??(h.ms??1e9);
    if(i<bond||!h.m||i<h.ms)return {vis:true,lot:true,sy:.07,sx:.55};
    const k=i-h.ms;let mc=val(h.m,k),m2=val(h.m,k+1),tv=val(h.t,k),t2=val(h.t,k+1);if(m2&&mc)mc=mc*Math.pow(m2/mc,f);if(t2&&tv)tv=tv*Math.pow(t2/tv,f);
    const hh=mc!=null?HEIGHT(mc):n.h0,ww=tv!=null?WIDTH(tv):n.w0;const apx=(h.x||[]).some(r=>i>=r[0]&&i<=r[1]);
    return {vis:true,tower:true,sy:hh/n.h0,sx:ww/n.w0,apx,mc}}
  const burnsTo=(h,i)=>{let c=0;for(const b of h.b||[])if(b[0]<=i)c+=b[1];else break;return c};
  function say(html,col){callQ.push({html,col});if(callQ.length>4)callQ.splice(0,callQ.length-4)}
  function events(a,b){ // crossing from day a (exclusive) to b (inclusive)
    if(b<=a||b-a>40)return;let burnHit=null,bc=0;
    for(const n of E.nodes){const h=H.tok[n.name];if(!h)continue;
      if(h.l>a&&h.l<=b)say(`🏗 New token launched: ${n.name}<small>${nice(h.l)} · empty lot</small>`,'#9ffcff');
      if(h.a!=null&&h.a>a&&h.a<=b&&h.a>h.l)say(`🏙 ${n.name} bonded: tower rises<small>${nice(h.a)} · first AMM pool</small>`,'#66ff99');
      for(const e of h.b||[])if(e[0]>a&&e[0]<=b){bc+=e[1];burnHit=n}}
    if(burnHit){flash.style.transition='none';flash.style.opacity='1';requestAnimationFrame(()=>{flash.style.transition='opacity .6s';flash.style.opacity='0'});
      if(speed<16||bc>2)say(`🔥 Burn${bc>1?'s ×'+bc:''} · ${burnHit.name}<small>sent to the issuer: permanent flame</small>`,'#ff7a1a')}}
  function apply(xx){const i=Math.floor(xx);let towers=0,lots=0,apx=0,flames=0,dirty=false;
    for(const n of E.nodes){if(!n.group)continue;const s=state(n,xx);n.rp=s;
      if(n.group.visible!==!!s.vis){n.group.visible=!!s.vis;dirty=true}
      if(n.lblEl)n.lblEl.style.visibility=s.vis&&!s.lot?'':'hidden';
      if(s.tower&&H.tok[n.name])towers++;if(s.lot)lots++;if(s.apx)apx++;
      const h=H.tok[n.name];if(h){const c=s.vis&&!s.lot?burnsTo(h,i):0;flames+=c;if(c!==n.burn_txs){n.burn_txs=c;dirty=true}}}
    for(const b of bridges){const A=N[b.p.a]?.rp,Bn=N[b.p.b]?.rp;const v=!!(A&&Bn&&A.tower&&Bn.tower&&A.vis&&Bn.vis)&&(!b.minor||saved.minorVis);if(b.group.visible!==v)b.group.visible=v}
    if(i!==last)events(last,i);last=i;{q('#rpDate').textContent=nice(i);rng.value=xx;
      q('#rpStat').textContent=`${towers} towers · ${lots} lots · ${flames} burns`;q('#rpApx').textContent=apx?`≈ ${apx} approximate (interpolated)`:''}
    if(dirty)markT=Math.min(markT,.05)}
  function relayout(){for(const n of E.nodes){if(!n.group)continue;n.h=n.h0*n.group.scale.y;n.w=n.w0*n.group.scale.x}layoutMarks();for(const n of E.nodes){if(n.group){n.h=n.h0;n.w=n.w0}}}
  function ticks(){const t=q('#rpTicks');t.innerHTML='';const y0=+H.d0.slice(0,4),y1=new Date().getUTCFullYear();
    for(let y=y0+1;y<=y1;y++){const i=Math.round((Date.UTC(y,0,1)-Date.parse(H.d0+'T00:00:00Z'))/864e5);if(i>0&&i<H.n)t.insertAdjacentHTML('beforeend',`<span style="left:${(i/(H.n-1)*100).toFixed(2)}%">${y}</span>`)}}
  function setPlay(p){play=p;q('#rpPlay').textContent=p?'❚❚':'▶';q('#rpPlay').classList.toggle('on',p)}
  async function open(){if(on)return;document.body.classList.add('rpOn','replay');q('#rpDate').textContent='loading…';
    try{H=await loadHistory()}catch(e){q('#rpDate').textContent='history unavailable';return}
    rng.max=H.n-1;ticks();on=true;B.setMode('orbit');
    saved={rot:orbit.autoRotateSpeed,cam:C.position.clone(),tgt:orbit.target.clone(),minorVis:B.minorVisible()};
    E.nodes.forEach(n=>{if(!n.group)return;n.h0=n.h;n.w0=n.w;n._rb=[n.burn_txs,n.liveBurns,n.liveAmt];n.liveBurns=0;n.liveAmt=[];n.group.scale.set(1,1,1)});
    orbit.autoRotateSpeed=.18;camTw={t:0,fc:C.position.clone(),ft:orbit.target.clone(),tc:B.overview().cam,tt:B.overview().tgt};
    x=0;last=-1;apply(0);E.nodes.forEach(n=>{if(n.group&&n.rp&&n.rp.vis)n.group.scale.set(n.rp.sx,n.rp.sy,n.rp.sx)});relayout();setPlay(true)}
  function close(){if(!on)return;on=false;setPlay(false);document.body.classList.remove('rpOn','replay');call.classList.remove('on');
    E.nodes.forEach(n=>{if(!n.group)return;n.group.visible=true;n.group.scale.set(1,1,1);n.h=n.h0;n.w=n.w0;[n.burn_txs,n.liveBurns,n.liveAmt]=n._rb;n.rp=null;if(n.lblEl)n.lblEl.style.visibility=''});
    bridges.forEach(b=>b.group.visible=!b.minor||saved.minorVis);layoutMarks();orbit.autoRotateSpeed=saved.rot;camTw={t:0,fc:C.position.clone(),ft:orbit.target.clone(),tc:saved.cam,tt:saved.tgt,end:1}}
  function update(dt){
    if(camTw){camTw.t=Math.min(1,camTw.t+dt/1.6);const e=camTw.t<.5?2*camTw.t*camTw.t:1-Math.pow(-2*camTw.t+2,2)/2;C.position.lerpVectors(camTw.fc,camTw.tc,e);orbit.target.lerpVectors(camTw.ft,camTw.tt,e);if(camTw.t>=1)camTw=null}
    if(!on)return;
    if(play){x=Math.min(H.n-1,x+dt*DPS*speed);if(x>=H.n-1)setPlay(false);apply(x)}
    const k=Math.min(1,dt*4);for(const n of E.nodes){const s=n.rp;if(!s||!s.vis||!n.group)continue;const g=n.group.scale;
      g.y+=(s.sy-g.y)*k;const w=g.x+(s.sx-g.x)*k;g.x=g.z=w}
    markT-=dt;if(markT<=0){markT=play?.35:1e9;relayout()}
    callT-=Math.min(.25,(performance.now()-(update.pt||performance.now()))/1000);update.pt=performance.now();if(callT<=0&&callQ.length){const c=callQ.shift();call.innerHTML=c.html;call.style.setProperty('--c',c.col);call.classList.add('on');callT=speed>=16?1.1:1.8}
    else if(callT<=0)call.classList.remove('on')}
  q('#rpPlay').onclick=()=>{if(!on)return;if(x>=H.n-1){x=0;last=-1}setPlay(!play)};
  bar.querySelectorAll('.sp button').forEach(b=>b.onclick=()=>{speed=+b.dataset.s;bar.querySelectorAll('.sp button').forEach(o=>o.classList.toggle('on',o===b))});
  rng.oninput=()=>{if(!on)return;setPlay(false);const nx=+rng.value;last=Math.floor(nx);callQ.length=0;x=nx;apply(x);markT=.05};
  q('#rpX').onclick=close;
  addEventListener('keydown',e=>{if(!on)return;if(e.key==='Escape')close();else if(e.key===' '&&e.target===document.body){e.preventDefault();q('#rpPlay').click()}});
  return {open,close,update,get on(){return on}};
}
