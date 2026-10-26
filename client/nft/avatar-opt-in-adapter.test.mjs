import test from 'node:test';
import assert from 'node:assert/strict';
import { createOptInNFTAvatarBridge } from './avatar-opt-in-adapter.mjs';

function setup({ approved = true, fail = false, enabled = true } = {}) {
  let calls = 0;
  const bridge = createOptInNFTAvatarBridge({
    enabled,
    resolveRuntime: () => approved
      ? { ok: true, identity: { collectionKey: 'racc', tokenId: 'token1' }, runtime: {} }
      : { ok: false },
    fallbackAvatar: async () => ({ kind: 'legacy' }),
    loadManifest: async () => ({
      schemaVersion: 1, collectionKey: 'racc', version: 'v1', runtimeApproved: true,
      assets: [{ path: 'racc.glb', role: 'model', bytes: 5, sha256: 'a'.repeat(64) }],
    }),
    loadGLB: async () => {
      calls++;
      if (fail) throw new Error('offline');
      return { scene: { kind: 'nft' } };
    },
    cloneAvatar: scene => ({ ...scene }),
  });
  return { bridge, getCalls: () => calls };
}
const candidate = { asset: { packageVersion: 'v1' } };

test('disabled bridge preserves legacy avatar', async () => {
  const { bridge, getCalls } = setup({ enabled: false });
  const result = await bridge.load(candidate, 'city');
  assert.equal(result.source, 'fallback');
  assert.equal(result.reason, 'feature-disabled');
  assert.equal(getCalls(), 0);
});
test('policy rejection preserves legacy avatar', async () => {
  const { bridge, getCalls } = setup({ approved: false });
  assert.equal((await bridge.load(candidate, 'homefront')).reason, 'policy-rejected');
  assert.equal(getCalls(), 0);
});
test('approved package returns cloned character', async () => {
  const { bridge } = setup();
  const result = await bridge.load(candidate, 'city');
  assert.equal(result.source, 'nft-package');
  assert.equal(result.avatar.scene.kind, 'nft');
});
test('asset failure falls back', async () => {
  const { bridge } = setup({ fail: true });
  assert.equal((await bridge.load(candidate, 'zombies')).reason, 'package-unavailable');
});
