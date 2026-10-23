// Shared, persistent XRPL Graveyard expedition world for Homefront.
'use strict';
const crypto = require('crypto');
const Combat = require('./homefront-combat');
const Survival = require('./homefront-survival');
const WORLD_SIZE = 100;
const PRESENCE_TTL = 45_000;
const MOVE_STEP = 12;
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
const defaultWorld = () => ({ version: 1, players: {}, parties: {}, encounters: {} });
function normalizeWorld(input) {
  const w = input && input.version === 1 ? input : defaultWorld();
  if (!w.players || typeof w.players !== 'object' || Array.isArray(w.players)) w.players = {};
  if (!w.parties || typeof w.parties !== 'object' || Array.isArray(w.parties)) w.parties = {};
  w.encounters = Combat.normalizeEncounters(w.encounters);
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
    p.lastMove = Number.isFinite(p.lastMove) ? p.lastMove : 0;
    p.survival = Survival.normalize(p.survival, p.lastSeen || Date.now());
  }
  for (const [code, party] of Object.entries(w.parties)) {
    if (!party || typeof party !== 'object' || !Array.isArray(party.members)) { delete w.parties[code]; continue; }
    party.members = [...new Set(party.members.filter(a => typeof a === 'string'))].slice(0, 4);
    party.leader = party.members.includes(party.leader) ? party.leader : party.members[0];
    if (!party.members.length) delete w.parties[code];
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
function chooseSpawn(w, acct) {
  const counts = new Map(SPAWNS.map(s => [s.id, 0]));
  for (const p of Object.values(w.players)) if (counts.has(p.spawn)) counts.set(p.spawn, counts.get(p.spawn) + 1);
  const min = Math.min(...counts.values());
  const candidates = SPAWNS.filter(s => counts.get(s.id) === min);
  return candidates[hash(acct) % candidates.length];
}
function publicPlayer(acct, p, me, now) {
  const d = districtAt(p.x, p.z);
  return { id: 'survivor-' + hash(acct).toString(36).slice(0, 7), label: acct === me ? 'You' : 'Survivor-' + hash(acct).toString(36).slice(0, 5), x: p.x, z: p.z, district: d.id, risk: d.risk, spawn: p.spawn, party: !!p.partyCode, online: now - p.lastSeen <= PRESENCE_TTL };
}
function nearestPoint(x, z, type = null) { const points = POINTS_OF_INTEREST.filter(p => !type || (type === 'non-boss' ? p.type !== 'boss' : p.type === type)); let best = null; for (const point of points) { const distance = Math.hypot(point.x - x, point.z - z); if (!best || distance < best.distance) best = { point, distance }; } return best; }
function snapshot(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct] || null;
  const party = p?.partyCode && w.parties[p.partyCode];
  return {
    world: { width: WORLD_SIZE * 2, height: WORLD_SIZE * 2, districts: DISTRICTS, spawns: SPAWNS, pointsOfInterest: POINTS_OF_INTEREST, bosses: w.bosses, caches: w.caches, rescues: w.rescues },
    players: Object.entries(w.players).map(([id, player]) => publicPlayer(id, player, acct, now)).filter(v => v.online),
    self: p ? publicPlayer(acct, p, acct, now) : null,
    party: party ? { code: p.partyCode, leader: party.leader === acct, members: party.members.map(id => publicPlayer(id, w.players[id] || {x:0,z:0,spawn:SPAWNS[0].id,lastSeen:0,partyCode:p.partyCode}, acct, now)) } : null,
    encounters: Object.values(Combat.normalizeEncounters(w.encounters, now)).filter(e => !e.defeated && e.hp > 0).map(Combat.publicEncounter),
    selfEncounter: Combat.publicEncounter(w.encounters?.[acct]),
    selfSurvival: p ? { ...p.survival } : null
  };
}
function enter(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  let p = w.players[acct];
  if (!p) {
    const spawn = chooseSpawn(w, acct);
    p = w.players[acct] = { x: spawn.x, z: spawn.z, spawn: spawn.id, lastSeen: now, lastMove: now, partyCode: null };
  }
  p.lastSeen = now;
  p.survival = Survival.tick(p.survival, now);
  if (p.partyCode && w.parties[p.partyCode]) {
    const leader = w.players[w.parties[p.partyCode].leader];
    if (leader) { p.x = leader.x; p.z = leader.z; }
  }
  // Refreshes advance bounded pursuit too, so infected do not require player movement to update.
  w.encounters = Combat.advance({ encounters: w.encounters, players: w.players, now });
  return { world: w, result: snapshot(w, acct, now) };
}
function move(input, acct, x, z, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct];
  if (!p) throw new Error('not_in_expedition');
  if (p.partyCode && w.parties[p.partyCode] && w.parties[p.partyCode].leader !== acct) throw new Error('party_leader_controls_movement');
  if (now - p.lastMove < 900) throw new Error('move_cooldown');
  let nx = clamp(x, -WORLD_SIZE, WORLD_SIZE), nz = clamp(z, -WORLD_SIZE, WORLD_SIZE);
  const radius = Math.hypot(nx, nz); if (radius > WORLD_SIZE) { nx = nx / radius * WORLD_SIZE; nz = nz / radius * WORLD_SIZE; }
  const dx = nx - p.x, dz = nz - p.z, d = Math.hypot(dx, dz);
  const scale = d > MOVE_STEP ? MOVE_STEP / d : 1;
  const oldX = p.x, oldZ = p.z;
  p.x = Math.round((p.x + dx * scale) * 10) / 10; p.z = Math.round((p.z + dz * scale) * 10) / 10;
  p.lastMove = p.lastSeen = now;
  p.survival = Survival.move(p.survival, now, Math.hypot(p.x - oldX, p.z - oldZ));
  if (p.partyCode && w.parties[p.partyCode] && w.parties[p.partyCode].leader === acct) {
    for (const member of w.parties[p.partyCode].members) if (member !== acct && w.players[member]) {
      const offset = (hash(member) % 7) - 3;
      w.players[member].x = clamp(p.x + offset, -WORLD_SIZE, WORLD_SIZE);
      w.players[member].z = clamp(p.z + (hash(member + 'z') % 7) - 3, -WORLD_SIZE, WORLD_SIZE);
      w.players[member].lastSeen = now;
    }
  }
  // Advance AI only on an authoritative world action; no client frame loop can move enemies.
  w.encounters = Combat.advance({ encounters: w.encounters, players: w.players, now });
  return { world: w, result: snapshot(w, acct, now) };
}
function createParty(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
  prune(w, now);
  const p = w.players[acct];
  if (!p) throw new Error('not_in_expedition');
  if (p.partyCode && w.parties[p.partyCode]) throw new Error('already_in_party');
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
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
  if (party.members.length >= 4) throw new Error('party_full');
  if (p.partyCode && w.parties[p.partyCode]) throw new Error('already_in_party');
  party.members.push(acct); p.partyCode = key;
  const leader = w.players[party.leader];
  if (leader) { p.x = leader.x; p.z = leader.z; p.spawn = leader.spawn; }
  p.lastSeen = now;
  return { world: w, result: snapshot(w, acct, now) };
}
function leave(input, acct, now = Date.now()) {
  const w = normalizeWorld(JSON.parse(JSON.stringify(input || defaultWorld())));
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
module.exports = { WORLD_SIZE, PRESENCE_TTL, MOVE_STEP, SPAWNS, DISTRICTS, POINTS_OF_INTEREST, defaultWorld, normalizeWorld, districtAt, nearestPoint, snapshot, enter, move, createParty, joinParty, leave };
