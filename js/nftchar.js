// Burn City NFT characters: a light low-poly figure built from a holder's own RACC / Firekeepers / 589 Protocol NFT.
// Body colours are sampled server-side from that NFT's image, accessories come from its trait list, and the NFT's
// actual artwork is shown as a chest panel + floating card so it visibly is *that* NFT. ~20 meshes, Lambert only, shared geometry.
import * as THREE from 'three';
const G = new Map(), TX = new Map(), MT = new Map();
const geo = (k, f) => G.get(k) || (G.set(k, f()), G.get(k));
const box = (w, h, d, y = 0) => geo(`b${w},${h},${d},${y}`, () => new THREE.BoxGeometry(w, h, d).translate(0, y, 0));
const lam = (c, e) => { const k = c + '|' + (e || ''); if (!MT.has(k)) MT.set(k, new THREE.MeshLambertMaterial({ color: c, emissive: e || new THREE.Color(c).multiplyScalar(0.28) })); return MT.get(k); };   // slight self-light so NFT colours read at night
const glow = c => { const k = 'g' + c; if (!MT.has(k)) MT.set(k, new THREE.MeshBasicMaterial({ color: c })); return MT.get(k); };
export function nftImg(srv, n) { return n && n.img ? srv.replace(/\/$/, '') + n.img.replace(/\.webp$/, '.jpg') : ''; }
function tex(url) {
  if (!url) return null; if (TX.has(url)) return TX.get(url);
  const t = new THREE.TextureLoader().setCrossOrigin('anonymous').load(url, x => { x.needsUpdate = true; }, undefined, () => {});
  if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; TX.set(url, t); return t;
}
const C = new THREE.Color(), shade = (h, k) => '#' + C.set(h || '#888').multiplyScalar(k).getHexString();
const has = (t, re) => t.some(v => re.test(v));
// n = {key:'racc'|'fk'|'589', pal:{bg,top,face,body,acc}, t|traits:[...values]}; opts = {srv, card:true, panel:true}
export function buildNftChar(n, opts = {}) {
  const pal = n.pal || {}, key = n.key, tr = (n.t || (n.traits || []).filter(a => !/background/i.test(a[0])).map(a => a[1])).map(v => String(v).toLowerCase());
  const g = new THREE.Group(), add = (geo, mat, x, y, z, p = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); p.add(m); return m; };
  const body = pal.body || '#555', face = key === 'racc' ? '#8e9196' : (pal.face || '#c9a27e'), acc = pal.acc || '#ff7a1a', top = pal.top || body;
  const skin = lam(face), cloth = lam(body), dark = lam(shade(body, 0.55)), accM = glow(acc);
  // legs + arms on pivots (hip / shoulder) so callers can swing them
  const legs = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.16, 0.8, 0); add(box(0.22, 0.8, 0.24, -0.4), dark, 0, 0, 0, p); add(box(0.25, 0.12, 0.32, -0.76), lam('#1b1b1f'), 0, 0, 0.04, p); g.add(p); return p; });
  const torso = add(box(0.64, 0.74, 0.36, 0.37), cloth, 0, 0.78, 0);
  const arms = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.42, 1.44, 0); add(box(0.17, 0.66, 0.18, -0.33), cloth, 0, 0, 0, p); add(box(0.15, 0.14, 0.16, -0.7), skin, 0, 0, 0, p); g.add(p); return p; });
  // head by collection
  const head = new THREE.Group(); head.position.set(0, 1.56, 0); g.add(head);
  if (key === 'racc') {             // raccoon: grey head, dark eye mask, pale snout, round ears, ringed tail
    add(box(0.5, 0.44, 0.44, 0.22), skin, 0, 0, 0, head);
    add(box(0.52, 0.12, 0.06), lam(has(tr, /red mask/) ? '#c4161c' : '#1a1a1d'), 0, 0.28, 0.21, head);
    add(box(0.22, 0.14, 0.14), lam('#e9e4da'), 0, 0.12, 0.27, head); add(box(0.08, 0.06, 0.05), lam('#111'), 0, 0.17, 0.35, head);
    for (const s of [-1, 1]) { add(box(0.14, 0.16, 0.06), skin, s * 0.18, 0.5, 0, head); add(box(0.07, 0.07, 0.03), glow('#ffffff'), s * 0.12, 0.29, 0.25, head); }
    const tail = new THREE.Group(); tail.position.set(0, 0.85, -0.22); tail.rotation.x = -0.9; g.add(tail);
    for (let i = 0; i < 4; i++) add(box(0.16, 0.16, 0.14), lam(i % 2 ? '#2a2a2e' : '#9a9da3'), 0, 0, -i * 0.14, tail);
  } else {
    add(box(0.42, 0.46, 0.42, 0.23), skin, 0, 0, 0, head);
    for (const s of [-1, 1]) add(box(0.08, 0.06, 0.03), key === '589' || has(tr, /flaming eyes|burn eye|melt/) ? accM : glow('#ffffff'), s * 0.1, 0.28, 0.22, head);
  }
  // trait accessories (keyword match on the NFT's trait values)
  const near = (a, b) => { const x = new THREE.Color(a || '#000'), y = new THREE.Color(b || '#fff'); return Math.abs(x.r - y.r) + Math.abs(x.g - y.g) + Math.abs(x.b - y.b) < 0.35; };
  const hatC = lam(near(top, pal.bg) ? acc : top);   // hat region sampled mostly background -> use the NFT's accent colour
  if (has(tr, /helmet/)) { add(box(0.5, 0.26, 0.5, 0.13), lam(shade(top, 1)), 0, 0.36, 0, head); }
  else if (has(tr, /crown/)) { add(box(0.46, 0.1, 0.46), glow('#ffcc33'), 0, 0.5, 0, head); for (const s of [-1, 0, 1]) add(box(0.08, 0.14, 0.08), glow('#ffcc33'), s * 0.16, 0.6, 0.18, head); }
  else if (has(tr, /hood/)) { add(box(0.52, 0.56, 0.5, 0.25), lam(shade(body, 0.8)), 0, 0.02, -0.04, head); }
  else if (has(tr, /hat|cap|fitted|beanie|visor|sweatband|headband/)) { add(box(0.48, 0.16, 0.48), hatC, 0, 0.5, 0, head); if (!has(tr, /beanie|band/)) add(box(0.44, 0.04, 0.24), hatC, 0, 0.43, 0.3, head); }
  if (has(tr, /horn/)) for (const s of [-1, 1]) { const h = add(geo('horn', () => new THREE.ConeGeometry(0.06, 0.3, 5)), lam('#e8dcc0'), s * 0.3, 0.5, 0, head); h.rotation.z = -s * 0.7; }
  if (has(tr, /shade|sunglass|frames|goggle/)) add(box(0.46, 0.08, 0.05), lam(has(tr, /gold/) ? '#d4a017' : '#0b0b0d'), 0, 0.28, 0.23, head);
  if (has(tr, /flame|fire|on fire|dreds/) || key === 'fk') { const fm = glow(acc); for (const [x, s] of [[-0.12, 0.8], [0.02, 1.1], [0.15, 0.75]]) { const f = add(geo('fl', () => new THREE.ConeGeometry(0.09, 0.32, 5)), fm, x, 0.62 + s * 0.08, -0.04, head); f.scale.setScalar(s); f.userData.flame = 1; } }
  if (has(tr, /chain|medallion|necklace|gold pick|grill/)) add(geo('neck', () => new THREE.TorusGeometry(0.2, 0.03, 4, 12)), glow('#e8b923'), 0, 1.42, 0.04).rotation.x = 1.3;
  if (has(tr, /armor|fur|collar|cape/)) for (const s of [-1, 1]) add(box(0.26, 0.12, 0.42), lam(shade(top, 0.9)), s * 0.34, 1.5, 0);
  if (key === '589') add(box(0.66, 0.06, 0.38), accM, 0, 0.8, 0);   // glowing $BURN belt
  // the NFT itself: chest panel + floating card
  const url = opts.srv ? nftImg(opts.srv, n) : '';
  if (url && opts.panel !== false) { const pm = new THREE.MeshBasicMaterial({ map: tex(url) }); add(geo('pan', () => new THREE.PlaneGeometry(0.46, 0.46)), pm, 0, 1.14, 0.185); }
  if (url && opts.card) { const sm = new THREE.SpriteMaterial({ map: tex(url), depthWrite: false }); const sp = new THREE.Sprite(sm); sp.scale.set(0.8, 0.8, 1); sp.position.set(0, 2.75, 0); g.add(sp); g.userData.card = sp;
    const fr = new THREE.Sprite(new THREE.SpriteMaterial({ color: acc, depthWrite: false })); fr.scale.set(0.9, 0.9, 1); fr.position.set(0, 2.75, -0.01); fr.renderOrder = -1; g.add(fr); g.userData.frame = fr; }
  g.userData.legs = legs; g.userData.arms = arms; g.userData.head = head; g.userData.nftId = n.id;
  g.userData.anim = (t, moving, armsUp) => { const sw = moving ? Math.sin(t * 9) * 0.7 : Math.sin(t * 2) * 0.04;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw; if (armsUp) { arms[0].rotation.x = arms[1].rotation.x = -1.25; } else { arms[0].rotation.x = -sw * 0.8; arms[1].rotation.x = sw * 0.8; }
    head.children.forEach(c => { if (c.userData.flame) c.scale.y = 0.8 + Math.random() * 0.5; });
    if (g.userData.card) g.userData.card.position.y = g.userData.frame.position.y = 2.75 + Math.sin(t * 2) * 0.06; };
  g.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
  return g;
}
export function disposeNftChar(g) { g.traverse(o => { if (o.isSprite || (o.isMesh && o.material.map)) o.material.dispose(); }); g.removeFromParent(); }
