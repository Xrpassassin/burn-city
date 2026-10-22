import * as THREE from 'three';
import { generateDungeonLayout } from './dungeon-layout-core.mjs';

const host = document.querySelector('#view');
const seedInput = document.querySelector('#seed');
const stats = document.querySelector('#stats');
const scene = new THREE.Scene();
scene.background = new THREE.Color('#100d0c');
scene.fog = new THREE.Fog('#100d0c', 130, 300);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.shadowMap.enabled = false;
host.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xbab0a7, 0x21140e, 2.0));
const keyLight = new THREE.DirectionalLight(0xffc18a, 2.2);
keyLight.position.set(-25, 50, -15);
scene.add(keyLight);
const floorMat = new THREE.MeshStandardMaterial({ color: '#28201c', roughness: 1 });
const corridorMat = new THREE.MeshStandardMaterial({ color: '#4b3d36', roughness: 1 });
const roomMat = new THREE.MeshStandardMaterial({ color: '#75665c', roughness: 0.96 });
const entranceMat = new THREE.MeshStandardMaterial({ color: '#e7a15e', roughness: 0.7 });
const bossMat = new THREE.MeshStandardMaterial({ color: '#d34e3d', roughness: 0.7 });
const wallMat = new THREE.MeshStandardMaterial({ color: '#382b25', roughness: 1 });
let layoutGroup = new THREE.Group();
scene.add(layoutGroup);
let yaw = 0.65, pitch = 0.82, distance = 72, target = new THREE.Vector3();
let dragging = false, lastX = 0, lastY = 0, pinchStart = null;
const materialCache = new Map();

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  layoutGroup.add(mesh);
  return mesh;
}
function renderLayout(seed) {
  scene.remove(layoutGroup);
  layoutGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  layoutGroup = new THREE.Group();
  scene.add(layoutGroup);
  const layout = generateDungeonLayout({ seed, columns: 5, rows: 5, loopChance: 0.16 });
  const roomById = new Map(layout.rooms.map(room => [room.id, room]));
  const size = 8.2;
  // Build connecting floors first, so chambers read as one traversable structure.
  for (const edge of layout.corridors) {
    const a = roomById.get(edge.a), b = roomById.get(edge.b);
    const midX = (a.x + b.x) / 2, midZ = (a.z + b.z) / 2;
    const horizontal = a.gridZ === b.gridZ;
    box(horizontal ? 17 : 7, 0.6, horizontal ? 7 : 17, corridorMat, midX, -0.45, midZ);
  }
  for (const room of layout.rooms) {
    const material = room.type === 'entrance' ? entranceMat : room.type === 'boss' ? bossMat : roomMat;
    box(size, 0.8, size, floorMat, room.x, -0.05, room.z);
    box(size, 0.7, size, material, room.x, 0.35, room.z);
    // Four low wall blocks leave the center visibly open; door openings are abstracted by the graph.
    const wallH = room.type === 'boss' ? 3.8 : 2.8;
    box(size, wallH, 0.55, wallMat, room.x, wallH / 2 + 0.65, room.z - size / 2);
    box(size, wallH, 0.55, wallMat, room.x, wallH / 2 + 0.65, room.z + size / 2);
    box(0.55, wallH, size, wallMat, room.x - size / 2, wallH / 2 + 0.65, room.z);
    box(0.55, wallH, size, wallMat, room.x + size / 2, wallH / 2 + 0.65, room.z);
    if (room.type !== 'chamber') {
      const marker = new THREE.Mesh(new THREE.ConeGeometry(1.15, 2.6, 5), material);
      marker.position.set(room.x, 3.5, room.z);
      layoutGroup.add(marker);
    }
  }
  const centerX = ((layout.columns - 1) * 24) / 2;
  const centerZ = ((layout.rows - 1) * 24) / 2;
  target.set(centerX, 0, centerZ);
  stats.textContent = `Seed: ${layout.seed} · ${layout.rooms.length} rooms · ${layout.corridors.length} corridors · boss path: ${layout.mainPathLength} connections`;
  updateCamera();
}
function updateCamera() {
  const horizontal = Math.cos(pitch) * distance;
  camera.position.set(
    target.x + Math.sin(yaw) * horizontal,
    target.y + Math.sin(pitch) * distance,
    target.z + Math.cos(yaw) * horizontal
  );
  camera.lookAt(target);
}
function resize() {
  const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
host.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') host.setPointerCapture(event.pointerId);
  dragging = true; lastX = event.clientX; lastY = event.clientY;
});
host.addEventListener('pointermove', event => {
  if (!dragging) return;
  yaw -= (event.clientX - lastX) * 0.008;
  pitch = Math.max(0.18, Math.min(1.35, pitch + (event.clientY - lastY) * 0.006));
  lastX = event.clientX; lastY = event.clientY;
  updateCamera();
});
for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
  host.addEventListener(eventName, () => { dragging = false; });
}
host.addEventListener('wheel', event => {
  event.preventDefault();
  distance = Math.max(26, Math.min(150, distance + event.deltaY * 0.06));
  updateCamera();
}, { passive: false });
document.querySelector('#generate').addEventListener('click', () => {
  const seed = seedInput.value.trim();
  if (!seed) { stats.textContent = 'Enter a non-empty seed.'; return; }
  renderLayout(seed);
});
seedInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') document.querySelector('#generate').click();
});
window.addEventListener('resize', resize);
resize();
renderLayout(seedInput.value);
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
