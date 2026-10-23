'use strict';
const assert = require('node:assert/strict');
const { handle } = require('../server/homefront');

const files = new Map();
const store = {
  load(name, fallback) {
    if (!files.has(name)) return fallback;
    return JSON.parse(JSON.stringify(files.get(name)));
  },
  save(name, value) { files.set(name, JSON.parse(JSON.stringify(value))); }
};
async function call(method, pathname, acct, payload = {}) {
  const response = {};
  await handle({ method }, response, new URL('http://local' + pathname), {
    json: (_res, status, data) => Object.assign(response, { status, data }),
    gate: () => false,
    ip: '127.0.0.1',
    body: async () => payload,
    who: () => acct ? { acct } : null,
    store
  });
  return response;
}
(async () => {
  const unauth = await call('GET', '/api/homefront', null);
  assert.equal(unauth.status, 401, 'save API requires a verified account');
  assert.equal(files.size, 0, 'unauthenticated request cannot create a base');

  const a0 = await call('GET', '/api/homefront', 'acct-a');
  assert.equal(a0.status, 200);
  assert.equal(a0.data.base.owner, 'acct-a');
  assert.equal(a0.data.base.structures.length, 0);
  assert.equal(a0.data.base.visibility, 'private');
  const privateVisit = await call('GET', '/api/homefront/visit?owner=acct-a', null);
  assert.equal(privateVisit.status, 404, 'private refuges must not be visitable');

  const opened = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'visibility', value: 'public' } });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.base.visibility, 'public');
  const publicVisit = await call('GET', '/api/homefront/visit?owner=acct-a', null);
  assert.equal(publicVisit.status, 200, 'public refuge can be visited without signing in');
  assert.equal(publicVisit.data.mode, 'homefront-visit');
  assert.equal(publicVisit.data.base.visibility, 'public');
  assert.equal(publicVisit.data.base.owner, undefined, 'visitor response does not expose owner field');
  const a1 = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'build', building: 'wall' } });
  assert.equal(a1.status, 200);
  assert.equal(a1.data.base.structures.length, 1);
  assert.equal(a1.data.base.resources.wood, 32);
  const overlap = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'build', building: 'wall', x: a1.data.base.structures[0].x, z: a1.data.base.structures[0].z } });
  assert.equal(overlap.status, 400, 'invalid placement is a client error, not a server failure');
  assert.equal(overlap.data.error, 'placement_occupied');

  const b0 = await call('GET', '/api/homefront', 'acct-b');
  assert.equal(b0.status, 200);
  assert.equal(b0.data.base.owner, 'acct-b');
  assert.equal(b0.data.base.structures.length, 0, 'one account cannot see another account base');

  const crossAccount = await call('POST', '/api/homefront/action', 'acct-b', { action: { type: 'assign', survivorId: 's1', role: 'guard' } });
  assert.equal(crossAccount.status, 400);
  assert.equal(crossAccount.data.error, 'unknown_survivor');

  const closed = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'visibility', value: 'private' } });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.base.visibility, 'private');
  const closedVisit = await call('GET', '/api/homefront/visit?owner=acct-a', null);
  assert.equal(closedVisit.status, 404, 'private setting immediately blocks future visits');

  const aReload = await call('GET', '/api/homefront', 'acct-a');
  assert.equal(aReload.data.base.structures.length, 1, 'account base survives a subsequent load');
  assert.equal(aReload.data.base.revision, closed.data.base.revision, 'latest privacy change persists across reloads');
  const revisionBeforeConcurrent = aReload.data.base.revision;
  const concurrent = await Promise.all([
    call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'expedition' } }),
    call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'expedition' } })
  ]);
  assert.ok(concurrent.every(x => x.status === 200), 'concurrent valid actions should both succeed');
  const afterConcurrent = await call('GET', '/api/homefront', 'acct-a');
  assert.equal(afterConcurrent.data.base.revision, revisionBeforeConcurrent + 2, 'concurrent actions must not overwrite each other');
  assert.equal(afterConcurrent.data.base.resources.food, 20, 'both expedition costs must be saved');

  const malformed = await call('POST', '/api/homefront/action', 'acct-a', { action: [] });
  assert.equal(malformed.status, 400);
  console.log('Homefront authenticated save API simulation passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
