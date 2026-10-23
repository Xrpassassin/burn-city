'use strict';
// Server-owned damage state for deterministic Graveyard structures.
// Geometry comes from the same collision catalog used by movement; clients never define structures or damage.
const Collision = require('./homefront-collision');
const REPAIR = Object.freeze({ graceMs: 45_000, durationMs: 20_000, occupancyRadius: 24 });
const STRUCTURES = Collision.OBSTACLES
  .filter(o => o.id.startsWith('building:') || o.id.startsWith('vehicle:') || o.id.startsWith('tree:') || o.id.startsWith('log:') || o.id.startsWith('debris:'))
  .map(o => {
    const kind = o.id.startsWith('building:') ? 'building' : o.id.startsWith('vehicle:') ? 'vehicle' : o.id.startsWith('tree:') ? 'tree' : o.id.startsWith('log:') ? 'log' : 'debris';
    return Object.freeze({ id: o.id, kind, x: o.x, z: o.z, maxHealth: kind === 'building' ? 240 : kind === 'vehicle' ? 150 : kind === 'tree' ? 90 : kind === 'log' ? 65 : 45 });
  });
const BY_ID = new Map(STRUCTURES.map(s => [s.id, s]));
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number.isFinite(n) ? n : a));
function stage(health, maxHealth) {
  if (health <= 0) return 'destroyed';
  const r = health / maxHealth;
  return r < .3 ? 'critical' : r < .6 ? 'damaged' : r < .85 ? 'scuffed' : 'intact';
}
function initialState(spec) {
  return { id: spec.id, health: spec.maxHealth, maxHealth: spec.maxHealth, stage: 'intact', unoccupiedSince: null, repairStartHealth: spec.maxHealth, lastDamagedAt: 0 };
}
function normalize(input) {
  const out = Object.create(null);
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    for (const [id, value] of Object.entries(input)) {
      const spec = BY_ID.get(id);
      if (!spec || !value || typeof value !== 'object') continue;
      const health = clamp(value.health, 0, spec.maxHealth);
      out[id] = { id, health, maxHealth: spec.maxHealth, stage: stage(health, spec.maxHealth),
        unoccupiedSince: Number.isFinite(value.unoccupiedSince) ? Math.max(0, value.unoccupiedSince) : null,
        repairStartHealth: clamp(value.repairStartHealth, 0, spec.maxHealth),
        lastDamagedAt: clamp(value.lastDamagedAt, 0, Number.MAX_SAFE_INTEGER) };
    }
  }
  return out;
}
function ensure(input, id) {
  const spec = BY_ID.get(id);
  if (!spec) throw new Error('unknown_environment_structure');
  const states = normalize(input);
  if (!states[id]) states[id] = initialState(spec);
  return { states, spec, state: states[id] };
}
function damage(input, id, amount, now = Date.now()) {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100) throw new Error('invalid_environment_damage');
  if (!Number.isFinite(now)) throw new TypeError('invalid_environment_timestamp');
  const { states, state } = ensure(input, id);
  state.health = Math.max(0, state.health - amount);
  state.stage = stage(state.health, state.maxHealth);
  state.unoccupiedSince = null;
  state.repairStartHealth = state.health;
  state.lastDamagedAt = now;
  return { states, structure: publicStructure(state) };
}
function setOccupancy(input, players, now = Date.now()) {
  const states = normalize(input);
  const activePlayers = Object.values(players || {}).filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.lastSeen) && now - p.lastSeen <= 45_000);
  for (const spec of STRUCTURES) {
    const state = states[spec.id] || (states[spec.id] = initialState(spec));
    if (state.health >= state.maxHealth) continue;
    const occupied = activePlayers.some(p => Math.hypot(p.x - spec.x, p.z - spec.z) <= REPAIR.occupancyRadius);
    if (occupied) { state.unoccupiedSince = null; state.repairStartHealth = state.health; }
    else if (state.unoccupiedSince === null) { state.unoccupiedSince = now; state.repairStartHealth = state.health; }
  }
  return states;
}
function tick(input, players, now = Date.now()) {
  if (!Number.isFinite(now)) throw new TypeError('invalid_environment_timestamp');
  const states = setOccupancy(input, players, now);
  for (const state of Object.values(states)) {
    if (state.health >= state.maxHealth || state.unoccupiedSince === null) continue;
    const start = state.unoccupiedSince + REPAIR.graceMs;
    if (now < start) continue;
    const progress = clamp((now - start) / REPAIR.durationMs, 0, 1);
    state.health = Math.min(state.maxHealth, state.repairStartHealth + (state.maxHealth - state.repairStartHealth) * progress);
    state.stage = stage(state.health, state.maxHealth);
  }
  return states;
}
function publicStructure(state) {
  const spec = BY_ID.get(state.id);
  return spec ? { id: state.id, kind: spec.kind, x: spec.x, z: spec.z, health: state.health, maxHealth: state.maxHealth, stage: state.stage, collisionEnabled: state.health > 0 } : null;
}
function nearby(input, x, z, radius = 42) {
  const states = normalize(input);
  return STRUCTURES.filter(s => Math.hypot(s.x - x, s.z - z) <= radius)
    .map(s => publicStructure(states[s.id] || initialState(s))).filter(Boolean);
}
function isKnown(id) { return typeof id === 'string' && BY_ID.has(id); }
module.exports = { REPAIR, STRUCTURES, isKnown, normalize, damage, tick, nearby, publicStructure };
