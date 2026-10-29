// Treasury watchdog: any validated outgoing tx from the treasury that the payout queue or the burn job did not create
// => persistent auto-pause (data/pause.json) + loud log. Unpause only via POST /admin/unpause.
const fs = require('fs'), C = require('./config'), S = require('./store'), Q = require('./payq'), Guard = require('./guard');
function known() { const k = new Set(S.load('watch_known.json', []));
  for (const r of Q.db.prepare('SELECT hash FROM payq WHERE hash IS NOT NULL UNION SELECT hash FROM payq_hist').all()) k.add(r.hash);
  try { for (const l of fs.readFileSync(S.file('burns.jsonl'), 'utf8').split('\n')) { const h = l && JSON.parse(l).hash; if (h) k.add(h); } } catch {}
  try {const db=require('./payments').sdb;if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_hourly_payouts'").get())for(const r of db.prepare('SELECT tx_hash FROM estate_hourly_payouts WHERE tx_hash IS NOT NULL').all())k.add(r.tx_hash);}catch{}
  return k; }
async function tick(ledger) {
  if (!C.TREASURY) return; const c = await ledger();
  const r = await c.request({ command: 'account_tx', account: C.TREASURY, limit: 30, forward: false });
  const st = S.load('watch_state.json', null), k = known(), now = Date.now(), unknown = [];
  for (const x of r.result.transactions || []) { const tx = x.tx_json || x.tx, h = x.hash || tx?.hash; if (!x.validated || !tx || tx.Account !== C.TREASURY) continue;
    if (!st) { k.add(h); continue; }                                   // first run: baseline existing history
    const age = now - ((tx.date || 0) + 946684800) * 1000; if (!k.has(h) && age > 120e3) unknown.push({ hash: h, type: tx.TransactionType, to: tx.Destination, amount: tx.Amount }); }
  if (!st) { S.save('watch_known.json', [...k]); S.save('watch_state.json', { since: now }); return { baseline: k.size }; }
  if (unknown.length && !Guard.paused()) { S.save('pause.json', { paused: true, t: now, reason: 'unexpected_outgoing_tx', unknown });
    Guard.log('ALERT-unexpected-outgoing', { unknown }); console.error('[ALERT] treasury sent a tx not created by the game. Payouts paused.', JSON.stringify(unknown)); }
  return { unknown };
}
function start(ledger) { const run = () => tick(ledger).catch(e => console.error('watch', e.message)); setTimeout(run, 20e3); setInterval(run, 60e3); }
function unpause() { const k = new Set(S.load('watch_known.json', [])); for (const u of S.load('pause.json', {}).unknown || []) k.add(u.hash); S.save('watch_known.json', [...k]); S.save('pause.json', { paused: false, t: Date.now() }); return { ok: true }; }
module.exports = { tick, start, unpause };
