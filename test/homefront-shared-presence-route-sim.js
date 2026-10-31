'use strict';
const assert = require('node:assert/strict');
const { handle } = require('../server/homefront');
const World = require('../server/homefront-world');
const Interiors = require('../server/homefront-interiors');
const Collision = require('../server/homefront-collision');
const now = Date.now();
let w = World.enter(World.defaultWorld(), 'alice', now).world;
w = World.enter(w, 'bob', now).world;
w = World.enter(w, 'unrelated', now).world;
const entry = Collision.findSafePosition(-16,22,{bounds:World.WORLD_SIZE});
for (const id of ['alice','bob']) {
  w.players[id].x = entry.x; w.players[id].z = entry.z; w.players[id].lastSeen = now;
  w.interiors = Interiors.enter(w.interiors, { account: id, player: w.players[id], landmarkId:'ironworks', now }).state;
}
const store = {
  files: { 'homefront-world.json': w }, saves: 0,
  load(name, fallback) { return this.files[name] === undefined ? fallback : JSON.parse(JSON.stringify(this.files[name])); },
  save() { this.saves++; }
};
async function get(account) {
  const res = {};
  await handle({ method:'GET' }, res, new URL('http://localhost/api/homefront/world/interior/presence'), {
    json: (_res,status,data) => Object.assign(res,{status,data}),
    gate: () => false, ip:'127.0.0.1', body: async () => null,
    who: () => account ? { acct: account } : null, store
  });
  return res;
}
(async () => {
  assert.equal((await get(null)).status,401,'anonymous users cannot browse building occupants');
  const alice = await get('alice');
  const bob = await get('bob');
  assert.equal(alice.status,200);
  assert.equal(bob.status,200);
  assert.equal(alice.data.mode,'homefront-interior-presence');
  assert.equal(alice.data.interiorInstance.id,bob.data.interiorInstance.id);
  assert.equal(alice.data.interiorInstance.count,2);
  assert.equal(alice.data.players.length,2,'response includes only people in same building');
  assert.ok(alice.data.players.every(p=>p.interior?.instanceId === alice.data.interiorInstance.id));
  assert.equal((await get('unrelated')).data.interiorInstance,null,'outsider receives no interior roster');
  assert.equal((await get('unrelated')).data.players.length,0);
  assert.equal(store.saves,0,'read-only presence polling never triggers world writes');
  console.log('Homefront authenticated shared interior presence endpoint tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
