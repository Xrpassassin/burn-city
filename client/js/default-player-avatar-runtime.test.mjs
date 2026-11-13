import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { registerHooks } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'three') {
      return { url: new URL('../vendor/three/build/three.module.min.js', import.meta.url).href, shortCircuit: true };
    }
    return next(specifier, context);
  }
});

const { buildPlayerWalker } = await import('./walker.js');
const { mountDefaultPlayerAvatar } = await import('./default-player-avatar.mjs');
const { createZombieFX } = await import('../arena/fx.js');
const THREE = await import('three');

// Use the real loader and shipped glTFs. Only the browser image decoder and Canvas API are stubbed.
const canvasContext = new Proxy({
  createRadialGradient: () => ({ addColorStop() {} }),
  createLinearGradient: () => ({ addColorStop() {} })
}, { get: (target, key) => target[key] || (() => {}) });
globalThis.document = { createElement: () => ({ getContext: () => canvasContext }) };
globalThis.self = globalThis;
globalThis.ProgressEvent = class {};
globalThis.createImageBitmap = async () => ({ width: 512, height: 512 });
globalThis.Image = class { height = 1; set src(value) { setTimeout(() => this.onload?.(), 0); } };
let nearPending;
const allowNear = new Promise(resolve => { nearPending = resolve; });
let lodPending;
const allowLod = new Promise(resolve => { lodPending = resolve; });
globalThis.fetch = async input => {
  const url = new URL(input.url || input);
  if (url.pathname.endsWith('gas-mask-guy.gltf')) await allowNear;
  if (url.pathname.endsWith('gas-mask-guy-lod.gltf')) await allowLod;
  return new Response(await readFile(url));
};

async function until(check) {
  for (let i = 0; i < 200 && !check(); i++) await delay(10);
  assert(check(), 'timed out waiting for the avatar');
}

const walker = buildPlayerWalker();
const { defaultAvatar, fallbackBody } = walker.userData;
const oldPack = new THREE.Mesh();
fallbackBody.add(oldPack);
assert.equal(fallbackBody.visible, true);
defaultAvatar.setVisible(false);
assert.equal(fallbackBody.visible, false);
nearPending();
await until(() => defaultAvatar.ready);
const model = walker.getObjectByName('gas-mask-guy');
assert.equal(model.visible, false);
defaultAvatar.setVisible(true);
assert.equal(model.visible, true);
assert.equal(oldPack.parent.visible, false);

defaultAvatar.setLod(true);
defaultAvatar.setLod(false);
lodPending();
const far = new THREE.Group();
const farAvatar = mountDefaultPlayerAvatar(far, { lod: true });
await until(() => farAvatar.ready);
const mesh = root => {
  let skin;
  root.traverse(node => { if (node.isSkinnedMesh) skin = node; });
  return skin;
};
assert.equal(mesh(walker).geometry.index.count, 9000 * 3, 'stale LOD must not replace the requested model');
assert.equal(mesh(far).geometry.index.count, 2585 * 3);
let disposed = false;
mesh(walker).material.addEventListener('dispose', () => { disposed = true; });
defaultAvatar.dispose();
assert(disposed);
assert.equal(walker.getObjectByName('gas-mask-guy'), undefined);
assert.equal(fallbackBody.visible, true);

const body = new THREE.Group(), armedBody = new THREE.Group();
const full = mountDefaultPlayerAvatar(body, { variant: 'firstPerson' });
const armed = mountDefaultPlayerAvatar(armedBody, { variant: 'firstPersonArmed' });
await until(() => full.ready && armed.ready);
const trimmed = mesh(armedBody);
assert(mesh(body).geometry.index.count > trimmed.geometry.index.count);
assert(trimmed.geometry.index.count > 4000 * 3);
const armBones = new Set(trimmed.skeleton.bones.flatMap((bone, i) =>
  /^(upperarm|forearm|hand)/.test(bone.name) ? [i] : []));
assert.equal(armBones.size, 6);
const joints = trimmed.geometry.getAttribute('skinIndex');
const weights = trimmed.geometry.getAttribute('skinWeight');
for (const vertex of trimmed.geometry.index.array) {
  let armWeight = 0;
  for (let i = 0; i < 4; i++) {
    if (armBones.has(joints.getComponent(vertex, i))) armWeight += weights.getComponent(vertex, i);
  }
  assert(armWeight <= .5, 'first-person body includes a vertex from the weapon arms');
}

const scene = new THREE.Scene();
const fx = createZombieFX(scene, { low: true });
const snapshot = { players: [{ id: 2, alive: true, x: 1, z: 1 }], zombies: [] };
const color = () => new THREE.Color(0xffffff);
const update = () => fx.update(1 / 60, snapshot, null, 1, color, color());
const draws = () => scene.children.filter(node => node.isInstancedMesh && node.count > 0).length;
update();
assert(draws() > 1, 'procedural player renders while the replacement is loading');
await until(() => !!scene.getObjectByName('gas-mask-guy'));
update();
assert.equal(draws(), 1, 'only the weapon remains in the instanced player pass');
fx.clear();
assert.equal(draws(), 0);
console.log('Avatar replacement, visibility, LOD, disposal, and Zombies body layers passed');
