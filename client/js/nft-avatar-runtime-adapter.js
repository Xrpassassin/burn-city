/* Shared NFT avatar runtime adapter.
 * CommonJS + browser-global module. This is an integration contract, not a game bootstrap.
 * Both game modes consume the same approved asset identity; mode-specific systems remain separate.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BurnCityNFTAvatarRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MODES = Object.freeze({
    zombies: Object.freeze({
      key: "zombies",
      features: Object.freeze(["thirdPersonCombat", "weaponSockets", "hitReactions", "zombieDamage", "multiplayer"]),
      animationProfile: "zombies-combat",
      equipmentProfile: "combat-loadout"
    }),
    homefront: Object.freeze({
      key: "homefront",
      features: Object.freeze(["thirdPersonTraversal", "survivorInteraction", "baseActivities", "workshopPreview", "weaponSockets", "hitReactions"]),
      animationProfile: "homefront-survival",
      equipmentProfile: "survival-loadout"
    })
  });

  function nonEmpty(value) { return typeof value === "string" && value.trim().length > 0; }

  function resolveAvatarRuntime(candidate, mode) {
    if (!candidate || typeof candidate !== "object") throw new TypeError("Avatar candidate is required");
    const profile = MODES[mode];
    if (!profile) throw new RangeError("Unknown game mode: " + String(mode));
    const identity = candidate.identity || {};
    const asset = candidate.asset || {};
    const qa = candidate.qualityGates || {};
    const errors = [];
    if (!nonEmpty(identity.collectionKey)) errors.push("identity.collectionKey is required");
    if (!nonEmpty(String(identity.tokenId ?? ""))) errors.push("identity.tokenId is required");
    if (!nonEmpty(asset.uri) || !asset.uri.toLowerCase().endsWith(".glb")) errors.push("asset.uri must point to a GLB");
    if (candidate.runtimeApproved !== true) errors.push("candidate is not runtime-approved");
    if (qa.rightsApproved !== true) errors.push("rights approval is required");
    if (qa.visualReviewed !== true) errors.push("visual review is required");
    if (qa.performanceProfiled !== true) errors.push("performance profiling is required");
    if (qa.rigValidated !== true) errors.push("rig validation is required");
    if (errors.length) return { ok: false, mode, errors };

    return {
      ok: true,
      mode,
      identity: { collectionKey: String(identity.collectionKey), tokenId: String(identity.tokenId) },
      asset: { uri: asset.uri, sha256: asset.sha256 || null },
      runtime: {
        animationProfile: profile.animationProfile,
        equipmentProfile: profile.equipmentProfile,
        features: profile.features.slice(),
        sharedAsset: true
      }
    };
  }

  function compareRuntimeIdentity(a, b) {
    const ai = a && a.identity || {}, bi = b && b.identity || {};
    return String(ai.collectionKey || "") === String(bi.collectionKey || "") &&
      String(ai.tokenId || "") === String(bi.tokenId || "") &&
      String((a && a.asset && a.asset.sha256) || "") === String((b && b.asset && b.asset.sha256) || "");
  }

  return Object.freeze({ MODES, resolveAvatarRuntime, compareRuntimeIdentity });
});
