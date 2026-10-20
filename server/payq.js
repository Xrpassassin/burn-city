// Persistent, idempotent outgoing-payment queue (prizes + refunds). SQLite on the volume (DATA_DIR/payq.db).
// Lifecycle per row: queued -> submitted(hash, LastLedgerSequence persisted BEFORE submit) -> paid
//   submitted + validated non-success  -> queued again (funds never moved, safe to re-sign)
//   submitted + not found + ledger > LastLedgerSequence -> queued again (tx can never validate any more)
//   submitted + otherwise -> wait (never resend while the old tx could still validate) => nobody is paid twice
// held = guard ceiling hit or flagged: needs admin release. Low treasury balance / pause => stays queued (retried).
const path = require('path'), { DatabaseSync } = require('node:sqlite'), C = require('./config'), Guard = require('./guard');
const db = new DatabaseSync(path.join(C.DATA_DIR, 'payq.db'));
db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
CREATE TABLE IF NOT EXISTS payq(id TEXT PRIMARY KEY, kind TEXT, match TEXT, dest TEXT, drops INTEGER, memo TEXT, ticket TEXT,
  status TEXT, hash TEXT, lls INTEGER, attempts INTEGER DEFAULT 0, err TEXT, override INTEGER DEFAULT 0, booked INTEGER DEFAULT 0, created INTEGER, updated INTEGER);
CREATE INDEX IF NOT EXISTS payq_match ON payq(match); CREATE INDEX IF NOT EXISTS payq_status ON payq(status);
CREATE TABLE IF NOT EXISTS payq_hist(id TEXT, t INTEGER, hash TEXT, result TEXT);`);
const hex = s => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
const ADDR = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const upd = (id, f) => { const k = Object.keys(f); db.prepare(`UPDATE payq SET ${k.map(x => x + '=?').join(',')}, updated=? WHERE id=?`).run(...k.map(x => f[x]), Date.now(), id); };
const get = id => db.prepare('SELECT * FROM payq WHERE id=?').get(id);
// rows: [{id, kind:'prize'|'refund', match, dest, drops, memo, ticket}]. INSERT OR IGNORE => enqueueing twice is a no-op.
function enqueue(rows, status = 'queued', err = null) {
  const st = db.prepare('INSERT OR IGNORE INTO payq(id,kind,match,dest,drops,memo,ticket,status,err,created,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  let n = 0; for (const r of rows) { if (!ADDR.test(r.dest) || !(r.drops > 0)) continue; n += st.run(r.id, r.kind, r.match, r.dest, Math.floor(r.drops), r.memo || '', r.ticket || null, status, err, Date.now(), Date.now()).changes; } return n;
}
// Ceiling checks (no ledger needed). Returns reason or null.
function ceilings(rows) {
  const total = rows.reduce((a, r) => a + r.drops, 0), by = new Map(); for (const r of rows) by.set(r.dest, (by.get(r.dest) || 0) + r.drops);
  if (total > Guard.G.MATCH_MAX) return 'exceeds_per_match_ceiling'; if (Guard.dayUsed() + total > Guard.G.DAY_MAX) return 'exceeds_daily_ceiling';
  for (const [a, x] of by) if (Guard.addrUsedPub(a) + x > Guard.G.ADDR_MAX) return 'exceeds_per_address_daily_ceiling:' + a; return null;
}
// Auto-approve: ceilings OK -> queued, else held for admin. Ceiling usage is booked when the row is first signed.
function submitMatch(rows, flagged) {
  if (flagged) return { status: 'held', n: enqueue(rows, 'held', 'flagged_for_review') };
  const bad = ceilings(rows); return bad ? { status: 'held', n: enqueue(rows, 'held', bad) } : { status: 'queued', n: enqueue(rows) };
}
function release(match) {   // admin: release held rows (skip ceilings for these rows only; reserve check still applies)
  return db.prepare("UPDATE payq SET status='queued', override=1, err=NULL, updated=? WHERE match=? AND status='held'").run(Date.now(), match).changes;
}
const forMatch = m => db.prepare('SELECT id,kind,dest,drops,status,hash,err,attempts,updated FROM payq WHERE match=? ORDER BY id').all(m);
const forAcct = a => db.prepare('SELECT id,kind,match,drops,status,hash,updated FROM payq WHERE dest=? ORDER BY created DESC LIMIT 20').all(a);
const all = () => db.prepare('SELECT * FROM payq ORDER BY created DESC LIMIT 300').all();
let busy = false, hooks = { onPaid: () => {} };
// deps: {ledger: async () => client, wallet: () => xrpl.Wallet, live: () => bool}
async function tick(deps) {
  if (busy) return { skipped: true }; busy = true; const log = [];
  try {
    if (!deps.live()) return { notLive: true };
    let c; try { c = await deps.ledger(); } catch { return { error: 'ledger_unavailable' }; }
    const w = deps.wallet(); if (!w || w.classicAddress !== C.TREASURY) return { error: 'seed_mismatch' };
    let vl; try { vl = (await c.request({ command: 'ledger', ledger_index: 'validated' })).result.ledger_index; } catch { return { error: 'ledger_unavailable' }; }
    // 1) reconcile everything already signed
    for (const r of db.prepare("SELECT * FROM payq WHERE status='submitted'").all()) {
      let t = null, gone = false; try { t = (await c.request({ command: 'tx', transaction: r.hash, min_ledger: Math.max(1, r.lls - 40), max_ledger: r.lls })).result; }
      catch (e) { const d = e?.data || {}; gone = d.error === 'txnNotFound' && (d.searched_all ?? d.data?.searched_all ?? d.result?.searched_all) === true; }   // only 'searched every ledger in range' proves it never landed
      if (t && t.validated) {
        const res = t.meta?.TransactionResult; db.prepare('INSERT INTO payq_hist VALUES(?,?,?,?)').run(r.id, Date.now(), r.hash, res);
        if (res === 'tesSUCCESS') { upd(r.id, { status: 'paid', err: null }); Guard.log('payq-paid', { id: r.id, to: r.dest, drops: r.drops, hash: r.hash }); hooks.onPaid(r); log.push([r.id, 'paid']); }
        else { upd(r.id, { status: r.attempts >= 5 ? 'held' : 'queued', err: 'ledger_' + res }); log.push([r.id, 'retry_' + res]); }
      } else if (gone && +vl > +r.lls) {   // tx not in a validated ledger and its LastLedgerSequence has passed: it can never succeed
        upd(r.id, { status: 'queued', err: 'expired_unvalidated' }); log.push([r.id, 'retry_expired']);
      } else log.push([r.id, 'waiting']);
    }
    // 2) sign + submit queued rows, one by one
    if (Guard.paused()) return { paused: true, log };
    for (const r of db.prepare("SELECT * FROM payq WHERE status='queued' ORDER BY kind DESC, created").all()) {   // refunds first
      if (!r.booked && !r.override) { const bad = ceilings([r]); if (bad) { upd(r.id, { status: 'held', err: bad }); log.push([r.id, 'held']); continue; } }
      let sp; try { sp = await Guard.spendable(c, C.TREASURY); } catch { upd(r.id, { err: 'reserve_check_failed' }); break; }
      if (r.drops + 1000 > sp) { upd(r.id, { err: `insufficient_treasury (spendable ${Math.max(0, sp)} drops)` }); log.push([r.id, 'waiting_funds']); continue; }
      let f; try { f = await c.autofill({ TransactionType: 'Payment', Account: C.TREASURY, Destination: r.dest, Amount: String(r.drops),
        Memos: [{ Memo: { MemoType: hex('burncity/' + r.kind), MemoData: hex(r.memo || r.id) } }] }); } catch (e) { upd(r.id, { err: 'autofill:' + e.message }); continue; }
      if (+f.Fee > 1000) { upd(r.id, { err: 'fee_too_high' }); continue; }
      const s = w.sign(f);
      if (!r.booked) { Guard.book(r.drops); Guard.bookAddr(r.dest, r.drops); }
      upd(r.id, { status: 'submitted', hash: s.hash, lls: f.LastLedgerSequence, attempts: r.attempts + 1, booked: 1, err: null });   // persisted BEFORE submit
      Guard.log('payq-submit', { id: r.id, to: r.dest, drops: r.drops, hash: s.hash, lls: f.LastLedgerSequence });
      try { const x = await c.request({ command: 'submit', tx_blob: s.tx_blob }); log.push([r.id, 'submitted', x.result.engine_result]); }
      catch (e) { log.push([r.id, 'submit_error', e.message]); }   // stays 'submitted': reconciled by hash/LLS next tick
    }
    return { log };
  } finally { busy = false; }
}
function start(deps, ms = 15000) { const run = () => tick(deps).catch(e => console.error('payq', e.message)); setInterval(run, ms); setTimeout(run, 3000); }
module.exports = { enqueue, submitMatch, release, forMatch, forAcct, all, tick, start, get, hooks, ceilings, db };
