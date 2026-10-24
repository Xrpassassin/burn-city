'use strict';
// Estates ownership and weekly-profit ledger schema. Purchases and transfers stay disabled until
// the external wallet/payment adapter can prove settlement and its accounting rules are approved.
const Pay = require('./payments');
const { CATALOG, TIER_BY_ID, PROPERTY_BY_ID, propertyWeight, allocateProfit } = require('./estate-economy');
const db = Pay.sdb;
db.exec("CREATE TABLE IF NOT EXISTS estate_property_ownership (property_id TEXT PRIMARY KEY, acct TEXT NOT NULL, purchase_tx TEXT NOT NULL UNIQUE, purchase_amount_drops INTEGER NOT NULL CHECK(purchase_amount_drops >= 0), share_units INTEGER NOT NULL CHECK(share_units > 0), purchased_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS estate_property_owner_idx ON estate_property_ownership(acct); CREATE TABLE IF NOT EXISTS estate_profit_weeks (week_start TEXT PRIMARY KEY, source_wallet TEXT NOT NULL, source_ledger_index INTEGER NOT NULL, realized_profit_drops INTEGER NOT NULL CHECK(realized_profit_drops >= 0), fees_drops INTEGER NOT NULL CHECK(fees_drops >= 0), reserve_drops INTEGER NOT NULL CHECK(reserve_drops >= 0), distributable_drops INTEGER NOT NULL CHECK(distributable_drops >= 0), verification_ref TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','verified','approved','settled')), created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS estate_profit_allocations (week_start TEXT NOT NULL, property_id TEXT NOT NULL, acct TEXT NOT NULL, share_units INTEGER NOT NULL CHECK(share_units > 0), amount_drops INTEGER NOT NULL CHECK(amount_drops >= 0), tx_hash TEXT, status TEXT NOT NULL CHECK(status IN ('preview','approved','settled')), PRIMARY KEY(week_start, property_id), FOREIGN KEY(week_start) REFERENCES estate_profit_weeks(week_start), FOREIGN KEY(property_id) REFERENCES estate_property_ownership(property_id));");
function getState(acct = '') {
  const owned = acct ? db.prepare('SELECT property_id AS propertyId, acct, purchase_tx AS purchaseTx, purchase_amount_drops AS purchaseAmountDrops, share_units AS shareUnits, purchased_at AS purchasedAt FROM estate_property_ownership WHERE acct=? ORDER BY property_id').all(acct) : [];
  const totalShareUnits = db.prepare('SELECT COALESCE(SUM(share_units),0) AS n FROM estate_property_ownership').get().n;
  return { catalog: CATALOG, owned: owned.map(p => ({ ...p, property: PROPERTY_BY_ID.get(p.propertyId), tier: TIER_BY_ID.get(PROPERTY_BY_ID.get(p.propertyId)?.tier) })), portfolioShareUnits: owned.reduce((n,p) => n + p.shareUnits,0), totalShareUnits, salesEnabled: false, distributionsEnabled: false, status: 'wallet_integration_pending' };
}
function previewWeeklyAllocation(distributableDrops) {
  const holdings = db.prepare('SELECT property_id AS propertyId, acct FROM estate_property_ownership ORDER BY property_id').all();
  return allocateProfit(distributableDrops, holdings);
}
module.exports = { CATALOG, getState, propertyWeight, previewWeeklyAllocation };
