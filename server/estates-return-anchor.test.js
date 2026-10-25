'use strict';
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createEstatesReturnAnchorStore, validAnchor } = require('./estates-return-anchor');

const db = new DatabaseSync(':memory:');
let clock = 1000;
const store = createEstatesReturnAnchorStore({ db, now: () => clock });
const acct = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
assert.deepEqual(store.get(acct), { ok: true, anchor: null });
assert.equal(store.get('not-a-wallet').error, 'authenticated_account_required');
assert.equal(store.save('not-a-wallet', { x: 0, y: 0, z: 0, r: 0 }).error, 'authenticated_account_required');
assert.equal(validAnchor({ x: 0, y: 0, z: 0, r: 0 }).x, 0);
for (const bad of [
  null, [], { x: '0', y: 0, z: 0, r: 0 }, { x: NaN, y: 0, z: 0, r: 0 },
  { x: 241, y: 0, z: 0, r: 0 }, { x: 0, y: 21, z: 0, r: 0 },
  { x: 0, y: 0, z: -241, r: 0 }, { x: 0, y: 0, z: 0, r: Math.PI + 0.01 }
]) assert.equal(validAnchor(bad), null);
const first = store.save(acct, { x: 12.5, y: 0, z: -9, r: 1.2 });
assert.equal(first.ok, true);
assert.deepEqual(store.get(acct).anchor, { x: 12.5, y: 0, z: -9, r: 1.2, updatedAt: 1000 });
clock = 2000;
assert.equal(store.save(acct, { x: 3, y: 0, z: 4, r: 0 }).anchor.updatedAt, 2000);
assert.deepEqual(store.get(acct).anchor, { x: 3, y: 0, z: 4, r: 0, updatedAt: 2000 });
assert.equal(store.save(acct, { x: 999, y: 0, z: 0, r: 0 }).error, 'invalid_return_anchor');
assert.deepEqual(store.get(acct).anchor, { x: 3, y: 0, z: 4, r: 0, updatedAt: 2000 }, 'invalid writes never overwrite the last valid anchor');
db.close();
console.log('estates-return-anchor: all tests passed');
