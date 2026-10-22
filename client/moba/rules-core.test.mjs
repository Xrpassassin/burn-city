import assert from "node:assert/strict";
import { applyIntent, advanceTick, createMatch, getMatchSummary, setSlotController } from "./rules-core.mjs";

const makeCloseMatch = () => createMatch({
  matchId: "test",
  slotsPerTeam: 1,
  rules: { heroAttackRange: 50, heroAttackDamage: 600, towerMaxHealth: 600, coreMaxHealth: 600, heroRespawnTicks: 2, heroAttackCooldownTicks: 2 }
});

{
  const state = createMatch({ matchId: "determinism", slotsPerTeam: 2 });
  assert.equal(state.schemaVersion, 1);
  assert.equal(Object.keys(state.slots).length, 4);
  assert.equal(state.entities["blue-core"].health, 3000);
  assert.equal(getMatchSummary(state).bots, 0);
  assert.throws(() => createMatch({ slotsPerTeam: 6 }), /slotsPerTeam/);
}

{
  const state = createMatch({ slotsPerTeam: 1 });
  const hero = state.entities["blue-hero-1"];
  const result = applyIntent(state, { type: "move", slotId: hero.slotId, x: 100, y: 0 });
  assert.equal(result.accepted, true);
  assert.ok(Math.hypot(result.state.entities[hero.id].x - hero.x, result.state.entities[hero.id].y - hero.y) <= state.config.heroMovePerTick + 1e-9);
  assert.equal(state.entities[hero.id].x, hero.x, "intent must not mutate the original state");
  assert.equal(applyIntent(state, { type: "move", slotId: hero.slotId, x: NaN, y: 0 }).reason, "invalid-move");
  assert.equal(applyIntent(state, { type: "unknown", slotId: hero.slotId }).reason, "unsupported-intent");
}

{
  const state = createMatch({ slotsPerTeam: 1 });
  const blue = state.entities["blue-hero-1"];
  const red = state.entities["red-hero-1"];
  const tooFar = applyIntent(state, { type: "attack", slotId: blue.slotId, targetId: red.id });
  assert.equal(tooFar.reason, "target-out-of-range");
  const friendly = applyIntent(state, { type: "attack", slotId: blue.slotId, targetId: "blue-tower" });
  assert.equal(friendly.reason, "friendly-fire");
  const invalid = applyIntent(state, { type: "attack", slotId: blue.slotId, targetId: "no-such-entity" });
  assert.equal(invalid.reason, "target-unavailable");
}

{
  const state = makeCloseMatch();
  const blue = state.entities["blue-hero-1"];
  const red = state.entities["red-hero-1"];
  const repositioned = structuredClone(state);
  repositioned.entities[blue.id].x = -5;
  repositioned.entities[blue.id].y = 0;
  repositioned.entities[red.id].x = 5;
  repositioned.entities[red.id].y = 0;
  const hit = applyIntent(repositioned, { type: "attack", slotId: blue.slotId, targetId: red.id });
  assert.equal(hit.accepted, true);
  assert.equal(hit.state.entities[red.id].health, 400);
  assert.equal(applyIntent(hit.state, { type: "attack", slotId: blue.slotId, targetId: red.id }).reason, "attack-cooldown");
  const cooled = advanceTick(hit.state, 2);
  assert.equal(cooled.entities[blue.id].attackCooldown, 0);
  const lethal = applyIntent(cooled, { type: "cast", slotId: blue.slotId, targetId: red.id });
  assert.equal(lethal.accepted, true);
  assert.equal(lethal.state.entities[red.id].alive, false);
  assert.equal(lethal.state.entities[red.id].respawnTicks, 2);
  const respawned = advanceTick(lethal.state, 2);
  assert.equal(respawned.entities[red.id].alive, true);
  assert.equal(respawned.entities[red.id].health, respawned.entities[red.id].maxHealth);
}

{
  const state = makeCloseMatch();
  const blue = state.entities["blue-hero-1"];
  const red = state.entities["red-hero-1"];
  const positioned = structuredClone(state);
  positioned.entities[blue.id].x = 50;
  positioned.entities[blue.id].y = 0;
  positioned.entities[red.id].x = 80;
  positioned.entities[red.id].y = 0;
  // Enemy tower protects the core until it is destroyed.
  const protectedCore = applyIntent(positioned, { type: "attack", slotId: blue.slotId, targetId: "red-core" });
  assert.equal(protectedCore.reason, "tower-protects-core");
  const tower1 = applyIntent(positioned, { type: "attack", slotId: blue.slotId, targetId: "red-tower" });
  assert.equal(tower1.accepted, true);
  const ready = advanceTick(tower1.state, 2);
  const tower2 = applyIntent(ready, { type: "attack", slotId: blue.slotId, targetId: "red-tower" });
  assert.equal(tower2.accepted, true);
  assert.equal(tower2.state.entities["red-tower"].alive, false);
  const ready2 = advanceTick(tower2.state, 2);
  const core1 = applyIntent(ready2, { type: "attack", slotId: blue.slotId, targetId: "red-core" });
  assert.equal(core1.accepted, true);
  const ready3 = advanceTick(core1.state, 2);
  const core2 = applyIntent(ready3, { type: "attack", slotId: blue.slotId, targetId: "red-core" });
  assert.equal(core2.accepted, true);
  assert.equal(core2.state.status, "resolving_result");
  assert.equal(core2.state.result.winnerTeamId, "blue");
  assert.equal(core2.state.result.reason, "core-destroyed");
  assert.equal(applyIntent(core2.state, { type: "move", slotId: blue.slotId, x: 0, y: 0 }).reason, "match-not-live");
}

{
  const state = createMatch({ slotsPerTeam: 2 });
  const next = setSlotController(state, "blue-hero-1", "bot", false);
  assert.equal(next.slots["blue-hero-1"].controller, "bot");
  assert.equal(next.slots["blue-hero-1"].connected, false);
  assert.equal(state.slots["blue-hero-1"].controller, "human");
  assert.equal(getMatchSummary(next).bots, 1);
}

console.log("MOBA rules core: all assertions passed");
