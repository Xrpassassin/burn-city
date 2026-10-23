import assert from "node:assert/strict";
import { chooseBotIntent, getBotRoster } from "./bot-controller.mjs";
import { createMatch, setSlotController } from "./rules-core.mjs";

{
  let state = createMatch({ slotsPerTeam: 1 });
  assert.equal(chooseBotIntent(state, "blue-hero-1"), null, "human slots must not be controlled by the bot policy");
  assert.throws(() => chooseBotIntent(state, "blue-hero-1", "impossible"), /difficulty/);
  state = setSlotController(state, "blue-hero-1", "bot", false);
  assert.deepEqual(chooseBotIntent(state, "blue-hero-1", "normal"), { type: "move", slotId: "blue-hero-1", x: 58.5, y: 0 });
}

{
  let state = createMatch({ slotsPerTeam: 1 });
  state = setSlotController(state, "blue-hero-1", "bot", false);
  state.tick = 6;
  assert.equal(chooseBotIntent(state, "blue-hero-1", "easy"), null, "easy policy waits for its decision tick");
  const intents = ["normal", "hard", "expert"].map((difficulty) => chooseBotIntent(state, "blue-hero-1", difficulty));
  assert.ok(intents.every((intent) => intent?.type === "move"));
  assert.equal(chooseBotIntent(state, "blue-hero-1", "normal")?.type, "move");
}

{
  let state = createMatch({ slotsPerTeam: 1 });
  state = setSlotController(state, "blue-hero-1", "bot", false);
  state.entities["blue-hero-1"].x = 20;
  state.entities["blue-hero-1"].y = 0;
  state.entities["red-hero-1"].x = 25;
  state.entities["red-hero-1"].y = 0;
  assert.deepEqual(chooseBotIntent(state, "blue-hero-1", "normal"), {
    type: "cast", slotId: "blue-hero-1", targetId: "red-hero-1"
  });
  assert.deepEqual(chooseBotIntent(state, "blue-hero-1", "easy"), {
    type: "attack", slotId: "blue-hero-1", targetId: "red-hero-1"
  });
}

{
  let state = createMatch({ slotsPerTeam: 2 });
  state = setSlotController(state, "blue-hero-2", "bot", false);
  assert.deepEqual(getBotRoster(state), [{ slotId: "blue-hero-2", teamId: "blue", difficulty: "normal" }]);
}


{
  let state = createMatch({ slotsPerTeam: 1 });
  state = setSlotController(state, "blue-hero-1", "bot", false);
  const hero = state.entities["blue-hero-1"];
  hero.health = 200;
  hero.x = 10;
  hero.y = 0;
  assert.deepEqual(chooseBotIntent(state, "blue-hero-1", "normal"), {
    type: "move", slotId: "blue-hero-1", x: -58.5, y: 0
  }, "low-health bot should retreat toward its own tower");
}

console.log("MOBA bot controller: all assertions passed");
