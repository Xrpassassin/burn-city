// Shop ownership: SQLite, keyed by the signing wallet, ledger-verified, hash once, restart + new device + page-closed reconciliation.
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process'), xrpl = require('xrpl');
const phase = process.argv[2] || 'main', DIR = process.env.SIM_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'bcshop-'));
const T = process.env.SIM_T || xrpl.Wallet.generate().classicAddress;
Object.assign(process.env, { DATA_DIR: DIR, SIM_DIR: DIR, SIM_T: T, TREASURY_ADDRESS: T, XAMAN_API_KEY: 'sim', XAMAN_API_SECRET: 'sim', TOKEN_SECRET: 'simsecret' });
const Pay = require('../server/payments'), { items } = require('../server/shop');
const LF = path.join(DIR, 'ledger.json'), L = fs.existsSync(LF) ? JSON.parse(fs.readFileSync(LF)) : { txs: {}, payloads: {} }, save = () => fs.writeFileSync(LF, JSON.stringify(L));
Pay._ledger = async () => ({ request: async q => { const t = L.txs[q.transaction]; if (!t) throw new Error('txnNotFound'); return { result: t }; } });
Pay._sdk = () => ({ payload: { create: async () => { const uuid = 'u' + Math.random().toString(36).slice(2); return { uuid, refs: { qr_png: '' }, next: { always: '' } }; }, get: async u => L.payloads[u] ? { meta: { signed: true }, response: { txid: L.payloads[u] } } : { meta: { signed: false } } } });
const hex = s => Buffer.from(s).toString('hex').toUpperCase(); let n = +(process.env.SIM_N || 0);
function pay(acct, sid, drops, o = {}) { const h = (++n + (phase === 'main' ? 0 : 500)).toString(16).toUpperCase().padStart(64, 'C');
  L.txs[h] = { validated: o.validated ?? true, tx_json: { TransactionType: 'Payment', Account: acct, Destination: o.dest || T, Amount: String(drops), Memos: [{ Memo: { MemoType: hex('burncity/shop'), MemoData: hex(o.memo || sid) } }] }, meta: { TransactionResult: 'tesSUCCESS', delivered_amount: String(drops) } }; save(); return h; }
let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? '  PASS ' : '  FAIL ') + m); };
(async () => {
  if (phase === 'restart') {   // new process = server restart. Fresh browser = only a new sign-in token for the same wallet.
    const A = process.env.SIM_A, tok = Pay.sign({ acct: A, exp: Date.now() + 1e6 });
    console.log(JSON.stringify({ owned: Pay.owned(Pay.checkToken(tok).acct), pending: [...Pay.sessions.keys()] }));
    await Pay.sweepBuys(); console.log(JSON.stringify({ owned2: Pay.owned(A), again: (await Pay.sweepBuys(), Pay.owned(A)) })); process.exit(0);
  }
  const A = xrpl.Wallet.generate().classicAddress, B = xrpl.Wallet.generate().classicAddress, price = items.skin_ember.drops;
  console.log('Shop purchases');
  const s1 = Pay.newPurchase(A, 'skin_ember');
  ok((await Pay.verify(s1)).reason === 'no_tx', 'no payment -> not granted');
  ok((await Pay.verify(s1, pay(A, s1, price, { validated: false }))).reason === 'not_validated_yet', 'unvalidated -> not granted');
  ok((await Pay.verify(s1, pay(A, s1, price - 1))).reason === 'wrong_amount', 'short payment -> not granted');
  ok((await Pay.verify(s1, pay(B, s1, price))).reason === 'wrong_sender', 'paid by another wallet -> not granted');
  ok((await Pay.verify(s1, pay(A, s1, price, { memo: 'BCx' }))).reason === 'memo_mismatch', 'wrong memo -> not granted');
  ok(Pay.owned(A).length === 0, 'nothing owned yet');
  const h1 = pay(A, s1, price); const [v1, v2] = await Promise.all([Pay.verify(s1, h1), Pay.verify(s1, h1)]);
  ok(v1.ok && v2.ok && Pay.owned(A).join() === 'skin_ember', 'valid payment -> owned (concurrent verifies idempotent)');
  const s2 = Pay.newPurchase(B, 'trail_gold'); ok((await Pay.verify(s2, h1)).reason === 'replay', 'same hash cannot buy again for anyone');
  ok(Pay.sdb.prepare('SELECT acct FROM owned WHERE item=?').get('skin_ember').acct === A, 'stored in SQLite keyed by the signing wallet');
  // page closed mid-flow: XAMAN payload signed, browser never called /api/verify
  const s3 = Pay.newPurchase(A, 'flame_blue'); await Pay.createXamanPayload(s3); const u3 = Pay.sessions.get(s3).uuid; L.payloads[u3] = pay(A, s3, items.flame_blue.drops); save();
  console.log('Restart + new device + server-side reconciliation');
  const out = cp.execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', __filename, 'restart'], { env: { ...process.env, SIM_A: A, SIM_N: String(n) } }).toString().trim().split('\n');
  const r1 = JSON.parse(out[0]), r2 = JSON.parse(out[1]);
  ok(r1.owned.includes('skin_ember'), 'after restart, a new sign-in on a new device sees owned items');
  ok(r1.pending.includes(s3), 'unfinished purchase session survived the restart');
  ok(r2.owned2.includes('flame_blue') && r2.again.filter(x => x === 'flame_blue').length === 1, 'page-closed payment granted by server sweep, once');
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
