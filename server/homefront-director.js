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


// Server-authoritative encounter planning. This decides what a spawn request should
// create; it does not itself create entities or run a per-frame AI loop.
function planEncounter({ zoneId = 'outskirts', risk = 1, playerCount = 1, activeEncounters = 0, noise = 0, frontierDepth = 0, seed = 0 } = {}) {
  const names = ARCHETYPES[zoneId] || ARCHETYPES.outskirts;
  const boundedRisk = Math.max(1, Math.min(5, Math.floor(Number.isFinite(risk) ? risk : 1)));
  const players = Math.max(1, Math.min(8, Math.floor(Number.isFinite(playerCount) ? playerCount : 1)));
  const active = Math.max(0, Math.min(20, Math.floor(Number.isFinite(activeEncounters) ? activeEncounters : 0)));
  const noiseLevel = Math.max(0, Math.min(100, Number.isFinite(noise) ? noise : 0));
  // Risk bands describe the district, while frontierDepth provides a gradual ramp
  // as players push inward from the perimeter. It never overrides the local cap.
  const depthFactor = Math.max(0, Math.min(1, Number.isFinite(frontierDepth) ? frontierDepth / 100 : 0));
  const pressureBonus = Math.min(0.16, Math.max(0, (players - 1) * 0.025 + noiseLevel / 200 + depthFactor * 0.04 - active * 0.02));
  const specialWeight = Math.min(0.38, 0.09 + boundedRisk * 0.04 + pressureBonus * 0.35 + depthFactor * 0.015);
  const hostileWeight = Math.min(0.78, 0.37 + boundedRisk * 0.05 + pressureBonus);
  const hordeWeight = Math.max(0, hostileWeight - specialWeight);
  const roll = rand(hash('encounter:' + seed + ':' + zoneId + ':' + boundedRisk + ':' + players + ':' + active + ':' + noiseLevel + ':' + Math.round(depthFactor * 100)));
  const event = roll < specialWeight ? 'special_infected' : roll < hostileWeight ? 'infected_horde' : 'wandering_infected';
  const threat = Math.min(10, Math.max(1, Math.round(boundedRisk + depthFactor * 0.65 + (players - 1) * 0.5 + noiseLevel / 40 - active * 0.35)));
  return {
    zoneId: ARCHETYPES[zoneId] ? zoneId : 'outskirts',
    risk: boundedRisk,
    frontierDepth: Math.round(depthFactor * 100),
    pressure: Number((boundedRisk + depthFactor * 0.65 + (players - 1) * 0.5 + noiseLevel / 40).toFixed(2)),
    event,
    enemy: event === 'special_infected' ? names.special : event === 'infected_horde' ? names.horde : names.wanderer,
    weights: {
      special: Number(specialWeight.toFixed(3)),
      horde: Number(hordeWeight.toFixed(3)),
      wandering: Number((1 - hostileWeight).toFixed(3))
    },
    threat,
    recommendedMaxAlive: Math.min(18, 2 + boundedRisk * 2 + (players - 1) * 2),
    spawnIntervalMs: Math.max(4500, 18000 - boundedRisk * 2200 - (players - 1) * 900 - Math.round(depthFactor * 900)),
    pursuitRadius: 16 + boundedRisk * 5,
    retreatHealthRatio: boundedRisk >= 4 ? 0.08 : 0
  };
}


function advanceDirector(state = {}, context = {}) {
  const now = Number.isFinite(context.now) ? Math.max(0, context.now) : Date.now();
  const plan = planEncounter(context);
  const active = Math.max(0, Math.min(100, Math.floor(Number.isFinite(context.activeEncounters) ? context.activeEncounters : 0)));
  const lastSpawnAt = Math.max(0, Math.min(now, Number.isFinite(state.lastSpawnAt) ? state.lastSpawnAt : 0));
  const lastNoiseAt = Math.max(0, Math.min(now, Number.isFinite(context.lastNoiseAt) ? context.lastNoiseAt : 0));
  const noiseRecent = context.noise >= 55 || (lastNoiseAt > 0 && now - lastNoiseAt < 12000);
  let phase = plan.threat >= 7 || noiseRecent ? 'assault' : plan.threat >= 4 ? 'alert' : active > 0 ? 'engaged' : 'calm';
  let decision = 'hold';
  let reason = 'No spawn pressure requires a new infected.';
  const nextSpawnAt = lastSpawnAt + plan.spawnIntervalMs;
  if (active >= plan.recommendedMaxAlive) {
    decision = 'hold';
    reason = 'Local infected cap reached.';
  } else if (lastSpawnAt > 0 && now < nextSpawnAt) {
    decision = 'cooldown';
    reason = 'Director reinforcement interval has not elapsed.';
  } else if (phase === 'assault' || phase === 'alert' || active === 0) {
    decision = 'spawn';
    reason = noiseRecent ? 'Recent noise drew infected into the area.' : phase === 'assault' ? 'High-risk district pressure triggered an assault.' : phase === 'alert' ? 'Elevated district pressure triggered a reinforcement.' : 'Area is clear; maintain baseline infected presence.';
  }
  const nextState = {
    phase,
    lastSpawnAt: decision === 'spawn' ? now : lastSpawnAt,
    lastNoiseAt,
    activeEncounters: active,
    nextSpawnAt: decision === 'spawn' ? now + plan.spawnIntervalMs : nextSpawnAt,
    lastDecision: decision
  };
  return { state: nextState, decision, reason, plan };
}

function planHorde({ event = 'wandering_infected', risk = 1, seed = 0 } = {}) {
  const boundedRisk = Math.max(1, Math.min(5, Math.floor(Number.isFinite(risk) ? risk : 1)));
  const count = event === 'infected_horde' ? Math.min(5, 2 + Math.floor((boundedRisk - 1) / 2)) : 1;
  const roles = event === 'special_infected' ? ['leader'] : ['stalker', 'flanker', 'bruiser', 'straggler', 'runner'];
  const spacing = 2.4 + boundedRisk * 0.15;
  const members = [];
  for (let i = 0; i < count; i++) {
    const angle = ((hash('horde:' + seed + ':' + i) % 360) * Math.PI) / 180;
    const ring = i === 0 ? 0 : spacing * (1 + Math.floor((i - 1) / 4));
    const role = roles[i % roles.length];
    members.push({ slot: i, role, id: 'pack-' + hash(String(seed) + ':' + i).toString(36),
      offsetX: Math.round(Math.cos(angle) * ring * 10) / 10,
      offsetZ: Math.round(Math.sin(angle) * ring * 10) / 10,
      healthScale: role === 'bruiser' ? 1.25 : role === 'runner' ? 0.72 : 1,
      speedScale: role === 'runner' || role === 'flanker' ? 1.2 : role === 'bruiser' ? 0.78 : 1 });
  }
  return { count, cohesionRadius: 10 + boundedRisk * 2, regroupRadius: 16 + boundedRisk * 2, members };
}

module.exports = { ARCHETYPES, QUALITY_ORDER, resolveDirectorLoot, planEncounter, planHorde, advanceDirector };
