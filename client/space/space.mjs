import * as THREE from 'three';
import { advanceFlight, beginFlight, dockingStatus } from './flight.mjs';

const view = document.querySelector('#view');
const status = document.querySelector('#status');
const range = document.querySelector('#range');
const controls = document.querySelector('#flight-controls');
const launch = document.querySelector('#launch');
if (new URLSearchParams(location.search).get('from') === 'airport') {
  document.querySelector('#return').href = '../?spacePreview=1';
}
const keys = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'approach'
};
const pressed = new Set();
const pointers = new Map();
const bindings = Object.entries(keys);
const active = control => bindings.some(([code, action]) => action === control && pressed.has(code))
  || [...pointers.values()].includes(control);

function setKey(event, down) {
  if (!Object.hasOwn(keys, event.code)) return;
  if (!down) pressed.delete(event.code);
  if (controls.hidden || event.target.closest?.('button, a')) return;
  event.preventDefault();
  if (down) pressed.add(event.code);
}
addEventListener('keydown', event => setKey(event, true));
addEventListener('keyup', event => setKey(event, false));
addEventListener('blur', () => { pressed.clear(); pointers.clear(); });
for (const button of controls.querySelectorAll('[data-control]')) {
  button.addEventListener('pointerdown', event => {
    button.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, button.dataset.control);
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(name, event => pointers.delete(event.pointerId));
  }
  button.addEventListener('keydown', event => {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    event.preventDefault();
    pointers.set(button, button.dataset.control);
  });
  for (const name of ['keyup', 'blur']) button.addEventListener(name, () => pointers.delete(button));
}

let flight;
launch.addEventListener('click', () => {
  pressed.clear();
  pointers.clear();
  flight = beginFlight();
  launch.hidden = true;
  launch.blur();
});
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070e19);
const camera = new THREE.PerspectiveCamera(50, 1, .1, 300);
camera.position.set(0, 3, 11);
camera.lookAt(0, 0, 0);
scene.add(new THREE.HemisphereLight(0xc8e7ff, 0x574c6f, 2));
const sunlight = new THREE.DirectionalLight(0xffe6ba, 2);
sunlight.position.set(4, 8, 6);
scene.add(sunlight);
const stars = new THREE.BufferGeometry();
const points = [];
for (let i = 0; i < 650; i++) points.push(Math.sin(i * 83.17) * 125, Math.cos(i * 31.87) * 95, -115);
stars.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xcbe3ff, size: .3 })));

const station = new THREE.Group();
const craft = new THREE.Group();
const stationBody = new THREE.Group();
const craftBody = new THREE.Group();
station.add(stationBody);
craft.add(craftBody);
scene.add(station, craft);
const metal = new THREE.MeshStandardMaterial({ color: 0xabbec8, roughness: .48 });
const solar = new THREE.MeshStandardMaterial({ color: 0x214a7a, roughness: .7 });
const fuselage = new THREE.MeshStandardMaterial({ color: 0xb9d1e8, roughness: .36 });
const marker = new THREE.MeshBasicMaterial({ color: 0x71dfed });
function box(parent, material, size, position) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  parent.add(mesh);
}
box(stationBody, metal, [11, .16, .18], [0, 0, 0]);
box(stationBody, metal, [2.2, .64, 1.45], [0, 0, 0]);
for (const x of [-4.4, -2.8, 2.8, 4.4]) box(stationBody, solar, [1.3, .1, 3.7], [x, 0, 0]);
const ring = new THREE.Mesh(new THREE.TorusGeometry(.43, .035, 8, 36), marker);
ring.position.z = .75;
station.add(ring);
box(craftBody, fuselage, [.64, .29, 1.35], [0, 0, 0]);
box(craftBody, fuselage, [1.48, .075, .55], [0, -.05, .24]);
box(craftBody, solar, [.4, .075, .45], [0, .16, -.2]);
for (const x of [-.27, .27]) box(craftBody, marker, [.17, .1, .08], [x, 0, .71]);

// Local derivatives can replace the preview bodies once normalized and bundled.
const previewAssets = new URL('../assets/space/', import.meta.url);
async function loadPreviewAssets() {
  const response = await fetch(new URL('models.json', previewAssets));
  if (!response.ok) return;
  const models = await response.json();
  const variants = [
    [models.cb1, 'cb1.gltf', craft, craftBody],
    [models.iss, 'iss.gltf', station, stationBody]
  ].filter(([enabled]) => enabled === true);
  if (!variants.length) return;
  const { GLTFLoader } = await import('../vendor/three/examples/jsm/loaders/GLTFLoader.js');
  const loader = new GLTFLoader();
  await Promise.allSettled(variants.map(async ([, file, holder, fallback]) => {
    const { scene: model } = await loader.loadAsync(new URL(file, previewAssets).href);
    const bounds = new THREE.Box3().setFromObject(model);
    if (bounds.isEmpty() || !Number.isFinite(bounds.getSize(new THREE.Vector3()).lengthSq())) return;
    holder.add(model);
    fallback.visible = false;
  }));
}
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.4));
  view.append(renderer.domElement);
  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  }
  addEventListener('resize', resize);
  resize();
  loadPreviewAssets().catch(() => {});
} catch {
  document.querySelector('#render-note').hidden = false;
}
let previous = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = (now - previous) / 1000;
  previous = now;
  if (flight) {
    flight = advanceFlight(flight, dt, {
      x: Number(active('right')) - Number(active('left')),
      y: Number(active('up')) - Number(active('down')),
      approach: active('approach')
    });
    const nextStatus = dockingStatus(flight);
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    range.hidden = flight.phase !== 'approach';
    range.textContent = `Range ${Math.round(flight.distance)} m · horizontal ${Math.round(flight.x * 100)}% · vertical ${Math.round(flight.y * 100)}%`;
    if (flight.phase === 'approach' && controls.hidden) {
      controls.hidden = false;
      if (document.activeElement === document.body) view.parentElement.focus();
    } else {
      controls.hidden = flight.phase !== 'approach';
    }
    if (flight.phase === 'docked' && launch.hidden) {
      launch.hidden = false;
      launch.textContent = 'Fly again';
      launch.focus();
    }
  }
  const state = flight || beginFlight();
  station.position.z = 1.2 - 1.425 - (state.distance - 4) * .19;
  const docked = state.phase === 'docked';
  const launchLift = state.phase === 'launch' ? Math.min(0, state.elapsed * .6 - 1.8) : 0;
  craft.position.set(docked ? 0 : state.x * 2.2, (docked ? 0 : state.y * 2) + launchLift,
    docked ? station.position.z + 1.425 : 1.2);
  renderer?.render(scene, camera);
}
requestAnimationFrame(frame);
