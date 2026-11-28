import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SHIP_MODEL, PIER_START, shipDeckY, findPartyBargeBerth, partyBargeBlocksBoat } from './pirate-party-barge-layout.mjs';

const assets = new URL('../assets/bar/', import.meta.url);
const shipAssets = new URL('../assets/ship/', import.meta.url);
const track = new URL('../music/burn-city-lives.mp3', import.meta.url);
const material = (color, emissive = 0) => new THREE.MeshStandardMaterial({
  color, roughness: .8, emissive, emissiveIntensity: emissive ? .65 : 0,
});
const wood = material(0x38251c), oak = material(0x966339), gold = material(0xdca156);
const lamp = material(0xffb75c, 0xff8d27), iron = material(0x211a22);
const partyLights = [material(0xff3e9c, 0xff1463), material(0x27cdfc, 0x07a1ed)];
const coats = [material(0x572e30), material(0x283f48), material(0x3d392a)];
const skin = material(0xb58b68);
const geometry = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

function batches(group) {
  const byMaterial = new Map();
  return {
    add(mat, geo) {
      if (!byMaterial.has(mat)) byMaterial.set(mat, []);
      byMaterial.get(mat).push(geo);
    },
    build() {
      for (const [mat, parts] of byMaterial) {
        group.add(new THREE.Mesh(mergeGeometries(parts), mat));
        for (const part of parts) part.dispose();
      }
    },
  };
}

function sign(group, text, x, y, z, yaw, width = 6) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#20151d';
  ctx.fillRect(0, 0, 512, 96);
  ctx.strokeStyle = ctx.fillStyle = '#ffcd80';
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, 504, 88);
  ctx.font = 'bold 40px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText(text, 256, 62, 480);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, width * 96 / 512),
    new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, toneMapped: false }));
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  group.add(mesh);
}

// Glowing skull-and-crossbones decal for the black sails (transparent, unlit).
function skullDecal(size) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = ctx.fillStyle = '#f3dcb4';
  ctx.lineWidth = 20;
  ctx.lineCap = 'round';
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(60, 160 + k * 46);
    ctx.lineTo(196, 160 - k * 46);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.ellipse(128, 100, 58, 54, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(97, 118, 62, 44);
  ctx.fillStyle = '#1a1216';
  for (const x of [106, 150]) {
    ctx.beginPath();
    ctx.ellipse(x, 104, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillRect(122, 128, 12, 14);
  for (const x of [111, 128, 145]) ctx.fillRect(x - 3, 150, 6, 12);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: .4, side: THREE.DoubleSide, toneMapped: false, color: 0xd8c4a0 }));
}

// Soft additive light pool on the deck (used instead of real lights on phones).
let poolTexture = null;
function glowPool(color, radius, x, y, z) {
  if (!poolTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,.85)');
    gradient.addColorStop(.45, 'rgba(255,255,255,.32)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    poolTexture = new THREE.CanvasTexture(canvas);
  }
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: poolTexture, color, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  mesh.position.set(x, y + .1, z);
  mesh.renderOrder = 2;
  return mesh;
}

function buildPier(group, berth) {
  const pier = new THREE.Group();
  pier.name = 'Blacktide gangway';
  pier.position.set(berth.shore.x, 0, berth.shore.z);
  pier.rotation.y = berth.yaw;
  group.add(pier);
  const pieces = batches(pier);
  const h = berth.pierHeight;
  // Plank the walkway in 2 m tilted segments so it follows pierHeight exactly.
  for (let z = PIER_START; z < berth.pierEnd; z += 2) {
    const z1 = Math.min(berth.pierEnd, z + 2), y0 = h(z), y1 = h(z1), run = z1 - z;
    pieces.add(oak, new THREE.BoxGeometry(4, .24, Math.hypot(run, y1 - y0) + .05)
      .translate(0, -.12, 0).rotateX(-Math.atan2(y1 - y0, run)).translate(0, (y0 + y1) / 2, (z + z1) / 2));
  }
  for (let z = PIER_START + 1; z < berth.pierEnd; z += 6) {
    const y = h(z);
    for (const x of [-2, 2]) {
      pieces.add(wood, geometry(.34, y + 1.2, .34, x, (y + 1.2) / 2 - .4, z));
      pieces.add(lamp, geometry(.38, .4, .38, x, y + 1.05, z));
    }
  }
  for (const x of [-2.05, 2.05]) {
    for (let z = PIER_START; z < berth.pierEnd; z += 2) {
      const z1 = Math.min(berth.pierEnd, z + 2), y0 = h(z) + .95, y1 = h(z1) + .95;
      pieces.add(gold, new THREE.BoxGeometry(.14, .14, Math.hypot(z1 - z, y1 - y0) + .05)
        .rotateX(-Math.atan2(y1 - y0, z1 - z)).translate(x, (y0 + y1) / 2, (z + z1) / 2));
    }
    pieces.add(wood, geometry(.3, 4.6, .3, x * 1.15, 2.3, PIER_START + .5));
    pieces.add(lamp, geometry(.4, .45, .4, x * 1.15, 4.7, PIER_START + .5));
  }
  pieces.add(oak, geometry(5.4, .2, .24, 0, 3.4, PIER_START + .5));
  pieces.build();
  sign(pier, 'BLACKTIDE PARTY SHIP', 0, 3.9, PIER_START + .36, Math.PI, 5.6);
}

// Deck furniture in the ship's local frame (z forward, x toward the lake side when shoreSign = 1).
function buildDeck(root, berth, shoreSign, Y) {
  const S = berth.scale, rail = SHIP_MODEL.deckHalf * S, boardZ = SHIP_MODEL.boardF * S;
  const pieces = batches(root);
  const block = (mat, ...d) => pieces.add(mat, geometry(...d));
  const barX = shoreSign * (rail - 5), barZ = boardZ - 2;
  block(wood, 1.35, 1.05, 10, barX, Y + .525, barZ);
  block(gold, 1.6, .13, 10.2, barX, Y + 1.1, barZ);
  for (let i = 0; i < 4; i++) {
    pieces.add(wood, new THREE.CylinderGeometry(.58, .5, .94, 10).translate(barX - shoreSign * 2.4, Y + .47, barZ - 3.6 + i * 2.4));
  }
  // Dance floor: glowing tiles around the gangway landing's centreline.
  for (let ix = -3; ix <= 3; ix++) for (let iz = -3; iz <= 3; iz++) {
    if ((ix + iz) % 2) continue;
    block(partyLights[(ix + 9) % 2], 1.6, .06, 1.6, ix * 1.7 - shoreSign * 3, Y + .04, boardZ + 3 + iz * 1.7);
  }
  for (const z of [boardZ - 12, boardZ + 9]) for (const x of [-rail + 2, rail - 2]) {
    block(iron, .25, 3.2, .25, x, Y + 1.6, z);
    block(lamp, .7, .8, .7, x, Y + 3.4, z);
  }
  pieces.build();
  sign(root, 'EMBER BAR', barX + shoreSign * 2.2, Y + 3.2, barZ, -shoreSign * Math.PI / 2, 6);
  return { bar: [barX - shoreSign * 1.1, barZ], dance: [-shoreSign * 3, boardZ + 3], barX, barZ };
}

function makePirate(coat, phase, x, y, z) {
  const root = new THREE.Group();
  root.position.set(x, y, z);
  const pieces = batches(root);
  pieces.add(coat, geometry(.6, .78, .38, 0, .93, 0));
  for (const side of [-1, 1]) {
    pieces.add(coat, new THREE.BoxGeometry(.22, .63, .22).rotateZ(-side * .18).translate(side * .4, .9, 0));
    pieces.add(iron, geometry(.24, .52, .31, side * .18, .26, .025));
  }
  pieces.add(skin, new THREE.SphereGeometry(.22, 8, 6).translate(0, 1.46, 0));
  pieces.add(iron, geometry(.65, .075, .49, 0, 1.62, 0));
  pieces.add(iron, geometry(.4, .16, .32, 0, 1.72, 0));
  pieces.add(gold, geometry(.43, .04, .34, 0, 1.67, 0));
  pieces.build();
  return { root, phase, y };
}

// Reuse a pre-added PointLight from `slots` (window.__city.lightSlots) when one is free; a brand-new light
// would change the scene's light count and recompile every lit material in the city.
export function partyLight(slots, color, intensity, distance, decay) {
  const light = slots?.length ? slots.shift() : new THREE.PointLight();
  light.color.set(color);
  light.intensity = intensity;
  light.distance = distance;
  light.decay = decay;
  return light;
}

export function createPiratePartyBarge({ scene, lake, shoreAt, decks, colliders, low, announce, lightSlots }) {
  const { dir, side, inLake } = lake;
  const berth = findPartyBargeBerth({ shoreAt, inLake, dir, side, decks, colliders });
  if (!berth) return null;
  const { site, scale: S, deckY: Y } = berth;
  const group = new THREE.Group();
  group.name = 'Blacktide Pirate Ship';
  const root = new THREE.Group();
  root.position.set(berth.origin.x, 0, berth.origin.z);
  root.rotation.y = berth.shipYaw;
  group.add(root);
  root.updateMatrixWorld(true);
  const localX = new THREE.Vector3(1, 0, 0).transformDirection(root.matrixWorld);
  const shoreSign = localX.x * dir.x + localX.z * dir.z > 0 ? 1 : -1;  // +1: local +x points out into the lake

  // The galleon itself (Quaternius Pirate Kit "Ship_Large", CC0), sails re-dyed black.
  const ship = new THREE.Group();
  ship.name = 'Blacktide galleon';
  ship.rotation.y = Math.PI / 2;           // model bow (-x) -> local +z
  ship.scale.setScalar(S);
  ship.position.y = -SHIP_MODEL.waterY * S;
  root.add(ship);
  new GLTFLoader().loadAsync(new URL(low ? 'blacktide-ship-lo.glb' : 'blacktide-ship.glb', shipAssets).href).then(gltf => {
    gltf.scene.traverse(o => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = !low;
          });
    ship.add(gltf.scene);
  }).catch(error => console.warn('blacktide ship', error));
  for (const [x, yaw] of [[.92, -Math.PI / 2], [1.95, Math.PI / 2]]) {
    const skull = skullDecal(2.3);
    skull.position.set(x, 5.5, 0);
    skull.rotation.y = yaw;
    ship.add(skull);
  }

  buildPier(group, berth);
  const deck = buildDeck(root, berth, shoreSign, Y);
  const boardZ = SHIP_MODEL.boardF * S;
  if (low) {
    // Phones: no extra real-time light. A PointLight here would join every lit material's shader
    // city-wide (one recompile when the lake loads, plus per-pixel cost everywhere), so fake the pools.
    root.add(glowPool(0xffc381, 7, deck.barX - shoreSign * 2, Y, deck.barZ), glowPool(0xadabff, 7.5, ...[deck.dance[0], Y, deck.dance[1]]));
  } else {
    // Borrow the city's reserved light slots so the scene's light count never changes (no city-wide shader recompile).
    const barLight = partyLight(lightSlots, 0xffc381, 120, 30, 1.7);
    barLight.position.set(deck.barX - shoreSign * 2, Y + 6, deck.barZ);
    const danceLight = partyLight(lightSlots, 0xadabff, 110, 26, 1.7);
    danceLight.position.set(deck.dance[0], Y + 6, deck.dance[1]);
    root.add(barLight, danceLight);
  }
  scene.add(group);
  decks.push(...berth.decks);

  const toWorld = (x, y, z) => root.localToWorld(new THREE.Vector3(x, y, z));
  // Solid furniture: the bar, the barrel stools, and both masts (tall, so they stop fliers too).
  for (let dz = -4.5; dz <= 4.5; dz += 1.5) {
    const p = toWorld(deck.barX, Y, deck.barZ + dz);
    colliders.push({ x: p.x, z: p.z, r: .75, h: Y + 1.2, nc: true });
  }
  for (const f of [SHIP_MODEL.mainMastF, SHIP_MODEL.foreMastF]) {
    const p = toWorld(0, 0, f * S);
    colliders.push({ x: p.x, z: p.z, r: .16 * S, h: 11 * S, nc: true });
  }

  const pirates = [];
  const count = low ? 10 : 24;
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2, r = 7 + (i % 3) * 1.6;
    const p = makePirate(coats[i % coats.length], i * 1.7, deck.dance[0] + Math.cos(a) * r, Y, deck.dance[1] + Math.sin(a) * r * .8);
    p.yaw = Math.atan2(-Math.cos(a), -Math.sin(a) * .8);
    root.add(p.root);
    pirates.push(p);
  }

  const characters = [];
  let loading = false;
  function loadCharacters() {
    if (loading) return;
    loading = true;
    const manager = new THREE.LoadingManager();
    if (low) manager.setURLModifier(url => url.replace(/-tex\//, '-tex-512/'));
    const loader = new GLTFLoader(manager);
    const helmZ = -3.95 * S;
    for (const [id, x, y, z, angle] of [['pirate', deck.barX + shoreSign * 1.15, Y, deck.barZ, -shoreSign * Math.PI / 2],
      ['blackbeard', 0, shipDeckY(helmZ / S, S), helmZ, 0]]) {
      const url = new URL(id + (low ? '-lo' : '') + '.gltf', assets);
      loader.loadAsync(url.href).then(gltf => {
        const model = gltf.scene;
        model.name = id === 'pirate' ? 'Ember Bar bartender' : 'Blackbeard';
        model.position.set(x, y, z);
        model.rotation.y = angle;
        root.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const idle = gltf.animations.find(a => /idle/i.test(a.name));
        if (idle) mixer.clipAction(idle).play();
        characters.push({ id, model, mixer, y });
      }).catch(error => console.warn('party barge character', id, error));
    }
  }

  const audio = new Audio(track.href);
  audio.loop = true;
  audio.preload = 'none';
  let music = false;
  function playMusic() {
    audio.play().catch(error => {
      if (error.name !== 'AbortError') music = false;
    });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
  });
  let elapsed = 0;
  let cheer = 0;
  const bar = toWorld(deck.bar[0], Y, deck.bar[1]);
  const danceFloor = toWorld(deck.dance[0], Y, deck.dance[1]);
  function interact(pos) {
    if (Math.abs(pos.y - Y) > 1.25) return null;
    const barDistance = Math.hypot(pos.x - bar.x, pos.z - bar.z);
    if (barDistance < 2.7) return {
      d: barDistance, label: 'Toast with the bartender',
      act: () => {
        if (cheer > 0) return;
        cheer = 1.5;
        announce?.('Bartender · To fair winds and full mugs!');
      },
    };
    const danceDistance = Math.hypot(pos.x - danceFloor.x, pos.z - danceFloor.z);
    if (danceDistance < 4) return {
      d: danceDistance, label: music ? 'Stop party music' : 'Play party music',
      act: () => {
        music = !music;
        if (!music) audio.pause();
        else {
          audio.volume = .2;
          playMusic();
        }
      },
    };
    return null;
  }

  function update(dt, camera, active) {
    elapsed += dt;
    cheer = Math.max(0, cheer - dt);
    const distance = Math.hypot(camera.x - site.x, camera.z - site.z);
    if (music) {
      audio.volume = active && !document.hidden ? .22 * Math.max(0, 1 - distance / 90) : 0;
      if (audio.volume === 0 && !audio.paused) audio.pause();
      if (audio.volume > 0 && audio.paused) playMusic();
    }
    if (distance > 320) return;
    loadCharacters();
    for (const character of characters) {
      character.mixer.update(dt);
      if (character.id === 'pirate') character.model.position.y =
        character.y + (cheer > 0 ? Math.abs(Math.sin(cheer * Math.PI * 2)) * .32 : 0);
    }
    for (const { root: pirate, phase, y, yaw } of pirates) {
      pirate.rotation.y = yaw + Math.sin(elapsed * .8 + phase) * .7;
      pirate.position.y = y + Math.max(0, Math.sin(elapsed * (music ? 6 : 2) + phase)) * (music ? .17 : .045);
    }
  }
  return { root, site, berth, pirates, characters, interact, update, blocksBoat: (x, z) => partyBargeBlocksBoat(berth, x, z) };
}
