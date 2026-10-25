import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const runtime = require("./nft-avatar-runtime-adapter.js");

const candidate = {
  identity: { collectionKey: "racc", tokenId: "42" },
  asset: { uri: "assets/avatars/racc/42.glb", sha256: "abc123" },
  runtimeApproved: true,
  qualityGates: { rightsApproved: true, visualReviewed: true, performanceProfiled: true, rigValidated: true }
};
const zombies = runtime.resolveAvatarRuntime(candidate, "zombies");
const homefront = runtime.resolveAvatarRuntime(candidate, "homefront");
assert.equal(zombies.ok, true);
assert.equal(homefront.ok, true);
assert.equal(zombies.identity.tokenId, homefront.identity.tokenId);
assert.equal(zombies.asset.sha256, homefront.asset.sha256);
assert.equal(zombies.runtime.sharedAsset, true);
assert.ok(zombies.runtime.features.includes("zombieDamage"));
assert.ok(!homefront.runtime.features.includes("zombieDamage"));
assert.equal(zombies.runtime.animationProfile, "zombies-combat");
assert.equal(homefront.runtime.animationProfile, "homefront-survival");
assert.equal(runtime.compareRuntimeIdentity(zombies, homefront), true);

for (const mode of ["city", "blacktide", "estates-island", "fishing", "cinder-wilds", "light-cycles"]) {
  const result = runtime.resolveAvatarRuntime(candidate, mode);
  assert.equal(result.ok, true, mode + " accepts approved shared asset");
  assert.equal(runtime.compareRuntimeIdentity(zombies, result), true);
}
assert.throws(() => runtime.resolveAvatarRuntime(candidate, "eternal-grind"), /Unknown game mode/);

const unapproved = runtime.resolveAvatarRuntime({ ...candidate, runtimeApproved: false }, "homefront");
assert.equal(unapproved.ok, false);
assert.ok(unapproved.errors.some((e) => e.includes("runtime-approved")));
const missingRig = runtime.resolveAvatarRuntime({ ...candidate, qualityGates: { ...candidate.qualityGates, rigValidated: false } }, "zombies");
assert.equal(missingRig.ok, false);
assert.ok(missingRig.errors.some((e) => e.includes("rig validation")));
assert.throws(() => runtime.resolveAvatarRuntime(candidate, "unknown-mode"), /Unknown game mode/);
assert.equal(runtime.compareRuntimeIdentity(zombies, { ...homefront, asset: { sha256: "different" } }), false);
console.log("NFT avatar shared runtime adapter tests passed");
