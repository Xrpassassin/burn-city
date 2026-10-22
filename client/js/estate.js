// Burn City Estates: lake + shoreline, highway + bridge with instanced car lights, and a fenced "COMING SOON" construction lot.
// Cheap by design: one shader water disc (no reflection render target), merged/instanced geometry, ~14 draw calls total.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const box = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
// lake frame: depends only on the district nodes (+ avoid points), so the city layout can test it before the Estates are built
function lakeFrame(nodes, avoid = []) {
  // pick the emptiest direction: farthest (in angle) from every district tower and gate
  const pts = nodes.filter(n => n.pos && n.pos.length() > 60).map(n => Math.atan2(n.pos.z, n.pos.x)).concat(avoid.map(p => Math.atan2(p.z, p.x)));
  let best = 0, bestD = -1; for (let k = 0; k < 144; k++) { const a = k / 144 * Math.PI * 2 - Math.PI; let d = 9; for (const b of pts) d = Math.min(d, Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)); const back = window.__lakePref ?? -1.1, off = Math.abs(((a - back + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (off > 0.7) continue; d -= off * 0.15; if (d > bestD) { bestD = d; best = a; } }
  best = window.__lakePref ?? 0.35;
  const maxR = Math.max(0, ...nodes.filter(n => n.pos).map(n => n.pos.length() + (n.w || 6) * 2));
  const dir = new THREE.Vector3(Math.cos(best), 0, Math.sin(best)), side = new THREE.Vector3(-dir.z, 0, dir.x), yaw = Math.atan2(dir.x, dir.z);
  // on-ramp: starts ON the outer ring street of the district that faces the lake, then runs straight out (parallel to dir)
  const hub = nodes.filter(n => n.pos && !n.minor && n.distR).sort((a, b) => b.pos.dot(dir) - a.pos.dot(dir))[0];
  const cityEdge = hub ? hub.pos.clone().setY(0).addScaledVector(dir, hub.distR * 0.98) : dir.clone().multiplyScalar(maxR);
  // organic lake, long across the city->Estates axis: city shore on one side, Estates on the other
  const D = 78, Wd = 210, rho = a => 1 + 0.12 * Math.sin(3 * a + 1.3) + 0.07 * Math.sin(5 * a + 0.4) + 0.035 * Math.sin(9 * a + 2.1);
  const loc = (x, z, c) => { const dx = x - c.x, dz = z - c.z; return [dx * side.x + dz * side.z, dx * dir.x + dz * dir.z]; };
  const inside = (x, z, c, pad = 0) => { const [u, v] = loc(x, z, c), a = Math.atan2(v / D, u / Wd); return Math.hypot(u / (Wd + pad), v / (D + pad)) < rho(a); };
  const blockers = nodes.filter(n => n.pos).map(n => [n.pos.x, n.pos.z, (n.distR || n.w * 2 || 10) + 6]).concat(avoid.map(p => [p.x, p.z, 40]));
  let k0 = 6; for (; k0 < 400; k0 += 4) { const c = cityEdge.clone().addScaledVector(dir, k0 + D); if (!blockers.some(([x, z, r]) => inside(x, z, c, r))) break; }
  const lakeC = cityEdge.clone().addScaledVector(dir, k0 + D), nearV = D * rho(-Math.PI / 2), farV = D * rho(Math.PI / 2);
  return { best, maxR, dir, side, yaw, hub, cityEdge, D, Wd, rho, loc, inside, k0, lakeC, nearV, farV };
}
export function estateLake(nodes, avoid = []) { const f = lakeFrame(nodes, avoid); return (x, z, pad = 0) => f.inside(x, z, f.lakeC, pad); }
export function buildEstate({ S, U, pick, anim, nodes, low, avoid = [], colliders = [], streetMat = null, STRIP = null }) {
  const { best, maxR, dir, side, yaw, hub, cityEdge, D, Wd, rho, loc, inside, k0, lakeC, nearV, farV } = lakeFrame(nodes, avoid);
  const toNear = k0 + D - nearV, toFar = k0 + D + farV, lotC = cityEdge.clone().addScaledVector(dir, toFar + 26 + 65), WW = toFar - toNear, LR = Wd;
  // highway origin: shifted sideways (away from the docks) so it clears the hub district by >= 20 m, then traced back to the nearest ring street
  let HW_OFF = 0, roadO = cityEdge.clone(), hwJoin = null;
  if (hub) { const rings = nodes.filter(n => n.pos && !n.minor && n.distR && n !== hub).flatMap(n => (n.name === 'XRP' ? [40, 62] : [n.distR * 0.98, n.distR * 0.62]).map(r => [n, r]));
    const endA = lotC.clone().sub(cityEdge).dot(dir) - 70, near = cl => cl.r > 0 && Math.hypot(cl.x - hub.pos.x, cl.z - hub.pos.z) < hub.distR * 2.2;
    const clear = (o, z0) => { for (let z = z0; z < endA; z += 2) { const x = o.x + dir.x * z, y = o.z + dir.z * z; if (Math.hypot(x - hub.pos.x, y - hub.pos.z) < hub.distR + 22) return false; for (const cl of colliders) if (cl.r > 0 && Math.hypot(x - cl.x, y - cl.z) < cl.r + (near(cl) ? 22 : 8)) return false; } return true; };
    search: for (let L = hub.distR + 24; L < hub.distR + 120; L += 4) { const o = cityEdge.clone().addScaledVector(side, L);
      for (let b = 0; b <= 90; b += 0.5) { const q = o.clone().addScaledVector(dir, -b); for (const [n, r] of rings) if (Math.abs(Math.hypot(q.x - n.pos.x, q.z - n.pos.z) - r) < 0.6 && clear(o, -b)) { HW_OFF = L; roadO = q; hwJoin = n.name; break search; } } }
    if (!hwJoin) { HW_OFF = hub.distR + 26; roadO = cityEdge.clone().addScaledVector(side, HW_OFF); } }
  const G = new THREE.Group(); S.add(G);
  // ---------- lake: animated shader, fake shimmer + streaks of city light ----------
  // tower reflections: the NT towers that matter most from the lake, as vertical glowing columns the reflected ray can hit (no reflection render pass)
  const NT = low ? 0 : 10, NR = 8, NF = 6, V4 = () => new THREE.Vector4(0, 0, -99, 0);
  const TW = Array.from({ length: Math.max(1, NT) }, V4), TC = Array.from({ length: Math.max(1, NT) }, () => new THREE.Color(0, 0, 0)), RP = Array.from({ length: NR }, () => new THREE.Vector4(0, 0, -99, 0)), FS = Array.from({ length: NF }, () => new THREE.Vector4(0, 0, 0, 0));
  const water = new THREE.ShaderMaterial({ fog: true, transparent: true, depthWrite: false, defines: { NT, NR, NF }, uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), t: U.t, day: U.day, wet: U.wet, storm: U.storm || { value: 0 }, cdir: { value: new THREE.Vector2(-dir.x, -dir.z) }, lc: { value: new THREE.Vector2(lakeC.x, lakeC.z) }, ls: { value: new THREE.Vector2(side.x, side.z) }, ld: { value: new THREE.Vector2(dir.x, dir.z) },
      tw: { value: TW }, tcl: { value: TC }, rp: { value: RP }, fs: { value: FS }, mdir: { value: new THREE.Vector3(-300, 400, -500).normalize() } },
    vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vec4 mvPosition=modelViewMatrix*vec4(position,1.); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float t,day,wet,storm; uniform vec2 cdir,lc,ls,ld; uniform vec3 mdir; uniform vec4 rp[NR]; uniform vec4 fs[NF];
#if NT>0
uniform vec4 tw[NT]; uniform vec3 tcl[NT];
#endif
varying vec3 vW;
#include <fog_pars_fragment>
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
vec2 wv(vec2 d,float k,float a,float s,vec2 p){return d*k*a*cos(dot(d,p)*k+t*s);}
void main(){ vec2 q=vW.xz-lc; float uu=dot(q,ls)/210.0, vv=dot(q,ld)/78.0, aa=atan(vv,uu); float r=length(vec2(uu,vv))/(1.+.12*sin(3.*aa+1.3)+.07*sin(5.*aa+.4)+.035*sin(9.*aa+2.1)); vec2 p=vW.xz*.08;
  float w=n(p+vec2(t*.25,t*.18))*.6+n(p*2.3-vec2(t*.4,-t*.3))*.4;
  // surface slope: a few travelling waves (choppier in storms) + ripple rings from casts, bites, splashes and boat wakes + rain
  float ch=1.+storm*1.6+wet*.5; vec2 P=vW.xz, g=vec2(0);
  g+=wv(normalize(vec2(1.,.35)),.55,.05*ch,1.3,P); g+=wv(normalize(vec2(-.4,1.)),.9,.03*ch,1.9,P); g+=wv(normalize(vec2(.8,-.6)),1.7,.014*ch,2.7,P); g+=wv(normalize(vec2(-.9,-.2)),3.1,.007*ch,3.6,P);
  g+=(vec2(n(p*3.+t*.5),n(p*3.+vec2(5.2,1.3)-t*.45))-.5)*.08*ch;
  for(int i=0;i<NR;i++){ vec2 d=P-rp[i].xy; float rr=length(d), age=t-rp[i].z; if(age<0.||age>4.5) continue; float ph=rr-age*3.2; float env=exp(-ph*ph*.8)*exp(-age*.75)*rp[i].w; g+=d/max(rr,.05)*sin(ph*5.)*env*.9; }
  if(wet>.02){ vec2 gg=P*.45, ci=floor(gg), cf=fract(gg)-.5-(vec2(h(ci+3.1),h(ci+7.7))-.5)*.5; float ph=fract(t*1.1+h(ci)), d=length(cf); g+=cf/max(d,.01)*sin((d-ph*.45)*45.)*exp(-ph*4.)*(1.-smoothstep(0.,.12,abs(d-ph*.45)))*wet*.5; }
  vec3 N=normalize(vec3(-g.x,1.,-g.y)), V=normalize(vW-cameraPosition), R=reflect(V,N); R.y=abs(R.y)+.02;
  float fr=.03+.97*pow(1.-max(dot(-V,N),0.),5.);
  vec3 deep=mix(vec3(.04,.2,.36),vec3(.1,.4,.6),day), col=(deep+vec3(.04,.12,.16)*w)*mix(.42,.72,day);
  // fish shadows under the surface (driven by the fishing game)
  for(int i=0;i<NF;i++){ if(fs[i].w<=0.) continue; vec2 d=P-fs[i].xy; float c=cos(fs[i].z),s=sin(fs[i].z); vec2 l=vec2(c*d.x+s*d.y,-s*d.x+c*d.y)/fs[i].w; float b=length(vec2(l.x*1.,l.y*2.6)); col*=1.-.55*(1.-smoothstep(.35,1.,b))*(1.-fr); }
  float across=dot(vW.xz,vec2(-cdir.y,cdir.x));
  vec3 lights=vec3(1.,.55,.2)*pow(max(0.,sin(across*.35+w*3.)),18.)*smoothstep(.2,1.,w)*.4 + vec3(.3,.6,1.)*pow(max(0.,sin(across*.21+1.7+w*2.)),24.)*.25;
  // reflected sky (fog colour is the horizon), moon glint, and the city's towers
  vec3 sky=mix(fogColor*1.35+vec3(.01,.02,.05),fogColor*.5+vec3(.0,.01,.03)*(1.-day),clamp(R.y*1.8,0.,1.));
  vec3 refl=sky+vec3(.75,.85,1.)*(pow(max(dot(R,mdir),0.),400.)*1.4+pow(max(dot(R,mdir),0.),40.)*.035)*(1.-day*.8)*(1.-storm*.7);
#if NT>0
  vec2 Rx=R.xz; float rl=max(dot(Rx,Rx),1e-4);
  for(int i=0;i<NT;i++){ vec2 T=tw[i].xy-P; float s=dot(T,Rx)/rl; if(s<=0.) continue; float dd=length(P+Rx*s-tw[i].xy), y=R.y*s, hh=tw[i].z, rad=tw[i].w;
    float m=(1.-smoothstep(rad*.3,rad,dd))*smoothstep(-1.,4.,y)*(1.-smoothstep(hh*.7,hh,y))/(1.+s*.004); refl+=tcl[i]*m*(.75+.25*sin(y*.9+t*1.5+float(i)))*1.7*(1.-day*.55); }
#endif
  refl=min(refl,vec3(.95));
  col=mix(col,refl,clamp(fr*1.2+.12,0.,.9))+lights*.6*(1.-day*.7)*(1.-fr*.5);
  col+=vec3(.6,.8,1.)*pow(n(p*6.+t*.6),12.)*.25;col=min(col,vec3(1.1));
  col=mix(col,vec3(.12,.45,.55),smoothstep(.92,1.,r)*.5); gl_FragColor=vec4(col,1.);
#include <fog_fragment>
 gl_FragColor.rgb=mix(gl_FragColor.rgb,col,.9);
}` });
  // keep tower reflections in step with the live tower shapes (heights + footprints ease as market cap / TVL move)
  if (NT) { const cand = nodes.filter(n => n.pos && n.name !== 'XRP' && n.col).map(n => ({ n, d: Math.max(30, n.pos.distanceTo(lakeC)) }));
    const upd = () => { const L = cand.map(o => { const hy = o.n.top || o.n.h || 20, wx = o.n.w || 6; return { o, hy, wx, sc: hy / o.d } }).sort((a, b) => b.sc - a.sc).slice(0, NT);
      for (let i = 0; i < NT; i++) { const e = L[i]; if (!e) { TW[i].set(0, 0, -99, 0); continue } TW[i].set(e.o.n.pos.x, e.o.n.pos.z, e.hy, Math.max(2.5, e.wx * .55)); TC[i].copy(e.o.n.col).multiplyScalar(.85) } };
    upd(); let k = 0; anim && anim.push(() => { if (++k % 45 === 0) upd() }) }
  let rpI = 0; window.__lakeRipple = (x, z, amp = 1) => { const v = RP[rpI]; rpI = (rpI + 1) % NR; v.set(x, z, U.t.value, Math.min(2, amp)) };
  window.__lakeFish = FS; window.__water = water;
  const NS = low ? 64 : 120, ring = (k, sc = 1) => { const pts = []; for (let i = 0; i < NS; i++) { const a = i / NS * Math.PI * 2, rr = rho(a) * sc; pts.push(new THREE.Vector2(Math.cos(a) * Wd * rr + Math.sign(Math.cos(a)) * k, Math.sin(a) * D * rr + Math.sign(Math.sin(a)) * k)); } return pts; };
  const toWorld = g => { const P = g.attributes.position; for (let i = 0; i < P.count; i++) { const u = P.getX(i), v = P.getY(i); P.setXYZ(i, lakeC.x + side.x * u + dir.x * v, 0, lakeC.z + side.z * u + dir.z * v); } g.computeBoundingSphere(); return g; };
  const lakeShape = new THREE.Shape(ring(0)), shoreShape = new THREE.Shape(ring(11)), edgeShape = new THREE.Shape(ring(1.2)); edgeShape.holes.push(new THREE.Path(ring(-0.6)));
  const lake = new THREE.Mesh(toWorld(new THREE.ShapeGeometry(lakeShape)), water); lake.position.y = 0.22; lake.renderOrder = 2; G.add(lake);
  const shore = new THREE.Mesh(toWorld(new THREE.ShapeGeometry(shoreShape)), new THREE.MeshBasicMaterial({ color: 0x4a3e2c, side: THREE.DoubleSide, fog: false, transparent: true, depthWrite: false })); shore.position.y = 0.18; shore.renderOrder = 1; G.add(shore);
  const edge = new THREE.Mesh(toWorld(new THREE.ShapeGeometry(edgeShape)), new THREE.MeshBasicMaterial({ color: 0x6fe8ff, transparent: true, opacity: 0.75, fog: false, side: THREE.DoubleSide })); edge.position.y = 0.26; G.add(edge);
  lake.material.side = THREE.DoubleSide;
  // ---------- highway + bridge (one merged mesh) + guide-light strip ----------
  const bridgeH = 3, RL = 16, seg = [];   // road along +z in local space; constant height, gentle ramps only at the bridge
  const roadLen = lotC.clone().sub(roadO).dot(dir) - 70, Y0 = streetMat ? -0.05 : 0.2; let w0 = -1, w1 = -1; for (let z = 0; z < roadLen; z += 1) { const q = roadO.clone().addScaledVector(dir, z); if (inside(q.x, q.z, lakeC, 0)) { if (w0 < 0) w0 = z; w1 = z; } }
  const toLake0 = (w0 < 0 ? toNear : w0) - 6, toLake1 = (w1 < 0 ? toFar : w1) + 6;
  const YL = streetMat ? 0.1 : Y0 + 0.15, ys = z => z < toLake0 - RL || z > toLake1 + RL ? YL : z < toLake0 ? Y0 + 0.15 + (z - toLake0 + RL) / RL * bridgeH : z > toLake1 ? Y0 + 0.15 + (toLake1 + RL - z) / RL * bridgeH : Y0 + 0.15 + bridgeH;
  const flat = (z0, z1, y) => seg.push(box(14, 0.3, z1 - z0, 0, y, (z0 + z1) / 2));
  const ramp = (z0, z1, up) => { const len = Math.hypot(z1 - z0, bridgeH), g = new THREE.BoxGeometry(14, 0.3, len); g.rotateX((up ? -1 : 1) * Math.atan2(bridgeH, z1 - z0)); seg.push(g.translate(0, Y0 + bridgeH / 2, (z0 + z1) / 2)); };
  if (!streetMat) { flat(0, toLake0 - RL, Y0); flat(toLake1 + RL, roadLen, Y0); if (HW_OFF) seg.push(box(HW_OFF + 7, 0.3, 14, HW_OFF / 2, Y0, roadLen - 7)); }   // with the shared street look the land sections are flat street strips at ground level
  ramp(toLake0 - RL, toLake0, true); flat(toLake0, toLake1, Y0 + bridgeH); ramp(toLake1, toLake1 + RL, false);   // turn-in toward the lot
  for (let z = toLake0 + 14; z < toLake1 - 8; z += 22) { seg.push(box(1.4, bridgeH, 1.4, -5.5, bridgeH / 2, z)); seg.push(box(1.4, bridgeH, 1.4, 5.5, bridgeH / 2, z)); }
  for (const [z0, z1, up] of [[toLake0 - RL, toLake0, true], [toLake1, toLake1 + RL, false]]) for (const sx of [-7, 7]) { const len = Math.hypot(z1 - z0, bridgeH), g = new THREE.BoxGeometry(0.4, 1.1, len); g.rotateX((up ? -1 : 1) * Math.atan2(bridgeH, z1 - z0)); seg.push(g.translate(sx, Y0 + bridgeH / 2 + 0.7, (z0 + z1) / 2)); }   // side rails follow the ramps too
  seg.push(box(0.4, 1.1, toLake1 - toLake0, -7, Y0 + bridgeH + 0.7, (toLake0 + toLake1) / 2)); seg.push(box(0.4, 1.1, toLake1 - toLake0, 7, Y0 + bridgeH + 0.7, (toLake0 + toLake1) / 2));
  if (!streetMat) { const mk = []; for (let z = 4; z < roadLen; z += 6) mk.push(box(0.25, 0.05, 2.4, 0, ys(z) + 0.02, z)); seg.push(...mk.map(g => g)); }
  if (streetMat && STRIP) {   // same asphalt/curb/sidewalk/neon shader as the city streets; starts at the ring's asphalt edge (T-junction), follows ramps and bridge
    const P = [], UVs = [], IX = [], pts = [], W = (k) => new THREE.Vector3(roadO.x + dir.x * k, 0, roadO.z + dir.z * k);
    for (let z = 2.5; z <= roadLen; z += 2) pts.push(W(z).setY(ys(z) + 0.02)); STRIP(pts, false, 9.6, P, UVs, IX);
    if (HW_OFF) { const e0 = W(roadLen - 4.8), lp = []; for (let x = 2.5; x <= HW_OFF + 4; x += 2) lp.push(e0.clone().addScaledVector(side, -x).setY(0.1)); STRIP(lp, false, 9.6, P, UVs, IX); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(UVs, 2)); g.setIndex(IX);
    const hm = new THREE.Mesh(g, streetMat); hm.frustumCulled = false; G.add(hm);
    // bridge guard (explore mode): invisible side walls on the raised deck/ramps + safety respawn at the nearest bridge end if the walker ends up below the deck / in the water
    let onB = false;
    window.__hwGuard = (Pp, vel) => { const dx = Pp.x - roadO.x, dz = Pp.z - roadO.z, al = dx * dir.x + dz * dir.z, lt = dx * side.x + dz * side.z, zone = al > toLake0 - RL - 1 && al < toLake1 + RL + 1, dy = ys(al) + 0.15;
      if (zone && dy > 1 && Math.abs(lt) < 14 && Pp.y >= dy - 1 && Pp.y < dy + 14) {   // on / just above the raised deck: clamp inside the rails
        onB = true; if (Math.abs(lt) > 6.45) { const k = Math.sign(lt) * 6.45 - lt; Pp.x += side.x * k; Pp.z += side.z * k; if (vel) { const vl = vel.x * side.x + vel.z * side.z; if (vl * Math.sign(lt) > 0) { vel.x -= side.x * vl; vel.z -= side.z * vl } } } return false }
      if ((onB && zone && dy > 1 && Pp.y < dy - 2.2 && Math.abs(lt) < 14) || (zone && Math.abs(lt) < 9 && Pp.y < -1)) {   // fell through / below the deck -> nearest bridge end
        onB = false; const end = al < (toLake0 + toLake1) / 2 ? toLake0 - RL - 3 : toLake1 + RL + 3; Pp.set(roadO.x + dir.x * end, 0.1, roadO.z + dir.z * end); if (vel) vel.set(0, 0, 0); return true }
      if (onB && !(zone && dy > 1)) onB = false; return false };
    window.__hwDeck = (x, z) => { const dx = x - roadO.x, dz = z - roadO.z, al = dx * dir.x + dz * dir.z, lat = Math.abs(dx * side.x + dz * side.z); return al > toLake0 - RL && al < toLake1 + RL && lat < 7 ? ys(al) + 0.15 : null }; }
  const road = new THREE.Mesh(mergeGeometries(seg), new THREE.MeshLambertMaterial({ color: 0x2a2d38 })); road.position.copy(roadO); road.rotation.y = yaw; G.add(road);
  // lamp posts as glowing dots along both rails
  const lamps = []; for (let z = 4; z < roadLen; z += 16) for (const x of [-7.4, 7.4]) lamps.push(x, ys(z) + 3.2, z);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  const lampP = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffc070, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); lampP.position.copy(roadO); lampP.rotation.y = yaw; G.add(lampP);
  // cars: two instanced point-pairs (white heads toward the lot, red tails going back to the city)
  const NC = low ? 18 : 40, cars = []; for (let i = 0; i < NC; i++) cars.push({ u: Math.random(), sp: 0.035 + Math.random() * 0.03, lane: i % 2 });
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false }), NC * 2), tail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), NC * 2);
  head.frustumCulled = tail.frustumCulled = false; const carG = new THREE.Group(); carG.position.copy(roadO); carG.rotation.y = yaw; carG.add(head, tail); G.add(carG);
  const M = new THREE.Matrix4();
  anim.push((t, dt = 1 / 60) => { let hi = 0, ti = 0; for (const c of cars) { c.u = (c.u + c.sp * dt * 0.6) % 1; const out = c.lane === 0, z = (out ? c.u : 1 - c.u) * roadLen, x = out ? 3.5 : -3.5, y = ys(z) + 0.4, f = out ? 1 : -1;
      // a car facing +z shows white heads in front (+z) and red tails behind; cars going back show the opposite
      head.setMatrixAt(hi++, M.makeTranslation(x - 0.7, y, z + 1.6 * f)); head.setMatrixAt(hi++, M.makeTranslation(x + 0.7, y, z + 1.6 * f));
      tail.setMatrixAt(ti++, M.makeTranslation(x - 0.7, y, z - 1.6 * f)); tail.setMatrixAt(ti++, M.makeTranslation(x + 0.7, y, z - 1.6 * f)); }
    head.instanceMatrix.needsUpdate = tail.instanceMatrix.needsUpdate = true; });
  // ---------- Waterfront Estates district: compact geometry, four distinct homes, landscaped plots ----------
  const LW = 230, LD = 180, lot = new THREE.Group(); lot.position.copy(lotC); lot.rotation.y = yaw; G.add(lot);
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), new THREE.MeshLambertMaterial({ color: 0x394536 }));
  dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.06; lot.add(dirt);
  const roadBits = [], paths = [], foundations = [], walls = [], roofs = [], glass = [], trim = [], greenery = [], trunks = [], canopies = [];
  const addBox = (arr,w,h,d,x,y,z,ry=0) => arr.push(box(w,h,d,x,y,z,ry));
  // A small internal street grid links every driveway to the bridge approach.
  addBox(roadBits, 10, .16, LD-18, 0, .14, 2);
  addBox(roadBits, LW-18, .16, 8, 0, .14, -35);
  addBox(roadBits, LW-18, .16, 8, 0, .14, 38);
  for (const x of [-62,62]) addBox(roadBits, 5, .12, 31, x, .18, 1);
  // Curbs/sidewalks flank the boulevard and cross streets.
  for (const x of [-6.2,6.2]) addBox(paths,.5,.22,LD-18,x,.22,2);
  for (const z of [-40,-30,33,43]) addBox(paths,LW-18,.18,1.1,0,.2,z);
  // Five visible housing tiers, ordered from the city-facing entrance toward the lake.
  // These are environmental models only; purchasing, rent, interiors, and ownership need a separate economy/player-system integration.
  const homes = [
    {tier:'trailer',x:-82,z:-57,w:24,d:12,h:3.4,roof:0x303b4c,wall:0xb7a58c},
    {tier:'trailer',x:-50,z:-57,w:24,d:12,h:3.4,roof:0x3d4147,wall:0xc7c1b4},
    {tier:'apartment',x:31,z:-57,w:40,d:27,h:14,roof:0x303945,wall:0xb8bec0},
    {tier:'starter',x:-72,z:-10,w:27,d:20,h:7,roof:0x26394a,wall:0xc6d0d0},
    {tier:'starter',x:72,z:-10,w:27,d:20,h:7,roof:0x4a3d34,wall:0xd9d0c1},
    {tier:'family',x:-72,z:30,w:34,d:24,h:9,roof:0x303b4c,wall:0xc8c7bd},
    {tier:'family',x:72,z:30,w:34,d:24,h:9,roof:0x3d4147,wall:0xd8c7ac},
    {tier:'mansion',x:-65,z:66,w:43,d:27,h:12,roof:0x26394a,wall:0xc6d0d0},
    {tier:'mansion',x:65,z:66,w:43,d:27,h:12,roof:0x4a3d34,wall:0xd9d0c1}
  ];
  for (let i=0;i<homes.length;i++) {
    const h=homes[i], front=h.z+h.d/2;
    const isTrailer=h.tier==='trailer', isApartment=h.tier==='apartment', isMansion=h.tier==='mansion';
    // Larger plots and architectural mass scale with the housing tier.
    const yardPad=isTrailer?2:isApartment?3:isMansion?9:5;
    addBox(foundations,h.w+yardPad*2,.4,h.d+yardPad*2,h.x,.3,h.z);
    addBox(walls,h.w,h.h,h.d,h.x,h.h/2+.5,h.z);
    // Trailer roofs are low and pitched-looking; other tiers use clean flat roof silhouettes.
    if (isTrailer) {
      addBox(roofs,h.w+1,.45,h.d+1,h.x,h.h+.45,h.z);
      // Small dark wheel pairs make the compact manufactured-home silhouette read clearly.
      for (const wx of [-h.w*.31,h.w*.31]) {
        const wheel=new THREE.CylinderGeometry(.62,.62,.32,8); wheel.rotateZ(Math.PI/2); wheel.translate(h.x+wx,.72,h.z+h.d*.34); foundations.push(wheel);
        const wheel2=new THREE.CylinderGeometry(.62,.62,.32,8); wheel2.rotateZ(Math.PI/2); wheel2.translate(h.x+wx,.72,h.z-h.d*.34); foundations.push(wheel2);
      }
      addBox(glass,4.2,1.3,.14,h.x-h.w*.27,2.2,front+.08);
      addBox(glass,4.2,1.3,.14,h.x+h.w*.05,2.2,front+.08);
      addBox(glass,3.2,1.3,.14,h.x+h.w*.32,2.2,front+.08);
      addBox(trim,3.2,2.5,.18,h.x-h.w*.3,1.65,front+.1);
    } else if (isApartment) {
      addBox(roofs,h.w+1.5,.8,h.d+1.5,h.x,h.h+.9,h.z);
      // Repeated windows and balcony bands suggest a low-rise multi-unit building without individual draw calls.
      for (let floor=0;floor<3;floor++) {
        const wy=2.7+floor*3.7;
        for (let col=0;col<5;col++) {
          const wx=h.x-h.w*.38+col*h.w*.19;
          addBox(glass,4.2,2.0,.16,wx,wy,front+.12);
          addBox(trim,4.7,.16,.3,wx,wy-1.2,front+.22);
        }
      }
      addBox(glass,5,3,.18,h.x,2.1,front+.14);
      addBox(trim,h.w*.72,.35,.4,h.x,10.2,front+.22);
    } else {
      addBox(roofs,h.w+(isMansion?3:1.8),isMansion?1.5:1.0,h.d+(isMansion?3:1.8),h.x,h.h+1.0,h.z);
      // Mansion wings and a raised central roofline distinguish premium lakefront architecture.
      if (isMansion) {
        addBox(walls,h.w*.34,h.h*.62,h.d*.48,h.x,h.h*.31+h.h+.25,h.z-h.d*.08);
        addBox(roofs,h.w*.39,.9,h.d*.54,h.x,h.h*.62+h.h+.75,h.z-h.d*.08);
      }
      for (const sx of [-.34,-.12,.12,.34]) {
        addBox(glass,h.w*.15,2.6,.16,h.x+h.w*sx,3.0,front+.12);
        addBox(glass,h.w*.15,1.0,.16,h.x+h.w*sx,6.1,front+.12);
      }
      addBox(glass,isMansion?8:5.5,isMansion?4:3.2,.18,h.x+h.w*.22,2.5,front+.14);
      addBox(trim,h.w*(isMansion?.62:.48),.28,.35,h.x,5.0,front+.25);
    }
    // Driveway paths lead from each home toward the internal street grid.
    addBox(paths,isTrailer?5:isApartment?9:isMansion?12:8,.12,isTrailer?8:isApartment?10:isMansion?14:11,h.x, .24, front+(isTrailer?5:isApartment?6:isMansion?11:9));
    // Private planting; premium plots receive a wider landscape buffer.
    for (const s of [-1,1]) {
      addBox(greenery,isMansion?8:5,.6,2.2,h.x+s*(h.w/2+1.2),.35,h.z);
      for (const dz of [-h.d/2-5,h.d/2+5]) {
        const tx=h.x+s*(h.w/2+(isMansion?8:5)), tz=h.z+dz;
        addBox(trunks,.7,4,.7,tx,2.1,tz);
        const crown=new THREE.ConeGeometry(isMansion?3.2:2.7,isMansion?7:6,5); crown.translate(tx,isMansion?7.2:6.8,tz); canopies.push(crown);
      }
    }
  }
  const merged = (bits, material) => { if (!bits.length) return null; const g=mergeGeometries(bits); const m=new THREE.Mesh(g,material); lot.add(m); return m; };
  merged(roadBits,new THREE.MeshLambertMaterial({color:0x252a32}));
  merged(paths,new THREE.MeshLambertMaterial({color:0xaaa99f}));
  merged(foundations,new THREE.MeshLambertMaterial({color:0x777b7b}));
  merged(walls,new THREE.MeshLambertMaterial({color:0xbab9b1}));
  merged(roofs,new THREE.MeshLambertMaterial({color:0x303945}));
  merged(glass,new THREE.MeshBasicMaterial({color:0x79d8ed,transparent:true,opacity:.78}));
  merged(trim,new THREE.MeshLambertMaterial({color:0xffb75b}));
  merged(greenery,new THREE.MeshLambertMaterial({color:0x385d3c}));
  merged(trunks,new THREE.MeshLambertMaterial({color:0x57402b}));
  if (canopies.length) merged(canopies,new THREE.MeshLambertMaterial({color:0x2e7548}));
  // Boulevard lighting: one merged pole mesh plus low-cost glowing point markers.
  const poles=[], lights=[];
  for (let z=-LD/2+15;z<LD/2-5;z+=22) for (const x of [-8.5,8.5]) {
    addBox(poles,.28,5,.28,x,2.6,z);
    lights.push(x,5.2,z);
  }
  merged(poles,new THREE.MeshLambertMaterial({color:0x303640}));
  const lampGeo=new THREE.BufferGeometry(); lampGeo.setAttribute('position',new THREE.Float32BufferAttribute(lights,3));
  lot.add(new THREE.Points(lampGeo,new THREE.PointsMaterial({color:0xffc777,size:2.1,transparent:true,opacity:.95,depthWrite:false,blending:THREE.AdditiveBlending})));
  // Entrance sign faces the city; no giant construction billboard blocking the waterfront view.
  const cv=document.createElement('canvas'); cv.width=1024; cv.height=384; const cx=cv.getContext('2d');
  cx.fillStyle='#101b24'; cx.fillRect(0,0,1024,384); cx.strokeStyle='#ffb45b'; cx.lineWidth=12; cx.strokeRect(9,9,1006,366);
  cx.textAlign='center'; cx.shadowColor='#ff9a36'; cx.shadowBlur=22; cx.fillStyle='#ffe0a2';
  cx.font='900 106px system-ui,-apple-system,sans-serif'; cx.fillText('BURN CITY ESTATES',512,170);
  cx.shadowBlur=8; cx.fillStyle='#c5f2ff'; cx.font='700 48px system-ui,-apple-system,sans-serif'; cx.fillText('LAKEFRONT RESIDENCES',512,258);
  const tex=new THREE.CanvasTexture(cv); tex.anisotropy=4;
  const signM=new THREE.MeshBasicMaterial({map:tex,fog:false,toneMapped:false,side:THREE.DoubleSide});
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(74,28),signM); sign.position.set(0,17,-LD/2+8); sign.rotation.y=Math.PI; lot.add(sign);
  merged([box(1.4,18,1.4,-27,9,-LD/2+8),box(1.4,18,1.4,27,9,-LD/2+8)],new THREE.MeshLambertMaterial({color:0x303640}));
  const hitM=new THREE.Mesh(new THREE.BoxGeometry(LW,24,LD),new THREE.MeshBasicMaterial({visible:false}));
  hitM.position.y=12; hitM.userData={kind:'estate',label:'Burn City Estates'}; lot.add(hitM); pick.push(hitM);
  anim.push(t=>{signM.color.setScalar(.9+.1*Math.sin(t*1.2))});
  return { lakeC, lotC, maxR, dir, side, D, Wd, rho, inLake: (x, z, pad = 0) => inside(x, z, lakeC, pad), cityEdge, yaw, toNear, toFar, roadO, roadLen, hwJoin, hwOff: HW_OFF };
}
export const estateCard = () => `<button class="x" aria-label="Close">✕</button><h2 style="color:#ffb040">🏗 Burn City Estates</h2><p><b>Coming soon.</b></p>`;
