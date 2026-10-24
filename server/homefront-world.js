// Shared, persistent XRPL Graveyard expedition world for Homefront.
'use strict';
const crypto = require('crypto');
const Combat = require('./homefront-combat');
const Survival = require('./homefront-survival');
const Inventory = require('./homefront-inventory');
const Loot = require('./homefront-loot');
const Terrain = require('./homefront-terrain');
const Collision = require('./homefront-collision');
const Interiors = require('./homefront-interiors');
const Environment = require('./homefront-environment');
const Director = require('./homefront-director');
const WORLD_SIZE = 100;
const PRESENCE_TTL = 45_000;
const MOVE_STEP = 12;
const SPRINT_STEP = 18;
const AIM_MOVE_SCALE = Object.freeze({ pipe_blade: 0.62, pump_shotgun: 0.52, marksman_rifle: 0.42, shock_maul: 0.56 });
const AIM_RECOVERY_MS = 700;
const SPRINT_RECOVERY_MS = 1450;
const SPAWNS = [
  { id: 'north_gate', label: 'North Gate', x: -8, z: -82 },
  { id: 'river_road', label: 'River Road', x: 76, z: -20 },
  { id: 'wrecked_depot', label: 'Wrecked Depot', x: 14, z: 86 },
  { id: 'old_rail', label: 'Old Rail Yard', x: -84, z: 18 },
  { id: 'east_checkpoint', label: 'East Checkpoint', x: 58, z: 58 },
  { id: 'west_underpass', label: 'West Underpass', x: -58, z: -55 }
];
const DISTRICTS = [
  { id: 'perimeter', label: 'Safe Perimeter', radius: 25, risk: 1 },
  { id: 'outskirts', label: 'City Outskirts', radius: 45, risk: 1 },
  { id: 'residential', label: 'Residential Ruins', radius: 62, risk: 2 },
  { id: 'commercial', label: 'Market District', radius: 76, risk: 3 },
  { id: 'industrial', label: 'Industrial Belt', radius: 88, risk: 4 },
  { id: 'graveyard_core', label: 'Graveyard Core', radius: 101, risk: 5 }
];
const POINTS_OF_INTEREST = [
  { id: 'north_bus_depot', label: 'North Bus Depot', type: 'scavenge', zone: 'outskirts', x: -8, z: -65, risk: 1 },
  { id: 'river_checkpoint', label: 'River Checkpoint', type: 'scavenge', zone: 'outskirts', x: 62, z: -20, risk: 1 },
  { id: 'wrecked_depot', label: 'Wrecked Depot', type: 'scavenge', zone: 'outskirts', x: 14, z: 72, risk: 1 },
  { id: 'old_rail_yard', label: 'Old Rail Yard', type: 'scavenge', zone: 'outskirts', x: -73, z: 17, risk: 1 },
  { id: 'west_underpass', label: 'West Underpass', type: 'scavenge', zone: 'outskirts', x: -60, z: -55, risk: 1 },
  { id: 'east_checkpoint', label: 'East Checkpoint', type: 'scavenge', zone: 'outskirts', x: 55, z: 55, risk: 1 },
  { id: 'cache_exchange', label: 'Exchange Supply Cache', type: 'cache', zone: 'commercial', x: -32, z: 24, risk: 2 },
  { id: 'cache_hospital', label: 'Hospital Emergency Locker', type: 'cache', zone: 'hospital', x: 19, z: 25, risk: 3 },
  { id: 'cache_ironworks', label: 'Ironworks Secure Crate', type: 'cache', zone: 'industrial', x: -12, z: 18, risk: 4 },
  { id: 'stranded_bus', label: 'Stranded Bus Survivors', type: 'rescue', zone: 'outskirts', x: 35, z: -42, risk: 1 },
  { id: 'collapsed_apartments', label: 'Collapsed Apartments', type: 'rescue', zone: 'residential', x: -22, z: 48, risk: 2 },
  { id: 'quarantine_shelter', label: 'Quarantine Shelter', type: 'rescue', zone: 'hospital', x: 36, z: 38, risk: 3 },
  { id: 'mercy_hospital', label: 'St. Mercy Hospital', type: 'medical', zone: 'hospital', x: 24, z: 30, risk: 3 },
  { id: 'exchange_market', label: 'Exchange Market', type: 'scavenge', zone: 'commercial', x: -38, z: 32, risk: 3 },
  { id: 'ironworks', label: 'Ironworks Yard', type: 'industrial', zone: 'industrial', x: -16, z: 22, risk: 4 },
  { id: 'buried_subway', label: 'Buried Subway', type: 'boss', zone: 'subway', x: 6, z: -8, risk: 5 },
  { id: 'research_annex', label: 'Sealed Research Annex', type: 'boss', zone: 'research_lab', x: -4, z: 6, risk: 5 }
];
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
const defaultWorld = () => ({ version: 1, players: {}, parties: {}, encounters: {}, lootNodes: {}, environmentStructures: {} });
function normalizeWorld(input) {
  const w = input && input.version === 1 ? input : defaultWorld();
  if (!w.players || typeof w.players !== 'object' || Array.isArray(w.players)) w.players = {};
  if (!w.parties || typeof w.parties !== 'object' || Array.isArray(w.parties)) w.parties = {};
  w.encounters = Combat.normalizeEncounters(w.encounters);
  w.lootNodes = Loot.normalize(w.lootNodes);
  w.environmentStructures = Environment.normalize(w.environmentStructures);
  if (!w.bosses || typeof w.bosses !== 'object' || Array.isArray(w.bosses)) w.bosses = {};
  if (!w.caches || typeof w.caches !== 'object' || Array.isArray(w.caches)) w.caches = {};
  for (const point of POINTS_OF_INTEREST.filter(p => p.type === 'cache')) {
    const cache = w.caches[point.id];
    w.caches[point.id] = { readyAt: Number.isFinite(cache?.readyAt) ? clamp(cache.readyAt, 0, Number.MAX_SAFE_INTEGER) : 0 };
  }
  if (!w.rescues || typeof w.rescues !== 'object' || Array.isArray(w.rescues)) w.rescues = {};
  for (const point of POINTS_OF_INTEREST.filter(p => p.type === 'rescue')) {
    const rescue = w.rescues[point.id];
    w.rescues[point.id] = { readyAt: Number.isFinite(rescue?.readyAt) ? clamp(rescue.readyAt, 0, Number.MAX_SAFE_INTEGER) : 0 };
  }
  for (const [id, maxHp] of [['buried_subway', 180], ['research_annex', 240]]) { const b = w.bosses[id]; if (!b || typeof b !== 'object') w.bosses[id] = { hp: maxHp, maxHp, respawnAt: 0 }; else { b.maxHp = maxHp; b.hp = clamp(b.hp, 0, maxHp); b.respawnAt = clamp(b.respawnAt, 0, Number.MAX_SAFE_INTEGER); } }
  for (const [acct, p] of Object.entries(w.players)) {
    if (!p || typeof p !== 'object') { delete w.players[acct]; continue; }
    p.x = clamp(p.x, -WORLD_SIZE, WORLD_SIZE); p.z = clamp(p.z, -WORLD_SIZE, WORLD_SIZE);
    p.lastSeen = Number.isFinite(p.lastSeen) ? p.lastSeen : 0;
    p.partyCode = typeof p.partyCode === 'string' ? p.partyCode : null;
    p.spawn = SPAWNS.some(s => s.id === p.spawn) ? p.spawn : SPAWNS[hash(acct) % SPAWNS.length].id;
    const savedInterior = w.interiors?.[acct];
    const activeInteriorId = savedInterior?.activeLandmarkId || null;
    const activeInteriorState = activeInteriorId ? savedInterior.interiors?.[activeInteriorId] : null;
    const interiorRemoved = Collision.INTERIOR_OBSTACLE_IDS.filter(id => !activeInteriorId || id.split(':')[1] !== activeInteriorId || (id.startsWith('interior-door:') && activeInteriorState?.openedDoors?.includes(id.split(':')[2])));
    if (activeInteriorId) interiorRemoved.push(...(Collision.INTERIOR_CARVE_IDS[activeInteriorId] || []));
    if (!Collision.isSafePosition(p.x, p.z, { bounds: WORLD_SIZE, removedObstacleIds: interiorRemoved })) {
      const anchor = SPAWNS.find(s => s.id === p.spawn) || chooseSpawn(w, acct);
      const recovered = Collision.findSafePosition(anchor.x, anchor.z, { bounds: WORLD_SIZE }) || Collision.findSafePosition(0, 0, { bounds: WORLD_SIZE });
      if (!recovered) throw new Error('no_safe_spawn_location');
      p.x = recovered.x; p.z = recovered.z;
    }
    p.lastMove = Number.isFinite(p.lastMove) ? p.lastMove : 0;
    p.directorState = p.directorState && typeof p.directorState === 'object' ? p.directorState : {};
    p.lastNoiseAt = Number.isFinite(p.lastNoiseAt) ? clamp(p.lastNoiseAt, 0, Number.MAX_SAFE_INTEGER) : 0;
    p.noiseLevel = clamp(p.noiseLevel, 0, 100);
    p.noiseX = clamp(p.noiseX ?? p.x, -WORLD_SIZE, WORLD_SIZE);
    p.noiseZ = clamp(p.noiseZ ?? p.z, -WORLD_SIZE, WORLD_SIZE);
    p.aiming = p.aiming === true;
    p.aimStartedAt = p.aiming && Number.isFinite(p.aimStartedAt) ? clamp(p.aimStartedAt, 0, Number.MAX_SAFE_INTEGER) : 0;
    p.lastSprintAt = Number.isFinite(p.lastSprintAt) ? clamp(p.lastSprintAt, 0, Number.MAX_SAFE_INTEGER) : 0;
    p.accuracyRecoverUntil = Number.isFinite(p.accuracyRecoverUntil) ? clamp(p.accuracyRecoverUntil, 0, Number.MAX_SAFE_INTEGER) : 0;
    p.survival = Survival.normalize(p.survival, p.lastSeen || Date.now());
    p.inventory = Inventory.normalize(p.inventory);
    if (typeof p.inventoryInitialized !== 'boolean') p.inventoryInitialized = true;
    const magazine = p.weaponMagazine && typeof p.weaponMagazine === 'object' ? p.weaponMagazine : {};
    const magazineWeapon = Object.prototype.hasOwnProperty.call(Combat.WEAPON_MAGAZINE_CAPACITY, magazine.weaponId) ? magazine.weaponId : 'pipe_blade';
    p.weaponMagazine = { weaponId: magazineWeapon, loaded: clamp(magazine.loaded, 0, Combat.WEAPON_MAGAZINE_CAPACITY[magazineWeapon]) };
  }
  for (const [code, party] of Object.entries(w.parties)) {
    if (!party || typeof party !== 'object' || !Array.isArray(party.members)) { delete w.parties[code]; continue; }
    party.members = [...new Set(party.members.filter(a => typeof a === 'string'))].slice(0, 4);
    party.leader = party.members.includes(party.leader) ? party.leader : party.members[0];
    if (!party.members.length) delete w.parties[code];
  }
  // A player's partyCode must point at a party that lists them; otherwise they would be stuck
  // "following" a party they are not in (movement locked, cannot create or join another).
  for (const [acct, p] of Object.entries(w.players)) if (p.partyCode && !w.parties[p.partyCode]?.members.includes(acct)) p.partyCode = null;
  // A member can only sit in one party: keep the first listing, drop later duplicates.
  const seen = new Set();
  for (const [code, party] of Object.entries(w.parties)) {
    party.members = party.members.filter(a => { if (seen.has(a) || (w.players[a] && w.players[a].partyCode !== code)) return false; seen.add(a); return true; });
    if (!party.members.length) delete w.parties[code];
    else if (!party.members.includes(party.leader)) party.leader = party.members[0];
  }
  return w;
}
function prune(w, now) {
  for (const [acct, p] of Object.entries(w.players)) if (now - p.lastSeen > PRESENCE_TTL) delete w.players[acct];
  for (const [code, party] of Object.entries(w.parties)) {
    party.members = party.members.filter(acct => !!w.players[acct]);
    if (!party.members.length) delete w.parties[code];
    else if (!party.members.includes(party.leader)) party.leader = party.members[0];
  }
}
function districtAt(x, z) {
  const depth = WORLD_SIZE - Math.hypot(x, z);
  return DISTRICTS.find(v => depth <= v.radius) || DISTRICTS[DISTRICTS.length - 1];
}
function findSafePosition(x, z) {
  const candidates = [{ x, z }];
  // Search concentric, deterministic rings. This keeps recovery predictable and bounded.
  for (let radius = 2; radius <= 18; radius += 2) {
    for (let step = -radius; step <= radius; step += 2) {
      candidates.push({ x: x + step, z: z - radius }, { x: x + step, z: z + radius });
      if (Math.abs(step) < radius) candidates.push({ x: x - radius, z: z + step }, { x: x + radius, z: z + step });
    }
  }
  for (const point of candidates) {
    const px = clamp(point.x, -WORLD_SIZE, WORLD_SIZE), pz = clamp(point.z, -WORLD_SIZE, WORLD_SIZE);
    if (Terrain.isSafePosition(px, pz, { bounds: WORLD_SIZE })) return { x: Math.round(px * 10) / 10, z: Math.round(pz * 10) / 10 };
  }
  return null;
}
function chooseSafeSpawn(w, acct) {
  const preferred = chooseSpawn(w, acct);
  const ordered = [preferred, ...SPAWNS.filter(s => s.id !== preferred.id)];
  for (const spawn of ordered) {
    const position = Collision.findSafePosition(spawn.x, spawn.z, { bounds: WORLD_SIZE });
    if (position) return { spawn, position };
  }
  throw new Error('no_safe_spawn_location');
}
function chooseSpawn(w, acct) {
  const counts = new Map(SPAWNS.map(s => [s.id, 0]));
  for (const p of Object.values(w.players)) if (counts.has(p.spawn)) counts.set(p.spawn, counts.get(p.spawn) + 1);
  const min = Math.min(...counts.values());
  const candidates = SPAWNS.filter(s => counts.get(s.id) === min);
  return candidates[hash(acct) % candidates.length];
}
function publicPlayer(acct, p, me, now) {
  const d = districtAt(p.x, p.z);
  // The safe perimeter lies around the outer edge; depth measures inward expansion.
  const frontierDepth = Math.round(clamp(WORLD_SIZE - Math.hypot(p.x, p.z), 0, WORLD_SIZE));
  const frontierBand = frontierDepth < 25 ? 'perimeter' : frontierDepth < 45 ? 'outer ring' : frontierDepth < 63 ? 'inner blocks' : frontierDepth < 80 ? 'deep city' : 'core approach';
  return { id: 'survivor-' + hash(acct).toString(36).slice(0, 7), label: acct === me ? 'You' : 'Survivor-' + hash(acct).toString(36).slice(0, 5), x: p.x, z: p.z, district: d.id, risk: d.risk, frontierDepth, frontierBand, spawn: p.spawn, party: !!p.partyCode, online: now - p.lastSeen <= PRESENCE_TTL };
}
function nearestPoint(x, z, type = null) { const points = POINTS_OF_INTEREST.filter(p => !type || (type === 'non-boss' ? p.type !== 'boss' : p.type === type)); let best = null; for (const point of points) { const distance = Math.hypot(point.x - x, point.z - z); if (!best || distance < best.distance) best = { point, distance }; } return best; }
function tickDirector(w, acct, now = Date.now()) {
  const p = w.players[acct];
  if (!p) return null;
  const district = districtAt(p.x, p.z);
  const zoneId = district.id === 'graveyard_core' ? 'research_lab' : district.id === 'perimeter' ? 'outskirts' : district.id;
  const frontierDepth = clamp(WORLD_SIZE - Math.hypot(p.x, p.z), 0, WORLD_SIZE);
  const active = Object.values(Combat.normalizeEncounters(w.encounters, now)).filter(e => !e.defeated && e.hp > 0 && e.owner === acct).length;
  const elapsed = Math.max(0, now - (p.lastNoiseAt || now));
  const noise = Math.max(0, (p.noiseLevel || 0) - elapsed / 120);
  const tick = Director.advanceDirector(p.directorState, {
    zoneId, risk: district.risk, frontierDepth, playerCount: p.partyCode && w.parties[p.partyCode] ? w.parties[p.partyCode].members.length : 1,
    activeEncounters: active, noise, lastNoiseAt: p.lastNoiseAt, now,
    seed: acct + ':' + district.id + ':' + Math.floor(p.x / 12) + ':' + Math.floor(p.z / 12) + ':' + Math.floor(now / 5000)
  });
  p.directorState = tick.state;
  if (tick.decision === 'spawn' && active === 0) {
    const spawned = Combat.spawn({ encounters: w.encounters, account: acct, player: p, now, seed: tick.plan.threat });
    w.encounters = spawned.encounters;
    p.directorState.lastSpawnAt = now;
    p.directorState.nextSpawnAt = now + tick.plan.spawnIntervalMs;
    p.directorState.lastDecision = 'spawn';
  }
  return { phase: tick.state.phase, decision: tick.decision, reason: tick.reason, threat: tick.plan.threat, pressure: tick.plan.pressure, risk: tick.plan.risk, zoneId: tick.plan.zoneId, recommendedMaxAlive: tick.plan.recommendedMaxAlive, spawnIntervalMs: tick.plan.spawnIntervalMs, nextSpawnAt: p.directorState.nextSpawnAt || 0, noise: Math.round(noise) };
}
function recordNoise(input, acct, level = 75, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  const p = w.players[acct];
  if (!p) throw new Error('not_in_expedition');
  p.noiseLevel = Math.max(p.noiseLevel || 0, clamp(level, 0, 100));
  p.lastNoiseAt = now;
  p.lastSeen = now;
  return w;
}
function snapshot(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct] || null;
  const party = p?.partyCode && w.parties[p.partyCode];
  return {
    world: { width: WORLD_SIZE * 2, height: WORLD_SIZE * 2, districts: DISTRICTS, spawns: SPAWNS, pointsOfInterest: POINTS_OF_INTEREST, lootNodes: Loot.publicNodes(w.lootNodes, now), environmentStructures: Environment.nearby(w.environmentStructures, p?.x ?? 0, p?.z ?? 0), bosses: w.bosses, caches: w.caches, rescues: w.rescues },
    players: Object.entries(w.players).map(([id, player]) => publicPlayer(id, player, acct, now)).filter(v => v.online),
    self: p ? publicPlayer(acct, p, acct, now) : null,
    director: p ? { phase: p.directorState?.phase || 'calm', lastDecision: p.directorState?.lastDecision || 'hold', nextSpawnAt: p.directorState?.nextSpawnAt || 0, noise: Math.round(Math.max(0, (p.noiseLevel || 0) - Math.max(0, now - (p.lastNoiseAt || now)) / 120)) } : null,
    party: party ? { code: p.partyCode, leader: party.leader === acct, members: party.members.map(id => publicPlayer(id, w.players[id] || {x:0,z:0,spawn:SPAWNS[0].id,lastSeen:0,partyCode:p.partyCode}, acct, now)) } : null,
    encounters: Object.values(Combat.normalizeEncounters(w.encounters, now)).filter(e => !e.defeated && e.hp > 0).map(Combat.publicEncounter),
    selfEncounter: Combat.publicEncounter(w.encounters?.[acct]),
    selfSurvival: p ? { ...p.survival } : null,
    selfInventory: p ? { ...Inventory.normalize(p.inventory), used: Inventory.used(p.inventory), capacity: Inventory.CAPACITY } : null,
    selfWeaponMagazine: p ? { ...p.weaponMagazine, capacity: Combat.WEAPON_MAGAZINE_CAPACITY[p.weaponMagazine?.weaponId] || 0 } : null,
    selfWeaponHandling: p ? { aiming: p.aiming, aimStartedAt: p.aimStartedAt, lastSprintAt: p.lastSprintAt, accuracyRecoverUntil: p.accuracyRecoverUntil } : null,
    interior: p ? Interiors.publicState(w.interiors, acct) : null
  };
}
function enter(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  let p = w.players[acct];
  if (!p) {
    if (w.interiors?.[acct]) w.interiors[acct].activeLandmarkId = null;
    const safeSpawn = chooseSafeSpawn(w, acct), spawn = safeSpawn.spawn, position = safeSpawn.position;
    p = w.players[acct] = { x: position.x, z: position.z, spawn: spawn.id, lastSeen: now, lastMove: now, partyCode: null, inventory: {}, inventoryInitialized: false, weaponMagazine: { weaponId: 'pipe_blade', loaded: 0 }, aiming: false, aimStartedAt: 0, lastSprintAt: 0, accuracyRecoverUntil: 0 };
  }
  p.lastSeen = now;
  p.survival = Survival.tick(p.survival, now);
  // Party joins establish formation in joinParty(). Presence refreshes must not snap
  // followers to the leader: their position is advanced by bounded, collision-aware
  // movement in move(), not by polling this endpoint.
  // Refreshes advance bounded pursuit too, so infected do not require player movement to update.
  w.encounters = Combat.advance({ encounters: w.encounters, players: w.players, interiors: w.interiors, now });
  tickDirector(w, acct, now);
  w.environmentStructures = Environment.tick(w.environmentStructures, w.players, now);
  return { world: w, result: snapshot(w, acct, now) };
}
function advanceAlongTerrainPath(startX, startZ, path, distanceBudget) {
  let x = startX, z = startZ, remaining = distanceBudget;
  for (const waypoint of path) {
    const dx = waypoint.x - x, dz = waypoint.z - z, distance = Math.hypot(dx, dz);
    if (distance < 0.001) continue;
    if (distance <= remaining) {
      x = waypoint.x; z = waypoint.z; remaining -= distance;
      if (remaining < 0.001) break;
    } else {
      x += dx / distance * remaining; z += dz / distance * remaining;
      break;
    }
  }
  return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 };
}
function move(input, acct, x, z, now = Date.now(), sprint = false) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct];
  if (!p) throw new Error('not_in_expedition');
  if (p.partyCode && w.parties[p.partyCode] && w.parties[p.partyCode].leader !== acct) throw new Error('party_leader_controls_movement');
  if (typeof sprint !== 'boolean') throw new Error('invalid_movement_mode');
  if (now - p.lastMove < 900) throw new Error('move_cooldown');
  if (sprint && p.aiming) throw new Error('lower_weapon_before_sprinting');
  const weaponId = p.weaponMagazine?.weaponId || 'pipe_blade';
  const movementBudget = p.aiming ? MOVE_STEP * (AIM_MOVE_SCALE[weaponId] || 0.55) : sprint ? SPRINT_STEP : MOVE_STEP;
  let nx = clamp(x, -WORLD_SIZE, WORLD_SIZE), nz = clamp(z, -WORLD_SIZE, WORLD_SIZE);
  const radius = Math.hypot(nx, nz); if (radius > WORLD_SIZE) { nx = nx / radius * WORLD_SIZE; nz = nz / radius * WORLD_SIZE; }
  const dx = nx - p.x, dz = nz - p.z, d = Math.hypot(dx, dz);
  const scale = d > movementBudget ? movementBudget / d : 1;
  const oldX = p.x, oldZ = p.z;
  let nextX = Math.round((p.x + dx * scale) * 10) / 10, nextZ = Math.round((p.z + dz * scale) * 10) / 10;
  const removedObstacleIds = Object.values(w.environmentStructures).filter(s => s.health <= 0).map(s => s.id);
  const activeInteriorOwner = w.interiors?.[acct];
  const activeInteriorId = activeInteriorOwner?.activeLandmarkId || null;
  const activeInteriorState = activeInteriorId ? activeInteriorOwner.interiors?.[activeInteriorId] : null;
  removedObstacleIds.push(...Collision.INTERIOR_OBSTACLE_IDS.filter(id => !activeInteriorId || id.split(':')[1] !== activeInteriorId || (id.startsWith('interior-door:') && activeInteriorState?.openedDoors?.includes(id.split(':')[2]))));
  if (activeInteriorId) removedObstacleIds.push(...(Collision.INTERIOR_CARVE_IDS[activeInteriorId] || []));
  if (!Terrain.canTraverse(oldX, oldZ, nextX, nextZ) || !Collision.canTraverse(oldX, oldZ, nextX, nextZ, { bounds: WORLD_SIZE, removedObstacleIds })) {
    const route = Collision.findPath(oldX, oldZ, nx, nz, { bounds: WORLD_SIZE, maxExpanded: 2600, removedObstacleIds });
    if (!route || !route.length) throw new Error('terrain_path_unreachable');
    const advanced = advanceAlongTerrainPath(oldX, oldZ, route, movementBudget);
    nextX = advanced.x; nextZ = advanced.z;
    if (!Terrain.canTraverse(oldX, oldZ, nextX, nextZ) || !Collision.canTraverse(oldX, oldZ, nextX, nextZ, { bounds: WORLD_SIZE, removedObstacleIds })) throw new Error('terrain_path_blocked');
  }
  p.x = nextX; p.z = nextZ;
  p.lastMove = p.lastSeen = now;
  if (sprint) { p.lastSprintAt = now; p.accuracyRecoverUntil = now + SPRINT_RECOVERY_MS; }
  else p.accuracyRecoverUntil = Math.max(p.accuracyRecoverUntil || 0, now + AIM_RECOVERY_MS);
  p.aiming = false; p.aimStartedAt = 0;
  p.survival = Survival.move(p.survival, now, Math.hypot(p.x - oldX, p.z - oldZ) * (sprint ? 1.55 : 1));
  if (p.partyCode && w.parties[p.partyCode] && w.parties[p.partyCode].leader === acct) {
    for (const member of w.parties[p.partyCode].members) if (member !== acct && w.players[member]) {
      const offsetX = (hash(member) % 7) - 3;
      const offsetZ = (hash(member + 'z') % 7) - 3;
      const followerState = w.players[member];
      const targetX = clamp(p.x + offsetX, -WORLD_SIZE, WORLD_SIZE);
      const targetZ = clamp(p.z + offsetZ, -WORLD_SIZE, WORLD_SIZE);
      const followerRemoved = Object.values(w.environmentStructures).filter(s => s.health <= 0).map(s => s.id);
      const followerInteriorOwner = w.interiors?.[member];
      const followerInteriorId = followerInteriorOwner?.activeLandmarkId || null;
      const followerInteriorState = followerInteriorId ? followerInteriorOwner.interiors?.[followerInteriorId] : null;
      followerRemoved.push(...Collision.INTERIOR_OBSTACLE_IDS.filter(id =>
        !followerInteriorId || id.split(':')[1] !== followerInteriorId ||
        (id.startsWith('interior-door:') && followerInteriorState?.openedDoors?.includes(id.split(':')[2]))));
      if (followerInteriorId) followerRemoved.push(...(Collision.INTERIOR_CARVE_IDS[followerInteriorId] || []));
      const route = Collision.findPath(followerState.x, followerState.z, targetX, targetZ, {
        bounds: WORLD_SIZE, maxExpanded: 900, removedObstacleIds: followerRemoved
      });
      if (route?.length) {
        const step = Math.min(Math.hypot(targetX - followerState.x, targetZ - followerState.z), MOVE_STEP);
        const next = advanceAlongTerrainPath(followerState.x, followerState.z, route, step);
        if (Terrain.canTraverse(followerState.x, followerState.z, next.x, next.z) &&
            Collision.canTraverse(followerState.x, followerState.z, next.x, next.z, {
              bounds: WORLD_SIZE, removedObstacleIds: followerRemoved
            })) {
          followerState.x = next.x; followerState.z = next.z;
        }
      }
      followerState.lastSeen = now;
    }
  }
  // Advance AI only on an authoritative world action; no client frame loop can move enemies.
  w.encounters = Combat.advance({ encounters: w.encounters, players: w.players, interiors: w.interiors, now });
  tickDirector(w, acct, now);
  w.environmentStructures = Environment.tick(w.environmentStructures, w.players, now);
  return { world: w, result: snapshot(w, acct, now) };
}

function setAiming(input, acct, aiming, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct];
  if (!p) throw new Error('not_in_expedition');
  if (typeof aiming !== 'boolean') throw new Error('invalid_aim_state');
  if (aiming) {
    if (p.lastMove && now - p.lastMove < 250) throw new Error('aim_recovering_from_movement');
    p.aiming = true;
    p.aimStartedAt = now;
  } else {
    p.aiming = false;
    p.aimStartedAt = 0;
  }
  p.lastSeen = now;
  return { world: w, result: snapshot(w, acct, now) };
}
function createParty(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct];
  if (!p) throw new Error('not_in_expedition');
  if (p.partyCode && w.parties[p.partyCode]) throw new Error('already_in_party');
  let code = crypto.randomBytes(3).toString('hex').toUpperCase();
  while (w.parties[code]) code = crypto.randomBytes(3).toString('hex').toUpperCase();
  w.parties[code] = { leader: acct, members: [acct], createdAt: now };
  p.partyCode = code; p.lastSeen = now;
  return { world: w, result: snapshot(w, acct, now) };
}
function joinParty(input, acct, code, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct], key = typeof code === 'string' ? code.trim().toUpperCase() : '';
  const party = w.parties[key];
  if (!p) throw new Error('not_in_expedition');
  if (!party) throw new Error('party_not_found');
  if (p.partyCode && w.parties[p.partyCode]) throw new Error('already_in_party');
  if (party.members.length >= 4) throw new Error('party_full');
  party.members.push(acct); p.partyCode = key;
  const leader = w.players[party.leader];
  if (leader) { p.x = leader.x; p.z = leader.z; p.spawn = leader.spawn; }
  p.lastSeen = now;
  return { world: w, result: snapshot(w, acct, now) };
}
// Leave the party but stay in the expedition (movement control returns to this player).
function leaveParty(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct];
  if (!p) throw new Error('not_in_expedition');
  const party = p.partyCode && w.parties[p.partyCode];
  if (!party) throw new Error('not_in_party');
  party.members = party.members.filter(id => id !== acct);
  if (!party.members.length) delete w.parties[p.partyCode];
  else if (party.leader === acct) party.leader = party.members[0];
  p.partyCode = null; p.lastSeen = now;
  return { world: w, result: snapshot(w, acct, now) };
}
function leave(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  if (w.interiors?.[acct]) w.interiors[acct].activeLandmarkId = null;
  const p = w.players[acct];
  if (p?.partyCode && w.parties[p.partyCode]) {
    const party = w.parties[p.partyCode];
    party.members = party.members.filter(id => id !== acct);
    if (!party.members.length) delete w.parties[p.partyCode];
    else if (party.leader === acct) party.leader = party.members[0];
  }
  delete w.players[acct];
  return { world: w, result: snapshot(w, acct, now) };
}
module.exports = { WORLD_SIZE, PRESENCE_TTL, MOVE_STEP, SPRINT_STEP, AIM_MOVE_SCALE, AIM_RECOVERY_MS, SPRINT_RECOVERY_MS, SPAWNS, DISTRICTS, POINTS_OF_INTEREST, defaultWorld, normalizeWorld, districtAt, nearestPoint, snapshot, enter, move, setAiming, createParty, joinParty, leaveParty, leave, tickDirector, recordNoise };
