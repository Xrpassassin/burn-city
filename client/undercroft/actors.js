// Characters (KayKit Adventurers + Skeletons, CC0): loading, shared animation clips, weapon sockets, hit flash, and enemy AI.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SU from 'three/addons/utils/SkeletonUtils.js';
import * as MAP from './ruin-map.mjs';
import { glow, glowTex } from './world.js';
const MD = 'assets/models/', SCALE = .75;
const EMBEDDED_GEAR = /^(1H_|2H_|Badge_Shield|Rectangle_Shield|Round_Shield|Spike_Shield|Spellbook|Knife|Throwable|Mug|Barbarian_Round_Shield)/;

export async function loadAssets(need, onProgress = () => { }) {
  const L = new GLTFLoader(), A = { protos: {}, clips: {}, gear: {}, skelGear: {}, toDispose: [] };
  const files = [['anims', 'anims.glb'], ['hero_gear', 'hero_gear.glb'], ['skel_weapons', 'skel_weapons.glb'], ...need.map(n => [n, n + '.glb'])]; let done = 0;
  await Promise.all(files.map(async ([k, f]) => { const g = await L.loadAsync(MD + f); A[k] = g; onProgress(++done / files.length); }));
  for (const c of A.anims.animations) A.clips[c.name] = c;
  for (const n of need) { const s = A[n].scene; s.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; if (EMBEDDED_GEAR.test(o.name)) o.visible = false; } if (o.isObject3D && EMBEDDED_GEAR.test(o.name)) o.visible = false; }); A.protos[n] = s; }
  for (const o of A.hero_gear.scene.children) A.gear[o.name] = o; for (const o of A.skel_weapons.scene.children) A.skelGear[o.name] = o;
  return A;
}
export function disposeAssets(A) { const seen = new Set(); for (const k of Object.keys(A)) { const g = A[k]; if (g && g.scene) g.scene.traverse(o => { if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); } if (o.material && !seen.has(o.material)) { seen.add(o.material); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }); } }

let BLOB = null;
function blobTex() { if (BLOB) return BLOB; const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.65)'); r.addColorStop(.6, 'rgba(0,0,0,.3)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); BLOB = new THREE.CanvasTexture(c); return BLOB; }

export class Actor {
  constructor(A, proto, { scale = 1, tint = null, ghost = false } = {}) {
    this.root = new THREE.Group(); this.model = SU.clone(A.protos[proto]); this.model.scale.setScalar(SCALE * scale); this.root.add(this.model); this.mats = []; this.scale = scale;
    this.model.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); if (tint) o.material.color.multiply(new THREE.Color(tint)); if (ghost) { o.material.transparent = true; o.material.opacity = .62; o.material.emissive = new THREE.Color(0x58c8ff); o.material.emissiveIntensity = .55; o.material.depthWrite = false; o.castShadow = false; } o.material.userData.e0 = o.material.emissive ? o.material.emissive.clone() : null; o.material.userData.ei0 = o.material.emissiveIntensity; this.mats.push(o.material); } if (/Eyes/.test(o.name)) this.eyes = o; });
    this.bones = {}; this.model.traverse(o => { if (o.isBone || o.type === 'Object3D') this.bones[o.name] = o; });
    this.handR = this.bones.handslotr || this.bones['handslot.r']; this.handL = this.bones.handslotl || this.bones['handslot.l'];
    this.mixer = new THREE.AnimationMixer(this.model); this.actions = {}; this.A = A; this.cur = null; this.flash = 0;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, opacity: ghost ? .35 : 1 })); blob.scale.setScalar(1.3 * scale); blob.position.y = .03; blob.renderOrder = 2; this.root.add(blob); this.blob = blob;
  }
  action(name) { if (!this.actions[name]) { const c = this.A.clips[name]; if (!c) return null; this.actions[name] = this.mixer.clipAction(c); } return this.actions[name]; }
  // play a clip; once=true plays it a single time and holds (clamp). returns duration in seconds (scaled)
  play(name, { fade = .15, once = false, speed = 1, force = false } = {}) {
    const a = this.action(name); if (!a) return 0; if (this.cur === a && !force && !once) { a.timeScale = speed; return a.getClip().duration / speed; }
    a.reset(); a.timeScale = speed; a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity); a.clampWhenFinished = once; a.enabled = true; a.setEffectiveWeight(1);
    if (this.cur && this.cur !== a) a.crossFadeFrom(this.cur, fade, false); a.play(); this.cur = a; this.curName = name; return a.getClip().duration / speed;
  }
  attach(obj, right = true, { s = 1, rx = 0, ry = 0, rz = 0, y = 0, z = 0 } = {}) { const o = obj.clone(); o.traverse(m => { if (m.isMesh) { m.castShadow = true; m.material = m.material.clone(); this.mats.push(m.material); m.material.userData.e0 = m.material.emissive.clone(); m.material.userData.ei0 = m.material.emissiveIntensity; } });
    o.scale.setScalar(s); o.rotation.set(rx, ry, rz); o.position.set(0, y, z); (right ? this.handR : this.handL).add(o); return o; }
  hit(col = 0xffffff, k = 1) { this.flash = .14 * k; this.flashCol = new THREE.Color(col); }
  update(dt) { this.mixer.update(dt); if (this.flash > 0) { this.flash -= dt; const f = Math.max(0, this.flash / .14); for (const m of this.mats) if (m.emissive) { m.emissive.copy(m.userData.e0).lerp(this.flashCol, f); m.emissiveIntensity = (m.userData.ei0 || 0) + f * 1.6; } if (this.flash <= 0) for (const m of this.mats) if (m.emissive) { m.emissive.copy(m.userData.e0); m.emissiveIntensity = m.userData.ei0; } } }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); for (const m of this.mats) m.dispose(); this.blob.geometry.dispose(); this.blob.material.dispose(); }
}
export function disposeShared() { if (BLOB) { BLOB.dispose(); BLOB = null; } }

// ------------------------------------------------------------------ enemies
const ATK = {
  skeleton: [{ clip: '1H_Melee_Attack_Slice_Diagonal', wind: .42, hit: .52, end: 1.05, reach: 2.25, arc: .75, m: 1 }, { clip: '1H_Melee_Attack_Chop', wind: .5, hit: .62, end: 1.15, reach: 2.3, arc: .55, m: 1.2 }],
  minion: [{ clip: '1H_Melee_Attack_Stab', wind: .3, hit: .4, end: .85, reach: 2, arc: .6, m: 1 }],
  boss: [{ clip: '2H_Melee_Attack_Chop', wind: .62, hit: .78, end: 1.55, reach: 3.3, arc: .55, m: 1.15, n: 'cleave' }, { clip: '2H_Melee_Attack_Slice', wind: .5, hit: .64, end: 1.4, reach: 3.4, arc: 1.3, m: .85, n: 'sweep' }, { clip: '2H_Melee_Attack_Spin', wind: .55, hit: .78, end: 1.6, reach: 3.7, arc: 3.2, m: 1.05, n: 'spin' }],
};
export class Enemy {
  constructor(G, def, st) {
    this.G = G; this.k = def.k; this.st = st; this.hp = st.hp; this.max = st.hp; this.poise = st.poise; this.x = MAP.TILE * def.x; this.z = MAP.TILE * def.z; this.y = 0; this.yaw = 0; this.vx = 0; this.vz = 0;
    this.state = def.dormant || def.k === 'boss' ? 'dormant' : 'idle'; this.t = 0; this.cd = 1 + Math.random(); this.def = def; this.alive = true; this.r = def.k === 'boss' ? .9 : .45; this.aggro = false; this.guard = 0;
    const A = G.assets, proto = def.k === 'wraith' ? 'skel_mage' : def.k === 'minion' ? 'skel_minion' : 'skel_warrior';
    this.a = new Actor(A, proto, { scale: def.k === 'boss' ? 1.75 : def.k === 'minion' ? .9 : 1, ghost: def.k === 'wraith', tint: def.k === 'boss' ? 0xc8b8a8 : null });
    const SG = A.skelGear;
    if (def.k === 'skeleton') { this.a.attach(SG.skel_blade, true, { ry: Math.PI, y: .03 }); this.a.attach(SG.skel_shield, false, { y: .02, z: .12 }); }
    if (def.k === 'minion') this.a.attach(SG.skel_blade, true, { ry: Math.PI, y: .03, s: .9 });
    if (def.k === 'wraith') { this.a.attach(SG.skel_staff, true, { ry: Math.PI, y: .03 }); const gl = glow(0x6fd8ff, 2.6, .35); gl.position.y = 1.2; this.a.root.add(gl); this.aura = gl; }
    if (def.k === 'boss') { this.a.attach(SG.skel_axe, true, { ry: Math.PI, y: .03, s: 1.25 }); const gl = glow(0xff4020, 5, .25); gl.position.y = 2.2; this.a.root.add(gl); this.aura = gl; for (const m of this.a.mats) if (m.emissive) { m.userData.e0 = new THREE.Color(0x200806); m.emissive.copy(m.userData.e0); } }
    if (this.a.eyes) { this.a.eyes.material.emissive = new THREE.Color(def.k === 'wraith' ? 0x8fe0ff : def.k === 'boss' ? 0xff3010 : 0xffa040); this.a.eyes.material.emissiveIntensity = 1.6; this.a.eyes.material.userData.e0 = this.a.eyes.material.emissive.clone(); this.a.eyes.material.userData.ei0 = 1.6; this.a.eyes.material.toneMapped = false; }
    this.a.root.position.set(this.x, 0, this.z); this.yaw = Math.atan2(G.player.x - this.x, G.player.z - this.z); G.scene.add(this.a.root);
    if (this.state === 'dormant') { if (def.k === 'boss') this.a.play('Sit_Floor_Idle' in A.clips && false ? 'Sit_Floor_Idle' : '2H_Melee_Idle'); else { const d = this.a.play('Skeletons_Awaken_Standing', { once: true }); this.a.mixer.update(.01); this.a.action('Skeletons_Awaken_Standing').paused = true; } }
    else this.a.play(def.k === 'wraith' ? 'Idle' : 'Idle_Combat' in A.clips ? 'Idle_Combat' : 'Idle');
    this.phase = 1; this.nextSummon = 6; this.nextRing = 5; this.blinkCd = 0;
  }
  dist() { const P = this.G.player; return Math.hypot(P.x - this.x, P.z - this.z); }
  faceTo(x, z, dt, rate = 8) { const want = Math.atan2(x - this.x, z - this.z); let d = want - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * rate); }
  seesPlayer() { const P = this.G.player; return MAP.los(this.G.W.grid, this.x, this.z, P.x, P.z, this.G.W.block); }
  wake() { if (this.state !== 'dormant') return; this.aggro = true; if (this.k === 'boss') { this.state = 'taunt'; this.t = 0; this.tEnd = this.a.play('Taunt', { once: true }) * .8; this.G.onBossWake(this); return; } const a = this.a.action('Skeletons_Awaken_Standing'); a.paused = false; this.state = 'awaken'; this.t = 0; this.tEnd = a.getClip().duration * .85; this.G.sfx('bones', this); }
  takeHit(h) {   // h: {amt, kind:'light'|'heavy'|'fire', crit, from:{x,z}, kb}
    if (!this.alive) return null; const G = this.G; if (this.state === 'dormant') this.wake(); this.aggro = true;
    let amt = h.amt * (1 - (this.st.ar || 0)); let blocked = false;
    if (this.guard > 0 && h.kind === 'light') { const fwd = Math.atan2(h.from.x - this.x, h.from.z - this.z), dd = Math.abs(Math.atan2(Math.sin(fwd - this.yaw), Math.cos(fwd - this.yaw))); if (dd < 1.1) { amt *= .25; blocked = true; this.a.play('Block_Hit', { once: true, speed: 1.4 }); this.t = 0; this.state = 'guardhit'; this.tEnd = .35; } }
    if (h.kind === 'heavy' && this.guard > 0) { this.guard = 0; this.poise = 0; }
    this.hp -= amt; this.a.hit(h.kind === 'fire' ? 0xff7a30 : 0xffffff);
    const kb = (h.kb || 1) * (this.k === 'boss' ? .15 : 1) * (blocked ? .4 : 1), dx = this.x - h.from.x, dz = this.z - h.from.z, dl = Math.hypot(dx, dz) || 1; this.vx += dx / dl * 4.2 * kb; this.vz += dz / dl * 4.2 * kb;
    if (this.hp <= 0) { this.die(); return { amt, blocked, killed: true }; }
    if (!blocked) { this.poise -= amt * (h.kind === 'heavy' ? 1.7 : h.kind === 'fire' ? 1.3 : 1); if (this.poise <= 0 && this.state !== 'stagger') { this.poise = this.st.poise; this.state = 'stagger'; this.t = 0; this.tEnd = this.k === 'boss' ? 1.1 : .7; this.a.play(Math.random() < .5 ? 'Hit_A' : 'Hit_B', { once: true, speed: this.k === 'boss' ? .9 : 1.2 }); this.atk = null; } }
    if (this.k === 'boss' && this.phase === 1 && this.hp < this.max * .5) { this.phase = 2; this.st = { ...this.st, spd: this.st.spd * 1.2 }; this.nextSummon = 0; G.banner('The Hollow King rises in fury', 'His thralls answer the call'); }
    return { amt, blocked, killed: false };
  }
  stagger(t = 1) { if (!this.alive) return; this.state = 'stagger'; this.t = 0; this.tEnd = t; this.atk = null; this.a.play('Hit_B', { once: true, speed: .8 }); }
  die() { this.alive = false; this.state = 'dead'; this.t = 0; this.a.play(Math.random() < .5 ? 'Death_A' : 'Death_B', { once: true, fade: .1 }); this.G.onEnemyDeath(this); if (this.aura) this.aura.visible = false; }
  update(dt) {
    const G = this.G, P = G.player; this.t += dt; this.a.update(dt); if (this.guard > 0) this.guard -= dt;
    if (this.state === 'dead') { if (this.t > 3.5) { this.a.root.position.y -= dt * .35; this.a.blob.material.opacity = Math.max(0, 1 - (this.t - 3.5)); } if (this.t > 6) { this.gone = true; } return; }
    // knockback + friction
    if (this.vx || this.vz) { this.x += this.vx * dt; this.z += this.vz * dt; const f = Math.exp(-dt * 9); this.vx *= f; this.vz *= f; if (Math.abs(this.vx) + Math.abs(this.vz) < .02) this.vx = this.vz = 0; }
    const d = this.dist();
    if (this.state === 'dormant') { if (this.k === 'boss') { if (G.inArena) this.wake(); } else if (d < 6.5 && this.seesPlayer()) this.wake(); this.place(dt); return; }
    if (this.state === 'awaken' || this.state === 'taunt') { this.faceTo(P.x, P.z, dt, 3); if (this.t > this.tEnd) { this.state = 'chase'; this.cd = .6; } this.place(dt); return; }
    if (this.state === 'stagger' || this.state === 'guardhit') { if (this.t > this.tEnd) { this.state = 'chase'; this.cd = Math.max(this.cd, .35); } this.place(dt); return; }
    if (this.state === 'idle') { if (d < 13 && (this.seesPlayer() || d < 4)) { this.state = 'chase'; this.aggro = true; G.sfx('alert', this); } else if (this.a.curName !== 'Idle') this.a.play(this.k === 'wraith' ? 'Idle' : 'Idle'); this.place(dt); return; }
    if (!P.alive) { if (this.state !== 'idle') { this.state = 'idle'; this.atk = null; this.a.play('Idle'); } this.place(dt); return; }
    this.cd -= dt;
    if (this.state === 'attack') return this.doAttack(dt);
    if (this.state === 'cast') return this.doCast(dt);
    if (this.state === 'blink') return this.doBlink(dt);
    // chase / reposition
    if (this.k === 'wraith') return this.wraithThink(dt, d);
    if (this.k === 'boss') { if (this.phase === 2) { this.nextSummon -= dt; this.nextRing -= dt; if (this.nextSummon <= 0 && G.minionCount() < 2) { this.nextSummon = 16; return this.startCast('summon'); } if (this.nextRing <= 0 && d > 2.5) { this.nextRing = 8; return this.startCast('ring'); } } }
    const reach = this.k === 'boss' ? 3 : 1.9;
    if (d < reach && this.cd <= 0) { const opts = ATK[this.k]; let pick = opts[Math.floor(Math.random() * opts.length)]; if (this.k === 'boss') pick = d < 2.6 && Math.random() < .4 ? opts[2] : opts[Math.random() < .55 ? 0 : 1]; return this.startAttack(pick); }
    if (this.k === 'skeleton' && d < 3.2 && P.attacking && this.guard <= 0 && Math.random() < dt * 2.2) { this.guard = .9; this.a.play('Blocking', { fade: .1 }); }
    if (this.guard > 0 && d < 3.2) { this.faceTo(P.x, P.z, dt); this.place(dt); return; }
    if (d > reach * .85) { this.moveToward(P.x, P.z, dt, this.st.spd * (d > 6 ? 1 : .85)); if (this.a.curName !== 'Running_A' && this.a.curName !== 'Walking_A') this.a.play(d > 5 ? 'Running_A' : 'Walking_A', { speed: this.k === 'boss' ? .8 : 1 }); else if (d > 5 && this.a.curName === 'Walking_A') this.a.play('Running_A'); else if (d < 4 && this.a.curName === 'Running_A') this.a.play('Walking_A'); }
    else { this.faceTo(P.x, P.z, dt); if (this.a.curName !== 'Idle_Combat' && this.a.curName !== '2H_Melee_Idle') this.a.play(this.k === 'boss' ? '2H_Melee_Idle' : 'Idle_Combat'); }
    this.place(dt);
  }
  startAttack(atk) { this.state = 'attack'; this.atk = atk; this.t = 0; this.hitDone = false; const sp = this.k === 'boss' ? (this.phase === 2 ? 1.05 : .92) : 1; this.atkSpd = sp; this.a.play(atk.clip, { once: true, speed: sp, fade: .1 }); this.G.telegraph(this, atk.wind / sp); }
  doAttack(dt) { const G = this.G, P = G.player, a = this.atk, sp = this.atkSpd; if (this.t < a.wind / sp) this.faceTo(P.x, P.z, dt, 6);
    if (!this.hitDone && this.t >= a.hit / sp) { this.hitDone = true; G.enemyStrike(this, { reach: a.reach * (this.k === 'boss' ? 1 : 1), arc: a.arc, dmg: this.st.dmg * a.m, name: a.n }); }
    if (this.t >= a.end / sp) { this.state = 'chase'; this.cd = this.k === 'boss' ? .7 + Math.random() * .6 : .9 + Math.random() * .9; this.atk = null; }
    this.place(dt); }
  wraithThink(dt, d) { const G = this.G, P = G.player; this.blinkCd -= dt; const sees = this.seesPlayer();
    if (d < 2.6 && this.blinkCd <= 0) { this.blinkCd = 6; return this.startBlink(); }
    if (sees && this.cd <= 0 && d < 13) { this.cd = 2.4 + Math.random(); return this.startCast('bolt'); }
    if (d > 9 || !sees) { this.moveToward(P.x, P.z, dt, this.st.spd); }
    else if (d < 4.5) { const dx = this.x - P.x, dz = this.z - P.z, l = Math.hypot(dx, dz) || 1; this.tryMove(dx / l * this.st.spd * .8 * dt, dz / l * this.st.spd * .8 * dt); this.faceTo(P.x, P.z, dt); }
    else { const s = Math.sin(this.t * .7 + this.x) > 0 ? 1 : -1, dx = P.x - this.x, dz = P.z - this.z, l = Math.hypot(dx, dz) || 1; this.tryMove(-dz / l * s * 1.1 * dt, dx / l * s * 1.1 * dt); this.faceTo(P.x, P.z, dt); }
    if (this.a.curName !== 'Idle') this.a.play('Idle'); this.place(dt); }
  startCast(kind) { this.state = 'cast'; this.castKind = kind; this.t = 0; this.castDone = false; const clip = kind === 'summon' ? 'Spellcast_Summon' : kind === 'ring' ? 'Spellcast_Raise' : 'Spellcast_Shoot'; this.castLen = this.a.play(clip, { once: true, speed: kind === 'bolt' ? 1.1 : 1, fade: .1 }); this.castAt = kind === 'bolt' ? Math.min(.55, this.castLen * .5) : this.castLen * .55; this.G.telegraph(this, this.castAt, kind); }
  doCast(dt) { const G = this.G, P = G.player; this.faceTo(P.x, P.z, dt, 5);
    if (!this.castDone && this.t >= this.castAt) { this.castDone = true; if (this.castKind === 'bolt') G.enemyBolt(this); if (this.castKind === 'summon') G.summon(this); if (this.castKind === 'ring') G.gravefire(P.x, P.z, this); }
    if (this.t >= this.castLen * .95) { this.state = 'chase'; this.cd = Math.max(this.cd, .6); } this.place(dt); }
  startBlink() { this.state = 'blink'; this.t = 0; this.blinked = false; this.G.sfx('blink', this); }
  doBlink(dt) { const G = this.G, P = G.player, f = this.t < .35 ? 1 - this.t / .35 : Math.min(1, (this.t - .35) / .35); for (const m of this.a.mats) m.opacity = .62 * f;
    if (!this.blinked && this.t >= .35) { this.blinked = true; for (let k = 0; k < 24; k++) { const a = Math.random() * 6.28, r = 5 + Math.random() * 3, x = P.x + Math.sin(a) * r, z = P.z + Math.cos(a) * r, [tx, tz] = MAP.tileOf(x, z); if (MAP.passable(G.W.grid, tx, tz, G.W.block) && MAP.los(G.W.grid, x, z, P.x, P.z, G.W.block) && MAP.roomAt(G.W.grid, x, z) === MAP.roomAt(G.W.grid, this.x, this.z)) { this.x = x; this.z = z; break; } } }
    if (this.t >= .7) { this.state = 'chase'; this.cd = Math.min(this.cd, .4); for (const m of this.a.mats) m.opacity = .62; } this.place(dt); }
  moveToward(tx, tz, dt, spd) { const G = this.G, P = G.player, d = Math.hypot(tx - this.x, tz - this.z); let dx, dz;
    if (d < 7 && MAP.los(G.W.grid, this.x, this.z, tx, tz, G.W.block)) { dx = (tx - this.x) / d; dz = (tz - this.z) / d; }
    else { const F = G.flow; const [cx, cz] = MAP.tileOf(this.x, this.z); let best = null, bd = F ? F[cz * MAP.W + cx] : -1; if (F && bd >= 0) for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) { const nx = cx + ox, nz = cz + oz; if (!MAP.inside(nx, nz)) continue; const v = F[nz * MAP.W + nx]; if (v >= 0 && v < bd && (!(ox && oz) || (MAP.passable(G.W.grid, cx + ox, cz, G.W.block) && MAP.passable(G.W.grid, cx, cz + oz, G.W.block)))) { bd = v; best = [nx, nz]; } }
      if (!best) { this.faceTo(tx, tz, dt); return; } const wx2 = (best[0] + .5) * MAP.TILE, wz2 = (best[1] + .5) * MAP.TILE, l = Math.hypot(wx2 - this.x, wz2 - this.z) || 1; dx = (wx2 - this.x) / l; dz = (wz2 - this.z) / l; }
    this.tryMove(dx * spd * dt, dz * spd * dt); this.faceTo(this.x + dx, this.z + dz, dt); }
  tryMove(mx, mz) { this.x += mx; this.z += mz; }
  place(dt) { const G = this.G; [this.x, this.z] = MAP.collide(G.W.grid, this.x, this.z, this.r, G.W.block); if (this.k === 'wraith') this.y = .35 + Math.sin(this.t * 2 + this.x) * .12; this.a.root.position.set(this.x, this.a.root.position.y < -.01 ? this.a.root.position.y : this.y, this.z); this.a.root.rotation.y = this.yaw; }
  dispose() { this.G.scene.remove(this.a.root); this.a.dispose(); }
}
