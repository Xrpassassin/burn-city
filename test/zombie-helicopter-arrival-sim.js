// Arrival spawn must use the authored helicopter pad without changing normal free-play spawn behavior.
const assert = require('node:assert/strict');
const { Room } = require('../server/game');
const Z = require('../server/cod');

const arriving = new Room('helicopter-arrival-test', 'zombie', 'refinery');
arriving.arrivalSpawn = true;
const id = arriving.add({ name: 'ArrivalTester', in: { mx: 0, mz: 0, fire: false, turn: 0 } });
const player = arriving.players.get(id);
assert.ok(Z.QDEF?.pad, 'the Refinery exposes a helicopter landing pad');
const padX = Z.WX(Z.QDEF.pad[0]), padZ = Z.WZ(Z.QDEF.pad[1]);
assert.ok(Math.hypot(player.x - padX, player.z - padZ) < 0.05, 'first arrival player spawns on the helicopter pad');
assert.ok(player.inv >= 5, 'arrival players receive a short touchdown safety window');

const normal = new Room('normal-spawn-test', 'zombie', 'refinery');
normal.arrivalSpawn = false;
const normalId = normal.add({ name: 'NormalTester', in: { mx: 0, mz: 0, fire: false, turn: 0 } });
const normalPlayer = normal.players.get(normalId);
assert.ok(Math.hypot(normalPlayer.x - padX, normalPlayer.z - padZ) > 0.05, 'normal free play keeps its existing Spawn Bay behavior');
console.log('Zombie helicopter arrival spawn checks passed.');
