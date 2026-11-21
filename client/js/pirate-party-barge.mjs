import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BARGE_DECK_Y, PIER_START, PIER_RAMP_END, findPartyBargeBerth, partyBargeBlocksBoat } from './pirate-party-barge-layout.mjs';

const assets = new URL('../assets/bar/', import.meta.url);
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

function mainsail() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#64283b';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#d3a574';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, 236, 236);
  ctx.lineWidth = 11;
  ctx.lineCap = 'round';
  for (const k of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(83, 145 + k * 31);
    ctx.lineTo(173, 145 - k * 31);
    ctx.stroke();
  }
  ctx.fillStyle = '#f0cc9f';
  ctx.beginPath();
  ctx.ellipse(128, 104, 41, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(106, 117, 44, 32);
  ctx.fillStyle = '#422035';
  for (const x of [113, 143]) {
    ctx.beginPath();
    ctx.ellipse(x, 108, 8, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.PlaneGeometry(14.5, 11, 10, 8);
  const vertices = mesh.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const x = vertices.getX(i) / 7.25, y = vertices.getY(i) / 5.5;
    vertices.setZ(i, -1.9 * (1 - x * x) * (1 - .78 * y * y));
  }
  mesh.computeVertexNormals();
  const sail = new THREE.Mesh(mesh, new THREE.MeshStandardMaterial({
    map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: .26, roughness: .95, side: THREE.DoubleSide,
  }));
  sail.position.set(0, 16, 9.48);
  return sail;
}

// Soft additive light pool on the deck (used instead of real lights on phones).
let poolTexture = null;
function glowPool(color, radius, x, z) {
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
  mesh.position.set(x, BARGE_DECK_Y + .1, z);
  mesh.renderOrder = 2;
  return mesh;
}

function buildPier(group, berth) {
  const pier = new THREE.Group();
  pier.name = 'Blacktide boarding pier';
  pier.position.set(berth.shore.x, 0, berth.shore.z);
  pier.rotation.y = berth.yaw;
  group.add(pier);
  const pieces = batches(pier);
  const rise = BARGE_DECK_Y;
  const run = PIER_RAMP_END - PIER_START;
  const tilt = -Math.atan2(rise, run);
  pieces.add(oak, new THREE.BoxGeometry(4, .24, Math.hypot(run, rise))
    .translate(0, -.12, 0).rotateX(tilt).translate(0, rise / 2, (PIER_RAMP_END + PIER_START) / 2));
  const length = berth.pierEnd - PIER_RAMP_END;
  pieces.add(oak, geometry(4, .24, length, 0, rise - .12, PIER_RAMP_END + length / 2));
  for (let z = PIER_START + 1; z < berth.pierEnd; z += 3) {
    const h = berth.pierHeight(z);
    for (const x of [-1.9, 1.9]) {
      pieces.add(wood, geometry(.28, h + .8, .28, x, (h - .8) / 2, z));
      pieces.add(lamp, geometry(.32, .35, .32, x, h + .4, z));
    }
  }
  for (const x of [-2.25, 2.25]) {
    pieces.add(wood, geometry(.26, 4.15, .26, x, 2.075, -2.5));
    pieces.add(lamp, geometry(.36, .4, .36, x, 4.15, -2.5));
  }
  pieces.add(oak, geometry(5.15, .18, .22, 0, 3.1, -2.5));
  pieces.build();
  sign(pier, 'BLACKTIDE PARTY BARGE', 0, 3.55, -2.64, Math.PI, 5.5);
}

function buildShip(root) {
  const pieces = batches(root);
  const block = (mat, ...dimensions) => pieces.add(mat, geometry(...dimensions));
  const shape = new THREE.Shape();
  shape.moveTo(-11.5, 24);
  shape.lineTo(11.5, 24);
  shape.lineTo(11.5, -22);
  shape.lineTo(7.8, -25.5);
  shape.lineTo(0, -29);
  shape.lineTo(-7.8, -25.5);
  shape.lineTo(-11.5, -22);
  shape.closePath();
  const hull = new THREE.ExtrudeGeometry(shape, { depth: BARGE_DECK_Y - .35, bevelEnabled: false });
  // Leave the hull cap below the planks to avoid coplanar faces.
  const hullMesh = new THREE.Mesh(hull, wood);
  hullMesh.rotation.x = -Math.PI / 2;
  hullMesh.position.y = .2;
  root.add(hullMesh);

  for (let x = -10.75; x <= 11; x += 1.45) block(oak, 1.4, .16, 46, x, 3.72, -1);
  for (const x of [-11.12, 11.12]) {
    block(gold, .23, .28, 46, x, 4.85, -1);
    for (let z = -22; z <= 22; z += 4) block(oak, .35, 1.2, .35, x, 4.35, z);
  }
  for (const x of [-7, 7]) block(oak, 8, .75, .38, x, 4.18, -22);
  block(oak, 22.3, .75, .38, 0, 4.18, 22);
  block(oak, .9, 22, .9, 0, 13.9, 10);
  block(gold, 16, .32, .35, 0, 21.8, 9.45);
  root.add(mainsail());
  block(iron, 4.5, 2, .14, 2.2, 24.1, 10);
  block(oak, .42, 1.5, .42, 0, 4.55, 21.4);
  pieces.add(gold, new THREE.TorusGeometry(.72, .075, 8, 20).translate(0, 5.22, 21.2));
  for (const angle of [0, Math.PI / 3, Math.PI * 2 / 3]) {
    pieces.add(oak, new THREE.BoxGeometry(.09, 1.5, .12).rotateZ(angle).translate(0, 5.22, 21.2));
  }
  // Rail-side bar, dance floor, benches, and barrel tables leave the middle aisle clear.
  block(wood, 1.35, 1.05, 9, 7.4, 4.325, -8);
  block(gold, 1.6, .13, 9.2, 7.4, 4.89, -8);
  for (const z of [-17, 16]) {
    block(oak, 1.4, .5, 5, -8.6, 4.05, z);
    pieces.add(wood, new THREE.CylinderGeometry(.58, .5, .94, 10).translate(-6.6, 4.27, z));
    pieces.add(iron, new THREE.CylinderGeometry(.575, .575, .13, 10).translate(-6.6, 4.44, z));
  }
  for (const x of [-9.5, 9.5]) {
    for (const z of [-18, -6, 6, 18]) {
      block(iron, .2, 2.65, .2, x, 5.1, z);
      block(lamp, .55, .7, .55, x, 6.5, z);
    }
  }
  for (const x of [-4.5, 4.5]) {
    for (const z of [-2, 1, 4, 7]) block(partyLights[(z + 2) % 2], .6, .06, .6, x, 3.83, z);
  }
  pieces.build();
  for (const x of [-11.6, 11.6]) {
    sign(root, 'BLACKTIDE', x, 2.48, -2, Math.sign(x) * Math.PI / 2, 7);
  }
  sign(root, 'EMBER BAR', 9.7, 6.1, -8, -Math.PI / 2, 5);
}

function makePirate(coat, phase, x, z) {
  const root = new THREE.Group();
  root.position.set(x, BARGE_DECK_Y, z);
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
  return { root, phase };
}

export function createPiratePartyBarge({ scene, lake, shoreAt, decks, colliders, low, announce }) {
  const { dir, side, inLake } = lake;
  const berth = findPartyBargeBerth({ shoreAt, inLake, dir, side, decks, colliders });
  if (!berth) return null;
  const { site, yaw } = berth;
  const group = new THREE.Group();
  group.name = 'Blacktide Party Barge';
  const root = new THREE.Group();
  root.position.set(site.x, 0, site.z);
  root.rotation.y = yaw;
  group.add(root);
  buildShip(root);
  buildPier(group, berth);
  if (low) {
    // Phones: no extra real-time light. A PointLight here would join every lit material's shader
    // city-wide (one recompile when the lake loads, plus per-pixel cost everywhere), so fake the pools.
    root.add(glowPool(0xffc381, 5.5, 6, -8), glowPool(0xadabff, 4.5, 0, 4));
  } else {
    const barLight = new THREE.PointLight(0xffc381, 74, 23, 1.7);
    barLight.position.set(6, 9.25, -8);
    const danceLight = new THREE.PointLight(0xadabff, 68, 17, 1.7);
    danceLight.position.set(0, 8.8, 4);
    root.add(barLight, danceLight);
  }
  scene.add(group);
  decks.push(...berth.decks);

  // Match the city's solid furniture collision. Keep the walk-through aisle open.
  for (const [x, z, r, h] of [[0, 10, .5, 26], [-6.6, -17, .58, 4.74], [-6.6, 16, .58, 4.74],
    ...[-11.5, -10, -8.5, -7, -5.5, -4.5].map(z => [7.4, z, .73, 4.95])]) {
    colliders.push({ x: site.x - side.x * x + dir.x * z, z: site.z - side.z * x + dir.z * z, r, h, nc: true });
  }

  const pirates = [];
  for (let i = 0; i < (low ? 8 : 18); i++) {
    const x = (i % 2 ? 1 : -1) * (3 + (i % 5) * 1.05);
    const z = -2 + Math.floor(i / 2) * 2.5;
    const p = makePirate(coats[i % coats.length], i * 1.7, x, z);
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
    for (const [id, x, z, angle] of [['pirate', 8.85, -8, -Math.PI / 2], ['blackbeard', -5.4, -16, Math.PI / 2]]) {
      const url = new URL(id + (low ? '-lo' : '') + '.gltf', assets);
      loader.loadAsync(url.href).then(gltf => {
        const model = gltf.scene;
        model.name = id === 'pirate' ? 'Ember Bar bartender' : 'Blackbeard';
        model.position.set(x, BARGE_DECK_Y, z);
        model.rotation.y = angle;
        root.add(model);
        const mixer = new THREE.AnimationMixer(model);
        const idle = gltf.animations.find(a => /idle/i.test(a.name));
        if (idle) mixer.clipAction(idle).play();
        characters.push({ id, model, mixer });
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
  const bar = root.localToWorld(new THREE.Vector3(5.7, BARGE_DECK_Y, -8));
  const danceFloor = root.localToWorld(new THREE.Vector3(0, BARGE_DECK_Y, 3));
  function interact(pos) {
    if (Math.abs(pos.y - BARGE_DECK_Y) > 1.25) return null;
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
    if (danceDistance < 2.7) return {
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
      audio.volume = active && !document.hidden ? .22 * Math.max(0, 1 - distance / 48) : 0;
      if (audio.volume === 0 && !audio.paused) audio.pause();
      if (audio.volume > 0 && audio.paused) playMusic();
    }
    if (distance > 145) return;
    loadCharacters();
    for (const character of characters) {
      character.mixer.update(dt);
      if (character.id === 'pirate') character.model.position.y =
        BARGE_DECK_Y + (cheer > 0 ? Math.abs(Math.sin(cheer * Math.PI * 2)) * .32 : 0);
    }
    for (const { root: pirate, phase } of pirates) {
      pirate.rotation.y = Math.sin(elapsed * .8 + phase) * .7;
      pirate.position.y = BARGE_DECK_Y + Math.max(0, Math.sin(elapsed * (music ? 6 : 2) + phase)) * (music ? .17 : .045);
    }
  }
  return { root, site, berth, pirates, characters, interact, update, blocksBoat: (x, z) => partyBargeBlocksBoat(berth, x, z) };
}
