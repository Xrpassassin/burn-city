// Three.js shared XRPL Graveyard scene for Homefront.
// Uses the existing Homefront world API as authority; this module owns presentation only.
import * as THREE from './vendor/three.module.min.js';

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
  const poiGroup = new THREE.Group(), playerGroup = new THREE.Group(), cityGroup = new THREE.Group();
  scene.add(cityGroup, poiGroup, playerGroup);

  const mat = (color, roughness = 0.94) => new THREE.MeshStandardMaterial({ color, roughness });
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
  let worldData = null, moving = false;
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
    clearGroup(poiGroup); markerObjects.clear();
    for (const p of (data.world?.pointsOfInterest || [])) {
      buildPOI(p);
      const marker = markerObjects.get(p.id);
      if (p.type === 'cache' && data.world?.caches?.[p.id]?.readyAt > Date.now()) marker.children[0].material.color.setHex(0x77716b);
      if (p.type === 'rescue' && data.world?.rescues?.[p.id]?.readyAt > Date.now()) marker.children[0].material.color.setHex(0x77716b);
    }
    clearGroup(playerGroup);
    for (const p of (data.players || [])) {
      const g = new THREE.Group(); g.position.set(p.x, 0, p.z);
      const color = p.label === 'You' ? 0xffdf83 : p.party ? 0x8fd4f4 : 0xd7d1c5;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, 1.2, 3, 6), mat(color));
      body.position.y = 1.45; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 6), mat(p.label === 'You' ? 0xffb45c : 0xc5aa8a));
      head.position.y = 2.55; g.add(head);
      const name = labelSprite(p.label || 'Explorer', p.label === 'You' ? '#ffe28a' : '#c8d8df'); name.position.y = 4.7; g.add(name);
      playerGroup.add(g);
    }
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
  const groundHit = new THREE.Mesh(new THREE.PlaneGeometry(204, 204), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
  groundHit.rotation.x = -Math.PI / 2; groundHit.position.y = 0.01; scene.add(groundHit);
  renderer.domElement.addEventListener('pointerdown', e => {
    if (!worldData?.self || moving || (worldData.party && !worldData.party.leader)) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = (e.clientX - rect.left) / rect.width * 2 - 1;
    pointer.y = -(e.clientY - rect.top) / rect.height * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
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
  const tick = () => { renderer.render(scene, camera); requestAnimationFrame(tick); };
  tick(); fetchWorld(); setInterval(fetchWorld, 8000);
}
