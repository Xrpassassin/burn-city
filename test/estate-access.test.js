'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-estate-access-'));
Object.assign(process.env, { DATA_DIR: dir, TOKEN_SECRET: 'estate-access-test-secret', PORT: '0', DRY_RUN: 'true', XRPL_WSS: 'ws://127.0.0.1:1', XUMM_KEY: '', XUMM_SECRET: '' });
const Pay = require('../server/payments'); require('../server/estates'); const A = require('../server/estate-access');
const db = Pay.sdb, now = Date.now();
const owner = 'r' + 'A'.repeat(25), guest = 'r' + 'B'.repeat(25), stranger = 'r' + 'C'.repeat(25);
try {
  db.prepare('INSERT INTO estate_property_ownership VALUES(?,?,?,?,?,?)').run('trailer-01', owner, 'access-test-tx', 100, 1, now);
  A.markRegistered(owner); A.markRegistered(guest); A.markRegistered(stranger);
  assert.equal(A.accessFor(owner, 'trailer-01').role, 'owner');
  assert.equal(A.accessFor(guest, 'trailer-01').allowed, false);
  assert.equal(A.accessFor(guest, 'trailer-01').reason, 'no_access');
  // Tourable: an unowned residence is open to anyone (signed in or not) as a tour, enter/inspect only.
  for (const who of [stranger, '', undefined, 'not-a-wallet']) {
    const t = A.accessFor(who, 'mansion-01');
    assert.equal(t.allowed, true); assert.equal(t.role, 'tour'); assert.equal(t.mode, 'tour');
    assert.deepEqual(t.permissions, ['enter', 'inspect']);
  }
  for (const act of ['build', 'invite', 'rights', 'trade']) assert.equal(A.canAct(stranger, 'mansion-01', act), false, 'tour visitors get no ' + act);
  assert.equal(A.canAct(stranger, 'mansion-01', 'enter'), true);
  assert.equal(A.accessFor(stranger, 'no-such-lot').reason, 'unknown_property');
  // Owned (#237): owner + invitees only; strangers and signed-out visitors are denied.
  assert.equal(A.accessFor(stranger, 'trailer-01').reason, 'no_access');
  assert.equal(A.accessFor('', 'trailer-01').reason, 'sign_in_required');
  assert.deepEqual(A.accessFor(owner, 'trailer-01').permissions, ['enter', 'inspect', 'build', 'invite']);
  // Tour visitors cannot invite or read/revoke the guest list.
  assert.equal(A.invite(stranger, 'mansion-01', guest).error, 'owner_only');
  assert.equal(A.listForOwner(stranger, 'mansion-01').error, 'owner_only');
  assert.equal(A.revoke(stranger, 'mansion-01', guest).error, 'owner_only');
  assert.equal(A.searchRegistered(guest.slice(0, 5), owner).some(x => x.acct === guest), true);
  assert.equal(A.searchRegistered(guest.slice(0, 3), owner).length, 0, 'minimum prefix length');
  assert.equal(A.invite(stranger, 'trailer-01', guest).error, 'owner_only');
  assert.equal(A.invite(owner, 'trailer-01', stranger).ok, true);
  assert.equal(A.accessFor(stranger, 'trailer-01').role, 'guest');
  assert.deepEqual(A.accessFor(stranger, 'trailer-01').permissions, ['enter', 'inspect'], 'invitees get no ownership actions');
  assert.equal(A.canAct(stranger, 'trailer-01', 'invite'), false); assert.equal(A.canAct(stranger, 'trailer-01', 'build'), false);
  assert.equal(A.invite(stranger, 'trailer-01', guest).error, 'owner_only', 'guests cannot invite');
  // Island rights (#235) now consult #237 invites: invitee → enter/inspect, never build.
  const { resolveEstateRights } = require('../server/estates-rights'), Estates = require('../server/estates');
  const rg = resolveEstateRights({ account: stranger, propertyId: 'trailer-01', estates: Estates, access: A });
  assert.equal(rg.allowed, true); assert.equal(rg.role, 'guest'); assert.deepEqual(rg.permissions, ['enter', 'inspect']);
  assert.equal(resolveEstateRights({ account: stranger, propertyId: 'trailer-01', action: 'build', estates: Estates, access: A }).allowed, false);
  assert.equal(resolveEstateRights({ account: owner, propertyId: 'trailer-01', action: 'build', estates: Estates, access: A }).allowed, true);
  assert.equal(resolveEstateRights({ account: guest, propertyId: 'trailer-01', estates: Estates, access: A }).allowed, false, 'uninvited wallet denied');
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
