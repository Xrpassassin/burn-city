'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-estate-access-'));
Object.assign(process.env, { DATA_DIR: dir, TOKEN_SECRET: 'estate-access-test-secret', PORT: '0', DRY_RUN: 'true', XRPL_WSS: 'ws://127.0.0.1:1', XUMM_KEY: '', XUMM_SECRET: '' });
const Pay = require('../server/payments'), A = require('../server/estate-access');
const db = Pay.sdb, now = Date.now();
const owner = 'r' + 'A'.repeat(25), guest = 'r' + 'B'.repeat(25), stranger = 'r' + 'C'.repeat(25);
try {
  db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01', owner, 'access-test-tx', 100, 1, now);
  A.markRegistered(owner); A.markRegistered(guest); A.markRegistered(stranger);
  assert.equal(A.accessFor(owner, 'trailer-01').role, 'owner');
  assert.equal(A.accessFor(guest, 'trailer-01').allowed, false);
  assert.equal(A.accessFor(guest, 'trailer-01').reason, 'no_access');
  assert.equal(A.accessFor(stranger, 'mansion-01').reason, 'not_owned');
  assert.equal(A.searchRegistered(guest.slice(0, 5), owner).some(x => x.acct === guest), true);
  assert.equal(A.searchRegistered(guest.slice(0, 3), owner).length, 0, 'minimum prefix length');
  assert.equal(A.invite(stranger, 'trailer-01', guest).error, 'owner_only');
  assert.equal(A.invite(owner, 'trailer-01', stranger).ok, true);
  assert.equal(A.accessFor(stranger, 'trailer-01').role, 'guest');
  assert.equal(A.invite(owner, 'trailer-01', guest).ok, true);
  assert.equal(A.listForOwner(owner, 'trailer-01').guests.length, 2);
  assert.equal(A.revoke(owner, 'trailer-01', stranger).ok, true);
  assert.equal(A.accessFor(stranger, 'trailer-01').allowed, false);
  assert.equal(A.invite(owner, 'trailer-01', 'r' + 'D'.repeat(25)).error, 'wallet_not_registered');
  assert.equal(A.invite(owner, 'mansion-01', guest).error, 'owner_only');
  console.log('Estate access control: all tests passed');
} finally {
  try { Pay.sdb.close(); } catch {}
  fs.rmSync(dir, { recursive: true, force: true });
}
