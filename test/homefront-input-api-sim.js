'use strict';
const assert = require('node:assert/strict');
const { handle } = require('../server/homefront');
const World = require('../server/homefront-world');
const Collision = require('../server/homefront-collision');
const Terrain = require('../server/homefront-terrain');
const files = new Map();
const store = {
  load(name, fallback) { return files.has(name) ? JSON.parse(JSON.stringify(files.get(name))) : fallback; },
  save(name, value) { files.set(name, JSON.parse(JSON.stringify(value))); }
};
let denyRate = false;
const gates = [];
async function call(method, acct, payload = {}) {
  const res = {};
  await handle({ method }, res, new URL('http://local/api/homefront/world/move-input'), {
    json: (_res, status, data) => Object.assign(res, { status, data }),
    gate: (key, limit) => { gates.push([key, limit]); return denyRate; },
    who: () => acct ? { acct } : null,
    ip: '127.0.0.1', body: async () => payload, store
  });
  return res;
}
(async () => {
  const originalFlag = process.env.HOMEFRONT_CONTINUOUS_MOVEMENT;
  try {
    delete process.env.HOMEFRONT_CONTINUOUS_MOVEMENT;
    const blocked = await call('POST', 'walker', { sequence: 0, x: 0, z: 0, sprint: false });
    assert.equal(blocked.status, 501, 'default deployment cannot activate experimental movement');
    assert.equal(files.size, 0, 'disabled requests never alter the world store');
    assert.equal((await call('POST', null)).status, 401, 'authentication still precedes flag handling');

    process.env.HOMEFRONT_CONTINUOUS_MOVEMENT = '1';
    const created = World.enter(World.defaultWorld(), 'walker', Date.now() - 2500);
    store.save('homefront-world.json', created.world);

    const worldGet = {};
    await handle({ method: 'GET' }, worldGet, new URL('http://local/api/homefront/world'), {
      json: (_res, status, data) => Object.assign(worldGet, { status, data }),
      gate: () => false, ip: '127.0.0.1', body: async () => null,
      who: () => ({ acct: 'walker' }), store
    });
    assert.equal(worldGet.status, 200);
    assert.equal(worldGet.data.inputProtocol.enabled, true);
    assert.equal(worldGet.data.inputProtocol.nextSequence, 0);
    assert.ok(Number.isFinite(worldGet.data.inputProtocol.readyInMs) &&
      worldGet.data.inputProtocol.readyInMs >= 0,
      'authenticated world GET advertises server-calculated movement cooldown');

    const spawn = created.world.players.walker;
    const directions = [{x: 1,z: 0},{x: -1,z: 0},{x: 0,z: 1},{x: 0,z: -1}];
    const dir = directions.find(d => Terrain.canTraverse(spawn.x,spawn.z,spawn.x+d.x,spawn.z+d.z)
      && Collision.canTraverse(spawn.x,spawn.z,spawn.x+d.x,spawn.z+d.z,{bounds:World.WORLD_SIZE}));
    assert.ok(dir, 'walker spawns with an accessible nearby location');

    denyRate = true;
    assert.equal((await call('POST', 'walker', { sequence: 0, ...dir, sprint: false })).status, 429);
    denyRate = false;

    const invalid = await call('POST', 'walker', { sequence: 0, x: 5, z: 0, sprint: false });
    assert.equal(invalid.status, 400, 'invalid vectors cannot mutate server state');
    assert.equal(invalid.data.error, 'invalid_movement_vector');
    const baseline = await call('POST', 'walker', { sequence: 0, ...dir, sprint: false, account: 'forged' });
    assert.equal(baseline.status, 200, 'valid input is processed when server flag enables it');
    assert.equal(baseline.data.inputAck.sequence, 0);
    assert.equal(baseline.data.inputAck.elapsedMs, 0);
    assert.ok(gates.some(([key,limit]) => key.startsWith('homefront-world-input:') && limit === 480),
      'input is restricted by a dedicated per-account rate budget');

    const replay = await call('POST', 'walker', { sequence: 0, ...dir, sprint: false });
    assert.equal(replay.status, 400, 'replayed sequence is rejected');
    assert.equal(replay.data.error, 'invalid_movement_sequence');
    const persisted = store.load('homefront-world.json', {});
    persisted.players.walker.lastInputAt = Date.now() - 110;
    store.save('homefront-world.json', persisted);
    const accepted = await call('POST', 'walker', { sequence: 1, ...dir, sprint: false });
    assert.equal(accepted.status, 200);
    const distance = Math.hypot(accepted.data.inputAck.x - spawn.x, accepted.data.inputAck.z - spawn.z);
    assert.ok(distance >= 0.5 && distance <= 1.1, 'only bounded server-time movement is accepted');
    assert.equal(store.load('homefront-world.json', {}).players.walker.lastInputSequence, 1);

    delete process.env.HOMEFRONT_CONTINUOUS_MOVEMENT;
    assert.equal((await call('POST', 'walker', { sequence: 2, ...dir, sprint: false })).status, 501,
      'turning off the server flag immediately blocks additional input');
    console.log('Homefront flagged continuous input API tests passed.');
  } finally {
    if (originalFlag === undefined) delete process.env.HOMEFRONT_CONTINUOUS_MOVEMENT;
    else process.env.HOMEFRONT_CONTINUOUS_MOVEMENT = originalFlag;
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
