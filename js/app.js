// BURN CITY v2 — read-only 3D visualization of the BURN ecosystem AMM graph on the XRP Ledger.
import * as THREE from 'three';
import {buildEstate,estateCard} from './estate.js';
import {initDrone} from './drone.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {BokehPass} from 'three/addons/postprocessing/BokehPass.js';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PlayerState,NetClient} from './net.js';

// ---------- config / device ----------
const Q=new URLSearchParams(location.search);
const MOBILE=matchMedia('(pointer:coarse)').matches||/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)||Q.has('mobile');
const TIERS={low:{pr:1,cars:48,rain:600,trees:50,bloomScale:.35,reflect:false,sats:.3,fx:.2,aa:false},medium:{pr:1.25,cars:160,rain:2200,trees:160,bloomScale:.5,reflect:false,sats:.6,fx:.45,aa:false},high:{pr:1.75,cars:480,rain:6500,trees:360,bloomScale:1,reflect:true,sats:1,fx:1,aa:true}};
const qPref=Q.get('q')||localStorage.getItem('bc_quality')||'auto';
const autoTier=()=>{const cores=navigator.hardwareConcurrency||4,mem=navigator.deviceMemory||4;if(MOBILE)return(cores<=4||mem<=3)?'low':'medium';return(cores<=2||mem<=2)?'medium':'high'};
const TIER=TIERS[qPref]?qPref:autoTier();const LV=TIERS[TIER];
const stage=(p,txt)=>new Promise(r=>{window.__load&&window.__load(p,txt);requestAnimationFrame(()=>setTimeout(r,0))});
const E=window.ECO;const $=id=>document.getElementById(id);
const fmt=(n,d)=>n==null||isNaN(n)?'—':(+n).toLocaleString(undefined,{maximumFractionDigits:d??(Math.abs(n)<1?10:0)});
const pct=n=>n==null?'—':(n>=0?'▲':'▼')+Math.abs(n).toFixed(2)+'%';
const rnd=(s=>()=>(s=(s*16807)%2147483647)/2147483647)(1337); // deterministic layout

// ---------- renderer / scene ----------
const R=new THREE.WebGLRenderer({antialias:LV.aa,powerPreference:'high-performance',preserveDrawingBuffer:Q.has('shot')});
let PR=Math.min(devicePixelRatio,LV.pr);R.setPixelRatio(PR);R.setSize(innerWidth,innerHeight);
R.info.autoReset=false;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.05;document.body.prepend(R.domElement);
const S=new THREE.Scene();window.__S=S;S.fog=new THREE.FogExp2(0x060a1c,0.0019);
const C=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,0.3,4000);C.position.set(210,140,260);
const hemi=new THREE.HemisphereLight(0x4466ff,0x180a22,.55);S.add(hemi);const amb=new THREE.AmbientLight(0x223355,.35);S.add(amb);
const moonL=new THREE.DirectionalLight(0x9db8ff,.35);moonL.position.set(-300,400,-500);S.add(moonL);
const U={t:{value:0},day:{value:0},wet:{value:0},flash:{value:0},storm:{value:0}};
const GT=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'#fff');g.addColorStop(.25,'rgba(255,255,255,.65)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})();
const glowMat=(color,size,opts={})=>new THREE.PointsMaterial({size,map:GT,color,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,sizeAttenuation:true,...opts});
const NOISE=`float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}`;
const FOGV=`#include <fog_pars_vertex>`,TAIL=`#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>`;
const fogU=()=>THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);

// ---------- layout (deterministic, data-driven) ----------
const THEME={XRP:{c:0x9fd8ff},BURN:{c:0xff5a1a,fire:1},XRPyro:{c:0xff2a00,fire:2},IMM:{c:0x3a8bff,ice:1},IMG:{c:0x8a6bff},RACC:{c:0x00ffa8},VEGAS:{c:0xff2bd6},'666':{c:0xb026ff},RLUSD:{c:0x2bffd9},Budzy:{c:0x4dff5a},'$BTCK':{c:0xf7931a},BCHAMP:{c:0xffb347}};
const MINORC=[0x00e5ff,0x66ff99,0xffd166,0xff66c4,0x7aa2ff,0x9effe0];
const CORE=['BURN','XRPyro','IMM','IMG','RLUSD','666','VEGAS','RACC'];
const N={};E.nodes.forEach(n=>N[n.name]=n);
const pools=E.pools.filter(p=>N[p.a]&&N[p.b]);
const RING=175; // core district ring (was 135; widened so active-wallet blocks have room)
CORE.filter(c=>N[c]).forEach((c,i,arr)=>{const a=i/arr.length*Math.PI*2-Math.PI/2;Object.assign(N[c],{core:true,ang:a,pos:new THREE.Vector3(Math.cos(a)*RING,0,Math.sin(a)*RING)})});
Object.assign(N.XRP,{pos:new THREE.Vector3(),core:true,ang:0});
// $BCHAMP landmark: inner plaza between XRP and the core ring, opposite the BURN district
if(N.BCHAMP){const a=Math.PI/2+Math.PI/CORE.length;Object.assign(N.BCHAMP,{core:true,landmark:true,ang:a,pos:new THREE.Vector3(Math.cos(a)*122,0,Math.sin(a)*122)})}
const kids={};E.nodes.filter(n=>!n.pos).forEach(n=>{const ps=pools.filter(p=>p.a===n.name||p.b===n.name).sort((a,b)=>b.tvl_xrp-a.tvl_xrp);
 const par=ps.map(p=>p.a===n.name?p.b:p.a).find(x=>N[x].core&&x!=='XRP')||'BURN';n.parent=par;(kids[par]=kids[par]||[]).push(n)});
Object.entries(kids).forEach(([par,ks])=>{const P0=N[par];ks.sort((a,b)=>b.tvl-a.tvl).forEach((n,i)=>{const a=P0.ang+(i-(ks.length-1)/2)*.1;const r=RING+92+(i%2)*38;
 n.ang=a;n.pos=new THREE.Vector3(Math.cos(a)*r,0,Math.sin(a)*r);n.minor=true})});
E.nodes.forEach((n,i)=>{const th=THEME[n.name]||{c:MINORC[i%MINORC.length]};n.th=th;n.col=new THREE.Color(th.c);
 // HEIGHT = market cap in XRP (circulating supply x AMM price, log scale); BASE WIDTH = pool TVL in XRP (sqrt scale)
 n.mc=n.name==='XRP'?null:n.mcap_amm!=null?n.mcap_amm:null;n.h=n.name==='XRP'?125:n.mc!=null?Math.min(112,Math.max(12,16*Math.log10(n.mc+10)-14)):Math.max(10,15*Math.log10(n.tvl+10)*.8);
 n.w=n.name==='XRP'?11:Math.min(9.5,Math.max(2.2,1.7+.042*Math.sqrt(n.tvl)));
 n.distR=n.name==='XRP'?66:n.minor?n.w*3.4+5:n.landmark?n.w*2.4+14:n.w*3+28;});

await stage(0.12,'Sky & terrain');
// ---------- sky, moon, stars, aurora, mountains ----------
const sky=new THREE.Mesh(new THREE.SphereGeometry(3000,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:U,
vertexShader:`varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
fragmentShader:`uniform float t,day,flash,storm;varying vec3 d;${NOISE}
void main(){float y=max(d.y,0.);vec3 night=mix(vec3(.02,.03,.09),vec3(.004,.006,.02),pow(max(0.,y),.5));
vec2 p=d.xz/(d.y+.25);float neb=fbm(p*1.2+vec2(t*.003,0.));vec3 nebc=mix(vec3(.25,.05,.4),vec3(.02,.2,.45),fbm(p*.7+3.))*smoothstep(.45,.9,neb)*.55*(1.-storm);
float aur=smoothstep(.02,.3,y)*(1.-smoothstep(.22,.65,y))*smoothstep(-.2,.6,-d.z);float band=sin(d.x*9.+fbm(vec2(d.x*3.,t*.05))*6.+t*.2)*.5+.5;
vec3 aurc=mix(vec3(0.,1.,.6),vec3(.3,.4,1.),y*2.)*aur*band*fbm(vec2(d.x*12.,t*.1+y*4.))*.9*(1.-storm*.9)*(1.-day);
vec3 c=night+nebc*(1.-day)+aurc;vec3 dayc=mix(vec3(.55,.68,.85),vec3(.18,.36,.72),pow(max(0.,y),.6));c=mix(c,dayc,day);
float cl=fbm(p*.9+vec2(t*.02,t*.01));c=mix(c,mix(vec3(.04,.045,.06),vec3(.45,.47,.5),day)*(.6+cl*.6),storm*smoothstep(.3,.7,cl+.2));
c+=vec3(.6,.65,1.)*flash*(.4+cl);c+=vec3(.25,.1,.05)*pow(max(0.,1.-y),8.)*(1.-day);gl_FragColor=vec4(c,1.);}`}));S.add(sky);
const moonTex=(()=>{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');const g=x.createRadialGradient(128,128,40,128,128,128);g.addColorStop(0,'rgba(220,230,255,1)');g.addColorStop(.42,'rgba(200,215,255,.95)');g.addColorStop(.47,'rgba(150,170,255,.25)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,256,256);
 x.globalAlpha=.12;x.fillStyle='#4a5a8a';for(let i=0;i<14;i++){x.beginPath();x.arc(90+rnd()*80,90+rnd()*80,4+rnd()*14,0,7);x.fill()}return new THREE.CanvasTexture(c)})();
const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:moonTex,fog:false,depthWrite:false,transparent:true}));moon.position.set(-900,700,-1500);moon.scale.setScalar(260);S.add(moon);
const stars=(()=>{const g=new THREE.BufferGeometry(),p=[],c=[];for(let i=0;i<3000;i++){const th=rnd()*6.283,ph=Math.acos(rnd()*.95);const r=2600;p.push(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph),r*Math.sin(ph)*Math.sin(th));const k=.6+rnd()*.4;c.push(k,k,1)}
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));const s=new THREE.Points(g,new THREE.PointsMaterial({size:2.2,vertexColors:true,fog:false,transparent:true,depthWrite:false}));S.add(s);return s})();
const shoot={line:new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3(1,0,0)]),new THREE.LineBasicMaterial({color:0xcfe8ff,fog:false,transparent:true,opacity:0})),t:-1};shoot.line.frustumCulled=false;S.add(shoot.line);
{const geo=new THREE.BufferGeometry(),pos=[],col=[],idx=[];let base=0;
 [[1500,70,0x0a1230],[1750,120,0x070c20],[2050,190,0x050914]].forEach(([r,amp,hex],L)=>{const cc=new THREE.Color(hex),seg=360;
  for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;const n=Math.abs(Math.sin(a*(5+L*2)+L)*.5+Math.sin(a*23+L*3)*.3+Math.sin(a*51+L)*.2);const h=amp*(.3+n);
   pos.push(Math.cos(a)*r,-60,Math.sin(a)*r,Math.cos(a)*r,h,Math.sin(a)*r);col.push(cc.r*.5,cc.g*.5,cc.b*.5,cc.r*1.1+.01,cc.g*1.1+.015,cc.b*1.2+.03);
   if(i<seg){const k=base+i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}base+=(seg+1)*2});
 geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));geo.setIndex(idx);
 S.add(new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,side:2,fog:false})))}

// ---------- ground: reflector + data-driven surface shader (streets, scorched/frost zones, puddles) ----------
const GROUND=1420;
if(LV.reflect){const ref=new Reflector(new THREE.CircleGeometry(560,64),{textureWidth:1024,textureHeight:1024,color:0x0a0e1a});ref.rotation.x=-Math.PI/2;ref.position.y=-.5;S.add(ref)}
const zoneU=E.nodes.map(n=>new THREE.Vector4(n.pos.x,n.pos.z,n.distR,n.th.fire?n.th.fire:n.th.ice?-1:0));
const groundMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,uniforms:{...fogU(),zones:{value:zoneU},refl:{value:LV.reflect?1:0},t:U.t,day:U.day,wet:U.wet,flash:U.flash},
 vertexShader:`varying vec2 v;\n${FOGV}\nvoid main(){v=vec2(position.x,-position.y);vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
 fragmentShader:`uniform float t,day,wet,flash,refl;uniform vec4 zones[${zoneU.length}];varying vec2 v;\n#include <fog_pars_fragment>\n${NOISE}
 void main(){vec2 p=v;float d=length(p);vec3 base=mix(vec3(.012,.016,.03),vec3(.16,.17,.19),day);float a=refl>.5?mix(.84,1.,smoothstep(420.,555.,d)):1.;
 vec2 g=abs(fract(p/14.)-.5);float grid=smoothstep(.485,.5,max(g.x,g.y))*.5;vec3 c=base+vec3(.05,.25,.6)*grid*exp(-d*.003)*(.5+.5*sin(d*.04-t*1.2))*(1.-day*.7);
 c+=vec3(.0,.02,.04)*fbm(p*.08);
 for(int i=0;i<${zoneU.length};i++){vec4 z=zones[i];float zd=length(p-z.xy);float inside=1.-smoothstep(z.z*.7,z.z,zd);
  float ring1=(1.-smoothstep(.0,.9,abs(zd-z.z*.62)))+(1.-smoothstep(0.,.9,abs(zd-z.z*.98)));c+=vec3(.5,.7,1.)*ring1*.2*inside*(1.-day*.6);
  c=mix(c,c*.6+vec3(.02,.025,.04),inside*.5);
  if(z.w>.5){float s=z.w;float burn=smoothstep(z.z*(1.+.35*s)+10.,0.,zd);float n=fbm(p*.18+vec2(t*.05,0.));float e=smoothstep(.62,.8,fbm(p*.6-t*.15))*burn;
   c=mix(c,vec3(.05,.015,.005),burn*.8);c+=vec3(1.,.3,.05)*e*(1.2+s*.6)*(.6+.4*sin(t*3.+n*20.))+vec3(.4,.08,.0)*burn*n*.4*s;}
  if(z.w<-.5){float fr=1.-smoothstep(0.,z.z*1.4+8.,zd);float cr=(1.-smoothstep(.0,.04,abs(fbm(p*.25)-.5)))+(1.-smoothstep(0.,.03,abs(vn(p*.9)-.5)))*.6;
   c=mix(c,vec3(.12,.2,.32),fr*.55);c+=vec3(.4,.75,1.)*cr*fr*.5;}}
 float pud=smoothstep(.55,.7,fbm(p*.05))*wet;a*=1.-pud*.45*refl;c=mix(c,c*.6+vec3(.03,.05,.1),pud);
 vec2 cell=floor(p/3.);vec2 f=fract(p/3.)-.5;float ph=fract(t*.9+h21(cell));float rip=(1.-smoothstep(.0,.05,abs(length(f)-ph*.5)))*(1.-ph)*wet*step(.5,h21(cell+7.));c+=vec3(.5,.7,1.)*rip*.6;
 c+=vec3(.5,.55,.8)*flash*.15;gl_FragColor=vec4(c,a);if(any(isnan(gl_FragColor))||any(isinf(gl_FragColor)))gl_FragColor=vec4(0.);\n${TAIL}\n}`});
const ground=new THREE.Mesh(new THREE.CircleGeometry(GROUND,96),groundMat);ground.rotation.x=-Math.PI/2;ground.position.y=.02;ground.renderOrder=-1;S.add(ground);

// ---------- river ring around the XRP hub ----------
const river=new THREE.Mesh(new THREE.RingGeometry(75,87,160,1),new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,uniforms:{...fogU(),t:U.t,day:U.day},
 vertexShader:`varying vec2 v;\n${FOGV}\nvoid main(){v=position.xy;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
 fragmentShader:`uniform float t,day;varying vec2 v;\n#include <fog_pars_fragment>\n${NOISE}
 void main(){float a=atan(v.y,v.x);float r=length(v);vec2 q=vec2(a*90.,r*1.5);float flow=fbm(q*.15+vec2(t*.6,0.));float sp=smoothstep(.8,.95,vn(q*.9+vec2(t*2.,0.)));
 float edge=(1.-smoothstep(0.,1.2,abs(r-75.)))+(1.-smoothstep(0.,1.2,abs(r-87.)));vec3 c=mix(vec3(.0,.04,.1),vec3(.0,.2,.4),flow)+vec3(.4,.9,1.)*sp*.7+vec3(.2,.9,1.)*edge*.55;
 c=mix(c,vec3(.2,.35,.45),day*.5);gl_FragColor=vec4(c,.55+edge*.2);\n${TAIL}\n}`}));
river.rotation.x=-Math.PI/2;river.position.y=.12;S.add(river);

// ---------- building material: shader windows, fake AO, top-edge glow (instanced + non-instanced) ----------
function bMat(color=0xffffff,dens=1){return new THREE.ShaderMaterial({fog:true,defines:TIER==='low'?{LOWQ:''}:{},uniforms:{...fogU(),c:{value:new THREE.Color(color)},d:{value:dens},t:U.t,day:U.day,flash:U.flash},
 vertexShader:`varying vec3 wp,wn,vC,vN,vV;varying float ly;\n${FOGV}\nvoid main(){mat4 M=modelMatrix;\n#ifdef USE_INSTANCING\nM=modelMatrix*instanceMatrix;\n#endif\n
 vec4 w=M*vec4(position,1.);wp=w.xyz;wn=normalize(transpose(inverse(mat3(M)))*normal);ly=position.y;\n#ifdef USE_INSTANCING_COLOR\nvC=instanceColor;\n#else\nvC=vec3(1.);\n#endif\nvec4 mvPosition=viewMatrix*w;vV=-mvPosition.xyz;vN=normalize((viewMatrix*vec4(wn,0.)).xyz);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
 fragmentShader:`uniform vec3 c;uniform float d,t,day,flash;varying vec3 wp,wn,vC,vN,vV;varying float ly;\n#include <fog_pars_fragment>\n${NOISE}
 // procedural facade: glass curtain wall w/ mullions + floor bands, gradient-sky reflection, random lit windows (more at night), distance LOD, base AO. NaN-safe (clamped pow/normalize).
 void main(){vec3 col=c*vC;vec3 o=mix(vec3(.018,.024,.045),vec3(.2,.22,.26),day);vec3 N=normalize(wn+vec3(0.,1e-5,0.)),vw=normalize(cameraPosition-wp+vec3(1e-4));
 float ndv=clamp(abs(dot(N,vw)),0.,1.),fr=pow(1.-ndv,3.);
 if(abs(N.y)<.6){vec2 uv=vec2(abs(N.x)>abs(N.z)?wp.z:wp.x,wp.y)*vec2(.95,.75)*d;vec2 cell=floor(uv),f=fract(uv);
  float win=step(.16,f.x)*step(f.x,.84)*step(.22,f.y)*step(f.y,.78);float lit=step(mix(.42,.78,day),h21(cell+floor(t*.04+h21(cell)*30.)));float warm=step(.8,h21(cell*3.1));
  vec3 wc=mix(col,vec3(1.,.82,.58),warm*.65)*(.25+.55*h21(cell*1.7))*(1.-day*.75);
 #ifdef LOWQ
  o+=wc*win*lit;
 #else
  float lod=1.-smoothstep(200.,520.,length(cameraPosition-wp));
  vec3 R=reflect(-vw,N);float sk=clamp(R.y*.5+.5,0.,1.);
  vec3 env=mix(mix(vec3(.09,.06,.13),vec3(.36,.32,.34),day),mix(vec3(.015,.025,.07),vec3(.12,.2,.34),day),sk);
  float band=step(.86,f.y)+step(f.y,.1);float mull=1.-win;
  vec3 glass=env*(.15+.55*fr)+wc*lit*1.15;vec3 metal=mix(vec3(.03,.035,.05),vec3(.25,.27,.3),day)+col*.04+env*.12*fr;
  vec3 det=mix(metal*(1.+band*.35),glass,win);
  vec3 far=env*(.15+.5*fr)+wc*.42*(1.-day*.5);
  o+=mix(far,det,lod);
 #endif
  o+=col*smoothstep(.47,.5,ly)*1.2;o+=col*step(.96,fract(wp.y*.07))*.5*(1.-day*.5);}
 else o+=col*.05;
 o*=(.3+.7*smoothstep(0.,6.,wp.y))*(.6+.4*smoothstep(0.,22.,wp.y));o+=col*fr*.3;o+=vec3(.6,.65,1.)*flash*.25;o=clamp(o,0.,16.);gl_FragColor=vec4(o,1.);\n${TAIL}\n}`})}
const matCache={};const towerMat=c=>matCache[c]||(matCache[c]=bMat(c,1.15));
const stdCache={};const neonStd=(c,k)=>stdCache[c+'_'+k]||(stdCache[c+'_'+k]=new THREE.MeshStandardMaterial({color:0x0b1020,emissive:c,emissiveIntensity:k,metalness:.9,roughness:.3}));

await stage(0.3,'Raising towers');
// ---------- towers (hero buildings) ----------
const pick=[],colliders=[],anim=[],labelEls=[];
const segGeo=new THREE.CylinderGeometry(.82,1,1,4,1);segGeo.rotateY(Math.PI/4);
const LOCKT=[[0,'Under construction'],[.15,'Framed'],[.4,'Standard'],[.7,'Premium'],[.92,'Flagship']];
const lockTier=L=>{let t=0;LOCKT.forEach(([th],i)=>{if(L>=th)t=i});return t};
const TDENS=[.6,.85,1.15,1.35,1.55];const tierMat=(c,t)=>matCache[c+'|'+t]||(matCache[c+'|'+t]=bMat(c,TDENS[t]));
// shared tier part materials (keeps batching keys identical across towers)
const PM={scaf:new THREE.LineBasicMaterial({color:0xffb000,transparent:true,opacity:.5}),warn:new THREE.SpriteMaterial({map:GT,color:0xffa000,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}),
 glass:new THREE.MeshStandardMaterial({color:0x9fd8ff,metalness:.95,roughness:.08,transparent:true,opacity:.22,depthWrite:false}),chrome:new THREE.MeshStandardMaterial({color:0xdfe8ff,metalness:1,roughness:.18}),
 padM:new THREE.MeshStandardMaterial({color:0x10182c,metalness:.8,roughness:.3})};
const WARN=[[],[]];const scafGeo=new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1,1,3,1));
function tierParts(n,g,si,y,spH,cw,sides){const T=n.tier,col=n.col;
 if(T<=1){// under construction: amber scaffold cage on the upper body + blinking work lights + tower crane
  const top=si[si.length-1],cover=T===0?si.slice(-2):[top];cover.forEach(q=>{const sc=new THREE.LineSegments(scafGeo,PM.scaf);sc.scale.set(q.cw*2.25,q.sh*1.02,q.cw*2.25);sc.position.y=q.y+q.sh/2;g.add(sc)});
  const ly=top.y+top.sh;for(let k=0;k<(n.minor?1:2);k++)WARN[k].push(n.pos.x+(k?-1:1)*top.cw*1.1,ly+.5,n.pos.z);
  if(!n.minor){const mast=new THREE.Mesh(new THREE.BoxGeometry(.5,spH*1.4,.5),PM.chrome);mast.position.set(top.cw*.6,y+spH*.7,0);g.add(mast);
   const jib=new THREE.Mesh(new THREE.BoxGeometry(n.w*3.2,.35,.35),PM.chrome);jib.position.set(top.cw*.6+n.w*.9,y+spH*1.4,0);g.add(jib)}
  return}
 if(T>=3){// premium: glass curtain wall + chrome trims; flagship adds crown, light strips and a landing pad
  si.forEach((q,i)=>{if(i===si.length-1&&n.minor)return;const gl=new THREE.Mesh(new THREE.CylinderGeometry(q.top*1.06,q.cw*1.06,q.sh*.96,sides,1,true),PM.glass);gl.position.y=q.y+q.sh/2;g.add(gl);
   const tr=new THREE.Mesh(new THREE.TorusGeometry(q.top*1.12,.12,4,sides*3),neonStd(n.th.c,1.2));tr.rotation.x=Math.PI/2;tr.position.y=q.y+q.sh;g.add(tr)});
  if(T>=4&&!n.minor){const crown=new THREE.Group();for(let k=0;k<6;k++){const a=k/6*Math.PI*2;const sp=new THREE.Mesh(new THREE.ConeGeometry(.35,spH*.55,4),PM.chrome);sp.position.set(Math.cos(a)*cw*.9,y+spH*.27,Math.sin(a)*cw*.9);g.add(sp)}
   const strip=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,si[0].sh*.9+si[1].sh,4),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.9}));strip.userData.noBatch=1;strip.position.set(n.w*1.02,(si[0].sh*.9+si[1].sh)/2,0);g.add(strip);
   const s2=strip.clone();s2.position.set(-n.w*1.02,s2.position.y,0);g.add(s2);anim.push(t=>{const o=.35+.65*(.5+.5*Math.sin(t*2.2+n.pos.z));strip.material.opacity=o});
   const pad=new THREE.Mesh(new THREE.CylinderGeometry(cw*1.5,cw*1.5,.25,24),PM.padM);pad.position.y=si[si.length-1].y+si[si.length-1].sh+.6;pad.position.x=0;
   const ring=new THREE.Mesh(new THREE.RingGeometry(cw*1.25,cw*1.45,24),new THREE.MeshBasicMaterial({color:0x3cf3ff,side:2}));ring.rotation.x=-Math.PI/2;ring.position.y=pad.position.y+.14;g.add(pad);g.add(ring)}}}
// signature crowns for the flagships (+ $BCHAMP landmark); cheap shared-material meshes, opaque, no transparency
function signatureTop(n,g,y,spH,cw){const k=n.name,em=neonStd(n.th.c,2.2);
 if(k==='BURN'){for(let i=0;i<5;i++){const a=i/5*6.283;const f=new THREE.Mesh(new THREE.ConeGeometry(cw*.32,spH*(.55+.25*(i%2)),5),em);f.position.set(Math.cos(a)*cw*.55,y+spH*.3,Math.sin(a)*cw*.55);f.rotation.set(Math.sin(a)*.25,0,-Math.cos(a)*.25);g.add(f)}}
 else if(k==='IMM'){const c=new THREE.Mesh(new THREE.OctahedronGeometry(cw*.75,0),em);c.scale.y=1.8;c.position.y=y+spH*.62;g.add(c);anim.push((t,dt)=>c.rotation.y+=dt*.4)}
 else if(k==='IMG'){const r=new THREE.Mesh(new THREE.TorusGeometry(cw*.95,cw*.12,6,32),em);r.position.y=y+spH*.55;g.add(r);anim.push((t,dt)=>r.rotation.y+=dt*.5)}
 else if(k==='XRPyro'){for(let i=0;i<3;i++){const a=i/3*6.283;const p=new THREE.Mesh(new THREE.CylinderGeometry(.12,cw*.22,spH*1.1,5),em);p.position.set(Math.cos(a)*cw*.6,y+spH*.55,Math.sin(a)*cw*.6);p.rotation.set(Math.sin(a)*.18,0,-Math.cos(a)*.18);g.add(p)}}
 else if(k==='BCHAMP'){const c=new THREE.Group();for(let i=0;i<5;i++){const a=i/5*6.283;const p=new THREE.Mesh(new THREE.ConeGeometry(cw*.2,spH*.45,4),em);p.position.set(Math.cos(a)*cw*.85,spH*.22,Math.sin(a)*cw*.85);c.add(p)}
  const band=new THREE.Mesh(new THREE.TorusGeometry(cw*.9,cw*.1,5,30),em);band.rotation.x=Math.PI/2;c.add(band);c.position.y=y+spH*.15;g.add(c)}}
function heroTower(n){const g=new THREE.Group();g.position.copy(n.pos);S.add(g);const col=n.col;
 const locked=pools.filter(p=>p.a===n.name||p.b===n.name).reduce((s,p)=>s+p.tvl_xrp*p.locked_pct/100,0)/Math.max(1,n.tvl);n.lockedShare=locked;const T=n.tier=n.name==='XRP'?4:lockTier(locked);
 // architecture by lock tier (base width n.w and total height n.h unchanged): 0 boxy concrete, 1 stepped setbacks, 2 tapered glass, 3+ twisted spires
 const SIL=n.name==='XRP'?2:Math.min(3,T),sides=n.name==='XRP'?12:SIL===0?4:SIL===1?(n.minor?4:6):n.minor?6:8;
 let y=0,cw=n.w;const segs=n.minor?2:n.name==='XRP'?5:4;const mat=tierMat(n.th.c,T);const segInfo=[];
 for(let s=0;s<segs;s++){const sh=n.h*(s===0?.42:.58/(segs-1)),top=cw*(SIL===0?.97:SIL===1?1:s===segs-1?.62:.84);const geo=new THREE.CylinderGeometry(top,cw,sh,sides,1),ug=new THREE.CylinderGeometry(top/cw,1,1,sides,1);
  if(sides===4){ug.rotateY(Math.PI/4);geo.rotateY(Math.PI/4)}const m=new THREE.Mesh(ug,mat);m.scale.set(cw,sh,cw);m.position.y=y+sh/2;if(SIL===3&&!n.minor){m.rotation.y=s*.32;}g.add(m);segInfo.push({y,sh,cw,top});
  if(!n.minor&&T>=2){const e=new THREE.LineSegments(new THREE.EdgesGeometry(geo),new THREE.LineBasicMaterial({color:col,transparent:true,opacity:.45}));e.position.copy(m.position);g.add(e)}
  const ledge=new THREE.Mesh(new THREE.CylinderGeometry(top*1.14,top*1.18,.6,sides),neonStd(n.th.c,.9));ledge.position.y=y+sh;g.add(ledge);
  if(s===0&&!n.minor&&T>=1)for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2+Math.PI/sides;const fin=new THREE.Mesh(new THREE.BoxGeometry(.35,sh*.9,cw*.28),neonStd(n.th.c,.35));
   fin.position.set(Math.cos(a)*cw*.98,sh*.45,Math.sin(a)*cw*.98);fin.rotation.y=-a;g.add(fin)}
  y+=sh;cw=SIL===0?top*.96:SIL===1?top*.78:top*.9}
 const spH=n.h*(n.minor?.18:.3);const spire=new THREE.Mesh(new THREE.ConeGeometry(cw*.55,spH,sides),neonStd(n.th.c,1.4));spire.position.y=y+spH/2;g.add(spire);
 const antH=n.h*.16;const ant=new THREE.Mesh(new THREE.CylinderGeometry(.08,.14,antH,4),new THREE.MeshBasicMaterial({color:0xdde8ff}));ant.position.y=y+spH+antH/2;g.add(ant);
 const beacon=new THREE.Sprite(new THREE.SpriteMaterial({map:GT,color:col,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));beacon.scale.setScalar(n.w*1.3+2);beacon.position.y=y+spH+antH;g.add(beacon);
 const red=new THREE.Sprite(new THREE.SpriteMaterial({map:GT,color:0xff2222,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true}));red.scale.setScalar(2.5);red.position.y=y+spH*.6;g.add(red);
 anim.push(t=>{beacon.material.opacity=.65+.35*Math.sin(t*2+n.pos.x);red.material.opacity=.35+.65*Math.pow(.5+.5*Math.sin(t*1.6+n.pos.z),3)});
 n.top=y+spH+antH;n.roofY=y;n.roofCw=cw;n.spH=spH;
 signatureTop(n,g,y,spH,cw);
 if(!n.minor&&TIER!=='low'){const k=T>=3?4:T>=1?3:2;for(let q=0;q<k;q++){const an=q/k*6.283+.4,r=cw*.78;ROOF.push([n.pos.x+Math.cos(an)*r,y,n.pos.z+Math.sin(an)*r,cw*(.22+.08*(q%2)),.9+.5*(q%3),an])}
  if(T>=2&&T<4)ROOF.push([n.pos.x,y,n.pos.z,-cw*.5,0,0]);}
 tierParts(n,g,segInfo,y,spH,cw,sides);
 const pad=new THREE.Mesh(new THREE.CylinderGeometry(n.w*1.85,n.w*2.05,.5,40),new THREE.MeshStandardMaterial({color:0x0b1020,metalness:.85,roughness:.35}));pad.position.y=.25;g.add(pad);
 const pr=new THREE.Mesh(new THREE.RingGeometry(n.w*1.9,n.w*2.05,64),new THREE.MeshBasicMaterial({color:col,side:2}));pr.rotation.x=-Math.PI/2;pr.position.y=.52;g.add(pr);
 const hit=new THREE.Mesh(new THREE.CylinderGeometry(n.w*1.2,n.w*1.2,n.top,8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=n.top/2;hit.userData={kind:'tower',node:n};g.add(hit);pick.push(hit);
 colliders.push({x:n.pos.x,z:n.pos.z,r:n.w*1.05,h:n.h*.42,node:n});
 if((TIER==='low'?['XRP']:['XRP','BURN','XRPyro','IMM','666']).includes(n.name)){const pl=new THREE.PointLight(col,n.name==='XRP'?700:260,170,1.6);pl.position.y=n.h*.45;g.add(pl)}
 const el=document.createElement('div');el.className='lbl'+(n.minor?' minor':'');el.style.setProperty('--c','#'+col.getHexString());el.innerHTML=n.name+(n.minor?'':`<small>${fmt(n.tvl)} XRP TVL</small>`);$('labels').appendChild(el);
 n.lblEl=el;labelEls.push({el,pos:new THREE.Vector3(n.pos.x,n.top+4,n.pos.z),pri:n.name==='XRP'?1e9:n.tvl,minor:n.minor});
 n.group=g}
const ROOF=[];E.nodes.forEach(heroTower);
// rooftop details: HVAC units (instanced boxes) + helipad discs on tier 2-3 towers (tier 4 keeps its landing pad)
if(ROOF.length){const hv=ROOF.filter(r=>r[3]>0),hp=ROOF.filter(r=>r[3]<0),o=new THREE.Object3D();
 const box=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x2a3142,metalness:.7,roughness:.45,emissive:0x05070c}),hv.length);
 hv.forEach((r,i)=>{o.position.set(r[0],r[1]+r[4]/2,r[2]);o.rotation.set(0,r[5],0);o.scale.set(r[3]*2,r[4],r[3]*1.4);o.updateMatrix();box.setMatrixAt(i,o.matrix)});S.add(box);
 if(hp.length){const pad=new THREE.InstancedMesh(new THREE.CylinderGeometry(1,1,.18,20),new THREE.MeshStandardMaterial({color:0x1a2030,metalness:.6,roughness:.5,emissive:0x0a2a30,emissiveIntensity:.6}),hp.length);
  hp.forEach((r,i)=>{const R=-r[3];o.position.set(r[0],r[1]+.1,r[2]);o.rotation.set(0,0,0);o.scale.set(R,1,R);o.updateMatrix();pad.setMatrixAt(i,o.matrix)});S.add(pad)}}
// work lights on under-construction towers: two Points draw calls total, alternating blink
WARN.forEach((arr,k)=>{if(!arr.length)return;const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(arr,3));const m=glowMat(0xffa000,2.6);S.add(new THREE.Points(bg,m));anim.push(t=>m.opacity=Math.sin(t*3.4+k*Math.PI)>0?1:.08)});

// ---------- energy spirals (replace the old halo rings): ONE merged ribbon mesh + ONE spark Points for the whole city ----------
// flow speed = 24h volume · colour = 24h price change (teal up / orange-red down / blue-white flat) · thickness+brightness = % LP locked
// turns = active wallets (fallback holders) · drifting sparks = recent burns worth >10 XRP
{const SEG=TIER==='low'?40:TIER==='medium'?70:110,P=[],UV=[],PR=[],CO=[],IX=[];let vb=0;const sp=[],spP=[];
 const vmax=Math.max(1,...E.nodes.map(n=>n.vol24h||0));
 E.nodes.forEach(n=>{if(n.minor||!n.h||n.name==='XRP'&&!n.w)return;const act=n.active!=null?n.active:n.holders!=null?n.holders/10:0,turns=2+Math.round(Math.min(5,Math.log10(1+act)*1.6));
  const speed=.15+1.6*Math.log10(1+(n.vol24h||0))/Math.log10(1+vmax),lock=Math.min(1,n.lockedShare||0),ch=n.pro24h;
  const c=ch==null||Math.abs(ch)<.5?new THREE.Color(0xbfdcff):ch>0?new THREE.Color(0x2dffc0).lerp(new THREE.Color(0x30ff6a),Math.min(1,ch/15)):new THREE.Color(0xff8a2a).lerp(new THREE.Color(0xff2a1a),Math.min(1,-ch/15));
  const R=n.w*1.55,H=n.h*.92,wid=.35+lock*1.1;
  for(let k=0;k<=SEG;k++){const u=k/SEG,a=u*turns*6.283,y=.8+u*H,rr=R*(1-.25*u);for(const sd of [-1,1]){P.push(n.pos.x+Math.cos(a)*rr,y+sd*wid*.5,n.pos.z+Math.sin(a)*rr);UV.push(u*turns,sd*.5+.5);PR.push(speed,.35+.65*lock);CO.push(c.r,c.g,c.b)}
   if(k<SEG){const q=vb+k*2;IX.push(q,q+1,q+2,q+1,q+3,q+2)}}vb+=(SEG+1)*2;
  const nb=Math.min(TIER==='low'?6:16,(n.scar_txs??n.burn_txs??0));for(let j=0;j<nb;j++){spP.push(n.pos.x,0,n.pos.z);sp.push(R,H,Math.random()*100,j)}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));g.setAttribute('pr',new THREE.Float32BufferAttribute(PR,2));g.setAttribute('col',new THREE.Float32BufferAttribute(CO,3));g.setIndex(IX);
 const m=new THREE.ShaderMaterial({uniforms:{t:U.t},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:'attribute vec2 pr;attribute vec3 col;varying vec2 vU;varying vec2 vP;varying vec3 vC;varying float vD;void main(){vU=uv;vP=pr;vC=col;vec4 w=modelMatrix*vec4(position,1.);float d=distance(w.xyz,cameraPosition);vD=clamp((d-120.)/380.,0.,1.);w.y+=(uv.y-.5)*vD*(1.2+2.2*pr.y);gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:'uniform float t;varying vec2 vU;varying vec2 vP;varying vec3 vC;varying float vD;void main(){float e=1.-abs(vU.y*2.-1.);e=smoothstep(0.,.8,e);float f=fract(vU.x*3.-t*vP.x);float flow=.35+.65*smoothstep(.0,.25,f)*(1.-smoothstep(.45,1.,f));float a=min(.8,e*mix(flow,.75+.25*flow,vD)*vP.y*(.55+.45*vD));gl_FragColor=vec4(min(vC,vec3(.9))*a,a);}'});
 const mesh=new THREE.Mesh(g,m);mesh.frustumCulled=false;mesh.renderOrder=3;S.add(mesh);
 if(sp.length){const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute(spP,3));sg.setAttribute('sp',new THREE.Float32BufferAttribute(sp,4));
  const sm=new THREE.ShaderMaterial({uniforms:{t:U.t,px:{value:R.getPixelRatio()}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
   vertexShader:'attribute vec4 sp;uniform float t,px;varying float vA;void main(){float k=fract(t*.08+sp.z*.137);float a=sp.z+t*.6+k*6.;vec3 p=position+vec3(cos(a)*sp.x*(1.+k*.6),sp.y*(.25+k*.85),sin(a)*sp.x*(1.+k*.6));vA=sin(k*3.1416);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(14.,px*90./-mv.z);}',
   fragmentShader:'varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.0,d)*vA*.8;gl_FragColor=vec4(vec3(1.,.55,.15)*a,a);}'});
  const pts=new THREE.Points(sg,sm);pts.frustumCulled=false;S.add(pts)}}
// ---------- permanent burn marks v5: noise-shader fire, one instanced draw call + one embers draw call for the whole city ----------
// Every real burn (Payment of a token to its own issuer) leaves a flame on that tower. Each mark = 3 instances in the SAME draw call:
// kind 0 = flame (fbm-noise tongues, flicker, heat-shimmer wobble), kind 1 = molten scorch cracks on the facade, kind 2 = smoke wisp (med/high).
// Count is capped per tower and globally (by graphics tier); beyond the cap flames burn hotter/larger. Bigger burns -> bigger flames.
const MARK_CAP=TIER==='low'?10:TIER==='medium'?16:24,MARK_GLOBAL=TIER==='low'?140:TIER==='medium'?280:460,MK_SMOKE=TIER!=='low',MK_PER=MK_SMOKE?3:2;
// per-token fire themes: outer colour + core colour. BURN orange-gold, IMM blue plasma, XRPyro white-hot w/ red core, others = brand colour
const FIRE={BURN:[0xff6a10,0xffd860],IMM:[0x2a7bff,0xbff0ff],XRPyro:[0xff1a00,0xfff6e8]};
const fireCols=n=>{const f=FIRE[n.name];if(f)return f;const c=n.col.clone();return [c.getHex(),c.clone().lerp(new THREE.Color(0xffffff),.65).getHex()]};
const MK={geo:new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1,1.6,1,TIER==='low'?1:4).translate(0,.55,0)),byNode:new Map()};
const MKN=MARK_GLOBAL*MK_PER;MK.off=new THREE.InstancedBufferAttribute(new Float32Array(MKN*4),4);MK.col=new THREE.InstancedBufferAttribute(new Float32Array(MKN*4),4);MK.core=new THREE.InstancedBufferAttribute(new Float32Array(MKN*4),4);
MK.geo.setAttribute('iOff',MK.off);MK.geo.setAttribute('iCol',MK.col);MK.geo.setAttribute('iCore',MK.core);MK.geo.instanceCount=0;
const FNOISE=`float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<OCT;i++){v+=a*vn(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}`;
MK.mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{t:U.t},defines:{OCT:TIER==='low'?2:TIER==='medium'?3:4},
 vertexShader:`attribute vec4 iOff;attribute vec4 iCol;attribute vec4 iCore;uniform float t;varying vec2 vUv;varying vec4 vC;varying vec4 vK;varying float vF;
 void main(){vUv=uv;vC=iCol;vK=iCore;float sd=fract(iOff.x*.137+iOff.z*.311+iOff.y*.071);float kind=floor(iCore.a);float birth=fract(iCore.a)*1000.;
  float age=t-birth;float flare=birth>0.&&age>0.?1.+2.6*exp(-age*1.1):1.;
  float f=.86+.14*sin(t*(6.+5.*sd)+sd*40.)+.07*sin(t*17.+sd*9.);vF=f*flare;
  vec3 p=position;float sz=iOff.w;
  if(kind<.5){p.x+=sin(t*9.+p.y*5.+sd*20.)*.06*uv.y;p.y*=mix(1.,f,.6);sz*=flare;}          // flame: flicker + heat-shimmer wobble
  else if(kind<1.5){sz*=1.25;p.y-=.35;}                                                    // scorch cracks: slightly larger, lower on facade
  else{float ph=fract(t*.12+sd);p.y=p.y*2.2+ph*3.;p.x+=sin(t*.8+sd*7.+p.y)*.35*uv.y;sz*=1.1+ph;vF=ph;}   // smoke wisp: tall, drifting
  vec4 mv=viewMatrix*vec4(iOff.xyz,1.);mv.xy+=p.xy*sz*(1.+.3*(iCol.a-1.));gl_Position=projectionMatrix*mv;}`,
 fragmentShader:`uniform float t;varying vec2 vUv;varying vec4 vC;varying vec4 vK;varying float vF;
 ${FNOISE}
 void main(){float kind=floor(vK.a);vec2 uv=vUv;float sd=vC.r*7.+vK.g*3.;
  if(kind<.5){ // ---- volumetric-looking flame tongues
   vec2 q=vec2(uv.x*3.,uv.y*2.-t*2.2);float n=fbm(q+sd);float n2=fbm(q*2.+vec2(5.,-t*1.5)+sd);
   float x=(uv.x-.5)*2.+(n-.5)*1.5*uv.y;float w=(1.-uv.y)*.85+.06;float g=1.-abs(x)/w;
   float tongue=g*1.25-uv.y*.95+(n2-.5)*1.5;float body=smoothstep(0.,.22,tongue)*smoothstep(0.,.08,uv.y);
   float heat=clamp(tongue*1.5,0.,1.);
   vec3 col=mix(vC.rgb*vec3(.55,.25,.2),vC.rgb,smoothstep(.0,.35,heat));col=mix(col,vK.rgb,smoothstep(.45,.9,heat));
   float k=min(1.5,.6+.2*vC.a)*vF;gl_FragColor=vec4(col*body*k,body);
  }else if(kind<1.5){ // ---- glowing molten cracks on the scorched facade
   vec2 p=(uv-vec2(.5,.35))*vec2(1.,1.6);float r=length(p);float e=fbm(p*6.+sd);float cr=1.-smoothstep(.0,.05,abs(fbm(p*4.+sd*1.3)-.5));
   float m=(1.-smoothstep(.1,.5,r));float glow=(.55+.45*sin(t*2.+e*9.))*cr*m;vec3 col=mix(vC.rgb,vK.rgb,.35)*glow*1.6+vec3(.02,.01,0.)*m;
   gl_FragColor=vec4(col,m*.5);
  }else{ // ---- faint smoke wisp (additive: kept dim and warm-lit at the base)
   float n=fbm(vec2(uv.x*3.,uv.y*2.-t*.5)+sd);float x=abs(uv.x-.5+(n-.5)*.5)*2.;float a=(1.-smoothstep(.2,.9,x))*smoothstep(0.,.25,uv.y)*(1.-smoothstep(.4,1.,uv.y))*n*(1.-vF);
   vec3 col=mix(vC.rgb*.25,vec3(.16,.15,.17),smoothstep(.0,.5,uv.y));gl_FragColor=vec4(col*a*.55,a*.3);}
  if(any(isnan(gl_FragColor))||any(isinf(gl_FragColor)))gl_FragColor=vec4(0.);gl_FragColor=clamp(gl_FragColor,0.,4.);
 }`});
MK.mesh=new THREE.Mesh(MK.geo,MK.mat);MK.mesh.frustumCulled=false;MK.mesh.userData.noBatch=1;MK.mesh.renderOrder=3;S.add(MK.mesh);
// rising/drifting embers from every mark: one Points draw call, animated fully on the GPU
const EMBN=TIER==='low'?120:TIER==='medium'?420:960,EM={geo:new THREE.BufferGeometry()};EM.base=new Float32Array(EMBN*4);EM.col=new Float32Array(EMBN*3);
EM.geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(EMBN*3),3));EM.geo.setAttribute('aBase',new THREE.BufferAttribute(EM.base,4));EM.geo.setAttribute('aCol',new THREE.BufferAttribute(EM.col,3));EM.geo.setDrawRange(0,0);
EM.mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{t:U.t,px:{value:R.getPixelRatio()*innerHeight*.5}},
 vertexShader:`attribute vec4 aBase;attribute vec3 aCol;uniform float t,px;varying vec3 vC;varying float vA;
 void main(){float sd=fract(float(gl_VertexID)*.61803);float sp=.25+.35*sd;float ph=fract(t*sp+sd*13.);
  vec3 p=aBase.xyz+vec3(sin(t*1.3+sd*40.)*1.6*ph+cos(sd*90.)*.6,ph*(7.+aBase.w*5.),cos(t*1.1+sd*31.)*1.6*ph+sin(sd*70.)*.6);
  vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;vA=smoothstep(0.,.08,ph)*(1.-ph)*(.6+.4*sin(t*20.+sd*50.));vC=aCol;
  gl_PointSize=clamp(px*(.18+.22*sd)*(1.+aBase.w*.3)/-mv.z,1.,9.);}`,
 fragmentShader:`varying vec3 vC;varying float vA;void main(){vec2 d=gl_PointCoord-.5;float a=(1.-smoothstep(0.,.5,length(d)))*vA;gl_FragColor=vec4(mix(vC,vec3(1.,.95,.8),.35)*a*2.,a);}`});
EM.pts=new THREE.Points(EM.geo,EM.mat);EM.pts.frustumCulled=false;EM.pts.userData.noBatch=1;EM.pts.renderOrder=4;S.add(EM.pts);
addEventListener('resize',()=>EM.mat.uniforms.px.value=R.getPixelRatio()*innerHeight*.5);
function markSpot(n,i){const r=((i*2654435761)>>>0)/4294967296,r2=((i*40503+n.name.length*977)>>>0)%1000/1000;const hb=n.h*.42;
 const y=1.5+(i===0?hb*.5:(r2*.92)*(n.h*.95)),wr=y<hb?n.w*1.02:n.w*.86*(1-.25*(y-hb)/(n.h-hb+1));const a=i*2.399+n.pos.x*.01;return [n.pos.x+Math.cos(a)*(wr+.25),y,n.pos.z+Math.sin(a)*(wr+.25)]}
// size of one burn relative to supply -> flame scale (bigger burns, bigger flames)
const burnScale=(n,amt)=>{const f=n.circ&&amt?amt/(n.circ+amt):0;return Math.max(.85,Math.min(2.6,.85+.42*Math.log10(1+f*1e5)))};
function layoutMarks(){const want=E.nodes.filter(n=>(n.scar_txs??n.burn_txs??0)+(n.liveBurns||0)>0).map(n=>{const c=(n.scar_txs??n.burn_txs??0)+(n.liveBurns||0);return {n,c,k:Math.min(MARK_CAP,c)}});
 let tot=want.reduce((s,w)=>s+w.k,0);if(tot>MARK_GLOBAL){const f=MARK_GLOBAL/tot;want.forEach(w=>w.k=Math.max(1,Math.floor(w.k*f)))}
 let j=0,m=0,ej=0;const c3=new THREE.Color(),k3=new THREE.Color();const embPer=Math.max(1,Math.floor(EMBN/Math.max(1,want.reduce((s,w)=>s+w.k,0))));
 want.forEach(w=>{const n=w.n,[oc,cc]=fireCols(n);c3.set(oc);k3.set(cc);const inten=1+Math.max(0,Math.log2(w.c/w.k));
  const vx=n.burn_vol&&n.price_amm?n.burn_vol*n.price_amm:0;const base=(1.1+.25*Math.min(6,Math.log10(1+vx)))*Math.min(1.6,.6+n.w*.12);
  const avg=n.scars&&n.scars.length?n.scars.reduce((q,x)=>q+x[1],0)/n.scars.length:n.burn_vol&&n.burn_txs?n.burn_vol/n.burn_txs:0,live=n.liveAmt||[];n.markIdx=[];
  for(let i=0;i<w.k&&m<MARK_GLOBAL;i++,m++){const [x,y,z]=markSpot(n,i);const li=live.length-(w.k-i);   // newest marks map to the live burns
   const amt=li>=0?live[li].amt:avg*(.4+1.2*(((i*7919)>>>0)%100)/100);const sz=base*(i===0?1.5:1)*burnScale(n,amt)*1.5;
   const birth=li>=0?live[li].birth:0,bf=Math.min(.999,birth/1000);
   for(let kd=0;kd<MK_PER;kd++,j++){MK.off.setXYZW(j,x,y,z,sz);MK.col.setXYZW(j,c3.r,c3.g,c3.b,inten);MK.core.setXYZW(j,k3.r,k3.g,k3.b,kd+(kd===0?bf:0))}
   n.markIdx.push([x,y,z,sz]);
   for(let e=0;e<embPer&&ej<EMBN;e++,ej++){EM.base.set([x,y+sz*.6,z,Math.min(3,sz*.6)],ej*4);EM.col.set([c3.r,c3.g,c3.b],ej*3)}}
  n.marks=w.k;n.markInt=inten});
 MK.geo.instanceCount=j;MK.off.needsUpdate=MK.col.needsUpdate=MK.core.needsUpdate=true;EM.geo.setDrawRange(0,ej);EM.geo.attributes.aBase.needsUpdate=EM.geo.attributes.aCol.needsUpdate=true;
 window.__marks={instances:m,cap:MARK_GLOBAL,perTower:MARK_CAP,shaderInstances:j,embers:ej}}
layoutMarks();
// birth times are packed into iCore.a's fraction (seconds/1000), so flare-ups stay exact for ~16 min of uptime and then just stop flaring
function burnMark(n,amt){if(!arguments[2]&&n.price_amm!=null&&(amt||0)*n.price_amm<=10)return;n.liveBurns=(n.liveBurns||0)+1;(n.liveAmt=n.liveAmt||[]).push({amt:amt||0,birth:U.t.value<999?U.t.value:0,demo:arguments[2]});if(n.liveAmt.length>MARK_CAP)n.liveAmt.shift();layoutMarks()}


const _m=new THREE.Matrix4(),_q=new THREE.Quaternion(),_v=new THREE.Vector3(),_t=new THREE.Vector3(),_s=new THREE.Vector3(),UPV=new THREE.Vector3(0,1,0),_one=new THREE.Vector3(1,1,1),ORIGIN=new THREE.Vector3();
// ---------- Launchpad district: unbonded bonding-curve tokens (xrpl.fun crucible, via launchpad.js built nightly) ----------
// Each lot: excavated pit + dirt, instanced cranes, wireframe ghost of the future tower, bonding-progress ring. Capped, mostly shared geometry.
const LP_DATA=window.LAUNCHPAD||{lots:[],graduated:[]},LOT_CAP=TIER==='low'?4:8;
const LPD={a:(6.5/8)*Math.PI*2-Math.PI/2,r:124,lots:[]};LPD.c=new THREE.Vector3(Math.cos(LPD.a)*LPD.r,0,Math.sin(LPD.a)*LPD.r);
{const lots=LP_DATA.lots.slice(0,LOT_CAP);colliders.push({x:LPD.c.x,z:LPD.c.z,r:lots.length?16+lots.length*2:0,h:0});
 const pitM=new THREE.MeshStandardMaterial({color:0x2a1c12,roughness:1,metalness:0,side:2}),dirtM=new THREE.MeshStandardMaterial({color:0x4a3220,roughness:1}),
  ghostM=new THREE.LineBasicMaterial({color:0x3cf3ff,transparent:true,opacity:.35,depthWrite:false}),craneM=new THREE.MeshStandardMaterial({color:0xffb000,metalness:.6,roughness:.4,emissive:0x221400}),
  ringBg=new THREE.MeshBasicMaterial({color:0x332211,side:2}),ringFg=new THREE.MeshBasicMaterial({color:0xff8a2a,side:2});
 const ghostG=new THREE.EdgesGeometry(new THREE.CylinderGeometry(.62,1,1,8,4));
 const nC=lots.length*2,mast=new THREE.InstancedMesh(new THREE.BoxGeometry(.5,1,.5),craneM,Math.max(1,nC)),jib=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.4,.4),craneM,Math.max(1,nC));let ci=0;
 lots.forEach((L,i)=>{const cols=Math.min(lots.length,4),row=Math.floor(i/4),col=i%4;const tang=new THREE.Vector3(-Math.sin(LPD.a),0,Math.cos(LPD.a)),rad=new THREE.Vector3(Math.cos(LPD.a),0,Math.sin(LPD.a));
  const pos=LPD.c.clone().addScaledVector(tang,(col-(cols-1)/2)*15).addScaledVector(rad,row*15);const g=new THREE.Group();g.position.copy(pos);S.add(g);
  const pit=new THREE.Mesh(new THREE.CylinderGeometry(5,4,1.6,16,1,true),pitM);pit.position.y=-.4;g.add(pit);const floor=new THREE.Mesh(new THREE.CircleGeometry(4,16).rotateX(-Math.PI/2),pitM);floor.position.y=-1.15;g.add(floor);
  const rim=new THREE.Mesh(new THREE.RingGeometry(5,6.3,16).rotateX(-Math.PI/2),dirtM);rim.position.y=.06;g.add(rim);
  for(let k=0;k<3;k++){const m=new THREE.Mesh(new THREE.ConeGeometry(1.2+k*.3,1+k*.4,7),dirtM);const a=k*2.1+i;m.position.set(Math.cos(a)*6.6,.4,Math.sin(a)*6.6);g.add(m)}
  const H=Math.max(14,Math.min(60,16*Math.log10((L.mcap||1000)+10)-14)),W=3;const ghost=new THREE.LineSegments(ghostG,ghostM);ghost.scale.set(W,H,W);ghost.position.y=H/2;ghost.userData.noBatch=1;g.add(ghost);
  const pct=L.bond_pct!=null?Math.max(0,Math.min(100,L.bond_pct)):null;
  const rb=new THREE.Mesh(new THREE.RingGeometry(6.6,7.2,48).rotateX(-Math.PI/2),ringBg);rb.position.y=.1;g.add(rb);
  if(pct!=null&&pct>0){const rf=new THREE.Mesh(new THREE.RingGeometry(6.6,7.2,48,1,Math.PI/2,-Math.PI*2*pct/100).rotateX(-Math.PI/2),ringFg);rf.position.y=.14;rf.userData.noBatch=1;g.add(rf)}
  const nCr=i%2?1:2;for(let k=0;k<nCr;k++){const a=k*Math.PI+i*.7,mh=H*.8+6,x=Math.cos(a)*5.5,z=Math.sin(a)*5.5;
   _m.compose(_v.set(pos.x+x,mh/2,pos.z+z),_q.identity(),_s.set(1,mh,1));mast.setMatrixAt(ci,_m);
   _m.compose(_v.set(pos.x+x-Math.cos(a)*4,mh,pos.z+z-Math.sin(a)*4),_q.setFromAxisAngle(UPV,-a),_s.set(13,1,1));jib.setMatrixAt(ci++,_m)}
  const hit=new THREE.Mesh(new THREE.CylinderGeometry(6,6,H,8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=H/2;hit.userData={kind:'lot',lot:L};g.add(hit);pick.push(hit);
  const el=document.createElement('div');el.className='lbl lot';el.style.setProperty('--c','#ff8a2a');el.innerHTML=`🚧 ${L.ticker.replace(/[<&]/g,'')}<small>${pct!=null?pct.toFixed(0)+'% bonded':'bonding'}</small>`;$('labels').appendChild(el);
  labelEls.push({el,pos:new THREE.Vector3(pos.x,H+4,pos.z),pri:1,minor:true});LPD.lots.push({L,g,ghost,H,pos})});
 mast.count=jib.count=ci;S.add(mast);S.add(jib);
 anim.push(t=>{ghostM.opacity=.22+.18*(.5+.5*Math.sin(t*1.7))});
 if(lots.length){const el=document.createElement('div');el.className='lbl';el.style.setProperty('--c','#ffb000');el.innerHTML='LAUNCHPAD<small>unbonded tokens</small>';$('labels').appendChild(el);labelEls.push({el,pos:LPD.c.clone().setY(32),pri:5e3,minor:false})}}
// Bonding ceremony: ghost rises and solidifies into a tower. Triggered when a lot shows up as graduated in a refreshed launchpad.js.
const risers=[];function bondLot(ticker){const lo=LPD.lots.find(x=>x.L.ticker===ticker&&!x.done);if(!lo)return;lo.done=1;lo.ghost.material=lo.ghost.material.clone();
 const m=new THREE.Mesh(new THREE.CylinderGeometry(.62*3,3,1,8),towerMat(0xff8a2a));m.position.copy(lo.pos);m.scale.y=.01;S.add(m);risers.push({m,H:lo.H,t:0,lo});
 evBanner(`🏗️ ${ticker} BONDED<small>graduated on xrpl.fun · its AMM pool goes live</small>`,'#ffb000')}
anim.push((t,dt)=>{for(const r of risers){if(r.t>=1)continue;r.t=Math.min(1,r.t+dt/4);const k=1-Math.pow(1-r.t,3);r.m.scale.y=Math.max(.01,r.H*k);r.m.position.y=r.H*k/2;r.lo.ghost.material.opacity=.35*(1-k)}});
window.__bondLot=bondLot;window.__card=name=>N[name]&&showInfo({node:N[name]});
setInterval(async()=>{if(!LPD.lots.length||document.hidden)return;try{const tx=await (await fetch('launchpad.js',{cache:'no-cache'})).text();const d=JSON.parse(tx.slice(tx.indexOf('{'),tx.lastIndexOf('}')+1));
 LPD.lots.forEach(lo=>{if(!lo.done&&(d.graduated||[]).includes(lo.L.ticker))bondLot(lo.L.ticker)})}catch{}},10*60000);

// ---------- satellite buildings (one instanced draw call) + rooftops + neon signs ----------
const sats=[];
// neighbourhood density = active wallets (n.active: xrpl.to 24h unique traders, fallback holders), log scale, capped per tower
const segD=(x,z,p,q)=>{const dx=q.x-p.x,dz=q.z-p.z,l=dx*dx+dz*dz||1,u=Math.max(0,Math.min(1,((x-p.x)*dx+(z-p.z)*dz)/l));return Math.hypot(p.x+u*dx-x,p.z+u*dz-z)};
const poolSegs=pools.map(p=>[N[p.a].pos,N[p.b].pos]);
E.nodes.forEach(n=>{const act=n.active!=null?n.active:n.holders!=null?n.holders/10:0;n.dens=Math.min(1,Math.log10(1+act)/3.3);
 // top holders (nightly tools/holders.py: share bands + roles only, never addresses) are the main buildings; density filler stays small
 const HB=[.1,.16,.24,.34,.46,.6],ROLEC={amm:0x3cf3ff,blackhole:0x2a2a33,exchange:0xffc23a};n.holderB=[];
 if(n.top&&n.top.length&&!n.minor){const tn=n.top.length;n.top.forEach(([b,role],j)=>{for(let tr=0;tr<8;tr++){const a=(j+tr*.37)/tn*Math.PI*2+.3,r=n.w*2.9+(j%2)*4.5+tr*1.5;const x=n.pos.x+Math.cos(a)*r,z=n.pos.z+Math.sin(a)*r,bw=1.6+b*.35,h=4+n.h*HB[b];
   if(poolSegs.some(([p,q])=>segD(x,z,p,q)<bw+2))continue;if(colliders.some(c=>Math.hypot(c.x-x,c.z-z)<c.r+bw+1))continue;
   const sb={x,z,w:bw,h,c:role?new THREE.Color(ROLEC[role]):n.col.clone().lerp(new THREE.Color(0xffffff),.15),rot:a,n,holder:{b,role,j}};sats.push(sb);n.holderB.push(sb);colliders.push({x,z,r:bw*1.02,h});break}})}
 const k=Math.round((n.name==='XRP'?70:n.minor?Math.min(14,2+12*n.dens):Math.min(56,8+48*n.dens))*LV.sats*(n.holderB.length?.6:1));
 const rnd=(s=>()=>(s=(s*1664525+1013904223)>>>0)/4294967296)([...n.name].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7));
 const span=(n.distR-n.w*2.5-2)*(1-.35*n.dens);
 for(let i=0,tries=0;i<k&&tries<k*10;tries++){const a=rnd()*Math.PI*2,r=n.w*2.5+rnd()*span;const x=n.pos.x+Math.cos(a)*r,z=n.pos.z+Math.sin(a)*r;
  const bw=1.1+rnd()*(n.minor?1.4:2.4),h=3+Math.pow(rnd(),1.6)*n.h*(n.minor?.5:n.holderB.length?.22:.55);
  if(Math.abs(Math.hypot(x,z)-81)<9)continue;if(poolSegs.some(([p,q])=>segD(x,z,p,q)<bw+2.2))continue;if(colliders.some(c=>Math.hypot(c.x-x,c.z-z)<c.r+bw+1.6))continue;
  sats.push({x,z,w:bw,h,c:n.col,rot:rnd()*Math.PI,n});colliders.push({x,z,r:bw*1.02,h});i++}});
{const segs=[];sats.forEach(s=>{let y=0,w=s.w;const ns=s.h>12?3:2;for(let j=0;j<ns;j++){const sh=s.h*(j===0?.55:.45/(ns-1));segs.push({x:s.x,z:s.z,y:y+sh/2,w,h:sh,c:s.c,rot:s.rot});y+=sh;w*=.78}s.top=y;s.topW=w});
 const im=new THREE.InstancedMesh(segGeo,bMat(0xffffff,1.6),segs.length);
 segs.forEach((s,i)=>{_m.compose(_v.set(s.x,s.y,s.z),_q.setFromAxisAngle(UPV,s.rot),_s.set(s.w,s.h,s.w));im.setMatrixAt(i,_m);im.setColorAt(i,s.c)});S.add(im);
 const ac=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:0x1a2030,metalness:.7,roughness:.5,emissive:0x0a1020}),sats.length*2);let ai=0;const antG=[],padG=[],blink=[];
 sats.forEach(s=>{for(let j=0;j<2;j++){_m.compose(_v.set(s.x+(rnd()-.5)*s.topW,s.top+.3,s.z+(rnd()-.5)*s.topW),_q.setFromAxisAngle(UPV,s.rot),_s.set(.5+rnd()*.5,.6,.5+rnd()*.4));ac.setMatrixAt(ai++,_m)}
  if(rnd()<.35){antG.push(s);blink.push(s.x,s.top+s.h*.25+.6,s.z)}else if(rnd()<.3)padG.push(s)});ac.count=ai;S.add(ac);
 const ant=new THREE.InstancedMesh(new THREE.CylinderGeometry(.05,.07,1,3),new THREE.MeshBasicMaterial({color:0x8899bb}),Math.max(1,antG.length));antG.forEach((s,i)=>{_m.compose(_v.set(s.x,s.top+s.h*.125,s.z),_q.identity(),_s.set(1,s.h*.25,1));ant.setMatrixAt(i,_m)});ant.count=antG.length;S.add(ant);
 const bg=new THREE.BufferGeometry();bg.setAttribute('position',new THREE.Float32BufferAttribute(blink,3));const bm=glowMat(0xff3030,2.2);S.add(new THREE.Points(bg,bm));anim.push(t=>bm.opacity=Math.sin(t*2.6)>.3?1:.15);
 const pad=new THREE.InstancedMesh(new THREE.RingGeometry(.55,.7,20).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:0xffffff,side:2}),Math.max(1,padG.length));padG.forEach((s,i)=>{_m.compose(_v.set(s.x,s.top+.05,s.z),_q.identity(),_s.set(s.topW,1,s.topW));pad.setMatrixAt(i,_m)});pad.count=padG.length;S.add(pad);
 const signs=sats.filter(()=>rnd()<.45);const sg=new THREE.InstancedMesh(new THREE.BoxGeometry(.25,1,.9),new THREE.MeshBasicMaterial({color:0xffffff}),Math.max(1,signs.length));
 const NEON=[0xff2bd6,0x00e5ff,0xffd166,0x66ff99,0xff5a1a];signs.forEach((s,i)=>{const a=s.rot+Math.PI/4;const hh=Math.min(6,s.h*.35);_m.compose(_v.set(s.x+Math.cos(a)*s.w*.95,s.h*.35+hh/2,s.z-Math.sin(a)*s.w*.95),_q.setFromAxisAngle(UPV,a),_s.set(1,hh,1));sg.setMatrixAt(i,_m);sg.setColorAt(i,new THREE.Color(NEON[i%NEON.length]).multiplyScalar(.9))});sg.count=signs.length;S.add(sg)}

await stage(0.45,'Igniting districts');
// ---------- fire / inferno / ice ----------
function fireFX(n){const lvl=n.th.fire,cnt=Math.round((lvl===2?2400:900)*(LV.fx)),geo=new THREE.BufferGeometry(),life=new Float32Array(cnt).map(()=>Math.random()),seed=new Float32Array(cnt).map(()=>Math.random());
 geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3));const fp=new THREE.Points(geo,glowMat(lvl===2?0xff3a0a:0xff7a20,lvl===2?2.8:2));fp.frustumCulled=false;n.group.add(fp);
 const ec=lvl===2?500:260,eg=new THREE.BufferGeometry(),el=new Float32Array(ec).map(()=>Math.random());eg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(ec*3),3));const emb=new THREE.Points(eg,glowMat(0xffb040,1.1));emb.frustumCulled=false;n.group.add(emb);
 const fl=new THREE.PointLight(0xff4400,lvl===2?1100:450,110,1.5);fl.position.y=n.h+4;n.group.add(fl);
 if(lvl===2){const sh=new THREE.Mesh(new THREE.ConeGeometry(n.w*2.4,n.h*1.4,32,10,true),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:2,uniforms:{t:U.t},
  vertexShader:`uniform float t;varying vec2 vu;void main(){vu=uv;vec3 p=position;p.x+=sin(p.y*.4+t*9.)*.6;p.z+=cos(p.y*.5+t*7.)*.6;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
  fragmentShader:`uniform float t;varying vec2 vu;void main(){float a=(1.-vu.y)*.16*(.6+.4*sin(vu.x*40.+t*12.+vu.y*20.));gl_FragColor=vec4(1.,.35,.08,a);}`}));sh.position.y=n.h*.85;n.group.add(sh)}
 const H=n.h,Wd=n.w;anim.push((t,dt)=>{const a=geo.attributes.position;for(let i=0;i<cnt;i++){life[i]+=dt*(lvl===2?.95:.65)*(.6+seed[i]*.8);if(life[i]>1)life[i]-=1;const l=life[i];
   const r=Wd*(lvl===2?1.35:.95)*(1.15-l*.95)*(.25+seed[i]*.75),an=seed[i]*40+t*(lvl===2?3.2:1.6)+l*3;a.setXYZ(i,Math.cos(an)*r,H*.93+l*(lvl===2?34:20)+Math.sin(t*9+i)*.4,Math.sin(an)*r)}a.needsUpdate=true;
  const b=eg.attributes.position;for(let i=0;i<ec;i++){el[i]+=dt*.12*(lvl===2?1.6:1);if(el[i]>1)el[i]-=1;const l=el[i],an=i*2.4+l*4,rr=Wd*1.2+l*25+Math.sin(i)*6;b.setXYZ(i,Math.cos(an)*rr,H*.6+l*(lvl===2?120:80),Math.sin(an)*rr)}b.needsUpdate=true;
  fl.intensity=(lvl===2?1100:450)*(.7+.5*Math.random())})}
function iceFX(n){const sh=new THREE.Mesh(new THREE.IcosahedronGeometry(n.w*2,1),new THREE.MeshBasicMaterial({color:0x6ab8ff,wireframe:true,transparent:true,opacity:.28}));sh.position.y=n.h*.55;n.group.add(sh);
 const cr=new THREE.Mesh(new THREE.OctahedronGeometry(n.w*.9,0),new THREE.MeshBasicMaterial({color:0xbfe8ff,transparent:true,opacity:.85}));cr.position.y=n.top+n.w;n.group.add(cr);
 const bolts=[...Array(4)].map(()=>{const l=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xbfeaff,transparent:true}));l.frustumCulled=false;n.group.add(l);return l});
 const sc=300,sg=new THREE.BufferGeometry(),sp=new Float32Array(sc*3);for(let i=0;i<sc;i++){const a=Math.random()*6.28,r=n.w*2+Math.random()*30;sp.set([Math.cos(a)*r,Math.random()*n.h,Math.sin(a)*r],i*3)}sg.setAttribute('position',new THREE.BufferAttribute(sp,3));const snow=new THREE.Points(sg,glowMat(0xcfeeff,.9));n.group.add(snow);
 anim.push((t,dt)=>{sh.rotation.y+=dt*.25;sh.rotation.x+=dt*.07;cr.rotation.y+=dt*.8;cr.position.y=n.top+n.w+Math.sin(t*1.5)*1.2;snow.rotation.y+=dt*.05;
  bolts.forEach(b=>{if(Math.random()<.12){const p=[];let y=n.h*(.2+Math.random()*.7),a=Math.random()*6.28;for(let k=0;k<9;k++){p.push(new THREE.Vector3(Math.cos(a)*n.w*(1+k*.22),y+(Math.random()*3-1.2),Math.sin(a)*n.w*(1+k*.22)));a+=Math.random()*.5-.25}b.geometry.setFromPoints(p);b.visible=Math.random()<.7}})})}
E.nodes.forEach(n=>{if(n.th.fire)fireFX(n);if(n.th.ice)iceFX(n)});

await stage(0.55,'Building pool bridges');
// ---------- bridges (AMM pools): locked = solid cyan light-road, unlocked = thin flickering scaffold rails ----------
const maxT=Math.max(...pools.map(p=>p.tvl_xrp));const bridges=[];const rankT=[...pools].sort((a,b)=>b.tvl_xrp-a.tvl_xrp);
pools.forEach((p,i)=>{const A=N[p.a],B=N[p.b];const a=A.pos.clone().setY(Math.min(A.h*.4,40)),b=B.pos.clone().setY(Math.min(B.h*.4,40));
 const mid=a.clone().add(b).multiplyScalar(.5);mid.y=Math.max(a.y,b.y)+8+a.distanceTo(b)*.1+(i%3)*3;
 const curve=new THREE.QuadraticBezierCurve3(a,mid,b);const share=Math.sqrt(p.tvl_xrp/maxT),r=.18+2.1*share,L=p.locked_pct/100,minor=p.tvl_xrp<100;const g=new THREE.Group();S.add(g);const b0={rail:1,pulse:0};const lite=TIER==='low'&&rankT.indexOf(p)>=12;
 const solid=new THREE.Mesh(new THREE.TubeGeometry(curve,64,r,8),new THREE.MeshBasicMaterial({color:new THREE.Color(0x3cf3ff).multiplyScalar(.15+.95*L),transparent:true,opacity:minor?.25:.18+.75*L,depthWrite:false,blending:THREE.AdditiveBlending}));
 solid.userData={kind:'bridge',pool:p};g.add(solid);pick.push(solid);
 const core=new THREE.Mesh(new THREE.TubeGeometry(curve,64,Math.max(.06,r*.28),5),new THREE.MeshBasicMaterial({color:0xe8ffff,transparent:true,opacity:minor?.3:.35+.65*L}));g.add(core);b0.solid=solid;b0.core=core;
 if(L<.999&&!lite){const colU=L<.3?0xff3b2f:0xffb000,pts=curve.getPoints(48),side=new THREE.Vector3(),rail=[[],[]],ties=[],flk=[];
  pts.forEach((q,k)=>{side.crossVectors(curve.getTangent(k/48),UPV).normalize().multiplyScalar(r+.9);const l=q.clone().add(side),rr=q.clone().sub(side);l.y-=r*.6;rr.y-=r*.6;rail[0].push(l);rail[1].push(rr);if(k%2===0)ties.push(l,rr)});
  const op=(minor?.12:.25+.45*share)*(1-L)+.05;rail.forEach(rp=>{const m=new THREE.LineBasicMaterial({color:colU,transparent:true,opacity:op});g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rp),m));flk.push({m,op})});
  const tm=new THREE.LineBasicMaterial({color:colU,transparent:true,opacity:op*.7});g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ties),tm));flk.push({m:tm,op:op*.7});
  const ph=Math.random()*10,u=1-L,b=b0;b0.flk=flk;anim.push(t=>flk.forEach(f=>f.m.opacity=f.op*b.rail*(.72+.28*Math.sin(t*(1.6+u*1.6)+ph))))}
 if(!minor&&!lite)for(let k=1;k<4;k++){const q=curve.getPoint(k/4);const py=new THREE.Mesh(new THREE.CylinderGeometry(.25,.45,q.y,6),new THREE.MeshStandardMaterial({color:0x10172a,metalness:.9,roughness:.4,emissive:L>=.7?0x0a3a40:0x2a1a05}));py.position.set(q.x,q.y/2,q.z);g.add(py)}
 const term=new THREE.Group();const tp=A.pos.clone().add(b.clone().sub(a).setY(0).normalize().multiplyScalar(A.w*2.25));term.position.set(tp.x,0,tp.z);
 const sc=L>=.7?0x3cf3ff:L>=.3?0xffb000:0xff3b2f;const kiosk=new THREE.Mesh(new THREE.BoxGeometry(.9,2.2,.5),new THREE.MeshStandardMaterial({color:0x0b1222,metalness:.8,roughness:.3,emissive:sc,emissiveIntensity:.12}));kiosk.position.y=1.1;if(!lite)term.add(kiosk);
 const scr=new THREE.Mesh(new THREE.PlaneGeometry(.8,.6),new THREE.MeshBasicMaterial({color:sc}));scr.position.set(0,1.6,.26);if(!lite)term.add(scr);term.lookAt(b.x,0,b.z);S.add(term);
 const th=new THREE.Mesh(new THREE.BoxGeometry(1.4,3,1.4),new THREE.MeshBasicMaterial({visible:false}));th.position.y=1.5;th.userData={kind:'terminal',pool:p};term.add(th);pick.push(th);
 bridges.push(Object.assign(b0,{p,curve,r,L,minor,group:g,term,share,Lv:L}))});

// ---------- Forever Rails: metallic rails + gold edge glow along both sides of every bridge; coverage = LP locked in blackholed wallets ----------
// ONE merged mesh for all bridges (per-vertex bridge index + arc position; shader clips at b.Lv, so live lockFX animates the rails extending).
// Pools >=99% locked: FOREVER plaque at each terminal (one instanced draw) + subtle gold pulse.
{const SEG=TIER==='low'?24:MOBILE?36:56,geos=[],NB=Math.min(bridges.length,64);
 const LV0=Math.log10(10),LVM=Math.log10(Math.max(100,...bridges.map(b=>b.p.tvl_xrp*b.L))),covOf=b=>{const lv=b.p.tvl_xrp*b.Lv;return lv<10?0:Math.min(1,(Math.log10(lv)-LV0)/(LVM-LV0))};bridges.forEach(b=>{b.lockedXrp=b.p.tvl_xrp*b.L;b.forever=b.lockedXrp>=10000&&b.L>0});
 bridges.slice(0,NB).forEach((b,bi)=>{if(b.minor||b.L<=0)return;const side=new THREE.Vector3();for(const sd of [-1,1]){const pts=[];for(let k=0;k<=SEG;k++){const u=k/SEG,q=b.curve.getPoint(u);side.crossVectors(b.curve.getTangent(u),UPV).normalize().multiplyScalar(sd*(b.r+1.1));pts.push(q.add(side).setY(q.y-b.r*.35))}
   const tg=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),SEG,.14+.42*covOf(b),5,false);const n=tg.attributes.position.count,ba=new Float32Array(n).fill(bi);tg.setAttribute('bi',new THREE.BufferAttribute(ba,1));geos.push(tg)}});
 if(geos.length){const cov=new Float32Array(64),glow=new Float32Array(64);
  const m=new THREE.ShaderMaterial({uniforms:{cov:{value:cov},forever:{value:glow},t:U.t,...THREE.UniformsUtils.merge([THREE.UniformsLib.fog])},fog:true,
   vertexShader:'attribute float bi;varying vec2 vU;varying float vB;varying vec3 vN;\n#include <fog_pars_vertex>\nvoid main(){vU=uv;vB=bi;vN=normalize(normalMatrix*normal);vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
   fragmentShader:'uniform float cov[64];uniform float forever[64];uniform float t;varying vec2 vU;varying float vB;varying vec3 vN;\n#include <fog_pars_fragment>\nvoid main(){int i=int(vB+.5);float c=cov[i];if(vU.x>c)discard;float rim=pow(1.-abs(vN.z),2.);float spec=pow(max(0.,vN.y),6.);'+
    'vec3 steel=vec3(.22,.24,.28)+vec3(.5)*spec;float tip=smoothstep(.04,0.,c-vU.x)*step(c,.999);float fv=floor(forever[i]+.0001);float lp=fract(forever[i]+.0001)*1000.;float pul=fv*(.5+.5*sin(t*1.6-vU.x*6.));vec3 gold=vec3(.85,.5,.04)*((.3+rim*.9)*(.45+.4*lp+.15*pul)+tip*.6);vec3 col=steel*.35+gold;float L=dot(col,vec3(.299,.587,.114));col*=min(1.,.46/max(L,1e-3));gl_FragColor=vec4(col,1.);\n#include <fog_fragment>\n}'});
  const mesh=new THREE.Mesh(mergeGeometries(geos),m);mesh.frustumCulled=false;S.add(mesh);
  anim.push(()=>{for(let i=0;i<NB;i++){const b=bridges[i];const c=covOf(b);cov[i]=c>=.995?1.01:c;glow[i]=(b.forever?1:0)+Math.min(1,b.Lv)*.001}});}
 // FOREVER plaques
 const fv=bridges.filter(b=>b.forever&&!b.minor);if(fv.length){const cv=document.createElement('canvas');cv.width=256;cv.height=96;const x=cv.getContext('2d');x.fillStyle='#1a1205';x.fillRect(0,0,256,96);x.strokeStyle='#ffc64a';x.lineWidth=6;x.strokeRect(4,4,248,88);x.fillStyle='#ffd77a';x.font='900 44px system-ui,sans-serif';x.textAlign='center';x.fillText('∞ FOREVER',128,64);
  const pm=new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),side:THREE.DoubleSide,toneMapped:false}),fv.length*2);let k=0;
  fv.forEach(b=>{for(const [A,B] of [[N[b.p.a],N[b.p.b]],[N[b.p.b],N[b.p.a]]]){const d=B.pos.clone().sub(A.pos).setY(0).normalize(),tp=A.pos.clone().addScaledVector(d,A.w*2.25);_m.compose(_v.set(tp.x,3.3,tp.z),_q.setFromAxisAngle(UPV,Math.atan2(d.x,d.z)),_s.set(1,1,1));pm.setMatrixAt(k++,_m)}});
  pm.count=k;S.add(pm);anim.push(t=>pm.material.color.setScalar(.5+.08*Math.sin(t*1.6)))}}

// ---------- hover cars on 3 altitude lanes (count & speed ~ 24h volume) ----------
const vol=n=>n.name==='XRP'?null:(n.vol24h??null);const lanes=[];
bridges.forEach(b=>{const vs=[vol(N[b.p.a]),vol(N[b.p.b])].filter(v=>v!=null);const v=vs.length?Math.min(...vs):b.p.tvl_xrp*.02;b.vol=v;b.volEst=!vs.length;
 const k=Math.max(1,Math.round((b.minor?1:2)+6*Math.log10(1+v)/3.5));for(let i=0;i<k;i++)lanes.push({b,u:Math.random(),dir:i%2?1:-1,alt:2+(i%3)*3.2,side:(i%2?1:-1)*(b.r+1.4),sp:(.018+.05*Math.min(1,Math.log10(1+v)/5))*(.8+Math.random()*.4)/Math.max(.5,b.curve.getLength()/150)})});
lanes.length=Math.min(lanes.length,LV.cars);
// ---------- pool activity colouring: percentile of (24h volume + live trades), calm blue -> purple -> orange -> fire red; busier = faster pulse ----------
const WHITE_C=new THREE.Color(0xffffff);const ACT_STOPS=[[0,new THREE.Color(0x2f7bff)],[.45,new THREE.Color(0x9a4bff)],[.75,new THREE.Color(0xff8a2a)],[1,new THREE.Color(0xff3d14)]];
function actColor(a,out){for(let i=1;i<ACT_STOPS.length;i++)if(a<=ACT_STOPS[i][0]){const [a0,c0]=ACT_STOPS[i-1],[a1,c1]=ACT_STOPS[i];return out.copy(c0).lerp(c1,(a-a0)/(a1-a0))}return out.copy(ACT_STOPS[3][1])}
function actScore(){const sc=bridges.map(b=>Math.log10(1+Math.min(b.vol||0,Math.max(1,b.p.tvl_xrp)*3)+(b.liveVol||0)*6));const ord=sc.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]),n=Math.max(1,ord.length-1);
 ord.forEach(([v,i],r)=>{const b=bridges[i];b.act=r/n;b.actCol=actColor(b.act,b.actCol||new THREE.Color());if(b.solid)bridgeLook(b)})}
let actDirty=0;setInterval(()=>{bridges.forEach(b=>{if(b.liveVol)b.liveVol*=.93});if(actDirty){actDirty=0;actScore()}},10000);

const cars=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.32,1.3,3,8).rotateZ(Math.PI/2),new THREE.MeshStandardMaterial({color:0x1a2236,metalness:.9,roughness:.25,emissive:0x0a1430}),lanes.length);cars.frustumCulled=false;S.add(cars);
const carLG=new THREE.BufferGeometry();carLG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(lanes.length*6),3));const carC=new Float32Array(lanes.length*6);lanes.forEach((l,i)=>carC.set([1,.95,.85,1,.12,.1],i*6));carLG.setAttribute('color',new THREE.BufferAttribute(carC,3));
const carL=new THREE.Points(carLG,glowMat(0xffffff,1.6,{vertexColors:true}));carL.frustumCulled=false;S.add(carL);const _q2=new THREE.Quaternion().setFromAxisAngle(UPV,Math.PI/2);
function updCars(dt){const P=carLG.attributes.position;lanes.forEach((l,i)=>{l.u=(l.u+l.sp*dt*l.dir+1)%1;const c=l.b.curve;c.getPoint(l.u,_v);c.getTangent(l.u,_t);if(l.dir<0)_t.negate();_s.crossVectors(_t,UPV).normalize();
 _v.addScaledVector(_s,l.side);_v.y+=l.alt;_m.lookAt(_t,ORIGIN,UPV);_q.setFromRotationMatrix(_m).multiply(_q2);_m.compose(_v,_q,_one);cars.setMatrixAt(i,_m);
 P.setXYZ(i*2,_v.x+_t.x*.95,_v.y+_t.y*.95,_v.z+_t.z*.95);P.setXYZ(i*2+1,_v.x-_t.x*.95,_v.y-_t.y*.95,_v.z-_t.z*.95)});cars.instanceMatrix.needsUpdate=true;P.needsUpdate=true}

await stage(0.65,'Streets & traffic');
// ---------- streets: district ring roads + hub avenues, ground traffic, street lights ----------
const streets=[];E.nodes.filter(n=>!n.minor).forEach(n=>streets.push({type:'ring',c:n.pos,r:n.name==='XRP'?40:n.distR*.62},{type:'ring',c:n.pos,r:n.name==='XRP'?62:n.distR*.98}));
CORE.filter(c=>N[c]).forEach(c=>{const n=N[c];streets.push({type:'line',a:new THREE.Vector3(Math.cos(n.ang)*62,0,Math.sin(n.ang)*62),b:new THREE.Vector3(Math.cos(n.ang),0,Math.sin(n.ang)).multiplyScalar(RING-n.distR*.98)})});
const roadM=new THREE.MeshBasicMaterial({color:0x0c1830,transparent:true,opacity:.9,depthWrite:false});
streets.forEach(s=>{if(s.type==='line'){const len=s.a.distanceTo(s.b);const m=new THREE.Mesh(new THREE.PlaneGeometry(4.6,len),roadM);m.rotation.order='YXZ';m.rotation.y=Math.atan2(s.b.x-s.a.x,s.b.z-s.a.z);m.rotation.x=-Math.PI/2;m.position.copy(s.a).lerp(s.b,.5).setY(.1);S.add(m)}
 else{const m=new THREE.Mesh(new THREE.RingGeometry(s.r-2,s.r+2,96),roadM);m.rotation.x=-Math.PI/2;m.position.copy(s.c).setY(.09);S.add(m)}});
// ---------- arena gates: portals to the multiplayer arena, standing on real hub avenues ----------
{const av=streets.filter(s=>s.type==='line').slice(0,2),AR=[['tron','Light Cycles',0x3cf3ff],['zombie','Zombie Survival',0xff5a1f]];
 av.forEach((s,i)=>{const [m,label,col]=AR[i],p=s.a.clone().lerp(s.b,.5),g=new THREE.Group();g.position.copy(p);g.rotation.y=Math.atan2(s.b.x-s.a.x,s.b.z-s.a.z);
  const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.9}),ring=new THREE.Mesh(new THREE.TorusGeometry(3.4,.28,8,40),mat);ring.position.y=3.6;g.add(ring);
  const core=new THREE.Mesh(new THREE.CircleGeometry(3.1,32),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));core.position.y=3.6;g.add(core);
  const hitA=new THREE.Mesh(new THREE.BoxGeometry(7,8,3),new THREE.MeshBasicMaterial({visible:false}));hitA.position.y=4;hitA.userData={kind:'arena',arena:m,label};g.add(hitA);pick.push(hitA);
  anim.push(t=>{ring.rotation.z=t*.8;core.material.opacity=.14+.1*Math.sin(t*3+i)});S.add(g);
  const el=document.createElement('div');el.className='lbl';el.style.setProperty('--c','#'+new THREE.Color(col).getHexString());el.textContent='🎮 '+label+' Arena';$('labels').appendChild(el);labelEls.push({el,pos:p.clone().setY(9),pri:4e3,minor:false})})}
const gT=[],SLp=[];streets.forEach(s=>{const len=s.type==='ring'?2*Math.PI*s.r:s.a.distanceTo(s.b);const k=Math.round(len/(MOBILE?12:7));for(let i=0;i<k;i++)gT.push({s,u:Math.random(),d:i%2?1:-1,sp:(6+Math.random()*5)/len});
 const nl=Math.round(len/16);for(let i=0;i<nl;i++){const u=i/nl;SLp.push(s.type==='ring'?new THREE.Vector3(s.c.x+Math.cos(u*6.283)*(s.r+2.1),0,s.c.z+Math.sin(u*6.283)*(s.r+2.1)):s.a.clone().lerp(s.b,u).add(_v.set(s.b.z-s.a.z,0,s.a.x-s.b.x).setLength(2.1)))}});
const gtG=new THREE.BufferGeometry();gtG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(gT.length*3),3));const gtc=new Float32Array(gT.length*3);gT.forEach((g,i)=>gtc.set(g.d>0?[1,.9,.75]:[1,.15,.1],i*3));gtG.setAttribute('color',new THREE.BufferAttribute(gtc,3));
const gtP=new THREE.Points(gtG,glowMat(0xffffff,1.3,{vertexColors:true}));gtP.frustumCulled=false;S.add(gtP);
function updGround(dt){const P=gtG.attributes.position;gT.forEach((g,i)=>{g.u=(g.u+g.sp*dt*g.d+1)%1;const s=g.s;if(s.type==='ring'){const a=g.u*6.283,rr=s.r+(g.d>0?.6:-.6);P.setXYZ(i,s.c.x+Math.cos(a)*rr,.45,s.c.z+Math.sin(a)*rr)}else{_v.copy(s.a).lerp(s.b,g.u);P.setXYZ(i,_v.x+(g.d>0?.6:-.6),.45,_v.z)}});P.needsUpdate=true}
{const pole=new THREE.InstancedMesh(new THREE.CylinderGeometry(.06,.09,4,4),new THREE.MeshStandardMaterial({color:0x222a3a,metalness:.8}),SLp.length);const lp=[];SLp.forEach((p,i)=>{_m.makeTranslation(p.x,2,p.z);pole.setMatrixAt(i,_m);lp.push(p.x,4.1,p.z)});S.add(pole);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));S.add(new THREE.Points(g,glowMat(0xffe2b0,2.2)))}

// ---------- bioluminescent parks + fireflies ----------
{const parks=[];CORE.filter(c=>N[c]).forEach((c,i,arr)=>{const a=N[c].ang+Math.PI/arr.length;parks.push(new THREE.Vector3(Math.cos(a)*RING,0,Math.sin(a)*RING))});
 for(let i=0;i<6;i++){const a=i/6*6.283+.3;parks.push(new THREE.Vector3(Math.cos(a)*103,0,Math.sin(a)*103))}
 const trees=[];parks.forEach(pk=>{for(let i=0;i<LV.trees/parks.length;i++){const a=rnd()*6.283,r=Math.sqrt(rnd())*20;const x=pk.x+Math.cos(a)*r,z=pk.z+Math.sin(a)*r;
  if(Math.abs(Math.hypot(x,z)-81)<8)continue;if(colliders.some(c=>Math.hypot(c.x-x,c.z-z)<c.r+1))continue;trees.push({x,z,h:2+rnd()*4})}});
 const PAL=[0x00ffc8,0xff3df2,0x7dff3a,0x38b6ff,0xb06bff];
 const trunk=new THREE.InstancedMesh(new THREE.CylinderGeometry(.08,.16,1,5),new THREE.MeshStandardMaterial({color:0x1a1030,emissive:0x100820}),trees.length);
 const can=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:.75}),trees.length);
 trees.forEach((t,i)=>{_m.compose(_v.set(t.x,t.h/2,t.z),_q.identity(),_s.set(1,t.h,1));trunk.setMatrixAt(i,_m);const s=.45+rnd()*.5;_m.compose(_v.set(t.x,t.h+s*.8,t.z),_q.identity(),_s.set(s,s*1.7,s));can.setMatrixAt(i,_m);can.setColorAt(i,new THREE.Color(PAL[i%PAL.length]).multiplyScalar(.2+rnd()*.3));colliders.push({x:t.x,z:t.z,r:.4,h:t.h})});
 S.add(trunk,can);
 const fc=Math.round(500*Math.max(.25,LV.fx)),ff=new THREE.BufferGeometry(),fo=[];for(let i=0;i<fc;i++){const pk=parks[i%parks.length];fo.push([pk.x+(rnd()-.5)*40,1+rnd()*6,pk.z+(rnd()-.5)*40,rnd()*6])}
 ff.setAttribute('position',new THREE.BufferAttribute(new Float32Array(fc*3),3));const ffm=glowMat(0xc8ff6a,.9);const ffp=new THREE.Points(ff,ffm);ffp.frustumCulled=false;S.add(ffp);
 anim.push(t=>{const a=ff.attributes.position;fo.forEach((o,i)=>a.setXYZ(i,o[0]+Math.sin(t*.5+o[3])*2,o[1]+Math.sin(t*.9+o[3]*2)*.8,o[2]+Math.cos(t*.4+o[3])*2));a.needsUpdate=true;ffm.opacity=.6+.4*Math.sin(t*1.3)})}

// ---------- elevated monorail loop ----------
{const pts=[];for(let i=0;i<64;i++){const a=i/64*6.283;pts.push(new THREE.Vector3(Math.cos(a)*96,26+Math.sin(a*3)*3,Math.sin(a)*96))}const loop=new THREE.CatmullRomCurve3(pts,true);
 S.add(new THREE.Mesh(new THREE.TubeGeometry(loop,256,.45,6,true),new THREE.MeshStandardMaterial({color:0x111a2c,metalness:.9,roughness:.3,emissive:0x0a2a40})));
 S.add(new THREE.Mesh(new THREE.TubeGeometry(loop,256,.08,4,true),new THREE.MeshBasicMaterial({color:0x7ee0ff})));
 const pyG=new THREE.CylinderGeometry(.35,.6,1,6),pyM=new THREE.MeshStandardMaterial({color:0x10172a,metalness:.9,roughness:.4});for(let i=0;i<32;i++){const p=loop.getPoint(i/32);const py=new THREE.Mesh(pyG,pyM);py.scale.y=p.y;py.position.set(p.x,p.y/2,p.z);S.add(py);colliders.push({x:p.x,z:p.z,r:.7,h:p.y})}
 const train=new THREE.InstancedMesh(new THREE.CapsuleGeometry(.9,3.6,4,10).rotateZ(Math.PI/2),bMat(0x7ee0ff,3),6);train.frustumCulled=false;S.add(train);
 anim.push(t=>{for(let i=0;i<6;i++){const u=((t*.012)+i*.0075)%1;loop.getPoint(u,_v);loop.getTangent(u,_t);_v.y+=1.2;_m.lookAt(_t,ORIGIN,UPV);_q.setFromRotationMatrix(_m).multiply(_q2);_m.compose(_v,_q,_one);train.setMatrixAt(i,_m)}train.instanceMatrix.needsUpdate=true})}

// ---------- holographic billboards (ticker per core token) ----------
function billTex(n){const c=document.createElement('canvas');c.width=512;c.height=256;const x=c.getContext('2d');const hex='#'+n.col.getHexString();
 x.fillStyle='rgba(4,10,24,.55)';x.fillRect(0,0,512,256);x.strokeStyle=hex;x.lineWidth=6;x.strokeRect(6,6,500,244);x.shadowColor=hex;x.shadowBlur=18;
 x.fillStyle='#fff';x.font='bold 64px monospace';x.fillText(n.name==='XRP'?'XRP':'$'+n.name,24,78);x.font='30px monospace';x.fillStyle='#cfe8ff';x.fillText(n.name==='XRP'?'LEDGER HUB · '+pools.filter(p=>p.a==='XRP'||p.b==='XRP').length+' pools':fmt(n.price_xrp,n.price_xrp<1?12:4)+' XRP',24,130);
 x.fillStyle=n.pro24h==null?'#888':n.pro24h>=0?'#3dff8a':'#ff4a4a';x.fillText(n.name==='XRP'?'MOOD '+pct(MOOD):'24h '+pct(n.pro24h),24,176);x.fillStyle='#7ee0ff';x.fillText('TVL '+fmt(n.tvl)+' XRP',24,222);
 for(let y=0;y<256;y+=4){x.fillStyle='rgba(0,0,0,.18)';x.fillRect(0,y,512,1)}return new THREE.CanvasTexture(c)}
const moodTok=E.nodes.filter(n=>n.pro24h!=null&&n.name!=='XRP'&&n.name!=='RLUSD');const MOOD=moodTok.reduce((s,n)=>s+n.pro24h*n.tvl,0)/Math.max(1,moodTok.reduce((s,n)=>s+n.tvl,0));
E.nodes.filter(n=>!n.minor).forEach(n=>{const out=n.name==='XRP'?new THREE.Vector3(1,0,1).normalize():n.pos.clone().setY(0).normalize();const m=new THREE.Mesh(new THREE.PlaneGeometry(20,10),new THREE.MeshBasicMaterial({map:billTex(n),transparent:true,side:2,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.9}));
 m.position.copy(n.pos).addScaledVector(out,n.w*1.9+3).setY(Math.min(n.h*.5,48));m.lookAt(m.position.clone().add(out));m.userData={kind:'billboard',node:n};S.add(m);pick.push(m);const ph=Math.random()*9;anim.push(t=>m.material.opacity=Math.random()<.01?.3:.82+.12*Math.sin(t*2+ph))});

// ---------- searchlights, steam vents, drones, freighter airship ----------
const search=[];const SL=[['XRP',0x9fd8ff],['BURN',0xffa060],['IMM',0x8fc8ff],['BCHAMP',0xffd59a],['666',0xd08cff]].slice(0,TIER==='low'?2:5);
const lampGeo=new THREE.CylinderGeometry(.9,1.2,1.4,10),lampM=new THREE.MeshStandardMaterial({color:0x1a2030,metalness:.9,roughness:.35}),lensGeo=new THREE.CircleGeometry(.85,14);
const beamGeo=new THREE.CylinderGeometry(.85,14,240,20,1,true).translate(0,120,0);
SL.forEach(([k,c],i)=>{const n=N[k];if(!n||n.roofY==null)return;const g=new THREE.Group();const off=n.roofCw*.55;
 // lamp sits on the roof deck beside the spire; beam origin = lens centre
 g.position.set(n.pos.x+off,n.roofY+.7,n.pos.z);S.add(g);
 const base=new THREE.Mesh(lampGeo,lampM);g.add(base);const head=new THREE.Group();head.position.y=.7;g.add(head);
 const lens=new THREE.Mesh(lensGeo,new THREE.MeshBasicMaterial({color:c}));lens.rotation.x=-Math.PI/2;lens.position.y=.01;head.add(lens);
 const cone=new THREE.Mesh(beamGeo,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:2,uniforms:{c:{value:new THREE.Color(c)},wet:U.wet,day:U.day},
  vertexShader:`varying float y;void main(){y=clamp(position.y/240.,0.,1.);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform vec3 c;uniform float wet,day;varying float y;void main(){float f=1.-y;float a=f*f*(.08+.04*wet)*clamp(1.-day*1.6,0.,1.);gl_FragColor=vec4(c*clamp(a,0.,.2),clamp(a,0.,.2));}`}));
 cone.frustumCulled=false;head.add(cone);
 search.push(t=>{const vis=U.day.value<.6;cone.visible=vis;head.rotation.z=.4*Math.sin(t*.21+i*2);head.rotation.x=.4*Math.cos(t*.15+i)})});
const steam=(()=>{const spots=sats.filter(()=>rnd()<.06);const cnt=Math.max(1,spots.length)*14,g=new THREE.BufferGeometry(),l=new Float32Array(cnt).map(()=>Math.random());g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3));
 const pts=new THREE.Points(g,glowMat(0x8090a8,5,{blending:THREE.NormalBlending,opacity:.12}));pts.frustumCulled=false;S.add(pts);return dt=>{if(!spots.length)return;const a=g.attributes.position;for(let i=0;i<cnt;i++){l[i]+=dt*.25;if(l[i]>1)l[i]=0;const s=spots[i%spots.length];a.setXYZ(i,s.x+Math.sin(i+l[i]*3)*l[i]*2,s.top+l[i]*9,s.z+Math.cos(i)*l[i]*2)}a.needsUpdate=true}})();
const drones=(()=>{const D=[];CORE.concat('XRP').filter(c=>N[c]).forEach(c=>{for(let i=0;i<(MOBILE?3:6);i++)D.push({n:N[c],r:N[c].w*2.6+i*1.5,y:N[c].h*(.3+rnd()*.6),sp:(.3+rnd()*.5)*(i%2?1:-1),ph:rnd()*6})});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(D.length*3),3));const m=glowMat(0xaaffff,1.4);const p=new THREE.Points(g,m);p.frustumCulled=false;S.add(p);
 return t=>{const a=g.attributes.position;D.forEach((d,i)=>a.setXYZ(i,d.n.pos.x+Math.cos(t*d.sp+d.ph)*d.r,d.y+Math.sin(t*2+i)*.6,d.n.pos.z+Math.sin(t*d.sp+d.ph)*d.r));a.needsUpdate=true;m.opacity=.6+.4*Math.sin(t*8)}})();
const freighter=(()=>{const g=new THREE.Group();const hm=new THREE.MeshStandardMaterial({color:0x151c2c,metalness:.8,roughness:.35,emissive:0x05080f});const hull=new THREE.Mesh(new THREE.SphereGeometry(1,24,12),hm);hull.scale.set(26,5.5,7);g.add(hull);
 const fin=new THREE.Mesh(new THREE.BoxGeometry(6,6,.4),hm);fin.position.set(-22,4,0);g.add(fin);const gon=new THREE.Mesh(new THREE.BoxGeometry(12,2.4,4),hm);gon.position.y=-5.5;g.add(gon);
 const lp=[];for(const sgn of[1,-1])for(let i=0;i<24;i++){const x=-20+i*1.7;lp.push(x,-.5,sgn*Math.sqrt(Math.max(0,1-(x/26)**2))*7.05)}
 const lg=new THREE.BufferGeometry();lg.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));g.add(new THREE.Points(lg,glowMat(0xffd9a0,1.8)));
 const eng=new THREE.Sprite(new THREE.SpriteMaterial({map:GT,color:0x66ccff,blending:THREE.AdditiveBlending,depthWrite:false}));eng.position.set(-27,0,0);eng.scale.setScalar(9);g.add(eng);
 const bc=document.createElement('canvas');bc.width=512;bc.height=96;const bx=bc.getContext('2d');window.__blimp={bc,bx,g};bx.fillStyle='#00e5ff';bx.shadowColor='#00e5ff';bx.shadowBlur=16;bx.font='bold 50px monospace';bx.fillText('XRPL FREIGHT ◆ BURN',8,64);
 for(const sgn of[1,-1]){const ban=new THREE.Mesh(new THREE.PlaneGeometry(30,5.6),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(bc),transparent:true,side:2,blending:THREE.AdditiveBlending,depthWrite:false}));ban.position.set(0,-1,sgn*7.3);if(sgn<0)ban.rotation.y=Math.PI;g.add(ban);(window.__blimp.bans=window.__blimp.bans||[]).push(ban)}
 S.add(g);return t=>{const a=t*.035;g.position.set(Math.cos(a)*120,170+Math.sin(t*.3)*4,Math.sin(a)*120);g.rotation.y=-a}})();

// ---------- sponsored ads (xrpburn.com paid placements, via ads.js built server-side). Only real active ads; labelled "Sponsored". ----------
const ADS=((window.ADS&&window.ADS.active)||[]).filter(a=>a&&a.ticker).slice(0,8);
if(ADS.length){const BL=window.__blimp,bills=pick.filter(m=>m.userData.kind==='billboard');bills.forEach(m=>m.userData.orig=m.material.map);
 const logos={};const loadLogo=a=>{if(!a.logo_url||logos[a.ticker]!==undefined)return;logos[a.ticker]=null;const im=new Image();im.crossOrigin='anonymous';im.decoding='async';im.onload=()=>{logos[a.ticker]=im;if(ADS[ai]===a)drawAd(a)};im.onerror=()=>{logos[a.ticker]=false};im.src=a.logo_url};
 const adC=document.createElement('canvas');adC.width=512;adC.height=256;const adX=adC.getContext('2d');const adTex=new THREE.CanvasTexture(adC);
 const esc=t=>String(t||'').slice(0,40);
 function badge(x,a,cx,cy,r,col){const im=logos[a.ticker];x.save();x.beginPath();x.arc(cx,cy,r,0,7);x.closePath();if(im){x.clip();try{x.drawImage(im,cx-r,cy-r,r*2,r*2)}catch{}}else{x.fillStyle=col;x.fill();x.fillStyle='#120600';x.font=`bold ${r*.8}px monospace`;x.textAlign='center';x.textBaseline='middle';x.fillText(esc(a.ticker).slice(0,3).toUpperCase(),cx,cy+2)}x.restore()}
 function drawAd(a){const col=a.color||'#ff8a2a',x=adX;x.clearRect(0,0,512,256);x.fillStyle='rgba(16,8,2,.7)';x.fillRect(0,0,512,256);x.strokeStyle=col;x.lineWidth=6;x.strokeRect(6,6,500,244);
  x.fillStyle=col;x.fillRect(6,6,180,34);x.fillStyle='#120600';x.font='bold 22px monospace';x.fillText('SPONSORED',18,31);badge(x,a,420,120,58,col);
  x.fillStyle='#fff';x.shadowColor=col;x.shadowBlur=14;x.font='bold 58px monospace';x.fillText('$'+esc(a.ticker).slice(0,9),22,108);x.shadowBlur=0;x.font='26px monospace';x.fillStyle='#ffe2c4';x.fillText(esc(a.name).slice(0,20),22,150);
  x.fillStyle='#cfd8ef';x.font='20px monospace';x.fillText(esc(a.tagline).slice(0,30),22,186);x.fillStyle=col;x.font='bold 22px monospace';x.fillText('TRADE ON XRPBURN.COM ▸',22,228);adTex.needsUpdate=true;
  if(BL){const b=BL.bx;b.clearRect(0,0,512,96);b.save();b.fillStyle=col;b.shadowColor=col;b.shadowBlur=16;b.font='bold 20px monospace';b.fillText('SPONSORED',8,22);b.font='bold 46px monospace';b.fillText(('$'+esc(a.ticker)+' ◆ '+esc(a.name)).slice(0,19),8,74);b.restore();
   const im=logos[a.ticker];if(im)try{b.drawImage(im,440,14,68,68)}catch{};BL.bans.forEach(m=>m.material.map.needsUpdate=true)}}
 let ai=0,showAd=false;ADS.forEach(loadLogo);drawAd(ADS[0]);
 if(BL){const hit=new THREE.Mesh(new THREE.SphereGeometry(1,8,6),new THREE.MeshBasicMaterial({visible:false}));hit.scale.set(27,7,8);hit.userData={kind:'ad',get ad(){return ADS[ai]}};BL.g.add(hit);pick.push(hit)}
 // billboards alternate: 10s token stats, 6s sponsored; blimp always shows the current ad
 let next=0;anim.push(t=>{if(t<next)return;showAd=!showAd;next=t+(showAd?6:10);if(showAd){ai=(ai+1)%ADS.length;drawAd(ADS[ai])}
  bills.forEach(m=>{m.material.map=showAd?adTex:m.userData.orig;m.userData.ad=showAd?ADS[ai]:null})});}

await stage(0.78,'Weather from market mood');
// ---------- weather driven by market mood ----------
// market weather tiers: mood = TVL-weighted 24h change, share = fraction of city tokens green
const GREEN=moodTok.length?moodTok.filter(n=>n.pro24h>0).length/moodTok.length:.5;
const WTIERS={crash:['⛈','Crash · storm'],red:['🌧','Red · rain'],flat:['☁️','Flat · clouds'],green:['☀️','Green · sunny'],vgreen:['🌈','Very green · rainbow'],gold:['🪙','Whole market green · gold rush']};
const tierFor=(m,g=.5)=>m==null?'flat':(m<-4||(m<-2&&g<.25))?'crash':m<-.5?'red':m<1?'flat':(g>=.9&&m>0)?'gold':m<4?'green':'vgreen';
let moodNow=MOOD,greenNow=GREEN,moodWeather=tierFor(MOOD,GREEN);
$('mood').innerHTML=`<b>Market mood</b> <span style="color:${MOOD>=0?'#3dff8a':'#ff5a5a'}">${pct(MOOD)}</span> <span class="dim">TVL-weighted 24h change of ${moodTok.length} tokens · ${Math.round(GREEN*100)}% green</span><br>→ market weather <b>${WTIERS[moodWeather][1]}</b><br><span class="dim">&lt;−4% crash · −4…−0.5% rain · −0.5…+1% clouds · +1…+4% sunny · &gt;+4% rainbow · ≥90% of tokens green: gold rush</span>`;
const W0={rays:0,rainbow:0,coins:0};
const W={clear:{fog:.0022,rain:0,wet:0,storm:0,banks:0,...W0},fog:{fog:.0046,rain:0,wet:.25,storm:0,banks:1,...W0},rain:{fog:.0042,rain:1,wet:1,storm:.35,banks:.4,...W0},storm:{fog:.005,rain:1.6,wet:1,storm:1,banks:.6,...W0}};
Object.assign(W,{crash:{...W.storm,fog:.0056,rain:1.9},red:{...W.rain},flat:{...W.fog,fog:.0032,banks:.55,wet:.1},green:{...W.clear,rays:1},vgreen:{...W.clear,rays:.7,rainbow:1},gold:{...W.clear,rays:.8,rainbow:1,coins:1}});
let wMode='auto',wTarget=W[moodWeather];
const setW=()=>{wMode=$('weather').value;if(wMode==='auto')wTarget=W[moodWeather];else if(wMode!=='cycle')wTarget=W[wMode]};
function wchip(){const el=$('wchip');if(!el)return;const k=wMode==='auto'?moodWeather:null;el.textContent=k?`${WTIERS[k][0]} Market ${moodNow>=0?'+':''}${moodNow.toFixed(1)}% · ${WTIERS[k][1].split(' · ')[1]}`:`🌤 Weather: ${wMode} (manual)`;el.title=k?`${Math.round(greenNow*100)}% of city tokens green in 24h. Tap for weather settings.`:'Manual weather override. Tap for settings.'}
window.setMarketMood=(m,g)=>{if(m==null||!isFinite(m))return;moodNow=+m;if(g!=null&&isFinite(g))greenNow=+g;const k=tierFor(moodNow,greenNow);if(k!==moodWeather){moodWeather=k}if(wMode==='auto')wTarget=W[moodWeather];wchip()};
if(Q.get('weather'))$('weather').value=Q.get('weather');setW();$('weather').onchange=()=>{setW();wchip()};wchip();$('wchip').onclick=()=>{$('hud').classList.add('open');$('weather').focus()};let wCur={...(Q.get('weather')?wTarget:W.clear)};
const rain=(()=>{const n=LV.rain,pos=new Float32Array(n*6),tail=new Float32Array(n*2);for(let i=0;i<n;i++){const x=(Math.random()-.5)*260,y=Math.random()*140,z=(Math.random()-.5)*260;pos.set([x,y,z,x,y,z],i*6);tail[i*2+1]=1}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('tail',new THREE.BufferAttribute(tail,1));
 const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{t:U.t,cam:{value:new THREE.Vector3()},amt:{value:0}},
  vertexShader:`attribute float tail;uniform float t,amt;uniform vec3 cam;varying float a;void main(){vec3 p=position;p.y=mod(p.y-t*70.,140.);p.x=cam.x+mod(p.x-cam.x+130.,260.)-130.;p.z=cam.z+mod(p.z-cam.z+130.,260.)-130.;p.y+=cam.y-50.-tail*2.6;p.x+=tail*.5;
   a=amt*(.22+.3*(1.-tail));gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,fragmentShader:`varying float a;void main(){gl_FragColor=vec4(.72,.82,1.,a);}`});
 const l=new THREE.LineSegments(g,m);l.frustumCulled=false;S.add(l);return m})();
const banks=(()=>{const arr=[];const D=new Uint8Array(64*64*4);for(let y=0;y<64;y++)for(let x=0;x<64;x++){const r=Math.min(1,Math.hypot(x-31.5,y-31.5)/31.5),i=(y*64+x)*4,a=(1-r)*(1-r)*(3-2*(1-r))*.4;D[i]=120;D[i+1]=135;D[i+2]=175;D[i+3]=Math.round(a*255)}const tex=new THREE.DataTexture(D,64,64);tex.magFilter=tex.minFilter=THREE.LinearFilter;tex.needsUpdate=true;// raw texels: Safari's 2D-canvas texture upload turned these fog banks into dark rectangles

 for(let i=0;i<(MOBILE?14:30);i++){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false,opacity:0,alphaTest:.004}));const a=rnd()*6.283,r=40+rnd()*260;s.position.set(Math.cos(a)*r,4+rnd()*14,Math.sin(a)*r);s.scale.set(90+rnd()*80,22+rnd()*12,1);S.add(s);arr.push(s)}
 return (k,t)=>arr.forEach((s,i)=>{s.material.opacity=k*.28;s.visible=k>.01;s.position.x+=Math.sin(t*.05+i)*.03})})();
// ---- good-market sky FX (thin geometry + additive basic materials only: Safari-safe, no big transparent planes) ----
const SKY=(()=>{const add=(c,o=0)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,fog:false});
 // soft god-rays: tapered open cylinders, view-angle + length fade (no hard edges), plus a few dust motes drifting down each shaft
 const rays=new THREE.Group(),rayM=new THREE.ShaderMaterial({uniforms:{op:{value:0}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  vertexShader:'varying vec2 vU;varying float vF;void main(){vU=uv;vec3 n=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vF=abs(dot(n,normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}',
  fragmentShader:'uniform float op;varying vec2 vU;varying float vF;void main(){float a=op*pow(vF,2.5)*smoothstep(0.,.45,vU.y)*smoothstep(1.,.75,vU.y);gl_FragColor=vec4(vec3(1.,.86,.6)*a,a);}'});
 const NR=TIER==='low'?3:6,RAYS=[];for(let i=0;i<NR;i++){const m=new THREE.Mesh(new THREE.CylinderGeometry(2+i%3,18+i*3,700,16,1,true),rayM);m.position.set(-500+i*90,260,-700+i*40);m.rotation.z=-.5+i*.06;m.rotation.x=.25;rays.add(m);RAYS.push(m)}
 const DPS=TIER==='low'?6:MOBILE?8:14,DN=NR*DPS,dP=new Float32Array(DN*3),dC=new Float32Array(DN*3),dS=[];for(let i=0;i<DN;i++)dS.push({r:i%NR,u:Math.random(),a:Math.random()*6.283,rr:Math.random()*.8,sp:.004+Math.random()*.006});
 const dG=new THREE.BufferGeometry();dG.setAttribute('position',new THREE.BufferAttribute(dP,3));dG.setAttribute('color',new THREE.BufferAttribute(dC,3));
 const dust=new THREE.Points(dG,new THREE.PointsMaterial({size:MOBILE?2.2:2.8,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));dust.frustumCulled=false;rays.add(dust);
 const _dv=new THREE.Vector3(),updDust=(dt,k)=>{rays.updateMatrixWorld();dS.forEach((d,i)=>{d.u+=d.sp*dt*6;if(d.u>1){d.u=0;d.a=Math.random()*6.283;d.rr=Math.random()*.8}const m=RAYS[d.r],r=m.geometry.parameters,rad=(r.radiusTop+(r.radiusBottom-r.radiusTop)*d.u)*d.rr;
   _dv.set(Math.cos(d.a)*rad,350-700*d.u,Math.sin(d.a)*rad).applyMatrix4(m.matrix);dP[i*3]=_dv.x;dP[i*3+1]=_dv.y;dP[i*3+2]=_dv.z;const f=Math.sin(Math.PI*Math.min(1,Math.max(0,(d.u-.25)/.7)))*k*.55;dC[i*3]=f;dC[i*3+1]=f*.88;dC[i*3+2]=f*.65});dG.attributes.position.needsUpdate=dG.attributes.color.needsUpdate=true};
 rays.visible=false;S.add(rays);
 const bow=new THREE.Group(),bowM=[0xff3b3b,0xff9a2a,0xffe14a,0x4dff7a,0x3aa0ff,0x9a5bff].map(c=>add(c));bowM.forEach((m,i)=>{const t=new THREE.Mesh(new THREE.TorusGeometry(520-i*9,4.2,6,TIER==='low'?48:96,Math.PI),m);bow.add(t)});bow.position.set(150,-60,-950);bow.visible=false;S.add(bow);
 const NC=TIER==='low'?24:MOBILE?60:140,coinG=new THREE.CylinderGeometry(2.2,2.2,.4,14).rotateX(Math.PI/2),coinM=new THREE.MeshStandardMaterial({color:0xffc83a,emissive:0x8a5a00,emissiveIntensity:.9,metalness:1,roughness:.22});
 const coins=new THREE.InstancedMesh(coinG,coinM,NC);coins.frustumCulled=false;coins.visible=false;S.add(coins);const cs=[...Array(NC)].map(()=>({x:(Math.random()-.5)*160,y:Math.random()*120,z:(Math.random()-.5)*160,v:10+Math.random()*12,r:Math.random()*6,s:2+Math.random()*4}));
 const o=new THREE.Object3D(),sp=new THREE.Vector3();
 return (dt,t,w,day)=>{const rk=w.rays*(.35+.65*day);rays.visible=rk>.01;rayM.uniforms.op.value=rk*.18*(.85+.15*Math.sin(t*.4));if(rays.visible)updDust(dt,Math.min(1,rk));
  bow.visible=w.rainbow>.01;bowM.forEach(m=>m.opacity=w.rainbow*.22*(.55+.45*day));
  coins.visible=w.coins>.01;if(!coins.visible)return;const n=Math.max(1,Math.round(NC*Math.min(1,w.coins)));coins.count=n;coinM.emissiveIntensity=.7+.5*Math.sin(t*9);
  for(let i=0;i<n;i++){const c=cs[i];c.y-=c.v*dt;c.r+=c.s*dt;if(c.y<0){c.y=110+Math.random()*30;c.x=(Math.random()-.5)*160;c.z=(Math.random()-.5)*160}
   o.position.set(C.position.x+c.x,C.position.y-60+c.y,C.position.z+c.z);o.rotation.set(c.r*.7,c.r,0);o.updateMatrix();coins.setMatrixAt(i,o.matrix)}coins.instanceMatrix.needsUpdate=true}})();
const bolt=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xdfe8ff,transparent:true,fog:false}));bolt.visible=false;bolt.frustumCulled=false;S.add(bolt);
const flashL=new THREE.DirectionalLight(0xbfd0ff,0);flashL.position.set(100,500,50);S.add(flashL);let nextBolt=Q.get('weather')==='storm'?.5:3,boltT=0;
const tallest=[...E.nodes].sort((a,b)=>b.h-a.h).slice(0,6);
function lightning(){const tg=tallest[Math.floor(Math.random()*tallest.length)];const p=[];let x=tg.pos.x+(Math.random()-.5)*60,z=tg.pos.z+(Math.random()-.5)*60;
 for(let y=520;y>tg.top;y-=18){p.push(new THREE.Vector3(x,y,z));x+=(Math.random()-.5)*16+(tg.pos.x-x)*.08;z+=(Math.random()-.5)*16+(tg.pos.z-z)*.08}p.push(new THREE.Vector3(tg.pos.x,tg.top,tg.pos.z));bolt.geometry.setFromPoints(p);bolt.visible=true;boltT=.3;thunder()}

// ---------- procedural ambient audio (default muted) ----------
let AC=null,aud={};
function initAudio(){AC=new (window.AudioContext||window.webkitAudioContext)();const master=AC.createGain();master.gain.value=0;aud.on=false;master.connect(AC.destination);
 const nb=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate),d=nb.getChannelData(0);let last=0;for(let i=0;i<d.length;i++){last=(last+.02*(Math.random()*2-1))/1.02;d[i]=last*3.5}
 const rs=AC.createBufferSource();rs.buffer=nb;rs.loop=true;const rf=AC.createBiquadFilter();rf.type='highpass';rf.frequency.value=700;const rg=AC.createGain();rg.gain.value=0;rs.connect(rf).connect(rg).connect(master);rs.start();
 const lp=AC.createBiquadFilter();lp.type='lowpass';lp.frequency.value=380;const dg=AC.createGain();dg.gain.value=.05;[55,55.4,82.4].forEach(f=>{const o=AC.createOscillator();o.type='sawtooth';o.frequency.value=f;o.connect(lp);o.start()});lp.connect(dg).connect(master);aud={master,rg,nb,on:false}}
function thunder(){if(!AC||!aud.on)return;const s=AC.createBufferSource();s.buffer=aud.nb;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=160;const g=AC.createGain();const t0=AC.currentTime+.3+Math.random();
 g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(1.4,t0+.08);g.gain.exponentialRampToValueAtTime(.001,t0+3.5);s.connect(f).connect(g).connect(aud.master);s.start(t0);s.stop(t0+4)}
function setSound(on){if(!AC)initAudio();AC.resume();aud.master.gain.setTargetAtTime(on?.6:0,AC.currentTime,.2);$('audio').textContent=on?'🔊':'🔇';$('audio').setAttribute('aria-pressed',on);aud.on=on;try{localStorage.setItem('bc_sound',on?'1':'0')}catch{}}
$('audio').onclick=()=>setSound(!aud.on);
// remembered "on": browsers require a gesture before audio, so resume on the first tap/click
if(localStorage.getItem('bc_sound')==='1'){$('audio').textContent='🔊';const g=()=>{removeEventListener('pointerdown',g,true);removeEventListener('keydown',g,true);if(localStorage.getItem('bc_sound')==='1')setSound(true)};addEventListener('pointerdown',g,true);addEventListener('keydown',g,true)}
function crackle(k=1){if(!AC||!aud.on)return;const t0=AC.currentTime;for(let i=0;i<14;i++){const s=AC.createBufferSource();s.buffer=aud.nb;const f=AC.createBiquadFilter();f.type='bandpass';f.frequency.value=1500+Math.random()*2500;f.Q.value=2;const g=AC.createGain();const t=t0+Math.random()*1.4;
 g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.5*k,t+.005);g.gain.exponentialRampToValueAtTime(.001,t+.06+Math.random()*.08);s.connect(f).connect(g).connect(aud.master);s.start(t,Math.random());s.stop(t+.2)}
 const s=AC.createBufferSource();s.buffer=aud.nb;const f=AC.createBiquadFilter();f.type='lowpass';f.frequency.value=600;const g=AC.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.5,t0+.15);g.gain.exponentialRampToValueAtTime(.001,t0+1.8);s.connect(f).connect(g).connect(aud.master);s.start(t0);s.stop(t0+2)}
function chime(){if(!AC||!aud.on)return;const t0=AC.currentTime;[880,1318.5,1760].forEach((fr,i)=>{const o=AC.createOscillator();o.type='sine';o.frequency.value=fr;const g=AC.createGain();const t=t0+i*.09;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.12,t+.01);g.gain.exponentialRampToValueAtTime(.0005,t+1.6);o.connect(g).connect(aud.master);o.start(t);o.stop(t+1.7)})}
window.__sfx={crackle,chime};

await stage(0.85,'Post-processing');
// ---------- post-processing ----------
// Apple GPUs / Safari: half-float render targets + a single NaN/Inf pixel -> UnrealBloom's blur pyramid smears it into a big black square that flickers.
// 1) sanitize pass right after the scene render (NaN/Inf/negative -> 0, clamp HDR) so nothing poisoned reaches bloom;
// 2) on Safari/Apple (or ?rt=byte) use 8-bit render targets everywhere in the post chain.
const APPLE_GPU=(()=>{try{const gl=R.getContext(),e=gl.getExtension('WEBGL_debug_renderer_info');return /apple/i.test(e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):'')}catch(x){return false}})();
const SAFARI=/^((?!chrome|chromium|crios|fxios|android|edg).)*safari/i.test(navigator.userAgent);
const RT_BYTE=Q.get('rt')==='byte'||(Q.get('rt')!=='half'&&(SAFARI||APPLE_GPU));
const comp=RT_BYTE?new EffectComposer(R,new THREE.WebGLRenderTarget(innerWidth*PR,innerHeight*PR,{type:THREE.UnsignedByteType})):new EffectComposer(R);comp.setPixelRatio(PR);comp.addPass(new RenderPass(S,C));
const sanitize=new ShaderPass({uniforms:{tDiffuse:{value:null}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D tDiffuse;varying vec2 vUv;float ok(float v){return (v>=0.&&v<=64.)?v:(v>64.?64.:0.);}
 void main(){vec4 c=texture2D(tDiffuse,vUv);gl_FragColor=vec4(ok(c.r),ok(c.g),ok(c.b),(c.a>=0.&&c.a<=1.)?c.a:1.);}`});comp.addPass(sanitize);

const bloom=new UnrealBloomPass(new THREE.Vector2(innerWidth*LV.bloomScale,innerHeight*LV.bloomScale),.7,.4,.5);comp.addPass(bloom);
if(RT_BYTE){const fix=rt=>{if(rt&&rt.texture&&rt.texture.type!==THREE.UnsignedByteType){rt.texture.type=THREE.UnsignedByteType;rt.dispose()}};[...bloom.renderTargetsHorizontal,...bloom.renderTargetsVertical,bloom.renderTargetBright].forEach(fix)}
const bokeh=new BokehPass(S,C,{focus:120,aperture:.00015,maxblur:.006});bokeh.enabled=false;comp.addPass(bokeh);
const haze=new ShaderPass({uniforms:{tDiffuse:{value:null},c:{value:new THREE.Vector2(.5,.5)},k:{value:0},t:{value:0},asp:{value:innerWidth/innerHeight}},
 vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform sampler2D tDiffuse;uniform vec2 c;uniform float k,t,asp;varying vec2 vUv;
 void main(){vec2 d=(vUv-c)*vec2(asp,1.);float r=length(d);float m=k*(1.-smoothstep(.0,.45,r));
  vec2 o=vec2(sin(vUv.y*90.+t*14.)+sin(vUv.y*37.-t*9.),cos(vUv.x*80.-t*12.))*.0035*m;gl_FragColor=texture2D(tDiffuse,vUv+o);gl_FragColor.rgb+=vec3(.06,.025,0.)*m;}`});
haze.enabled=false;haze.userData={t:0,p:new THREE.Vector3()};comp.addPass(haze);comp.addPass(new OutputPass());
if(TIER==='low'){$('minor').checked=false;bridges.forEach(b=>{if(b.minor)b.group.visible=false})}
$('dof').onchange=e=>bokeh.enabled=e.target.checked;$('minor').onchange=e=>bridges.forEach(b=>{if(b.minor)b.group.visible=e.target.checked});

// ---------- HUD totals + info panels ----------
const T=pools.reduce((s,p)=>s+p.tvl_xrp,0),LK=pools.reduce((s,p)=>s+p.tvl_xrp*p.locked_pct/100,0);
$('tot').innerHTML=`Pools <b>${pools.length}</b> · Districts <b>${E.nodes.length}</b> · TVL <b>${fmt(T)} XRP</b><br>Locked LP <b style="color:#3cf3ff">${(LK/T*100).toFixed(1)}%</b> · insider-held pools ⚑ <b style="color:#ffb000">${pools.filter(p=>p.insider_pct>=50).length}</b><br><span class="dim">read-only · sources below</span>`;
$('hudToggle').onclick=()=>$('hud').classList.toggle('open');
const lpTag=t=>t.tag==='rpUaH8'||t.tag==='rNbR4'?`<b style="color:#ffb000">⚑ ${t.tag}</b>`:t.tag==='BH'?'<span style="color:#3cf3ff">locked</span>':'';
const BURNED=(window.BURNED&&window.BURNED.tokens)||{};
const tradeUrl=n=>n.name==='XRP'?'https://xrpburn.com/':`https://xrpburn.com/dex/trade/${encodeURIComponent(n.name.toUpperCase())}-XRP`;
const issuerOf=n=>n.key&&n.key.includes('-')?n.key.split('-')[0]:null;
const na='<span class="dim">n/a</span>';
function descNodeTable(n){const ps=pools.filter(p=>p.a===n.name||p.b===n.name).sort((a,b)=>b.tvl_xrp-a.tvl_xrp),iss=issuerOf(n),bu=n.burn_complete&&n.burned_pct!=null?{burned_pct:n.burned_pct,burned:n.burn_vol,burn_txs:n.burn_txs,outstanding:n.circ}:BURNED[n.name];
 const burnRow=n.name==='XRP'?'':`<tr><td>Burned to issuer</td><td>${bu&&bu.burned_pct!=null?`<b style="color:#ff8a2a">${bu.burned_pct.toFixed(2)}%</b> <i class="est" title="${fmtS(bu.burned)} burned in ${bu.burn_txs} txs vs ${fmtS(bu.outstanding)} outstanding (ledger scan)">est.</i>`:`${na} <span class="dim" title="Issuer history too long to scan fully; no number shown rather than a partial one">(not verified)</span>`}</td></tr>`;
 return `<button class="x" aria-label="Close">✕</button><h2 style="color:#${n.col.getHexString()}">${n.name}${n.minor?' <small style="opacity:.6">minor · near '+n.parent+'</small>':''}</h2><table>
 <tr><td>Price</td><td>${n.name==='XRP'?'1 XRP':n.price_xrp!=null?fmt(n.price_xrp,12)+' XRP <i class="est" title="xrpl.to price">est.</i>':na}</td></tr><tr><td>24h / 1h</td><td>${pct(n.pro24h)} / ${pct(n.pro1h)}</td></tr>
 ${n.name==='XRP'?'':`<tr><td>Market cap <span class="dim">(height)</span></td><td>${n.mc!=null?fmt(n.mc)+' XRP'+(n.price_thin||(n.price_src&&n.price_src!=='amm-xrp')?` <i class="est" title="${n.price_thin?'price from a thin pool (<1,000 XRP depth)':'priced via '+n.price_src.replace('amm-via-','')+' AMM'}">est.</i>`:''):na}</td></tr>`}
 ${n.top10_pct!=null?`<tr><td>Top 10 holders hold</td><td>${n.top10_pct}%${n.top_partial?' (partial scan)':''}${n.myHold?` · <b style="color:#fff2a0">you: ${n.myHold<.01?'<0.01':n.myHold.toFixed(2)}%</b>`:''}</td></tr>`:''}${burnRow}${n.name==='XRP'?'':`<tr><td>Burn txs <span class="dim">(${n.scar_txs??0} flames · >10 XRP each; sparks on the energy spiral)</span></td><td>${(n.burn_txs||0)+(n.liveBurns||0)?`${n.burn_complete?'':'≥'}${fmt((n.burn_txs||0)+(n.liveBurns||0))}${n.burn_vol?' · '+fmtS(n.burn_vol)+' '+n.name:''}${n.burn_complete?'':' <span class="dim" title="Only recent issuer history was scanned">(partial scan)</span>'}`:n.burn_txs===0&&n.burn_complete?'0':na}</td></tr>`}
 <tr><td>LP locked <span class="dim">(build tier)</span></td><td>${(n.lockedShare*100).toFixed(1)}% · <b>${LOCKT[n.tier][1]}</b></td></tr>
 <tr><td>Pool TVL <span class="dim">(width)</span></td><td>${fmt(n.tvl)} XRP${ps.some(p=>p.a!=='XRP'&&p.b!=='XRP')?' <i class="est" title="non-XRP pools valued at xrpl.to price">est.</i>':''}</td></tr><tr><td>24h volume</td><td>${n.vol24h!=null?fmt(n.vol24h)+' XRP':na}</td></tr><tr><td>Holders</td><td>${n.holders!=null?fmt(n.holders):na}</td></tr><tr><td>Active wallets <span class="dim">(block density)</span></td><td>${n.active!=null?fmt(n.active)+(n.active_src==='holders'?' <i class="est" title="no trader data: holder count">holders</i>':' <span class="dim" title="unique wallets that traded in the last 24h (xrpl.to)">24h traders</span>'):na}</td></tr></table>
 <div class="dim" style="margin-top:4px">${ps.slice(0,5).map(p=>`${p.a}⇄${p.b} ${fmt(p.tvl_xrp)} XRP · ${(+p.locked_pct).toFixed(1)}%🔒${p.insider_pct>=50?' ⚑':''}`).join('<br>')}${ps.length>5?'<br>+'+(ps.length-5)+' more':''}</div>
 <div class="cardBtns"><a class="trade" href="${tradeUrl(n)}" target="_blank" rel="noopener">🔥 Trade on xrpburn.com</a>${iss?`<a href="https://livenet.xrpl.org/accounts/${iss}" target="_blank" rel="noopener" title="${iss}">Issuer ↗</a>`:''}</div>`}
function priceFmt(v){if(v==null)return '—';const a=Math.abs(v);return a>=1?fmt(v,a>=100?0:3):a>=1e-4?(+v).toPrecision(4):(+v).toExponential(2)}
function descNode(n){const iss=issuerOf(n),col='#'+n.col.getHexString(),bu=n.burn_complete&&n.burned_pct!=null?{burned_pct:n.burned_pct,burned:n.burn_vol}:BURNED[n.name],isX=n.name==='XRP';
 const nb=(n.burn_txs||0)+(n.liveBurns||0),ch=n.pro24h,full=descNodeTable(n),tbl=full.slice(full.indexOf('<table>'),full.indexOf('<div class="cardBtns">'));
 const kp=(l,v,sub)=>`<div class="kpi"><span>${l}</span><b>${v}</b>${sub?`<i>${sub}</i>`:''}</div>`;
 return `<button class="x" aria-label="Close">✕</button><div class="chead" style="--tc:${col}"><div class="tk">${n.name.slice(0,2)}</div><div><h2 style="color:${col}">${n.name}</h2><div class="dim">$${n.name}${iss?` · <span title="${iss}">${iss.slice(0,6)}…${iss.slice(-4)}</span>`:''}${n.minor?' · minor':''}</div></div>${ch!=null?`<span class="chg ${ch>=0?'up':'dn'}">${pct(ch)}</span>`:''}</div>
 <div class="kpis">${kp('Price',isX?'1 XRP':n.price_xrp!=null?priceFmt(n.price_xrp)+' XRP':na,'')}${isX?'':kp('Market cap',n.mc!=null?fmtS(n.mc)+' XRP':na,'tower height')}${kp('TVL',fmtS(n.tvl)+' XRP','base width')}${kp('LP locked',(n.lockedShare*100).toFixed(1)+'%',LOCKT[n.tier][1])}${isX?'':kp('Burned',bu&&bu.burned_pct!=null?`<span style="color:#ff8a2a">${bu.burned_pct.toFixed(2)}%</span>`:nb?'🔥 '+fmt(nb)+' txs':na,bu&&bu.burned!=null?fmtS(bu.burned)+' '+n.name:nb?'supply % not verified':'')}</div>
 ${isX||!iss?'':`<div class="rb"><div class="rbh">🔥 Recent burns <span class="dim">sent to issuer</span></div><div class="rbl" data-iss="${iss}" data-cur="${n.key.split('-')[1]}" data-tok="${n.name}"><span class="dim">Loading from the ledger…</span></div></div>`}
 <div class="cardBtns"><a class="trade" href="${tradeUrl(n)}" target="_blank" rel="noopener">🔥 Trade ${isX?'':'$'+n.name+' '}on xrpburn.com</a>${iss?`<a href="https://livenet.xrpl.org/accounts/${iss}" target="_blank" rel="noopener" title="${iss}">Issuer ↗</a>`:''}</div>
 <details class="more"><summary>More stats &amp; pools</summary>${tbl}</details>
 <div class="attr dim">Trades open on xrpburn.com and are signed in your own wallet; Burn City never holds funds. Prices: <a href="https://xrpl.to" target="_blank" rel="noopener">Data by xrpl.to</a></div>`}
function descPool(p){const b=bridges.find(x=>x.p===p);return `<button class="x" aria-label="Close">✕</button><h2>${p.a} ⇄ ${p.b}</h2><table><tr><td>Forever Rails</td><td><b style="color:#ffc64a">${fmt(p.tvl_xrp*(p.locked_pct||0)/100)} XRP locked forever</b> (${(p.locked_pct||0).toFixed(1)}% of pool)${b&&b.forever?' ∞':''} <span class="dim">LP in blackholed wallets: can never be withdrawn</span></td></tr><tr><td>Activity <span class="dim">(line colour)</span></td><td>${b&&b.act!=null?`<b style="color:#${b.actCol.getHexString()}">${b.act>=.85?'Very active':b.act>=.6?'Active':b.act>=.3?'Moderate':'Quiet'}</b> · top ${Math.max(1,Math.round((1-b.act)*100))}%`:'—'}</td></tr><tr><td>TVL</td><td>${fmt(p.tvl_xrp)} XRP</td></tr><tr><td>Trading fee</td><td>${p.fee_pct}%</td></tr>
 <tr><td>Locked LP</td><td style="color:${p.locked_pct>=70?'#3cf3ff':p.locked_pct>=30?'#ffb000':'#ff3b2f'}">${p.locked_pct}%</td></tr><tr><td>Insider LP</td><td>${p.insider_pct}% ${p.insider_pct>=50?'⚑':''}</td></tr><tr><td>LP holders</td><td>${p.lp_holders}</td></tr>
 <tr><td>Traffic basis</td><td>${b&&b.volEst?'est. 2% of TVL':'min 24h vol of pair'} ≈ ${fmt(b&&b.vol)} XRP</td></tr></table>
 <div class="actLeg"><span>Quiet</span><i></i><span>Very active</span></div><div style="margin-top:4px">Top LP:<br>${p.top_lp.map(t=>`${t.acct.slice(0,10)}… ${t.pct}% ${lpTag(t)}`).join('<br>')}</div><div class="dim" style="margin-top:4px;word-break:break-all">AMM ${p.amm}</div>`}
function descLot(L){return `<button class="x" aria-label="Close">✕</button><h2 style="color:#ffb000">🚧 ${L.ticker.replace(/[<&]/g,'')} <small style="opacity:.6">unbonded · Launchpad</small></h2><table><tr><td>Bonding progress</td><td>${L.bond_pct!=null?L.bond_pct.toFixed(1)+'%':'<span class="dim">n/a</span>'}</td></tr><tr><td>Market cap</td><td>${L.mcap!=null?fmt(L.mcap)+' XRP <i class="est" title="bonding-curve price reported by xrpl.fun">est.</i>':'<span class="dim">n/a</span>'}</td></tr><tr><td>Curve liquidity</td><td>${L.liquidity!=null?fmt(L.liquidity)+' XRP <i class="est">est.</i>':'<span class="dim">n/a</span>'}</td></tr><tr><td>Paired with</td><td>${L.base_pair||'—'}</td></tr></table><div class="dim" style="margin-top:4px">No AMM pool yet. When it bonds it rises into a real tower. Data: xrpl.fun, refreshed nightly.</div><div class="cardBtns"><a class="trade" href="${L.url}" target="_blank" rel="noopener">View on xrpl.fun</a>${L.issuer?`<a href="https://livenet.xrpl.org/accounts/${L.issuer}" target="_blank" rel="noopener">Issuer ↗</a>`:''}</div>`}
function descAd(a){const e=t=>String(t||'').replace(/[<&"]/g,'');return `<button class="x" aria-label="Close">✕</button><div class="spons">Sponsored · ${e(a.tier||'xrpburn.com')}</div><h2 style="color:${a.color||'#ff8a2a'}">$${e(a.ticker)} <small style="opacity:.7">${e(a.name)}</small></h2>${a.tagline?`<div>${e(a.tagline)}</div>`:''}<div class="dim" style="margin-top:4px">Paid placement on xrpburn.com, not an endorsement. DYOR.</div><div class="cardBtns"><a class="trade" href="${encodeURI(a.url||'https://xrpburn.com/')}" target="_blank" rel="noopener sponsored">Open on xrpburn.com</a>${a.issuer?`<a href="https://livenet.xrpl.org/accounts/${e(a.issuer)}" target="_blank" rel="noopener">Issuer ↗</a>`:''}</div>`}
// my own holder building glows (visible only to me): fetch MY trust lines, compute band locally, match a published band. Nothing is sent anywhere.
(async()=>{const acct=localStorage.bcAcct;if(!acct||!/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(acct))return;let lines=[];
 try{const r=await (await fetch('https://xrplcluster.com/',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({method:'account_lines',params:[{account:acct,limit:400}]})})).json();lines=r.result?.lines||[]}catch(e){return}
 const gm=new THREE.MeshBasicMaterial({color:0xfff2a0,transparent:true,opacity:.45,blending:THREE.AdditiveBlending,depthWrite:false});
 E.nodes.forEach(n=>{if(!n.holderB?.length||!n.circ)return;const [iss,cur]=n.key.split('-');const l=lines.find(x=>x.account===iss&&x.currency===cur);if(!l||+l.balance<=0)return;
  const pc=100*(+l.balance)/n.circ,b=pc<.5?0:pc<1?1:pc<2?2:pc<5?3:pc<10?4:5;const sb=n.holderB.find(x=>!x.holder.role&&x.holder.b===b);if(!sb||(b===0&&pc<.05))return;
  const m=new THREE.Mesh(new THREE.BoxGeometry(sb.w*1.5,sb.h*1.15,sb.w*1.5),gm);m.position.set(sb.x,sb.h*.55,sb.z);S.add(m);n.myHold=pc;anim.push(t=>m.material.opacity=.3+.2*Math.sin(t*2.5))})})();
window.__holderNick=null; // hook: opt-in nickname for your own holder building (later)
const ESTATE=buildEstate({S,U,pick,anim,nodes:E.nodes,low:TIER==='low',avoid:[LPD.c]});window.__estate=ESTATE;
function showInfo(u){if(u.kind==='estate'){$('info').innerHTML=estateCard();$('info').classList.remove('v2');$('info').style.display='block';$('info').querySelector('.x').onclick=()=>$('info').style.display='none';return}const ih=document.getElementById('iosHint');ih&&ih.remove();if(u.kind==='ad'||u.ad){$('info').innerHTML=descAd(u.ad);$('info').style.display='block';$('info').querySelector('.x').onclick=()=>$('info').style.display='none';return}$('info').innerHTML=u.lot?descLot(u.lot):u.node?descNode(u.node):descPool(u.pool);$('info').classList.toggle('v2',!!(u.node&&!u.lot));$('info').style.display='block';$('info').scrollTop=0;window.__onCard&&window.__onCard($('info'));$('info').querySelector('.x').onclick=()=>$('info').style.display='none'}

// ---------- controls: Orbit / Fly / Explore ----------
const orbit=new OrbitControls(C,R.domElement);orbit.enableDamping=true;orbit.maxPolarAngle=1.5;orbit.target.set(0,30,0);orbit.minDistance=8;orbit.maxDistance=900;orbit.autoRotateSpeed=.35;
let mode='orbit',tour=null;const keys={},yp={yaw:0,pitch:0};
const P={pos:new THREE.Vector3(0,0,55),vel:new THREE.Vector3(),onGround:true,fp:false,spawned:0,district:'',walk:0,near:null};
const me=new PlayerState();
const avatar=(()=>{const g=new THREE.Group();const suit=new THREE.MeshStandardMaterial({color:0x1b2338,metalness:.8,roughness:.3,emissive:0x050a18});const glow=new THREE.MeshBasicMaterial({color:0x7ee0ff});
 const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.32,.55,4,10),suit);torso.position.y=1.15;g.add(torso);
 const pack=new THREE.Mesh(new THREE.BoxGeometry(.4,.5,.2),suit);pack.position.set(0,1.2,.3);g.add(pack);const thr=new THREE.Mesh(new THREE.BoxGeometry(.3,.06,.05),glow);thr.position.set(0,1.0,.42);g.add(thr);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.24,16,12),suit);head.position.y=1.75;g.add(head);const visor=new THREE.Mesh(new THREE.BoxGeometry(.36,.09,.1),glow);visor.position.set(0,1.77,-.2);g.add(visor);
 const stripe=new THREE.Mesh(new THREE.TorusGeometry(.33,.025,6,24),glow);stripe.rotation.x=Math.PI/2;stripe.position.y=1.05;g.add(stripe);
 const legs=[-1,1].map(s=>{const l=new THREE.Mesh(new THREE.CapsuleGeometry(.11,.5,4,8),suit);l.geometry.translate(0,-.3,0);l.position.set(s*.15,.72,0);g.add(l);return l});
 const arms=[-1,1].map(s=>{const a=new THREE.Mesh(new THREE.CapsuleGeometry(.08,.45,4,8),suit);a.geometry.translate(0,-.25,0);a.position.set(s*.42,1.38,0);g.add(a);return a});
 const ring=new THREE.Mesh(new THREE.RingGeometry(.45,.55,32),new THREE.MeshBasicMaterial({color:0x7ee0ff,transparent:true,opacity:.3,side:2}));ring.rotation.x=-Math.PI/2;ring.position.y=.03;g.add(ring);
 const pl=new THREE.PointLight(0x7ee0ff,2,6,2);pl.position.y=1.5;g.add(pl);g.userData={legs,arms};g.visible=false;S.add(g);return g})();
let NET=null;const peers=new Map();window.__city={colliders,groundAt,drone:()=>DRONE&&DRONE.grp,avatar,S,C,P,R,N,orbit,MOBILE,bridges,comp,bloom,sanitize,RT_BYTE,APPLE_GPU,U,E,TIER,sfx:{whoosh:()=>{if(!AC||!aud.on)return;const t0=AC.currentTime,s=AC.createBufferSource();s.buffer=aud.nb;const f=AC.createBiquadFilter();f.type='bandpass';f.Q.value=1.2;f.frequency.setValueAtTime(300,t0);f.frequency.exponentialRampToValueAtTime(2400,t0+.7);const g=AC.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.5,t0+.25);g.gain.exponentialRampToValueAtTime(.001,t0+1.1);s.connect(f).connect(g).connect(aud.master);s.start(t0);s.stop(t0+1.2)}},isTour:()=>!!tour,getMode:()=>mode,showInfo};
function setMode(m){mode=m;tour=null;$('tourCap')&&$('tourCap').classList.remove('show');document.querySelectorAll('#btns [data-m]').forEach(b=>b.classList.toggle('on',b.dataset.m===m));orbit.enabled=m==='orbit';avatar.visible=m==='explore'&&!P.fp;
 $('touch').classList.toggle('on',MOBILE&&(m==='explore'||m==='fly'));['tUp','tDown'].forEach(i=>$(i).style.display=m==='fly'?'':'none');['tJump','tRun','tUse'].forEach(i=>$(i).style.display=m==='explore'?'':'none');
 if(m!=='orbit'){const d=C.getWorldDirection(new THREE.Vector3());yp.yaw=Math.atan2(-d.x,-d.z);yp.pitch=Math.asin(Math.max(-1,Math.min(1,d.y)))}
 if(m==='explore'){if(!P.spawned){P.pos.set(0,0,52);P.spawned=1;yp.yaw=0}yp.pitch=-.12}
 if(m==='orbit'){if(document.pointerLockElement)document.exitPointerLock();orbit.target.copy(C.position).add(C.getWorldDirection(new THREE.Vector3()).multiplyScalar(80));orbit.target.y=Math.max(5,orbit.target.y)}
 $('prompt').style.display='none';
 $('help').textContent=m==='orbit'?'Drag orbit · scroll/pinch zoom · click a tower, road, billboard or terminal for live stats':m==='fly'?'Click to capture mouse · WASD move · Space up · C down · Shift fast · Esc release':'WASD walk · Shift run · Space jump · E interact · V 1st/3rd person · click to capture mouse'+(NET?' · Enter chat':'')}
document.querySelectorAll('#btns [data-m]').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
addEventListener('keydown',e=>{if(document.activeElement===$('chatIn'))return;keys[e.code]=1;if(mode==='explore'){if(e.code==='KeyE')interact();if(e.code==='KeyV'){P.fp=!P.fp}}if(e.code==='Enter'&&NET){$('chatIn').focus();e.preventDefault()}});
addEventListener('keyup',e=>keys[e.code]=0);
addEventListener('mousemove',e=>{if(document.pointerLockElement===R.domElement&&(mode==='fly'||mode==='explore')){yp.yaw-=e.movementX*.0022;yp.pitch=Math.max(-1.3,Math.min(1.3,yp.pitch-e.movementY*.0022))}});
R.domElement.addEventListener('click',()=>{if((mode==='fly'||mode==='explore')&&!MOBILE&&document.pointerLockElement!==R.domElement)R.domElement.requestPointerLock?.()});
const joy={x:0,y:0,id:null},look={id:null,x:0,y:0},tb={jump:0,run:0,up:0,down:0};const jEl=$('joy'),kEl=$('knob');
jEl.addEventListener('touchstart',e=>{joy.id=e.changedTouches[0].identifier;e.preventDefault()},{passive:false});
addEventListener('touchmove',e=>{for(const t of e.changedTouches){if(t.identifier===joy.id){const r=jEl.getBoundingClientRect();let dx=(t.clientX-r.left-60)/50,dy=(t.clientY-r.top-60)/50;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}joy.x=dx;joy.y=dy;kEl.style.left=35+dx*40+'px';kEl.style.top=35+dy*40+'px'}
 else if(t.identifier===look.id&&mode!=='orbit'){yp.yaw-=(t.clientX-look.x)*.005;yp.pitch=Math.max(-1.3,Math.min(1.3,yp.pitch-(t.clientY-look.y)*.005));look.x=t.clientX;look.y=t.clientY}}},{passive:true});
R.domElement.addEventListener('touchstart',e=>{const t=e.changedTouches[0];if(mode!=='orbit'){look.id=t.identifier;look.x=t.clientX;look.y=t.clientY}},{passive:true});
addEventListener('touchend',e=>{for(const t of e.changedTouches){if(t.identifier===joy.id){joy.id=null;joy.x=joy.y=0;kEl.style.left=kEl.style.top='35px'}if(t.identifier===look.id)look.id=null}});
const hold=(id,k)=>{const el=$(id);el.addEventListener('touchstart',e=>{tb[k]=1;e.preventDefault()},{passive:false});el.addEventListener('touchend',()=>tb[k]=0)};['tJump:jump','tRun:run','tUp:up','tDown:down'].forEach(s=>hold(...s.split(':')));
$('tUse').addEventListener('touchstart',e=>{interact();e.preventDefault()},{passive:false});

// ---------- explore: physics, collisions, districts, interaction ----------
function groundAt(x,z,y){let g=0;for(const c of colliders){if(c.h<=y+.35&&c.h>g&&Math.hypot(x-c.x,z-c.z)<c.r)g=c.h}return g}
function collide(p){for(const c of colliders){if(p.y>=c.h-.05)continue;const dx=p.x-c.x,dz=p.z-c.z,m=c.r+.38;if(Math.abs(dx)>m||Math.abs(dz)>m)continue;const d=Math.hypot(dx,dz);if(d<m){const k=(m-d)/(d||1);p.x+=dx*k;p.z+=dz*k}}}
const dirOf=()=>_t.set(-Math.sin(yp.yaw)*Math.cos(yp.pitch),Math.sin(yp.pitch),-Math.cos(yp.yaw)*Math.cos(yp.pitch)).clone();
function updExplore(dt){const run=keys.ShiftLeft||keys.ShiftRight||tb.run,sp=run?11:5;
 const f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-joy.y,s=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+joy.x;
 const fw=new THREE.Vector3(-Math.sin(yp.yaw),0,-Math.cos(yp.yaw)),rt=new THREE.Vector3(-fw.z,0,fw.x);const mv=fw.multiplyScalar(f).add(rt.multiplyScalar(s));const ml=Math.min(1,mv.length());
 if(ml>.05){mv.normalize().multiplyScalar(sp*ml);const ty=Math.atan2(-mv.x,-mv.z);let dy=ty-avatar.rotation.y;dy=Math.atan2(Math.sin(dy),Math.cos(dy));avatar.rotation.y+=dy*Math.min(1,dt*12)}
 P.pos.x+=mv.x*dt;P.pos.z+=mv.z*dt;if((keys.Space||tb.jump)&&P.onGround){P.vel.y=7.5;P.onGround=false}P.vel.y-=20*dt;P.pos.y+=P.vel.y*dt;
 const g=groundAt(P.pos.x,P.pos.z,P.pos.y);if(P.pos.y<=g){P.pos.y=g;P.vel.y=0;P.onGround=true}else P.onGround=P.pos.y-g<.05;
 collide(P.pos);
 // climbing: push into a tower wall -> climb the face; jump/back off detaches; mantle at the roof edge
 {let cw=null;const fv=new THREE.Vector3(-Math.sin(yp.yaw),0,-Math.cos(yp.yaw));if(f>.3)for(const c of colliders){if(!c.r||P.pos.y>=c.h-.05)continue;const dx=c.x-P.pos.x,dz=c.z-P.pos.z,d=Math.hypot(dx,dz);if(d<c.r+.6&&(dx*fv.x+dz*fv.z)/(d||1)>.3){cw=c;break}}
  if(cw&&(keys.Space||tb.jump)&&P.climb){P.climb=null;P.vel.y=5;const dx=P.pos.x-cw.x,dz=P.pos.z-cw.z,d=Math.hypot(dx,dz)||1;P.pos.x+=dx/d*1.2;P.pos.z+=dz/d*1.2;cw=null}
  if(cw){P.climb=cw;P.vel.y=0;P.onGround=false;P.pos.y+=(run?4.5:3)*dt;P.walk+=dt*8;
   if(P.pos.y>=cw.h-.05){const dx=cw.x-P.pos.x,dz=cw.z-P.pos.z,d=Math.hypot(dx,dz)||1;P.pos.y=cw.h;P.pos.x+=dx/d*1.4;P.pos.z+=dz/d*1.4;P.climb=null;P.onGround=true}}
  else P.climb=null}
 P.pos.x=Math.max(-900,Math.min(900,P.pos.x));P.pos.z=Math.max(-900,Math.min(900,P.pos.z));
 P.walk+=dt*ml*(run?14:9);const sw=Math.sin(P.walk)*.7*ml*(P.onGround?1:.2);const L=avatar.userData;L.legs[0].rotation.x=sw;L.legs[1].rotation.x=-sw;L.arms[0].rotation.x=-sw*.8;L.arms[1].rotation.x=sw*.8;
 if(P.climb){const c2=Math.sin(P.walk*1.4);L.arms[0].rotation.x=-2.6+c2*.5;L.arms[1].rotation.x=-2.6-c2*.5;L.legs[0].rotation.x=.6+c2*.4;L.legs[1].rotation.x=.6-c2*.4}
 avatar.position.copy(P.pos);avatar.position.y+=Math.abs(Math.sin(P.walk))*.06*ml+(P.climb?Math.sin(P.walk*1.4)*.05:0);avatar.visible=!P.fp;const dir=dirOf();
 if(P.fp){C.position.copy(P.pos).setY(P.pos.y+1.7);C.lookAt(C.position.clone().add(dir))}
 else{const want=P.pos.clone().setY(P.pos.y+2.3).addScaledVector(dir,-6.5);want.y=Math.max(want.y,P.pos.y+.6,.6);C.position.lerp(want,1-Math.pow(.0005,dt));C.lookAt(P.pos.clone().setY(P.pos.y+1.6).addScaledVector(dir,4))}
 let best=null,bd=1e9;E.nodes.forEach(n=>{const d=Math.hypot(P.pos.x-n.pos.x,P.pos.z-n.pos.z);if(d<n.distR&&d<bd){bd=d;best=n}});const dn=best?best.name:'';
 if(dn!==P.district){P.district=dn;if(dn){const b=$('banner');b.innerHTML=`${dn} DISTRICT<small>${fmt(best.tvl)} XRP pool TVL · ${best.pools} pools${best.pro24h!=null?' · 24h '+pct(best.pro24h):''}</small>`;b.style.color='#'+best.col.getHexString();b.style.textShadow='0 0 14px #'+best.col.getHexString();b.style.opacity=1;clearTimeout(P.bt);P.bt=setTimeout(()=>b.style.opacity=0,2800)}}
 P.near=nearestInteract();$('prompt').style.display=P.near?'block':'none';if(P.near)$('prompt').textContent=(MOBILE?'Tap E · ':'E · ')+P.near.label;
 me.set(P.pos,avatar.rotation.y,P.climb?'climb':ml>.05?(run?'run':'walk'):'idle',dn)}
function nearestInteract(){let best=null,bd=10;const p=P.pos;
 E.nodes.forEach(n=>{const d=Math.hypot(p.x-n.pos.x,p.z-n.pos.z)-n.w*1.2;if(d<bd){bd=d;best={label:'Inspect '+n.name+' tower',u:{node:n}}}});
 bridges.forEach(b=>{if(!b.group.visible)return;const d=Math.hypot(b.term.position.x-p.x,b.term.position.z-p.z);if(d<4&&d<bd+3){bd=d-3;best={label:`Pool terminal ${b.p.a}⇄${b.p.b}`,u:{pool:b.p}}}
  for(let k=0;k<=20;k++){b.curve.getPoint(k/20,_v);const dd=_v.distanceTo(p);if(dd<b.r+3&&dd<bd){bd=dd;best={label:`Bridge ${b.p.a}⇄${b.p.b}`,u:{pool:b.p}}}}});
 return best}
function interact(){const n=P.near||nearestInteract();if(n)showInfo(n.u)}
let DRONE=null;function updFly(dt){if(!DRONE)DRONE=initDrone(window.__city,{keys,tb,MOBILE});const sp=(keys.ShiftLeft?140:60)*DRONE.speedMul()*dt,dir=dirOf(),rt=new THREE.Vector3(-dir.z,0,dir.x).normalize();const f=(keys.KeyW?1:0)-(keys.KeyS?1:0)-joy.y,s=(keys.KeyD?1:0)-(keys.KeyA?1:0)+joy.x;
 C.position.addScaledVector(dir,f*sp).addScaledVector(rt,s*sp);C.position.y=Math.max(1.5,C.position.y+((keys.Space||tb.up?1:0)-(keys.KeyC||keys.ControlLeft||tb.down?1:0))*sp);C.lookAt(C.position.clone().add(dir));DRONE.update(dt,U.t.value,dir,f,s,colliders)}

// ---------- multiplayer hooks (optional: ?ws=ws://host:8787) ----------
if(Q.get('ws')){$('chat').classList.add('on');NET=new NetClient(Q.get('ws'),me,{
 onPeer:s=>{let g=peers.get(s.id);if(!g){g=avatar.clone();g.visible=true;S.add(g);peers.set(s.id,g)}g.position.set(...s.pos);g.rotation.y=s.rotY},
 onLeave:id=>{const g=peers.get(id);if(g){S.remove(g);peers.delete(id)}},
 onChat:m=>{const d=document.createElement('div');d.textContent=m.name+': '+m.text;$('chatLog').appendChild(d);while($('chatLog').children.length>8)$('chatLog').firstChild.remove()},
 onStatus:s=>$('chatIn').placeholder='multiplayer '+s+' · Enter to chat'})}
$('chatIn').addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){if(NET&&e.target.value.trim())NET.chat(e.target.value.trim());e.target.value='';e.target.blur()}});

// ---------- cinematic tour (overview → hub river → BURN → XRPyro inferno → street level → IMM ice → airship → 666 → park) ----------
const V3=(x,y,z)=>new THREE.Vector3(x,y,z),np=(k,s,y)=>V3(N[k].pos.x*s,y,N[k].pos.z*s);
// portrait phones: pull wide shots back so the horizontal spread of the city fits the narrow view
const fitW=(c,t)=>{const a=innerWidth/innerHeight,k=a<1.2?Math.min(2.2,Math.pow(1.45/a,.75)):1;return t.clone().add(c.clone().sub(t).multiplyScalar(k))};
const tourStops=[[fitW(V3(330,200,380),V3(0,40,0)),V3(0,40,0)],[V3(110,40,90),V3(0,70,0)],[V3(60,5,60),V3(0,30,0)],[np('BURN',.55,46),np('BURN',.3,28)],[np('BURN',1.4,34),np('BURN',1,50)],[np('XRPyro',1.35,26),np('XRPyro',1,62)],
 [np('XRPyro',.62,3.5),np('BURN',.8,14)],[np('IMM',1.38,24),np('IMM',1,36)],[V3(0,200,-170),V3(0,168,0)],[np('666',1.5,60),np('666',1,30)],[V3(-70,5,-40),V3(-110,6,-90)],[fitW(V3(330,200,380),V3(0,40,0)),V3(0,40,0)]];
const tourCaps=['Burn City: every tower is a token, every bridge an XRPL AMM pool','The XRP hub: tallest tower = deepest liquidity','Street level: traffic follows real 24h volume','Bridges: colour = trading activity (blue quiet → red busy) · brighter = more LP locked · gold Forever Rails = XRP value locked forever','BURN: fire district. Live burns to the blackholed issuer erupt from this tower','XRPyro: the inferno','Scaffold rails = LP that could still be withdrawn','IMM: electric ice district','From above: weather follows market mood (TVL-weighted 24h change)','666 district','Bioluminescent parks','Replay history with the time-lapse slider · Copy link to share any view'];
function tourCap(t){const i=Math.min(tourCaps.length-1,Math.round(t*(tourStops.length-1)));const el=$('tourCap');if(el.dataset.i!=i){el.dataset.i=i;el.classList.remove('show');setTimeout(()=>{el.textContent=tourCaps[i];el.classList.add('show')},450)}}
$('tour').onclick=()=>{setMode('orbit');orbit.enabled=false;mode='tour';tour={cam:new THREE.CatmullRomCurve3(tourStops.map(s=>s[0])),look:new THREE.CatmullRomCurve3(tourStops.map(s=>s[1])),t:0}};

// ---------- picking, labels (screen-space de-cluttering), minimap ----------
const ray=new THREE.Raycaster(),mv2=new THREE.Vector2();
const hit=e=>{mv2.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(mv2,C);return ray.intersectObjects(pick.filter(o=>o.parent.visible!==false),false)[0]};
R.domElement.addEventListener('pointermove',e=>{if(mode!=='orbit'||e.pointerType==='touch')return;const h=hit(e),tip=$('tip');if(h){const u=h.object.userData;tip.style.display='block';tip.style.left=e.clientX+14+'px';tip.style.top=e.clientY+14+'px';
 tip.textContent=u.kind==='estate'?'Burn City Estates · Coming soon':u.kind==='arena'?`Arena gate · ${u.label} · tap to play (free)`:(u.kind==='ad'||u.ad)?`Sponsored · $${u.ad.ticker}`:u.lot?`Launchpad · ${u.lot.ticker} · ${u.lot.bond_pct!=null?u.lot.bond_pct.toFixed(0)+'% bonded':'bonding'}`:u.node?`${u.kind==='billboard'?'Billboard · ':''}${u.node.name} · ${fmt(u.node.tvl)} XRP TVL`:`${u.kind==='terminal'?'Terminal · ':''}${u.pool.a}⇄${u.pool.b} · ${fmt(u.pool.tvl_xrp)} XRP · ${u.pool.locked_pct}% locked${u.pool.insider_pct>=50?' ⚑':''}`}else tip.style.display='none'});
let downXY=null;R.domElement.addEventListener('pointerdown',e=>downXY=[e.clientX,e.clientY]);
R.domElement.addEventListener('pointerup',e=>{if((mode!=='orbit'&&!(e.pointerType==='touch'&&(mode==='explore'||mode==='fly')))||!downXY||Math.hypot(e.clientX-downXY[0],e.clientY-downXY[1])>6)return;const h=hit(e);if(h&&h.object.userData.kind==='arena'){location.href='arena/?mode='+h.object.userData.arena;return}if(h)showInfo(h.object.userData);else $('info').style.display='none'});
const _p=new THREE.Vector3();
function updLabels(){const placed=[],W2=innerWidth,H2=innerHeight;labelEls.sort((a,b)=>b.pri-a.pri).forEach(l=>{_p.copy(l.pos).project(C);const dist=C.position.distanceTo(l.pos);
 let show=_p.z<1&&Math.abs(_p.x)<1.05&&Math.abs(_p.y)<1.05&&(!l.minor||dist<220)&&dist<1400;
 if(show){const x=(_p.x+1)/2*W2,y=(1-_p.y)/2*H2,w=l.w||(l.w=l.el.offsetWidth||60),h=l.h||(l.h=l.el.offsetHeight||18);const r=[x-w/2-3,y-h-3,x+w/2+3,y+3];
  if(placed.some(q=>!(r[2]<q[0]||r[0]>q[2]||r[3]<q[1]||r[1]>q[3])))show=false;else{placed.push(r);l.el.style.transform=`translate(${x-w/2}px,${y-h}px)`}}
 if(l.vis!==show){l.el.style.display=show?'block':'none';l.vis=show}})}
labelEls.forEach(l=>{l.el.style.left='0';l.el.style.top='0'});
const mm=$('minimap').getContext('2d');
function updMinimap(){const cw=mm.canvas.width,sc=cw/2/375;mm.clearRect(0,0,cw,cw);mm.save();mm.translate(cw/2,cw/2);
 mm.strokeStyle='rgba(60,200,255,.3)';mm.lineWidth=12*sc;mm.beginPath();mm.arc(0,0,81*sc,0,7);mm.stroke();
 bridges.forEach(b=>{if(!b.group.visible)return;const A=N[b.p.a].pos,B=N[b.p.b].pos;mm.strokeStyle=b.actCol?'#'+b.actCol.getHexString():'#3cf3ff';mm.globalAlpha=.45+.5*b.L;mm.lineWidth=.5+b.share*3;mm.beginPath();mm.moveTo(A.x*sc,A.z*sc);mm.lineTo(B.x*sc,B.z*sc);mm.stroke()});mm.globalAlpha=1;
 E.nodes.forEach(n=>{mm.fillStyle='#'+n.col.getHexString();mm.beginPath();mm.arc(n.pos.x*sc,n.pos.z*sc,n.minor?1.6:2.5+n.w*.22,0,7);mm.fill()});
 peers.forEach(g=>{mm.fillStyle='#ff66c4';mm.fillRect(g.position.x*sc-2,g.position.z*sc-2,4,4)});
 const p=mode==='explore'?P.pos:C.position,d=C.getWorldDirection(_p),yaw=mode==='explore'?avatar.rotation.y:Math.atan2(-d.x,-d.z);
 mm.translate(Math.max(-cw/2+8,Math.min(cw/2-8,p.x*sc)),Math.max(-cw/2+8,Math.min(cw/2-8,p.z*sc)));mm.rotate(-yaw);mm.fillStyle='#fff';mm.shadowColor='#7ee0ff';mm.shadowBlur=6;mm.beginPath();mm.moveTo(0,-7);mm.lineTo(4.5,5);mm.lineTo(-4.5,5);mm.fill();mm.restore()}

// ---------- screenshot / deep-link presets (?view=overview|street|burn|imm|hub|explore) ----------
const mid=(a,b,s,y)=>V3((N[a].pos.x+N[b].pos.x)/2*s,y,(N[a].pos.z+N[b].pos.z)/2*s);
const near=(p,d,h,ty)=>{const o=V3(p.x,0,p.z).normalize(),q=V3(-o.z,0,o.x);return[V3(p.x+o.x*d+q.x*d*.55,h,p.z+o.z*d+q.z*d*.55),V3(p.x,ty,p.z)]};
const BX=N['BURN'].pos.clone().add(N['XRPyro'].pos).multiplyScalar(.5);
const VIEWS={overview:[fitW(V3(352,190,297),V3(0,32,0)),V3(0,32,0)],street:[np('BURN',.6,2.6),np('BURN',.95,16)],burn:near(BX,90,58,44),imm:near(N['IMM'].pos,70,55,38),hub:[V3(58,8,62),V3(0,62,0)],fire:(()=>{const p=N['BURN'].pos,h=N['BURN'].top||N['BURN'].h||60;return [V3(p.x-.75*h,h*.62,p.z+.55*h),V3(p.x,h*.62,p.z)]})()};
const VQ0=Q.get('view')||'';const tokV=Object.keys(N).find(k=>k.toLowerCase()===VQ0.toLowerCase());
if(!VIEWS[VQ0]&&tokV){const n=N[tokV];VIEWS[VQ0]=tokV==='XRP'?VIEWS.hub:near(n.pos,50+n.h*1.5,8+n.h*.6,n.h*.62)}
if(Q.get('cam')){const c=Q.get('cam').split(',').map(Number);if(c.length===6&&c.every(isFinite))VIEWS.__cam=[V3(c[0],c[1],c[2]),V3(c[3],c[4],c[5])]}
const VQ=VIEWS.__cam?'__cam':VQ0;if(VIEWS[VQ]){C.position.copy(VIEWS[VQ][0]);orbit.target.copy(VIEWS[VQ][1]);C.lookAt(VIEWS[VQ][1]);setTimeout(()=>{if(mode==='orbit')orbit.target.copy(VIEWS[VQ][1])},50)}
window.__dbg=()=>({c:C.position.toArray(),t:orbit.target.toArray(),b:N.BURN.pos.toArray(),y:N.XRPyro.pos.toArray(),i:N.IMM.pos.toArray(),bh:N.BURN.h,bw:N.BURN.w,bt:N.BURN.top,nn:['Budzy','$BTCK','$BWTZ'].filter(k=>N[k]).map(k=>({k,p:N[k].pos.toArray(),h:N[k].h,w:N[k].w,tier:N[k].tier,locked:N[k].lockedShare,marks:N[k].marks}))});
if(Q.get('tod'))$('tod').value=Q.get('tod');

// ---------- live ledger events: burns, big trades, lock ceremonies (pooled FX, queued + rate-limited) ----------
const ease=x=>x<0?0:x>1?1:x*x*(3-2*x),easeOut=x=>1-Math.pow(1-Math.min(1,Math.max(0,x)),3);
const FXW=+(Q.get('fxwarp')||1);const TRADE_MIN=+(Q.get('trade')||localStorage.getItem('bc_trade')||500);
const fxMat=(col)=>new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{c:{value:new THREE.Color(col)},o:{value:0},t:U.t},
 vertexShader:`varying vec3 vn;varying vec3 vp;void main(){vn=normalize(normalMatrix*normal);vp=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
 fragmentShader:`uniform vec3 c;uniform float o,t;varying vec3 vn;varying vec3 vp;void main(){float f=pow(max(0.,1.-abs(vn.z)),1.4);float n=.6+.4*sin(vp.x*5.+t*7.)*sin(vp.y*6.-t*9.);gl_FragColor=vec4(c*(.55+1.2*f)*n,o*(.35+.65*f));}`});
const ringMat=col=>new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
const FXP={balls:[],rings:[],sparks:[],flashes:[]};const fxObjs=[];
for(let i=0;i<2;i++){const m=new THREE.Mesh(new THREE.IcosahedronGeometry(1,2),fxMat(0xff7a1a));m.visible=false;m.frustumCulled=false;S.add(m);FXP.balls.push({m,t:-1});fxObjs.push(m)}
for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.RingGeometry(.86,1,64),ringMat(0xffa040));m.rotation.x=-Math.PI/2;m.visible=false;m.frustumCulled=false;S.add(m);FXP.rings.push({m,t:-1});fxObjs.push(m)}
for(let i=0;i<4;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:GT,color:0xbff8ff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));m.visible=false;S.add(m);FXP.sparks.push({m,t:-1});fxObjs.push(m)}
for(let i=0;i<2;i++){const m=new THREE.Sprite(new THREE.SpriteMaterial({map:GT,color:0x9ffcff,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));m.visible=false;S.add(m);FXP.flashes.push({m,t:-1});fxObjs.push(m)}
const EMB=Math.round(420*Math.max(.3,LV.fx)),embG=new THREE.BufferGeometry(),embP=new Float32Array(EMB*3),embV=new Float32Array(EMB*3);embG.setAttribute('position',new THREE.BufferAttribute(embP,3));
const embM=new THREE.PointsMaterial({map:GT,color:0xffa24a,size:1.6,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});const emb=new THREE.Points(embG,embM);emb.frustumCulled=false;emb.visible=false;S.add(emb);fxObjs.push(emb);let embT=-1;
const fxLight=new THREE.PointLight(0xff7a2a,0,110,1.8);if(TIER!=='low')S.add(fxLight); // pre-created: never changes light count (no shader recompiles)
const take=a=>a.find(x=>x.t<0)||a.reduce((o,x)=>x.t>o.t?x:o);
// fireball trail: pooled Points (one per ball), positions = recent ball path
for(const B of FXP.balls){const g=new THREE.BufferGeometry();B.tp=new Float32Array(28*3);g.setAttribute('position',new THREE.BufferAttribute(B.tp,3));
 const al=new Float32Array(28);for(let i=0;i<28;i++)al[i]=1-i/28;g.setAttribute('aA',new THREE.BufferAttribute(al,1));
 B.trail=new THREE.Points(g,new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{c:{value:new THREE.Color()},k:{value:0},px:{value:innerHeight}},
  vertexShader:`attribute float aA;uniform float px;varying float vA;void main(){vA=aA;vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(px*(1.2+4.*aA)/-mv.z,1.,64.);}`,
  fragmentShader:`uniform vec3 c;uniform float k;varying float vA;void main(){float a=(1.-smoothstep(0.,.5,length(gl_PointCoord-.5)))*vA*k;gl_FragColor=vec4(mix(c,vec3(1.,.95,.8),vA*vA)*a*1.6,a);}`}));
 B.trail.frustumCulled=false;B.trail.visible=false;S.add(B.trail);fxObjs.push(B.trail)}
// fire tornado / pillar for big burns: one pooled open cylinder with a swirling noise-fire shader
const TOR={m:new THREE.Mesh(new THREE.CylinderGeometry(.55,1,1,TIER==='low'?14:28,TIER==='low'?6:16,true).translate(0,.5,0),new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
 defines:{OCT:TIER==='low'?2:4},uniforms:{t:U.t,o:{value:0},c:{value:new THREE.Color()},k:{value:new THREE.Color()}},
 vertexShader:`uniform float t;varying vec2 vUv;void main(){vUv=uv;vec3 p=position;float a=t*3.+p.y*4.;p.xz*=1.+.18*sin(a*1.7+p.y*9.);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
 fragmentShader:`uniform float t,o;uniform vec3 c,k;varying vec2 vUv;${FNOISE}
 void main(){vec2 q=vec2(vUv.x*6.+vUv.y*3.-t*1.2,vUv.y*4.-t*3.2);float n=fbm(q);float n2=fbm(q*2.3+4.);float b=smoothstep(.35,.85,n+.25*n2)*(1.-smoothstep(.55,1.,vUv.y+.2*n2))*smoothstep(0.,.06,vUv.y);
  vec3 col=mix(c,k,smoothstep(.55,.95,n));gl_FragColor=vec4(col*b*1.8*o,b*o);}`})),t:-1};
TOR.m.visible=false;TOR.m.frustumCulled=false;S.add(TOR.m);fxObjs.push(TOR.m);
const SHAKE={on:Q.get('shake')!=='0'&&localStorage.getItem('bc_shake')!=='0',a:0};window.__shake=v=>{SHAKE.on=!!v;localStorage.setItem('bc_shake',v?'1':'0')};{const el=document.getElementById('shakeOpt');if(el){el.checked=SHAKE.on;el.onchange=e=>window.__shake(e.target.checked)}}
const _hz=new THREE.Vector3();
function burnFX(n,amt,demo){const [oc,cc]=fireCols(n);const big=!!amt&&((n.circ&&amt>=.01*n.circ)||(n.burn_vol&&n.burn_txs&&amt>=10*n.burn_vol/n.burn_txs));
 // the new flame for this burn: permanent for real burns, temporary (25 s) for demo burns so demos never fake the ledger history
 burnMark(n,amt,demo);if(demo)setTimeout(()=>{n.liveBurns=Math.max(0,(n.liveBurns||0)-1);n.liveAmt=(n.liveAmt||[]).filter(x=>!x.demo||U.t.value-x.birth<20);layoutMarks()},25000);
 const mi=n.markIdx&&n.markIdx.length?n.markIdx[n.markIdx.length-1]:[n.pos.x,n.h*.6,n.pos.z,2];const hit=V3(mi[0],mi[1]+mi[3]*.5,mi[2]);
 // sender in the sky: a deterministic direction per tower, high above the city
 const ang=(n.pos.x*.013+n.pos.z*.007)+Math.PI*.75,from=V3(n.pos.x+Math.cos(ang)*140,(n.top||n.h)+150,n.pos.z+Math.sin(ang)*140);
 const b=take(FXP.balls);b.t=0;b.from=from;b.to=hit;b.n=n;b.big=big;b.oc=oc;b.cc=cc;b.hit=false;b.m.material.uniforms.c.value.set(cc);b.m.visible=true;
 b.trail.material.uniforms.c.value.set(oc);b.trail.visible=true;for(let i=0;i<28;i++)b.tp.set([from.x,from.y,from.z],i*3)}
function burnImpact(b){const n=b.n,hit=b.to,hot=new THREE.Color(b.oc);
 [[hit,0,1],[V3(n.pos.x,.6,n.pos.z),.2,1.6]].forEach(([p,d,s])=>{const r=take(FXP.rings);r.t=-d;r.p=p;r.s=s;r.m.material.color.copy(hot);r.m.position.copy(p);r.m.visible=true});
 const f=take(FXP.flashes);f.t=0;f.m.position.copy(hit);f.m.material.color.set(b.cc);f.m.visible=true;f.burn=1;
 for(let i=0;i<EMB;i++){embP[i*3]=hit.x;embP[i*3+1]=hit.y;embP[i*3+2]=hit.z;const a=Math.random()*6.283,u=Math.random()*2-1,s=(8+Math.random()*22)*(b.big?1.5:1),k=Math.sqrt(1-u*u);embV[i*3]=Math.cos(a)*k*s;embV[i*3+1]=Math.abs(u)*s+6;embV[i*3+2]=Math.sin(a)*k*s}
 embM.color.copy(hot);embT=0;emb.visible=true;fxLight.position.copy(hit);fxLight.color.copy(hot);fxLight.userData.t=0;
 haze.enabled=true;haze.userData.t=0;haze.userData.p=hit.clone();
 if(b.big){TOR.t=0;TOR.n=n;TOR.m.position.set(n.pos.x,0,n.pos.z);TOR.m.scale.set(n.w*1.7+3,(n.top||n.h)*1.25+10,n.w*1.7+3);TOR.m.material.uniforms.c.value.copy(hot);TOR.m.material.uniforms.k.value.set(b.cc);TOR.m.visible=true;if(SHAKE.on)SHAKE.a=1.6}
 else if(SHAKE.on)SHAKE.a=Math.max(SHAKE.a,.35)}
function pulseFX(b,xrp){const s=take(FXP.sparks);s.t=0;s.b=b;s.dir=Math.random()<.5;s.k=Math.min(1,Math.log10(xrp/TRADE_MIN+1)/1.3);s.m.visible=true;b.pulse=Math.min(1,b.pulse+.6+.4*s.k)}
function lockFX(b,L){b.lock={from:b.Lv,to:Math.max(b.Lv,L),t:0};const f=take(FXP.flashes);f.t=0;f.burn=0;f.m.material.color.set(0x9ffcff);f.m.position.copy(b.curve.getPoint(.5));f.m.visible=true}
function bridgeLook(b){const L=b.Lv,minor=b.minor;// neon is activity-only again (full intensity for every pool); locked share is shown by the gold Forever Rails layer
 if(b.actCol)b.solid.material.color.copy(b.actCol);else b.solid.material.color.set(0x3cf3ff);b.baseOp=minor?.3:.85;b.core.material.opacity=minor?.4:.95;b.solid.material.opacity=b.baseOp;if(b.flk)b.rail=Math.max(0,(1-L)/Math.max(.001,1-b.L))}
actScore();bridges.forEach(b=>{b.baseOp=b.solid.material.opacity});
{let af=0;anim.push(t=>{if(MOBILE&&(af++%3))return;for(const b of bridges){if(b.act==null||!b.group.visible)continue;const k=b.act,sp=.6+4.4*k*k;b.core.material.color.copy(b.actCol).lerp(WHITE_C,.55);b.core.material.opacity=(b.minor?.3:.35+.65*b.Lv)*(.55+.45*(.5+.5*Math.sin(t*sp+b.r*7)))}})}

function updFX(t,dt){
 FXP.balls.forEach(b=>{if(b.t<0)return;b.t+=dt;const k=b.t/1.5;
  if(k<1){const e=k*k;_hz.lerpVectors(b.from,b.to,e);_hz.y+=Math.sin(Math.PI*k)*30*(1-k);b.m.position.copy(_hz);b.m.scale.setScalar(2.2+(b.big?2:0)+Math.sin(t*40)*.25);b.m.material.uniforms.o.value=1;
   b.tp.copyWithin(3,0,b.tp.length-3);b.tp.set([_hz.x,_hz.y,_hz.z],0);b.trail.geometry.attributes.position.needsUpdate=true;b.trail.material.uniforms.k.value=1;return}
  if(!b.hit){b.hit=true;b.m.visible=false;burnImpact(b)}
  const k2=(b.t-1.5)/.6;b.trail.material.uniforms.k.value=Math.max(0,1-k2);if(k2>=1){b.t=-1;b.trail.visible=false}})
 if(TOR.t>=0){TOR.t+=dt;const k=TOR.t/3.8;if(k>=1){TOR.t=-1;TOR.m.visible=false}else{TOR.m.material.uniforms.o.value=Math.min(1,k*5)*Math.min(1,(1-k)*3);TOR.m.rotation.y+=dt*2.2}}
 if(haze.enabled){const ht=haze.userData.t+=dt;_hz.copy(haze.userData.p).project(C);haze.uniforms.c.value.set(_hz.x*.5+.5,_hz.y*.5+.5);haze.uniforms.t.value=t;haze.uniforms.asp.value=innerWidth/innerHeight;
  haze.uniforms.k.value=_hz.z<1?Math.min(1,ht*6)*Math.max(0,1-ht/1.6):0;if(ht>1.6)haze.enabled=false}
 FXP.rings.forEach(r=>{if(r.t===-1)return;r.t+=dt;if(r.t<0)return;const k=r.t/2.6;if(k>=1){r.t=-1;r.m.visible=false;return}r.m.scale.setScalar((2+70*easeOut(k))*(r.s||1));r.m.material.opacity=.8*(1-k)*(1-k)})
 if(embT>=0){embT+=dt;const k=embT/3.4;if(k>=1){embT=-1;emb.visible=false}else{for(let i=0;i<EMB;i++){embV[i*3+1]-=9*dt;embP[i*3]+=embV[i*3]*dt;embP[i*3+1]+=embV[i*3+1]*dt;embP[i*3+2]+=embV[i*3+2]*dt;embV[i*3]*=.985;embV[i*3+2]*=.985}embG.attributes.position.needsUpdate=true;embM.opacity=(1-k)*.95}}
 if(fxLight.userData.t!=null){const lt=fxLight.userData.t+=dt;fxLight.intensity=lt<.25?lt/.25*260:Math.max(0,260*(1-(lt-.25)/2.4));if(lt>2.7){fxLight.intensity=0;fxLight.userData.t=null}}
 FXP.sparks.forEach(s=>{if(s.t<0)return;s.t+=dt;const k=s.t/2.4;if(k>=1){s.t=-1;s.m.visible=false;return}s.b.curve.getPoint(s.dir?ease(k):1-ease(k),s.m.position);s.m.position.y+=1;s.m.scale.setScalar((12+18*s.k)*(1-.3*k));s.m.material.opacity=Math.sin(Math.PI*k)})
 FXP.flashes.forEach(f=>{if(f.t<0)return;f.t+=dt;const k=f.t/2.2;if(k>=1){f.t=-1;f.m.visible=false;return}f.m.scale.setScalar(f.burn?(10+40*easeOut(k)):(20+90*easeOut(k)));if(k>=.99)f.burn=0;f.m.material.opacity=.85*Math.sin(Math.PI*Math.min(1,k*1.3))*(1-k)})
 bridges.forEach(b=>{if(b.lock){b.lock.t+=dt;const k=ease(b.lock.t/2.6);b.Lv=b.lock.from+(b.lock.to-b.lock.from)*k;bridgeLook(b);if(b.lock.t>=2.6)b.lock=null}
  if(b.pulse>0||b.tl!=null){b.pulse=Math.max(0,b.pulse-dt*.45);b.solid.material.opacity=Math.min(1,b.baseOp*(b.tl??1)+.55*b.pulse)}})}
// ---- event queue: dedupe by tx hash, coalesce burns, rate-limit visuals ----
window.__evq=[];const evQ=window.__evq,seenTx=new Set(),burned={},burnedDemo={};let nextBig=0,nextSmall=0,evCount=0;const sinceStr=new Date().toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'});
const tStr=d=>(d||new Date()).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
const short=h=>h&&!/^(demo|recheck)/.test(h)?`<a href="https://livenet.xrpl.org/transactions/${h}" target="_blank" rel="noopener">tx ${h.slice(0,6)}…</a>`:'';
function pushEvent(e){if(e.hash&&seenTx.has(e.hash))return;if(e.hash){seenTx.add(e.hash);if(seenTx.size>1000)seenTx.delete(seenTx.values().next().value)}
 if(e.type==='trade'&&e.xrp<TRADE_MIN)return;
 if(e.type==='burn'){const q=evQ.find(x=>x.type==='burn'&&x.token===e.token&&!!x.demo===!!e.demo);if(q){q.amount+=e.amount;q.n=(q.n||1)+1;return}}
 evQ.push(e);if(evQ.length>8){const i=evQ.findIndex(x=>x.type==='trade');evQ.splice(i>=0?i:0,1)}}
function evBanner(html,col){const b=$('evbanner');b.innerHTML=html;b.style.setProperty('--c',col);b.classList.remove('show');void b.offsetWidth;b.classList.add('show');clearTimeout(b._t);if(!Q.has('shot'))b._t=setTimeout(()=>b.classList.remove('show'),4200)}
function toast(html,col){const box=$('toasts');const d=document.createElement('div');d.className='toast';d.style.setProperty('--c',col||'#3cf3ff');d.innerHTML=html;box.prepend(d);requestAnimationFrame(()=>d.classList.add('in'));
 while(box.children.length>3)box.lastChild.remove();if(!Q.has('shot'))setTimeout(()=>{d.classList.remove('in');setTimeout(()=>d.remove(),700)},6500)}
const fmtS=v=>v>=1e12?(v/1e12).toFixed(2)+'T':v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'k':(+v).toFixed(v<10?2:0);
function updCounter(){const r=Object.entries(burned).map(([k,v])=>`<b>${fmtS(v)}</b> ${k}`).join(' · '),d=Object.entries(burnedDemo).map(([k,v])=>`${fmtS(v)} ${k}`).join(' · ');
 $('burnCount').innerHTML=`🔥 Burned live since ${sinceStr}: ${r||'<span class="dim">none yet</span>'}${d?` <span class="dim">· demo: ${d}</span>`:''}`}
function runEvent(e){evCount++;try{window.__onLive&&window.__onLive(e)}catch(x){}const tag=e.demo?' <i class="demo">DEMO</i>':'';
 if(e.type==='burn'){const n=N[e.token];if(!n)return;burnFX(n,e.amount,!!e.demo);(e.demo?burnedDemo:burned)[e.token]=((e.demo?burnedDemo:burned)[e.token]||0)+e.amount;updCounter();
  evBanner(`🔥 ${fmtS(e.amount)} ${e.token} burned${tag}<small>sent to blackholed issuer${e.n>1?` · ${e.n} txs`:''} · ${tStr(e.when)} · XRPL ledger ${short(e.hash)}</small>`,e.token==='IMM'?'#7ac8ff':'#ff8a2a');ambient(e)}
 else if(e.type==='trade'){const b=bridges.find(x=>x.p.amm===e.pool.amm||x.p===e.pool);if(!b)return;b.liveVol=(b.liveVol||0)+(+e.xrp||0);actDirty=1;pulseFX(b,e.xrp);
  toast(`<b>${b.p.a} ⇄ ${b.p.b}</b> ${e.estimate?'≈':''}${fmt(Math.round(e.xrp))} XRP ${e.kind==='OfferCreate'?'DEX/AMM fill':'swap'}${e.estimate?' <i class="est">est.</i>':''}${tag}<br><span class="dim">${tStr(e.when)} · ${short(e.hash)||'XRPL'}</span>`,'#3cf3ff')}
 else if(e.type==='lock'){const b=bridges.find(x=>x.p.amm===e.pool.amm||x.p===e.pool);if(!b)return;const L=e.pct!=null?e.pct/100:Math.min(1,b.Lv+.15);lockFX(b,L);chime();b.p.locked_pct=Math.max(b.p.locked_pct,L*100);
  evBanner(`🔒 LP LOCKED · ${b.p.a} ⇄ ${b.p.b}${tag}<small>${(L*100).toFixed(1)}% of LP tokens now in blackholed wallets · ${e.source==='recheck'?'periodic ledger recheck':'XRPL ledger '+short(e.hash)} · ${tStr(e.when)}</small>`,'#3cf3ff')}}
function ambient(e){if(e&&e.type==='burn')crackle()}
function pumpEvents(t){if(!evQ.length)return;const now=performance.now();const i=evQ.findIndex(e=>e.type!=='trade');
 if(i>=0&&now>=nextBig){runEvent(evQ.splice(i,1)[0]);nextBig=now+4800;nextSmall=Math.max(nextSmall,now+900);return}
 const j=evQ.findIndex(e=>e.type==='trade');if(j>=0&&now>=nextSmall){runEvent(evQ.splice(j,1)[0]);nextSmall=now+1400}}
// ---- status dot ----
function setStatus(s,info){const el=$('live');el.className=s;el.querySelector('span').textContent=s==='live'?`Live · ledger ${info.ledger?(+info.ledger).toLocaleString():'…'}`:s==='connecting'?'Connecting to XRPL…':s==='reconnecting'?`Reconnecting${info.inMs?` in ${Math.round(info.inMs/1000)}s`:''}…`:s==='demo'?'Demo events (no live feed)':'Offline';el.title=info.endpoint?`XRPL websocket: ${info.endpoint} (read-only)`:''}
// ---- demo triggers: ?demo=1 (random stream), ?demo=burn|trade|lock|all (one shot each, for previews/tests), ?live=0 disables ws ----
const DEMO=Q.get('demo');let demoN=0;
function demoEvent(kind){const big=bridges.filter(b=>!b.minor).sort((a,b)=>b.p.tvl_xrp-a.p.tvl_xrp);const id='demo-'+(demoN++);
 if(kind==='burn'){const tk=['BURN','BURN','XRPyro','IMM','IMG'][demoN%5];return{type:'burn',token:tk,amount:Math.round(1e6+Math.random()*4e7),hash:id,demo:1,when:new Date()}}
 if(kind==='bigburn'){const tk=Q.get('demoToken')||'BURN',n=N[tk]||N.BURN;return{type:'burn',token:n.name,amount:Math.max(1e9,(n.circ||1e9)*.015),hash:id,demo:1,when:new Date()}}
 if(kind==='trade'){const b=big[demoN%Math.min(10,big.length)];return{type:'trade',pool:b.p,xrp:TRADE_MIN*(1+Math.random()*6),hash:id,demo:1,when:new Date(),kind:Math.random()<.5?'Payment':'OfferCreate',estimate:!(b.p.a==='XRP'||b.p.b==='XRP')}}
 const cand=big.filter(b=>b.Lv<.6);const b=cand[demoN%Math.max(1,cand.length)]||big[0];return{type:'lock',pool:b.p,pct:Math.min(100,b.Lv*100+20+Math.random()*15),hash:id,demo:1,when:new Date(),source:'demo'}}
if(DEMO){const kinds=DEMO==='1'?null:DEMO==='all'?['burn','trade','lock']:DEMO==='burn'?['burn','bigburn']:DEMO.split(',');
 if(kinds){window.__startDemo=()=>{let d=+(Q.get('demoDelay')||600);kinds.forEach(k=>{setTimeout(()=>pushEvent(demoEvent(k)),d);d+=k==='trade'?300:k==='burn'?+(Q.get('bigDelay')||5000):600})}}
 else{const loop=()=>{const r=Math.random();pushEvent(demoEvent(r<.5?'trade':r<.8?'burn':'lock'));setTimeout(loop,+(Q.get('demoMs')||4000)*(.6+Math.random()*.8))};setTimeout(loop,1500)}}
let feed=null;
if(Q.get('live')!=='0'&&!Q.has('shot')){import('./live.js').then(({LiveFeed})=>{feed=new LiveFeed(E,{onEvent:pushEvent,onStatus:setStatus,burnTokens:['BURN','IMM','IMG','XRPyro','Budzy','$BTCK','BCHAMP']}).start();window.__feed=feed}).catch(()=>setStatus('offline',{}))}
else setStatus(DEMO?'demo':'offline',{});
updCounter();

// ---------- Replay: real day-by-day city history (js/replay.js lazily loads history.js) ----------
let RP=null;
window.__BC={E,N,bridges,layoutMarks,orbit,C,$,setMode:m=>setMode(m),minorVisible:()=>$('minor').checked,
 overview:()=>({cam:fitW(V3(352,235,348),V3(0,22,0)),tgt:V3(0,22,0)})};
$('tlOpen').onclick=async()=>{try{RP=RP||(await import('./replay.js')).init(window.__BC);RP.open()}catch(e){console.warn('replay',e)}};
if(Q.get('replay')==='1')setTimeout(()=>$('tlOpen').click(),1500);
function updTL(dt){if(RP)RP.update(dt)}

// ---------- graphics setting + shareable links + data-source labels ----------
$('quality').value=TIERS[qPref]?qPref:'auto';$('qInfo').textContent=qPref==='auto'?`auto → ${TIER}`:'';
$('quality').onchange=e=>{localStorage.setItem('bc_quality',e.target.value);$('loader').classList.remove('done');window.__load(.05,'Applying graphics: '+e.target.value);setTimeout(()=>{const u=new URL(location.href);u.searchParams.delete('q');location.replace(u)},250)};
$('copyLink').onclick=()=>{const u=new URL(location.origin+location.pathname),r1=v=>v.toFixed(1);
 if(mode==='explore'){u.searchParams.set('mode','explore');u.searchParams.set('pos',[P.pos.x,P.pos.z,yp.yaw].map(r1).join(','))}
 else{const tg=orbit.target;u.searchParams.set('cam',[C.position.x,C.position.y,C.position.z,tg.x,tg.y,tg.z].map(r1).join(','));if(mode==='fly')u.searchParams.set('mode','fly')}
 if(wMode!=='auto')u.searchParams.set('weather',wMode);if(+$('tod').value>0)u.searchParams.set('tod',$('tod').value);
 const s=u.toString();const ok=()=>toast(`🔗 Link copied<br><span class="dim">${s.length>70?s.slice(0,70)+'…':s}</span>`,'#9ffcff');
 (navigator.clipboard?navigator.clipboard.writeText(s).then(ok,()=>prompt('Copy this link',s)):prompt('Copy this link',s))};
{const d=new Date(E.ts.replace(' ','T')+(E.ts.endsWith('Z')?'':'Z'));const ds=isNaN(d)?E.ts:d.toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',timeZoneName:'short'});
 $('src').innerHTML=`Pools, TVL &amp; LP locks: XRPL ledger snapshot <b>${ds}</b><br>Prices, 24h change &amp; volume: <a href="https://xrpl.to" target="_blank" rel="noopener">Data by xrpl.to</a><br>Live events: XRPL websocket · <i class="est">est.</i> = estimated (non-XRP pools valued at xrpl.to price) · big trade ≥ ${fmt(TRADE_MIN)} XRP`}

// ---------- main loop ----------
const clk=new THREE.Clock();let fpsN=0,fpsT0=performance.now(),fpsA=60,lowT=0,lastHud=-1,fr=0;
function frame(){requestAnimationFrame(frame);R.info.reset();const dt=Math.min(clk.getDelta(),.05),t=clk.elapsedTime;U.t.value=t;fr++;
 if($('todCycle').checked)$('tod').value=(.5-.5*Math.cos(t*.02)).toFixed(3);const day=+$('tod').value;U.day.value=day;
 if(wMode==='cycle'){const seq=['clear','fog','rain','storm'];wTarget=W[seq[Math.floor(t/30)%4]]}
 for(const k in wCur)wCur[k]+=(wTarget[k]-wCur[k])*Math.min(1,dt*.5);SKY(dt,t,wCur,+$('tod').value);
 S.fog.density=wCur.fog*.8*(1-day*.4)*Math.min(1,480/Math.max(1,C.position.length()));{const dk=1-.6*wCur.storm;S.fog.color.setRGB((.023+day*.45)*dk,(.04+day*.5)*dk,(.11+day*.55)*dk)}U.wet.value=wCur.wet;U.storm.value=wCur.storm;rain.uniforms.amt.value=Math.min(1,wCur.rain);rain.uniforms.cam.value.copy(C.position);banks(wCur.banks,t);
 hemi.intensity=(.55+day*1.4)*(1-.45*wCur.storm);amb.intensity=.35+day*.6;R.toneMappingExposure=1.05+day*.15;stars.material.opacity=1-day;moon.material.opacity=1-day*.8;bloom.strength=.7-day*.35+wCur.wet*.08;
 if(wCur.storm>.5){nextBolt-=dt;if(nextBolt<0){lightning();nextBolt=3+Math.random()*7}}
 if(boltT>0){boltT-=dt;U.flash.value=Math.max(0,boltT*3.3)*(Math.random()<.7?1:.3);flashL.intensity=U.flash.value*3;bolt.material.opacity=Math.min(1,boltT*5)}else{bolt.visible=false;U.flash.value=0;flashL.intensity=0}
 if(aud.rg)aud.rg.gain.value=Math.min(1,wCur.rain)*.35;
 if(shoot.t<0&&day<.5&&Math.random()<dt*.08){shoot.t=0;shoot.a=V3((Math.random()-.5)*3000,900+Math.random()*500,-1500-Math.random()*800);shoot.d=V3(-Math.random()-.5,-.35,Math.random()*.4).normalize()}
 if(shoot.t>=0){shoot.t+=dt;const a=shoot.a.clone().addScaledVector(shoot.d,shoot.t*1400);shoot.line.geometry.setFromPoints([a,a.clone().addScaledVector(shoot.d,-160)]);shoot.line.material.opacity=Math.max(0,1-shoot.t);if(shoot.t>1){shoot.t=-1;shoot.line.material.opacity=0}}
 anim.forEach(f=>f(t,dt));updFX(t,dt*FXW);pumpEvents(t);updTL(dt);search.forEach(f=>f(t));updCars(dt);updGround(dt);steam(dt);drones(t);freighter(t);
 if(mode==='explore')updExplore(dt);else if(mode==='fly')updFly(dt);if(DRONE)DRONE.show(mode==='fly');
 else if(mode==='tour'&&tour){tour.t=Math.min(1,tour.t+dt/80);C.position.copy(tour.cam.getPoint(tour.t));C.lookAt(tour.look.getPoint(tour.t));tourCap(tour.t);if(tour.t>=1){setMode('orbit');$('tourCap').classList.remove('show')}}
 else{orbit.autoRotate=!Q.has('shot')&&$('info').style.display!=='block';orbit.update()}
 let _sh=null;if(SHAKE.a>.01){SHAKE.a*=Math.exp(-dt*3);_sh=V3((Math.random()-.5),(Math.random()-.5),(Math.random()-.5)).multiplyScalar(SHAKE.a);C.position.add(_sh)}
 if(bokeh.enabled)bokeh.uniforms.focus.value=mode==='explore'?6.5:C.position.distanceTo(orbit.target);
 comp.render();if(_sh)C.position.sub(_sh);updLabels();if(t-lastHud>.25){updMinimap();lastHud=t}
 {const now=performance.now();fpsN++;if(now-fpsT0>=1000){fpsA=fpsN*1000/(now-fpsT0);fpsN=0;fpsT0=now;window.__info={calls:R.info.render.calls,tris:R.info.render.triangles,geo:R.info.memory.geometries,tex:R.info.memory.textures,progs:R.info.programs.length}}}if(fr%15===0)$('fps').textContent=Math.round(fpsA)+' fps'+(MOBILE?' · mobile':'');window.__fps=fpsA;
 if(!Q.has('shot')&&fpsA<28&&t>5){lowT+=dt;if(lowT>3&&PR>.8){PR=Math.max(.75,PR-.25);R.setPixelRatio(PR);comp.setPixelRatio(PR);lowT=0}}else lowT=0}
setMode('orbit');
if(VQ==='explore'){setMode('explore');P.pos.copy(np('BURN',.66,0));yp.yaw=Math.atan2(-(N.BURN.pos.x-P.pos.x),-(N.BURN.pos.z-P.pos.z));yp.pitch=.05;C.position.copy(P.pos).add(V3(0,3,0))}
if(Q.get('mode')==='fly')setMode('fly');
if(Q.get('mode')==='explore'&&VQ!=='explore'){setMode('explore');const p=(Q.get('pos')||'').split(',').map(Number);if(p.length===3&&p.every(isFinite)){P.pos.set(p[0],groundAt(p[0],p[1],99),p[1]);yp.yaw=p[2]}else{P.pos.copy(np('BURN',.66,0))}C.position.copy(P.pos).add(V3(0,3,0))}
// ---- view menu: Esc releases pointer lock + pause menu, 1-4 hotkeys, touch Exit button, smooth camera hand-off
(()=>{const css=document.createElement('style');css.textContent=`#vExit{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:60;min-width:44px;min-height:44px;padding:0 16px;font:600 15px monospace;color:#fff;background:rgba(20,8,4,.82);border:1px solid #ff7a1a;border-radius:10px;cursor:pointer;display:none}
#vMenu{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}#vMenu.on{display:flex}
#vMenu>div{background:rgba(18,10,8,.95);border:1px solid #ff7a1a;border-radius:14px;padding:18px;display:grid;gap:10px;min-width:220px;font:14px monospace;color:#ffd9b0;text-align:center}
#vMenu button{min-height:44px;font:600 15px monospace;color:#fff;background:#2a140a;border:1px solid #ff9a3a;border-radius:10px;cursor:pointer}#vMenu button:hover{background:#ff7a1a}
#vHint{position:fixed;top:64px;left:50%;transform:translateX(-50%);z-index:60;padding:8px 14px;font:14px monospace;color:#fff;background:rgba(0,0,0,.7);border-radius:8px;pointer-events:none;opacity:0;transition:opacity .4s}#vHint.on{opacity:1}`;document.head.appendChild(css);
const ex=document.createElement('button');ex.id='vExit';ex.textContent='✕ Exit';ex.setAttribute('aria-label','Exit view / view menu');document.body.appendChild(ex);
const hint=document.createElement('div');hint.id='vHint';document.body.appendChild(hint);
const mn=document.createElement('div');mn.id='vMenu';mn.innerHTML='<div><b>Paused · choose view</b><button data-v="orbit">1 ◎ Orbit</button><button data-v="fly">2 ✈ Fly</button><button data-v="tour">3 ▶ Tour</button><button data-v="resume">4 ↩ Resume</button></div>';document.body.appendChild(mn);
let tw=null;const menuOn=()=>mn.classList.contains('on'),hide=()=>mn.classList.remove('on');
const show=()=>{if(document.pointerLockElement)document.exitPointerLock();mn.classList.add('on')};
function go(v){hide();const from=mode;
 if(v==='resume'){if(!MOBILE&&(mode==='fly'||mode==='explore'))R.domElement.requestPointerLock?.();return}
 if(v==='tour'){$('tour').click();return}
 const p0=C.position.clone(),q0=C.quaternion.clone();setMode(v);
 if(v==='orbit'&&(from==='explore'||from==='fly')){const tgt=orbit.target.clone(),dir=p0.clone().sub(tgt).setY(0);if(dir.lengthSq()<1)dir.set(0,0,1);
  const p1=tgt.clone().add(dir.normalize().multiplyScalar(140)).setY(Math.max(70,p0.y));tw={t:0,p0,p1,q0,tgt}}}
mn.addEventListener('click',e=>{const b=e.target.closest('button');if(b)go(b.dataset.v);else if(e.target===mn)go('resume')});
ex.onclick=e=>{e.stopPropagation();menuOn()?go('resume'):show()};
let hintT;const tip=m=>{hint.textContent=MOBILE?'Tap ✕ Exit to change view':'Esc to exit · 1 Orbit · 2 Fly · 3 Tour';hint.classList.add('on');clearTimeout(hintT);hintT=setTimeout(()=>hint.classList.remove('on'),4000)};
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&(mode==='explore'||mode==='fly')&&!tw)show()});
addEventListener('keydown',e=>{if(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
 if(e.code==='Escape'){if(menuOn())go('resume');else if(mode!=='orbit')show();return}
 const k={Digit1:'orbit',Digit2:'fly',Digit3:'tour',Digit4:'resume'}[e.code];if(k&&(menuOn()||mode!=='orbit'||k!=='resume'))go(k)});
const sm=setMode;let last='';setInterval(()=>{const vis=mode==='explore'||mode==='fly';ex.style.display=vis?'block':'none';if(vis&&last!==mode)tip();last=mode},150);
(function step(){requestAnimationFrame(step);if(!tw)return;if(mode!=='orbit'){tw=null;return}tw.t=Math.min(1,tw.t+1/60);const k=tw.t*tw.t*(3-2*tw.t);
 C.position.lerpVectors(tw.p0,tw.p1,k);const q1=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(C.position,tw.tgt,C.up));C.quaternion.slerpQuaternions(tw.q0,q1,k);if(tw.t>=1)tw=null})();
})();
// ---------- static batching: merge non-animated meshes that share an equivalent material, per parent group ----------
// Animated objects are detected by simulating the animation callbacks and diffing transforms/material state, so nothing that moves gets frozen.
function batchStatic(){const t0=performance.now();bridges.forEach(b=>{b.solid.userData.noBatch=b.core.userData.noBatch=1});
 const mk=m=>[m.type,m.color&&m.color.getHex(),m.emissive&&m.emissive.getHex(),m.emissiveIntensity,m.metalness,m.roughness,m.opacity,m.transparent,m.blending,m.side,m.depthWrite,m.vertexColors,m.map&&m.map.uuid,m.wireframe,m.fog].join('|');
 const cand=[];S.traverse(o=>{if(!(o.isMesh||o.isLineSegments)||o.isInstancedMesh||!o.parent||o.userData.kind||o.userData.noBatch||!o.visible||!o.material||Array.isArray(o.material)||o.material.isShaderMaterial||o.material.visible===false||o.morphTargetInfluences||!o.geometry.attributes.position)return;
  if(o.isLine&&!o.isLineSegments)return;cand.push(o)});
 const snap=()=>cand.map(o=>{o.updateMatrix();let v=o.visible;for(let p=o.parent;p;p=p.parent)if(p.userData.noBatch)v='x';return o.matrix.elements.join(',')+mk(o.material)+v});
 const a=snap();for(const tt of [0.37,1.91,4.43,7.7]){anim.forEach(f=>f(tt,.016));search.forEach(f=>f(tt));drones(tt);freighter(tt)}const b2=snap();
 const groups=new Map();cand.forEach((o,i)=>{if(a[i]!==b2[i])return;const k=o.parent.uuid+'#'+(o.isLineSegments?'L':'M')+mk(o.material);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o)});
 let removed=0;groups.forEach(list=>{if(list.length<2)return;
  const gs=list.map(o=>{let g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();o.updateMatrix();g.applyMatrix4(o.matrix);for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);return g});
  const keys=Object.keys(gs[0].attributes).join();if(!gs.every(g=>Object.keys(g.attributes).join()===keys))return;
  const mg=mergeGeometries(gs,false);gs.forEach(g=>g.dispose());if(!mg)return;
  const M=list[0].isLineSegments?new THREE.LineSegments(mg,list[0].material):new THREE.Mesh(mg,list[0].material);M.renderOrder=list[0].renderOrder;list[0].parent.add(M);
  list.forEach(o=>{o.parent.remove(o);removed++});M.userData.batched=list.length});
 return {removed,ms:Math.round(performance.now()-t0)}}
await stage(.88,'Optimizing draw calls');window.__batch=batchStatic();
await stage(.92,'Compiling shaders');fxObjs.forEach(o=>o.visible=true);R.compile(S,C);comp.render();fxObjs.forEach(o=>o.visible=false);
await stage(.98,'Starting');
frame();window.__ready=true;window.__readyMs=performance.now();window.__startDemo&&window.__startDemo();requestAnimationFrame(()=>requestAnimationFrame(()=>{window.__load(1,'Ready');if(Q.has('shot'))$('loader').style.transition='none';$('loader').classList.add('done')}));
addEventListener('resize',()=>{C.aspect=innerWidth/innerHeight;C.updateProjectionMatrix();R.setSize(innerWidth,innerHeight);comp.setSize(innerWidth,innerHeight);labelEls.forEach(l=>l.w=0)});
