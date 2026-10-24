'use strict';

const crypto = require('node:crypto');
const { allocateOwnerProfit } = require('./estate-owner-rewards');

function nonnegativeSafeInteger(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new TypeError(name + '_must_be_nonnegative_safe_integer');
  return n;
}
function isoWeekStart(value) {
  const s = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new TypeError('week_start_must_be_YYYY_MM_DD');
  const d = new Date(s + 'T00:00:00.000Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== s || d.getUTCDay() !== 1) {
    throw new TypeError('week_start_must_be_valid_monday_utc');
  }
  return s;
}

// All values are integer XRP drops. The operator supplies a ledger-reconciled
// accounting statement; this function never infers profit from fees or balances.
function buildWeeklySnapshot(input) {
  if (!input || typeof input !== 'object') throw new TypeError('snapshot_input_required');
  const weekStart = isoWeekStart(input.weekStart);
  const sourceWallet = String(input.sourceWallet || '').trim();
  const verificationRef = String(input.verificationRef || '').trim();
  const sourceLedgerIndex = Number(input.sourceLedgerIndex);
  if (!sourceWallet) throw new TypeError('source_wallet_required');
  if (!Number.isSafeInteger(sourceLedgerIndex) || sourceLedgerIndex < 1) throw new TypeError('source_ledger_index_required');
  if (!verificationRef) throw new TypeError('verification_ref_required');
  const realizedProfitDrops = nonnegativeSafeInteger(input.realizedProfitDrops, 'realized_profit_drops');
  const feesDrops = nonnegativeSafeInteger(input.feesDrops, 'fees_drops');
  const realizedLossesDrops = nonnegativeSafeInteger(input.realizedLossesDrops, 'realized_losses_drops');
  const reserveDrops = nonnegativeSafeInteger(input.reserveDrops, 'reserve_drops');
  const netBeforeReserve = Math.max(0, realizedProfitDrops - feesDrops - realizedLossesDrops);
  const distributableDrops = Math.max(0, netBeforeReserve - reserveDrops);
  const holdings = Array.isArray(input.holdings) ? input.holdings : (() => { throw new TypeError('holdings_must_be_array'); })();
  const allocations = allocateOwnerProfit(distributableDrops, holdings);
  const ownership = holdings.map(h => ({ propertyId: String(h.propertyId), acct: String(h.acct) }))
    .sort((a, b) => a.propertyId.localeCompare(b.propertyId));
  const ownershipHash = crypto.createHash('sha256').update(JSON.stringify(ownership)).digest('hex');
  const allocationTotal = allocations.reduce((sum, row) => sum + row.amountDrops, 0);
  if (allocationTotal !== distributableDrops) throw new Error('allocation_reconciliation_failed');
  return Object.freeze({
    weekStart, sourceWallet, sourceLedgerIndex,
    realizedProfitDrops, feesDrops, realizedLossesDrops, reserveDrops,
    distributableDrops, totalEligibleWeight: allocations[0]?.totalWeight || 0,
    ownershipCount: ownership.length, ownershipHash, verificationRef,
    status: 'draft', allocations: allocations.map(row => Object.freeze({ ...row })),
    createdAt: Number.isSafeInteger(Number(input.createdAt)) && Number(input.createdAt) > 0 ? Number(input.createdAt) : Date.now()
  });
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS estate_weekly_snapshots (
  week_start TEXT PRIMARY KEY,
  source_wallet TEXT NOT NULL,
  source_ledger_index INTEGER NOT NULL CHECK(source_ledger_index > 0),
  realized_profit_drops INTEGER NOT NULL CHECK(realized_profit_drops >= 0),
  fees_drops INTEGER NOT NULL CHECK(fees_drops >= 0),
  realized_losses_drops INTEGER NOT NULL CHECK(realized_losses_drops >= 0),
  reserve_drops INTEGER NOT NULL CHECK(reserve_drops >= 0),
  distributable_drops INTEGER NOT NULL CHECK(distributable_drops >= 0),
  total_eligible_weight INTEGER NOT NULL CHECK(total_eligible_weight >= 0),
  ownership_count INTEGER NOT NULL CHECK(ownership_count >= 0),
  ownership_hash TEXT NOT NULL,
  verification_ref TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','verified','approved','settled')),
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  approved_at INTEGER,
  settled_at INTEGER
);
CREATE TABLE IF NOT EXISTS estate_weekly_owner_allocations (
  week_start TEXT NOT NULL,
  acct TEXT NOT NULL,
  property_ids_json TEXT NOT NULL,
  combined_weight INTEGER NOT NULL CHECK(combined_weight > 0),
  amount_drops INTEGER NOT NULL CHECK(amount_drops >= 0),
  payout_tx_hash TEXT,
  payout_status TEXT NOT NULL CHECK(payout_status IN ('not_queued','queued','submitted','validated','failed')),
  PRIMARY KEY (week_start, acct),
  FOREIGN KEY (week_start) REFERENCES estate_weekly_snapshots(week_start)
);
CREATE INDEX IF NOT EXISTS estate_weekly_allocations_acct_idx
  ON estate_weekly_owner_allocations(acct, week_start);
`;

function createWeeklySnapshotStore(db, { now = Date.now } = {}) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function' || typeof db.transaction !== 'function') {
    throw new TypeError('sqlite_database_required');
  }
  db.exec(SCHEMA_SQL);
  const insertSnapshot = db.prepare(`INSERT INTO estate_weekly_snapshots
    (week_start, source_wallet, source_ledger_index, realized_profit_drops, fees_drops,
     realized_losses_drops, reserve_drops, distributable_drops, total_eligible_weight,
     ownership_count, ownership_hash, verification_ref, status, created_at)
    VALUES (@weekStart, @sourceWallet, @sourceLedgerIndex, @realizedProfitDrops, @feesDrops,
     @realizedLossesDrops, @reserveDrops, @distributableDrops, @totalEligibleWeight,
     @ownershipCount, @ownershipHash, @verificationRef, 'draft', @createdAt)`);
  const insertAllocation = db.prepare(`INSERT INTO estate_weekly_owner_allocations
    (week_start, acct, property_ids_json, combined_weight, amount_drops, payout_status)
    VALUES (?, ?, ?, ?, ?, 'not_queued')`);
  const insertAll = db.transaction(snapshot => {
    insertSnapshot.run(snapshot);
    for (const row of snapshot.allocations) {
      insertAllocation.run(snapshot.weekStart, row.acct, JSON.stringify(row.propertyIds), row.weight, row.amountDrops);
    }
  });
  function create(input) {
    const snapshot = buildWeeklySnapshot({ ...input, createdAt: input?.createdAt || now() });
    insertAll(snapshot); // unique week_start makes creation idempotent-by-rejection, never overwrites history
    return get(snapshot.weekStart);
  }
  function get(weekStart) {
    const week = db.prepare('SELECT * FROM estate_weekly_snapshots WHERE week_start=?').get(isoWeekStart(weekStart));
    if (!week) return null;
    const allocations = db.prepare('SELECT acct, property_ids_json, combined_weight, amount_drops, payout_tx_hash, payout_status FROM estate_weekly_owner_allocations WHERE week_start=? ORDER BY acct').all(week.week_start)
      .map(row => ({ acct: row.acct, propertyIds: JSON.parse(row.property_ids_json), weight: row.combined_weight, amountDrops: row.amount_drops, payoutTxHash: row.payout_tx_hash, payoutStatus: row.payout_status }));
    return { ...week, allocations };
  }
  function transition(weekStart, from, to, timestamp = now()) {
    const allowed = { draft: 'verified', verified: 'approved', approved: 'settled' };
    if (allowed[from] !== to) throw new TypeError('invalid_snapshot_status_transition');
    const stamp = Number(timestamp);
    if (!Number.isSafeInteger(stamp) || stamp < 1) throw new TypeError('invalid_transition_timestamp');
    const col = { verified: 'verified_at', approved: 'approved_at', settled: 'settled_at' }[to];
    const result = db.prepare(`UPDATE estate_weekly_snapshots SET status=?, ${col}=? WHERE week_start=? AND status=?`)
      .run(to, stamp, isoWeekStart(weekStart), from);
    if (result.changes !== 1) throw new Error('snapshot_missing_or_status_changed');
    return get(weekStart);
  }
  return { create, get, transition };
}

module.exports = { buildWeeklySnapshot, createWeeklySnapshotStore, SCHEMA_SQL, isoWeekStart };
