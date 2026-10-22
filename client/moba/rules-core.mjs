/**
 * BURN City MOBA — deterministic, renderer-free rules core.
 *
 * This module intentionally has no DOM, Three.js, network, persistence, or wallet
 * dependencies. The server must own the canonical state and call these functions.
 * Client messages should be converted to validated intents before reaching here.
 */

export const RULES_VERSION = 1;
export const TEAM_IDS = Object.freeze(["blue", "red"]);
export const DEFAULT_RULES = Object.freeze({
  slotsPerTeam: 5,
  mapMin: -100,
  mapMax: 100,
  heroMaxHealth: 1000,
  heroMovePerTick: 2,
  heroAttackRange: 8,
  heroAttackDamage: 100,
  heroAttackCooldownTicks: 5,
  heroRespawnTicks: 10,
  towerMaxHealth: 1200,
  coreMaxHealth: 3000,
  tickRate: 20
});

const clone = (value) => structuredClone(value);
const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function createMatch({ matchId = "local-match", slotsPerTeam = DEFAULT_RULES.slotsPerTeam, rules = {} } = {}) {
  if (!Number.isInteger(slotsPerTeam) || slotsPerTeam < 1 || slotsPerTeam > 5) {
    throw new RangeError("slotsPerTeam must be an integer from 1 to 5");
  }
  const config = { ...DEFAULT_RULES, ...rules };
  const entities = {};
  const slots = {};
  for (const teamId of TEAM_IDS) {
    for (let i = 0; i < slotsPerTeam; i++) {
      const id = `${teamId}-hero-${i + 1}`;
      slots[id] = { slotId: id, teamId, controller: "human", connected: true, heroId: id };
      entities[id] = {
        id, kind: "hero", teamId, slotId: id, x: teamId === "blue" ? -40 + i * 2 : 40 - i * 2,
        y: i * 3, health: config.heroMaxHealth, maxHealth: config.heroMaxHealth,
        alive: true, respawnTicks: 0, attackCooldown: 0, abilityCooldown: 0
      };
    }
    const baseX = teamId === "blue" ? -90 : 90;
    entities[`${teamId}-tower`] = {
      id: `${teamId}-tower`, kind: "tower", teamId, x: baseX * 0.65, y: 0,
      health: config.towerMaxHealth, maxHealth: config.towerMaxHealth, alive: true
    };
    entities[`${teamId}-core`] = {
      id: `${teamId}-core`, kind: "core", teamId, x: baseX, y: 0,
      health: config.coreMaxHealth, maxHealth: config.coreMaxHealth, alive: true
    };
  }
  return {
    schemaVersion: RULES_VERSION, matchId, status: "live", tick: 0, config,
    slots, entities, events: [], result: null
  };
}

function reject(state, reason) {
  return { state, accepted: false, reason, events: [] };
}

export function applyIntent(currentState, intent) {
  if (!currentState || currentState.status !== "live") return reject(currentState, "match-not-live");
  if (!intent || typeof intent !== "object" || typeof intent.slotId !== "string") return reject(currentState, "invalid-intent");
  const slot = currentState.slots[intent.slotId];
  if (!slot || slot.controller === "empty") return reject(currentState, "unknown-slot");
  const actor = currentState.entities[slot.heroId];
  if (!actor || !actor.alive) return reject(currentState, "hero-not-alive");
  const next = clone(currentState);
  const hero = next.entities[slot.heroId];
  const events = [];

  if (intent.type === "move") {
    if (!isFiniteNumber(intent.x) || !isFiniteNumber(intent.y)) return reject(currentState, "invalid-move");
    const dx = intent.x - hero.x;
    const dy = intent.y - hero.y;
    const length = Math.hypot(dx, dy);
    const maxStep = next.config.heroMovePerTick;
    const scale = length > maxStep && length > 0 ? maxStep / length : 1;
    hero.x = clamp(hero.x + dx * scale, next.config.mapMin, next.config.mapMax);
    hero.y = clamp(hero.y + dy * scale, next.config.mapMin, next.config.mapMax);
    events.push({ type: "hero-moved", tick: next.tick, entityId: hero.id, x: hero.x, y: hero.y });
  } else if (intent.type === "attack") {
    if (hero.attackCooldown > 0) return reject(currentState, "attack-cooldown");
    if (typeof intent.targetId !== "string") return reject(currentState, "invalid-target");
    const target = next.entities[intent.targetId];
    if (!target || !target.alive) return reject(currentState, "target-unavailable");
    if (target.teamId === hero.teamId) return reject(currentState, "friendly-fire");
    if (target.kind === "core" && next.entities[`${target.teamId}-tower`]?.alive) return reject(currentState, "tower-protects-core");
    if (distance(hero, target) > next.config.heroAttackRange) return reject(currentState, "target-out-of-range");
    target.health = Math.max(0, target.health - next.config.heroAttackDamage);
    target.alive = target.health > 0;
    hero.attackCooldown = next.config.heroAttackCooldownTicks;
    events.push({ type: "damage-applied", tick: next.tick, sourceId: hero.id, targetId: target.id, amount: next.config.heroAttackDamage, remainingHealth: target.health });
    if (!target.alive && target.kind === "hero") {
      target.respawnTicks = next.config.heroRespawnTicks;
      events.push({ type: "hero-defeated", tick: next.tick, entityId: target.id, respawnTicks: target.respawnTicks });
    }
    if (!target.alive && target.kind === "core") {
      next.status = "resolving_result";
      next.result = { winnerTeamId: hero.teamId, loserTeamId: target.teamId, reason: "core-destroyed", finalizedAtTick: next.tick };
      events.push({ type: "match-won", tick: next.tick, winnerTeamId: hero.teamId, reason: "core-destroyed" });
    }
  } else if (intent.type === "cast") {
    if (hero.abilityCooldown > 0) return reject(currentState, "ability-cooldown");
    if (typeof intent.targetId !== "string") return reject(currentState, "invalid-target");
    const target = next.entities[intent.targetId];
    if (!target || !target.alive || target.teamId === hero.teamId || target.kind !== "hero") return reject(currentState, "invalid-ability-target");
    if (distance(hero, target) > next.config.heroAttackRange * 1.5) return reject(currentState, "target-out-of-range");
    const amount = Math.round(next.config.heroAttackDamage * 1.5);
    target.health = Math.max(0, target.health - amount);
    target.alive = target.health > 0;
    hero.abilityCooldown = next.config.heroAttackCooldownTicks * 3;
    events.push({ type: "ability-hit", tick: next.tick, sourceId: hero.id, targetId: target.id, amount, remainingHealth: target.health });
    if (!target.alive) {
      target.respawnTicks = next.config.heroRespawnTicks;
      events.push({ type: "hero-defeated", tick: next.tick, entityId: target.id, respawnTicks: target.respawnTicks });
    }
  } else {
    return reject(currentState, "unsupported-intent");
  }

  next.events = events;
  return { state: next, accepted: true, reason: null, events };
}

export function advanceTick(currentState, ticks = 1) {
  if (!currentState || currentState.status !== "live") return currentState;
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 1000) throw new RangeError("ticks must be an integer from 1 to 1000");
  const next = clone(currentState);
  for (let step = 0; step < ticks && next.status === "live"; step++) {
    next.tick += 1;
    for (const entity of Object.values(next.entities)) {
      if (entity.kind !== "hero") continue;
      entity.attackCooldown = Math.max(0, entity.attackCooldown - 1);
      entity.abilityCooldown = Math.max(0, entity.abilityCooldown - 1);
      if (!entity.alive && entity.respawnTicks > 0) {
        entity.respawnTicks -= 1;
        if (entity.respawnTicks === 0) {
          entity.health = entity.maxHealth;
          entity.alive = true;
          entity.attackCooldown = 0;
          entity.abilityCooldown = 0;
        }
      }
    }
  }
  next.events = [];
  return next;
}

export function setSlotController(currentState, slotId, controller, connected = true) {
  if (!currentState?.slots?.[slotId]) throw new RangeError("unknown slot");
  if (!["human", "bot", "empty"].includes(controller)) throw new TypeError("unsupported controller");
  const next = clone(currentState);
  next.slots[slotId].controller = controller;
  next.slots[slotId].connected = Boolean(connected);
  return next;
}

export function getMatchSummary(state) {
  return {
    matchId: state.matchId, status: state.status, tick: state.tick,
    aliveHeroes: Object.values(state.entities).filter((e) => e.kind === "hero" && e.alive).length,
    bots: Object.values(state.slots).filter((s) => s.controller === "bot").length,
    result: state.result ? clone(state.result) : null
  };
}
