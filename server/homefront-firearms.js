'use strict';
// Homefront automatic firearm tiers. One coherent ladder built from ChatGPT's four parallel
// machine-gun PRs (#185 machine gun, #186 SMG, #187 assault rifle, #188 heavy machine gun).
// Better guns unlock as the settlement develops (refuge level) and, for the top tiers, after
// the player has surveyed the district that supplies them. Everything here is server-owned:
// unlocks are checked when crafting, equipping and firing; the server decides the burst size,
// cadence, ammo spent, which squad members each round hits, and the damage.
//
// Cadence: every firearm request is >= 900 ms apart because the world API allows 120 requests
// per minute per account (moves + polls share it). Automatic fire is therefore modelled as a
// short server-resolved burst per request instead of one HTTP request per bullet.
const NP = o => Object.freeze(Object.assign(Object.create(null), o));

const FIREARM_TIERS = NP({
  smg:               NP({ tier: 1, label: 'Compact SMG',       rarity: 'Epic',      power: 5, cost: NP({ scrap: 180, embers: 130 }), level: 2, zone: null,           rounds: 3, interval: 950,  magazine: 30, spread: 2.5, falloff: 0.82, noise: 80,  handling: NP({ adsMs: 180, recoveryMs: 520, aimMoveScale: 0.68 }), from: '#186' }),
  assault_rifle:     NP({ tier: 2, label: 'Assault Rifle',     rarity: 'Epic',      power: 6, cost: NP({ scrap: 220, embers: 180 }), level: 3, zone: null,           rounds: 3, interval: 950,  magazine: 30, spread: 3.0, falloff: 0.86, noise: 90,  handling: NP({ adsMs: 300, recoveryMs: 680, aimMoveScale: 0.5 }),  from: '#187' }),
  machine_gun:       NP({ tier: 3, label: 'Machine Gun',       rarity: 'Legendary', power: 7, cost: NP({ scrap: 260, embers: 200 }), level: 4, zone: 'industrial',   rounds: 4, interval: 1000, magazine: 45, spread: 3.5, falloff: 0.88, noise: 96,  handling: NP({ adsMs: 240, recoveryMs: 620, aimMoveScale: 0.48 }), from: '#185' }),
  heavy_machine_gun: NP({ tier: 4, label: 'Heavy Machine Gun', rarity: 'Mythic',    power: 9, cost: NP({ scrap: 400, embers: 350 }), level: 5, zone: 'research_lab', rounds: 5, interval: 1050, magazine: 60, spread: 4.0, falloff: 0.9,  noise: 100, handling: NP({ adsMs: 360, recoveryMs: 820, aimMoveScale: 0.38 }), from: '#188 (HMG also in #185/#186/#187)' })
});
const ZONE_LABELS = NP({ industrial: 'Industrial Yard', research_lab: 'Sealed Research Annex' });

function isFirearmTier(id) { return typeof id === 'string' && Object.prototype.hasOwnProperty.call(FIREARM_TIERS, id); }
// Settlement development level: the refuge level the server derives from completed workdays.
function developmentLevel(base) { const n = Number(base?.level); return Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1; }
function unlockStatus(base, id) {
  if (!isFirearmTier(id)) return { unlocked: true, reason: null };
  const spec = FIREARM_TIERS[id];
  if (developmentLevel(base) < spec.level) return { unlocked: false, reason: 'weapon_requires_refuge_level_' + spec.level };
  const zones = Array.isArray(base?.exploration?.discoveredZones) ? base.exploration.discoveredZones : [];
  if (spec.zone && !zones.includes(spec.zone)) return { unlocked: false, reason: 'weapon_requires_zone_' + spec.zone };
  return { unlocked: true, reason: null };
}
function publicTiers() {
  return Object.keys(FIREARM_TIERS).map(id => { const s = FIREARM_TIERS[id]; return { id, tier: s.tier, label: s.label, rarity: s.rarity, power: s.power, cost: { ...s.cost }, level: s.level, zone: s.zone, zoneLabel: s.zone ? ZONE_LABELS[s.zone] : null, rounds: s.rounds, interval: s.interval, magazine: s.magazine }; });
}
module.exports = { FIREARM_TIERS, ZONE_LABELS, isFirearmTier, developmentLevel, unlockStatus, publicTiers };
