// Pure fishing-fight rules shared by the browser UI and deterministic tests.
// This is a gameplay helper, not an authority for wallet-backed catch validation.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+n) ? +n : lo));

// Preferred bait nudges catch odds without making any species impossible to catch.
// Tier 0=worm, 1=shrimp, 2=glow lure, 3=Burn Fly.
const PREFERRED_BAIT = {
  minnow: 0, bluegill: 0, perch: 0, shiner: 0, dace: 0,
  carp: 1, catfish: 1, eel: 2, gar: 2, koi: 2, cod: 1,
  sturgeon: 1, snapper: 3, trout: 3, bass: 3, pike: 3,
  salmon: 3, leviathan: 2, marlin: 2, whaleshark: 2
};

export function baitAffinity(speciesId, baitTier) {
  const tier = Math.max(0, Math.min(3, Number.isFinite(+baitTier) ? +baitTier : 0));
  const preferred = PREFERRED_BAIT[speciesId];
  if (preferred === undefined) return 1;
  return tier === preferred ? 1.25 : 0.9;
}

export function resolveFightTap({ position, zoneStart, zoneWidth, running = false, tension = 0, rodTier = 0, rarity = 0 } = {}) {
  const p = clamp(position, 0, 1), start = clamp(zoneStart, 0, 1), width = clamp(zoneWidth, 0, 1);
  const rod = clamp(rodTier, 0, 3), r = clamp(rarity, 0, 4), before = clamp(tension, 0, 1.5);
  const hit = !running && p >= start && p <= start + width;
  // Rare fish pull harder. Better rods reduce the penalty and recover more tension on a clean reel.
  const nextTension = hit
    ? Math.max(0, before - (0.2 + rod * 0.035))
    : Math.min(1.5, before + (running ? 0.24 + r * 0.035 : Math.max(0.04, 0.11 + r * 0.025 - rod * 0.015)));
  return { hit, miss: !hit, tension: +nextTension.toFixed(3), broke: nextTension >= 1 };
}
