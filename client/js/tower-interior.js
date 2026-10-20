// BURN City — immersive tower interior starter, Three.js ES module.
// Integration: import this module after the app's existing Three.js setup, then call
// window.__openBurnTowerInterior() from the existing tower interaction handler.
// This is a separate overlay scene: it does not alter the city renderer or exterior.
import * as THREE from 'three';
import * as NftPick from './nftpick.js';
// --- BURN City integration (Hark) ---
const SRV = new URLSearchParams(location.search).get('citysrv') || 'https://burn-city-game.fly.dev';
const TOUCH = /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) || matchMedia('(pointer:coarse)').matches;
// Aegis map: put the approved live map URL here (or set window.BURN_CITY_AEGIS_MAP_URL before this module loads). Empty = 'not connected yet'.
const AEGIS_MAP_URL = '';
if (AEGIS_MAP_URL && !window.BURN_CITY_AEGIS_MAP_URL) window.BURN_CITY_AEGIS_MAP_URL = AEGIS_MAP_URL;
// Midnightbluff private floor: asks the game server, using the player's XAMAN sign-in token. The allowlist lives only on the server.
if (typeof window.BURN_MIDNIGHTBLUFF_ACCESS_CHECK !== 'function') window.BURN_MIDNIGHTBLUFF_ACCESS_CHECK = async () => {
  let t = ''; try { t = localStorage.bcToken || ''; } catch (e) { }
  if (!t) return { allowed: false, reason: 'signin' };
  const r = await fetch(SRV.replace(/\/$/, '') + '/api/tower/midnightbluff', { headers: { authorization: 'Bearer ' + t } });
  if (r.status === 401) return { allowed: false, reason: 'signin' };
  if (!r.ok) throw new Error('check ' + r.status);
  const j = await r.json(); return { allowed: j.allowed === true };
};

const C = {
  gold: 0xffbd62, hot: 0xff4219, orange: 0xff7b2c, obsidian: 0x111018,
  dark: 0x08060d, glass: 0x25131d, blue: 0x5ba8ff, green: 0x6affb0
};
const LINKS = {
  protocol: 'https://xrp.cafe/collection/burn-589-protocol',
  firekeepers: 'https://xrp.cafe/collection/burn-the-sacred-20',
  city: 'https://burn-city-game.fly.dev/'
};
let active = false, root, renderer, scene, camera, raf, resizeFn, keyFn, keyUpFn, clickFn;
let privateFloor = false, MINE = null;
const CREATOR = 'Created by BURN (issuer rKZmQq3gMCNmV6th3wZPhfqgZ3815vUmiV) · listed on xrp.cafe';
let interactables = [], animated = [], mapFrame, panel, messageTimer, move = {f:0,r:0};
let reveal = 0, yaw = 0, pitch = 0, pointerDown = null, lastTime = 0, locationName = 'THE ATRIUM';
const v = (x,y,z) => new THREE.Vector3(x,y,z);
const material = (color, emissive=color, intensity=.18, metalness=.55, roughness=.3) =>
  new THREE.MeshStandardMaterial({color, emissive, emissiveIntensity:intensity, metalness, roughness});
function addBox(parent,w,h,d,x,y,z,mat, opts={}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat); m.position.set(x,y,z); parent.add(m);
  if (opts.name) m.name=opts.name;
  if (opts.action) { m.userData.action=opts.action; m.userData.label=opts.label||opts.action; interactables.push(m); }
  return m;
}
function tube(parent, points, color, radius=.035) {
  const curve = new THREE.CatmullRomCurve3(points.map(p=>v(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve,Math.max(24,points.length*8),radius,6,false),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.92})); parent.add(m); return m;
}
function labelSprite(text, color='#ffcf91', scale=1) {
  const c=document.createElement('canvas'); c.width=768;c.height=160; const x=c.getContext('2d');
  x.clearRect(0,0,c.width,c.height); x.font='700 38px system-ui,sans-serif';x.textAlign='center';x.textBaseline='middle';x.shadowColor=color;x.shadowBlur=18;x.fillStyle=color;x.fillText(text,384,80,740);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));s.scale.set(6.8*scale,1.42*scale,1);return s;
}
function textPanel(title, lines, action, buttonLabel) {
  panel?.remove(); panel=document.createElement('div'); panel.className='burn-tower-panel';
  Object.assign(panel.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',width:'min(430px,calc(100vw - 32px))',padding:'22px',background:'linear-gradient(145deg,#171019f5,#08060df5)',border:'1px solid #bd713d',borderRadius:'16px',boxShadow:'0 0 48px #ff511f30',color:'#f8e6d0',zIndex:10,backdropFilter:'blur(14px)'});
  const h=document.createElement('h2');h.textContent=title;Object.assign(h.style,{margin:'0 0 10px',fontSize:'19px',letterSpacing:'.1em',color:'#ffc16b'});panel.appendChild(h);
  const p=document.createElement('p');p.textContent=lines;Object.assign(p.style,{lineHeight:'1.55',margin:'0 0 18px',color:'#d8c3b0'});panel.appendChild(p);
  if(buttonLabel){const b=document.createElement('button');b.textContent=buttonLabel;Object.assign(b.style,buttonStyle());b.addEventListener('click',()=>{if(action)action();});panel.appendChild(b);}
  const close=document.createElement('button');close.textContent='CLOSE';Object.assign(close.style,buttonStyle(true));close.style.marginLeft='8px';close.addEventListener('click',()=>{panel?.remove();panel=null;});panel.appendChild(close);root.appendChild(panel);
}
function buttonStyle(quiet=false){return {cursor:'pointer',padding:'10px 13px',border:'1px solid '+(quiet?'#594538':'#ff9c4c'),borderRadius:'9px',background:quiet?'#110d14':'#3a180d',color:quiet?'#c6b2a0':'#ffddb0',fontWeight:'750',letterSpacing:'.06em'};}
function toast(msg){let el=root.querySelector('.burn-tower-toast');if(!el){el=document.createElement('div');el.className='burn-tower-toast';Object.assign(el.style,{position:'absolute',left:'50%',bottom:'max(22px,env(safe-area-inset-bottom))',transform:'translateX(-50%)',background:'#100a11ed',border:'1px solid #9e542b',borderRadius:'12px',padding:'10px 15px',color:'#ffe2bb',zIndex:5,textAlign:'center',maxWidth:'90vw'});root.appendChild(el);}el.textContent=msg;el.style.opacity='1';clearTimeout(messageTimer);messageTimer=setTimeout(()=>{if(el)el.style.opacity='0';},2800);}
function addInteractableBox(w,h,d,x,y,z,action,label,mat=material(C.glass,C.hot,.45,.55,.22)){return addBox(scene,w,h,d,x,y,z,mat,{action,label});}
function buildRoom(){
  scene=new THREE.Scene();scene.background=new THREE.Color(C.dark);scene.fog=new THREE.FogExp2(0x09050d,.009);
  camera=new THREE.PerspectiveCamera(72,root.clientWidth/root.clientHeight,.05,400);camera.position.set(0,1.7,17);camera.rotation.order='YXZ';
  scene.add(new THREE.HemisphereLight(0xffc18b,0x13091c,1.25));
  for(const [color,intensity,dist,pos] of [[C.hot,52,55,[0,7,-10]],[C.gold,30,42,[-14,5,3]],[C.blue,18,32,[16,4,-2]],[C.orange,22,30,[0,3,24]]]){const l=new THREE.PointLight(color,intensity,dist);l.position.set(...pos);scene.add(l);}
  const obs=material(C.obsidian,0x2a0b12,.35,.76,.25), floor=material(0x18131d,0x4d180b,.3,.7,.22), gold=material(0xa97535,0xff7627,.68,.82,.2), glass=material(0x21121c,0x58150d,.5,.45,.16), soft=material(0x261e2a,0x29101a,.15,.3,.4);
  // Grand atrium: large enough to sell the impossible scale from the compact exterior.
  addBox(scene,48,.6,82,0,-.35,0,floor);addBox(scene,48,.5,82,0,18,0,obs);
  addBox(scene,.7,18,82,-24,8.7,0,obs);addBox(scene,.7,18,82,24,8.7,0,obs);addBox(scene,48,18,.7,0,8.7,-41,obs);addBox(scene,48,18,.7,0,8.7,41,obs);
  for(let x=-20;x<=20;x+=5){addBox(scene,.1,.05,80,x,.03,0,gold);for(let z=-33;z<=33;z+=11){if(!x)continue;/* keep the central aisle + reactor clear */addBox(scene,.65,13,.65,x,6.5,z,obs);tube(scene,[[x-.34,.2,z],[x-.34,12,z],[x+.34,12,z],[x+.34,.2,z]],C.hot,.028);}}
  tube(scene,[[-22,.12,-39],[22,.12,-39],[22,.12,39],[-22,.12,39],[-22,.12,-39]],C.gold,.07);
  // Reactor and moving concentric rings.
  const core=new THREE.Group();core.position.set(0,0,-11);scene.add(core);
  const shell=new THREE.Mesh(new THREE.CylinderGeometry(3.6,4.3,11,16,1,true),glass);shell.position.y=5.5;core.add(shell);
  const beam=new THREE.Mesh(new THREE.CylinderGeometry(1.35,1.7,10.2,20),new THREE.MeshBasicMaterial({color:C.hot}));beam.position.y=5.4;core.add(beam);
  for(let i=0;i<5;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(3.1+i*.25,.075,8,64),gold);ring.rotation.x=Math.PI/2;ring.position.y=1.3+i*2.1;ring.userData.spin=(i%2?-.24:.32);core.add(ring);animated.push(ring);}
  const title=labelSprite('PYRETHEUM','#ffbd62',1.3);title.position.set(0,14,-11);scene.add(title);
  const subtitle=labelSprite('A CITY WITHIN THE CITY','#ff7442',.65);subtitle.position.set(0,12.7,-11);scene.add(subtitle);
  // Upper gallery balcony and railings.
  const balcony=new THREE.Mesh(new THREE.TorusGeometry(14,.19,8,96),gold);balcony.rotation.x=Math.PI/2;balcony.position.set(0,7.5,4);scene.add(balcony);
  for(let a=0;a<Math.PI*2;a+=Math.PI/18){const x=Math.cos(a)*14,z=4+Math.sin(a)*14;addBox(scene,.11,2.5,.11,x,8.7,z,gold);}
  // Three collection / archive portals.
  const portals=[{x:-17,z:-1,action:'protocol',name:'589 PROTOCOL',sub:'THE PROPHECY VAULT',color:C.orange},{x:17,z:-1,action:'firekeepers',name:'FIREKEEPERS',sub:'THE SACRED FLAME GALLERY',color:C.hot},{x:0,z:25,action:'archive',name:'BURN CITY ARCHIVE',sub:'TOKENS • POOLS • BURNS',color:C.gold}];
  for(const p of portals){addBox(scene,5.4,3.5,.45,p.x,3.2,p.z,glass);tube(scene,[[p.x-2.7,1.3,p.z-.25],[p.x-2.7,6.2,p.z-.25],[p.x+2.7,6.2,p.z-.25],[p.x+2.7,1.3,p.z-.25],[p.x-2.7,1.3,p.z-.25]],p.color,.055);const s=labelSprite(p.name,'#ffe1b4',.72);s.position.set(p.x,5.4,p.z-.6);scene.add(s);const sub=labelSprite(p.sub,'#ff9d62',.45);sub.position.set(p.x,2.1,p.z-.65);scene.add(sub);addInteractableBox(4.8,1.1,.7,p.x,1.0,p.z+.65,p.action,'Open '+p.name,material(p.color,p.color,.65,.5,.25));}
  let mine=null;try{mine=NftPick.current();}catch(e){}
  const gal={'589':portals[0],fk:portals[1]}[mine?.key];
  if(gal&&mine.img){const tex=new THREE.TextureLoader().setCrossOrigin('anonymous').load(SRV.replace(/\/$/,'')+mine.img.replace(/\.webp$/,'.jpg'),t=>{t.needsUpdate=true;},undefined,()=>{});tex.colorSpace=THREE.SRGBColorSpace;
    const art=new THREE.Mesh(new THREE.PlaneGeometry(3,3),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));art.position.set(gal.x,3.4,gal.z+.3);scene.add(art);
    const nl=labelSprite('YOUR VERIFIED NFT · '+String(mine.name||'').slice(0,36),'#ffe1b4',.45);nl.position.set(gal.x,7,gal.z);scene.add(nl);MINE=mine;}
  // BAR zone on left: physical counter, backlit shelves, interactive service point.
  addBox(scene,9,1.3,2.1,-14,1.1,15,obs);addBox(scene,9.2,.13,2.25,-14,1.82,15,gold);addBox(scene,8.2,3.5,.3,-14,3.3,12.8,glass);
  for(let i=0;i<7;i++){addBox(scene,.65,1.5,.4,-17.1+i*1.05,3.0,12.55,material(i%2?C.gold:C.hot,i%2?C.gold:C.hot,.6,.3,.2));}
  const barSign=labelSprite('THE EMBER BAR','#ffd18b',.75);barSign.position.set(-14,5.8,12.2);scene.add(barSign);addInteractableBox(4.6,.9,.7,-14,1.5,16.5,'bar','Order at the Ember Bar',material(C.gold,C.orange,.6,.5,.2));
  // Lounge: seats face the reactor and a broad virtual window.
  for(const [x,z,rot] of [[10,15,0],[15,15,0],[10,20,0],[15,20,0]]){addBox(scene,2.3,.65,2,x,0.55,z,soft);addBox(scene,2.3,1.25,.45,x,1.15,z+.8,obs);}
  addBox(scene,4,.35,2.2,12.5,.65,18,material(0x3a1a22,0x3a1014,.2,.5,.25));
  const lounge=labelSprite('THE FIREKEEPERS LOUNGE','#ffbd62',.66);lounge.position.set(12.5,3.3,13.2);scene.add(lounge);addInteractableBox(3.8,.8,.7,12.5,1.1,21.2,'sit','Take a seat in the lounge',material(C.hot,C.hot,.4,.4,.3));
  // Aegis interactive-map terminal. URL is intentionally configurable; never pretend an unknown URL is live.
  addBox(scene,6,4,.35,0,4,34,glass);tube(scene,[[-3,1.8,33.7],[-3,6.2,33.7],[3,6.2,33.7],[3,1.8,33.7],[-3,1.8,33.7]],C.blue,.055);
  const aegis=labelSprite('AEGIS // TACTICAL MAP','#8fc5ff',.78);aegis.position.set(0,4.5,33.3);scene.add(aegis);const aegisSub=labelSprite('LIVE WORLD INTELLIGENCE','#b6d7ff',.42);aegisSub.position.set(0,2.8,33.25);scene.add(aegisSub);addInteractableBox(4.5,.85,.7,0,1.0,35.2,'aegis','Open the Aegis map terminal',material(C.blue,C.blue,.5,.4,.2));
  // Elevator to a private floor. Access is intentionally denied by default until a server verifier exists.
  addBox(scene,7,8,.65,17,4,31,obs);addBox(scene,2.9,6.4,.12,17,3.8,30.62,glass);tube(scene,[[15.5,.5,30.5],[15.5,8,30.5],[18.5,8,30.5],[18.5,.5,30.5],[15.5,.5,30.5]],C.gold,.055);
  const liftLabel=labelSprite('PRIVATE ELEVATOR','#ffd18b',.62);liftLabel.position.set(17,7,30.2);scene.add(liftLabel);addInteractableBox(2.5,1.2,.5,17,1.2,30.0,'elevator','Private elevator',material(C.gold,C.orange,.6,.5,.2));
  // Private floor: separate, deliberately oversized member room, reachable only after server authorization.
  const privateRoom=new THREE.Group();privateRoom.position.set(62,0,-25);scene.add(privateRoom);
  addBox(privateRoom,32,.6,34,0,-.35,0,floor);addBox(privateRoom,32,.5,34,0,12,0,obs);
  addBox(privateRoom,.6,12,34,-16,5.7,0,obs);addBox(privateRoom,.6,12,34,16,5.7,0,obs);addBox(privateRoom,32,12,.6,0,5.7,-17,obs);addBox(privateRoom,32,12,.6,0,5.7,17,obs);
  for(let x=-12;x<=12;x+=4){addBox(privateRoom,.08,.04,32,x,.02,0,gold);}
  const ptitle=labelSprite('MIDNIGHTBLUFF // MEMBERS SANCTUM','#ffbd62',1.05);ptitle.position.set(0,9,-10);privateRoom.add(ptitle);
  const psub=labelSprite('ACCESS IS A PRIVILEGE','#ff8752',.55);psub.position.set(0,7.4,-10);privateRoom.add(psub);
  const plinth=addBox(privateRoom,5,1.4,3,0,.7,0,obs);
  for(let i=0;i<3;i++){const ring=new THREE.Mesh(new THREE.TorusGeometry(2+i*.65,.06,8,48),gold);ring.rotation.x=Math.PI/2;ring.position.set(0,2.5+i*1.2,0);privateRoom.add(ring);animated.push(ring);}
  const back=labelSprite('MEMBER PORTAL','#ffd18b',.62);back.position.set(0,3,15.5);privateRoom.add(back);const backMesh=addBox(privateRoom,4,1,.6,0,1,15,material(C.orange,C.orange,.6,.4,.2),{action:'returnPublic',label:'Return to main atrium'});
  // Exit gate at the entrance end.
  addBox(scene,5.5,7,.4,0,3.5,39.8,glass);tube(scene,[[-2.8,.1,39.5],[-2.8,7,39.5],[2.8,7,39.5],[2.8,.1,39.5],[-2.8,.1,39.5]],C.orange,.06);const ex=labelSprite('RETURN TO BURN CITY','#ffd18b',.66);ex.position.set(0,7.8,39.3);scene.add(ex);addInteractableBox(4.8,1.1,.6,0,1.0,38.5,'exit','Return to BURN City',material(C.orange,C.orange,.6,.4,.2));
  // Ember particles, restrained for mobile performance.
  const count=TOUCH?130:340, pos=new Float32Array(count*3);for(let i=0;i<count;i++){pos[i*3]=(Math.random()-.5)*44;pos[i*3+1]=Math.random()*15;pos[i*3+2]=(Math.random()-.5)*76;}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));const particles=new THREE.Points(g,new THREE.PointsMaterial({color:C.orange,size:.085,transparent:true,opacity:.7,depthWrite:false}));scene.add(particles);particles.userData.embers=true;animated.push(particles);
}
function showAegis(){const url=window.BURN_CITY_AEGIS_MAP_URL;if(!url){textPanel('AEGIS MAP TERMINAL','The Aegis tactical map is not connected yet. Check back soon.');return;}try{const u=new URL(url,location.href);if(!['https:','http:'].includes(u.protocol))throw Error('bad protocol');panel?.remove();panel=document.createElement('div');Object.assign(panel.style,{position:'absolute',inset:'max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(12px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left))',zIndex:10,background:'#09060cf5',border:'1px solid #bd713d',borderRadius:'14px',padding:'10px',display:'flex',flexDirection:'column',gap:'8px'});const top=document.createElement('div');Object.assign(top.style,{display:'flex',justifyContent:'space-between',alignItems:'center',color:'#ffc16b',fontWeight:'800',letterSpacing:'.1em'});top.textContent='AEGIS // LIVE MAP';const close=document.createElement('button');close.textContent='CLOSE MAP';Object.assign(close.style,buttonStyle());close.onclick=()=>{panel?.remove();panel=null;};const ext=document.createElement('button');ext.textContent='OPEN IN NEW TAB';Object.assign(ext.style,buttonStyle(true));ext.style.marginLeft='auto';ext.style.marginRight='8px';ext.onclick=()=>window.open(u.href,'_blank','noopener,noreferrer');top.appendChild(ext);top.appendChild(close);panel.appendChild(top);const frame=document.createElement('iframe');frame.src=u.href;frame.title='Aegis live map';frame.allow='fullscreen';frame.referrerPolicy='strict-origin-when-cross-origin';Object.assign(frame.style,{width:'100%',height:'100%',minHeight:'0',flex:'1',border:'1px solid #392533',borderRadius:'8px',background:'#050308'});panel.appendChild(frame);root.appendChild(panel);}catch{textPanel('AEGIS MAP UNAVAILABLE','The configured map URL is invalid. Configure a trusted HTTPS URL before launch.');}}
function privateElevator(){
  // Security note: client-side UI is not authorization. Hark must wire this to a server-side verifier.
  const check=window.BURN_MIDNIGHTBLUFF_ACCESS_CHECK;
  if(typeof check!=='function'){textPanel('MIDNIGHTBLUFF // PRIVATE FLOOR','This floor is reserved for wallets approved by midnightbluff.club. Access is locked until the approved-wallet list and a server-side signature/access verifier are supplied. The client must never contain the allowlist or trust a browser-only check.');return;}
  Promise.resolve().then(()=>check()).then(result=>{if(result===true||result?.allowed===true){privateFloor=true;locationName='PRIVATE FLOOR';camera.position.set(62,1.7,-36);yaw=0;pitch=0;camera.rotation.set(0,0,0);textPanel('ACCESS GRANTED','Welcome to the Midnightbluff private floor. This members-only room is available after the server confirms access.');}else if(result?.reason==='signin'){textPanel('SIGN IN REQUIRED','Sign in with XAMAN in BURN City first. The server then checks whether your wallet is approved for the Midnightbluff floor.');}else{textPanel('ACCESS DENIED','This wallet is not currently authorized for the Midnightbluff private floor. Access decisions are verified by the server.');}}).catch(()=>textPanel('ACCESS CHECK FAILED','The authorization service could not be reached. No access was granted; please try again later.'));
}
function interact(action){panel?.remove();panel=null;switch(action){case'protocol':textPanel('589 PROTOCOL // PROPHECY VAULT','The 589 Protocol collection. '+CREATOR+'.'+(MINE?.key==='589'?' On display: your verified '+MINE.name+'.':' Hold one and sign in with XAMAN to hang yours here.'),()=>window.open(MINE?.key==='589'&&MINE.id?'https://xrp.cafe/nft/'+MINE.id:LINKS.protocol,'_blank','noopener,noreferrer'),MINE?.key==='589'?'VIEW MY NFT':'VIEW COLLECTION');break;case'firekeepers':textPanel('FIREKEEPERS // SACRED FLAME GALLERY','The Firekeepers collection. '+CREATOR+'.'+(MINE?.key==='fk'?' On display: your verified '+MINE.name+'.':' Hold one and sign in with XAMAN to hang yours here.'),()=>window.open(MINE?.key==='fk'&&MINE.id?'https://xrp.cafe/nft/'+MINE.id:LINKS.firekeepers,'_blank','noopener,noreferrer'),MINE?.key==='fk'?'VIEW MY NFT':'VIEW COLLECTION');break;case'archive':textPanel('BURN CITY ARCHIVE','A living archive for BURN ecosystem activity: token supply, burns, liquidity and milestones. Every tower outside is a live token.',()=>window.open('https://burn-city-game.fly.dev/arena/history.html','_blank','noopener,noreferrer'),'BURN HISTORY');break;case'bar':textPanel('THE EMBER BAR','The Ember Bar is pouring soon: signature non-alcoholic elixirs. Pull up a stool while you wait.','',null);break;case'sit':camera.position.set(12.5,1.15,24);camera.rotation.set(-.08,Math.PI,0);yaw=Math.PI;pitch=-.08;locationName='THE FIREKEEPERS LOUNGE';toast('Seat view: your camera is now in a lounge seat. Move to stand up.');break;case'aegis':showAegis();break;case'elevator':privateElevator();break;case'returnPublic':privateFloor=false;camera.position.set(17,1.7,25);yaw=Math.PI;pitch=0;camera.rotation.set(0,Math.PI,0);toast('Returned to the public atrium.');break;case'exit':closeBurnTowerInterior();break;}}
function addHud(){const hud=document.createElement('div');Object.assign(hud.style,{position:'absolute',left:'max(12px,env(safe-area-inset-left))',top:'max(12px,env(safe-area-inset-top))',maxWidth:'min(430px,calc(100vw - 24px))',padding:'12px 14px',background:'#09060ce8',border:'1px solid #8f481d',borderRadius:'12px',boxShadow:'0 0 25px #ff5a1928',color:'#f4d6b0',zIndex:3,pointerEvents:'auto'});hud.innerHTML='<b style="color:#ffbd62;letter-spacing:.12em">PYRETHEUM</b><div style="margin-top:5px">Inside the BURN Tower · a city within the city.</div><div style="margin-top:7px;color:#c8a98a;font-size:12px">'+(TOUCH?'Arrows to move · drag to look · tap glowing objects or INTERACT':'WASD / arrow keys to move · drag to look · click glowing objects or press E')+'</div>';
  const exit=document.createElement('button');exit.textContent='← EXIT TO CITY';Object.assign(exit.style,buttonStyle());exit.style.marginTop='10px';exit.addEventListener('click',closeBurnTowerInterior);hud.appendChild(exit);root.appendChild(hud);
  const reticle=document.createElement('div');reticle.textContent='＋';Object.assign(reticle.style,{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',color:'#ffcf91',fontSize:'20px',textShadow:'0 0 8px #ff5b21',pointerEvents:'none',zIndex:2});root.appendChild(reticle);
  const controls=document.createElement('div');if(!TOUCH)controls.style.display='none';Object.assign(controls.style,{display:TOUCH?'grid':'none',position:'absolute',right:'max(12px,env(safe-area-inset-right))',bottom:'max(18px,env(safe-area-inset-bottom))',gridTemplateColumns:'repeat(3,44px)',gap:'5px',zIndex:4});
  [['',''],['▲','f'],['',''],['◀','l'],['▼','b'],['▶','r']].forEach(([t,k])=>{const b=document.createElement('button');b.textContent=t||' ';Object.assign(b.style,{width:'44px',height:'40px',border:'1px solid #a45b32',borderRadius:'9px',background:'#130c13dd',color:'#ffcf91',fontSize:'17px'});if(k){const down=e=>{e.preventDefault();if(k==='f')move.f=1;if(k==='b')move.f=-1;if(k==='l')move.r=-1;if(k==='r')move.r=1;};const up=()=>{if(k==='f'||k==='b')move.f=0;if(k==='l'||k==='r')move.r=0;};b.addEventListener('pointerdown',down);b.addEventListener('pointerup',up);b.addEventListener('pointercancel',up);b.addEventListener('pointerleave',up);}controls.appendChild(b);});root.appendChild(controls);
  const action=document.createElement('button');action.textContent='INTERACT';if(!TOUCH)action.style.display='none';Object.assign(action.style,{position:'absolute',right:'max(18px,env(safe-area-inset-right))',bottom:'max(170px,calc(env(safe-area-inset-bottom) + 170px))',padding:'12px 14px',border:'1px solid #ff9c4c',borderRadius:'12px',background:'#35160ee8',color:'#ffe0b0',fontWeight:'800',zIndex:4});action.addEventListener('click',()=>{const hit=nearestInteractable();if(hit)interact(hit.userData.action);else toast('Move closer to a glowing console, gallery, bar, elevator, or exit.');});root.appendChild(action);
}
function nearestInteractable(){let best=null,dist=8;for(const o of interactables){const d=o.getWorldPosition(v(0,0,0)).distanceTo(camera.position);if(d<dist){best=o;dist=d;}}return best;}
function closeBurnTowerInterior(){if(!active)return;active=false;cancelAnimationFrame(raf);if(resizeFn)window.removeEventListener('resize',resizeFn);if(keyFn)window.removeEventListener('keydown',keyFn,true);if(keyUpFn)window.removeEventListener('keyup',keyUpFn);if(renderer){renderer.dispose();renderer.domElement.remove();}if(root)root.remove();root=null;renderer=null;scene=null;camera=null;panel=null;mapFrame=null;interactables=[];animated=[];move={f:0,r:0};document.body.style.overflow='';window.__burnTowerOpen=false;dispatchEvent(new Event('burntower:close'));}
function animate(now=0){if(!active)return;raf=requestAnimationFrame(animate);const dt=Math.min(.04,(now-lastTime)/1000||.016);lastTime=now;
  const speed=7*dt, forward=v(-Math.sin(yaw),0,-Math.cos(yaw)), right=v(Math.cos(yaw),0,-Math.sin(yaw));camera.position.addScaledVector(forward,move.f*speed);camera.position.addScaledVector(right,move.r*speed);camera.position.x=privateFloor?THREE.MathUtils.clamp(camera.position.x,47,77):THREE.MathUtils.clamp(camera.position.x,-22,22);camera.position.z=privateFloor?THREE.MathUtils.clamp(camera.position.z,-40,-8):THREE.MathUtils.clamp(camera.position.z,-38,38);camera.position.y=1.7;
  for(const o of animated){if(o.userData.spin)o.rotation.z+=o.userData.spin*dt;if(o.userData.embers){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){let y=a.getY(i)+dt*.18;if(y>16)y=0;a.setY(i,y);}a.needsUpdate=true;}}
  if(reveal>0){reveal=Math.max(0,reveal-Math.min(.1,(now-(animate._p||now))/1000)/2.2);animate._p=now;const e=1-Math.pow(1-(1-reveal),3);if(move.f||move.r||pointerDown)reveal=0;else{camera.position.z=17+4*(1-e);camera.position.y=1.7+6.5*(1-e);camera.rotation.set(pitch-.32*(1-e),yaw,0);}}
  renderer.render(scene,camera);
}
export function openBurnTowerInterior(){if(active)return;active=true;window.__burnTowerOpen=true;dispatchEvent(new Event('burntower:open'));privateFloor=false;yaw=0;pitch=0;pointerDown=null;locationName='THE ATRIUM';
  root=document.createElement('div');root.id='burnTowerInterior';Object.assign(root.style,{position:'fixed',inset:'0',zIndex:'99999',background:'#050308',overflow:'hidden',color:'#ffe0ae',font:'14px system-ui,sans-serif',touchAction:'none'});document.body.appendChild(root);document.body.style.overflow='hidden';
  renderer=new THREE.WebGLRenderer({antialias:!TOUCH,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,TOUCH?1.25:1.65));renderer.setSize(root.clientWidth,root.clientHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none';root.appendChild(renderer.domElement);buildRoom();addHud();reveal=1;root.style.opacity='0';root.style.transition='opacity .7s ease';requestAnimationFrame(()=>{if(root)root.style.opacity='1';});
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
  renderer.domElement.addEventListener('pointerdown',e=>{down={x:e.clientX,y:e.clientY,yaw,pitch};pointerDown={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture?.(e.pointerId);});
  renderer.domElement.addEventListener('pointermove',e=>{if(!down)return;yaw=down.yaw-(e.clientX-down.x)*.004;pitch=THREE.MathUtils.clamp(down.pitch+(e.clientY-down.y)*.003,-.65,.55);camera.rotation.set(pitch,yaw,0);});
  renderer.domElement.addEventListener('pointerup',e=>{if(!down)return;const moved=Math.hypot(e.clientX-down.x,e.clientY-down.y);down=null;if(moved>8)return;const rect=renderer.domElement.getBoundingClientRect();pointer.x=(e.clientX-rect.left)/rect.width*2-1;pointer.y=-(e.clientY-rect.top)/rect.height*2+1;ray.setFromCamera(pointer,camera);const hit=ray.intersectObjects(interactables,true)[0]?.object;if(hit?.userData.action)interact(hit.userData.action);});
  keyFn=e=>{if(/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;e.stopImmediatePropagation();if(e.key==='Escape'){if(panel){panel.remove();panel=null;return;}closeBurnTowerInterior();return;}if(e.repeat)return;const k=e.key.toLowerCase();if(k==='w'||k==='arrowup')move.f=1;if(k==='s'||k==='arrowdown')move.f=-1;if(k==='a'||k==='arrowleft')move.r=-1;if(k==='d'||k==='arrowright')move.r=1;if(k==='e'||k==='enter'){const hit=nearestInteractable();if(hit)interact(hit.userData.action);}};
  keyUpFn=e=>{const k=e.key.toLowerCase();if(['w','s','arrowup','arrowdown'].includes(k))move.f=0;if(['a','d','arrowleft','arrowright'].includes(k))move.r=0;};window.addEventListener('keydown',keyFn,true);window.addEventListener('keyup',keyUpFn);resizeFn=()=>{if(!renderer||!camera||!root)return;camera.aspect=root.clientWidth/root.clientHeight;camera.updateProjectionMatrix();renderer.setSize(root.clientWidth,root.clientHeight);};window.addEventListener('resize',resizeFn);animate();
  // Keep keyup cleanup paired with this overlay instance.
  window.__closeBurnTowerInterior=closeBurnTowerInterior;
}
window.__openBurnTowerInterior=openBurnTowerInterior;
if(new URLSearchParams(location.search).has('towertest'))window.__towerTest={interact,get camera(){return camera;},get panel(){return panel;},nearestInteractable};   // automated test hook only
