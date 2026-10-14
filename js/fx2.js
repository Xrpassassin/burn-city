// Burn City extras v8: burn alerts, real Phoenix day/night, whale flares, My bag, daily recap.
// All read-only. Every feature has a toggle under HUD -> "City features" (localStorage bc_f_*).
import * as THREE from 'three';
const Q=new URLSearchParams(location.search),$=id=>document.getElementById(id),W=()=>window.__city;
const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e};
const short=v=>v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'k':(+v).toFixed(v<10?2:0);
const F={alerts:['🔥 Burn alerts (camera sweep + sound)',1],realtime:['🌗 Real Phoenix day/night',1],whale:['🐋 Whale buy flares',1],bag:['💼 Highlight my holdings',1],recap:['📰 Daily city recap',1]};
const on=k=>{const v=localStorage.getItem('bc_f_'+k);return v==null?!!F[k][1]:v==='1'};
const RPC=async(method,params)=>{for(const u of ['https://xrplcluster.com/','https://s1.ripple.com:51234/']){try{const r=await (await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method,params:[params]}),signal:AbortSignal.timeout?AbortSignal.timeout(8000):undefined})).json();if(r&&r.result&&!r.result.error)return r.result}catch(e){}}throw new Error('rpc')};
const hexCur=c=>c&&c.length===40?c.replace(/(00)+$/,'').match(/../g).map(h=>String.fromCharCode(parseInt(h,16))).join('').replace(/\0/g,''):c;

function boot(){const c=W();if(!c||!window.__ready)return setTimeout(boot,500);
// ---------- settings group ----------
const hb=$('hudBody'),grp=el('div','row feat');grp.append(el('b',null,'City features'));
for(const k in F){const l=el('label'),i=el('input');i.type='checkbox';i.checked=on(k);i.id='f_'+k;i.onchange=()=>{localStorage.setItem('bc_f_'+k,i.checked?'1':'0');apply(k)};l.append(i,' '+F[k][0]);grp.append(l)}
hb&&hb.insertBefore(grp,hb.querySelector('.legend'));
function apply(k){if(k==='realtime')tick();if(k==='bag')bagLoad();if(k==='alerts'&&!on(k))skip()}

// ---------- 2) real Phoenix day/night (UTC-7, no DST) ----------
function phxHour(){const d=new Date(Date.now()-7*3600e3);return d.getUTCHours()+d.getUTCMinutes()/60}
function tick(){if(!on('realtime')||Q.has('tod'))return;const h=phxHour(),sun=Math.cos((h-12.5)/24*2*Math.PI);   // +1 noon, -1 midnight
  const day=Math.max(0,Math.min(1,(sun+.15)/.75));const r=$('tod'),cy=$('todCycle');if(cy)cy.checked=false;if(r){r.value=day.toFixed(3);r.title=`Real Phoenix time ${String(h|0).padStart(2,'0')}:${String(Math.round(h%1*60)).padStart(2,'0')} MST`}}
tick();setInterval(tick,60e3);$('tod')&&$('tod').addEventListener('input',()=>{const i=$('f_realtime');if(i&&i.checked){i.checked=false;localStorage.setItem('bc_f_realtime','0')}});

// ---------- 1) burn alerts: whoosh + orbit camera sweep, skippable ----------
let sweep=null,lastAlert=-1e9;const pill=el('button','alertPill');pill.hidden=true;document.body.append(pill);
function skip(){if(sweep&&sweep.ph<2){sweep.ph=2;sweep.t=0;sweep.fromP=c.C.position.clone();sweep.fromT=c.orbit.target.clone()}}
pill.onclick=skip;addEventListener('keydown',e=>{if(e.key==='Escape'&&sweep)skip()},true);c.R.domElement.addEventListener('pointerdown',()=>sweep&&skip(),true);c.R.domElement.addEventListener('wheel',()=>sweep&&skip(),{passive:true,capture:true});
function alertBurn(e){const n=c.N[e.token];if(!n||!on('alerts'))return;if(e.demo&&!Q.has('alertdemo'))return;const now=performance.now();
  if(now-lastAlert<90e3||sweep||c.getMode()!=='orbit'||c.isTour()||document.hidden)return;lastAlert=now;c.sfx.whoosh();
  const tgt=new THREE.Vector3(n.pos.x,Math.min(n.h*.6,60),n.pos.z),dir=c.C.position.clone().sub(tgt).setY(0).normalize(),dist=Math.max(45,n.h*1.3);
  sweep={ph:0,t:0,homeP:c.C.position.clone(),homeT:c.orbit.target.clone(),toP:tgt.clone().add(dir.multiplyScalar(dist)).setY(tgt.y+dist*.35),toT:tgt};
  pill.textContent=`🔥 ${e.token} burn · ${short(e.amount||0)} · tap to skip`;pill.hidden=false;c.orbit.enabled=false}
const ease=x=>x*x*(3-2*x);let lt=performance.now();
function loop(){requestAnimationFrame(loop);const now=performance.now(),dt=Math.min(.05,(now-lt)/1e3);lt=now;
  if(sweep){const s=sweep;s.t+=dt;if(c.getMode()!=='orbit'){sweep=null;pill.hidden=true;return}
    if(s.ph===0){const k=ease(Math.min(1,s.t/1.6));c.C.position.lerpVectors(s.homeP,s.toP,k);c.orbit.target.lerpVectors(s.homeT,s.toT,k);if(s.t>=1.6){s.ph=1;s.t=0}}
    else if(s.ph===1){if(s.t>=3.2){s.ph=2;s.t=0;s.fromP=c.C.position.clone();s.fromT=c.orbit.target.clone()}}
    else{const k=ease(Math.min(1,s.t/1.4));c.C.position.lerpVectors(s.fromP,s.homeP,k);c.orbit.target.lerpVectors(s.fromT,s.homeT,k);if(s.t>=1.4){sweep=null;pill.hidden=true;c.orbit.enabled=true}}
    c.C.lookAt(c.orbit.target)}
  flares.forEach(f=>{if(!f.m.visible)return;f.t+=dt;const k=f.t/1.4;if(k>=1){f.m.visible=false;return}f.m.position.y=f.h*k*1.05;f.m.scale.set(1+k,1.6+2*(1-k),1+k);f.m.material.opacity=.95*(1-k)});
  ring(now/1e3)}

// ---------- 3) whale buy flares ----------
const fg=new THREE.CylinderGeometry(.6,1.6,6,10,1,true),flares=[0,1].map(()=>{const m=new THREE.Mesh(fg,new THREE.MeshBasicMaterial({color:0xfff2c0,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false}));m.visible=false;c.S.add(m);return {m,t:0,h:0}});
let lastFlare=0;const towerFlare={};
function whale(e){if(!on('whale')||!e.pool)return;const p=e.pool,thr=Math.max(500,(p.tvl_xrp||0)*.03);if(!(e.xrp>=thr)&&!(e.demo&&Q.has('whaledemo')))return;const now=performance.now();if(now-lastFlare<15e3)return;
  const tk=[p.a,p.b].filter(x=>x!=='XRP').map(x=>c.N[x]).filter(Boolean)[0];if(!tk||now-(towerFlare[tk.name]||0)<60e3)return;lastFlare=towerFlare[tk.name]=now;
  const f=flares.find(f=>!f.m.visible)||flares[0];f.t=0;f.h=tk.h;f.m.position.set(tk.pos.x,0,tk.pos.z);f.m.material.color.set(tk.col||0xfff2c0).lerp(new THREE.Color(0xffffff),.5);f.m.visible=true}
window.__onLive=e=>{if(e.type==='burn')alertBurn(e);else if(e.type==='trade')whale(e)};

// ---------- 4) My bag ----------
const bagG=new THREE.Group();c.S.add(bagG);let held=[];const rg=new THREE.RingGeometry(1,1.18,48),rm=new THREE.MeshBasicMaterial({color:0x7dffcf,transparent:true,opacity:.6,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});
function ring(t){if(bagG.children.length)rm.opacity=.4+.25*Math.sin(t*1.6)}
const bagBtn=el('button',null,'💼 My bag');bagBtn.id='bagBtn';bagBtn.hidden=true;$('btns')&&$('btns').append(bagBtn);
const bagList=el('div');bagList.id='bagList';bagList.hidden=true;bagList.setAttribute('role','dialog');bagList.setAttribute('aria-label','My bag');document.body.append(bagList);
const bagHead=el('div','bhd'),bagTitle=el('b','bt','My bag'),bagDim=el('button','bdim','Dim others'),bagX=el('button','bx','✕'),bagBody=el('div','bl');
bagX.setAttribute('aria-label','Close My bag');bagDim.setAttribute('aria-pressed','false');bagHead.append(bagTitle,bagDim,bagX);bagList.append(bagHead,bagBody);
function setFilter(v){localStorage.bc_bagFilter=v?'1':'0';document.body.classList.toggle('bag',v);bagDim.classList.toggle('on',v);bagDim.setAttribute('aria-pressed',v)}
function setBag(v){localStorage.bc_bagOpen=v?'1':'0';bagList.hidden=!v;bagBtn.classList.toggle('on',v);bagBtn.setAttribute('aria-expanded',v);if(!v)setFilter(false)}
bagBtn.onclick=e=>{e.stopPropagation();setBag(bagList.hidden)};bagX.onclick=e=>{e.stopPropagation();setBag(false)};bagDim.onclick=e=>{e.stopPropagation();setFilter(!document.body.classList.contains('bag'))};
addEventListener('pointerdown',e=>{if(!bagList.hidden&&!bagList.contains(e.target)&&e.target!==bagBtn&&!$('info').contains(e.target))setBag(false)},true);
addEventListener('keydown',e=>{if(e.key==='Escape'&&!bagList.hidden){setBag(false);e.stopImmediatePropagation()}},true);
addEventListener('keydown',e=>{if(e.key!=='Escape'||!bagList.hidden||c.getMode()!=='orbit')return;const r=$('recap'),i=$('info'),ch=$('cityChat');if(r){r.querySelector('.x').click()}else if(i&&i.style.display==='block'){i.style.display='none'}else if(ch&&ch.classList.contains('open')){window.__cityNet&&window.__cityNet.open(false)}else return;e.stopImmediatePropagation()},true);
async function bagLoad(){bagG.clear();held=[];document.querySelectorAll('.lbl.held').forEach(x=>x.classList.remove('held'));const acct=localStorage.bcAcct||Q.get('bagacct');
  if(!on('bag')||!acct||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(acct)){bagBtn.hidden=true;bagList.hidden=true;document.body.classList.remove('bag');return}
  let lines=[];try{let m;do{const r=await RPC('account_lines',{account:acct,limit:400,ledger_index:'validated',...(m?{marker:m}:{})});lines=lines.concat(r.lines);m=r.marker}while(m&&lines.length<1200)}catch(e){return}
  const keys=new Map();lines.filter(l=>+l.balance>0).forEach(l=>{keys.set(l.account+'-'+l.currency,+l.balance);keys.set(l.account+'-'+hexCur(l.currency),+l.balance)});
  c.E.nodes.forEach(n=>{if(!n.key||!n.key.includes('-'))return;const [i,cu]=n.key.split('-');const bal=keys.get(n.key)??keys.get(i+'-'+hexCur(cu));if(bal==null||(n.price_xrp?bal*n.price_xrp<.01:bal<1))return;held.push([n,bal]);
    const r=new THREE.Mesh(rg,rm);r.rotation.x=-Math.PI/2;r.position.set(n.pos.x,.3,n.pos.z);const s=n.w*1.9+2;r.scale.set(s,s,s);bagG.add(r);n.lblEl&&n.lblEl.classList.add('held')});
  bagTitle.textContent=held.length?`My bag · ${held.length}`:'My bag';bagBody.replaceChildren(held.length?'':el('div','dim','No tracked tokens in this wallet yet'));
  held.sort((a,b)=>(b[1]*(b[0].price_xrp||0))-(a[1]*(a[0].price_xrp||0))).forEach(([n,bal])=>{const b=el('button',null,'');b.append(el('b',null,n.name),el('span',null,short(bal)+(n.price_xrp?' · ≈'+short(bal*n.price_xrp)+' XRP':'')));b.onclick=()=>c.showInfo({node:n});bagBody.append(b)});
  bagBtn.hidden=false;bagBtn.setAttribute('aria-expanded','false');setBag(localStorage.bc_bagOpen==='1');setFilter(!bagList.hidden&&localStorage.bc_bagFilter==='1')}
bagLoad();addEventListener('storage',e=>{if(e.key==='bcAcct')bagLoad()});

// ---------- 5) daily recap (real data only, once per Phoenix day) ----------
const phxDate=(ms=Date.now())=>new Date(ms-7*3600e3).toISOString().slice(0,10);
async function recap(){if(!on('recap')||Q.has('shot')||Q.has('norecap'))return;const today=phxDate();if(localStorage.bc_recap===today&&!Q.has('recap'))return;
  const yd=phxDate(Date.now()-864e5),toks=['BURN','IMM','IMG','XRPyro'].map(t=>c.N[t]).filter(n=>n&&n.key);let top=null,okN=0;
  await Promise.all(toks.map(async n=>{const [iss,cur]=n.key.split('-');try{const r=await RPC('account_tx',{account:iss,limit:200,forward:false,ledger_index_min:-1,ledger_index_max:-1});okN++;
    for(const t of r.transactions){const tx=t.tx||t.tx_json,m=t.meta;if(!tx||!m||m.TransactionResult!=='tesSUCCESS'||tx.TransactionType!=='Payment'||tx.Destination!==iss)continue;const a=m.delivered_amount||tx.Amount;
      if(!a||typeof a!=='object'||a.issuer!==iss||a.currency!==cur)continue;if(phxDate((tx.date+946684800)*1e3)!==yd)continue;const xrp=+a.value*(n.price_xrp||0);if(!top||xrp>top.xrp)top={n,amt:+a.value,xrp,hash:tx.hash||t.hash}}}catch(e){}}));
  const bp=[...c.bridges].filter(b=>!b.volEst).sort((a,b)=>b.vol-a.vol)[0],lot=(window.LAUNCHPAD&&window.LAUNCHPAD.lots||[]).slice(-1)[0];
  const d=el('div');d.id='recap';const x=el('button','x','✕');x.setAttribute('aria-label','Dismiss recap');x.onclick=()=>{localStorage.bc_recap=today;d.remove()};
  d.append(x,el('h3',null,'📰 City recap · '+new Date(Date.now()-864e5).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'America/Phoenix'})));
  const row=(ic,l,v,fn)=>{const r=el(fn?'button':'div','rr');r.append(el('span','ri',ic),el('span','rl',l),el('b',null,v));if(fn)r.onclick=fn;d.append(r)};
  row('🔥','Top burn',top?`${short(top.amt)} ${top.n.name}${top.xrp?' (≈'+short(top.xrp)+' XRP)':''}`:okN?'None found yesterday':'Ledger busy, try later',top?()=>c.showInfo({node:top.n}):null);
  row('⚡','Most active pool',bp?`${bp.p.a}⇄${bp.p.b} · ${short(bp.vol)} XRP 24h`:'—',bp?()=>c.showInfo({pool:bp.p}):null);
  row('🚧','On the launchpad',lot?`${lot.ticker} · ${lot.bond_pct!=null?lot.bond_pct.toFixed(0)+'% bonded':'bonding'}`:'No open launches',null);
  d.append(el('div','dim rs','Burns: XRPL ledger (BURN, IMM, IMG, XRPyro issuers). Pool: 24h volume snapshot. Launchpad: xrpl.fun.'));document.body.append(d)}
setTimeout(recap,Q.has('recap')?500:4000);
requestAnimationFrame(loop);window.__fx2={alertBurn,whale,bagLoad,recap,skip};
}
boot();
