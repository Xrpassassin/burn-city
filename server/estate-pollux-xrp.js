'use strict';

const { allocateOwnerProfit } = require('./estate-owner-rewards');
const { createEstateImgOwnershipSnapshots } = require('./estate-img-ownership-snapshots');

const HASH = /^[0-9a-f]{64}$/i;
const DROPS = /^[1-9][0-9]*$/;
const HOUR = 3600000;
const MIN_PAYOUT = 1000;
const MAX_FEE = 100;

function matchesPoolReward(tx, pool, asset) {
  return (tx.Memos || []).filter(({ Memo }) => {
    const hex = Memo?.MemoData;
    if (!/^(?:[A-Fa-f0-9]{2})+$/.test(hex || '') || hex.length > 8192) return false;
    try {
      const memo = JSON.parse(Buffer.from(hex, 'hex').toString('utf8'));
      if (memo.rewardAsset !== asset || typeof memo.roundId !== 'string' || !memo.roundId) return false;
      if (memo.payoutType === 'lp') return memo.poolAccount === pool;
      return pool === 'rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ' && memo.payoutType === 'lp_floor' && memo.floorToken === 'IMG' &&
        memo.pools?.length === 1 && memo.pools[0] === 'PLX/IMG' &&
        memo.floorKey === 'IMG:rsJJMwweNS6GveA12RV7xmGNG1HdgAuiNd';
    } catch {
      return false;
    }
  }).length === 1;
}

function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}

function xrpRewardReserve(db) {
  if (!tableExists(db, 'estate_pollux_xrp_allocations')) return 0n;
  const accrued = db.prepare('SELECT drops FROM estate_pollux_xrp_allocations').all()
    .reduce((total, { drops }) => total + BigInt(drops), 0n);
  const spent = db.prepare('SELECT spent_drops FROM estate_pollux_xrp_payments').all()
    .reduce((total, { spent_drops }) => total + BigInt(spent_drops), 0n);
  const burn = db.prepare('SELECT fractional_bps FROM estate_pollux_xrp_burn_credit WHERE id=1').get()?.fractional_bps || '0';
  const burnSpent = db.prepare("SELECT xrp_spent FROM estate_pollux_burn_batches WHERE asset='XRP'").all()
    .reduce((total, { xrp_spent }) => total + BigInt(xrp_spent), 0n);
  return accrued - spent + BigInt(burn)/10000n - burnSpent;
}

function createPolluxXrpRewards({ db, client, treasury, pool, source, send, lookup, spendable, paused, now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS estate_pollux_xrp_burn_credit (
      id INTEGER PRIMARY KEY CHECK(id=1), fractional_bps TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS estate_pollux_burn_batches (
      id INTEGER PRIMARY KEY, asset TEXT NOT NULL CHECK(asset IN ('IMG','XRP')),
      budget TEXT NOT NULL, img_units TEXT, xrp_spent TEXT NOT NULL DEFAULT '0',
      min_img TEXT, spend_max TEXT, state TEXT NOT NULL CHECK(state IN ('pending','burned','failed'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS estate_pollux_burn_active_asset ON estate_pollux_burn_batches(asset) WHERE state='pending';
    CREATE TABLE IF NOT EXISTS estate_pollux_xrp_checkpoint (
      id INTEGER PRIMARY KEY CHECK(id=1), ledger_index INTEGER NOT NULL, through_ms INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS estate_pollux_xrp_receipts (
      hash TEXT PRIMARY KEY, received_at_ms INTEGER NOT NULL, drops INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS estate_pollux_xrp_allocations (
      hash TEXT NOT NULL REFERENCES estate_pollux_xrp_receipts(hash),
      owner TEXT NOT NULL, drops INTEGER NOT NULL, PRIMARY KEY(hash,owner)
    );
    CREATE INDEX IF NOT EXISTS estate_pollux_xrp_owner ON estate_pollux_xrp_allocations(owner);
    CREATE TABLE IF NOT EXISTS estate_pollux_xrp_payments (
      id INTEGER PRIMARY KEY, owner TEXT NOT NULL, gross_drops INTEGER NOT NULL,
      amount_drops INTEGER NOT NULL, fee_drops INTEGER NOT NULL, spent_drops INTEGER NOT NULL DEFAULT 0,
      state TEXT NOT NULL CHECK(state IN ('pending','paid','held')),
      tx_hash TEXT, created_ms INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS estate_pollux_xrp_active_owner ON estate_pollux_xrp_payments(owner) WHERE state IN ('pending','held');
  `);

  async function scan(from,burnBps) {
    const head = (await client.request({ command:'ledger', ledger_index:'validated' })).result;
    const index = Number(head?.ledger_index);
    const through = (head?.ledger?.close_time + 946684800) * 1000;
    if (head?.validated !== true || !Number.isSafeInteger(index) || !Number.isSafeInteger(through)) throw Error('pollux_validated_head_required');
    const previous = db.prepare('SELECT * FROM estate_pollux_xrp_checkpoint WHERE id=1').get();
    if (previous && (previous.ledger_index >= index || previous.through_ms > through)) return;

    // Backfill from program start, then cover the entire interval since the last proven head.
    const min = previous ? previous.ledger_index + 1 : -1;
    const entries = [];
    const markers = new Set();
    let marker, finished = false, lastLedger = index, lastReceived = through;
    for (let page = 0; page < 40 && !finished; page++) {
      const result = (await client.request({
        command:'account_tx', account:treasury, ledger_index_min:min, ledger_index_max:index,
        forward:false, binary:false, limit:100, ...(marker === undefined ? {} : { marker })
      })).result;
      if (result?.validated !== true || result.account !== treasury || Number(result.ledger_index_max) !== index ||
          (previous && Number(result.ledger_index_min) !== min) || !Array.isArray(result.transactions)) throw Error('pollux_history_incomplete');
      for (const entry of result.transactions) {
        const tx = entry.tx_json || entry.tx;
        const received = (tx?.date + 946684800) * 1000;
        const hash = entry.hash || tx?.hash;
        const ledger = Number(entry.ledger_index ?? tx?.ledger_index);
        if (entry.validated !== true || !HASH.test(hash || '') || !Number.isSafeInteger(received) ||
            !Number.isSafeInteger(ledger) || ledger > index || (previous && ledger < min) || ledger > lastLedger || received > lastReceived) throw Error('pollux_history_entry_invalid');
        lastLedger = ledger;
        lastReceived = received;
        if (received < from) { finished = true; break; }
        if (tx.TransactionType !== 'Payment' || tx.Account !== source || tx.Destination !== treasury ||
            entry.meta?.TransactionResult !== 'tesSUCCESS' || !matchesPoolReward(tx, pool, 'XRP')) continue;
        const drops = entry.meta.delivered_amount;
        if (typeof drops !== 'string' || !DROPS.test(drops) || !Number.isSafeInteger(Number(drops))) continue;
        entries.push({ hash:hash.toUpperCase(), received, drops:Number(drops) });
      }
      marker = result.marker;
      if (marker == null) {
        if (!previous && !finished && Number(result.ledger_index_min) > 0) {
          const oldest = (await client.request({command:'ledger',ledger_index:Number(result.ledger_index_min)})).result;
          const oldestTime = (oldest?.ledger?.close_time + 946684800)*1000;
          if (oldest?.validated !== true || !Number.isSafeInteger(oldestTime) || oldestTime > from) throw Error('pollux_history_start_unavailable');
        }
        finished = true;
      }
      else if (!finished) {
        const key = JSON.stringify(marker);
        if (markers.has(key)) throw Error('pollux_history_marker_repeated');
        markers.add(key);
      }
    }
    if (!finished) throw Error('pollux_history_backfill_incomplete');
    const owners = createEstateImgOwnershipSnapshots(db);
    db.exec('BEGIN IMMEDIATE');
    try {
      const current = db.prepare('SELECT ledger_index FROM estate_pollux_xrp_checkpoint WHERE id=1').get();
      if (current?.ledger_index !== previous?.ledger_index) throw Error('pollux_checkpoint_changed');
      let burn = BigInt(db.prepare('SELECT fractional_bps FROM estate_pollux_xrp_burn_credit WHERE id=1').get()?.fractional_bps || '0');
      for (const { hash, received, drops } of entries.reverse()) {
        const receipt = db.prepare('INSERT OR IGNORE INTO estate_pollux_xrp_receipts VALUES(?,?,?)').run(hash,received,drops);
        if (!receipt.changes) continue;
        const holdings = owners.at(received);
        if (!holdings.length) continue;
        const before = burn/10000n;
        burn += BigInt(drops)*BigInt(burnBps);
        const net = drops - Number(burn/10000n - before);
        for (const allocation of allocateOwnerProfit(net,holdings)) {
          if (allocation.amountDrops && allocation.acct !== treasury) {
            db.prepare('INSERT INTO estate_pollux_xrp_allocations VALUES(?,?,?)').run(hash,allocation.acct,allocation.amountDrops);
          }
        }
      }
      db.prepare('INSERT INTO estate_pollux_xrp_burn_credit VALUES(1,?) ON CONFLICT(id) DO UPDATE SET fractional_bps=excluded.fractional_bps').run(burn.toString());
      db.prepare('INSERT INTO estate_pollux_xrp_checkpoint VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET ledger_index=excluded.ledger_index,through_ms=excluded.through_ms').run(index,through);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  async function settle(row) {
    const step = 'px-xrp:' + row.id;
    if (!db.prepare('SELECT 1 FROM estate_mp_txs WHERE step=?').get(step)) {
      const probe = await client.autofill({ Account:treasury, TransactionType:'Payment', Destination:row.owner, Amount:'1' });
      if (!DROPS.test(probe.Fee || '') || Number(probe.Fee) > MAX_FEE) return;
      row.fee_drops = Number(probe.Fee);
      row.amount_drops = row.gross_drops - row.fee_drops;
      db.prepare('UPDATE estate_pollux_xrp_payments SET amount_drops=?,fee_drops=? WHERE id=?')
        .run(row.amount_drops,row.fee_drops,row.id);
    }
    let proof;
    try {
      proof = await send(step, { TransactionType:'Payment', Destination:row.owner, Amount:String(row.amount_drops), Fee:String(row.fee_drops) },
        { polluxXrp:row, beforeSign:async () => {
          if (paused() || await spendable() < xrpRewardReserve(db)) throw Error('pollux_xrp_reserve_required');
        } });
    } catch (error) {
      const job = db.prepare('SELECT * FROM estate_mp_txs WHERE step=?').get(step);
      if (job?.state !== 'failed') throw error;
      if (/^(expired|tefPAST_SEQ|tefMAX_LEDGER)$/.test(job.result)) {
        db.prepare("DELETE FROM estate_mp_txs WHERE step=? AND state='failed'").run(step);
        return;
      }
      if (!/^tec/.test(job.result || '')) throw error;
      proof = await lookup(job.hash);
    }
    if (proof?.validated !== true) throw Error('pollux_xrp_payment_proof_required');
    const tx = proof.tx_json || proof;
    const hash = proof.hash || tx.hash;
    const result = proof.meta?.TransactionResult;
    const paid = result === 'tesSUCCESS';
    if (!HASH.test(hash || '') || tx.Account !== treasury || tx.Destination !== row.owner ||
        tx.Fee !== String(row.fee_drops) || (paid ? proof.meta.delivered_amount !== String(row.amount_drops) : !/^tec/.test(result || ''))) {
      throw Error('pollux_xrp_payment_proof_mismatch');
    }
    db.prepare("UPDATE estate_pollux_xrp_payments SET state=?,spent_drops=?,tx_hash=? WHERE id=? AND state='pending'")
      .run(paid ? 'paid' : 'held', row.fee_drops + (paid ? row.amount_drops : 0), hash, row.id);
  }

  async function run(from, limit, burnBps) {
    await scan(from,burnBps);
    if (paused()) return;
    const checkpoint = db.prepare('SELECT through_ms FROM estate_pollux_xrp_checkpoint WHERE id=1').get();
    if (!checkpoint) return;
    const closedThrough = Math.floor(checkpoint.through_ms / HOUR) * HOUR;
    for (const row of db.prepare("SELECT * FROM estate_pollux_xrp_payments WHERE state='pending' ORDER BY id LIMIT ?").all(limit)) {
      await settle(row);
      if (--limit === 0 || paused()) return;
    }
    const ready = db.prepare(`
      SELECT a.owner, SUM(a.drops) - COALESCE((SELECT SUM(p.spent_drops) FROM estate_pollux_xrp_payments p WHERE p.owner=a.owner),0) AS credit
      FROM estate_pollux_xrp_allocations a JOIN estate_pollux_xrp_receipts r USING(hash)
      WHERE r.received_at_ms < ? AND NOT EXISTS (
        SELECT 1 FROM estate_pollux_xrp_payments p WHERE p.owner=a.owner AND p.state IN ('pending','held')
      )
      GROUP BY a.owner HAVING credit >= ? ORDER BY a.owner LIMIT ?
    `).all(closedThrough,MIN_PAYOUT,limit);
    for (const { owner, credit } of ready) {
      if (paused()) return;
      const id = db.prepare("INSERT INTO estate_pollux_xrp_payments(owner,gross_drops,amount_drops,fee_drops,state,created_ms) VALUES(?,?,?,?,'pending',?)")
        .run(owner,credit,credit,0,now()).lastInsertRowid;
      await settle(db.prepare('SELECT * FROM estate_pollux_xrp_payments WHERE id=?').get(id));
    }
  }

  function status(owner) {
    const { through_ms:throughMs, ledger_index:ledgerIndex } = db.prepare('SELECT * FROM estate_pollux_xrp_checkpoint WHERE id=1').get() || {};
    if (!owner) {
      const received = db.prepare('SELECT COALESCE(SUM(drops),0) AS drops FROM estate_pollux_xrp_receipts').get().drops;
      const paid = db.prepare("SELECT COALESCE(SUM(amount_drops),0) AS drops FROM estate_pollux_xrp_payments WHERE state='paid'").get().drops;
      const credit = db.prepare('SELECT fractional_bps FROM estate_pollux_xrp_burn_credit WHERE id=1').get()?.fractional_bps || '0';
      const spent = db.prepare("SELECT xrp_spent FROM estate_pollux_burn_batches WHERE asset='XRP'").all()
        .reduce((sum,row)=>sum+BigInt(row.xrp_spent),0n);
      return { throughMs, ledgerIndex, receivedDrops:String(received), paidDrops:String(paid), burnPendingDrops:String(BigInt(credit)/10000n-spent) };
    }
    const earned = db.prepare('SELECT COALESCE(SUM(drops),0) AS drops FROM estate_pollux_xrp_allocations WHERE owner=?').get(owner).drops;
    const spent = db.prepare('SELECT COALESCE(SUM(spent_drops),0) AS drops FROM estate_pollux_xrp_payments WHERE owner=?').get(owner).drops;
    const payments = db.prepare('SELECT amount_drops,fee_drops,state,tx_hash,created_ms FROM estate_pollux_xrp_payments WHERE owner=? ORDER BY id DESC LIMIT 20').all(owner);
    return { throughMs, ledgerIndex, minPayoutDrops:String(MIN_PAYOUT), pendingDrops:String(earned-spent), payments };
  }
  return { run, status };
}

module.exports = { createPolluxXrpRewards, matchesPoolReward, xrpRewardReserve };
