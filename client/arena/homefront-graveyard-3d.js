// Three.js shared XRPL Graveyard scene for Homefront.
// Uses the existing Homefront world API as authority; this module owns presentation only.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';
import { sfx } from './sfx.js';

const host = document.getElementById('graveyard3d');
if (host) boot(host);

function boot(host) {
  const status = document.getElementById('graveyard3dStatus');
  const API = new URLSearchParams(location.search).get('api') ||
    (/fly\.dev$|localhost/.test(location.hostname) ? location.origin : 'https://burn-city-game.fly.dev');
  const token = () => localStorage.getItem('bcToken') || '';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111312);
  scene.fog = new THREE.FogExp2(0x111312, 0.0032);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  camera.position.set(0, 175, 150);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = false;
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xaec5cc, 0x24251e, 2.0));
  const moon = new THREE.DirectionalLight(0xffc18a, 1.4);
  moon.position.set(-50, 100, 35); scene.add(moon);

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x252824, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(204, 204), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.12; scene.add(ground);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const poiGroup = new THREE.Group(), lootGroup = new THREE.Group(), playerGroup = new THREE.Group(), cityGroup = new THREE.Group(), zombieGroup = new THREE.Group(), combatGroup = new THREE.Group(), impactGroup = new THREE.Group();
  scene.add(cityGroup, poiGroup, lootGroup, playerGroup, zombieGroup, combatGroup, impactGroup);
  const combatStatus = document.getElementById('combatStatus');
  const lootActionButton = document.getElementById('collectLoot');
  const lootStatus = document.getElementById('lootStatus');
  let selectedLootId = null;
  const findInfectedButton = document.getElementById('findInfected');
  const attackInfectedButton = document.getElementById('attackInfected');
  const autoFireButton = document.getElementById('autoFireInfected');
  const reloadWeaponButton = document.getElementById('reloadWeapon');
  let selectedCombatTargetId = null;
  let selectedCombatAimPoint = null;
  let autoFireHeld = false;
  let autoFireTimer = null;
  const zombieMixers = [];
  // Keep server-owned infected actors between snapshots so movement is presented smoothly.
  const combatActors = new Map();
  let weaponSwingUntil = 0;
  let weaponSwingStartedAt = 0;
  let weaponSwingWeaponId = 'pipe_blade';
  window.addEventListener('homefront:combat-hit', event => {
    weaponSwingStartedAt = performance.now();
    weaponSwingUntil = weaponSwingStartedAt + 320;
    const detail = event.detail || {};
    const weaponId = ['pipe_blade','pump_shotgun','marksman_rifle','shock_maul'].includes(detail.weaponId) ? detail.weaponId : 'pipe_blade';
    const style = weaponId === 'shock_maul' ? 'blunt' : weaponId === 'pump_shotgun' || weaponId === 'marksman_rifle' ? 'firearm' : 'sharp';
    weaponSwingWeaponId = weaponId;
    const targetId = detail.encounterId || detail.encounter?.id || detail.combat?.encounterId;
    const target = targetId ? combatActors.get(targetId) : null;
    // Reuse the existing licensed sample bank; a failed fetch must never break combat feedback.
    if (target) {
      const pos = [target.position.x, detail.hitZone === 'head' ? 1.75 : detail.hitZone === 'limb' ? 0.72 : 1.1, target.position.z];
      const sound = weaponId === 'pump_shotgun' ? 'shotgun' : weaponId === 'marksman_rifle' ? 'hit' : 'hit';
      sfx.loadBank(new URL('./sfx/', import.meta.url).href)
        .then(() => sfx.play(sfx.has(sound) ? sound : 'hit', { pos, v: weaponId === 'pump_shotgun' ? 0.72 : 0.55, ref: 2, max: 18, roll: 1.2 }))
        .catch(() => {});
      // Weapon-specific, short-lived blood mist. Visual feedback never determines damage.
      const count = detail.hitZone === 'head' ? (detail.killed ? 30 : 16) : detail.killed ? (weaponId === 'pump_shotgun' ? 26 : 18) : (weaponId === 'pump_shotgun' ? 15 : 9);
      const spread = weaponId === 'pump_shotgun' ? 0.95 : weaponId === 'marksman_rifle' ? 0.22 : 0.5;
      const lift = detail.hitZone === 'head' ? 3.6 : weaponId === 'shock_maul' ? 1.25 : weaponId === 'pump_shotgun' ? 3.2 : 2.4;
      for (let i = 0; i < count; i++) {
        const radius = (weaponId === 'pump_shotgun' ? 0.04 : 0.035) + Math.random() * 0.045;
        const drop = new THREE.Mesh(new THREE.SphereGeometry(radius, 5, 4), new THREE.MeshBasicMaterial({ color: i % 4 ? 0x842d2b : 0x4b1719, transparent: true, opacity: 0.88, depthWrite: false }));
        drop.position.set(pos[0] + (Math.random() - 0.5) * spread, pos[1] + Math.random() * 0.7, pos[2] + (Math.random() - 0.5) * spread);
        drop.userData.life = 0.35 + Math.random() * 0.4;
        drop.userData.vx = (Math.random() - 0.5) * (weaponId === 'pump_shotgun' ? 4.2 : 2.8);
        drop.userData.vy = weaponId === 'shock_maul' ? 0.3 + Math.random() * 1.3 : 0.6 + Math.random() * lift;
        drop.userData.vz = (Math.random() - 0.5) * (weaponId === 'pump_shotgun' ? 4.2 : 2.8);
        drop.userData.blood = true;
        impactGroup.add(drop);
      }
      target.userData.impactUntil = performance.now() + (style === 'blunt' ? 420 : detail.hitZone === 'head' ? 360 : 300);
      target.userData.impactStyle = detail.hitZone === 'head' ? 'headshot' : style;
      const playerX = Number.isFinite(worldData?.self?.x) ? worldData.self.x : 0;
      target.userData.impactDirection = detail.direction || (target.position.x >= playerX ? 1 : -1);
    }
    // Stylized limb-separation feedback is visual-only and requires a server-confirmed sharp-weapon kill.
    if (detail.killed && style === 'sharp' && target) {
      const origin = target.position.clone();
      for (let i = 0; i < 2; i++) {
        const piece = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.52, 2, 5), mat(0x6e7770));
        piece.position.set(origin.x + (i ? 0.42 : -0.42), 1.05 + i * 0.25, origin.z);
        piece.rotation.z = i ? -0.55 : 0.55;
        piece.userData.life = 0.8; piece.userData.vx = i ? 1.1 : -1.1;
        piece.userData.vy = 2.0; piece.userData.vz = 0.4;
        impactGroup.add(piece);
      }
    }
  });
  const infectedSpawns = [[27, 25], [19, 34], [-32, 28], [-43, 36], [-11, 27], [-20, 15], [9, -12], [1, -15]];

  const mat = (color, roughness = 0.94) => new THREE.MeshStandardMaterial({ color, roughness });
  let equippedWeaponSkinColor = 0x9a7b62;
  let equippedWeaponId = 'pipe_blade';
  window.addEventListener('homefront:cosmetics', event => {
    const color = event.detail?.weaponColor;
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) equippedWeaponSkinColor = Number.parseInt(color.slice(1), 16);
    if (['pipe_blade','pump_shotgun','marksman_rifle','shock_maul'].includes(event.detail?.weaponId)) equippedWeaponId = event.detail.weaponId;
  });
  const roadMat = mat(0x343733), buildingMats = [mat(0x41413a), mat(0x4b443a), mat(0x363d3d), mat(0x50483d)];
  const ruinMat = mat(0x292d2a), emberMat = new THREE.MeshStandardMaterial({ color: 0xff7738, emissive: 0x9c2507, emissiveIntensity: 0.8 });
  const addBox = (parent, w, h, d, x, y, z, material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z); parent.add(m); return m;
  };
  for (const [radius, color] of [[25, 0x4f885b], [45, 0x88854b], [62, 0x9a683e], [76, 0x984d37], [90, 0x7d3037]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.18, radius + 0.18, 128), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.68, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring);
  }
  // Deterministic road grid and procedural ruined buildings; no extra engine or dependency.
  for (let n = -90; n <= 90; n += 20) {
    addBox(cityGroup, 4.2, 0.04, 196, n, 0, 0, roadMat);
    addBox(cityGroup, 196, 0.04, 4.2, 0, 0, n, roadMat);
    for (const offset of [-7, 7]) {
      addBox(cityGroup, 0.22, 0.035, 196, n + offset, 0.025, 0, mat(0x55584d));
      addBox(cityGroup, 196, 0.035, 0.22, 0, 0.025, n + offset, mat(0x55584d));
    }
  }
  let seed = 8675309;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  for (let x = -90; x <= 90; x += 10) for (let z = -90; z <= 90; z += 10) {
    if (rand() < 0.27 || Math.abs(x % 20) < 5 || Math.abs(z % 20) < 5) continue;
    const bx = x + (rand() - 0.5) * 2.2, bz = z + (rand() - 0.5) * 2.2;
    if (Math.hypot(bx, bz) < 13) continue;
    const w = 3.4 + rand() * 3.4, d = 3.4 + rand() * 3.4, h = 3 + rand() * (Math.hypot(bx, bz) > 65 ? 11 : 6);
    const building = addBox(cityGroup, w, h, d, bx, 0, bz, buildingMats[Math.floor(rand() * buildingMats.length)]);
    building.rotation.y = (rand() - 0.5) * 0.16;
    if (rand() > 0.45) addBox(cityGroup, w * 0.6, 0.45, d * 0.65, bx + (rand() - .5), h, bz + (rand() - .5), ruinMat);
    if (rand() > 0.7) addBox(cityGroup, 0.35, 1.2 + rand(), 0.35, bx + w * .4, 0, bz - d * .35, emberMat);
  }
  const markerObjects = new Map();
  function labelSprite(text, color = '#f6d8b5') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 96;
    const cx = c.getContext('2d'); cx.font = 'bold 34px system-ui'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillStyle = '#090a09d9'; cx.fillRect(8, 8, 496, 80); cx.strokeStyle = color; cx.lineWidth = 4; cx.strokeRect(8, 8, 496, 80);
    cx.fillStyle = color; cx.fillText(text.slice(0, 30), 256, 48);
    const texture = new THREE.CanvasTexture(c);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    sprite.scale.set(13, 2.45, 1); return sprite;
  }
  function buildPOI(p) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
    let color = 0x78bfe8;
    if (p.type === 'boss') color = 0xff4545;
    else if (p.type === 'cache') color = 0xf0c45e;
    else if (p.type === 'rescue') color = 0xed9a67;
    else if (p.type === 'medical') color = 0x9fce8a;
    else if (p.type === 'industrial') color = 0xe1b65b;
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.8, p.type === 'boss' ? 5.5 : 2.1, 8), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: p.type === 'boss' ? 0.6 : 0.15, transparent: true, opacity: 0.9 }));
    glow.position.y = p.type === 'boss' ? 2.75 : 1.05; g.add(glow);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(p.type === 'boss' ? 5.2 : 3.2, p.type === 'boss' ? 5.2 : 3.2, 0.15, 20), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35 }));
    pad.position.y = 0.1; g.add(pad);
    const label = labelSprite(p.label, '#' + color.toString(16).padStart(6, '0')); label.position.y = p.type === 'boss' ? 7.1 : 4.0; g.add(label);
    if (p.type === 'cache') addBox(g, 1.7, 1.2, 1.3, 0, 0.15, 0, mat(0x8c6736));
    if (p.type === 'rescue') { addBox(g, 2.8, 1.7, 2.4, 0, 0.15, 0, mat(0x62584a)); addBox(g, 3, 0.12, 2.6, 0, 1.95, 0, mat(0x9c7449)); }
    poiGroup.add(g); markerObjects.set(p.id, g);
  }
  function buildLootNode(p) {
    const g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.userData.lootNodeId = p.id;
    const color = p.kind === 'medical' ? 0x9fce8a : p.kind === 'materials' ? 0xc5a36b : p.kind === 'highrisk' ? 0xff5a46 : 0xe1b65b;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 1.45), mat(p.kind === 'medical' ? 0x667d5d : 0x6f5437));
    crate.position.y = 0.68; crate.userData.lootNodeId = p.id; g.add(crate);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.13, 1.48), new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.18}));
    stripe.position.y = 0.76; stripe.userData.lootNodeId = p.id; g.add(stripe);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(1.55,0.07,5,24), new THREE.MeshBasicMaterial({color,transparent:true,opacity:p.available?0.8:0.2}));
    glow.rotation.x = Math.PI/2; glow.position.y = 0.08; glow.userData.lootNodeId = p.id; g.add(glow);
    const label = labelSprite(p.label, p.available ? '#ffe0a0' : '#8b8278'); label.position.y = 2.5; g.add(label);
    if (!p.available) { crate.material.color.setHex(0x45423e); stripe.material.emissiveIntensity=0; }
    lootGroup.add(g);
  }
  let worldData = null, moving = false;
  function spawnAmbientInfected(gltf = null) {
    const positions = infectedSpawns;
    for (let i = 0; i < positions.length; i++) {
      const [x, z] = positions[i];
      if (gltf?.scene) {
        const actor = SkeletonUtils.clone(gltf.scene);
        const bounds = new THREE.Box3().setFromObject(actor);
        const size = bounds.getSize(new THREE.Vector3());
        actor.scale.setScalar(1.8 / Math.max(0.01, size.y));
        const fitted = new THREE.Box3().setFromObject(actor);
        actor.position.set(x, -fitted.min.y, z);
        actor.rotation.y = Math.atan2(-x, -z);
        actor.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; } });
        zombieGroup.add(actor);
        const clips = gltf.animations || [];
        const clip = clips.find(c => /walk|run|idle/i.test(c.name)) || clips[0];
        if (clip) { const mixer = new THREE.AnimationMixer(actor); mixer.clipAction(clip).play(); zombieMixers.push(mixer); }
      } else {
        const actor = new THREE.Group(); actor.position.set(x, 0, z);
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.72, 3, 6), mat(i % 2 ? 0x526248 : 0x66704b));
        body.position.y = 0.62; actor.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), mat(0x8c9972));
        head.position.y = 1.22; actor.add(head); zombieGroup.add(actor);
      }
    }
  }
  async function loadInfectedAsset() {
    try {
      const loader = new GLTFLoader();
      const url = new URL('./assets/homefront/zombie.glb', import.meta.url).href;
      const gltf = await loader.loadAsync(url);
      spawnAmbientInfected(gltf);
    } catch (error) {
      console.warn('[homefront-graveyard] zombie asset unavailable; using procedural infected', error);
      spawnAmbientInfected();
    }
  }
  function clearGroup(group) {
    const disposeMaterial = material => {
      if (!material) return;
      const materials = Array.isArray(material) ? material : [material];
      for (const m of materials) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    };
    while (group.children.length) {
      const object = group.children[group.children.length - 1];
      group.remove(object);
      object.traverse(node => {
        if (node.geometry) node.geometry.dispose();
        disposeMaterial(node.material);
      });
    }
  }
  function updateWorld(data) {
    worldData = data;
    clearGroup(poiGroup); clearGroup(lootGroup); markerObjects.clear();
    for (const p of (data.world?.pointsOfInterest || [])) {
      buildPOI(p);
      const marker = markerObjects.get(p.id);
      if (p.type === 'cache' && data.world?.caches?.[p.id]?.readyAt > Date.now()) marker.children[0].material.color.setHex(0x77716b);
      if (p.type === 'rescue' && data.world?.rescues?.[p.id]?.readyAt > Date.now()) marker.children[0].material.color.setHex(0x77716b);
    }
    for (const node of (data.world?.lootNodes || [])) buildLootNode(node);
    clearGroup(playerGroup);
    const encounters = data.encounters || [];
    const activeEncounterIds = new Set();
    for (const e of encounters) {
      activeEncounterIds.add(e.id);
      let actor = combatActors.get(e.id);
      if (!actor) {
        actor = new THREE.Group();
        actor.position.set(e.x, 0, e.z);
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 1.1, 3, 7), mat(0x8e302d));
        body.position.y = 1.2; actor.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 6), mat(0xaaa18a));
        head.position.y = 2.15; actor.add(head);
        body.userData.combatHitbox = true;
        head.userData.combatHitbox = true;
        const label = labelSprite(e.enemy + ' · ' + e.hp + '/' + e.maxHp, '#ffaaa0');
        label.position.y = 3.5; actor.add(label);
        const threatRing = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.7, 32), new THREE.MeshBasicMaterial({ color: 0xd84b3e, transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
        threatRing.rotation.x = -Math.PI / 2; threatRing.position.y = 0.045; actor.add(threatRing);
        actor.userData = { encounterId: e.id, targetX: e.x, targetZ: e.z, hp: e.hp, body, label, threatRing, hitFlash: 0, impactUntil: 0, impactStyle: 'sharp', impactDirection: 1 };
        combatActors.set(e.id, actor); combatGroup.add(actor);
      } else {
        actor.userData.encounterId = e.id;
        actor.userData.targetX = e.x; actor.userData.targetZ = e.z;
        if (actor.userData.hp !== e.hp) {
          actor.userData.hp = e.hp;
          actor.userData.hitFlash = 0.38;
          actor.userData.body.material.emissive?.setHex(0xff3018);
          actor.userData.body.material.emissiveIntensity = 1.1;
          const oldLabel = actor.userData.label;
          actor.remove(oldLabel);
          oldLabel.material.map?.dispose(); oldLabel.material.dispose();
          const label = labelSprite(e.enemy + ' · ' + e.hp + '/' + e.maxHp, '#ffaaa0');
          label.position.y = 3.5; actor.add(label); actor.userData.label = label;
        }
      }
    }
    for (const [id, actor] of combatActors) {
      if (activeEncounterIds.has(id)) continue;
      combatGroup.remove(actor); clearGroup(actor); combatActors.delete(id);
      if (selectedCombatTargetId === id) { selectedCombatTargetId = null; selectedCombatAimPoint = null; autoFireHeld = false; if (autoFireTimer) clearTimeout(autoFireTimer); autoFireTimer = null; }
    }
    const selfEncounter = data.selfEncounter || data.encounter || null;
    const enemyDistance = selfEncounter && data.self
      ? Math.hypot(data.self.x - selfEncounter.x, data.self.z - selfEncounter.z) : Infinity;
    const enemyInReach = !!selfEncounter && enemyDistance <= (selfEncounter.range || 0);
    const targetMatches = !!selfEncounter && selectedCombatTargetId === selfEncounter.id;
    if (attackInfectedButton) attackInfectedButton.disabled = !selfEncounter || selfEncounter.defeated || selfEncounter.hp <= 0 || !enemyInReach;
    if (autoFireButton) autoFireButton.disabled = !targetMatches || selfEncounter.defeated || selfEncounter.hp <= 0 || !enemyInReach || moving;
    for (const [id, actor] of combatActors) {
      const ring = actor.userData.threatRing;
      if (ring) { ring.material.color.setHex(id === selectedCombatTargetId ? 0xffc05b : 0xd84b3e); ring.material.opacity = id === selectedCombatTargetId ? 0.72 : 0.08; }
    }
    if (combatStatus) combatStatus.textContent = selfEncounter && !selfEncounter.defeated
      ? selfEncounter.enemy + ' · HP ' + selfEncounter.hp + '/' + selfEncounter.maxHp + ' · risk ' + selfEncounter.risk + '/5 · ' + Math.ceil(enemyDistance) + ' units away' + (enemyInReach ? ' · in attack range' : ' · move closer to attack')
      : 'No active encounter. Search for infected to begin a server-authoritative fight.';
    for (const p of (data.players || [])) {
      const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
      const color = p.label === 'You' ? 0xffdf83 : p.party ? 0x8fd4f4 : 0xd7d1c5;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.2, 3, 6), mat(color));
      body.position.y = 1.45; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 6), mat(p.label === 'You' ? 0xffb45c : 0xc5aa8a));
      head.position.y = 2.55; g.add(head);
      // Visible held weapon silhouette; cosmetic finishes will bind to the authoritative loadout next.
      const weaponId = p.label === 'You' ? equippedWeaponId : 'pipe_blade';
      const weapon = new THREE.Group(); weapon.position.set(0.62, 1.72, 0.12); weapon.rotation.x = -0.12;
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.42, 0.13), mat(0x49372b));
      grip.position.y = -0.2; weapon.add(grip);
      const finish = p.label === 'You' ? equippedWeaponSkinColor : 0x9a7b62;
      const isMelee = weaponId === 'pipe_blade' || weaponId === 'shock_maul';
      const length = weaponId === 'marksman_rifle' ? 1.02 : weaponId === 'pump_shotgun' ? 0.92 : weaponId === 'shock_maul' ? 0.58 : 0.76;
      const width = weaponId === 'shock_maul' ? 0.28 : weaponId === 'pipe_blade' ? 0.1 : 0.16;
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(width, length, weaponId === 'shock_maul' ? 0.22 : 0.19), mat(finish));
      barrel.position.y = 0.12 + length / 2; weapon.add(barrel);
      if (weaponId === 'shock_maul') {
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.3, 0.32), mat(0x454844));
        head.position.y = 0.12 + length; weapon.add(head);
      } else if (!isMelee) {
        const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.23), mat(0x373a38));
        muzzle.position.y = 0.12 + length + 0.04; weapon.add(muzzle);
      }
      g.add(weapon); g.userData.weapon = weapon; g.userData.isLocalPlayer = p.label === 'You';
      const name = labelSprite(p.label || 'Explorer', p.label === 'You' ? '#ffe28a' : '#c8d8df'); name.position.y = 4.7; g.add(name);
      playerGroup.add(g);
    }
    const selectedLoot = (data.world?.lootNodes || []).find(n => n.id === selectedLootId);
    const nearSelected = !!selectedLoot && !!data.self && Math.hypot(data.self.x-selectedLoot.x,data.self.z-selectedLoot.z) <= 9;
    if (lootActionButton) lootActionButton.disabled = !selectedLoot || !selectedLoot.available || !nearSelected || moving || !data.self;
    if (lootStatus) lootStatus.textContent = !selectedLoot ? 'Select a physical supply crate in the 3D world to inspect it.' : !selectedLoot.available ? selectedLoot.label + ' has already been searched. It will restock later.' : !nearSelected ? selectedLoot.label + ' selected · move closer to search it.' : selectedLoot.label + ' · within reach. Search the container to collect its supplies.';
    if (status) {
      const self = data.self;
      status.textContent = self
        ? '3D shared world live · ' + (data.players?.length || 0) + ' explorers · ' + (self.district || 'perimeter').replaceAll('_', ' ') + ' · danger ' + self.risk + '/5 · click the ground to travel'
        : 'Enter the Graveyard expedition below to spawn into the shared 3D world.';
    }
  }
  async function fetchWorld() {
    if (!token() || moving) { if (status && !token()) status.textContent = 'Sign in to load the shared world. Your refuge and Graveyard position are saved to your account.'; return; }
    try {
      const r = await fetch(API + '/api/homefront/world', { headers: { authorization: 'Bearer ' + token() }, cache: 'no-store' });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.message || data.error || 'world_unavailable');
      updateWorld(data);
    } catch (e) { if (status) status.textContent = '3D world unavailable: ' + e.message; }
  }
  async function combatAction(action, targetId = selectedCombatTargetId) {
    if (!token()) { if (combatStatus) combatStatus.textContent = 'Sign in before fighting in the Graveyard.'; return; }
    if (moving) return;
    moving = true;
    if (findInfectedButton) findInfectedButton.disabled = true;
    if (attackInfectedButton) attackInfectedButton.disabled = true;
    try {
      const activeTarget = worldData?.selfEncounter || worldData?.encounter || null;
      const aimPoint = selectedCombatAimPoint && activeTarget && targetId === activeTarget.id
        ? { x: activeTarget.x, y: selectedCombatAimPoint.y, z: activeTarget.z }
        : selectedCombatAimPoint;
      const r = await fetch(API + '/api/homefront/world/' + action, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' },
        body: JSON.stringify(targetId ? { targetId, ...(aimPoint ? { aimPoint } : {}) } : {})
      });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.message || data.error || 'combat_failed');
      if (data.combat) {
        window.dispatchEvent(new CustomEvent('homefront:combat-hit', { detail: { damage: data.combat.damage, hitZone: data.combat.hitZone, killed: data.combat.killed, weaponId: equippedWeaponId, encounterId: data.encounter?.id || data.selfEncounter?.id || data.combat.encounter?.id || data.combat.encounterId, direction: 1 } }));
      }
      updateWorld(data);
      if (data.combat && combatStatus) {
        const result = data.combat;
        const stamina = Number.isFinite(data.selfSurvival?.stamina) ? Math.round(data.selfSurvival.stamina) : null;
        const fatigue = stamina !== null ? ' · stamina ' + stamina + '/100' + (stamina < 15 ? ' · exhausted: damage reduced' : stamina < 35 ? ' · tiring: damage reduced' : '') : '';
        combatStatus.textContent = result.killed
          ? 'Defeated the infected! +' + result.reward.scrap + ' scrap, +' + result.reward.embers + ' Embers (' + result.reward.quality + ').' + fatigue
          : (result.hitZone === 'head' ? 'HEADSHOT! ' : result.hitZone === 'limb' ? 'Limb hit. ' : '') + 'Hit for ' + result.damage + '. Retaliation: ' + result.enemyDamage + '. Ammo spent: ' + result.ammoCost + '.' + fatigue;
      } else if (combatStatus && data.encounter) {
        combatStatus.textContent = (data.reused ? 'Active threat: ' : 'Threat detected: ') + data.encounter.enemy + ' · HP ' + data.encounter.hp + '/' + data.encounter.maxHp + '. Close distance and attack.';
      }
      return !(data.combat?.killed);
    } catch (e) {
      if (combatStatus) combatStatus.textContent = e.message === 'enemy_out_of_range'
        ? 'Too far from the infected. Move closer on the map.'
        : e.message === 'attack_cooldown' ? 'Recovering from your last attack. Try again in a moment.'
        : e.message === 'insufficient_ammo' ? 'Magazine empty or short on rounds. Reload before firing.'
        : e.message === 'field_supplies_required' ? 'Not enough carried field supplies.'
        : e.message === 'target_mismatch' ? 'That target is not your active encounter. Select your active infected.'
        : e.message === 'invalid_aim_point' ? 'Aim point fell outside the infected hitbox. Select its body again.'
        : 'Combat unavailable: ' + e.message;
      return false;
    } finally {
      moving = false;
      if (findInfectedButton) findInfectedButton.disabled = false;
      if (attackInfectedButton) {
        const active = worldData?.selfEncounter || worldData?.encounter || null;
        const self = worldData?.self || null;
        const distance = active && self ? Math.hypot(self.x - active.x, self.z - active.z) : Infinity;
        attackInfectedButton.disabled = !active || active.defeated || active.hp <= 0 || distance > (active.range || 0);
        if (autoFireButton) autoFireButton.disabled = !active || selectedCombatTargetId !== active.id || active.defeated || active.hp <= 0 || distance > (active.range || 0);
        if (reloadWeaponButton) reloadWeaponButton.disabled = !worldData?.self;
      }
    }
  }
  async function collectSelectedLoot() {
    if (!selectedLootId || moving || !token()) { if (lootStatus) lootStatus.textContent = 'Sign in and enter an expedition before collecting supplies.'; return; }
    moving = true; if (lootActionButton) lootActionButton.disabled = true;
    try {
      const r = await fetch(API + '/api/homefront/world/loot', {method:'POST',headers:{authorization:'Bearer '+token(),'content-type':'application/json'},body:JSON.stringify({nodeId:selectedLootId})});
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.message || data.error || 'loot_failed');
      updateWorld(data);
      const accepted=(data.loot?.accepted||[]).map(d=>'+'+d.amount+' '+d.item).join(', ');
      const overflow=(data.loot?.overflow||[]).map(d=>d.amount+' '+d.item).join(', ');
      if (lootStatus) lootStatus.textContent = (accepted ? 'Collected: '+accepted+'. ' : 'Your pack could not accept the supplies. ') + (overflow ? 'Pack full; sent to refuge stores: '+overflow+'. ' : '') + 'This container will restock after its cooldown.';
    } catch (e) {
      if (lootStatus) lootStatus.textContent = e.message === 'too_far_from_loot' ? 'Move closer to the selected supply container.' : e.message === 'loot_node_empty' ? 'Someone has already searched this container. Check back later.' : 'Scavenging unavailable: '+e.message;
    } finally {
      moving=false;
      const node=(worldData?.world?.lootNodes||[]).find(n=>n.id===selectedLootId);
      const near=!!node&&!!worldData?.self&&Math.hypot(worldData.self.x-node.x,worldData.self.z-node.z)<=9;
      if(lootActionButton) lootActionButton.disabled=!node||!node.available||!near||!worldData?.self;
    }
  }
  if (lootActionButton) lootActionButton.addEventListener('click', collectSelectedLoot);
  async function reloadWeapon() {
    if (!token() || moving) { if (combatStatus) combatStatus.textContent = 'Sign in and enter an expedition before reloading.'; return; }
    moving = true;
    if (reloadWeaponButton) reloadWeaponButton.disabled = true;
    try {
      const r = await fetch(API + '/api/homefront/world/reload', { method: 'POST', headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: '{}' });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.message || data.error || 'reload_failed');
      updateWorld(data);
      if (combatStatus) {
        const mag = data.selfWeaponMagazine;
        combatStatus.textContent = 'Reloaded ' + data.reloaded + ' round' + (data.reloaded === 1 ? '' : 's') + '. Magazine: ' + (mag?.loaded ?? 0) + '/' + (mag?.capacity ?? 0) + '; reserve: ' + (data.inventory?.ammo ?? 0) + '.';
      }
    } catch (e) {
      if (combatStatus) combatStatus.textContent = e.message === 'weapon_does_not_reload' ? 'This melee weapon does not use ammunition.' : e.message === 'magazine_full' ? 'Magazine is already full.' : e.message === 'no_reserve_ammo' ? 'No reserve ammunition. Pack or scavenge more ammo.' : 'Reload unavailable: ' + e.message;
    } finally {
      moving = false;
      if (reloadWeaponButton) reloadWeaponButton.disabled = !worldData?.self;
    }
  }
  if (reloadWeaponButton) reloadWeaponButton.addEventListener('click', reloadWeapon);
  if (findInfectedButton) findInfectedButton.addEventListener('click', () => combatAction('encounter'));
  if (attackInfectedButton) attackInfectedButton.addEventListener('click', () => combatAction('attack'));
  const stopAutoFire = () => { autoFireHeld = false; if (autoFireTimer) clearTimeout(autoFireTimer); autoFireTimer = null; if (autoFireButton) autoFireButton.setAttribute('aria-pressed', 'false'); };
  const fireLoop = async () => {
    if (!autoFireHeld || moving) return;
    const active = worldData?.selfEncounter || worldData?.encounter || null;
    const self = worldData?.self || null;
    const distance = active && self ? Math.hypot(self.x - active.x, self.z - active.z) : Infinity;
    if (!active || active.defeated || active.hp <= 0 || selectedCombatTargetId !== active.id || distance > (active.range || 0)) { stopAutoFire(); if (combatStatus) combatStatus.textContent = 'Autofire stopped: target defeated, out of range, or no longer selected.'; return; }
    const fired = await combatAction('attack', selectedCombatTargetId);
    if (!autoFireHeld || fired === false) { stopAutoFire(); return; }
    const delay = equippedWeaponId === 'marksman_rifle' ? 1350 : equippedWeaponId === 'pump_shotgun' ? 1150 : equippedWeaponId === 'shock_maul' || equippedWeaponId === 'pipe_blade' ? 950 : 1000;
    autoFireTimer = setTimeout(fireLoop, delay);
  };
  if (autoFireButton) {
    autoFireButton.addEventListener('pointerdown', event => { if (autoFireButton.disabled) return; event.preventDefault(); stopAutoFire(); try { autoFireButton.setPointerCapture(event.pointerId); } catch {} autoFireHeld = true; autoFireButton.setAttribute('aria-pressed', 'true'); fireLoop(); });
    for (const eventName of ['pointerup','pointercancel','lostpointercapture']) autoFireButton.addEventListener(eventName, stopAutoFire);
    window.addEventListener('pointerup', stopAutoFire);
    window.addEventListener('blur', stopAutoFire);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopAutoFire(); });
    autoFireButton.addEventListener('contextmenu', event => event.preventDefault());
  }
  const groundHit = new THREE.Mesh(new THREE.PlaneGeometry(204, 204), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  groundHit.rotation.x = -Math.PI / 2; groundHit.position.y = 0.01; scene.add(groundHit);
  renderer.domElement.addEventListener('pointerdown', e => {
    if (!worldData?.self || moving) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left) / rect.width * 2 - 1;
    pointer.y = -(e.clientY - rect.top) / rect.height * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const combatHits = raycaster.intersectObject(combatGroup, true);
    const combatHit = combatHits.find(hit => hit.object.userData?.combatHitbox);
    if (combatHit) {
      let target = combatHit.object;
      while (target && !target.userData?.encounterId) target = target.parent;
      if (target?.userData?.encounterId) {
        selectedCombatTargetId = target.userData.encounterId;
        const hit = combatHit.point;
        selectedCombatAimPoint = { x: hit.x, y: hit.y, z: hit.z };
        const active = worldData?.selfEncounter || worldData?.encounter || null;
        if (combatStatus) combatStatus.textContent = active?.id === selectedCombatTargetId
          ? 'Target locked: ' + (active.enemy || 'infected') + ' · aim point set. Hold autofire to engage.'
          : 'Target selected, but only your active encounter can be attacked right now.';
        updateWorld(worldData);
        return;
      }
    }
    const lootHits = raycaster.intersectObject(lootGroup, true);
    if (lootHits.length) {
      let target = lootHits[0].object;
      while (target && !target.userData?.lootNodeId) target = target.parent;
      if (target?.userData?.lootNodeId) {
        selectedLootId = target.userData.lootNodeId;
        const node = (worldData.world?.lootNodes || []).find(n=>n.id===selectedLootId);
        if (lootStatus) lootStatus.textContent = node ? node.label + ' selected. ' + (node.available ? 'Check distance, then search it.' : 'This container is empty for now.') : 'Supply node unavailable.';
        updateWorld(worldData);
        return;
      }
    }
    if (worldData.party && !worldData.party.leader) return;
    const hits = raycaster.intersectObject(groundHit);
    if (!hits.length) return;
    moveTo(Math.max(-100, Math.min(100, hits[0].point.x)), Math.max(-100, Math.min(100, hits[0].point.z)));
  });
  async function moveTo(x, z) {
    moving = true; if (status) status.textContent = 'Moving through the shared Graveyard…';
    try {
      const r = await fetch(API + '/api/homefront/world/move', { method: 'POST', headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: JSON.stringify({ x, z }) });
      const data = await r.json();
      if (!r.ok || data.error) throw new Error(data.message || data.error || 'movement_rejected');
      updateWorld(data);
    } catch (e) {
      if (status) status.textContent = e.message === 'party_leader_controls_movement' ? 'Your party leader controls group movement.' : e.message === 'movement_too_far' ? 'That destination is too far away. Click closer; movement is server-limited.' : 'Movement failed: ' + e.message;
    } finally { moving = false; }
  }
  const resize = () => { const w = Math.max(1, host.clientWidth), h = Math.max(260, host.clientHeight); camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(host);
  resize();
  let lastFrame = performance.now();
  const tick = () => { const now = performance.now(), dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now; for (const mixer of zombieMixers) mixer.update(dt); for (const explorer of playerGroup.children) { if (!explorer.userData.isLocalPlayer || !explorer.userData.weapon) continue; const remaining = weaponSwingUntil - now; const progress = remaining > 0 ? Math.max(0, Math.min(1, (now - weaponSwingStartedAt) / 320)) : 0; if (remaining <= 0) { explorer.userData.weapon.rotation.x = -0.12; explorer.userData.weapon.rotation.z = 0; continue; } if (weaponSwingWeaponId === 'pump_shotgun' || weaponSwingWeaponId === 'marksman_rifle') { const kick = progress < 0.2 ? progress / 0.2 : Math.max(0, 1 - (progress - 0.2) / 0.8); const strength = weaponSwingWeaponId === 'marksman_rifle' ? 0.62 : 0.46; explorer.userData.weapon.rotation.x = -0.12 - kick * strength; explorer.userData.weapon.rotation.z = kick * 0.045; } else if (weaponSwingWeaponId === 'shock_maul') { const arc = Math.sin(progress * Math.PI); explorer.userData.weapon.rotation.x = -0.12 + arc * 1.15; explorer.userData.weapon.rotation.z = arc * 0.2; } else { explorer.userData.weapon.rotation.x = -0.12 + Math.sin(progress * Math.PI) * 0.95; explorer.userData.weapon.rotation.z = Math.sin(progress * Math.PI) * 0.38; } } for (const piece of [...impactGroup.children]) { piece.userData.life -= dt; piece.position.x += piece.userData.vx * dt; piece.position.y += piece.userData.vy * dt; piece.position.z += piece.userData.vz * dt; piece.userData.vy -= 5.5 * dt; piece.rotation.x += dt * 5; piece.rotation.z += dt * 3; if (piece.userData.blood) piece.material.opacity = Math.max(0, piece.userData.life / 0.75); if (piece.userData.life <= 0 || piece.position.y < 0) { impactGroup.remove(piece); piece.geometry.dispose(); piece.material.dispose(); } } for (const actor of combatActors.values()) { const state = actor.userData; const blend = 1 - Math.exp(-3.5 * dt); const dx = state.targetX - actor.position.x, dz = state.targetZ - actor.position.z; actor.position.x += dx * blend; actor.position.z += dz * blend;
      const impactRemaining = state.impactUntil - now;
      if (impactRemaining > 0) {
        const p = impactRemaining / 300;
        const hitPulse = Math.sin(p * Math.PI);
        const headshot = state.impactStyle === 'headshot';
        actor.position.x += state.impactDirection * (state.impactStyle === 'blunt' ? 0.075 : headshot ? 0.065 : 0.045) * hitPulse;
        actor.rotation.z = (state.impactStyle === 'blunt' ? 0.22 : headshot ? 0.28 : 0.12) * hitPulse * state.impactDirection;
        state.body.scale.y = state.impactStyle === 'blunt' ? 1 - 0.18 * hitPulse : headshot ? 1 - 0.1 * hitPulse : 1;
      } else { actor.rotation.z = 0; state.body.scale.y = 1; }
      if (Math.hypot(dx, dz) > 0.08) actor.rotation.y = Math.atan2(dx, dz); const self = worldData?.self; const threatDistance = self ? Math.hypot(self.x - actor.position.x, self.z - actor.position.z) : Infinity; if (state.threatRing) { const pressure = threatDistance <= 3 ? 1 : threatDistance <= 8 ? 0.42 : 0.08; state.threatRing.material.opacity = pressure * (0.72 + 0.28 * Math.sin(now / 150)); state.threatRing.scale.setScalar(threatDistance <= 3 ? 1.18 : 1); } if (state.hitFlash > 0) { state.hitFlash = Math.max(0, state.hitFlash - dt); if (state.hitFlash === 0) { state.body.material.emissive?.setHex(0x000000); state.body.material.emissiveIntensity = 0; } } } renderer.render(scene, camera); requestAnimationFrame(tick); };
  tick(); loadInfectedAsset(); fetchWorld(); setInterval(fetchWorld, 8000);
}
