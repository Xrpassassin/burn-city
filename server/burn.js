// Batched burn: converts the owed 32.2% share (XRP) into BURN through the BURN/XRP AMM and delivers
// it to the BURN issuer in ONE cross-currency Payment — tokens delivered to their issuer are destroyed,
// so it shows up as a real burn in the city. DRY_RUN=true by default: builds+autofills, never submits.
const xrpl = require('xrpl'), C = require('./config'), S = require('./store');
const curHex = c => c.length === 3 ? c : c.length === 40 ? c : Buffer.from(c).toString('hex').toUpperCase().padEnd(40, '0');

async function quote(client, drops) {
  const BURN = { currency: curHex(C.BURN_CURRENCY), issuer: C.BURN_ISSUER };
  const a = (await client.request({ command: 'amm_info', asset: { currency: 'XRP' }, asset2: BURN })).result.amm;
  const x = +a.amount, y = +a.amount2.value, fee = a.trading_fee / 1e5, inn = drops * (1 - fee);
  return { BURN, out: y * inn / (x + inn), pool: { xrp: x / 1e6, burn: y, fee } };
}
async function run({ force = false } = {}) {
  const owed = S.load('burn_owed.json', { drops: 0 });
  if (owed.drops < C.BURN_MIN_DROPS && !force) return { skipped: 'below_threshold', owed: owed.drops };
  if (!C.TREASURY_SEED) throw new Error('TREASURY_SEED not set');
  const w = xrpl.Wallet.fromSeed(C.TREASURY_SEED);
  if (C.TREASURY && w.classicAddress !== C.TREASURY) throw new Error('seed does not match TREASURY_ADDRESS');
  const client = new xrpl.Client(C.XRPL_WSS); await client.connect();
  try {
    const drops = owed.drops, { BURN, out, pool } = await quote(client, drops);
    const fmt = v => (+v.toPrecision(15)).toString();
    const tx = await client.autofill({ TransactionType: 'Payment', Account: w.classicAddress, Destination: C.BURN_ISSUER,
      Amount: { ...BURN, value: fmt(out * 1.05) },           // upper bound; partial payment delivers what SendMax buys
      DeliverMin: { ...BURN, value: fmt(out * (1 - C.MAX_SLIPPAGE)) },
      SendMax: String(drops), Flags: xrpl.PaymentFlags.tfPartialPayment,
      Memos: [{ Memo: { MemoType: Buffer.from('burncity/burn').toString('hex').toUpperCase(), MemoData: Buffer.from(`game burn ${drops} drops`).toString('hex').toUpperCase() } }] });
    const rec = { t: new Date().toISOString(), network: C.NETWORK, xrpDrops: drops, expectedBurn: out, pool, dryRun: C.DRY_RUN };
    if (!C.DRY_RUN && require('./guard').paused()) { rec.blocked = 'payouts_paused'; return rec; }
    if (C.DRY_RUN) { rec.wouldSubmit = tx; S.append('burns.jsonl', rec); console.log('[DRY_RUN] burn', JSON.stringify(rec)); return rec; }
    const bad = await require('./guard').check(client, w.classicAddress, drops + 100); if (bad) { rec.blocked = bad; S.append('burns.jsonl', rec); return rec; }
    const r = await client.submitAndWait(w.sign(tx).tx_blob);
    rec.hash = r.result.hash; rec.result = r.result.meta.TransactionResult; rec.delivered = r.result.meta.delivered_amount;
    if (rec.result === 'tesSUCCESS') { owed.drops -= drops; S.save('burn_owed.json', owed); }
    require('./guard').log('burn', { hash: rec.hash, result: rec.result, drops }); S.append('burns.jsonl', rec); console.log('BURN TX', rec.hash, rec.result); return rec;   // public via GET /burns
  } finally { await client.disconnect(); }
}
module.exports = { run, quote, curHex };
if (require.main === module) run({ force: process.argv.includes('--force') }).then(r => { console.log(JSON.stringify(r, null, 1)); process.exit(0); }, e => { console.error(e.message); process.exit(1); });
