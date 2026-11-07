// Shared, persistent XRPL Graveyard expedition world for Homefront.
'use strict';
const crypto = require('crypto');
const Combat = require('./homefront-combat');
const Companions = require('./homefront-companions');
const Vehicles = require('./homefront-vehicles');
const Survival = require('./homefront-survival');
const CindersEffects = require('./homefront-cinders-effects');
const Inventory = require('./homefront-inventory');
const Loot = require('./homefront-loot');
const FieldSurveys = require('./homefront-field-surveys');
const Terrain = require('./homefront-terrain');
const Collision = require('./homefront-collision');
const Interiors = require('./homefront-interiors');
const InteriorEvents = require('./homefront-interior-events');
const Environment = require('./homefront-environment');
const Director = require('./homefront-director');
const Travel = require('./homefront-travel');
const { PINE_CROSSING_BUILDINGS, inPineCrossing, pineSurfaceAt } = require('../client/arena/homefront-pine-crossing.mjs');
const InputStep = require('./homefront-input-step');
const { ZOMBIE_WALK_SPEED, ZOMBIE_FAST_SPEED } = require('../client/arena/zombie-locomotion.mjs');
const WORLD_SIZE = 100;
const PRESENCE_TTL = 45_000;
const MOVE_STEP = 12;
const SPRINT_STEP = 18;
const INPUT_MIN_INTERVAL_MS = 75;
function inputReadyInMs(player, now = Date.now()) {
  if (!player) return 0;
  const direct = player.lastMoveMode === 'input';
  const last = direct ? player.lastInputAt : player.lastMove;
  const interval = direct ? INPUT_MIN_INTERVAL_MS : 900;
  const elapsed = Number.isFinite(last) ? Math.max(0, now - last) : interval;
  return Math.max(0, Math.ceil(interval - elapsed));
}
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
// Expanded frontier: 16 rim spawn points between the authored perimeter spawns. Used when every authored
// spawn is within MIN_SPAWN_DISTANCE of another (non-party) explorer, so players still start far apart.
const FRONTIER_SPAWNS = Object.freeze(Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2 + Math.PI / 16;
  return Object.freeze({ id: 'frontier_' + i, label: 'Frontier Rim ' + (i + 1), x: Math.round(Math.cos(a) * 86), z: Math.round(Math.sin(a) * 86) });
}));
const ALL_SPAWNS = Object.freeze([...SPAWNS, ...FRONTIER_SPAWNS]);
// The authored gates are preferred. Additional grounded sites give the current
// map room for more refuges without sharing any permanent entry coordinates.
const REFUGE_ENTRY_SPACING = 14;
const EXTRA_REFUGE_ENTRIES = [];
for (let x = -84; x <= 84; x += 14) for (let z = -84; z <= 84; z += 14) {
  const radius = Math.hypot(x, z);
  if (radius < 58 || radius > 91) continue;
  EXTRA_REFUGE_ENTRIES.push({ id: 'refuge_' + x + '_' + z, label: 'Refuge trailhead', x, z });
}
const REFUGE_ENTRY_SPAWNS = [...ALL_SPAWNS, ...EXTRA_REFUGE_ENTRIES];
const REFUGE_ENTRY_BY_ID = new Map(REFUGE_ENTRY_SPAWNS.map(spawn => [spawn.id, spawn]));
const MIN_SPAWN_DISTANCE = 60;
// Interest management: strangers are only sent to a client inside this radius (render range).
// Party members are always sent (they are the only explorers on the map). Never broadcast everyone.
const INTEREST_RADIUS = 40;
const INTEREST_CELL = 20;
const DISTRICTS = [
  { id: 'perimeter', label: 'Safe Perimeter', radius: 25, risk: 1 },
  { id: 'outskirts', label: 'City Outskirts', radius: 45, risk: 1 },
  { id: 'residential', label: 'Residential Ruins', radius: 62, risk: 2 },
  { id: 'commercial', label: 'Market District', radius: 76, risk: 3 },
  { id: 'industrial', label: 'Industrial Belt', radius: 88, risk: 4 },
  { id: 'graveyard_core', label: 'Graveyard Core', radius: 101, risk: 5 }
];
const POINTS_OF_INTEREST = [
  ...PINE_CROSSING_BUILDINGS.map(({ id, title, x, z }) => ({ id, label: title, type: 'interior', zone: 'outskirts', x, z, risk: 1 })),
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
  { id: 'ashfall_station', label: 'Ashfall Power Station Access', type: 'industrial', zone: 'industrial', x: -42, z: 8, risk: 4 },
  { id: 'buried_subway', label: 'Buried Subway', type: 'boss', zone: 'subway', x: 6, z: -8, risk: 5 },
  { id: 'research_annex', label: 'Sealed Research Annex', type: 'boss', zone: 'research_lab', x: -4, z: 6, risk: 5 }
];
const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const clamp = (n, min, max) => Math.max(min, Math.min(max, Number.isFinite(n) ? n : 0));
const defaultWorld = () => ({ version: 1, players: {}, refugeEntries: {}, parties: {}, encounters: {}, vehicles: {}, lootNodes: {}, environmentStructures: {}, fieldSurveyClaims: {} });
function normalizeWorld(input, now = Date.now()) {
  const w = input && input.version === 1 ? input : defaultWorld();
  if (!w.players || typeof w.players !== 'object' || Array.isArray(w.players)) w.players = {};
  if (!w.parties || typeof w.parties !== 'object' || Array.isArray(w.parties)) w.parties = {};
  const entries = Object.create(null);
  const claimed = new Set();
  if (w.refugeEntries && typeof w.refugeEntries === 'object' && !Array.isArray(w.refugeEntries)) {
    for (const [account, id] of Object.entries(w.refugeEntries)) {
      if (!REFUGE_ENTRY_BY_ID.has(id) || claimed.has(id)) continue;
      entries[account] = id;
      claimed.add(id);
    }
  }
  w.refugeEntries = entries;
  w.encounters = Combat.normalizeEncounters(w.encounters, now);
  w.vehicles = Vehicles.normalize(w.vehicles);
  w.lootNodes = Loot.normalize(w.lootNodes);
  w.fieldSurveyClaims = FieldSurveys.normalize(w.fieldSurveyClaims);
  w.environmentStructures = Environment.normalize(w.environmentStructures);
  w.sharedInteriors = Interiors.normalizeShared(w.sharedInteriors);
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
    p.spawn = REFUGE_ENTRY_BY_ID.has(p.spawn) ? p.spawn : SPAWNS[hash(acct) % SPAWNS.length].id;
    const savedInterior = w.interiors?.[acct];
    const activeInteriorId = savedInterior?.activeLandmarkId || null;
    const activeInteriorState = activeInteriorId ? savedInterior.interiors?.[activeInteriorId] : null;
    const interiorRemoved = Collision.interiorRemovedIds(activeInteriorId,
      Interiors.sharedOpenedDoors(w.sharedInteriors, activeInteriorId, activeInteriorState?.openedDoors));
    if (!Collision.isSafePosition(p.x, p.z, { bounds: WORLD_SIZE, removedObstacleIds: interiorRemoved })) {
      const anchor = REFUGE_ENTRY_BY_ID.get(p.spawn) || chooseSpawn(w, acct);
      const recovered = Collision.findSafePosition(anchor.x, anchor.z, { bounds: WORLD_SIZE }) || Collision.findSafePosition(0, 0, { bounds: WORLD_SIZE });
      if (!recovered) throw new Error('no_safe_spawn_location');
      p.x = recovered.x; p.z = recovered.z;
    }
    p.vehicleId = w.vehicles[acct]?.driver === acct ? w.vehicles[acct].id : null;
    p.lastMove = Number.isFinite(p.lastMove) ? p.lastMove : 0;
    p.lastMoveMode = p.lastMoveMode === 'input' ? 'input' : 'legacy';
    p.lastInputAt = Number.isFinite(p.lastInputAt) && p.lastInputAt >= 0 ? p.lastInputAt : 0;
    p.lastInputSequence = Number.isSafeInteger(p.lastInputSequence) && p.lastInputSequence >= 0 ? p.lastInputSequence : -1;
    p.lastWorldInputTick = Number.isFinite(p.lastWorldInputTick) && p.lastWorldInputTick >= 0 ? p.lastWorldInputTick : 0;
    p.directorState = p.directorState && typeof p.directorState === 'object' ? p.directorState : {};
    p.lastNoiseAt = Number.isFinite(p.lastNoiseAt) ? clamp(p.lastNoiseAt, 0, Number.MAX_SAFE_INTEGER) : 0;
    p.noiseLevel = clamp(p.noiseLevel, 0, 100);
    p.crouched = p.crouched === true;
    p.noiseX = clamp(p.noiseX ?? p.x, -WORLD_SIZE, WORLD_SIZE);
    p.noiseZ = clamp(p.noiseZ ?? p.z, -WORLD_SIZE, WORLD_SIZE);
    p.aiming = p.aiming === true;
    p.aimStartedAt = p.aiming && Number.isFinite(p.aimStartedAt) ? clamp(p.aimStartedAt, 0, Number.MAX_SAFE_INTEGER) : 0;
    p.lastSprintAt = Number.isFinite(p.lastSprintAt) ? clamp(p.lastSprintAt, 0, Number.MAX_SAFE_INTEGER) : 0;
    p.accuracyRecoverUntil = Number.isFinite(p.accuracyRecoverUntil) ? clamp(p.accuracyRecoverUntil, 0, Number.MAX_SAFE_INTEGER) : 0;
    p.survival = Survival.normalize(p.survival, p.lastSeen || Date.now());
    p.companion = Companions.normalize(p.companion);
    p.cindersEffects = CindersEffects.normalizeEffects(p.cindersEffects);
    p.pvpHits = Array.isArray(p.pvpHits) ? p.pvpHits.filter(h => h && Number.isFinite(h.at) && Number.isFinite(h.damage) && typeof h.fromId === 'string').slice(-5) : [];
    p.pvpKills = Number.isSafeInteger(p.pvpKills) && p.pvpKills > 0 ? p.pvpKills : 0;
    p.spawnedAt = Number.isFinite(p.spawnedAt) ? p.spawnedAt : 0;
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
  Travel.prune(w, now);
  for (const [code, party] of Object.entries(w.parties)) {
    // Members at home in a Homefront instance (fresh presence) stay in the party (server/homefront-travel.js).
    party.members = party.members.filter(acct => !!w.players[acct] || Travel.fresh(w, acct, now));
    if (!party.members.length) delete w.parties[code];
    else if (!party.members.includes(party.leader)) party.leader = party.members[0];
  }
}
function districtAt(x, z) {
  const depth = WORLD_SIZE - Math.hypot(x, z);
  return DISTRICTS.find(v => depth <= v.radius) || DISTRICTS[DISTRICTS.length - 1];
}
function frontierDepthAt(x, z) {
  return Math.round(clamp(WORLD_SIZE - Math.hypot(x, z), 0, WORLD_SIZE));
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
const safeSpawnCache = new Map();   // static collision only: a spawn's safe footprint never changes
function safeSpawnPosition(spawn) {
  if (!safeSpawnCache.has(spawn.id)) safeSpawnCache.set(spawn.id, Collision.findSafePosition(spawn.x, spawn.z, { bounds: WORLD_SIZE }));
  const p = safeSpawnCache.get(spawn.id); return p ? { x: p.x, z: p.z } : null;
}
const EXPEDITION_BANDS = Object.freeze([
  { until: 24, label: 'Near Homefront' },
  { until: 48, label: 'Outer trails' },
  { until: 75, label: 'Deep territory' },
  { until: 110, label: 'Hostile territory' },
  { until: Infinity, label: 'Far frontier' }
]);
function homefrontExposure(w, acct) {
  const p = w.players[acct];
  // Old expeditions may predate reservations. Their original gate is the
  // fallback until redeployment assigns a permanent one.
  const spawn = REFUGE_ENTRY_BY_ID.get(w.refugeEntries[acct] || p.spawn);
  const gate = spawn && safeSpawnPosition(spawn);
  const distance = gate ? Math.hypot(p.x - gate.x, p.z - gate.z) : 0;
  const band = EXPEDITION_BANDS.findIndex(({ until }) => distance < until);
  return { distance, risk: band + 1, band: EXPEDITION_BANDS[band].label };
}
function ownRefugeGate(w, acct) {
  const site = REFUGE_ENTRY_BY_ID.get(w?.refugeEntries?.[acct]);
  return site ? safeSpawnPosition(site) : null;
}
function assignRefugeEntry(w, acct) {
  const existing = REFUGE_ENTRY_BY_ID.get(w.refugeEntries[acct]);
  const existingPosition = existing && safeSpawnPosition(existing);
  if (existingPosition) return { spawn: existing, position: existingPosition };

  // Reservations outlive presence and expedition sessions. Rank candidates by
  // distance from already assigned gates, preferring authored sites on a tie.
  const occupied = new Set(Object.values(w.refugeEntries));
  // Old expeditions keep their current return point until their next deployment.
  for (const [account, player] of Object.entries(w.players)) {
    if (!w.refugeEntries[account]) occupied.add(player.spawn);
  }
  const positions = [...occupied].map(id => safeSpawnPosition(REFUGE_ENTRY_BY_ID.get(id))).filter(Boolean);
  let best = null;
  for (const spawn of REFUGE_ENTRY_SPAWNS) {
    if (occupied.has(spawn.id)) continue;
    const position = safeSpawnPosition(spawn);
    if (!position) continue;
    const distance = positions.reduce((nearest, other) =>
      Math.min(nearest, Math.hypot(position.x - other.x, position.z - other.z)), Infinity);
    if (distance + 1e-6 < REFUGE_ENTRY_SPACING) continue;
    if (!best || distance > best.distance) best = { spawn, position, distance };
    // Give the first reservations authored routes when there is ample space.
    if (SPAWNS.includes(spawn) && distance >= MIN_SPAWN_DISTANCE) break;
  }
  if (!best) throw new Error('homefront_entry_points_full');
  w.refugeEntries[acct] = best.spawn.id;
  return best;
}
// Server-picked spawn far from everyone else: the authored spawns in their usual order, taking the first one
// at least MIN_SPAWN_DISTANCE from every other explorer (party members excluded: they regroup anyway);
// failing that, any spawn incl. the frontier rim that maximises the distance to the nearest explorer.
function chooseSafeSpawn(w, acct) {
  const preferred = chooseSpawn(w, acct);
  const ordered = [preferred, ...SPAWNS.filter(s => s.id !== preferred.id), ...FRONTIER_SPAWNS];
  const myParty = Travel.partyOf(w, acct);
  const others = Object.entries(w.players).filter(([id, p]) => id !== acct && !(myParty && p.partyCode === myParty)).map(([, p]) => p);
  const nearest = pos => others.reduce((m, p) => Math.min(m, Math.hypot(p.x - pos.x, p.z - pos.z)), Infinity);
  let best = null;
  for (const spawn of ordered) {
    const position = safeSpawnPosition(spawn);
    if (!position) continue;
    const d = nearest(position);
    if (d >= MIN_SPAWN_DISTANCE) return { spawn, position, nearest: d };
    if (!best || d > best.nearest) best = { spawn, position, nearest: d };
  }
  if (best) return best;
  throw new Error('no_safe_spawn_location');
}
// Uniform-grid spatial hash over the explorers in the world (built once per snapshot, O(n)).
function buildInterestGrid(players) {
  const grid = new Map();
  for (const [acct, p] of Object.entries(players)) {
    const k = Math.floor(p.x / INTEREST_CELL) + ',' + Math.floor(p.z / INTEREST_CELL);
    let cell = grid.get(k); if (!cell) grid.set(k, cell = []); cell.push(acct);
  }
  return grid;
}
function nearbyAccounts(grid, players, x, z, radius = INTEREST_RADIUS) {
  const out = [], r = Math.ceil(radius / INTEREST_CELL), cx = Math.floor(x / INTEREST_CELL), cz = Math.floor(z / INTEREST_CELL);
  for (let i = cx - r; i <= cx + r; i++) for (let j = cz - r; j <= cz + r; j++) {
    const cell = grid.get(i + ',' + j); if (!cell) continue;
    for (const acct of cell) { const p = players[acct]; if (Math.hypot(p.x - x, p.z - z) <= radius) out.push(acct); }
  }
  return out;
}
// The accounts a viewer may receive positions for: themselves, their party (anywhere), strangers within radius.
function visibleAccounts(w, viewer, now = Date.now()) {
  const me = w.players[viewer];
  const seen = new Set();
  if (!me) return seen;
  seen.add(viewer);
  const code = me.partyCode && w.parties[me.partyCode] ? me.partyCode : null;
  if (code) for (const m of w.parties[code].members) if (w.players[m]) seen.add(m);
  const grid = buildInterestGrid(w.players);
  for (const acct of nearbyAccounts(grid, w.players, me.x, me.z)) if (now - w.players[acct].lastSeen <= PRESENCE_TTL) seen.add(acct);
  return seen;
}
function chooseSpawn(w, acct) {
  const counts = new Map(SPAWNS.map(s => [s.id, 0]));
  for (const p of Object.values(w.players)) if (counts.has(p.spawn)) counts.set(p.spawn, counts.get(p.spawn) + 1);
  const min = Math.min(...counts.values());
  const candidates = SPAWNS.filter(s => counts.get(s.id) === min);
  return candidates[hash(acct) % candidates.length];
}
function publicPlayer(acct, p, me, now, viewerParty = null) {
  const d = districtAt(p.x, p.z);
  // The safe perimeter lies around the outer edge; depth measures inward expansion.
  const frontierDepth = frontierDepthAt(p.x, p.z);
  const frontierBand = frontierDepth < 25 ? 'perimeter' : frontierDepth < 45 ? 'outer ring' : frontierDepth < 63 ? 'inner blocks' : frontierDepth < 76 ? 'commercial edge' : frontierDepth < 89 ? 'industrial belt' : 'core approach';
  return { id: 'survivor-' + hash(acct).toString(36).slice(0, 7), label: acct === me ? 'You' : 'Survivor-' + hash(acct).toString(36).slice(0, 5), x: p.x, z: p.z, district: d.id, risk: d.risk, frontierDepth, frontierBand, crouched: p.crouched === true, spawn: acct === me ? p.spawn : undefined, party: acct !== me && !!viewerParty && p.partyCode === viewerParty, online: now - p.lastSeen <= PRESENCE_TTL };
}
function nearestPoint(x, z, type = null) { const points = POINTS_OF_INTEREST.filter(p => !type || (type === 'non-boss' ? p.type !== 'boss' && p.type !== 'interior' : p.type === type)); let best = null; for (const point of points) { const distance = Math.hypot(point.x - x, point.z - z); if (!best || distance < best.distance) best = { point, distance }; } return best; }
function encounterContext(w, acct, now) {
  const p = w.players[acct];
  const district = districtAt(p.x, p.z);
  const zoneId = district.id === 'graveyard_core' ? 'research_lab' : district.id === 'perimeter' ? 'outskirts' : district.id;
  const party = w.parties[p.partyCode];
  const nearby = (party?.members || []).filter(id => {
    const other = w.players[id];
    return id !== acct && other?.partyCode === p.partyCode && now - other.lastSeen <= PRESENCE_TTL &&
      Math.hypot(other.x - p.x, other.z - p.z) <= 24;
  });
  // A shared squad gets one difficulty at spawn. A teammate close to their
  // own gate cannot lower an exposed teammate's patrol difficulty.
  const exposure = [acct, ...nearby].map(id => homefrontExposure(w, id))
    .reduce((highest, current) => current.distance > highest.distance ? current : highest);
  const activeEncounters = Number(Combat.retainEncounter(w.encounters[acct], acct, p, w.players, now)) +
    Combat.nearbyPartyPatrols(w.encounters, acct, w.players, now).length;
  const elapsed = Math.max(0, now - (p.lastNoiseAt || now));
  const noise = Math.max(0, (p.noiseLevel || 0) - elapsed / 120);
  return {
    zoneId, risk: exposure.risk, frontierDepth: exposure.distance / 1.1,
    playerCount: 1 + nearby.length, activeEncounters, noise,
    // Footsteps give nearby patrols a location without declaring an assault.
    lastNoiseAt: p.noiseLevel >= 19 ? p.lastNoiseAt : 0, now,
    seed: acct + ':' + district.id + ':' + Math.floor(p.x / 12) + ':' + Math.floor(p.z / 12) + ':' + Math.floor(now / 5000)
  };
}
function spawnEncounter(w, acct, now, plan = Director.planEncounter(encounterContext(w, acct, now))) {
  return Combat.spawn({ encounters: w.encounters, account: acct, player: w.players[acct], players: w.players, interiors: w.interiors, now, plan });
}
function tickDirector(w, acct, now = Date.now()) {
  const p = w.players[acct];
  if (!p) return null;
  const context = encounterContext(w, acct, now);
  const previousSpawnAt = p.directorState?.lastSpawnAt || 0;
  const tick = Director.advanceDirector(p.directorState, context);
  p.directorState = tick.state;
  if (tick.decision === 'spawn') {
    let reason = 'A nearby infected squad is still active.';
    if (context.activeEncounters === 0) {
      const spawned = spawnEncounter(w, acct, now, tick.plan);
      w.encounters = spawned.encounters;
      reason = spawned.encounter ? '' : 'No unoccupied patrol route is close enough.';
    }
    if (reason) {
      p.directorState.lastSpawnAt = previousSpawnAt;
      p.directorState.nextSpawnAt = previousSpawnAt + tick.plan.spawnIntervalMs;
      p.directorState.lastDecision = tick.decision = 'hold';
      tick.reason = reason;
    }
  }
  return { phase: tick.state.phase, decision: tick.decision, reason: tick.reason, threat: tick.plan.threat, pressure: tick.plan.pressure, risk: tick.plan.risk, zoneId: tick.plan.zoneId, recommendedMaxAlive: tick.plan.recommendedMaxAlive, spawnIntervalMs: tick.plan.spawnIntervalMs, nextSpawnAt: p.directorState.nextSpawnAt || 0, noise: Math.round(context.noise) };
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
// Alarm and noisy building mechanisms are heard by ACTIVE players inside
// that same authenticated shared instance only. Existing per-account director
// AI consumes their increased noise during its next bounded world tick.
function shareInteriorNoise(world,{ landmarkId, sourceAccount, level, now = Date.now() }={}) {
  if (!world?.players || !landmarkId || !sourceAccount ||
      !Number.isFinite(now) || !Number.isFinite(level) || level <= 0) return 0;
  const source=Interiors.roomPresence(world.interiors,world.players,sourceAccount,now,PRESENCE_TTL);
  if (source?.landmarkId !== landmarkId) return 0;
  const point=Interiors.LANDMARKS[landmarkId];
  if (!point) return 0;
  let heard=0;
  for (const [account,player] of Object.entries(world.players)) {
    const here=Interiors.roomPresence(world.interiors,world.players,account,now,PRESENCE_TTL);
    if (here?.instanceId !== source.instanceId) continue;
    const sound=Math.max(0,Math.min(70,level));
    player.noiseLevel=Math.max(player.noiseLevel || 0,sound);
    player.lastNoiseAt=now;
    player.noiseX=point.x;player.noiseZ=point.z;
    heard++;
  }
  return heard;
}

function snapshot(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())), now);
  prune(w, now);
  const p = w.players[acct] || null;
  const party = p?.partyCode && w.parties[p.partyCode];
  const viewerParty = party ? p.partyCode : null;
  // Interest management: only self, party members and strangers within INTEREST_RADIUS ever leave the server.
  const visible = visibleAccounts(w, acct, now);
  // Followers travel under an active leader's control and can use the same
  // exit together. Their own reservations are untouched by party travel.
  const returnAccount = party && w.players[party.leader] ? party.leader : acct;
  const returnSpawn = p && REFUGE_ENTRY_BY_ID.get(w.refugeEntries[returnAccount] || w.players[returnAccount]?.spawn);
  const nearEncounter = e => !!p && (e.owner === acct || Math.hypot(e.x - p.x, e.z - p.z) <= INTEREST_RADIUS + 10);
  const alliedPatrols = Combat.nearbyPartyPatrols(w.encounters, acct, w.players, now);
  const attackable = new Set(alliedPatrols.map(e => e.id));
  const own = w.encounters[acct];
  const primary = own && !own.defeated && own.hp > 0 ? own : alliedPatrols[0] || own;
  const exposure = p && homefrontExposure(w, acct);
  const self = p ? { ...publicPlayer(acct, p, acct, now, viewerParty), risk: exposure.risk,
    homefrontDistance: Math.floor(exposure.distance), homefrontBand: exposure.band } : null;
  return {
    world: { width: WORLD_SIZE * 2, height: WORLD_SIZE * 2, districts: DISTRICTS, spawns: SPAWNS, pointsOfInterest: POINTS_OF_INTEREST, vehicles: Vehicles.publicVehicles(w,acct,INTEREST_RADIUS), lootNodes: Loot.publicNodes(w.lootNodes, now), environmentStructures: Environment.nearby(w.environmentStructures, p?.x ?? 0, p?.z ?? 0), bosses: w.bosses, caches: w.caches, rescues: w.rescues },
    players: [...visible].map(id => {
      const avatar = id === acct ? self : publicPlayer(id, w.players[id], acct, now, viewerParty);
      const presence = Interiors.roomPresence(w.interiors, w.players, id, now, PRESENCE_TTL);
      // Do not disclose interior room choices across unrelated buildings.
      const sameBuilding = presence && (id === acct ||
        presence.landmarkId === Interiors.roomPresence(w.interiors, w.players, acct, now, PRESENCE_TTL)?.landmarkId);
      return { ...avatar, interior: sameBuilding ? presence : null };
    }).filter(v => v.online),
    interest: { radius: INTEREST_RADIUS, mapShows: 'party' },
    // A single rare escort per visible player. They never join account/player
    // arrays, cannot be targeted by PvP and reveal no private camp roster.
    companions: [...visible].filter(id => now - (w.players[id]?.lastSeen || 0) <= PRESENCE_TTL)
      .map(id => Companions.publicCompanion(id,w.players[id])).filter(Boolean),
    self,
    selfVehicle: p?.vehicleId ? Vehicles.publicVehicles(w,acct,INTEREST_RADIUS).find(v=>v.id===p.vehicleId) || null : null,
    vehicleEnabled: process.env.HOMEFRONT_VEHICLES_ENABLED === '1',
    refugeReturn: returnSpawn ? safeSpawnPosition(returnSpawn) : null,
    director: p ? { phase: p.directorState?.phase || 'calm', lastDecision: p.directorState?.lastDecision || 'hold', nextSpawnAt: p.directorState?.nextSpawnAt || 0, noise: Math.round(Math.max(0, (p.noiseLevel || 0) - Math.max(0, now - (p.lastNoiseAt || now)) / 120)) } : null,
    party: party ? { code: p.partyCode, leader: party.leader === acct, members: party.members.map(id => publicPlayer(id, w.players[id] || {x:0,z:0,spawn:SPAWNS[0].id,lastSeen:0,partyCode:p.partyCode}, acct, now, viewerParty)) } : null,
    encounters: Object.values(w.encounters).filter(e => !e.defeated && e.hp > 0 && nearEncounter(e))
      .map(e => ({ ...Combat.publicEncounter(e), attackable: e.owner === acct || attackable.has(e.id) })),
    selfEncounter: Combat.publicEncounter(primary),
    recentPatrolDeaths: Object.values(w.encounters).filter(e => e.patrolId && nearEncounter(e))
      .flatMap(e => e.members.filter(m => m.defeated && m.lastAttackAt > 0 && now - m.lastAttackAt <= 3500).map(m => m.id)),
    selfSurvival: p ? { ...p.survival } : null,
    selfInfectedHit: p?.infectedHit && now - p.infectedHit.at <= 3500 ? { ...p.infectedHit } : null,
    selfPvp: p ? { recentHits: p.pvpHits || [], kills: p.pvpKills || 0, downedAt: p.downedAt || 0, protectedUntil: (p.spawnedAt || 0) + 10_000 } : null,
    selfInventory: p ? { ...Inventory.normalize(p.inventory), used: Inventory.used(p.inventory), capacity: Inventory.CAPACITY } : null,
    selfWeaponMagazine: p ? { ...p.weaponMagazine, capacity: Combat.WEAPON_MAGAZINE_CAPACITY[p.weaponMagazine?.weaponId] || 0 } : null,
    selfWeaponHandling: p ? { aiming: p.aiming, aimStartedAt: p.aimStartedAt, lastSprintAt: p.lastSprintAt, accuracyRecoverUntil: p.accuracyRecoverUntil } : null,
    interior: p ? Interiors.publicState(w.interiors, acct, w.sharedInteriors) : null,
    interiorInstance: p ? (() => {
      const own = Interiors.roomPresence(w.interiors, w.players, acct, now, PRESENCE_TTL);
      if (!own) return null;
      const occupants = [...visible].filter(id =>
        Interiors.roomPresence(w.interiors, w.players, id, now, PRESENCE_TTL)?.instanceId === own.instanceId)
        .map(id => {
          const presence = Interiors.roomPresence(w.interiors, w.players, id, now, PRESENCE_TTL);
          return { ...publicPlayer(id, w.players[id], acct, now, viewerParty), roomId: presence.roomId };
        }).filter(player => player.online);
      const mechanisms = w.sharedInteriors?.[own.landmarkId];
      return { id: own.instanceId, landmarkId: own.landmarkId, roomId: own.roomId,
        occupants, count: occupants.length, shared: true,
        mechanisms: { flags: [...(mechanisms?.flags || [])],
          openedDoors: [...(mechanisms?.openedDoors || [])],
          events: InteriorEvents.recent(mechanisms,own.landmarkId,now) } };
    })() : null
  };
}
// Advance pursuit globally, but resolve damage only for the explorer whose
// request is being processed. A nearby player's requests cannot damage an idle save.
function tickInfected(w, acct, now) {
  const player = w.players[acct];
  const destroyedObstacles = Object.values(w.environmentStructures).filter(s => s.health <= 0).map(s => s.id);
  const scene = { interiors: w.interiors, sharedInteriors: w.sharedInteriors, destroyedObstacles, now };
  w.encounters = Combat.advance({ ...scene, encounters: w.encounters, players: w.players });
  Companions.guard(w.encounters, acct, player, now);
  const threats = [w.encounters[acct], ...Combat.nearbyPartyPatrols(w.encounters, acct, w.players, now)];
  let hit = null;
  for (const encounter of threats) {
    hit = Combat.meleeContact({ ...scene, encounter, player, account: acct });
    if (!hit) continue;
    if (encounter.patrolId) encounter.lastMeleeAt = now;
    break;
  }
  if (!hit) return;

  const survival = player.survival;
  survival.health = Math.max(0, survival.health - hit.damage);
  survival.infection = Math.min(100, survival.infection + Math.max(1, Math.floor(hit.damage / 4)));
  player.infectedHit = { ...hit, defeated: survival.health === 0 };
  if (!player.infectedHit.defeated) return;

  Vehicles.release(w, acct);
  // Death returns a survivor to THEIR reserved Homefront in the SAME shared
  // overworld. Never choose another player's gate or start a private copy.
  // Older saves without a reservation receive one through the usual bounded
  // collision-safe allocator. Health/field-pack handling is unchanged.
  const { spawn, position } = assignRefugeEntry(w, acct);
  player.x = position.x; player.z = position.z;
  player.spawn = spawn.id; player.spawnedAt = now; player.lastMove = now; player.crouched = false;
  player.aiming = false; player.aimStartedAt = 0;
  survival.health = Survival.RESPAWN_HEALTH;
  if (w.interiors?.[acct]) w.interiors[acct].activeLandmarkId = null;
  if (!w.encounters[acct]?.patrolId || !player.partyCode ||
      !Object.values(w.players).some(other => other !== player && other.partyCode === player.partyCode)) {
    delete w.encounters[acct];
  }
  player.directorState.lastSpawnAt = now;
}
function enter(input, acct, now = Date.now(), effects = null, base = null) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())), now);
  prune(w, now);
  let p = w.players[acct];
  if (!p) {
    if (w.interiors?.[acct]) w.interiors[acct].activeLandmarkId = null;
    const { spawn, position } = assignRefugeEntry(w, acct);
    p = w.players[acct] = { x: position.x, z: position.z, spawn: spawn.id, spawnedAt: now, lastSeen: now, lastMove: now, partyCode: null, inventory: {}, inventoryInitialized: false, weaponMagazine: { weaponId: 'pipe_blade', loaded: 0 }, aiming: false, aimStartedAt: 0, lastSprintAt: 0, accuracyRecoverUntil: 0 };
  }
  p.lastSeen = now;
  // Rebind cached movement effects from the authenticated RPG profile at each
  // ordinary world enter/refresh. High-rate movement avoids disk RPG reads.
  if (effects) p.cindersEffects = CindersEffects.normalizeEffects(effects);
  if (base) Companions.assign(p,base,now);
  Companions.advance(p,now);
  p.survival = Survival.tick(p.survival, now, p.cindersEffects);
  // Party joins establish formation in joinParty(). Presence refreshes must not snap
  // followers to the leader: their position is advanced by bounded, collision-aware
  // movement in move(), not by polling this endpoint.
  // Refreshes advance bounded pursuit too, so infected do not require player movement to update.
  tickInfected(w, acct, now);
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
// Validate the walked route leg by leg. Checking only the straight line from the start to the
// advanced point cut corners through doorways, so a move that turned through an interior door
// (or around any wall end) was rejected as terrain_path_blocked even though the route was clear.
function walkedRouteClear(startX, startZ, path, end, budget, removedObstacleIds) {
  // Replays advanceAlongTerrainPath: every full leg it walked is checked, then the last partial
  // leg from the final reached waypoint to the (rounded) advanced point.
  let x = startX, z = startZ, remaining = budget;
  const legClear = (x1, z1) => Terrain.canTraverse(x, z, x1, z1) && Collision.canTraverse(x, z, x1, z1, { bounds: WORLD_SIZE, removedObstacleIds });
  for (const waypoint of path) {
    const distance = Math.hypot(waypoint.x - x, waypoint.z - z);
    if (distance < 0.001) continue;
    if (distance > remaining) break;
    if (!legClear(waypoint.x, waypoint.z)) return false;
    x = waypoint.x; z = waypoint.z; remaining -= distance;
    if (remaining < 0.001) break;
  }
  return legClear(end.x, end.z);
}
function move(input, acct, x, z, now = Date.now(), sprint = false, inputCommand = null) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())), now);
  prune(w, now);
  const p = w.players[acct];
  if (!p) throw new Error('not_in_expedition');
  if (p.vehicleId) throw new Error('exit_vehicle_before_walking');
  // Followers move with the leader only while the leader is out in the world; a leader at home never freezes them.
  if (p.partyCode && w.parties[p.partyCode] && w.parties[p.partyCode].leader !== acct && w.players[w.parties[p.partyCode].leader]) throw new Error('party_leader_controls_movement');
  const isInput = inputCommand !== null;
  const command = isInput ? InputStep.validateInput(inputCommand, p.lastInputSequence) : null;
  if (typeof sprint !== 'boolean') throw new Error('invalid_movement_mode');
  if (isInput && p.lastMoveMode === 'input') {
    if (now - p.lastInputAt < INPUT_MIN_INTERVAL_MS) throw new Error('move_cooldown');
  } else if (now - p.lastMove < 900) {
    // Prevent interleaving old destination moves with faster continuous-input steps.
    throw new Error('move_cooldown');
  }
  if (sprint && p.aiming) throw new Error('lower_weapon_before_sprinting');
  const weaponId = p.weaponMagazine?.weaponId || 'pipe_blade';
  const inputDisplacement = isInput
    ? InputStep.displacementForInput(command, {
      now, previousAt: p.lastMoveMode === 'input' && p.lastInputAt ? p.lastInputAt : now,
      walkSpeed: ZOMBIE_WALK_SPEED, sprintSpeed: ZOMBIE_FAST_SPEED
    }) : null;
  const aimScale = p.aiming ? (AIM_MOVE_SCALE[weaponId] || 0.55) : 1;
  const movementBudget = isInput ? Math.hypot(inputDisplacement.x, inputDisplacement.z) * aimScale
    : p.aiming ? MOVE_STEP * aimScale : sprint ? SPRINT_STEP : MOVE_STEP;
  // Client sends direction only; never accept a proposed position for continuous input.
  let nx = clamp(isInput ? p.x + inputDisplacement.x * aimScale : x, -WORLD_SIZE, WORLD_SIZE);
  let nz = clamp(isInput ? p.z + inputDisplacement.z * aimScale : z, -WORLD_SIZE, WORLD_SIZE);
  const radius = Math.hypot(nx, nz); if (radius > WORLD_SIZE) { nx = nx / radius * WORLD_SIZE; nz = nz / radius * WORLD_SIZE; }
  const dx = nx - p.x, dz = nz - p.z, d = Math.hypot(dx, dz);
  const scale = d > movementBudget ? movementBudget / d : 1;
  const oldX = p.x, oldZ = p.z;
  // Input-driven walking preserves analog stick speed, including small
  // partial deflections. Rounding *every* 75–125ms movement packet to 0.1
  // units can turn a requested 0.12-unit step into 0.1 or 0.2, causing
  // repeated slow-stick drift and visible stutter. Preserve full server-
  // derived precision only for the authenticated direct-input path.
  // Destination travel retains its previous one-decimal behavior.
  let nextX = isInput ? p.x + dx * scale : Math.round((p.x + dx * scale) * 10) / 10;
  let nextZ = isInput ? p.z + dz * scale : Math.round((p.z + dz * scale) * 10) / 10;
  const removedObstacleIds = Object.values(w.environmentStructures).filter(s => s.health <= 0).map(s => s.id);
  const activeInteriorOwner = w.interiors?.[acct];
  const activeInteriorId = activeInteriorOwner?.activeLandmarkId || null;
  const activeInteriorState = activeInteriorId ? activeInteriorOwner.interiors?.[activeInteriorId] : null;
  removedObstacleIds.push(...Collision.interiorRemovedIds(activeInteriorId,
    Interiors.sharedOpenedDoors(w.sharedInteriors, activeInteriorId, activeInteriorState?.openedDoors)));
  if (!Terrain.canTraverse(oldX, oldZ, nextX, nextZ) || !Collision.canTraverse(oldX, oldZ, nextX, nextZ, { bounds: WORLD_SIZE, removedObstacleIds })) {
    if (isInput) {
      // Unlike destination travel, direct controls may only slide along a safe
      // axis of the player's short input step. Never search a path around a wall.
      const slide = InputStep.slideAlongBlockedStep(
        { x: oldX, z: oldZ }, { x: nextX, z: nextZ },
        (x, z) => Terrain.canTraverse(oldX, oldZ, x, z) &&
          Collision.canTraverse(oldX, oldZ, x, z, { bounds: WORLD_SIZE, removedObstacleIds })
      );
      nextX = slide.x; nextZ = slide.z;
    } else {
      const route = Collision.findPath(oldX, oldZ, nx, nz, { bounds: WORLD_SIZE, maxExpanded: 2600, removedObstacleIds });
      if (!route || !route.length) throw new Error('terrain_path_unreachable');
      const advanced = advanceAlongTerrainPath(oldX, oldZ, route, movementBudget);
      nextX = advanced.x; nextZ = advanced.z;
      if (!walkedRouteClear(oldX, oldZ, route, advanced, movementBudget, removedObstacleIds)) throw new Error('terrain_path_blocked');
    }
  }
  p.x = nextX; p.z = nextZ;
  const movedDistance = Math.hypot(p.x - oldX, p.z - oldZ);
  p.lastMove = p.lastSeen = now;
  p.lastMoveMode = isInput ? 'input' : 'legacy';
  p.lastInputAt = isInput ? now : 0;
  p.crouched = command?.crouched === true;
  if (isInput) p.lastInputSequence = command.sequence;
  if (movedDistance > 0) {
    if (sprint) { p.lastSprintAt = now; p.accuracyRecoverUntil = now + SPRINT_RECOVERY_MS; }
    else p.accuracyRecoverUntil = Math.max(p.accuracyRecoverUntil || 0, now + AIM_RECOVERY_MS);
    p.aiming = false; p.aimStartedAt = 0;
    if ((isInput || sprint) && inPineCrossing(p.x, p.z, 4) && now - (p.lastNoiseAt || 0) >= 750) {
      const surface = activeInteriorId ? 'wood' : pineSurfaceAt(p.x, p.z);
      const stepNoise = surface === 'gravel' ? 12 : surface === 'wood' ? 9 : surface === 'asphalt' ? 6 : 4;
      const level = sprint ? (surface === 'gravel' ? 32 : surface === 'asphalt' ? 24 : 19)
        : p.crouched ? Math.floor(stepNoise * 0.25) : stepNoise;
      const remaining = Math.max(0, (p.noiseLevel || 0) - (now - (p.lastNoiseAt || 0)) / 120);
      if (level > 0 && remaining <= level) {
        p.lastNoiseAt = now;
        p.noiseX = p.x; p.noiseZ = p.z; p.noiseLevel = level;
      }
    }
    const effortDistance = movedDistance * (sprint ? 1.55 : 1);
    p.survival = isInput
      ? Survival.moveContinuous(p.survival, now, effortDistance, p.cindersEffects)
      : Survival.move(p.survival, now, effortDistance, p.cindersEffects);
  }
  Companions.advance(p,now,removedObstacleIds);
  if (p.partyCode && w.parties[p.partyCode] && w.parties[p.partyCode].leader === acct && (!isInput || movedDistance > 0)) {
    for (const member of w.parties[p.partyCode].members) if (member !== acct && w.players[member]) {
      const offsetX = (hash(member) % 7) - 3;
      const offsetZ = (hash(member + 'z') % 7) - 3;
      const followerState = w.players[member];
      followerState.crouched = p.crouched;
      const targetX = clamp(p.x + offsetX, -WORLD_SIZE, WORLD_SIZE);
      const targetZ = clamp(p.z + offsetZ, -WORLD_SIZE, WORLD_SIZE);
      const followerRemoved = Object.values(w.environmentStructures).filter(s => s.health <= 0).map(s => s.id);
      const followerInteriorOwner = w.interiors?.[member];
      const followerInteriorId = followerInteriorOwner?.activeLandmarkId || null;
      const followerInteriorState = followerInteriorId ? followerInteriorOwner.interiors?.[followerInteriorId] : null;
      followerRemoved.push(...Collision.interiorRemovedIds(followerInteriorId,
        Interiors.sharedOpenedDoors(w.sharedInteriors, followerInteriorId, followerInteriorState?.openedDoors)));
      const route = Collision.findPath(followerState.x, followerState.z, targetX, targetZ, {
        bounds: WORLD_SIZE, maxExpanded: 900, removedObstacleIds: followerRemoved
      });
      let walked = false;
      if (route?.length) {
        const step = Math.min(Math.hypot(targetX - followerState.x, targetZ - followerState.z), isInput ? movementBudget : MOVE_STEP);
        const next = advanceAlongTerrainPath(followerState.x, followerState.z, route, step);
        if (walkedRouteClear(followerState.x, followerState.z, route, next, step, followerRemoved)) {
          followerState.x = next.x; followerState.z = next.z; walked = true;
        }
      }
      // Regroup: a follower that is more than two moves behind (joined from another spawn), or that
      // could not walk this step and is out of formation (the bounded 900-node search failed), snaps to a safe spot beside the leader, as before #191,
      // so a party never splits for good. Followers inside an interior are never pulled out.
      const behind = Math.hypot(followerState.x - p.x, followerState.z - p.z);
      if (!isInput && !followerInteriorId && (behind > MOVE_STEP * 2 || (!walked && behind > 8.5))) {
        const regroup = Collision.findSafePosition(targetX, targetZ, { bounds: WORLD_SIZE, removedObstacleIds: followerRemoved });
        if (regroup) { followerState.x = regroup.x; followerState.z = regroup.z; }
      }
      followerState.lastSeen = now;
    }
  }
  // High-frequency input never accelerates the global enemy director or environment tick.
  // Legacy moves retain the prior update semantics.
  if (!isInput || now - p.lastWorldInputTick >= 500) {
    tickInfected(w, acct, now);
    tickDirector(w, acct, now);
    w.environmentStructures = Environment.tick(w.environmentStructures, w.players, now);
    if (isInput) p.lastWorldInputTick = now;
  }
  const result = snapshot(w, acct, now);
  if (isInput) result.inputAck = { sequence: command.sequence, x: p.x, z: p.z, elapsedMs: inputDisplacement.elapsedMs };
  return { world: w, result };
}

function moveInput(input, acct, command, now = Date.now()) {
  // Explicit public entry point: direct callers cannot bypass payload validation.
  if (!command || typeof command !== 'object' || Array.isArray(command)) throw new Error('invalid_movement_input');
  return move(input, acct, undefined, undefined, now, command.sprint, command);
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
function leave(input, acct, now = Date.now(), { keepParty = false } = {}) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  Vehicles.release(w, acct);
  if (w.interiors?.[acct]) w.interiors[acct].activeLandmarkId = null;
  const p = w.players[acct];
  if (keepParty) {
    // RPG travel: returning to the Homefront keeps the party (Travel presence holds the seat).
    const code = p?.partyCode && w.parties[p.partyCode] ? p.partyCode : null;
    delete w.players[acct];
    Travel.arriveHome(w, acct, { host: acct, partyCode: code, now });
    return { world: w, result: snapshot(w, acct, now) };
  }
  if (p?.partyCode && w.parties[p.partyCode]) {
    const party = w.parties[p.partyCode];
    party.members = party.members.filter(id => id !== acct);
    if (!party.members.length) delete w.parties[p.partyCode];
    else if (party.leader === acct) party.leader = party.members[0];
  }
  delete w.players[acct];
  return { world: w, result: snapshot(w, acct, now) };
}
module.exports = { ownRefugeGate, FRONTIER_SPAWNS, ALL_SPAWNS, MIN_SPAWN_DISTANCE, INTEREST_RADIUS, visibleAccounts, buildInterestGrid, nearbyAccounts, chooseSafeSpawn, WORLD_SIZE, PRESENCE_TTL, MOVE_STEP, SPRINT_STEP, AIM_MOVE_SCALE, AIM_RECOVERY_MS, SPRINT_RECOVERY_MS, SPAWNS, DISTRICTS, POINTS_OF_INTEREST, defaultWorld, normalizeWorld, districtAt, frontierDepthAt, nearestPoint, snapshot, enter, move, moveInput, inputReadyInMs, shareInteriorNoise, setAiming, createParty, joinParty, leaveParty, leave, spawnEncounter, tickDirector, recordNoise };
