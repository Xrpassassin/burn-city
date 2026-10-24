'use strict';
// Four accounts in the shared Graveyard exercising the exploration journal and authored interiors
// through the real route handler: auth, isolation, replay/duplicate protection, prototype keys.
const assert = require('node:assert/strict');
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
  assert.equal((await call('GET', W, A)).data.players.length, 4, 'all four explorers share one world');
  for (const k of [A, B]) place(k, -9.1, -64.6);           // inside the north bus depot dispatch room
  place(C, -4, 6); place(D, 60, 60);
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
  assert.equal((await call('POST', W + '/interior/leave', A, {})).status, 200);
  assert.equal((await call('GET', W, A)).data.interior, null);
  assert.equal((await call('GET', W, B)).data.interior.landmarkId, 'north_bus_depot', 'leaving is per account');
  const saved = files.get('homefront-world.json').interiors;
  assert.ok(saved[A].interiors.north_bus_depot.used.includes('dispatch_drawer') && saved[B].interiors.north_bus_depot.used.includes('dispatch_drawer'));
  assert.equal(saved[C], undefined, 'accounts that never entered keep no interior state');
  console.log('Homefront 4-account exploration/interior multiplayer sim passed.');
})().catch(error => { console.error(error); process.exit(1); });
