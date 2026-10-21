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
// ---------- low-poly fish model: shared geometry, one textured material per species ----------
// look: [back colour, belly colour, pattern: 0 plain | 1 stripes | 2 spots | 3 lateral glow line | 4 patches, accent]
const LOOK = { minnow: ['#8a9aa8', '#e8eef2', 0], bluegill: ['#2f7f86', '#ff9a3c', 1, '#1d4d5a'], perch: ['#9aa63a', '#f0e6b0', 1, '#3a4a1a'], carp: ['#a8823c', '#f0d890', 0], shiner: ['#c8d4e0', '#ffffff', 0],
  dace: ['#7a8a96', '#dfe6ea', 0], trout: ['#3a9a6a', '#f4e8d0', 3, '#ff4fd8'], bass: ['#3c6a2c', '#e8e4c0', 1, '#1e3a14'], catfish: ['#4a4a52', '#c8c0b0', 0], pike: ['#4a6a2a', '#e8e4a8', 2, '#d8e090'],
  eel: ['#3a3a2a', '#8a8a5a', 0], gar: ['#6a7a5a', '#dad8b8', 2, '#2a3020'], koi: ['#ffffff', '#ffffff', 4, '#ff8a10'], cod: ['#8a7a5a', '#efe8d8', 2, '#5a4a30'], sturgeon: ['#5a5a62', '#c8c8c8', 0],
  snapper: ['#e0402a', '#ffc0a8', 0], salmon: ['#8a9aa8', '#ff9a80', 2, '#2a3040'], leviathan: ['#2a1a5a', '#7a5aff', 3, '#ff3a00'], marlin: ['#1a3a8a', '#e8f0ff', 1, '#5ad8ff'], whaleshark: ['#3a4a5a', '#e0e4e8', 2, '#f0f4f8'] };
// ---------- fish models: per-species body shape, fins and hand-painted skin (shared geometry + material per species) ----------
// shape: L length, H height, W width, pk where the body is deepest (0 nose..1 tail), nz nose bluntness, tl tail type, d dorsal style, plus extras
const SHAPE = {
  minnow: { L: 1, H: .22, W: .14, pk: .38, nz: .7, tl: 'fork', d: 'one' }, shiner: { L: 1, H: .24, W: .12, pk: .4, nz: .7, tl: 'fork', d: 'one' }, dace: { L: 1, H: .22, W: .13, pk: .38, nz: .75, tl: 'fork', d: 'one' },
  bluegill: { L: .8, H: .42, W: .13, pk: .42, nz: .45, tl: 'square', d: 'spiny' }, perch: { L: 1, H: .3, W: .16, pk: .38, nz: .6, tl: 'square', d: 'two' }, carp: { L: 1.05, H: .34, W: .2, pk: .4, nz: .5, tl: 'fork', d: 'long', bar: 2 },
  trout: { L: 1.1, H: .26, W: .16, pk: .4, nz: .65, tl: 'square', d: 'one', ad: 1 }, bass: { L: 1.05, H: .32, W: .19, pk: .38, nz: .55, tl: 'square', d: 'two', mouth: 1 },
  catfish: { L: 1.15, H: .24, W: .24, pk: .25, nz: .35, tl: 'round', d: 'small', bar: 8, ad: 1, flat: 1 }, pike: { L: 1.35, H: .2, W: .15, pk: .55, nz: 1.15, tl: 'fork', d: 'rear', duck: 1 },
  eel: { L: 2, H: .12, W: .11, pk: .3, nz: .7, tl: 'eel', d: 'eel' }, gar: { L: 1.5, H: .16, W: .15, pk: .5, nz: 1.4, tl: 'round', d: 'rear', snout: .45 },
  koi: { L: 1.05, H: .32, W: .2, pk: .38, nz: .5, tl: 'fork', d: 'long', bar: 2, longfin: 1 }, cod: { L: 1.1, H: .3, W: .2, pk: .32, nz: .5, tl: 'square', d: 'three', bar: 1 },
  sturgeon: { L: 1.5, H: .2, W: .2, pk: .3, nz: 1.3, tl: 'shark', d: 'rear', bar: 4, scute: 1, flat: 1 }, snapper: { L: 1, H: .38, W: .17, pk: .4, nz: .65, tl: 'fork', d: 'spiny' },
  salmon: { L: 1.15, H: .28, W: .17, pk: .42, nz: .7, tl: 'fork', d: 'one', ad: 1 }, leviathan: { L: 1.5, H: .3, W: .22, pk: .3, nz: .5, tl: 'deep', d: 'ridge', teeth: 1 },
  marlin: { L: 1.4, H: .3, W: .15, pk: .35, nz: .8, tl: 'lunate', d: 'sail', bill: .55 }, whaleshark: { L: 1.5, H: .3, W: .36, pk: .3, nz: .25, tl: 'shark', d: 'shark', flat: 1 } };
// skin painters: paint one side (x = head->tail 0..256, y = back 0 -> belly 64); mirrored for the other side. G = glow layer for rare fish.
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
function grad(x, stops) { const g = x.createLinearGradient(0, 0, 0, 64); stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c)); x.fillStyle = g; x.fillRect(0, 0, 256, 64) }
const dots = (x, n, col, y0, y1, r0, r1, x0 = 0, x1 = 256) => { x.fillStyle = col; for (let i = 0; i < n; i++) { x.beginPath(); x.arc(rnd(x0, x1), rnd(y0, y1), rnd(r0, r1), 0, 7); x.fill() } };
const bars = (x, n, col, x0, x1, top, bot, w) => { x.fillStyle = col; for (let i = 0; i < n; i++) { const cx = x0 + (x1 - x0) * (i + .5) / n; x.beginPath(); x.moveTo(cx - w, top); x.lineTo(cx + w, top); x.lineTo(cx + w * .3, bot); x.lineTo(cx - w * .3, bot); x.fill() } };
const band = (x, col, y, h, x0 = 20, x1 = 250) => { x.fillStyle = col; x.fillRect(x0, y - h / 2, x1 - x0, h) };
const SKIN = {
  minnow: x => { grad(x, ['#5d6440', '#8b9070', '#c9ccbf', '#eceee6']); band(x, '#3a3d2a', 30, 4) },
  shiner: x => { grad(x, ['#5f7f74', '#a8c0c0', '#e8eef2', '#ffffff']); band(x, '#f2c8d8', 30, 3); band(x, '#7a9aa0', 26, 1.5) },
  dace: x => { grad(x, ['#3e4a52', '#7d8b94', '#d4dade', '#f2f4f5']); band(x, '#2c3238', 28, 2) },
  bluegill: x => { grad(x, ['#2f4f2a', '#4f7a46', '#9a9a50', '#ff9a3c']); bars(x, 7, 'rgba(25,45,30,.45)', 40, 220, 2, 52, 9); x.fillStyle = '#10161a'; x.beginPath(); x.ellipse(52, 30, 8, 6, 0, 0, 7); x.fill(); x.fillStyle = 'rgba(80,170,200,.35)'; x.fillRect(10, 36, 40, 4) },
  perch: x => { grad(x, ['#3d4a18', '#8f9a2e', '#d9cf5c', '#f4ecc4']); bars(x, 7, 'rgba(30,38,12,.75)', 45, 225, 0, 46, 9) },
  carp: x => { grad(x, ['#5c4a22', '#9a7a3a', '#c9a456', '#efdca8']) },
  trout: x => { grad(x, ['#3e5a2e', '#7a8a4a', '#d8d0b0', '#f6f2e6']); band(x, 'rgba(255,79,160,.75)', 30, 9, 30, 245); dots(x, 140, '#121410', 0, 34, 1, 2.4) },
  bass: x => { grad(x, ['#3a4a1a', '#7a8a2e', '#c8b860', '#f2ecd0']); x.fillStyle = 'rgba(25,32,10,.8)'; for (let i = 0; i < 26; i++) { x.beginPath(); x.ellipse(40 + i * 8, 30 + Math.sin(i * 1.7) * 3, 6, 5 + rnd(0, 3), rnd(0, 3), 0, 7); x.fill() } },
  catfish: x => { grad(x, ['#3c4a58', '#6f8496', '#aebcc6', '#f4f4f0']); dots(x, 26, 'rgba(20,24,30,.8)', 8, 40, 1.2, 2.4, 30, 240) },
  pike: x => { grad(x, ['#2c3c16', '#4f6a24', '#a6b05a', '#efeccc']); x.fillStyle = 'rgba(232,236,170,.85)'; for (let r = 0; r < 4; r++) for (let i = 0; i < 18; i++) { x.beginPath(); x.ellipse(40 + i * 11 + r * 4, 10 + r * 9 + rnd(-1, 1), 4, 2.2, rnd(-.3, .3), 0, 7); x.fill() } },
  eel: x => { grad(x, ['#3a3a26', '#5a5a3a', '#9a9468', '#e8e0b0']); band(x, 'rgba(200,210,230,.25)', 30, 2) },
  gar: x => { grad(x, ['#3a4630', '#6a7a5a', '#b8b898', '#e6e4cc']); dots(x, 70, '#1c2216', 2, 42, 1.4, 3, 20, 250) },
  koi: x => { grad(x, ['#ffffff', '#fbf8f2', '#ffffff', '#ffffff']); x.fillStyle = '#ff5a10'; for (let i = 0; i < 5; i++) { x.beginPath(); x.ellipse(rnd(25, 215), rnd(0, 26), rnd(14, 26), rnd(8, 14), rnd(0, 3), 0, 7); x.fill() } dots(x, 5, '#111', 0, 20, 3, 6, 60, 230) },
  cod: x => { grad(x, ['#5a5030', '#8a7a4c', '#cdc39e', '#f2ece0']); dots(x, 220, 'rgba(70,58,30,.7)', 0, 38, .8, 2.2); band(x, '#f4f0e0', 22, 2, 30, 245) },
  sturgeon: x => { grad(x, ['#4a5058', '#7a828c', '#b0b6bc', '#ecedee']) },
  snapper: x => { grad(x, ['#b81e14', '#e0402a', '#ff7a60', '#ffd0c0']); dots(x, 40, 'rgba(255,200,150,.35)', 5, 40, 1, 2) },
  salmon: x => { grad(x, ['#34485e', '#6b8aa4', '#d6dee6', '#fafcfd']); dots(x, 60, '#0e1418', 0, 20, 1, 2.2); band(x, 'rgba(150,255,200,.18)', 28, 8) },
  leviathan: x => { grad(x, ['#120a2e', '#2a1a5a', '#4a2a8a', '#7a5aff']) },
  marlin: x => { grad(x, ['#0c1e5a', '#1a3a8a', '#b8c8e0', '#f2f6ff']); x.fillStyle = 'rgba(120,200,255,.7)'; for (let i = 0; i < 14; i++) x.fillRect(50 + i * 13, 14, 3, 30) },
  whaleshark: x => { grad(x, ['#1e2a38', '#34485a', '#4a5e70', '#e8ecee']); x.strokeStyle = 'rgba(230,240,245,.5)'; x.lineWidth = 1; for (let i = 0; i < 16; i++) { x.beginPath(); x.moveTo(30 + i * 14, 0); x.lineTo(30 + i * 14, 44); x.stroke() } dots(x, 160, '#eef2f4', 0, 44, 1, 2.3) } };
const GLOW = { trout: x => band(x, '#ff4fa0', 30, 6, 30, 245), leviathan: x => { x.strokeStyle = '#ff4a10'; x.lineWidth = 2.2; for (let i = 0; i < 9; i++) { x.beginPath(); x.moveTo(30 + i * 24, 4); x.bezierCurveTo(40 + i * 24, 20, 20 + i * 24, 30, 36 + i * 24, 48); x.stroke() } band(x, '#ff6a20', 30, 2) },
  snapper: x => { x.strokeStyle = '#ff7a10'; x.lineWidth = 1.2; for (let i = 0; i < 14; i++) { x.beginPath(); x.moveTo(rnd(20, 240), rnd(5, 45)); x.lineTo(rnd(20, 240), rnd(5, 45)); x.stroke() } },
  marlin: x => { x.fillStyle = '#5ad8ff'; for (let i = 0; i < 14; i++) x.fillRect(50 + i * 13, 16, 2, 26) }, salmon: x => band(x, '#7affc0', 28, 3) };
const FIN = { minnow: '#7a7d60', shiner: '#c8d0d0', dace: '#6a747a', bluegill: '#3a5a3a', perch: '#e0782a', carp: '#a8743a', trout: '#7a7050', bass: '#5a6a2a', catfish: '#4a5868', pike: '#c86a2a', eel: '#3a3a28', gar: '#6a6a40', koi: '#ffffff', cod: '#7a6a44', sturgeon: '#6a7078', snapper: '#ff5a3a', salmon: '#5a6a7a', leviathan: '#ff3a00', marlin: '#1a3a8a', whaleshark: '#2a3a4a' };
const SCALY = { eel: 0, catfish: 0, sturgeon: 0, whaleshark: 0, leviathan: .5, marlin: .3 };
let FG = {}; const FM = {};
function finShape(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); return new THREE.ShapeGeometry(s).rotateY(-Math.PI / 2) }   // shape x -> +z (toward tail), y up
const TAILS = { fork: [[0, 0], [.32, .36], [.4, .38], [.22, 0], [.4, -.38], [.32, -.36]], deep: [[0, 0], [.3, .48], [.42, .52], [.2, 0], [.42, -.52], [.3, -.48]], square: [[0, .08], [.3, .32], [.36, .26], [.34, 0], [.36, -.26], [.3, -.32], [0, -.08]],
  round: [[0, .08], [.22, .26], [.34, .16], [.37, 0], [.34, -.16], [.22, -.26], [0, -.08]], lunate: [[0, 0], [.2, .5], [.34, .6], [.16, 0], [.34, -.6], [.2, -.5]], shark: [[0, .05], [.4, .5], [.46, .46], [.28, 0], [.3, -.2], [.18, -.22], [0, -.05]], eel: [[0, .06], [.2, .04], [.26, 0], [.2, -.04], [0, -.06]] };
function fishGeo(id) { if (FG[id]) return FG[id]; const S = SHAPE[id] || SHAPE.minnow, L = 1.6 * S.L, NS = 30, NT = 18, pos = [], uv = [], idx = [];
  const prof = s => { let p = s < S.pk ? Math.pow(Math.sin(Math.PI / 2 * s / S.pk), S.nz) : Math.pow(Math.cos(Math.PI / 2 * (s - S.pk) / (1 - S.pk)), .85); if (S.tl === 'eel') p = s < .1 ? Math.pow(s / .1, .6) : 1 - (s - .1) * .75; return Math.max(p, s > .5 ? .16 * (S.tl === 'eel' ? .4 : 1) : .02) };
  for (let i = 0; i <= NS; i++) { const s = i / NS, p = prof(s), z = -L / 2 + s * L; for (let j = 0; j <= NT; j++) { const a = j / NT * Math.PI * 2, cy = Math.cos(a), sx = Math.sin(a), belly = cy < 0 ? (S.flat ? .7 : .92) : 1;
      let w = S.W * p, h = S.H * p * belly; if (S.duck && s < .18) { h *= .6 + s * 2; w *= 1.1 } pos.push(sx * w, cy * h, z); uv.push(s, j / NT) } }
  for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) { const a = i * (NT + 1) + j, b = a + NT + 1; idx.push(a, b, a + 1, b, b + 1, a + 1) }
  const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); body.setIndex(idx); body.computeVertexNormals();
  const ts = S.H / .3 * (S.tl === 'eel' ? 1 : 1), tail = finShape(TAILS[S.tl]).scale(1, ts, ts), fins = [], top = s => S.H * prof(s) * .97, zat = s => -L / 2 + s * L, bot = s => -S.H * prof(s) * (S.flat ? .68 : .9);
  const dor = (s0, s1, h, sw = .5) => { const a = zat(s0), b = zat(s1), y0 = top(s0), y1 = top(s1); fins.push(finShape([[a, y0 - .02], [a + (b - a) * sw * .5, y0 + h], [a + (b - a) * sw, y0 + h * .85], [b, y1 + h * .15], [b, y1 - .02]]).rotateY(Math.PI).scale(-1, 1, -1)) };
  const anal = (s0, s1, h) => { const a = zat(s0), b = zat(s1); fins.push(finShape([[a, bot(s0) + .02], [a + (b - a) * .3, bot(s0) - h], [b, bot(s1) - h * .3], [b, bot(s1) + .02]]).rotateY(Math.PI).scale(-1, 1, -1)) };
  const d = S.d, H = S.H; if (d === 'one') dor(.36, .55, H * .7); else if (d === 'two') { dor(.3, .5, H * .75); dor(.53, .72, H * .55) } else if (d === 'three') { dor(.25, .4, H * .55); dor(.43, .6, H * .5); dor(.63, .8, H * .4) }
  else if (d === 'spiny') dor(.28, .78, H * .65, .4); else if (d === 'long') dor(.3, .75, H * (S.longfin ? .9 : .55), .3); else if (d === 'small') dor(.3, .4, H * .7); else if (d === 'rear') dor(.66, .82, H * .7); else if (d === 'eel') dor(.3, 1, H * .5, .2);
  else if (d === 'sail') dor(.18, .75, H * 1.5, .35); else if (d === 'shark') dor(.38, .55, H * 1.1, .6); else if (d === 'ridge') { for (let k = 0; k < 6; k++) dor(.2 + k * .1, .27 + k * .1, H * .5, .3) }
  if (S.ad) dor(.76, .82, H * .25); if (d === 'eel') anal(.45, 1, H * .5); else anal(.62, .78, H * (S.longfin ? .7 : .45));
  const finG = mergeGeometries(fins.map(g => { g.deleteAttribute('uv'); return g.toNonIndexed() })); finG.computeVertexNormals();
  const side = finShape([[0, 0], [.1, -.05 * ts], [.3 * Math.min(1.5, ts), -.12 * ts], [.24, 0]]).rotateY(Math.PI).scale(-1, 1, -1);
  const extra = []; if (S.bill) extra.push(new THREE.ConeGeometry(.04, S.bill * L, 6).rotateX(-Math.PI / 2).translate(0, H * .05, -L / 2 - S.bill * L / 2 + .03));
  if (S.snout) extra.push(new THREE.CylinderGeometry(.02, .045, S.snout * L * .5, 6).rotateX(-Math.PI / 2).translate(0, 0, -L / 2 - S.snout * L * .2));
  if (S.bar) for (let k = 0; k < S.bar; k++) { const sx = k % 2 ? 1 : -1, row = Math.floor(k / 2), len = .25 - row * .05; extra.push(new THREE.CylinderGeometry(.006, .012, len, 4).translate(0, -len / 2, 0).rotateX(-.6 - row * .25).rotateZ(sx * (.35 + row * .25)).translate(sx * S.W * .25, -H * .1 - row * .02, -L / 2 + .06)) }
  if (S.scute) for (let r = -1; r <= 1; r++) for (let i = 0; i < 12; i++) { const s = .12 + i * .06, a = r * 1.2; extra.push(new THREE.ConeGeometry(.025, .06, 4).translate(Math.sin(a) * S.W * prof(s), Math.cos(a) * S.H * prof(s), zat(s))) }
  const ex = extra.length ? mergeGeometries(extra.map(g => { g.deleteAttribute('uv'); g.deleteAttribute('normal'); return g.index ? g.toNonIndexed() : g })) : null; if (ex) ex.computeVertexNormals();
  const ez = zat(S.bill ? .1 : .09), ey = H * .3;
  return FG[id] = { body, tail, fin: finG, side, ex, L, eye: { x: S.W * prof(.1) * .92, y: ey * prof(.1) / Math.max(.1, prof(.25)) * .6 + H * .05, z: ez, r: .035 + S.H * .08 }, sideZ: zat(S.pk * .8 + .05), sideY: -H * .35, tailZ: L / 2 - .02 } }
const EYEG = new THREE.SphereGeometry(1, 10, 8), PUPG = new THREE.SphereGeometry(.55, 8, 6), PUPM = new THREE.MeshBasicMaterial({ color: 0x050505 });
const IRIS = { koi: '#c8a040', pike: '#d8c040', bass: '#a06020', snapper: '#ffcc40', leviathan: '#ff3a00', catfish: '#202020' };
function fishMat(id, r) { if (FM[id]) return FM[id]; const cv = document.createElement('canvas'); cv.width = 256; cv.height = 128; const x = cv.getContext('2d'), side = document.createElement('canvas'); side.width = 256; side.height = 64; const y = side.getContext('2d');
  (SKIN[id] || SKIN.minnow)(y);
  const sc = SCALY[id] ?? 1; if (sc) { y.strokeStyle = `rgba(0,0,0,${.13 * sc})`; y.lineWidth = .8; for (let row = 0; row < 12; row++) for (let i = 0; i < 44; i++) { y.beginPath(); y.arc(14 + i * 5.6 + (row % 2) * 2.8, row * 5.4, 3.4, .2 * Math.PI, .8 * Math.PI); y.stroke() } y.fillStyle = `rgba(255,255,255,${.06 * sc})`; for (let i = 0; i < 300; i++) y.fillRect(rnd(10, 250), rnd(0, 60), 1.5, 1) }
  if (id === 'carp' || id === 'koi') { y.strokeStyle = 'rgba(60,40,10,.35)'; y.lineWidth = 1; for (let row = 0; row < 7; row++) for (let i = 0; i < 24; i++) { y.beginPath(); y.arc(20 + i * 10 + (row % 2) * 5, row * 9, 6, .15 * Math.PI, .85 * Math.PI); y.stroke() } }
  if (id === 'sturgeon') { y.fillStyle = '#e8ecef'; for (let i = 0; i < 14; i++) { y.beginPath(); y.moveTo(30 + i * 15, 18); y.lineTo(34 + i * 15, 14); y.lineTo(38 + i * 15, 18); y.lineTo(34 + i * 15, 22); y.fill() } }
  y.strokeStyle = 'rgba(0,0,0,.35)'; y.lineWidth = 1.5; y.beginPath(); y.moveTo(44, 6); y.quadraticCurveTo(52, 30, 44, 54); y.stroke();   // gill cover
  y.fillStyle = 'rgba(0,0,0,.25)'; y.fillRect(8, 0, 30, 4);   // darker head top
  // mirror the side onto the far side: v 0 back -> .5 belly -> 1 back (texture is u = head->tail, v around)
  x.drawImage(side, 0, 0); x.save(); x.translate(0, 128); x.scale(1, -1); x.drawImage(side, 0, 0); x.restore();   // back at both edges, belly in the middle
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  let em = null; const gl = GLOW[id]; if (gl && (r >= 1 || id === 'trout')) { const e = document.createElement('canvas'); e.width = 256; e.height = 128; const g = e.getContext('2d'), sd = document.createElement('canvas'); sd.width = 256; sd.height = 64; const h = sd.getContext('2d'); h.fillStyle = '#000'; h.fillRect(0, 0, 256, 64); gl(h);
    g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128); g.globalAlpha = .3; g.drawImage(cv, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'lighter'; g.drawImage(sd, 0, 0); g.save(); g.translate(0, 128); g.scale(1, -1); g.drawImage(sd, 0, 0); g.restore(); em = new THREE.CanvasTexture(e) }
  const silver = /minnow|shiner|dace|salmon|marlin|trout|cod/.test(id), glow = r >= 3, fc = FIN[id] || '#888';
  return FM[id] = { body: new THREE.MeshStandardMaterial({ map: tex, metalness: silver ? .45 : .2, roughness: silver ? .28 : .42, emissive: new THREE.Color('#ffffff'), emissiveMap: em || tex, emissiveIntensity: em ? (r >= 4 ? 1.3 : 1) : .28 }),   // non-glow fish keep a soft self-lit skin so colours read at night
    fin: new THREE.MeshStandardMaterial({ color: fc, side: THREE.DoubleSide, transparent: true, opacity: id === 'koi' ? .55 : .8, roughness: .5, depthWrite: false, emissive: new THREE.Color(fc), emissiveIntensity: glow ? .45 : .2 }),
    ex: new THREE.MeshStandardMaterial({ color: id === 'sturgeon' ? '#d8dce0' : id === 'marlin' ? '#1a2a5a' : FIN[id] || '#666', roughness: .5 }),
    eye: new THREE.MeshStandardMaterial({ color: IRIS[id] || '#d8d0b0', roughness: .2, metalness: .3 }) } }
function buildFish(id, r, kg) { const G = fishGeo(id), M = fishMat(id, r), g = new THREE.Group(); g.add(new THREE.Mesh(G.body, M.body), new THREE.Mesh(G.fin, M.fin)); if (G.ex) g.add(new THREE.Mesh(G.ex, M.ex));
  const tail = new THREE.Mesh(G.tail, M.fin); tail.position.z = G.tailZ; g.add(tail);
  for (const sx of [-1, 1]) { const f = new THREE.Mesh(G.side, M.fin); f.position.set(sx * .1, G.sideY, G.sideZ); f.rotation.set(0, sx * .5, sx * 1.2); g.add(f);
    const e = new THREE.Mesh(EYEG, M.eye); e.scale.setScalar(G.eye.r); e.position.set(sx * G.eye.x, G.eye.y, G.eye.z); g.add(e); const pu = new THREE.Mesh(PUPG, PUPM); pu.position.set(sx * .6, 0, -.1); e.add(pu) }
  const sz = Math.max(.5, Math.min(2.6, .55 + Math.cbrt(Math.max(.02, kg)) * .55)) / Math.sqrt((SHAPE[id] || SHAPE.minnow).L); g.scale.setScalar(sz); g.userData.tail = tail; return g }
const ROD_LOOK = { basic: [0x8a5a2b, 0], carbon: [0x1c1c22, 0x2a6aff], pro: [0x2a6aff, 0x2ad0ff], legend: [0xff7a18, 0xff3a00] };
const castFrom = new THREE.Vector3(), castTo = new THREE.Vector3();
const LN = 24;   // fishing line points (sagging curve, not a straight stick)
// two-tone float with a little antenna, tilts on nibbles and plunges on a bite
const BOBG = (() => { const top = new THREE.SphereGeometry(.3, 12, 8, 0, 6.283, 0, Math.PI / 2), bot = new THREE.SphereGeometry(.3, 12, 8, 0, 6.283, Math.PI / 2, Math.PI / 2), st = new THREE.CylinderGeometry(.025, .025, .5, 5).translate(0, .45, 0); return { top, bot, st } })();
const BOBM = { top: new THREE.MeshStandardMaterial({ color: 0xff2a1a, roughness: .35, emissive: 0x3a0500 }), bot: new THREE.MeshStandardMaterial({ color: 0xf4f4ee, roughness: .4 }), st: new THREE.MeshBasicMaterial({ color: 0xffe14a }) };
function mkBobber() { const g = new THREE.Group(); g.add(new THREE.Mesh(BOBG.top, BOBM.top), new THREE.Mesh(BOBG.bot, BOBM.bot), new THREE.Mesh(BOBG.st, BOBM.st)); return g }
function mkLine(S) { const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LN * 3), 3)); const l = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: .75 })); l.frustumCulled = false; l.visible = false; S.add(l); return { line: l, lg } }
// line from rod tip a to b: quadratic sag (slack) plus a small high-frequency shiver when taut
function setLine(lg, a, b, sag, vib, t) { const pa = lg.attributes.position; for (let i = 0; i < LN; i++) { const k = i / (LN - 1), w = 4 * k * (1 - k), sh = vib ? Math.sin(t * 60 + k * 18) * vib * w : 0;
  pa.setXYZ(i, a.x + (b.x - a.x) * k + sh, Math.max(.02, a.y + (b.y - a.y) * k - sag * w), a.z + (b.z - a.z) * k + sh * .7) } pa.needsUpdate = true; lg.computeBoundingSphere() }
function mkRod(look) { const rg = new THREE.Group(), rm = new THREE.MeshStandardMaterial({ color: look[0], roughness: .5, emissive: look[1] || 0, emissiveIntensity: look[1] ? .7 : 0 }), seg = [];
  for (let i = 0; i < 4; i++) { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.CylinderGeometry(.034 - i * .007, .046 - i * .008, .62, 6).translate(0, .31, 0), rm); g.add(m); g.position.y = i ? .62 : 0; (i ? seg[i - 1] : rg).add(g); seg.push(g) }
  const reelM = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .08, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x999999, metalness: .8 })); reelM.position.set(.05, .25, 0); rg.add(reelM);
  const tip = new THREE.Object3D(); tip.position.y = .62; seg[3].add(tip); return { rg, rm, seg, tip } }
// progressive bend: each segment curls a bit more toward the tip, like a real blank under load
const bendRod = (seg, b) => seg.forEach((g, i) => { if (i) g.rotation.x = b * (.25 + .3 * i) });
const ROD_IDX = ['basic', 'carbon', 'pro', 'legend'];
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
  bobber = mkBobber(); bobber.visible = false; c.S.add(bobber);
  const R0 = mkRod(ROD_LOOK.basic), { rg, rm, seg, tip } = R0; rg.position.set(.32, 1.05, -.15); rg.rotation.x = -.9; rg.visible = false; c.avatar.add(rg);
  const { line, lg } = mkLine(c.S);
  const fm = new THREE.Mesh(new THREE.SphereGeometry(.35, 10, 8).scale(1, .55, 2.1), new THREE.MeshStandardMaterial({ color: 0xc8d0dc, emissive: 0x222222, metalness: .6, roughness: .3 })); fm.visible = false; c.S.add(fm);
  const NDp = 28, dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NDp * 3), 3)); const drops = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0xcfefff, size: .22, transparent: true, opacity: .9, depthWrite: false })); drops.frustumCulled = false; drops.visible = false; c.S.add(drops);
  const ring = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdff6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })); ring.visible = false; c.S.add(ring);
  rod = { rg, rm, seg, tip, line, lg, fm, swing: 0, lift: 0, pull: 0, drops, dv: new Float32Array(NDp * 3), ring, from: new THREE.Vector3(), r: 0 };
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
const ui = document.createElement('div'); ui.id = 'fUI'; document.body.append(ui);
// Touch ghost-click guard: Cast/Reel act on pointerdown and swap the panel's buttons, so the browser's follow-up click (Android Chrome, iOS Safari)
// landed on the NEW button under the finger, e.g. 'Reel in' right after Cast, which silently cancelled every cast on phones. Only accept a click on the same button the finger/mouse pressed down on.
let downB = null; const noGhost = () => { downB = null }; const btnOf = el => el && el.closest && el.closest('button');
ui.addEventListener('pointerdown', e => { downB = btnOf(e.target) }, true);
ui.addEventListener('click', e => { if (e.detail && btnOf(e.target) !== downB) { e.stopPropagation(); e.preventDefault() } downB = null }, true);   // a real tap's click hits the button it pressed const panel = document.createElement('div'); panel.id = 'fPanel'; document.body.append(panel);
const NV = '<div class="nv">🪙 Lake coins: free in-game points with no real value. Not sold for XRP, not withdrawable.</div>';
// ---------- fishing flow ----------
let state = 'idle', cur = null;
let FISHOK = false;
// cast = aim: a power meter swings; release in the gold band for a Perfect cast (wider reel zone on this fish)
const ripple = (p, a) => window.__lakeRipple && window.__lakeRipple(p.x, p.z, a);
let aimT = 0; const FL = { on: 0, t0: 0, dur: 1, h: 3 };   // bobber flight
function doCast() {
  if (state !== 'idle' || !FISHOK) return; state = 'aim'; aimT = performance.now(); ui.style.display = 'block';
  ui.innerHTML = `<b>🎯 Aim your cast</b> <span class="nv">tap in the gold band for a Perfect cast</span><div class="bar"><div class="zone" style="left:0;width:100%;background:linear-gradient(90deg,#3dff8a33,#3dff8a99)"></div><div class="zone" style="left:72%;width:14%;background:#ffc64acc"></div><div class="mk" id="fMk"></div></div><button id="fGo" style="width:100%;font-size:18px">🎣 Cast!</button>`;
  ui.querySelector('#fGo').onpointerdown = ev => { ev.preventDefault(); noGhost(); castAt(aimPow()) } }
const aimPow = () => { const u = ((performance.now() - aimT) / 1300) % 2; return u < 1 ? u : 2 - u };
async function castAt(pow) {
  if (state !== 'aim') return; const c = W(), e = window.__estate, fw = new THREE.Vector3(); c.C.getWorldDirection(fw); fw.y = 0; fw.normalize();
  const from = isDeep() ? window.__boat.pos : c.P.pos, perfect = pow >= .72 && pow <= .86; let dist = 6 + 20 * pow, tgt = from.clone().addScaledVector(fw, dist);
  while (dist > 4 && !e.inLake(tgt.x, tgt.z)) { dist -= 1; tgt = from.clone().addScaledVector(fw, dist) }
  if (!e.inLake(tgt.x, tgt.z)) { tgt = from.clone(); for (let k = 0; k < 40 && !e.inLake(tgt.x, tgt.z); k++) tgt.addScaledVector(e.dir, 1); tgt.addScaledVector(e.dir, 3 + 6 * pow) }
  state = 'wait'; rod.swing = 1; rod.tip.getWorldPosition(castFrom); castTo.copy(tgt).setY(0.45); bobber.position.copy(castFrom); bobber.visible = true; FL.t0 = performance.now() / 1000 + .28; FL.dur = .55 + dist / 32; FL.h = 2 + dist * .16; FL.on = 1; ui.style.display = 'block';
  ui.innerHTML = `${perfect ? '<b style="color:#ffc64a">✨ Perfect cast!</b><br>' : ''}🎣 Watch the bobber… <div class="nv">bait: ${bait} · hook too early and it spooks</div><button id="fHook">Hook!</button> <button id="fStop">Reel in</button>`; ui.querySelector('#fStop').onclick = stop; ui.querySelector('#fHook').onclick = hook;
  let nc = null;
  if (tok()) { const r = await api('cast', { bait, deep: isDeep(), weather: weather(), near: FISHOK ? 1 : 0, x: Math.round(from.x), z: Math.round(from.z) }).catch(() => ({ error: 'offline' })); if (r.error) { msg(r.error === 'too_fast' ? 'Easy! Wait a few seconds between casts.' : r.error === 'not_near_water' ? 'Get closer to the water to fish.' : r.error === 'hourly_limit' ? 'The fish need a rest (hourly limit). Try later.' : 'Server busy, try again.'); return } nc = { ...r, srv: true } }
  else { const f = roll(prof.rod, prof.bait[bait] > 0 || bait === 'worm' ? bait : 'worm', { night: night(), deep: isDeep(), weather: weather() }); nc = { fish: f, wait: 2500 + Math.random() * 6000, hits: f.hits, zone: f.zone, r: f.r } }
  if (state !== 'wait') return; cur = nc; cur.perfect = perfect; if (perfect) cur.zone = Math.min(.6, cur.zone * 1.4);
  cur.t0 = performance.now(); cur.nib = [.5 + Math.random() * .15, .78 + Math.random() * .1].filter(() => Math.random() < .85).map(k => k * cur.wait); spawnStalker(); setTimeout(bite, cur.wait) }
function bite() { if (state !== 'wait') return; state = 'bite'; ui.innerHTML = '<b style="font-size:18px">❗ Bite!</b><br><button id="fHook" style="margin-top:8px;font-size:18px">Hook it!</button>'; ui.querySelector('#fHook').onclick = hook; cur.biteT = performance.now(); ripple(bobber.position, 1.4); setTimeout(() => { if (state === 'bite') { msg('It got away… (hook faster)'); land(false) } }, 1600) }
function hook() { if (state === 'wait') { ripple(bobber.position, 1); STK.on = 0; streak = 0; msg(cur ? '💨 Too early! The fish spooked. Wait for the big dip.' : 'Too early!'); return }
  if (state !== 'bite') return; state = 'reel'; cur.hit = 0; cur.miss = 0; cur.z0 = Math.random() * (1 - cur.zone); cur.spd = 0.7 + 0.35 * cur.r; cur.ph = 0; cur.run = 0; cur.nextRun = performance.now() + 1500 + Math.random() * 1500; drawReel() }
// the fight: bigger fish make runs; reeling while it runs strains the line (counts as a miss)
function drawReel() { const run = cur.run > performance.now();
  ui.innerHTML = `<b>${run ? '<span style="color:#ff6a5a">🐟 It\'s running! Hold off…</span>' : 'Reel it in!'}</b> <span class="nv">${cur.hit}/${cur.hits} · misses ${cur.miss}/3${cur.perfect ? ' · ✨' : ''}</span><div class="bar"><div class="zone" style="left:${cur.z0 * 100}%;width:${cur.zone * 100}%;${run ? 'background:#ff5a4a88' : ''}"></div><div class="mk" id="fMk"></div></div><button id="fReel" style="width:100%;font-size:18px">⟳ Reel!</button>`; ui.querySelector('#fReel').onpointerdown = e => { e.preventDefault(); noGhost(); tapReel() } }
function tapReel() { if (state !== 'reel') return; const m = (Math.sin(cur.ph) + 1) / 2;
  if (cur.run > performance.now()) { cur.miss++; rod.pull = .4 } else if (m >= cur.z0 && m <= cur.z0 + cur.zone) { cur.hit++; rod.pull = 1; cur.z0 = Math.random() * (1 - cur.zone); ripple(bobber.position, .7) } else cur.miss++;
  if (cur.hit >= cur.hits) land(true); else if (cur.miss >= 3) { msg('Line snapped!'); land(false) } else drawReel() }
// fish shadows: ambient fish cruising the shallows + the one stalking your bobber (slot 0)
const STK = { on: 0, x: 0, z: 0, hd: 0, sz: 1, a0: 0, r0: 12 }, AMB = [];
function spawnStalker() { const b = castTo; STK.on = 1; STK.a0 = Math.random() * 6.283; STK.r0 = 9 + Math.random() * 5; STK.sz = .7 + .38 * (cur.r || 0) + Math.random() * .2; STK.x = b.x + Math.cos(STK.a0) * STK.r0; STK.z = b.z + Math.sin(STK.a0) * STK.r0 }
function shadows(t, dt, near) { const FS = window.__lakeFish, e = window.__estate; if (!FS || !e) return; const bx = bobber.position.x, bz = bobber.position.z, now = performance.now();
  if (STK.on && cur && (state === 'wait' || state === 'bite' || state === 'reel')) { let tx, tz;
    if (state === 'wait') { const k = Math.min(1, (now - cur.t0) / cur.wait), rr = 1.1 + (STK.r0 - 1.1) * Math.pow(1 - k, .8), a = STK.a0 + k * 5.5; tx = bx + Math.cos(a) * rr; tz = bz + Math.sin(a) * rr;
      if ((cur.r || 0) >= 3 && !cur.teased && k > .3) { cur.teased = 1; leapFish(STK.x, STK.z, 'carp', 0, cur.r >= 4 ? 80 : 20, 1); const nb = ui.querySelector('.nv'); if (nb) nb.textContent = '😮 Something BIG just jumped…' }
      if (cur.nib && cur.nib.length && now - cur.t0 > cur.nib[0]) { cur.nib.shift(); cur.dip = now; ripple(bobber.position, .45); const nb = ui.querySelector('.nv'); if (nb) nb.textContent = '…a nibble. Not yet!' } }
    else if (state === 'bite') { tx = bx; tz = bz }
    else { const run = cur.run > now, a = t * (run ? 2.6 : 1.2) + STK.a0, me = isDeep() ? window.__boat.pos : W().P.pos, pr = Math.min(.75, cur.hit / Math.max(1, cur.hits) * .8), cx = castTo.x + (me.x - castTo.x) * pr, cz = castTo.z + (me.z - castTo.z) * pr; tx = cx + Math.cos(a) * (run ? 4 : 1.6); tz = cz + Math.sin(a) * (run ? 4 : 1.6); if (!e.inLake(tx, tz, -1)) { tx = castTo.x; tz = castTo.z }
      if (!run && now > cur.nextRun && cur.r > 0) { cur.run = now + 700 + 180 * cur.r; cur.nextRun = cur.run + Math.max(1200, 3200 - 350 * cur.r) + Math.random() * 1200; ripple(bobber.position, 1.1); drawReel() }
      else if (cur.run && now > cur.run && cur.runShown !== cur.run) { cur.runShown = cur.run; drawReel() }
      if (now - cur.biteT > 17500) { msg('It wore you out and slipped away…'); land(false) } }
    const dx = tx - STK.x, dz = tz - STK.z, d = Math.hypot(dx, dz), sp = Math.min(d, dt * (state === 'reel' ? 9 : 5)); if (d > .01) { STK.x += dx / d * sp; STK.z += dz / d * sp; STK.hd = Math.atan2(dz, dx) }
    if (e.inLake(STK.x, STK.z, -1)) FS[0].set(STK.x, STK.z, STK.hd, STK.sz); else FS[0].w = 0 } else { STK.on = 0; FS[0].w = 0 }
  // ambient: a few fish around whoever is fishing (or near the dock), drifting between random points
  const ax = near ? near.x : dock.tip.x, az = near ? near.z : dock.tip.z;
  if (!AMB.length) for (let i = 0; i < FS.length - 1; i++) AMB.push({ x: ax, z: az, tx: ax, tz: az, hd: 0, sz: .5 + Math.random() * .7, sp: .8 + Math.random() * 1.2, w: 0 });
  AMB.forEach((f, i) => { let dx = f.tx - f.x, dz = f.tz - f.z, d = Math.hypot(dx, dz);
    if (d < .5 || Math.hypot(f.x - ax, f.z - az) > 45) { for (let k = 0; k < 8; k++) { const a = Math.random() * 6.283, r = 6 + Math.random() * 26, x = ax + Math.cos(a) * r, z = az + Math.sin(a) * r; if (e.inLake(x, z, -2)) { f.tx = x; f.tz = z; if (!f.w || Math.hypot(f.x - ax, f.z - az) > 45) { f.x = x + 3; f.z = z } break } } dx = f.tx - f.x; dz = f.tz - f.z; d = Math.hypot(dx, dz) || 1 }
    const sp = f.sp * dt * (1 + .3 * Math.sin(t * 2 + i)); f.x += dx / d * sp; f.z += dz / d * sp; f.hd += (Math.atan2(dz, dx) - f.hd + Math.PI * 3) % (Math.PI * 2) - Math.PI > 0 ? dt * 2 : -dt * 2; f.hd = Math.atan2(dz, dx);
    f.w = e.inLake(f.x, f.z, -1) ? f.sz : 0; FS[i + 1].set(f.x, f.z, f.hd, f.w) }) }
// catch streak (just for fun, no coin effect) + leaping fish
let streak = 0, srvBest = 0; const STKS = () => streak >= 2 ? `<div style="color:#ffb020;font-weight:800;margin-top:4px">🔥 ${streak} catch streak${streak >= 5 ? ' · on fire!' : ''}${srvBest && streak >= srvBest ? ' · new weekly best!' : ''}</div>` : '';
const LEAP = { list: [], next: 0, meshes: {} };
function leapFish(x, z, id = 'minnow', r = 0, kg = .3, big = 0) { const c = W(); if (!c) return; const key = id + (big ? 'b' : ''); let m = LEAP.meshes[key];
  if (!m) { m = LEAP.meshes[key] = buildFish(id, r, kg); m.visible = false; c.S.add(m) } if (LEAP.list.some(l => l.m === m)) return;
  const a = Math.random() * 6.283, len = big ? 4 : 2 + Math.random() * 1.5; LEAP.list.push({ m, t: 0, dur: big ? 1.15 : .75, x0: x, z0: z, x1: x + Math.cos(a) * len, z1: z + Math.sin(a) * len, h: big ? 2.6 : 1 + Math.random() * .8 });
  ripple({ x, z }, big ? 1.3 : .6) }
function leaps(t) { const dt = Math.min(.05, t - (leaps.lt || t)); leaps.lt = t; const e = window.__estate;
  for (let i = LEAP.list.length - 1; i >= 0; i--) { const l = LEAP.list[i]; l.t += dt; const k = l.t / l.dur, m = l.m;
    if (k >= 1) { m.visible = false; ripple({ x: l.x1, z: l.z1 }, l.h > 2 ? 1.5 : .7); if (l.h > 2 && rod) splash(new THREE.Vector3(l.x1, .3, l.z1)); LEAP.list.splice(i, 1); continue }
    m.visible = true; m.position.set(l.x0 + (l.x1 - l.x0) * k, .2 + Math.sin(k * Math.PI) * l.h, l.z0 + (l.z1 - l.z0) * k); m.rotation.set(0, Math.atan2(l.x0 - l.x1, l.z0 - l.z1), 0); m.rotateX((k - .5) * 2.4); if (m.userData.tail) m.userData.tail.rotation.y = Math.sin(t * 30) * .7 }
  // now and then an ambient fish jumps near whoever is fishing
  if (FISHOK && e && t > LEAP.next) { LEAP.next = t + 7 + Math.random() * 12; const f = AMB[Math.floor(Math.random() * AMB.length)];
    if (f && f.w > 0) { const sp = ['minnow', 'bluegill', 'perch', 'shiner', 'trout'][Math.floor(Math.random() * 5)]; leapFish(f.x, f.z, sp, sp === 'trout' ? 1 : 0, .4) } } }
async function land(ok) { const was = cur; was.bob = bobber.position.clone(); state = 'idle'; bobber.visible = false;
  let f = null; if (was.srv) { const r = await api('reel', { cid: was.cid, ok }).catch(() => ({})); if (r.fish) { f = r.fish; prof = r.profile; W()._ft = r.today; if (r.streak) { streak = r.streak.cur - 1; srvBest = r.streak.wbest } } else if (ok) return msg(r.error === 'timing' ? 'Too slow, it slipped off.' : 'Server busy.') }
  else { if (bait !== 'worm' && prof.bait[bait] > 0) prof.bait[bait]--; if (ok) { f = was.fish; const L = prof.log[f.id] || { n: 0, best: 0 }; L.n++; L.best = Math.max(L.best, f.kg); prof.log[f.id] = L; prof.creel.push([f.id, f.kg, f.val]); prof.n++ } saveLocal() }
  if (!ok) { streak = 0; return } streak++; rod.lift = 1; rod.r = f.r; if (rod.fm) W().S.remove(rod.fm); rod.fm = buildFish(f.id, f.r, f.kg); W().S.add(rod.fm); rod.from.copy(was.bob || bobber.position).setY(.3); rod.fm.position.copy(rod.from); splash(rod.from); window.__citySend && window.__citySend({ t: 'fc' }); dispatchEvent(new CustomEvent('bc-fish-catch', { detail: { today: (was.srv && W()._ft) || 0 } })); ui.style.display = 'none'; await new Promise(r => setTimeout(r, 1100)); ui.style.display = 'block'; ui.innerHTML = `<div style="color:${RC[f.r]};font-weight:800">${RN[f.r]}</div><div style="font-size:20px;font-weight:800">🐟 ${f.name}</div>${f.kg} kg · worth ${f.val} 🪙<div class="nv">✓ added to your creel & fish log</div>${STKS()}`; clearTimeout(land.k); land.k = setTimeout(() => { if (state === 'idle') ui.style.display = 'none' }, 2600) }
function splash(p) { const a = rod.drops.geometry.attributes.position, v = rod.dv, n = rod.r < 0 ? 6 : 10 + rod.r * 4; for (let i = 0; i < a.count; i++) { const on = i < n, ang = Math.random() * 6.283, sp = 1 + Math.random() * 2.5; a.setXYZ(i, p.x, on ? .3 : -50, p.z); v[i * 3] = Math.cos(ang) * sp; v[i * 3 + 1] = on ? 3 + Math.random() * 4 : 0; v[i * 3 + 2] = Math.sin(ang) * sp } a.needsUpdate = true; rod.drops.visible = true;
  ripple(p, 1.7); rod.ring.position.copy(p).setY(.3); rod.ring.scale.setScalar(.5); rod.ring.material.opacity = .8; rod.ring.visible = true }
function stop() { state = 'idle'; FL.on = 0; STK.on = 0; bobber.visible = false; ui.style.display = 'none' }
function msg(t) { state = 'idle'; bobber.visible = false; ui.style.display = 'block'; ui.innerHTML = t + '<br><button id="fOk">OK</button>'; ui.querySelector('#fOk').onclick = () => ui.style.display = 'none' }
// ---------- shop + log ----------
async function refresh() { if (!tok()) return; const r = await api('state').catch(() => null); if (!r || !r.rod) return; prof = r;
  // one-time: bring this browser's guest progress into the wallet profile (server validates + caps it)
  let g = null; try { g = JSON.parse(LS.bcFish || 'null') } catch (e) { } const has = g && (g.coins > 0 || (g.rods || []).length > 1 || Object.keys(g.log || {}).length);
  if (has && LS.bcFishImp !== '1') { const q = await api('import', { guest: g }).catch(() => null); if (q && (q.ok || q.error === 'already_imported' || q.error === 'profile_not_new')) LS.bcFishImp = '1'; if (q && q.ok) { prof = q.profile; msg('🎣 Your guest fishing progress was moved to your wallet profile.') } } }
const SN = id => (SPECIES.find(s => s[0] === id) || [0, id])[1];
async function topHtml() { try { const r = await fetch(SRV + '/api/fish/top').then(r => r.json()); const t = r.top || [];
  return '<h4 style="margin:10px 0 4px">🏆 Biggest catch this week</h4>' + (t.length ? t.map((e, i) => `<div class="c" style="margin:3px 0">${i + 1}. ${e.who} · <b>${e.kg} kg</b> ${SN(e.sp)}</div>`).join('') : '<div class="nv">No signed-in catches yet this week. Be the first!</div>') + '<h4 style="margin:10px 0 4px">🔥 Longest catch streak this week</h4>' + ((r.streaks || []).length ? r.streaks.map((e, i) => `<div class="c" style="margin:3px 0">${i + 1}. ${e.who} · <b>${e.n} in a row</b></div>`).join('') : '<div class="nv">No streaks yet. Land 2+ fish in a row without one getting away!</div>') + '<div class="nv">Signed-in anglers only · resets Monday (UTC)</div>' } catch (e) { return '' } }
const putTop = () => topHtml().then(h => { const e = panel.querySelector('#fTop'); if (e) e.innerHTML = h });
async function openShop() { await refresh(); const v = prof.creel.reduce((a, f) => a + f[2], 0);
  panel.innerHTML = `<button class="x" aria-label="Close">✕</button><h3 style="margin:0 0 6px">🎣 Tackle & Bait</h3>${NV}<p>🪙 <b>${prof.coins}</b> lake coins · creel: ${prof.creel.length} fish (${v} 🪙)</p><button class="b" id="fSell">Sell all fish (+${v} 🪙)</button>
   <h4>Rods</h4>${SHOP.rods.map(r => `<button class="b" data-rod="${r[0]}">${prof.rod === r[0] ? '✓ ' : ''}${r[1]} · ${prof.rods.includes(r[0]) ? (prof.rod === r[0] ? 'equipped' : 'equip') : r[2] + ' 🪙'}</button>`).join('')}
   <h4>Bait <span class="nv">(using: ${bait})</span></h4>${SHOP.baits.map(b => { if (b[0] === 'worm') return `<button class="b" data-use="worm">${bait === 'worm' ? '✓ ' : ''}${b[1]} · free</button>`; const mx = Math.min(50, Math.floor(prof.coins / b[2])), have = prof.bait[b[0]] || 0;
     return `<div class="c" style="margin:4px 0"><b>${b[1]}</b> · ${b[2]} 🪙 each · have ${have}${have ? ` <button class="b" style="width:auto;padding:4px 10px" data-use="${b[0]}">${bait === b[0] ? '✓ using' : 'use'}</button>` : ''}<br>${mx >= 1 ? `<input type="range" min="1" max="${mx}" value="1" data-q="${b[0]}" style="width:60%;vertical-align:middle"> <button class="b" style="width:auto;padding:6px 10px" data-bait="${b[0]}">Buy 1 · ${b[2]} 🪙</button>` : '<span class="nv">Not enough lake coins yet</span>'}</div>` }).join('')}
   <button class="b" id="fLog2">📖 Fish log</button><div id="fTop"></div>`;
  panel.style.display = 'block'; panel.querySelector('.x').onclick = () => panel.style.display = 'none'; panel.querySelector('#fLog2').onclick = openLog; putTop();
  panel.querySelector('#fSell').onclick = async () => { if (tok()) { const r = await api('sell', {}); if (r.profile) prof = r.profile } else { prof.coins += v; prof.creel = []; saveLocal() } openShop() };
  panel.querySelectorAll('[data-rod]').forEach(b => b.onclick = () => buy('rod', b.dataset.rod)); panel.querySelectorAll('[data-use]').forEach(b => b.onclick = () => { bait = b.dataset.use; openShop() });
  panel.querySelectorAll('[data-q]').forEach(r => { const id = r.dataset.q, it = SHOP.baits.find(x => x[0] === id), btn = panel.querySelector(`[data-bait="${id}"]`); r.oninput = () => btn.textContent = `Buy ${r.value} · ${r.value * it[2]} 🪙` });
  panel.querySelectorAll('[data-bait]').forEach(b => b.onclick = () => { const r = panel.querySelector(`[data-q="${b.dataset.bait}"]`); buy('bait', b.dataset.bait, r ? +r.value : 1) }) }
async function buy(kind, id, qty = 1) { qty = Math.max(1, Math.min(50, qty | 0)); if (tok()) { const r = await api('buy', { kind, id, qty: kind === 'bait' ? qty : 1 }); if (r.error) return alert(r.error === 'not_enough_coins' ? 'Not enough lake coins.' : 'Could not buy.'); prof = r.profile }
  else { const it = (kind === 'rod' ? SHOP.rods : SHOP.baits).find(x => x[0] === id); if (kind === 'rod' && prof.rods.includes(id)) prof.rod = id; else { const cost = kind === 'rod' ? it[2] : it[2] * qty; if (prof.coins < cost) return alert('Not enough lake coins.'); prof.coins -= cost; if (kind === 'rod') { prof.rods.push(id); prof.rod = id } else prof.bait[id] = (prof.bait[id] || 0) + qty } saveLocal() }
  if (kind === 'bait') bait = id; openShop() }
function openLog() { const got = Object.keys(prof.log).length;
  panel.innerHTML = `<button class="x" aria-label="Close">✕</button><h3 style="margin:0 0 6px">📖 Fish log · ${got}/${SPECIES.length}</h3><div class="nv">Some fish only bite at night, in deep water (from a boat), or in certain market weather.</div><div class="g" style="margin-top:8px">${SPECIES.map(s => { const L = prof.log[s[0]];
    return `<div class="c" style="border-color:${RC[s[2]]}55"><b style="color:${L ? RC[s[2]] : '#666'}">${L ? s[1] : '???'}</b><br>${RN[s[2]]}${L ? ` · ×${L.n} · best ${L.best} kg` : (s[5].night ? ' · 🌙' : '') + (s[5].deep ? ' · 🚤' : '') + (s[5].weather ? ' · ⛅' : '')}</div>` }).join('')}</div>`;
  panel.insertAdjacentHTML('beforeend', '<div id="fTop"></div>'); putTop(); panel.style.display = 'block'; ui.style.display = 'none'; panel.querySelector('.x').onclick = () => panel.style.display = 'none' }
bar.querySelector('#fCast').onclick = doCast; bar.querySelector('#fShop').onclick = openShop;
// ---------- per-frame: show buttons when in reach, animate bobber + reel marker ----------
function tick() { requestAnimationFrame(tick); if (window.__cityPaused) return; const c = W(), e = window.__estate; if (!c || !e || !dock) return; const t = performance.now() / 1000, m = c.getMode();
  const p = isDeep() ? window.__boat.pos : c.P.pos, walk = m === 'explore';
  const nearDock = p.distanceTo(dock.tip) < 6 || (p.distanceTo(dock.base) < 22 && Math.abs(p.clone().sub(dock.base).dot(dock.side)) < 3), shore = !e.inLake(p.x, p.z) && e.inLake(p.x, p.z, 4);
  const canFish = walk && (nearDock || shore || isDeep()); FISHOK = canFish; const nearShop = walk && !isDeep() && p.distanceTo(shopPos) < 10;
  bar.style.display = canFish || nearShop ? 'flex' : 'none'; bar.querySelector('#fCast').style.display = canFish ? '' : 'none'; bar.querySelector('#fShop').style.display = nearShop ? '' : 'none';
  if (!canFish && state !== 'idle' && !isDeep()) stop();
  { const show = canFish || state !== 'idle' || rod.lift > 0; rod.rg.visible = show; const lk = ROD_LOOK[prof.rod] || ROD_LOOK.basic; rod.rm.color.setHex(lk[0]); rod.rm.emissive.setHex(lk[1]); rod.rm.emissiveIntensity = lk[1] ? .6 + .3 * Math.sin(t * 3) : 0;
    const dt = Math.min(.05, t - (tick.lt0 || t)); tick.lt0 = t; tick.dtv = dt; rod.swing = Math.max(0, rod.swing - dt * 1.6); rod.pull = Math.max(0, rod.pull - dt * 4);
    const sw = rod.swing > 0 ? (rod.swing > .55 ? -(1 - rod.swing) * 4 : (rod.swing - .55) * 2) : 0; rod.rg.rotation.x = -.9 + sw + rod.pull * .5;
    const run = cur && cur.run > performance.now(), bend = state === 'bite' ? .45 + Math.sin(t * 22) * .18 : state === 'reel' ? (run ? .85 + Math.sin(t * 14) * .12 : .45 + rod.pull * .35 + Math.sin(t * 9) * .06) : rod.lift > 0 ? .55 : rod.swing > .55 ? -.25 : .04; bendRod(rod.seg, bend);
    const tp = new THREE.Vector3(); rod.tip.getWorldPosition(tp);
    if (FL.on && bobber.visible) { const k = (t - FL.t0) / FL.dur; if (k <= 0) bobber.position.copy(tp); else if (k < 1) { bobber.position.lerpVectors(castFrom, castTo, k); bobber.position.y = castFrom.y + (castTo.y - castFrom.y) * k + Math.sin(k * Math.PI) * FL.h; bobber.rotation.set(k * 8, 0, 0) }
      else { FL.on = 0; bobber.position.copy(castTo); bobber.rotation.set(0, 0, 0); ripple(castTo, .9); if (rod) { const r0 = rod.r; rod.r = -1; splash(castTo); rod.r = r0 } } } else if (rod.swing > .55 && !bobber.visible) castFrom.copy(tp);
    if (rod.lift > 0) { rod.lift = Math.max(0, rod.lift - dt * .6); const e = 1 - rod.lift, hang = tp.clone().add(new THREE.Vector3(0, -1.1, 0)); rod.fm.visible = true;
      if (e < .2) { const k = e / .2; rod.fm.position.copy(rod.from).setY(.3 + Math.sin(k * Math.PI / 2) * 2.2); rod.fm.rotation.set(-1.2 + k * .6, t * 3, Math.sin(t * 30) * .5) }   // burst up out of the water
      else if (e < .7) { const k = (e - .2) / .5, top = rod.from.clone().setY(2.5); rod.fm.position.lerpVectors(top, hang, k); rod.fm.position.y += Math.sin(k * Math.PI) * 2; rod.fm.rotation.set(Math.sin(t * 24) * .6, t * 4, k * 6.283) }   // flip + wiggle along the line
      else { rod.fm.position.copy(hang); rod.fm.rotation.set(Math.PI / 2, 0, Math.sin(t * 16) * .5) }
      if (rod.fm.userData.tail) rod.fm.userData.tail.rotation.y = Math.sin(t * (e < .7 ? 26 : 14)) * .6;
      if (!rod.lift) rod.fm.visible = false }
    if (rod.drops.visible) { const a = rod.drops.geometry.attributes.position, v = rod.dv; let alive = 0; for (let i = 0; i < a.count; i++) { v[i * 3 + 1] -= 9.8 * dt; const y = a.getY(i) + v[i * 3 + 1] * dt; a.setXYZ(i, a.getX(i) + v[i * 3] * dt, Math.max(.2, y), a.getZ(i) + v[i * 3 + 2] * dt); if (y > .2) alive++ } a.needsUpdate = true; if (!alive) rod.drops.visible = false }
    if (rod.ring.visible) { const m = rod.ring.material; m.opacity -= dt * .7; rod.ring.scale.addScalar(dt * 3); if (m.opacity <= 0) rod.ring.visible = false }
    const end = rod.lift > 0 ? rod.fm.position : bobber.visible ? bobber.position : null; rod.line.visible = show && !!end;
    if (end) { const d = tp.distanceTo(end), sag = rod.lift > 0 ? 0 : FL.on ? .3 : state === 'wait' ? Math.min(2.2, .06 * d + .25) + Math.sin(t * 1.3) * .08 : state === 'bite' ? .12 : 0; setLine(rod.lg, tp, end, sag, state === 'reel' ? (run ? .05 : .02) : 0, t) } }
  if (bobber.visible && !FL.on) { const now = performance.now(), nib = cur && cur.dip && now - cur.dip < 450 ? 1 - (now - cur.dip) / 450 : 0;
    if (state === 'bite') { bobber.position.y = -0.05 + Math.sin(t * 20) * 0.1; bobber.rotation.set(Math.sin(t * 17) * .5, 0, Math.cos(t * 13) * .4) }
    else if (state === 'reel') { const run = cur && cur.run > now, k = Math.min(1, dt0(t) * (run ? 5 : 3)); bobber.position.x += (STK.x - bobber.position.x) * k; bobber.position.z += (STK.z - bobber.position.z) * k; bobber.position.y = (run ? .05 : .3) + Math.sin(t * 16) * .08; bobber.rotation.set(run ? .9 : .4 + Math.sin(t * 11) * .2, Math.atan2(bobber.position.x - p.x, bobber.position.z - p.z), 0);
      if (t - (tick.th || 0) > (run ? .45 : 1.1)) { tick.th = t; ripple(bobber.position, run ? .9 : .5); if (run || Math.random() < .4) { const r0 = rod.r; rod.r = -1; splash(bobber.position); rod.r = r0 } } }
    else { bobber.position.y = 0.42 + Math.sin(t * 2.2) * 0.05 - nib * .18; bobber.rotation.set(Math.sin(t * 1.7) * .06 + nib * .6, 0, Math.cos(t * 1.3) * .06) } }
  pub(t, p);
  { const dt2 = Math.min(.05, t - (tick.lt || t)); tick.lt = t; shadows(t, dt2, canFish ? p : null);
    const bt = window.__boat; if (bt && bt.active && bt.cur && Math.abs(bt.cur.v || 0) > 2 && t - (tick.wk || 0) > .28) { tick.wk = t; ripple(bt.pos, Math.min(1.3, Math.abs(bt.cur.v) / 12)) }
    if (state === 'aim') { const mk = $('fMk'); if (mk) mk.style.left = (aimPow() * 100) + '%' } }
  if (state === 'reel') { cur.ph += 0.05 * cur.spd * 2.2 * Math.min(3, 60 * Math.min(.05, t - (tick.lr || t))); tick.lr = t; const mk = $('fMk'); if (mk) mk.style.left = ((Math.sin(cur.ph) + 1) / 2 * 100) + '%' } else tick.lr = 0; leaps(t); remotes(t, dt0()) }
const dt0 = () => tick.dtv || .016;
// ---------- what other players see: my fishing pose goes out on the city channel (tiny, on change) ----------
const PUB = { s: -1, t: 0, x: 0, z: 0 };
function pub(t, p) { const s = state === 'wait' ? (FL.on ? 1 : 1) : state === 'bite' ? 2 : state === 'reel' ? 3 : 0, b = FL.on ? castTo : bobber.position, moved = s === 3 && Math.hypot(b.x - PUB.x, b.z - PUB.z) > 1.2 && t - PUB.t > 1;
  if (s === PUB.s && !moved && !(s && t - PUB.t > 20)) return; if (!window.__citySend) return; PUB.s = s; PUB.t = t; PUB.x = b.x; PUB.z = b.z;
  window.__citySend(s ? { t: 'fs', s, x: Math.round(b.x * 10) / 10, z: Math.round(b.z * 10) / 10, rd: Math.max(0, ROD_IDX.indexOf(prof.rod)) } : { t: 'fs', s: 0 }) }
// ---------- other anglers: rod in hand, curved line, bobber, bites, fights and catches ----------
const RG = new Map(); let rgCatch = new Map();
addEventListener('bc-peer-catch', e => { const m = e.detail || {}; if (m.pid) rgCatch.set(m.pid, { sp: SPECIES.some(x => x[0] === m.sp) ? m.sp : 'minnow', kg: Math.max(.05, Math.min(500, +m.kg || .3)), r: Math.max(0, Math.min(4, m.r | 0)), t: performance.now() / 1000 }) });
function gearFor(id) { let g = RG.get(id); if (g) return g; const c = W(), hold = new THREE.Group(), R0 = mkRod(ROD_LOOK.basic); R0.rg.position.set(.32, 1.05, -.15); R0.rg.rotation.x = -.9; hold.add(R0.rg); c.S.add(hold);
  const bob = mkBobber(); bob.visible = false; c.S.add(bob); const L = mkLine(c.S); g = { hold, ...R0, bob, ...L, s: 0, bx: 0, bz: 0, fl: 0, sw: 0, rd: -1, lift: 0, fm: null, from: new THREE.Vector3() }; RG.set(id, g); return g }
function dropGear(id) { const g = RG.get(id); if (!g) return; const S = W().S; S.remove(g.hold); S.remove(g.bob); S.remove(g.line); g.lg.dispose(); if (g.fm) S.remove(g.fm); RG.delete(id) }
const _tp = new THREE.Vector3();
function remotes(t, dt) { const P = window.__peers; if (!P) return; const cam = W().C.position, live = new Set();
  const list = [...P.values()].filter(q => (q.fs || RG.has(q.id)) && (q.md === 'w' || q.md === 'b') && q.g.position.distanceTo(cam) < 160).sort((a, b) => a.g.position.distanceToSquared(cam) - b.g.position.distanceToSquared(cam)).slice(0, W().MOBILE ? 4 : 8);
  for (const q of list) { const f = q.fs || [0, 0, 0, 0], s = f[0], ck = rgCatch.get(q.id); if (!s && !RG.has(q.id) && !ck) continue; const g = gearFor(q.id); live.add(q.id);
    if (g.rd !== f[3]) { g.rd = f[3]; const lk = ROD_LOOK[ROD_IDX[f[3]] || 'basic']; g.rm.color.setHex(lk[0]); g.rm.emissive.setHex(lk[1]); g.rm.emissiveIntensity = lk[1] ? .7 : 0 }
    if (s && (s !== g.s || Math.hypot(f[1] - g.bx, f[2] - g.bz) > .3)) { if (!g.s) { g.sw = 1; g.fl = t + .28; g.tx = f[1]; g.tz = f[2]; g.bob.visible = true; g.lift = 0; if (g.fm) g.fm.visible = false } if (g.s !== s && s === 2) ripple({ x: f[1], z: f[2] }, 1.3); g.bx = f[1]; g.bz = f[2] }
    if (!s && g.s) g.off = t + 3;
    if (!s && ck && t - ck.t < 4 && g.off && t < g.off) { g.off = 0; g.lift = 1; const S = W().S; if (g.fm) S.remove(g.fm); g.fm = buildFish(ck.sp, ck.r, ck.kg); S.add(g.fm); g.from.set(g.bob.position.x, .3, g.bob.position.z); const r0 = rod.r; rod.r = ck.r; splash(g.from); rod.r = r0; ripple(g.from, 1.4); rgCatch.delete(q.id);
      if (q.tag) { const b = document.createElement('div'); b.className = 'pbub'; b.textContent = `🐟 ${SN(ck.sp)} · ${ck.kg} kg`; q.tag.prepend(b); setTimeout(() => b.remove(), 4500) } }
    if (!s && g.off && t > g.off && !g.lift) { g.off = 0; g.bob.visible = false } g.s = s;
    const P0 = q.g.position, by = q.md === 'b' ? .3 : 0, tx = g.bob.visible ? g.bob.position.x : g.bx, tz = g.bob.visible ? g.bob.position.z : g.bz, yaw = (s || g.lift || g.off) ? Math.atan2(-(tx - P0.x), -(tz - P0.z)) : (q.wk ? q.wk.rotation.y : 0);
    if ((s || g.lift || g.off) && q.wk) q.wk.rotation.y = yaw; g.hold.position.set(P0.x, P0.y + by, P0.z); g.hold.rotation.y = yaw; g.hold.visible = !!(s || g.lift > 0 || g.off);
    g.sw = Math.max(0, g.sw - dt * 1.6); const sw = g.sw > 0 ? (g.sw > .55 ? -(1 - g.sw) * 4 : (g.sw - .55) * 2) : 0; g.rg.rotation.x = -.9 + sw + (s === 3 ? .35 + Math.sin(t * 3) * .15 : 0);
    bendRod(g.seg, s === 2 ? .45 + Math.sin(t * 22) * .18 : s === 3 ? .6 + Math.sin(t * 7) * .2 : g.lift > 0 ? .55 : .04); g.tip.getWorldPosition(_tp);
    if (g.bob.visible) { const B = g.bob.position, k = g.fl ? (t - g.fl) / (.55 + Math.hypot(g.tx - P0.x, g.tz - P0.z) / 32) : 2;
      if (g.fl && k <= 0) B.copy(_tp); else if (g.fl && k < 1) { if (k < .05 || !g.f0) g.f0 = _tp.clone(); B.set(g.f0.x + (g.tx - g.f0.x) * k, g.f0.y * (1 - k) + .45 * k + Math.sin(k * Math.PI) * 3, g.f0.z + (g.tz - g.f0.z) * k) }
      else { if (g.fl) { g.fl = 0; g.f0 = null; ripple({ x: g.tx, z: g.tz }, .8) } const kk = Math.min(1, dt * 3); B.x += (g.bx - B.x) * kk; B.z += (g.bz - B.z) * kk;
        if (s === 2) { B.y = -.05 + Math.sin(t * 20) * .1; g.bob.rotation.set(Math.sin(t * 17) * .5, 0, Math.cos(t * 13) * .4) } else if (s === 3) { B.x += Math.sin(t * 2.3 + q.id) * dt * 2; B.y = .25 + Math.sin(t * 16) * .08; g.bob.rotation.set(.5, 0, 0); if (t - (g.th || 0) > 1) { g.th = t; ripple(B, .6) } } else { B.y = .42 + Math.sin(t * 2.2 + q.id) * .05; g.bob.rotation.set(Math.sin(t * 1.7) * .06, 0, 0) } } }
    if (g.lift > 0) { g.lift = Math.max(0, g.lift - dt * .45); const e = 1 - g.lift, hang = _tp.clone().add(new THREE.Vector3(0, -1.1, 0)), m = g.fm; g.bob.visible = false;
      if (e < .2) { const k = e / .2; m.position.copy(g.from).setY(.3 + Math.sin(k * Math.PI / 2) * 2.2); m.rotation.set(-1.2 + k * .6, t * 3, Math.sin(t * 30) * .5) } else if (e < .6) { const k = (e - .2) / .4, top = g.from.clone().setY(2.5); m.position.lerpVectors(top, hang, k); m.position.y += Math.sin(k * Math.PI) * 2; m.rotation.set(Math.sin(t * 24) * .6, t * 4, k * 6.283) } else { m.position.copy(hang); m.rotation.set(Math.PI / 2, 0, Math.sin(t * 16) * .5) }
      if (m.userData.tail) m.userData.tail.rotation.y = Math.sin(t * 20) * .6; if (!g.lift) m.visible = false }
    const end = g.lift > 0 && g.fm ? g.fm.position : g.bob.visible ? g.bob.position : null; g.line.visible = g.hold.visible && !!end;
    if (end) setLine(g.lg, _tp, end, g.lift > 0 ? 0 : s === 1 && !g.fl ? Math.min(2.2, .06 * _tp.distanceTo(end) + .25) : s === 1 ? .3 : s === 2 ? .12 : 0, s === 3 ? .02 : 0, t) }
  for (const id of [...RG.keys()]) if (!live.has(id)) dropGear(id) }
window.__fish = { rg: () => RG.size, openShop, openLog, doCast, prof: () => prof, roll, buildFish };
(function boot() { if (!window.__ready || !W() || !window.__estate) return setTimeout(boot, 500); build(); refresh(); requestAnimationFrame(tick) })();

// ---------- keyboard fishing (PC): F starts a cast at the water; Space/F then casts, hooks, reels and dismisses; Esc reels in ----------
// PC = real mouse as the primary pointer and not a phone/tablet. Android often reports any-pointer:fine (stylus, desktop mode), so don't trust that alone.
const PCK = !/Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent) && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) && matchMedia('(pointer:fine)').matches && matchMedia('(hover:hover)').matches;
{ const lab = (id, k) => { const b = ui.querySelector('#' + id) || bar.querySelector('#' + id); if (b && !b.dataset.k) { b.dataset.k = 1; b.insertAdjacentHTML('beforeend', ` <kbd style="font:700 11px system-ui;padding:0 5px;border:1px solid #fff6;border-radius:4px;margin-left:4px;opacity:.85">${k}</kbd>`) } };
  if (PCK) { new MutationObserver(() => { lab('fGo', 'Space'); lab('fHook', 'Space'); lab('fReel', 'Space'); lab('fOk', 'Space'); lab('fStop', 'Esc') }).observe(ui, { childList: true });
  lab('fCast', 'F') }   // key hints only on PC; keys still work with a phone + Bluetooth keyboard
  addEventListener('keydown', ev => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return; const c = ev.code, act = c === 'Space' || c === 'KeyF', okUp = ui.style.display !== 'none' && ui.querySelector('#fOk');
    if (state === 'idle' && !okUp) { if (c === 'KeyF' && !ev.repeat && FISHOK && bar.style.display !== 'none' && bar.querySelector('#fCast').style.display !== 'none' && !(window.__drone && window.__drone.on)) { doCast(); ev.preventDefault(); ev.stopImmediatePropagation() } return }
    if (c === 'Escape' && (state === 'wait' || state === 'aim')) { stop(); ev.preventDefault(); ev.stopImmediatePropagation(); return }
    if (!act) return; ev.preventDefault(); ev.stopImmediatePropagation(); if (ev.repeat) return;   // swallow Space so you don't jump mid-cast
    if (okUp && state === 'idle') { ui.style.display = 'none'; return }
    if (state === 'aim') castAt(aimPow()); else if (state === 'wait' || state === 'bite') hook(); else if (state === 'reel') tapReel() }, true);
  addEventListener('keyup', ev => { if ((ev.code === 'Space' || ev.code === 'KeyF') && state !== 'idle') ev.stopImmediatePropagation() }, true) }
