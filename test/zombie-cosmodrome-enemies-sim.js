const assert = require('node:assert/strict');
delete process.env.FLY_APP_NAME; delete process.env.ZOMBIE_CLASSIC; delete process.env.ZOMBIE_MAP;
const { Room } = require('../server/game');

// The simulation uses Math.random directly for spawn archetypes; room.rng is not its RNG.
// Pinning Math.random makes these archetype checks deterministic rather than flaky.
function simulate(randomValue, wave = 5, earlierSpawns = 0) {
  const originalRandom = Math.random;
  Math.random = () => randomValue;
  try {
    const room = new Room('cosmo-enemy-' + randomValue + '-' + wave, 'zombie', 'refinery');
    room.add({ name: 'Test Runner' });
    room.mapId = 'cosmodrome';
    room.reset();
    room.wave = wave;
    room.spawned = earlierSpawns;
    room.toSpawn = 300;
    room.waveTotal = 300;
    room.spawnT = 0;
    for (let i = 0; i < 60; i++) room.step(0.1);
    return room;
  } finally {
    Math.random = originalRandom;
  }
}

const shooter = simulate(0.05);
assert.ok([...shooter.zombies.values()].some(z => z.ty === 7), 'Cosmodrome wave 5 can spawn ranged shooters');
const flyer = simulate(0.1);
assert.ok([...flyer.zombies.values()].some(z => z.ty === 6), 'Cosmodrome wave 5 can spawn airborne hunters');
assert.ok([...flyer.zombies.values()].filter(z => z.ty === 6).every(z => z.y > 1.8), 'airborne hunters remain above ground level');
assert.ok(shooter.zombies.size > 0 && flyer.zombies.size > 0, 'both map-2 simulations spawn threats');

const boss = simulate(0.5, 8);
const wardens = [...boss.zombies.values()].filter(z => z.ty === 8);
assert.ok(wardens.length > 0, 'Ashen Warden spawns on Cosmodrome wave 8');
assert.ok(wardens.every(z => z.maxhp > 8 * (60 + boss.wave * 15)), 'Warden has elite health scaling');
assert.ok(wardens.every(z => z.sp < 2.2 + Math.min(boss.wave * 0.25, 2.5) + 0.5), 'Warden trades speed for durability');
console.log('Cosmodrome enemy simulation passed: 7 assertions.');

const { isContainmentWave } = require('../server/zombie-wave-director');
const preview = { mapId: 'cosmodrome', wave: 10, enabled: true };
assert.equal(isContainmentWave(preview), true);
for (const override of [{ ranked: true }, { daily: true }, { enabled: false }, { mapId: 'refinery' }, { wave: 8 }]) {
  assert.equal(isContainmentWave({ ...preview, ...override }), false);
}
const previousPreview = process.env.ZOMBIE_CONTAINMENT_PREVIEW;
try {
  delete process.env.ZOMBIE_CONTAINMENT_PREVIEW;
  assert.equal([...simulate(.5, 10).zombies.values()].some(z => z.ty === 9), false);
  process.env.ZOMBIE_CONTAINMENT_PREVIEW = '1';
  const specials = [...simulate(.5, 10, 126).zombies.values()].filter(z => z.ty === 9);
  assert.equal(specials.length, 1);
  assert.ok(Number.isFinite(specials[0].hp) && specials[0].hp > 0);
  assert.equal(specials[0].lv, 0);
  assert.equal(specials[0].win, null);
  assert.ok([...simulate(.5, 8, 80).zombies.values()].some(z => z.ty === 8));
} finally {
  if (previousPreview === undefined) delete process.env.ZOMBIE_CONTAINMENT_PREVIEW;
  else process.env.ZOMBIE_CONTAINMENT_PREVIEW = previousPreview;
}
console.log('Containment infected preview gates and spawn verified.');
