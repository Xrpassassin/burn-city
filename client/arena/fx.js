// Burn City Arena: zombie-mode visuals. Low-poly, fully instanced (a handful of draw calls total); textures are generated on canvases, no asset files.
import * as THREE from 'three';
import { createFPBody } from './fpbody.js';
import { buildNftChar, disposeNftChar } from '../js/nftchar.js';
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), S = new THREE.Vector3(), C = new THREE.Color();
const P = new THREE.Vector3(), Pt = new THREE.Matrix4();
// one instanced mesh per body part; each part has a pivot offset (shoulder/hip) so limbs swing naturally
function rig(scene, max, parts) {
  const out = {};
  for (const [k, geo, mat] of parts) { const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < max; i++) m.setColorAt(i, C.set(0xffffff)); scene.add(m); out[k] = m; }
  return out;
}
const box = (w, h, d, py = 0) => new THREE.BoxGeometry(w, h, d).translate(0, py, 0);
// write a part: base transform (pos x/z, yaw, scale) * local offset * local rotation
function put(mesh, i, x, y, z, yaw, sc, ox, oy, oz, rx = 0, rz = 0, col) {
  Q.setFromEuler(E.set(0, yaw, 0)); M.compose(V.set(x, y, z), Q, S.set(sc, sc, sc));
  Q.setFromEuler(E.set(rx, 0, rz)); Pt.compose(P.set(ox, oy, oz), Q, S.set(1, 1, 1)); M.multiply(Pt);
  mesh.setMatrixAt(i, M); if (col) mesh.setColorAt(i, col);
}
const done = (r, n) => { for (const m of Object.values(r)) { m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; } };

// canvas texture helper (tinted per instance by instanceColor, so textures stay mostly white/grey)
const ctex = (w, h, draw, near) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); draw(g, w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (near) t.magFilter = THREE.NearestFilter; t.anisotropy = 4; return t; };
const rnd = Math.random, blot = (g, x, y, r, col) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); };
function rotSkin(g, w, h) { g.fillStyle = '#f2f2ee'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) blot(g, rnd() * w, rnd() * h, 4 + rnd() * 14, `rgba(${60 + rnd() * 40 | 0},${50 + rnd() * 30 | 0},40,${0.18 + rnd() * 0.25})`);
  g.strokeStyle = 'rgba(70,30,90,.35)'; g.lineWidth = 1; for (let i = 0; i < 7; i++) { g.beginPath(); let x = rnd() * w, y = rnd() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 14; y += rnd() * 10; g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 3; i++) { const x = rnd() * w, y = rnd() * h, r = 5 + rnd() * 6; blot(g, x, y, r * 1.8, 'rgba(90,10,6,.55)'); g.fillStyle = 'rgba(40,0,0,.85)'; g.beginPath(); g.ellipse(x, y, r * 0.6, r * 0.35, rnd() * 3, 0, 7); g.fill();
    g.fillStyle = 'rgba(230,210,190,.8)'; for (let k = 0; k < 3; k++) g.fillRect(x - r * 0.4 + k * r * 0.35, y - 1, 2, 2); }   // open wounds with a bit of exposed bone
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(100,0,0,${0.3 + rnd() * 0.4})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 3); } }
export function createZombieFX(scene, { low = false } = {}) {
  const lam = c => new THREE.MeshLambertMaterial({ color: c });
  const skinTex = ctex(64, 64, rotSkin), skinM = new THREE.MeshLambertMaterial({ color: 0xffffff, map: skinTex });
  const faceTex = ctex(64, 64, (g, w, h) => { rotSkin(g, w, h);
    for (const x of [18, 46]) { blot(g, x, 26, 13, 'rgba(10,0,0,.9)'); g.fillStyle = 'rgba(0,0,0,.9)'; g.beginPath(); g.ellipse(x, 26, 7, 6, 0, 0, 7); g.fill(); }   // sunken sockets
    g.fillStyle = 'rgba(20,0,0,.9)'; g.beginPath(); g.moveTo(29, 40); g.lineTo(35, 40); g.lineTo(32, 33); g.fill();   // rotted nose
    g.fillStyle = 'rgba(30,0,0,.95)'; g.fillRect(14, 50, 36, 9); g.fillStyle = '#d8ccb0'; for (let k = 0; k < 8; k++) g.fillRect(15 + k * 4.4, 50, 3, 3 + (k % 3)); for (let k = 0; k < 7; k++) g.fillRect(17 + k * 4.4, 56, 3, 3);   // teeth
    g.strokeStyle = 'rgba(30,10,10,.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(40, 4); g.lineTo(52, 14); g.lineTo(49, 20); g.stroke();
    for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(41 + k * 3, 6 + k * 3); g.lineTo(46 + k * 3, 3 + k * 3); g.stroke(); } });   // stitched gash
  const faceM = new THREE.MeshLambertMaterial({ color: 0xffffff, map: faceTex });
  const headMats = [skinM, skinM, skinM, skinM, faceM, skinM];   // BoxGeometry face order: +x,-x,+y,-y,+z(front),-z
  const pantsTex = ctex(64, 64, (g, w, h) => { g.fillStyle = '#e8e8e8'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(0,0,0,.08)'; for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1); for (let x = 0; x < w; x += 3) g.fillRect(x, 0, 1, h);
    for (let i = 0; i < 5; i++) blot(g, rnd() * w, rnd() * h, 6 + rnd() * 10, `rgba(${50 + rnd() * 50 | 0},20,10,.45)`); blot(g, w / 2, h * 0.55, 10, 'rgba(0,0,0,.6)');
    g.fillStyle = 'rgba(0,0,0,.75)'; g.beginPath(); g.ellipse(w * 0.5, h * 0.55, 8, 5, 0.3, 0, 7); g.fill(); g.fillStyle = 'rgba(150,40,30,.7)'; g.fillRect(w * 0.45, h * 0.55, 6, 2); });   // torn knee
  const pantsM = new THREE.MeshLambertMaterial({ color: 0xffffff, map: pantsTex });
  // ---------- zombies ----------
  // torn-cloth canvas texture: ragged hem + holes (alphaTest), grime streaks; tinted per instance -> one material, instanced
  const rag = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.moveTo(0, 64); for (let x = 0; x <= 64; x += 4) g.lineTo(x, 46 + Math.random() * 18); g.lineTo(64, 64); g.fill();
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(Math.random() * 64, 8 + Math.random() * 36, 2 + Math.random() * 4, 1.5 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill(); }
    g.globalCompositeOperation = 'source-over'; for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(40,20,10,${0.2 + Math.random() * 0.35})`; g.fillRect(Math.random() * 64, Math.random() * 40, 2 + Math.random() * 6, 6 + Math.random() * 18); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })();
  const cloth = new THREE.MeshLambertMaterial({ color: 0xffffff, map: rag, alphaTest: 0.5, side: THREE.DoubleSide });
  const glow = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'), gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
  const MAXZ = 48, Z = rig(scene, MAXZ, [
    ['body', box(0.62, 0.8, 0.36, 0.4), skinM], ['head', box(0.42, 0.42, 0.42, 0.21), headMats],
    ['jaw', box(0.3, 0.1, 0.22), skinM], ['shirt', box(0.68, 0.62, 0.42, 0.47), cloth], ['belly', box(0.78, 0.5, 0.56, 0.25), skinM],
    ['arm', box(0.16, 0.72, 0.16, -0.36), skinM], ['leg', box(0.2, 0.78, 0.2, -0.39), pantsM],
    ['eye', box(0.09, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })],
    ['glow', new THREE.PlaneGeometry(0.55, 0.3), new THREE.MeshBasicMaterial({ color: 0xffffff, map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })]]);
  const arms2 = rig(scene, MAXZ, [['arm', box(0.16, 0.72, 0.16, -0.36), skinM], ['leg', box(0.2, 0.78, 0.2, -0.39), pantsM], ['eye', box(0.09, 0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })]]);
  // body variants: 0 walker, 1 runner (lean, hunched forward), 2 brute (huge, belly), 3 crawler-looking (walker id%4==0: bent double, dragging)
  const TY = [{ s: 1, skin: [0x6f9a4a, 0x7c8d55, 0x5d8a62, 0x8a9a6a], eye: 0xfff26a, speed: 1 }, { s: 0.85, skin: [0xa3b86a, 0x9fae7a, 0xb0a888], eye: 0xff3b2f, speed: 2 }, { s: 1.45, skin: [0x55704a, 0x4a5f52, 0x6a6a50], eye: 0xff8a00, speed: 0.6 },
    { s: 1.9, skin: [0x3c3a40, 0x45403a], eye: 0xff2010, speed: 0.55 }, { s: 1.0, skin: [0xb8b49a, 0xa8a890], eye: 0x9aff40, speed: 1.75 }, { s: 0.62, skin: [0x4a5a78, 0x3e4e66], eye: 0x40e8ff, speed: 1.55 }];   // 3 Juggernaut, 4 Lope (runs on its arms), 5 Skitter
  const CLOTH = [0x5a3a2a, 0x2f3d55, 0x6a6a6a, 0x7a2a22, 0x3e4a2e, 0x8a7a5a, 0x40304a], PANTS = [0x2a2a33, 0x3a3226, 0x23324a, 0x4a3a2a];
  const zs = new Map(), dying = [];   // id -> {x,z,yaw,ph,var,heat}
  const hit = new THREE.Color(0xffd0a0), burnC = new THREE.Color(0xff5a10), charC = new THREE.Color(0x1a1410), tmp = new THREE.Color(), tmp2 = new THREE.Color(), tmp3 = new THREE.Color(), tmp4 = new THREE.Color();
  const HID = 0.0001;
  function drawZ(i, z, t, fade, burning) {
    const ty = TY[z.ty] || TY[0], quad = z.ty === 4 || z.ty === 5, crawl = z.cr || quad || (z.ty === 0 && z.id % 4 === 0), brute = z.ty === 2 || z.ty === 3, runner = z.ty === 1 || z.ty === 4;
    const s = ty.s * z.v, ph = z.ph, lurch = Math.sin(ph) * 0.12, sw = Math.sin(ph) * (runner ? 0.9 : 0.6), fl = z.fl || 0, dead = fade !== undefined;
    const tint = (c, base) => { c.setHex(base); if (burning) c.lerp(burnC, 0.45 + 0.3 * Math.sin(t * 30 + z.id)); if (z.flash > 0) c.lerp(hit, z.flash); if (dead) c.lerp(charC, Math.min(1, fade * 2)); return c; };
    const skin = tint(tmp, ty.skin[(z.id * 7) % ty.skin.length]).multiplyScalar(1.15), shirt = tint(tmp3, z.ty === 3 ? (z.ch ? 0x8a2a14 : 0x4a4a54) : z.ty === 5 ? 0x1a2230 : CLOTH[(z.id * 5 + z.ty) % CLOTH.length]);   // Juggernaut: iron plate (glows red mid-charge)
    // death: topple forward over 0.35 of the fade, then sink + char. flinch: snap back + small twist.
    const fall = dead ? Math.min(1, fade / 0.35) : 0, pitch = (quad || z.cr ? 1.35 : crawl ? 0.9 : runner ? 0.45 : 0.25) + (z.ch ? 0.35 : 0) - fl * 0.55 + fall * (1.45 - (crawl ? 0.6 : 0.25));
    let y0 = dead ? Math.max(0, 1 - fall) * 0.78 * s - Math.max(0, fade - 0.5) * 0.9 * s + 0.15 * s * fall : (quad ? 0.5 : z.cr ? 0.2 : crawl ? 0.45 : 0.78) * s + Math.abs(Math.cos(ph)) * (quad ? 0.12 : 0.05) * s;
    y0 += z.y || 0;   // upper floor / ramp height
    const sc = s * (dead ? 1 - Math.max(0, fade - 0.5) * 0.5 : 1), twist = fl * 0.35 * Math.sin(z.id), yaw = z.yaw + twist;
    put(Z.body, i, z.x, y0, z.z, yaw, sc, 0, 0, 0, pitch + lurch, lurch * 0.5, skin);
    put(Z.shirt, i, z.x, y0, z.z, yaw, sc, 0, 0, 0, pitch + lurch, lurch * 0.5, shirt);
    put(Z.belly, i, z.x, y0, z.z, yaw, brute ? sc : HID, 0, 0.02, 0.06, pitch + lurch, 0, tmp2.copy(skin).multiplyScalar(0.85));
    const hp = pitch + 0.1 + lurch, hy = 0.8 * Math.cos(pitch), hz = 0.8 * Math.sin(pitch) + 0.08;
    put(Z.head, i, z.x, y0, z.z, yaw, sc, 0, hy, hz, hp, 0.2 * Math.sin(ph * 0.5) + (crawl ? 0.3 : 0), skin);
    const jawOpen = 0.25 + 0.2 * Math.sin(t * 5 + z.id);
    put(Z.jaw, i, z.x, y0, z.z, yaw, sc, 0, hy + 0.03 - Math.sin(hp) * 0.05, hz + 0.18 + Math.cos(hp) * 0.04, hp + jawOpen, 0, tmp2.copy(skin).multiplyScalar(0.7));
    const eyeC = dead ? tmp4.setHex(0x000000) : tmp4.setHex(ty.eye), ey = hy + 0.25 * Math.cos(hp), ez = hz + 0.22 + 0.25 * Math.sin(hp);
    put(Z.eye, i, z.x, y0, z.z, yaw, sc, 0.1, ey, ez, hp, 0, eyeC); put(arms2.eye, i, z.x, y0, z.z, yaw, sc, -0.1, ey, ez, hp, 0, eyeC);
    put(Z.glow, i, z.x, y0, z.z, yaw, dead || low ? HID : sc, 0, ey, ez + 0.03, hp, 0, eyeC);
    const reach = quad ? -1.45 + sw * 0.9 : crawl ? -1.6 : runner ? -0.6 - sw * 0.5 : -1.35, ay = 0.7 * Math.cos(pitch), az = 0.7 * Math.sin(pitch) + 0.05;
    put(Z.arm, i, z.x, y0, z.z, yaw, sc * (brute ? 1.25 : z.ty === 4 ? 1.4 : 1), brute ? 0.27 : 0.4, ay, az, reach + sw * 0.3 + fall * 1.2, 0.1, skin);
    put(arms2.arm, i, z.x, y0, z.z, yaw, sc * (brute ? 1.25 : z.ty === 4 ? 1.4 : 1), brute ? -0.27 : -0.4, ay, az, (quad ? -1.45 - sw * 0.9 : runner ? -0.6 + sw * 0.5 : reach + 0.1) - sw * 0.3 + fall * 1.2, -0.1, skin);
    const pants = tint(tmp2, PANTS[z.id % PANTS.length]), lp = crawl ? 0.9 : 0;
    put(Z.leg, i, z.x, y0, z.z, yaw, sc, 0.16, 0, 0, (crawl ? sw * 0.3 : sw) + lp - fall * 0.3, 0, pants);
    put(arms2.leg, i, z.x, y0, z.z, yaw, sc, -0.16, 0, 0, -(crawl ? sw * 0.3 : sw) + lp - fall * 0.3, 0, pants);
  }
  // ---------- players (third person): suited pyromaniacs, gas-mask helmet, fuel tanks, accent lights in player color ----------
  const MAXP = 16, PL = rig(scene, MAXP, [
    ['body', box(0.62, 0.78, 0.36, 0.39), lam(0x2b2b30)], ['head', box(0.44, 0.44, 0.44, 0.22), lam(0x1d1d22)],
    ['visor', box(0.36, 0.14, 0.05), new THREE.MeshBasicMaterial({ color: 0xffffff })], ['mask', box(0.18, 0.18, 0.16), lam(0x3a3a3a)],
    ['tank', new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8), lam(0xb33a1a)], ['arm', box(0.17, 0.7, 0.17, -0.35), lam(0x2b2b30)],
    ['leg', box(0.21, 0.78, 0.21, -0.39), lam(0x1f1f24)], ['belt', box(0.66, 0.08, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff })],
    ['gun', box(0.1, 0.1, 0.7, 0), lam(0x555555)]]);
  const PL2 = rig(scene, MAXP, [['tank', new THREE.CylinderGeometry(0.11, 0.11, 0.62, 8), lam(0xb33a1a)], ['arm', box(0.17, 0.7, 0.17, -0.35), lam(0x2b2b30)], ['leg', box(0.21, 0.78, 0.21, -0.39), lam(0x1f1f24)]]);
  const ps = new Map(), HIDP = 0.0001, self = { x: 0, z: 0, y: 0, yaw: 0, ph: 0, spd: 0, pi: 0 };
  function drawP(i, p, col, fp) {   // fp: first-person self (no head/mask/visor/stock gun: the camera sits there and the view-model gun is shown)
    const H = fp ? HIDP : 1, pi = fp ? 0 : p.pi || 0; if (fp) { p = { ...p, y: (p.y || 0) - 0.12, x: p.x - Math.sin(p.yaw) * 0.08, z: p.z - Math.cos(p.yaw) * 0.08 }; }
    const ph = p.ph, moving = p.spd > 0.5, sw = moving ? Math.sin(ph) * 0.7 : Math.sin(ph * 0.25) * 0.04, bob = moving ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(ph * 0.25) * 0.02, y = (p.y || 0) + (p.down ? 0.25 : 0.78 + bob);
    put(PL.body, i, p.x, y, p.z, p.yaw, H, 0, 0, 0); put(PL.head, i, p.x, y, p.z, p.yaw, H, 0, 0.8, 0);
    put(PL.visor, i, p.x, y, p.z, p.yaw, H, 0, 1.06, 0.22, 0, 0, col); put(PL.mask, i, p.x, y, p.z, p.yaw, H, 0, 0.9, 0.26);
    put(PL.belt, i, p.x, y, p.z, p.yaw, 1, 0, 0.06, 0, 0, 0, col);
    put(PL.tank, i, p.x, y, p.z, p.yaw, H, 0.14, 0.42, -0.3); put(PL2.tank, i, p.x, y, p.z, p.yaw, H, -0.14, 0.42, -0.3);
    put(PL.arm, i, p.x, y, p.z, p.yaw, H, 0.41, 0.72, 0, -1.2 - pi * 0.8, 0.15); put(PL2.arm, i, p.x, y, p.z, p.yaw, H, -0.41, 0.72, 0, -1.3 - pi * 0.8, -0.2);   // arms follow aim pitch   // both hands on the flamethrower
    put(PL.gun, i, p.x, y, p.z, p.yaw, fp ? HIDP : 1, 0.1, 0.45 + Math.sin(pi) * 0.3, 0.55, -pi);
    put(PL.leg, i, p.x, y, p.z, p.yaw, 1, 0.16, 0, 0, sw); put(PL2.leg, i, p.x, y, p.z, p.yaw, 1, -0.16, 0, 0, -sw);
  }
  // ---------- first-person flamethrower ----------
  // brushed steel, gunmetal with rivets, and a stencilled fuel tank (all canvas textures)
  const steelTex = ctex(128, 32, (g, w, h) => { g.fillStyle = '#d8dce2'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rnd() * 0.08})`; g.fillRect(0, y, w, 1); }
    g.strokeStyle = 'rgba(40,30,20,.35)'; for (let i = 0; i < 10; i++) { g.beginPath(); const x = rnd() * w, y = rnd() * h; g.moveTo(x, y); g.lineTo(x + 6 + rnd() * 14, y + (rnd() - 0.5) * 3); g.stroke(); }
    const sg = g.createLinearGradient(w * 0.75, 0, w, 0); sg.addColorStop(0, 'rgba(60,40,30,0)'); sg.addColorStop(1, 'rgba(40,25,15,.75)'); g.fillStyle = sg; g.fillRect(0, 0, w, h); });   // scorched muzzle end
  // per-weapon skins: body finish + tank livery
  const bodyTex = (kind) => ctex(64, 64, (g, w, h) => {
    if (kind === 'wood') { g.fillStyle = '#7a4424'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 1) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,18,6' : '160,96,50'},${0.15 + rnd() * 0.2})`; g.fillRect(0, y + Math.sin(y * 0.3) * 2, w, 1); } for (let i = 0; i < 3; i++) { g.strokeStyle = 'rgba(40,16,4,.5)'; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6, 2.5, 0, 0, 7); g.stroke(); } }
    else if (kind === 'camo') { g.fillStyle = '#4a5230'; g.fillRect(0, 0, w, h); for (const col of ['#2e3420', '#6a6a3e', '#3a2e1e']) for (let i = 0; i < 6; i++) { g.fillStyle = col; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 6 + rnd() * 9, 3 + rnd() * 6, rnd() * 3, 0, 7); g.fill(); } }
    else if (kind === 'chrome') { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f4f8fc'); gr.addColorStop(0.5, '#9aa4b0'); gr.addColorStop(1, '#e0e8f0'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(40,220,255,.9)'; g.lineWidth = 1.5; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(0, 18 + k * 14); g.lineTo(20, 18 + k * 14); g.lineTo(26, 12 + k * 14); g.lineTo(w, 12 + k * 14); g.stroke(); } }
    else if (kind === 'dragon') { g.fillStyle = '#2a0e0a'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 6) for (let x = (y / 6) % 2 ? 3 : 0; x < w; x += 6) { g.fillStyle = `rgba(${150 + rnd() * 60 | 0},${30 + rnd() * 30 | 0},10,.9)`; g.beginPath(); g.arc(x + 3, y + 3, 2.8, 0, Math.PI); g.fill(); } }   // dragon scales
    else { g.fillStyle = '#5a5c66'; g.fillRect(0, 0, w, h); for (let i = 0; i < 18; i++) blot(g, rnd() * w, rnd() * h, 3 + rnd() * 8, 'rgba(0,0,0,.18)'); }
    g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h - 2, w, 2); g.fillRect(0, 0, 2, h); g.fillRect(w - 2, 0, 2, h);
    for (const [x, y] of [[6, 6], [w - 7, 6], [6, h - 7], [w - 7, h - 7]]) { g.fillStyle = kind === 'wood' ? '#c8a050' : '#9a9ca6'; g.beginPath(); g.arc(x, y, 2.4, 0, 7); g.fill(); g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x, y, 1.5, 1.5); } });
  const tankTexOf = (base, stripe, label, sub, ink = '#f4e8d0') => ctex(128, 64, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); for (let i = 0; i < 14; i++) blot(g, rnd() * w, rnd() * h, 4 + rnd() * 10, 'rgba(40,20,10,.35)');
    for (const yb of [h, 10]) for (let x = -h; x < w; x += 14) { g.fillStyle = stripe; g.beginPath(); g.moveTo(x, yb); g.lineTo(x + 7, yb); g.lineTo(x + 17, yb - 10); g.lineTo(x + 10, yb - 10); g.fill(); }
    g.fillStyle = ink; g.font = 'bold 18px Impact, sans-serif'; g.textAlign = 'center'; g.fillText(label, w / 2, h / 2 + 7); g.font = 'bold 8px sans-serif'; g.fillText(sub, w / 2, h / 2 + 17); });
  const dialTex = ctex(32, 32, (g) => { g.fillStyle = '#e8e2d0'; g.beginPath(); g.arc(16, 16, 15, 0, 7); g.fill(); g.strokeStyle = '#222'; g.lineWidth = 2; g.stroke(); g.strokeStyle = '#c01010'; g.beginPath(); g.arc(16, 16, 11, -0.6, 0.6); g.stroke();
    g.strokeStyle = '#111'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(16, 16); g.lineTo(25, 10); g.stroke(); });
  const tl = (c, map) => new THREE.MeshLambertMaterial({ color: c, map });
  // weapon skins: [body finish, tank livery, heat-shield tint, accent colour override (null = player colour)]
  const WSKIN = [['gun', ['#c03a1c', '#e8b000', 'FUEL', '⚠ FLAMMABLE'], 0x3a3c44, null],
    ['dragon', ['#1a0a08', '#c8901a', '龍 DRAGON', 'BREATH · MK II', '#ffb030'], 0x5a1a10, 0xffa020],
    ['wood', ['#b08a3a', '#3a2010', 'SLUGS', 'INCENDIARY 12GA', '#2a1608'], 0x2a2420, null],
    ['camo', ['#4a5230', '#d8c040', 'NAPALM', 'MIL-SPEC · FIRESTORM', '#e8d870'], 0x3a4028, 0xffd040],
    ['chrome', ['#0a6a8a', '#e8f4ff', 'PLASMA', '◇ INFERNO CORE ◇', '#c8fcff'], 0xb8c4d0, 0x40e8ff]]
    .map(([b, tk, sh, ac]) => ({ body: tl(0xffffff, bodyTex(b)), tank: tl(0xffffff, tankTexOf(...tk)), sh, ac }));
  const gun = new THREE.Group(), steel = tl(0xffffff, steelTex), dark = WSKIN[0].body;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 12).rotateX(Math.PI / 2), tl(0xffffff, steelTex)); barrel.position.set(0, 0, -0.38);
  const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.42, 12, 1, true, -Math.PI * 0.85, Math.PI * 1.7).rotateX(Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0x3a3c44, side: THREE.DoubleSide, alphaTest: 0.5, map: ctex(64, 32, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'destination-out'; for (let y = 4; y < h - 2; y += 7) for (let x = 3; x < w; x += 8) { g.beginPath(); g.ellipse(x, y, 2.6, 1.6, 0, 0, 7); g.fill(); } }) }));
  shield.position.set(0, 0, -0.3);   // perforated heat shield around the barrel
  const body = new THREE.Mesh(box(0.13, 0.15, 0.4), dark); body.position.set(0, -0.03, 0.02);
  const top = new THREE.Mesh(box(0.05, 0.035, 0.26), dark); top.position.set(0, 0.06, 0.0);   // top rail
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 16), WSKIN[0].tank); tank.position.set(0, -0.14, 0.02); tank.rotation.x = Math.PI / 2;
  const cap1 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), steel); cap1.rotation.x = -Math.PI / 2; cap1.position.set(0, -0.14, -0.13);
  const cap2 = cap1.clone(); cap2.rotation.x = Math.PI / 2; cap2.position.z = 0.17;
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.015, 16), [steel, new THREE.MeshBasicMaterial({ map: dialTex }), steel]); dial.position.set(0.065, -0.1, 0.06); dial.rotation.z = -Math.PI / 2;
  const hose = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-0.05, -0.14, -0.1), new THREE.Vector3(-0.11, -0.1, -0.2), new THREE.Vector3(-0.07, -0.03, -0.3), new THREE.Vector3(-0.03, -0.01, -0.36)]), 16, 0.014, 6), lam(0x18181c));
  const grip = new THREE.Mesh(box(0.06, 0.16, 0.07), dark); grip.position.set(0, -0.12, 0.17); grip.rotation.x = 0.3;
  const fgrip = new THREE.Mesh(box(0.05, 0.12, 0.05), dark); fgrip.position.set(0, -0.11, -0.16); fgrip.rotation.x = -0.15;
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.08, 12).rotateX(Math.PI / 2), steel); nozzle.position.set(0, 0, -0.78);
  const hot = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), new THREE.MeshBasicMaterial({ color: 0x301008 })); hot.position.set(0, 0, -0.74);   // glows as the barrel heats up
  const pilot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), new THREE.MeshBasicMaterial({ color: 0x5ab4ff })); pilot.position.set(0, -0.05, -0.8);
  const accent = new THREE.Mesh(box(0.14, 0.012, 0.012), new THREE.MeshBasicMaterial({ color: 0xffffff })); accent.position.set(0, 0.035, -0.17);   // thin player-colour light band
  const accent2 = accent.clone(); accent2.position.z = 0.14;
  gun.add(barrel, shield, body, top, tank, cap1, cap2, dial, hose, grip, fgrip, nozzle, hot, pilot, accent, accent2);
  // first-person arms + gloves gripping the gun (one merged mesh, vertex colours, in gun space so they follow pitch/recoil)
  const mergeG = parts => { const pos = [], nor = [], col = []; for (const [g, c] of parts) { const n = g.toNonIndexed(); pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); const cc = new THREE.Color(c); for (let k = 0; k < n.attributes.position.count; k++) col.push(cc.r, cc.g, cc.b); }
    const o = new THREE.BufferGeometry(); o.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); o.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); o.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); return o; };
  const limb = (w, h, d, x, y, z, rx, ry) => new THREE.BoxGeometry(w, h, d).rotateX(rx).rotateY(ry).translate(x, y, z), SUIT = 0x34343c, GLOVE = 0x15151a;
  const fpArms = new THREE.Mesh(mergeG([[limb(0.2, 0.2, 0.9, 0.12, -0.2, 0.55, 0.12, -0.08), SUIT], [limb(0.17, 0.15, 0.2, 0, -0.14, 0.12, 0, 0), GLOVE],     // right sleeve -> hand on the grip
    [limb(0.2, 0.2, 1.0, -0.42, -0.2, 0.05, 0.1, 0.5), SUIT], [limb(0.17, 0.15, 0.2, -0.12, -0.12, -0.4, 0, 0.4), GLOVE]]),   // left sleeve -> hand on the fore-grip
    new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x1a0d06 }));
  // muzzle flash: two crossed additive quads at the nozzle, shown for a few frames after each kick
  const flashG = mergeG([[new THREE.PlaneGeometry(0.26, 0.26), 0xffffff], [new THREE.PlaneGeometry(0.26, 0.26).rotateY(Math.PI / 2), 0xffffff]]);
  const flash = new THREE.Mesh(flashG, new THREE.MeshBasicMaterial({ color: 0xffb04a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, opacity: 0.65 })); flash.position.set(0, 0, -0.95); flash.visible = false;
  gun.add(fpArms, flash);
  // first-person torso: one lathe mesh in world space under the camera (chest, shoulders, belt), lit like the 3rd-person suit, with a faint rim tint
  const fpTorso = new THREE.Mesh(new THREE.LatheGeometry([[0.17, 0], [0.22, 0.06], [0.235, 0.3], [0.255, 0.45], [0.2, 0.53], [0.06, 0.56]].map(([a, b]) => new THREE.Vector2(a, b)), 10).scale(1.25, 1, 0.75),
    new THREE.MeshLambertMaterial({ color: 0x2b2b30, emissive: 0x120806 })); fpTorso.visible = false; scene.add(fpTorso);
  const fpBody = createFPBody(scene, { low });   // Pyretheum-style body for the local player (legs/torso when looking down)
  let kick = 0, swayT = 0; const _mz = new THREE.Vector3(); gun.position.set(0.2, -0.18, -0.34); gun.scale.setScalar(0.36); gun.rotation.y = 0.04; gun.visible = false;
  let heatV = 0;
  // fire particles: world-space points with per-particle age, additive; heat light only when firing (skipped in low mode)
  const NP = low ? 90 : 220, pos = new Float32Array(NP * 3), colA = new Float32Array(NP * 3), vel = new Float32Array(NP * 3), age = new Float32Array(NP).fill(9), lifeA = new Float32Array(NP).fill(0.75), pcol = new Array(NP).fill(null);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); pg.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  const sprite = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const fire = new THREE.Points(pg, new THREE.PointsMaterial({ size: low ? 0.7 : 0.7, map: sprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fire.frustumCulled = false; scene.add(fire);
  const heat = low ? null : new THREE.PointLight(0xff6a1a, 0, 14, 1.6); if (heat) scene.add(heat);
  let emitAcc = 0, next = 0;
  const cA = new THREE.Color(0xffc060), cB = new THREE.Color(0xff6a10), cC = new THREE.Color(0x401005), cc = new THREE.Color();
  // per-weapon flame profiles: speed, spread, particle life, emit rate, colour (null = player's flame colour / default orange)
  const WP = [{ sp: 9, spr: 0.18, life: 0.75, rate: 1 }, { sp: 10, spr: 0.34, life: 0.85, rate: 1.5, col: new THREE.Color(0xff2a00) }, { sp: 16, spr: 0.45, life: 0.35, rate: 0 }, { sp: 0, spr: 0, life: 0.6, rate: 0, col: new THREE.Color(0xff8a00) }, { sp: 30, spr: 0.015, life: 0.55, rate: 1.3, col: new THREE.Color(0xfff0b0) }];
  function emit(k, ox, oy, oz, dx, dz, sp, life, col) { pos[k * 3] = ox; pos[k * 3 + 1] = oy; pos[k * 3 + 2] = oz; age[k] = 0; lifeA[k] = life; pcol[k] = col; vel[k * 3] = dx * sp; vel[k * 3 + 1] = (Math.random() - 0.3) * 1.2; vel[k * 3 + 2] = dz * sp; }
  function burst(ox, oy, oz, fx, fz, n, pr) { for (let i = 0; i < n; i++) { const k = next = (next + 1) % NP; emit(k, ox, oy, oz, fx + (Math.random() - 0.5) * pr.spr * 2, fz + (Math.random() - 0.5) * pr.spr * 2, pr.sp * (0.7 + Math.random() * 0.6), pr.life, pr.col || null); } }
  function particles(dt, firing, ox, oy, oz, fx, fz, flameCol, rate = 1, stepIt = true, pr = WP[0], fy = 0) {   // fy: vertical aim component (sin pitch)
    if (firing && pr.rate) { emitAcc += dt * (low ? 110 : 220) * rate * pr.rate;
      while (emitAcc >= 1) { emitAcc--; const k = next = (next + 1) % NP, sp = pr.sp + Math.random() * 4, spr = pr.spr;
        pos[k * 3] = ox; pos[k * 3 + 1] = oy; pos[k * 3 + 2] = oz; age[k] = 0; lifeA[k] = pr.life; pcol[k] = pr.col || null;
        const dx = fx + (Math.random() - 0.5) * spr * 2, dz = fz + (Math.random() - 0.5) * spr * 2;
        vel[k * 3] = dx * sp; vel[k * 3 + 1] = fy * sp + (Math.random() - 0.3) * 1.2; vel[k * 3 + 2] = dz * sp; } }
    if (stepIt) for (let k = 0; k < NP; k++) { const a = (age[k] += dt), life = lifeA[k], fc = pcol[k] || flameCol;
      if (a > life) { pos[k * 3 + 1] = -50; continue; }
      pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += (vel[k * 3 + 1] + a * 3) * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
      vel[k * 3] *= 1 - dt * 1.6; vel[k * 3 + 2] *= 1 - dt * 1.6;
      const u = a / life; if (u < 0.3) cc.copy(cA).lerp(fc || cB, u / 0.3); else cc.copy(fc || cB).lerp(cC, (u - 0.3) / 0.7);
      const f = (1 - u * 0.8) * (0.16 + u * 0.55); colA[k * 3] = cc.r * f; colA[k * 3 + 1] = cc.g * f; colA[k * 3 + 2] = cc.b * f; }
    if (stepIt) { pg.attributes.position.needsUpdate = true; pg.attributes.color.needsUpdate = true; }
  }
  // napalm: lobbed blobs (0.6 s arc) then burning pools; inferno beam: additive cylinders
  const rays = [], blobs = [], pools = [], NB = 12, NPO = 16, NBM = 8;
  const blobM = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff7a10 }), NB); blobM.count = 0; blobM.frustumCulled = false; scene.add(blobM);
  const poolM = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5a00, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), NPO); poolM.count = 0; poolM.frustumCulled = false; scene.add(poolM);
  const beamM = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.16, 1, 8, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), NBM); beamM.count = 0; beamM.frustumCulled = false; scene.add(beamM);
  let nb = 0; const EB = new THREE.Euler(); const beamAt = (x, y, z, yaw, len, pt = 0) => { if (nb >= NBM) return; Q.setFromEuler(EB.set(pt, yaw, 0, 'YXZ')); M.compose(V.set(x, y, z), Q, S.set(1 + Math.random() * 0.4, 1 + Math.random() * 0.4, len)); beamM.setMatrixAt(nb++, M); };
  // first-person weapon look per weapon: barrel colour, length, thickness
  const LOOKW = [[0xa8aeb8, 1, 1], [0xb02010, 1.25, 1.1], [0x6a4a2a, 0.6, 2.2], [0x3a4a2a, 0.85, 2.8], [0x9af0ff, 1.15, 0.8]];
  let curW = -1, curAc = null; const setW = w => { if (w === curW) return; curW = w; const [c, l, th] = LOOKW[w] || LOOKW[0]; barrel.material.color.setHex(c).lerp(new THREE.Color(0xffffff), 0.35); barrel.scale.set(th, th, l); barrel.position.z = -0.38 * l; nozzle.position.z = -0.78 * l; hot.position.z = -0.74 * l; pilot.position.z = -0.8 * l;
    shield.scale.set(Math.max(1, th * 0.9), Math.max(1, th * 0.9), l); shield.position.z = -0.3 * l; const sk = WSKIN[w] || WSKIN[0]; shield.material.color.setHex(sk.sh); for (const m of [body, top, grip, fgrip]) m.material = sk.body; tank.material = sk.tank; tank.material.map.needsUpdate = true; curAc = sk.ac; };
  let t = 0;
  return {
    gun, zs, ps,
    attach(cam) { cam.add(gun); if (!cam.parent) scene.add(cam); },
    shot(e, isMe, meX, meZ, sy = 0) { const pr = WP[e.w === 'napalm' ? 3 : 2], fx = Math.sin(e.y || 0), fz = Math.cos(e.y || 0); let mzY = null;
      if (isMe && gun.visible) { kick = 1; gun.updateMatrixWorld(true); nozzle.getWorldPosition(_mz); meX = _mz.x; meZ = _mz.z; mzY = _mz.y; }   // own shots: recoil + tracer/burst from the muzzle
      if (e.w === 'shotgun') { const ox = (isMe ? meX : e.x) + fx * 1.4, oz = (isMe ? meZ : e.z) + fz * 1.4; burst(mzY != null ? meX : ox, mzY != null ? mzY : 1.25 + sy, mzY != null ? meZ : oz, fx, fz, low ? 22 : 45, pr); }
      if (e.w === 'napalm' && e.ray) { const x0 = isMe ? meX : e.x, z0 = isMe ? meZ : e.z, ty = e.ty ?? sy; rays.push({ x0, z0, x1: e.tx, z1: e.tz, y0: mzY != null ? mzY - 1.2 : sy, y1: ty, t: 0.2, mz: mzY != null }); burst(e.tx, 1.1 + ty, e.tz, -fx * 0.2, -fz * 0.2, low ? 8 : 16, WP[1] || pr); return; }
      if (e.w === 'napalm' && blobs.length < NB) blobs.push({ x0: isMe ? meX : e.x, z0: isMe ? meZ : e.z, x1: e.tx, z1: e.tz, t: 0 }); },
    zdie(e) { const z = zs.get(e.id); if (z) { dying.push({ ...z, fade: 0 }); zs.delete(e.id); } },
    clear() { fpTorso.visible = false; fpBody.update(0, null); kick = 0; for (const q of ps.values()) if (q.nc) disposeNftChar(q.nc); zs.clear(); ps.clear(); dying.length = 0; done(Z, 0); done(arms2, 0); done(PL, 0); done(PL2, 0); age.fill(9); gun.visible = false; blobs.length = pools.length = rays.length = 0; blobM.count = poolM.count = beamM.count = 0; if (heat) heat.intensity = 0; },
    // st: interpolated state; me: predicted self {x,z,yaw,firing}; colorOf(id) -> THREE.Color
    update(dt, st, me, myId, colorOf, flameCol, nftOf, srv) {
      t += dt; const seen = new Set(); nb = 0;
      for (let i = rays.length - 1; i >= 0; i--) { const r = rays[i]; if ((r.t -= dt) <= 0) { rays.splice(i, 1); continue; } const dx = r.x1 - r.x0, dz = r.z1 - r.z0, L = Math.hypot(dx, dz) || 1, yaw = Math.atan2(dx, dz); const dy = (r.y1 || 0) - (r.y0 || 0), L3 = Math.hypot(L, dy); const o6 = r.mz ? 0 : 0.6; beamAt(r.x0 + dx / L * o6, 1.2 + (r.y0 || 0), r.z0 + dz / L * o6, yaw, Math.max(0.5, L3 - o6), -Math.atan2(dy, L)); }   // Firestorm ember bolts
      for (const s of st.zombies) { seen.add(s.id); let z = zs.get(s.id);
        if (!z) zs.set(s.id, z = { id: s.id, x: s.x, z: s.z, yaw: 0, ph: Math.random() * 6, v: 0.92 + ((s.id * 37) % 17) / 100, ty: s.ty, flash: 0, burnT: 0 });
        const dx = s.x - z.x, dz = s.z - z.z, d = Math.hypot(dx, dz); if (d > 0.01) z.yaw += (((Math.atan2(dx, dz) - z.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * Math.min(1, dt * 6);
        z.x = s.x; z.z = s.z; z.y = s.y || 0; z.ph += dt * (d / Math.max(dt, 1e-3) * 1.6 * (TY[s.ty]?.speed ? 1 : 1) + 1.5) * 0.9 / (TY[s.ty]?.s || 1); z.ty = s.ty; z.cr = s.cr; z.ch = s.ch;
        if (s.burn && !z.burnT) { z.flash = 1; z.fl = 1; } z.burnT = s.burn ? 0.4 : Math.max(0, z.burnT - dt); z.flash = Math.max(0, z.flash - dt * 5); z.fl = Math.max(0, (z.fl || 0) - dt * 6); }
      for (const id of zs.keys()) if (!seen.has(id)) { const z = zs.get(id); dying.push({ ...z, fade: 0 }); zs.delete(id); }
      let i = 0; for (const z of zs.values()) { if (i >= MAXZ) break; drawZ(i++, z, t, undefined, z.burnT > 0); }
      for (let k = dying.length - 1; k >= 0; k--) { const z = dying[k]; z.fade += dt * 0.8; z.fl = 0; if (z.fade >= 1) { dying.splice(k, 1); continue; } if (i < MAXZ) drawZ(i++, z, t, z.fade, z.fade < 0.5); }
      done(Z, i); done(arms2, i);
      // other players
      let j = 0; for (const p of st.players) { if (p.id === myId || !p.alive || j >= MAXP) continue; let q = ps.get(p.id);
        if (!q) ps.set(p.id, q = { x: p.x, z: p.z, y: p.y || 0, yaw: p.yaw || 0, ph: 0, spd: 0 });
        const d = Math.hypot(p.x - q.x, p.z - q.z); q.spd += (d / Math.max(dt, 1e-3) - q.spd) * Math.min(1, dt * 8); q.x = p.x; q.z = p.z; q.y = p.y || 0; q.yaw = p.r ?? q.yaw; q.pi = p.pi || 0; q.ph += dt * (q.spd > 0.5 ? 9 : 4);
        if (p.firing && (p.w === 0 || p.w === 1 || p.w === 4)) particles(dt, true, q.x + Math.sin(q.yaw) * 1.1, 1.25 + q.y, q.z + Math.cos(q.yaw) * 1.1, Math.sin(q.yaw), Math.cos(q.yaw), flameCol, 0.5, false, WP[p.w], Math.sin(q.pi || 0));   // others' flames (emit only)
        if (p.firing && p.w === 4) beamAt(q.x + Math.sin(q.yaw) * 1.1, 1.25 + q.y, q.z + Math.cos(q.yaw) * 1.1, q.yaw, 22);
        const n = nftOf && nftOf(p.id);   // verified NFT holder: their own character instead of the stock pyro
        if (!n && q.nc) { disposeNftChar(q.nc); q.nc = null; }   // ownership lapsed -> back to the stock pyro
        if (n && (!q.nc || q.nc.userData.nftId !== n.id)) { if (q.nc) disposeNftChar(q.nc); try { q.nc = buildNftChar(n, { srv, card: !low }); scene.add(q.nc); } catch (e) { q.nc = null; } }
        if (q.nc) { q.nc.visible = true; q.nc.position.set(q.x, q.y, q.z); q.nc.rotation.y = q.yaw; q.nc.rotation.x = 0; if (p.down) { q.nc.rotation.x = -1.3; q.nc.position.y = q.y + 0.25; } q.nc.userData.anim(t + p.id, q.spd > 0.5, true); q.seenT = t; continue; }
        q.down = p.down; const blink = p.inv && !p.down && Math.sin(t * 40) > 0; if (q.nc && p.inv && !p.down) q.nc.visible = !blink; drawP(j++, q, blink ? tmp2.setHex(0xffffff) : p.down ? tmp2.setHex(Math.sin(t * 8) > 0 ? 0xff2020 : 0x400000) : colorOf(p.id)); }
      for (const [id, q] of ps) if (q.nc && q.seenT !== t) { if (!st.players.some(p => p.id === id)) { disposeNftChar(q.nc); ps.delete(id); } else q.nc.visible = false; }
      fpTorso.visible = false; fpBody.update(dt, me);   // local player: no world-space torso/legs (sleeves + gloves live on the view-model gun)   // own body seen when looking down
      done(PL, j); done(PL2, j);
      // first-person weapon + flames
      gun.visible = !!me; if (me) { setW(me.w || 0); if (curAc != null) accent.material.color.setHex(curAc); else accent.material.color.copy(colorOf(myId)); heatV += ((me.firing ? 1 : 0) - heatV) * Math.min(1, dt * (me.firing ? 0.9 : 0.5)); hot.material.color.setRGB(0.19 + heatV * 0.81, 0.06 + heatV * 0.45, 0.03 + heatV * 0.1); pilot.scale.setScalar(0.8 + Math.random() * 0.5);
        if (me.firing) kick = Math.max(kick, 0.22); kick = Math.max(0, kick - dt * 7); swayT += dt;   // recoil settles back; idle aim sway
        gun.position.set(0.2 + Math.sin(swayT * 1.1) * 0.004, -0.18 + Math.sin(t * (me.moving ? 9 : 2)) * (me.moving ? 0.012 : 0.004) + Math.sin(swayT * 1.7) * 0.003 + kick * 0.012 + (me.firing ? (Math.random() - 0.5) * 0.006 : 0), -0.34 + kick * 0.06);
        gun.rotation.set(kick * 0.14, 0.04, 0); flash.visible = kick > 0.55 || (me.firing && (me.w === 3 || me.w === 2) && kick > 0.4); if (flash.visible) { flash.rotation.z = Math.random() * 6.28; flash.scale.setScalar(0.7 + Math.random() * 0.6); }
        const fx = Math.sin(me.yaw), fz = Math.cos(me.yaw), rx = -Math.cos(me.yaw), rz = Math.sin(me.yaw);
        const ox = me.x + fx * 1.5 + rx * 0.2, oz = me.z + fz * 1.5 + rz * 0.2;
        const my = me.y || 0, pr = WP[me.w || 0]; particles(dt, me.firing && (me.w === 0 || me.w === 1 || me.w === 4 || !me.w), ox, 1.38 + my + Math.sin(me.pitch || 0) * 1.5, oz, fx, fz, flameCol, 1, true, pr, Math.sin(me.pitch || 0)); if (me.firing && me.w === 4) beamAt(ox, 1.36 + my, oz, me.yaw, 22);
        if (heat) { heat.position.set(me.x + fx * 3, 1.4 + my, me.z + fz * 3); heat.intensity += ((me.firing ? 18 + Math.random() * 8 : 0) - heat.intensity) * Math.min(1, dt * 12); } }
      else particles(dt, false, 0, 0, 0, 0, 1);
      // napalm arcs -> pools (pools emit a few embers)
      let bi = 0; for (let k = blobs.length - 1; k >= 0; k--) { const b = blobs[k]; b.t += dt / 0.6; if (b.t >= 1) { blobs.splice(k, 1); if (pools.length < NPO) pools.push({ x: b.x1, z: b.z1, t: 0 }); burst(b.x1, 0.5, b.z1, 0, 0, low ? 10 : 24, { sp: 3, spr: 1, life: 0.6, col: WP[3].col }); continue; }
        M.makeTranslation(b.x0 + (b.x1 - b.x0) * b.t, 1.3 + Math.sin(b.t * Math.PI) * 4 - b.t * 1.2, b.z0 + (b.z1 - b.z0) * b.t); blobM.setMatrixAt(bi++, M); }
      blobM.count = bi; blobM.instanceMatrix.needsUpdate = true;
      let pi = 0; for (let k = pools.length - 1; k >= 0; k--) { const p = pools[k]; p.t += dt; if (p.t > 4) { pools.splice(k, 1); continue; } const r = 3.2 * Math.min(1, p.t * 4) * (p.t > 3.5 ? (4 - p.t) * 2 : 1);
        M.compose(V.set(p.x, 0.05, p.z), Q.identity(), S.set(r, 1, r)); poolM.setMatrixAt(pi++, M); if (Math.random() < (low ? 0.3 : 0.8)) burst(p.x + (Math.random() - 0.5) * r * 1.4, 0.2, p.z + (Math.random() - 0.5) * r * 1.4, 0, 0, 1, { sp: 0.5, spr: 1, life: 0.7, col: WP[3].col }); }
      poolM.count = pi; poolM.instanceMatrix.needsUpdate = true; beamM.count = nb; beamM.instanceMatrix.needsUpdate = true;
    },
  };
}
