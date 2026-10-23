import assert from "node:assert/strict";
import { advanceLaneMinions, spawnMinionWave } from "./lane-minions.mjs";
import { createMatch } from "./rules-core.mjs";

{
  const state = createMatch({ slotsPerTeam: 1 });
  const spawned = spawnMinionWave(state, { waveId: "wave-1", countPerTeam: 3 });
  assert.equal(spawned.entityIds.length, 6);
  assert.equal(Object.values(spawned.state.entities).filter((e) => e.kind === "minion").length, 6);
  assert.equal(Object.values(state.entities).filter((e) => e.kind === "minion").length, 0, "spawn must not mutate input");
  assert.throws(() => spawnMinionWave(spawned.state, { waveId: "wave-1" }), /already exists/);
  assert.throws(() => spawnMinionWave(state, { waveId: "bad", countPerTeam: 11 }), /countPerTeam/);
}

{
  const state = createMatch({ slotsPerTeam: 1 });
  const { state: spawned } = spawnMinionWave(state, { waveId: "push", countPerTeam: 1, rules: { spawnOffset: 65, movePerTick: 1 } });
  const beforeX = spawned.entities["minion-push-blue-1"].x;
  const advanced = advanceLaneMinions(spawned);
  assert.ok(advanced.state.entities["minion-push-blue-1"].x > beforeX, "blue minion should advance toward red base");
  assert.equal(spawned.entities["minion-push-blue-1"].x, beforeX, "advance must not mutate input");
  assert.ok(advanced.events.some((e) => e.type === "minion-moved"));
}

{
  const state = createMatch({ slotsPerTeam: 1, rules: { towerMaxHealth: 70, coreMaxHealth: 70 } });
  const { state: spawned } = spawnMinionWave(state, {
    waveId: "siege", countPerTeam: 1, rules: { spawnOffset: 58, damage: 35, attackRange: 20, attackCooldownTicks: 1 }
  });
  const first = advanceLaneMinions(spawned);
  assert.equal(first.state.entities["red-tower"].health, 1165, "minions should attack enemy tower in range");
  assert.equal(first.state.entities["red-core"].health, 70, "tower should protect core");
}

console.log("MOBA lane minions: all assertions passed");
