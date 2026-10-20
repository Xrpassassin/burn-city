// Skate equipment: a data registry (deck, trucks, wheels, trail, trick FX) + a socketed board builder +
// the customization screen. Parts are built in deck space with fixed sockets (truck baseplates under the deck,
// wheels on the truck axles), all parented to one group, so flips, grinds and landings move them together.
// Phase 1: ownership = defaults + earned/purchased (server-side in later phases). Locked items can be previewed, not equipped.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const G = window.__skateGear = { items: {}, slots: ['deck', 'trucks', 'wheels', 'trail', 'fx'], loadout: null, owned: new Set(), onChange: null };

// ---------------------------------------------------------------- registry
// unlock: default | earn {what, n, label} | shop {item, xrp}   (shop prices are display placeholders until Phase 3)
const R = (slot, id, name, spec, unlock = { type: 'default' }) => { G.items[id] = { slot, id, name, spec, unlock }; };
// decks: shape + graphic (procedural canvas art, no image downloads)
R('deck', 'deck_ember', 'Ember Classic', { shape: 'popsicle', art: 'ember', grip: '#141414' });
R('deck', 'deck_ledger', 'Ledger Grid', { shape: 'popsicle', art: 'ledger', grip: '#141414' });
R('deck', 'deck_raccoon', 'RACC Bandit', { shape: 'popsicle', art: 'raccoon', grip: '#1a1a1a' }, { type: 'earn', what: 'score', n: 25000, label: 'Bank 25,000 total trick points' });
R('deck', 'deck_cruiser', 'Ash Cruiser', { shape: 'cruiser', art: 'ash', grip: '#202020' }, { type: 'earn', what: 'spots', n: 5, label: 'Discover 5 skate spots' });
R('deck', 'deck_fish', 'Old-School Fish', { shape: 'fish', art: 'retro', grip: '#181818' }, { type: 'earn', what: 'combo', n: 3000, label: 'Land a 3,000-point combo' });
R('deck', 'deck_inferno', 'Inferno Pro', { shape: 'popsicle', art: 'inferno', grip: '#120a08' }, { type: 'shop', item: 'sk_deck_inferno', xrp: 2 });
// trucks
R('trucks', 'trk_silver', 'Raw Silver', { color: 0xb8bec6, metal: .9 });
R('trucks', 'trk_black', 'Blackout', { color: 0x1c1d20, metal: .6 });
R('trucks', 'trk_ember', 'Ember Anodized', { color: 0xff6a1a, metal: .7 }, { type: 'earn', what: 'grind', n: 500, label: 'Grind 500 m total' });
R('trucks', 'trk_gold', 'Gold Hangers', { color: 0xffc83a, metal: 1 }, { type: 'shop', item: 'sk_trk_gold', xrp: 1 });
// wheels (diameter in mm)
R('wheels', 'whl_white', 'Classic 54', { color: 0xf2efe6, mm: 54 });
R('wheels', 'whl_smoke', 'Smoke 52', { color: 0x2a2a2e, mm: 52 });
R('wheels', 'whl_ember', 'Ember 56', { color: 0xff8a2a, mm: 56, glow: .25 }, { type: 'earn', what: 'tricks', n: 100, label: 'Land 100 tricks' });
R('wheels', 'whl_glow', 'Cyan Glow 54', { color: 0x5fe6ff, mm: 54, glow: .9 }, { type: 'earn', what: 'landing', n: 10, label: 'Clear 10 landing challenges' });
R('wheels', 'whl_magma', 'Magma Core 56', { color: 0xff3a10, mm: 56, glow: 1.2 }, { type: 'shop', item: 'sk_whl_magma', xrp: 1.5 });
// trail + trick FX (effects land in Phase 4; registry entries exist so loadouts are stable)
R('trail', 'trail_none', 'No Trail', { kind: 'none' });
R('trail', 'trail_sparks', 'Grind Sparks', { kind: 'sparks', color: 0xffd28a }, { type: 'earn', what: 'grind', n: 200, label: 'Grind 200 m total' });
R('trail', 'trail_flame', 'Wheel Flame Trail', { kind: 'flame', color: 0xff5a14 }, { type: 'shop', item: 'sk_trail_flame', xrp: 3 });
R('fx', 'fx_none', 'No Trick FX', { kind: 'none' });
R('fx', 'fx_embers', 'Landing Embers', { kind: 'embers', color: 0xff7a1a }, { type: 'earn', what: 'tricks', n: 250, label: 'Land 250 tricks' });

const DEFAULT = { deck: 'deck_ember', trucks: 'trk_silver', wheels: 'whl_white', trail: 'trail_none', fx: 'fx_none' };
for (const it of Object.values(G.items)) if (it.unlock.type === 'default') G.owned.add(it.id);
G.isOwned = id => G.owned.has(id);
G.grant = ids => { for (const id of ids) if (G.items[id]) G.owned.add(id); };
function loadLoadout() { let l = {}; try { l = JSON.parse(localStorage.getItem('bc_skate_loadout') || '{}'); } catch {} const out = { ...DEFAULT }; for (const s of G.slots) if (l[s] && G.items[l[s]] && G.items[l[s]].slot === s && G.isOwned(l[s])) out[s] = l[s]; return out; }
G.loadout = loadLoadout();
G.equip = (id) => { const it = G.items[id]; if (!it || !G.isOwned(id)) return false; G.loadout = { ...G.loadout, [it.slot]: id }; try { localStorage.setItem('bc_skate_loadout', JSON.stringify(G.loadout)); } catch {} G.onChange && G.onChange(G.loadout); return true; };

// ---------------------------------------------------------------- deck art (canvas, cached)
const artCache = {};
function deckArt(kind) {
  if (artCache[kind]) return artCache[kind];
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 512; const g = cv.getContext('2d'), W = 128, H = 512;
  const lin = (a, b) => { const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, a); gr.addColorStop(1, b); g.fillStyle = gr; g.fillRect(0, 0, W, H); };
  const flames = (col, n = 9, base = H) => { for (let i = 0; i < n; i++) { const x = (i + .5) * W / n, h = 120 + (i * 37 % 90); const fg = g.createLinearGradient(0, base, 0, base - h); fg.addColorStop(0, col); fg.addColorStop(1, 'rgba(255,90,20,0)'); g.fillStyle = fg; g.beginPath(); g.moveTo(x - 10, base); g.quadraticCurveTo(x - 4, base - h * .6, x + ((i % 2) - .5) * 8, base - h); g.quadraticCurveTo(x + 4, base - h * .5, x + 10, base); g.fill(); } };
  const word = (t, col, y, size = 30) => { g.save(); g.translate(W / 2, y); g.rotate(-Math.PI / 2); g.fillStyle = col; g.font = `900 ${size}px system-ui,sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, 0, 0); g.restore(); };
  if (kind === 'ember') { lin('#1a0d08', '#3a1408'); flames('#ff7a1a'); word('BURN', '#ffb35a', 200, 44); }
  else if (kind === 'ledger') { lin('#06121c', '#0c2034'); g.strokeStyle = '#2fd0ff55'; g.lineWidth = 1; for (let y = 0; y < H; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } for (let x = 0; x < W; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); } word('XRPL', '#7af0ff', 256, 40); }
  else if (kind === 'raccoon') { lin('#2a2a30', '#14141a'); for (let y = 30; y < H; y += 70) { g.fillStyle = '#0a0a0c'; g.fillRect(0, y, W, 26); } g.fillStyle = '#e8e8ea'; g.beginPath(); g.arc(64, 256, 34, 0, 7); g.fill(); g.fillStyle = '#16161a'; g.fillRect(28, 246, 72, 16); g.fillStyle = '#fff'; g.beginPath(); g.arc(50, 254, 5, 0, 7); g.arc(78, 254, 5, 0, 7); g.fill(); word('RACC', '#ffd23a', 400, 34); }
  else if (kind === 'ash') { lin('#5a5048', '#2a2420'); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,${120 + (i % 80)},40,${(i % 7) / 14})`; g.fillRect((i * 53) % W, (i * 97) % H, 2, 2); } word('ASH', '#ffcf8a', 256, 40); }
  else if (kind === 'retro') { lin('#ffcf3a', '#ff5a1a'); for (let y = 0; y < H; y += 40) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, y, W, 18); } word('FISH', '#2a1408', 256, 44); }
  else if (kind === 'inferno') { lin('#0a0402', '#200804'); flames('#ff3a0a', 11); flames('#ffd24a', 7, H - 10); g.save(); g.translate(0, H); g.scale(1, -1); flames('#ff3a0a', 11); g.restore(); word('INFERNO', '#fff1d8', 256, 30); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return artCache[kind] = t;
}

// ---------------------------------------------------------------- geometry
// deck outline in (x across, z along) metres; length .80 (cruiser .74), width .21 (cruiser .24); kicktails bent up
function deckGeometry(shape) {
  const L = shape === 'cruiser' ? .74 : .80, W = shape === 'cruiser' ? .24 : shape === 'fish' ? .25 : .21, hl = L / 2, hw = W / 2;
  const s = new THREE.Shape();
  if (shape === 'fish') { s.moveTo(0, hl); s.quadraticCurveTo(hw, hl - .02, hw, hl - .18); s.lineTo(hw * .8, -hl + .14); s.lineTo(hw * .95, -hl); s.lineTo(0, -hl + .06); s.lineTo(-hw * .95, -hl); s.lineTo(-hw * .8, -hl + .14); s.lineTo(-hw, hl - .18); s.quadraticCurveTo(-hw, hl - .02, 0, hl); }
  else { const r = hw; s.moveTo(-hw, -hl + r); s.lineTo(-hw, hl - r); s.absarc(0, hl - r, r, Math.PI, 0, true); s.lineTo(hw, -hl + r); s.absarc(0, -hl + r, r, 0, Math.PI, true); }
  const g = new THREE.ExtrudeGeometry(s, { depth: .012, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 1, curveSegments: 10 });
  g.rotateX(Math.PI / 2);   // shape y -> world -z? (we want shape y -> z): rotate so extrude depth goes down
  // after rotateX(+90°): shape (x, y, depth) -> (x, depth?, ...) ; normalise by mapping explicitly
  const P = g.attributes.position;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i);   // y = extrude depth (0..-.012), z = -shapeY
    const along = z, tail = Math.max(0, Math.abs(along) - (hl - .17));   // kick: last 17 cm curve upward
    P.setXYZ(i, x, y + tail * tail * 1.4 + tail * .08, along);
  }
  g.computeVertexNormals();
  // UVs: planar top-down for the graphic (u across, v along)
  const uv = new Float32Array(P.count * 2); for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) / W + .5; uv[i * 2 + 1] = P.getZ(i) / L + .5; } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return { g, L, W };
}
const truckGeo = (() => {
  const base = new THREE.BoxGeometry(.065, .008, .085).translate(0, -.004, 0);
  const king = new THREE.CylinderGeometry(.008, .008, .03, 6).translate(0, -.02, -.012);
  const hanger = new THREE.CylinderGeometry(.012, .018, .18, 8).rotateZ(Math.PI / 2).translate(0, -.038, .008);
  const yoke = new THREE.BoxGeometry(.05, .03, .03).translate(0, -.026, .006);
  const axle = new THREE.CylinderGeometry(.004, .004, .215, 6).rotateZ(Math.PI / 2).translate(0, -.04, .008);
  return mergeGeometries([base, king, hanger, yoke, axle].map(x => x.toNonIndexed()));
})();
export const AXLE_Y = -.04, TRUCK_Z = .215;   // sockets: truck baseplates 21.5 cm from centre; axle 4 cm below deck underside

// build (or rebuild) the parts into a group in deck space. Deck underside sits at y=0 of the group (wheels below it).
G.build = function build(group, loadout = G.loadout, pivot = 0) {   // pivot: parts are shifted down by this so the group can spin about the board's middle
  for (let i = group.children.length - 1; i >= 0; i--) { const o = group.children[i]; group.remove(o); if (o.geometry !== truckGeo) o.geometry?.dispose?.(); }
  const d = G.items[loadout.deck].spec, t = G.items[loadout.trucks].spec, w = G.items[loadout.wheels].spec;
  const { g: dg, L } = deckGeometry(d.shape);
  // two materials on one geometry via groups is overkill: draw grip (top) and graphic (bottom) as the same shape twice, offset
  const grip = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: d.grip, roughness: 1 })); grip.position.y = .1 + .015;
  const art = new THREE.Mesh(dg.clone(), new THREE.MeshStandardMaterial({ map: deckArt(d.art), roughness: .6 })); art.position.y = .1 + .0135; art.scale.set(.995, 1, .995);
  // flame-orange edge line so every deck reads at a distance
  const tz = Math.min(TRUCK_Z, L / 2 - .16);
  const tm = new THREE.MeshStandardMaterial({ color: t.color, metalness: t.metal, roughness: .3 });
  const wr = w.mm / 2000, wm = new THREE.MeshStandardMaterial({ color: w.color, roughness: .45, emissive: new THREE.Color(w.color).multiplyScalar(w.glow || 0) });
  const wheelG = new THREE.CylinderGeometry(wr, wr, .034, 14).rotateZ(Math.PI / 2);
  const parts = [grip, art];
  for (const z of [-tz, tz]) {
    const tr = new THREE.Mesh(truckGeo, tm); tr.position.set(0, .1, z); if (z < 0) tr.rotation.y = Math.PI; parts.push(tr);
    for (const x of [-.09, .09]) { const wh = new THREE.Mesh(wheelG, wm); wh.position.set(x, .1 + AXLE_Y, z + (z < 0 ? -.008 : .008)); wh.userData.wheel = true; parts.push(wh); }
  }
  // the whole board group: wheels' contact patch at y = .1 + AXLE_Y - wr; shift so contact is at y=0
  const lift = -(.1 + AXLE_Y - wr);
  for (const p of parts) { p.position.y += lift - pivot; p.castShadow = true; group.add(p); }
  group.userData.loadout = { ...loadout }; group.userData.deckTop = .1 + .015 + .003 + lift; group.userData.wheelR = wr;
  return group;
};

// ---------------------------------------------------------------- customization screen
let ui = null;
G.open = function open() {
  if (ui) return; const c = window.__city;
  const el = document.createElement('div'); el.id = 'skGear';
  el.innerHTML = `<div class="sg-card"><div class="sg-head"><b>🛹 Board setup</b><button class="sg-x" aria-label="Close">✕</button></div>
  <canvas class="sg-view"></canvas><div class="sg-tabs"></div><div class="sg-grid"></div><div class="sg-foot"><span class="sg-note"></span><button class="sg-eq">Equip</button></div></div>`;
  const css = document.createElement('style'); css.id = 'skGearCss';
  css.textContent = `#skGear{position:fixed;inset:0;z-index:40;background:rgba(6,4,8,.72);display:flex;align-items:center;justify-content:center;font:13px/1.35 system-ui,sans-serif;color:#ffe9d2}
  #skGear .sg-card{width:min(560px,94vw);max-height:92vh;display:flex;flex-direction:column;background:#140d0b;border:1px solid #ff7a1a55;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px #000a}
  #skGear .sg-head{display:flex;justify-content:space-between;align-items:center;padding:10px 14px}#skGear .sg-x{background:none;border:0;color:#ffe9d2;font-size:18px;padding:4px 8px}
  #skGear .sg-view{width:100%;height:min(34vh,240px);display:block;background:radial-gradient(#3a1a0c,#0c0706)}
  #skGear .sg-tabs{display:flex;gap:6px;padding:10px 12px 4px;overflow-x:auto}#skGear .sg-tabs button{flex:0 0 auto;border:1px solid #ff7a1a44;background:#1e1310;color:#ffd8b8;border-radius:999px;padding:6px 12px;font-weight:600}#skGear .sg-tabs button.on{background:#ff6a1a;color:#140d0b}
  #skGear .sg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;padding:8px 12px;overflow-y:auto;min-height:120px}
  #skGear .sg-it{border:1px solid #ffffff1a;background:#1b1210;border-radius:12px;padding:8px;text-align:left;color:inherit;position:relative}#skGear .sg-it.sel{border-color:#ff8a2a;box-shadow:0 0 0 1px #ff8a2a inset}#skGear .sg-it.eq::after{content:'EQUIPPED';position:absolute;top:6px;right:6px;font-size:9px;color:#5fe08a;font-weight:800}
  #skGear .sg-sw{height:26px;border-radius:7px;margin-bottom:6px}#skGear .sg-it small{display:block;opacity:.75;font-size:11px;margin-top:2px}#skGear .sg-it.lock{opacity:.8}#skGear .sg-it.lock .sg-sw{filter:saturate(.5) brightness(.7)}
  #skGear .sg-foot{display:flex;gap:10px;align-items:center;justify-content:space-between;padding:10px 14px calc(10px + env(safe-area-inset-bottom));border-top:1px solid #ffffff12}#skGear .sg-note{opacity:.85;font-size:12px}
  #skGear .sg-eq{background:#ff6a1a;color:#140d0b;border:0;border-radius:10px;padding:9px 18px;font-weight:800}#skGear .sg-eq:disabled{background:#3a2a24;color:#8a7a70}`;
  document.head.appendChild(css); document.body.appendChild(el);
  // preview renderer (created on open, disposed on close)
  const cv = el.querySelector('.sg-view'); const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true }); r.setPixelRatio(Math.min(2, devicePixelRatio)); r.outputColorSpace = THREE.SRGBColorSpace;
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(32, 2, .01, 10); cam.position.set(.55, .42, .75); cam.lookAt(0, .03, 0);
  sc.add(new THREE.HemisphereLight(0xffe6d0, 0x2a1408, 1.6)); const dl = new THREE.DirectionalLight(0xffffff, 2.2); dl.position.set(1, 2, 1.5); sc.add(dl); const rim = new THREE.PointLight(0xff6a1a, 3, 3); rim.position.set(-.6, .2, -.5); sc.add(rim);
  const holder = new THREE.Group(); sc.add(holder); const pv = new THREE.Group(); holder.add(pv);
  let preview = { ...G.loadout }, tab = 'deck', sel = G.loadout.deck;
  const rebuild = () => G.build(pv, preview);
  const sw = it => { const s = it.spec; if (it.slot === 'deck') return { ember: 'linear-gradient(#3a1408,#ff7a1a)', ledger: 'linear-gradient(#06121c,#2fd0ff)', raccoon: 'repeating-linear-gradient(90deg,#2a2a30 0 10px,#0a0a0c 10px 16px)', ash: 'linear-gradient(#5a5048,#ff9a3a)', retro: 'linear-gradient(#ffcf3a,#ff5a1a)', inferno: 'linear-gradient(90deg,#200804,#ff3a0a,#ffd24a)' }[s.art]; if (s.color != null) return '#' + new THREE.Color(s.color).getHexString(); return '#333'; };
  const note = el.querySelector('.sg-note'), eq = el.querySelector('.sg-eq');
  function lockText(it) { const u = it.unlock; return u.type === 'earn' ? '🔒 ' + u.label : u.type === 'shop' ? `🔥 ${u.xrp} XRP · shop opens soon` : ''; }
  function render() {
    el.querySelector('.sg-tabs').innerHTML = G.slots.map(s => `<button data-t="${s}" class="${s === tab ? 'on' : ''}">${{ deck: 'Deck', trucks: 'Trucks', wheels: 'Wheels', trail: 'Trail', fx: 'Trick FX' }[s]}</button>`).join('');
    const list = Object.values(G.items).filter(it => it.slot === tab);
    el.querySelector('.sg-grid').innerHTML = list.map(it => `<button class="sg-it ${G.isOwned(it.id) ? '' : 'lock'} ${it.id === sel ? 'sel' : ''} ${G.loadout[tab] === it.id ? 'eq' : ''}" data-id="${it.id}"><div class="sg-sw" style="background:${sw(it)}"></div><b>${it.name}</b><small>${G.isOwned(it.id) ? (it.spec.mm ? it.spec.mm + ' mm' : it.spec.kind === 'none' ? 'Off' : 'Owned') : lockText(it)}</small></button>`).join('');
    const it = G.items[sel]; const owned = G.isOwned(sel);
    eq.disabled = !owned || G.loadout[tab] === sel; eq.textContent = G.loadout[tab] === sel ? 'Equipped' : owned ? 'Equip' : 'Locked';
    note.textContent = owned ? (tab === 'trail' || tab === 'fx' ? 'Effects arrive in a later update; your pick is saved.' : 'Preview shows your full setup.') : lockText(it);
  }
  el.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) { if (e.target === el) close(); return; }
    if (b.classList.contains('sg-x')) return close();
    if (b.dataset.t) { tab = b.dataset.t; sel = G.loadout[tab]; preview = { ...G.loadout }; rebuild(); render(); return; }
    if (b.dataset.id) { sel = b.dataset.id; const it = G.items[sel]; if (it.slot !== 'trail' && it.slot !== 'fx') { preview = { ...G.loadout, [it.slot]: sel }; rebuild(); } render(); return; }
    if (b === eq && G.equip(sel)) { preview = { ...G.loadout }; rebuild(); render(); }
  });
  rebuild(); render();
  let raf = 0, last = performance.now(), spin = 0, drag = null;
  cv.addEventListener('pointerdown', e => { drag = e.clientX; cv.setPointerCapture(e.pointerId); }); cv.addEventListener('pointermove', e => { if (drag != null) { spin += (e.clientX - drag) * .01; drag = e.clientX; } }); cv.addEventListener('pointerup', () => drag = null);
  const loop = () => { raf = requestAnimationFrame(loop); const now = performance.now(), dt = (now - last) / 1000; last = now; if (drag == null) spin += dt * .5; holder.rotation.y = spin; holder.rotation.z = Math.sin(now / 1000 * .7) * .55 + (Math.sin(now / 1000 * .23) > .6 ? 2.6 : 0) * 0; const w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * r.getPixelRatio()) || cv.height !== Math.round(h * r.getPixelRatio())) { r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); } r.render(sc, cam); };
  loop();
  function close() { cancelAnimationFrame(raf); r.dispose(); r.forceContextLoss?.(); el.remove(); css.remove(); ui = null; }
  ui = { el, close, state: () => ({ tab, sel, preview, parts: pv.children.length }) };
  if (c && c.input) c.input.blocked = true;
};
G.close = () => ui && ui.close();
G.ui = () => ui && ui.state();
export default G;
