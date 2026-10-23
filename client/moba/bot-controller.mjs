/**
 * BURN City MOBA — deterministic baseline bot policy.
 *
 * This is a policy adapter only: it emits the same intent shape a client would
 * send. It never applies damage or mutates match state. The server must pass
 * only information the bot is allowed to observe and validate its chosen intent
 * through rules-core.mjs.
 */

export const BOT_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ decisionIntervalTicks: 5, abilityUse: false, heroEngageRangeMultiplier: 0.7 }),
  normal: Object.freeze({ decisionIntervalTicks: 3, abilityUse: true, heroEngageRangeMultiplier: 1 }),
  hard: Object.freeze({ decisionIntervalTicks: 2, abilityUse: true, heroEngageRangeMultiplier: 1.25 }),
  expert: Object.freeze({ decisionIntervalTicks: 1, abilityUse: true, heroEngageRangeMultiplier: 1.5 })
});

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const healthRatio = (hero) => hero.maxHealth > 0 ? hero.health / hero.maxHealth : 0;

export function chooseBotIntent(state, slotId, difficulty = "normal") {
  const profile = BOT_DIFFICULTIES[difficulty];
  if (!profile) throw new RangeError("difficulty must be easy, normal, hard, or expert");
  const slot = state?.slots?.[slotId];
  if (!slot || slot.controller !== "bot" || state.status !== "live") return null;
  if (state.tick % profile.decisionIntervalTicks !== 0) return null;

  const hero = state.entities[slot.heroId];
  if (!hero?.alive) return null;
  const enemyTeam = slot.teamId === "blue" ? "red" : "blue";
  // A damaged bot disengages toward its own tower instead of blindly feeding.
  // Difficulty affects the retreat threshold slightly, not combat statistics.
  const retreatThreshold = difficulty === "easy" ? 0.35 : difficulty === "normal" ? 0.25 : difficulty === "hard" ? 0.2 : 0.15;
  const ownTower = state.entities[`${slot.teamId}-tower`];
  if (healthRatio(hero) <= retreatThreshold && ownTower?.alive) {
    if (distance(hero, ownTower) <= state.config.heroAttackRange && hero.attackCooldown === 0) {
      const closestThreat = Object.values(state.entities)
        .filter((entity) => entity.kind === "hero" && entity.teamId === enemyTeam && entity.alive)
        .sort((a, b) => distance(hero, a) - distance(hero, b) || a.id.localeCompare(b.id))[0];
      if (closestThreat && distance(hero, closestThreat) <= state.config.heroAttackRange) {
        return { type: "attack", slotId, targetId: closestThreat.id };
      }
    }
    return { type: "move", slotId, x: ownTower?.x ?? (slot.teamId === "blue" ? -60 : 60), y: ownTower?.y ?? 0 };
  }
  const enemyHeroes = Object.values(state.entities)
    .filter((entity) => entity.kind === "hero" && entity.teamId === enemyTeam && entity.alive)
    .sort((a, b) => distance(hero, a) - distance(hero, b) || a.id.localeCompare(b.id));
  const nearbyEnemy = enemyHeroes[0];
  const engageRange = state.config.heroAttackRange * profile.heroEngageRangeMultiplier;

  if (nearbyEnemy && distance(hero, nearbyEnemy) <= engageRange) {
    if (profile.abilityUse && hero.abilityCooldown === 0 &&
        distance(hero, nearbyEnemy) <= state.config.heroAttackRange * 1.5) {
      return { type: "cast", slotId, targetId: nearbyEnemy.id };
    }
    if (hero.attackCooldown === 0 && distance(hero, nearbyEnemy) <= state.config.heroAttackRange) {
      return { type: "attack", slotId, targetId: nearbyEnemy.id };
    }
    return null;
  }

  const enemyTower = state.entities[`${enemyTeam}-tower`];
  const objective = enemyTower?.alive ? enemyTower : state.entities[`${enemyTeam}-core`];
  if (!objective?.alive) return null;
  if (distance(hero, objective) <= state.config.heroAttackRange && hero.attackCooldown === 0) {
    return { type: "attack", slotId, targetId: objective.id };
  }
  return { type: "move", slotId, x: objective.x, y: objective.y };
}

export function getBotRoster(state) {
  return Object.values(state.slots)
    .filter((slot) => slot.controller === "bot")
    .map((slot) => ({ slotId: slot.slotId, teamId: slot.teamId, difficulty: slot.difficulty ?? "normal" }))
    .sort((a, b) => a.slotId.localeCompare(b.slotId));
}
