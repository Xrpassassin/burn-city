'use strict';

// Deterministic Homefront Director flavour and salvage. This is deliberately
// renderer-independent so encounter rules remain testable and server-owned.
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rand = seed => { let x = seed >>> 0; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; };

const ARCHETYPES = Object.freeze({
  outskirts: { special: 'Ragetooth Runner', horde: 'Roadside Pack', wanderer: 'Stray Runner' },
  residential: { special: 'Window Stalker', horde: 'Hollow Family', wanderer: 'Roofline Stalker' },
  commercial: { special: 'Market Screamer', horde: 'Crowd of the Lost', wanderer: 'Alley Lurker' },
  hospital: { special: 'Ward Howler', horde: 'Quarantine Swarm', wanderer: 'Pale Orderly' },
  industrial: { special: 'Ironhide Brute', horde: 'Foundry Pack', wanderer: 'Scrap Crawler' },
  subway: { special: 'Tunnel Burrower', horde: 'Trackside Surge', wanderer: 'Signal Lurker' },
  research_lab: { special: 'Containment Warden', horde: 'Blacksite Swarm', wanderer: 'Specimen Nine' }
});

const QUALITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'];

function resolveDirectorLoot({ event, zoneId, risk, rewardMultiplier = 1, combatPower = 1, seed = 0 }) {
  const names = ARCHETYPES[zoneId] || ARCHETYPES.outskirts;
  if (!['special_infected', 'infected_horde', 'wandering_infected'].includes(event)) {
    return { enemy: null, quality: null, scrap: 0, embers: 0, description: 'No hostile contact.' };
  }
  const enemy = event === 'special_infected' ? names.special : event === 'infected_horde' ? names.horde : names.wanderer;
  if (event === 'wandering_infected') {
    return { enemy, quality: null, scrap: 0, embers: 0, description: enemy + ' spotted at a distance.' };
  }
  // The ambush is costly, but a successful push-through yields salvage. The
  // reward is modest and deterministic; high risk/difficulty improve its grade.
  const qualityScore = rand(hash('quality:' + seed));
  const qualityBonus = Math.min(0.22, Math.max(0, risk - 1) * 0.035 + Math.max(0, rewardMultiplier - 1) * 0.08 + Math.max(0, combatPower - 1) * 0.012);
  const qualityRoll = qualityScore - qualityBonus;
  const quality = qualityRoll < 0.006 ? 'Legendary' : qualityRoll < 0.035 ? 'Epic' : qualityRoll < 0.13 ? 'Rare' : qualityRoll < 0.34 ? 'Uncommon' : 'Common';
  const qualityIndex = QUALITY_ORDER.indexOf(quality);
  const scrap = Math.max(1, Math.floor((2 + risk + qualityIndex) * rewardMultiplier));
  const embers = Math.max(0, Math.floor((risk + qualityIndex) * rewardMultiplier));
  return { enemy, quality, scrap, embers, description: enemy + ' pushed through; recovered ' + quality.toLowerCase() + '-grade salvage.' };
}

module.exports = { ARCHETYPES, QUALITY_ORDER, resolveDirectorLoot };
