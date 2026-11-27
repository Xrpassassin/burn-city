// CIRCLE OF XRPL MEMES (Phase 1): the City's meme quarter, built from GET /api/memes-circle (server/memes-circle.js).
// - A round quarter west of downtown, split into the chart's four quadrants by two avenues: Kings Row (gold-hour light, glass
//   towers, fireworks on green market days), Grinder Yards (green-lit industrial, cranes, sparks), Degen Strip (purple neon, wet
//   streets, casino glow) and The Watchline (red haze, searchlights, extra police patrols).
// - Towers: the top 40 by Alpha + BURN + a floor of 6 for Grinder Yards and The Watchline (memes-circle-core.mjs pickTowers), on
//   the City's own height/width ruler (log mcap / sqrt TVL). Instanced: all towers are ONE draw, crowns one, name plates one.
// - Atmosphere is LOCAL only: zone-tinted ground, haze puffs, particles, a screen-edge tint and synthesized ambient sound,
//   blended by where the player stands (zoneWeights). HARD RULE: nothing here writes the global weather, fog or sky
//   (S.fog, U.storm/U.wet/U.day, wTarget, sky uniforms): those stay driven only by live market data in app.js.
//   memes-circle-core.test.mjs greps this file to keep it that way.
// - Downtown: an ALPHA LIST billboard (top 15 with score + district) near the XRP hub; walk up and press E for the full list.
// - Kill switches: ?memes=0 (client), MEMES_CIRCLE=0 on the server (route answers enabled:false -> nothing is built).
//   Test hooks (window.__memes) only with ?memestest or ?debug=1. Phase 2 (logos, all 150) plugs in via the core module.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as MC from './memes-circle-core.mjs';

const Q = new URLSearchParams(location.search);
const TEST = Q.has('memestest') || Q.get('debug') === '1';
const ST = { ready: false, built: false, error: null, enabled: true, data: null, tries: 0 };
window.__memesCircle = { get ready() { return ST.ready; }, get enabled() { return ST.enabled; } };
const ZI = Object.fromEntries(MC.ORDER.map((id, i) => [id, i]));   // kings 0, grinders 1, watchline 2, degens 3
const PI = Math.PI;
const hx = c => '#' + new THREE.Color(c).getHexString();
const rnd = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(2711);
const fogU = () => THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
const FOGV = '\n#include <fog_pars_vertex>\n', FOGF = '\n#include <fog_pars_fragment>\n';   // #include must start its own line
const NOISE = `float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}`;
const ZCOL = MC.ORDER.map(id => new THREE.Color(MC.ZONES[id].col));
const HAZE = MC.ORDER.map(id => new THREE.Color(MC.ZONES[id].haze));
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.__c = c; if (draw) draw(c.getContext('2d'), w, h); return t; }
const fitText = (g, s, x, y, maxW) => { g.fillText(String(s), x, y, maxW); };
const rrect = (g, x, y, w, h, r) => { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); };   // roundRect is missing on older Safari

async function load() {
  try { const r = await fetch('/api/memes-circle', { cache: 'no-cache' }); const j = await r.json().catch(() => null);
    if (j && j.enabled === false) { ST.enabled = false; return null; }
    if (r.ok && j && Array.isArray(j.tokens) && j.tokens.length) { ST.data = j; return j; }
  } catch (e) { ST.error = String(e.message || e); }
  return null;
}

function init(c, data) {
  const S = c.S, C = c.C, U = c.U, LOW = c.TIER === 'low', MOB = !!c.MOBILE;
  const R = MC.QUARTER.R;
  // ---- site: west of downtown, clear of the wind farm, power plant and airport (checked against the City's colliders + lake)
  const blocked = (x, z, r) => (c.colliders || []).some(o => o && !o.memes && Math.hypot(o.x - x, o.z - z) < r + (o.r || 0)) ||
    !!(window.__estate && window.__estate.inLake && window.__estate.inLake(x, z, r)) || Math.hypot(x, z) - r < 330;
  const cands = []; for (const rr of [520, 560, 600, 480]) for (const a of [3.63, 3.55, 3.72, 3.45, 3.82, 3.35]) cands.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr });
  const cen = MC.pickCenter(cands, blocked, R);
  const toCity = Math.atan2(-cen.z, -cen.x);
  const a0 = toCity + PI / 4;   // the avenue between Kings Row and Degen Strip ("Market Street") points at downtown
  const A = MC.zoneAngles(a0), mkt = a0 - PI / 4;
  const grp = new THREE.Group(); grp.name = 'memes-circle'; S.add(grp);
  const uni = { t: U.t, day: U.day };   // read-only shared uniforms (time of day is never written here)

  // ---- ground: one disc, zone surfaces + avenues + rim road + plaza ring + searchlight spots + casino glow pools
  const spots = [...Array(4)].map(() => new THREE.Vector4(0, 0, 0, 0)), glows = [...Array(12)].map(() => new THREE.Vector4(0, 0, 0, -1));
  const zoneW = new THREE.Vector4();
  const groundMat = new THREE.ShaderMaterial({ fog: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    uniforms: { ...fogU(), t: uni.t, day: uni.day, cen: { value: new THREE.Vector2(cen.x, cen.z) }, a0: { value: a0 }, R: { value: R }, zc: { value: ZCOL }, spots: { value: spots }, glows: { value: glows } },
    defines: LOW ? { LOWQ: '' } : {},
    vertexShader: `varying vec2 vP;${FOGV}\nvoid main(){vec4 wp=modelMatrix*vec4(position,1.);vP=wp.xz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float t,day,a0,R;uniform vec2 cen;uniform vec3 zc[4];uniform vec4 spots[4];uniform vec4 glows[12];varying vec2 vP;${FOGF}\n${NOISE}
#define PI 3.14159265
void main(){vec2 d=vP-cen;float r=length(d);if(r>R+9.)discard;
 float ang=atan(d.y,d.x)-a0;float k=mod(floor((ang+PI/4.)/(PI/2.)),4.);int z=int(k+.5);
 vec2 ax1=vec2(cos(a0+PI/4.),sin(a0+PI/4.)),ax2=vec2(-ax1.y,ax1.x);float dA=min(abs(dot(d,ax2)),abs(dot(d,ax1)));
 float night=1.-smoothstep(.15,.6,day);float n=vn(vP*.35),n2=vn(vP*.05);vec3 col;vec3 em=vec3(0.);
 if(z==0){col=mix(vec3(.06,.05,.035),vec3(.3,.245,.16),day)*(.85+.3*n);vec2 g=abs(fract(vP/3.)-.5);col*=1.-.35*smoothstep(.46,.5,max(g.x,g.y));
  em+=vec3(1.,.62,.25)*(.05+.14*night)*(.6+.4*n2);}   // Kings Row: warm stone pavers in permanent gold-hour light
 else if(z==1){col=mix(vec3(.05,.055,.05),vec3(.2,.215,.19),day)*(.8+.35*n)*(1.-.25*smoothstep(.6,.8,n2));
  float hz=step(dA,${(MC.QUARTER.AVE + 3).toFixed(1)})*step(.5,fract((dot(d,ax1)+dot(d,ax2))*.25));col=mix(col,vec3(.9,.75,.1)*(.4+.6*day),hz*step(${MC.QUARTER.AVE.toFixed(1)},dA)*.7);
  em+=vec3(.15,1.,.4)*.05*(.5+night);}   // Grinder Yards: oily concrete, hazard stripes along the avenues, green flood spill
 else if(z==2){col=mix(vec3(.025,.02,.02),vec3(.14,.105,.1),day)*(.8+.3*n);vec2 g=abs(fract(vP/6.)-.5);float gl=smoothstep(.47,.5,max(g.x,g.y));
  float scan=exp(-pow((r-mod(t*14.,R))*.25,2.));em+=vec3(1.,.08,.06)*(gl*.18+scan*.35)*(.4+.6*night);
  for(int i=0;i<4;i++){float s=spots[i].z;if(s<=0.)continue;float q=1.-smoothstep(s*.55,s,distance(vP,spots[i].xy));em+=vec3(1.,.75,.7)*q*(.35+.5*night);}}   // The Watchline
 else{col=mix(vec3(.012,.01,.02),vec3(.06,.05,.075),day);float pud=smoothstep(.45,.75,vn(vP*.12+3.));float rip=.6+.4*sin(t*2.+vn(vP*2.)*9.);
  em+=vec3(.75,.25,1.)*pud*.06*rip*(.5+night);}   // Degen Strip: wet black asphalt, puddles throw the neon back
 #ifndef LOWQ
 for(int i=0;i<12;i++){if(glows[i].w<0.)continue;float q=exp(-pow(distance(vP,glows[i].xy)/glows[i].z,2.));
  vec3 gc=glows[i].w<.5?vec3(.85,.3,1.):vec3(1.,.15,.12);float pud=z==3?.6+.8*smoothstep(.45,.75,vn(vP*.12+3.)):1.;em+=gc*q*.55*pud*(.45+.55*night);}
 #endif
 if(dA<${MC.QUARTER.AVE.toFixed(1)}&&r>${(MC.QUARTER.PLAZA * .8).toFixed(1)}){col=mix(vec3(.02,.022,.03),vec3(.16,.17,.19),day);float dash=step(.5,fract(r*.12))*step(dA,.14);col+=vec3(.9,.8,.5)*dash*.6;
  float edge=smoothstep(${(MC.QUARTER.AVE - .5).toFixed(1)},${MC.QUARTER.AVE.toFixed(1)},dA);em+=zc[z]*edge*(.35+.6*night);}
 if(r>R-7.&&r<R){col=mix(vec3(.02,.022,.03),vec3(.16,.17,.19),day);col+=vec3(.9,.8,.5)*step(.5,fract(atan(d.y,d.x)*R*.12/PI))*step(abs(r-R+3.5),.14)*.6;}
 if(r>=R){col=mix(vec3(.05,.05,.06),vec3(.4,.4,.42),day);em+=zc[z]*smoothstep(R+1.,R,r)*(.3+.5*night);}
 if(r<${MC.QUARTER.PLAZA.toFixed(1)}){col=mix(vec3(.03,.03,.04),vec3(.3,.3,.33),day)*(.9+.2*n);float ring=exp(-pow((r-${(MC.QUARTER.PLAZA - 3).toFixed(1)})*1.6,2.));em+=zc[z]*ring*(.6+.6*night);}
 gl_FragColor=vec4(col+em*(.22+.78*night),1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n}` });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(R + 9, LOW ? 64 : 96).rotateX(-PI / 2), groundMat); ground.position.set(cen.x, .07, cen.z); ground.renderOrder = 1; grp.add(ground);
  // approach road from the City's outer ring to the quarter's Market Street gate
  const gateP = { x: cen.x + Math.cos(mkt) * R, z: cen.z + Math.sin(mkt) * R }, roadEnd = (() => { const L = Math.hypot(gateP.x, gateP.z); const k = Math.max(.1, 320 / L); return { x: gateP.x * k, z: gateP.z * k }; })();
  const roadLen = Math.hypot(gateP.x - roadEnd.x, gateP.z - roadEnd.z), roadMat = new THREE.ShaderMaterial({ fog: true, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, uniforms: { ...fogU(), day: uni.day, t: uni.t },
    vertexShader: `varying vec2 vU;${FOGV}\nvoid main(){vU=vec2(position.x,position.y);vec4 mvPosition=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float day,t;varying vec2 vU;${FOGF}\nvoid main(){float night=1.-smoothstep(.15,.6,day);vec3 col=mix(vec3(.02,.022,.03),vec3(.16,.17,.19),day);float x=abs(vU.x);
 col+=vec3(.9,.8,.5)*step(.5,fract(vU.y*.12))*step(x,.14)*.6;float e=smoothstep(4.6,5.,x);col=mix(col,mix(vec3(.05,.05,.06),vec3(.4,.4,.42),day),e);
 col+=vec3(1.,.7,.3)*smoothstep(5.2,5.,abs(x-5.6))*(.25+.6*night)*(.6+.4*sin(vU.y*.5-t*3.));gl_FragColor=vec4(col,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n}` });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(12, roadLen, 1, 1), roadMat);
  road.rotation.set(-PI / 2, 0, Math.atan2(gateP.x - roadEnd.x, gateP.z - roadEnd.z));   // local +Y (the road's length) -> along gate - roadEnd
  road.position.set((gateP.x + roadEnd.x) / 2, .065, (gateP.z + roadEnd.z) / 2); road.renderOrder = 1; grp.add(road);

  // ---- towers: one instanced box draw with a per-district facade shader
  const CAP = 128;   // Phase 2 headroom (all 150 at lower LOD will get their own instanced tier)
  const boxG = new THREE.BoxGeometry(1, 1, 1).translate(0, .5, 0);
  const aInfo = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); boxG.setAttribute('aInfo', aInfo);
  const towerMat = new THREE.ShaderMaterial({ fog: true, uniforms: { ...fogU(), t: uni.t, day: uni.day },
    vertexShader: `attribute vec4 aInfo;varying vec3 vL,vN,vS,vW;varying vec4 vI;${FOGV}
void main(){mat4 im=instanceMatrix;vS=vec3(length(im[0].xyz),length(im[1].xyz),length(im[2].xyz));vL=position*vS;vN=normal;vI=aInfo;
 vec4 wp=modelMatrix*im*vec4(position,1.);vW=wp.xyz;vec4 mvPosition=viewMatrix*wp;gl_Position=projectionMatrix*mvPosition;\n#include <fog_vertex>\n}`,
    fragmentShader: `uniform float t,day;varying vec3 vL,vN,vS,vW;varying vec4 vI;${FOGF}\n${NOISE}
void main(){int z=int(vI.x+.5);float seed=vI.y;vec3 N=normalize(vN);float night=1.-smoothstep(.15,.6,day);
 bool roof=N.y>.5;float u=abs(N.x)>.5?vL.z:vL.x,hw=abs(N.x)>.5?vS.z*.5:vS.x*.5,v=vL.y,H=vS.y;
 vec3 V=normalize(cameraPosition-vW);float lam=.55+.45*abs(dot(N,normalize(vec3(.4,.7,.3))));
 vec2 cs=z==0?vec2(1.9,3.2):z==1?vec2(2.6,3.6):z==2?vec2(3.2,4.):vec2(2.4,3.4);vec2 f=fract(vec2(u,v)/cs);vec2 ci=floor(vec2(u+hw*3.1+seed*31.,v)/cs);
 vec2 mw=z==0?vec2(.045,.07):vec2(.1,.17);float win=step(mw.x,f.x)*step(f.x,1.-mw.x)*step(mw.y,f.y)*step(f.y,1.-mw.y);float lit=step(z==0?.66:z==2?.82:.6,h21(ci+seed*7.13+floor(t*.02+seed)));
 vec3 c;vec3 e=vec3(0.);
 if(z==0){float fr=pow(1.-abs(dot(V,N)),2.);vec3 sky=mix(vec3(1.,.6,.25),vec3(.45,.5,.7),clamp(v/130.,0.,1.));float pv=h21(ci*1.7+seed);c=mix(vec3(.035,.04,.06),vec3(.08,.1,.14)*(.8+.4*pv),day)*lam+sky*(.12+.55*fr)*(.45+.35*day)*(.85+.3*pv);
  c=mix(c,vec3(.95,.7,.28)*(.35+.3*day),(1.-win)*.75);e+=vec3(1.,.74,.38)*win*lit*night*.6;e+=vec3(1.,.7,.25)*step(fract(v/24.),.03)*(.35+.6*night);}
 else if(z==1){float pn=vn(vec2(u,v)*.6);c=mix(vec3(.06,.065,.06),vec3(.22,.23,.21),day)*lam*(.85+.25*pn);c*=1.-.3*(1.-win);
  e+=vec3(.25,1.,.45)*step(fract(v/6.),.045)*(.55+.7*night);e+=vec3(.75,1.,.8)*win*lit*night*.55;}
 else if(z==3){c=mix(vec3(.02,.012,.03),vec3(.07,.05,.09),day)*lam;float ed=smoothstep(.35,.05,hw-abs(u));float top=smoothstep(.5,.1,H-v);
  float hue=fract(t*.08+seed);vec3 nc=mix(vec3(.85,.25,1.),vec3(1.,.2,.6),.5+.5*sin(t*1.3+seed*6.));e+=nc*(ed+top)*(1.1+.4*sin(t*4.+seed*9.));
  float band=step(4.,v)*step(v,7.);vec3 mq=.5+.5*cos(6.283*(hue+vec3(0.,.33,.67)));e+=mq*band*step(.5,fract(u*1.3-t*3.))*1.2;e+=vec3(.9,.35,1.)*win*lit*.5*(.4+night);}
 else{c=mix(vec3(.035,.03,.03),vec3(.13,.115,.115),day)*lam;float bl=step(.82,fract(t*.7+seed));e+=vec3(1.,.08,.05)*smoothstep(1.6,.2,H-v)*(.3+1.6*bl);
  e+=vec3(1.,.15,.1)*step(fract(v/15.),.03)*.45;e+=vec3(.7,.8,1.)*win*lit*night*.35;}
 if(vI.z>.5){e+=vec3(1.,.35,.05)*step(fract(v/9.+t*.05),.06)*1.4;}   // BURN: ember bands
 if(roof){c=mix(vec3(.03),vec3(.2),day);e=vec3(0.);}
 gl_FragColor=vec4(c+e,1.);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n#include <fog_fragment>\n}` });
  const towers = new THREE.InstancedMesh(boxG, towerMat, CAP); towers.count = 0; towers.frustumCulled = false; grp.add(towers);
  const crownG = new THREE.ConeGeometry(.5, 1, 4).translate(0, .5, 0).rotateY(PI / 4);
  const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshBasicMaterial({ color: 0xffffff, fog: true }), CAP); crowns.count = 0; crowns.frustumCulled = false; grp.add(crowns);
  // name plates: one billboarded instanced quad, text from an atlas canvas
  const AW = LOW ? 512 : 1024, CW = AW / 4, CH = CW / 4, CELLS = 4 * (AW / CH);   // 4 x 16 = 64 cells
  const atlas = canvasTex(AW, AW);
  const plateG = new THREE.PlaneGeometry(1, 1); const aCell = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); plateG.setAttribute('aCell', aCell);
  const plates = new THREE.InstancedMesh(plateG, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { map: { value: atlas } },
    vertexShader: `attribute vec4 aCell;varying vec2 vUv;varying float vF;void main(){vec4 c=modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.);
 vec3 cr=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]);float sx=length(instanceMatrix[0].xyz),sy=length(instanceMatrix[1].xyz);
 vec3 wp=c.xyz+cr*position.x*sx+vec3(0.,1.,0.)*position.y*sy;vUv=aCell.xy+uv*aCell.zw;float d=distance(cameraPosition,c.xyz);vF=1.-smoothstep(340.,480.,d);gl_Position=projectionMatrix*viewMatrix*vec4(wp,1.);}`,
    fragmentShader: `uniform sampler2D map;varying vec2 vUv;varying float vF;void main(){vec4 c=texture2D(map,vUv);if(c.a*vF<.02)discard;gl_FragColor=vec4(c.rgb,c.a*vF);\n#include <colorspace_fragment>\n}` }), CAP);
  plates.count = 0; plates.frustumCulled = false; plates.renderOrder = 5; grp.add(plates);

  // ---- Grinder Yards cranes (one instanced draw, slow slewing) + Watchline searchlights (one additive instanced draw)
  const cranes = (() => { const parts = [], box = (w, h, d, x, y, z, col) => { const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z); const n = g.attributes.position.count, cc = new Float32Array(n * 3), cl = new THREE.Color(col); for (let i = 0; i < n; i++) cc.set([cl.r, cl.g, cl.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); parts.push(g); };
    box(1.1, 34, 1.1, 0, 17, 0, 0xf2c230); box(26, .9, .9, 7, 34.5, 0, 0xf2c230); box(8, 1.4, 1.4, -6, 34.4, 0, 0x5a5a5a); box(2.2, 2, 2.2, 0, 32.4, 0, 0x2a2f33); box(.12, 14, .12, 18, 27.5, 0, 0x222222); box(1.2, .6, 1.2, 18, 20.4, 0, 0x2bd46a);
    box(.5, .5, .5, 20, 35.2, 0, 0x6bff9a); box(.5, .5, .5, -9.8, 35.4, 0, 0xff3030);
    const m = new THREE.InstancedMesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x0a3318 }), 4); m.frustumCulled = false; grp.add(m); return m; })();
  const craneSpots = [];
  const beamG = new THREE.ConeGeometry(7, 90, 18, 1, true).translate(0, -45, 0);
  const beams = new THREE.InstancedMesh(beamG, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { day: uni.day },
    vertexShader: `varying float vF,vE;void main(){vF=-position.y/90.;vec4 wp=modelMatrix*instanceMatrix*vec4(position,1.);vec3 n=normalize(mat3(modelMatrix*instanceMatrix)*normal);vE=abs(dot(n,normalize(cameraPosition-wp.xyz)));gl_Position=projectionMatrix*viewMatrix*wp;}`,
    fragmentShader: `uniform float day;varying float vF,vE;void main(){float a=pow(1.-vF,1.4)*smoothstep(0.,.5,vE)*(.11+.2*(1.-smoothstep(.15,.6,day)));gl_FragColor=vec4(vec3(1.,.55,.5)*a,1.);}` }), 4);
  beams.frustumCulled = false; grp.add(beams);
  const beamPosts = [0, 1, 2, 3].map(i => { const off = (i - 1.5) * .34, rr = R * (i % 2 ? .78 : .46); return { x: cen.x + Math.cos(A.watchline + off) * rr, z: cen.z + Math.sin(A.watchline + off) * rr, ph: i * 1.7 }; });

  // ---- police patrols around The Watchline's wedge (cars: one draw, light bars: one flashing draw)
  const carParts = [], cbox = (w, h, d, y, z, col) => { const g = new THREE.BoxGeometry(w, h, d).translate(0, y, z); const n = g.attributes.position.count, cc = new Float32Array(n * 3), cl = new THREE.Color(col); for (let i = 0; i < n; i++) cc.set([cl.r, cl.g, cl.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(cc, 3)); carParts.push(g); };
  cbox(2, .75, 4.4, .6, 0, 0x101522); cbox(2.02, .4, 1.6, .7, .2, 0xf2f2f2); cbox(1.7, .6, 2.1, 1.25, -.2, 0x0c0f18); for (const x of [-.9, .9]) for (const zz of [-1.4, 1.4]) { const g = new THREE.CylinderGeometry(.36, .36, .3, 10).rotateZ(PI / 2).translate(x, .36, zz); const n = g.attributes.position.count; g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(.05), 3)); carParts.push(g); }
  const NCAR = LOW ? 4 : 6;
  const cars = new THREE.InstancedMesh(mergeGeometries(carParts.map(g => g.index ? g.toNonIndexed() : g)), new THREE.MeshLambertMaterial({ vertexColors: true }), NCAR); cars.frustumCulled = false; grp.add(cars);
  const barG = new THREE.BoxGeometry(1.4, .2, .38).translate(0, 1.66, -.3); barG.setAttribute('aK', new THREE.InstancedBufferAttribute(Float32Array.from({ length: NCAR }, (_, i) => i), 1));   // per-car phase as an instanced attribute (no gl_InstanceID: WebKit/ANGLE)
  const bars = new THREE.InstancedMesh(barG, new THREE.ShaderMaterial({ uniforms: { t: uni.t },
    vertexShader: `attribute float aK;varying float vX;varying float vK;void main(){vX=position.x;vK=aK;gl_Position=projectionMatrix*viewMatrix*modelMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float t;varying float vX;varying float vK;void main(){float ph=step(.5,fract(t*2.6+vK*.37));vec3 c=vX<0.?vec3(1.,.05,.05)*(.2+2.*ph):vec3(.1,.3,1.)*(.2+2.*(1.-ph));gl_FragColor=vec4(c,1.);}` }), NCAR);
  bars.frustumCulled = false; grp.add(bars);
  const loop = (() => { const pts = [], aL = A.watchline - PI / 4, aR = A.watchline + PI / 4, lane = 2.2, P0 = MC.QUARTER.PLAZA + 3, P1 = R - 3.5;
    const on = (a, r, side) => ({ x: cen.x + Math.cos(a) * r - Math.sin(a) * side, z: cen.z + Math.sin(a) * r + Math.cos(a) * side });
    for (let r = P0; r <= P1; r += 6) pts.push(on(aL, r, lane)); for (let k = 0; k <= 24; k++) { const a = aL + (aR - aL) * k / 24; pts.push({ x: cen.x + Math.cos(a) * P1, z: cen.z + Math.sin(a) * P1 }); }
    for (let r = P1; r >= P0; r -= 6) pts.push(on(aR, r, -lane));
    const L = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; L.push(L[i - 1] + Math.hypot(b.x - a.x, b.z - a.z)); } return { pts, L, len: L[L.length - 1] }; })();
  const along = s => { s = ((s % loop.len) + loop.len) % loop.len; let i = 1; while (loop.L[i] < s) i++; const a = loop.pts[i - 1], b = loop.pts[i % loop.pts.length], k = (s - loop.L[i - 1]) / Math.max(1e-6, loop.L[i] - loop.L[i - 1]); return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, yaw: Math.atan2(b.x - a.x, b.z - a.z) }; };

  // ---- haze puffs (normal blend) + district particles (additive): two Points draws for the whole quarter
  const hz = [], hzA = [], mo = [], moA = [];
  const inWedge = (id, rmin, rmax) => { const a = A[id] + (rnd() - .5) * (PI / 2 - .25), r = rmin + rnd() * (rmax - rmin); return { x: cen.x + Math.cos(a) * r, z: cen.z + Math.sin(a) * r }; };
  MC.ORDER.forEach((id, zi) => { const nh = LOW ? 14 : 30; for (let i = 0; i < nh; i++) { const p = inWedge(id, MC.QUARTER.PLAZA, R - 4); hz.push(p.x, 2 + rnd() * (zi === 2 ? 14 : 9), p.z); hzA.push(zi, rnd()); }
    if (zi === 1) return; const nm = LOW ? 60 : 160; for (let i = 0; i < nm; i++) { const p = inWedge(id, MC.QUARTER.PLAZA, R - 6); mo.push(p.x, zi === 2 ? 20 + rnd() * 25 : zi === 3 ? 2 + rnd() * 12 : rnd() * 40, p.z); moA.push(zi, rnd()); } });
  const sparkBase = mo.length / 3;   // grinder sparks are added once crane / tower tops are known (layout)
  const SPARKS = LOW ? 60 : 140; for (let i = 0; i < SPARKS; i++) { mo.push(0, -999, 0); moA.push(1, rnd()); }
  const ptsGeo = (arr, aa) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.setAttribute('aZ', new THREE.Float32BufferAttribute(aa, 2)); return g; };
  const scaleU = { value: 800 }, zwU = { value: zoneW };
  const hazeMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { t: uni.t, day: uni.day, sc: scaleU, zw: zwU, hc: { value: HAZE } },
    vertexShader: `attribute vec2 aZ;uniform float t,sc,day;uniform vec4 zw;uniform vec3 hc[4];varying vec3 vC;varying float vA;
void main(){int z=int(aZ.x+.5);vec3 p=position+vec3(sin(t*.05+aZ.y*6.3)*7.,sin(t*.11+aZ.y*9.)*.8,cos(t*.04+aZ.y*5.)*7.);vec4 mv=viewMatrix*vec4(p,1.);float d=-mv.z;
 float w=z==0?zw.x:z==1?zw.y:z==2?zw.z:zw.w;vC=hc[z]*(.45+.35*day);vA=(z==2?.1:.05)*(.4+.7*w)*(1.-.55*day)*smoothstep(10.,40.,d)*(1.-smoothstep(500.,650.,d));
 gl_PointSize=min(${(MOB ? 220 : 340)}.,(z==2?26.:20.)*sc/max(d,1.));gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vC;varying float vA;void main(){vec2 q=gl_PointCoord-.5;float r=dot(q,q)*4.;if(r>1.)discard;float a=pow(1.-r,2.)*vA;gl_FragColor=vec4(vC,a);\n#include <colorspace_fragment>\n}` });
  const haze = new THREE.Points(ptsGeo(hz, hzA), hazeMat); haze.frustumCulled = false; haze.renderOrder = 6; grp.add(haze);
  const motesMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { t: uni.t, day: uni.day, sc: scaleU, zw: zwU },
    vertexShader: `attribute vec2 aZ;uniform float t,sc,day;uniform vec4 zw;varying vec3 vC;varying float vA;
void main(){int z=int(aZ.x+.5);float s=aZ.y;vec3 p=position;float sz=.35;float night=1.-smoothstep(.15,.6,day);float w=z==0?zw.x:z==1?zw.y:z==2?zw.z:zw.w;
 if(z==0){p.y=mod(position.y+t*1.4+s*40.,42.);p.x+=sin(t*.5+s*20.)*1.5;vC=vec3(1.,.78,.35);vA=.55*(1.-smoothstep(32.,42.,p.y))*(.5+.5*sin(t*3.+s*40.));sz=.32;}
 else if(z==1){float age=fract(t/1.3+s);vec2 dir=vec2(cos(s*93.),sin(s*93.));p+=vec3(dir.x*5.*age,2.5*age-14.*age*age,dir.y*5.*age);vC=mix(vec3(1.,.95,.7),vec3(1.,.45,.1),age);vA=(1.-age)*1.2;sz=.22;}
 else if(z==2){p.y=mod(position.y-t*1.1-s*30.,32.);p.x+=sin(t*.3+s*12.)*2.;vC=vec3(1.,.22,.12);vA=.5*(.6+.4*sin(t*2.+s*30.));sz=.26;}
 else{p.y=position.y+sin(t*.4+s*20.)*1.5;p.x+=sin(t*.2+s*7.)*3.;vC=mix(vec3(.85,.3,1.),vec3(.2,.9,1.),step(.7,fract(s*7.)));vA=.5+.35*sin(t*1.7+s*50.);sz=.55;}
 vA*=(.35+.65*night)*(.4+.9*w);vec4 mv=viewMatrix*vec4(p,1.);float d=-mv.z;vA*=1.-smoothstep(220.,320.,d);gl_PointSize=clamp(sz*sc/max(d,1.),1.5,40.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vC;varying float vA;void main(){vec2 q=gl_PointCoord-.5;float r=dot(q,q)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*vA*(1.-r),1.);}` });
  const motes = new THREE.Points(ptsGeo(mo, moA), motesMat); motes.frustumCulled = false; motes.renderOrder = 7; grp.add(motes);

  // ---- Kings Row fireworks on green market days (read-only mood getter from app.js; never sets weather)
  const FB = 6, FP = LOW ? 40 : 70, fw = [], fwA = [];
  for (let b = 0; b < FB; b++) for (let i = 0; i < FP; i++) { const u = rnd() * 2 - 1, th = rnd() * PI * 2, s = Math.sqrt(1 - u * u); fw.push(s * Math.cos(th), u, s * Math.sin(th)); fwA.push(b, .7 + rnd() * .3); }
  const fwG = new THREE.BufferGeometry(); fwG.setAttribute('position', new THREE.Float32BufferAttribute(fw, 3)); fwG.setAttribute('aZ', new THREE.Float32BufferAttribute(fwA, 2));
  const fwOn = { value: 0 };
  const fireworks = new THREE.Points(fwG, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { t: uni.t, day: uni.day, sc: scaleU, on: fwOn, cen: { value: new THREE.Vector2(cen.x, cen.z) }, ak: { value: A.kings } },
    vertexShader: `attribute vec2 aZ;uniform float t,sc,on,ak,day;uniform vec2 cen;varying vec3 vC;varying float vA;
float hh(float n){return fract(sin(n*91.37)*43758.5453);}
void main(){float P=3.4,b=aZ.x,tt=t+b*P/6.,cyc=floor(tt/P),age=mod(tt,P);float sd=cyc*7.+b*13.;float a=ak+(hh(sd)-.5)*1.25,r=45.+hh(sd+1.)*80.;
 vec3 o=vec3(cen.x+cos(a)*r,75.+hh(sd+2.)*45.,cen.y+sin(a)*r);vec3 p=o+position*aZ.y*(22.*(1.-exp(-age*2.2)))+vec3(0.,-2.2*age*age,0.);
 float k=hh(sd+3.);vC=k<.33?vec3(1.,.8,.3):k<.66?vec3(.4,1.,.55):vec3(1.,.95,.9);vA=on*smoothstep(0.,.08,age)*(1.-smoothstep(1.6,2.6,age))*(.35+.65*(1.-smoothstep(.15,.6,day)));
 vec4 mv=viewMatrix*vec4(p,1.);gl_PointSize=clamp(1.1*sc/max(-mv.z,1.),1.5,24.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 vC;varying float vA;void main(){vec2 q=gl_PointCoord-.5;float r=dot(q,q)*4.;if(r>1.)discard;gl_FragColor=vec4(vC*vA*(1.-r)*1.6,1.);}` }));
  fireworks.frustumCulled = false; grp.add(fireworks);

  // ---- central plaza pylon: four faces (one per district: name + its top 5), plus the Market Street gate arch
  const PW = LOW ? 1024 : 2048, pylonTex = canvasTex(PW, PW / 4);
  const pylon = (() => { const g = new THREE.Group(); const body = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 6).translate(0, 11, 0), new THREE.MeshLambertMaterial({ color: 0x14161c })); g.add(body);
    const faces = []; MC.ORDER.forEach((id, i) => { const ang = A[id]; const p = new THREE.PlaneGeometry(5.6, 5.6); const uv = p.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 4);
      p.rotateY(PI / 2 - ang).translate(Math.cos(ang) * 3.02, 14, Math.sin(ang) * 3.02); faces.push(p); });
    g.add(new THREE.Mesh(mergeGeometries(faces), new THREE.MeshBasicMaterial({ map: pylonTex, fog: true }))); g.position.set(cen.x, 0, cen.z); grp.add(g); return g; })();
  const archTex = canvasTex(1024, 192, (g, w, h) => { g.fillStyle = '#0b0c12'; g.fillRect(0, 0, w, h); const gr = g.createLinearGradient(0, 0, w, 0); MC.ORDER.forEach((id, i) => gr.addColorStop(i / 3, hx(MC.ZONES[id].col))); g.strokeStyle = gr; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 72px system-ui,sans-serif'; g.fillStyle = '#fff3d6'; g.shadowColor = '#ffb347'; g.shadowBlur = 24; fitText(g, 'CIRCLE OF XRPL MEMES', w / 2, 82, w - 60); g.shadowBlur = 0;
    g.font = '600 30px system-ui,sans-serif'; g.fillStyle = '#c9c3b8'; fitText(g, 'Kings Row · Grinder Yards · Degen Strip · The Watchline   ·   Data by xrpl.to', w / 2, 148, w - 60); });
  const arch = (() => { const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x1a1c24 }); for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1.6, 14, 1.6).translate(s * 9, 7, 0), m); g.add(p); }
    g.add(new THREE.Mesh(new THREE.BoxGeometry(20, 3.8, 1.2).translate(0, 15.4, 0), m)); for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(18.6, 3.5), new THREE.MeshBasicMaterial({ map: archTex, fog: true })); f.position.set(0, 15.4, s * .62); if (s < 0) f.rotation.y = PI; g.add(f); }
    g.position.set(gateP.x, 0, gateP.z); g.rotation.y = -mkt + PI / 2; grp.add(g); return g; })();
  const staticColl = []; const pushC = o => { o.memes = true; staticColl.push(o); c.colliders.push(o); };
  pushC({ x: cen.x, z: cen.z, r: 4.3, h: 22 });
  for (const s of [-1, 1]) { const lx = s * 9; pushC({ x: gateP.x + Math.cos(mkt + PI / 2) * lx, z: gateP.z + Math.sin(mkt + PI / 2) * lx, r: 1.3, h: 14 }); }

  // ---- downtown ALPHA LIST billboard: nearest free roadside spot around the XRP hub, on the side facing the quarter
  const BW = LOW ? 768 : 1024, billTex = canvasTex(BW, BW * .625);
  const bill = (() => { const onRoad = window.__onRoad || (() => false); let best = null;
    for (const rr of [92, 100, 84, 108, 116]) { for (let k = 0; k < 36 && !best; k++) { const a = toCity + PI + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * .14; const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (onRoad(x, z, 3) || (c.colliders || []).some(o => Math.hypot(o.x - x, o.z - z) < (o.r || 0) + 7)) continue; best = { x, z, a }; } if (best) break; }
    if (!best) { const a = toCity + PI; best = { x: Math.cos(a) * 96, z: Math.sin(a) * 96, a }; }
    const g = new THREE.Group(), m = new THREE.MeshLambertMaterial({ color: 0x16181f }); for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(.9, 7, .9).translate(s * 6.5, 3.5, 0), m));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(17.4, 11.2, .7).translate(0, 12.6, -.4), m));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(16.6, 10.4), new THREE.MeshBasicMaterial({ map: billTex, fog: true, toneMapped: false })); face.position.set(0, 12.6, 0); g.add(face);
    g.position.set(best.x, 0, best.z); g.rotation.y = Math.atan2(-best.x, -best.z); S.add(g);   // faces the hub
    for (const s of [-1, 1]) { const lx = s * 6.5; c.colliders.push({ x: best.x + Math.cos(g.rotation.y) * lx, z: best.z - Math.sin(g.rotation.y) * lx, r: .9, h: 7, memes: true }); }
    return { g, x: best.x, z: best.z }; })();

  // ---- data -> towers, plates, pylon faces, billboard, colliders, glow pools, spark emitters
  let placed = [], towerColl = [];
  const M4 = new THREE.Matrix4(), V = new THREE.Vector3(), Qt = new THREE.Quaternion(), SC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  function paintAtlas(list) { const g = atlas.__c.getContext('2d'); g.clearRect(0, 0, AW, AW); g.textAlign = 'center'; g.textBaseline = 'middle';
    list.forEach((p, i) => { const cx = (i % 4) * CW, cy = Math.floor(i / 4) * CH, z = MC.ZONES[p.zone]; const pad = CH * .08;
      g.fillStyle = 'rgba(8,9,14,.82)'; rrect(g, cx + pad, cy + pad, CW - pad * 2, CH - pad * 2, CH * .18); g.fill(); g.strokeStyle = hx(z.col); g.lineWidth = Math.max(1.5, CH * .05); g.stroke();
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(CH * .36)}px system-ui,sans-serif`; fitText(g, p.t.label, cx + CW / 2, cy + CH * .38, CW - CH * .5);
      g.fillStyle = hx(z.col); g.font = `700 ${Math.round(CH * .24)}px system-ui,sans-serif`; fitText(g, p.zone === 'watchline' ? 'The Watchline' : `#${p.t.rank} · α ${p.t.alpha.toFixed(1)}`, cx + CW / 2, cy + CH * .73, CW - CH * .4); });
    atlas.needsUpdate = true; }
  function paintPylon(d) { const g = pylonTex.__c.getContext('2d'), w = PW / 4, h = PW / 4; g.clearRect(0, 0, PW, h);
    MC.ORDER.forEach((id, i) => { const z = MC.ZONES[id], x0 = i * w; g.fillStyle = '#0b0c12'; g.fillRect(x0, 0, w, h); g.strokeStyle = hx(z.col); g.lineWidth = w * .02; g.strokeRect(x0 + w * .02, w * .02, w * .96, h * .96);
      g.textAlign = 'center'; g.fillStyle = hx(z.col); g.font = `900 ${Math.round(w * .095)}px system-ui,sans-serif`; fitText(g, z.name.toUpperCase(), x0 + w / 2, h * .16, w * .9);
      g.fillStyle = '#bdb6aa'; g.font = `600 ${Math.round(w * .042)}px system-ui,sans-serif`; fitText(g, `${d.counts?.[id] ?? 0} of ${d.tokens.length} · ${z.blurb}`, x0 + w / 2, h * .25, w * .9);
      const top = d.tokens.filter(t => t.q === id).sort((a, b) => id === 'watchline' ? b.ms - a.ms : b.alpha - a.alpha).slice(0, 6);
      g.textAlign = 'left'; top.forEach((t, k) => { const y = h * (.37 + k * .1); g.fillStyle = '#fff'; g.font = `700 ${Math.round(w * .055)}px system-ui,sans-serif`; fitText(g, t.label, x0 + w * .08, y, w * .55);
        g.textAlign = 'right'; g.fillStyle = hx(z.col); fitText(g, id === 'watchline' ? 'MS ' + t.ms.toFixed(0) : t.alpha.toFixed(1), x0 + w * .92, y, w * .3); g.textAlign = 'left'; });
      g.textAlign = 'center'; g.fillStyle = '#8a857c'; g.font = `500 ${Math.round(w * .034)}px system-ui,sans-serif`; fitText(g, 'Data by xrpl.to · on-chain signals, not advice', x0 + w / 2, h * .96, w * .9); });
    pylonTex.needsUpdate = true; }
  function paintBill(d) { const g = billTex.__c.getContext('2d'), w = BW, h = BW * .625, s = w / 1024; g.fillStyle = '#0a0b10'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffc44d'; g.lineWidth = 8 * s; g.strokeRect(6 * s, 6 * s, w - 12 * s, h - 12 * s);
    g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#ffc44d'; g.font = `900 ${58 * s}px system-ui,sans-serif`; g.fillText('ALPHA LIST', 30 * s, 52 * s);
    g.fillStyle = '#d8d2c6'; g.font = `600 ${20 * s}px system-ui,sans-serif`; fitText(g, 'Top 15 · Circle of XRPL Memes · Alpha = 50% Market + 35% Holder Health + 15% Momentum', 360 * s, 44 * s, 640 * s);
    g.fillStyle = '#9a948a'; g.font = `500 ${17 * s}px system-ui,sans-serif`; fitText(g, 'The Watchline is left off the list · Meme Circle is west of downtown ➜', 360 * s, 70 * s, 640 * s);
    const L = MC.alphaList(d, 15); L.forEach((t, i) => { const col = i % 3, row = Math.floor(i / 3), x = 24 * s + col * 330 * s, y = 112 * s + row * 98 * s, z = MC.ZONES[t.q];
      g.fillStyle = '#141620'; rrect(g, x, y, 318 * s, 88 * s, 10 * s); g.fill(); g.strokeStyle = hx(z.col); g.lineWidth = 3 * s; g.stroke();
      g.fillStyle = hx(z.col); g.font = `800 ${26 * s}px system-ui,sans-serif`; g.fillText('#' + t.rank, x + 12 * s, y + 28 * s);
      g.fillStyle = '#fff'; g.font = `800 ${25 * s}px system-ui,sans-serif`; fitText(g, t.label, x + 72 * s, y + 28 * s, 150 * s);
      g.textAlign = 'right'; g.fillStyle = '#ffe6a8'; g.font = `900 ${30 * s}px system-ui,sans-serif`; g.fillText(t.alpha.toFixed(1), x + 306 * s, y + 30 * s); g.textAlign = 'left';
      g.fillStyle = hx(z.col); g.font = `700 ${16 * s}px system-ui,sans-serif`; g.fillText(z.name.toUpperCase(), x + 12 * s, y + 62 * s);
      g.fillStyle = '#a8a296'; g.font = `500 ${15 * s}px system-ui,sans-serif`; fitText(g, `mcap ${MC.fmtXrp(t.mcap)} · TVL ${MC.fmtXrp(t.tvl)} XRP`, x + 140 * s, y + 62 * s, 170 * s); });
    const ts = d.ts ? new Date(d.ts) : null; g.fillStyle = '#7d786f'; g.font = `500 ${16 * s}px system-ui,sans-serif`;
    fitText(g, `Data by xrpl.to · updated ${ts ? ts.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'} · on-chain data signals, not financial advice`, 28 * s, h - 22 * s, w - 56 * s);
    billTex.needsUpdate = true; }
  function apply(d) {
    const list = MC.pickTowers(d); placed = MC.layoutTowers(list, cen, a0, R);
    for (const o of towerColl) { const i = c.colliders.indexOf(o); if (i >= 0) c.colliders.splice(i, 1); } towerColl = [];
    let gi = 0; glows.forEach(g => { g.w = -1; });
    placed.forEach((p, i) => { if (i >= CAP) return; Qt.setFromAxisAngle(UP, -p.face + PI / 2); M4.compose(V.set(p.x, 0, p.z), Qt, SC.set(p.w, p.h, p.w)); towers.setMatrixAt(i, M4);
      aInfo.setXYZW(i, ZI[p.zone], (i * .618) % 1, p.t.name === 'BURN' ? 1 : 0, 0);
      const ch = p.zone === 'kings' ? 7 + p.w * .8 : p.zone === 'grinders' ? 5 : p.zone === 'degens' ? 2.5 : 2, cw = p.zone === 'kings' ? p.w * .35 : p.zone === 'grinders' ? .25 : p.zone === 'degens' ? p.w * .72 : .9;
      M4.compose(V.set(p.x, p.h, p.z), Qt, SC.set(cw, ch, cw)); crowns.setMatrixAt(i, M4);
      crowns.setColorAt(i, new THREE.Color(p.zone === 'kings' ? 0xffc44d : p.zone === 'grinders' ? 0x6bff9a : p.zone === 'degens' ? 0xd86bff : 0xff2a20));
      M4.compose(V.set(p.x, p.h + (p.zone === 'kings' ? ch + 3 : 5), p.z), Qt.identity(), SC.set(15, 3.75, 1)); plates.setMatrixAt(i, M4);
      const u0 = (i % 4) * CW / AW, v0 = 1 - (Math.floor(i / 4) + 1) * CH / AW; aCell.setXYZW(i, u0, v0, CW / AW, CH / AW);
      if ((p.zone === 'degens' || p.zone === 'watchline') && gi < glows.length) glows[gi++].set(p.x, p.z, p.w * 1.6 + 6, p.zone === 'degens' ? 0 : 1);
      const o = { x: p.x, z: p.z, r: p.w * .62, h: p.h, memes: true }; towerColl.push(o); c.colliders.push(o); });
    const n = Math.min(CAP, placed.length); towers.count = crowns.count = n; plates.count = Math.min(n, CELLS);
    towers.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = plates.instanceMatrix.needsUpdate = true; aInfo.needsUpdate = aCell.needsUpdate = true; if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
    // cranes stand between the Grinder Yards towers; sparks fall from the crane hooks and the yard's tower tops
    craneSpots.length = 0; const gy = placed.filter(p => p.zone === 'grinders');
    for (let k = 0; k < 4; k++) { const a = A.grinders + (k - 1.5) * .3, r = R * (k % 2 ? .62 : .82); let x = cen.x + Math.cos(a) * r, z = cen.z + Math.sin(a) * r;
      for (let it = 0; it < 6 && placed.some(p => Math.hypot(p.x - x, p.z - z) < p.w + 3); it++) { x += Math.cos(a + PI / 2) * 7; z += Math.sin(a + PI / 2) * 7; }
      craneSpots.push({ x, z, ph: k * 1.3 }); const o = { x, z, r: 1.2, h: 34, memes: true }; towerColl.push(o); c.colliders.push(o); }
    const mp = motes.geometry.attributes.position, em = [...gy.map(p => ({ x: p.x, y: p.h, z: p.z })), ...craneSpots.map(s => ({ x: s.x, y: 20, z: s.z, crane: s }))];
    for (let i = 0; i < SPARKS; i++) { const e = em[i % Math.max(1, em.length)]; if (!e) { mp.setXYZ(sparkBase + i, 0, -999, 0); continue; } mp.setXYZ(sparkBase + i, e.x + (rnd() - .5) * 2, e.y + rnd() * 1.5, e.z + (rnd() - .5) * 2); }
    mp.needsUpdate = true;
    paintAtlas(placed.slice(0, CELLS)); paintPylon(d); paintBill(d);
    ST.counts = d.counts; ST.ts = d.ts; ST.towers = n;
  }

  // ---- interactions: inspect a tower (E / tap), read the Alpha List at the billboard; minimap + tour stop
  let card = null; const closeCard = () => { if (card) { card.remove(); card = null; } };
  function showCard(title, rows, foot, extra) { closeCard(); card = document.createElement('div'); card.className = 'mc-card';
    card.style.cssText = 'position:fixed;left:50%;bottom:calc(84px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:60;width:min(92vw,380px);max-height:62vh;overflow:auto;padding:14px 16px 12px;border-radius:14px;background:rgba(10,11,16,.92);border:1px solid rgba(255,196,77,.45);color:#eee6d8;font:500 13px/1.45 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)';
    const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', 'Close'); x.style.cssText = 'position:absolute;right:8px;top:6px;min-width:44px;min-height:44px;background:none;border:0;color:#cfc8bb;font-size:24px;cursor:pointer'; x.onclick = closeCard; card.append(x);
    const h = document.createElement('div'); h.textContent = title; h.style.cssText = 'font:800 17px system-ui,sans-serif;margin:0 40px 8px 0;color:#fff'; card.append(h);
    for (const [k, v, col] of rows) { const r = document.createElement('div'); r.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.06)';
      const a = document.createElement('span'); a.textContent = k; a.style.color = '#a9a296'; const b = document.createElement('span'); b.textContent = v; b.style.cssText = 'font-weight:700;text-align:right' + (col ? ';color:' + col : ''); r.append(a, b); card.append(r); }
    if (extra) card.append(extra);
    const f = document.createElement('div'); f.textContent = foot; f.style.cssText = 'margin-top:8px;color:#8a857c;font-size:11.5px'; card.append(f); document.body.append(card); }
  const FOOT = 'Data by xrpl.to · Circle of XRPL Memes · on-chain data signals only, not an accusation and not financial advice.';
  function inspect(p) { const t = p.t, z = MC.ZONES[t.q];
    const rows = [['District', z.name, hx(z.col)], ['Alpha', t.q === 'watchline' ? 'not ranked (Watchline)' : `#${t.rank} · ${t.alpha.toFixed(1)}`], ['Market strength', t.ms.toFixed(1)], ['Holder health', t.hh.toFixed(1)], ['Momentum', t.mom.toFixed(1)],
      ['Market cap', MC.fmtXrp(t.mcap) + ' XRP'], ['AMM TVL', MC.fmtXrp(t.tvl) + ' XRP'], ['Holders', String(t.holders)], ['24h / 7d', `${t.pro24h >= 0 ? '+' : ''}${t.pro24h}% / ${t.pro7d >= 0 ? '+' : ''}${t.pro7d}%`], ['Top-10 hold', t.top10 + '%'], ['LP burned', t.lp_burned + '%']];
    if (t.flags?.length) rows.push(['Signals', t.flags.map(f => MC.FLAG_WORDS[f] || f).join(' · ')]);
    let extra = null; if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(t.issuer || '') && /^[0-9A-Za-z]{3,40}$/.test(t.currency || '')) { extra = document.createElement('a'); extra.href = `https://xrpl.to/token/${t.issuer}-${t.currency}`; extra.target = '_blank'; extra.rel = 'noopener noreferrer'; extra.textContent = 'Open on xrpl.to ↗'; extra.style.cssText = 'display:inline-block;margin-top:8px;color:#ffc44d;min-height:32px'; }
    showCard(t.label, rows, FOOT, extra); }
  function showAlpha() { const d = ST.data; if (!d) return; const L = MC.alphaList(d, 15);
    const go = document.createElement('button'); go.type = 'button'; go.textContent = 'Take me to the Meme Circle'; go.style.cssText = 'display:block;width:100%;min-height:44px;margin-top:10px;border-radius:10px;border:1px solid #ffc44d;background:#2a1f08;color:#ffe6a8;font:700 14px system-ui;cursor:pointer';
    go.onclick = () => { closeCard(); const e = { x: gateP.x + Math.cos(mkt) * 8, z: gateP.z + Math.sin(mkt) * 8 }; if (window.__walkTo && window.__walkTo(e.x, e.z, { x: cen.x, z: cen.z })) window.__bcToast && window.__bcToast('CIRCLE OF XRPL MEMES · Kings Row and Degen Strip on Market Street, Grinder Yards and The Watchline behind.', '#ffc44d'); };
    showCard('ALPHA LIST · Top 15', L.map(t => [`#${t.rank} ${t.label}`, `${t.alpha.toFixed(1)} · ${MC.ZONES[t.q].name}`, hx(MC.ZONES[t.q].col)]), FOOT + ' Watchline tokens are left off the list.', go); }
  (window.__interactors = window.__interactors || []).push(p => {
    if (!ST.built || window.__burnTowerOpen) return null; let best = null, bd = 1e9;
    const db = Math.hypot(p.x - bill.x, p.z - bill.z); if (db < 9) { bd = db; best = { d: Math.max(0, db - 2), label: 'Read the ALPHA LIST', act: showAlpha }; }
    if (Math.hypot(p.x - cen.x, p.z - cen.z) > R + 10) return best;
    for (const q of placed) { const d = Math.hypot(p.x - q.x, p.z - q.z) - q.w * .7; if (d < 3.5 && d < bd) { bd = d; best = { d: Math.max(0, d), label: `Inspect ${q.t.label} · ${MC.ZONES[q.zone].name}`, act: () => inspect(q) }; } }
    return best; });
  (window.__mmHooks = window.__mmHooks || []).push((mm, sc, cw) => { if (!ST.built) return; const px = cen.x * sc, pz = cen.z * sc, rr = R * sc;
    MC.ORDER.forEach(id => { mm.fillStyle = hx(MC.ZONES[id].col) + '55'; mm.beginPath(); mm.moveTo(px, pz); mm.arc(px, pz, rr, A[id] - PI / 4, A[id] + PI / 4); mm.closePath(); mm.fill(); });
    mm.fillStyle = '#ffe6a8'; mm.font = Math.round(cw / 30) + 'px system-ui'; mm.textAlign = 'center'; mm.fillText('Meme Circle', px, pz + rr + 10);
    mm.fillStyle = '#ffc44d'; mm.fillRect(bill.x * sc - 2, bill.z * sc - 2, 4, 4); });
  (window.__tourHooks = window.__tourHooks || []).push(V3 => { const k = gateP; return [V3(k.x + Math.cos(mkt) * 70, 46, k.z + Math.sin(mkt) * 70), V3(cen.x, 30, cen.z), 'Circle of XRPL Memes: the top meme tokens as towers in four districts (Kings Row, Grinder Yards, Degen Strip, The Watchline). Data by xrpl.to'] });

  // ---- zone-local atmosphere: screen-edge tint + ambient sound, blended by where the player stands (never the global weather)
  const veil = document.createElement('div'); veil.id = 'mcVeil'; veil.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2;opacity:0;transition:none;mix-blend-mode:screen'; document.body.append(veil);
  const cur = { kings: 0, grinders: 0, watchline: 0, degens: 0 }; let veilKey = '';
  let snd = null;
  function sound(w) { const au = c.audio && c.audio(); if (!au || !au.AC || !au.master) return; const AC = au.AC;
    if (!snd) { snd = {}; const now = AC.currentTime;
      const bus = id => { const g = AC.createGain(); g.gain.value = 0; g.connect(au.master); snd[id] = { g, t: 0 }; return g; };
      { const g = bus('kings'), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.connect(g); for (const f of [220, 277.2, 329.6, 440]) { const o = AC.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = AC.createGain(); og.gain.value = .05; const l = AC.createOscillator(); l.frequency.value = .1 + f / 4000; const lg = AC.createGain(); lg.gain.value = .03; l.connect(lg).connect(og.gain); o.connect(og).connect(lp); o.start(now); l.start(now); } }
      { const g = bus('grinders'), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220; lp.connect(g); const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 49; const og = AC.createGain(); og.gain.value = .12; o.connect(og).connect(lp); o.start(now); }
      { const g = bus('watchline'), lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.connect(g); for (const f of [41, 41.6]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const og = AC.createGain(); og.gain.value = .12; o.connect(og).connect(lp); o.start(now); }
        const s = AC.createOscillator(); s.frequency.value = 700; const sl = AC.createOscillator(); sl.frequency.value = .22; const slg = AC.createGain(); slg.gain.value = 160; sl.connect(slg).connect(s.frequency); const sg = AC.createGain(); sg.gain.value = .012; s.connect(sg).connect(g); s.start(now); sl.start(now); }
      { bus('degens'); } }
    const now = AC.currentTime;
    for (const id of MC.ORDER) { const s = snd[id]; s.g.gain.setTargetAtTime((w[id] || 0) * (id === 'degens' ? .5 : .32), now, .4); }
    // one-shots while inside: Grinder Yards clanks, Degen Strip bass thump + slot bleeps
    if (w.grinders > .1 && now > snd.grinders.t) { snd.grinders.t = now + 1.1 + Math.random() * 2; const b = AC.createBufferSource(), n = AC.sampleRate * .25, buf = AC.createBuffer(1, n, AC.sampleRate), ch = buf.getChannelData(0); for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (n * .08));
      b.buffer = buf; const f = AC.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1800 + Math.random() * 1600; f.Q.value = 6; const g = AC.createGain(); g.gain.value = .5; b.connect(f).connect(g).connect(snd.grinders.g); b.start(now); }
    if (w.degens > .1 && now > snd.degens.t) { snd.degens.t = now + .5; const o = AC.createOscillator(), g = AC.createGain(); o.frequency.setValueAtTime(110, now); o.frequency.exponentialRampToValueAtTime(42, now + .18); g.gain.setValueAtTime(.55, now); g.gain.exponentialRampToValueAtTime(.001, now + .3); o.connect(g).connect(snd.degens.g); o.start(now); o.stop(now + .32);
      if (Math.random() < .3) { const b = AC.createOscillator(), bg = AC.createGain(); b.type = 'square'; b.frequency.value = [523, 587, 659, 784, 880][Math.floor(Math.random() * 5)]; bg.gain.setValueAtTime(.06, now + .25); bg.gain.exponentialRampToValueAtTime(.001, now + .45); b.connect(bg).connect(snd.degens.g); b.start(now + .25); b.stop(now + .46); } } }

  const tmpV = new THREE.Vector3(), PS = new THREE.Frustum(), PM = new THREE.Matrix4(), QS = new THREE.Sphere(new THREE.Vector3(cen.x, 50, cen.z), R + 110);
  (window.__preRender = window.__preRender || []).push((dt, t) => {
    const far = C.position.distanceTo(tmpV.set(cen.x, 0, cen.z)) > 1300;
    PS.setFromProjectionMatrix(PM.multiplyMatrices(C.projectionMatrix, C.matrixWorldInverse));   // whole-quarter frustum cull (its meshes skip per-mesh culling)
    const inView = !far && PS.intersectsSphere(QS); grp.visible = inView && !window.__burnTowerOpen; bill.g.visible = !window.__burnTowerOpen && C.position.distanceTo(tmpV.set(bill.x, 10, bill.z)) < 900;
    scaleU.value = (c.R ? c.R.domElement.height : 800) * .5 * C.projectionMatrix.elements[5];
    // where is the player? explore = the walker; otherwise only a low camera counts as "in" a district
    const exp = !window.__burnMode || window.__burnMode() === 'explore'; const p = exp && c.P ? c.P.pos : C.position;
    const w = (!far && !window.__burnTowerOpen && (exp || C.position.y < 60)) ? MC.zoneWeights(p.x, p.z, cen, a0, R) : { kings: 0, grinders: 0, watchline: 0, degens: 0 };
    const k = Math.min(1, dt * 1.6); for (const id of MC.ORDER) cur[id] += ((w[id] || 0) - cur[id]) * k;
    zoneW.set(cur.kings, cur.grinders, cur.watchline, cur.degens);
    // screen-edge tint (vignette) in the blended district colour
    const tot = cur.kings + cur.grinders + cur.watchline + cur.degens;
    if (tot > .01) { const col = [0, 0, 0]; for (const id of MC.ORDER) { const tn = MC.ZONES[id].tint; for (let j = 0; j < 3; j++) col[j] += tn[j] * cur[id] / tot; }
      const key = col.map(v => Math.round(v * 255)).join(','); if (key !== veilKey) { veilKey = key; veil.style.background = `radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 48%, rgba(${key},.14) 80%, rgba(${key},.27) 100%)`; } }
    veil.style.opacity = Math.min(1, tot).toFixed(3);
    if (tot > .01 || snd) try { sound(cur); } catch (e) {}
    if (!inView) return;
    // fireworks over Kings Row on green market days (reads the market mood; never sets it)
    const mood = window.__marketMood ? window.__marketMood() : null; fwOn.value += (((mood && mood.mood > 0) ? 1 : 0) - fwOn.value) * Math.min(1, dt);
    // cranes slew, searchlights sweep (and light the ground), police cruise the Watchline loop
    craneSpots.forEach((s, i) => { Qt.setFromAxisAngle(UP, Math.sin(t * .07 + s.ph) * 1.4 + s.ph); M4.compose(V.set(s.x, 0, s.z), Qt, SC.set(1, 1, 1)); cranes.setMatrixAt(i, M4); }); cranes.count = craneSpots.length; cranes.instanceMatrix.needsUpdate = true;
    beamPosts.forEach((b, i) => { const sw = Math.sin(t * .23 + b.ph), aa = A.watchline + sw * .7, rr = R * (.35 + .3 * (.5 + .5 * Math.sin(t * .17 + b.ph * 2))); const tx = cen.x + Math.cos(aa) * rr, tz = cen.z + Math.sin(aa) * rr;
      const top = V.set(b.x, 28, b.z), dir = tmpV.set(tx - b.x, -28, tz - b.z), L = dir.length(); dir.normalize(); Qt.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir); M4.compose(top, Qt, SC.set(1, L / 90, 1)); beams.setMatrixAt(i, M4); spots[i].set(tx, tz, 7 * L / 90 + 2, 0); });
    beams.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < NCAR; i++) { const q = along(t * 9 + i * loop.len / NCAR); Qt.setFromAxisAngle(UP, q.yaw); M4.compose(V.set(q.x, 0, q.z), Qt, SC.set(1, 1, 1)); cars.setMatrixAt(i, M4); bars.setMatrixAt(i, M4); }
    cars.instanceMatrix.needsUpdate = bars.instanceMatrix.needsUpdate = true;
  });

  apply(data); ST.built = true;
  // warm the quarter's ~11 shader programs now (same target as app.js's warm-up: the composer's read buffer), so turning toward
  // the quarter later does not hitch on first compile
  (async () => { const Rr = c.R; if (!Rr || !c.comp) return; const rt0 = Rr.getRenderTarget(), vis = grp.visible; grp.visible = true;
    try { Rr.setRenderTarget(c.comp.readBuffer); const pr = Rr.compileAsync ? Rr.compileAsync(grp, C, S) : Rr.compile(grp, C, S); grp.visible = vis; Rr.setRenderTarget(rt0); await pr; }
    catch (e) { grp.visible = vis; Rr.setRenderTarget(rt0); } })();
  // posts for the searchlights (static) + their colliders
  { const m = new THREE.InstancedMesh(new THREE.CylinderGeometry(.5, .8, 28, 8).translate(0, 14, 0), new THREE.MeshLambertMaterial({ color: 0x24262c }), 4); beamPosts.forEach((b, i) => { M4.compose(V.set(b.x, 0, b.z), Qt.identity(), SC.set(1, 1, 1)); m.setMatrixAt(i, M4); pushC({ x: b.x, z: b.z, r: .8, h: 28 }); }); grp.add(m); }
  // refresh every 30 min (the server refreshes hourly); a failed refresh keeps what is standing
  setInterval(async () => { const d = await load(); if (d) try { apply(d); } catch (e) { ST.error = String(e.message || e); } else if (!ST.enabled) { grp.visible = false; bill.g.visible = false; } }, 30 * 60e3);
  ST.ready = true;
  if (TEST) window.__memes = { ST, get data() { return ST.data; }, cen, a0, R, A, get placed() { return placed; }, bill: { x: bill.x, z: bill.z }, gate: gateP, grp, cur, veil, zoneAt: (x, z) => MC.zoneAt(x, z, cen, a0, R), weights: (x, z) => MC.zoneWeights(x, z, cen, a0, R),
    goto: id => { const a = id ? A[id] : mkt, r = id ? R * .5 : R + 6; return window.__walkTo && window.__walkTo(cen.x + Math.cos(a) * r, cen.z + Math.sin(a) * r, { x: cen.x, z: cen.z }); }, apply, inspect, showAlpha,
    stats: () => { let draws = 0, tris = 0; grp.traverse(o => { if ((o.isMesh || o.isPoints) && o.visible) { draws++; const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; tris += o.isPoints ? 0 : n * (o.isInstancedMesh ? o.count : 1); } }); return { draws, tris: Math.round(tris), towers: towers.count, clear: cen.clear }; } };
}

if (Q.get('memes') !== '0') (function wait(n = 0) {
  const c = window.__city;
  const lifeReady = !window.__cityLife || window.__cityLife.ready || n > 60;   // let citylife claim its lots (wind farm, power plant) first
  const hudSettled = !document.documentElement.classList.contains('hz-pre') || n > 70;   // build after the HUD's arrival (hud-zones.mjs), never during it
  if (c && c.S && c.C && c.U && c.colliders && window.__setBurnMode && lifeReady && hudSettled) {
    (async () => { let d = null; for (let k = 0; k < 12 && !d && ST.enabled; k++) { d = await load(); if (!d && ST.enabled) await new Promise(r => setTimeout(r, Math.min(120e3, 15e3 * (k + 1)))); }
      if (!d) return; try { init(c, d); } catch (e) { ST.error = String(e && e.stack || e).slice(0, 400); console.warn('memes circle disabled', e); } })();
  } else if (n < 300) setTimeout(() => wait(n + 1), 500);
})();
