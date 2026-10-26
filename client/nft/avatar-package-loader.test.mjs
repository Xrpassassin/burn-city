import test from 'node:test';
import assert from 'node:assert/strict';
import { createAvatarPackageLoader, validateAvatarManifest } from './avatar-package-loader.mjs';

const manifest = () => ({
  schemaVersion: 1, collectionKey: 'racc', version: 'v1',
  runtimeApproved: true,
  assets: [{ path: 'racc.glb', role: 'model', bytes: 10, sha256: 'a'.repeat(64) }],
});

test('rejects unapproved manifests and traversal', () => {
  assert.throws(() => validateAvatarManifest({ ...manifest(), runtimeApproved: false }, 'racc'));
  const bad = manifest();
  bad.assets[0].path = '../secret.glb';
  assert.throws(() => validateAvatarManifest(bad, 'racc'));
});

test('caches loads but clones each instance', async () => {
  let loads = 0;
  let clones = 0;
  const loader = createAvatarPackageLoader({
    loadManifest: async () => manifest(),
    loadGLB: async url => {
      assert.equal(url, '/a/nft-avatars/racc/v1/racc.glb');
      loads++;
      return { scene: { id: 1 }, animations: [{ name: 'idle' }] };
    },
    cloneAvatar: scene => ({ ...scene, clone: ++clones }),
  });
  const [a, b] = await Promise.all([loader.load('racc', 'v1'), loader.load('racc', 'v1')]);
  assert.equal(loads, 1);
  assert.notStrictEqual(a.scene, b.scene);
  assert.equal(a.animations[0].name, 'idle');
});

test('failed load is evicted for retry', async () => {
  let attempts = 0;
  const loader = createAvatarPackageLoader({
    loadManifest: async () => manifest(),
    loadGLB: async () => {
      if (++attempts === 1) throw new Error('network failure');
      return { scene: {} };
    },
    cloneAvatar: scene => ({ ...scene }),
  });
  await assert.rejects(loader.load('racc', 'v1'));
  await new Promise(resolve => setImmediate(resolve));
  await loader.load('racc', 'v1');
  assert.equal(attempts, 2);
});
