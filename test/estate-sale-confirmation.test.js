'use strict';

const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { createEstateSaleConfirmation } = require('../server/estate-sale-confirmation');

let clock = 1_800_000_000_000;
const db = new DatabaseSync(':memory:');
const sales = createEstateSaleConfirmation(db, { now: () => clock });
const terms = { propertyId: 'lakefront-01', ownerAcct: 'rEstateOwner', intentId: 'intent-001', salePriceDrops: 2500000, marketplaceFeeBps: 250, now: clock };

const created = sales.createIntent(terms);
assert.equal(created.status, 'awaiting_confirmation');
assert.equal(created.notification.requiresExplicitConfirmation, true);
assert.equal(created.notification.financialRewards, undefined);
assert.match(created.termsHash, /^[a-f0-9]{64}$/);
let inbox = sales.listNotifications('rEstateOwner');
assert.equal(inbox.length, 1);
assert.equal(inbox[0].eventType, 'estate_sale_confirmation_required');
assert.equal(inbox[0].channelStatus, 'pending');
assert.equal(inbox[0].payload.salePriceDrops, 2500000);

// Owner identity and the exact terms hash are both required.
assert.throws(() => sales.confirmIntent({ intentId: 'intent-001', ownerAcct: 'rSomeoneElse', termsHash: created.termsHash, now: clock }), /not_found_for_owner/);
assert.throws(() => sales.confirmIntent({ intentId: 'intent-001', ownerAcct: 'rEstateOwner', termsHash: '0'.repeat(64), now: clock }), /terms_changed/);
assert.equal(sales.listNotifications('rEstateOwner').length, 1, 'failed confirmations do not emit receipts');

const confirmed = sales.confirmIntent({ intentId: 'intent-001', ownerAcct: 'rEstateOwner', termsHash: created.termsHash, now: clock + 1 });
assert.equal(confirmed.status, 'confirmed');
assert.equal(confirmed.notification.intentId, 'intent-001');
assert.equal(sales.listNotifications('rEstateOwner').length, 2, 'confirmation receipt is durable');
assert.throws(() => sales.confirmIntent({ intentId: 'intent-001', ownerAcct: 'rEstateOwner', termsHash: created.termsHash, now: clock + 2 }), /not_awaiting_confirmation/);
assert.throws(() => sales.cancelIntent({ intentId: 'intent-001', ownerAcct: 'rEstateOwner', now: clock + 2 }), /not_cancellable/);

const cancelled = sales.createIntent({ propertyId: 'cabin-02', ownerAcct: 'rEstateOwner', intentId: 'intent-002', now: clock });
assert.equal(sales.cancelIntent({ intentId: 'intent-002', ownerAcct: 'rEstateOwner', now: clock + 1 }).status, 'cancelled');
assert.throws(() => sales.confirmIntent({ intentId: 'intent-002', ownerAcct: 'rEstateOwner', termsHash: cancelled.termsHash, now: clock + 2 }), /not_awaiting_confirmation/);

const expiring = sales.createIntent({ propertyId: 'starter-03', ownerAcct: 'rEstateOwner', intentId: 'intent-003', now: clock, ttlMs: 60_000 });
assert.throws(() => sales.confirmIntent({ intentId: 'intent-003', ownerAcct: 'rEstateOwner', termsHash: expiring.termsHash, now: clock + 60_000 }), /expired/);
assert.equal(db.prepare('SELECT status FROM estate_sale_intents WHERE intent_id=?').get('intent-003').status, 'expired', 'expired state persists after the expected error');

assert.throws(() => sales.createIntent({ propertyId: 'x', ownerAcct: 'rEstateOwner', intentId: 'intent-004', salePriceDrops: -1, now: clock }), /invalid_sale_price_drops/);
assert.throws(() => sales.createIntent({ propertyId: 'x', ownerAcct: 'rEstateOwner', intentId: 'intent-004', marketplaceFeeBps: 10001, now: clock }), /invalid_marketplace_fee_bps/);
assert.throws(() => sales.createIntent({ propertyId: 'x', ownerAcct: 'rEstateOwner', intentId: 'intent-004', ttlMs: 10, now: clock }), /ttl_out_of_range/);

// A duplicate ID must roll back the attempted outbox insert along with the intent insert.
const beforeDuplicate = sales.listNotifications('rEstateOwner').length;
assert.throws(() => sales.createIntent(terms), /UNIQUE constraint failed/);
assert.equal(sales.listNotifications('rEstateOwner').length, beforeDuplicate, 'duplicate intent rolls back atomically');

const pending = sales.listNotifications('rEstateOwner').find(n => n.notificationId === 'sale-confirmation:intent-002');
assert.equal(sales.markNotification(pending.notificationId, 'sent', clock + 3).status, 'sent');
assert.throws(() => sales.markNotification(pending.notificationId, 'failed', clock + 4), /already_processed/);
assert.throws(() => sales.listNotifications('rEstateOwner', 0), /invalid_notification_query/);
assert.equal(sales.listNotifications('rUnrelated').length, 0, 'notifications are scoped to the requested account');

db.close();
console.log('Estates sale-confirmation SQLite integration: 24 assertions passed');
