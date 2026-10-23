# MOBA lane-minion simulation

A renderer-free, deterministic lane-minion layer for the BURN City MOBA prototype.

## Local checks

Run from the repository root with Node 22+:

```sh
node client/moba/lane-minions.test.mjs
```

## Integration contract

- The match loop owns canonical state and calls `advanceLaneMinions(state)` once per simulation tick.
- Call `spawnMinionWave(state, { waveId, countPerTeam, laneY, rules })` from a server-controlled wave schedule.
- Both functions return a new state; the input is not mutated.
- Minions are server-controlled entities and do not accept player-authored intents.
- Minions prioritize enemy minions in range, then the enemy tower, then the core only after that tower is destroyed.
- This is a first lane-system slice, not full MOBA combat: minions do not yet target heroes, use pathfinding, or replicate over the network. Integrate only after the rules core is reviewed and the behavior is tested.
