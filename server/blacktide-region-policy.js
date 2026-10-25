// BlackTide regional combat policy. Invoke on the server with authenticated session state.
// This module does not trust region, opt-in, or harbor flags supplied by clients.
export const REGIONS = Object.freeze({
  haven: Object.freeze({ name: 'Haven Isles', beginner: true, pvp: false }),
  emerald: Object.freeze({ name: 'Emerald Passage', beginner: false, pvp: true }),
  deadmans: Object.freeze({ name: "Deadman's Reach", beginner: false, pvp: true }),
  shattered: Object.freeze({ name: 'The Shattered Sea', beginner: false, pvp: true })
});
export const PVP_TOGGLE_COOLDOWN_MS = 60_000;
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
export function canEnterRegion(regionId, unlockedRegions) {
  return typeof regionId === 'string' && has(REGIONS, regionId) &&
    (regionId === 'haven' || Array.isArray(unlockedRegions) && unlockedRegions.includes(regionId));
}
export function setPvpOptIn(state, enabled, now = Date.now()) {
  if (!state || typeof enabled !== 'boolean' || !Number.isSafeInteger(now) || now < 0) return false;
  if (!has(REGIONS, state.regionId) || !REGIONS[state.regionId].pvp || state.safeHarbor === true) return false;
  if (state.inCombat === true) return false;
  if (state.pvpEnabled === enabled) return true;
  if (Number.isSafeInteger(state.lastPvpToggleAt) && now - state.lastPvpToggleAt < PVP_TOGGLE_COOLDOWN_MS) return false;
  state.pvpEnabled = enabled;
  state.lastPvpToggleAt = now;
  return true;
}
export function canPlayersFight(attacker, defender) {
  if (!attacker || !defender || attacker === defender || !attacker.playerId || !defender.playerId ||
      attacker.playerId === defender.playerId || attacker.regionId !== defender.regionId ||
      attacker.instanceId !== defender.instanceId || !has(REGIONS, attacker.regionId)) return false;
  const region = REGIONS[attacker.regionId];
  return region.pvp && attacker.pvpEnabled === true && defender.pvpEnabled === true &&
    attacker.safeHarbor !== true && defender.safeHarbor !== true;
}
export function enterRegion(state, regionId, instanceId, unlockedRegions) {
  if (!state || !canEnterRegion(regionId, unlockedRegions) || typeof instanceId !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/.test(instanceId) || state.inCombat === true) return false;
  state.regionId = regionId;
  state.instanceId = instanceId;
  state.pvpEnabled = false;
  state.safeHarbor = true; // Must be recomputed from authoritative zone geometry on arrival.
  return true;
}
