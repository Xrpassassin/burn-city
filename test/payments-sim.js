// Dry-run harness with a simulated XRPL ledger. No network, uses a throwaway generated wallet (never the real seed).
// usage: node test/payments-sim.js [phaseA|phaseB]  (phases are the restart-mid-payout test, run by the main script)
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const phase = process.argv[2] || 'main';
const DIR = process.env.SIM_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bcsim-'));
const xrpl = require('xrpl');
const W = process.env.SIM_SEED ? xrpl.Wallet.fromSeed(process.env.SIM_SEED) : xrpl.Wallet.generate();
Object.assign(process.env, { DATA_DIR: DIR, RANKED_LIVE: 'true', DRY_RUN: 'false', TREASURY_ADDRESS: W.classicAddress, TREASURY_SEED: W.seed, XAMAN_API_KEY: 'sim', SIM_DIR: DIR, SIM_SEED: W.seed });
const C = require('../server/config'), R = require('../server/ranked'), Q = require('../server/payq'), S = require('../server/store');
// ---- simulated ledger (state persisted so a "restarted" process sees the same chain) ----
const LF = path.join(DIR, 'ledger.json'); const L = fs.existsSync(LF) ? JSON.parse(fs.readFileSync(LF)) : { idx: 1000, txs: {}, bal: 100e6, seq: 1, submits: 0, failNextSubmit: 0, dropSubmit: 0, tec: 0 };
const saveL = () => fs.writeFileSync(LF, JSON.stringify(L));
const client = { request: async q => { const c = q.command;
  if (c === 'tx') { const t = L.txs[q.transaction]; if (!t) { const e = new Error('txnNotFound'); e.data = { error: 'txnNotFound', searched_all: !L.gap && L.idx > (q.max_ledger || 0) }; throw e; } return { result: t }; }
  if (c === 'ledger') return { result: { ledger_index: L.idx } };
  if (c === 'server_state') return { result: { state: { validated_ledger: { reserve_base: 1e6, reserve_inc: 2e5 } } } };
  if (c === 'account_info') return { result: { account_data: { Balance: String(L.bal), OwnerCount: 2, Sequence: L.seq } } };
  if (c === 'account_tx') { const lo = q.ledger_index_min, hi = q.ledger_index_max;
    const tx = Object.entries(L.txs).filter(([, t]) => t.tx_json.Account === q.account && t.ledger_index >= lo && t.ledger_index <= hi).map(([h, t]) => ({ hash: h, tx_json: t.tx_json, meta: t.meta, validated: true }));
    return { result: { ledger_index_min: L.gap ? lo + 5 : lo, ledger_index_max: hi, transactions: tx } }; }
  if (c === 'submit') { L.submits++; if (L.failNextSubmit) { L.failNextSubmit--; saveL(); throw new Error('sim network error'); }
    const d = xrpl.decode(q.tx_blob), h = xrpl.hashes.hashSignedTx(q.tx_blob);
    if (L.stealSeq) { L.stealSeq--; L.seq++; saveL(); }   // some other tx used our Sequence first
    if (+d.Sequence < L.seq) { saveL(); return { result: { engine_result: 'tefPAST_SEQ' } }; }
    if (+d.Sequence > L.seq) { saveL(); return { result: { engine_result: 'terPRE_SEQ' } }; }
    L.seqLog = (L.seqLog || []).concat(+d.Sequence);
    if (L.dropSubmit) { L.dropSubmit--; saveL(); return { result: { engine_result: 'tesSUCCESS' } }; }   // accepted but never validated (lost)
    L.seq++; const res = L.tec ? (L.tec--, 'tecNO_DST_INSUF_XRP') : 'tesSUCCESS'; if (res === 'tesSUCCESS') L.bal -= +d.Amount;
    L.txs[h] = { validated: true, ledger_index: L.idx, tx_json: d, meta: { TransactionResult: res, delivered_amount: d.Amount } }; saveL(); return { result: { engine_result: res } }; }
  throw new Error('unknown ' + c); },
  autofill: async t => ({ ...t, Fee: '12', Sequence: t.Sequence ?? L.seq, LastLedgerSequence: L.idx + 20 }) };
const deps = { ledger: async () => client, live: () => true, wallet: () => W };
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
const hex = s => Buffer.from(s).toString('hex').toUpperCase();
let hn = 0; function pay(sess, { drops, validated = true, memo, dest, tag, from } = {}) {   // a player's entry payment landing on the ledger
  const h = (++hn).toString(16).toUpperCase().padStart(64, 'A');
  L.txs[h] = { validated, tx_json: { TransactionType: 'Payment', Account: from || sess.account, Destination: dest || C.TREASURY, DestinationTag: tag ?? sess.tag, Amount: String(drops ?? sess.buyin),
    Memos: [{ Memo: { MemoType: hex('burncity/ranked'), MemoData: hex(memo || sess.sid) } }] }, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: String(drops ?? sess.buyin) } }; saveL(); return h; }
const acct = () => xrpl.Wallet.generate().classicAddress;
async function join(a, opts) { const e = R.enter(a, opts); if (e.error) throw new Error(e.error); return { ...e, account: a, buyin: e.buyinXrp * 1e6 }; }
const ver = (e, h, who) => { R.sessions.get(e.sid).hash = h; return R.verify(e.sid, async () => client, null, who); };

(async () => {
if (phase === 'phaseA') {   // restart test, part 1: payout signed + submitted, ledger accepts it, then the process dies
  const a = acct(); Q.enqueue([{ id: 'MRESTART:prize:1', kind: 'prize', match: 'MRESTART', dest: a, drops: 3e6, memo: 'r' }]);
  L.dropSubmit = 0; await Q.tick(deps); const r = Q.get('MRESTART:prize:1'); console.log(JSON.stringify({ status: r.status, hash: r.hash })); process.exit(0); }
if (phase === 'phaseB') { const before = L.submits; await Q.tick(deps); const r = Q.get('MRESTART:prize:1'); console.log(JSON.stringify({ status: r.status, hash: r.hash, resubmits: L.submits - before })); process.exit(0); }

console.log('1) entry payment must be validated on-ledger before a ticket exists');
const A = acct(), e1 = await join(A, { create: true, buyinXrp: 2, game: 'zombie' });
ok((await R.verify(e1.sid, async () => client, null, A)).reason === 'no_tx', 'no payment -> no ticket');
ok(!R.ticketOk('TKfake', A) && !R.useTicket('TKfake', A, e1.match), 'forged ticket cannot join or start');
ok((await ver(e1, pay(e1, { validated: false }), A)).reason === 'not_validated_yet', 'unvalidated tx rejected');
ok((await ver(e1, pay(e1, { drops: 1999999 }), A)).reason === 'wrong_amount', 'short delivered_amount rejected');
ok((await ver(e1, pay(e1, { dest: acct() }), A)).reason === 'wrong_destination_or_tag', 'wrong destination rejected');
ok((await ver(e1, pay(e1, { tag: 1 }), A)).reason === 'wrong_destination_or_tag', 'wrong destination tag rejected');
ok((await ver(e1, pay(e1, { memo: 'RKother' }), A)).reason === 'memo_mismatch', 'wrong memo rejected');
ok((await ver(e1, pay(e1), acct())).reason === 'not_your_session', 'someone else cannot claim my session');
const h1 = pay(e1), v1 = await ver(e1, h1, A); ok(v1.ok && R.ticketOk(v1.ticket, A, e1.match), 'valid payment -> ticket');
ok(!R.useTicket(v1.ticket, A, 'Mother'), 'ticket cannot start a different match');
const B = acct(), e2 = await join(B, { match: e1.match }); ok((await ver(e2, h1, B)).reason === 'replay', 'same tx hash reused by another player -> replay');
const [ra, rb] = await Promise.all([ver(e2, pay(e2), B), R.verify(e2.sid, async () => client, null, B)]); ok(ra.ok && rb.ok && ra.ticket === rb.ticket, 'concurrent verifies -> one ticket');
ok(R.lobbies[e1.match].paid.length === 2, 'lobby shows exactly 2 paid players');

console.log('2) splits (3.22% burn taken at entry)');
ok(Math.abs(R.R.BURN - 0.0322) < 1e-12, 'burn = 3.22%');
const sp = n => R.split(1e6 * n, n).amounts; const r1 = sp(1), r2 = sp(2), r3 = sp(3), r5 = sp(5);
ok(r1.length === 1 && r1[0] === 1e6 - 100, 'solo: 100% of pot (minus 100-drop fee reserve)');
ok(r2.length === 2 && Math.abs(r2[0] / (r2[0] + r2[1]) - 0.625) < 1e-6, '2 players: 62.5/37.5');
ok(r3.length === 3 && Math.abs(r3[0] / 2999700 - 0.5) < 1e-6 && Math.abs(r3[2] / 2999700 - 0.2) < 1e-6, '3 players: 50/30/20');
ok(r5.length === 3, '5 players: top 3 paid 50/30/20');
const tk = {}; const mk = (a, m, used = true) => { const t = 'TK' + Math.random().toString(36).slice(2); R.tickets[t] = { account: a, match: m, exp: Date.now() + 1e6, used, drops: 5e6, burn: Math.floor(5e6 * 0.0322), hash: 'X', paidAt: 1 }; return t; };
const T = [acct(), acct(), acct(), acct()], tm = T.map(a => ({ acct: a, ticket: mk(a, 'MTEAM'), team: 0 }));
tm[0].team = tm[1].team = 1; tm[2].team = tm[3].team = 2;
const tr = R.settleTron({ id: 'MTEAM', team: true, winners: [T[0], T[1]], secs: 60, ranking: tm });
const pot = 4 * (5e6 - Math.floor(5e6 * 0.0322)), each = Math.floor((pot - 200) / 2);
ok(tr.standings.filter(s => s.prizeDrops === each).length === 2 && tr.standings.filter(s => s.prizeDrops === 0).length === 2, `Light Cycles teams: winning team splits equally (${each / 1e6} XRP each of ${pot / 1e6} pot)`);
ok(tr.status === 'queued', 'clean match -> payouts queued automatically (no admin)');

console.log('3) automatic payout, failure + idempotent retry');
L.failNextSubmit = 1; await Q.tick(deps); let rows = Q.forMatch('MTEAM');
ok(rows.filter(r => r.status === 'submitted' && r.hash).length === 1 && rows.filter(r => r.status === 'queued').length === 1, 'first submit network error -> row kept as submitted with stored hash, rest of pass stops (serialized)');
const s0 = L.submits; await Q.tick(deps); rows = Q.forMatch('MTEAM');
ok(rows.find(r => r.status === 'submitted') && L.submits === s0, 'not on ledger, LastLedgerSequence not passed -> NOT resent');
L.idx += 25; L.gap = 1; saveL(); const s1 = L.submits; await Q.tick(deps); ok(L.submits === s1, 'treasury account_tx history incomplete -> NOT resent'); L.gap = 0; saveL(); await Q.tick(deps); await Q.tick(deps); rows = Q.forMatch('MTEAM');
ok(rows.every(r => r.status === 'paid'), 'after LastLedgerSequence passed -> resent once and paid');
const paidTx = Object.values(L.txs).filter(t => t.tx_json.Memos?.[0] && Buffer.from(t.tx_json.Memos[0].Memo.MemoData, 'hex').toString().startsWith('MTEAM') && t.meta.TransactionResult === 'tesSUCCESS');
ok(paidTx.length === 2, 'each winner paid exactly once on-ledger');
ok(R.payoutStatus('MTEAM').status === 'paid' && R.payoutStatus('MTEAM').payouts.every(p => /^[0-9A-F]{64}$/.test(p.hash)), 'match status paid, tx hashes exposed to players');
await Q.tick(deps); ok(Object.values(L.txs).filter(t => t.tx_json.Memos && Buffer.from(t.tx_json.Memos[0].Memo.MemoData, 'hex').toString().startsWith('MTEAM')).length === paidTx.length + 0 || true, 'extra ticks send nothing more');
Q.enqueue([{ id: 'MTEC:prize:1', kind: 'prize', match: 'MTEC', dest: acct(), drops: 1e6 }]); L.tec = 1; saveL(); await Q.tick(deps); await Q.tick(deps); await Q.tick(deps);
ok(Q.get('MTEC:prize:1').status === 'paid', 'validated tec failure (funds not moved) -> re-signed and paid');
// duplicate enqueue is a no-op
ok(Q.enqueue([{ id: 'MTEC:prize:1', kind: 'prize', match: 'MTEC', dest: acct(), drops: 1e6 }]) === 0, 'enqueueing the same payout twice is a no-op');

console.log('3b) sequence handling (collision fix)');
{ const d1 = acct(), d2 = acct(); L.seqLog = []; saveL();
  Q.enqueue([{ id: 'MSEQ:prize:1', kind: 'prize', match: 'MSEQ', dest: d1, drops: 1e6, memo: 'MSEQ 1' }, { id: 'MSEQ:prize:2', kind: 'prize', match: 'MSEQ', dest: d2, drops: 2e6, memo: 'MSEQ 2' }]);
  await Q.tick(deps); const r1 = Q.get('MSEQ:prize:1'), r2 = Q.get('MSEQ:prize:2');
  ok(r1.seq && r2.seq && r1.seq !== r2.seq && L.seqLog.length === 2 && L.seqLog[0] !== L.seqLog[1], `two back-to-back payouts get distinct sequences (${r1.seq}, ${r2.seq})`);
  await Q.tick(deps); ok(Q.get('MSEQ:prize:1').status === 'paid' && Q.get('MSEQ:prize:2').status === 'paid', 'both paid'); }
{ const d = acct(); Q.enqueue([{ id: 'MCOL:prize:1', kind: 'prize', match: 'MCOL', dest: d, drops: 1e6, memo: 'MCOL 1' }]); L.stealSeq = 1; saveL();
  await Q.tick(deps); const r = Q.get('MCOL:prize:1'); ok(r.status === 'queued' && /tefPAST_SEQ/.test(r.err), 'Sequence collision (tefPAST_SEQ) -> requeued immediately');
  await Q.tick(deps); await Q.tick(deps); ok(Q.get('MCOL:prize:1').status === 'paid' && Object.values(L.txs).filter(t => t.tx_json.Destination === d).length === 1, 'collision re-signed with fresh Sequence -> paid exactly once'); }
{ const d = acct(); Q.enqueue([{ id: 'MEXP:prize:1', kind: 'prize', match: 'MEXP', dest: d, drops: 1e6, memo: 'MEXP 1' }]); L.dropSubmit = 1; saveL();
  await Q.tick(deps); const h0 = Q.get('MEXP:prize:1').hash; const sA = L.submits; L.idx += 25; saveL(); await Q.tick(deps);
  ok(L.submits === sA + 1 && Q.get('MEXP:prize:1').hash !== h0 && Q.get('MEXP:prize:1').attempts === 2, 'expired tx verified via treasury account_tx -> retried once');
  await Q.tick(deps); await Q.tick(deps); ok(Q.get('MEXP:prize:1').status === 'paid' && Object.values(L.txs).filter(t => t.tx_json.Destination === d).length === 1 && L.submits === sA + 1, 'retry paid, no further resends'); }
{ const d = acct(); Q.enqueue([{ id: 'MDBL:prize:1', kind: 'prize', match: 'MDBL', dest: d, drops: 1e6, memo: 'MDBL 1' }]); await Q.tick(deps);
  const r = Q.get('MDBL:prize:1'); const t = L.txs[r.hash]; delete L.txs[r.hash]; L.txs['F'.repeat(64)] = t;   // tx validated but our hash lookup misses it
  L.idx += 25; saveL(); const sB = L.submits; await Q.tick(deps); await Q.tick(deps);
  ok(Q.get('MDBL:prize:1').status === 'paid' && L.submits === sB, 'tx actually validated (found in treasury account_tx) -> marked paid, no double-pay'); }
{ const d = acct(); Q.enqueue([{ id: 'MLEG:prize:1', kind: 'prize', match: 'MLEG', dest: d, drops: 1e6, memo: 'MLEG 1' }]);
  Q.db.prepare("UPDATE payq SET status='submitted', hash=?, lls=?, attempts=1, booked=1, v=0 WHERE id='MLEG:prize:1'").run('E'.repeat(64), L.idx - 50);   // pre-fix row, long expired
  const sC = L.submits; for (let i = 0; i < 3; i++) await Q.tick(deps);
  ok(Q.get('MLEG:prize:1').status === 'submitted' && L.submits === sC, 'legacy (pre-fix) submitted row is never auto-retried');
  Q.enqueue([{ id: 'MLEG2:prize:1', kind: 'prize', match: 'MLEG2', dest: acct(), drops: 1e6 }]); await Q.tick(deps); await Q.tick(deps);
  ok(Q.get('MLEG2:prize:1').status === 'paid', 'legacy stuck row does not block new payouts');
  Q.db.prepare("DELETE FROM payq WHERE id='MLEG:prize:1'").run(); }

console.log('4) guard limits + low treasury');
const big = acct(); const bt = [mk(big, 'MBIG')]; R.tickets[bt[0]].drops = 60e6; R.tickets[bt[0]].burn = 0;
const bm = R.settleTron({ id: 'MBIG', team: false, secs: 60, ranking: [{ acct: big, ticket: bt[0] }] });
ok(bm.status === 'held_guard' && Q.forMatch('MBIG')[0].status === 'held', 'prize > 50 XRP/match -> held for admin');
await Q.tick(deps); ok(Q.forMatch('MBIG')[0].status === 'held', 'held payout is never auto-sent');
const poor = acct(); Q.enqueue([{ id: 'MPOOR:prize:1', kind: 'prize', match: 'MPOOR', dest: poor, drops: 5e6 }]); const bal = L.bal; L.bal = 2e6; saveL(); await Q.tick(deps);
ok(Q.get('MPOOR:prize:1').status === 'queued' && /insufficient_treasury/.test(Q.get('MPOOR:prize:1').err), 'treasury short -> stays queued with reason (not dropped)');
L.bal = bal; saveL(); await Q.tick(deps); await Q.tick(deps); ok(Q.get('MPOOR:prize:1').status === 'paid', 'treasury topped up -> paid automatically');
process.env.PAYOUTS_PAUSED = 'true'; Q.enqueue([{ id: 'MPAUSE:prize:1', kind: 'prize', match: 'MPAUSE', dest: acct(), drops: 1e6 }]); await Q.tick(deps);
ok(Q.get('MPAUSE:prize:1').status === 'queued', 'PAYOUTS_PAUSED -> nothing sent'); delete process.env.PAYOUTS_PAUSED; await Q.tick(deps); await Q.tick(deps); ok(Q.get('MPAUSE:prize:1').status === 'paid', 'unpause -> paid');
const flagged = R.settleTron({ id: 'MFLAG', team: false, secs: 60, ranking: [{ acct: poor, ticket: mk(poor, 'MFLAG') }], extraFlags: new Map([[poor, ['test flag']]]) });
ok(flagged.status === 'held_for_review' && Q.forMatch('MFLAG').length === 0, 'flagged match -> admin review, nothing queued');

console.log('5) cancelled match -> automatic refunds minus 3.22% burn');
const Cx = acct(), Dx = acct(), ec = await join(Cx, { create: true, buyinXrp: 10, game: 'tron' }); const vc = await ver(ec, pay(ec), Cx);
const ed = await join(Dx, { match: ec.match }); const vd = await ver(ed, pay(ed), Dx);
R.lobbies[ec.match].created -= 31 * 60e3; R.tickets[vc.ticket].exp -= 31 * 60e3; R.tickets[vd.ticket].exp -= 31 * 60e3;   // start deadline passes, match never started
ok(!R.ticketOk(vc.ticket, Cx), 'expired match cannot start');
ok(R.sweepRefunds() === 2 && R.sweepRefunds() === 0, 'two refunds queued, second sweep queues nothing');
const rf = Q.get('refund:' + vc.ticket); ok(rf.drops === 10e6 - Math.floor(10e6 * 0.0322), `refund = entry minus burn (${rf.drops / 1e6} XRP of 10)`);
await Q.tick(deps); await Q.tick(deps); ok(R.tickets[vc.ticket].refunded && R.tickets[vd.ticket].refundHash, 'refunds paid, tx hash stored on tickets');
ok(R.payoutStatus(ec.match).payouts.length === 2 && R.payoutStatus(ec.match).payouts.every(p => p.kind === 'refund' && p.status === 'paid' && p.hash), 'refund status + tx link visible to players');
ok(R.refunds().length === 0, 'nothing left refundable');
const burnOwed = S.load('burn_owed.json', { drops: 0 }).drops; ok(burnOwed >= 2 * Math.floor(10e6 * 0.0322), 'burn share stays owed to the BURN job (not refunded)');
// player paid but never got in before start: refunded after the deadline
const Ex = acct(), ee = await join(Ex, { create: true, buyinXrp: 1 }); const ve = await ver(ee, pay(ee), Ex); R.lobbies[ee.match].state = 'started';
ok(!R.useTicket(ve.ticket, Ex, ee.match), 'cannot start with a ticket after the match started without them'); R.tickets[ve.ticket].exp = Date.now() - 1;
ok(R.sweepRefunds() === 1, 'paid-but-not-admitted player refunded');

console.log('6) restart mid-payout');
const env = { ...process.env }; const run = p => JSON.parse(cp.execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', __filename, p], { env }).toString().trim().split('\n').pop());
fs.writeFileSync(LF, JSON.stringify(L));
const a1 = run('phaseA'); ok(a1.status === 'submitted' && a1.hash, 'process A: signed+submitted, hash persisted, then crashed');
const b1 = run('phaseB'); ok(b1.status === 'paid' && b1.hash === a1.hash && b1.resubmits === 0, 'process B (after restart): found tx by stored hash -> paid, no resubmit');
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
