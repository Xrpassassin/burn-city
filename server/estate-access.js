'use strict';
// Property ACLs for Burn City Estates. Identity is the Xaman-authenticated XRPL account.
const Pay = require('./payments');
const { PROPERTY_BY_ID } = require('./estate-economy');
const db = Pay.sdb;
const ADDRESS_RE = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
db.exec(`
  CREATE TABLE IF NOT EXISTS registered_wallets (
    acct TEXT PRIMARY KEY CHECK(length(acct) BETWEEN 25 AND 35),
    first_seen INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS estate_property_invites (
    property_id TEXT NOT NULL,
    guest_acct TEXT NOT NULL,
    invited_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY(property_id, guest_acct),
    FOREIGN KEY(property_id) REFERENCES estate_property_ownership(property_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS estate_invite_guest_idx ON estate_property_invites(guest_acct);
  INSERT OR IGNORE INTO registered_wallets(acct, first_seen, last_seen)
    SELECT acct, MIN(t), MAX(t) FROM owned GROUP BY acct;
  INSERT OR IGNORE INTO registered_wallets(acct, first_seen, last_seen)
    SELECT acct, created, created FROM buy_sessions;
  INSERT OR IGNORE INTO registered_wallets(acct, first_seen, last_seen)
    SELECT acct, purchased_at, purchased_at FROM estate_property_ownership;
`);
const markRegistered = acct => {
  if (!ADDRESS_RE.test(String(acct || ''))) return false;
  const now = Date.now();
  db.prepare(`INSERT INTO registered_wallets(acct,first_seen,last_seen) VALUES(?,?,?)
    ON CONFLICT(acct) DO UPDATE SET last_seen=excluded.last_seen`).run(acct, now, now);
  return true;
};
function searchRegistered(prefix, requester) {
  const q = String(prefix || '').trim();
  if (q.length < 4 || q.length > 35 || !/^[r1-9A-HJ-NP-Za-km-z]+$/.test(q)) return [];
  return db.prepare(`SELECT acct FROM registered_wallets
    WHERE substr(acct,1,?) = ? AND acct <> ? ORDER BY acct LIMIT 12`).all(q.length, q, requester)
    .map(x => ({ acct: x.acct, label: x.acct.slice(0, 6) + '…' + x.acct.slice(-5) }));
}
// Who may enter a residence interior (server-authoritative; the browser never supplies owner or role).
// Unowned (sales disabled, nobody holds it): anyone may tour it, signed in or not, with enter/inspect only.
// Owned (#237 rule): only the owner and wallets the owner invited; everyone else is denied.
const TOUR_PERMISSIONS = Object.freeze(['enter', 'inspect']);
const GUEST_PERMISSIONS = Object.freeze(['enter', 'inspect']);
const OWNER_PERMISSIONS = Object.freeze(['enter', 'inspect', 'build', 'invite']);
function accessFor(acct, propertyId) {
  if (!PROPERTY_BY_ID.has(String(propertyId || ''))) return { allowed: false, reason: 'unknown_property', permissions: [] };
  const owner = db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(propertyId);
  if (!owner) return { allowed: true, role: 'tour', mode: 'tour', reason: 'unowned_tour', permissions: [...TOUR_PERMISSIONS] };
  const signedIn = typeof acct === 'string' && acct.length > 0;   // acct comes only from a server-signed token
  if (!signedIn) return { allowed: false, reason: 'sign_in_required', permissions: [] };
  if (owner.acct === acct) return { allowed: true, role: 'owner', mode: 'owner', owner: owner.acct, permissions: [...OWNER_PERMISSIONS] };
  const invited = db.prepare('SELECT 1 FROM estate_property_invites WHERE property_id=? AND guest_acct=?').get(propertyId, acct);
  return invited ? { allowed: true, role: 'guest', mode: 'guest', owner: owner.acct, permissions: [...GUEST_PERMISSIONS] } : { allowed: false, reason: 'no_access', permissions: [] };
}
// Ownership actions (furniture/build edits, invites, rights changes) need the matching permission from accessFor.
const canAct = (acct, propertyId, action) => { const a = accessFor(acct, propertyId); return !!(a.allowed && a.permissions.includes(action)); };
function listForOwner(acct, propertyId) {
  if (!PROPERTY_BY_ID.has(String(propertyId || ''))) return { error: 'unknown_property' };
  const own = db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(propertyId);
  if (!own || own.acct !== acct) return { error: 'owner_only' };
  const guests = db.prepare(`SELECT i.guest_acct AS acct, w.last_seen AS lastSeen, i.created_at AS invitedAt
    FROM estate_property_invites i LEFT JOIN registered_wallets w ON w.acct=i.guest_acct
    WHERE i.property_id=? ORDER BY i.created_at, i.guest_acct`).all(propertyId);
  return { ok: true, propertyId, owner: acct, guests };
}
function invite(acct, propertyId, guestAcct) {
  propertyId = String(propertyId || '');
  guestAcct = String(guestAcct || '').trim();
  if (!PROPERTY_BY_ID.has(propertyId)) return { error: 'unknown_property' };
  if (!ADDRESS_RE.test(guestAcct)) return { error: 'invalid_wallet' };
  if (guestAcct === acct) return { error: 'cannot_invite_self' };
  const own = db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(propertyId);
  if (!own || own.acct !== acct) return { error: 'owner_only' };
  if (!db.prepare('SELECT 1 FROM registered_wallets WHERE acct=?').get(guestAcct)) return { error: 'wallet_not_registered' };
  const count = db.prepare('SELECT COUNT(*) AS n FROM estate_property_invites WHERE property_id=?').get(propertyId).n;
  if (count >= 100 && !db.prepare('SELECT 1 FROM estate_property_invites WHERE property_id=? AND guest_acct=?').get(propertyId, guestAcct)) return { error: 'invite_limit' };
  db.prepare('INSERT OR IGNORE INTO estate_property_invites(property_id,guest_acct,invited_by,created_at) VALUES(?,?,?,?)')
    .run(propertyId, guestAcct, acct, Date.now());
  return listForOwner(acct, propertyId);
}
function revoke(acct, propertyId, guestAcct) {
  propertyId = String(propertyId || ''); guestAcct = String(guestAcct || '').trim();
  const own = db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(propertyId);
  if (!PROPERTY_BY_ID.has(propertyId)) return { error: 'unknown_property' };
  if (!own || own.acct !== acct) return { error: 'owner_only' };
  db.prepare('DELETE FROM estate_property_invites WHERE property_id=? AND guest_acct=?').run(propertyId, guestAcct);
  return listForOwner(acct, propertyId);
}
module.exports = { markRegistered, searchRegistered, accessFor, canAct, listForOwner, invite, revoke, ADDRESS_RE };
