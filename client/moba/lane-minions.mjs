/**
 * Deterministic lane-minion simulation for the BURN City MOBA prototype.
 *
 * This module is deliberately separate from the hero rules core and rendering.
 * The authoritative match loop should call advanceLaneMinions once per server tick.
 * Minions can fight opposing minions and siege the enemy tower/core; they do not
 * accept client commands and cannot bypass a living tower to damage the core.
 */

const clone = (value) => structuredClone(value);
const finite = (n) => typeof n === "number" && Number.isFinite(n);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export const DEFAULT_MINION_RULES = Object.freeze({
  health: 250,
  damage: 35,
  movePerTick: 0.75,
  attackRange: 2.5,
  attackCooldownTicks: 4,
  spawnOffset: 72,
  spacing: 2.5
});

export function spawnMinionWave(state, {
  waveId,
  countPerTeam = 3,
  laneY = 0,
  rules = {}
} = {}) {
  if (!state || state.status !== "live") throw new Error("cannot spawn minions outside a live match");
  if (typeof waveId !== "string" || !waveId.trim()) throw new TypeError("waveId must be a non-empty string");
  if (Object.values(state.entities).some((entity) => entity.kind === "minion" && entity.waveId === waveId)) {
    throw new Error("waveId already exists in this match");
  }
  if (!Number.isInteger(countPerTeam) || countPerTeam < 1 || countPerTeam > 10) {
    throw new RangeError("countPerTeam must be an integer from 1 to 10");
  }
  if (!finite(laneY)) throw new TypeError("laneY must be finite");
  const config = { ...DEFAULT_MINION_RULES, ...rules };
  for (const key of ["health", "damage", "movePerTick", "attackRange", "attackCooldownTicks", "spacing"]) {
    if (!finite(config[key]) || config[key] <= 0) throw new RangeError(`invalid minion rule: ${key}`);
  }
  const next = clone(state);
  const created = [];
  for (const teamId of ["blue", "red"]) {
    const direction = teamId === "blue" ? 1 : -1;
    const startX = teamId === "blue" ? -config.spawnOffset : config.spawnOffset;
    for (let i = 0; i < countPerTeam; i++) {
      const id = `minion-${waveId}-${teamId}-${i + 1}`;
      if (next.entities[id]) throw new Error(`entity id collision: ${id}`);
      next.entities[id] = {
        id, kind: "minion", teamId, waveId, laneY,
        x: startX, y: laneY + (i - (countPerTeam - 1) / 2) * config.spacing,
        direction, health: config.health, maxHealth: config.health, alive: true,
        damage: config.damage, movePerTick: config.movePerTick,
        attackRange: config.attackRange, attackCooldownTicks: config.attackCooldownTicks,
        attackCooldown: 0
      };
      created.push(id);
    }
  }
  next.events = [{ type: "minion-wave-spawned", tick: next.tick, waveId, entityIds: created }];
  return { state: next, events: next.events, entityIds: created };
}

function chooseTarget(state, minion) {
  const enemyTeam = minion.teamId === "blue" ? "red" : "blue";
  const enemyMinions = Object.values(state.entities)
    .filter((e) => e.kind === "minion" && e.alive && e.teamId === enemyTeam && Math.abs(e.y - minion.y) <= minion.attackRange)
    .sort((a, b) => distance(minion, a) - distance(minion, b));
  if (enemyMinions.length && distance(minion, enemyMinions[0]) <= minion.attackRange) return enemyMinions[0];
  const tower = state.entities[`${enemyTeam}-tower`];
  if (tower?.alive && distance(minion, tower) <= minion.attackRange) return tower;
  const core = state.entities[`${enemyTeam}-core`];
  if (core?.alive && !tower?.alive && distance(minion, core) <= minion.attackRange) return core;
  return null;
}

export function advanceLaneMinions(currentState) {
  if (!currentState || currentState.status !== "live") return { state: currentState, events: [] };
  const next = clone(currentState);
  const events = [];
  const minions = Object.values(next.entities).filter((e) => e.kind === "minion" && e.alive).sort((a, b) => a.id.localeCompare(b.id));
  for (const minion of minions) {
    if (!minion.alive) continue;
    minion.attackCooldown = Math.max(0, (minion.attackCooldown || 0) - 1);
    const target = chooseTarget(next, minion);
    if (target) {
      if (minion.attackCooldown === 0) {
        target.health = Math.max(0, target.health - minion.damage);
        target.alive = target.health > 0;
        minion.attackCooldown = minion.attackCooldownTicks;
        events.push({ type: "minion-damage", tick: next.tick, sourceId: minion.id, targetId: target.id, amount: minion.damage, remainingHealth: target.health });
        if (!target.alive && target.kind === "minion") events.push({ type: "minion-defeated", tick: next.tick, entityId: target.id });
        if (!target.alive && target.kind === "tower") events.push({ type: "tower-destroyed", tick: next.tick, teamId: target.teamId, sourceId: minion.id });
        if (!target.alive && target.kind === "core") {
          next.status = "resolving_result";
          next.result = { winnerTeamId: minion.teamId, loserTeamId: target.teamId, reason: "core-destroyed", finalizedAtTick: next.tick };
          events.push({ type: "match-won", tick: next.tick, winnerTeamId: minion.teamId, reason: "core-destroyed" });
          break;
        }
      }
    } else {
      const enemyTeam = minion.teamId === "blue" ? "red" : "blue";
      const objective = next.entities[`${enemyTeam}-tower`]?.alive
        ? next.entities[`${enemyTeam}-tower`]
        : next.entities[`${enemyTeam}-core`];
      const dx = objective.x - minion.x;
      const dy = objective.y - minion.y;
      const length = Math.hypot(dx, dy) || 1;
      const step = Math.min(minion.movePerTick, length);
      minion.x += dx / length * step;
      minion.y += dy / length * step;
      events.push({ type: "minion-moved", tick: next.tick, entityId: minion.id, x: minion.x, y: minion.y });
    }
  }
  next.events = events;
  return { state: next, events };
}
