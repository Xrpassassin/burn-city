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
// v2 rows (signed after the sequence fix) record their Sequence + the ledger they were signed at, so an expired tx can be
// proven dead from the treasury's own account_tx. Rows signed before the fix (v=0) are NEVER auto-resent: admin only.
for (const col of ['seq INTEGER', 'sub_ledger INTEGER', 'v INTEGER DEFAULT 0']) { try { db.exec('ALTER TABLE payq ADD COLUMN ' + col); } catch {} }
const V = 2;
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
function paid(r, hash) { upd(r.id, { status: 'paid', hash, err: null }); Guard.log('payq-paid', { id: r.id, to: r.dest, drops: r.drops, hash }); hooks.onPaid({ ...r, hash }); }
// After LastLedgerSequence: read the treasury's account_tx over [signed ledger, LLS]. Only a complete answer for that range counts.
// -> {paidHash} if a validated tesSUCCESS payment for this exact row (dest + amount + memo) exists (never pay twice),
//    {dead} if our tx is provably not in the range (its Sequence unused, or used by a different tx), else {why} = wait.
async function verifyExpired(c, r) {
  const lo = Math.max(1, (r.sub_ledger || r.lls - 40) - 1), hi = +r.lls, memo = hex(r.memo || r.id); let marker, seen = [];
  for (let page = 0; page < 10; page++) {
    let res; try { res = (await c.request({ command: 'account_tx', account: C.TREASURY, ledger_index_min: lo, ledger_index_max: hi, forward: true, limit: 200, ...(marker ? { marker } : {}) })).result; } catch { return { why: 'account_tx_failed' }; }
    if (+res.ledger_index_min > lo || +res.ledger_index_max < hi) return { why: 'history_incomplete' };
    seen = seen.concat(res.transactions || []); marker = res.marker; if (!marker) break;
  }
  if (marker) return { why: 'history_too_long' };
  for (const e of seen) { const tj = e.tx_json || e.tx || {}, h = e.hash || tj.hash, ok = e.meta?.TransactionResult === 'tesSUCCESS';
    if (!e.validated && e.validated !== undefined) continue;
    if (ok && tj.TransactionType === 'Payment' && tj.Destination === r.dest && String(tj.Amount) === String(r.drops) && (tj.Memos || []).some(m => m.Memo?.MemoData === memo)) return { paidHash: h }; }
  const same = seen.find(e => +((e.tx_json || e.tx || {}).Sequence) === +r.seq);
  if (same) { const h = same.hash || (same.tx_json || same.tx).hash; const res = same.meta?.TransactionResult; return h === r.hash ? (res === 'tesSUCCESS' ? { paidHash: h } : { dead: 'own_tx_' + res }) : { dead: 'sequence_used_by_' + String(h).slice(0, 8) }; }
  return { dead: 'sequence_unused' };
}
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
      let t = null; try { t = (await c.request({ command: 'tx', transaction: r.hash, min_ledger: Math.max(1, r.lls - 40), max_ledger: r.lls })).result; } catch {}
      if (t && t.validated) {
        const res = t.meta?.TransactionResult; db.prepare('INSERT INTO payq_hist VALUES(?,?,?,?)').run(r.id, Date.now(), r.hash, res);
        if (res === 'tesSUCCESS') { paid(r, r.hash); log.push([r.id, 'paid']); }
        else if ((r.v || 0) < V) { upd(r.id, { err: 'legacy_needs_admin:ledger_' + res }); log.push([r.id, 'legacy_hold']); }
        else { upd(r.id, { status: r.attempts >= 5 ? 'held' : 'queued', err: 'ledger_' + res }); log.push([r.id, 'retry_' + res]); }
      } else if ((r.v || 0) < V) log.push([r.id, 'legacy_waiting']);   // pre-fix row: never auto-resent (needs admin action)
      else if (+vl > +r.lls) {   // LastLedgerSequence passed: prove from the treasury's own history what happened to this Sequence
        const v = await verifyExpired(c, r);
        if (v.paidHash) { db.prepare('INSERT INTO payq_hist VALUES(?,?,?,?)').run(r.id, Date.now(), v.paidHash, 'tesSUCCESS'); paid(r, v.paidHash); log.push([r.id, 'paid_found']); }
        else if (v.dead) { upd(r.id, { status: r.attempts >= 5 ? 'held' : 'queued', err: 'expired_verified:' + v.dead }); log.push([r.id, 'retry_expired']); }
        else log.push([r.id, 'waiting_' + v.why]);
      } else log.push([r.id, 'waiting']);
    }
    // 2) sign + submit queued rows. Serialized: nothing new is signed while a v2 payment from an earlier pass is still in
    // flight. Sequence comes once per pass from the VALIDATED ledger (consistent across load-balanced servers) and is
    // incremented locally for each submit the network accepted -> back-to-back payouts never share a Sequence.
    if (Guard.paused()) return { paused: true, log };
    if (db.prepare(`SELECT 1 FROM payq WHERE status='submitted' AND v>=${V}`).get()) return { inflight: true, log };
    let seq = null;
    for (const r of db.prepare("SELECT * FROM payq WHERE status='queued' ORDER BY kind DESC, created").all()) {   // refunds first
      if (!r.booked && !r.override) { const bad = ceilings([r]); if (bad) { upd(r.id, { status: 'held', err: bad }); log.push([r.id, 'held']); continue; } }
      let sp; try { sp = await Guard.spendable(c, C.TREASURY); } catch { upd(r.id, { err: 'reserve_check_failed' }); break; }
      if (r.drops + 1000 > sp) { upd(r.id, { err: `insufficient_treasury (spendable ${Math.max(0, sp)} drops)` }); log.push([r.id, 'waiting_funds']); continue; }
      if (seq === null) { try { seq = +(await c.request({ command: 'account_info', account: C.TREASURY, ledger_index: 'validated' })).result.account_data.Sequence; } catch { upd(r.id, { err: 'sequence_fetch_failed' }); break; } if (!(seq > 0)) break; }
      let f; try { f = await c.autofill({ TransactionType: 'Payment', Account: C.TREASURY, Destination: r.dest, Amount: String(r.drops), Sequence: seq,
        Memos: [{ Memo: { MemoType: hex('burncity/' + r.kind), MemoData: hex(r.memo || r.id) } }] }); } catch (e) { upd(r.id, { err: 'autofill:' + e.message }); continue; }
      if (+f.Sequence !== seq) { upd(r.id, { err: 'sequence_mismatch' }); break; }
      if (+f.Fee > 1000) { upd(r.id, { err: 'fee_too_high' }); continue; }
      const s = w.sign(f);
      if (!r.booked) { Guard.book(r.drops); Guard.bookAddr(r.dest, r.drops); }
      upd(r.id, { status: 'submitted', hash: s.hash, lls: f.LastLedgerSequence, seq, sub_ledger: +vl, v: V, attempts: r.attempts + 1, booked: 1, err: null });   // persisted BEFORE submit
      Guard.log('payq-submit', { id: r.id, to: r.dest, drops: r.drops, hash: s.hash, lls: f.LastLedgerSequence, seq });
      let er; try { er = (await c.request({ command: 'submit', tx_blob: s.tx_blob })).result.engine_result; }
      catch (e) { log.push([r.id, 'submit_error', e.message]); break; }   // outcome unknown: stays 'submitted', reconciled by hash/LLS; stop this pass
      log.push([r.id, 'submitted', er]);
      if (er === 'tesSUCCESS' || er === 'terQUEUED' || /^tec/.test(er)) { seq++; continue; }   // Sequence consumed (or will be)
      if (er === 'tefPAST_SEQ' || /^tem/.test(er)) { upd(r.id, { status: 'queued', err: 'submit_' + er }); log.push([r.id, 'requeued_' + er]); break; }   // can never apply: re-sign next pass with a fresh Sequence
      break;   // anything else (terPRE_SEQ, tel*, ...) might still apply: leave 'submitted', verify after LastLedgerSequence
    }
    return { log };
  } finally { busy = false; }
}
function start(deps, ms = 15000) { const run = () => tick(deps).catch(e => console.error('payq', e.message)); setInterval(run, ms); setTimeout(run, 3000); }
module.exports = { enqueue, submitMatch, release, forMatch, forAcct, all, tick, start, get, hooks, ceilings, db };
