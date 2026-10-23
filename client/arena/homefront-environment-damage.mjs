// Deterministic environment damage/repair state helpers for Homefront.
// Pure state transitions only: callers must persist and authorize these states server-side.
// Visual meshes, collision proxies, and network replication are integrated separately.
export const DEFAULT_ENVIRONMENT_REPAIR = Object.freeze({ graceMs: 45_000, durationMs: 20_000 });

export function environmentDamageStage(health, maxHealth = 100) {
  if (!Number.isFinite(health) || !Number.isFinite(maxHealth) || maxHealth <= 0) throw new TypeError('environmentDamageStage expects finite health and positive maxHealth');
  const ratio = Math.max(0, Math.min(1, health / maxHealth));
  if (ratio <= 0) return 'destroyed';
  if (ratio < 0.3) return 'critical';
  if (ratio < 0.6) return 'damaged';
  if (ratio < 0.85) return 'scuffed';
  return 'intact';
}

export function createEnvironmentDamageState({ id, maxHealth = 100, health = maxHealth, unoccupiedSince = null, repairStartHealth = health } = {}) {
  if (typeof id !== 'string' || !id.trim()) throw new TypeError('environment damage state requires a stable id');
  if (!Number.isFinite(maxHealth) || maxHealth <= 0) throw new TypeError('maxHealth must be positive');
  if (!Number.isFinite(health)) throw new TypeError('health must be finite');
  const safeHealth = Math.max(0, Math.min(maxHealth, health));
  return { id, maxHealth, health: safeHealth, stage: environmentDamageStage(safeHealth, maxHealth), unoccupiedSince: Number.isFinite(unoccupiedSince) ? unoccupiedSince : null, repairStartHealth: Math.max(0, Math.min(maxHealth, Number.isFinite(repairStartHealth) ? repairStartHealth : safeHealth)) };
}

export function applyEnvironmentDamage(state, amount, now = Date.now()) {
  if (!state || typeof state.id !== 'string') throw new TypeError('valid environment damage state is required');
  if (!Number.isFinite(amount) || amount < 0) throw new TypeError('damage must be finite and non-negative');
  if (!Number.isFinite(now)) throw new TypeError('damage timestamp must be finite');
  const health = Math.max(0, Math.min(state.maxHealth, state.health) - amount);
  return { ...state, health, stage: environmentDamageStage(health, state.maxHealth), unoccupiedSince: null, repairStartHealth: health };
}

// occupied must be calculated by the authoritative world layer from all players
// in the environment cell/chunk, not from one client's local camera or visibility.
export function setEnvironmentOccupied(state, occupied, now = Date.now()) {
  if (!state || typeof state.id !== 'string') throw new TypeError('valid environment damage state is required');
  if (typeof occupied !== 'boolean') throw new TypeError('occupied must be a boolean');
  if (!Number.isFinite(now)) throw new TypeError('occupancy timestamp must be finite');
  if (occupied) return { ...state, unoccupiedSince: null, repairStartHealth: state.health };
  if (state.unoccupiedSince !== null) return state;
  return { ...state, unoccupiedSince: now, repairStartHealth: state.health };
}

// Call on the authoritative simulation tick. Restoration waits until the entire
// cell has been empty for graceMs, then restores health over durationMs.
// Stable ids let the caller restore the matching visual/collision variant.
export function tickEnvironmentRepair(state, now = Date.now(), options = {}) {
  if (!state || typeof state.id !== 'string') throw new TypeError('valid environment damage state is required');
  if (!Number.isFinite(now)) throw new TypeError('repair timestamp must be finite');
  const graceMs = options.graceMs ?? DEFAULT_ENVIRONMENT_REPAIR.graceMs;
  const durationMs = options.durationMs ?? DEFAULT_ENVIRONMENT_REPAIR.durationMs;
  if (!Number.isFinite(graceMs) || graceMs < 0 || !Number.isFinite(durationMs) || durationMs <= 0) throw new TypeError('graceMs must be non-negative and durationMs must be positive');
  if (state.health >= state.maxHealth || state.unoccupiedSince === null) return state;
  const repairStartedAt = state.unoccupiedSince + graceMs;
  if (now < repairStartedAt) return state;
  const progress = Math.max(0, Math.min(1, (now - repairStartedAt) / durationMs));
  const health = Math.min(state.maxHealth, state.repairStartHealth + (state.maxHealth - state.repairStartHealth) * progress);
  return { ...state, health, stage: environmentDamageStage(health, state.maxHealth) };
}