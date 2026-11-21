'use strict';

const { allocateOwnerProfit } = require('./estate-owner-rewards');
const { createEstateImgOwnershipSnapshots } = require('./estate-img-ownership-snapshots');

const HASH = /^[0-9a-f]{64}$/i;
const DROPS = /^[1-9][0-9]*$/;
const HOUR = 3600000;
const MIN_PAYOUT = 1000;
const MAX_FEE = 100;
const IMG_FEE = 15;
const IMG_MIN_PAYOUT = 250; // img mode: 15-drop fee <= 6% of a payment; starter-04 (~390 drops/h) is paid every hour // XRP drops reserved from each owner's credit for their IMG payment (12-drop base fee + cushion)

// kind of an estate Pollux receipt: 'lp' (pool pot share or LP minimum) or 'base' (PLX holder reward,
// earned on the PLX inside the estate's IMG/PLX LP; only when includeBase). null = not an estate reward.
function polluxRewardKind(tx, pool, asset, { includeBase = false } = {}) {
  if (matchesPoolReward(tx, pool, asset)) return 'lp';
  if (includeBase && asset === 'XRP' && memoCount(tx, memo => memo.payoutType === 'base' && memo.token === 'XRP' &&
      typeof memo.roundId === 'string' && /^PLX-HOLDER-\d{4}-\d{2}-\d{2}T\d{2}:00Z$/.test(memo.roundId) &&
      memo.pool === undefined && memo.poolAccount === undefined) === 1) return 'base';
  return null;
}

function memoCount(tx, test) {
  return (tx.Memos || []).filter(({ Memo }) => {
    const hex = Memo?.MemoData;
    if (!/^(?:[A-Fa-f0-9]{2})+$/.test(hex || '') || hex.length > 8192) return false;
    try { return test(JSON.parse(Buffer.from(hex, 'hex').toString('utf8'))); } catch { return false; }
  }).length;
}

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
  return accrued - spent - imgModeSpentDrops(db) + BigInt(burn)/10000n - burnSpent;
}

// XRP reserved for the burn that is neither converted by an XRP burn batch nor carried in an IMG-mode batch.
function xrpBurnAvailable(db) {
  const credit = BigInt(db.prepare('SELECT fractional_bps FROM estate_pollux_xrp_burn_credit WHERE id=1').get()?.fractional_bps || '0') / 10000n;
  const xrpBatches = tableExists(db, 'estate_pollux_burn_batches') ? db.prepare("SELECT xrp_spent, budget, state FROM estate_pollux_burn_batches WHERE asset='XRP'").all()
    .reduce((n, r) => n + BigInt(r.state === 'pending' ? r.budget : r.xrp_spent), 0n) : 0n;
  const inImg = tableExists(db, 'estate_pollux_img_batches') ? BigInt(db.prepare("SELECT COALESCE(SUM(CAST(burn_drops AS INTEGER)),0) AS d FROM estate_pollux_img_batches WHERE state!='failed'").get().d) : 0n;
  const left = credit - xrpBatches - inImg;
  return left > 0n ? left : 0n;
}

// IMG burn units carried by IMG-mode batches (held until the burn threshold).
function imgModeBurnUnits(db) {
  if (!tableExists(db, 'estate_pollux_img_batches')) return 0n;
  return BigInt(db.prepare("SELECT COALESCE(SUM(CAST(burn_units AS INTEGER)),0) AS u FROM estate_pollux_img_batches WHERE state IN ('converted','paid')").get().u);
}

// XRP that IMG-mode batches already converted (and the fees of IMG payouts already sent).
function imgModeSpentDrops(db) {
  if (!tableExists(db, 'estate_pollux_img_shares')) return 0n;
  const row = db.prepare(`SELECT
    COALESCE(SUM(CASE WHEN b.state IN ('converted','paid') THEN s.convert_drops ELSE 0 END),0)
      + COALESCE((SELECT SUM(CAST(burn_drops AS INTEGER)) FROM estate_pollux_img_batches WHERE state IN ('converted','paid')),0) AS converted,
    COALESCE(SUM(CASE WHEN b.state!='failed' AND s.state IN ('paid','held','rolled') THEN s.fee_drops ELSE 0 END),0) AS fees
    FROM estate_pollux_img_shares s JOIN estate_pollux_img_batches b ON b.id=s.batch_id`).get();
  return BigInt(row.converted) + BigInt(row.fees);
}

function createPolluxXrpRewards({ db, client, treasury, pool, source, send, lookup, availableDrops, paused, now,
  options = {}, img = null }) {
  // options (all default to the #646 behaviour): payoutAsset 'native' | 'img', includeBase,
  // batchMs (0 = pay as soon as the minimum is reached), minPayoutDrops.
  const mode = options.payoutAsset === 'img' ? 'img' : 'native';
  const includeBase = options.includeBase === true;
  const minPayout = Number.isSafeInteger(options.minPayoutDrops) ? options.minPayoutDrops : (mode === 'img' ? IMG_MIN_PAYOUT : MIN_PAYOUT);
  const batchMs = Number.isSafeInteger(options.batchMs) ? options.batchMs : (mode === 'img' ? HOUR : 0);
  const minSwap = Number.isSafeInteger(options.minSwapDrops) ? options.minSwapDrops : IMG_MIN_PAYOUT;
  // IMG mode: owners without a usable IMG trust line (validated account_lines) are paid their closed XRP
  // credit in native XRP instead of joining the swap (ESTATE_POLLUX_NO_TRUSTLINE_XRP, default on).
  const noLineXrp = mode === 'img' && options.noLineXrp !== false && typeof img?.line === 'function';
  if (mode === 'img' && !img) throw Error('pollux_img_mode_requires_swap');
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
    CREATE TABLE IF NOT EXISTS estate_pollux_img_batches (
      id INTEGER PRIMARY KEY, created_ms INTEGER NOT NULL, convert_drops TEXT NOT NULL, spend_max TEXT NOT NULL,
      min_img_units TEXT NOT NULL, img_units TEXT, xrp_spent TEXT NOT NULL DEFAULT '0', convert_hash TEXT,
      burn_drops TEXT NOT NULL DEFAULT '0', burn_units TEXT NOT NULL DEFAULT '0',
      state TEXT NOT NULL CHECK(state IN ('quoted','converted','paid','failed'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS estate_pollux_img_active ON estate_pollux_img_batches(state) WHERE state IN ('quoted','converted');
    CREATE TABLE IF NOT EXISTS estate_pollux_img_shares (
      batch_id INTEGER NOT NULL REFERENCES estate_pollux_img_batches(id), owner TEXT NOT NULL,
      gross_drops INTEGER NOT NULL, fee_drops INTEGER NOT NULL, convert_drops INTEGER NOT NULL,
      img_units TEXT NOT NULL DEFAULT '0', carry_units TEXT NOT NULL DEFAULT '0',
      state TEXT NOT NULL CHECK(state IN ('pending','paid','held','rolled')), tx_hash TEXT,
      PRIMARY KEY(batch_id, owner)
    );
  `);
  if (!db.prepare('PRAGMA table_info(estate_pollux_xrp_receipts)').all().some(c => c.name === 'kind')) {
    db.exec("ALTER TABLE estate_pollux_xrp_receipts ADD COLUMN kind TEXT NOT NULL DEFAULT 'lp'");
  }
  // XRP credit already consumed by IMG-mode batches (failed conversions release it).
  const sharedSql = `COALESCE((SELECT SUM(s.gross_drops) FROM estate_pollux_img_shares s JOIN estate_pollux_img_batches b ON b.id=s.batch_id
    WHERE s.owner=a.owner AND b.state!='failed'),0)`;

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
            entry.meta?.TransactionResult !== 'tesSUCCESS') continue;
        const kind = polluxRewardKind(tx, pool, 'XRP', { includeBase });
        if (!kind) continue;
        const drops = entry.meta.delivered_amount;
        if (typeof drops !== 'string' || !DROPS.test(drops) || !Number.isSafeInteger(Number(drops))) continue;
        entries.push({ hash:hash.toUpperCase(), received, drops:Number(drops), kind });
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
      for (const { hash, received, drops, kind } of entries.reverse()) {
        const receipt = db.prepare('INSERT OR IGNORE INTO estate_pollux_xrp_receipts(hash,received_at_ms,drops,kind) VALUES(?,?,?,?)').run(hash,received,drops,kind);
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
    const job = db.prepare('SELECT * FROM estate_mp_txs WHERE step=?').get(step);
    let payment, beforeSign;
    if (!job) {
      // Use one account snapshot for both the sequence and reserve check.
      // Supplying the complete envelope avoids two redundant autofill RPC rounds.
      const account = (await client.request({command:'account_info',account:treasury,ledger_index:'validated'})).result;
      const root = account?.account_data;
      const index = Number(account?.ledger_index);
      if (account?.validated !== true || root?.Account !== treasury || !Number.isSafeInteger(index) || index < 1 ||
          !Number.isSafeInteger(root.Sequence) || root.Sequence < 1) throw Error('pollux_xrp_account_snapshot_required');
      const fee = (await client.request({command:'fee'})).result?.drops?.open_ledger_fee;
      if (typeof fee !== 'string' || !DROPS.test(fee) || BigInt(fee) > BigInt(MAX_FEE)) return;
      // Use the same 20% fee cushion as the standard payment client.
      row.fee_drops = Number((BigInt(fee)*12n+9n)/10n);
      if (row.fee_drops > MAX_FEE) return;
      row.amount_drops = row.gross_drops - row.fee_drops;
      db.prepare('UPDATE estate_pollux_xrp_payments SET amount_drops=?,fee_drops=? WHERE id=?')
        .run(row.amount_drops,row.fee_drops,row.id);
      payment = {Account:treasury,TransactionType:'Payment',Destination:row.owner,Amount:String(row.amount_drops),
        Fee:String(row.fee_drops),Sequence:root.Sequence,LastLedgerSequence:index+20,Flags:0};
      beforeSign = async () => {
        if (paused() || await availableDrops(root) < xrpRewardReserve(db)) throw Error('pollux_xrp_reserve_required');
      };
    }
    let proof;
    try {
      proof = await send(step,payment,{polluxXrp:row,beforeSign});
    } catch (error) {
      const failed = db.prepare('SELECT * FROM estate_mp_txs WHERE step=?').get(step);
      if (failed?.state !== 'failed') throw error;
      if (/^(expired|tefPAST_SEQ|tefMAX_LEDGER)$/.test(failed.result)) {
        db.prepare("DELETE FROM estate_mp_txs WHERE step=? AND state='failed'").run(step);
        return;
      }
      if (!/^tec/.test(failed.result || '')) throw error;
      proof = await lookup(failed.hash);
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
    try {
      await scan(from,burnBps);
    } catch (error) {
      error.polluxStage = 'scan';
      throw error;
    }
    try {
      return await payClosedRewards(limit);
    } catch (error) {
      error.polluxStage = 'payout';
      throw error;
    }
  }

  async function payClosedRewards(limit) {
    if (paused()) return;
    const checkpoint = db.prepare('SELECT through_ms FROM estate_pollux_xrp_checkpoint WHERE id=1').get();
    if (!checkpoint) return;
    const closedThrough = Math.floor(checkpoint.through_ms / HOUR) * HOUR;
    for (const row of db.prepare("SELECT * FROM estate_pollux_xrp_payments WHERE state='pending' ORDER BY id LIMIT ?").all(limit)) {
      await settle(row);
      if (--limit === 0 || paused()) return;
    }
    if (mode === 'img') return payImgBatches(closedThrough, limit);
    const ready = readyCredits(closedThrough, limit).filter(({ owner }) => {
      if (!batchMs) return true;
      const last = db.prepare('SELECT MAX(created_ms) AS at FROM estate_pollux_xrp_payments WHERE owner=?').get(owner).at;
      return last == null || now() - last >= batchMs;
    });
    for (const { owner, credit } of ready) {
      if (paused()) return;
      const id = db.prepare("INSERT INTO estate_pollux_xrp_payments(owner,gross_drops,amount_drops,fee_drops,state,created_ms) VALUES(?,?,?,?,'pending',?)")
        .run(owner,credit,credit,0,now()).lastInsertRowid;
      await settle(db.prepare('SELECT * FROM estate_pollux_xrp_payments WHERE id=?').get(id));
    }
  }

  function readyCredits(closedThrough, limit) {
    return db.prepare(`
      SELECT a.owner, SUM(a.drops) - COALESCE((SELECT SUM(p.spent_drops) FROM estate_pollux_xrp_payments p WHERE p.owner=a.owner),0)
        - ${sharedSql} AS credit
      FROM estate_pollux_xrp_allocations a JOIN estate_pollux_xrp_receipts r USING(hash)
      WHERE r.received_at_ms < ? AND NOT EXISTS (
        SELECT 1 FROM estate_pollux_xrp_payments p WHERE p.owner=a.owner AND p.state IN ('pending','held')
      )
      GROUP BY a.owner HAVING credit >= ? ORDER BY a.owner LIMIT ?
    `).all(closedThrough, minPayout, limit);
  }

  function heldImgUnits(owner) {
    return BigInt(db.prepare("SELECT COALESCE(SUM(CAST(img_units AS INTEGER)+CAST(carry_units AS INTEGER)),0) AS u FROM estate_pollux_img_shares WHERE owner=? AND state='held'").get(owner).u);
  }
  // Split the ready owners by their validated IMG trust line. An owner whose line cannot be verified
  // (RPC error, unvalidated or ambiguous answer) is skipped this pass: no XRP payment and no swap
  // share, so the credit simply stays unspent and is retried. A line that exists but cannot take the
  // expected IMG (estimated from the quote with a 10% cushion, plus any held IMG) is treated as missing.
  async function routeByTrustLine(candidates, burnDrops) {
    const lines = new Map();
    for (const x of candidates) {
      let l = null;
      try { l = await img.line(x.owner); } catch { l = null; }
      if (l && typeof l.ok === 'boolean' && typeof l.headroomUnits === 'bigint') lines.set(x.owner, l);
    }
    const xrp = [];
    let imgShares = [];
    for (const x of candidates) {
      const l = lines.get(x.owner);
      if (!l) continue;
      (l.ok ? imgShares : xrp).push(x);
    }
    let quote = null;
    for (let round = 0; round < 3; round++) {
      const total = imgShares.reduce((n, x) => n + x.convert, 0) + burnDrops;
      // Burn-only batches are allowed so XRP-routed hours still convert the reserved burn as before.
      if (total < minSwap || (!imgShares.length && !burnDrops)) { quote = null; break; }
      quote = await img.quote(total);
      if (!quote) break;
      const min = BigInt(quote.minImgUnits);
      const short = imgShares.filter(x => min * BigInt(x.convert) * 11n / (10n * BigInt(total)) + heldImgUnits(x.owner) + 1n > lines.get(x.owner).headroomUnits);
      if (!short.length) break;
      xrp.push(...short);
      imgShares = imgShares.filter(x => !short.includes(x));
      quote = null;
    }
    return { xrp, img:imgShares, quote };
  }
  // Native XRP payout of the closed credit (same journaled rows + settle() proof checks as native mode).
  // The row is written before any signing; restarts resume it via the pending loop, never a second row.
  async function payNativeFallback(owners, limit) {
    for (const { owner, gross } of owners) {
      if (paused() || limit <= 0) return limit;
      if (gross < minPayout) continue;
      const last = db.prepare('SELECT MAX(created_ms) AS at FROM estate_pollux_xrp_payments WHERE owner=?').get(owner).at;
      if (last != null && Math.floor(last / batchMs) === Math.floor(now() / batchMs)) continue;
      let id;
      db.exec('BEGIN IMMEDIATE');
      try {
        // Re-check inside the transaction: still ready, nothing active, same credit.
        const row = readyCredits(Number.MAX_SAFE_INTEGER, 500).find(r => r.owner === owner);
        const fresh = db.prepare(`SELECT SUM(a.drops) - COALESCE((SELECT SUM(p.spent_drops) FROM estate_pollux_xrp_payments p WHERE p.owner=a.owner),0) - ${sharedSql} AS credit
          FROM estate_pollux_xrp_allocations a WHERE a.owner=? GROUP BY a.owner`).get(owner);
        if (!row || !fresh || Number(fresh.credit) < gross) { db.exec('ROLLBACK'); continue; }
        id = db.prepare("INSERT INTO estate_pollux_xrp_payments(owner,gross_drops,amount_drops,fee_drops,state,created_ms) VALUES(?,?,?,?,'pending',?)")
          .run(owner, gross, gross, 0, now()).lastInsertRowid;
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      limit--;
      await settle(db.prepare('SELECT * FROM estate_pollux_xrp_payments WHERE id=?').get(id));
    }
    return limit;
  }

  // IMG mode: once per batch window, convert every owner's closed XRP credit (minus the XRP fee of
  // their IMG payment) to IMG in ONE capped self-swap, split the delivered IMG pro rata by the XRP
  // each owner contributed, and pay it. The 3.22% burn was already reserved at receipt time and is
  // converted and retired by runPolluxBurns. Every step is journaled; restarts resume the same tx.
  async function payImgBatches(closedThrough, limit) {
    let batch = db.prepare("SELECT * FROM estate_pollux_img_batches WHERE state IN ('quoted','converted') ORDER BY id LIMIT 1").get();
    if (!batch) {
      // One batch per window, aligned to the window (hourly by default: the :07 Pollux round is paid the same hour).
      const last = db.prepare('SELECT MAX(created_ms) AS at FROM estate_pollux_img_batches').get().at;
      if (last != null && Math.floor(last / batchMs) === Math.floor(now() / batchMs)) return;
      const ready = readyCredits(closedThrough, 500);
      if (!ready.length) return;
      let shares = ready.map(({ owner, credit }) => ({ owner, gross:Number(credit), fee:IMG_FEE, convert:Number(credit) - IMG_FEE }));
      // The 3.22% reserved at receipt rides along in the same swap; its IMG is ledgered and HELD
      // until the accrued burn crosses the burn threshold (runPolluxBurns). XRP-routed owners do not
      // change it: their credit is already net of the burn reserved at receipt.
      const burnDrops = Number(xrpBurnAvailable(db));
      let quote = null;
      if (noLineXrp) {
        const routed = await routeByTrustLine(shares, burnDrops);
        if (!routed) return;
        limit = await payNativeFallback(routed.xrp, limit);
        if (limit <= 0 || paused()) return;
        shares = routed.img;
        quote = routed.quote;
        if (!quote) return; // no economic IMG swap this pass: IMG-route credit keeps accruing
      } else {
        const total = shares.reduce((n, x) => n + x.convert, 0) + burnDrops;
        if (total < minSwap) return; // uneconomic swap: credits keep accruing
        quote = await img.quote(total);
        if (!quote) return; // too small or too much price impact: credit keeps accruing
      }
      const total = shares.reduce((n, x) => n + x.convert, 0) + burnDrops;
      db.exec('BEGIN IMMEDIATE');
      try {
        const id = db.prepare("INSERT INTO estate_pollux_img_batches(created_ms,convert_drops,spend_max,min_img_units,burn_drops,state) VALUES(?,?,?,?,?,'quoted')")
          .run(now(), String(total), String(total), String(quote.minImgUnits), String(burnDrops)).lastInsertRowid;
        for (const x of shares) {
          const held = db.prepare("SELECT COALESCE(SUM(CAST(img_units AS INTEGER)+CAST(carry_units AS INTEGER)),0) AS u FROM estate_pollux_img_shares WHERE owner=? AND state='held'").get(x.owner).u;
          db.prepare("UPDATE estate_pollux_img_shares SET state='rolled' WHERE owner=? AND state='held'").run(x.owner);
          db.prepare("INSERT INTO estate_pollux_img_shares(batch_id,owner,gross_drops,fee_drops,convert_drops,carry_units,state) VALUES(?,?,?,?,?,?,'pending')")
            .run(id, x.owner, x.gross, x.fee, x.convert, String(held));
        }
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      batch = db.prepare("SELECT * FROM estate_pollux_img_batches WHERE state='quoted'").get();
    }
    if (paused()) return;
    if (batch.state === 'quoted') {
      const r = await img.convert('px-img:' + batch.id + ':convert', BigInt(batch.spend_max), BigInt(batch.min_img_units));
      if (!r) return; // retry later (tef/expired/reserve)
      if (r.failed) {
        db.prepare("UPDATE estate_pollux_img_batches SET state='failed',xrp_spent=?,convert_hash=? WHERE id=?").run(String(r.feeDrops), r.hash, batch.id);
        // The XRP credit is released (failed batches do not count); any IMG carried into this batch
        // goes back to 'held' so the next batch pays it.
        db.prepare("UPDATE estate_pollux_img_shares SET state='held',img_units='0' WHERE batch_id=?").run(batch.id);
        return;
      }
      const shares = db.prepare('SELECT * FROM estate_pollux_img_shares WHERE batch_id=? ORDER BY convert_drops DESC, owner').all(batch.id);
      const total = BigInt(batch.convert_drops), units = BigInt(r.imgUnits);
      const burnUnits = units * BigInt(batch.burn_drops) / total;
      let left = units - burnUnits;
      const alloc = shares.map(x => { const u = units * BigInt(x.convert_drops) / total; left -= u; return u; });
      if (alloc.length) alloc[0] += left;
      db.exec('BEGIN IMMEDIATE');
      try {
        shares.forEach((x, i) => db.prepare('UPDATE estate_pollux_img_shares SET img_units=? WHERE batch_id=? AND owner=?').run(String(alloc[i]), batch.id, x.owner));
        db.prepare("UPDATE estate_pollux_img_batches SET state='converted',img_units=?,burn_units=?,xrp_spent=?,convert_hash=? WHERE id=?")
          .run(String(units), String(burnUnits), String(r.spentDrops), r.hash, batch.id);
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
      batch = db.prepare('SELECT * FROM estate_pollux_img_batches WHERE id=?').get(batch.id);
    }
    for (const x of db.prepare("SELECT * FROM estate_pollux_img_shares WHERE batch_id=? AND state='pending' ORDER BY owner").all(batch.id)) {
      if (paused() || limit-- <= 0) return;
      const units = BigInt(x.img_units) + BigInt(x.carry_units);
      if (units <= 0n) { db.prepare("UPDATE estate_pollux_img_shares SET state='paid' WHERE batch_id=? AND owner=?").run(batch.id, x.owner); continue; }
      const r = await img.pay('px-img:' + batch.id + ':pay:' + x.owner, x.owner, units);
      if (!r) return;
      db.prepare('UPDATE estate_pollux_img_shares SET state=?,tx_hash=? WHERE batch_id=? AND owner=?').run(r.failed ? 'held' : 'paid', r.hash, batch.id, x.owner);
    }
    db.prepare("UPDATE estate_pollux_img_batches SET state='paid' WHERE id=? AND NOT EXISTS (SELECT 1 FROM estate_pollux_img_shares WHERE batch_id=? AND state='pending')").run(batch.id, batch.id);
  }

  function status(owner) {
    const { through_ms:throughMs, ledger_index:ledgerIndex } = db.prepare('SELECT * FROM estate_pollux_xrp_checkpoint WHERE id=1').get() || {};
    if (!owner) {
      const received = db.prepare('SELECT COALESCE(SUM(drops),0) AS drops FROM estate_pollux_xrp_receipts').get().drops;
      const paid = db.prepare("SELECT COALESCE(SUM(amount_drops),0) AS drops FROM estate_pollux_xrp_payments WHERE state='paid'").get().drops;
      const credit = db.prepare('SELECT fractional_bps FROM estate_pollux_xrp_burn_credit WHERE id=1').get()?.fractional_bps || '0';
      const spent = db.prepare("SELECT xrp_spent FROM estate_pollux_burn_batches WHERE asset='XRP'").all()
        .reduce((sum,row)=>sum+BigInt(row.xrp_spent),0n);
      const states = db.prepare("SELECT state,COUNT(*) AS count FROM estate_pollux_xrp_payments GROUP BY state").all();
      const kinds = Object.fromEntries(db.prepare('SELECT kind, COALESCE(SUM(drops),0) AS drops FROM estate_pollux_xrp_receipts GROUP BY kind').all().map(r => [r.kind, String(r.drops)]));
      const batches = db.prepare('SELECT state, COUNT(*) AS n, COALESCE(SUM(CAST(convert_drops AS INTEGER)),0) AS drops, COALESCE(SUM(CAST(img_units AS INTEGER)),0) AS units FROM estate_pollux_img_batches GROUP BY state').all();
      const imgPaid = db.prepare("SELECT COALESCE(SUM(CAST(img_units AS INTEGER)+CAST(carry_units AS INTEGER)),0) AS u FROM estate_pollux_img_shares WHERE state='paid'").get().u;
      return { throughMs, ledgerIndex, receivedDrops:String(received), receivedByKind:kinds, paidDrops:String(paid), burnPendingDrops:String(xrpBurnAvailable(db)),
        paymentCounts:Object.fromEntries(states.map(row=>[row.state,row.count])),
        payoutAsset:mode, noTrustlineXrp:noLineXrp, includeHolderBase:includeBase, batchHours:batchMs / HOUR, minPayoutDrops:String(minPayout), minSwapDrops:String(minSwap),
        imgBatches:Object.fromEntries(batches.map(b => [b.state, { count:b.n, xrpDrops:String(b.drops), imgUnits:String(b.units) }])), imgPaidUnits:String(imgPaid) };

    }
    const earned = db.prepare('SELECT COALESCE(SUM(drops),0) AS drops FROM estate_pollux_xrp_allocations WHERE owner=?').get(owner).drops;
    const spent = db.prepare('SELECT COALESCE(SUM(spent_drops),0) AS drops FROM estate_pollux_xrp_payments WHERE owner=?').get(owner).drops
      + db.prepare(`SELECT ${sharedSql} AS drops FROM (SELECT ? AS owner) a`).get(owner).drops;
    const imgPayments = db.prepare("SELECT s.batch_id, CAST(s.img_units AS INTEGER)+CAST(s.carry_units AS INTEGER) AS img_units, s.state, s.tx_hash, b.created_ms FROM estate_pollux_img_shares s JOIN estate_pollux_img_batches b ON b.id=s.batch_id WHERE s.owner=? AND s.state!='rolled' ORDER BY s.batch_id DESC LIMIT 20").all(owner);
    const payments = db.prepare('SELECT amount_drops,fee_drops,state,tx_hash,created_ms FROM estate_pollux_xrp_payments WHERE owner=? ORDER BY id DESC LIMIT 20').all(owner);
    return { throughMs, ledgerIndex, payoutAsset:mode, minPayoutDrops:String(minPayout), pendingDrops:String(earned-spent), payments, imgPayments };
  }
  return { run, status };
}

module.exports = { createPolluxXrpRewards, matchesPoolReward, polluxRewardKind, xrpRewardReserve, xrpBurnAvailable, imgModeBurnUnits };
