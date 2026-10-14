// Burn City Estates: lake + shoreline, highway + bridge with instanced car lights, and a fenced "COMING SOON" properties lot.
// Cheap by design: one shader water disc (no reflection render target), merged/instanced geometry, ~14 draw calls total.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const box = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
export function buildEstate({ S, U, pick, anim, nodes, low, avoid = [] }) {
  // pick the emptiest direction: farthest (in angle) from every district tower and gate
  const pts = nodes.filter(n => n.pos && n.pos.length() > 60).map(n => Math.atan2(n.pos.z, n.pos.x)).concat(avoid.map(p => Math.atan2(p.z, p.x)));
  let best = 0, bestD = -1; for (let k = 0; k < 144; k++) { const a = k / 144 * Math.PI * 2 - Math.PI; let d = 9; for (const b of pts) d = Math.min(d, Math.abs(((a - b + Math.PI * 3) % (Math.PI * 2)) - Math.PI)); const back = Math.atan2(-350, -300), off = Math.abs(((a - back + Math.PI * 3) % (Math.PI * 2)) - Math.PI); if (off > 0.7) continue; d -= off * 0.15; if (d > bestD) { bestD = d; best = a; } }
  const maxR = Math.max(0, ...nodes.filter(n => n.pos).map(n => n.pos.length() + (n.w || 6) * 2));
  const dir = new THREE.Vector3(Math.cos(best), 0, Math.sin(best)), side = new THREE.Vector3(-dir.z, 0, dir.x), yaw = Math.atan2(dir.x, dir.z);
  const LR = 78, lakeC = dir.clone().multiplyScalar(maxR + 40 + LR), lotC = dir.clone().multiplyScalar(maxR + 40 + LR * 2 + 85), cityEdge = dir.clone().multiplyScalar(maxR + 8);
  const G = new THREE.Group(); S.add(G);
  // ---------- lake: animated shader, fake shimmer + streaks of city light ----------
  const water = new THREE.ShaderMaterial({ fog: true, transparent: false, uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), t: U.t, day: U.day, cdir: { value: new THREE.Vector2(-dir.x, -dir.z) } },
    vertexShader: `varying vec2 vP; varying vec3 vW;
#include <fog_pars_vertex>
void main(){ vP=position.xy; vec4 mvPosition=modelViewMatrix*vec4(position,1.); vW=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*mvPosition;
#include <fog_vertex>
}`,
    fragmentShader: `uniform float t,day; uniform vec2 cdir; varying vec2 vP; varying vec3 vW;
#include <fog_pars_fragment>
float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
void main(){ float r=length(vP)/${LR.toFixed(1)}; vec2 p=vW.xz*.08;
  float w=n(p+vec2(t*.25,t*.18))*.6+n(p*2.3-vec2(t*.4,-t*.3))*.4;
  vec3 deep=mix(vec3(.01,.03,.08),vec3(.08,.22,.35),day), col=deep+vec3(.02,.05,.08)*w;
  float along=dot(normalize(vW.xz+vec2(1e-3)),cdir); float across=dot(vW.xz,vec2(-cdir.y,cdir.x));
  float streak=pow(max(0.,sin(across*.35+w*3.)),18.)*smoothstep(.2,1.,w)*(1.-day*.7);          // broken vertical streaks of city light
  col+=vec3(1.,.55,.2)*streak*.55 + vec3(.3,.6,1.)*pow(max(0.,sin(across*.21+1.7+w*2.)),24.)*.35*(1.-day*.7);
  col+=vec3(.6,.8,1.)*pow(n(p*6.+t*.6),12.)*.6;                                                   // sparkle shimmer
  col=mix(col,vec3(.05,.1,.12),smoothstep(.9,1.,r)*.6); gl_FragColor=vec4(col,1.);
#include <fog_fragment>
}` });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(LR, low ? 40 : 72), water); lake.rotation.x = -Math.PI / 2; lake.position.set(lakeC.x, 0.06, lakeC.z); lake.renderOrder = 1; G.add(lake);
  const shore = new THREE.Mesh(new THREE.RingGeometry(LR - 0.5, LR + 7, low ? 40 : 72), new THREE.MeshLambertMaterial({ color: 0x3a3226 })); shore.rotation.x = -Math.PI / 2; shore.position.set(lakeC.x, 0.05, lakeC.z); G.add(shore);
  const edge = new THREE.Mesh(new THREE.RingGeometry(LR - 0.6, LR + 0.2, low ? 40 : 72), new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.35 })); edge.rotation.x = -Math.PI / 2; edge.position.set(lakeC.x, 0.08, lakeC.z); G.add(edge);
  // ---------- highway + bridge (one merged mesh) + guide-light strip ----------
  const L = cityEdge.distanceTo(lotC) - 60, mid = cityEdge.clone().lerp(lotC, 0.5).add(dir.clone().multiplyScalar(-30)), bridgeH = 3;
  const seg = [];   // road along +z in local space, then rotated to world
  const toLake0 = lakeC.distanceTo(cityEdge) - LR - 6, toLake1 = toLake0 + LR * 2 + 12;
  seg.push(box(14, 0.3, toLake0, 0, 0.15, toLake0 / 2));                                    // road to the shore
  seg.push(box(14, 0.6, toLake1 - toLake0, 0, bridgeH, (toLake0 + toLake1) / 2));            // bridge deck
  for (const z of [toLake0, toLake1]) seg.push(box(14, 0.4, 12, 0, bridgeH / 2, z, 0).rotateX(0));   // ramps (flat approximation)
  for (let z = toLake0 + 14; z < toLake1 - 8; z += 22) { seg.push(box(1.4, bridgeH, 1.4, -5.5, bridgeH / 2, z)); seg.push(box(1.4, bridgeH, 1.4, 5.5, bridgeH / 2, z)); }
  seg.push(box(0.4, 1.1, toLake1 - toLake0, -7, bridgeH + 0.8, (toLake0 + toLake1) / 2)); seg.push(box(0.4, 1.1, toLake1 - toLake0, 7, bridgeH + 0.8, (toLake0 + toLake1) / 2));
  const roadLen = cityEdge.distanceTo(lotC) - 70; seg.push(box(14, 0.3, roadLen - toLake1, 0, 0.15, (toLake1 + roadLen) / 2));
  const road = new THREE.Mesh(mergeGeometries(seg), new THREE.MeshLambertMaterial({ color: 0x23252e })); road.position.copy(cityEdge); road.rotation.y = yaw; G.add(road);
  const yOf = z => z > toLake0 - 6 && z < toLake1 + 6 ? bridgeH + 0.35 + (z < toLake0 + 6 ? (z - toLake0 + 6) / 12 - 1 : z > toLake1 - 6 ? (toLake1 + 6 - z) / 12 - 1 : 0) * bridgeH : 0.35;
  const ys = z => Math.max(0.35, yOf(z));
  // lamp posts as glowing dots along both rails
  const lamps = []; for (let z = 4; z < roadLen; z += 16) for (const x of [-7.4, 7.4]) lamps.push(x, ys(z) + 3.2, z);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  const lampP = new THREE.Points(lg, new THREE.PointsMaterial({ color: 0xffc070, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })); lampP.position.copy(cityEdge); lampP.rotation.y = yaw; G.add(lampP);
  // cars: two instanced point-pairs (white heads toward the lot, red tails going back to the city)
  const NC = low ? 18 : 40, cars = []; for (let i = 0; i < NC; i++) cars.push({ u: Math.random(), sp: 0.035 + Math.random() * 0.03, lane: i % 2 });
  const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 6, 4), new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: false }), NC * 2), tail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), NC * 2);
  head.frustumCulled = tail.frustumCulled = false; const carG = new THREE.Group(); carG.position.copy(cityEdge); carG.rotation.y = yaw; carG.add(head, tail); G.add(carG);
  const M = new THREE.Matrix4();
  anim.push((t, dt = 1 / 60) => { let hi = 0, ti = 0; for (const c of cars) { c.u = (c.u + c.sp * dt * 0.6) % 1; const out = c.lane === 0, z = (out ? c.u : 1 - c.u) * roadLen, x = out ? 3.5 : -3.5, y = ys(z) + 0.4, f = out ? 1 : -1;
      // a car facing +z shows white heads in front (+z) and red tails behind; cars going back show the opposite
      head.setMatrixAt(hi++, M.makeTranslation(x - 0.7, y, z + 1.6 * f)); head.setMatrixAt(hi++, M.makeTranslation(x + 0.7, y, z + 1.6 * f));
      tail.setMatrixAt(ti++, M.makeTranslation(x - 0.7, y, z - 1.6 * f)); tail.setMatrixAt(ti++, M.makeTranslation(x + 0.7, y, z - 1.6 * f)); }
    head.instanceMatrix.needsUpdate = tail.instanceMatrix.needsUpdate = true; });
  // ---------- the lot: dirt, fence, house frames, cranes, work lights, sign ----------
  const LW = 170, LD = 130, lot = new THREE.Group(); lot.position.copy(lotC); lot.rotation.y = yaw; G.add(lot);
  const dirt = new THREE.Mesh(new THREE.PlaneGeometry(LW, LD), new THREE.MeshLambertMaterial({ color: 0x4a3524 })); dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.07; lot.add(dirt);
  // plot grid (future ~760 homes): faint lines merged into one LineSegments
  const gl = []; for (let x = -LW / 2 + 5; x <= LW / 2 - 5; x += 8) gl.push(x, 0.12, -LD / 2 + 5, x, 0.12, LD / 2 - 5); for (let z = -LD / 2 + 5; z <= LD / 2 - 5; z += 8) gl.push(-LW / 2 + 5, 0.12, z, LW / 2 - 5, 0.12, z);
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(gl, 3)); lot.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x8a6a40, transparent: true, opacity: 0.35 })));
  const fence = []; const fp = (x, z) => fence.push(box(0.35, 2.4, 0.35, x, 1.2, z));
  for (let x = -LW / 2; x <= LW / 2; x += 6) { fp(x, -LD / 2); fp(x, LD / 2); } for (let z = -LD / 2; z <= LD / 2; z += 6) { fp(-LW / 2, z); fp(LW / 2, z); }
  for (const s of [-1, 1]) { fence.push(box(LW, 0.12, 0.12, 0, 2.1, s * LD / 2)); fence.push(box(LW, 0.12, 0.12, 0, 1.1, s * LD / 2)); fence.push(box(0.12, 0.12, LD, s * LW / 2, 2.1, 0)); fence.push(box(0.12, 0.12, LD, s * LW / 2, 1.1, 0)); }
  lot.add(new THREE.Mesh(mergeGeometries(fence), new THREE.MeshLambertMaterial({ color: 0xc8a040 })));
  // half-built house frames: box edges merged (tent, house, villa, mansion silhouettes)
  const fr = [], mk = (w, h, d, x, z) => { const e = new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)); e.translate(x, h / 2, z); fr.push(e); const r = new THREE.EdgesGeometry(new THREE.ConeGeometry(Math.max(w, d) * 0.72, h * 0.5, 4).rotateY(Math.PI / 4)); r.translate(x, h + h * 0.25, z); fr.push(r); };
  [[3, 2, 3, -60, -40], [6, 4, 6, -45, -38], [6, 4, 7, -30, -40], [10, 6, 9, -10, -36], [16, 8, 12, 15, -34], [6, 4, 6, 40, -40], [8, 5, 8, 55, -38], [3, 2, 3, -60, -25], [3, 2, 3, -54, -25]].forEach(a => mk(...a));
  lot.add(new THREE.LineSegments(mergeGeometries(fr), new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.8 })));
  // cranes: instanced masts + rotating jibs
  const CR = [[-50, 10, 34], [10, 20, 40], [55, -5, 30]], mast = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1, 1.4).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0xffb020 }), 3);
  const jibG = mergeGeometries([box(1, 1, 30, 0, 0, 9), box(1.2, 1.2, 8, 0, 0, -9), box(2.5, 2.5, 2.5, 0, -0.2, -12), box(0.15, 10, 0.15, 0, -5, 20)]);
  const jib = new THREE.InstancedMesh(jibG, new THREE.MeshLambertMaterial({ color: 0xffc23a }), 3); CR.forEach(([x, z, h], i) => mast.setMatrixAt(i, M.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion(), new THREE.Vector3(1, h, 1)))); lot.add(mast, jib);
  const Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), P = new THREE.Vector3();
  // work lights: two blinking point sets (alternate phase)
  const wl = [[], []]; for (let i = 0; i < 28; i++) { const a = i % 2, x = (Math.random() - 0.5) * LW * 0.95, z = (Math.random() - 0.5) * LD * 0.95; wl[a].push(x, 2.5, z); }
  CR.forEach(([x, z, h]) => wl[0].push(x, h + 1.5, z));
  const wls = wl.map(a => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xff7a1a, size: 3.2, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); lot.add(p); return p; });
  // sign: canvas texture, unfogged + bright so it reads from the overview
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 384; const x = cv.getContext('2d');
  x.fillStyle = '#120802'; x.fillRect(0, 0, 1024, 384); x.strokeStyle = '#ff9a2a'; x.lineWidth = 14; x.strokeRect(10, 10, 1004, 364);
  x.textAlign = 'center'; x.shadowColor = '#ff7a1a'; x.shadowBlur = 30; x.fillStyle = '#ffd27a'; x.font = '900 118px system-ui,-apple-system,sans-serif'; x.fillText('COMING SOON', 512, 190);
  x.shadowBlur = 12; x.fillStyle = '#ffffff'; x.font = '700 64px system-ui,-apple-system,sans-serif'; x.fillText('BURN CITY ESTATES', 512, 290); x.font = '500 34px system-ui,sans-serif'; x.fillStyle = '#ffb36a'; x.fillText('tents · houses · mansions', 512, 345);
  const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4;
  const signM = new THREE.MeshBasicMaterial({ map: tex, fog: false, toneMapped: false, side: THREE.DoubleSide });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(130, 48), signM); sign.position.set(0, 120, -LD / 2 + 6); sign.rotation.y = Math.PI; lot.add(sign);   // faces back toward the city
  const legs = new THREE.Mesh(mergeGeometries([box(2.4, 96, 2.4, -46, 48, -LD / 2 + 6.5), box(2.4, 96, 2.4, 46, 48, -LD / 2 + 6.5)]), new THREE.MeshLambertMaterial({ color: 0x333 })); lot.add(legs);
  // tap target covering the whole lot + sign
  const hitM = new THREE.Mesh(new THREE.BoxGeometry(LW, 150, LD), new THREE.MeshBasicMaterial({ visible: false })); hitM.position.y = 75; hitM.userData = { kind: 'estate', label: 'Burn City Estates' }; lot.add(hitM); pick.push(hitM);
  anim.push(t => { CR.forEach(([x, z, h], i) => { Q.setFromAxisAngle(Y, Math.sin(t * 0.07 + i * 2.1) * 1.3 + i); jib.setMatrixAt(i, M.compose(P.set(x, h, z), Q, one)); }); jib.instanceMatrix.needsUpdate = true;
    const b = Math.sin(t * 3) > 0; wls[0].material.opacity = b ? 1 : 0.15; wls[1].material.opacity = b ? 0.15 : 1; signM.color.setScalar(0.85 + 0.15 * Math.sin(t * 2)); });
  return { lakeC, lotC, maxR, dir };
}
export const estateCard = () => `<button class="x" aria-label="Close">✕</button><h2 style="color:#ffb040">🏗 Burn City Estates</h2><p><b>Properties coming soon:</b> tents, houses, mansions.</p><p class="dim">About 760 home plots across the lake. Stay tuned.</p>`;
