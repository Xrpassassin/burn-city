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
let dragging = false, lastX = 0, lastY = 0;

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
    // Leave actual door gaps wherever the graph has a corridor edge.
    const wallH = room.type === 'boss' ? 3.8 : 2.8;
    const wallY = wallH / 2 + 0.65;
    const linked = new Set();
    for (const next of [...(layout.rooms)]) {
      if (Math.abs(next.gridX - room.gridX) + Math.abs(next.gridZ - room.gridZ) !== 1) continue;
      if (layout.corridors.some(edge => (edge.a === room.id && edge.b === next.id) || (edge.b === room.id && edge.a === next.id))) {
        linked.add(next.id);
      }
    }
    const door = 4.2;
    const side = (neighborId, axis) => {
      const hasDoor = linked.has(neighborId);
      if (!hasDoor) {
        if (axis === 'z') box(size, wallH, 0.55, wallMat, room.x, wallY, room.z + (neighborId < room.id ? -size / 2 : size / 2));
        else box(0.55, wallH, size, wallMat, room.x + (neighborId < room.id ? -size / 2 : size / 2), wallY, room.z);
        return;
      }
      if (axis === 'z') {
        const z = room.z + (neighborId < room.id ? -size / 2 : size / 2);
        box((size - door) / 2, wallH, 0.55, wallMat, room.x - (size + door) / 4, wallY, z);
        box((size - door) / 2, wallH, 0.55, wallMat, room.x + (size + door) / 4, wallY, z);
      } else {
        const x = room.x + (neighborId < room.id ? -size / 2 : size / 2);
        box(0.55, wallH, (size - door) / 2, wallMat, x, wallY, room.z - (size + door) / 4);
        box(0.55, wallH, (size - door) / 2, wallMat, x, wallY, room.z + (size + door) / 4);
      }
    };
    side(room.id - layout.columns, 'z');
    side(room.id + layout.columns, 'z');
    side(room.id - 1, 'x');
    side(room.id + 1, 'x');
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
const activePointers = new Map();
let previousPinchDistance = 0;
host.addEventListener('pointerdown', event => {
  if (event.pointerType === 'touch') host.setPointerCapture(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  dragging = activePointers.size === 1;
  lastX = event.clientX; lastY = event.clientY;
  if (activePointers.size === 2) {
    const points = [...activePointers.values()];
    previousPinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }
});
host.addEventListener('pointermove', event => {
  if (!activePointers.has(event.pointerId)) return;
  const previous = activePointers.get(event.pointerId);
  activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (activePointers.size >= 2) {
    const points = [...activePointers.values()];
    const nextDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
    if (previousPinchDistance > 0) {
      distance = Math.max(26, Math.min(150, distance - (nextDistance - previousPinchDistance) * 0.16));
      updateCamera();
    }
    previousPinchDistance = nextDistance;
    return;
  }
  if (!dragging) return;
  yaw -= (event.clientX - lastX) * 0.008;
  pitch = Math.max(0.18, Math.min(1.35, pitch + (event.clientY - lastY) * 0.006));
  lastX = event.clientX; lastY = event.clientY;
  updateCamera();
});
for (const eventName of ['pointerup', 'pointercancel', 'pointerleave']) {
  host.addEventListener(eventName, event => {
    activePointers.delete(event.pointerId);
    dragging = activePointers.size === 1;
    previousPinchDistance = 0;
  });
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
