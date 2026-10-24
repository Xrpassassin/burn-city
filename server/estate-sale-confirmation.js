'use strict';

// Property sale commitment confirmation and durable notification outbox.
// Uses Node's built-in node:sqlite DatabaseSync API. This module records intent only;
// it does not list, transfer, or pay for a property.
function createEstateSaleConfirmation(db, { now = Date.now } = {}) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
    throw new TypeError('sqlite_database_required');
  }

  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS estate_sale_intents (
      intent_id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      owner_acct TEXT NOT NULL,
      sale_terms_json TEXT NOT NULL,
      terms_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('awaiting_confirmation','confirmed','cancelled','expired')),
      created_at INTEGER NOT NULL,
      confirmed_at INTEGER,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS estate_sale_intent_owner_idx ON estate_sale_intents(owner_acct, created_at);
    CREATE TABLE IF NOT EXISTS estate_owner_notifications (
      notification_id TEXT PRIMARY KEY,
      owner_acct TEXT NOT NULL,
      event_type TEXT NOT NULL,
      intent_id TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      channel_status TEXT NOT NULL CHECK(channel_status IN ('pending','sent','failed')),
      created_at INTEGER NOT NULL,
      sent_at INTEGER,
      FOREIGN KEY(intent_id) REFERENCES estate_sale_intents(intent_id)
    );
    CREATE INDEX IF NOT EXISTS estate_owner_notifications_owner_idx ON estate_owner_notifications(owner_acct, created_at);
  `);

  // DatabaseSync does not expose better-sqlite3's db.transaction() helper.
  // Keep state changes and their outbox notifications atomic on the actual runtime API.
  function inTransaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      throw error;
    }
  }

  const insertIntent = db.prepare(`INSERT INTO estate_sale_intents
    (intent_id, property_id, owner_acct, sale_terms_json, terms_hash, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 'awaiting_confirmation', ?, ?)`);
  const insertNotification = db.prepare(`INSERT INTO estate_owner_notifications
    (notification_id, owner_acct, event_type, intent_id, payload_json, channel_status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)`);

  function createIntent(input) {
    const propertyId = String(input?.propertyId || '').trim();
    const ownerAcct = String(input?.ownerAcct || '').trim();
    const intentId = String(input?.intentId || '').trim();
    if (!propertyId || !ownerAcct || !intentId) throw new TypeError('property_owner_and_intent_required');
    const ttlMs = Number(input.ttlMs ?? 15 * 60 * 1000);
    if (!Number.isSafeInteger(ttlMs) || ttlMs < 60_000 || ttlMs > 24 * 60 * 60 * 1000) throw new TypeError('intent_ttl_out_of_range');
    const timestamp = Number(input.now ?? now());
    if (!Number.isSafeInteger(timestamp) || timestamp < 1) throw new TypeError('invalid_timestamp');
    const terms = {
      propertyId,
      ownerAcct,
      action: 'commit_to_sale',
      salePriceDrops: input.salePriceDrops == null ? null : Number(input.salePriceDrops),
      marketplaceFeeBps: input.marketplaceFeeBps == null ? null : Number(input.marketplaceFeeBps),
      propertyPersistence: 'map_presence_is_a_game_service_commitment_subject_to_published_continuity_terms',
      financialRewards: 'variable_not_guaranteed'
    };
    if (terms.salePriceDrops !== null && (!Number.isSafeInteger(terms.salePriceDrops) || terms.salePriceDrops < 0)) throw new TypeError('invalid_sale_price_drops');
    if (terms.marketplaceFeeBps !== null && (!Number.isSafeInteger(terms.marketplaceFeeBps) || terms.marketplaceFeeBps < 0 || terms.marketplaceFeeBps > 10000)) throw new TypeError('invalid_marketplace_fee_bps');
    const canonical = JSON.stringify(terms);
    const termsHash = require('node:crypto').createHash('sha256').update(canonical).digest('hex');
    const expiresAt = timestamp + ttlMs;
    const notice = {
      title: 'Confirm property sale commitment',
      message: 'You are about to commit this Estate to the sale process. Review the property, price, fees, and sale terms. Nothing is listed or transferred until you explicitly confirm. Weekly rewards, if any, are variable and not guaranteed.',
      propertyId, salePriceDrops: terms.salePriceDrops, marketplaceFeeBps: terms.marketplaceFeeBps,
      termsHash, expiresAt, requiresExplicitConfirmation: true
    };
    inTransaction(() => {
      insertIntent.run(intentId, propertyId, ownerAcct, canonical, termsHash, timestamp, expiresAt);
      insertNotification.run('sale-confirmation:' + intentId, ownerAcct, 'estate_sale_confirmation_required', intentId, JSON.stringify(notice), timestamp);
    });
    return { intentId, status: 'awaiting_confirmation', termsHash, expiresAt, notification: notice };
  }

  function confirmIntent({ intentId, ownerAcct, termsHash, now: suppliedNow } = {}) {
    const id = String(intentId || '').trim(), acct = String(ownerAcct || '').trim(), hash = String(termsHash || '').trim();
    const timestamp = Number(suppliedNow ?? now());
    if (!id || !acct || !hash) throw new TypeError('intent_owner_and_terms_hash_required');
    if (!Number.isSafeInteger(timestamp) || timestamp < 1) throw new TypeError('invalid_timestamp');

    const outcome = inTransaction(() => {
      const intent = db.prepare('SELECT * FROM estate_sale_intents WHERE intent_id=?').get(id);
      if (!intent || intent.owner_acct !== acct) throw new Error('sale_intent_not_found_for_owner');
      if (intent.status !== 'awaiting_confirmation') throw new Error('sale_intent_not_awaiting_confirmation');
      if (timestamp >= intent.expires_at) {
        db.prepare("UPDATE estate_sale_intents SET status='expired' WHERE intent_id=? AND status='awaiting_confirmation'").run(id);
        return { expired: true };
      }
      if (hash !== intent.terms_hash) throw new Error('sale_terms_changed_review_again');
      const changed = db.prepare("UPDATE estate_sale_intents SET status='confirmed', confirmed_at=? WHERE intent_id=? AND owner_acct=? AND status='awaiting_confirmation'").run(timestamp, id, acct);
      if (changed.changes !== 1) throw new Error('sale_intent_state_changed');
      const payload = {
        title: 'Property sale commitment confirmed',
        message: 'Your explicit confirmation has been recorded. This confirms your commitment to the sale process; it does not itself complete a transfer or guarantee a buyer.',
        propertyId: intent.property_id, intentId: id, termsHash: hash, confirmedAt: timestamp
      };
      insertNotification.run('sale-confirmed:' + id, acct, 'estate_sale_commitment_confirmed', id, JSON.stringify(payload), timestamp);
      return { intentId: id, status: 'confirmed', confirmedAt: timestamp, notification: payload };
    });
    if (outcome.expired) throw new Error('sale_confirmation_expired');
    return outcome;
  }

  function cancelIntent({ intentId, ownerAcct, now: suppliedNow } = {}) {
    const id = String(intentId || '').trim(), acct = String(ownerAcct || '').trim();
    const timestamp = Number(suppliedNow ?? now());
    if (!id || !acct) throw new TypeError('intent_and_owner_required');
    if (!Number.isSafeInteger(timestamp) || timestamp < 1) throw new TypeError('invalid_timestamp');
    const result = inTransaction(() => {
      const intent = db.prepare('SELECT status, expires_at FROM estate_sale_intents WHERE intent_id=? AND owner_acct=?').get(id, acct);
      if (!intent || intent.status !== 'awaiting_confirmation') throw new Error('sale_intent_not_cancellable');
      if (timestamp >= intent.expires_at) {
        db.prepare("UPDATE estate_sale_intents SET status='expired' WHERE intent_id=? AND status='awaiting_confirmation'").run(id);
        return 'expired';
      }
      const changed = db.prepare("UPDATE estate_sale_intents SET status='cancelled' WHERE intent_id=? AND owner_acct=? AND status='awaiting_confirmation'").run(id, acct);
      if (changed.changes !== 1) throw new Error('sale_intent_not_cancellable');
      return 'cancelled';
    });
    if (result === 'expired') throw new Error('sale_confirmation_expired');
    return { intentId: id, status: 'cancelled', cancelledAt: timestamp };
  }

  function listNotifications(ownerAcct, limit = 50) {
    const acct = String(ownerAcct || '').trim();
    const n = Number(limit);
    if (!acct || !Number.isSafeInteger(n) || n < 1 || n > 200) throw new TypeError('invalid_notification_query');
    return db.prepare('SELECT notification_id AS notificationId, event_type AS eventType, intent_id AS intentId, payload_json AS payloadJson, channel_status AS channelStatus, created_at AS createdAt, sent_at AS sentAt FROM estate_owner_notifications WHERE owner_acct=? ORDER BY created_at DESC, notification_id DESC LIMIT ?').all(acct, n).map(row => ({ ...row, payload: JSON.parse(row.payloadJson) }));
  }

  function markNotification(notificationId, status, sentAt = now()) {
    if (!['sent','failed'].includes(status)) throw new TypeError('invalid_notification_status');
    const timestamp = Number(sentAt);
    if (!Number.isSafeInteger(timestamp) || timestamp < 1) throw new TypeError('invalid_notification_timestamp');
    const result = db.prepare("UPDATE estate_owner_notifications SET channel_status=?, sent_at=? WHERE notification_id=? AND channel_status='pending'").run(status, timestamp, String(notificationId));
    if (result.changes !== 1) throw new Error('notification_missing_or_already_processed');
    return { notificationId, status, sentAt: timestamp };
  }

  return { createIntent, confirmIntent, cancelIntent, listNotifications, markNotification };
}

module.exports = { createEstateSaleConfirmation };
