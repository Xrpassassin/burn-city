// Small deterministic visual-tuning profiles for CinderWilds.
// Profiles are multipliers only; they do not allocate effects or change scene topology.
export const WILDS_GRAPHICS_PROFILES = Object.freeze({
  balanced: Object.freeze({ fog: 1, sway: 1, shafts: 1 }),
  cinematic: Object.freeze({ fog: 1.18, sway: 1.25, shafts: 1.35 }),
  mobile: Object.freeze({ fog: 0.9, sway: 0.65, shafts: 0.6 }),
});

export function getWildsGraphicsProfile(name = 'balanced') {
  return WILDS_GRAPHICS_PROFILES[name] || WILDS_GRAPHICS_PROFILES.balanced;
}

export function isWildsGraphicsProfile(name) {
  return Object.prototype.hasOwnProperty.call(WILDS_GRAPHICS_PROFILES, name);
}
