// Comparison-only tuning for the existing UnrealBloomPass; does not create another pass.
export const BLOOM_COMPARISON_PRESETS = Object.freeze({
  balanced: Object.freeze({ strength: 1, radius: 0.4, threshold: 0.5 }),
  ember: Object.freeze({ strength: 1.18, radius: 0.52, threshold: 0.38 }),
  crisp: Object.freeze({ strength: 0.78, radius: 0.3, threshold: 0.62 }),
});
export function getBloomComparisonPreset(name = 'balanced') {
  return BLOOM_COMPARISON_PRESETS[name] || BLOOM_COMPARISON_PRESETS.balanced;
}
export function isBloomComparisonPreset(name) {
  return Object.prototype.hasOwnProperty.call(BLOOM_COMPARISON_PRESETS, name);
}
