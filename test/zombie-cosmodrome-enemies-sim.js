const assert = require('node:assert/strict');
delete process.env.FLY_APP_NAME; delete process.env.ZOMBIE_CLASSIC; delete process.env.ZOMBIE_MAP;
const { Room } = require('../server/game');
function make(seedValue) {
  const room = new Room('cosmo-enemy-' + seedValue, 'zombie', 'refinery');
  room.add({ name: 'Test Runner' }); room.mapId = 'cosmodrome'; room.reset(); room.wave = 5; room.toSpawn = 300; room.waveTotal = 300; room.spawnT = 0;
  room.rng = () => seedValue; return room;
}
const shooter = make(0.05); for (let i = 0; i < 60; i++) shooter.step(0.1);
assert.ok([...shooter.zombies.values()].some(z => z.ty === 7), 'Cosmodrome wave 5 can spawn ranged shooters');
const flyer = make(0.1); for (let i = 0; i < 60; i++) flyer.step(0.1);
assert.ok([...flyer.zombies.values()].some(z => z.ty === 6), 'Cosmodrome wave 5 can spawn airborne hunters');
assert.ok([...flyer.zombies.values()].filter(z => z.ty === 6).every(z => z.y > 1.8), 'airborne hunters remain above ground level');
assert.ok(shooter.zombies.size > 0 && flyer.zombies.size > 0, 'both map-2 simulations spawn threats');
console.log('Cosmodrome enemy archetype simulation passed: 4 assertions.');
