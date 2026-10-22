// BURN CITY v2 — read-only 3D visualization of the BURN ecosystem AMM graph on the XRP Ledger.
import * as THREE from 'three';
import {buildEstate,estateCard,estateLake} from './estate.js';
import {initDrone} from './drone.js';
import {buildWalker,poseWalker} from './walker.js';
import './skate.js';
import './citylife.js';
import './streetprops.js';
import './events.js';
import './airport.js';
import {makeRainbow} from './rainbow.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {BokehPass} from 'three/addons/postprocessing/BokehPass.js';
import {getBloomComparisonPreset,isBloomComparisonPreset} from './bloom-comparison-presets.mjs';
import {Reflector} from 'three/addons/objects/Reflector.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {PlayerState,NetClient} from './net.js';
import './goldlock.js';   // globalThis.BCGold: the ONE strict gold rule (>=95% LP black-holed AND TVL >= 5000 XRP), shared with server/eco.js

// ---------- config / device ----------
const Q=new URLSearchParams(location.search);
const MOBILE=matchMedia('(pointer:coarse)').matches||/Mobi|Android|iPhone|iPad/.test(navigator.userAgent)||Q.has('mobile');
const TIERS={low:{pr:1,cars:48,rain:600,trees:50,bloomScale:.35,reflect:false,sats:.3,fx:.2,aa:false},medium:{pr:1.25,cars:160,rain:2200,trees:160,bloomScale:.5,reflect:false,sats:.6,fx:.45,aa:false},high:{pr:1.75,cars:480,rain:6500,trees:360,bloomScale:1,reflect:true,sats:1,fx:1,aa:true}};
const qPref=Q.get('q')||localStorage.getItem('bc_quality')||'auto';
const autoTier=()=>{const cores=navigator.hardwareConcurrency||4,mem=navigator.deviceMemory||4;if(MOBILE)return(cores<=4||mem<=3)?'low':'medium';return(cores<=2||mem<=2)?'medium':'high'};
const TIER=TIERS[qPref]?qPref:autoTier();const LV=TIERS[TIER];
// phones: High = medium+ (no 2nd-scene reflector, capped DPR, no MSAA, half-res bloom, fewer cars/rain/trees)
if(MOBILE&&TIER==='high')Object.assign(LV,{pr:1.4,aa:false,bloomScale:.5,reflect:false,cars:240,rain:3000,trees:200,sats:.8});
const stage=(p,txt)=>new Promise(r=>{window.__load&&window.__load(p,txt);requestAnimationFrame(()=>setTimeout(r,0))});
const E=window.ECO;const $=id=>document.getElementById(id);
const fmt=(n,d)=>n==null||isNaN(n)?'—':(+n).toLocaleString(undefined,{maximumFractionDigits:d??(Math.abs(n)<1?10:0)});
const pct=n=>n==null?'—':(n>=0?'▲':'▼')+Math.abs(n).toFixed(2)+'%';
const rnd=(s=>()=>(s=(s*16807)%2147483647)/2147483647)(1337); // deterministic layout

// ---------- renderer / scene ----------
const R=new THREE.WebGLRenderer({antialias:LV.aa,powerPreference:'high-performance',preserveDrawingBuffer:Q.has('shot')});
// production: skip the per-shader error queries (getShaderInfoLog/getProgramParameter) that force a GPU sync for every program at startup
R.debug.checkShaderErrors=Q.has('debug')||Q.has('shadercheck');window.__progs=()=>R.info.programs.length;window.__R=R;
let PR=Math.min(devicePixelRatio,LV.pr);R.setPixelRatio(PR);R.setSize(innerWidth,innerHeight);
R.info.autoReset=false;R.toneMapping=THREE.ACESFilmicToneMapping;R.toneMappingExposure=1.05;document.body.prepend(R.domElement);
const S=new THREE.Scene();window.__S=S;S.fog=new THREE.FogExp2(0x060a1c,0.0019);
// ---- image-based lighting: one small prefiltered env map (built once, ~1 ms per frame cost at most) so metals, gold and glass
// reflect a dark night sky with a warm ember horizon and a few soft city panels instead of rendering as flat plastic.
// Deliberately dim: reflections should read as sheen, never as extra neon. ?noenv=1 disables it for A/B checks.
if(!Q.has('noenv'))try{const es=new THREE.Scene(),pm=new THREE.PMREMGenerator(R);
 es.add(new THREE.Mesh(new THREE.SphereGeometry(50,32,16),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,vertexShader:'varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'varying vec3 d;void main(){float y=d.y;vec3 zen=vec3(.012,.016,.035),hor=vec3(.16,.07,.035),gnd=vec3(.02,.016,.02);vec3 c=y>0.?mix(hor,zen,pow(clamp(y,0.,1.),.45)):mix(hor*.6,gnd,clamp(-y*4.,0.,1.));c+=vec3(.5,.16,.04)*exp(-abs(y)*28.)*.5;gl_FragColor=vec4(c,1.);}'})));
 const pan=(c,k,w,h,x,y,z)=>{const m=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({color:new THREE.Color(c).multiplyScalar(k),side:2}));m.position.set(x,y,z);m.lookAt(0,0,0);es.add(m)};
 pan(0xffb070,1.6,14,3,0,22,-36);pan(0xff6a2a,1.2,18,2,34,8,10);pan(0x9fb8ff,.7,10,8,-32,14,14);pan(0xffd6a0,1.1,6,6,10,40,8);pan(0x6a8cff,.45,30,4,0,6,38);
 S.environment=pm.fromScene(es,.04).texture;pm.dispose();es.traverse(o=>{o.geometry&&o.geometry.dispose();o.material&&o.material.dispose()})}catch(e){console.warn('env map',e)}

const C=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,0.3,4000);C.position.set(210,140,260);
const hemi=new THREE.HemisphereLight(0x4466ff,0x180a22,.55);S.add(hemi);const amb=new THREE.AmbientLight(0x223355,.35);S.add(amb);
const moonL=new THREE.DirectionalLight(0x9db8ff,.35);moonL.position.set(-300,400,-500);S.add(moonL);
const U={t:{value:0},day:{value:0},wet:{value:0},flash:{value:0},storm:{value:0},sunD:{value:new THREE.Vector3(.55,.3,-.78).normalize()}};   // no AEGIS sky tint: the AEGIS feed never touches weather or sky
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
// ---------- tower scale: height = log10(market cap), one fixed ruler for every token (100 XRP -> 12 u, +15.4 u per 10x, 1B XRP ~ 120 u);
// footprint AREA = TVL (width = sqrt of TVL relative to the deepest non-XRP token). XRP is the hub and keeps its own fixed size.
const mcOf=n=>n.name==='XRP'?null:n.mcap!=null?n.mcap:n.mcap_amm!=null?n.mcap_amm:null;
let MAXT=Math.max(1,...E.nodes.filter(n=>n.name!=='XRP').map(n=>n.tvl||0));
function towerH(n){if(n.name==='XRP')return 125;const v=n.mc!=null?n.mc:n.tvl;return Math.min(122,Math.max(12,12+15.4*(Math.log10(Math.max(100,v||0))-2)))}
function towerW(n){return n.name==='XRP'?11:+(2+7.5*Math.sqrt(Math.max(0,n.tvl||0)/MAXT)).toFixed(2)}
E.nodes.forEach((n,i)=>{const th=THEME[n.name]||{c:MINORC[i%MINORC.length]};n.th=th;n.col=new THREE.Color(th.c);
 // HEIGHT = market cap in XRP (circulating supply x AMM price, log scale); BASE WIDTH = pool TVL in XRP (sqrt scale)
 n.mc=mcOf(n);n.h=towerH(n);
 n.w=towerW(n);
 n.distR=n.name==='XRP'?66:n.minor?n.w*3.4+5:n.landmark?n.w*2.4+14:n.w*3+28;});

await stage(0.12,'Sky & terrain');
// ---------- sky, moon, stars, aurora, mountains ----------
const sky=new THREE.Mesh(new THREE.SphereGeometry(3000,48,24),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,fog:false,uniforms:U,defines:TIER==='low'?{LOWQ:''}:{},
vertexShader:`varying vec3 d;void main(){d=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
fragmentShader:`uniform float t,day,flash,storm;uniform vec3 sunD;varying vec3 d;${NOISE}
void main(){float y=max(d.y,0.);vec3 night=mix(vec3(.02,.03,.09),vec3(.004,.006,.02),pow(max(0.,y),.5));
vec2 p=d.xz/(d.y+.25);float neb=fbm(p*1.2+vec2(t*.003,0.));vec3 nebc=mix(vec3(.25,.05,.4),vec3(.02,.2,.45),fbm(p*.7+3.))*smoothstep(.45,.9,neb)*.55*(1.-storm);
float aur=smoothstep(.02,.3,y)*(1.-smoothstep(.22,.65,y))*smoothstep(-.2,.6,-d.z);float band=sin(d.x*9.+fbm(vec2(d.x*3.,t*.05))*6.+t*.2)*.5+.5;
vec3 aurc=mix(vec3(0.,1.,.6),vec3(.3,.4,1.),y*2.)*aur*band*fbm(vec2(d.x*12.,t*.1+y*4.))*.9*(1.-storm*.9)*(1.-day);
vec3 c=night+nebc*(1.-day)+aurc;vec3 dayc=mix(vec3(.62,.74,.88),vec3(.16,.36,.74),pow(max(0.,y),.55));vec3 sd=sunD;float sdt=max(dot(d,sd),0.);
dayc+=vec3(1.,.92,.75)*(pow(sdt,1400.)*8.+pow(sdt,90.)*.5+pow(sdt,8.)*.18);
float cu=fbm(p*.32+vec2(t*.012,t*.004));
#ifdef LOWQ
float cmk=smoothstep(.6,.82,cu)
#else
float cmk=smoothstep(.52,.78,cu)
#endif
*smoothstep(.0,.14,y)*(1.-storm);
vec3 cloud=mix(vec3(.7,.74,.82),vec3(1.,.99,.97),smoothstep(.5,.9,fbm(p*1.1+1.7)))+vec3(1.,.85,.6)*pow(sdt,6.)*.4;dayc=mix(dayc,cloud,cmk*.8);
float gh=smoothstep(.02,.15,day)*(1.-smoothstep(.18,.42,day));
vec3 ncl=mix(vec3(.03,.035,.06)*(.7+cu*.5),mix(vec3(.55,.32,.38),vec3(1.,.55,.3),pow(sdt,3.))*(.55+cu*.4),gh*1.6);c=mix(c,ncl,cmk*.7*(1.-day));
c=mix(c,dayc,day);
float se=smoothstep(-.05,.03,sd.y)*(1.-storm*.9);vec3 sc=mix(vec3(1.,.42,.12),vec3(1.,.95,.82),smoothstep(.15,.6,day));
c+=sc*(smoothstep(.9993,.9996,sdt)*1.6*(1.-cmk*.6)+pow(sdt,400.)*.45+pow(sdt,30.)*.06)*se*(1.-day*.5);c+=vec3(1.,.48,.22)*pow(1.-y,5.)*gh*.5*(1.-storm);
float cl=fbm(p*.9+vec2(t*.02,t*.01));c=mix(c,mix(vec3(.04,.045,.06),vec3(.45,.47,.5),day)*(.6+cl*.6),storm*smoothstep(.3,.7,cl+.2));
c+=vec3(.6,.65,1.)*flash*(.4+cl);c+=vec3(.25,.1,.05)*pow(max(0.,1.-y),8.)*(1.-day);gl_FragColor=vec4(c,1.);}`}));S.add(sky);
const moonTexOld=0&&(()=>{const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');const g=x.createRadialGradient(128,128,40,128,128,128);g.addColorStop(0,'rgba(220,230,255,1)');g.addColorStop(.42,'rgba(200,215,255,.95)');g.addColorStop(.47,'rgba(150,170,255,.25)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,256,256);
 x.globalAlpha=.12;x.fillStyle='#4a5a8a';for(let i=0;i<14;i++){x.beginPath();x.arc(90+rnd()*80,90+rnd()*80,4+rnd()*14,0,7);x.fill()}return new THREE.CanvasTexture(c)})();
// moon: real lunar phase (synodic 29.53 d from the 2000-01-06 new moon), soft crater mottling, separate additive glow
const moonPh=(((Date.now()-947182440000)/864e5)%29.530588)/29.530588;
const moonTex=(()=>{const N=256,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d'),R0=74,m=N/2;
 x.fillStyle='rgba(40,50,80,.55)';x.beginPath();x.arc(m,m,R0,0,7);x.fill();   // earthshine on the dark side
 x.save();x.beginPath();const k=Math.cos(moonPh*2*Math.PI),wax=moonPh<.5;   // lit region = half disc + terminator ellipse
 x.arc(m,m,R0,-Math.PI/2,Math.PI/2,!wax);x.ellipse(m,m,Math.abs(k)*R0,R0,0,Math.PI/2,-Math.PI/2,(k>0)!==wax);x.closePath();
 const g=x.createRadialGradient(m-20,m-20,10,m,m,R0);g.addColorStop(0,'#f4f6ff');g.addColorStop(1,'#bcc8ec');x.fillStyle=g;x.fill();x.clip();
 x.globalAlpha=.13;x.fillStyle='#4a5a8a';for(let i=0;i<16;i++){x.beginPath();x.arc(m-50+rnd()*100,m-50+rnd()*100,4+rnd()*13,0,7);x.fill()}x.restore();return new THREE.CanvasTexture(c)})();
const glowTex=(()=>{const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(190,210,255,.55)');g.addColorStop(.3,'rgba(150,175,255,.18)');g.addColorStop(1,'rgba(0,0,0,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new THREE.CanvasTexture(c)})();
const moon=new THREE.Sprite(new THREE.SpriteMaterial({map:moonTex,fog:false,depthWrite:false,transparent:true}));moon.scale.setScalar(230);moon.renderOrder=-1;S.add(moon);
const moonGlow=new THREE.Sprite(new THREE.SpriteMaterial({map:glowTex,fog:false,depthWrite:false,transparent:true,blending:THREE.AdditiveBlending}));moonGlow.scale.setScalar(900);moonGlow.renderOrder=-2;S.add(moonGlow);
function placeSky(day,storm){const h=phxHourA(),y=Math.max(-.3,Math.min(.85,day*.95-.18)),am=h>=2&&h<12.5&&!Q.has('tod'),xz=Math.sqrt(1-y*y);
 U.sunD.value.set((am?-.58:.58)*xz,y,-.81*xz).normalize();const mv=V3(-U.sunD.value.x*.4,Math.max(.16,.3-y*.35),-.85).normalize().multiplyScalar(2000);
 moon.position.copy(mv);moonGlow.position.copy(mv);const nm=Math.min(1,Math.max(0,(.55-day)/.4))*(1-storm*.85);moon.material.opacity=Math.max(nm,(1-day)*.2);moonGlow.material.opacity=nm*(.35+.65*Math.sin(moonPh*Math.PI));
 moonL.position.copy(mv).multiplyScalar(.25);}
function phxHourA(){const d=new Date(Date.now()-7*3600e3);return d.getUTCHours()+d.getUTCMinutes()/60}
const stars=(()=>{const N=TIER==='low'?1400:TIER==='medium'?3200:5200,g=new THREE.BufferGeometry(),p=[],c=[],q=[];for(let i=0;i<N;i++){const th=rnd()*6.283,ph=Math.acos(rnd()*.95);const r=2600;p.push(r*Math.sin(ph)*Math.cos(th),r*Math.cos(ph),r*Math.sin(ph)*Math.sin(th));const k=.6+rnd()*.4,w=rnd();c.push(k*(w<.15?1:.85+w*.15),k*(w>.9?.85:1),1);q.push(rnd()*6.283,rnd()<.06?3.2:1.2+rnd()*1.4)}
 g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(c,3));g.setAttribute('tw',new THREE.Float32BufferAttribute(q,2));
 const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,vertexColors:true,uniforms:{t:U.t,opacity:{value:1},pr:{value:R.getPixelRatio()}},
  vertexShader:`attribute vec2 tw;uniform float t,pr;varying vec3 vc;varying float a;void main(){vc=color;float s=sin(t*(1.3+fract(tw.x)*2.)+tw.x*7.);a=.55+.45*s;gl_PointSize=tw.y*pr*(.85+.25*s);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader:`uniform float opacity;varying vec3 vc;varying float a;void main(){vec2 d=gl_PointCoord-.5;float r=dot(d,d);if(r>.25)discard;gl_FragColor=vec4(vc,opacity*a*(1.-r*3.2));}`});
 const s=new THREE.Points(g,m);s.frustumCulled=false;S.add(s);m.uniforms.opacity.value=1;s.material.__op=m.uniforms.opacity;return s})();
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
 void main(){vec2 p=v;float d=length(p);vec3 base=mix(vec3(.014,.018,.032),vec3(.105,.11,.122),day);float a=refl>.5?mix(.84,1.,smoothstep(420.,555.,d)):1.;
 vec2 g=abs(fract(p/14.)-.5);float grid=smoothstep(.485,.5,max(g.x,g.y))*.5;
 vec2 blk=floor(p/42.);float bt=h21(blk);vec2 tl=abs(fract(p/2.8)-.5);float seam=smoothstep(.47,.5,max(tl.x,tl.y));
 vec3 pave=base*(.93+.14*bt)*(1.-.22*seam)*(.9+.2*vn(p*.7));pave=mix(pave,pave*vec3(1.06,1.,.92),day*bt);
 vec3 c=mix(pave,base,smoothstep(380.,700.,d))+vec3(.5,.2,.06)*grid*.22*exp(-d*.004)*(.5+.5*sin(d*.04-t*1.2))*(1.-day*.8);
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
const RIVER_BR={value:Array.from({length:24},()=>new THREE.Vector2())};   // avenues crossing the river: unit directions, filled once the streets exist (deck = the road below, ember rails)
const river=new THREE.Mesh(new THREE.RingGeometry(75,87,160,1),new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:true,uniforms:{...fogU(),t:U.t,day:U.day,brd:RIVER_BR},
 vertexShader:`varying vec2 v;\n${FOGV}\nvoid main(){v=position.xy;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
 fragmentShader:`uniform float t,day;uniform vec2 brd[24];varying vec2 v;\n#include <fog_pars_fragment>\n${NOISE}
 void main(){vec2 w=vec2(v.x,-v.y);float rail=0.;for(int i=0;i<24;i++){vec2 d=brd[i];if(dot(d,d)<.5)continue;float lat=abs(w.x*d.y-w.y*d.x);if(dot(w,d)>0.){if(lat<4.8)discard;rail=max(rail,1.-smoothstep(.05,.3,abs(lat-5.)));}}
 float a=atan(v.y,v.x);float r=length(v);vec2 q=vec2(a*90.,r*1.5);float flow=fbm(q*.15+vec2(t*.6,0.));float sp=smoothstep(.8,.95,vn(q*.9+vec2(t*2.,0.)));
 float edge=(1.-smoothstep(0.,1.2,abs(r-75.)))+(1.-smoothstep(0.,1.2,abs(r-87.)));vec3 c=mix(vec3(.0,.04,.1),vec3(.0,.2,.4),flow)+vec3(.4,.9,1.)*sp*.7+vec3(.2,.9,1.)*edge*.55;
 c=mix(c,vec3(.2,.35,.45),day*.5);c=mix(c,vec3(1.,.45,.12)*(1.4-day*.7),rail);gl_FragColor=vec4(c,max(.55+edge*.2,rail));\n${TAIL}\n}`}));
river.rotation.x=-Math.PI/2;river.position.y=.12;S.add(river);

// ---------- building material: shader windows, fake AO, top-edge glow (instanced + non-instanced) ----------
function bMat(color=0xffffff,dens=1){return new THREE.ShaderMaterial({fog:true,defines:TIER==='low'?{LOWQ:''}:{},uniforms:{...fogU(),c:{value:new THREE.Color(color)},d:{value:dens},t:U.t,day:U.day,flash:U.flash},
 vertexShader:`varying vec3 wp,wn,vC,vN,vV;varying float ly;\n${FOGV}\nvoid main(){mat4 M=modelMatrix;\n#ifdef USE_INSTANCING\nM=modelMatrix*instanceMatrix;\n#endif\n
 vec4 w=M*vec4(position,1.);wp=w.xyz;wn=normalize(transpose(inverse(mat3(M)))*normal);ly=position.y;\n#ifdef USE_INSTANCING_COLOR\nvC=instanceColor;\n#else\nvC=vec3(1.);\n#endif\nvec4 mvPosition=viewMatrix*w;vV=-mvPosition.xyz;vN=normalize((viewMatrix*vec4(wn,0.)).xyz);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
 fragmentShader:`uniform vec3 c;uniform float d,t,day,flash;varying vec3 wp,wn,vC,vN,vV;varying float ly;\n#include <fog_pars_fragment>\n${NOISE}
 // procedural facade: glass curtain wall w/ mullions + floor bands, gradient-sky reflection, random lit windows (more at night), distance LOD, base AO. NaN-safe (clamped pow/normalize).
 void main(){vec3 col=c*vC;vec3 o=mix(vec3(.016,.02,.038),vec3(.12,.135,.16),day);vec3 N=normalize(wn+vec3(0.,1e-5,0.)),vw=normalize(cameraPosition-wp+vec3(1e-4));
 float ndv=clamp(abs(dot(N,vw)),0.,1.),fr=pow(1.-ndv,3.);
 if(abs(N.y)<.6){vec2 uv=vec2(abs(N.x)>abs(N.z)?wp.z:wp.x,wp.y)*vec2(.95,.75)*d;vec2 cell=floor(uv),f=fract(uv);
  float win=step(.16,f.x)*step(f.x,.84)*step(.22,f.y)*step(f.y,.78);float lit=step(mix(.42,.78,day),h21(cell+floor(t*.04+h21(cell)*30.)));lit*=mix(.2,1.,step(.28,h21(vec2(cell.y*1.9+7.,floor((wp.x+wp.z)*.09)))));float warm=step(.8,h21(cell*3.1));
  vec3 wc=mix(col,vec3(1.,.82,.58),warm*.65)*(.25+.55*h21(cell*1.7))*(1.-day*.75);
 #ifdef LOWQ
  o+=wc*win*lit;
 #else
  float lod=1.-smoothstep(200.,520.,length(cameraPosition-wp));
  vec3 R=reflect(-vw,N);float sk=clamp(R.y*.5+.5,0.,1.);
  vec3 env=mix(mix(vec3(.09,.05,.07),vec3(.34,.33,.36),day),mix(vec3(.012,.018,.05),vec3(.1,.17,.3),day),sk)+vec3(1.,.42,.12)*exp(-(R.y-.03)*(R.y-.03)/.0049)*mix(.22,.1,day);
  float band=step(.86,f.y)+step(f.y,.1);float mull=1.-win;
  vec3 glass=env*(.15+.55*fr)+wc*lit*1.15;vec3 metal=(mix(vec3(.028,.031,.042),vec3(.21,.225,.25),day)+col*.035+env*.16*fr)*(.9+.2*h21(vec2(floor(uv.x*2.+f.y*.2),floor(wp.y*9.))));
  vec3 det=mix(metal*(1.+band*.35),glass,win);
  vec3 far=env*(.15+.5*fr)+wc*.42*(1.-day*.5);
  o+=mix(far,det,lod);
 #endif
  o+=col*smoothstep(.47,.5,ly)*1.2;o+=col*step(.975,fract(wp.y*.07))*.35*(1.-day*.5);
  o+=vec3(1.,.4,.1)*(1.-smoothstep(.0,.06,abs(fract(wp.y*.045+.5)-.5)*22.2-.04))*mix(.9,.12,day)*step(8.,wp.y);}
 else o+=col*.05;
 float shop=0.;if(abs(N.y)<.6&&wp.y<3.65&&wp.y>.02){float u=(abs(N.x)>abs(N.z)?wp.z:wp.x)/3.4;float fu=fract(u),cid=floor(u)+floor(wp.x*.013)*17.+floor(wp.z*.013)*31.;
  float pane=step(.07,fu)*step(fu,.93)*step(.22,wp.y)*step(wp.y,2.75);float on=step(.22,h21(vec2(cid,7.3)));
  vec3 wi=mix(vec3(1.,.76,.48),col*1.3+vec3(.15),step(.62,h21(vec2(cid,2.1))));vec3 skyR=mix(vec3(.02,.03,.06),vec3(.26,.3,.38),day)*(.3+.7*fr);
  vec3 sf=mix(vec3(.035,.035,.045),vec3(.24,.24,.26),day)*(1.-pane)+pane*(wi*on*(.95-.55*day)*(.55+.45*smoothstep(.22,2.5,wp.y))+skyR);
  float sg=step(2.95,wp.y)*step(wp.y,3.45)*step(.45,h21(vec2(cid,5.)));sf=mix(sf,col*(1.5-day*.7)+vec3(.05),sg);
  float awn=step(2.78,wp.y)*step(wp.y,2.95);sf=mix(sf,mix(vec3(.5,.12,.08),vec3(.1,.3,.5),step(.5,h21(vec2(cid,9.))))*(.5+.5*day),awn*step(.4,h21(vec2(cid,3.))));
  o=sf;shop=1.;}
 o*=mix((.3+.7*smoothstep(0.,6.,wp.y))*(.6+.4*smoothstep(0.,22.,wp.y)),1.,shop);o+=col*fr*.3;o+=vec3(.6,.65,1.)*flash*.25;o=clamp(o,0.,16.);gl_FragColor=vec4(o,1.);\n${TAIL}\n}`})}
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
 n.top=y+spH+antH;n.roofY=y;n.roofCw=cw;n.spH=spH;n.seg0=Object.assign({sides},segInfo[0]);
 signatureTop(n,g,y,spH,cw);
 if(!n.minor&&TIER!=='low'){const k=T>=3?4:T>=1?3:2;for(let q=0;q<k;q++){const an=q/k*6.283+.4,r=cw*.78;ROOF.push([n.pos.x+Math.cos(an)*r,y,n.pos.z+Math.sin(an)*r,cw*(.22+.08*(q%2)),.9+.5*(q%3),an])}
  if(T>=2&&T<4)ROOF.push([n.pos.x,y,n.pos.z,-cw*.5,0,0]);}
 tierParts(n,g,segInfo,y,spH,cw,sides);
 const pad=new THREE.Mesh(new THREE.CylinderGeometry(n.w*1.85,n.w*2.05,.5,40),new THREE.MeshStandardMaterial({color:0x0b1020,metalness:.85,roughness:.35}));pad.position.y=.25;g.add(pad);
 const pr=new THREE.Mesh(new THREE.RingGeometry(n.w*1.9,n.w*2.05,64),new THREE.MeshBasicMaterial({color:col,side:2}));pr.rotation.x=-Math.PI/2;pr.position.y=.52;g.add(pr);
 const hit=new THREE.Mesh(new THREE.CylinderGeometry(n.w*1.2,n.w*1.2,n.top,8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=n.top/2;hit.userData={kind:'tower',node:n};g.add(hit);pick.push(hit);
 n.coll={x:n.pos.x,z:n.pos.z,r:n.w*1.05,h:n.h*.42,node:n};colliders.push(n.coll);
 if((TIER==='low'?['XRP']:['XRP','BURN','XRPyro','IMM','666']).includes(n.name)){const pl=new THREE.PointLight(col,n.name==='XRP'?700:260,170,1.6);pl.position.y=n.h*.45;g.add(pl)}
 const el=document.createElement('div');el.className='lbl'+(n.minor?' minor':'');el.style.setProperty('--c','#'+col.getHexString());el.innerHTML=n.name+(n.minor?'':`<small>${fmt(n.tvl)} XRP TVL</small>`);$('labels').appendChild(el);
 n.lblEl=el;n.lbl={el,pos:new THREE.Vector3(n.pos.x,n.top+4,n.pos.z),pri:n.name==='XRP'?1e9:n.tvl,minor:n.minor};labelEls.push(n.lbl);
 n.group=g;n.h0=n.h;n.w0=n.w;n.top0=n.top;n.sy=n.ty=n.sxz=n.txz=1}
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
{const SEG=TIER==='low'?40:TIER==='medium'?70:110,P=[],UV=[],PR=[],CO=[],IX=[],CT=[];let vb=0;const sp=[],spP=[],mo=[],moP=[],moC=[],NMO=TIER==='low'?4:TIER==='medium'?7:10;
 const vmax=Math.max(1,...E.nodes.map(n=>n.vol24h||0));
 E.nodes.forEach(n=>{if(n.minor||!n.h||n.name==='XRP'&&!n.w)return;const act=n.active!=null?n.active:n.holders!=null?n.holders/10:0,turns=2+Math.round(Math.min(5,Math.log10(1+act)*1.6));
  const speed=.15+1.6*Math.log10(1+(n.vol24h||0))/Math.log10(1+vmax),lock=Math.min(1,n.lockedShare||0),ch=n.pro24h;
  const c=ch==null||Math.abs(ch)<.5?new THREE.Color(0xbfdcff):ch>0?new THREE.Color(0x2dffc0).lerp(new THREE.Color(0x30ff6a),Math.min(1,ch/15)):new THREE.Color(0xff8a2a).lerp(new THREE.Color(0xff2a1a),Math.min(1,-ch/15));
  const R=n.w*1.55,H=n.h*.92,wid=.35+lock*1.1;
  for(const [ph,ws,ga] of [[0,1,1],[3.1416,.6,.55]]){for(let k=0;k<=SEG;k++){const u=k/SEG,a=u*turns*6.283+ph,y=.8+u*H,rr=R*(1-.25*u)*(ph?1.08:1);for(const sd of [-1,1]){P.push(n.pos.x+Math.cos(a)*rr,y+sd*wid*ws*.9,n.pos.z+Math.sin(a)*rr);UV.push(u*turns,sd*.5+.5);PR.push(speed,(.35+.65*lock)*ga);CO.push(c.r,c.g,c.b);CT.push(n.pos.x,n.pos.z)}
   if(k<SEG){const q=vb+k*2;IX.push(q,q+1,q+2,q+1,q+3,q+2)}}vb+=(SEG+1)*2}
  for(let j=0;j<NMO;j++){moP.push(n.pos.x,0,n.pos.z);mo.push(R,H,Math.random()*100,speed);moC.push(c.r,c.g,c.b)}
  const nb=Math.min(TIER==='low'?6:16,(n.scar_txs??n.burn_txs??0));for(let j=0;j<nb;j++){spP.push(n.pos.x,0,n.pos.z);sp.push(R,H,Math.random()*100,j)}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));g.setAttribute('pr',new THREE.Float32BufferAttribute(PR,2));g.setAttribute('col',new THREE.Float32BufferAttribute(CO,3));g.setAttribute('ctr',new THREE.Float32BufferAttribute(CT,2));g.setIndex(IX);
 const m=new THREE.ShaderMaterial({uniforms:{t:U.t},transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
  vertexShader:'uniform float t;attribute vec2 pr;attribute vec2 ctr;attribute vec3 col;varying vec2 vU;varying vec2 vP;varying vec3 vC;varying float vD;void main(){vU=uv;vP=pr;vC=col;float ra=t*(.08+.12*pr.x);vec2 o=position.xz-ctr;vec3 q=vec3(ctr.x+o.x*cos(ra)-o.y*sin(ra),position.y,ctr.y+o.x*sin(ra)+o.y*cos(ra));vec4 w=modelMatrix*vec4(q,1.);float d=distance(w.xyz,cameraPosition);vD=clamp((d-120.)/380.,0.,1.);w.y+=(uv.y-.5)*vD*(1.2+2.2*pr.y);gl_Position=projectionMatrix*viewMatrix*w;}',
  fragmentShader:'uniform float t;varying vec2 vU;varying vec2 vP;varying vec3 vC;varying float vD;void main(){float y=vU.y*2.-1.;float e=exp(-y*y*4.5);float core=exp(-y*y*40.);float f=fract(vU.x*2.-t*vP.x*.6);float flow=.55+.45*sin(f*6.2832);float pulse=.8+.2*sin(t*1.6+vU.x*.7);float fade=smoothstep(0.,.6,vU.x);float a=min(.55,(e*.42+core*.35)*flow*pulse*vP.y*(.7+.3*vD))*fade;vec3 c=mix(vC,vec3(1.),core*.55);gl_FragColor=vec4(c*a,a);}'});
 const mesh=new THREE.Mesh(g,m);mesh.frustumCulled=false;mesh.renderOrder=3;S.add(mesh);
 if(mo.length){const mg=new THREE.BufferGeometry();mg.setAttribute('position',new THREE.Float32BufferAttribute(moP,3));mg.setAttribute('mo',new THREE.Float32BufferAttribute(mo,4));mg.setAttribute('mc',new THREE.Float32BufferAttribute(moC,3));
  const mm=new THREE.ShaderMaterial({uniforms:{t:U.t,px:{value:R.getPixelRatio()}},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,
   vertexShader:'attribute vec4 mo;attribute vec3 mc;uniform float t,px;varying float vA;varying vec3 vC;void main(){float k=fract(t*(.04+.03*mo.w)+mo.z*.173);float a=mo.z*2.1+t*(.25+.2*mo.w)+k*9.;float r=mo.x*(1.05-.25*k);vec3 p=position+vec3(cos(a)*r,.8+mo.y*k,sin(a)*r);vA=sin(k*3.1416)*(.6+.4*sin(t*7.+mo.z*13.));vC=mix(mc,vec3(1.),.6);vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=min(10.,px*60./-mv.z);}',
   fragmentShader:'varying float vA;varying vec3 vC;void main(){vec2 d=gl_PointCoord-.5;float r=length(d);float star=max(smoothstep(.5,.0,r)*.6,smoothstep(.06,.0,abs(d.x))*smoothstep(.5,.1,abs(d.y))+smoothstep(.06,.0,abs(d.y))*smoothstep(.5,.1,abs(d.x)));float a=star*vA*.9;gl_FragColor=vec4(vC*a,a);}'});
  const mp=new THREE.Points(mg,mm);mp.frustumCulled=false;S.add(mp)}
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
const sats=[];window.__sats=sats;   // read-only layout hook (spacing audit)
// keep-out zones known before anything is placed: the Ember Yard skatepark (built lazily on first skate) and the Estates lake (built later from the same nodes)
const PARKA=window.__skate&&window.__skate.parkArea;
// neighbourhood density = active wallets (n.active: xrpl.to 24h unique traders, fallback holders), log scale, capped per tower
const segD=(x,z,p,q)=>{const dx=q.x-p.x,dz=q.z-p.z,l=dx*dx+dz*dz||1,u=Math.max(0,Math.min(1,((x-p.x)*dx+(z-p.z)*dz)/l));return Math.hypot(p.x+u*dx-x,p.z+u*dz-z)};
const poolSegs=pools.map(p=>[N[p.a].pos,N[p.b].pos]);
const streets=[];
// district ring streets must never cross a neighbouring district's rings: split the gap between overlapping districts in proportion to their radii (deterministic, depends only on positions/sizes), never below the podium + a street
const DR=new Map();{const hubs=E.nodes.filter(n=>!n.minor&&n.pos);hubs.forEach(n=>{let R=n.distR;if(n.name!=='XRP'){hubs.forEach(m=>{if(m===n)return;const d=Math.hypot(n.pos.x-m.pos.x,n.pos.z-m.pos.z),sum=n.distR+m.distR;if(d<sum+10)R=Math.min(R,d*n.distR/sum-5)});R=Math.max(R,n.w*2.05+7)}DR.set(n,R)})}
E.nodes.filter(n=>!n.minor).forEach(n=>{const R=DR.get(n)||n.distR,pr=n.w*2.05;if(n.name==='XRP'){streets.push({type:'ring',c:n.pos,r:40},{type:'ring',c:n.pos,r:62});return}
 if(R*.62>pr+3.5)streets.push({type:'ring',c:n.pos,r:R*.62});streets.push({type:'ring',c:n.pos,r:R*.98})});E.nodes.forEach((n,i)=>{const r=DR.get(n);if(r&&zoneU[i])zoneU[i].z=r});window.__districtR=()=>[...DR].map(([n,r])=>[n.name,+r.toFixed(1),+n.distR.toFixed(1)]);
CORE.filter(c=>N[c]).forEach(c=>{const n=N[c];streets.push({type:'line',a:new THREE.Vector3(Math.cos(n.ang)*62,0,Math.sin(n.ang)*62),b:new THREE.Vector3(Math.cos(n.ang),0,Math.sin(n.ang)).multiplyScalar(RING-n.distR*.98)})});
{const segC=(x,z,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,l2=dx*dx+dz*dz||1,u=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/l2));return Math.hypot(a.x+u*dx-x,a.z+u*dz-z)};
 [...DR.keys()].filter(n=>n.name!=='XRP'&&!CORE.includes(n.name)&&n.pos).forEach(n=>{const d=Math.hypot(n.pos.x,n.pos.z),R=DR.get(n);if(d-R*.98<80)return;const ux=n.pos.x/d,uz=n.pos.z/d;
  const a=new THREE.Vector3(ux*62,0,uz*62),b=new THREE.Vector3(ux*(d-R*.98),0,uz*(d-R*.98));
  if([...DR].every(([m,r])=>m===n||m.name==='XRP'||segC(m.pos.x,m.pos.z,a,b)>r+3))streets.push({type:'line',a,b,ave:1})})
 const hs=[...DR.keys()].filter(n=>n.name!=='XRP'&&n.pos),seen=new Set();hs.forEach(n=>{hs.filter(m=>m!==n).map(m=>[m,Math.hypot(m.pos.x-n.pos.x,m.pos.z-n.pos.z)]).sort((x,y)=>x[1]-y[1]).slice(0,2).forEach(([m,d])=>{const k=[n.name,m.name].sort().join('|');if(seen.has(k))return;seen.add(k);
  const R1=DR.get(n)*.98,R2=DR.get(m)*.98,gap=d-R1-R2;if(gap<6||gap>110)return;const ux=(m.pos.x-n.pos.x)/d,uz=(m.pos.z-n.pos.z)/d;
  const a=new THREE.Vector3(n.pos.x+ux*R1,0,n.pos.z+uz*R1),b=new THREE.Vector3(m.pos.x-ux*R2,0,m.pos.z-uz*R2);
  if(Math.min(Math.hypot(a.x,a.z),Math.hypot(b.x,b.z),segC(0,0,a,b))<90)return;
  if([...DR].every(([o,r])=>o===n||o===m||o.name==='XRP'||segC(o.pos.x,o.pos.z,a,b)>r+3))streets.push({type:'line',a,b,ave:2})})})}
// road clearance (streets are 9.6 m incl. sidewalks); used deterministically by every placement below and by the load-time audit
const ROAD_HW=4.8,onRoad=(x,z,pad=0)=>streets.some(s=>(s.type==='ring'?Math.abs(Math.hypot(x-s.c.x,z-s.c.z)-s.r):segD(x,z,s.a,s.b))<ROAD_HW+pad);window.__streetsDef=streets;window.__onRoad=onRoad;

E.nodes.forEach(n=>{const act=n.active!=null?n.active:n.holders!=null?n.holders/10:0;n.dens=Math.min(1,Math.log10(1+act)/3.3);
 // top holders (nightly tools/holders.py: share bands + roles only, never addresses) are the main buildings; density filler stays small
 const HB=[.1,.16,.24,.34,.46,.6],ROLEC={amm:0x3cf3ff,blackhole:0x2a2a33,exchange:0xffc23a};n.holderB=[];
 if(n.top&&n.top.length&&!n.minor){const tn=n.top.length;n.top.forEach(([b,role],j)=>{for(let tr=0;tr<8;tr++){const a=(j+tr*.37)/tn*Math.PI*2+.3,r=Math.max(n.w*2.9,n.w*2.05+(1.6+b*.35)*1.02+2.2)+(j%2)*4.5+tr*1.5;const x=n.pos.x+Math.cos(a)*r,z=n.pos.z+Math.sin(a)*r,bw=1.6+b*.35,h=4+n.h*HB[b];
   if(poolSegs.some(([p,q])=>segD(x,z,p,q)<bw+2))continue;if(onRoad(x,z,bw*1.02+1))continue;if(colliders.some(c=>Math.hypot(c.x-x,c.z-z)<c.r+bw+2))continue;
   const sb={x,z,w:bw,h,c:role?new THREE.Color(ROLEC[role]):n.col.clone().lerp(new THREE.Color(0xffffff),.15),rot:a,n,holder:{b,role,j}};sats.push(sb);n.holderB.push(sb);colliders.push({x,z,r:bw*1.02,h});break}})}
 const k=Math.round((n.name==='XRP'?70:n.minor?Math.min(14,2+12*n.dens):Math.min(56,8+48*n.dens))*LV.sats*(n.holderB.length?.6:1));
 const rnd=(s=>()=>(s=(s*1664525+1013904223)>>>0)/4294967296)([...n.name].reduce((h,c)=>(h*31+c.charCodeAt(0))>>>0,7));
 const span=(n.distR-n.w*2.5-2)*(1-.35*n.dens);
 for(let i=0,tries=0;i<k&&tries<k*12;tries++){const a=rnd()*Math.PI*2,r0=n.w*2.5+rnd()*span;
  const bw=1.1+rnd()*(n.minor?1.4:2.4),h=3+Math.pow(rnd(),1.6)*n.h*(n.minor?.5:n.holderB.length?.22:.55);
  const r=Math.max(r0,n.w*2.05+bw*1.02+2.2),x=n.pos.x+Math.cos(a)*r,z=n.pos.z+Math.sin(a)*r;   // >= 2.2 m off the tower pad
  if(PARKA&&Math.abs(x-PARKA.x)<PARKA.hx+bw+2&&Math.abs(z-PARKA.z)<PARKA.hz+bw+2)continue;
  if(Math.abs(Math.hypot(x,z)-81)<9)continue;if(poolSegs.some(([p,q])=>segD(x,z,p,q)<bw+2.2))continue;if(onRoad(x,z,bw*1.02+1))continue;if(colliders.some(c=>Math.hypot(c.x-x,c.z-z)<c.r+bw+2))continue;
  sats.push({x,z,w:bw,h,c:n.col,rot:rnd()*Math.PI,n});colliders.push({x,z,r:bw*1.02,h});i++}});
// infill: ordinary low/mid-rise city blocks lining the streets between districts (same facades, rooftops & signs as satellites), deterministic
{const r0=(s=>()=>(s=(s*1664525+1013904223)>>>0)/4294967296)(90210);const cap=Math.round((TIER==='low'?160:TIER==='medium'?520:1000));
 const hubs=E.nodes.filter(n=>n.pos),Rmax=Math.max(...[...DR].map(([n,r])=>Math.hypot(n.pos.x,n.pos.z)+r*.9));
 const IPAL=[0x9aa6b8,0x8fb3c9,0xc2b59b,0xa59bc0,0x9cc0b0,0xc9a99a,0xb8c4d0,0x7f93ad].map(c=>new THREE.Color(c));
 const distS=(x,z)=>streets.reduce((m,s)=>Math.min(m,s.type==='ring'?Math.abs(Math.hypot(x-s.c.x,z-s.c.z)-s.r):segD(x,z,s.a,s.b)),1e9);
 const inD=(x,z,pad)=>hubs.some(n=>Math.hypot(x-n.pos.x,z-n.pos.z)<(DR.get(n)||n.distR)+pad);let placed=0;const inLake=estateLake(E.nodes,[LPD.c]);
 for(let tries=0;tries<cap*17&&placed<cap;tries++){/* 17 (was 14): the 2 m spacing rule rejects more candidates; keeps the density */const a=r0()*6.2832,r=95+Math.sqrt(r0())*(Rmax-95),x=Math.cos(a)*r,z=Math.sin(a)*r;
  const ds=distS(x,z),bw=1.6+r0()*2.6;if(ds>34&&r0()<.85)continue;if(ds<4.8+bw*1.02+1)continue;if(inD(x,z,bw+2))continue;
  if(poolSegs.some(([p,q])=>segD(x,z,p,q)<bw+2.2))continue;if(colliders.some(c=>Math.hypot(c.x-x,c.z-z)<c.r+bw+2))continue;
  if(PARKA&&Math.abs(x-PARKA.x)<PARKA.hx+bw+2&&Math.abs(z-PARKA.z)<PARKA.hz+bw+2)continue;if(inLake(x,z,bw*1.2+3))continue;
  const near=Math.max(0,1-ds/34),h=3.5+Math.pow(r0(),1.8)*(10+22*near)*(1-.45*(r-95)/(Rmax-95+1));
  let rot=r0()*Math.PI;{let best=1e9;streets.forEach(s=>{const d=s.type==='ring'?Math.abs(Math.hypot(x-s.c.x,z-s.c.z)-s.r):segD(x,z,s.a,s.b);if(d<best){best=d;rot=s.type==='ring'?Math.atan2(z-s.c.z,x-s.c.x):Math.atan2(s.b.x-s.a.x,s.b.z-s.a.z)}})}
  sats.push({x,z,w:bw,h,c:IPAL[(r0()*IPAL.length)|0].clone().multiplyScalar(.8+r0()*.3),rot,n:null,infill:1});colliders.push({x,z,r:bw*1.02,h});placed++}
 window.__infill=placed}
{const segs=[],trims=[],crowns=[];sats.forEach(s=>{let y=0,w=s.w;const ns=s.h>22?4:s.h>12?3:s.h>6?2:(rnd()<.4?2:1),FR=[[1],[.62,.38],[.5,.3,.2],[.4,.26,.2,.14]][ns-1].map(f=>f*(.85+rnd()*.3)),fs=FR.reduce((a,b)=>a+b,0),slab=rnd()<.28,shr=.7+rnd()*.18,ca=Math.cos(s.rot),sa=Math.sin(s.rot);let ox=0,oz=0;
 for(let j=0;j<ns;j++){const sh=s.h*FR[j]/fs,ax=slab?1.2:1,az=slab?.8:1;if(j&&rnd()<.6){const o=(rnd()-.5)*w*.22;ox+=o*ca;oz+=o*sa}
  segs.push({x:s.x+ox,z:s.z+oz,y:y+sh/2,w,sx:w*ax,sz:w*az,h:sh,c:s.c,rot:s.rot});if(ns>1&&j<ns-1||s.h>9)trims.push({x:s.x+ox,z:s.z+oz,y:y+sh,sx:w*ax*(j===ns-1?.86:.9),sz:w*az*(j===ns-1?.86:.9),c:s.c,rot:s.rot});y+=sh;w*=shr}
 s.top=y;s.topW=w;s.ox=ox;s.oz=oz;if(TIER!=='low'&&s.h>14&&rnd()<.42)crowns.push(s)});
 const im=new THREE.InstancedMesh(segGeo,bMat(0xffffff,1.6),segs.length);
 segs.forEach((s,i)=>{_m.compose(_v.set(s.x,s.y,s.z),_q.setFromAxisAngle(UPV,s.rot),_s.set(s.sx,s.h,s.sz));im.setMatrixAt(i,_m);im.setColorAt(i,s.c)});S.add(im);
 {const tg=new THREE.CylinderGeometry(.84,.84,.22,4).rotateY(Math.PI/4),tm=new THREE.InstancedMesh(tg,new THREE.MeshBasicMaterial({color:0xffffff}),Math.max(1,trims.length));trims.forEach((t,i)=>{_m.compose(_v.set(t.x,t.y,t.z),_q.setFromAxisAngle(UPV,t.rot),_s.set(t.sx,1,t.sz));tm.setMatrixAt(i,_m);tm.setColorAt(i,new THREE.Color(t.c).lerp(new THREE.Color(0xffffff),.35).multiplyScalar(.95))});tm.count=trims.length;S.add(tm);
  if(crowns.length){const cg=new THREE.ConeGeometry(.7,1,4).rotateY(Math.PI/4),cm=new THREE.InstancedMesh(cg,new THREE.MeshBasicMaterial({color:0xffffff}),crowns.length);crowns.forEach((c,i)=>{const hh=c.topW*(1.6+rnd()*1.4);_m.compose(_v.set(c.x+c.ox,c.top+hh/2,c.z+c.oz),_q.setFromAxisAngle(UPV,c.rot),_s.set(c.topW*1.3,hh,c.topW*1.3));cm.setMatrixAt(i,_m);cm.setColorAt(i,new THREE.Color(c.c).multiplyScalar(.8));c.top2=c.top+hh});S.add(cm)}}
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
// garage decks: on a tower with many bridges, neighbouring bridges land on alternating levels so each gets a full-size hangar bay
const DECK={};E.nodes.forEach(n=>{if(!n.seg0)return;const ends=[];pools.forEach(p=>{const o=p.a===n.name?N[p.b]:p.b===n.name?N[p.a]:null;if(o)ends.push({p,a:Math.atan2(o.pos.z-n.pos.z,o.pos.x-n.pos.x)})});if(!ends.length)return;
 ends.sort((x,y)=>x.a-y.a);const R=(n.seg0.cw+n.seg0.top)/2,need=3.6/Math.max(1,R*Math.cos(Math.PI/n.seg0.sides)),Lv=Math.max(1,Math.min(4,Math.ceil(ends.length*need*1.5/6.283),Math.floor((n.seg0.sh-3)/3.2)||1)),dy=3.2;
 const mid=Math.min(n.h*.33,40),y0=Math.max(2.2,Math.min(mid-(Lv-1)*dy/2,n.seg0.sh-1.6-(Lv-1)*dy));const lvA=[...Array(Lv)].map(()=>[]),gapTo=(L,x)=>L.reduce((m,y)=>Math.min(m,Math.abs(Math.atan2(Math.sin(x-y),Math.cos(x-y)))),9);
 ends.forEach(e=>{let best=0,bg=-1;for(let l=0;l<Lv;l++){const g=gapTo(lvA[l],e.a);if(g>bg+1e-6){bg=g;best=l}}lvA[best].push(e.a);DECK[n.name+'|'+e.p.amm+'|'+e.p.a+e.p.b]={y:y0+best*dy,lv:best}})});
const deckY=(n,p)=>{const d=DECK[n.name+'|'+p.amm+'|'+p.a+p.b];return d?d.y:Math.min(n.h*.33,40)};
// rails land on the tower TOP: roof edge facing the partner tower (landing-pad height on flagship tier); falls back to the old deck height
// tall / busy towers (e.g. XRP): rails fan out to staggered landing points on a ring below the top; a much lower partner lands on a lower tier
const RCNT={},RTOT={};pools.forEach(p=>{RTOT[p.a]=(RTOT[p.a]||0)+1;RTOT[p.b]=(RTOT[p.b]||0)+1});
const roofTop=n=>n.roofY==null?null:n.roofY*(n.sy||1)+(n.tier>=4?.95:.4);
const topAt=(n,o,p)=>{const top=roofTop(n);if(top==null)return n.pos.clone().setY(deckY(n,p));const d=_v.set(o.pos.x-n.pos.x,0,o.pos.z-n.pos.z).normalize(),ot=roofTop(o)??deckY(o,p);
 const busy=(RTOT[n.name]||0)>6||top>90,slot=RCNT[n.name]=(RCNT[n.name]||0)+1;let y=top,R=(n.roofCw||n.w)*(n.sxz||1)*.6,ang=0;
 if(busy||top-ot>25){y=Math.max(12,Math.min(top,ot+10+(slot%6)*3.2));if(y<top-1){R=n.w*(n.sxz||1)*1.08+.6;ang=((slot%5)-2)*.09}}
 const c=Math.cos(ang),s_=Math.sin(ang),dx=d.x*c-d.z*s_,dz=d.x*s_+d.z*c;return new THREE.Vector3(n.pos.x+dx*R,y,n.pos.z+dz*R)};
// gentle arc, raised until it clears every other tower it passes over (top + 3 m, spires included)
const arcMid=(a,b,A,B,i,r)=>{const mid=a.clone().add(b).multiplyScalar(.5);mid.y=Math.max(a.y,b.y)+6+a.distanceTo(b)*.06+(i%3)*2;const q=new THREE.Vector3();
 for(let it=0;it<6;it++){let need=0;const c=new THREE.QuadraticBezierCurve3(a,mid,b);for(let k=1;k<24;k++){c.getPoint(k/24,q);for(const n of E.nodes){if(n===A||n===B||!n.group||n.top==null)continue;
  if(Math.hypot(q.x-n.pos.x,q.z-n.pos.z)<n.w*1.15+r+1.5)need=Math.max(need,n.top+3-q.y)}}if(need<=0)break;mid.y+=need*1.2}mid.y=Math.min(mid.y,Math.max(a.y,b.y)+18+a.distanceTo(b)*.22);return mid};   // capped: never a towering loop
pools.forEach((p,i)=>{const A=N[p.a],B=N[p.b];const a=topAt(A,B,p),b=topAt(B,A,p);
 const mid=arcMid(a,b,A,B,i,.18+2.1*Math.sqrt(p.tvl_xrp/maxT));
 const curve=new THREE.QuadraticBezierCurve3(a,mid,b);const share=Math.sqrt(p.tvl_xrp/maxT),r=.18+2.1*share,L=p.locked_pct/100,minor=p.tvl_xrp<100;const g=new THREE.Group();S.add(g);const b0={rail:1,pulse:0};const lite=TIER==='low'&&rankT.indexOf(p)>=12;
 const solid=new THREE.Mesh(new THREE.TubeGeometry(curve,64,r,8),new THREE.MeshBasicMaterial({color:new THREE.Color(0x3cf3ff).multiplyScalar(.15+.95*L),transparent:true,opacity:minor?.25:.18+.75*L,depthWrite:false,blending:THREE.AdditiveBlending}));
 solid.userData={kind:'bridge',pool:p};g.add(solid);pick.push(solid);
 const core=new THREE.Mesh(new THREE.TubeGeometry(curve,64,Math.max(.06,r*.28),5),new THREE.MeshBasicMaterial({color:0xe8ffff,transparent:true,opacity:minor?.3:.35+.65*L}));g.add(core);b0.solid=solid;b0.core=core;
 if(L<.999&&!lite){const colU=L<.3?0xff3b2f:0xffb000,pts=curve.getPoints(48),side=new THREE.Vector3(),rail=[[],[]],ties=[],flk=[];
  pts.forEach((q,k)=>{side.crossVectors(curve.getTangent(k/48),UPV).normalize().multiplyScalar(r+.9);const l=q.clone().add(side),rr=q.clone().sub(side);l.y-=r*.6;rr.y-=r*.6;rail[0].push(l);rail[1].push(rr);if(k%2===0)ties.push(l,rr)});
  const op=(minor?.12:.25+.45*share)*(1-L)+.05;rail.forEach(rp=>{const m=new THREE.LineBasicMaterial({color:colU,transparent:true,opacity:op});g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rp),m));flk.push({m,op})});
  const tm=new THREE.LineBasicMaterial({color:colU,transparent:true,opacity:op*.7});g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ties),tm));flk.push({m:tm,op:op*.7});
  const ph=Math.random()*10,u=1-L,b=b0;b0.flk=flk;anim.push(t=>flk.forEach(f=>f.m.opacity=f.op*b.rail*(.72+.28*Math.sin(t*(1.6+u*1.6)+ph))))}
 if(false)for(let k=1;k<4;k++){const q=curve.getPoint(k/4);const py=new THREE.Mesh(new THREE.CylinderGeometry(.25,.45,q.y,6),new THREE.MeshStandardMaterial({color:0x10172a,metalness:.9,roughness:.4,emissive:L>=.7?0x0a3a40:0x2a1a05}));py.position.set(q.x,q.y/2,q.z);g.add(py)}
 const term=new THREE.Group();const tp=A.pos.clone().add(b.clone().sub(a).setY(0).normalize().multiplyScalar(A.w*2.25));term.position.set(tp.x,0,tp.z);
 const sc=L>=.7?0x3cf3ff:L>=.3?0xffb000:0xff3b2f;const kiosk=new THREE.Mesh(new THREE.BoxGeometry(.9,2.2,.5),new THREE.MeshStandardMaterial({color:0x0b1222,metalness:.8,roughness:.3,emissive:sc,emissiveIntensity:.12}));kiosk.position.y=1.1;if(!lite)term.add(kiosk);
 const scr=new THREE.Mesh(new THREE.PlaneGeometry(.8,.6),new THREE.MeshBasicMaterial({color:sc}));scr.position.set(0,1.6,.26);if(!lite)term.add(scr);term.lookAt(b.x,0,b.z);S.add(term);
 const th=new THREE.Mesh(new THREE.BoxGeometry(1.4,3,1.4),new THREE.MeshBasicMaterial({visible:false}));th.position.y=1.5;th.userData={kind:'terminal',pool:p};term.add(th);pick.push(th);
 bridges.push(Object.assign(b0,{p,curve,r,L,minor,group:g,term,share,Lv:L}))});

// ---------- Forever Rails: metallic rails + gold edge glow along both sides of every bridge; coverage = LP locked in blackholed wallets ----------
// ONE merged mesh for all bridges (per-vertex bridge index + arc position; shader clips at b.Lv, so live lockFX animates the rails extending).
// Gold = b.forever = BCGold.isGold(pool) (client/js/goldlock.js): >=95% of LP held by black-holed accounts AND pool TVL >= GOLD_MIN_TVL_XRP.
// Only gold pools get these rails (full length), the FOREVER plaques, gold cores, gold seals, LOCKED FOREVER labels and gold swirls/sparks; everything else has zero gold.
// ?debug=1&goldtest=1 (top-2 TVL pools) or goldtest=XRP/BURN,XRP/IMM forces gold for visual tests only.
{const SEG=TIER==='low'?24:MOBILE?36:56,geos=[],NB=Math.min(bridges.length,64),GL=globalThis.BCGold;
 const GT=/[?&]debug=1/.test(location.search)&&Q.get('goldtest'),gtSet=new Set(GT&&GT!=='1'?GT.split(',').map(x=>x.trim().toUpperCase()):[]),gtTop=GT==='1'?bridges.filter(b=>!b.minor).sort((x,y)=>y.p.tvl_xrp-x.p.tvl_xrp).slice(0,2):[];
 const forced=b=>!!GT&&(gtTop.includes(b)||gtSet.has((b.p.a+'/'+b.p.b).toUpperCase())||gtSet.has((b.p.b+'/'+b.p.a).toUpperCase())||gtSet.has(String(b.p.amm).toUpperCase()));
 const LV0=Math.log10(10),LVM=Math.log10(Math.max(100,...bridges.map(b=>b.p.tvl_xrp*b.L))),covOf=b=>{const lv=b.p.tvl_xrp*b.Lv;return lv<10?0:Math.min(1,(Math.log10(lv)-LV0)/(LVM-LV0))};bridges.forEach(b=>{b.lockedXrp=b.p.tvl_xrp*b.L;b.forever=GL.isGold(b.p)||forced(b)});window.__gold={min_tvl:GL.GOLD_MIN_TVL_XRP,min_pct:GL.GOLD_MIN_LOCK_PCT,forced:!!GT,pools:bridges.filter(b=>b.forever).map(b=>b.p.a+'/'+b.p.b)};
 bridges.slice(0,NB).forEach((b,bi)=>{if(b.minor||!b.forever)return;const side=new THREE.Vector3();for(const sd of [-1,1]){const pts=[];for(let k=0;k<=SEG;k++){const u=k/SEG,q=b.curve.getPoint(u);side.crossVectors(b.curve.getTangent(u),UPV).normalize().multiplyScalar(sd*(b.r+1.1));pts.push(q.add(side).setY(q.y-b.r*.35))}
   const tg=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),SEG,.14+.42*Math.max(.35,covOf(b)),5,false);const n=tg.attributes.position.count,ba=new Float32Array(n).fill(bi);tg.setAttribute('bi',new THREE.BufferAttribute(ba,1));geos.push(tg)}});
 if(geos.length){const cov=new Float32Array(64),glow=new Float32Array(64);
  const m=new THREE.ShaderMaterial({uniforms:{cov:{value:cov},forever:{value:glow},t:U.t,...THREE.UniformsUtils.merge([THREE.UniformsLib.fog])},fog:true,
   vertexShader:'attribute float bi;varying vec2 vU;varying float vB;varying vec3 vN;\n#include <fog_pars_vertex>\nvoid main(){vU=uv;vB=bi;vN=normalize(normalMatrix*normal);vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}',
   fragmentShader:'uniform float cov[64];uniform float forever[64];uniform float t;varying vec2 vU;varying float vB;varying vec3 vN;\n#include <fog_pars_fragment>\nvoid main(){int i=int(vB+.5);float c=cov[i];if(vU.x>c)discard;float rim=pow(1.-abs(vN.z),2.);float spec=pow(max(0.,vN.y),6.);'+
    'vec3 steel=vec3(.22,.24,.28)+vec3(.5)*spec;float tip=smoothstep(.04,0.,c-vU.x)*step(c,.999);float fv=floor(forever[i]+.0001);float lp=fract(forever[i]+.0001)*1000.;float pul=fv*(.5+.5*sin(t*1.6-vU.x*6.));vec3 gold=vec3(.85,.5,.04)*((.3+rim*.9)*(.45+.4*lp+.15*pul)+tip*.6);vec3 col=steel*.35+gold;float L=dot(col,vec3(.299,.587,.114));col*=min(1.,.46/max(L,1e-3));gl_FragColor=vec4(col,1.);\n#include <fog_fragment>\n}'});
  const mesh=new THREE.Mesh(mergeGeometries(geos),m);mesh.frustumCulled=false;S.add(mesh);
  anim.push(()=>{for(let i=0;i<NB;i++){const b=bridges[i];cov[i]=b.forever?1.01:0;glow[i]=b.forever?1.001:0}});}
 // FOREVER plaques
 const fv=bridges.filter(b=>b.forever&&!b.minor);if(fv.length){const cv=document.createElement('canvas');cv.width=256;cv.height=96;const x=cv.getContext('2d');x.fillStyle='#1a1205';x.fillRect(0,0,256,96);x.strokeStyle='#ffc64a';x.lineWidth=6;x.strokeRect(4,4,248,88);x.fillStyle='#ffd77a';x.font='900 44px system-ui,sans-serif';x.textAlign='center';x.fillText('∞ FOREVER',128,64);
  const pm=new THREE.InstancedMesh(new THREE.PlaneGeometry(2.6,1),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv),side:THREE.DoubleSide,toneMapped:false}),fv.length*2);let k=0;
  fv.forEach(b=>{for(const [A,B] of [[N[b.p.a],N[b.p.b]],[N[b.p.b],N[b.p.a]]]){const d=B.pos.clone().sub(A.pos).setY(0).normalize(),tp=A.pos.clone().addScaledVector(d,A.w*2.25);_m.compose(_v.set(tp.x,3.3,tp.z),_q.setFromAxisAngle(UPV,Math.atan2(d.x,d.z)),_s.set(1,1,1));pm.setMatrixAt(k++,_m)}});
  pm.count=k;S.add(pm);anim.push(t=>pm.material.color.setScalar(.5+.08*Math.sin(t*1.6)))}}

// Gold lock vein (gold pools only, b.forever): width as a fraction of the core tube radius, log scale on XRP locked (b.lockedXrp = tvl_xrp x locked share):
// ~3.2k XRP -> .28 (thin), 1M+ XRP -> .88. Shared by the rail core and the swirl shaders (per-material uniform / packed into the swirl's fl.y), +0 draws.
const veinW=b=>b.forever?Math.min(.88,Math.max(.28,.28+.6*(Math.log10(Math.max(1,b.lockedXrp||0))-3.5)/2.5)):0;let swirlRecolor=null;   // set by the AMM swirl block, called from actScore()
// ---------- AMM rails polish: animated liquidity flow along every bridge core + 🔒 LOCKED FOREVER seals ----------
// Locked = LP tokens held by verified black-holed wallets (server/eco.js isBlackhole: DisableMaster, no usable RegularKey, no SignerList).
// Phone-light: one shared shader program for the flow, ONE instanced draw for every seal ring/chain link, DOM labels via the existing declutter.
{const GLB=globalThis.BCGold,FV='varying vec2 vU;varying vec3 vN;void main(){vU=uv;vN=normalMatrix*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  FF='uniform float t,op,sp,vw;uniform vec3 c,g;uniform float lk;varying vec2 vU;varying vec3 vN;void main(){float s=fract(vU.x*9.-t*sp);float streak=smoothstep(0.,.18,s)*smoothstep(.55,.2,s);'+
  // gold pools: a gold vein down the middle of the core (view-facing band, width vw of the radius) instead of tinting the whole core
  'vec3 n=normalize(vN);float off=sqrt(max(0.,1.-n.z*n.z));float vein=lk*(1.-smoothstep(vw*.7,vw,off));float pul=.8+.35*sin(t*1.6-vU.x*6.);'+
  'vec3 col=mix(c*(.55+1.1*streak),g*1.25*pul,vein);gl_FragColor=vec4(col,op*mix(.55+.45*streak,1.,vein));}';
 const LOCKC=new THREE.Color(0xffb020),EMBC=new THREE.Color(0xff5a1a);
 bridges.forEach(b=>{if(!b.core)return;const o=b.core.material,L=b.L;b.core.material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
   uniforms:{t:U.t,op:{value:o.opacity},sp:{value:.25+.9*Math.min(1,b.share*2)},c:{value:new THREE.Color(0xbff8ff)},g:{value:LOCKC},lk:{value:b.forever?1:0},vw:{value:veinW(b)}},vertexShader:FV,fragmentShader:FF});const nm=b.core.material,dim=Math.min(1,6/Math.max(RTOT[b.p.a]||1,RTOT[b.p.b]||1))**.5;nm.color=nm.uniforms.c.value;Object.defineProperty(nm,'opacity',{get:()=>nm.uniforms.op.value,set:v=>{nm.uniforms.op.value=v*dim}});{const sm=b.solid.material;let so=sm.opacity;Object.defineProperty(sm,'opacity',{get:()=>so,set:v=>{so=v*dim}});sm.opacity=so}o.dispose()});
 const lk=bridges.filter(b=>(b.forever||b.L>=.01)&&!b.minor);
 if(lk.length){const links=TIER==='low'?1:3,im=new THREE.InstancedMesh(new THREE.TorusGeometry(1,.09,5,TIER==='low'?14:20),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}),lk.length*2*links);let k=0;const tg=new THREE.Vector3(),cc=new THREE.Color(),ZF=new THREE.Vector3(0,0,1),qa=new THREE.Quaternion();
  lk.forEach(b=>{if(b.forever)cc.copy(LOCKC).multiplyScalar(2.2);else cc.copy(EMBC).multiplyScalar(.6+1.0*b.L);/* gold seals only for gold pools; partly locked = ember */for(const u0 of [.07,.93])for(let j=0;j<links;j++){const u=u0+(u0<.5?1:-1)*j*.022,q=b.curve.getPoint(u);b.curve.getTangent(u,tg);
    _q.setFromUnitVectors(ZF,tg);if(j%2)_q.multiply(qa.setFromAxisAngle(ZF,Math.PI/2));const rr=b.r+.55;_m.compose(q,_q,_s.set(rr,rr*(j%2?.7:1),rr));im.setMatrixAt(k,_m);im.setColorAt(k++,cc)}});
  im.count=k;im.instanceColor.needsUpdate=true;im.frustumCulled=false;S.add(im);anim.push(t=>im.material.color.setScalar(.85+.15*Math.sin(t*1.4)));
  lk.filter(b=>b.forever||b.L>=.1).forEach(b=>{const el=document.createElement('div'),g=b.forever;el.className='lbl lockLbl'+(g?'':' part');el.style.setProperty('--c',g?'#ffc64a':'#8fd8ff');el.textContent=g?`🔒 LOCKED FOREVER · ${(b.L*100).toFixed(b.L>=.995?0:1)}%${GLB.isGold(b.p)?'':' · test'}`:`🔒 LP locked · ${(b.L*100).toFixed(1)}%`;$('labels').appendChild(el);
   const top=b.curve.getPoint(.5);labelEls.push({el,pos:top.clone().setY(top.y+b.r+2.5),pri:b.p.tvl_xrp*b.L*.5,minor:true})})}}

// ---------- AMM swirls: each rail end flows tangent-continuously into a helix wrapping its tower (ONE merged draw) + drifting sparks on the same path (ONE Points draw) ----------
// Join: cubic Bezier lead-in leaves the rail end along the rail tangent and lands on the helix along the helix tangent (C1, no kink);
// flow phase/speed/thickness/colour continue the rail core's so it reads as one stream; tube tapers + fades at the tail.
{const LOW=TIER==='low',SEGH=LOW?20:MOBILE?32:48,SEGB=LOW?6:MOBILE?8:12,RAD=LOW?4:5,geos=[],paths=[],ranges=[],per={},LOCKC=new THREE.Color(0xffb020),CYC=new THREE.Color(0xbff8ff),GOLD=new THREE.Color(0xffc64a),kAt=(cu,t)=>{const h=1e-3;t=Math.min(1-2*h,Math.max(2*h,t));const a=cu.getPoint(t-h),m=cu.getPoint(t),z=cu.getPoint(t+h),d1=z.clone().sub(a),d2=z.clone().add(a).addScaledVector(m,-2);return 4*d1.clone().cross(d2).length()/Math.max(1e-12,d1.length()**3)},kRail=(cu,end)=>{const h=.002;return kAt(cu,end?1-h:h)},tA=new THREE.Vector3(),cP=new THREE.Vector3();
 bridges.forEach(b=>{if(b.minor||!b.core)return;const Lr=b.curve.getLength(),dim=Math.min(1,6/Math.max(RTOT[b.p.a]||1,RTOT[b.p.b]||1))**.5,cr=Math.max(.06,b.r*.28);
 [0,1].forEach(end=>{const n=N[end?b.p.b:b.p.a];if(!n)return;const k=per[n.name]=(per[n.name]||0)+1;if(k>(LOW?3:6))return;   // busy towers: cap swirls so they never starburst
  const p0=b.curve.getPoint(end?1:0);if(p0.y<8)return;b.curve.getTangent(end?1:0,tA);if(!end)tA.negate();   // rail's travel direction at the tower end
  const dx=p0.x-n.pos.x,dz=p0.z-n.pos.z,Rin=n.w*(n.sxz||1)*1.1+.6,R=Math.max(Math.hypot(dx,dz),Rin)+(k-1)*.35,a0=Math.atan2(dz,dx);
  const dir=(dx*tA.z-dz*tA.x)>0?-1:1,drop=Math.min(22,Math.max(6,p0.y-6)),turns=1.1+.12*k,lead=.22,TT=turns*6.283;   // spin the way the rail is already curving
  const H=(u,o)=>{const a=a0+dir*(lead+u*(1-lead))*TT,rr=R*(1+.06*u);return o.set(n.pos.x+Math.cos(a)*rr,p0.y-drop*(.08+.92*u),n.pos.z+Math.sin(a)*rr)};
  const q1=H(0,new THREE.Vector3()),ht=H(.002,new THREE.Vector3()).sub(q1).normalize(),D=p0.distanceTo(q1),kr=kRail(b.curve,end),hb=D*.42;
   // G2-ish join: pick the first handle so the lead-in starts with the rail's own curvature (no sudden tightening), penalising any sharp bend inside it
   let bz=null,best=1e9;for(const f of [.3,.4,.5,.6,.75,.9]){const c3=new THREE.CubicBezierCurve3(p0.clone(),p0.clone().addScaledVector(tA,D*f),q1.clone().addScaledVector(ht,-hb),q1.clone());let km=0;for(let j=1;j<6;j++)km=Math.max(km,kAt(c3,j/6));const cost=Math.abs(kAt(c3,0)-kr)+.5*km;if(cost<best){best=cost;bz=c3}}
  const pts=bz.getPoints(SEGB);for(const p of pts.slice(1)){const ox=p.x-n.pos.x,oz=p.z-n.pos.z,d=Math.hypot(ox,oz);if(d<Rin){p.x=n.pos.x+ox/d*Rin;p.z=n.pos.z+oz/d*Rin}}   // never cut through the tower
  for(let j=1;j<=SEGH;j++)pts.push(H(j/SEGH,new THREE.Vector3()));
  const cv=new THREE.CatmullRomCurve3(pts,false,'centripetal'),SL=cv.getLength(),NS=SEGB+SEGH,lock=b.forever?1:0,UB=SEGB/NS,c=CYC.clone().lerp(LOCKC,lock*.55),op=(.35+.65*b.L)*dim,sp=.25+.9*Math.min(1,b.share*2);
  // colour starts cyan (activity colours do not exist yet at build) and is repainted from b.actCol by swirlRecolor(); vein width is packed into fl.y (= sp + 8*round(100*vw))
  const P={cv,b,c:lock?GOLD:c.clone(),sp:lock?sp*.45:sp,fw:end?1:-1,lock,cx:n.pos.x,cz:n.pos.z},vw=veinW(b);
  const shell=(rad,aMul,core)=>{const tg=new THREE.TubeGeometry(cv,NS,rad,RAD,false),pa=tg.attributes.position,cnt=pa.count,ca=new Float32Array(cnt*4),fl=new Float32Array(cnt*4),fy=sp+8*Math.round(100*vw*cr/rad);
   for(let i=0;i<=NS;i++){const u=i/NS;cv.getPointAt(u,cP);const tap=1-.75*Math.pow(u,1.6),fade=1-THREE.MathUtils.smoothstep(u,.62,1),ph=9*(end?1+u*SL/Lr:-u*SL/Lr);
    for(let r=0;r<=RAD;r++){const v=i*(RAD+1)+r;pa.setXYZ(v,cP.x+(pa.getX(v)-cP.x)*tap,cP.y+(pa.getY(v)-cP.y)*tap,cP.z+(pa.getZ(v)-cP.z)*tap);ca.set([c.r,c.g,c.b,op*aMul*fade],v*4);fl.set([ph,fy,lock*THREE.MathUtils.smoothstep(u,0,UB*1.5),u],v*4)}}
   tg.setAttribute('sc',new THREE.BufferAttribute(ca,4));tg.setAttribute('fl',new THREE.BufferAttribute(fl,4));geos.push(tg);   // normal kept: the lock vein needs it (view-facing band)
   const st0=ranges.length?ranges[ranges.length-1].end:0;ranges.push({P,core,start:st0,end:st0+cnt})};
  shell(cr,1,1);if(!LOW)shell(cr*2.6,.32,0);   // core matches the rail core exactly; soft glow sheath (same draw) makes it read from a distance
  paths.push(P)})});
 if(geos.length){const m=new THREE.ShaderMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,uniforms:{t:U.t},
   // fl.y unpacked here (vertex = highp): speed + vein width
   vertexShader:'attribute vec4 sc;attribute vec4 fl;varying vec4 vF;varying vec4 vC;varying vec2 vU;varying vec3 vN;varying float vW;void main(){float k=floor(fl.y/8.);vF=vec4(fl.x,fl.y-8.*k,fl.zw);vW=k/100.;vC=sc;vU=uv;vN=normalMatrix*normal;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   // body = pool activity colour (vC) with the rail streak; gold pools (vF.z>0) add a gold vein down the middle (view-facing band, width vW of the radius, thicker = more XRP locked)
   // that shimmers and dissolves over the lower half: vein cells crumble away (moving with the flow) and the edge left behind glows; normal swirls (vF.z=0) unchanged
   fragmentShader:'uniform float t;varying vec4 vF;varying vec4 vC;varying vec2 vU;varying vec3 vN;varying float vW;void main(){float s=fract(vF.x-t*vF.y);float st=smoothstep(0.,.18,s)*smoothstep(.55,.2,s);float sh=.55+.45*sin(t*1.3-vF.x*.35);'+
    'vec3 n=normalize(vN);float off=sqrt(max(0.,1.-n.z*n.z));float vr=vF.z*(1.-smoothstep(vW*.7,vW,off));'+
    'float dz=vF.z*smoothstep(.45,.97,vF.w);float h=fract(sin(dot(floor(vec2(vU.x*150.-t*vF.y*5.,vU.y*7.)),vec2(12.9898,78.233)))*43758.5453);float keep=step(dz*1.05,h);float vein=vr*keep;float edge=vr*keep*dz*(1.-smoothstep(0.,.18,h-dz));'+
    'gl_FragColor=vec4(vC.rgb*(.55+1.1*st)*(1.-.85*vein)+vec3(1.,.66,.12)*vein*(.9+.6*sh)+vec3(1.,.72,.2)*edge*.9,vC.a*mix(.55+.45*st,1.25,vein));}'});   // same streak + speed as the rail core shader
  const merged=mergeGeometries(geos),mesh=new THREE.Mesh(merged,m);mesh.frustumCulled=false;S.add(mesh);let recolor=null;
  // sparks: light, one Points draw on the exact swirl path, moving with the flow; phones ≤150, desktop ≤360 TOTAL (incl. gold dispersal), Low = off
  // gold dispersal (same Points draw, +0 calls): gold swirls shed golden motes over their lower half that drift outward + up with the flow and fade
  const CAP=LOW?0:MOBILE?150:360,gp=paths.filter(P=>P.lock),ND=CAP?Math.min(Math.round(CAP*.5),gp.length*(MOBILE?10:24)):0,NS0=Math.min(CAP-ND,paths.length*(MOBILE?3:5)),NP=NS0+ND;
  if(NP){const pg=new THREE.BufferGeometry(),pp=new Float32Array(NP*3),pc=new Float32Array(NP*3),st=[],ds=[],dq=new THREE.Vector3(),dt3=new THREE.Vector3();
   for(let i=0;i<NS0;i++){const P=paths[i%paths.length];st.push({P,u:Math.random()*.9,v:.05+Math.random()*.08});pc.set([P.c.r,P.c.g,P.c.b],i*3)}
   const spawn=(d,first)=>{const P=d.P,u=.5+Math.random()*.45;P.cv.getPointAt(u,dq);P.cv.getTangentAt(u,dt3);if(P.fw<0)dt3.negate();const ox=dq.x-P.cx,oz=dq.z-P.cz,ol=Math.hypot(ox,oz)||1,vr=.5+Math.random()*1.1,vt=.6+Math.random()*1.2;
    d.x=dq.x;d.y=dq.y;d.z=dq.z;d.vx=ox/ol*vr+dt3.x*vt;d.vy=.35+Math.random()*.7+Math.max(0,dt3.y)*vt;d.vz=oz/ol*vr+dt3.z*vt;d.life=1.6+Math.random()*1.8;d.age=first?Math.random()*d.life:0};
   for(let j=0;j<ND;j++){const d={P:gp[j%gp.length]};spawn(d,true);ds.push(d)}
   pg.setAttribute('position',new THREE.BufferAttribute(pp,3));pg.setAttribute('color',new THREE.BufferAttribute(pc,3));
   const pts=new THREE.Points(pg,new THREE.PointsMaterial({size:MOBILE?.55:.45,vertexColors:true,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false}));pts.frustumCulled=false;S.add(pts);
   const q=new THREE.Vector3();let acc=0;anim.push((t,dt)=>{acc+=dt;if(MOBILE&&acc<1/30)return;const d=Math.min(acc,.1);acc=0;st.forEach((s,i)=>{s.u+=s.P.fw*s.v*d*s.P.sp;if(s.u>.9)s.u-=.9;else if(s.u<0)s.u+=.9;s.P.cv.getPointAt(s.u,q);pp[i*3]=q.x;pp[i*3+1]=q.y+Math.sin(t*2+i)*.08;pp[i*3+2]=q.z});
    if(ND){const off=window.__aq&&!window.__aq.bloom;   // adaptive quality already shed bloom: hide motes too
     for(let j=0;j<ND;j++){const m=ds[j],i=NS0+j;m.age+=d;if(m.age>=m.life)spawn(m,false);m.vy+=.25*d;m.x+=m.vx*d;m.y+=m.vy*d;m.z+=m.vz*d;pp[i*3]=m.x;pp[i*3+1]=m.y;pp[i*3+2]=m.z;
      const k=off?0:Math.sin(Math.PI*Math.min(1,m.age/m.life))*(1-.5*m.age/m.life)*1.3;pc[i*3]=1*k;pc[i*3+1]=.78*k;pc[i*3+2]=.3*k}pg.attributes.color.needsUpdate=true}
    pg.attributes.position.needsUpdate=true});
   recolor=()=>{for(let i=0;i<NS0;i++){const c=st[i].P.c;pc[i*3]=c.r;pc[i*3+1]=c.g;pc[i*3+2]=c.b}pg.attributes.color.needsUpdate=true}}
  // repaint every swirl (and its sparks) from its pool's live activity colour; gold pools keep gold sparks + vein. Called from actScore(), CPU-only, +0 draws.
  const scA=merged.getAttribute('sc'),sca=scA.array,tc=new THREE.Color();
  swirlRecolor=()=>{for(const P of paths)if(P.b.actCol&&!P.lock)P.c.copy(P.b.actCol);
   for(const R of ranges){const ac=R.P.b.actCol;if(!ac)continue;tc.copy(ac);if(R.core)tc.lerp(CYC,.35);for(let v=R.start;v<R.end;v++){sca[v*4]=tc.r;sca[v*4+1]=tc.g;sca[v*4+2]=tc.b}}
   scA.needsUpdate=true;if(recolor)recolor()};
  window.__swirl={n:paths.length,geos:geos.length,particles:NP,sparks:NS0,disperse:ND,gold:gp.length,veins:paths.filter(P=>P.lock).map(P=>({pool:P.b.p.a+'/'+P.b.p.b,lockedXrp:Math.round(P.b.lockedXrp),w:+veinW(P.b).toFixed(2)}))};if(/[?&]debug=1/.test(location.search))window.__swirl.paths=paths}}

// ---------- pool traffic basis (activity colour + card): min 24h volume of the pair ----------
const vol=n=>n.name==='XRP'?null:(n.vol24h??null);
bridges.forEach(b=>{const vs=[vol(N[b.p.a]),vol(N[b.p.b])].filter(v=>v!=null);const v=vs.length?Math.min(...vs):b.p.tvl_xrp*.02;b.vol=v;b.volEst=!vs.length});
// ---------- pool activity colouring: percentile of (24h volume + live trades), calm blue -> purple -> orange -> fire red; busier = faster pulse ----------
const WHITE_C=new THREE.Color(0xffffff);const ACT_STOPS=[[0,new THREE.Color(0x2f7bff)],[.45,new THREE.Color(0x9a4bff)],[.75,new THREE.Color(0xff8a2a)],[1,new THREE.Color(0xff3d14)]];
function actColor(a,out){for(let i=1;i<ACT_STOPS.length;i++)if(a<=ACT_STOPS[i][0]){const [a0,c0]=ACT_STOPS[i-1],[a1,c1]=ACT_STOPS[i];return out.copy(c0).lerp(c1,(a-a0)/(a1-a0))}return out.copy(ACT_STOPS[3][1])}
function actScore(){const sc=bridges.map(b=>Math.log10(1+Math.min(b.vol||0,Math.max(1,b.p.tvl_xrp)*3)+(b.liveVol||0)*6));const ord=sc.map((v,i)=>[v,i]).sort((x,y)=>x[0]-y[0]),n=Math.max(1,ord.length-1);
 ord.forEach(([v,i],r)=>{const b=bridges[i];b.act=r/n;b.actCol=actColor(b.act,b.actCol||new THREE.Color());if(b.solid)bridgeLook(b)});if(swirlRecolor)swirlRecolor()}
let actDirty=0;setInterval(()=>{bridges.forEach(b=>{if(b.liveVol)b.liveVol*=.93});if(actDirty){actDirty=0;actScore()}},10000);

const hoverGeo=(()=>{const col=(g,r,gg,b)=>{const n=g.attributes.position.count,c=new Float32Array(n*3);for(let i=0;i<n;i++)c.set([r,gg,b],i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));return g};
 return mergeGeometries([col(new THREE.SphereGeometry(1,14,8).scale(1.15,.26,.5),1,1,1),col(new THREE.SphereGeometry(1,12,6,0,6.283,0,1.6).scale(.5,.3,.36).translate(-.12,.08,0),.25,.55,1),
  col(new THREE.CapsuleGeometry(.11,.7,2,6).rotateZ(Math.PI/2).translate(-.15,-.12,.5),.6,.6,.7),col(new THREE.CapsuleGeometry(.11,.7,2,6).rotateZ(Math.PI/2).translate(-.15,-.12,-.5),.6,.6,.7)])})();
// ---------- garages: every bridge ends in a lit hangar bay on the tower face; ships fly in and out of them ----------
// one bay per bridge end (instanced: dark vestibule, neon frame + canopy, lit slatted interior) · frames flash when a ship docks or departs
// garage bays retired (rails now land on tower tops): DOOR keeps only the dock points ships use; its meshes are not added to the scene
const DOOR=(()=>{const list=[],byN={},byL={};bridges.forEach(b=>[0,1].forEach(end=>{const n=N[end?b.p.b:b.p.a],o=N[end?b.p.a:b.p.b];if(!n||!n.seg0)return;
  const dk=DECK[n.name+'|'+b.p.amm+'|'+b.p.a+b.p.b],d={lv:dk?dk.lv:0,b,end,n,dir:new THREE.Vector3(o.pos.x-n.pos.x,0,o.pos.z-n.pos.z).normalize(),pulse:0,i:list.length};d.ang=Math.atan2(d.dir.z,d.dir.x);list.push(d);(byN[n.name]=byN[n.name]||[]).push(d);(byL[n.name+'|'+d.lv]=byL[n.name+'|'+d.lv]||[]).push(d);(b.doors=b.doors||[])[end]=d}));
 // bay width: sized to the bridge, never wider than the tower face or the gap to the neighbouring bay
 Object.values(byL).forEach(ds=>{ds.sort((a,b)=>a.ang-b.ang);ds.forEach((d,k)=>{const n=d.n,s0=n.seg0,R=(s0.cw+s0.top)/2,rin=R*Math.cos(Math.PI/s0.sides);
  let gap=6.283;if(ds.length>1){const pa=ds[(k-1+ds.length)%ds.length].ang,na=ds[(k+1)%ds.length].ang;gap=Math.min((d.ang-pa+6.283)%6.283||6.283,(na-d.ang+6.283)%6.283||6.283)}
  d.w=Math.max(1.4,Math.min(2.4+d.b.r*1.4,5.2,2*R*Math.sin(Math.PI/s0.sides)*.8,gap*rin*.85));d.h=Math.min(2.9,d.w*.62+.55)})});
 const recG=new THREE.BoxGeometry(1,1,1),bar=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
 const frG=mergeGeometries([bar(.09,1.08,1.08,-.52,0,0),bar(.09,1.08,1.08,.52,0,0),bar(1.14,.1,1.5,0,.54,.2),bar(1.04,.04,.06,0,-.5,.5)]);
 const cv=document.createElement('canvas');cv.width=64;cv.height=64;const cx=cv.getContext('2d');const gr=cx.createLinearGradient(0,0,0,64);gr.addColorStop(0,'#2a1606');gr.addColorStop(.55,'#ff9a3c');gr.addColorStop(1,'#fff1c9');cx.fillStyle=gr;cx.fillRect(0,0,64,64);
 cx.fillStyle='rgba(0,0,0,.38)';for(let y=3;y<40;y+=6)cx.fillRect(0,y,64,2);cx.fillStyle='rgba(255,255,255,.5)';cx.fillRect(10,58,44,2);const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
 const inG=new THREE.PlaneGeometry(.9,.9);
 const rec=new THREE.InstancedMesh(recG,new THREE.MeshStandardMaterial({color:0x090d18,metalness:.8,roughness:.45}),Math.max(1,list.length));
 const fr=new THREE.InstancedMesh(frG,new THREE.MeshBasicMaterial({color:0xffffff}),Math.max(1,list.length));
 const lit=new THREE.InstancedMesh(inG,new THREE.MeshBasicMaterial({map:tex,color:0xffffff}),Math.max(1,list.length));
 [rec,fr,lit].forEach(m=>{m.frustumCulled=false;m.userData.noBatch=1});const _c=new THREE.Color(),_o=new THREE.Object3D();
 function place(d){const n=d.n,s0=d.n.seg0,sx=n.sxz||1,yb=d.end?d.b.curve.v2.y:d.b.curve.v0.y,R=(s0.cw+(s0.top-s0.cw)*Math.min(1,yb/(s0.sh*(n.sy||1))))*sx,rin=R*Math.cos(Math.PI/s0.sides),c=d.b.curve,len=d.b.len||(d.b.len=c.getLength());
  // where the bridge crosses the bay's front face (and a point just inside the wall, where ships vanish/appear)
  const at=dist=>{for(let k=0;k<=240;k++){const u=k/240,uu=d.end?1-u:u;c.getPoint(uu,_v);if(Math.hypot(_v.x-n.pos.x,_v.z-n.pos.z)>=dist)return uu}return d.end?0:1};
  const front=R+.25;d.uF=at(front);d.uIn=at(Math.max(.3,rin*.55));c.getPoint(d.uF,_v);d.y=_v.y;
  const depth=front-rin+.6,mid=(front+rin-.6)/2,w=Math.min(d.w,2*R*Math.sin(Math.PI/s0.sides)*.8+.2),h=d.h;d.wn=w;
  _o.position.set(n.pos.x+d.dir.x*mid,d.y,n.pos.z+d.dir.z*mid);_o.lookAt(_o.position.x+d.dir.x,d.y,_o.position.z+d.dir.z);_o.scale.set(w*1.12,h*1.08,depth);_o.updateMatrix();rec.setMatrixAt(d.i,_o.matrix);
  _o.position.set(n.pos.x+d.dir.x*(front-.5),d.y,n.pos.z+d.dir.z*(front-.5));_o.scale.set(w,h,1);_o.updateMatrix();fr.setMatrixAt(d.i,_o.matrix);
  _o.position.set(n.pos.x+d.dir.x*(front+.02),d.y,n.pos.z+d.dir.z*(front+.02));_o.scale.set(w,h,1);_o.updateMatrix();lit.setMatrixAt(d.i,_o.matrix)}
 function tint(d){_c.copy(d.n.col).lerp(new THREE.Color(0xffffff),.25).multiplyScalar(.9+d.pulse*2.6);fr.setColorAt(d.i,_c);_c.setScalar(.75+d.pulse*.9);lit.setColorAt(d.i,_c)}
 list.forEach(d=>{place(d);tint(d)});[rec,fr,lit].forEach(m=>{m.instanceMatrix.needsUpdate=true});fr.instanceColor.needsUpdate=lit.instanceColor.needsUpdate=true;
 const hot=new Set();
 anim.push((t,dt)=>{if(!hot.size)return;for(const d of hot){d.pulse=Math.max(0,d.pulse-dt*1.4);tint(d);if(!d.pulse)hot.delete(d)}fr.instanceColor.needsUpdate=lit.instanceColor.needsUpdate=true});
 return {list,byN,flash(d){if(!d)return;d.pulse=1;hot.add(d)},reflow(n){const ds=byN[n.name];if(!ds)return;ds.forEach(place);rec.instanceMatrix.needsUpdate=fr.instanceMatrix.needsUpdate=lit.instanceMatrix.needsUpdate=true}}})();
window.__doors=()=>DOOR.list.length;

// ---------- pool traffic = real XRPL swaps: one ship per validated transaction through an AMM pool ----------
// sails from the asset paid in toward the asset taken out · size ∝ log(XRP value) · gold = arbitrage loop · violet = multi-pool route · orange = big trade
const SHIPN=Math.min(LV.cars,240),ships=new Array(SHIPN).fill(null);let shipI=0,shipLive=0;
const cars=new THREE.InstancedMesh(hoverGeo,new THREE.MeshStandardMaterial({vertexColors:true,color:0xffffff,metalness:.85,roughness:.3,emissive:0x0a1430}),SHIPN);cars.frustumCulled=false;S.add(cars);
const _hid=new THREE.Matrix4().makeScale(0,0,0),SHIPC={swap:new THREE.Color(0x9fe8ff),big:new THREE.Color(0xff8a2a),route:new THREE.Color(0xc77dff),arb:new THREE.Color(0xffc64a),whale:new THREE.Color(0xfff6c8)};const SHIPW=Array.from({length:SHIPN},()=>new THREE.Vector3());
const isWhale=e=>!!(e&&e.pool&&e.xrp>=Math.max(500,(e.pool.tvl_xrp||0)*.03));
for(let i=0;i<SHIPN;i++){cars.setMatrixAt(i,_hid);cars.setColorAt(i,SHIPC.swap)}
const carLG=new THREE.BufferGeometry();carLG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(SHIPN*6).fill(-9999),3));const carC=new Float32Array(SHIPN*6);for(let i=0;i<SHIPN;i++)carC.set([1,.95,.85,1,.12,.1],i*6);carLG.setAttribute('color',new THREE.BufferAttribute(carC,3));
const carL=new THREE.Points(carLG,glowMat(0xffffff,1.6,{vertexColors:true}));carL.frustumCulled=false;S.add(carL);const _q2=new THREE.Quaternion().setFromAxisAngle(UPV,Math.PI/2),_sv=new THREE.Vector3(),_sd=new THREE.Vector3();
function spawnShip(e){const b=bridges.find(x=>(e.pool&&e.pool.amm&&x.p.amm===e.pool.amm)||x.p===e.pool);if(!b||!(e.xrp>0))return;
 const fwd=e.from?e.from===b.p.a:e.to?e.to===b.p.b:Math.random()<.5,sc=Math.min(4,Math.max(.45,.45+.55*Math.log10(1+e.xrp)));
 const wh=isWhale(e),kind=wh?'whale':e.arb?'arb':e.hops>1?'route':e.xrp>=TRADE_MIN?'big':'swap',i=shipI;shipI=(shipI+1)%SHIPN;if(!ships[i])shipLive++;
 const D0=b.doors&&b.doors[fwd?0:1],D1=b.doors&&b.doors[fwd?1:0];
 ships[i]={e,wh,b,fwd,t:0,dur:(5+b.curve.getLength()/40)*(.85+.08*sc)*(wh?1.6:1),sc:wh?Math.min(5,sc*1.4):sc,side:(fwd?1:-1)*(b.r+1.1+sc*.55),alt:1.4+sc*.55+(i%3)*.7,D0,D1,docked:0};DOOR.flash(D0);cars.setColorAt(i,SHIPC[kind]);cars.instanceColor.needsUpdate=true;if(wh&&!e.replay)whaleToast(e,i);if(window.__cityEvent&&!e.replay)window.__cityEvent('swap',e,kind)}
window.__ships=()=>ships.filter(Boolean).length;
function updCars(dt){if(!shipLive)return;const P=carLG.attributes.position;
 for(let i=0;i<SHIPN;i++){const s=ships[i];if(!s)continue;s.t+=dt;
  if(s.t>=s.dur){ships[i]=null;shipLive--;cars.setMatrixAt(i,_hid);P.setXYZ(i*2,0,-9999,0);P.setXYZ(i*2+1,0,-9999,0);continue}
  const u=s.t/s.dur,e=u*u*(3-2*u)*.9+u*.1,c=s.b.curve,D0=s.D0,D1=s.D1;
  // travel from inside the origin bay to inside the destination bay; lanes merge into the bay over the last ~14 m
  const a0=D0?D0.uIn:s.fwd?0:1,a1=D1?D1.uIn:s.fwd?1:0,uu=a0+(a1-a0)*e;c.getPoint(uu,_v);c.getTangent(uu,_t);if(!s.fwd)_t.negate();_sd.crossVectors(_t,UPV).normalize();
  const len=s.b.len||(s.b.len=c.getLength()),dA=D0?Math.abs(uu-D0.uF)*len*Math.sign((uu-D0.uF)*(a1-a0)):99,dB=D1?Math.abs(D1.uF-uu)*len*Math.sign((D1.uF-uu)*(a1-a0)):99;
  const near=Math.min(dA,dB),D=dA<dB?D0:D1,f=D?Math.min(1,Math.max(0,near/14)):1,ff=f*f*(3-2*f);
  const sideD=D?Math.sign(s.side)*D.wn*.2:s.side,altD=D?.12*D.h:s.alt;_v.addScaledVector(_sd,sideD+(s.side-sideD)*ff);_v.y+=altD+(s.alt-altD)*ff;
  if(D1&&!s.docked&&dB<=0){s.docked=1;DOOR.flash(D1)}
  const fit=D?Math.min(s.sc,D.wn*.5):s.sc,k=(fit+(s.sc-fit)*ff)*Math.min(1,s.t/.35,(s.dur-s.t)/.35);_m.lookAt(_t,ORIGIN,UPV);_q.setFromRotationMatrix(_m).multiply(_q2);_m.compose(_v,_q,_sv.setScalar(k));cars.setMatrixAt(i,_m);SHIPW[i].copy(_v);
  P.setXYZ(i*2,_v.x+_t.x*.95*k,_v.y+_t.y*.95*k,_v.z+_t.z*.95*k);P.setXYZ(i*2+1,_v.x-_t.x*.95*k,_v.y-_t.y*.95*k,_v.z-_t.z*.95*k)}
 cars.instanceMatrix.needsUpdate=true;P.needsUpdate=true}

// ---------- tappable ships: every ship is a real XRPL trade ----------
const XL='https://livenet.xrpl.org';let followI=-1,followH=null;
const ago=w=>{const d=Math.max(0,(Date.now()-new Date(w).getTime())/1e3);return d<60?Math.round(d)+'s ago':d<3600?Math.round(d/60)+'m ago':Math.round(d/3600)+'h ago'};
function descTrade(e,wh){const p=e.pool||{},buy=e.to||(p.a==='XRP'?p.b:p.a),sell=e.from||(buy===p.a?p.b:p.a),acc=e.account||'';
 const type=e.arb?'Arbitrage loop':e.hops>1?`Routed through ${e.hops} pools`:e.kind==='OfferCreate'?'DEX offer':'Swap';
 return `<button class="x" aria-label="Close">✕</button><h2>${wh?'🐋 Whale trade':'🚀 Live trade'} · ${p.a} ⇄ ${p.b}</h2><table>
<tr><td>Trade</td><td>${e.arb?`<b>Arbitrage</b> through ${p.a}/${p.b}`:`<b>Bought ${buy}</b> with ${sell}`}</td></tr>
<tr><td>Size</td><td><b style="color:${wh?'#fff2a0':'#9fe8ff'}">${e.estimate?'~':''}${fmt(e.xrp,e.xrp<1?4:e.xrp<10?2:0)} XRP</b>${p.tvl_xrp&&e.xrp/p.tvl_xrp>=1e-4?` <span class="dim">${(100*e.xrp/p.tvl_xrp).toFixed(e.xrp/p.tvl_xrp<.01?2:1)}% of pool</span>`:''}</td></tr>
<tr><td>Type</td><td>${type}</td></tr>
<tr><td>Trader</td><td>${acc?`<a href="${XL}/accounts/${acc}" target="_blank" rel="noopener">${acc.slice(0,6)}…${acc.slice(-4)}</a>`:'—'}</td></tr>
<tr><td>When</td><td>${e.when?ago(e.when):'just now'}${e.ledger?` · ledger ${fmt(e.ledger)}`:''}</td></tr></table>
<div style="display:flex;gap:6px;margin-top:8px">${e.hash?`<a class="tbtn" href="${XL}/transactions/${e.hash}" target="_blank" rel="noopener">View on XRPL ↗</a>`:''}<button class="tbtn" data-follow>🎥 Follow ship</button></div>`}
function tradeCSS(){if(document.getElementById('tradeCSS'))return;const st=document.createElement('style');st.id='tradeCSS';st.textContent='#info .tbtn{flex:1;text-align:center;background:#ffffff12;border:1px solid #ffffff2a;color:#fff;border-radius:7px;padding:6px 4px;font:600 12px system-ui,sans-serif;text-decoration:none;cursor:pointer}#info .tbtn:disabled{opacity:.45;cursor:default}#info td a{color:#9fe8ff}';document.head.appendChild(st)}
function showTrade(i,e){tradeCSS();e=e||(ships[i]&&ships[i].e);if(!e)return;if(!(e.pool&&e.pool.a)&&ships[i]&&ships[i].e===e)e.pool=ships[i].b.p;const el=$('info'),wh=isWhale(e);el.innerHTML=descTrade(e,wh);el.classList.remove('v2');el.style.display='block';el.scrollTop=0;
 el.querySelector('.x').onclick=()=>{el.style.display='none';followI=-1};const f=el.querySelector('[data-follow]');
 if(f){const live=i>=0&&ships[i]&&ships[i].e===e;f.disabled=!live||mode!=='orbit';if(!live)f.textContent='Ship has docked';else if(mode!=='orbit')f.textContent='Follow (orbit view)';f.onclick=()=>{followI=i;followH=e;f.textContent='Following…'}}}
function pickShip(x,y,touch){let best=-1,bd=touch?44:26;for(let i=0;i<SHIPN;i++){const s=ships[i];if(!s||s.t<.3)continue;_p.copy(SHIPW[i]).project(C);if(_p.z>1)continue;
 const sx=(_p.x+1)/2*innerWidth,sy=(1-_p.y)/2*innerHeight,d=Math.hypot(sx-x,sy-y)-(s.wh?14:0);if(d<bd){bd=d;best=i}}return best}
anim.push(()=>{if(followI<0)return;const s=ships[followI];if(!s||s.e!==followH||mode!=='orbit'){followI=-1;return}orbit.target.lerp(SHIPW[followI],.12);
 const d=C.position.distanceTo(orbit.target);if(d>90)C.position.lerp(orbit.target,.02)});
let lastToast=0;function whaleToast(e,i){const now=performance.now();if(now-lastToast<12e3||Q.has('shot'))return;lastToast=now;let t=document.getElementById('whaleToast');
 if(!t){t=document.createElement('button');t.id='whaleToast';t.style.cssText='position:fixed;left:50%;top:calc(96px + env(safe-area-inset-top));transform:translateX(-50%) translateY(-12px);z-index:7;background:rgba(10,12,24,.9);color:#fff6c8;border:1px solid #fff2a088;border-radius:999px;padding:7px 14px;font:700 13px system-ui,sans-serif;box-shadow:0 0 18px #fff2a055;opacity:0;transition:opacity .4s,transform .4s;cursor:pointer;white-space:nowrap';document.body.appendChild(t);
  tradeCSS()}
 if(0){const st=document.createElement('style');st.textContent='#info .tbtn{flex:1;text-align:center;background:#ffffff12;border:1px solid #ffffff2a;color:#fff;border-radius:7px;padding:6px 4px;font:600 12px system-ui,sans-serif;text-decoration:none;cursor:pointer}#info .tbtn:disabled{opacity:.45;cursor:default}';document.head.appendChild(st)}
 const p=e.pool,buy=e.to||(p.a==='XRP'?p.b:p.a);t.textContent=`🐋 Whale: ${e.estimate?'~':''}${fmt(e.xrp)} XRP into ${buy} · tap to watch`;t.onclick=()=>{showTrade(i,e);if(mode==='orbit'&&ships[i]&&ships[i].e===e){followI=i;followH=e}hide()};
 const hide=()=>{t.style.opacity=0;t.style.transform='translateX(-50%) translateY(-12px)';t.style.pointerEvents='none'};t.style.pointerEvents='auto';t.style.opacity=1;t.style.transform='translateX(-50%)';clearTimeout(t._h);t._h=setTimeout(hide,7000);
 if(window.__sfx)try{window.__sfx('whale')}catch(_){}}
window.__trade={showTrade,pickShip,whaleToast};
// ---------- live tower shapes: height follows market cap, footprint follows TVL; towers ease to new size as the numbers move ----------
const RESHAPE=new Set();
function reshapeTowers(){MAXT=Math.max(1,...E.nodes.filter(n=>n.name!=='XRP').map(n=>n.tvl||0));
 E.nodes.forEach(n=>{if(!n.group||n.name==='XRP')return;const ty=Math.min(2,Math.max(.5,towerH(n)/n.h0)),tx=Math.min(1.8,Math.max(.55,towerW(n)/n.w0));
  if(Math.abs(ty-n.ty)>.01||Math.abs(tx-n.txz)>.01){n.ty=ty;n.txz=tx;RESHAPE.add(n)}
  if(n.lblEl&&!n.minor){const sm=n.lblEl.querySelector('small');if(sm)sm.textContent=fmt(n.tvl)+' XRP TVL'}})}
window.__reshape=reshapeTowers;
anim.push((t,dt)=>{if(!RESHAPE.size)return;const k=1-Math.exp(-dt*1.1);
 for(const n of RESHAPE){n.sy+=(n.ty-n.sy)*k;n.sxz+=(n.txz-n.sxz)*k;if(Math.abs(n.ty-n.sy)<.001&&Math.abs(n.txz-n.sxz)<.001){n.sy=n.ty;n.sxz=n.txz;RESHAPE.delete(n)}
  n.group.scale.set(n.sxz,n.sy,n.sxz);n.h=n.h0*n.sy;n.w=n.w0*n.sxz;n.top=n.top0*n.sy;n.lbl.pos.y=n.top+4;n.coll.r=n.w*1.05;n.coll.h=n.h*.42;DOOR.reflow(n)}});
await stage(0.65,'Streets & traffic');
// ---------- streets: district ring roads + hub avenues, ground traffic, street lights ----------
// streets v3: opaque asphalt/composite strips (no blending, no overlap): rings carry junction "mouth" data so the curb turns into a rounded
// corner where an avenue joins, avenues are trimmed to the ring's sidewalk edge, lane lines / crosswalks / stop bars line up with the car lanes
// (cars drive ±1.25 m from the centreline, asphalt ±2.5, curb to 2.78, sidewalk to 4.8 = ROAD_HW). uv.x = metres across, uv.y = metres along.
// aj = (junction metres, side/second end, kind, skew): kind 1 = ring (signed arc metres to nearest junction, side of the mouth), 2 = avenue
// (metres from start / end junction centres), 0 = plain strip (estate road etc).
{let k=0;streets.forEach(s=>{if(s.type!=='line'||k>=24)return;const m=s.b.clone().sub(s.a);const la=s.a.length(),lb=s.b.length();if(Math.min(la,lb)<88&&Math.max(la,lb)>74){const d=(la<lb?s.b:s.a).clone().setY(0).normalize(),c=Math.abs(m.clone().normalize().dot(d));if(c>.98)RIVER_BR.value[k++].set(d.x,d.z)}})}
const STRIP=(pts,closed,W,P,UV,IX,AJ,ajf)=>{const n=pts.length,v0=P.length/3,m=closed?n+1:n;let along=0;for(let k=0;k<m;k++){const i=k%n,a=pts[i],b=pts[closed?(i+1)%n:Math.min(n-1,i+1)],c=pts[closed?(i-1+n)%n:Math.max(0,i-1)];const tx=b.x-c.x,tz=b.z-c.z,l=Math.hypot(tx,tz)||1,nx=-tz/l,nz=tx/l;if(k)along+=a.distanceTo(pts[(k-1)%n]);
  P.push(a.x+nx*W/2,a.y,a.z+nz*W/2,a.x-nx*W/2,a.y,a.z-nz*W/2);UV.push(W/2,along,-W/2,along);if(AJ){const j=ajf(a,along,nx,nz);AJ.push(...j,...j)}if(k<m-1){const q=v0+k*2,r=q+2;IX.push(q,q+1,r,q+1,r+1,r)}}};
let STREETM=null,STREETML=null;const ROADJ=[];{const P=[],UV=[],IX=[],AJ=[],SW=9.6,HW=SW/2,RF=2.0;
 const onRing=(p,s)=>s.type==='ring'&&Math.abs(Math.hypot(p.x-s.c.x,p.z-s.c.z)-s.r)<.75;
 // junctions: every avenue end that sits on a ring centreline (avenues are radial, so they meet the ring square-on)
 streets.forEach(s=>{if(s.type!=='line')return;for(const [p,q] of [[s.a,s.b],[s.b,s.a]]){const r=streets.find(o=>onRing(p,o));if(!r)continue;const dx=q.x-p.x,dz=q.z-p.z,l=Math.hypot(dx,dz)||1;ROADJ.push({ring:r,x:p.x,z:p.z,dx:dx/l,dz:dz/l,line:s})}});
 const ringJ=r=>ROADJ.filter(j=>j.ring===r);
 streets.forEach(s=>{if(s.type==='line'){const L=s.a.distanceTo(s.b),ja=ROADJ.some(j=>j.line===s&&j.x===s.a.x&&j.z===s.a.z),jb=ROADJ.some(j=>j.line===s&&j.x===s.b.x&&j.z===s.b.z),t0=ja?HW-.05:0,t1=jb?HW-.05:0;if(L-t0-t1<2)return;
   const k=Math.max(2,Math.ceil((L-t0-t1)/8)),pts=[],d=s.b.clone().sub(s.a).setY(0).normalize();for(let i=0;i<=k;i++){const m=t0+(L-t0-t1)*i/k;pts.push(s.a.clone().addScaledVector(d,m).setY(.1))}
   STRIP(pts,false,SW,P,UV,IX,AJ,(a,al)=>[ja?t0+al:999,jb?L-t0-al:999,2,0])}
  else{const k=Math.max(64,Math.round(s.r*1.6)),pts=[];for(let i=0;i<k;i++){const a=i/k*6.2832;pts.push(new THREE.Vector3(s.c.x+Math.cos(a)*s.r,.09,s.c.z+Math.sin(a)*s.r))}
   const js=ringJ(s).map(j=>({th:Math.atan2(j.z-s.c.z,j.x-s.c.x),j}));
   STRIP(pts,true,SW,P,UV,IX,AJ,(a,al,nx,nz)=>{const th=Math.atan2(a.z-s.c.z,a.x-s.c.x);let best=null,bd=1e9;for(const o of js){let dd=th-o.th;dd=Math.atan2(Math.sin(dd),Math.cos(dd));const m=dd*s.r;if(Math.abs(m)<Math.abs(bd)){bd=m;best=o}}
    if(!best||Math.abs(bd)>40)return[99,0,1,0];const side=Math.sign(best.j.dx*nx+best.j.dz*nz)||1;return[bd,side,1,0]})}});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));g.setAttribute('aj',new THREE.Float32BufferAttribute(AJ,4));g.setIndex(IX);
 const mk=off=>new THREE.ShaderMaterial({side:THREE.DoubleSide,fog:true,polygonOffset:true,polygonOffsetFactor:off,polygonOffsetUnits:off,uniforms:{...fogU(),t:U.t,day:U.day,wet:U.wet},
  vertexShader:`attribute vec4 aj;varying vec2 vS;varying vec4 vJ;\n${FOGV}\nvoid main(){vS=uv;vJ=aj;vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
  fragmentShader:`uniform float t,day,wet;varying vec2 vS;varying vec4 vJ;\n#include <fog_pars_fragment>\n${NOISE}
  void main(){float sx=vS.x,a=abs(sx),v=vS.y,e=a-2.5,lit=mix(1.,2.5,day),kind=vJ.z,jl=99.,ap=0.,cw=0.,sb=0.,mouth=0.,nocl=0.,noed=0.;const float RF=${RF.toFixed(1)};
   if(kind>.5&&kind<1.5){jl=abs(vJ.x);ap=sx*vJ.y;
    if(vJ.y!=0.&&ap>0.&&jl<2.5+RF+.01){vec2 q=vec2(ap-2.5-RF,jl-2.5-RF);e=(q.x<0.&&q.y<0.)?RF-length(q):RF+min(q.x,q.y);mouth=1.;
     if(ap>2.95&&ap<4.65&&jl<2.3)cw=step(.5,fract(vJ.x+.25));}
    if(jl>3.1&&jl<4.9&&a<2.3)cw=step(.5,fract(sx+.25));
    if(jl>5.05&&jl<5.4&&vJ.x*sx>0.&&a<2.3&&a>.2)sb=1.;
    if(vJ.y!=0.){nocl=step(jl,5.45);noed=step(2.95,jl)*step(jl,5.05);}}
   else if(kind>1.5){float dj=min(vJ.x,vJ.y);if(((vJ.y<vJ.x&&sx<0.)||(vJ.x<vJ.y&&sx>0.))&&dj>4.95&&dj<5.3&&a<2.3&&a>.2)sb=1.;nocl=step(dj,5.35);}
   vec3 c;
   if(e<0.){float n=vn(vS*3.1)*.55+vn(vS*13.)*.3+h21(floor(vS*40.))*.15;c=vec3(.036,.039,.046)*lit*(.82+.36*n);
    float wear=exp(-((abs(a-1.25)-.5)*(abs(a-1.25)-.5))/.0484);c*=1.-.12*wear;c+=vec3(.5,.55,.65)*step(.985,h21(floor(vS*55.)))*.05*lit;
    vec3 mkc=vec3(.86,.86,.82)*mix(.55,1.,day);
    if(mouth<.5){float cl=step(abs(a-.13),.055)*(1.-nocl);c=mix(c,vec3(.95,.62,.2)*mix(.55,1.,day),cl*.85);   // double amber centre line, stops short of crosswalks + junction boxes
     c=mix(c,mkc,step(abs(a-2.24),.06)*.8*(1.-noed));}
    c=mix(c,mkc,max(cw,sb)*.85);
    c+=vec3(1.,.45,.12)*max(cw*.12,0.)*(1.-day);}
   else if(e<.28){float bev=smoothstep(.0,.06,e)*(1.-smoothstep(.16,.28,e));c=vec3(.11,.115,.13)*lit*(.65+.55*bev);c*=.55+.45*smoothstep(0.,.03,e);
    c+=vec3(1.,.36,.07)*exp(-(e-.07)*(e-.07)/.0009)*(1.-day*.85)*1.6*(.85+.15*sin(v*.21-t*1.3));}
   else{float u=(e-.28),tl=max(step(.94,fract(v/1.6)),step(.94,fract(u/1.15)));float n=vn(vec2(floor(v/1.6),floor(u/1.15))*3.7);c=vec3(.085,.087,.094)*lit*(.9+.18*n)*(1.-.28*tl);
    c+=vec3(1.,.5,.18)*exp(-(a-4.58)*(a-4.58)/.0016)*.35*(1.-day);c*=1.-.35*smoothstep(4.62,4.8,a);}
   c=mix(c,c*.65+vec3(.02,.03,.05),wet*.5*step(e,0.));
   gl_FragColor=vec4(c,1.);\n${TAIL}\n}`});
 STREETM=mk(-3);STREETML=mk(-4);const sm=new THREE.Mesh(g,STREETM);sm.renderOrder=0;sm.frustumCulled=false;S.add(sm);window.__streets=sm;window.__roadJ=ROADJ}
// ---------- arena gates: portals to the multiplayer arena, standing on real hub avenues ----------
{const av=streets.filter(s=>s.type==='line').slice(0,2),AR=[['tron','Light Cycles',0x3cf3ff],['zombie','Zombie Survival',0xff5a1f]];
 av.forEach((s,i)=>{const [m,label,col]=AR[i],p=s.a.clone().lerp(s.b,.5),g=new THREE.Group();g.position.copy(p);g.rotation.y=Math.atan2(s.b.x-s.a.x,s.b.z-s.a.z);
  const mat=new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.9}),ring=new THREE.Mesh(new THREE.TorusGeometry(3.4,.28,8,40),mat);ring.position.y=3.6;g.add(ring);
  const core=new THREE.Mesh(new THREE.CircleGeometry(3.1,32),new THREE.MeshBasicMaterial({color:col,transparent:true,opacity:.18,side:THREE.DoubleSide,depthWrite:false}));core.position.y=3.6;g.add(core);
  const hitA=new THREE.Mesh(new THREE.BoxGeometry(7,8,3),new THREE.MeshBasicMaterial({visible:false}));hitA.position.y=4;hitA.userData={kind:'arena',arena:m,label};g.add(hitA);pick.push(hitA);
  anim.push(t=>{ring.rotation.z=t*.8;core.material.opacity=.14+.1*Math.sin(t*3+i)});S.add(g);
  const el=document.createElement('div');el.className='lbl';el.style.setProperty('--c','#'+new THREE.Color(col).getHexString());el.textContent='🎮 '+label+' Arena';$('labels').appendChild(el);labelEls.push({el,pos:p.clone().setY(9),pri:4e3,minor:false})})}
const gT=[],SLp=[],SLd=[];streets.forEach(s=>{const len=s.type==='ring'?2*Math.PI*s.r:s.a.distanceTo(s.b);const k=Math.round(len/(MOBILE?12:7));for(let i=0;i<k;i++)gT.push({s,u:Math.random(),d:i%2?1:-1,sp:(6+Math.random()*5)/len});
 const nl=Math.round(len/16);for(let i=0;i<nl;i++){const u=i/nl;const L0=SLp.length;SLp.push(s.type==='ring'?new THREE.Vector3(s.c.x+Math.cos(u*6.283)*(s.r+4.4),0,s.c.z+Math.sin(u*6.283)*(s.r+4.4)):s.a.clone().lerp(s.b,u).add(_v.set(s.b.z-s.a.z,0,s.a.x-s.b.x).setLength(4.4)));const lv=SLp[L0];if(onRoad(lv.x,lv.z,-2.0)){SLp.pop();continue}SLd.push(s.type==='ring'?new THREE.Vector3(s.c.x-lv.x,0,s.c.z-lv.z).normalize():_v.clone().normalize().negate())}});
// ground traffic v2: real low-poly cars (one instanced draw call) with head/tail lights, right-hand lanes, U-turns at avenue ends
{const cap=TIER==='low'?70:TIER==='medium'?220:480;if(gT.length>cap){for(let i=gT.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[gT[i],gT[j]]=[gT[j],gT[i]]}gT.length=cap}}
const carGeo=(()=>{const parts=[],col=(g,r,gg,b)=>{const n=g.attributes.position.count,c=new Float32Array(n*3);for(let i=0;i<n;i++)c.set([r,gg,b],i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));g.deleteAttribute('uv');return g};
 parts.push(col(new THREE.BoxGeometry(1.8,.5,4.1).translate(0,.52,0),1,1,1));
 parts.push(col(new THREE.BoxGeometry(1.5,.46,2.1).translate(0,.99,-.25),.09,.11,.15));
 parts.push(col(new THREE.BoxGeometry(1.56,.06,2.0).translate(0,1.24,-.25),1,1,1));
 for(const [x,z] of [[.86,1.3],[-.86,1.3],[.86,-1.3],[-.86,-1.3]])parts.push(col(new THREE.CylinderGeometry(.34,.34,.26,10).rotateZ(Math.PI/2).translate(x,.34,z),.04,.04,.05));
 return mergeGeometries(parts)})();
const CPAL=[0xc8ccd4,0x1c1f26,0xe8e8ea,0x8a1020,0x16325e,0x2b3a2e,0xb8860b,0x5a5f68,0x7a1e5a,0x0f4a5a];
const gcar=new THREE.InstancedMesh(carGeo,new THREE.MeshStandardMaterial({vertexColors:true,metalness:.55,roughness:.35,envMapIntensity:1}),Math.max(1,gT.length));gcar.frustumCulled=false;gcar.userData.traffic=true;
gT.forEach((g,i)=>{gcar.setColorAt(i,new THREE.Color(CPAL[(Math.random()*CPAL.length)|0]));g.side=g.d>0?1:-1;if(g.s.type!=='ring')g.u=.05+g.u*.9});if(gcar.instanceColor)gcar.instanceColor.needsUpdate=true;S.add(gcar);
const gtG=new THREE.BufferGeometry();gtG.setAttribute('position',new THREE.BufferAttribute(new Float32Array(gT.length*12),3));const gtc=new Float32Array(gT.length*12);gT.forEach((g,i)=>gtc.set([1,.95,.8,1,.95,.8,1,.1,.06,1,.1,.06],i*12));gtG.setAttribute('color',new THREE.BufferAttribute(gtc,3));
const gtP=new THREE.Points(gtG,glowMat(0xffffff,1.5,{vertexColors:true}));gtP.frustumCulled=false;S.add(gtP);
const _gp=new THREE.Vector3(),_gt=new THREE.Vector3(),_gn=new THREE.Vector3(),_gm=new THREE.Matrix4(),_gq=new THREE.Quaternion(),_gs=new THREE.Vector3(1,1,1),_gU=new THREE.Vector3(0,1,0);
// pedestrians: instanced low-poly walkers on both sidewalks of every street (shirt colour per instance), walking bob
const peds=[];{const cap=TIER==='low'?40:TIER==='medium'?140:320;const tot=streets.reduce((a,s)=>a+(s.type==='ring'?6.283*s.r:s.a.distanceTo(s.b)),0);
 streets.forEach(s=>{const len=s.type==='ring'?6.283*s.r:s.a.distanceTo(s.b);const k=Math.round(cap*len/tot);for(let i=0;i<k;i++)peds.push({s,len,u:Math.random(),d:Math.random()<.5?1:-1,side:Math.random()<.5?1:-1,sp:1.1+Math.random()*.6,ph:Math.random()*6.283,lat:3.4+Math.random()*.9})})}
const pedGeo=(()=>{const col=(g,r,gg,b)=>{const n=g.attributes.position.count,c=new Float32Array(n*3);for(let i=0;i<n;i++)c.set([r,gg,b],i*3);g.setAttribute('color',new THREE.BufferAttribute(c,3));g.deleteAttribute('uv');return g};
 return mergeGeometries([col(new THREE.CapsuleGeometry(.2,.5,2,6).translate(0,1.12,0),1,1,1),col(new THREE.SphereGeometry(.15,8,6).translate(0,1.66,0),.86,.66,.5),
  col(new THREE.BoxGeometry(.13,.7,.15).translate(.1,.38,0),.08,.09,.12),col(new THREE.BoxGeometry(.13,.7,.15).translate(-.1,.38,0),.08,.09,.12)])})();
const SHIRT=[0xd23b3b,0x2f6fd8,0xe8e2d6,0x2a2a30,0x3fa66b,0xe0a030,0x8a4fd0,0x1fb5c0,0xf06292,0x6d7480];
const pedM=new THREE.InstancedMesh(pedGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.8,metalness:0,emissive:0x101418}),Math.max(1,peds.length));pedM.frustumCulled=false;
peds.forEach((q,i)=>pedM.setColorAt(i,new THREE.Color(SHIRT[(Math.random()*SHIRT.length)|0])));if(pedM.instanceColor)pedM.instanceColor.needsUpdate=true;S.add(pedM);
const _pp=new THREE.Vector3(),_pq=new THREE.Quaternion(),_pm=new THREE.Matrix4(),_ps=new THREE.Vector3(1,1,1),_pu=new THREE.Vector3(0,1,0);
function updPeds(dt){const T=performance.now()*.001;peds.forEach((q,i)=>{const s=q.s;q.u+=q.sp*dt*q.d/q.len;let hx,hz;
 if(s.type==='ring'){q.u=(q.u+1)%1;const a=q.u*6.283,rr=s.r+q.lat*q.side;_pp.set(s.c.x+Math.cos(a)*rr,0,s.c.z+Math.sin(a)*rr);hx=-Math.sin(a)*q.d;hz=Math.cos(a)*q.d}
 else{if(q.u>1||q.u<0){q.u=Math.max(0,Math.min(1,q.u));q.d*=-1}const dx=(s.b.x-s.a.x)/q.len,dz=(s.b.z-s.a.z)/q.len;_pp.copy(s.a).lerp(s.b,q.u);_pp.x+=-dz*q.lat*q.side;_pp.z+=dx*q.lat*q.side;_pp.y=0;hx=dx*q.d;hz=dz*q.d}
 _pp.y=Math.abs(Math.sin(T*q.sp*5.2+q.ph))*.05;_pq.setFromAxisAngle(_pu,Math.atan2(hx,hz));_pm.compose(_pp,_pq,_ps);pedM.setMatrixAt(i,_pm)});pedM.instanceMatrix.needsUpdate=true}
function updGround(dt){updPeds(dt);if(window.__cityLife&&window.__cityLife.traffic)window.__cityLife.traffic(gT,dt,performance.now()/1000);   // red lights, car-following, yielding to sirens
const P=gtG.attributes.position;gT.forEach((g,i)=>{const s=g.s;
 if(s.type==='ring'){g.u=(g.u+g.sp*dt*g.d*(g.k??1)+1)%1;const a=g.u*6.283,rr=s.r+1.25*g.side;_gp.set(s.c.x+Math.cos(a)*rr,.02,s.c.z+Math.sin(a)*rr);_gt.set(-Math.sin(a)*g.d,0,Math.cos(a)*g.d)}
 else{g.u+=g.sp*dt*g.d*(g.k??1);if(g.u>1||g.u<0){g.u=Math.max(0,Math.min(1,g.u));g.d*=-1;g.side*=-1}_gt.subVectors(s.b,s.a).setY(0).normalize().multiplyScalar(g.d);_gp.copy(s.a).lerp(s.b,g.u).setY(.02)}
 _gn.set(-_gt.z,0,_gt.x);if(s.type==='ring')_gp.y=.02;else _gp.addScaledVector(_gn,-1.25);
 _gq.setFromAxisAngle(_gU,Math.atan2(_gt.x,_gt.z));_gm.compose(_gp,_gq,_gs);gcar.setMatrixAt(i,_gm);
 const fx=_gp.x+_gt.x*2.08,fz=_gp.z+_gt.z*2.08,rx=_gp.x-_gt.x*2.08,rz=_gp.z-_gt.z*2.08;
 P.setXYZ(i*4,fx+_gn.x*.62,.62,fz+_gn.z*.62);P.setXYZ(i*4+1,fx-_gn.x*.62,.62,fz-_gn.z*.62);P.setXYZ(i*4+2,rx+_gn.x*.62,.66,rz+_gn.z*.62);P.setXYZ(i*4+3,rx-_gn.x*.62,.66,rz-_gn.z*.62)});
 gcar.instanceMatrix.needsUpdate=true;P.needsUpdate=true}
// sleek street lights: tapered brushed-metal mast + swept arm over the curb lane, slim LED bar head (warm white) with an ember accent ring; 2 instanced draws + 1 glow sprite pass
{const n=SLp.length,ARM=1.9,H=5.6;const mast=new THREE.CylinderGeometry(.045,.1,H,6).translate(0,H/2,0),arm=new THREE.BoxGeometry(.07,.06,ARM).translate(0,H-.05,ARM/2),cap=new THREE.BoxGeometry(.2,.09,.62).translate(0,H-.1,ARM-.05),base=new THREE.CylinderGeometry(.16,.2,.32,8).translate(0,.16,0);
 for(const g of [mast,arm,cap,base])g.deleteAttribute('uv');const pole=new THREE.InstancedMesh(mergeGeometries([mast,arm,cap,base]),new THREE.MeshStandardMaterial({color:0x2a2f3a,metalness:.85,roughness:.32}),Math.max(1,n));
 const bar=new THREE.InstancedMesh(mergeGeometries([new THREE.BoxGeometry(.12,.025,.5).translate(0,H-.16,ARM-.05),new THREE.CylinderGeometry(.13,.13,.04,10).translate(0,1.1,0)]),new THREE.MeshBasicMaterial({color:0xffe6c4,toneMapped:false}),Math.max(1,n));
 const lp=[],q=new THREE.Quaternion(),one=new THREE.Vector3(1,1,1),Y=new THREE.Vector3(0,1,0);SLp.forEach((p,i)=>{const d=SLd[i]||_v.set(0,0,1);q.setFromAxisAngle(Y,Math.atan2(d.x,d.z));_m.compose(p,q,one);pole.setMatrixAt(i,_m);bar.setMatrixAt(i,_m);lp.push(p.x+d.x*(ARM-.05),H-.2,p.z+d.z*(ARM-.05))});
 pole.count=bar.count=n;pole.computeBoundingSphere();bar.computeBoundingSphere();S.add(pole,bar);window.__lamps={n,pole,bar};
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lp,3));S.add(new THREE.Points(g,glowMat(0xffd9a8,2.0)))}

// ---------- bioluminescent parks + fireflies ----------
{const parks=[];CORE.filter(c=>N[c]).forEach((c,i,arr)=>{const a=N[c].ang+Math.PI/arr.length;parks.push(new THREE.Vector3(Math.cos(a)*RING,0,Math.sin(a)*RING))});
 for(let i=0;i<6;i++){const a=i/6*6.283+.3;parks.push(new THREE.Vector3(Math.cos(a)*103,0,Math.sin(a)*103))}
 const trees=[];parks.forEach(pk=>{for(let i=0;i<LV.trees/parks.length;i++){const a=rnd()*6.283,r=Math.sqrt(rnd())*20;const x=pk.x+Math.cos(a)*r,z=pk.z+Math.sin(a)*r;
  if(Math.abs(Math.hypot(x,z)-81)<8)continue;if(onRoad(x,z,.8))continue;if(colliders.some(c=>Math.hypot(c.x-x,c.z-z)<c.r+1))continue;trees.push({x,z,h:2+rnd()*4})}});
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
 const pyG=new THREE.CylinderGeometry(.35,.6,1,6),pyM=new THREE.MeshStandardMaterial({color:0x10172a,metalness:.9,roughness:.4});for(let i=0;i<32;i++){let p=loop.getPoint(i/32);for(let k=1;k<16&&onRoad(p.x,p.z,.8);k++)p=loop.getPoint(((i+(k%2?1:-1)*Math.ceil(k/2)*.06)/32+1)%1);if(onRoad(p.x,p.z,.8))continue;const py=new THREE.Mesh(pyG,pyM);py.scale.y=p.y;py.position.set(p.x,p.y/2,p.z);S.add(py);colliders.push({x:p.x,z:p.z,r:.7,h:p.y})}
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

// (AEGIS alert faces no longer take over the tower billboards: AEGIS lives on its Pyramid HQ, js/aegis-pyramid.js)

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
 const bcol=new THREE.Color(c),amber=new THREE.Color(0xffa040);let ph=0,lt=0;
 search.push(t=>{const th=window.__aegisThreat||0,dt=Math.min(.1,t-lt);lt=t;ph+=dt*(1+th*.7);const vis=U.day.value<(th?.75:.6);cone.visible=vis;cone.material.uniforms.c.value.lerpColors(bcol,amber,th>=2?.8:0);head.rotation.z=.4*Math.sin(ph*.21+i*2);head.rotation.x=.4*Math.cos(ph*.15+i)})});
const steam=(()=>{const spots=sats.filter(()=>rnd()<.06);const cnt=Math.max(1,spots.length)*14,g=new THREE.BufferGeometry(),l=new Float32Array(cnt).map(()=>Math.random());g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(cnt*3),3));
 const pts=new THREE.Points(g,glowMat(0x8090a8,5,{blending:THREE.NormalBlending,opacity:.12}));pts.frustumCulled=false;S.add(pts);return dt=>{if(!spots.length)return;const a=g.attributes.position;for(let i=0;i<cnt;i++){l[i]+=dt*.25;if(l[i]>1)l[i]=0;const s=spots[i%spots.length];a.setXYZ(i,s.x+Math.sin(i+l[i]*3)*l[i]*2,s.top+l[i]*9,s.z+Math.cos(i)*l[i]*2)}a.needsUpdate=true}})();
const drones=(()=>{const D=[];CORE.concat('XRP').filter(c=>N[c]).forEach(c=>{for(let i=0;i<(MOBILE?3:6);i++)D.push({n:N[c],r:N[c].w*2.6+i*1.5,y:N[c].h*(.3+rnd()*.6),sp:(.3+rnd()*.5)*(i%2?1:-1),ph:rnd()*6})});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(D.length*3),3));const m=glowMat(0xaaffff,1.4);const p=new THREE.Points(g,m);p.frustumCulled=false;S.add(p);
 let dph=0,dlt=0;const dc0=m.color.clone();
 return t=>{const th=window.__aegisThreat||0;dph+=Math.min(.1,t-dlt)*(1+th*.6);dlt=t;const a=g.attributes.position;D.forEach((d,i)=>a.setXYZ(i,d.n.pos.x+Math.cos(dph*d.sp+d.ph)*d.r,d.y+Math.sin(t*2+i)*.6,d.n.pos.z+Math.sin(dph*d.sp+d.ph)*d.r));a.needsUpdate=true;m.opacity=.6+.4*Math.sin(t*8);if(th>=2&&!window.__reducedMotion)m.color.setHex(Math.floor(t*3)%2?0xff4040:0x4a7aff);else m.color.copy(dc0)}})();
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
let wMode='auto',wTarget=W[moodWeather],wRate=.5;
const autoKey=()=>moodWeather;   // Auto weather follows the market only (the AEGIS feed drives Response Ops in aegis.js, never the weather)
const setW=()=>{wRate=.5;wMode=$('weather').value;if(wMode==='auto')wTarget=W[autoKey()];else if(wMode!=='cycle')wTarget=W[wMode]};
function wchip(){const el=$('wchip');if(!el)return;const k=wMode==='auto'?moodWeather:null;el.textContent=k?`${WTIERS[k][0]} Market ${moodNow>=0?'+':''}${moodNow.toFixed(1)}% · ${WTIERS[k][1].split(' · ')[1]}`:`🌤 Weather: ${wMode} (manual)`;el.title=k?`${Math.round(greenNow*100)}% of city tokens green in 24h. Tap for weather settings.`:'Manual weather override. Tap for settings.'}
window.setMarketMood=(m,g)=>{if(m==null||!isFinite(m))return;moodNow=+m;if(g!=null&&isFinite(g))greenNow=+g;const k=tierFor(moodNow,greenNow);if(k!==moodWeather){moodWeather=k}if(wMode==='auto')wTarget=W[autoKey()];wchip()};
window.setAegisWeather=()=>false;window.__weatherMode=()=>wMode;   // setAegisWeather: kept as a no-op (AEGIS never changes the weather)
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
 const rays=new THREE.Group(),rayM=new THREE.ShaderMaterial({uniforms:{op:{value:0},rb:{value:0},t:U.t},transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,
  vertexShader:'varying vec2 vU;varying float vF;void main(){vU=uv;vec3 n=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vF=abs(dot(n,normalize(-mv.xyz)));gl_Position=projectionMatrix*mv;}',
  fragmentShader:'uniform float op,rb,t;varying vec2 vU;varying float vF;void main(){float a=op*pow(vF,2.5)*smoothstep(0.,.45,vU.y)*smoothstep(1.,.75,vU.y);vec3 sp=.6+.4*cos(6.2832*(vU.x*2.+vU.y*.6+t*.03+vec3(0.,.33,.67)));gl_FragColor=vec4(mix(vec3(1.,.86,.6),sp,rb*.6)*a,a);}'});
 const NR=TIER==='low'?3:6,RAYS=[];for(let i=0;i<NR;i++){const m=new THREE.Mesh(new THREE.CylinderGeometry(2+i%3,18+i*3,700,16,1,true),rayM);m.position.set(-500+i*90,260,-700+i*40);m.rotation.z=-.5+i*.06;m.rotation.x=.25;rays.add(m);RAYS.push(m)}
 const DPS=TIER==='low'?6:MOBILE?8:14,DN=NR*DPS,dP=new Float32Array(DN*3),dC=new Float32Array(DN*3),dS=[];for(let i=0;i<DN;i++)dS.push({r:i%NR,u:Math.random(),a:Math.random()*6.283,rr:Math.random()*.8,sp:.004+Math.random()*.006});
 const dG=new THREE.BufferGeometry();dG.setAttribute('position',new THREE.BufferAttribute(dP,3));dG.setAttribute('color',new THREE.BufferAttribute(dC,3));
 const dust=new THREE.Points(dG,new THREE.PointsMaterial({size:MOBILE?2.2:2.8,vertexColors:true,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));dust.frustumCulled=false;rays.add(dust);
 const _dv=new THREE.Vector3(),updDust=(dt,k)=>{rays.updateMatrixWorld();dS.forEach((d,i)=>{d.u+=d.sp*dt*6;if(d.u>1){d.u=0;d.a=Math.random()*6.283;d.rr=Math.random()*.8}const m=RAYS[d.r],r=m.geometry.parameters,rad=(r.radiusTop+(r.radiusBottom-r.radiusTop)*d.u)*d.rr;
   _dv.set(Math.cos(d.a)*rad,350-700*d.u,Math.sin(d.a)*rad).applyMatrix4(m.matrix);dP[i*3]=_dv.x;dP[i*3+1]=_dv.y;dP[i*3+2]=_dv.z;const f=Math.sin(Math.PI*Math.min(1,Math.max(0,(d.u-.25)/.7)))*k*.55;dC[i*3]=f;dC[i*3+1]=f*.88;dC[i*3+2]=f*.65});dG.attributes.position.needsUpdate=dG.attributes.color.needsUpdate=true};
 rays.visible=false;S.add(rays);
 const bow=makeRainbow(S,U,C,TIER==='low'?24:32);
 const NC=TIER==='low'?24:MOBILE?60:140,coinG=new THREE.CylinderGeometry(2.2,2.2,.4,14).rotateX(Math.PI/2),coinM=new THREE.MeshStandardMaterial({color:0xffc83a,emissive:0x8a5a00,emissiveIntensity:.9,metalness:1,roughness:.22});
 const coins=new THREE.InstancedMesh(coinG,coinM,NC);coins.frustumCulled=false;coins.visible=false;S.add(coins);const cs=[...Array(NC)].map(()=>({x:(Math.random()-.5)*160,y:Math.random()*120,z:(Math.random()-.5)*160,v:10+Math.random()*12,r:Math.random()*6,s:2+Math.random()*4}));
 const o=new THREE.Object3D(),sp=new THREE.Vector3();
 return (dt,t,w,day)=>{const rk=w.rays*(.35+.65*day);rays.visible=rk>.01;rayM.uniforms.op.value=rk*.18*(.85+.15*Math.sin(t*.4));rayM.uniforms.rb.value+=((w.rainbow||0)-rayM.uniforms.rb.value)*Math.min(1,dt);if(rays.visible)updDust(dt,Math.min(1,rk));
  bow(w.rainbow||0,day);
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
let bloomPresetName='balanced',bloomStrengthScale=1;
if(Q.has('graphicslab'))window.__graphicsTest={
 setBloomPreset(name){if(!isBloomComparisonPreset(name))return {ok:false,reason:'unknown-preset',preset:bloomPresetName};const p=getBloomComparisonPreset(name);bloomPresetName=name;bloomStrengthScale=p.strength;bloom.radius=p.radius;bloom.highPassUniforms.luminosityThreshold.value=p.threshold;return {ok:true,preset:name,profile:p}},
 getBloomPreset(){return {preset:bloomPresetName,profile:getBloomComparisonPreset(bloomPresetName)}}
};
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
function renderTot(){const T=pools.reduce((s,p)=>s+(p.tvl_xrp||0),0),LK=pools.reduce((s,p)=>s+(p.tvl_xrp||0)*(p.locked_pct||0)/100,0);
$('tot').innerHTML=`Pools <b>${pools.length}</b> · Districts <b>${E.nodes.length}</b> · TVL <b>${fmt(T)} XRP</b><br>Locked LP <b style="color:#3cf3ff">${(LK/T*100).toFixed(1)}%</b> · insider-held pools ⚑ <b style="color:#ffb000">${pools.filter(p=>p.insider_pct>=50).length}</b><br><span class="dim">read-only · sources below</span>`;}renderTot();
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
 ${n.name==='XRP'?'':`<tr><td>Market cap <span class="dim">(height)</span></td><td>${n.mc!=null?fmt(n.mc)+' XRP'+(n.mcap_src==='xrpl.to'?` <i class="est" title="AMM liquidity under 1,000 XRP, so the market cap is xrpl.to's">xrpl.to</i>`:n.mcap_src==='amm-thin'?` <i class="est" title="price from a thin pool (<1,000 XRP depth)">thin</i>`:n.mcap==null?'':n.price_src&&n.price_src!=='amm-xrp'?` <i class="est" title="priced via ${n.price_src.replace('amm-via-','')} AMM">est.</i>`:''):na}</td></tr>`}
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
 <div class="kpis">${kp('Price',isX?'1 XRP':n.price_xrp!=null?priceFmt(n.price_xrp)+' XRP':na,'')}${isX?'':kp('Market cap',n.mc!=null?fmtS(n.mc)+' XRP':na,n.mc!=null?'tower height':'height from TVL')}${kp('TVL',fmtS(n.tvl)+' XRP','base width')}${kp('LP locked',(n.lockedShare*100).toFixed(1)+'%',LOCKT[n.tier][1])}${isX?'':kp('Burned',bu&&bu.burned_pct!=null?`<span style="color:#ff8a2a">${bu.burned_pct.toFixed(2)}%</span>`:nb?'🔥 '+fmt(nb)+' txs':na,bu&&bu.burned!=null?fmtS(bu.burned)+' '+n.name:nb?'supply % not verified':'')}</div>
 ${isX||!iss?'':`<div class="rb"><div class="rbh">🔥 Recent burns <span class="dim">sent to issuer</span></div><div class="rbl" data-iss="${iss}" data-cur="${n.key.split('-')[1]}" data-tok="${n.name}"><span class="dim">Loading from the ledger…</span></div></div>`}
 <div class="cardBtns"><a class="trade" href="${tradeUrl(n)}" target="_blank" rel="noopener">🔥 Trade ${isX?'':'$'+n.name+' '}on xrpburn.com</a>${iss?`<a href="https://livenet.xrpl.org/accounts/${iss}" target="_blank" rel="noopener" title="${iss}">Issuer ↗</a>`:''}</div>
 <details class="more"><summary>More stats &amp; pools</summary>${tbl}</details>
 <div class="attr dim">Trades open on xrpburn.com and are signed in your own wallet; Burn City never holds funds. Prices: <a href="https://xrpl.to" target="_blank" rel="noopener">Data by xrpl.to</a></div>`}
function descPool(p){const b=bridges.find(x=>x.p===p);return `<button class="x" aria-label="Close">✕</button><h2>${p.a} ⇄ ${p.b}</h2><table><tr><td>Forever Rails</td><td><b style="color:${b&&b.forever?'#ffc64a':'#8fd8ff'}">${fmt(p.tvl_xrp*(p.locked_pct||0)/100)} XRP locked forever</b> (${(p.locked_pct||0).toFixed(1)}% of pool)${b&&b.forever?' ∞':''} <span class="dim">LP in blackholed wallets: can never be withdrawn</span></td></tr><tr><td>Activity <span class="dim">(line colour)</span></td><td>${b&&b.act!=null?`<b style="color:#${b.actCol.getHexString()}">${b.act>=.85?'Very active':b.act>=.6?'Active':b.act>=.3?'Moderate':'Quiet'}</b> · top ${Math.max(1,Math.round((1-b.act)*100))}%`:'—'}</td></tr><tr><td>TVL</td><td>${fmt(p.tvl_xrp)} XRP</td></tr><tr><td>Trading fee</td><td>${p.fee_pct}%</td></tr>
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
const ESTATE=buildEstate({S,U,pick,anim,nodes:E.nodes,low:TIER==='low',avoid:[LPD.c],colliders,streetMat:STREETML,STRIP});window.__estate=ESTATE;
// ---------- ledger veins: faint light trails in the ground under every AMM bridge; a pulse runs along on each live trade ----------
{const NV=Math.min(TIER==='low'?8:(TIER==='medium'||MOBILE)?14:40,bridges.length),P=[],UV=[],IX=[],BI=[],act=new Float32Array(40),pt=new Float32Array(40).fill(-99);
 bridges.slice(0,NV).forEach((b,i)=>{if(!b.curve)return;const pts=[];for(let k=0;k<=32;k++){const q=b.curve.getPoint(k/32);pts.push(new THREE.Vector3(q.x,.07,q.z))}const n0=P.length/3;STRIP(pts,false,1.3,P,UV,IX);for(let k=n0;k<P.length/3;k++)BI.push(i)});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(UV,2));g.setAttribute('bi',new THREE.Float32BufferAttribute(BI,1));g.setIndex(IX);
 const m=new THREE.ShaderMaterial({side:THREE.DoubleSide,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,uniforms:{t:U.t,day:U.day,act:{value:act},pt:{value:pt}},
  vertexShader:'attribute float bi;uniform float act[40],pt[40];varying vec2 vS;varying float vA,vP;void main(){vS=uv;int i=int(bi+.5);vA=act[i];vP=pt[i];gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader:'uniform float t,day;varying vec2 vS;varying float vA,vP;void main(){float x=vS.x/.65;float core=exp(-x*x*6.);float dt=t-vP;float head=dt*45.;float d=vS.y-head;float pul=dt>0.&&dt<8.?exp(-d*d/40.)*exp(-dt*.35):0.;float flow=.5+.5*sin(vS.y*.25-t*(.6+1.6*vA));float a=core*(.05+.16*vA*flow+1.1*pul)*(1.-day*.55);vec3 c=mix(vec3(.2,.7,1.),vec3(1.,.55,.15),clamp(vA*1.2+pul,0.,1.));gl_FragColor=vec4(c*a,a);}'});
 const vm=new THREE.Mesh(g,m);vm.frustumCulled=false;vm.renderOrder=1;S.add(vm);
 let nx=0;anim.push(t=>{if(t<nx)return;nx=t+1;bridges.slice(0,NV).forEach((b,i)=>{act[i]=b.act||0;pt[i]=b.pulseT??-99})});window.__veins={bridges:()=>bridges.slice(0,NV),pt}}
// ---------- parks & plazas: lake-shore park + central plaza (grass, low-poly trees, benches, lamps), all instanced ----------
{const lowT=TIER==='low',e=ESTATE,spots=[],grass=[],benches=[],lamps=[],trees=[];
 const free=(x,z,r)=>!onRoad(x,z,r)&&!colliders.some(c=>c.r>0&&Math.hypot(c.x-x,c.z-z)<c.r+r)&&!e.inLake(x,z,4)&&Math.abs((x-e.roadO.x)*e.dir.z-(z-e.roadO.z)*e.dir.x)>13;
 // lake shore (city side), skipping the docks stretch
 for(let u=-160;u<=160;u+=lowT?14:8){if(u>-118&&u<-34)continue;const p=e.lakeC.clone().addScaledVector(e.side,u).addScaledVector(e.dir,-e.D*2.2);let k=0;while(k++<200&&!e.inLake(p.x,p.z,5))p.addScaledVector(e.dir,1);if(k>=200)continue;p.addScaledVector(e.dir,-5);
  for(const off of [3,9,15]){const q=p.clone().addScaledVector(e.dir,-off);if(free(q.x,q.z,2.5))spots.push([q.x,q.z,'shore',u,off])}}
 // central plaza around the hub
 for(let i=0;i<(lowT?12:24);i++){const a=i/(lowT?12:24)*6.2832,r=48+(i%2)*6,x=Math.cos(a)*r,z=Math.sin(a)*r;if(Math.hypot(x,z-52)<6)continue;/* keep the explore spawn (0,52) clear */if(free(x,z,2))spots.push([x,z,'plaza',i,0])}
 spots.forEach(([x,z,kind,u,off],j)=>{if(kind==='shore'){if(off===9)grass.push(x,z,4+(j%3));if(off===15&&j%2===0)trees.push(x,z);if(off===3&&j%3===0)benches.push(x,z,Math.atan2(e.dir.x,e.dir.z));if(off===3&&j%3===1)lamps.push(x,z)}
  else{if(u%2===0){grass.push(x,z,3.2);trees.push(x+1.5,z)}else{benches.push(x,z,Math.atan2(-x,-z));lamps.push(x*1.04,z*1.04)}}});
 const g0=new THREE.CircleGeometry(1,10).rotateX(-Math.PI/2),gm=new THREE.InstancedMesh(g0,new THREE.MeshLambertMaterial({color:0x2f7a3a,emissive:0x0c3016}),grass.length/3);
 for(let i=0;i<grass.length/3;i++){_m.compose(_v.set(grass[i*3],.06,grass[i*3+1]),_q.identity(),_s.set(grass[i*3+2],1,grass[i*3+2]*.8));gm.setMatrixAt(i,_m)}
 const tN=trees.length/2,tr=new THREE.InstancedMesh(new THREE.CylinderGeometry(.12,.18,1.6,5).translate(0,.8,0),new THREE.MeshLambertMaterial({color:0x3a2a1c}),tN),cr=new THREE.InstancedMesh(new THREE.ConeGeometry(1.2,3.2,6).translate(0,3,0),new THREE.MeshLambertMaterial({color:0x2f6e3a,emissive:0x061a0c}),tN);
 for(let i=0;i<tN;i++){const s2=.8+((i*37)%10)/20;_m.compose(_v.set(trees[i*2],0,trees[i*2+1]),_q.identity(),_s.set(s2,s2,s2));tr.setMatrixAt(i,_m);cr.setMatrixAt(i,_m);colliders.push({x:trees[i*2],z:trees[i*2+1],r:.4,h:4})}
 const bN=benches.length/3,bg=mergeGeometries([new THREE.BoxGeometry(1.8,.1,.5).translate(0,.45,0),new THREE.BoxGeometry(1.8,.5,.08).translate(0,.75,-.22),new THREE.BoxGeometry(.08,.45,.45).translate(-.8,.22,0),new THREE.BoxGeometry(.08,.45,.45).translate(.8,.22,0)]),bm=new THREE.InstancedMesh(bg,new THREE.MeshLambertMaterial({color:0x6a4a2e}),bN);
 for(let i=0;i<bN;i++){_m.compose(_v.set(benches[i*3],0,benches[i*3+1]),_q.setFromEuler(new THREE.Euler(0,benches[i*3+2],0)),_s.set(1,1,1));bm.setMatrixAt(i,_m)}
 const lN=lamps.length/2,lpm=new THREE.InstancedMesh(new THREE.CylinderGeometry(.05,.07,3.4,5).translate(0,1.7,0),new THREE.MeshStandardMaterial({color:0x2a3040,metalness:.7}),lN),lg=[];
 for(let i=0;i<lN;i++){_m.makeTranslation(lamps[i*2],0,lamps[i*2+1]);lpm.setMatrixAt(i,_m);lg.push(lamps[i*2],3.5,lamps[i*2+1])}
 const lgg=new THREE.BufferGeometry();lgg.setAttribute('position',new THREE.Float32BufferAttribute(lg,3));S.add(gm,tr,cr,bm,lpm,new THREE.Points(lgg,glowMat(0xffd9a0,1.8)));
 window.__parks={grass:grass.length/3,trees:tN,benches:bN,lamps:lN};
 const items=[];for(let i=0;i<bN;i++)items.push([benches[i*3],benches[i*3+1],1]);for(let i=0;i<lN;i++)items.push([lamps[i*2],lamps[i*2+1],.2]);for(let i=0;i<grass.length/3;i++)items.push([grass[i*3],grass[i*3+1],0]);window.__props={items,lights:SLp.map(v=>[v.x,v.z])};
 // load-time audit: count anything solid standing on a street/sidewalk or the highway (should be 0)
 {const o=e.roadO||e.cityEdge,d=e.dir,hw=(x,z,r)=>{const al=(x-o.x)*d.x+(z-o.z)*d.z;return al>-2&&al<e.roadLen&&Math.abs((x-o.x)*d.z-(z-o.z)*d.x)<7.5+r};let solid=0,props=0;
  for(const k of colliders)if(k.r>0&&!k.node&&(onRoad(k.x,k.z,k.r)||hw(k.x,k.z,k.r)))solid++;for(const [x,z,r] of items)if(onRoad(x,z,r)||hw(x,z,r))props++;
  window.__roadAudit={solid,props};if(solid||props)console.warn('[roads] objects on roads:',solid,props)}}

function showInfo(u){window.__infoU=u;if(u.kind==='aegis'){$('info').style.display='none';window.__aegis&&window.__aegis.open(u.cam);return}if(u.kind==='tackle'){window.__fish&&window.__fish.openShop();return}if(u.kind==='estate'){$('info').innerHTML=estateCard();$('info').classList.remove('v2');$('info').style.display='block';$('info').querySelector('.x').onclick=()=>$('info').style.display='none';return}const ih=document.getElementById('iosHint');ih&&ih.remove();if(u.kind==='ad'||u.ad){$('info').innerHTML=descAd(u.ad);$('info').style.display='block';$('info').querySelector('.x').onclick=()=>$('info').style.display='none';return}$('info').innerHTML=u.lot?descLot(u.lot):u.node?descNode(u.node):descPool(u.pool);$('info').classList.toggle('v2',!!(u.node&&!u.lot));$('info').style.display='block';if(u.node&&u.node.name==='BURN'&&window.__openBurnTowerInterior&&!u.lot){const eb=document.createElement('button');eb.type='button';eb.textContent='🔥 Enter the PYRETHEUM';eb.style.cssText='display:block;margin:10px 0 2px;padding:9px 14px;border-radius:10px;border:1px solid #ff9d43;background:#29120b;color:#ffd4a0;font:700 13px system-ui;cursor:pointer';eb.onclick=e=>{e.stopPropagation();$('info').style.display='none';window.__openBurnTowerInterior()};$('info').appendChild(eb)}$('info').scrollTop=0;window.__onCard&&window.__onCard($('info'));$('info').querySelector('.x').onclick=()=>$('info').style.display='none'}

// ---------- controls: Orbit / Fly / Explore ----------
const orbit=new OrbitControls(C,R.domElement);orbit.enableDamping=true;orbit.maxPolarAngle=1.5;orbit.target.set(0,30,0);orbit.minDistance=8;orbit.maxDistance=900;orbit.autoRotateSpeed=.35;
let mode='orbit',tour=null;const keys={},yp={yaw:0,pitch:0};let exploreCamDistance=6.5;const EXPLORE_CAM_MIN=2.5,EXPLORE_CAM_MAX=14;
const P={pos:new THREE.Vector3(0,0,55),vel:new THREE.Vector3(),onGround:true,fp:false,spawned:0,district:'',walk:0,near:null};
const me=new PlayerState();
const avatar=(()=>{const g=buildWalker({suit:0x2c4468,accent:0x7ee0ff,skin:1});const suit=new THREE.MeshStandardMaterial({color:0x1b2338,metalness:.6,roughness:.35,emissive:0x050a18}),glow=new THREE.MeshBasicMaterial({color:0x7ee0ff});
 const bp=new THREE.Mesh(new THREE.BoxGeometry(.32,.46,.16),suit);bp.position.set(0,1.3,.22);g.add(bp);const thr=new THREE.Mesh(new THREE.BoxGeometry(.24,.05,.04),glow);thr.position.set(0,1.1,.31);g.add(thr);
 const ring=new THREE.Mesh(new THREE.RingGeometry(.45,.55,32),new THREE.MeshBasicMaterial({color:0x7ee0ff,transparent:true,opacity:.3,side:2}));ring.rotation.x=-Math.PI/2;ring.position.y=.035;g.add(ring);
 const pl=new THREE.PointLight(0x7ee0ff,0,6,2);S.add(pl);g.userData.pl=pl;g.visible=false;S.add(g);return g})();
// avatar glow stays in the scene at 0 intensity while hidden: toggling a light's visibility changes the light count and recompiles every lit shader (hitch on entering Explore)
anim.push(()=>{const pl=avatar.userData.pl;pl.intensity=avatar.visible?2:0;if(avatar.visible)pl.position.set(avatar.position.x,avatar.position.y+1.5,avatar.position.z)});
let NET=null;const peers=new Map();window.__city={audio:()=>({AC,on:!!aud.on,master:aud.master}),pick,colliders,groundAt,streets,drone:()=>DRONE&&DRONE.grp,avatar,S,C,P,R,N,orbit,MOBILE,bridges,comp,bloom,sanitize,RT_BYTE,APPLE_GPU,U,E,TIER,sfx:{whoosh:()=>{if(!AC||!aud.on)return;const t0=AC.currentTime,s=AC.createBufferSource();s.buffer=aud.nb;const f=AC.createBiquadFilter();f.type='bandpass';f.Q.value=1.2;f.frequency.setValueAtTime(300,t0);f.frequency.exponentialRampToValueAtTime(2400,t0+.7);const g=AC.createGain();g.gain.setValueAtTime(0,t0);g.gain.linearRampToValueAtTime(.5,t0+.25);g.gain.exponentialRampToValueAtTime(.001,t0+1.1);s.connect(f).connect(g).connect(aud.master);s.start(t0);s.stop(t0+1.2)}},isTour:()=>!!tour,getMode:()=>mode,soundOn:()=>!!aud.on,showInfo,input:{keys,yp,get joy(){return joy},get tb(){return tb}},get bokeh(){return bokeh}};
function tlOn(){return !!(window.__wildsTravelLocked&&window.__wildsTravelLocked())}
function setMode(m){if(tlOn()&&m!=='explore')return;const prev=mode;mode=m;tour=null;window.__modeReset&&window.__modeReset();$('tourCap')&&$('tourCap').classList.remove('show');document.querySelectorAll('#btns [data-m]').forEach(b=>b.classList.toggle('on',b.dataset.m===m));orbit.enabled=m==='orbit';avatar.visible=m==='explore'&&!P.fp;
 $('touch').classList.toggle('on',MOBILE&&(m==='explore'||m==='fly'));['tUp','tDown'].forEach(i=>$(i).style.display=m==='fly'?'':'none');['tJump','tRun','tUse'].forEach(i=>$(i).style.display=m==='explore'?'':'none');
 if(m!=='orbit'){const d=C.getWorldDirection(new THREE.Vector3());yp.yaw=Math.atan2(-d.x,-d.z);yp.pitch=Math.asin(Math.max(-1,Math.min(1,d.y)))}
 if(m==='explore'){if(prev==='fly'){/* drop the walker right under the drone, same heading; over the lake -> nearest shore */const q=C.position,es=window.__estate;let x=q.x,z=q.z;if(es&&es.inLake(x,z)){let dx=x-es.lakeC.x,dz=z-es.lakeC.z;if(Math.hypot(dx,dz)<1){dx=-es.dir.x;dz=-es.dir.z}const dl=Math.hypot(dx,dz);for(let k=0;k<400&&es.inLake(x,z);k++){x+=dx/dl;z+=dz/dl}x+=dx/dl*2;z+=dz/dl*2}
  x=Math.max(-900,Math.min(900,x));z=Math.max(-900,Math.min(900,z));{const g0=groundAt(x,z,q.y);P.pos.set(x,Math.max(g0,Math.min(q.y-2.5,g0+30)),z)}P.vel.set(0,0,0);P.onGround=false;P.climb=null;P.spawned=1;avatar.rotation.y=yp.yaw}
 else if(!P.spawned){P.pos.set(0,0,52);P.spawned=1;yp.yaw=0;yp.pitch=-.12}}
 if((m==='explore'||m==='fly')&&document.pointerLockElement){window.__lockSwap=1;document.exitPointerLock()}
 if(m==='orbit'){if(document.pointerLockElement)document.exitPointerLock();orbit.target.copy(C.position).add(C.getWorldDirection(new THREE.Vector3()).multiplyScalar(80));orbit.target.y=Math.max(5,orbit.target.y)}
 $('prompt').style.display='none';
 $('help').textContent=m==='orbit'?'Drag orbit · scroll/pinch zoom · click a tower, road, billboard or terminal for live stats':m==='fly'?(MOBILE?'Left stick fly · drag to look · ▲ up · ▼ down · tap things to inspect':'WASD move · right-click drag to look · left-click objects to inspect · Space up · C down · Shift fast'):MOBILE?'Left stick walk · drag to look · tap things to inspect · USE talks to what\'s next to you':'WASD walk · Shift run · Space jump · hold right-click to look · left-click to select · E interact · V 1st/3rd person'+(NET?' · Enter chat':'')}
window.__setBurnMode=setMode;
document.querySelectorAll('#btns [data-m]').forEach(b=>b.onclick=()=>setMode(b.dataset.m));
addEventListener('keydown',e=>{if(document.activeElement===$('chatIn'))return;keys[e.code]=1;if(mode==='explore'){if(e.code==='KeyE')interact();if(e.code==='KeyV'){P.fp=!P.fp}}if(e.code==='Enter'&&NET){$('chatIn').focus();e.preventDefault()}});
addEventListener('keyup',e=>keys[e.code]=0);
// Third-person camera zoom: keep scroll from moving the page while exploring, and clamp to a comfortable collision-safe range.
R.domElement.addEventListener('wheel',e=>{if(mode!=='explore'||P.fp)return;e.preventDefault();exploreCamDistance=THREE.MathUtils.clamp(exploreCamDistance+Math.sign(e.deltaY)*.85,EXPLORE_CAM_MIN,EXPLORE_CAM_MAX)},{passive:false});
addEventListener('mousemove',e=>{const lk=document.pointerLockElement===R.domElement&&(mode==='fly'||mode==='explore'),rl=(mode==='explore'||mode==='fly')&&!MOBILE&&RLOOK&&(e.buttons&2);if(lk||rl){const k=rl?.0028:.0022;yp.yaw-=e.movementX*k;yp.pitch=Math.max(-1.3,Math.min(1.3,yp.pitch-e.movementY*k))}});
// Explore on PC: cursor stays visible. Hold right mouse to look around, left-click things (towers, ships, shop, signs).
let RLOOK=false;R.domElement.addEventListener('contextmenu',e=>{if(mode==='explore'||mode==='fly')e.preventDefault()});
R.domElement.addEventListener('pointerdown',e=>{if((mode==='explore'||mode==='fly')&&e.pointerType==='mouse'&&e.button===2){RLOOK=true;R.domElement.style.cursor='grabbing';$('tip').style.display='none'}});
addEventListener('pointerup',e=>{if(e.button===2&&RLOOK){RLOOK=false;R.domElement.style.cursor=''}});addEventListener('blur',()=>{RLOOK=false;R.domElement.style.cursor=''});
// Fly mode keeps the cursor available: right-drag looks, left-click inspects objects.
const joy={x:0,y:0,id:null},look={id:null,x:0,y:0},tb={jump:0,run:0,up:0,down:0};let pinchDist=0;const jEl=$('joy'),kEl=$('knob');
jEl.addEventListener('touchstart',e=>{joy.id=e.changedTouches[0].identifier;e.preventDefault()},{passive:false});
addEventListener('touchmove',e=>{if(e.touches.length>=2&&mode==='explore'&&!P.fp){const a=e.touches[0],b=e.touches[1],d=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);if(pinchDist)exploreCamDistance=THREE.MathUtils.clamp(exploreCamDistance+(pinchDist-d)*.025,EXPLORE_CAM_MIN,EXPLORE_CAM_MAX);pinchDist=d;return}for(const t of e.changedTouches){if(t.identifier===joy.id){const r=jEl.getBoundingClientRect();let dx=(t.clientX-r.left-60)/50,dy=(t.clientY-r.top-60)/50;const l=Math.hypot(dx,dy);if(l>1){dx/=l;dy/=l}joy.x=dx;joy.y=dy;kEl.style.left=35+dx*40+'px';kEl.style.top=35+dy*40+'px'}
 else if(t.identifier===look.id&&mode!=='orbit'){yp.yaw-=(t.clientX-look.x)*.005;yp.pitch=Math.max(-1.3,Math.min(1.3,yp.pitch-(t.clientY-look.y)*.005));look.x=t.clientX;look.y=t.clientY}}},{passive:true});
R.domElement.addEventListener('touchstart',e=>{if(e.touches.length>=2&&mode==='explore'&&!P.fp){const a=e.touches[0],b=e.touches[1];pinchDist=Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);look.id=null;return}const t=e.changedTouches[0];if(mode!=='orbit'){look.id=t.identifier;look.x=t.clientX;look.y=t.clientY}},{passive:true});
addEventListener('touchend',e=>{for(const t of e.changedTouches){if(t.identifier===joy.id){joy.id=null;joy.x=joy.y=0;kEl.style.left=kEl.style.top='35px'}if(t.identifier===look.id)look.id=null}if(e.touches.length<2)pinchDist=0}});
const hold=(id,k)=>{const el=$(id);el.addEventListener('touchstart',e=>{tb[k]=1;e.preventDefault()},{passive:false});el.addEventListener('touchend',()=>tb[k]=0);el.addEventListener('touchcancel',()=>tb[k]=0)};['tJump:jump','tRun:run','tUp:up','tDown:down'].forEach(s=>hold(...s.split(':')));
$('tUse').addEventListener('touchstart',e=>{interact();e.preventDefault()},{passive:false});

// ---------- explore: physics, collisions, districts, interaction ----------
function groundAt(x,z,y){let g=0;for(const c of colliders){if(c.h<=y+.35&&c.h>g&&Math.hypot(x-c.x,z-c.z)<c.r)g=c.h}if(window.__deckAt){const dk=window.__deckAt(x,z);if(dk!=null&&dk<=y+1.4&&dk>g)g=dk}if(window.__hwDeck){const hd=window.__hwDeck(x,z);if(hd!=null&&hd<=y+1.4&&hd>g)g=hd}return g}
// walkers stay out of the water except on docks and the lake bridge
function wet(x,z){const es=window.__estate;if(!es||!es.inLake(x,z))return false;if(window.__deckAt&&window.__deckAt(x,z)!=null)return false;const ce=es.roadO||es.cityEdge,dr=es.dir;if(ce&&dr&&Math.abs((x-ce.x)*dr.z-(z-ce.z)*dr.x)<7.5)return false;return true}
function collide(p){for(const c of colliders){if(p.y>=c.h-.05)continue;const dx=p.x-c.x,dz=p.z-c.z,m=c.r+.38;if(Math.abs(dx)>m||Math.abs(dz)>m)continue;const d=Math.hypot(dx,dz);if(d<m){const k=(m-d)/(d||1);p.x+=dx*k;p.z+=dz*k}}}
const dirOf=()=>_t.set(-Math.sin(yp.yaw)*Math.cos(yp.pitch),Math.sin(yp.pitch),-Math.cos(yp.yaw)*Math.cos(yp.pitch)).clone();
// ---------- web shooters: Web mode on -> HOLD jump = attach to the best anchor ahead & above and swing; release = let go, keep momentum ----------
const WEB={on:localStorage.bcWeb==='1',a:null,L:0,prev:false,cd:0,mom:new THREE.Vector3(),line:null};
{const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);WEB.line=new THREE.Line(g,new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.9}));WEB.line.frustumCulled=false;WEB.line.visible=false;S.add(WEB.line)}
const webBtn=document.createElement('button');webBtn.id='webBtn';webBtn.textContent='🕸 Web';webBtn.style.cssText='position:fixed;right:12px;bottom:calc(400px + env(safe-area-inset-bottom));z-index:31;display:none;font:700 14px system-ui;padding:9px 13px;border-radius:12px;border:1px solid #ffffff66;background:#0b1220e0;color:#fff';document.body.append(webBtn);
const webSet=v=>{WEB.on=v;localStorage.bcWeb=v?'1':'0';webBtn.style.background=v?'#e8f0ff':'#0b1220e0';webBtn.style.color=v?'#0b1220':'#fff';webBtn.setAttribute('aria-pressed',v);if(!v)webDrop()};webSet(WEB.on);
webBtn.onclick=e=>{e.stopPropagation();webSet(!WEB.on);if(WEB.on&&window.__jet&&window.__jet.on)jetBtn.click()};addEventListener('keydown',e=>{if(e.code==='KeyQ'&&mode==='explore'&&!tlOn()&&document.activeElement?.tagName!=='INPUT'&&document.activeElement?.tagName!=='TEXTAREA')webSet(!WEB.on)});
function webDrop(){if(WEB.a){WEB.mom.set(P.vel.x,0,P.vel.z)}WEB.a=null;WEB.line.visible=false}
function webAnchor(){const f=V3(-Math.sin(yp.yaw),0,-Math.cos(yp.yaw));let best=null,bs=-1e9;for(const c of colliders){if(!c.r||c.h<P.pos.y+5)continue;const dx=c.x-P.pos.x,dz=c.z-P.pos.z,d=Math.hypot(dx,dz);if(d<4||d>80)continue;const dot=(dx*f.x+dz*f.z)/d;if(dot<.35)continue;
  const y=Math.min(c.h-.5,P.pos.y+28),ax=c.x-dx/d*c.r,az=c.z-dz/d*c.r,dd=Math.hypot(ax-P.pos.x,y-P.pos.y,az-P.pos.z);if(dd>80)continue;if(y<P.pos.y+8)continue;const sc=dot*2-Math.abs(dd-32)/40+(y-P.pos.y)/25;if(sc>bs){bs=sc;best=V3(ax,y,az)}}
  for(const q of railPts()){const dx=q.x-P.pos.x,dz=q.z-P.pos.z,d=Math.hypot(dx,dz);if(d<4||d>80||q.y<P.pos.y+8)continue;const dot=(dx*f.x+dz*f.z)/d;if(dot<.35)continue;const dd=Math.hypot(d,q.y-P.pos.y);if(dd>80)continue;
   const sc=dot*2-Math.abs(dd-32)/40+Math.min(28,q.y-P.pos.y)/25;if(sc>bs){bs=sc;best=q.clone()}}return best}
let RAILS=null;function railPts(){if(RAILS)return RAILS;RAILS=[];for(const n of E.nodes){if(!n.group||n.roofY==null)continue;const top=n.roofY*(n.sy||1),R=n.w*(n.sxz||1)*1.1+.5;for(let y=12;y<Math.min(top,64);y+=9)for(let k=0;k<6;k++){const a=k/6*6.283+y*.37;RAILS.push(V3(n.pos.x+Math.cos(a)*R,y,n.pos.z+Math.sin(a)*R))}}   // mid-height tower-face anchors so street-level swings still have targets
 for(const b of bridges){if(!b.curve||b.minor&&!b.forever)continue;let L=12;try{L=b.curve.getLength()}catch(e){}const n=Math.max(1,Math.round(L/12));for(let i=1;i<n;i++){const v=b.curve.getPoint(i/n);if(v.y>6)RAILS.push(v)}}return RAILS}
const JET={on:false,f:1,thr:false,fly:false,v:new THREE.Vector3()};
const jetBtn=document.createElement('button');jetBtn.id='jetBtn';jetBtn.textContent='🚀 Jet';jetBtn.style.cssText=webBtn.style.cssText.replace('400px','452px');document.body.append(jetBtn);
const jetBar=document.createElement('div');jetBar.style.cssText='position:fixed;right:12px;bottom:calc(504px + env(safe-area-inset-bottom));z-index:31;width:84px;height:7px;border-radius:4px;background:#ffffff22;display:none;overflow:hidden';jetBar.innerHTML='<i style="display:block;height:100%;width:100%;background:linear-gradient(90deg,#ff5a1f,#ffd27a)"></i>';document.body.append(jetBar);
// phones: one gear column (board / web shooters / jetpack) under the top bar, clear of the joystick, the USE pad and the trick buttons
if(MOBILE){const st=document.createElement('style');st.textContent=`#gearBar{position:fixed;right:calc(10px + env(safe-area-inset-right));top:calc(env(safe-area-inset-top) + 128px);display:none;flex-direction:column;gap:8px;z-index:31}
#gearBar.on{display:flex}#gearBar button{position:static!important;min-width:76px;height:44px;padding:0 10px;font:700 14px system-ui;border-radius:12px;border:1px solid #ffffff66;background:#0b1220e0;color:#fff;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
#gearBar button.on{background:#ff7a18!important;color:#140600!important;border-color:#ffd2a8}
@media (max-height:520px){#gearBar{flex-direction:row;top:calc(env(safe-area-inset-top) + 58px);right:auto;left:50%;transform:translateX(-50%)}}`;document.head.append(st);
 const gb=document.createElement('div');gb.id='gearBar';const sk=document.createElement('button');sk.id='gbSkate';sk.textContent='🛹 Board';sk.setAttribute('aria-label','Skateboard');
 sk.onclick=e=>{e.stopPropagation();e.preventDefault();if(JET.on)jetBtn.click();if(WEB.on)webSet(false);window.__skate&&window.__skate.toggle()};
 gb.append(sk,webBtn,jetBtn);document.body.append(gb);
 const webOn=()=>webBtn.classList.toggle('on',WEB.on);webBtn.addEventListener('click',webOn);webOn();
 setInterval(()=>{const on=mode==='explore'&&!(window.__boat&&window.__boat.active)&&!window.__burnTowerOpen;gb.classList.toggle('on',on);sk.classList.toggle('on',!!(window.__skate&&window.__skate.active));webOn()},250)}
jetBtn.onclick=e=>{if(e)e.stopPropagation();JET.on=!JET.on;if(JET.on&&WEB.on)webSet(false);if(JET.on&&window.__skate&&window.__skate.active)window.__skate.toggle(false);jetBtn.style.background=JET.on?'#7a2a08e0':'#0b1220e0';jetBtn.setAttribute('aria-pressed',JET.on);jetBtn.classList.toggle('on',JET.on)};jetBtn.title='Jetpack: Space up · C/Ctrl down · WASD steer';
const pack=new THREE.Group();{const m=new THREE.MeshStandardMaterial({color:0x8a93a6,metalness:.8,roughness:.35});for(const s of[-1,1]){const t=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,.42,8),m);t.position.set(s*.11,1.25,.24);pack.add(t)}
 const fl=new THREE.Mesh(new THREE.ConeGeometry(.09,.55,8).translate(0,-.27,0).rotateX(Math.PI),new THREE.MeshBasicMaterial({color:0xff8a2a,transparent:true,opacity:.9,blending:THREE.AdditiveBlending,depthWrite:false}));fl.rotation.x=Math.PI;
 for(const s of[-1,1]){const f=fl.clone();f.position.set(s*.11,1.02,.24);f.visible=false;pack.add(f)}}pack.visible=false;avatar.add(pack);
const SMN=40,smG=new THREE.BufferGeometry(),smP=new Float32Array(SMN*3),smV=new Float32Array(SMN*4);smG.setAttribute('position',new THREE.BufferAttribute(smP,3));const smoke=new THREE.Points(smG,new THREE.PointsMaterial({color:0xb0a8a0,size:.45,transparent:true,opacity:.55,depthWrite:false}));smoke.frustumCulled=false;S.add(smoke);let smI=0;
function jetStep(dt,mv){const ok=!!window.__jetOK&&mode==='explore'&&!(window.__boat&&window.__boat.active);jetBtn.style.display=ok?'':'none';jetBar.style.display='none';pack.visible=ok&&JET.on;
  if(!ok)JET.on=false;JET.f=1;   // infinite fuel: no drain, no fuel bar
  const up=!!(keys.Space||tb.jump||tb.up),dn=!!(keys.KeyC||keys.ControlLeft||tb.down);
  if(MOBILE){const sh=mode==='fly'||(ok&&JET.on)?'':'none';if($('tUp').style.display!==sh){$('tUp').style.display=sh;$('tDown').style.display=sh}}
  // flying = jet on and airborne (or lifting off); on the ground with the jet on you walk normally until you ascend
  JET.fly=JET.on&&(!P.onGround||up);JET.thr=JET.fly;
  if(JET.fly){const run=keys.ShiftLeft||keys.ShiftRight||tb.run,top=run?26:16,ml=Math.hypot(mv.x,mv.z);
   // horizontal: steer toward the stick / WASD direction relative to the camera, responsive accel, quick stop when released
   const tx=ml>.05?mv.x/ml*top*Math.min(1,ml/5):0,tz=ml>.05?mv.z/ml*top*Math.min(1,ml/5):0,k=1-Math.exp(-dt*(ml>.05?4.5:2.5));JET.v.x+=(tx-JET.v.x)*k;JET.v.z+=(tz-JET.v.z)*k;
   // vertical: hover by default, ascend / descend while held (gravity is cancelled here, it is applied after this call)
   const vy=up?10:dn?-9:0;P.vel.y+=(vy-P.vel.y)*(1-Math.exp(-dt*5))+20*dt;if(P.pos.y>180&&P.vel.y>0)P.vel.y=Math.min(P.vel.y,20*dt);P.onGround=false;
  }else JET.v.multiplyScalar(Math.pow(.02,dt));
  pack.children.forEach((c,i)=>{if(i>1){c.visible=JET.thr;c.scale.y=(up?.9:.55)+Math.random()*.5}});
  if(JET.thr){
   for(let k=0;k<2;k++){const i=smI++%SMN;smP[i*3]=P.pos.x+(Math.random()-.5)*.3;smP[i*3+1]=P.pos.y+.9;smP[i*3+2]=P.pos.z+(Math.random()-.5)*.3;smV[i*4]=(Math.random()-.5);smV[i*4+1]=-2-Math.random()*2;smV[i*4+2]=(Math.random()-.5);smV[i*4+3]=1}}
  for(let i=0;i<SMN;i++){if(smV[i*4+3]<=0)continue;smV[i*4+3]-=dt;smP[i*3]+=smV[i*4]*dt;smP[i*3+1]+=smV[i*4+1]*dt;smP[i*3+2]+=smV[i*4+2]*dt;smV[i*4+1]*=.94;if(smV[i*4+3]<=0)smP[i*3+1]=-999}smG.attributes.position.needsUpdate=true;
  window.__jetThrust=JET.thr;return JET.thr}
window.__jet=JET;window.__modeReset=()=>{if(WEB.on)webSet(false);JET.on=false;JET.thr=false;JET.fly=false;JET.v.set(0,0,0);pack.visible=false;jetBtn.style.background='#0b1220e0';jetBtn.classList.remove('on')};
// The Wilds travel lock (wilds-gate.js): on foot only while in the forest. Blocks Orbit/Fly/Tour (setMode/tour guards), web (Q), jetpack, skateboard; restores web/jet toggles on unlock.
const TL={on:false,web:false,jet:false};window.__wildsTravelLocked=()=>TL.on;
window.__wildsTravelLock=on=>{on=!!on;if(on===TL.on)return TL.on;if(on){if(mode!=='explore')setMode('explore');TL.web=WEB.on;TL.jet=JET.on;if(WEB.on)webSet(false);if(JET.on)jetBtn.click();JET.fly=false;if(window.__skate&&window.__skate.active)window.__skate.toggle(false);TL.on=true}
 else{TL.on=false;if(TL.web&&!WEB.on)webSet(true);if(TL.jet&&!JET.on)jetBtn.click();TL.web=TL.jet=false}document.body.classList.toggle('wl-travel',TL.on);return TL.on};
const _hv=new THREE.Vector3(),_hd=new THREE.Vector3(),_dn=new THREE.Vector3(0,-1,0);
function webPose(){const A=avatar.userData.arms;if(!WEB.a){for(const a of A)a.rotation.y=0;return}const arm=A[WEB.hand===1?1:0];if(arm.userData.elbow)arm.userData.elbow.rotation.x=0;avatar.updateMatrixWorld(true);
  _hd.copy(WEB.a);avatar.worldToLocal(_hd).sub(arm.position).normalize();arm.quaternion.setFromUnitVectors(_dn,_hd);arm.updateMatrixWorld(true);
  arm.localToWorld(_hv.set(0,-.55,0));const la=WEB.line.geometry.attributes.position;la.setXYZ(0,_hv.x,_hv.y,_hv.z);la.setXYZ(1,WEB.a.x,WEB.a.y,WEB.a.z);la.needsUpdate=true}
function webStep(dt,mv){webBtn.style.display=mode==='explore'&&!(window.__boat&&window.__boat.active)?'':'none';const held=!!(keys.Space||tb.jump),rise=held&&!WEB.prev;WEB.prev=held;WEB.cd=Math.max(0,WEB.cd-dt);
  if(!WEB.on){if(WEB.a)webDrop();return false}
  if(WEB.a&&!held){webDrop();WEB.cd=.4;P.vel.x=P.vel.z=0;return false}
  if(!WEB.a&&rise&&WEB.cd<=0){const a=webAnchor();if(!a)return false;WEB.a=a;WEB.hand=WEB.hand?0:1;WEB.L=a.distanceTo(P.pos);P.vel.x=P.vel.x||mv.x;P.vel.z=P.vel.z||mv.z;{const t=a.clone().sub(P.pos).normalize();P.vel.addScaledVector(t,16);P.vel.y=Math.max(P.vel.y,7)}P.onGround=false;P.climb=null}
  if(!WEB.a)return false;
  // pendulum: gravity + a little steering + slow reel-in, then the rope constraint removes outward velocity
  P.vel.y-=20*dt;P.vel.x+=mv.x*1.2*dt;P.vel.z+=mv.z*1.2*dt;WEB.L=Math.max(5,WEB.L-10*dt);
  const ox=P.pos.x,oz=P.pos.z;P.pos.addScaledVector(P.vel,dt);if(wet(P.pos.x,P.pos.z)){P.pos.x=ox;P.pos.z=oz;P.vel.x*=-.3;P.vel.z*=-.3}
  const r=P.pos.clone().sub(WEB.a),d=r.length();if(d>WEB.L){r.multiplyScalar(1/d);P.pos.copy(WEB.a).addScaledVector(r,WEB.L);const out=P.vel.dot(r);if(out>0)P.vel.addScaledVector(r,-out)}
  const sp=P.vel.length();if(sp>40)P.vel.multiplyScalar(40/sp);
  const la=WEB.line.geometry.attributes.position;la.setXYZ(0,P.pos.x,P.pos.y+1.4,P.pos.z);la.setXYZ(1,WEB.a.x,WEB.a.y,WEB.a.z);la.needsUpdate=true;WEB.line.visible=true;
  if(P.vel.x||P.vel.z)avatar.rotation.y=Math.atan2(-P.vel.x,-P.vel.z);return true}
window.__web={WEB,webSet,webAnchor,railPts};
function updExplore(dt){if(window.__exploreLock&&window.__exploreLock()){P.near=null;$('prompt').style.display='none';P.vel.set(0,0,0);me.set(P.pos,avatar.rotation.y,'idle',P.district);return}   // a modal owns the player (The Wilds: warning / encounter / dialogue)
 const run=keys.ShiftLeft||keys.ShiftRight||tb.run,sp=run?11:5;
 const f=(keys.KeyW||keys.ArrowUp?1:0)-(keys.KeyS||keys.ArrowDown?1:0)-joy.y,s=(keys.KeyD||keys.ArrowRight?1:0)-(keys.KeyA||keys.ArrowLeft?1:0)+joy.x;
 if(window.__skate&&window.__skate.active){window.__skate.drive(dt,f,s);const dir=dirOf();if(P.fp){C.position.copy(P.pos).setY(P.pos.y+1.6);C.lookAt(C.position.clone().add(dir))}else{const want=P.pos.clone().setY(P.pos.y+2.2).addScaledVector(dir,-6.2);want.y=Math.max(want.y,P.pos.y+.8,.6);C.position.lerp(want,1-Math.pow(.0005,dt));C.lookAt(P.pos.clone().setY(P.pos.y+1.3).addScaledVector(dir,4))}P.near=null;$('prompt').style.display='none';me.set(P.pos,avatar.rotation.y,'idle',P.district);return}   // skateboarding rides on top of explore, like the boat
 if(window.__boat&&window.__boat.active){const st=window.__boat.drive(dt,f,s);P.pos.copy(st);P.vel.set(0,0,0);P.onGround=true;P.climb=null;avatar.position.copy(st);avatar.rotation.y=window.__boat.cur.h;avatar.visible=true;$('prompt').style.display='none';me.set(P.pos,avatar.rotation.y,'idle',P.district);return}
 const fw=new THREE.Vector3(-Math.sin(yp.yaw),0,-Math.cos(yp.yaw)),rt=new THREE.Vector3(-fw.z,0,fw.x);const mv=fw.multiplyScalar(f).add(rt.multiplyScalar(s));const ml=Math.min(1,mv.length());
 if(ml>.05){mv.normalize().multiplyScalar(sp*ml);const ty=Math.atan2(-mv.x,-mv.z);let dy=ty-avatar.rotation.y;dy=Math.atan2(Math.sin(dy),Math.cos(dy));avatar.rotation.y+=dy*Math.min(1,dt*12)}
 if(!webStep(dt,mv)){ const ox=P.pos.x,oz=P.pos.z,hv=JET.fly?JET.v:mv;P.pos.x+=hv.x*dt;P.pos.z+=hv.z*dt;if(wet(P.pos.x,P.pos.z)){if(!wet(P.pos.x,oz))P.pos.z=oz;else if(!wet(ox,P.pos.z))P.pos.x=ox;else if(!wet(ox,oz)){P.pos.x=ox;P.pos.z=oz}}if(jetStep(dt,mv)){}else if((keys.Space||tb.jump)&&P.onGround){P.vel.y=7.5;P.onGround=false}P.vel.y-=20*dt;P.pos.y+=P.vel.y*dt;if(WEB.mom.lengthSq()>.01){const wx=P.pos.x,wz=P.pos.z;P.pos.x+=WEB.mom.x*dt;P.pos.z+=WEB.mom.z*dt;if(wet(P.pos.x,P.pos.z)){P.pos.x=wx;P.pos.z=wz;WEB.mom.set(0,0,0)}if(P.onGround)WEB.mom.multiplyScalar(Math.pow(.01,dt))}}
 const g=groundAt(P.pos.x,P.pos.z,P.pos.y);if(P.pos.y<=g){P.pos.y=g;P.vel.y=0;P.onGround=true}else P.onGround=P.pos.y-g<.05;
 collide(P.pos);
 // climbing: push into a tower wall -> climb the face; jump/back off detaches; mantle at the roof edge
 {let cw=null;const fv=new THREE.Vector3(-Math.sin(yp.yaw),0,-Math.cos(yp.yaw));if(f>.3)for(const c of colliders){if(!c.r||c.nc||P.pos.y>=c.h-.05)continue;const dx=c.x-P.pos.x,dz=c.z-P.pos.z,d=Math.hypot(dx,dz);if(d<c.r+.6&&(dx*fv.x+dz*fv.z)/(d||1)>.3){cw=c;break}}
  if(cw&&(keys.Space||tb.jump)&&P.climb){P.climb=null;P.vel.y=5;const dx=P.pos.x-cw.x,dz=P.pos.z-cw.z,d=Math.hypot(dx,dz)||1;P.pos.x+=dx/d*1.2;P.pos.z+=dz/d*1.2;cw=null}
  if(cw){P.climb=cw;P.vel.y=0;P.onGround=false;P.pos.y+=(run?12:8.5)*dt;P.walk+=dt*20;
   if(P.pos.y>=cw.h-.05){const dx=cw.x-P.pos.x,dz=cw.z-P.pos.z,d=Math.hypot(dx,dz)||1;P.pos.y=cw.h;P.pos.x+=dx/d*1.4;P.pos.z+=dz/d*1.4;P.climb=null;P.onGround=true}}
  else P.climb=null}
 {const XL=window.__exploreLim||900;P.pos.x=Math.max(-XL,Math.min(XL,P.pos.x));P.pos.z=Math.max(-XL,Math.min(XL,P.pos.z))}if(window.__hwGuard&&window.__hwGuard(P.pos,P.vel)){P.onGround=true;P.climb=null}
 P.walk+=dt*ml*(run?14:9);const L=avatar.userData;poseWalker(avatar,P.walk,Math.min(1,ml)*(P.onGround?1:.25),performance.now()/1000);
 if(P.climb){const c2=Math.sin(P.walk*1.4);L.arms[0].rotation.x=-2.6+c2*.5;L.arms[1].rotation.x=-2.6-c2*.5;L.legs[0].rotation.x=.6+c2*.4;L.legs[1].rotation.x=.6-c2*.4}
 avatar.position.copy(P.pos);avatar.position.y+=Math.abs(Math.sin(P.walk))*.06*ml+(P.climb?Math.sin(P.walk*1.4)*.05:0);avatar.visible=!P.fp;webPose();const dir=dirOf();
 if(P.fp){C.position.copy(P.pos).setY(P.pos.y+1.7);C.lookAt(C.position.clone().add(dir))}
 else{const want=P.pos.clone().setY(P.pos.y+2.3).addScaledVector(dir,-exploreCamDistance);want.y=Math.max(want.y,P.pos.y+.6,.6);C.position.lerp(want,1-Math.pow(.0005,dt));C.lookAt(P.pos.clone().setY(P.pos.y+1.6).addScaledVector(dir,4))}
 let best=null,bd=1e9;E.nodes.forEach(n=>{const d=Math.hypot(P.pos.x-n.pos.x,P.pos.z-n.pos.z);if(d<n.distR&&d<bd){bd=d;best=n}});const dn=best?best.name:'';
 if(dn!==P.district){P.district=dn;if(dn){const b=$('banner');b.innerHTML=`${dn} DISTRICT<small>${fmt(best.tvl)} XRP pool TVL · ${best.pools} pools${best.pro24h!=null?' · 24h '+pct(best.pro24h):''}</small>`;b.style.color='#'+best.col.getHexString();b.style.textShadow='0 0 14px #'+best.col.getHexString();b.style.opacity=1;clearTimeout(P.bt);P.bt=setTimeout(()=>b.style.opacity=0,2800)}}
 P.near=nearestInteract();$('prompt').style.display=P.near?'block':'none';if(P.near)$('prompt').textContent=(MOBILE?'👆 Tap here · ':'E · ')+P.near.label;$('tUse')&&$('tUse').classList.toggle('hot',!!P.near);
 me.set(P.pos,avatar.rotation.y,P.climb?'climb':ml>.05?(run?'run':'walk'):'idle',dn)}
function nearestInteract(){let best=null,bd=10;const p=P.pos;
 E.nodes.forEach(n=>{const d=Math.hypot(p.x-n.pos.x,p.z-n.pos.z)-n.w*1.2;if(d<bd){bd=d;best=n.name==='BURN'&&window.__openBurnTowerInterior?{label:'Enter PYRETHEUM',u:{node:n},tower:'burn'}:{label:'Inspect '+n.name+' tower',u:{node:n}}}});
 bridges.forEach(b=>{if(!b.group.visible)return;const d=Math.hypot(b.term.position.x-p.x,b.term.position.z-p.z);if(d<4&&d<bd+3){bd=d-3;best={label:`Pool terminal ${b.p.a}⇄${b.p.b}`,u:{pool:b.p}}}
  for(let k=0;k<=20;k++){b.curve.getPoint(k/20,_v);const dd=_v.distanceTo(p);if(dd<b.r+3&&dd<bd){bd=dd;best={label:`Bridge ${b.p.a}⇄${b.p.b}`,u:{pool:b.p}}}}});
 for(const f of window.__interactors||[]){const r=f(p);if(r&&r.d<bd){bd=r.d;best=r}}   // other modules (The Wilds) offer things to USE
 for(const f of window.__nearHooks||[]){const ex=f(p,bd);if(ex){best=ex;break}}   // optional modules (aegis.js) offer a closer thing to USE: {label,act}
 return best}
function interact(){if(window.__burnTowerOpen){window.__towerInteract&&window.__towerInteract();return}const n=P.near||nearestInteract();if(!n)return;if(n.act){n.act();return}if(n.tower==='burn'&&window.__openBurnTowerInterior){window.__openBurnTowerInterior();return}showInfo(n.u)}   // BURN Tower entrance -> js/tower-interior.js overlay (only once that module has loaded)
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
let tourStops=[[fitW(V3(330,200,380),V3(0,40,0)),V3(0,40,0)],[V3(110,40,90),V3(0,70,0)],[V3(60,5,60),V3(0,30,0)],[np('BURN',.55,46),np('BURN',.3,28)],[np('BURN',1.4,34),np('BURN',1,50)],[np('XRPyro',1.35,26),np('XRPyro',1,62)],
 [np('XRPyro',.62,3.5),np('BURN',.8,14)],[np('IMM',1.38,24),np('IMM',1,36)],[V3(0,200,-170),V3(0,168,0)],[np('666',1.5,60),np('666',1,30)],[V3(-70,5,-40),V3(-110,6,-90)],[fitW(V3(330,200,380),V3(0,40,0)),V3(0,40,0)]];
let tourCaps=['Burn City: every tower is a token, every bridge an XRPL AMM pool','The XRP hub: tallest tower = deepest liquidity','Street level: traffic follows real 24h volume','Bridges: colour = trading activity (blue quiet → red busy) · brighter = more LP locked · gold Forever Rails = XRP value locked forever','BURN: fire district. Live burns to the blackholed issuer erupt from this tower','XRPyro: the inferno','Scaffold rails = LP that could still be withdrawn','IMM: electric ice district','From above: weather follows market mood (TVL-weighted 24h change)','666 district','Bioluminescent parks','Replay history with the time-lapse slider · Copy link to share any view'];
function tourCap(t){const i=Math.min(tourCaps.length-1,Math.round(t*(tourStops.length-1)));const el=$('tourCap');if(el.dataset.i!=i){el.dataset.i=i;el.classList.remove('show');setTimeout(()=>{el.textContent=tourCaps[i];el.classList.add('show')},450)}}
if(/[?&]debug=1/.test(location.search))window.__tourDbg={get:()=>tour,caps:()=>tourCaps};const TS0=tourStops,TC0=tourCaps;function tourBuild(){tourStops=TS0.slice(0,-1);tourCaps=TC0.slice(0,-1);try{const e=window.__estate,f=window.__fishWorld,bw=window.__boatWorld;
  if(e&&e.lakeC){const L=e.lakeC,d=e.dir||V3(1,0,0);tourStops.push([V3(L.x-d.x*140,70,L.z-d.z*140),V3(L.x,0,L.z)]);tourCaps.push('The lake: fishing and boating · Burn City Estates · Coming soon')}
  if(f&&f.shopPos){const sp=f.shopPos,d=f.dock.dir;tourStops.push([V3(sp.x+d.x*16+d.z*10,9,sp.z+d.z*16-d.x*10),V3(sp.x,2,sp.z)]);tourCaps.push('Fishing dock + Tackle & Bait: free rod & worms, catch ~20 species, sell for lake coins (no real value), upgrade rods/bait')}
  if(bw&&bw.base){const b=bw.base,d=f.dock.dir;tourStops.push([V3(b.x-d.x*16+d.z*12,8,b.z-d.z*16-d.x*12),V3(b.x+d.x*4,0,b.z+d.z*4)]);tourCaps.push('Boat dock: hop in and drive a boat around the lake')}
 }catch(err){}tourStops.push(TS0[TS0.length-1]);tourCaps.push(TC0[TC0.length-1])}
$('tour').onclick=()=>{if(tlOn())return;tourBuild();setMode('orbit');orbit.enabled=false;mode='tour';tour={cam:new THREE.CatmullRomCurve3(tourStops.map(s=>s[0])),look:new THREE.CatmullRomCurve3(tourStops.map(s=>s[1])),t:0}};

// ---------- picking, labels (screen-space de-cluttering), minimap ----------
const ray=new THREE.Raycaster(),mv2=new THREE.Vector2();
const hit=e=>{mv2.set(e.clientX/innerWidth*2-1,-(e.clientY/innerHeight)*2+1);ray.setFromCamera(mv2,C);return ray.intersectObjects(pick.filter(o=>o.parent.visible!==false),false)[0]};
R.domElement.addEventListener('pointermove',e=>{if((mode!=='orbit'&&mode!=='explore'&&mode!=='fly')||e.pointerType==='touch'||RLOOK||document.pointerLockElement)return;const h=hit(e),tip=$('tip');if(h){const u=h.object.userData;tip.style.display='block';tip.style.left=e.clientX+14+'px';tip.style.top=e.clientY+14+'px';
 tip.textContent=u.kind==='aegis'?(u.cam?`AEGIS City Watch · ${u.cam.name} · tap for the live feed`:u.label||'AEGIS City Watch'):u.kind==='tackle'?'Tackle & Bait · tap to open':u.kind==='estate'?'Burn City Estates · Coming soon':u.kind==='arena'?`Arena gate · ${u.label} · tap to play (free)`:(u.kind==='ad'||u.ad)?`Sponsored · $${u.ad.ticker}`:u.lot?`Launchpad · ${u.lot.ticker} · ${u.lot.bond_pct!=null?u.lot.bond_pct.toFixed(0)+'% bonded':'bonding'}`:u.node?`${u.kind==='billboard'?'Billboard · ':''}${u.node.name} · ${fmt(u.node.tvl)} XRP TVL`:`${u.kind==='terminal'?'Terminal · ':''}${u.pool.a}⇄${u.pool.b} · ${fmt(u.pool.tvl_xrp)} XRP · ${u.pool.locked_pct}% locked${u.pool.insider_pct>=50?' ⚑':''}`}else tip.style.display='none'});
let downXY=null;R.domElement.addEventListener('pointerdown',e=>downXY=[e.clientX,e.clientY]);
R.domElement.addEventListener('pointerup',e=>{if(e.button===2||window.__burnTowerOpen)return;if((mode!=='orbit'&&!(e.pointerType==='touch'&&(mode==='explore'||mode==='fly'))&&!((mode==='explore'||mode==='fly')&&e.pointerType==='mouse'&&!MOBILE))||!downXY||Math.hypot(e.clientX-downXY[0],e.clientY-downXY[1])>6)return;{const si=pickShip(e.clientX,e.clientY,e.pointerType==='touch');if(si>=0){showTrade(si);return}}const h=hit(e);tapRing(e,!!h);if(h&&h.object.userData.kind==='arena'){try{sessionStorage.bc_ret=JSON.stringify({m:mode,p:[P.pos.x,P.pos.y,P.pos.z],c:[C.position.x,C.position.y,C.position.z],yaw:yp.yaw})}catch(_){}location.href='arena/?mode='+h.object.userData.arena;return}if(h)showInfo(h.object.userData);else{$('info').style.display='none';if(e.pointerType==='touch'&&mode==='explore'&&(window.__missT=(window.__missT||0)+1)<=3)tipToast('Tap a tower, ship, sign or shop to inspect it')}});
const _p=new THREE.Vector3();
function updLabels(){const placed=[],W2=innerWidth,H2=innerHeight;labelEls.sort((a,b)=>b.pri-a.pri).forEach(l=>{_p.copy(l.pos).project(C);const dist=C.position.distanceTo(l.pos);
 let show=_p.z<1&&Math.abs(_p.x)<1.05&&Math.abs(_p.y)<1.05&&(!l.minor||dist<220)&&dist<1400;
 if(show){const x=(_p.x+1)/2*W2,y=(1-_p.y)/2*H2,w=l.w||(l.w=l.el.offsetWidth||60),h=l.h||(l.h=l.el.offsetHeight||18);const r=[x-w/2-3,y-h-3,x+w/2+3,y+3];
  if(placed.some(q=>!(r[2]<q[0]||r[0]>q[2]||r[3]<q[1]||r[1]>q[3])))show=false;else{placed.push(r);l.el.style.transform=`translate(${x-w/2}px,${y-h}px)`}}
 if(l.vis!==show){l.el.style.display=show?'block':'none';l.vis=show}})}
labelEls.forEach(l=>{l.el.style.left='0';l.el.style.top='0'});
const mm=$('minimap').getContext('2d');
let MMX=null;function mmExtras(){const e=window.__estate;if(!e)return null;if(MMX)return MMX;const P2=(u,v,c=e.lakeC)=>[c.x+e.side.x*u+e.dir.x*v,c.z+e.side.z*u+e.dir.z*v],lake=[];for(let i=0;i<96;i++){const a=i/96*6.2832,r=e.rho(a);lake.push(P2(e.Wd*r*Math.cos(a),e.D*r*Math.sin(a)))}
 const lot=[[-65,-65],[65,-65],[65,65],[-65,65]].map(([u,v])=>P2(u,v,e.lotC)),R=Math.max(375,...lot.map(([x,z])=>Math.hypot(x,z)+30));return MMX={lake,lot,R,road:[[(e.roadO||e.cityEdge).x,(e.roadO||e.cityEdge).z],[(e.roadO||e.cityEdge).x+e.dir.x*e.roadLen,(e.roadO||e.cityEdge).z+e.dir.z*e.roadLen]],lab:[e.lotC.x,e.lotC.z]}}
function updMinimap(){const X=mmExtras(),cw=mm.canvas.width,sc=cw/2/(X?X.R:375);mm.clearRect(0,0,cw,cw);mm.save();mm.translate(cw/2,cw/2);
 if(X){const poly=(pts,close)=>{mm.beginPath();pts.forEach(([x,z],i)=>i?mm.lineTo(x*sc,z*sc):mm.moveTo(x*sc,z*sc));if(close)mm.closePath()};
  poly(X.lake,1);mm.fillStyle='rgba(40,140,230,.55)';mm.fill();mm.strokeStyle='#6fe8ff';mm.lineWidth=1;mm.stroke();
  poly(X.road);mm.strokeStyle='rgba(255,220,150,.75)';mm.lineWidth=2;mm.stroke();
  poly(X.lot,1);mm.setLineDash([3,2]);mm.strokeStyle='#ffb060';mm.lineWidth=1;mm.stroke();mm.setLineDash([]);
  mm.fillStyle='#ffd9a8';mm.font=Math.round(cw/26)+'px system-ui';mm.textAlign='center';{const tx='Estates · Coming soon',hw=mm.measureText(tx).width/2+3;mm.fillText(tx,Math.max(-cw/2+hw,Math.min(cw/2-hw,X.lab[0]*sc)),Math.max(-cw/2+12,Math.min(cw/2-6,X.lab[1]*sc+3)))}
  for(const d of (window.__decks||[])){const a=[d.base.x,d.base.z],b=[d.base.x+d.dir.x*d.v1,d.base.z+d.dir.z*d.v1];poly([a,b]);mm.strokeStyle='#d8a060';mm.lineWidth=2.5;mm.stroke()}}
 mm.strokeStyle='rgba(60,200,255,.3)';mm.lineWidth=12*sc;mm.beginPath();mm.arc(0,0,81*sc,0,7);mm.stroke();
 bridges.forEach(b=>{if(!b.group.visible)return;const A=N[b.p.a].pos,B=N[b.p.b].pos;mm.strokeStyle=b.actCol?'#'+b.actCol.getHexString():'#3cf3ff';mm.globalAlpha=.45+.5*b.L;mm.lineWidth=.5+b.share*3;mm.beginPath();mm.moveTo(A.x*sc,A.z*sc);mm.lineTo(B.x*sc,B.z*sc);mm.stroke()});mm.globalAlpha=1;
 E.nodes.forEach(n=>{mm.fillStyle='#'+n.col.getHexString();mm.beginPath();mm.arc(n.pos.x*sc,n.pos.z*sc,n.minor?1.6:2.5+n.w*.22,0,7);mm.fill()});
 peers.forEach(g=>{mm.fillStyle='#ff66c4';mm.fillRect(g.position.x*sc-2,g.position.z*sc-2,4,4)});if(window.__peers&&window.__peers.size){mm.save();mm.shadowColor='#ff66c4';mm.shadowBlur=6;window.__peers.forEach(p=>{const g=p.g.position;mm.fillStyle=p.k?'#ffb020':p.b?'#4ad8ff':'#ff66c4';mm.beginPath();mm.arc(Math.max(-cw/2+4,Math.min(cw/2-4,g.x*sc)),Math.max(-cw/2+4,Math.min(cw/2-4,g.z*sc)),3,0,7);mm.fill()});mm.restore()}
 for(const f of window.__mmHooks||[])try{f(mm,sc,cw)}catch(e){}   // optional modules draw markers (aegis.js beacons)
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
if(/[?&]debug=1/.test(location.search))window.__cam={C,orbit,N};
if(/[?&]debug=1/.test(location.search))window.__cam={C,orbit},window.__dbg=()=>({c:C.position.toArray(),t:orbit.target.toArray(),b:N.BURN.pos.toArray(),y:N.XRPyro.pos.toArray(),i:N.IMM.pos.toArray(),bh:N.BURN.h,bw:N.BURN.w,bt:N.BURN.top,nn:['Budzy','$BTCK','$BWTZ'].filter(k=>N[k]).map(k=>({k,p:N[k].pos.toArray(),h:N[k].h,w:N[k].w,tier:N[k].tier,locked:N[k].lockedShare,marks:N[k].marks}))});
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
function pushEvent(e){const key=e.hash&&(e.type==='trade'&&e.pool?e.hash+':'+(e.pool.amm||e.pool.a+e.pool.b):e.hash);if(key&&seenTx.has(key))return;if(key){seenTx.add(key);if(seenTx.size>2000)seenTx.delete(seenTx.values().next().value)}
 if(e.type==='trade'){spawnShip(e);if(e.xrp<TRADE_MIN&&!(e.arb&&e.xrp>=Math.min(50,TRADE_MIN)))return}
 if(e.type==='burn'){const q=evQ.find(x=>x.type==='burn'&&x.token===e.token&&!!x.demo===!!e.demo);if(q){q.amount+=e.amount;q.n=(q.n||1)+1;return}}
 evQ.push(e);if(evQ.length>8){let i=evQ.findIndex(x=>x.type==='aegis');if(i<0)i=evQ.findIndex(x=>x.type==='trade');evQ.splice(i>=0?i:0,1)}}
function evBanner(html,col){const b=$('evbanner');b.dataset.src='game';b._gameUntil=performance.now()+4200;b.innerHTML=html;b.style.setProperty('--c',col);b.classList.remove('show');void b.offsetWidth;b.classList.add('show');clearTimeout(b._t);if(!Q.has('shot'))b._t=setTimeout(()=>b.classList.remove('show'),4200)}
function toast(html,col){const box=$('toasts');const d=document.createElement('div');d.className='toast';d.style.setProperty('--c',col||'#3cf3ff');d.innerHTML=html;box.prepend(d);requestAnimationFrame(()=>d.classList.add('in'));
 while(box.children.length>3)box.lastChild.remove();if(!Q.has('shot'))setTimeout(()=>{d.classList.remove('in');setTimeout(()=>d.remove(),700)},6500)}
const fmtS=v=>v>=1e12?(v/1e12).toFixed(2)+'T':v>=1e9?(v/1e9).toFixed(2)+'B':v>=1e6?(v/1e6).toFixed(2)+'M':v>=1e3?(v/1e3).toFixed(1)+'k':(+v).toFixed(v<10?2:0);
function updCounter(){const r=Object.entries(burned).map(([k,v])=>`<b>${fmtS(v)}</b> ${k}`).join(' · '),d=Object.entries(burnedDemo).map(([k,v])=>`${fmtS(v)} ${k}`).join(' · ');
 $('burnCount').innerHTML=`🔥 Burned live since ${sinceStr}: ${r||'<span class="dim">none yet</span>'}${d?` <span class="dim">· demo: ${d}</span>`:''}`}
function runEvent(e){evCount++;try{window.__onLive&&window.__onLive(e)}catch(x){}const tag=e.demo?' <i class="demo">DEMO</i>':'';
 if(e.type==='burn'){const n=N[e.token];if(!n)return;burnFX(n,e.amount,!!e.demo);(e.demo?burnedDemo:burned)[e.token]=((e.demo?burnedDemo:burned)[e.token]||0)+e.amount;updCounter();
  evBanner(`🔥 ${fmtS(e.amount)} ${e.token} burned${tag}<small>sent to blackholed issuer${e.n>1?` · ${e.n} txs`:''} · ${tStr(e.when)} · XRPL ledger ${short(e.hash)}</small>`,e.token==='IMM'?'#7ac8ff':'#ff8a2a');ambient(e)}
 else if(e.type==='aegis'){const esc=v=>String(v||'').replace(/[<>&"]/g,'');evBanner(`<span style="font-size:.6em;letter-spacing:.04em">${esc(e.text)}</span><small>🛰 AEGIS City Watch · ${esc(e.level)} · ${tStr(e.when)}</small>`,e.col||'#2fe3ff')}
 else if(e.type==='trade'){const b=bridges.find(x=>x.p.amm===e.pool.amm||x.p===e.pool);if(!b)return;b.pulseT=U.t.value;b.liveVol=(b.liveVol||0)+(+e.xrp||0);actDirty=1;pulseFX(b,e.xrp);
  toast(`<b>${e.from&&e.to?e.from+' → '+e.to:b.p.a+' ⇄ '+b.p.b}</b> ${e.estimate?'≈':''}${fmt(Math.round(e.xrp))} XRP ${e.arb?'<b style="color:#ffc64a">arbitrage loop</b>'+(e.hops>1?' · '+e.hops+' pools':''):e.hops>1?'routed swap · '+e.hops+' pools':e.kind==='OfferCreate'?'DEX/AMM fill':'swap'}${e.estimate?' <i class="est">est.</i>':''}${tag}<br><span class="dim">${tStr(e.when)} · ${short(e.hash)||'XRPL'}</span>`,'#3cf3ff')}
 else if(e.type==='lock'){const b=bridges.find(x=>x.p.amm===e.pool.amm||x.p===e.pool);if(!b)return;const L=e.pct!=null?e.pct/100:Math.min(1,b.Lv+.15);lockFX(b,L);chime();b.p.locked_pct=Math.max(b.p.locked_pct,L*100);
  evBanner(`🔒 LP LOCKED · ${b.p.a} ⇄ ${b.p.b}${tag}<small>${(L*100).toFixed(1)}% of LP tokens now in blackholed wallets · ${e.source==='recheck'?'periodic ledger recheck':'XRPL ledger '+short(e.hash)} · ${tStr(e.when)}</small>`,'#3cf3ff')}}
function ambient(e){if(e&&e.type==='burn')crackle()}
function pumpEvents(t){if(!evQ.length)return;const now=performance.now();let i=evQ.findIndex(e=>e.type!=='trade'&&e.type!=='aegis');if(i<0&&now>=nextBig+2500)i=evQ.findIndex(e=>e.type==='aegis');
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
// AEGIS live feed (screens, command table, response ops, ticker): optional module, loaded on its own so any failure leaves the city untouched
if(!Q.has('nopyramid'))import('./aegis-pyramid.js').catch(e=>console.warn('aegis pyramid',e));   // AEGIS Pyramid HQ landmark (idle without the feed)
if(!Q.has('noaegis')&&!Q.has('shot'))import('./aegis.js').catch(e=>console.warn('aegis',e));
// The Wilds (forest north of town): js/wilds-gate.js draws only the trailhead gate and lazy-loads the forest (js/wilds.js) when you walk in; ?nowilds turns it off
if(!Q.has('nowilds'))import('./wilds-gate.js').catch(e=>console.warn('wilds',e));
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
{const renderSrc=()=>{const d=new Date(E.ts.replace(' ','T')+(E.ts.endsWith('Z')?'':'Z'));const ds=isNaN(d)?E.ts:d.toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',timeZoneName:'short'});
 $('src').innerHTML=`Pools, TVL &amp; LP locks: ${E.live?'live from the XRP Ledger · updated':'XRPL ledger snapshot'} <b>${ds}</b>${E.ledger?' · ledger '+(+E.ledger).toLocaleString():''}<br>Prices, 24h change &amp; volume: <a href="https://xrpl.to" target="_blank" rel="noopener">Data by xrpl.to</a><br>Live events: XRPL websocket · <i class="est">est.</i> = estimated (non-XRP pools valued at xrpl.to price) · big trade ≥ ${fmt(TRADE_MIN)} XRP`};renderSrc();
// live values: server re-reads every pool on each validated ledger tx; refresh numbers in place (cards, totals, sources)
let lv=0;const poll=async()=>{if(document.hidden)return;try{const r=await fetch('/api/eco/live',{cache:'no-cache'});if(!r.ok)return;const L=await r.json();if(!L||L.v===lv)return;const first=!lv;lv=L.v;
 if(first&&Array.isArray(L.recent)){const now=Date.now(),rec=L.recent.filter(r=>now-r.t<30*60e3).slice(-60);rec.forEach((r,j)=>{const key=r.hash+':'+r.amm;if(seenTx.has(key))return;seenTx.add(key);setTimeout(()=>spawnShip({type:'trade',replay:1,pool:(bridges.find(x=>x.p.amm===r.amm)||{p:{amm:r.amm}}).p,hash:r.hash,account:r.acct,when:r.t,kind:r.kind,xrp:r.xrp,from:r.from,to:r.to,arb:r.arb,hops:r.hops}),j*(15000/Math.max(1,rec.length)))})}
 E.ts=L.ts;E.ledger=L.ledger;E.live=true;for(const [k,o] of Object.entries(L.nodes||{})){const n=N[k];if(!n)continue;Object.assign(n,o);n.mc=mcOf(n)}
 reshapeTowers();
 for(const p of E.pools){const o=p.amm&&L.pools&&L.pools[p.amm];if(o)Object.assign(p,o)}
 renderTot();renderSrc();const u=window.__infoU,el=$('info');if(u&&el&&el.style.display==='block'&&(u.node||u.pool)&&!u.lot){const st=el.scrollTop;showInfo(u);el.scrollTop=st}}catch(e){}};
setInterval(poll,15e3);setTimeout(poll,3e3);document.addEventListener('visibilitychange',()=>{if(!document.hidden)poll()})}

// ---------- main loop ----------
const clk=new THREE.Clock();let fpsN=0,fpsT0=performance.now(),fpsA=60,lowT=0,lastHud=-1,fr=0;
// Optional input-to-next-frame sampling is only enabled with ?perf=1; this measures browser scheduling, not GPU/display presentation.
let perfPendingInputAt=0;const perfInputSamples=[];
if(Q.has('perf')){const markInput=()=>{perfPendingInputAt=performance.now()};for(const ev of ['pointerdown','pointermove','pointerup','keydown','keyup','wheel','touchstart'])addEventListener(ev,markInput,{passive:true});}
// ---- ?perf=1 : honest on-device numbers (fps, frame time, draw calls, triangles, GPU memory objects, JS heap, tier) ----
const PERF=Q.has('perf')?(()=>{const el=document.createElement('div');el.id='perfHud';el.style.cssText='position:fixed;right:6px;top:calc(env(safe-area-inset-top) + 56px);z-index:60;font:11px/1.35 ui-monospace,Menlo,monospace;color:#ffd2a8;background:rgba(8,6,10,.78);border:1px solid #ff7a1855;border-radius:8px;padding:6px 8px;pointer-events:none;white-space:pre';document.body.appendChild(el);
 const ft=[];let acc=0,n=0,last=0;window.__perf={};return raw=>{ft.push(raw*1000);if(ft.length>240)ft.shift();acc+=raw;n++;if(acc<.5)return;
 const s=[...ft].sort((a,b)=>a-b),avg=ft.reduce((a,b)=>a+b,0)/ft.length,p95=s[Math.floor(s.length*.95)]||0;
 const ins=[...perfInputSamples].sort((a,b)=>a-b),inputP95=ins[Math.floor(ins.length*.95)]||0,i=R.info,m=performance.memory;
 const o={fps:+(n/acc).toFixed(1),ms:+avg.toFixed(1),p95:+p95.toFixed(1),inputP95:+inputP95.toFixed(1),inputSamples:ins.length,calls:i.render.calls,tris:i.render.triangles,geo:i.memory.geometries,tex:i.memory.textures,heapMB:m?Math.round(m.usedJSHeapSize/1048576):null,tier:TIER,pr:+R.getPixelRatio().toFixed(2),res:innerWidth+'x'+innerHeight,tower:!!window.__burnTowerOpen};
 window.__perf=o;el.textContent=`${o.fps} fps  ${o.ms} ms (frame p95 ${o.p95})\ninput→frame p95 ${o.inputP95} ms (${o.inputSamples} samples)\ncalls ${o.calls}  tris ${(o.tris/1000).toFixed(0)}k\ngeo ${o.geo}  tex ${o.tex}${o.heapMB!=null?'  heap '+o.heapMB+'MB':''}\n${o.tier} · pr ${o.pr} · ${o.res}${o.tower?' · tower':''}`;acc=0;n=0}})():null;
function frame(){requestAnimationFrame(frame);if(perfPendingInputAt){perfInputSamples.push(Math.max(0,performance.now()-perfPendingInputAt));if(perfInputSamples.length>240)perfInputSamples.shift();perfPendingInputAt=0}R.info.reset();const _rd=clk.getDelta();clk.__raw=Math.min(_rd,.25);const dt=Math.min(_rd,.05),t=clk.elapsedTime;U.t.value=t;fr++;
 if($('todCycle').checked)$('tod').value=(.5-.5*Math.cos(t*.02)).toFixed(3);const day=+$('tod').value;U.day.value=day;
 if(wMode==='cycle'){const seq=['clear','fog','rain','storm'];wTarget=W[seq[Math.floor(t/30)%4]]}
 for(const k in wCur)wCur[k]+=(wTarget[k]-wCur[k])*Math.min(1,dt*wRate);SKY(dt,t,wCur,+$('tod').value);
 S.fog.density=wCur.fog*.8*(1-day*.6)*Math.min(1,480/Math.max(1,C.position.length()));{const dk=1-.6*wCur.storm;S.fog.color.setRGB((.032+day*.33)*dk,(.034+day*.40)*dk,(.075+day*.52)*dk)}U.wet.value=wCur.wet;U.storm.value=wCur.storm;rain.uniforms.amt.value=Math.min(1,wCur.rain);rain.uniforms.cam.value.copy(C.position);banks(wCur.banks,t);
 hemi.intensity=(.55+day*1.4)*(1-.45*wCur.storm);amb.intensity=.35+day*.6;R.toneMappingExposure=1.05+day*.05;stars.material.__op.value=Math.pow(Math.max(0,1-day/.45),1.5)*(1-wCur.storm*.9)*(1-wCur.fog*.5);placeSky(day,wCur.storm);bloom.strength=(.7-day*.35+wCur.wet*.08)*bloomStrengthScale;
 if(wCur.storm>.5){nextBolt-=dt;if(nextBolt<0){lightning();nextBolt=3+Math.random()*7}}
 if(boltT>0){boltT-=dt;U.flash.value=Math.max(0,boltT*3.3)*(Math.random()<.7?1:.3);flashL.intensity=U.flash.value*3;bolt.material.opacity=Math.min(1,boltT*5)}else{bolt.visible=false;U.flash.value=0;flashL.intensity=0}
 if(aud.rg)aud.rg.gain.value=Math.min(1,wCur.rain)*.35;
 if(shoot.t<0&&day<.5&&Math.random()<dt*.08){shoot.t=0;shoot.a=V3((Math.random()-.5)*3000,900+Math.random()*500,-1500-Math.random()*800);shoot.d=V3(-Math.random()-.5,-.35,Math.random()*.4).normalize()}
 if(shoot.t>=0){shoot.t+=dt;const a=shoot.a.clone().addScaledVector(shoot.d,shoot.t*1400);shoot.line.geometry.setFromPoints([a,a.clone().addScaledVector(shoot.d,-160)]);shoot.line.material.opacity=Math.max(0,1-shoot.t);if(shoot.t>1){shoot.t=-1;shoot.line.material.opacity=0}}
 const _cp=!!window.__cityPaused;if(!_cp){anim.forEach(f=>f(t,dt))}updFX(t,dt*FXW);pumpEvents(t);if(!_cp){updTL(dt);search.forEach(f=>f(t));updCars(dt);updGround(dt);steam(dt);drones(t);freighter(t)}   // __cityPaused: The Wilds deep area (city hidden) skips the city's per-frame work
 if(DRONE)DRONE.show(mode==='fly');
 if(window.__burnTowerOpen&&window.__towerFrame){window.__towerFrame(dt,t);me.set(P.pos,avatar.rotation.y,'idle',P.district)}   // inside PYRETHEUM: the interior drives the camera from the same input; the avatar waits at the door
 else if(mode==='explore')updExplore(dt);else if(mode==='fly')updFly(dt);
 else if(mode==='tour'&&tour){tour.t=Math.min(1,tour.t+dt/80);C.position.copy(tour.cam.getPoint(tour.t));C.lookAt(tour.look.getPoint(tour.t));tourCap(tour.t);if(tour.t>=1){setMode('orbit');$('tourCap').classList.remove('show')}}
 else{orbit.autoRotate=!Q.has('shot')&&$('info').style.display!=='block';orbit.update()}
 let _sh=null;if(SHAKE.a>.01){SHAKE.a*=Math.exp(-dt*3);_sh=V3((Math.random()-.5),(Math.random()-.5),(Math.random()-.5)).multiplyScalar(SHAKE.a);C.position.add(_sh)}
 if(bokeh.enabled)bokeh.uniforms.focus.value=mode==='explore'?6.5:C.position.distanceTo(orbit.target);
 if(window.__preRender)for(const f of window.__preRender)f(dt,t);   // late per-frame hooks (fog/camera tweaks) right before the frame is drawn
 comp.render();if(_sh)C.position.sub(_sh);if(PERF)PERF(_rd);   // while PYRETHEUM is open its scene/camera are swapped into this same composer (one renderer, one loop)
if(!_cp){updLabels();if(t-lastHud>.25){updMinimap();lastHud=t}}
 {const now=performance.now();fpsN++;if(now-fpsT0>=1000){fpsA=fpsN*1000/(now-fpsT0);fpsN=0;fpsT0=now;window.__info={calls:R.info.render.calls,tris:R.info.render.triangles,geo:R.info.memory.geometries,tex:R.info.memory.textures,progs:R.info.programs.length}}}if(fr%15===0)$('fps').textContent=Math.round(fpsA)+' fps'+(MOBILE?' · mobile':'')+(AQ.on&&PR<AQ.max-.01?' · res '+Math.round(PR/AQ.max*100)+'%':'')+(AQ.bloomOff?' · glow off':'');window.__fps=fpsA;
 adapt(dt,t)}
// ---------- adaptive quality: watch smoothed frame time; step render resolution (then bloom) down when the device struggles, back up when it has headroom ----------
// Manual quality choices keep only the old emergency floor; 'auto' adapts both ways and remembers the last level per device.
const AQ={on:(qPref==='auto'||MOBILE)&&!Q.has('shot')&&!Q.has('noadapt'),ft:1/60,down:0,up:0,cool:4,max:Math.min(devicePixelRatio,LV.pr),bloomOff:false};
{const saved=+localStorage.getItem('bc_pr_'+TIER);if(AQ.on&&saved>=.6&&saved<PR){PR=saved;R.setPixelRatio(PR);comp.setPixelRatio(PR)}}
function setPR(v){v=Math.round(v*100)/100;if(v===PR)return;PR=v;R.setPixelRatio(PR);comp.setPixelRatio(PR);if(AQ.on)try{localStorage.setItem('bc_pr_'+TIER,PR)}catch(e){}}
function adapt(dt,t){if(t<5||document.hidden)return;const raw=clk.__raw||dt;AQ.ft+=(raw-AQ.ft)*Math.min(.5,raw*3);const fps=1/AQ.ft;AQ.cool-=raw;window.__aq={pr:PR,fps:Math.round(fps),bloom:!AQ.bloomOff};
 if(!AQ.on){if(fpsA<28){lowT+=dt;if(lowT>3&&PR>.8){setPR(Math.max(.75,PR-.25));lowT=0}}else lowT=0;return}
 const lowFps=MOBILE?40:48,okFps=MOBILE?55:58;
 if(fps<lowFps){AQ.down+=raw;AQ.up=0}else if(fps>okFps){AQ.up+=raw;AQ.down=0}else{AQ.down=Math.max(0,AQ.down-raw);AQ.up=Math.max(0,AQ.up-raw)}
 if(AQ.cool>0)return;
 if(AQ.down>1.5){AQ.down=0;AQ.cool=2.5;if(PR>.6)setPR(Math.max(.6,PR-.15));else if(!AQ.bloomOff&&fps<30){AQ.bloomOff=true;bloom.enabled=false}}
 else if(AQ.up>8){AQ.up=0;AQ.cool=4;if(AQ.bloomOff){AQ.bloomOff=false;bloom.enabled=true}else if(PR<AQ.max)setPR(Math.min(AQ.max,PR+.1))}}
setMode('orbit');
if(VQ==='explore'){setMode('explore');P.pos.copy(np('BURN',.66,0));yp.yaw=Math.atan2(-(N.BURN.pos.x-P.pos.x),-(N.BURN.pos.z-P.pos.z));yp.pitch=.05;C.position.copy(P.pos).add(V3(0,3,0))}
if(Q.get('mode')==='fly')setMode('fly');
// back from the arena (Zombies / Light Cycles): restore the view the player left in, not the Orbit default (phones in landscape have no mode dock in Orbit)
{let rt=null;try{rt=JSON.parse(sessionStorage.bc_ret||'null');delete sessionStorage.bc_ret}catch(_){}
 if(rt&&!Q.has('mode')&&!VIEWS[VQ]&&(rt.m==='explore'||rt.m==='fly')&&!tlOn()){const ok=a=>Array.isArray(a)&&a.length===3&&a.every(isFinite);setMode(rt.m);
  if(rt.m==='explore'&&ok(rt.p)){P.pos.set(rt.p[0],groundAt(rt.p[0],rt.p[2],rt.p[1]+2),rt.p[2]);P.vel.set(0,0,0);P.spawned=1}else if(rt.m==='fly'&&ok(rt.c))C.position.set(rt.c[0],rt.c[1],rt.c[2]);
  if(isFinite(rt.yaw)){yp.yaw=rt.yaw;if(rt.m==='explore')avatar.rotation.y=rt.yaw}}}
if(Q.get('mode')==='explore'&&VQ!=='explore'){setMode('explore');const p=(Q.get('pos')||'').split(',').map(Number);if(p.length===3&&p.every(isFinite)){P.pos.set(p[0],groundAt(p[0],p[1],99),p[1]);yp.yaw=p[2]}else{P.pos.copy(np('BURN',.66,0))}C.position.copy(P.pos).add(V3(0,3,0))}
// ---- view menu: Esc releases pointer lock + pause menu, 1-4 hotkeys, touch Exit button, smooth camera hand-off
(()=>{const css=document.createElement('style');css.textContent=`#vExit{position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:60;min-width:44px;min-height:44px;padding:0 16px;font:600 15px monospace;color:#fff;background:rgba(20,8,4,.82);border:1px solid #ff7a1a;border-radius:10px;cursor:pointer;display:none}
#vMenu{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}#vMenu.on{display:flex}
#vMenu>div{background:rgba(18,10,8,.95);border:1px solid #ff7a1a;border-radius:14px;padding:18px;display:grid;gap:10px;min-width:220px;font:14px monospace;color:#ffd9b0;text-align:center}
#vMenu button{min-height:44px;font:600 15px monospace;color:#fff;background:#2a140a;border:1px solid #ff9a3a;border-radius:10px;cursor:pointer}#vMenu button:hover{background:#ff7a1a}
#vHint{position:fixed;top:auto;bottom:calc(200px + env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);z-index:4;white-space:nowrap;max-width:92vw;padding:8px 14px;font:14px monospace;color:#fff;background:rgba(0,0,0,.7);border-radius:8px;pointer-events:none;opacity:0;transition:opacity .4s}#vHint.on{opacity:1}`;document.head.appendChild(css);
const ex=document.createElement('button');ex.id='vExit';ex.textContent='✕ Exit';ex.setAttribute('aria-label','Exit view / view menu');document.body.appendChild(ex);
const hint=document.createElement('div');hint.id='vHint';document.body.appendChild(hint);
const mn=document.createElement('div');mn.id='vMenu';mn.innerHTML='<div><b>Paused · choose view</b><button data-v="orbit">1 ◎ Orbit</button><button data-v="fly">2 ✈ Fly</button><button data-v="tour">3 ▶ Tour</button><button data-v="explore">🚶 Explore</button><button data-v="resume">4 ↩ Resume</button></div>';document.body.appendChild(mn);
// Movement & Games hub (movement-games-menu.js): city toasts + "take me there" (Explore at a known world spot, facing `face`). Refuses during the Wilds travel lock, in a boat or the tower.
window.__bcToast=(text,col)=>{const d=document.createElement('span');d.textContent=String(text);toast(d.innerHTML,col)};
window.__walkTo=(x,z,face)=>{if(tlOn()||window.__burnTowerOpen||(window.__boat&&window.__boat.active)||!isFinite(x)||!isFinite(z))return false;if(mode!=='explore')setMode('explore');if(mode!=='explore')return false;P.pos.set(x,groundAt(x,z,99),z);P.vel.set(0,0,0);P.spawned=1;if(face&&isFinite(face.x)&&isFinite(face.z)){yp.yaw=Math.atan2(face.x-x,-(face.z-z));avatar.rotation.y=yp.yaw}return true};
window.__launchBlacktide=()=>{if(document.body.classList.contains('wl-travel'))return false;try{sessionStorage.bc_ret=JSON.stringify({m:mode,p:[P.pos.x,P.pos.y,P.pos.z],c:[C.position.x,C.position.y,C.position.z],yaw:yp.yaw})}catch(_){}location.href='blacktide/';return true};
let tw=null;const menuOn=()=>mn.classList.contains('on'),hide=()=>mn.classList.remove('on');
const show=()=>{if(document.pointerLockElement)document.exitPointerLock();mn.classList.add('on')};
function go(v){hide();const from=mode;
 if(v==='explore'&&mode==='explore')v='resume';   // already walking: Explore just closes the menu (setMode would reset the jetpack/web + pitch)
 if(v==='resume'){if(!MOBILE&&mode==='fly')R.domElement.requestPointerLock?.();return}
 if(v==='tour'){$('tour').click();return}
 
 const p0=C.position.clone(),q0=C.quaternion.clone();setMode(v);
 if(v==='orbit'&&(from==='explore'||from==='fly')){const tgt=orbit.target.clone(),dir=p0.clone().sub(tgt).setY(0);if(dir.lengthSq()<1)dir.set(0,0,1);
  const p1=tgt.clone().add(dir.normalize().multiplyScalar(140)).setY(Math.max(70,p0.y));tw={t:0,p0,p1,q0,tgt}}}
mn.addEventListener('click',e=>{const b=e.target.closest('button');if(b)go(b.dataset.v);else if(e.target===mn)go('resume')});
ex.onclick=e=>{e.stopPropagation();menuOn()?go('resume'):show()};if(Q.has('debug')||Q.has('exploretest'))window.__vMenu={show,go,on:menuOn};
let hintT;const tip=m=>{hint.textContent=MOBILE?'Tap ✕ Exit to change view':'Esc to exit · 1 Orbit · 2 Fly · 3 Tour';hint.classList.add('on');clearTimeout(hintT);hintT=setTimeout(()=>hint.classList.remove('on'),4000)};
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement&&mode==='fly'&&!tw&&!window.__lockSwap)show();window.__lockSwap=0});
addEventListener('keydown',e=>{if(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))return;
 if(e.code==='Escape'){if(menuOn())go('resume');else if(mode!=='orbit')show();return}
 const k={Digit1:'orbit',Digit2:'fly',Digit3:'tour',Digit4:'resume'}[e.code];if(k&&(menuOn()||mode!=='orbit'||k!=='resume'))go(k)});
// phones: the view button stays up in every mode (Orbit and Tour too), so there is always a way to the view menu even when the mode dock is hidden (landscape)
const sm=setMode;let last='';setInterval(()=>{const fp=mode==='explore'||mode==='fly',vis=fp||MOBILE;ex.style.display=vis?'block':'none';const lb=fp?'✕ Exit':'☰ View';if(ex.textContent!==lb)ex.textContent=lb;if(fp&&last!==mode)tip();last=mode},150);
addEventListener('pageshow',e=>{if(e.persisted){hide();last=''}});
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
await stage(.92,'Compiling shaders');fxObjs.forEach(o=>o.visible=true);
// compile every material off the main thread where the GPU allows it (KHR_parallel_shader_compile): the loader keeps animating and drivers compile in parallel
// compile against the composer's render target: the scene is drawn into it (linear, no tone mapping), so warming against the canvas built the wrong shader variants
{const rt0=R.getRenderTarget();R.setRenderTarget(comp.readBuffer);try{if(R.compileAsync&&!Q.has('synccompile'))await R.compileAsync(S,C);else R.compile(S,C)}catch(e){R.compile(S,C)}R.setRenderTarget(rt0)}window.__compiledMs=performance.now();comp.render();fxObjs.forEach(o=>o.visible=false);
await stage(.98,'Starting');
frame();window.__ready=true;window.__readyMs=performance.now();window.__startDemo&&window.__startDemo();{const lift=()=>{if($('loader').classList.contains('done'))return;window.__load(1,'Ready');if(Q.has('shot'))$('loader').style.transition='none';$('loader').classList.add('done')};
 // lift the loading screen after the first painted frames; the timer covers phones where the first frames stall (shader compile, tab briefly hidden) so the overlay never sits over the menu
 requestAnimationFrame(()=>requestAnimationFrame(lift));setTimeout(lift,1200)}
addEventListener('resize',()=>{C.aspect=innerWidth/innerHeight;C.updateProjectionMatrix();R.setSize(innerWidth,innerHeight);comp.setSize(innerWidth,innerHeight);labelEls.forEach(l=>l.w=0)});

;addEventListener('pointerdown',function f(){removeEventListener('pointerdown',f,true);try{AC&&AC.state==='suspended'&&AC.resume()}catch(e){}},true);

// ---- PC key legend: ⌨ button + H key, contents follow the current mode ----
(()=>{if(MOBILE||/Android/i.test(navigator.userAgent)||!matchMedia('(hover:hover)').matches)return;   // no key legend on phones/tablets (Android can report a fine pointer)
const kb=s=>`<kbd style="display:inline-block;min-width:20px;padding:0 6px;margin:1px 0;border:1px solid #9ab8ff;border-radius:5px;background:#16233f;color:#fff;font-weight:700;text-align:center">${s}</kbd>`;
const sec=(t,rows)=>`<div style="margin-top:8px"><b style="color:#9fd0ff">${t}</b><br>`+rows.map(([k,v])=>kb(k)+' '+v).join('<br>')+'</div>';
const btn=document.createElement('button');btn.id='keysBtn';btn.textContent='⌨ Keys';btn.title='Key legend (H)';btn.style.cssText='position:fixed;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:32;font:700 12px system-ui;padding:7px 11px;border-radius:10px;border:1px solid #ffffff40;background:#0b1220e0;color:#fff;cursor:pointer';
const box=document.createElement('div');box.id='keysBox';box.hidden=true;box.style.cssText='position:fixed;left:12px;bottom:calc(52px + env(safe-area-inset-bottom));z-index:33;max-height:70vh;overflow:auto;background:#0b1220f2;border:1px solid #ffffff30;border-radius:14px;padding:12px 16px;color:#e8f0ff;font:13px/1.65 system-ui;min-width:270px;box-shadow:0 10px 30px #0008';
const fill=()=>{const m=mode,ex=sec('Explore (walking)',[['W A S D','walk'],['Shift','run'],['Space','jump'],['Hold right-click','look around'],['Left-click','select towers, ships, shops, signs'],['E','interact / talk / board'],['V','1st / 3rd person'],['Q','web swing on / off']]),
 fl=sec('Fly',[['Click','capture mouse'],['Mouse','look'],['W A S D','move'],['Space / C','up / down'],['Shift','fast'],['Esc','release mouse']]),
 or=sec('Orbit (map)',[['Drag','orbit'],['Scroll','zoom'],['Click','tower, road, billboard or terminal stats']]),
 dr=sec('Drone',[['R','race mode'],['F / Right Shift','boost (in race)']]),
 fi=sec('Fishing (at the dock)',[['F','start fishing'],['Space / F','cast, hook, reel (or click the buttons)'],['Esc','reel in early']]),
 gl=sec('Anywhere',[['1','Orbit'],['2','Fly'],['3','Tour'],['Esc','view menu'],['Enter','chat (when online)'],['H','show / hide this legend']]);
 box.innerHTML='<b style="font-size:14px">⌨ Keyboard &amp; mouse</b><span style="float:right;cursor:pointer;opacity:.7" data-x>✕</span>'+(m==='explore'?ex+fi+dr:m==='fly'?fl+dr:or+ex)+gl;box.querySelector('[data-x]').onclick=e=>{e.stopPropagation();tog(false)}};
const tog=v=>{v=v??box.hidden;if(v){fill();if(document.pointerLockElement)document.exitPointerLock()}box.hidden=!v;btn.style.background=v?'#e8f0ff':'#0b1220e0';btn.style.color=v?'#0b1220':'#fff'};
btn.onclick=e=>{e.stopPropagation();tog()};btn.onpointerdown=e=>e.stopPropagation();box.onpointerdown=e=>e.stopPropagation();
addEventListener('keydown',e=>{if(e.code!=='KeyH'||e.repeat||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||''))return;tog()});
document.body.append(btn,box);window.__keys=tog})();

// ---- touch Explore: visible tap feedback, a tappable prompt, a glowing Use button when something is in reach, and a one-time hint ----
function tapRing(e,ok){if(e.pointerType!=='touch'&&!(mode==='explore'&&e.pointerType==='mouse'))return;const d=document.createElement('div');d.style.cssText=`position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid ${ok?'#7ee0ff':'#ffffff88'};pointer-events:none;z-index:40;transition:transform .45s ease-out,opacity .45s`;document.body.appendChild(d);requestAnimationFrame(()=>{d.style.transform='scale(4)';d.style.opacity='0'});setTimeout(()=>d.remove(),500)}
function tipToast(t){let d=document.getElementById('tapTip');if(!d){d=document.createElement('div');d.id='tapTip';d.style.cssText='position:fixed;left:50%;top:42%;transform:translateX(-50%);z-index:40;background:#0b1220e8;color:#e8f0ff;border:1px solid #7ee0ff66;border-radius:12px;padding:8px 14px;font:600 13px system-ui;pointer-events:none;transition:opacity .3s;max-width:86vw;text-align:center';document.body.appendChild(d)}d.textContent=t;d.style.opacity='1';clearTimeout(d._t);d._t=setTimeout(()=>d.style.opacity='0',2600)}
{const pr=$('prompt');if(pr){pr.style.pointerEvents='auto';pr.style.cursor='pointer';pr.addEventListener('click',e=>{e.stopPropagation();if(mode==='explore')interact()});pr.addEventListener('touchstart',e=>{e.stopPropagation();e.preventDefault();if(mode==='explore')interact()},{passive:false})}
 const st=document.createElement('style');st.textContent='#tUse{font-size:13px!important;font-weight:800}#tUse.hot{background:#7ee0ff!important;color:#0b1220!important;box-shadow:0 0 0 0 #7ee0ffaa;animation:usePulse 1.2s infinite}@keyframes usePulse{0%{box-shadow:0 0 0 0 #7ee0ffaa}70%{box-shadow:0 0 0 14px #7ee0ff00}100%{box-shadow:0 0 0 0 #7ee0ff00}}';document.head.appendChild(st);
 const tu=$('tUse');if(tu){tu.textContent='USE';tu.setAttribute('aria-label','Use / inspect')}
 if(MOBILE){let shown=localStorage.bcTapHint==='1';setInterval(()=>{if(!shown&&mode==='explore'){shown=true;localStorage.bcTapHint='1';tipToast('Tap towers, ships, signs and shops to inspect them · USE talks to what\'s next to you')}},1000)}}
