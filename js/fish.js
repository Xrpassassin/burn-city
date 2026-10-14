// Lake fishing: dock + Tackle & Bait shop, cast / bobber / bite / reel minigame, fish log.
// Lake coins are a free in-game score: NO real value, cannot be bought with XRP, cannot be withdrawn.
// Signed in: server rolls + stores progress (anti-script limits). Guests: same rules locally (localStorage).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
const SPECIES = [["minnow","Ledger Minnow",0,[0.05,0.3],3,{}],["bluegill","Bluegill Byte",0,[0.1,0.6],4,{}],["perch","Pond Perch",0,[0.2,1.2],5,{}],["carp","Mud Carp",0,[0.8,6],6,{}],["shiner","River Shiner",0,[0.05,0.4],3,{}],["dace","Silver Dace",0,[0.1,0.5],4,{}],["trout","Neon Trout",1,[0.5,4],12,{}],["bass","Amber Bass",1,[0.6,5],14,{}],["catfish","Glass Catfish",1,[1,9],15,{"night":1}],["pike","Spotted Pike",1,[1,8],16,{}],["eel","Moon Eel",2,[0.8,5],40,{"night":1}],["gar","Storm Gar",2,[2,12],45,{"weather":"storm"}],["koi","Gold Koi",2,[1,7],50,{}],["cod","Deepwater Cod",2,[3,20],48,{"deep":1}],["sturgeon","Phantom Sturgeon",3,[10,60],140,{"night":1,"deep":1}],["snapper","Lava Snapper",3,[2,14],120,{}],["salmon","Aurora Salmon",3,[3,18],130,{"weather":"bull"}],["leviathan","Burn Leviathan",4,[80,300],600,{"deep":1,"night":1}],["marlin","Crystal Marlin",4,[40,180],520,{"deep":1}],["whaleshark","XRP Whale Shark",4,[200,900],750,{"deep":1,"weather":"bull"}]], SHOP = {"rods":[["basic","Basic Rod",0,0],["carbon","Carbon Rod",150,1],["pro","Pro Rod",600,2],["legend","Ember Legend Rod",2000,3]], "baits":[["worm","Worm (free)",0,0],["shrimp","Shrimp",5,1],["glow","Glow Lure",20,2],["burnfly","Burn Fly",60,3]]}, RW = [60, 25, 10, 4, 1], RN = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'], RC = ['#c8d0dc', '#5aff9a', '#4aa8ff', '#c06bff', '#ffb020'];
const Q = new URLSearchParams(location.search), SRV = Q.get('citysrv') || 'https://burn-city-game.fly.dev', LS = localStorage;
const tok = () => { try { return LS.bcToken || '' } catch (e) { return '' } };
const api = (p, b) => fetch(SRV + '/api/fish/' + p, { method: b ? 'POST' : 'GET', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + tok() }, body: b ? JSON.stringify(b) : undefined }).then(r => r.json());
const W = () => window.__city, $ = id => document.getElementById(id);
const tier = (list, id) => (list.find(x => x[0] === id) || [0, 0, 0, 0])[3];
function roll(rodId, baitId, ctx) { const rt = tier(SHOP.rods, rodId), bt = tier(SHOP.baits, baitId), luck = rt * 0.5 + bt;
  const ok = SPECIES.filter(s => (!s[5].night || ctx.night) && (!s[5].deep || ctx.deep) && (!s[5].weather || s[5].weather === ctx.weather) && !(s[2] === 4 && bt < 2) && !(s[2] === 3 && bt < 1 && rt < 1));
  const w = ok.map(s => RW[s[2]] * Math.pow(1 + luck, s[2] * 0.6)); let x = Math.random() * w.reduce((a, b) => a + b, 0), i = 0; while (x > w[i]) x -= w[i++];
  const s = ok[Math.min(i, ok.length - 1)], f = Math.pow(Math.random(), Math.max(0.6, 1.6 - 0.25 * rt)), kg = +(s[3][0] + (s[3][1] - s[3][0]) * f).toFixed(2);
  return { id: s[0], name: s[1], r: s[2], kg, val: Math.round(s[4] * (1 + f)), hits: 1 + s[2], zone: +(0.3 - 0.04 * s[2] + 0.05 * rt).toFixed(2) } }
const night = () => { const h = (new Date().getUTCHours() + 17) % 24; return h >= 19 || h < 6 };
const weather = () => { const t = ($('wchip')?.textContent || '').toLowerCase(); return /storm|crash/.test(t) ? 'storm' : /green|rainbow|gold/.test(t) ? 'bull' : '' };
const isDeep = () => !!(window.__boat && window.__boat.active);
let prof = (() => { try { return JSON.parse(LS.bcFish || 'null') } catch (e) { return null } })() || { coins: 0, rod: 'basic', rods: ['basic'], bait: { worm: -1 }, log: {}, creel: [], n: 0 };
const saveLocal = () => { LS.bcFish = JSON.stringify(prof) };
let bait = 'worm';
// ---------- world: dock + shop on the city shore ----------
let dock = null, shopPos = null, bobber = null, rod = null;
const ROD_LOOK = { basic: [0x8a5a2b, 0], carbon: [0x1c1c22, 0x2a6aff], pro: [0x2a6aff, 0x2ad0ff], legend: [0xff7a18, 0xff3a00] };
const castFrom = new THREE.Vector3(), castTo = new THREE.Vector3();
function build() {
  const c = W(), e = window.__estate; if (!e) return; const { lakeC, dir, side } = e;
  const shoreAt = u => { const p = lakeC.clone().addScaledVector(side, u).addScaledVector(dir, -e.D * 2); for (let k = 0; k < 300; k++) { if (e.inLake(p.x, p.z)) return p; p.addScaledVector(dir, 1) } return p };
  const base = shoreAt(-55), yaw = Math.atan2(dir.x, dir.z), g = [], P = (w, h, d, x, y, z) => g.push(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  for (let z = -2; z < 22; z += 1.1) P(4.2, 0.18, 0.9, 0, 1.1, z); for (const x of [-1.9, 1.9]) for (let z = 0; z < 22; z += 5) P(0.35, 2.2, 0.35, x, 0.3, z); P(0.15, 0.9, 22, -2.05, 1.6, 10); P(0.15, 0.9, 22, 2.05, 1.6, 10);
  const dm = new THREE.Mesh(mergeGeometries(g), new THREE.MeshLambertMaterial({ color: 0x8a6440 })); dm.position.copy(base).setY(0); dm.rotation.y = yaw; c.S.add(dm);
  dock = { base, tip: base.clone().addScaledVector(dir, 20).setY(1.2), yaw, dir, side };
  // Tackle & Bait shop: small cabin + glowing sign
  shopPos = base.clone().addScaledVector(dir, -14).addScaledVector(side, 9); const sg = [new THREE.BoxGeometry(9, 4.5, 7).translate(0, 2.25, 0), new THREE.BoxGeometry(10, 0.5, 8).translate(0, 4.7, 0)];
  const sh = new THREE.Mesh(mergeGeometries(sg), new THREE.MeshLambertMaterial({ color: 0x5a3a24, emissive: 0x1a0c04 })); sh.position.copy(shopPos).setY(0); sh.rotation.y = yaw; c.S.add(sh);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d'); x.fillStyle = '#0d1a10'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#7dffb0'; x.font = '800 30px system-ui,sans-serif'; x.textAlign = 'center'; x.fillText('🎣 Tackle & Bait', 128, 43);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), toneMapped: false })); sign.position.copy(shopPos).addScaledVector(dir, 3.55).setY(3.4); sign.rotation.y = yaw; c.S.add(sign);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 7), new THREE.MeshBasicMaterial({ visible: false })); hit.position.copy(shopPos).setY(2.5); hit.rotation.y = yaw; hit.userData = { kind: 'tackle' }; c.S.add(hit); c.pick && c.pick.push(hit);
  bobber = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3a2a })); bobber.visible = false; c.S.add(bobber);
  const rg = new THREE.Group(), rm = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: .5 }), seg = [];
  for (let i = 0; i < 3; i++) { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(.03 - i * .008, .045 - i * .01, .8, 6).translate(0, .4, 0), rm); g.add(m); g.position.y = i ? .8 : 0; (i ? seg[i - 1] : rg).add(g); seg.push(g) }
  const reelM = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .08, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x999999, metalness: .8 })); reelM.position.set(.05, .25, 0); rg.add(reelM);
  const tip = new THREE.Object3D(); tip.position.y = .8; seg[2].add(tip); rg.position.set(.32, 1.05, -.15); rg.rotation.x = -.9; rg.visible = false; c.avatar.add(rg);
  const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: .7 })); line.frustumCulled = false; line.visible = false; c.S.add(line);
  const fm = new THREE.Mesh(new THREE.SphereGeometry(.35, 10, 8).scale(1, .55, 2.1), new THREE.MeshStandardMaterial({ color: 0xc8d0dc, emissive: 0x222222, metalness: .6, roughness: .3 })); fm.visible = false; c.S.add(fm);
  rod = { rg, rm, seg, tip, line, lg, fm, swing: 0, lift: 0, pull: 0 };
  window.__fishWorld = { dock, shopPos, shoreAt };
  const decks = window.__decks = window.__decks || []; decks.push({ base, dir, side, v0: -3, v1: 21.6, hw: 2.1, h: 1.2 });
  window.__deckAt = (x, z) => { for (const k of decks) { const dx = x - k.base.x, dz = z - k.base.z, v = dx * k.dir.x + dz * k.dir.z, u = dx * k.side.x + dz * k.side.z; if (v > k.v0 && v < k.v1 && Math.abs(u) < k.hw) return k.h } return null };
}
// ---------- UI ----------
const css = document.createElement('style'); css.textContent = `#fBar{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));display:none;gap:8px;z-index:31}#fBar button,#fUI button{font:700 15px system-ui;padding:11px 16px;border-radius:12px;border:1px solid #7dffb066;background:#0b1a12e6;color:#dfffe9}
#fUI{position:fixed;left:0;right:0;margin:0 auto;bottom:calc(140px + env(safe-area-inset-bottom));width:min(92vw,360px);box-sizing:border-box;z-index:32;background:#08120ce8;border:1px solid #7dffb055;border-radius:14px;padding:12px;color:#e8fff0;font:14px system-ui;display:none;text-align:center}
#fUI .bar{position:relative;height:26px;border-radius:8px;background:#1a2a20;margin:10px 0;overflow:hidden}#fUI .zone{position:absolute;top:0;bottom:0;background:#3dff8a88}#fUI .mk{position:absolute;top:-2px;bottom:-2px;width:5px;background:#fff;border-radius:3px}
#fPanel{position:fixed;inset:0;margin:auto;width:min(94vw,420px);height:min(80vh,560px);box-sizing:border-box;overflow:auto;z-index:85;background:#07100bf5;border:1px solid #7dffb055;border-radius:16px;padding:14px;color:#e8fff0;font:14px system-ui;display:none}
#fPanel .x{position:absolute;right:10px;top:8px;background:none;border:0;color:#fff;font-size:20px}#fPanel .g{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}#fPanel .c{border:1px solid #ffffff1a;border-radius:10px;padding:6px 8px;font-size:12px}#fPanel button.b{margin:3px 0;width:100%;padding:9px;border-radius:10px;border:1px solid #7dffb066;background:#12301e;color:#dfffe9;font-weight:700}
.nv{font-size:11px;opacity:.7}`; document.head.append(css);
const bar = document.createElement('div'); bar.id = 'fBar'; bar.innerHTML = '<button id="fCast">🎣 Fish</button><button id="fShop">🛒 Tackle & Bait</button>'; document.body.append(bar);
const ui = document.createElement('div'); ui.id = 'fUI'; document.body.append(ui); const panel = document.createElement('div'); panel.id = 'fPanel'; document.body.append(panel);
const NV = '<div class="nv">🪙 Lake coins: free in-game points with no real value. Not sold for XRP, not withdrawable.</div>';
// ---------- fishing flow ----------
let state = 'idle', cur = null;
let FISHOK = false;
async function doCast() {
  if (state !== 'idle' || !FISHOK) return; const c = W(), e = window.__estate, fw = new THREE.Vector3(); c.C.getWorldDirection(fw); fw.y = 0; fw.normalize();
  const from = isDeep() ? window.__boat.pos : c.P.pos; let tgt = from.clone().addScaledVector(fw, 9); if (!e.inLake(tgt.x, tgt.z)) { tgt = from.clone(); for (let k = 0; k < 40 && !e.inLake(tgt.x, tgt.z); k++) tgt.addScaledVector(e.dir, 1); tgt.addScaledVector(e.dir, 3) }
  state = 'wait'; rod.swing = 1; rod.tip.getWorldPosition(castFrom); castTo.copy(tgt).setY(0.45); bobber.position.copy(castFrom); bobber.visible = true; ui.style.display = 'block'; ui.innerHTML = '🎣 Waiting for a bite… <div class="nv">bait: ' + bait + '</div><button id="fStop">Reel in</button>'; ui.querySelector('#fStop').onclick = stop;
  if (tok()) { const r = await api('cast', { bait, deep: isDeep(), weather: weather(), near: FISHOK ? 1 : 0, x: Math.round(from.x), z: Math.round(from.z) }).catch(() => ({ error: 'offline' })); if (r.error) { msg(r.error === 'too_fast' ? 'Easy! Wait a few seconds between casts.' : r.error === 'not_near_water' ? 'Get closer to the water to fish.' : r.error === 'hourly_limit' ? 'The fish need a rest (hourly limit). Try later.' : 'Server busy, try again.'); return } cur = { ...r, srv: true } }
  else { const f = roll(prof.rod, prof.bait[bait] > 0 || bait === 'worm' ? bait : 'worm', { night: night(), deep: isDeep(), weather: weather() }); cur = { fish: f, wait: 2500 + Math.random() * 6000, hits: f.hits, zone: f.zone, r: f.r } }
  cur.t0 = performance.now(); setTimeout(bite, cur.wait) }
function bite() { if (state !== 'wait') return; state = 'bite'; ui.innerHTML = '<b style="font-size:18px">❗ Bite!</b><br><button id="fHook" style="margin-top:8px;font-size:18px">Hook it!</button>'; ui.querySelector('#fHook').onclick = hook; cur.biteT = performance.now(); setTimeout(() => { if (state === 'bite') { msg('It got away… (hook faster)'); land(false) } }, 1600) }
function hook() { if (state !== 'bite') return; state = 'reel'; cur.hit = 0; cur.miss = 0; cur.z0 = Math.random() * (1 - cur.zone); cur.spd = 0.7 + 0.35 * cur.r; cur.ph = 0; drawReel() }
function drawReel() { ui.innerHTML = `<b>Reel it in!</b> <span class="nv">${cur.hit}/${cur.hits} · misses ${cur.miss}/3</span><div class="bar"><div class="zone" style="left:${cur.z0 * 100}%;width:${cur.zone * 100}%"></div><div class="mk" id="fMk"></div></div><button id="fReel" style="width:100%;font-size:18px">⟳ Reel!</button>`; ui.querySelector('#fReel').onpointerdown = e => { e.preventDefault(); tapReel() } }
function tapReel() { if (state !== 'reel') return; const m = (Math.sin(cur.ph) + 1) / 2; if (m >= cur.z0 && m <= cur.z0 + cur.zone) { cur.hit++; rod.pull = 1; cur.z0 = Math.random() * (1 - cur.zone) } else cur.miss++;
  if (cur.hit >= cur.hits) land(true); else if (cur.miss >= 3) { msg('Line snapped!'); land(false) } else drawReel() }
async function land(ok) { const was = cur; state = 'idle'; bobber.visible = false;
  let f = null; if (was.srv) { const r = await api('reel', { cid: was.cid, ok }).catch(() => ({})); if (r.fish) { f = r.fish; prof = r.profile; W()._ft = r.today } else if (ok) return msg(r.error === 'timing' ? 'Too slow, it slipped off.' : 'Server busy.') }
  else { if (bait !== 'worm' && prof.bait[bait] > 0) prof.bait[bait]--; if (ok) { f = was.fish; const L = prof.log[f.id] || { n: 0, best: 0 }; L.n++; L.best = Math.max(L.best, f.kg); prof.log[f.id] = L; prof.creel.push([f.id, f.kg, f.val]); prof.n++ } saveLocal() }
  if (!ok) return; rod.lift = 1; rod.fm.material.color.set(RC[f.r]); rod.fm.material.emissive.set(RC[f.r]).multiplyScalar(.25); rod.tip.getWorldPosition(castFrom); rod.fm.position.copy(bobber.position); dispatchEvent(new CustomEvent('bc-fish-catch', { detail: { today: (was.srv && W()._ft) || 0 } })); ui.style.display = 'block'; ui.innerHTML = `<div style="color:${RC[f.r]};font-weight:800">${RN[f.r]}</div><div style="font-size:20px;font-weight:800">🐟 ${f.name}</div>${f.kg} kg · worth ${f.val} 🪙<div class="nv">✓ added to your creel & fish log</div>`; clearTimeout(land.k); land.k = setTimeout(() => { if (state === 'idle') ui.style.display = 'none' }, 2600) }
function stop() { state = 'idle'; bobber.visible = false; ui.style.display = 'none' }
function msg(t) { state = 'idle'; bobber.visible = false; ui.style.display = 'block'; ui.innerHTML = t + '<br><button id="fOk">OK</button>'; ui.querySelector('#fOk').onclick = () => ui.style.display = 'none' }
// ---------- shop + log ----------
async function refresh() { if (tok()) { const r = await api('state').catch(() => null); if (r && r.rod) prof = r } }
const SN = id => (SPECIES.find(s => s[0] === id) || [0, id])[1];
async function topHtml() { try { const r = await fetch(SRV + '/api/fish/top').then(r => r.json()); const t = r.top || [];
  return '<h4 style="margin:10px 0 4px">🏆 Biggest catch this week</h4>' + (t.length ? t.map((e, i) => `<div class="c" style="margin:3px 0">${i + 1}. ${e.who} · <b>${e.kg} kg</b> ${SN(e.sp)}</div>`).join('') : '<div class="nv">No signed-in catches yet this week. Be the first!</div>') + '<div class="nv">Signed-in anglers only · resets Monday (UTC)</div>' } catch (e) { return '' } }
const putTop = () => topHtml().then(h => { const e = panel.querySelector('#fTop'); if (e) e.innerHTML = h });
async function openShop() { await refresh(); const v = prof.creel.reduce((a, f) => a + f[2], 0);
  panel.innerHTML = `<button class="x" aria-label="Close">✕</button><h3 style="margin:0 0 6px">🎣 Tackle & Bait</h3>${NV}<p>🪙 <b>${prof.coins}</b> lake coins · creel: ${prof.creel.length} fish (${v} 🪙)</p><button class="b" id="fSell">Sell all fish (+${v} 🪙)</button>
   <h4>Rods</h4>${SHOP.rods.map(r => `<button class="b" data-rod="${r[0]}">${prof.rod === r[0] ? '✓ ' : ''}${r[1]} · ${prof.rods.includes(r[0]) ? (prof.rod === r[0] ? 'equipped' : 'equip') : r[2] + ' 🪙'}</button>`).join('')}
   <h4>Bait <span class="nv">(using: ${bait})</span></h4>${SHOP.baits.map(b => `<button class="b" data-bait="${b[0]}">${b[1]} · ${b[0] === 'worm' ? 'free' : b[2] + ' 🪙 each · have ' + (prof.bait[b[0]] || 0)}</button>`).join('')}
   <button class="b" id="fLog2">📖 Fish log</button><div id="fTop"></div>`;
  panel.style.display = 'block'; panel.querySelector('.x').onclick = () => panel.style.display = 'none'; panel.querySelector('#fLog2').onclick = openLog; putTop();
  panel.querySelector('#fSell').onclick = async () => { if (tok()) { const r = await api('sell', {}); if (r.profile) prof = r.profile } else { prof.coins += v; prof.creel = []; saveLocal() } openShop() };
  panel.querySelectorAll('[data-rod]').forEach(b => b.onclick = () => buy('rod', b.dataset.rod)); panel.querySelectorAll('[data-bait]').forEach(b => b.onclick = () => { const id = b.dataset.bait; if (id === 'worm' || (prof.bait[id] || 0) > 0) { bait = id; openShop() } else buy('bait', id) }) }
async function buy(kind, id) { if (tok()) { const r = await api('buy', { kind, id, qty: kind === 'bait' ? 5 : 1 }); if (r.error) return alert(r.error === 'not_enough_coins' ? 'Not enough lake coins.' : 'Could not buy.'); prof = r.profile }
  else { const it = (kind === 'rod' ? SHOP.rods : SHOP.baits).find(x => x[0] === id); if (kind === 'rod' && prof.rods.includes(id)) prof.rod = id; else { const cost = kind === 'rod' ? it[2] : it[2] * 5; if (prof.coins < cost) return alert('Not enough lake coins.'); prof.coins -= cost; if (kind === 'rod') { prof.rods.push(id); prof.rod = id } else prof.bait[id] = (prof.bait[id] || 0) + 5 } saveLocal() }
  if (kind === 'bait') bait = id; openShop() }
function openLog() { const got = Object.keys(prof.log).length;
  panel.innerHTML = `<button class="x" aria-label="Close">✕</button><h3 style="margin:0 0 6px">📖 Fish log · ${got}/${SPECIES.length}</h3><div class="nv">Some fish only bite at night, in deep water (from a boat), or in certain market weather.</div><div class="g" style="margin-top:8px">${SPECIES.map(s => { const L = prof.log[s[0]];
    return `<div class="c" style="border-color:${RC[s[2]]}55"><b style="color:${L ? RC[s[2]] : '#666'}">${L ? s[1] : '???'}</b><br>${RN[s[2]]}${L ? ` · ×${L.n} · best ${L.best} kg` : (s[5].night ? ' · 🌙' : '') + (s[5].deep ? ' · 🚤' : '') + (s[5].weather ? ' · ⛅' : '')}</div>` }).join('')}</div>`;
  panel.insertAdjacentHTML('beforeend', '<div id="fTop"></div>'); putTop(); panel.style.display = 'block'; ui.style.display = 'none'; panel.querySelector('.x').onclick = () => panel.style.display = 'none' }
bar.querySelector('#fCast').onclick = doCast; bar.querySelector('#fShop').onclick = openShop;
// ---------- per-frame: show buttons when in reach, animate bobber + reel marker ----------
function tick() { requestAnimationFrame(tick); const c = W(), e = window.__estate; if (!c || !e || !dock) return; const t = performance.now() / 1000, m = c.getMode();
  const p = isDeep() ? window.__boat.pos : c.P.pos, walk = m === 'explore';
  const nearDock = p.distanceTo(dock.tip) < 6 || (p.distanceTo(dock.base) < 22 && Math.abs(p.clone().sub(dock.base).dot(dock.side)) < 3), shore = !e.inLake(p.x, p.z) && e.inLake(p.x, p.z, 4);
  const canFish = walk && (nearDock || shore || isDeep()); FISHOK = canFish; const nearShop = walk && !isDeep() && p.distanceTo(shopPos) < 10;
  bar.style.display = canFish || nearShop ? 'flex' : 'none'; bar.querySelector('#fCast').style.display = canFish ? '' : 'none'; bar.querySelector('#fShop').style.display = nearShop ? '' : 'none';
  if (!canFish && state !== 'idle' && !isDeep()) stop();
  { const show = canFish || state !== 'idle' || rod.lift > 0; rod.rg.visible = show; const lk = ROD_LOOK[prof.rod] || ROD_LOOK.basic; rod.rm.color.setHex(lk[0]); rod.rm.emissive.setHex(lk[1]); rod.rm.emissiveIntensity = lk[1] ? .6 + .3 * Math.sin(t * 3) : 0;
    const dt = 1 / 60; rod.swing = Math.max(0, rod.swing - dt * 1.6); rod.pull = Math.max(0, rod.pull - dt * 4);
    const sw = rod.swing > 0 ? (rod.swing > .55 ? -(1 - rod.swing) * 4 : (rod.swing - .55) * 2) : 0; rod.rg.rotation.x = -.9 + sw + rod.pull * .5;
    const bend = state === 'bite' ? .35 + Math.sin(t * 22) * .15 : state === 'reel' ? .3 + rod.pull * .3 + Math.sin(t * 9) * .05 : rod.lift > 0 ? .4 : .05; rod.seg[1].rotation.x = bend * .5; rod.seg[2].rotation.x = bend;
    if (rod.swing > 0 && rod.swing < .55 && bobber.visible) { const k = 1 - rod.swing / .55; bobber.position.lerpVectors(castFrom, castTo, k); bobber.position.y = castFrom.y + (castTo.y - castFrom.y) * k + Math.sin(k * Math.PI) * 3 }
    else if (rod.swing > 0 && bobber.visible) { rod.tip.getWorldPosition(castFrom); bobber.position.copy(castFrom) }
    const tp = new THREE.Vector3(); rod.tip.getWorldPosition(tp); const pa = rod.lg.attributes.position;
    if (rod.lift > 0) { rod.lift = Math.max(0, rod.lift - dt * .75); const k = Math.min(1, (1 - rod.lift) * 2.2); rod.fm.visible = true; rod.fm.position.lerpVectors(rod.fm.position, tp.clone().add(new THREE.Vector3(0, -1.1, 0)), k * .2); rod.fm.rotation.set(Math.sin(t * 18) * .4, t * 2, 0); if (!rod.lift) rod.fm.visible = false }
    const end = rod.lift > 0 ? rod.fm.position : bobber.visible ? bobber.position : null; rod.line.visible = show && !!end; if (end) { pa.setXYZ(0, tp.x, tp.y, tp.z); pa.setXYZ(1, end.x, end.y, end.z); pa.needsUpdate = true } }
  if (bobber.visible && !(rod.swing > 0)) bobber.position.y = 0.45 + (state === 'bite' ? -0.25 + Math.sin(t * 20) * 0.12 : Math.sin(t * 2.2) * 0.06);
  if (state === 'reel') { cur.ph += 0.05 * cur.spd * 2.2; const mk = $('fMk'); if (mk) mk.style.left = ((Math.sin(cur.ph) + 1) / 2 * 100) + '%' } }
window.__fish = { openShop, openLog, doCast, prof: () => prof, roll };
(function boot() { if (!window.__ready || !W() || !window.__estate) return setTimeout(boot, 500); build(); refresh(); requestAnimationFrame(tick) })();
