// Three.js shared XRPL Graveyard scene for Homefront.
// Uses the existing Homefront world API as authority; this module owns presentation only.
import * as THREE from './vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from '../vendor/three/examples/jsm/utils/SkeletonUtils.js';
import { chunkCoords, chunkKey, visibleChunkSet } from './homefront-world-streaming.mjs';
import { terrainElevation } from './homefront-terrain-generation.mjs';
import { biomeAt, environmentalCandidates, landmarkCandidates } from './homefront-world-generation.mjs';
import { sfx } from './sfx.js';
import { createZombieAudio } from './zaudio.js';
import { createZombieModelPilot } from './zombie-model-pilot.mjs';

const host = document.getElementById('graveyard3d');
if (host) boot(host);

function boot(host) {
  const status = document.getElementById('graveyard3dStatus');
  const zombieAudio = createZombieAudio(sfx, { base: new URL('./sfx/', import.meta.url).href, mobile: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches });
  let zombieAudioStarted = false;
  const startZombieAudio = () => { if (zombieAudioStarted) return; zombieAudioStarted = true; zombieAudio.start(); };
  window.addEventListener('pointerdown', startZombieAudio, { once: true, passive: true });
  window.addEventListener('keydown', startZombieAudio, { once: true });
  window.addEventListener('pagehide', () => zombieAudio.stop(), { once: true });
  const API = new URLSearchParams(location.search).get('api') ||
    (/fly\.dev$|localhost/.test(location.hostname) ? location.origin : 'https://burn-city-game.fly.dev');
  const token = () => localStorage.getItem('bcToken') || '';
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111312);
  scene.fog = new THREE.FogExp2(0x171a18, 0.0038);
  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
  camera.position.set(0, 5, -7);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = false;
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xaec5cc, 0x24251e, 2.0));
  const moon = new THREE.DirectionalLight(0xffc18a, 1.4);
  moon.position.set(-50, 100, 35); scene.add(moon);
  // Drifting ash gives the scene depth and motion without adding a particle-system dependency.
  const ashCount = 150;
  const ashRandom = value => { const n = Math.sin(value * 127.1) * 43758.5453; return n - Math.floor(n); };
  const ashPositions = new Float32Array(ashCount * 3);
  for (let i = 0; i < ashCount; i++) {
    ashPositions[i * 3] = ashRandom(i + 1) * 190 - 95;
    ashPositions[i * 3 + 1] = 0.5 + ashRandom(i + 101) * 17;
    ashPositions[i * 3 + 2] = ashRandom(i + 201) * 190 - 95;
  }
  const ashGeometry = new THREE.BufferGeometry();
  ashGeometry.setAttribute('position', new THREE.BufferAttribute(ashPositions, 3));
  const ashMotes = new THREE.Points(ashGeometry, new THREE.PointsMaterial({
    color: 0xc2b8a2, size: 0.16, transparent: true, opacity: 0.3, depthWrite: false, sizeAttenuation: true
  }));
  ashMotes.frustumCulled = false;
  scene.add(ashMotes);

  // Color the continuous ground from the same seeded biome sampler as environmental dressing.
  // Elevation remains intentionally flat until movement, hit-testing, and server validation share terrain heights.
  const groundGeometry = new THREE.PlaneGeometry(204, 204, 96, 96);
  const groundPositions = groundGeometry.attributes.position;
  const groundColors = new Float32Array(groundPositions.count * 3);
  const groundColor = new THREE.Color();
  for (let i = 0; i < groundPositions.count; i++) {
    const worldX = groundPositions.getX(i), worldZ = -groundPositions.getY(i);
    // Shallow broad rises and depressions create visible slopes without yet changing server movement rules.
    groundPositions.setZ(i, (terrainElevation(worldX, worldZ)));
    const biome = biomeAt(worldX, worldZ);
    groundColor.setHex(biome.ground);
    // Tiny seeded-looking tonal drift from biome fields avoids a completely flat painted appearance.
    const drift = (biome.moisture - 0.5) * 0.045 + (biome.urban - 0.5) * 0.025;
    groundColors[i * 3] = Math.max(0, Math.min(1, groundColor.r + drift));
    groundColors[i * 3 + 1] = Math.max(0, Math.min(1, groundColor.g + drift));
    groundColors[i * 3 + 2] = Math.max(0, Math.min(1, groundColor.b + drift));
  }
  groundGeometry.attributes.position.needsUpdate = true;
  groundGeometry.computeVertexNormals();
  groundGeometry.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 1 });
  const ground = new THREE.Mesh(groundGeometry, groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.y = 0; scene.add(ground);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const poiGroup = new THREE.Group(), lootGroup = new THREE.Group(), playerGroup = new THREE.Group(), cityGroup = new THREE.Group(), zombieGroup = new THREE.Group(), combatGroup = new THREE.Group(), impactGroup = new THREE.Group();
  const worldChunkGroups = new Map();
  const environmentVisuals = new Map();
  const environmentStateCache = new Map();
  let activeChunkSignature = '';
  scene.add(cityGroup, poiGroup, lootGroup, playerGroup, zombieGroup, combatGroup, impactGroup);
  const combatStatus = document.getElementById('combatStatus');
  const lootActionButton = document.getElementById('collectLoot');
  const lootStatus = document.getElementById('lootStatus');
  let selectedLootId = null;
  const findInfectedButton = document.getElementById('findInfected');
  const attackInfectedButton = document.getElementById('attackInfected');
  const damageEnvironmentButton = document.getElementById('damageEnvironment');
  let selectedEnvironmentId = null;
  const autoFireButton = document.getElementById('autoFireInfected');
  const reloadWeaponButton = document.getElementById('reloadWeapon');
  const ammoStatus = document.getElementById('ammoStatus');
  let reloadState = null;
  let reloadTimer = null;
  let reloadUiTimer = null;
  let selectedCombatTargetId = null;
  const aimWeaponButton = document.getElementById('aimWeapon');
  const aimStabilityStatus = document.getElementById('aimStability');
  const sprintTravelButton = document.getElementById('sprintTravel');
  let sprintTravel = false;
  let aiming = false;
  let aimStability = 1;
  let authoritativeAimStability = null;
  let aimRecoveryUntil = 0;
  let lastTravelAt = 0;
  let selectedCombatAimPoint = null;
  let autoFireHeld = false;
  let autoFireTimer = null;
  const zombieMixers = [];
  // Keep server-owned infected actors between snapshots so movement is presented smoothly.
  const combatActors = new Map();
  let zombieModelPilot = null;
  let zombieModelPilotLoading = false;
  let zombieModelPilotFailed = false;
  // Interpolate explorer positions between authoritative world snapshots.
  const explorerPositions = new Map();
  let weaponSwingUntil = 0;
  let weaponSwingStartedAt = 0;
  let weaponSwingWeaponId = 'pipe_blade';
  window.addEventListener('homefront:combat-hit', event => {
    const detail = event.detail || {};
    const active = worldData?.selfEncounter || worldData?.encounter || (worldData?.encounters || []).find(item => item.id === detail.encounterId) || null;
    const target = active ? { id: active.id, x: active.x, y: terrainElevation(active.x, active.z), z: active.z, ty: 0 } : null;
    zombieAudio.hit({ hs: detail.hitZone === 'head', k: !!detail.killed }, target);
    if (active?.id) zombieModelPilot?.react(active.id, detail.killed ? 'Death' : 'HitReact');
    if (detail.killed && target) zombieAudio.zdie(target);
  });
  window.addEventListener('homefront:combat-hit-feedback', event => {
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
  let equippedOutfitColor = 0x6d7659;
  let equippedBackpackColor = 0x78604a;
  let equippedWeaponId = 'pipe_blade';
  const parseCosmeticColor = (value, fallback) =>
    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? Number.parseInt(value.slice(1), 16) : fallback;
  window.addEventListener('homefront:cosmetics', event => {
    const detail = event.detail || {};
    equippedWeaponSkinColor = parseCosmeticColor(detail.weaponColor, equippedWeaponSkinColor);
    equippedOutfitColor = parseCosmeticColor(detail.outfitColor, equippedOutfitColor);
    equippedBackpackColor = parseCosmeticColor(detail.backpackColor, equippedBackpackColor);
    if (['pipe_blade','pump_shotgun','marksman_rifle','shock_maul'].includes(detail.weaponId)) equippedWeaponId = detail.weaponId;
  });
  const roadMat = mat(0x343733), buildingMats = [mat(0x41413a), mat(0x4b443a), mat(0x363d3d), mat(0x50483d)];
  const ruinMat = mat(0x292d2a), emberMat = new THREE.MeshStandardMaterial({ color: 0xff7738, emissive: 0x9c2507, emissiveIntensity: 0.8 });
  const addBox = (parent, w, h, d, x, y, z, material) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    m.position.set(x, y + h / 2, z); parent.add(m); return m;
  };
  // Ruined structures are grouped by spatial chunk so distant scenery can be culled as the world grows.
  function cityChunkAt(x, z) {
    const coords = chunkCoords(x, z);
    const id = chunkKey(coords.x, coords.z);
    if (!worldChunkGroups.has(id)) {
      const group = new THREE.Group(); group.name = id; group.userData.chunkId = id;
      worldChunkGroups.set(id, group); cityGroup.add(group);
    }
    return worldChunkGroups.get(id);
  }
  function updateVisibleChunks(x, z) {
    const visible = visibleChunkSet(x, z, 1);
    const signature = [...visible].sort().join('|');
    if (signature === activeChunkSignature) return;
    activeChunkSignature = signature;
    for (const [id, group] of worldChunkGroups) group.visible = visible.has(id);
  }
  for (const [radius, color] of [[25, 0x4f885b], [45, 0x88854b], [62, 0x9a683e], [76, 0x984d37], [90, 0x7d3037]]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.18, radius + 0.18, 128), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.68, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; scene.add(ring);
  }
  // Deterministic environmental dressing is grouped with structures so chunk visibility culls it together.
  // Props remain presentation-only: they do not grant loot, block movement, or alter server authority.
  const envMats = {
    bark: mat(0x39352b), barkLight: mat(0x51483a), leafless: mat(0x48473b),
    rubble: mat(0x65635a), rubbleDark: mat(0x454740), reed: mat(0x6d7651),
    water: new THREE.MeshStandardMaterial({ color: 0x354b49, roughness: 0.28, metalness: 0.12, transparent: true, opacity: 0.72 }),
    vehicle: mat(0x393f3b), vehicleGlass: mat(0x202b2b), shrub: mat(0x343b2d), stone: mat(0x747166)
  };
  const landmarkMats = {
    fadedOrange: mat(0x9b5838), canvas: mat(0x71694e), metal: mat(0x454b49),
    concrete: mat(0x66645a), warning: mat(0xb18a45), dark: mat(0x292d2b)
  };
  function registerEnvironmentVisual(id, group) {
    if (!id || !group) return;
    group.userData.environmentId = id;
    environmentVisuals.set(id, group);
  }
  function applyEnvironmentStateSnapshot(structures) {
    for (const state of (Array.isArray(structures) ? structures : [])) {
      if (!state || typeof state.id !== 'string') continue;
      environmentStateCache.set(state.id, state);
    }
    for (const [id, state] of environmentStateCache) {
      const group = environmentVisuals.get(id);
      if (!group) continue;
      const destroyed = state.collisionEnabled === false || state.health <= 0 || state.stage === 'destroyed';
      group.visible = !destroyed;
      if (group.userData.damageStage === state.stage && group.userData.damageDestroyed === destroyed) continue;
      group.userData.damageStage = state.stage;
      group.userData.damageDestroyed = destroyed;
      group.traverse(node => {
        if (!node.isMesh || !node.material) return;
        const source = Array.isArray(node.material) ? node.material : [node.material];
        const materials = source.map(material => {
          if (material.userData?.homefrontDamageMaterial) return material;
          const copy = material.clone();
          copy.userData.homefrontDamageMaterial = true;
          copy.userData.homefrontBaseColor = material.color?.getHex() ?? 0xffffff;
          copy.userData.homefrontBaseEmissive = material.emissive?.getHex() ?? 0;
          copy.userData.homefrontBaseEmissiveIntensity = material.emissiveIntensity ?? 0;
          return copy;
        });
        node.material = Array.isArray(node.material) ? materials : materials[0];
        for (const material of materials) {
          if (!material.color || !material.emissive) continue;
          material.color.setHex(material.userData.homefrontBaseColor);
          material.emissive.setHex(material.userData.homefrontBaseEmissive);
          material.emissiveIntensity = material.userData.homefrontBaseEmissiveIntensity;
          if (state.stage === 'critical') {
            material.color.multiplyScalar(0.58);
            material.emissive.setHex(0x6f2117);
            material.emissiveIntensity = 0.38;
          } else if (state.stage === 'damaged') {
            material.color.multiplyScalar(0.76);
            material.emissive.setHex(0x4b281d);
            material.emissiveIntensity = 0.18;
          } else if (state.stage === 'scuffed') {
            material.color.multiplyScalar(0.9);
            material.emissive.setHex(0x30261d);
            material.emissiveIntensity = 0.06;
          }
          material.needsUpdate = true;
        }
      });
    }
  }
  function addLandmark(parent, landmark) {
    const g = new THREE.Group();
    g.position.set(landmark.x, terrainElevation(landmark.x, landmark.z), landmark.z);
    g.rotation.y = (Math.abs(landmark.x * 7 + landmark.z * 13) % 628) / 100;
    if (landmark.type === 'evacuation_checkpoint') {
      addBox(g, 5.8, 0.18, 0.28, 0, 2.55, 0, landmarkMats.fadedOrange);
      addBox(g, 0.22, 2.7, 0.22, -2.7, 0, 0, landmarkMats.metal);
      addBox(g, 0.22, 2.7, 0.22, 2.7, 0, 0, landmarkMats.metal);
      addBox(g, 4.8, 0.1, 0.14, 0, 2.28, 0.18, landmarkMats.warning);
      for (const x of [-3.5, 3.5]) {
        addBox(g, 0.65, 0.75, 0.65, x, 0, 0, landmarkMats.concrete);
        addBox(g, 0.75, 0.08, 0.75, x, 0.76, 0, landmarkMats.warning);
      }
      // Broken lane barricade and an abandoned checkpoint booth.
      addBox(g, 2.4, 1.3, 1.6, -1.1, 0, -2.2, landmarkMats.concrete);
      addBox(g, 2.2, 0.12, 1.4, -1.1, 1.3, -2.2, landmarkMats.dark);
    } else if (landmark.type === 'survivor_camp') {
      addBox(g, 3.8, 0.12, 3.0, 0, 0.08, 0, landmarkMats.dark);
      addBox(g, 2.7, 1.75, 2.1, -1.1, 0.15, 0.2, landmarkMats.canvas);
      const tarp = new THREE.Mesh(new THREE.ConeGeometry(1.75, 1.15, 4), landmarkMats.canvas);
      tarp.position.set(-1.1, 2.0, 0.2); tarp.rotation.y = Math.PI / 4; g.add(tarp);
      addBox(g, 1.2, 0.5, 1.1, 1.0, 0.15, 0.2, landmarkMats.concrete);
      const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 0.18, 8), emberMat);
      fire.position.set(1.2, 0.22, 1.25); g.add(fire);
      for (const x of [-2.2, 2.2]) addBox(g, 0.12, 1.5, 0.12, x, 0, -1.25, landmarkMats.metal);
    } else if (landmark.type === 'radio_tower') {
      for (const x of [-0.95, 0.95]) for (const z of [-0.95, 0.95]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.09, 7.5, 5), landmarkMats.metal);
        leg.position.set(x * 0.55, 3.75, z * 0.55); leg.rotation.z = x * -0.06; g.add(leg);
      }
      for (const y of [1.1, 2.7, 4.4, 6.2]) addBox(g, 1.6, 0.08, 1.6, 0, y, 0, landmarkMats.metal);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, 2.5, 6), landmarkMats.warning);
      mast.position.y = 8.1; g.add(mast);
      for (const z of [-0.55, 0.55]) {
        const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.4, 5), landmarkMats.metal);
        antenna.position.set(0, 5.5, z); antenna.rotation.x = z * 0.3; g.add(antenna);
      }
    } else if (landmark.type === 'crashed_bus') {
      const body = addBox(g, 2.35, 2.25, 7.2, 0, 0.25, 0, landmarkMats.fadedOrange);
      body.rotation.x = -0.04; body.rotation.z = -0.1;
      addBox(g, 2.1, 1.1, 4.9, 0, 2.35, -0.05, envMats.vehicleGlass);
      for (const x of [-1.15, 1.15]) for (const z of [-2.35, 2.35]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.22, 9), envMats.rubbleDark);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.45, z); g.add(wheel);
      }
      addBox(g, 0.8, 0.1, 1.5, 0.35, 0.55, 3.1, landmarkMats.dark);
    } else {
      addBox(g, 6.5, 0.28, 5.4, 0, 0.12, 0, landmarkMats.concrete);
      addBox(g, 5.8, 2.5, 0.35, 0, 0.25, -2.4, buildingMats[2]);
      addBox(g, 0.3, 3.2, 0.4, -2.5, 0.25, -2.3, landmarkMats.metal);
      addBox(g, 0.3, 1.7, 0.4, 2.5, 0.25, -2.3, landmarkMats.metal);
      addBox(g, 2.8, 0.18, 2.3, 0.7, 2.8, -1.0, landmarkMats.concrete);
      addBox(g, 1.5, 0.2, 1.3, -1.4, 0.15, 1.0, landmarkMats.dark);
      for (let i = 0; i < 4; i++) addBox(g, 0.18, 0.45, 0.18, -2.5 + i * 1.65, 0.2, -2.75, landmarkMats.warning);
    }
    g.userData.landmarkId = landmark.id;
    g.userData.landmarkType = landmark.type;
    parent.add(g);
  }
  function addEnvironmentalCandidate(parent, prop) {
    const g = new THREE.Group();
    g.position.set(prop.x, terrainElevation(prop.x, prop.z), prop.z);
    g.rotation.y = ((prop.id.length * 37 + Math.floor(Math.abs(prop.x * 13 + prop.z * 7))) % 628) / 100;
    const r = (Math.abs(prop.x * 17 + prop.z * 31) % 1);
    if (prop.type === 'dead_tree') {
      addBox(g, 0.28, 2.5 + r * 1.8, 0.3, 0, 0, 0, envMats.bark);
      for (let i = 0; i < 3; i++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.09, 1.05 + i * 0.12, 5), envMats.barkLight);
        branch.position.set((i - 1) * 0.28, 1.1 + i * 0.45, 0); branch.rotation.z = (i - 1) * -0.52; g.add(branch);
      }
    } else if (prop.type === 'fallen_log') {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.27, 2.5 + r, 7), envMats.bark);
      log.rotation.z = Math.PI / 2; log.position.y = 0.25; g.add(log);
    } else if (prop.type === 'rubble' || prop.type === 'stone_debris') {
      for (let i = 0; i < 3; i++) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28 + ((r + i * 0.21) % 0.4), 0), i % 2 ? envMats.rubble : envMats.stone);
        rock.position.set((i - 1) * 0.38, 0.2 + (i % 2) * 0.16, (i % 2) * 0.32); rock.rotation.set(r * 2, i, r * 3); g.add(rock);
      }
    } else if (prop.type === 'abandoned_vehicle') {
      addBox(g, 1.65, 0.72, 3.1, 0, 0.25, 0, envMats.vehicle);
      addBox(g, 1.35, 0.55, 1.45, 0, 0.86, -0.12, envMats.vehicleGlass);
      for (const x of [-0.72, 0.72]) for (const z of [-0.95, 0.95]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.16, 8), envMats.rubbleDark);
        wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.27, z); g.add(wheel);
      }
    } else if (prop.type === 'dead_reed') {
      for (let i = 0; i < 4; i++) {
        const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.045, 0.65 + ((r + i * 0.13) % 0.55), 4), envMats.reed);
        reed.position.set((i - 1.5) * 0.13, 0.4, (i % 2) * 0.16); reed.rotation.z = (i % 2 ? 1 : -1) * 0.12; g.add(reed);
      }
    } else if (prop.type === 'standing_water') {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(1.1 + r, 9), envMats.water);
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.025; pool.scale.set(1.3, 0.7, 1); g.add(pool);
    } else {
      for (let i = 0; i < 3; i++) {
        const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 + r * 0.18, 0), envMats.shrub);
        bush.position.set((i - 1) * 0.32, 0.24 + (i % 2) * 0.1, (i % 2) * 0.18); bush.scale.y = 0.65; g.add(bush);
      }
    }
    const cell = prop.id.slice(4).split(',');
    const prefix = prop.type === 'dead_tree' ? 'tree' : prop.type === 'fallen_log' ? 'log' : prop.type === 'abandoned_vehicle' ? 'vehicle' : (prop.type === 'rubble' || prop.type === 'stone_debris') ? 'debris' : null;
    if (prefix && cell.length === 2) registerEnvironmentVisual(prefix + ':' + cell[0] + ',' + cell[1], g);
    parent.add(g);
  }
  // Existing server bounds are +/-100; four-by-four chunks cover that playable footprint.
  for (let cz = -2; cz <= 1; cz++) for (let cx = -2; cx <= 1; cx++) {
    const chunk = cityChunkAt(cx * 64 + 0.01, cz * 64 + 0.01);
    for (const prop of environmentalCandidates(cx, cz, { density: 0.18 })) addEnvironmentalCandidate(chunk, prop);
    for (const landmark of landmarkCandidates(cx, cz)) addLandmark(chunk, landmark);
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
    const chunk = cityChunkAt(bx, bz);
    const baseY = terrainElevation(bx, bz);
    const structure = new THREE.Group();
    const building = addBox(structure, w, h, d, bx, baseY + h / 2, bz, buildingMats[Math.floor(rand() * buildingMats.length)]);
    building.rotation.y = (rand() - 0.5) * 0.16;
    if (rand() > 0.45) addBox(structure, w * 0.6, 0.45, d * 0.65, bx + (rand() - .5), baseY + h + 0.225, bz + (rand() - .5), ruinMat);
    if (rand() > 0.7) { const emberHeight = 1.2 + rand(); addBox(structure, 0.35, emberHeight, 0.35, bx + w * .4, baseY + emberHeight / 2, bz - d * .35, emberMat); }
    chunk.add(structure);
    registerEnvironmentVisual('building:' + x + ',' + z, structure);
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
    const g = new THREE.Group(); g.position.set(p.x, terrainElevation(p.x, p.z), p.z);
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
    const g = new THREE.Group(); g.position.set(p.x, terrainElevation(p.x, p.z), p.z); g.userData.lootNodeId = p.id;
    const color = p.kind === 'medical' ? 0x9fce8a : p.kind === 'materials' ? 0xc5a36b : p.kind === 'highrisk' ? 0xff5a46 : 0xe1b65b;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.15, 1.45), mat(p.kind === 'medical' ? 0x667d5d : 0x6f5437));
    crate.position.y = 0.68; crate.userData.lootNodeId = p.id; g.add(crate);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.13, 1.48), new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:0.18}));
    stripe.position.y = 0.76; stripe.userData.lootNodeId = p.id; g.add(stripe);
    const glow = new THREE.Mesh(new THREE.TorusGeometry(1.55,0.07,5,24), new THREE.MeshBasicMaterial({color,transparent:true,opacity:p.available?0.8:0.2}));
    glow.rotation.x = Math.PI/2; glow.position.y = 0.08; glow.userData.lootNodeId = p.id; g.add(glow);
    // Keep selection presentation attached to the physical node; gameplay availability remains server-owned.
    g.userData.lootGlow = { mesh: glow, color, available: !!p.available };
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
        actor.position.set(x, terrainElevation(x, z) - fitted.min.y, z);
        actor.rotation.y = Math.atan2(-x, -z);
        actor.traverse(node => { if (node.isMesh) { node.castShadow = false; node.receiveShadow = false; } });
        zombieGroup.add(actor);
        const clips = gltf.animations || [];
        const clip = clips.find(c => /walk|run|idle/i.test(c.name)) || clips[0];
        if (clip) { const mixer = new THREE.AnimationMixer(actor); mixer.clipAction(clip).play(); zombieMixers.push(mixer); }
      } else {
        const actor = new THREE.Group(); actor.position.set(x, terrainElevation(x, z), z);
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
    applyEnvironmentStateSnapshot(data.world?.environmentStructures);
    const selectedEnvironment = (data.world?.environmentStructures || []).find(item => item.id === selectedEnvironmentId);
    if (selectedEnvironment && (selectedEnvironment.collisionEnabled === false || selectedEnvironment.health <= 0)) selectedEnvironmentId = null;
    const selectedEnvironmentState = (data.world?.environmentStructures || []).find(item => item.id === selectedEnvironmentId);
    const environmentDistance = selectedEnvironmentState && data.self ? Math.hypot(data.self.x - selectedEnvironmentState.x, data.self.z - selectedEnvironmentState.z) : Infinity;
    if (damageEnvironmentButton) damageEnvironmentButton.disabled = !token() || !selectedEnvironmentState || environmentDistance > 8 || moving;
    if (typeof data.selfWeaponHandling?.aiming === 'boolean') aiming = data.selfWeaponHandling.aiming;
    if (sprintTravelButton) { sprintTravelButton.setAttribute('aria-pressed', String(sprintTravel)); sprintTravelButton.textContent = sprintTravel ? 'Sprint travel: ON' : 'Sprint travel: OFF'; }
    clearGroup(poiGroup); clearGroup(lootGroup); markerObjects.clear();
    for (const p of (data.world?.pointsOfInterest || [])) {
      buildPOI(p);
      const marker = markerObjects.get(p.id);
      if (p.type === 'cache' && data.world?.caches?.[p.id]?.readyAt > Date.now()) marker.children[0].material.color.setHex(0x77716b);
      if (p.type === 'rescue' && data.world?.rescues?.[p.id]?.readyAt > Date.now()) marker.children[0].material.color.setHex(0x77716b);
    }
    for (const node of (data.world?.lootNodes || [])) buildLootNode(node);
    const previousExplorerPositions = new Map();
    for (const explorer of playerGroup.children) {
      const key = explorer.userData.explorerKey;
      if (key) previousExplorerPositions.set(key, explorer.position.clone());
    }
    clearGroup(playerGroup);
    const encounters = data.encounters || [];
    const activeEncounterIds = new Set();
    for (const e of encounters) {
      activeEncounterIds.add(e.id);
      let actor = combatActors.get(e.id);
      if (!actor) {
        actor = new THREE.Group();
        actor.position.set(e.x, terrainElevation(e.x, e.z), e.z);
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
        actor.userData = { encounterId: e.id, enemyType: e.enemy || '', targetX: e.x, targetZ: e.z, hp: e.hp, body, head, label, threatRing, hitFlash: 0, impactUntil: 0, impactStyle: 'sharp', impactDirection: 1 };
        combatActors.set(e.id, actor); combatGroup.add(actor);
      } else {
        actor.userData.encounterId = e.id;
        actor.userData.enemyType = e.enemy || actor.userData.enemyType || '';
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
    const magazine = data.selfWeaponMagazine;
    if (ammoStatus) ammoStatus.textContent = magazine?.capacity > 0
      ? 'Magazine ' + magazine.loaded + '/' + magazine.capacity + ' · reserve ' + (data.selfInventory?.ammo ?? data.inventory?.ammo ?? 0)
      : 'Melee weapon · no ammunition';
    const selfEncounter = data.selfEncounter || data.encounter || null;
    const enemyDistance = selfEncounter && data.self
      ? Math.hypot(data.self.x - selfEncounter.x, data.self.z - selfEncounter.z) : Infinity;
    const enemyInReach = !!selfEncounter && enemyDistance <= (selfEncounter.range || 0);
    const targetMatches = !!selfEncounter && selectedCombatTargetId === selfEncounter.id;
    if (aimWeaponButton) { aimWeaponButton.disabled = !data.self || moving || !!reloadState || !targetMatches || !enemyInReach; aimWeaponButton.setAttribute('aria-pressed', String(aiming)); aimWeaponButton.textContent = aiming ? 'Lower weapon' : 'Aim weapon'; }
    if (sprintTravelButton) sprintTravelButton.disabled = !data.self || moving || !!reloadState;
    if (!targetMatches || !enemyInReach) { aiming = false; if (aimWeaponButton) { aimWeaponButton.setAttribute('aria-pressed', 'false'); aimWeaponButton.textContent = 'Aim weapon'; } }
    if (attackInfectedButton) attackInfectedButton.disabled = !selfEncounter || selfEncounter.defeated || selfEncounter.hp <= 0 || !enemyInReach;
    if (autoFireButton) autoFireButton.disabled = !targetMatches || selfEncounter.defeated || selfEncounter.hp <= 0 || !enemyInReach || moving;
    for (const [id, actor] of combatActors) {
      const ring = actor.userData.threatRing;
      if (ring) { ring.material.color.setHex(id === selectedCombatTargetId ? 0xffc05b : 0xd84b3e); ring.material.opacity = id === selectedCombatTargetId ? 0.72 : 0.08; }
    }
    if (combatStatus) combatStatus.textContent = selfEncounter && !selfEncounter.defeated
      ? selfEncounter.enemy + ' · HP ' + selfEncounter.hp + '/' + selfEncounter.maxHp + ' · risk ' + selfEncounter.risk + '/5 · ' + Math.ceil(enemyDistance) + ' units away' + (enemyInReach ? ' · in attack range' : ' · move closer to attack')
      : 'No active encounter. Search for infected to begin a server-authoritative fight.';
    explorerPositions.clear();
    for (const p of (data.players || [])) {
      const key = String(p.id || p.userId || p.accountId || p.label || 'explorer');
      const targetY = terrainElevation(p.x, p.z);
      const g = new THREE.Group();
      const previousPosition = previousExplorerPositions.get(key);
      g.position.set(previousPosition?.x ?? p.x, previousPosition?.y ?? targetY, previousPosition?.z ?? p.z);
      g.userData.explorerKey = key;
      g.userData.targetX = p.x; g.userData.targetZ = p.z; g.userData.targetY = targetY;
      explorerPositions.set(key, { x: p.x, y: targetY, z: p.z });
      const color = p.label === 'You' ? 0xffdf83 : p.party ? 0x8fd4f4 : 0xd7d1c5;
      const isLocalPlayer = p.label === 'You';
      const bodyColor = isLocalPlayer ? equippedOutfitColor : color;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.2, 3, 6), mat(bodyColor));
      body.position.y = 1.45; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 6), mat(isLocalPlayer ? 0xffb45c : 0xc5aa8a));
      head.position.y = 2.55; g.add(head);
      // A readable field pack makes the backpack slot visible in-world without affecting gameplay stats.
      const packColor = isLocalPlayer ? equippedBackpackColor : 0x78604a;
      const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.82, 0.34), mat(packColor));
      backpack.position.set(0, 1.55, -0.48); g.add(backpack);
      const packStrap = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.1, 0.38), mat(0x29251f));
      packStrap.position.set(0, 1.62, -0.49); g.add(packStrap);
      // Visible held weapon silhouette; the local weapon finish and model follow the equipped loadout.
      const weaponId = isLocalPlayer ? equippedWeaponId : 'pipe_blade';
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
      g.userData.avatarParts = [
        { object: body, baseY: 1.45, phase: 0 },
        { object: head, baseY: 2.55, phase: 0.12 },
        { object: backpack, baseY: 1.55, phase: 0.04 },
        { object: packStrap, baseY: 1.62, phase: 0.04 }
      ];
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
        ? '3D shared world live · ' + (data.players?.length || 0) + ' explorers · ' + (self.district || 'perimeter').replaceAll('_', ' ') + ' · danger ' + self.risk + '/5 · click to travel · V toggles third-person / tactical view'
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
    if (reloadState) cancelReload('Reload interrupted by combat.');
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
        authoritativeAimStability = Number.isFinite(data.combat.aimStability) ? data.combat.aimStability : null;
        const hitDetail = { damage: data.combat.damage, hitZone: data.combat.hitZone, killed: data.combat.killed, weaponId: equippedWeaponId, encounterId: data.encounter?.id || data.selfEncounter?.id || data.combat.encounter?.id || data.combat.encounterId, direction: 1 };
        window.dispatchEvent(new CustomEvent('homefront:combat-hit', { detail: hitDetail }));
        window.dispatchEvent(new CustomEvent('homefront:combat-hit-feedback', { detail: hitDetail }));
      }
      updateWorld(data);
      if (data.combat && combatStatus) {
        const result = data.combat;
        const precision = result.aimed ? ' · ADS confirmed (' + Math.round((result.aimStability || 0) * 100) + '% stability)' : (result.aimStability < 0.72 ? ' · weapon settling (' + Math.round((result.aimStability || 0) * 100) + '%)' : '');
        const stamina = Number.isFinite(data.selfSurvival?.stamina) ? Math.round(data.selfSurvival.stamina) : null;
        const fatigue = stamina !== null ? ' · stamina ' + stamina + '/100' + (stamina < 15 ? ' · exhausted: damage reduced' : stamina < 35 ? ' · tiring: damage reduced' : '') : '';
        combatStatus.textContent = result.killed
          ? 'Defeated the infected! +' + result.reward.scrap + ' scrap, +' + result.reward.embers + ' Embers (' + result.reward.quality + ').' + fatigue
          : (result.hitZone === 'head' ? 'HEADSHOT! ' : result.hitZone === 'limb' ? 'Limb hit. ' : '') + 'Hit for ' + result.damage + '. Retaliation: ' + result.enemyDamage + '. Ammo spent: ' + result.ammoCost + '.' + fatigue + precision;
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
  function clearReloadTimers() {
    if (reloadTimer) clearTimeout(reloadTimer);
    if (reloadUiTimer) clearInterval(reloadUiTimer);
    reloadTimer = null; reloadUiTimer = null;
  }
  function cancelReload(message = 'Reload interrupted.') {
    if (!reloadState) return;
    clearReloadTimers(); reloadState = null;
    if (reloadWeaponButton) { reloadWeaponButton.textContent = 'Reload magazine'; reloadWeaponButton.disabled = !worldData?.self; }
    for (const explorer of playerGroup.children) if (explorer.userData.isLocalPlayer && explorer.userData.weapon) { explorer.userData.weapon.rotation.x = -0.12; explorer.userData.weapon.rotation.z = 0; }
    if (combatStatus && message) combatStatus.textContent = message + ' Any shells already inserted remain loaded.';
  }
  async function requestReloadRounds(rounds) {
    const r = await fetch(API + '/api/homefront/world/reload', { method: 'POST', headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: JSON.stringify({ rounds }) });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.message || data.error || 'reload_failed');
    updateWorld(data);
    return data;
  }
  function scheduleReloadStep(state) {
    if (reloadState !== state) return;
    const shotgun = state.weaponId === 'pump_shotgun';
    reloadTimer = setTimeout(async () => {
      if (reloadState !== state) return;
      moving = true;
      try {
        const data = await requestReloadRounds(shotgun ? 1 : state.capacity);
        if (reloadState !== state) return;
        state.loaded += data.reloaded || 0;
        if (combatStatus) combatStatus.textContent = (shotgun ? 'Inserted shell ' + state.loaded + '. ' : 'Magazine seated. ') + 'Magazine ' + data.selfWeaponMagazine.loaded + '/' + data.selfWeaponMagazine.capacity + ' · reserve ' + data.selfInventory.ammo + '.';
        if (shotgun && state.loaded < state.capacity && data.selfInventory.ammo > 0 && data.selfWeaponMagazine.loaded < state.capacity) {
          state.shellStartedAt = performance.now();
          sfx.reloadWeapon('shotgun');
          scheduleReloadStep(state);
        } else {
          clearReloadTimers(); reloadState = null;
          if (reloadWeaponButton) { reloadWeaponButton.textContent = 'Reload magazine'; reloadWeaponButton.disabled = !worldData?.self; }
          if (combatStatus) combatStatus.textContent = 'Reload complete. Magazine ' + data.selfWeaponMagazine.loaded + '/' + data.selfWeaponMagazine.capacity + ' · reserve ' + data.selfInventory.ammo + '.';
        }
      } catch (e) {
        if (reloadState === state) {
          clearReloadTimers(); reloadState = null;
          if (reloadWeaponButton) { reloadWeaponButton.textContent = 'Reload magazine'; reloadWeaponButton.disabled = !worldData?.self; }
          if (combatStatus) combatStatus.textContent = e.message === 'no_reserve_ammo' ? 'Reload stopped: no reserve ammunition. Inserted shells remain loaded.' : 'Reload failed: ' + e.message;
        }
      } finally { moving = false; }
    }, shotgun ? 680 : 2250);
  }
  function reloadWeapon() {
    if (!token() || moving || reloadState) { if (combatStatus && !token()) combatStatus.textContent = 'Sign in and enter an expedition before reloading.'; return; }
    const magazine = worldData?.selfWeaponMagazine;
    const weaponId = equippedWeaponId;
    if (!['pump_shotgun', 'marksman_rifle'].includes(weaponId)) { if (combatStatus) combatStatus.textContent = 'This melee weapon does not use ammunition.'; return; }
    if (magazine?.loaded >= magazine?.capacity) { if (combatStatus) combatStatus.textContent = 'Magazine is already full.'; return; }
    if (!(worldData?.selfInventory?.ammo > 0)) { if (combatStatus) combatStatus.textContent = 'No reserve ammunition. Pack or scavenge more ammo.'; return; }
    const shotgun = weaponId === 'pump_shotgun';
    reloadState = { weaponId, startedAt: performance.now(), shellStartedAt: performance.now(), capacity: magazine?.capacity || (shotgun ? 6 : 5), loaded: 0 };
    if (reloadWeaponButton) { reloadWeaponButton.disabled = true; reloadWeaponButton.textContent = shotgun ? 'Loading shells…' : 'Reloading rifle…'; }
    if (combatStatus) combatStatus.textContent = shotgun ? 'Reloading shotgun one shell at a time. Combat or movement can interrupt.' : 'Reloading marksman rifle. Combat or movement can interrupt.';
    sfx.reloadWeapon(shotgun ? 'shotgun' : 'marksman_rifle');
    reloadUiTimer = setInterval(() => {
      if (!reloadState) return;
      if (reloadWeaponButton) reloadWeaponButton.textContent = shotgun ? 'Loading shell ' + Math.min(reloadState.capacity, reloadState.loaded + 1) + '/' + reloadState.capacity + '…' : 'Reloading rifle ' + Math.min(99, Math.floor((performance.now() - reloadState.startedAt) / 2250 * 100)) + '%';
    }, 100);
    scheduleReloadStep(reloadState);
  }
  if (reloadWeaponButton) reloadWeaponButton.addEventListener('click', reloadWeapon);
  async function requestAimState(value) {
    const r = await fetch(API + '/api/homefront/world/aim', { method: 'POST', headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: JSON.stringify({ aiming: value }) });
    const data = await r.json();
    if (!r.ok || data.error) throw new Error(data.message || data.error || 'aim_state_failed');
    return data;
  }
  if (aimWeaponButton) aimWeaponButton.addEventListener('click', async () => {
    if (aimWeaponButton.disabled || moving || reloadState || !token()) return;
    const desired = !aiming;
    moving = true; stopAutoFire();
    try {
      const data = await requestAimState(desired);
      updateWorld(data);
      aiming = desired;
      authoritativeAimStability = null;
      if (aiming) aimRecoveryUntil = Math.max(aimRecoveryUntil, performance.now());
      if (combatStatus) combatStatus.textContent = aiming ? 'Aiming: server-confirmed ADS is building. Marksman rifle steadies slowest; travel and sprinting disrupt precision.' : 'Weapon lowered. Sprinting and travel are available.';
    } catch (e) {
      if (combatStatus) combatStatus.textContent = e.message === 'aim_recovering_from_movement' ? 'Recovering from movement before aiming.' : 'Could not change aim stance: ' + e.message;
    } finally {
      moving = false;
      if (worldData) {
        const active = worldData.selfEncounter || worldData.encounter || null;
        const self = worldData.self;
        const distance = active && self ? Math.hypot(self.x-active.x,self.z-active.z) : Infinity;
        if (aimWeaponButton) aimWeaponButton.disabled = !self || !active || selectedCombatTargetId !== active.id || distance > (active.range || 0) || !!reloadState;
        if (autoFireButton) autoFireButton.disabled = !self || !active || selectedCombatTargetId !== active.id || active.defeated || active.hp <= 0 || distance > (active.range || 0);
      }
    }
  });
  if (sprintTravelButton) sprintTravelButton.addEventListener('click', () => {
    if (moving || reloadState) return;
    sprintTravel = !sprintTravel;
    sprintTravelButton.setAttribute('aria-pressed', String(sprintTravel));
    sprintTravelButton.textContent = sprintTravel ? 'Sprint travel: ON' : 'Sprint travel: OFF';
    if (combatStatus) combatStatus.textContent = sprintTravel ? 'Sprint enabled: longer travel steps cost extra stamina and delay weapon accuracy recovery.' : 'Sprint disabled: normal travel pace.';
  });
  async function damageSelectedEnvironment() {
    if (!selectedEnvironmentId || moving || !token()) return;
    const selected = (worldData?.world?.environmentStructures || []).find(item => item.id === selectedEnvironmentId);
    if (!selected || !worldData?.self || Math.hypot(worldData.self.x - selected.x, worldData.self.z - selected.z) > 8) {
      if (combatStatus) combatStatus.textContent = 'Move within 8 units of the selected structure before striking it.';
      return;
    }
    moving = true;
    if (damageEnvironmentButton) damageEnvironmentButton.disabled = true;
    try {
      const response = await fetch(API + '/api/homefront/world/environment/damage', { method: 'POST', headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: JSON.stringify({ structureId: selectedEnvironmentId }) });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.message || data.error || 'environment_damage_failed');
      updateWorld(data);
      const state = data.environmentDamage;
      if (combatStatus) combatStatus.textContent = state ? (state.kind || 'Structure') + ' · ' + state.stage + ' · integrity ' + state.health + '/' + state.maxHealth : 'Structure damaged.';
    } catch (error) {
      if (combatStatus) combatStatus.textContent = error.message === 'environment_structure_out_of_range' ? 'Too far away. Move within 8 units to strike this structure.' : 'Could not damage structure: ' + error.message;
    } finally {
      moving = false;
      if (damageEnvironmentButton && worldData) {
        const selected = (worldData.world?.environmentStructures || []).find(item => item.id === selectedEnvironmentId);
        damageEnvironmentButton.disabled = !selected || !worldData.self || Math.hypot(worldData.self.x - selected.x, worldData.self.z - selected.z) > 8;
      }
    }
  }
  if (damageEnvironmentButton) damageEnvironmentButton.addEventListener('click', damageSelectedEnvironment);
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
  const groundHit = ground;
  renderer.domElement.addEventListener('pointerdown', e => {
    if (e.button === 2 || cameraOrbiting || !worldData?.self || moving) return;
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
    const environmentHits = raycaster.intersectObjects([...environmentVisuals.values()].filter(group => group.visible), true);
    if (environmentHits.length) {
      let target = environmentHits[0].object;
      while (target && !target.userData?.environmentId) target = target.parent;
      if (target?.userData?.environmentId) {
        selectedEnvironmentId = target.userData.environmentId;
        const state = (worldData.world?.environmentStructures || []).find(item => item.id === selectedEnvironmentId);
        const distance = state ? Math.hypot(worldData.self.x - state.x, worldData.self.z - state.z) : Infinity;
        if (combatStatus) combatStatus.textContent = state ? state.kind + ' selected · ' + state.stage + ' · ' + Math.ceil(distance) + ' units away.' : 'Structure selected. Move closer to interact.';
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
    const hits = raycaster.intersectObject(groundHit, false);
    if (!hits.length) return;
    moveTo(Math.max(-100, Math.min(100, hits[0].point.x)), Math.max(-100, Math.min(100, hits[0].point.z)));
  });
  async function moveTo(x, z) {
    if (reloadState) cancelReload('Reload interrupted by movement.');
    aiming = false;
    if (aimWeaponButton) { aimWeaponButton.setAttribute('aria-pressed', 'false'); aimWeaponButton.textContent = 'Aim weapon'; }
    aimRecoveryUntil = performance.now() + (sprintTravel ? 1800 : 900);
    lastTravelAt = performance.now();
    moving = true; if (status) status.textContent = 'Moving through the shared Graveyard…';
    try {
      if (sprintTravel && worldData?.selfWeaponHandling?.aiming) {
        const lowered = await requestAimState(false);
        updateWorld(lowered);
        aiming = false;
      }
      const r = await fetch(API + '/api/homefront/world/move', { method: 'POST', headers: { authorization: 'Bearer ' + token(), 'content-type': 'application/json' }, body: JSON.stringify({ x, z, sprint: sprintTravel }) });
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
  // Homefront's master view is third-person by default. V toggles a high tactical overview
  // without changing authoritative movement or world state.
  let masterView = 'third-person';
  let cameraYawOffset = 0;
  let cameraPitchOffset = 0;
  let cameraDistance = 6.2;
  let cameraOrbiting = false;
  let cameraPointerId = null;
  renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());
  renderer.domElement.addEventListener('pointerdown', event => {
    if (event.button !== 2 || masterView !== 'third-person') return;
    cameraOrbiting = true; cameraPointerId = event.pointerId;
    try { renderer.domElement.setPointerCapture(event.pointerId); } catch {}
    event.preventDefault();
  });
  renderer.domElement.addEventListener('pointermove', event => {
    if (!cameraOrbiting || event.pointerId !== cameraPointerId) return;
    cameraYawOffset += event.movementX * 0.006;
    cameraPitchOffset = Math.max(-0.25, Math.min(0.45, cameraPitchOffset - event.movementY * 0.004));
  });
  const stopCameraOrbit = event => {
    if (!cameraOrbiting || (event && event.pointerId !== cameraPointerId)) return;
    cameraOrbiting = false; cameraPointerId = null;
  };
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) renderer.domElement.addEventListener(eventName, stopCameraOrbit);
  window.addEventListener('blur', () => stopCameraOrbit());
  renderer.domElement.addEventListener('wheel', event => {
    if (masterView !== 'third-person') return;
    cameraDistance = Math.max(3.5, Math.min(10.5, cameraDistance + Math.sign(event.deltaY) * 0.65));
    event.preventDefault();
  }, { passive: false });
  window.addEventListener('keydown', event => {
    if (event.key.toLowerCase() !== 'v' || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (target && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName))) return;
    masterView = masterView === 'third-person' ? 'tactical' : 'third-person';
    if (status) status.textContent = masterView === 'third-person'
      ? 'Third-person · click ground to travel · right-drag to orbit · scroll to zoom · V for tactical overview.'
      : 'Tactical overview · click ground to travel · press V for third-person view.';
  });
  let lastFrame = performance.now();
  const tick = () => { const now = performance.now(), dt = Math.min(0.05, (now - lastFrame) / 1000); lastFrame = now; for (let i = 0; i < ashCount; i++) { const j = i * 3; ashPositions[j + 1] -= dt * (0.35 + (i % 7) * 0.09); ashPositions[j] += Math.sin(now * 0.0003 + i) * dt * 0.12; if (ashPositions[j + 1] < 0) { ashPositions[j + 1] = 12 + (i % 9); ashPositions[j] = ashRandom(i + 1) * 190 - 95; ashPositions[j + 2] = ashRandom(i + 201) * 190 - 95; } } ashGeometry.attributes.position.needsUpdate = true; for (const node of lootGroup.children) { const focus = node.userData.lootGlow; if (!focus) continue; const selected = node.userData.lootNodeId === selectedLootId; const pulse = 1 + Math.sin(now * 0.006) * 0.055; focus.mesh.scale.setScalar(selected ? pulse : 1); focus.mesh.material.color.setHex(selected ? 0xffe08a : focus.color); focus.mesh.material.opacity = focus.available ? (selected ? 0.95 : 0.8) : 0.2; } const recovery = now < aimRecoveryUntil ? Math.max(0, (aimRecoveryUntil - now) / 1250) : 0; const targetStability = aiming ? 1 - recovery * 0.58 : 1 - recovery * 0.3; aimStability += (targetStability - aimStability) * (1 - Math.exp(-dt * (aiming ? 1.8 : 3.5))); if (aimStabilityStatus) aimStabilityStatus.textContent = 'Aim stability · ' + Math.round((authoritativeAimStability === null ? aimStability : Math.min(aimStability, authoritativeAimStability)) * 100) + '%' + (recovery > 0 ? ' · recovering' : aiming ? ' · focused' : ' · ready'); for (const mixer of zombieMixers) mixer.update(dt); for (const explorer of playerGroup.children) { const target = explorerPositions.get(explorer.userData.explorerKey); let movingAvatar = false; if (target) { const travelBlend = 1 - Math.exp(-8 * dt); explorer.position.x += (target.x - explorer.position.x) * travelBlend; explorer.position.y += (target.y - explorer.position.y) * travelBlend; explorer.position.z += (target.z - explorer.position.z) * travelBlend; movingAvatar = Math.hypot(target.x - explorer.position.x, target.z - explorer.position.z) > 0.035; if (movingAvatar) explorer.rotation.y = Math.atan2(target.x - explorer.position.x, target.z - explorer.position.z); } const bob = movingAvatar ? Math.abs(Math.sin(now * 0.014)) * 0.11 : Math.sin(now * 0.002 + (explorer.userData.isLocalPlayer ? 0 : 1)) * 0.018; for (const part of (explorer.userData.avatarParts || [])) part.object.position.y = part.baseY + bob; if (!explorer.userData.isLocalPlayer || !explorer.userData.weapon) continue; if (reloadState) { const phase = Math.max(0, Math.min(1, (now - reloadState.shellStartedAt) / (reloadState.weaponId === 'pump_shotgun' ? 680 : 2250))); if (reloadState.weaponId === 'pump_shotgun') { explorer.userData.weapon.rotation.x = -0.12 + Math.sin(phase * Math.PI) * 0.48; explorer.userData.weapon.rotation.z = 0.16 + Math.sin(phase * Math.PI) * 0.22; } else { const dip = Math.sin(phase * Math.PI); explorer.userData.weapon.rotation.x = -0.12 + dip * 0.62; explorer.userData.weapon.rotation.z = -0.08 - dip * 0.18; } continue; } const remaining = weaponSwingUntil - now; const progress = remaining > 0 ? Math.max(0, Math.min(1, (now - weaponSwingStartedAt) / 320)) : 0; if (remaining <= 0) { explorer.userData.weapon.rotation.x = aiming ? -0.42 : -0.12; explorer.userData.weapon.rotation.z = aiming ? -0.06 : 0; continue; } if (remaining <= 0) { explorer.userData.weapon.rotation.x = aiming ? -0.42 : -0.12; explorer.userData.weapon.rotation.z = aiming ? -0.06 : 0; continue; } if (weaponSwingWeaponId === 'pump_shotgun' || weaponSwingWeaponId === 'marksman_rifle') { const kick = progress < 0.2 ? progress / 0.2 : Math.max(0, 1 - (progress - 0.2) / 0.8); const strength = weaponSwingWeaponId === 'marksman_rifle' ? 0.62 : 0.46; explorer.userData.weapon.rotation.x = -0.12 - kick * strength; explorer.userData.weapon.rotation.z = kick * 0.045; } else if (weaponSwingWeaponId === 'shock_maul') { const arc = Math.sin(progress * Math.PI); explorer.userData.weapon.rotation.x = -0.12 + arc * 1.15; explorer.userData.weapon.rotation.z = arc * 0.2; } else { explorer.userData.weapon.rotation.x = -0.12 + Math.sin(progress * Math.PI) * 0.95; explorer.userData.weapon.rotation.z = Math.sin(progress * Math.PI) * 0.38; } } for (const piece of [...impactGroup.children]) { piece.userData.life -= dt; piece.position.x += piece.userData.vx * dt; piece.position.y += piece.userData.vy * dt; piece.position.z += piece.userData.vz * dt; piece.userData.vy -= 5.5 * dt; piece.rotation.x += dt * 5; piece.rotation.z += dt * 3; if (piece.userData.blood) piece.material.opacity = Math.max(0, piece.userData.life / 0.75); if (piece.userData.life <= 0 || piece.position.y < 0) { impactGroup.remove(piece); piece.geometry.dispose(); piece.material.dispose(); } } for (const actor of combatActors.values()) { const state = actor.userData; const blend = 1 - Math.exp(-3.5 * dt); const dx = state.targetX - actor.position.x, dz = state.targetZ - actor.position.z; actor.position.x += dx * blend; actor.position.z += dz * blend; actor.position.y = terrainElevation(actor.position.x, actor.position.z);
      const impactRemaining = state.impactUntil - now;
      if (impactRemaining > 0) {
        const p = impactRemaining / 300;
        const hitPulse = Math.sin(p * Math.PI);
        const headshot = state.impactStyle === 'headshot';
        actor.position.x += state.impactDirection * (state.impactStyle === 'blunt' ? 0.075 : headshot ? 0.065 : 0.045) * hitPulse;
        actor.rotation.z = (state.impactStyle === 'blunt' ? 0.22 : headshot ? 0.28 : 0.12) * hitPulse * state.impactDirection;
        state.body.scale.y = state.impactStyle === 'blunt' ? 1 - 0.18 * hitPulse : headshot ? 1 - 0.1 * hitPulse : 1;
      } else { actor.rotation.z = 0; state.body.scale.y = 1; }
      if (Math.hypot(dx, dz) > 0.08) actor.rotation.y = Math.atan2(dx, dz); const self = worldData?.self; const threatDistance = self ? Math.hypot(self.x - actor.position.x, self.z - actor.position.z) : Infinity; if (state.threatRing) { const pressure = threatDistance <= 3 ? 1 : threatDistance <= 8 ? 0.42 : 0.08; state.threatRing.material.opacity = pressure * (0.72 + 0.28 * Math.sin(now / 150)); state.threatRing.scale.setScalar(threatDistance <= 3 ? 1.18 : 1); } if (state.hitFlash > 0) { state.hitFlash = Math.max(0, state.hitFlash - dt); if (state.hitFlash === 0) { state.body.material.emissive?.setHex(0x000000); state.body.material.emissiveIntensity = 0; } } }
      // Shared Zombies selector/model pilot: at most eight nearby animated rigs, with procedural fallback.
      const localForModels = worldData?.self || { x: 0, z: 0 };
      const modelCandidates = [...combatActors.values()].map(actor => {
        const state = actor.userData;
        const distance = Math.hypot(localForModels.x - actor.position.x, localForModels.z - actor.position.z);
        const name = String(state.enemyType || '').toLowerCase();
        const crawler = /crawler|crawl/.test(name), runner = /runner|fast/.test(name), heavy = /brute|juggernaut|heavy|boss/.test(name);
        return { id: state.encounterId, x: actor.position.x, y: terrainElevation(actor.position.x, actor.position.z), z: actor.position.z, yaw: actor.rotation.y || 0, ty: crawler ? 5 : runner ? 1 : heavy ? 3 : 0, cr: crawler, ch: distance <= 2.7, hp: state.hp };
      });
      let modeledZombieIds = new Set();
      if (zombieModelPilot) modeledZombieIds = zombieModelPilot.update(modelCandidates, dt, localForModels);
      for (const actor of combatActors.values()) {
        const modeled = modeledZombieIds.has(actor.userData.encounterId);
        for (const proxy of [actor.userData.body, actor.userData.head]) {
          if (!proxy) continue;
          const opacity = modeled ? 0 : 1;
          if (proxy.material.opacity !== opacity || proxy.material.transparent !== modeled) {
            proxy.material.transparent = modeled;
            proxy.material.opacity = opacity;
            proxy.material.depthWrite = !modeled;
            proxy.material.needsUpdate = true;
          }
        }
      }
      if (worldData?.self) {
      const self = worldData.self;
      if (zombieAudioStarted) {
        const survival = worldData.selfSurvival || {};
        const localActor = playerGroup.children.find(actor => actor.userData.isLocalPlayer);
        const audioMe = { x: self.x, y: terrainElevation(self.x, self.z), z: self.z, yaw: localActor?.rotation.y || 0, hp: Number.isFinite(survival.health) ? survival.health : 100, max: 100, alive: survival.health !== 0, down: survival.health === 0 };
        const audioZombies = (worldData.encounters || []).filter(e => !e.defeated && e.hp > 0).map(e => ({ id: e.id, x: e.x, y: terrainElevation(e.x, e.z), z: e.z, ty: /brute|juggernaut|heavy/i.test(e.enemy || '') ? 3 : /crawler|runner/i.test(e.enemy || '') ? 4 : 0, hp: e.hp, out: false }));
        zombieAudio.tick(dt, audioMe, audioZombies, [], 'homefront-local-player');
      }
      updateVisibleChunks(self.x, self.z);
      const localActor = playerGroup.children.find(actor => actor.userData.isLocalPlayer);
      const heading = (localActor?.rotation.y || 0) + cameraYawOffset;
      const followBlend = 1 - Math.exp(-dt * (masterView === 'third-person' ? 6.5 : 2.8));
      const targetY = terrainElevation(self.x, self.z) + 1.45;
      const distance = masterView === 'third-person' ? cameraDistance : 48;
      const height = masterView === 'third-person' ? Math.max(1.5, Math.min(6, 3.1 + cameraPitchOffset * 6)) : 30;
      const desiredX = self.x - Math.sin(heading) * distance;
      const desiredZ = self.z - Math.cos(heading) * distance;
      camera.position.x += (desiredX - camera.position.x) * followBlend;
      camera.position.y += (targetY + height - camera.position.y) * followBlend;
      camera.position.z += (desiredZ - camera.position.z) * followBlend;
      camera.lookAt(self.x, targetY + (masterView === 'third-person' ? 0.45 : 0), self.z);
    }
    renderer.render(scene, camera); requestAnimationFrame(tick); };
  // Load shared animated rigs asynchronously; failure never disables combat or fallback hitboxes.
  zombieModelPilotLoading = true;
  createZombieModelPilot(scene, { targetHeight: 2.7 }).then(pilot => {
    zombieModelPilot = pilot;
    zombieModelPilotLoading = false;
    console.info('[homefront-graveyard] shared animated infected ready');
  }).catch(error => {
    zombieModelPilotFailed = true;
    zombieModelPilotLoading = false;
    console.warn('[homefront-graveyard] animated infected unavailable; using procedural infected', error);
  });
  tick(); loadInfectedAsset(); fetchWorld(); setInterval(fetchWorld, 8000);
}
