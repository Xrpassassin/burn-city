// Regression/performance harness for the zombie AI's real shared flow-field navigation.
// This does not start a server, simulate combat, or change live movement.
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
process.env.ZOMBIE_CLASSIC = '1';
const Z = require('../server/cod');

function makeRoom() {
  const room = { ranked: true, zombies: new Map() };
  Z.resetMap(room);
  room.open = 0x1ff; // test every classic zone/door as traversable
  Z.bind(room);
  return room;
}
function findTargets(room, count) {
  const candidates = [];
  for (let r = 0; r < Z.GH; r++) {
    for (let c = 0; c < Z.GW; c++) {
      const x = Z.WX(c), z = Z.WZ(r);
      if (Z.walk(room, x, z, 0) && Z.cellAt(x, z, 0) === 0) candidates.push({ x, z, lv: 0 });
    }
  }
  assert.ok(candidates.length >= count, `found at least ${count} valid Spawn Bay target cells`);
  // Spread targets across the available Spawn Bay cells rather than clustering them together.
  return Array.from({ length: count }, (_, i) => candidates[Math.floor(i * candidates.length / count)]);
}
function runScenario(playerCount) {
  const room = makeRoom();
  const players = findTargets(room, playerCount);
  const started = performance.now();
  Z.flow(room, players);
  const elapsedMs = performance.now() - started;
  const distances = room.flowD;
  let reachableCells = 0, farthest = null;
  for (let r = 0; r < Z.GH; r++) for (let c = 0; c < Z.GW; c++) {
    const x = Z.WX(c), z = Z.WZ(r), d = distances[r * Z.GW + c];
    if (Z.walk(room, x, z, 0) && Number.isFinite(d) && d < 1e9) {
      reachableCells++;
      if (d > 0 && (!farthest || d > farthest.distance)) farthest = { x, z, distance: d };
    }
  }
  assert.ok(reachableCells > 100, `expected a meaningful connected floor; got ${reachableCells}`);
  assert.ok(farthest, 'should find a reachable cell away from all targets');
  const step = Z.nextStep(room, farthest.x, farthest.z, 0);
  assert.ok(step, 'farthest reachable cell should have a next waypoint');
  const c = Math.floor(step[0] / Z.CELL + Z.GW / 2);
  const r = Math.floor(step[1] / Z.CELL + Z.GH / 2);
  assert.ok(c >= 0 && c < Z.GW && r >= 0 && r < Z.GH, 'waypoint remains inside the map grid');
  const nextDistance = distances[r * Z.GW + c];
  assert.ok(nextDistance < farthest.distance, `flow distance must decrease: ${farthest.distance} -> ${nextDistance}`);
  assert.ok(Z.inside(room, step[0], step[1], 0.32, 0), 'waypoint centre should pass zombie body collision check');
  return { playerCount, elapsedMs: +elapsedMs.toFixed(3), reachableCells, farthestDistanceCells: farthest.distance, nextDistance };
}

const results = [1, 2, 4, 8].map(runScenario);
for (const row of results) console.log(JSON.stringify(row));
console.log('Zombie navigation regression harness passed. Timings are local diagnostics, not capacity guarantees.');
