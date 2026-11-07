'use strict';
// Four accounts in the shared Graveyard exercising the exploration journal and authored interiors
// through the real route handler: auth, isolation, replay/duplicate protection, prototype keys.
const assert = require('node:assert/strict');
const Collision = require('../server/homefront-collision');
const { handle } = require('../server/homefront');

const files = new Map();
const store = {
  load(name, fallback) { return files.has(name) ? JSON.parse(JSON.stringify(files.get(name))) : fallback; },
  save(name, value) { files.set(name, JSON.parse(JSON.stringify(value))); }
};
async function call(method, pathname, acct, payload = {}) {
  const response = {};
  await handle({ method }, response, new URL('http://local' + pathname), {
    json: (_res, status, data) => Object.assign(response, { status, data }), gate: () => false, ip: '127.0.0.1',
    body: async () => payload, who: () => acct ? { acct } : null, store
  });
  return response;
}
const W = '/api/homefront/world';
const place = (acct, x, z) => { const w = files.get('homefront-world.json'); w.players[acct].x = x; w.players[acct].z = z; w.players[acct].lastMove = 0; };
(async () => {
  const [A, B, C, D] = ['rMpAlpha', 'rMpBravo', 'rMpCharlie', 'rMpDelta'];
  assert.equal((await call('GET', W + '/exploration', null)).status, 401, 'journal needs a bearer token');
  assert.equal((await call('POST', W + '/interior/enter', null, { landmarkId: 'north_bus_depot' })).status, 401, 'interiors need a bearer token');
  for (const k of [A, B, C, D]) assert.equal((await call('POST', W + '/enter', k, {})).status, 200);
  const sharedWorld=files.get('homefront-world.json');
  assert.equal(Object.keys(sharedWorld.players).length, 4, 'all four explorers share one world');
  assert.equal(Object.keys(sharedWorld.refugeEntries).length, 4,
    'all four survivors have separately assigned permanent Homefront gates');
  assert.equal(new Set(Object.values(sharedWorld.refugeEntries)).size, 4,
    'no two survivors can claim the same Homefront gate in the shared map');
  assert.equal(sharedWorld.refugeEntries[A], 'north_gate',
    'first survivor begins at Pine Crossing; later survivors settle elsewhere in the same map');
  const positions=[A,B,C,D].map(account=>({
    x:sharedWorld.players[account].x,z:sharedWorld.players[account].z
  }));
  for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
    assert.ok(Math.hypot(positions[i].x-positions[j].x,positions[i].z-positions[j].z)>=14,
      'player Homefront starting areas must remain physically separated');
  }
  for (const k of [A, B]) place(k, -9.1, -64.6);           // players travel to the SAME bus depot
  place(C, -4, 6); place(D, 60, 60);
  const sightA=(await call('GET',W,A)).data;
  const sightB=(await call('GET',W,B)).data;
  assert.equal(sightA.players.length,2,
    'same-location strangers meet in one shared open world without a party or instance transfer');
  assert.equal(sightB.players.length,2,
    'players on both sides independently see the same nearby survivor');
  assert.equal(sightA.world.width,sightB.world.width,'all players use the same continuous world bounds');
  assert.deepEqual(sightA.world.pointsOfInterest,sightB.world.pointsOfInterest,
    'all players explore the same authored roads, buildings and public locations');
  assert.equal(sightA.players.find(p=>p.label==='You')?.x,-9.1);
  assert.equal(sightB.players.find(p=>p.label==='You')?.x,-9.1);
  assert.equal(sightA.refugeReturn.x===sightB.refugeReturn.x &&
    sightA.refugeReturn.z===sightB.refugeReturn.z,false,
    'meeting at a shared building must not overwrite anyone\'s personal refuge location');
  for (const bad of ['__proto__', 'constructor', 'toString', '']) {
    assert.equal((await call('POST', W + '/interior/enter', A, { landmarkId: bad })).status, 400, 'landmark id ' + JSON.stringify(bad) + ' rejected');
    assert.equal((await call('POST', W + '/exploration/discover', A, { landmarkId: bad })).status, 400, 'discover id ' + JSON.stringify(bad) + ' rejected');
  }
  assert.equal((await call('POST', W + '/interior/enter', A, { landmarkId: { toString: 1 } })).status, 400, 'non-string landmark ids rejected');
  assert.equal((await call('POST', W + '/interior/enter', D, { landmarkId: 'north_bus_depot' })).data.error, 'too_far_from_interior', 'entry is distance-checked');
  const da = await call('POST', W + '/exploration/discover', A, { landmarkId: 'north_bus_depot' });
  assert.equal(da.data.newlyDiscovered, true);
  assert.equal((await call('POST', W + '/exploration/discover', A, { landmarkId: 'north_bus_depot' })).data.newlyDiscovered, false, 'rediscovery is idempotent');
  assert.deepEqual((await call('GET', W + '/exploration', B)).data.exploration.discoveredIds, [], 'B journal is isolated from A');
  for (const k of [A, B]) assert.equal((await call('POST', W + '/interior/enter', k, { landmarkId: 'north_bus_depot' })).status, 200);
  const runs = await Promise.all([1, 2, 3].map(() => call('POST', W + '/interior/action', A, { actionId: 'dispatch_drawer', reward: [{ item: 'ammo', amount: 999 }] })));
  assert.equal(runs.filter(r => r.status === 200).length, 1, 'concurrent duplicate searches pay exactly once');
  const paid = runs.find(r => r.status === 200).data;
  assert.ok(paid.interiorReward.every(d => d.amount <= 5), 'forged reward fields are ignored');
  assert.equal((await call('POST', W + '/interior/action', B, { actionId: 'dispatch_drawer' })).status, 200, 'B searches its own copy of the drawer');
  assert.equal((await call('POST', W + '/interior/action', C, { actionId: 'dispatch_drawer' })).data.error, 'not_inside_interior', 'an account outside cannot act on another interior');
  assert.equal((await call('POST', W + '/interior/door', A, { doorId: 'constructor' })).status, 400, 'unknown door rejected');
  place(A, -8, -65);
  const prematureExit = await call('POST', W + '/interior/leave', A, { doorway: true });
  assert.equal(prematureExit.data.error, 'too_far_from_interior_exit');
  assert.equal((await call('GET', W, A)).data.interior.landmarkId, 'north_bus_depot');
  place(A, -8, -62.6);
  const walkingPlayer = files.get('homefront-world.json').players[A];
  walkingPlayer.lastMoveMode = 'input';
  walkingPlayer.lastInputAt = Date.now() - 100;
  walkingPlayer.lastInputSequence = 7;
  process.env.HOMEFRONT_CONTINUOUS_MOVEMENT = '1';
  const exit = await call('POST', W + '/interior/leave', A, { doorway: true });
  assert.equal(exit.status, 200, JSON.stringify(exit.data));
  assert.equal(exit.data.interior, null);
  assert.ok(Collision.isSafePosition(exit.data.self.x, exit.data.self.z), 'exit lands on walkable outdoor ground');
  assert.equal(exit.data.inputProtocol.enabled, true);
  assert.equal(exit.data.inputProtocol.nextSequence, 8);
  assert.equal(exit.data.inputProtocol.readyInMs, 0);
  const stale = await call('POST', W + '/move-input', A, { sequence: 7, x: 0, z: 1, sprint: false });
  assert.equal(stale.data.error, 'invalid_movement_sequence');
  const walk = await call('POST', W + '/move-input', A, { sequence: 8, x: 0, z: 1, sprint: false });
  assert.equal(walk.status, 200, JSON.stringify(walk.data));
  assert.equal(walk.data.inputAck.sequence, 8);
  assert.ok(walk.data.self.z > exit.data.self.z, 'direct walking resumes outdoors');
  const returned = await call('POST', W + '/leave', A, { travel: true });
  assert.equal(returned.status, 200);
  assert.equal(returned.data.self, null);
  assert.ok(returned.data.base && returned.data.debrief, 'refuge return includes the base and expedition debrief');

  assert.equal((await call('GET', W, A)).data.interior, null);
  assert.equal((await call('GET', W, B)).data.interior.landmarkId, 'north_bus_depot', 'leaving is per account');
  place(B, -8, -70);
  const awayFromDoor = await call('POST', W + '/interior/enter', B, { landmarkId: 'north_bus_depot', doorway: true });
  assert.equal(awayFromDoor.data.error, 'too_far_from_interior_entry');
  place(B, -7.2, -60.5);
  const throughDoor = await call('POST', W + '/interior/enter', B, { landmarkId: 'north_bus_depot', doorway: true });
  assert.equal(throughDoor.status, 200, JSON.stringify(throughDoor.data));
  assert.equal(throughDoor.data.self.x, -8);
  assert.equal(throughDoor.data.self.z, -63.5);
  assert.equal(throughDoor.data.interior.roomId, 'dispatch');
  assert.equal(throughDoor.data.inputProtocol.enabled, true);
  const saved = files.get('homefront-world.json').interiors;
  assert.ok(saved[A].interiors.north_bus_depot.used.includes('dispatch_drawer') && saved[B].interiors.north_bus_depot.used.includes('dispatch_drawer'));
  assert.equal(saved[C], undefined, 'accounts that never entered keep no interior state');
  const world = files.get('homefront-world.json');
  delete world.encounters[D];
  world.players[D].weaponMagazine = { weaponId: 'pump_shotgun', loaded: 1 };
  const refuge = (await call('GET', '/api/homefront', D)).data.base;
  const bases = files.get('homefront.json');
  bases[D] = { ...refuge, weapons: ['pipe_blade', 'pump_shotgun'], equippedWeapon: 'pump_shotgun' };
  const missed = await call('POST', W + '/attack', D, { miss: true });
  assert.equal(missed.status, 200, JSON.stringify(missed.data));
  assert.equal(missed.data.combat.missed, true);
  assert.equal(missed.data.combat.damage, 0);
  assert.equal(missed.data.combat.ammoCost, 1);
  assert.equal(missed.data.selfWeaponMagazine.loaded, 0);
  assert.equal(missed.data.director.noise, 95);
  assert.equal((await call('POST', W + '/attack', D, { miss: true })).data.error, 'attack_cooldown');
  files.get('homefront-world.json').players[D].lastWeaponFireAt = 0;
  assert.equal((await call('POST', W + '/attack', D, { miss: true })).data.error, 'insufficient_ammo');
  console.log('Homefront 4-account exploration/interior multiplayer sim passed.');
})().catch(error => { console.error(error); process.exit(1); });
