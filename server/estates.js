'use strict';
// Estates ownership and weekly-profit ledger schema. Purchases and transfers stay disabled until
// the external wallet/payment adapter can prove settlement and its accounting rules are approved.
const Pay = require('./payments');
const { CATALOG, TIER_BY_ID, PROPERTY_BY_ID, propertyWeight, allocateProfit, buildWeeklySnapshot } = require('./estate-economy');
const db = Pay.sdb;
db.exec("CREATE TABLE IF NOT EXISTS estate_property_ownership (property_id TEXT PRIMARY KEY, acct TEXT NOT NULL, purchase_tx TEXT NOT NULL UNIQUE, purchase_amount_drops INTEGER NOT NULL CHECK(purchase_amount_drops >= 0), share_units INTEGER NOT NULL CHECK(share_units > 0), purchased_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS estate_property_owner_idx ON estate_property_ownership(acct); CREATE TABLE IF NOT EXISTS estate_profit_weeks (week_start TEXT PRIMARY KEY, source_wallet TEXT NOT NULL, source_ledger_index INTEGER NOT NULL, realized_profit_drops INTEGER NOT NULL CHECK(realized_profit_drops >= 0), fees_drops INTEGER NOT NULL CHECK(fees_drops >= 0), reserve_drops INTEGER NOT NULL CHECK(reserve_drops >= 0), distributable_drops INTEGER NOT NULL CHECK(distributable_drops >= 0), verification_ref TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','verified','approved','settled')), created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS estate_profit_allocations (week_start TEXT NOT NULL, property_id TEXT NOT NULL, acct TEXT NOT NULL, share_units INTEGER NOT NULL CHECK(share_units > 0), amount_drops INTEGER NOT NULL CHECK(amount_drops >= 0), tx_hash TEXT, status TEXT NOT NULL CHECK(status IN ('preview','approved','settled')), PRIMARY KEY(week_start, property_id), FOREIGN KEY(week_start) REFERENCES estate_profit_weeks(week_start), FOREIGN KEY(property_id) REFERENCES estate_property_ownership(property_id));");

db.exec("CREATE TABLE IF NOT EXISTS estate_weekly_snapshots (week_start TEXT PRIMARY KEY, source_wallet TEXT NOT NULL, source_ledger_index INTEGER NOT NULL CHECK(source_ledger_index > 0), realized_profit_drops INTEGER NOT NULL CHECK(realized_profit_drops >= 0), fees_drops INTEGER NOT NULL CHECK(fees_drops >= 0), realized_losses_drops INTEGER NOT NULL CHECK(realized_losses_drops >= 0), reserve_drops INTEGER NOT NULL CHECK(reserve_drops >= 0), distributable_drops INTEGER NOT NULL CHECK(distributable_drops >= 0), total_eligible_weight INTEGER NOT NULL CHECK(total_eligible_weight >= 0), ownership_count INTEGER NOT NULL CHECK(ownership_count >= 0), ownership_hash TEXT NOT NULL, verification_ref TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','verified','approved','settled')), created_at INTEGER NOT NULL, verified_at INTEGER, approved_at INTEGER, settled_at INTEGER); CREATE TABLE IF NOT EXISTS estate_weekly_owner_allocations (week_start TEXT NOT NULL, acct TEXT NOT NULL, property_ids_json TEXT NOT NULL, combined_weight INTEGER NOT NULL CHECK(combined_weight > 0), amount_drops INTEGER NOT NULL CHECK(amount_drops >= 0), payout_tx_hash TEXT, payout_status TEXT NOT NULL CHECK(payout_status IN ('not_queued','queued','submitted','validated','failed')), PRIMARY KEY(week_start, acct), FOREIGN KEY(week_start) REFERENCES estate_weekly_snapshots(week_start)); CREATE INDEX IF NOT EXISTS estate_weekly_allocations_acct_idx ON estate_weekly_owner_allocations(acct, week_start);");
function getState(acct = '') {
  const owned = acct ? db.prepare('SELECT property_id AS propertyId, acct, purchase_tx AS purchaseTx, purchase_amount_drops AS purchaseAmountDrops, share_units AS shareUnits, purchased_at AS purchasedAt FROM estate_property_ownership WHERE acct=? ORDER BY property_id').all(acct) : [];
  const totalShareUnits = db.prepare('SELECT COALESCE(SUM(share_units),0) AS n FROM estate_property_ownership').get().n;
  return { catalog: CATALOG, owned: owned.map(p => ({ ...p, property: PROPERTY_BY_ID.get(p.propertyId), tier: TIER_BY_ID.get(PROPERTY_BY_ID.get(p.propertyId)?.tier) })), portfolioShareUnits: owned.reduce((n,p) => n + p.shareUnits,0), totalShareUnits, salesEnabled: false, distributionsEnabled: false, status: 'wallet_integration_pending' };
}
function previewWeeklyAllocation(distributableDrops) {
  const holdings = db.prepare('SELECT property_id AS propertyId, acct FROM estate_property_ownership ORDER BY property_id').all();
  return allocateProfit(distributableDrops, holdings);
}

function createWeeklySnapshot(input) {
  // Ownership is read from the authoritative current ledger table; caller cannot submit custom holdings.
  const holdings = db.prepare('SELECT property_id AS propertyId, acct FROM estate_property_ownership ORDER BY property_id').all();
  const snapshot = buildWeeklySnapshot({ ...input, holdings });
  const insertSnapshot = db.prepare("INSERT INTO estate_weekly_snapshots (week_start, source_wallet, source_ledger_index, realized_profit_drops, fees_drops, realized_losses_drops, reserve_drops, distributable_drops, total_eligible_weight, ownership_count, ownership_hash, verification_ref, status, created_at) VALUES (@weekStart, @sourceWallet, @sourceLedgerIndex, @realizedProfitDrops, @feesDrops, @realizedLossesDrops, @reserveDrops, @distributableDrops, @totalEligibleWeight, @ownershipCount, @ownershipHash, @verificationRef, 'draft', @createdAt)");
  const insertOwner = db.prepare("INSERT INTO estate_weekly_owner_allocations (week_start, acct, property_ids_json, combined_weight, amount_drops, payout_status) VALUES (?, ?, ?, ?, ?, 'not_queued')");
  const persist = db.transaction(() => {
    insertSnapshot.run(snapshot);
    for (const owner of snapshot.allocations) insertOwner.run(snapshot.weekStart, owner.acct, JSON.stringify(owner.propertyIds), owner.weight, owner.amountDrops);
  });
  persist(); // week_start primary key prevents rewriting a finalized period
  return getWeeklySnapshot(snapshot.weekStart);
}
function getWeeklySnapshot(weekStart) {
  const row = db.prepare('SELECT * FROM estate_weekly_snapshots WHERE week_start=?').get(String(weekStart));
  if (!row) return null;
  const allocations = db.prepare('SELECT acct, property_ids_json, combined_weight, amount_drops, payout_tx_hash, payout_status FROM estate_weekly_owner_allocations WHERE week_start=? ORDER BY acct').all(row.week_start)
    .map(a => ({ acct:a.acct, propertyIds:JSON.parse(a.property_ids_json), weight:a.combined_weight, amountDrops:a.amount_drops, payoutTxHash:a.payout_tx_hash, payoutStatus:a.payout_status }));
  return { ...row, allocations };
}
function transitionWeeklySnapshot(weekStart, expectedStatus, nextStatus, at = Date.now()) {
  const allowed = { draft:'verified', verified:'approved', approved:'settled' };
  if (allowed[expectedStatus] !== nextStatus) throw new TypeError('invalid_snapshot_status_transition');
  const stamp = Number(at);
  if (!Number.isSafeInteger(stamp) || stamp < 1) throw new TypeError('invalid_transition_timestamp');
  const column = { verified:'verified_at', approved:'approved_at', settled:'settled_at' }[nextStatus];
  const result = db.prepare('UPDATE estate_weekly_snapshots SET status=?, '+column+'=? WHERE week_start=? AND status=?').run(nextStatus, stamp, String(weekStart), expectedStatus);
  if (result.changes !== 1) throw new Error('snapshot_missing_or_status_changed');
  return getWeeklySnapshot(weekStart);
}

module.exports = { CATALOG, getState, propertyWeight, previewWeeklyAllocation, createWeeklySnapshot, getWeeklySnapshot, transitionWeeklySnapshot };
