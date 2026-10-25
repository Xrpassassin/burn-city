// BlackTide RPG progression: deterministic, read-only progression rules.
// Rewards must be granted only by authenticated server-side gameplay outcomes.
export const TRACKS = Object.freeze({
  sailing: { name: 'Seamanship', unlocks: ['Coastal Navigator', 'Storm Reader', 'Master Helmsman'] },
  combat: { name: 'Gunnery', unlocks: ['Powder Handler', 'Broadside Specialist', 'Master Gunner'] },
  trade: { name: 'Commerce', unlocks: ['Market Apprentice', 'Cargo Broker', 'Merchant Prince'] },
  exploration: { name: 'Discovery', unlocks: ['Chart Keeper', 'Island Scout', 'Legendary Explorer'] }
});
export const RANK_THRESHOLDS = Object.freeze([0, 100, 350, 900]);
export function rankForXp(xp) {
  if (!Number.isFinite(xp) || xp < 0) return 0;
  let rank = 0;
  for (let i = 1; i < RANK_THRESHOLDS.length; i++) if (xp >= RANK_THRESHOLDS[i]) rank = i;
  return rank;
}
export function progressionView(xpByTrack = {}) {
  return Object.fromEntries(Object.entries(TRACKS).map(([id, track]) => {
    const xp = Number.isSafeInteger(xpByTrack[id]) && xpByTrack[id] > 0 ? xpByTrack[id] : 0;
    const rank = rankForXp(xp);
    return [id, { name: track.name, xp, rank, title: rank ? track.unlocks[rank - 1] : 'Untrained',
      nextRankXp: RANK_THRESHOLDS[rank + 1] ?? null }];
  }));
}
