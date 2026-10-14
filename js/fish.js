// Lake fishing: dock + Tackle & Bait shop, cast / bobber / bite / reel minigame, fish log.
// Lake coins are a free game score: NO real value, cannot be bought with XRP, cannot be withdrawn.
// Signed in: server rolls + stores progress (anti-script limits). Guests: same rules locally (localStorage).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const Q = new URLSearchParams(location.search), SRV = Q.get('citysrv') || 'https://burn-city-game.fly.dev', LS = localStorage, W = () => window.__city;
export const SPECIES = [["minnow","Ledger Minnow",0,[0.05,0.3],3,{}],["bluegill","Bluegill Byte",0,[0.1,0.6],4,{}],["perch","Pond Perch",0,[0.2,1.2],5,{}],["carp","Mud Carp",0,[0.8,6],6,{}],["shiner","River Shiner",0,[0.05,0.4],3,{}],["dace","Silver Dace",0,[0.1,0.5],4,{}],["trout","Neon Trout",1,[0.5,4],12,{}],["bass","Amber Bass",1,[0.6,5],14,{}],["catfish","Glass Catfish",1,[1,9],15,{"night":1}],["pike","Spotted Pike",1,[1,8],16,{}],["eel","Moon Eel",2,[0.8,5],40,{"night":1}],["gar","Storm Gar",2,[2,12],45,{"weather":"storm"}],["koi","Gold Koi",2,[1,7],50,{}],["cod","Deepwater Cod",2,[3,20],48,{"deep":1}],["sturgeon","Phantom Sturgeon",3,[10,60],140,{"night":1,"deep":1}],["snapper","Lava Snapper",3,[2,14],120,{}],["salmon","Aurora Salmon",3,[3,18],130,{"weather":"bull"}],["leviathan","Burn Leviathan",4,[80,300],600,{"deep":1,"night":1}],["marlin","Crystal Marlin",4,[40,180],520,{"deep":1}],["whaleshark","XRP Whale Shark",4,[200,900],750,{"deep":1,"weather":"bull"}]], SHOP = {"rods":[["basic","Basic Rod",0,0],["carbon","Carbon Rod",150,1],["pro","Pro Rod",600,2],["legend","Ember Legend Rod",2000,3]], "baits":[["worm","Worm (free)",0,0],["shrimp","Shrimp",5,1],["glow","Glow Lure",20,2],["burnfly","Burn Fly",60,3]]};
const RW = [60, 25, 10, 4, 1], RN = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], RC = ['#cfd8e3', '#5aff8a', '#4aa8ff', '#c06bff', '#ffb020'];
const tier = (l, id) => (l.find(x => x[0] === id) || [0, 0, 0, 0])[3];
export function roll(rodId, baitId, ctx, rnd = Math.random) {
  const rt = tier(SHOP.rods, rodId), bt = tier(SHOP.baits, baitId), luck = rt * 0.5 + bt;
  const ok = SPECIES.filter(s => (!s[5].night || ctx.night) && (!s[5].deep || ctx.deep) && (!s[5].weather || s[5].weather === ctx.weather) && !(s[2] === 4 && bt < 2) && !(s[2] === 3 && bt < 1 && rt < 1));
  const w = ok.map(s => RW[s[2]] * Math.pow(1 + luck, s[2] * 0.6)); let x = rnd() * w.reduce((a, b) => a + b, 0), i = 0; while (x > w[i]) x -= w[i++];
  const s = ok[Math.min(i, ok.length - 1)], f = Math.pow(rnd(), Math.max(0.6, 1.6 - 0.25 * rt)), kg = +(s[3][0] + (s[3][1] - s[3][0]) * f).toFixed(2);
  return { id: s[0], name: s[1], r: s[2], kg, val: Math.round(s[4] * (1 + f)), hits: 1 + s[2], zone: +(0.3 - 0.04 * s[2] + 0.05 * rt).toFixed(2) };
}
const tok = () => { try { return LS.bcToken || '' } catch (e) { return '' } };
const api = (p, b) => fetch(SRV + '/api/fish/' + p, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok() }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
const blank = () => ({ coins: 0, rod: 'basic', rods: ['basic'], bait: { worm: -1 }, log: {}, creel: [], n: 0 });
let prof = (() => { try { return JSON.parse(LS.bcFish) || blank() } catch (e) { return blank() } })(), bait = 'worm';
const saveLocal = () => { if (!tok()) LS.bcFish = JSON.stringify(prof) };
const night = () => { const h = (new Date().getUTCHours() + 17) % 24; return h >= 19 || h < 6 };
const weather = () => { const t = (document.getElementById('wchip')?.textContent || '').toLowerCase(); return /storm|crash|rain/.test(t) ? 'storm' : /sunny|rainbow|gold|green/.test(t) ? 'bull' : '' };
// ---------- UI ----------
const css = document.createElement('style'); css.textContent = `#fBar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));z-index:31;display:none;gap:8px}#fBar button,#fUI button.b{font:700 14px system-ui;padding:10px 14px;border-radius:12px;border:1px solid #ffffff30;background:#0b1020dd;color:#fff}
#fBar button.hot{background:#1f7a5a}@media(max-width:700px){#fBar{bottom:calc(250px + env(safe-area-inset-bottom));white-space:nowrap}#fBar button{padding:8px 10px;font-size:13px}}#fUI{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:85;width:min(92vw,380px);max-height:80vh;overflow:auto;background:#0b1020f4;border:1px solid #ffffff26;border-radius:16px;padding:14px;color:#e8eefc;font:14px system-ui;display:none;box-sizing:border-box}
#fUI.on{display:block}#fUI h3{margin:0 0 8px}#fUI .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#fff;font-size:18px}#fUI .row{display:flex;justify-content:space-between;gap:6px;padding:6px 0;border-bottom:1px solid #ffffff12;align-items:center}
#fUI .note{font-size:11px;opacity:.65}#fUI .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}#fUI .grid div{padding:6px;border-radius:8px;background:#ffffff0d;font-size:12px}
#fReel{position:relative;height:26px;border-radius:13px;background:#ffffff14;margin:10px 0;overflow:hidden}#fReel i{position:absolute;top:0;bottom:0;background:#2bd96b66}#fReel b{position:absolute;top:-2px;bottom:-2px;width:6px;border-radius:3px;background:#fff}
#fBig{width:100%;padding:16px!important;font-size:18px!important;background:#ff7a1a!important}`; document.head.append(css);
const bar = document.createElement('div'); bar.id = 'fBar'; bar.innerHTML = '<button id="fCast" class="hot">🎣 Fish</button><button id="fShop">🛒 Tackle & Bait</button><button id="fLog">📖</button>'; document.body.append(bar);
const ui = document.createElement('div'); ui.id = 'fUI'; document.body.append(ui);
const open = h => { ui.innerHTML = '<button class="x" aria-label="Close">✕</button>' + h; ui.classList.add('on'); ui.querySelector('.x').onclick = close; }, close = () => { ui.classList.remove('on'); state = 'idle'; if (bob) bob.visible = false };
const coinsNote = '<div class="note">🪙 Lake coins are a free game score: no real value, not purchasable with XRP, not withdrawable.</div>';
function shopUI() {
  const rows = SHOP.rods.map(r => `<div class="row"><span>${r[1]}${prof.rod === r[0] ? ' ✓' : ''}</span><button class="b" data-k="rod" data-i="${r[0]}">${prof.rods.includes(r[0]) ? (prof.rod === r[0] ? 'Equipped' : 'Equip') : r[2] + ' 🪙'}</button></div>`).join('') +
    SHOP.baits.slice(1).map(b => `<div class="row"><span>${b[1]} ×${prof.bait[b[0]] || 0}${bait === b[0] ? ' (using)' : ''}</span><span><button class="b" data-u="${b[0]}">Use</button> <button class="b" data-k="bait" data-i="${b[0]}">+5 · ${b[2] * 5} 🪙</button></span></div>`).join('');
  const cv = prof.creel.reduce((a, f) => a + f[2], 0);
  open(`<h3>🛒 Tackle & Bait</h3><div class="row"><b>🪙 ${prof.coins} lake coins</b><span>Creel: ${prof.creel.length} fish</span></div><button class="b" id="fSell" style="width:100%;margin:6px 0">Sell creel · +${cv} 🪙</button>${rows}<div class="row"><span>Worm (free, unlimited)</span><button class="b" data-u="worm">Use</button></div>${coinsNote}`);
  ui.querySelector('#fSell').onclick = async () => { if (tok()) { const r = await api('sell', {}); if (r.profile) prof = r.profile } else { prof.coins += cv; prof.creel = []; saveLocal() } shopUI() };
  ui.querySelectorAll('[data-u]').forEach(b => b.onclick = () => { bait = b.dataset.u; shopUI() });
  ui.querySelectorAll('[data-k]').forEach(b => b.onclick = async () => { const k = b.dataset.k, id = b.dataset.i;
    if (tok()) { const r = await api('buy', { kind: k, id, qty: 5 }); if (r.profile) prof = r.profile; else toast(r.error === 'not_enough_coins' ? 'Not enough lake coins' : 'Shop busy') }
    else { const it = (k === 'rod' ? SHOP.rods : SHOP.baits).find(x => x[0] === id), cost = k === 'rod' ? it[2] : it[2] * 5;
      if (k === 'rod' && prof.rods.includes(id)) prof.rod = id; else if (prof.coins < cost) toast('Not enough lake coins'); else { prof.coins -= cost; if (k === 'rod') { prof.rods.push(id); prof.rod = id } else prof.bait[id] = (prof.bait[id] || 0) + 5 } saveLocal() } shopUI() });
}
function logUI() { const got = Object.keys(prof.log).length; open(`<h3>📖 Fish log · ${got}/20</h3><div class="grid">${SPECIES.map(s => { const L = prof.log[s[0]]; const tags = [s[5].night && '🌙', s[5].deep && '🚤', s[5].weather === 'storm' && '⛈', s[5].weather === 'bull' && '🌈'].filter(Boolean).join('');
  return `<div style="border-left:3px solid ${RC[s[2]]}"><b>${L ? s[1] : '???'}</b> ${tags}<br><span style="color:${RC[s[2]]}">${RN[s[2]]}</span>${L ? ` · ×${L.n} · best ${L.best} kg` : ''}</div>` }).join('')}</div><div class="note">🌙 night only · 🚤 deep water (boat) · ⛈ storm weather · 🌈 bullish weather</div>`) }
let toastT; function toast(t) { let e = document.getElementById('rToast'); if (!e) { e = document.createElement('div'); e.id = 'rToast'; e.style.cssText = 'position:fixed;left:50%;bottom:140px;transform:translateX(-50%);z-index:90;background:#140a04ee;color:#ffd27a;padding:10px 14px;border-radius:12px;font:600 14px system-ui'; document.body.append(e) } e.textContent = t; e.style.display = 'block'; clearTimeout(toastT); toastT = setTimeout(() => e.style.display = 'none', 3000) }
// ---------- world: dock + shop + bobber ----------
let spot = null, bob = null, state = 'idle';
function build() {
  const c = W(), e = window.__estate; if (!e || !e.inLake) return false; const { lakeC, dir, side } = e;
  let p = lakeC.clone().addScaledVector(side, 48); for (let k = 0; k < 400 && e.inLake(p.x, p.z); k++) p.addScaledVector(dir, -1);   // city shore point, clear of the highway
  const yaw = Math.atan2(dir.x, dir.z), g = [], B = (w, h, d, x, y, z) => g.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  for (let z = -2; z < 24; z += 1.2) B(5, 0.18, 1, 0, 0.7, z); for (let z = 0; z <= 24; z += 6) for (const x of [-2.3, 2.3]) B(0.4, 1.6, 0.4, x, 0.1, z);
  const shop = [], S2 = (w, h, d, x, y, z) => shop.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z)); S2(8, 4.5, 6, 11, 2.25, -9); S2(9, 0.5, 7, 11, 4.7, -9);
  const grp = new THREE.Group(); grp.position.copy(p); grp.rotation.y = yaw;
  grp.add(new THREE.Mesh(mergeGeometries(g), new THREE.MeshLambertMaterial({ color: 0x8a5a32, emissive: 0x3a2412 })), new THREE.Mesh(mergeGeometries(shop), new THREE.MeshLambertMaterial({ color: 0x4a5e5a, emissive: 0x141c1a })));
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = '#10222a'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#ffd27a'; x.font = '800 30px system-ui'; x.textAlign = 'center'; x.fillText('Tackle & Bait', 128, 43);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv) })); sign.position.set(11, 3.6, -5.95); grp.add(sign); c.S.add(grp);
  grp.updateMatrixWorld(); const L = v => v.applyMatrix4(grp.matrixWorld);
  for (let z = 0; z < 24; z += 3) { const q = L(new THREE.Vector3(0, 0, z)); c.colliders.push({ x: q.x, z: q.z, r: 2.4, h: 0.8 }) }
  const sq = L(new THREE.Vector3(11, 0, -9)); c.colliders.push({ x: sq.x, z: sq.z, r: 3.6, h: 4.9 });
  spot = { grp, dockEnd: L(new THREE.Vector3(0, 0.8, 23)), shop: L(new THREE.Vector3(11, 0, -4.5)), dir, base: p.clone() };
  bob = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b2f })); bob.visible = false; c.S.add(bob);
  window.__fishSpot = spot; return true;
}
const _f = new THREE.Vector3();
function nearWater() { const c = W(), e = window.__estate; if (!spot) return null; const m = c.getMode(), boat = window.__boat && window.__boat.on;
  if (boat) return { deep: true, from: window.__boat.pos }; if (m !== 'explore') return null; const P = c.P.pos;
  if (P.distanceTo(spot.dockEnd) < 5) return { deep: false, from: P }; if (e.inLake(P.x, P.z, 6) && !e.inLake(P.x, P.z, 0)) return { deep: false, from: P }; return null }
let cur = null;
async function doCast() {
  const w = nearWater(); if (!w || state !== 'idle') return; const c = W(), e = window.__estate; state = 'wait';
  c.C.getWorldDirection(_f); _f.y = 0; _f.normalize(); const t = w.from.clone().addScaledVector(_f, 10); if (!e.inLake(t.x, t.z)) t.copy(spot.dockEnd).addScaledVector(spot.dir, 9);
  bob.position.set(t.x, 0.45, t.z); bob.visible = true;
  open('<h3>🎣 Waiting for a bite…</h3><div class="note">Bait: ' + (SHOP.baits.find(b => b[0] === bait) || [0, 'Worm'])[1] + ' · Rod: ' + (SHOP.rods.find(r => r[0] === prof.rod) || [0, 'Basic'])[1] + '</div>');
  let wait; if (tok()) { const r = await api('cast', { bait, deep: w.deep, weather: weather() }); if (r.error) { toast(r.error === 'too_fast' ? 'Let the line settle a moment' : r.error === 'hourly_limit' ? 'The fish need a rest (hourly limit)' : 'Lake busy'); close(); return } cur = { cid: r.cid, hits: r.hits, zone: r.zone, r: r.r }; wait = r.wait }
  else { if (bait !== 'worm' && !(prof.bait[bait] > 0)) bait = 'worm'; const f = roll(prof.rod, bait, { night: night(), deep: w.deep, weather: weather() }); cur = { fish: f, hits: f.hits, zone: f.zone, r: f.r }; wait = 2500 + Math.random() * 6000 }
  setTimeout(bite, wait);
}
function bite() { if (state !== 'wait') return; state = 'bite'; const t0 = performance.now();
  open('<h3>❗ Bite!</h3><button class="b" id="fBig">Hook it!</button>'); ui.querySelector('#fBig').onclick = () => { if (performance.now() - t0 < 2500) reelGame(); else lose() }; setTimeout(() => { if (state === "bite") lose() }, 2500) }
function reelGame() { state = 'reel'; let hits = 0, miss = 0; const zw = Math.max(0.12, cur.zone), z0 = Math.random() * (1 - zw), sp = 0.7 + cur.r * 0.35, t0 = performance.now();
  open(`<h3>🎣 Reel it in!</h3><div id="fReel"><i style="left:${z0 * 100}%;width:${zw * 100}%"></i><b></b></div><div class="row"><span id="fHits">0/${cur.hits}</span><span id="fMiss">❌ 0/3</span></div><button class="b" id="fBig">Reel!</button><div class="note">Tap when the marker is in the green zone.</div>`);
  const mk = ui.querySelector('#fReel b'); let pos = 0; const anim = () => { if (state !== 'reel') return; pos = 0.5 + 0.5 * Math.sin((performance.now() - t0) / 1000 * sp * 3.1); mk.style.left = 'calc(' + (pos * 100) + '% - 3px)'; requestAnimationFrame(anim) }; anim();
  ui.querySelector('#fBig').onclick = () => { if (pos >= z0 && pos <= z0 + zw) { hits++; bob.position.y = 0.2 } else miss++; ui.querySelector('#fHits').textContent = hits + '/' + cur.hits; ui.querySelector('#fMiss').textContent = '❌ ' + miss + '/3'; if (hits >= cur.hits) land(); else if (miss >= 3) lose() } }
async function land() { state = 'done'; let f;
  if (tok()) { const r = await api('reel', { cid: cur.cid, ok: true }); if (!r.fish) { toast('It slipped away'); close(); return } f = r.fish; prof = r.profile }
  else { f = cur.fish; if (bait !== 'worm') prof.bait[bait] = Math.max(0, (prof.bait[bait] || 0) - 1); const L = prof.log[f.id] || { n: 0, best: 0 }; L.n++; L.best = Math.max(L.best, f.kg); prof.log[f.id] = L; prof.creel.push([f.id, f.kg, f.val]); prof.n++; saveLocal() }
  open(`<h3 style="color:${RC[f.r]}">🐟 ${f.name}</h3><div class="row"><span>${RN[f.r]}</span><b>${f.kg} kg</b></div><div class="row"><span>Sells for</span><b>${f.val} 🪙</b></div><button class="b" id="fAgain" style="width:100%;margin-top:8px">Cast again</button>${coinsNote}`);
  ui.querySelector('#fAgain').onclick = () => { close(); doCast() }; bob.visible = false }
async function lose() { state = 'done'; if (tok() && cur && cur.cid) api('reel', { cid: cur.cid, ok: false }).catch(() => { }); else if (bait !== 'worm') { prof.bait[bait] = Math.max(0, (prof.bait[bait] || 0) - 1); saveLocal() } open('<h3>💨 It got away</h3><button class="b" id="fAgain" style="width:100%">Cast again</button>'); ui.querySelector('#fAgain').onclick = () => { close(); doCast() }; bob.visible = false }
bar.querySelector('#fCast').onclick = e => { e.stopPropagation(); doCast() }; bar.querySelector('#fShop').onclick = e => { e.stopPropagation(); shopUI() }; bar.querySelector('#fLog').onclick = e => { e.stopPropagation(); logUI() };
function tick() { requestAnimationFrame(tick); if (!spot) return; const c = W(), w = nearWater(), m = c.getMode(), nearShop = m === 'explore' && c.P.pos.distanceTo(spot.shop) < 7;
  bar.style.display = (w || nearShop) ? 'flex' : 'none'; bar.querySelector('#fCast').style.display = w ? '' : 'none'; bar.querySelector('#fShop').style.display = nearShop || (w && !w.deep && c.P.pos.distanceTo(spot.shop) < 40) ? '' : 'none';
  if (bob && bob.visible) bob.position.y += ((state === 'bite' ? 0.05 : 0.45 + Math.sin(performance.now() / 400) * 0.06) - bob.position.y) * 0.2 }
(function boot() { if (!window.__ready || !W() || !window.__estate) return setTimeout(boot, 500); if (!build()) return; requestAnimationFrame(tick); if (tok()) api('state').then(r => { if (r && r.rod) prof = r }).catch(() => { }) })();
window.__fish = { prof: () => prof, shopUI, logUI, doCast, roll };
