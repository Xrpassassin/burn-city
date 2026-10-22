// Test-only multipliers for existing CinderWilds atmosphere; no new lights or render passes.
export const WILDS_ATMOSPHERE_PRESETS = Object.freeze({
  balanced: Object.freeze({ fogDensity: 1, fogTint: 0.85, shafts: 1 }),
  moonlit: Object.freeze({ fogDensity: 1.18, fogTint: 0.96, shafts: 1.15 }),
  clear: Object.freeze({ fogDensity: 0.72, fogTint: 0.68, shafts: 0.7 }),
});
export function getWildsAtmospherePreset(name = 'balanced') {
  return WILDS_ATMOSPHERE_PRESETS[name] || WILDS_ATMOSPHERE_PRESETS.balanced;
}
export function isWildsAtmospherePreset(name) {
  return Object.prototype.hasOwnProperty.call(WILDS_ATMOSPHERE_PRESETS, name);
}
