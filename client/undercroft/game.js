// The Ruin of Vael Ithren: an original third-person action RPG slice beneath BURN City (entered from the Ember Crossroads).
// Local-device save only (localStorage 'bcUndercroftRPG'); Eternal Grind's save is never touched. No real-money rewards.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as R from './rpg-core.mjs';
import * as MAP from './ruin-map.mjs';
import { buildWorld, updateWorld, disposeWorld, setPedestal, openGate, setBossDoor, freeHeart, takeHeart, glow, glowTex, wx } from './world.js';
import { loadAssets, disposeAssets, Enemy, disposeShared } from './actors.js';
import { Hero, loadFolk, disposeFolk } from './hero.js';
import { loadArsenal, KINDS, Rig } from './arsenal.js';
import * as UI from './ui.js';
import * as SFX from './sfx.js';

const Q = new URLSearchParams(location.search), TEST = Q.has('ugtest');
const touch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
const store = (() => { try { return window.localStorage; } catch (e) { return null; } })();
const save0 = R.load(store);
function autoTier() { if (['low', 'medium', 'high'].includes(Q.get('tier'))) return Q.get('tier'); if (save0.settings.tier) return save0.settings.tier; const mem = navigator.deviceMemory || 4, cores = navigator.hardwareConcurrency || 4; if (touch) return mem <= 3 || cores <= 4 ? 'low' : 'medium'; return cores <= 4 ? 'medium' : 'high'; }
const tier = autoTier();
if (touch) document.body.classList.add('touch');

const G = window.__ruinG = { tier, touch, save: save0, modal: null, sens: save0.settings.sens || 1, muted: false, explored: new Set(), enemies: [], bolts: [], shots: [], rings: [], fx: [], t: 0, hitstop: 0, shake: 0, listeners: [], running: true };
UI.init(G);
const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); G.listeners.push([el, ev, fn, o]); };

// ------------------------------------------------------------------ renderer + scene
const canvas = document.getElementById('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: tier !== 'low' && !touch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, tier === 'high' ? 2 : tier === 'medium' ? 1.5 : 1));
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = tier === 'low' ? 1.25 : 1.1;
renderer.shadowMap.enabled = tier === 'high'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0a08); scene.fog = new THREE.FogExp2(0x15100c, tier === 'low' ? .03 : .021);
const camera = new THREE.PerspectiveCamera(touch ? 62 : 58, innerWidth / innerHeight, .1, 140);
G.scene = scene; G.camera = camera; G.renderer = renderer;
let composer = null, bloom = null;
if (tier !== 'low') { composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), tier === 'high' ? .62 : .5, .55, .78); composer.addPass(bloom); composer.addPass(new OutputPass()); }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (composer) { composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); } }
resize(); on(window, 'resize', resize);
const texLoader = new THREE.TextureLoader(), texCache = new Map();
function loadTex(url, srgb) { if (texCache.has(url)) return texCache.get(url); const p = texLoader.loadAsync(url).then(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = tier === 'high' ? 8 : 4; return t; }); texCache.set(url, p); return p; }
// two dedicated fx lights (fireballs, frost wisps); light count stays constant so shaders never recompile mid-fight
const fill = new THREE.PointLight(0xffc89a, tier === 'low' ? 0 : 7, 9, 2); scene.add(fill); G.fill = fill;
const fxLights = [0, 1].map(() => { const L = new THREE.PointLight(0xff7a30, 0, 9, 2); scene.add(L); return L; });

// ------------------------------------------------------------------ boot
const LORE = ['Below the Ember Crossroads the pale builders left their halls, their lumen stones, and their dead.', 'The Heartstone kept the dead asleep. Now it is dark, and they walk.', 'Vaelor was the last warden of Vael Ithren. He would not leave his throne, even in death.'];
document.getElementById('loadLore').textContent = LORE[Math.floor(Math.random() * LORE.length)];
async function boot() {
  const H = G.save.hero, sexes = H ? [H.look.sex] : ['m', 'f'];
  const need = ['skel_warrior', 'skel_mage', 'skel_minion'];
  UI.loading(.04, 'Loading the ruin…');
  const gl = new (await import('three/addons/loaders/GLTFLoader.js')).GLTFLoader();
  const [folk, assets, propsG, crystalG, skullpileG, skullG, arsenal] = await Promise.all([loadFolk(sexes),
    loadAssets(need, f => UI.loading(.05 + f * .35)),
    gl.loadAsync('assets/models/dungeon_props.glb'), gl.loadAsync('../assets/underground/models/crystal.glb'), gl.loadAsync('../assets/underground/models/skullpile.glb'), gl.loadAsync('../assets/underground/models/skull-lo.glb'), loadArsenal()]);
  G.arsenal = arsenal;
  G.folk = folk; G.assets = assets; G.extra = [propsG, crystalG, skullpileG, skullG];
  const props = {}; for (const c of propsG.scene.children) props[c.name] = c;
  const bake = (g, h) => { let mesh = null; g.scene.updateMatrixWorld(true); g.scene.traverse(o => { if (o.isMesh && !mesh) mesh = o; }); const geo = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld); geo.computeBoundingBox(); const b = geo.boundingBox, s = h / (b.max.y - b.min.y); geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2).scale(s, s, s); if (!geo.attributes.normal) geo.computeVertexNormals(); return { geo, mat: mesh.material }; };
  const crystal = bake(crystalG, .9), skullpile = bake(skullpileG, .6), skull = bake(skullG, .26); for (const m of [skullpile.mat, skull.mat]) { m.color && m.color.setRGB(1.6, 1.5, 1.3); }
  crystal.geo.translate(0, -.45, 0);
  UI.loading(.42, 'Raising the halls…');
  G.W = await buildWorld({ scene, tier, gltf: { props, crystal, skullpile, skull }, loadTex, onProgress: f => UI.loading(.42 + f * .5) });
  G.baked = [crystal, skullpile, skull];
  if (G.save.ruin.solved) { openGate(G.W); G.W.gate.position.y = 4.4; MAP.PEDESTALS.forEach((_, i) => setPedestal(G.W, i, true)); }
  else { G.ped = MAP.PED_START.slice(); G.ped.forEach((v, i) => setPedestal(G.W, i, v)); }
  for (const [id, c] of Object.entries(G.W.chests)) if (G.save.ruin.chests[id]) { c.open = true; if (c.lid) c.lid.rotation.x = -1.2; }
  if (G.save.ruin.boss) { takeHeart(G.W); const tc = G.W.chests.throne; tc.obj.visible = true; }
  else if (G.save.ruin.slain) { freeHeart(G.W); G.W.chests.throne.obj.visible = true; }   // Hollow King already down: the Heartstone waits on the altar
  UI.loading(.95, 'Lighting the lumen…');
  // warm up shaders
  renderer.compile(scene, camera);
  G.player = { x: wx(MAP.SPAWN.x), z: wx(MAP.SPAWN.z), y: 0, yaw: MAP.SPAWN.face, vx: 0, vz: 0, alive: true, hp: 100, mp: 50, st: 100, state: 'move', t: 0, combo: 0, cdFire: 0, cdHeal: 0, cdPot: 0, stDelay: 0, iframe: false, blocking: false, blockT: 0, attacking: false };
  cam.yaw = Math.PI; cam.pitch = .22;
  G.ready = true; UI.ready(); SFX.initAudio();
  if (!G.save.hero) startCreation(); else startPlay(false);
  loop();
}
// ------------------------------------------------------------------ creation
function startCreation() {
  G.mode = 'create'; G.previewSel = null; G.createYaw = null; document.body.classList.add('creating');
  UI.creation(sel => { const k = sel.race + sel.cls + sel.look.sex; if (k !== G.previewKey) { G.previewKey = k; if (G.createYaw != null) G.player.yaw = G.createYaw + Math.PI + .35; } G.previewSel = sel; buildHeroActor(null, sel.race, null, sel.cls); }, sel => {
    G.save.hero = R.newHero(sel); R.store(store, G.save); buildHeroActor(); startPlay(true);
  });
}
function buildHeroActor(model, race, H = G.save.hero, cls) {
  const P = G.player; if (P.actor) { scene.remove(P.actor.root); P.actor.dispose(); }
  const sel = G.previewSel, C = H ? R.classOf(H) : (cls === 'custom' ? R.customClass(sel.custom.major) : R.CLASSES[cls] || R.CLASSES.sentinel);
  const armorId = H ? (R.equipped(H, 'armor') ? H.inv.find(i => i.u === H.eq.armor).id : 'ragged_robe') : C.armor;
  const look = H ? { ...H.look, race: H.race, armor: armorId } : { ...(sel && sel.look || {}), race, armor: armorId };
  const a = new Hero(G.folk, look); P.actor = a; scene.add(a.root);
  a.root.position.set(P.x, 0, P.z); a.root.rotation.y = P.yaw;
  // weapon + shield from the arsenal (Rig places them in the hands every frame, IK for two-handed / bows / spears)
  const W = H ? (R.equipped(H, 'weapon') || R.ITEMS.rusty_blade) : R.ITEMS[C.weapon], two = R.TWO_HANDED[W.kind];
  const shD = H ? (!two && R.equipped(H, 'shield')) : (!two && C.off && R.ITEMS[C.off]);
  a.rig = new Rig(a, G.arsenal, { kind: W.kind || 'one', model: W.model || 'sword', shield: shD ? shD.model : null, tint: W.glow || 0, quiver: W.ammo === 'arrows' });
  a.play(G.mode === 'create' ? 'Preview' : 'Idle'); P.kind = W.kind || 'one'; P.loaded = true; return a;
}
// ------------------------------------------------------------------ play
function startPlay(fresh) {
  G.mode = 'play'; document.body.classList.remove('creating'); const H = G.save.hero, S = G.stats = R.stats(H), P = G.player;
  if (!P.actor || G.previewSel) { G.previewSel = null; buildHeroActor(); }
  P.hp = S.hp; P.mp = S.mp; P.st = S.st; spawnEnemies();
  UI.banner('The Ruin of Vael Ithren', fresh ? `${H.name} the ${R.RACES[H.race].n} ${R.classOf(H).n} descends` : 'The stair groans as you descend');
  SFX.ambience(true);
  if (fresh || !G.save.ruin.seen.tut) { G.tutT = 0; G.save.ruin.seen.tut = true; }
  if (R.questState(G.save, 'lumen') === 'none') setTimeout(() => UI.msg('No quest yet? Warden Ossia in the Ledger Hall is looking for the Heartstone.', 'b'), 4000);
  if (H.pending) setTimeout(() => maybeLevelUp(true), 1200);
  R.store(store, G.save);
}
function spawnEnemies() {
  for (const e of G.enemies) e.dispose(); G.enemies = [];
  const lvl = G.save.hero.lvl; for (const d of MAP.ENEMIES) { if (d.k === 'boss' && (G.save.ruin.boss || G.save.ruin.slain)) continue; const e = new Enemy(G, d, R.enemyStats(d.k, lvl)); G.enemies.push(e); }
}
G.minionCount = () => G.enemies.filter(e => e.k === 'minion' && e.alive).length;

// ------------------------------------------------------------------ input
const inp = { f: 0, r: 0, keys: {}, sprint: false, atkDown: false, atkT: 0, heavyFired: false, block: false, dodge: false, fire: false, heal: false, use: false, pot: false, lookX: 0, lookY: 0 };
const cam = { yaw: Math.PI, pitch: .22, dist: 4.5, cur: new THREE.Vector3(), shakeV: new THREE.Vector3() };
on(window, 'keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(); SFX.initAudio();
  if (G.modal === 'lock' && (k === ' ' || k === 'e')) { e.preventDefault(); G.lockKey && G.lockKey(); return; }
  if (G.modal === 'loot' && (k === 'e' || k === 'enter' || k === ' ')) { e.preventDefault(); G.lootKey && G.lootKey(); return; }
  if (k === 'tab' || k === 'i' || k === 'j' || k === 'm' || k === 'escape') { e.preventDefault(); if (G.mode !== 'play') return; if (G.modal === 'menu') UI.close('menu'); else if (!G.modal && k !== 'escape') { document.exitPointerLock && document.exitPointerLock(); UI.menu(k === 'j' ? 'jrn' : k === 'm' ? 'map' : k === 'i' ? 'inv' : 'char'); } return; }
  if (G.modal) return; inp.keys[k] = true;
  if (k === ' ') { e.preventDefault(); inp.dodge = true; } if (k === '1' || k === 'q') inp.fire = true; if (k === '2' || k === 'r') inp.heal = true; if (k === 'e' || k === 'f') inp.use = true; if (k === 'h') inp.pot = true; if (k === 'x' || k === '3') inp.swap = true;
});
on(window, 'keyup', e => { inp.keys[e.key.toLowerCase()] = false; });
on(window, 'blur', () => { inp.keys = {}; inp.atkDown = false; inp.block = false; });
on(canvas, 'mousedown', e => { if (touch || G.modal || G.mode !== 'play') return; SFX.initAudio(); if (document.pointerLockElement !== canvas) { canvas.requestPointerLock && canvas.requestPointerLock(); if (!TEST) return; } if (e.button === 0) { inp.atkDown = true; inp.atkT = 0; inp.heavyFired = false; } if (e.button === 2) inp.block = true; });
on(window, 'mouseup', e => { if (touch) return; if (e.button === 0 && inp.atkDown) { if (!inp.heavyFired) inp.light = true; inp.atkDown = false; } if (e.button === 2) inp.block = false; });
on(window, 'mousemove', e => { if (document.pointerLockElement === canvas && !G.modal) { cam.yaw -= e.movementX * .0024 * G.sens; cam.pitch = Math.max(-.5, Math.min(.85, cam.pitch + e.movementY * .002 * G.sens)); } });
on(canvas, 'contextmenu', e => e.preventDefault());
on(canvas, 'wheel', e => { cam.dist = Math.max(2.4, Math.min(6.5, cam.dist + Math.sign(e.deltaY) * .3)); }, { passive: true });
// touch: joystick + look drag + buttons
const joy = document.getElementById('joy'), knob = joy.querySelector('i'); let joyId = null, lookId = null, lookLast = null;
on(joy, 'pointerdown', e => { e.preventDefault(); SFX.initAudio(); joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
on(joy, 'pointermove', e => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = e => { if (e.pointerId !== joyId) return; joyId = null; inp.f = inp.r = 0; inp.sprint = false; knob.style.transform = ''; };
on(joy, 'pointerup', joyEnd); on(joy, 'pointercancel', joyEnd);
function joyMove(e) { const r = joy.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (e.clientX - cx) / (r.width / 2), dy = (e.clientY - cy) / (r.height / 2); const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } inp.r = dx; inp.f = -dy; inp.sprint = l > 1.15; knob.style.transform = `translate(${dx * 36}px,${dy * 36}px)`; }
on(canvas, 'pointerdown', e => { if (!touch || e.pointerType === 'mouse') return; if (lookId == null) { lookId = e.pointerId; lookLast = [e.clientX, e.clientY]; } });
on(window, 'pointermove', e => { if (e.pointerId !== lookId || !lookLast) return; const dx = e.clientX - lookLast[0], dy = e.clientY - lookLast[1]; lookLast = [e.clientX, e.clientY]; if (G.modal) return; cam.yaw -= dx * .0055 * G.sens; cam.pitch = Math.max(-.5, Math.min(.85, cam.pitch + dy * .004 * G.sens)); });
const lookEnd = e => { if (e.pointerId === lookId) { lookId = null; lookLast = null; } }; on(window, 'pointerup', lookEnd); on(window, 'pointercancel', lookEnd);
function tbtn(id, down, up) { const b = document.getElementById(id); on(b, 'pointerdown', e => { e.preventDefault(); e.stopPropagation(); SFX.initAudio(); b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) { } down(); }); const end = e => { b.classList.remove('on'); up && up(); }; on(b, 'pointerup', end); on(b, 'pointercancel', end); }
tbtn('bAtk', () => { if (G.modal) return; inp.atkDown = true; inp.atkT = 0; inp.heavyFired = false; }, () => { if (inp.atkDown && !inp.heavyFired) inp.light = true; inp.atkDown = false; });
tbtn('bBlk', () => { inp.block = true; }, () => { inp.block = false; });
tbtn('bDod', () => { inp.dodge = true; }); tbtn('bSwap', () => { inp.swap = true; }); tbtn('bFire', () => { inp.fire = true; }); tbtn('bHeal', () => { inp.heal = true; }); tbtn('bPot', () => { inp.pot = true; });
tbtn('bMenu', () => { if (G.mode !== 'play') return; if (G.modal === 'menu') UI.close('menu'); else if (!G.modal) UI.menu('char'); });
on(document.getElementById('prompt'), 'click', () => { inp.use = true; });

// ------------------------------------------------------------------ helpers
const V = new THREE.Vector3(), V2 = new THREE.Vector3();
function project(x, y, z) { V.set(x, y, z).project(camera); if (V.z > 1) return null; return { x: (V.x * .5 + .5) * innerWidth, y: (-V.y * .5 + .5) * innerHeight }; }
const blockClip = () => (G.stats.shield ? 'Idle_Shield_Loop' : 'Blocking');
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const camFwd = () => [Math.sin(cam.yaw), Math.cos(cam.yaw)];
function sfx(name, at, vol = 1) { if (!at) return SFX.play(name, 0, vol); const P = G.player, dx = at.x - P.x, dz = at.z - P.z, d = Math.hypot(dx, dz); if (d > 30) return; const [fx, fz] = camFwd(), right = [-fz, fx], pan = (dx * right[0] + dz * right[1]) / Math.max(1, d); SFX.play(name, pan * .8, vol * Math.max(.15, 1 - d / 30)); }
G.sfx = (n, at) => sfx(n, at);
function softTarget(range = 4.5, cone = 1.1, fromCam = false) { const P = G.player; let best = null, bs = 1e9; const ref = fromCam ? cam.yaw : (Math.hypot(inp.f, inp.r) > .2 ? moveYaw() : P.yaw); for (const e of G.enemies) { if (!e.alive || e.state === 'dormant' && !fromCam) continue; const d = Math.hypot(e.x - P.x, e.z - P.z); if (d > range) continue; const a = Math.abs(angDiff(Math.atan2(e.x - P.x, e.z - P.z), ref)); if (a > cone) continue; const sc = d + a * 3; if (sc < bs) { bs = sc; best = e; } } return best; }
function moveYaw() { const [x, z] = moveDir(); return Math.atan2(x, z); }
function moveDir() { const [fx, fz] = camFwd(), rx = -fz, rz = fx; let x = fx * inp.f + rx * inp.r, z = fz * inp.f + rz * inp.r; const l = Math.hypot(x, z); return l > .01 ? [x / l, z / l, Math.min(1, l)] : [0, 0, 0]; }
function skill(id, amt = 1) { const H = G.save.hero, r = R.useSkill(H, id, amt); if (r.up) { UI.msg(`${R.SKILLS[id].n} skill increased to ${H.skills[id].v}`, 'g'); sfx('skill'); G.stats = R.stats(H); } if (r.lv && r.lv.levels) onLevel(); return r; }
function gainXp(n, why) { const r = R.gainXp(G.save.hero, n); if (r.levels) onLevel(); }
function onLevel() { UI.msg('You feel stronger. A level-up awaits.', 'g'); sfx('levelup'); G.lvlPending = true; }
function maybeLevelUp(force) { const H = G.save.hero; if (!H.pending || G.modal) return; const fighting = G.enemies.some(e => e.alive && e.aggro && Math.hypot(e.x - G.player.x, e.z - G.player.z) < 14); if (fighting && !force) return; document.exitPointerLock && document.exitPointerLock(); sfx('levelup');
  UI.levelUp(H, b => { R.spendLevel(H, b); const old = G.stats; G.stats = R.stats(H); const P = G.player; P.hp = G.stats.hp; P.mp = G.stats.mp; P.st = G.stats.st; UI.msg(`${R.BOONS[b].n}: ${R.BOONS[b].d}. Health, Magicka and Stamina restored.`, 'g'); R.store(store, G.save); if (H.pending) setTimeout(() => maybeLevelUp(true), 400); }); }
G.banner = (a, b) => UI.banner(a, b);
function persist() { R.store(store, G.save); }

// ------------------------------------------------------------------ player actions
const kindOf = () => KINDS[G.stats.kind] || KINDS.one;
function startAttack(heavy) {
  const P = G.player, S = G.stats, K = kindOf(); if (K.ranged && S.kind !== 'thrown') return;
  if (S.kind === 'thrown' && !R.countItem(G.save.hero, S.ammo)) { noAmmo(); return; }
  heavy = heavy && !!K.heavy; const cost = S.wst * (heavy ? 2.4 : 1), winded = P.st < cost; P.st = Math.max(0, P.st - cost); P.stDelay = .9;
  const t = softTarget(S.kind === 'thrown' ? S.reach : heavy ? 5 : 4.5, S.kind === 'thrown' ? .5 : 1.1, S.kind === 'thrown'); if (t) P.yaw = Math.atan2(t.x - P.x, t.z - P.z); else if (Math.hypot(inp.f, inp.r) > .2 && S.kind !== 'thrown') P.yaw = Math.atan2(...moveDir().slice(0, 2)); else P.yaw = cam.yaw;
  const e = heavy ? K.heavy : K.light[P.combo % K.light.length], [clip, k, hf, endF] = e, sp = k * S.atkSpd;
  const dur = P.actor.play(clip, { once: true, speed: sp, fade: .08, force: true }); P.state = 'attack'; P.t = 0;
  P.atk = { heavy, dur, hitAt: dur * hf, chainAt: dur * Math.min(.72, hf + .22), end: dur * (endF || .9), done: false, winded, tgt: t }; P.combo = heavy ? 0 : P.combo + 1; P.attacking = true; P.queued = false;
  sfx(heavy ? 'heavy' : S.kind === 'thrown' ? 'whoosh' : 'swing', null, .9);
}
function resolveSwing() {
  const P = G.player, S = G.stats, a = P.atk; if (S.kind === 'thrown') { shoot(1, a.tgt); return; }
  const reach = S.reach + (a.heavy ? .35 : 0), arc = { spear: .5, dagger: .85, two: 1.3, staff: 1.15 }[S.kind] || 1.0; let hits = 0;
  for (const e of G.enemies) { if (!e.alive) continue; const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz) - e.r; if (d > reach) continue; if (Math.abs(angDiff(Math.atan2(dx, dz), P.yaw)) > arc * (a.heavy ? 1.15 : 1) && d > .6) continue;
    const m = R.meleeDamage(S, a.heavy); let amt = m.amt * (a.winded ? .5 : 1) * (.9 + Math.random() * .2); if (e.state === 'stagger' && !a.heavy) amt *= 1.15; if (S.kind === 'dagger' && (e.state === 'idle' || e.state === 'dormant' || e.state === 'stagger')) amt *= 1.5;   // daggers: bonus on unaware / staggered foes
    const r = e.takeHit({ amt, kind: a.heavy ? 'heavy' : 'light', crit: m.crit, from: P, kb: (a.heavy ? 1.6 : .9) * S.stagger, poise: S.stagger }); if (!r) continue; hits++;
    UI.num({ x: e.x, y: (e.k === 'boss' ? 3.4 : 1.9) + e.y, z: e.z }, Math.max(1, Math.round(r.amt)), r.blocked ? 'blk' : m.crit ? 'crit' : ''); UI.hitMarker(m.crit); sfx(r.blocked ? 'block' : m.crit ? 'crit' : 'hit', e);
    spark(e.x, (e.k === 'boss' ? 2.6 : 1.3) + e.y, e.z, r.blocked ? 0x9fd0ff : 0xffd0a0, a.heavy ? 14 : 8); if (S.kind === 'spear' && !a.heavy) break; }
  if (hits) { G.hitstop = a.heavy ? .11 : .06; G.shake = Math.max(G.shake, a.heavy ? .22 : .1); skill(S.wsk, .8 + (a.heavy ? .5 : 0) + (hits - 1) * .3); }
}
// ---------------------------------------------------------------- ranged: aim (hold) -> draw -> release -> arrow / bolt / knife with gravity
const GRAV = 9.8, UPV = new THREE.Vector3(0, 1, 0);
function noAmmo() { const S = G.stats; UI.msg(`No ${R.ITEMS[S.ammo].n.toLowerCase()} left. Find more in chests or on the fallen.`); sfx('pedoff'); }
// auto-aim: nearest living foe in front of the camera (wide cone on phones, narrow on desktop)
function aimTarget() { const S = G.stats; return softTarget(S.reach, touch ? .42 : .14, true) || (touch ? softTarget(Math.min(12, S.reach), .9, true) : null); }
function aimPoint(t) { if (t) return new THREE.Vector3(t.x, (t.k === 'boss' ? 2.3 : 1.25) + t.y, t.z); // chest of the target
  const d = new THREE.Vector3(); camera.getWorldDirection(d); const p = camera.position.clone(); let dist = 3;   // free aim: where the crosshair meets a wall (or 30 m)
  for (; dist < 30; dist += .5) { const q = p.clone().addScaledVector(d, dist), [tx, tz] = MAP.tileOf(q.x, q.z); if (!MAP.inside(tx, tz) || !MAP.passable(G.W.grid, tx, tz, G.W.block) || q.y < 0) break; }
  return p.addScaledVector(d, Math.max(4, dist - .3)); }
// launch velocity that lands on `to` under gravity
function launch(from, to, spd) { const dx = to.x - from.x, dz = to.z - from.z, dy = to.y - from.y, h = Math.hypot(dx, dz) || .01, t = Math.max(.05, Math.hypot(h, dy) / spd); return new THREE.Vector3(dx / t, dy / t + .5 * GRAV * t, dz / t); }
function startAim() {
  const P = G.player, S = G.stats; if (!R.countItem(G.save.hero, S.ammo)) { noAmmo(); return; }
  if (S.kind === 'crossbow' && !P.loaded) { startReload(); return; }
  P.state = 'aim'; P.t = 0; P.aim = { draw: 0, snd: false }; P.attacking = true; P.actor.play('Pistol_Aim_Neutral', { fade: .12, force: true });
}
function startReload() { const P = G.player, S = G.stats; if (!R.countItem(G.save.hero, S.ammo)) return; const dur = P.actor.play('Pistol_Reload', { once: true, speed: 1.35 * S.atkSpd, fade: .1, force: true }); P.state = 'reload'; P.t = 0; P.reloadFor = dur * .92; sfx('reload', null, .8); }
function shoot(draw, tgt) {
  const P = G.player, S = G.stats, H = G.save.hero, rig = P.actor.rig; if (!R.takeItem(H, S.ammo)) { noAmmo(); return; }
  P.actor.root.updateMatrixWorld(true); const m = rig.muzzle(), from = m.pos.clone(); if (S.kind === 'thrown') { P.actor.handHolder('r').getWorldPosition(from); }
  const spd = S.kind === 'crossbow' ? 48 : S.kind === 'thrown' ? 22 : 22 + 26 * draw, aim = aimPoint(tgt && tgt.alive ? tgt : null);
  const v = launch(from, aim, spd), model = S.kind === 'bow' ? 'arrow' : S.kind === 'crossbow' ? 'bolt' : 'knife', o = G.arsenal.make(model); o.position.copy(from); scene.add(o);
  G.shots.push({ o, v, t: 0, dmg: R.rangedDamage(S, draw), stuck: 0, spin: model === 'knife', d0: from.clone() });
  sfx(S.kind === 'bow' ? 'twang' : S.kind === 'crossbow' ? 'xbow' : 'whoosh', null, .9); if (S.kind !== 'thrown') { P.st = Math.max(0, P.st - S.wst); P.stDelay = .6; }
  persist();
}
function updateShots(dt) {
  for (let i = G.shots.length - 1; i >= 0; i--) { const s = G.shots[i], o = s.o, p = o.position; s.t += dt;
    if (s.stuck) { if (s.t > s.stuck) { scene.remove(o); G.shots.splice(i, 1); } continue; }
    const steps = 3; let hit = null;
    for (let k = 0; k < steps && !hit; k++) { const h = dt / steps; s.v.y -= GRAV * h; p.addScaledVector(s.v, h);
      const [tx, tz] = MAP.tileOf(p.x, p.z), ceil = MAP.inside(tx, tz) ? G.W.grid.ceil[tz * MAP.W + tx] : 0;
      if (!MAP.inside(tx, tz) || !MAP.passable(G.W.grid, tx, tz, G.W.block) || p.y < .03 || p.y > ceil || s.t > 4) { hit = 'wall'; break; }
      for (const e of G.enemies) { if (!e.alive) continue; const top = (e.k === 'boss' ? 3.4 : 1.9) + e.y; if (Math.hypot(e.x - p.x, e.z - p.z) < e.r + .22 && p.y > e.y + .1 && p.y < top) { hit = e; break; } } }
    _dir.copy(s.v).normalize(); o.quaternion.setFromUnitVectors(UPV, _dir); if (s.spin) o.rotateX(-s.t * 26);
    if (hit === 'wall') { s.stuck = s.t + 2.5; if (p.y < .03) p.y = .03; spark(p.x, p.y, p.z, 0xc8b090, 4); sfx('thunk', p, .6); continue; }
    if (hit) { const e = hit, S = G.stats, far = s.d0.distanceTo(p); const amt = s.dmg.amt * (.92 + Math.random() * .16) * (far > 12 ? 1.1 : 1);
      const r = e.takeHit({ amt, kind: 'light', crit: s.dmg.crit, from: { x: p.x - s.v.x * .05, z: p.z - s.v.z * .05 }, kb: S.kind === 'crossbow' ? 1 : .45, poise: S.kind === 'crossbow' ? 1.6 : 1 });
      if (r) { UI.num({ x: e.x, y: (e.k === 'boss' ? 3.4 : 1.9) + e.y, z: e.z }, Math.max(1, Math.round(r.amt)), r.blocked ? 'blk' : s.dmg.crit ? 'crit' : ''); UI.hitMarker(s.dmg.crit); sfx(r.blocked ? 'block' : 'hit', e); spark(p.x, p.y, p.z, r.blocked ? 0x9fd0ff : 0xffd0a0, 7); skill('marksman', .8 + Math.min(1, far / 15)); }
      scene.remove(o); G.shots.splice(i, 1); } }
}
const _dir = new THREE.Vector3();
// inventory icons: each weapon model rendered once into a small render target (cached data URL, no second WebGL context)
const ICONS = {}; let iconRig = null;
G.weaponIcons = root => { if (!G.arsenal) return; const N = 96;
  if (!iconRig) { const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xfff4e0, 0x403020, 2.2)); const dl = new THREE.DirectionalLight(0xffffff, 2.4); dl.position.set(1, 2, 3); sc.add(dl);
    iconRig = { sc, cam: new THREE.OrthographicCamera(-.5, .5, .5, -.5, .01, 10), rt: new THREE.WebGLRenderTarget(N, N, { samples: 4 }), buf: new Uint8Array(N * N * 4) }; iconRig.cam.position.set(0, 0, 5); }
  root.querySelectorAll('.wi[data-m]').forEach(el => { const id = el.dataset.m; if (!ICONS[id]) { const o = G.arsenal.make(id); if (!o) return; const sh = /^shield/.test(id);
      o.rotation.set(sh ? 0 : 0, sh ? Math.PI / 2 : .5, sh ? 0 : -Math.PI / 4); if (id === 'bow' || /bow$/.test(id) && id !== 'crossbow') o.rotation.set(0, Math.PI / 2, -Math.PI / 4); iconRig.sc.add(o); o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3()), m = Math.max(sz.x, sz.y) * .55; o.position.sub(c);
      const cm = iconRig.cam; cm.left = cm.bottom = -m; cm.right = cm.top = m; cm.updateProjectionMatrix();
      const prev = renderer.getRenderTarget(); renderer.setRenderTarget(iconRig.rt); const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha(); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(iconRig.sc, cm); renderer.readRenderTargetPixels(iconRig.rt, 0, 0, N, N, iconRig.buf); renderer.setRenderTarget(prev); renderer.setClearColor(cc, ca);
      iconRig.sc.remove(o); const cv = document.createElement('canvas'); cv.width = cv.height = N; const x = cv.getContext('2d'), im = x.createImageData(N, N), B = iconRig.buf;
      for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) { const si = ((N - 1 - yy) * N + xx) * 4, di = (yy * N + xx) * 4; for (let k = 0; k < 3; k++) { const v = B[si + k] / 255; im.data[di + k] = 255 * (v <= .0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - .055); } im.data[di + 3] = B[si + 3]; }
      x.putImageData(im, 0, 0); ICONS[id] = cv.toDataURL(); }
    el.style.backgroundImage = `url(${ICONS[id]})`; }); };
G.swap = () => { const P = G.player, H = G.save.hero; if (P.state !== 'move' || P.blocking) return; if (!R.swapWeapon(H)) { UI.msg('No other weapon to swap to. Equip one from the inventory.'); return; } G.stats = R.stats(H); buildHeroActor(); UI.msg('Readied ' + R.equipped(H, 'weapon').n + '.'); sfx('click'); persist(); };
function startDodge() {
  const P = G.player, S = G.stats; if (P.st < S.dodgeCost * .5) { UI.msg('Too tired to dodge.'); return; } P.st = Math.max(0, P.st - S.dodgeCost); P.stDelay = .8;
  let [dx, dz, l] = moveDir(); if (l < .2) { dx = -Math.sin(P.yaw); dz = -Math.cos(P.yaw); }
  const rel = angDiff(Math.atan2(dx, dz), P.yaw), name = Math.abs(rel) < .8 ? 'Dodge_Forward' : Math.abs(rel) > 2.3 ? 'Dodge_Backward' : rel > 0 ? 'Dodge_Left' : 'Dodge_Right';
  const dur = P.actor.play(name, { once: true, speed: 1.5, fade: .06, force: true }); P.state = 'dodge'; P.t = 0; P.dodge = { dx, dz, dur: Math.min(.62, dur) }; P.attacking = false; sfx('dodge'); skill('acrobatics', .5);
}
function castFire() {
  const P = G.player, S = G.stats; if (P.cdFire > 0) return; if (P.mp < S.fireCost) { UI.msg('Not enough Magicka.'); sfx('pedoff'); return; }
  P.mp -= S.fireCost; P.cdFire = R.SPELLS.firebolt.cd; const t = softTarget(22, .45, true) || softTarget(9, 1.2); if (t) P.yaw = Math.atan2(t.x - P.x, t.z - P.z); else P.yaw = cam.yaw;
  const dur = P.actor.play('Spellcast_Shoot', { once: true, speed: 1.6, fade: .08, force: true }); P.state = 'cast'; P.t = 0; P.cast = { kind: 'fire', at: dur * .38, dur: dur * .75, done: false, tgt: t };
}
function castHeal() {
  const P = G.player, S = G.stats; if (P.cdHeal > 0) return; if (P.mp < S.healCost) { UI.msg('Not enough Magicka.'); sfx('pedoff'); return; } if (P.hp >= S.hp - .5) { UI.msg('You are already at full health.'); return; }
  P.mp -= S.healCost; P.cdHeal = R.SPELLS.heal.cd; const dur = P.actor.play('Spellcast_Raise', { once: true, speed: 1.5, fade: .08, force: true }); P.state = 'cast'; P.t = 0; P.cast = { kind: 'heal', at: dur * .45, dur: dur * .8, done: false };
}
function drink(id = 'potion_hp') { const P = G.player, H = G.save.hero, S = G.stats; if (P.cdPot > 0 || !R.countItem(H, id)) { if (!R.countItem(H, id)) UI.msg('No ' + R.ITEMS[id].n + ' left.'); return; } R.takeItem(H, id); P.cdPot = 1; const D = R.ITEMS[id]; if (D.heal) { const a = Math.min(S.hp - P.hp, D.heal); P.hp += a; UI.num({ x: P.x, y: 2, z: P.z }, '+' + Math.round(a), 'heal'); } if (D.mana) P.mp = Math.min(S.mp, P.mp + D.mana); sfx('potion'); healFx(P.x, P.z, D.heal ? 0x8ef08a : 0x7fa8ff); persist(); }
G.drink = drink;
G.equip = u => { const H = G.save.hero; if (R.equip(H, u)) { G.stats = R.stats(H); buildHeroActor(); UI.msg('Equipped ' + R.ITEMS[H.inv.find(i => i.u === u).id].n + '.'); persist(); } };

// ------------------------------------------------------------------ fx: sparks, fireballs, wisps, heal motes, gravefire
const sparkGeo = new THREE.SphereGeometry(.05, 4, 3);
function spark(x, y, z, col, n = 8) { for (let i = 0; i < n; i++) { const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.position.set(x, y, z); scene.add(m); G.fx.push({ m, v: new THREE.Vector3((Math.random() - .5) * 6, Math.random() * 4, (Math.random() - .5) * 6), t: 0, life: .35 + Math.random() * .25, g: 9 }); } }
function healFx(x, z, col) { for (let i = 0; i < 22; i++) { const s = glow(col, .35, .9); const a = Math.random() * 6.28, r = .4 + Math.random() * .5; s.position.set(x + Math.cos(a) * r, .2 + Math.random() * .6, z + Math.sin(a) * r); scene.add(s); G.fx.push({ m: s, v: new THREE.Vector3(0, 1.2 + Math.random() * 1.4, 0), t: 0, life: .9 + Math.random() * .5, g: 0, spr: 1 }); } }
function fxLight(col, x, y, z, I = 30) { const L = fxLights.find(l => !l.userData.busy) || fxLights[0]; L.userData.busy = true; L.color.set(col); L.position.set(x, y, z); L.intensity = I; return L; }
function spawnBolt(from, dir, o) {
  const grp = new THREE.Group(); const core = new THREE.Mesh(new THREE.SphereGeometry(o.r || .18, 10, 8), new THREE.MeshBasicMaterial({ color: o.core, toneMapped: false })); grp.add(core); const g1 = glow(o.col, o.big || 1.4, .9); grp.add(g1); const g2 = glow(o.col2 || o.col, (o.big || 1.4) * 2.2, .35); grp.add(g2);
  grp.position.copy(from); scene.add(grp); const L = fxLight(o.col, from.x, from.y, from.z, o.light || 26); G.bolts.push({ grp, v: dir.clone().multiplyScalar(o.speed), o, t: 0, L, trail: 0 });
}
function explode(b, x, y, z) { const o = b.o; spark(x, y, z, o.col, 18); for (let i = 0; i < 8; i++) { const s = glow(o.col, 1 + Math.random(), .8); s.position.set(x, y, z); scene.add(s); G.fx.push({ m: s, v: new THREE.Vector3((Math.random() - .5) * 5, Math.random() * 3, (Math.random() - .5) * 5), t: 0, life: .4, g: 0, spr: 1, grow: 3 }); } sfx(o.enemy ? 'frost' : 'boom', { x, z }); if (!o.enemy) G.shake = Math.max(G.shake, .18); }
G.enemyBolt = e => { const P = G.player, from = new THREE.Vector3(e.x + Math.sin(e.yaw) * .6, 1.5 + e.y, e.z + Math.cos(e.yaw) * .6), to = new THREE.Vector3(P.x + P.vx * .3, 1.2, P.z + P.vz * .3); spawnBolt(from, to.sub(from).normalize(), { speed: 10, col: 0x6fd8ff, col2: 0x2a6cff, core: 0xe8fbff, enemy: true, dmg: e.st.dmg * .9, src: e, home: 1.1, r: .14, light: 18 }); sfx('frost', e); };
G.gravefire = (x, z, e) => { const m = new THREE.Mesh(new THREE.RingGeometry(.1, 2.6, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3010, transparent: true, opacity: .0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); m.position.set(x, .05, z); scene.add(m); G.rings.push({ m, x, z, t: 0, at: 1.15, e, done: false }); sfx('ring', { x, z }); };
G.summon = boss => { let n = 0; for (let k = 0; k < 30 && n < 2; k++) { const a = Math.random() * 6.28, r = 2.5 + Math.random() * 2, x = boss.x + Math.sin(a) * r, z = boss.z + Math.cos(a) * r, [tx, tz] = MAP.tileOf(x, z); if (!MAP.passable(G.W.grid, tx, tz, G.W.block)) continue; const e = new Enemy(G, { k: 'minion', x: x / MAP.TILE, z: z / MAP.TILE }, R.enemyStats('minion', G.save.hero.lvl)); e.state = 'awaken'; e.t = 0; e.tEnd = e.a.play('Skeletons_Awaken_Floor', { once: true, speed: 1.6 }) * .8; e.aggro = true; G.enemies.push(e); spark(x, .3, z, 0xff5020, 14); n++; } sfx('bones', boss); };
G.telegraph = (e, t, kind) => { if (e.a.eyes) e.a.hit(e.k === 'wraith' || kind === 'bolt' ? 0x8fe0ff : 0xff5a20, 2.2); };
G.onBossWake = boss => { setBossDoor(G.W, true); UI.banner('Vaelor, the Hollow King', 'Last warden of Vael Ithren'); sfx('roar', boss); G.boss = boss; };
G.onEnemyDeath = e => {
  const H = G.save.hero; sfx('death', e); gainXp(e.st.xp); UI.msg(`${e.st.n} destroyed. +${e.st.xp} XP`); H.kills[e.k] = (H.kills[e.k] || 0) + 1;
  for (const m of R.questEvent(G.save, { type: 'kill', undead: e.st.undead })) { UI.msg(m, 'b'); if (/return/.test(m)) { sfx('quest'); UI.banner('The Bone Tithe', 'Return to Cinder-Scribe Varro'); } }
  if (Math.random() < (e.k === 'minion' ? .15 : .45)) { R.addItem(H, 'bone_dust'); UI.msg('Found Bone Dust.'); }
  for (const [id, q] of R.rollDrops(e.k)) { R.addItem(H, id, q); const D = R.ITEMS[id]; UI.msg(`${e.st.n} dropped ${D.n}${q > 1 ? ' ×' + q : ''}.`, D.t === 'weapon' || D.t === 'shield' ? 'g' : ''); if (D.t === 'weapon' || D.t === 'shield') spark(e.x, 1, e.z, 0xffd27a, 12); }
  if (e.k === 'boss') { R.questEvent(G.save, { type: 'boss' }); G.boss = null; setBossDoor(G.W, false); freeHeart(G.W); G.W.chests.throne.obj.visible = true; UI.banner('The Hollow King falls', 'The Heartstone burns bright again'); sfx('quest'); for (const m of G.enemies) if (m.k === 'minion' && m.alive) m.die(); setTimeout(() => UI.msg('Take the Heartstone from the altar.', 'b'), 2500); }
  persist();
};
G.enemyStrike = (e, a) => {
  const P = G.player, S = G.stats; if (!P.alive) return; const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
  if (d > a.reach + .45) return; if (a.arc < 3 && Math.abs(angDiff(Math.atan2(dx, dz), e.yaw)) > a.arc && d > .8) return;
  if (P.iframe) { UI.num({ x: P.x, y: 2, z: P.z }, 'Dodged', 'blk'); skill('acrobatics', 1.2); return; }
  playerHit(a.dmg, e, a.name === 'spin' ? 1.6 : 1);
};
function playerHit(raw, src, kb = 1, kind = 'melee') {
  const P = G.player, S = G.stats; const facing = Math.abs(angDiff(Math.atan2(src.x - P.x, src.z - P.z), P.yaw)) < 1.35;
  if (P.blocking && facing && kind !== 'ground') { const perfect = P.blockT < (S.shield ? .26 : .34); const r = R.incoming(S, raw, { blocking: true, perfect }); P.hp -= r.amt; P.st -= r.stam; P.stDelay = 1;
    if (perfect) { sfx('perfect', src); UI.num({ x: P.x, y: 2.2, z: P.z }, S.shield ? 'Perfect block!' : 'Parried!', 'blk'); spark(P.x + Math.sin(P.yaw) * .6, 1.4, P.z + Math.cos(P.yaw) * .6, 0x9fd0ff, 16); if (src.stagger && src.k !== 'boss') src.stagger(1.1); else if (src.stagger) src.stagger(.7); skill('block', 2); G.hitstop = .12; }
    else { sfx('block', src); UI.num({ x: P.x, y: 2, z: P.z }, Math.round(r.amt) || 'Blocked', 'blk'); P.actor.play('Block_Hit', { once: true, speed: 1.5, force: true }); P.state = 'blockhit'; P.t = 0; skill('block', 1); spark(P.x + Math.sin(P.yaw) * .6, 1.4, P.z + Math.cos(P.yaw) * .6, 0xffe0a0, 8); if (P.st <= 0) { P.st = 0; P.blocking = false; UI.msg('Your guard is broken!'); P.state = 'hit'; P.t = -.4; P.actor.play('Hit_B', { once: true, force: true }); } }
    G.shake = Math.max(G.shake, .08); if (P.hp <= 0) die(); return; }
  const r = R.incoming(S, raw, {}); P.hp -= r.amt; UI.num({ x: P.x, y: 2, z: P.z }, Math.round(r.amt), 'me'); sfx('hurt'); G.shake = Math.max(G.shake, .2 * kb); hurtFlash(); skill('armor', .6);
  const l = Math.hypot(P.x - src.x, P.z - src.z) || 1; P.vx += (P.x - src.x) / l * 3.5 * kb; P.vz += (P.z - src.z) / l * 3.5 * kb;
  if (P.hp <= 0) return die(); if (P.state !== 'attack' || r.amt > S.hp * .12) { P.state = 'hit'; P.t = 0; P.atk = null; P.attacking = false; P.actor.play(Math.random() < .5 ? 'Hit_A' : 'Hit_B', { once: true, speed: 1.5, force: true }); }
}
const vign = document.createElement('div'); vign.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7;background:radial-gradient(ellipse at center,transparent 45%,rgba(160,10,0,.55) 100%);opacity:0;transition:opacity .25s'; document.body.appendChild(vign);
function hurtFlash() { vign.style.transition = 'none'; vign.style.opacity = 1; requestAnimationFrame(() => { vign.style.transition = 'opacity .6s'; vign.style.opacity = G.player.hp / G.stats.hp < .3 ? .55 : 0; }); }
function die() { const P = G.player; P.alive = false; P.hp = 0; P.state = 'dead'; P.actor.play('Death_A', { once: true, force: true }); sfx('death'); document.exitPointerLock && document.exitPointerLock(); setTimeout(() => UI.dead(respawn), 1600); }
function respawn() { const P = G.player, S = G.stats; let at = MAP.SPAWN; if (G.save.ruin.solved) at = { x: 19.5, z: 26.2 }; if (G.boss || G.inArena) at = { x: 19.5, z: 19 };
  P.x = wx(at.x); P.z = wx(at.z); P.vx = P.vz = 0; P.alive = true; P.hp = S.hp; P.mp = S.mp; P.st = S.st; P.state = 'move'; P.actor.play('Idle', { force: true }); vign.style.opacity = 0;
  if (G.boss) { G.boss.hp = G.boss.max; G.boss.state = 'dormant'; G.boss.phase = 1; G.boss.x = wx(19.5); G.boss.z = wx(6); G.boss.a.play('2H_Melee_Idle'); G.boss = null; setBossDoor(G.W, false); for (const m of G.enemies) if (m.k === 'minion' && m.alive) m.die(); }
  for (const e of G.enemies) if (e.alive && e.k !== 'boss') { e.hp = e.max; e.state = 'idle'; }
  UI.msg('You rise again. Enemies have regained their strength.'); }

// ------------------------------------------------------------------ interaction
function nearestInteract() { const P = G.player; let best = null, bd = 1e9; for (const it of G.W.interact) { if (it.when && !it.when()) continue; const d = Math.hypot(it.x - P.x, it.z - P.z); if (d < it.r && d < bd) { bd = d; best = it; } } return best; }
function interact(it) {
  const P = G.player, H = G.save.hero; P.actor.play(it.kind === 'chest' || it.kind === 'heart' ? 'PickUp' : 'Interact', { once: true, speed: 1.6, force: true }); P.state = 'busy'; P.t = 0; P.busyFor = .5; P.yaw = Math.atan2(it.x - P.x, it.z - P.z);
  if (it.kind === 'chest') { const c = G.W.chests[it.chest]; const open = () => { c.open = true; sfx('chest', c); const L = R.lootChest(G.save, it.chest); if (L) { sfx('coins', c); document.exitPointerLock && document.exitPointerLock(); UI.loot(c.locked ? 'Locked chest' : it.chest === 'throne' ? "The Hollow King's hoard" : 'Chest', L, () => { UI.msg(`Took ${L.gold} gold${L.items.length ? ' and ' + L.items.map(([i, q]) => R.ITEMS[i].n + (q > 1 ? ' ×' + q : '')).join(', ') : ''}.`); persist(); }); } };
    if (c.locked && !G.save.ruin.chests[it.chest]) { if (!R.countItem(H, 'lockpick')) { UI.msg('Locked. You have no lockpicks.'); return; } document.exitPointerLock && document.exitPointerLock();
      UI.lockpick({ pins: c.locked, zone: G.stats.lockZone, picks: R.countItem(H, 'lockpick'), onSet: () => { sfx('click'); skill('security', .7); }, onBreak: () => { R.takeItem(H, 'lockpick'); sfx('snap'); skill('security', .3); persist(); }, onDone: ok => { if (ok) { sfx('unlock'); skill('security', 1.5); open(); } } }); }
    else open(); return; }
  if (it.kind === 'ped') { G.ped = MAP.pressPedestal(G.ped, it.ped); G.ped.forEach((v, i) => setPedestal(G.W, i, v)); sfx(G.ped[it.ped] ? 'ped' : 'pedoff', it);
    if (MAP.solved(G.ped)) { openGate(G.W); G.save.ruin.solved = true; persist(); sfx('gate', { x: G.W.gate.position.x, z: G.W.gate.position.z }); UI.banner('The lumen gate opens', 'The way to the antechamber is clear'); gainXp(30); } return; }
  if (it.kind === 'gate') { UI.notice('Sealed lumen gate', '<p><i>An inscription runs around the glyph:</i></p><p style="font-style:italic">"Three stones keep the door. Wake one and its neighbours stir. Only when all three burn will the way open."</p><p style="font-size:14px">Touch the pedestals in the sanctum. Each touch flips that stone <b>and the ones beside it</b>.</p>'); return; }
  if (it.kind === 'heart') { takeHeart(G.W); for (const m of R.questEvent(G.save, { type: 'heartstone' })) UI.msg(m, 'b'); sfx('quest'); UI.banner('The Heartstone', R.questState(G.save, 'lumen') === 'ready' ? 'Bring it to Warden Ossia' : 'Its light pushes back the dark'); gainXp(60); persist(); return; }
  if (it.kind === 'exit') { G.leave(); return; }
}
G.leave = () => { persist(); UI.banner('Climbing to the Ember Crossroads', ''); G.running = false; setTimeout(() => { teardown(); location.href = '../?crossroads=ruin'; }, 450); };
G.setTier = t => { G.save.settings.tier = t; persist(); const u = new URL(location.href); u.searchParams.set('tier', t); teardown(); location.replace(u.toString()); };
G.setSens = s => { G.sens = s; G.save.settings.sens = s; persist(); };
G.toggleMute = () => { G.muted = !G.muted; SFX.setMuted(G.muted); };
G.objective = () => { const s = G.save; if (s.ruin.boss && !s.hero) return null; if (s.ruin.boss) return R.countItem(s.hero, 'heartstone') ? { x: wx(MAP.EXIT.x), z: wx(MAP.EXIT.z) } : null; if (G.W.heartFree) return { x: wx(MAP.ALTAR.x), z: wx(MAP.ALTAR.z) }; if (!s.ruin.solved) { const P = G.player; return P.z > wx(34) ? { x: wx(8), z: wx(30) } : { x: wx(19.5), z: wx(28.5) }; } return { x: wx(19.5), z: wx(7) }; };

// ------------------------------------------------------------------ update
function updatePlayer(dt) {
  const P = G.player, S = G.stats, A = P.actor, pose = A.rig ? A.rig.pose : {}; P.t += dt;
  if (P.state !== 'aim') { pose.aim = Math.max(0, (pose.aim || 0) - dt * 4.5); pose.draw = Math.max(0, (pose.draw || 0) - dt * 9); }
  if (P.state !== 'attack') pose.thrust = Math.max(0, (pose.thrust || 0) - dt * 5); pose.nock = Math.min(1, (pose.nock || 0) + dt * 2.5); pose.loaded = P.loaded ? 1 : 0;
  A.update(dt);
  P.cdFire = Math.max(0, P.cdFire - dt); P.cdHeal = Math.max(0, P.cdHeal - dt); P.cdPot = Math.max(0, P.cdPot - dt); P.stDelay -= dt;
  if (!P.alive) { A.root.position.set(P.x, 0, P.z); return; }
  // regen
  if (P.stDelay <= 0 && !P.blocking && !(inp.sprint || inp.keys.shift)) P.st = Math.min(S.st, P.st + S.stRegen * dt); P.mp = Math.min(S.mp, P.mp + S.mpRegen * dt);
  const bowish = S.kind === 'bow' || S.kind === 'crossbow';
  if (inp.atkDown) { inp.atkT += dt; if (!bowish && !inp.heavyFired && inp.atkT > .34 && (P.state === 'move' || (P.state === 'attack' && P.t > P.atk.chainAt))) { inp.heavyFired = true; startAttack(true); } }
  const canAct = P.state === 'move' || (P.state === 'attack' && P.t > P.atk.chainAt) || P.state === 'blockhit' && P.t > .25;
  if (bowish) { if (inp.atkDown && P.state === 'move' && !P.blocking && !(P.cdShot > 0)) startAim(); inp.light = false; }
  if (inp.swap && P.state === 'move') G.swap();
  if (inp.dodge && (canAct || P.state === 'aim' || P.state === 'reload' || P.state === 'attack' && P.t > P.atk.hitAt) && P.state !== 'dodge') startDodge();
  else if (inp.light && canAct) startAttack(false);
  else if (inp.light && P.state === 'attack') P.queued = true;
  else if (inp.fire && canAct) castFire(); else if (inp.heal && canAct) castHeal();
  if (inp.pot) drink('potion_hp');
  if (inp.use && P.state === 'move') { const it = nearestInteract(); if (it) interact(it); }
  inp.dodge = inp.light = inp.fire = inp.heal = inp.pot = inp.use = inp.swap = false; P.cdShot = Math.max(0, (P.cdShot || 0) - dt);
  if (inp.keys) { const k = inp.keys; if (!touch) { inp.f = (k.w || k.arrowup ? 1 : 0) - (k.s || k.arrowdown ? 1 : 0); inp.r = (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0); } }
  const [mx, mz, ml] = moveDir(); let spd = 0;
  const wantBlock = inp.block && (P.state === 'move' || P.state === 'blockhit' || P.state === 'aim' || (P.state === 'attack' && P.t > P.atk.hitAt));
  if (wantBlock && !P.blocking) { P.blocking = true; P.blockT = 0; P.state = 'move'; P.attacking = false; A.play(blockClip(), { fade: .08, force: true }); } else if (!inp.block && P.blocking) { P.blocking = false; }
  if (P.blocking) P.blockT += dt;
  switch (P.state) {
    case 'attack': { const a = P.atk; if (!a.done && P.t >= a.hitAt) { a.done = true; resolveSwing(); }
      if (S.kind === 'spear') { const u = P.t / a.hitAt; pose.thrust = u < 1 ? (u < .35 ? -u * .6 : Math.pow((u - .35) / .65, 1.6)) * (a.heavy ? 1.15 : 1) : Math.max(0, 1 - (P.t - a.hitAt) / (a.dur * .35)); } if (P.t < a.hitAt) { const t = softTarget(3.2); if (t) P.yaw += angDiff(Math.atan2(t.x - P.x, t.z - P.z), P.yaw) * Math.min(1, dt * 10); const f = a.heavy ? 2.2 : 1.6; P.vx += Math.sin(P.yaw) * f * dt * 6; P.vz += Math.cos(P.yaw) * f * dt * 6; }
      if (P.queued && P.t > a.chainAt) startAttack(false); else if (P.t > a.end) { P.state = 'move'; P.attacking = false; P.actor.cur = null; } break; }
    case 'aim': { const a = P.aim, tgt = aimTarget(); P.aimTgt = tgt; pose.aim = Math.min(1, pose.aim + dt * 5.5);
      const ap = aimPoint(tgt), dx = ap.x - P.x, dz = ap.z - P.z; P.yaw += angDiff(Math.atan2(dx, dz), P.yaw) * Math.min(1, dt * 14);
      pose.aimPitch = Math.max(-.55, Math.min(.6, Math.atan2(ap.y - 1.45, Math.hypot(dx, dz))));
      if (S.kind === 'bow' && pose.aim > .45) { if (!a.snd) { a.snd = true; sfx('draw', null, .7); } a.draw = Math.min(1, a.draw + dt * S.atkSpd / .8); pose.draw = a.draw; }
      spd = 1.9 * S.spd * ml; P.x += mx * spd * dt; P.z += mz * spd * dt; { const name = spd > .4 ? 'Walking_A' : 'Pistol_Aim_Neutral'; if (A.curName !== name) A.play(name, { fade: .15 }); }
      const ready = S.kind === 'bow' ? a.draw >= .35 : pose.aim > .8;
      if (!inp.atkDown && ready) { const d = S.kind === 'bow' ? a.draw : 1; shoot(d, tgt); P.attacking = false; pose.draw = 0; pose.nock = 0; P.cdShot = S.kind === 'bow' ? .28 / S.atkSpd : .1;
        if (S.kind === 'crossbow') { P.loaded = false; pose.loaded = 0; A.play('Pistol_Shoot', { once: true, speed: 1.4, force: true }); P.state = 'busy'; P.t = 0; P.busyFor = .32; G.reloadNext = true; }
        else { P.state = 'move'; A.cur = null; } }
      break; }
    case 'reload': { if (P.t > P.reloadFor * .6 && !P.loaded) { P.loaded = true; pose.loaded = 1; } if (P.t > P.reloadFor) { P.state = 'move'; A.cur = null; } break; }
    case 'dodge': { const d = P.dodge, k = Math.max(0, 1 - P.t / d.dur); P.iframe = P.t > .03 && P.t < d.dur * .7; const sp = 8.2 * (.35 + k) * (S.spd); P.x += d.dx * sp * dt; P.z += d.dz * sp * dt; if (P.t > d.dur) { P.state = 'move'; P.iframe = false; P.actor.cur = null; } break; }
    case 'cast': { const c = P.cast; if (!c.done && P.t >= c.at) { c.done = true; if (c.kind === 'fire') { const from = new THREE.Vector3(P.x + Math.sin(P.yaw) * .7, 1.45, P.z + Math.cos(P.yaw) * .7); const cr = S.kind === 'staff' && P.actor.rig && P.actor.rig.w.getObjectByName('crystal'); if (cr) { cr.getWorldPosition(from); from.addScaledVector(new THREE.Vector3(Math.sin(P.yaw), 0, Math.cos(P.yaw)), .25); } let dir; if (c.tgt && c.tgt.alive) dir = new THREE.Vector3(c.tgt.x, (c.tgt.k === 'boss' ? 2.4 : 1.2) + c.tgt.y, c.tgt.z).sub(from).normalize(); else dir = new THREE.Vector3(Math.sin(P.yaw), -Math.sin(cam.pitch - .2) * .5, Math.cos(P.yaw)).normalize();
          spawnBolt(from, dir, { speed: 19, col: 0xff7a20, col2: 0xff3a08, core: 0xfff0c0, dmg: S.fire, r: .2, big: 1.6, light: 34 }); sfx('fire'); skill('destruction', .6); }
        else { const amt = Math.min(S.hp - P.hp, S.heal); P.hp += amt; UI.num({ x: P.x, y: 2.1, z: P.z }, '+' + Math.round(amt), 'heal'); healFx(P.x, P.z, 0x8ef08a); sfx('heal'); skill('restoration', .8 + amt / S.hp * 2); vign.style.opacity = 0; } }
      if (P.t > c.dur) { P.state = 'move'; P.actor.cur = null; } break; }
    case 'hit': case 'blockhit': case 'busy': if (P.t > (P.state === 'busy' ? P.busyFor : P.state === 'hit' ? .42 : .32)) { P.state = 'move'; P.actor.cur = null; if (P.blocking) A.play(blockClip(), { force: true }); } break;
    case 'move': { if (G.reloadNext) { G.reloadNext = false; if (S.kind === 'crossbow' && !P.loaded && !P.blocking) { startReload(); break; } }
      const sprint = (inp.sprint || inp.keys.shift) && ml > .5 && P.st > 2 && !P.blocking; spd = (P.blocking ? 1.7 : sprint ? 7 : 4.6) * S.spd * ml; if (sprint) { P.st = Math.max(0, P.st - 14 * dt); P.stDelay = .5; if (Math.random() < dt * .25) skill('acrobatics', .3); }
      P.x += mx * spd * dt; P.z += mz * spd * dt;
      if (ml > .05) { const want = P.blocking ? cam.yaw : Math.atan2(mx, mz); P.yaw += angDiff(want, P.yaw) * Math.min(1, dt * 12); }
      else if (P.blocking) { const t = softTarget(6, 2); const want = t ? Math.atan2(t.x - P.x, t.z - P.z) : P.yaw; P.yaw += angDiff(want, P.yaw) * Math.min(1, dt * 8); }
      if (!P.blocking) { const name = spd > 5.5 ? 'Running_A' : spd > .4 ? (spd > 2.8 ? 'Running_A' : 'Walking_A') : 'Idle'; if (A.curName !== name || !A.cur) A.play(name, { speed: name === 'Running_A' ? Math.max(.8, spd / 5.2) : 1 }); else if (name === 'Running_A') A.cur.timeScale = Math.max(.8, spd / 5.2); }
      if (spd > .5) { G.stepT = (G.stepT || 0) + dt * spd; if (G.stepT > 1.9) { G.stepT = 0; sfx('step', null, .7); } }
      break; }
  }
  // knockback, collisions, traps
  if (P.vx || P.vz) { P.x += P.vx * dt; P.z += P.vz * dt; const f = Math.exp(-dt * 8); P.vx *= f; P.vz *= f; }
  [P.x, P.z] = MAP.collide(G.W.grid, P.x, P.z, .4, G.W.block);
  for (const e of G.enemies) { if (!e.alive) continue; const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz), m = .4 + e.r; if (d < m && d > .001) { const push = (m - d); P.x += dx / d * push * .7; P.z += dz / d * push * .7; e.x -= dx / d * push * .3; e.z -= dz / d * push * .3; } }
  const [tx, tz] = MAP.tileOf(P.x, P.z); for (const tr of MAP.TRAPS) { if (tz === tr.z && tx >= tr.x0 && tx <= tr.x1) { if (MAP.trapUp(tr, G.t) && !P.iframe && !(P.trapCd > 0)) { P.trapCd = .7; playerHit(16, { x: P.x - Math.sin(P.yaw), z: P.z - Math.cos(P.yaw) }, 1.4, 'ground'); sfx('spikes'); } if (MAP.trapRise(tr, G.t) && !G.trapWarn) { G.trapWarn = .3; sfx('spikes', null, .3); } } }
  P.trapCd = (P.trapCd || 0) - dt; G.trapWarn = Math.max(0, (G.trapWarn || 0) - dt) || 0;
  A.root.position.set(P.x, 0, P.z); A.root.rotation.y = P.yaw;
}
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
// creation camera: pick the direction around the spawn with the most open floor so the full-body preview isn't clipped
function clearRun(x0, z0, yaw, max) { const fx = Math.sin(yaw), fz = Math.cos(yaw); for (let d = .5; d <= max; d += .25) { const [tx, tz] = MAP.tileOf(x0 - fx * d, z0 - fz * d); if (!MAP.inside(tx, tz) || !MAP.passable(G.W.grid, tx, tz)) return d; } return max; }
function createYaw(p) { let best = MAP.SPAWN.face + Math.PI, bd = 0; for (let k = 0; k < 8; k++) { const y = MAP.SPAWN.face + Math.PI + k * Math.PI / 4, d = clearRun(p.x, p.z, y, 6.5) - (k ? .3 : 0); if (d > bd) { bd = d; best = y; } } return best; }
function updateCamera(dt) {
  const P = G.player, pivot = V2.set(P.x, 1.6, P.z);
  let yaw = cam.yaw, pitch = cam.pitch, dist = cam.dist * (innerWidth < innerHeight ? 1.2 : 1);
  if (G.mode === 'create') { const f = innerWidth > innerHeight; if (G.createYaw == null) { G.createYaw = createYaw(pivot); P.yaw = G.createYaw + Math.PI + .35; } yaw = G.createYaw + (f ? .35 : .1); pitch = .1; dist = f ? 3.4 : 4.4; pivot.y = f ? 1.2 : 1.35; }
  const fx = Math.sin(yaw), fz = Math.cos(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const shoulder = G.mode === 'create' ? 0 : .45; const sx = -fz * shoulder * -1, sz = fx * shoulder * -1;
  const want = new THREE.Vector3(pivot.x - fx * dist * cp - sx, pivot.y + dist * sp + .2, pivot.z - fz * dist * cp - sz);
  // pull in front of walls / under ceilings
  const steps = 14; let ok = 1; for (let i = 1; i <= steps; i++) { const t = i / steps, x = pivot.x + (want.x - pivot.x) * t, y = pivot.y + (want.y - pivot.y) * t, z = pivot.z + (want.z - pivot.z) * t, [tx, tz] = MAP.tileOf(x, z); const room = MAP.inside(tx, tz) && G.W.grid.floor[tz * MAP.W + tx]; const ceil = room ? G.W.grid.ceil[tz * MAP.W + tx] : 0; const near = [[.35, 0], [-.35, 0], [0, .35], [0, -.35]].some(([ox, oz]) => { const [ax, az] = MAP.tileOf(x + ox, z + oz); return !MAP.passable(G.W.grid, ax, az); }); if (!room || y > ceil - .3 || near) { ok = (i - 1) / steps; break; } }
  ok = Math.max(.12, ok); const tgt = pivot.clone().lerp(want, ok); if (!G.camInit) { camPos.copy(tgt); G.camInit = true; } camPos.lerp(tgt, Math.min(1, dt * (ok < .99 ? 18 : 10)));
  camera.position.copy(camPos); if (G.shake > 0) { camera.position.x += (Math.random() - .5) * G.shake; camera.position.y += (Math.random() - .5) * G.shake; G.shake = Math.max(0, G.shake - dt * 1.4); }
  camLook.set(pivot.x + fx * 2 - sx * .3, pivot.y + (G.mode === 'create' ? 0 : .1) - Math.sin(pitch) * .6, pivot.z + fz * 2 - sz * .3); if (G.mode === 'create') { const off = innerWidth > innerHeight ? 1 : 0; camLook.set(P.x - fz * off, innerWidth > innerHeight ? 1.05 : -.15, P.z + fx * off); }
  camera.lookAt(camLook); fill.position.set(camPos.x * .4 + P.x * .6, 2.8, camPos.z * .4 + P.z * .6);
}
function updateBolts(dt) {
  const P = G.player;
  for (let i = G.bolts.length - 1; i >= 0; i--) { const b = G.bolts[i]; b.t += dt; const o = b.o, p = b.grp.position;
    if (o.home && P.alive) { const to = V.set(P.x, 1.2, P.z).sub(p).normalize(), cur = b.v.clone().normalize(), ang = Math.min(1, o.home * dt); cur.lerp(to, ang).normalize(); b.v.copy(cur.multiplyScalar(o.speed)); }
    p.addScaledVector(b.v, dt); b.L.position.copy(p); b.grp.children[1].material.opacity = .7 + Math.random() * .3;
    b.trail += dt; if (b.trail > .03) { b.trail = 0; const s = glow(o.col2 || o.col, .7, .6); s.position.copy(p); scene.add(s); G.fx.push({ m: s, v: new THREE.Vector3(0, .4, 0), t: 0, life: .35, g: 0, spr: 1 }); }
    let hit = false; const [tx, tz] = MAP.tileOf(p.x, p.z); const ceil = MAP.inside(tx, tz) ? G.W.grid.ceil[tz * MAP.W + tx] : 0;
    if (!MAP.passable(G.W.grid, tx, tz, G.W.block) || p.y < .05 || p.y > ceil || b.t > 3) hit = true;
    if (!hit && !o.enemy) for (const e of G.enemies) { if (!e.alive) continue; const h = (e.k === 'boss' ? 2.6 : 1.3) + e.y; if (Math.hypot(e.x - p.x, e.z - p.z) < e.r + .45 && Math.abs(p.y - h) < (e.k === 'boss' ? 2 : 1.1)) { hit = true; break; } }
    if (!hit && o.enemy && P.alive && Math.hypot(P.x - p.x, P.z - p.z) < .65 && p.y < 2.2) { hit = true; if (P.iframe) { UI.num({ x: P.x, y: 2, z: P.z }, 'Dodged', 'blk'); skill('acrobatics', 1.2); } else playerHit(o.dmg, o.src || { x: p.x - b.v.x, z: p.z - b.v.z }, .7, 'bolt'); }
    if (hit) { explode(b, p.x, p.y, p.z); if (!o.enemy) { let any = 0; for (const e of G.enemies) { if (!e.alive) continue; const d = Math.hypot(e.x - p.x, e.z - p.z) - e.r; if (d > 2.4) continue; const amt = o.dmg * (d < .6 ? 1 : .55) * (.9 + Math.random() * .2); const r = e.takeHit({ amt, kind: 'fire', from: { x: p.x - b.v.x * .05, z: p.z - b.v.z * .05 }, kb: d < .6 ? 1.3 : .7 }); if (r) { any++; UI.num({ x: e.x, y: (e.k === 'boss' ? 3.4 : 1.9) + e.y, z: e.z }, Math.round(r.amt), 'fire'); } } if (any) { UI.hitMarker(false); skill('destruction', .5 + any * .4); G.hitstop = .05; } }
      scene.remove(b.grp); b.grp.children.forEach(c => { c.geometry && c.geometry.dispose(); c.material.dispose(); }); b.L.intensity = 0; b.L.userData.busy = false; G.bolts.splice(i, 1); } }
  for (let i = G.rings.length - 1; i >= 0; i--) { const r = G.rings[i]; r.t += dt; const k = Math.min(1, r.t / r.at); r.m.material.opacity = .25 + .5 * k * (.6 + .4 * Math.sin(r.t * 30)); r.m.scale.setScalar(.4 + .6 * k);
    if (!r.done && r.t >= r.at) { r.done = true; for (let j = 0; j < 10; j++) { const s = glow(0xff4010, 1.4, .9); const a = j / 10 * 6.28; s.position.set(r.x + Math.cos(a) * 1.6, .4, r.z + Math.sin(a) * 1.6); scene.add(s); G.fx.push({ m: s, v: new THREE.Vector3(0, 4, 0), t: 0, life: .6, g: 0, spr: 1, grow: 2 }); } spark(r.x, .4, r.z, 0xff5020, 24); sfx('boom', r); G.shake = Math.max(G.shake, .25);
      if (P.alive && Math.hypot(P.x - r.x, P.z - r.z) < 2.7) { if (P.iframe) { UI.num({ x: P.x, y: 2, z: P.z }, 'Dodged', 'blk'); skill('acrobatics', 1.5); } else playerHit(r.e.st.dmg * 1.15, { x: r.x, z: r.z }, 1.3, 'ground'); } }
    if (r.t > r.at + .4) { scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); G.rings.splice(i, 1); } }
  for (let i = G.fx.length - 1; i >= 0; i--) { const f = G.fx[i]; f.t += dt; f.v.y -= (f.g || 0) * dt; f.m.position.addScaledVector(f.v, dt); const k = 1 - f.t / f.life; f.m.material.opacity = Math.max(0, k) * (f.spr ? .8 : 1); if (f.grow) f.m.scale.multiplyScalar(1 + f.grow * dt); if (f.t > f.life) { scene.remove(f.m); if (f.m.geometry !== sparkGeo && !f.spr) f.m.geometry.dispose(); f.m.material.dispose(); G.fx.splice(i, 1); } }
}
let flowKey = '', flowT = 0, $ret = null, $wpn = null, wpnKey = '';
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
function updateEnemies(dt) {
  const P = G.player, [tx, tz] = MAP.tileOf(P.x, P.z), k = tx + ',' + tz; flowT -= dt; if (k !== flowKey || flowT < 0) { flowKey = k; flowT = .5; G.flow = MAP.flowField(G.W.grid, tx, tz, G.W.block, 60); }
  const arena = G.W.arena; G.inArena = Math.hypot(P.x - arena.x, P.z - arena.z) < arena.r - 2.2;
  for (let i = G.enemies.length - 1; i >= 0; i--) { const e = G.enemies[i]; const d = Math.hypot(e.x - P.x, e.z - P.z); if (d > 42 && !e.aggro) { e.a.root.visible = false; continue; } e.a.root.visible = true; e.update(dt);
    if (e.alive && e.k !== 'boss' && e.k !== 'wraith') { const [ex, ez] = MAP.tileOf(e.x, e.z); for (const tr of MAP.TRAPS) if (ez === tr.z && ex >= tr.x0 && ex <= tr.x1 && MAP.trapUp(tr, G.t) && !(e.trapCd > 0)) { e.trapCd = .8; const r = e.takeHit({ amt: 14, kind: 'heavy', from: { x: e.x, z: e.z + 1 }, kb: .5 }); if (r) UI.num({ x: e.x, y: 1.9, z: e.z }, Math.round(r.amt), 'me'); } e.trapCd = (e.trapCd || 0) - dt; }
    if (e.gone) { e.dispose(); G.enemies.splice(i, 1); } }
  for (let i = 0; i < G.enemies.length; i++) for (let j = i + 1; j < G.enemies.length; j++) { const a = G.enemies[i], b = G.enemies[j]; if (!a.alive || !b.alive) continue; const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), m = a.r + b.r; if (d < m && d > .001) { const p = (m - d) / 2; a.x += dx / d * p; a.z += dz / d * p; b.x -= dx / d * p; b.z -= dz / d * p; } }
}
function updateHud(dt) {
  const P = G.player, S = G.stats, H = G.save.hero; if (!H) return;
  UI.vitals({ hp: P.hp, hpM: S.hp, mp: P.mp, mpM: S.mp, st: P.st, stM: S.st, xp: H.xp, xpM: R.xpFor(H.lvl), name: H.name, lvl: R.shownLevel(H) + (H.pending ? ' ▲' : '') });
  const heading = Math.atan2(Math.sin(cam.yaw), -Math.cos(cam.yaw)), marks = []; const o = G.objective(); if (o) marks.push({ b: Math.atan2(o.x - P.x, -(o.z - P.z)), cls: 'mk' });
  for (const e of G.enemies) if (e.alive && e.aggro && Math.hypot(e.x - P.x, e.z - P.z) < 22) marks.push({ b: Math.atan2(e.x - P.x, -(e.z - P.z)), cls: 'en' });
  if (R.questState(G.save, 'lumen') === 'ready' || R.questState(G.save, 'tithe') === 'ready') marks.push({ b: Math.atan2(wx(MAP.EXIT.x) - P.x, -(wx(MAP.EXIT.z) - P.z)), cls: 'mk q2' });
  UI.compass(heading, marks);
  const room = MAP.roomAt(G.W.grid, P.x, P.z); UI.region(room && room.n ? room.n : '');
  if (room && room.n && !G.save.ruin.seen[room.id]) { G.save.ruin.seen[room.id] = true; if (room.id !== 'entry') UI.banner(room.n, 'Vael Ithren'); persist(); }
  // target bar: boss when awake, otherwise the enemy under the crosshair / last hit
  let tg = G.boss && G.boss.alive ? G.boss : softTarget(14, .35, true); if (tg && tg.alive && (tg.aggro || tg === G.boss)) UI.target({ name: tg.st.n, f: tg.hp / tg.max, boss: tg === G.boss }); else UI.target(null);
  UI.cooldowns(P.cdFire / R.SPELLS.firebolt.cd, P.cdHeal / R.SPELLS.heal.cd, R.countItem(H, 'potion_hp'));
  const it = P.alive && !G.modal ? nearestInteract() : null; UI.prompt(it); G.curInteract = it;
  // weapon chip + ranged reticle (locks onto the auto-aim target)
  const ret = $ret || ($ret = document.getElementById('ret')), wp = $wpn || ($wpn = document.getElementById('wpn')), W = R.equipped(H, 'weapon'), ranged = S.ranged;
  const wk = (W ? W.n : '') + '|' + (S.ammo ? R.countItem(H, S.ammo) : '') + '|' + (H.eq.alt ? 1 : 0); if (wk !== wpnKey) { wpnKey = wk; wp.innerHTML = W ? `<b>${esc(W.n)}</b>${S.ammo ? ` <span>· ${R.countItem(H, S.ammo)} ${R.ITEMS[S.ammo].n.split(' ').pop().toLowerCase()}</span>` : ''}${H.eq.alt ? `<br><span>⇄ ${esc(R.equipped(H, 'alt').n)}</span>` : ''}` : ''; }
  const aiming = P.state === 'aim', show = ranged && P.alive && !G.modal && (aiming || !touch);
  document.getElementById('xh').style.opacity = touch || ranged ? 0 : 1;
  if (show) { const t = aiming ? P.aimTgt : aimTarget(); let x = innerWidth / 2, y = innerHeight / 2; if (t) { const q = project(t.x, (t.k === 'boss' ? 2.3 : 1.25) + t.y, t.z); if (q) { x = q.x; y = q.y; } }
    const k = aiming && S.kind === 'bow' ? 1.25 - .55 * (P.aim ? P.aim.draw : 0) : 1; ret.style.transform = `translate(${(x - innerWidth / 2).toFixed(1)}px,${(y - innerHeight / 2).toFixed(1)}px) scale(${k.toFixed(3)})`; ret.className = 'on' + (t ? ' lock' : ''); }
  else if (ret.className) ret.className = '';
  // tutorial in the entry hall
  if (G.tutT != null) { G.tutT += dt; const inEntry = room && room.id === 'entry'; if (!inEntry && G.tutT > 3 || G.tutT > 22) { UI.tutorial(null); G.tutT = null; } else if (G.tutT > 1.2) UI.tutorial(touch ? '<b>Left stick</b> to move, <b>drag</b> to look · <b>⚔</b> tap to attack, hold for a heavy blow (bows: hold to draw, let go to loose) · <b>🛡</b> hold to block (block just before a hit to stagger the foe) · <b>⇄</b> swap weapon · <b>➶</b> roll · <b>🔥</b> Firebolt · <b>✚</b> Heal' : '<b>WASD</b> move · <b>click</b> to capture the mouse · <b>LMB</b> attack (hold for heavy; bows: hold to draw) · <b>RMB</b> block (just before a hit = perfect block) · <b>X</b> swap weapon · <b>Space</b> roll · <b>1</b> Firebolt · <b>2</b> Heal · <b>E</b> use · <b>Tab</b> menu'); }
  explore(P);
  if (P.hp / S.hp < .3 && P.alive) vign.style.opacity = .35 + .15 * Math.sin(G.t * 4); else if (+vign.style.opacity > 0 && vign.style.transition !== 'none') vign.style.opacity = 0;
}
function explore(P) { const [tx, tz] = MAP.tileOf(P.x, P.z); for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) { const x = tx + dx, z = tz + dz; if (MAP.inside(x, z)) G.explored.add(z * MAP.W + x); } }

// ------------------------------------------------------------------ loop
let last = performance.now(), raf = 0, saveT = 0;
function loop() {
  if (!G.running) return; raf = requestAnimationFrame(loop);
  const now = performance.now(); let dt = Math.min(.05, (now - last) / 1000); last = now; G.t += dt;
  const paused = !!G.modal && G.modal !== 'create';
  let gdt = paused ? 0 : dt; if (G.hitstop > 0) { G.hitstop -= dt; gdt *= .08; }
  if (G.mode === 'create') { const P = G.player; if (P.actor) { P.actor.update(dt); P.yaw += dt * .25; P.actor.root.rotation.y = P.yaw; } }
  else if (G.mode === 'play' && G.save.hero) { updatePlayer(gdt); updateEnemies(gdt); updateBolts(gdt); updateShots(gdt); if (!paused) { updateHud(dt); if (!G.modal && G.lvlPending && G.save.hero.pending) maybeLevelUp(false); } saveT += dt; if (saveT > 20) { saveT = 0; persist(); } }
  if (G.W) updateWorld(G.W, G.t, gdt || dt * .2, G.player || { x: 0, z: 0 }, camera);
  if (G.player) updateCamera(dt);
  UI.updateNums(dt, project);
  if (composer) composer.render(); else renderer.render(scene, camera);
  if (TEST) { G.info = renderer.info.render; G.mem = renderer.info.memory; }
}
// ------------------------------------------------------------------ teardown (GPU, listeners, audio)
let torn = false;
function teardown() {
  if (torn) return; torn = true; G.running = false; cancelAnimationFrame(raf);
  for (const [el, ev, fn, o] of G.listeners) el.removeEventListener(ev, fn, o); G.listeners = [];
  for (const e of G.enemies) e.dispose(); G.enemies = []; if (G.player && G.player.actor) { scene.remove(G.player.actor.root); G.player.actor.dispose(); }
  for (const b of G.bolts) scene.remove(b.grp); for (const s of G.shots) scene.remove(s.o); G.shots = []; if (G.arsenal) G.arsenal.dispose(); if (iconRig) iconRig.rt.dispose(); for (const f of G.fx) { scene.remove(f.m); f.m.material.dispose(); }
  if (G.W) disposeWorld(G.W, scene); if (G.assets) disposeAssets(G.assets); disposeFolk(); for (const g of G.extra || []) g.scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) { o.material.map && o.material.map.dispose(); o.material.dispose(); } });
  for (const b of G.baked || []) b.geo.dispose(); sparkGeo.dispose(); disposeShared();
  texCache.forEach(p => p.then(t => t.dispose())); if (composer) { composer.renderTarget1.dispose(); composer.renderTarget2.dispose(); bloom.dispose && bloom.dispose(); }
  renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { } SFX.closeAudio();
}
on(window, 'pagehide', () => { try { persist(); } catch (e) { } teardown(); });
G.teardown = teardown;
if (TEST) Object.assign(G, { R, MAP, UI, inp, cam, gainXp, interact, startAttack, castFire, castHeal, startDodge, maybeLevelUp, spawnEnemies, nearestInteract, persist, store });
boot().catch(e => { console.error(e); UI.loading(1, 'Could not load the ruin: ' + (e && e.message || e)); });
