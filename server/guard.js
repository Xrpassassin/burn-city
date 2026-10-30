// Circuit breakers for every outgoing XRP payment from the treasury (prizes, burns).
// - reserve: after the payment the wallet keeps base reserve + owner reserve (trust lines / LP / offers) + a margin
// - per-match ceiling and rolling 24h ceiling for prize payouts
// Only XRP is ever sent by this server; IMG and LP tokens are never touched.
const S = require('./store'), E = process.env;
const G = { MATCH_MAX: +(E.PAYOUT_MAX_MATCH_DROPS || 50e6), DAY_MAX: +(E.PAYOUT_MAX_DAY_DROPS || 150e6), MARGIN: +(E.RESERVE_MARGIN_DROPS || 500000), ADDR_MAX: +(E.PAYOUT_MAX_ADDR_DAY_DROPS || 50e6), BUDGET: +(E.GAME_BUDGET_DROPS || 0) };
const paused = () => E.PAYOUTS_PAUSED === 'true' || S.load('pause.json', { paused: false }).paused === true;
const log = (kind, o) => { console.log(`[OUTGOING-TX] ${kind} ${JSON.stringify(o)}`); S.append('outgoing_tx.jsonl', { t: new Date().toISOString(), kind, ...o }); };
async function spendable(client, acct) {
  const [ai, ss] = await Promise.all([client.request({ command: 'account_info', account: acct, ledger_index: 'validated' }), client.request({ command: 'server_state' })]);
  const v = ss.result.state.validated_ledger, base = +v.reserve_base, inc = +v.reserve_inc, d = ai.result.account_data;
  const reserved=capitalReserveReader(acct);
  if(typeof reserved!=='string'||!/^\d+$/.test(reserved)||BigInt(reserved)>BigInt(Number.MAX_SAFE_INTEGER))throw Error('invalid_estate_capital_reserve');
  return +d.Balance - base - inc * (+d.OwnerCount || 0) - G.MARGIN - Number(reserved);
}
// Standalone guarded jobs share this protection even without server.js startup.
function readPersistedEstateCapital(acct){
 const C=require('./config');if(acct!==C.ESTATE_TREASURY)return '0';
 const fs=require('node:fs'),path=require('node:path'),file=path.join(C.DATA_DIR,'shop.db');
 if(!fs.existsSync(file))return '0';
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync(file,{readOnly:true});
 try{
  db.exec('PRAGMA query_only=ON; PRAGMA busy_timeout=1000');
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_capital_allocations'").get())return '0';
  return db.prepare('SELECT purchase_drops FROM estate_capital_allocations').all().reduce((sum,r)=>{
   if(typeof r.purchase_drops!=='string'||!/^\d+$/.test(r.purchase_drops))throw Error('invalid_estate_capital_reserve');
   return sum+BigInt(r.purchase_drops);
  },0n).toString();
 }finally{db.close();}
}
let capitalReserveReader=readPersistedEstateCapital;
function setEstateCapitalReserveReader(reader){if(typeof reader!=='function')throw Error('capital_reserve_reader_required');capitalReserveReader=reader;}
const dayKey = () => new Date().toISOString().slice(0, 10);
function dayUsed() { const d = S.load('payout_daily.json', {}); return d[dayKey()] || 0; }
function addrUsed(a) { return (S.load('payout_addr_daily.json', {})[dayKey()] || {})[a] || 0; }
function bookAddr(a, drops) { const d = S.load('payout_addr_daily.json', {}); const k = dayKey(); d[k] = d[k] || {}; d[k][a] = (d[k][a] || 0) + drops; S.save('payout_addr_daily.json', d); }
function book(drops) { const T = S.load('payout_total.json', { drops: 0 }); T.drops += drops; S.save('payout_total.json', T); const d = S.load('payout_daily.json', {}); d[dayKey()] = (d[dayKey()] || 0) + drops; S.save('payout_daily.json', d); }
async function check(client, acct, drops, { prize = false, payees = [] } = {}) {
  if (paused()) return 'payouts_paused';
  for (const [a, x] of payees) if (addrUsed(a) + x > G.ADDR_MAX) return 'exceeds_per_address_daily_ceiling:' + a;
  if (prize && drops > G.MATCH_MAX) return 'exceeds_per_match_ceiling';
  if (prize && dayUsed() + drops > G.DAY_MAX) return 'exceeds_daily_ceiling';
  let sp; try { sp = await spendable(client, acct); } catch (e) { return 'reserve_check_failed'; }   // fail closed
  if (G.BUDGET) sp = Math.min(sp, G.BUDGET - (S.load('payout_total.json', { drops: 0 }).drops)); if (drops > sp) return `would_break_reserve (spendable ${Math.max(0, sp)} drops)`;
  return null;
}
module.exports = { setEstateCapitalReserveReader, G, paused, log, bookAddr, check, book, dayUsed, spendable, addrUsedPub: addrUsed };
