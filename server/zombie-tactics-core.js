'use strict';

// Deterministic, side-effect-free tactical decisions for BURN City Zombies.
// This module does not move actors, resolve damage, or bypass server navigation.
// Callers must validate any resulting destination with the existing map/collision rules.

const ROLES = Object.freeze(['pursuer', 'flanker', 'bruiser', 'straggler', 'runner']);
const STATES = Object.freeze(['wander', 'investigate', 'pursue', 'search', 'attack', 'stagger', 'recover', 'dead']);

function hashId(value) {
  const s = String(value ?? '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Assign stable squad roles. Role distribution is deterministic for a given
 * squad ID/member ID and does not depend on update order or Math.random().
 */
function assignRole(memberId, squadId = 'solo', memberIndex = 0, squadSize = 1) {
  const size = Math.max(1, Math.floor(Number(squadSize) || 1));
  const index = Math.max(0, Math.floor(Number(memberIndex) || 0));
  if (index === 0) return 'pursuer';
  if (size === 1) return 'pursuer';
  const h = hashId(String(squadId) + ':' + String(memberId));
  const pool = size >= 4
    ? ['flanker', 'bruiser', 'straggler', 'runner']
    : ['flanker', 'straggler', 'runner'];
  return pool[(h + index - 1) % pool.length];
}

function distance2D(a, b) {
  if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(a.z) ||
      !Number.isFinite(b.x) || !Number.isFinite(b.z)) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Classify a recent noise event for a zombie.
 * Noise is a stimulus, never proof that a player is visible.
 */
function hearNoise(zombiePosition, noise, nowMs) {
  if (!noise || !Number.isFinite(noise.x) || !Number.isFinite(noise.z)) return null;
  if (!Number.isFinite(noise.atMs) || !Number.isFinite(nowMs) || nowMs < noise.atMs) return null;
  const ageMs = nowMs - noise.atMs;
  const ttlMs = Number(noise.ttlMs ?? 8000);
  const radius = Number(noise.radius ?? 0);
  const rawIntensity = Number(noise.intensity ?? 1);
  if (![ttlMs, radius, rawIntensity].every(Number.isFinite) || ttlMs < 0 || radius < 0) return null;
  if (ageMs > ttlMs) return null;
  const distance = distance2D(zombiePosition, noise);
  if (distance > radius) return null;
  const intensity = Math.max(0, Math.min(1, rawIntensity));
  return { x: noise.x, z: noise.z, distance, intensity, ageMs };
}

/**
 * Pure behavior selection. The caller supplies authoritative perception,
 * cooldown/state facts, and timestamps. Combat remains in the existing
 * server simulation.
 */
function chooseBehavior(input = {}) {
  const nowMs = Number(input.nowMs);
  const zombie = input.zombie || {};
  const target = input.target || null;
  const visible = input.targetVisible === true;
  const alive = zombie.alive !== false && !(Number.isFinite(zombie.hp) && zombie.hp <= 0);
  if (!alive || zombie.dead === true) return { state: 'dead', reason: 'dead' };
  if (input.staggered === true) return { state: 'stagger', reason: 'hit-reaction' };
  if (input.recovering === true) return { state: 'recover', reason: 'recovering' };

  const rawAttackRange = Number(input.attackRange ?? 1.6);
  const attackRange = Number.isFinite(rawAttackRange) ? Math.max(0, rawAttackRange) : 1.6;
  if (visible && target && Number.isFinite(target.x) && Number.isFinite(target.z)) {
    const distance = distance2D(zombie, target);
    if (distance <= attackRange) return { state: 'attack', reason: 'visible-target', target: { x: target.x, z: target.z } };
    return { state: 'pursue', reason: 'visible-target', target: { x: target.x, z: target.z } };
  }

  const noise = hearNoise(zombie, input.noise, nowMs);
  if (noise) {
    return {
      state: 'investigate',
      reason: 'heard-noise',
      target: { x: noise.x, z: noise.z },
      intensity: noise.intensity
    };
  }

  const lastKnown = input.lastKnownTarget;
  if (lastKnown && Number.isFinite(lastKnown.x) && Number.isFinite(lastKnown.z) &&
      Number.isFinite(lastKnown.untilMs) && Number.isFinite(nowMs) && nowMs <= lastKnown.untilMs) {
    return {
      state: 'search',
      reason: 'last-known-target',
      target: { x: lastKnown.x, z: lastKnown.z }
    };
  }

  return { state: 'wander', reason: 'no-stimulus' };
}

/**
 * Return a bounded alternate approach hint for a flanker. This is only a
 * desired point: callers MUST route it through the existing authoritative
 * flow field/pathfinder and collision checks before moving the zombie.
 */
function flankingHint(target, anchor, side = 1, offset = 3) {
  if (!target || !anchor || ![target.x, target.z, anchor.x, anchor.z].every(Number.isFinite)) return null;
  const dx = target.x - anchor.x;
  const dz = target.z - anchor.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return null;
  const d = Math.max(1, Math.min(8, Number(offset) || 3));
  const sign = Number(side) < 0 ? -1 : 1;
  // Perpendicular to the anchor-to-target vector; not a final navigable route.
  return { x: target.x + sign * (-dz / length) * d, z: target.z + sign * (dx / length) * d };
}

/**
 * Select a desired approach point for a coordinated squad member.
 * This is a hint only; the live simulation must validate floor, LOS and
 * walkability, and continue to use the authoritative movement/collision code.
 */
function selectApproachTarget(input = {}) {
  const target = input.target;
  const zombie = input.zombie;
  if (!target || !zombie || ![target.x, target.z, zombie.x, zombie.z].every(Number.isFinite)) return null;
  if (input.targetVisible !== true) return null;
  if (input.role !== 'flanker') return { x: target.x, z: target.z, role: input.role || 'pursuer' };
  const distance = distance2D(zombie, target);
  const minDistance = Number.isFinite(input.minFlankDistance) ? Math.max(2, input.minFlankDistance) : 4;
  if (distance < minDistance) return { x: target.x, z: target.z, role: 'flanker' };
  // Stable per-zombie side choice avoids frame-to-frame oscillation and lets
  // squadmates approach from different angles without shared mutable state.
  const side = hashId(zombie.id ?? input.memberId ?? '') % 2 === 0 ? -1 : 1;
  const hint = flankingHint(target, zombie, side, input.offset ?? 4);
  return hint ? { ...hint, role: 'flanker' } : { x: target.x, z: target.z, role: 'flanker' };
}

module.exports = { ROLES, STATES, assignRole, distance2D, hearNoise, chooseBehavior, flankingHint, selectApproachTarget };
