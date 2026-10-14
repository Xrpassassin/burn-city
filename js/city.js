// Burn City: interactive city layer.
// 1) Recent burns on the tower card (read-only ledger query, on demand, cached).
// 2) Online players as light markers with name tags (game server ?mode=city presence channel).
// 3) City chat panel + speech bubbles (signed-in XAMAN accounts post; stored + moderated by the social backend).
// No keys, no signing, no custody: trades open on xrpburn.com in the user's own wallet.
import * as THREE from 'three';
import { buildNftChar, disposeNftChar } from './nftchar.js';
import * as NftPick from './nftpick.js';
const Q=new URLSearchParams(location.search);
const SRV=Q.get('citysrv')||'https://burn-city-game.fly.dev';
const WS=SRV.replace(/^http/,'ws')+'/?mode=city';
const $=id=>document.getElementById(id);
const el=(t,c,txt)=>{const e=document.createElement(t);if(c)e.className=c;if(txt!=null)e.textContent=txt;return e};
const ago=ms=>{const s=Math.max(1,(Date.now()-ms)/1e3|0);return s<60?s+'s':s<3600?(s/60|0)+'m':s<86400?(s/3600|0)+'h':(s/86400|0)+'d'};
const short=v=>v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'k':(+v).toFixed(v<10?2:0);

// ---------- 1) recent burns ----------
const burnCache=new Map();
async function recentBurns(iss,cur){const c=burnCache.get(iss);if(c&&Date.now()-c.t<120e3)return c.v;
  const body=JSON.stringify({method:'account_tx',params:[{account:iss,limit:200,ledger_index_min:-1,ledger_index_max:-1,forward:false}]});
  let r;for(const u of ['https://xrplcluster.com/','https://s1.ripple.com:51234/']){try{r=await (await fetch(u,{method:'POST',headers:{'content-type':'application/json'},body,signal:AbortSignal.timeout?AbortSignal.timeout(9000):undefined})).json();if(r&&r.result&&r.result.transactions)break}catch(e){r=null}}
  if(!r||!r.result||!r.result.transactions)throw new Error('ledger');
  const v=[];for(const t of r.result.transactions){const tx=t.tx||t.tx_json,m=t.meta;if(!tx||!m||m.TransactionResult!=='tesSUCCESS'||tx.TransactionType!=='Payment'||tx.Destination!==iss)continue;
    const a=m.delivered_amount||tx.Amount;if(!a||typeof a!=='object'||a.issuer!==iss||a.currency!==cur)continue;
    v.push({amt:+a.value,when:(tx.date+946684800)*1e3,hash:tx.hash||t.hash,from:tx.Account});if(v.length>=5)break}
  burnCache.set(iss,{t:Date.now(),v});return v}
window.__onCard=async box=>{const l=box.querySelector('.rbl');if(!l)return;const {iss,cur,tok}=l.dataset;
  try{const v=await recentBurns(iss,cur);if(!l.isConnected)return;l.replaceChildren();
    if(!v.length){l.append(el('span','dim','No burns in the latest 200 issuer transactions.'));return}
    for(const b of v){const a=el('a','rbi');a.href='https://livenet.xrpl.org/transactions/'+b.hash;a.target='_blank';a.rel='noopener';
      a.append(el('b',null,'🔥 '+short(b.amt)+' '+tok),el('span','dim',b.from.slice(0,6)+'…'),el('span','dim',ago(b.when)+' ago'));l.append(a)}}
  catch(e){if(l.isConnected){l.replaceChildren(el('span','dim','Ledger busy, try again in a moment.'))}}};

// ---------- 2+3) presence + chat ----------
const W=()=>window.__city;
const MOB=matchMedia('(pointer:coarse)').matches||/Mobi|Android|iPhone|iPad/.test(navigator.userAgent);
const token=()=>{try{return localStorage.bcToken||''}catch(e){return ''}};
const PAL=[0x3cf3ff,0xff8a2a,0xb06bff,0x4dff9a,0xffd23c,0xff5ab4,0x5aa0ff,0xff4d4d];
const colOf=s=>{let h=0;for(const ch of String(s))h=(h*31+ch.charCodeAt(0))|0;return PAL[Math.abs(h)%PAL.length]};
let ws=null,myId=0,canChat=false,online=0,retry=0,lastSend=0,lastPos='',unread=0,open=false;
const peers=new Map();const layer=el('div');layer.id='ptags';document.body.append(layer);
let geo=null;const mats=new Map();
function mkMarker(color){const C=W();if(!geo)geo={core:new THREE.SphereGeometry(.9,12,8),beam:new THREE.CylinderGeometry(.18,.5,26,8,1,true),ring:new THREE.RingGeometry(1.6,2.2,28)};
  if(!mats.has(color))mats.set(color,{core:new THREE.MeshBasicMaterial({color}),beam:new THREE.MeshBasicMaterial({color,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false}),ring:new THREE.MeshBasicMaterial({color,transparent:true,opacity:.55,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide})});
  const m=mats.get(color),g=new THREE.Group(),core=new THREE.Mesh(geo.core,m.core),beam=new THREE.Mesh(geo.beam,m.beam),ring=new THREE.Mesh(geo.ring,m.ring);
  core.position.y=2.2;beam.position.y=13;ring.rotation.x=-Math.PI/2;ring.position.y=.15;g.add(core,beam,ring);g.userData.core=core;C.S.add(g);return g}
function upsert(id,name,guest,x,y,z,r){if(id===myId)return;let p=peers.get(id);
  if(!p){const color=colOf(name);const tag=el('div','ptag');tag.style.setProperty('--c','#'+color.toString(16).padStart(6,'0'));const nm=el('span','pn',(guest?'':'✓ ')+name);tag.append(nm);layer.append(tag);
    p={id,name,g:mkMarker(color),tag,bub:null,bubT:0,tx:x,ty:y,tz:z};p.g.position.set(x,y,z);peers.set(id,p);setNft(p)}
  p.tx=x;p.ty=y;p.tz=z;p.seen=Date.now()}
const nfts=new Map();   // peer id -> verified NFT character look (server only sends it for the wallet that owns it)
function setNft(p){const n=nfts.get(p.id)||null;if((p.nc&&p.nc.userData.nftId)===(n&&n.id))return;if(p.nc){disposeNftChar(p.nc);p.nc=null}
  p.g.userData.core.visible=!n;if(!n)return;try{p.nc=buildNftChar(n,{srv:SRV,card:true});p.nc.scale.setScalar(1.6);p.g.add(p.nc)}catch(e){p.nc=null;p.g.userData.core.visible=true}}
function drop(id){const p=peers.get(id);if(!p)return;if(p.nc)disposeNftChar(p.nc);W().S.remove(p.g);p.tag.remove();peers.delete(id)}
function bubble(pid,text){const p=peers.get(pid);if(!p)return;if(!p.bub){p.bub=el('div','pbub');p.tag.prepend(p.bub)}p.bub.textContent=text.length>90?text.slice(0,88)+'…':text;p.bub.classList.remove('out');p.bubT=Date.now()+6500}

// chat panel
const panel=el('div');panel.id='cityChat';panel.innerHTML='<button class="cch" aria-expanded="false" aria-label="City chat"><span class="cic">💬</span><span class="cdot"></span><span class="ctl">City chat</span><span class="cn"></span><span class="cun" hidden></span><span class="car">▴</span></button><div class="cbody"><div class="clog" role="log" aria-live="polite"></div><div class="cfoot"></div></div>';
document.body.append(panel);
const log=panel.querySelector('.clog'),foot=panel.querySelector('.cfoot'),head=panel.querySelector('.cch');
function setOpen(v){open=v;panel.classList.toggle('open',v);head.setAttribute('aria-expanded',v);if(v){unread=0;badge();log.scrollTop=log.scrollHeight}}
head.onclick=()=>setOpen(!open);
// auto-hide during tour, replay, first-person modes and burn-alert sweeps; restore afterwards (state kept)
setInterval(()=>{const c=W();if(!c)return;const hide=c.getMode()!=='orbit'||c.isTour()||document.body.classList.contains('replay')||!!document.querySelector('.alertPill:not([hidden])');panel.classList.toggle('autohide',hide)},400);
addEventListener('pointerdown',e=>{if(open&&!panel.contains(e.target)&&e.target.closest&&!e.target.closest('#info'))setOpen(false)},true);
function badge(){const b=panel.querySelector('.cun');b.hidden=!unread;b.textContent=unread>9?'9+':unread;panel.querySelector('.cn').textContent=online?`· ${online} online`:'· offline'}
const hidden=new Set(JSON.parse(localStorage.bcHidden||'[]'));
function addMsg(m,live){if(hidden.has(m.acct))return;const row=el('div','cm');row.dataset.id=m.id;
  const n=el('b',null,m.name);n.style.color='#'+colOf(m.name).toString(16).padStart(6,'0');row.append(n,el('span','ct',m.b),el('i','dim',ago(m.ts)));
  if(token()&&m.acct){const rep=el('button','crep','⚑');rep.title='Report & hide';rep.setAttribute('aria-label','Report message');rep.onclick=async()=>{rep.disabled=true;
      try{await fetch(SRV+'/social/report',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token()},body:JSON.stringify({kind:'chat',id:m.id,reason:'city chat'})})}catch(e){}
      hidden.add(m.acct);localStorage.bcHidden=JSON.stringify([...hidden].slice(-200));log.querySelectorAll('.cm').forEach(r=>r._acct===m.acct&&r.remove());toast('Reported. You won\'t see this player\'s messages.')};row.append(rep)}
  row._acct=m.acct;log.append(row);while(log.children.length>60)log.firstChild.remove();
  if(live){if(!open){unread++;badge()}if(log.scrollHeight-log.scrollTop-log.clientHeight<120)log.scrollTop=log.scrollHeight}}
function toast(t){const d=el('div','ctoast',t);panel.append(d);setTimeout(()=>d.remove(),3200)}
function renderFoot(){foot.replaceChildren();
  if(canChat){const f=el('form','cform'),i=el('input');i.maxLength=140;i.placeholder='Say something to the city…';i.setAttribute('aria-label','Chat message');i.enterKeyHint='send';
    const b=el('button',null,'Send');f.append(i,b);f.onsubmit=e=>{e.preventDefault();let t=i.value.trim();if(!t||!ws||ws.readyState!==1)return;while(new Blob([t]).size>400)t=t.slice(0,-1);ws.send(JSON.stringify({t:'c',b:t}));i.value=''};
    i.addEventListener('keydown',e=>e.stopPropagation());i.addEventListener('keyup',e=>e.stopPropagation());foot.append(f);foot.append(pickBtn)}
  else{const a=el('a','csign','Sign in with XAMAN to chat');a.href='social/';foot.append(a,el('div','dim cnote','Guests can watch. Be kind: messages are moderated.'))}}
renderFoot();

function connect(){if(ws||document.hidden)return;const t=token();try{ws=new WebSocket(WS+(t?'&token='+encodeURIComponent(t):''))}catch(e){return later()}
  ws.onopen=()=>{retry=0;panel.classList.add('on')};
  ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(x){return}
    if(m.t==='w'){myId=m.id;canChat=m.canChat;log.replaceChildren();(m.msgs||[]).forEach(x=>addMsg({...x},false));renderFoot();log.scrollTop=log.scrollHeight}
    else if(m.t==='s'){online=m.n;badge();const ids=new Set();for(const [id,name,guest,x,y,z,r] of m.p){ids.add(id);upsert(id,name,guest,x,y,z,r)}for(const id of [...peers.keys()])if(!ids.has(id))drop(id)}
    else if(m.t==='c'){addMsg(m,true);bubble(m.pid,m.b)}
    else if(m.t==='n'){for(const k in m.m){if(m.m[k])nfts.set(+k,m.m[k]);else nfts.delete(+k);const p=peers.get(+k);if(p)setNft(p)}}
    else if(m.t==='e'){if(m.e==='city_full')retry=5;}if(m.t==='e')toast(m.e==='slow_down'?'Slow down a little.':m.e==='banned'?'This account can\'t chat.':m.e==='city_full'?'City is full right now.':'Sign in with XAMAN to chat.')};
  ws.onclose=()=>{ws=null;online=0;badge();for(const id of [...peers.keys()])drop(id);later()};ws.onerror=()=>{}}
function later(){if(document.hidden)return;setTimeout(connect,Math.min(30e3,2e3*2**Math.min(retry++,4)))}
document.addEventListener('visibilitychange',()=>{if(document.hidden){if(ws){ws.onclose=null;ws.close();ws=null;for(const id of [...peers.keys()])drop(id)}}else connect()});

// my position (few updates on phones)
const _v=new THREE.Vector3(),_d=new THREE.Vector3();
function myPos(){const c=W(),m=c.getMode();if(m==='explore')return [c.P.pos.x,c.P.pos.y,c.P.pos.z];if(m==='fly')return [c.C.position.x,c.C.position.y,c.C.position.z];return [c.orbit.target.x,0,c.orbit.target.z]}
function sendPos(now){if(!ws||ws.readyState!==1||now-lastSend<(MOB?1000:250))return;const p=myPos().map(v=>Math.round(v*10)/10),c=W();c.C.getWorldDirection(_d);const r=Math.round(Math.atan2(_d.x,_d.z)*100)/100,k=p.join()+r;
  if(k===lastPos&&now-lastSend<5000)return;lastPos=k;lastSend=now;ws.send(JSON.stringify({t:'p',x:p[0],y:p[1],z:p[2],r}))}

let fr=0;function loop(now){requestAnimationFrame(loop);const c=W();if(!c||!peers.size&&!ws){return}fr++;sendPos(now);if(!peers.size)return;
  const k=MOB?.12:.18,w=innerWidth,h=innerHeight,doTags=!MOB||fr%2===0,t=now/1000;
  for(const p of peers.values()){p.g.position.x+=(p.tx-p.g.position.x)*k;p.g.position.y+=(p.ty-p.g.position.y)*k;p.g.position.z+=(p.tz-p.g.position.z)*k;p.g.userData.core.position.y=2.2+Math.sin(t*2+p.id)*.25;if(p.nc){const mv=Math.abs(p.tx-p.g.position.x)+Math.abs(p.tz-p.g.position.z)>.05;if(mv)p.nc.rotation.y=Math.atan2(p.tx-p.g.position.x,p.tz-p.g.position.z);p.nc.userData.anim(t+p.id,mv)}
    if(p.bub&&p.bubT&&Date.now()>p.bubT){p.bub.classList.add('out');p.bubT=0;const b=p.bub;setTimeout(()=>{if(b.classList.contains('out')){b.remove();if(p.bub===b)p.bub=null}},400)}
    if(!doTags)continue;_v.copy(p.g.position);_v.y+=5;const dist=c.C.position.distanceTo(_v);_v.project(c.C);
    const vis=_v.z<1&&Math.abs(_v.x)<1.1&&Math.abs(_v.y)<1.1&&dist<(p.bub?900:450);
    if(!vis){if(p.tag.style.display!=='none')p.tag.style.display='none';continue}if(p.tag.style.display)p.tag.style.display='';
    p.tag.style.transform=`translate3d(${((_v.x+1)/2*w).toFixed(1)}px,${((1-_v.y)/2*h).toFixed(1)}px,0) translate(-50%,-100%) scale(${Math.max(.75,Math.min(1,160/dist)).toFixed(2)})`}}
(function boot(){if(!window.__ready||!W())return setTimeout(boot,500);setTimeout(()=>{connect();requestAnimationFrame(loop)},MOB?1500:400)})();
window.__cityNet={peers,get ws(){return ws},open:setOpen};
// ---------- NFT characters (RACC / Firekeepers / 589 Protocol holders) ----------
const pickBtn=el('button','cnft','🎭 Play as my NFT');pickBtn.hidden=true;pickBtn.type='button';
NftPick.mount(SRV,{button:pickBtn});
let myNft=null;
function applyMine(){const c=W(),av=c&&c.avatar;if(!av)return setTimeout(applyMine,800);const n=NftPick.current();
  if(!av.userData.orig)av.userData.orig={legs:av.userData.legs,arms:av.userData.arms,kids:[...av.children]};
  if(myNft){disposeNftChar(myNft);myNft=null}const o=av.userData.orig;
  if(n){try{myNft=buildNftChar(n,{srv:SRV});myNft.rotation.y=Math.PI;myNft.scale.setScalar(.9);av.add(myNft);o.kids.forEach(k=>{if(!k.isLight)k.visible=false});av.userData.legs=myNft.userData.legs;av.userData.arms=myNft.userData.arms;return}catch(e){}}
  o.kids.forEach(k=>k.visible=true);av.userData.legs=o.legs;av.userData.arms=o.arms}
addEventListener('bc-nft',()=>{applyMine();if(ws&&ws.readyState===1)ws.send(JSON.stringify({t:'nft'}))});
(function waitAv(){if(!window.__ready||!W())return setTimeout(waitAv,600);applyMine()})();

