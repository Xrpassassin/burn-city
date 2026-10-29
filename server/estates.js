'use strict';
// Estates ownership and weekly-profit ledger schema. Purchases and transfers stay disabled until
// the external wallet/payment adapter can prove settlement and its accounting rules are approved.
const Pay = require('./payments');
const { CATALOG, TIER_BY_ID, PROPERTY_BY_ID, propertyWeight, allocateProfit, buildWeeklySnapshot } = require('./estate-economy');
const db = Pay.sdb;
const { createOwnerEpochStore } = require('./estate-owner-epoch-store');
const ownerEpochs = createOwnerEpochStore(db);
db.exec("CREATE TABLE IF NOT EXISTS estate_property_ownership (property_id TEXT PRIMARY KEY, acct TEXT NOT NULL, purchase_tx TEXT NOT NULL UNIQUE, purchase_amount_drops INTEGER NOT NULL CHECK(purchase_amount_drops >= 0), share_units INTEGER NOT NULL CHECK(share_units > 0), purchased_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS estate_property_owner_idx ON estate_property_ownership(acct); CREATE TABLE IF NOT EXISTS estate_profit_weeks (week_start TEXT PRIMARY KEY, source_wallet TEXT NOT NULL, source_ledger_index INTEGER NOT NULL, realized_profit_drops INTEGER NOT NULL CHECK(realized_profit_drops >= 0), fees_drops INTEGER NOT NULL CHECK(fees_drops >= 0), reserve_drops INTEGER NOT NULL CHECK(reserve_drops >= 0), distributable_drops INTEGER NOT NULL CHECK(distributable_drops >= 0), verification_ref TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','verified','approved','settled')), created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS estate_profit_allocations (week_start TEXT NOT NULL, property_id TEXT NOT NULL, acct TEXT NOT NULL, share_units INTEGER NOT NULL CHECK(share_units > 0), amount_drops INTEGER NOT NULL CHECK(amount_drops >= 0), tx_hash TEXT, status TEXT NOT NULL CHECK(status IN ('preview','approved','settled')), PRIMARY KEY(week_start, property_id), FOREIGN KEY(week_start) REFERENCES estate_profit_weeks(week_start), FOREIGN KEY(property_id) REFERENCES estate_property_ownership(property_id));");

db.exec("CREATE TABLE IF NOT EXISTS estate_weekly_snapshots (week_start TEXT PRIMARY KEY, source_wallet TEXT NOT NULL, source_ledger_index INTEGER NOT NULL CHECK(source_ledger_index > 0), realized_profit_drops INTEGER NOT NULL CHECK(realized_profit_drops >= 0), fees_drops INTEGER NOT NULL CHECK(fees_drops >= 0), realized_losses_drops INTEGER NOT NULL CHECK(realized_losses_drops >= 0), reserve_drops INTEGER NOT NULL CHECK(reserve_drops >= 0), distributable_drops INTEGER NOT NULL CHECK(distributable_drops >= 0), total_eligible_weight INTEGER NOT NULL CHECK(total_eligible_weight >= 0), ownership_count INTEGER NOT NULL CHECK(ownership_count >= 0), ownership_hash TEXT NOT NULL, verification_ref TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('draft','verified','approved','settled')), created_at INTEGER NOT NULL, verified_at INTEGER, approved_at INTEGER, settled_at INTEGER); CREATE TABLE IF NOT EXISTS estate_weekly_owner_allocations (week_start TEXT NOT NULL, acct TEXT NOT NULL, property_ids_json TEXT NOT NULL, combined_weight INTEGER NOT NULL CHECK(combined_weight > 0), amount_drops INTEGER NOT NULL CHECK(amount_drops >= 0), payout_tx_hash TEXT, payout_status TEXT NOT NULL CHECK(payout_status IN ('not_queued','queued','submitted','validated','failed')), PRIMARY KEY(week_start, acct), FOREIGN KEY(week_start) REFERENCES estate_weekly_snapshots(week_start)); CREATE INDEX IF NOT EXISTS estate_weekly_allocations_acct_idx ON estate_weekly_owner_allocations(acct, week_start);");
// Owner-directed payout currency. Never require PLX trustlines from residents.
db.exec("CREATE TABLE IF NOT EXISTS estate_owner_payout_preferences (acct TEXT PRIMARY KEY, currency TEXT NOT NULL CHECK(currency IN ('IMG','XRP')), updated_at INTEGER NOT NULL CHECK(updated_at > 0))");
function payoutPreference(acct) {
  if (typeof acct !== 'string' || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(acct)) throw new TypeError('invalid_owner_wallet');
  const row = db.prepare('SELECT currency, updated_at AS updatedAt FROM estate_owner_payout_preferences WHERE acct=?').get(acct);
  return { currency: row?.currency || null, updatedAt: row?.updatedAt || null, requiresSelection: !row };
}
function setPayoutPreference(acct, currency) {
  if (typeof acct !== 'string' || !/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(acct)) throw new TypeError('invalid_owner_wallet');
  if (currency !== 'IMG' && currency !== 'XRP') throw new TypeError('unsupported_payout_currency');
  db.prepare('INSERT INTO estate_owner_payout_preferences (acct,currency,updated_at) VALUES (?,?,?) ON CONFLICT(acct) DO UPDATE SET currency=excluded.currency,updated_at=excluded.updated_at').run(acct,currency,Date.now());
  return payoutPreference(acct);
}
function getState(acct = '') {
  const owned = acct ? db.prepare('SELECT property_id AS propertyId, acct, purchase_tx AS purchaseTx, purchase_amount_drops AS purchaseAmountDrops, share_units AS shareUnits, purchased_at AS purchasedAt FROM estate_property_ownership WHERE acct=? ORDER BY property_id').all(acct) : [];
  const totalShareUnits = db.prepare('SELECT COALESCE(SUM(share_units),0) AS n FROM estate_property_ownership').get().n;
  return { catalog: CATALOG, owned: owned.map(p => ({ ...p, property: PROPERTY_BY_ID.get(p.propertyId), tier: TIER_BY_ID.get(PROPERTY_BY_ID.get(p.propertyId)?.tier) })), portfolioShareUnits: owned.reduce((n,p) => n + p.shareUnits,0), totalShareUnits, salesEnabled: false, distributionsEnabled: false, status: 'wallet_integration_pending', payoutPreference: acct ? payoutPreference(acct) : null };
}
// Server-authoritative planning: ownership and settlement choices are read from SQLite,
// never supplied by a caller. Funding proof must be separately reviewed before execution.
function createOwnerRewardEpoch({ epochId, distributableImgUnits, fundingRef, sourceLedgerIndex } = {}) {
  const holdings = db.prepare('SELECT property_id AS propertyId, acct FROM estate_property_ownership ORDER BY property_id').all();
  if (holdings.length === 0) throw new Error('no_eligible_property_owners');
  const preferences = Object.create(null);
  const owners = [...new Set(holdings.map(h => h.acct))];
  const query = db.prepare('SELECT currency FROM estate_owner_payout_preferences WHERE acct=?');
  for (const acct of owners) preferences[acct] = query.get(acct)?.currency || null;
  return ownerEpochs.create({ epochId, distributableImgUnits, fundingRef, sourceLedgerIndex, holdings, preferences });
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
  const persist = () => {   // node:sqlite has no db.transaction(): explicit BEGIN/COMMIT, rollback on any error
    db.exec('BEGIN IMMEDIATE');
    try {
    insertSnapshot.run({ weekStart:snapshot.weekStart, sourceWallet:snapshot.sourceWallet, sourceLedgerIndex:snapshot.sourceLedgerIndex, realizedProfitDrops:snapshot.realizedProfitDrops, feesDrops:snapshot.feesDrops, realizedLossesDrops:snapshot.realizedLossesDrops, reserveDrops:snapshot.reserveDrops, distributableDrops:snapshot.distributableDrops, totalEligibleWeight:snapshot.totalEligibleWeight, ownershipCount:snapshot.ownershipCount, ownershipHash:snapshot.ownershipHash, verificationRef:snapshot.verificationRef, createdAt:snapshot.createdAt });
    for (const owner of snapshot.allocations) insertOwner.run(snapshot.weekStart, owner.acct, JSON.stringify(owner.propertyIds), owner.weight, owner.amountDrops);
      db.exec('COMMIT');
    } catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
  };
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
  if (nextStatus === 'settled') {
    const snap = getWeeklySnapshot(weekStart);
    if (!snap || snap.status !== 'approved') throw new Error('snapshot_not_approved');
    const paid = snap.allocations.reduce((sum, row) => sum + row.amountDrops, 0);
    if (paid !== snap.distributable_drops) throw new Error('payout_total_does_not_reconcile');
    if (snap.distributable_drops > 0 && snap.allocations.some(row => row.payoutStatus !== 'validated' || !row.payoutTxHash)) throw new Error('payouts_not_validated');
  }
  const stamp = Number(at);
  if (!Number.isSafeInteger(stamp) || stamp < 1) throw new TypeError('invalid_transition_timestamp');
  const column = { verified:'verified_at', approved:'approved_at', settled:'settled_at' }[nextStatus];
  const result = db.prepare('UPDATE estate_weekly_snapshots SET status=?, '+column+'=? WHERE week_start=? AND status=?').run(nextStatus, stamp, String(weekStart), expectedStatus);
  if (result.changes !== 1) throw new Error('snapshot_missing_or_status_changed');
  return getWeeklySnapshot(weekStart);
}


function recordWeeklyPayoutStatus(weekStart, acct, nextStatus, txHash = null) {
  const transitions = { not_queued:['queued'], queued:['submitted','failed'], submitted:['validated','failed'], failed:['queued'], validated:[] };
  const owner = String(acct || '');
  if (!owner) throw new TypeError('owner_account_required');
  if (!['not_queued','queued','submitted','validated','failed'].includes(nextStatus)) throw new TypeError('invalid_payout_status');
  const current = db.prepare('SELECT payout_status AS payoutStatus, amount_drops AS amountDrops FROM estate_weekly_owner_allocations WHERE week_start=? AND acct=?').get(String(weekStart), owner);
  if (!current) throw new Error('weekly_owner_allocation_not_found');
  if (!transitions[current.payoutStatus].includes(nextStatus)) throw new TypeError('invalid_payout_status_transition');
  let hash = txHash == null ? null : String(txHash).trim();
  if (nextStatus === 'submitted' || nextStatus === 'validated') {
    if (!hash || !/^[A-Fa-f0-9]{64}$/.test(hash)) throw new TypeError('xrpl_transaction_hash_required');
  } else if (hash && !/^[A-Fa-f0-9]{64}$/.test(hash)) throw new TypeError('invalid_xrpl_transaction_hash');
  if (nextStatus === 'validated' && current.payoutStatus !== 'submitted') throw new TypeError('payout_must_be_submitted_before_validation');
  db.prepare('UPDATE estate_weekly_owner_allocations SET payout_status=?, payout_tx_hash=COALESCE(?,payout_tx_hash) WHERE week_start=? AND acct=?').run(nextStatus, hash, String(weekStart), owner);
  return getWeeklySnapshot(weekStart);
}

module.exports = { createOwnerRewardEpoch, ownerEpochs, payoutPreference, setPayoutPreference, CATALOG, getState, propertyWeight, previewWeeklyAllocation, createWeeklySnapshot, getWeeklySnapshot, transitionWeeklySnapshot, recordWeeklyPayoutStatus };
