'use strict';
// Durable, idempotent IMG-denominated epoch plans. No wallet transfers or swaps.
const { planOwnerCurrencyPayouts } = require('./estate-owner-currency-plan');
function createOwnerEpochStore(db) {
  db.exec("CREATE TABLE IF NOT EXISTS estate_img_reward_epochs (epoch_id TEXT PRIMARY KEY, funding_ref TEXT NOT NULL UNIQUE, source_ledger_index INTEGER NOT NULL CHECK(source_ledger_index > 0), budget_units TEXT NOT NULL, allocated_units TEXT NOT NULL, remainder_units TEXT NOT NULL, created_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS estate_img_reward_intents (epoch_id TEXT NOT NULL, wallet TEXT NOT NULL, payout_id TEXT NOT NULL UNIQUE, img_units TEXT NOT NULL, shares TEXT NOT NULL, settlement_currency TEXT CHECK(settlement_currency IN ('IMG','XRP') OR settlement_currency IS NULL), settlement_mode TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('held','ready','submitting','confirmed','failed')), hold_reason TEXT, tx_hash TEXT, PRIMARY KEY(epoch_id,wallet), FOREIGN KEY(epoch_id) REFERENCES estate_img_reward_epochs(epoch_id));");
  const get = epochId => {
    const epoch = db.prepare('SELECT * FROM estate_img_reward_epochs WHERE epoch_id=?').get(epochId);
    if (!epoch) return null;
    const payouts = db.prepare('SELECT * FROM estate_img_reward_intents WHERE epoch_id=? ORDER BY wallet').all(epochId);
    return { epoch, payouts };
  };
  function create({ epochId, distributableImgUnits, holdings, fundingRef, sourceLedgerIndex, preferences }) {
    const plan = planOwnerCurrencyPayouts({ epochId, distributableImgUnits, holdings, fundingRef, sourceLedgerIndex, preferences });
    const existing = get(epochId);
    if (existing) throw new Error('epoch_already_frozen');
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare('INSERT INTO estate_img_reward_epochs (epoch_id,funding_ref,source_ledger_index,budget_units,allocated_units,remainder_units,created_at) VALUES (?,?,?,?,?,?,?)').run(plan.epochId,plan.fundingRef,plan.sourceLedgerIndex,plan.budgetUnits,plan.allocatedUnits,plan.remainderUnits,Date.now());
      const insert = db.prepare('INSERT INTO estate_img_reward_intents (epoch_id,wallet,payout_id,img_units,shares,settlement_currency,settlement_mode,state,hold_reason,tx_hash) VALUES (?,?,?,?,?,?,?,?,?,NULL)');
      for (const p of plan.payouts) insert.run(plan.epochId,p.wallet,p.id,p.units,p.shares,p.settlementCurrency,p.settlementMode,p.state,p.holdReason);
      db.exec('COMMIT');
    } catch (err) { try { db.exec('ROLLBACK'); } catch {} throw err; }
    return get(epochId);
  }
  return { create, get };
}
module.exports = { createOwnerEpochStore };
