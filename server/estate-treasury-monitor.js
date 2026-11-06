'use strict';
// Read-only treasury monitoring snapshot for operators. Never writes, signs, funds or unpauses anything.
// Groups existing accounting tables into the dashboard sections and keeps principal and earnings in separate
// buckets so purchase principal is never presented as profit.
const SECTIONS=Object.freeze({
 deposits:['estate_capital_allocations','estate_treasury_transactions','estate_sale_intents'],
 pendingAllocations:['estate_liquidity_jobs','estate_img_reward_intents','estate_img_hourly_batches'],
 earnedRewards:['estate_img_earnings_evidence','estate_xrp_profit_receipts','estate_img_hourly_entitlements','estate_reward_carryovers'],
 distributions:['estate_hourly_payouts','estate_reward_settlements','estate_native_reward_settlements','estate_xrp_profit_payouts'],
 reconciliation:['estate_amm_accounting_events','estate_rlusd_withdrawal_proofs','estate_manual_pool_migrations','estate_late_payment_reviews']
});
const FAILURE=/fail|error|reject|review|mismatch|stuck|blocked/i;
const ident=n=>{if(!/^[a-z_][a-z0-9_]*$/.test(n))throw new Error('bad_identifier');return '"'+n+'"';};
function tableSummary(db,name){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))return null;
 const cols=db.prepare(`PRAGMA table_info(${ident(name)})`).all().map(c=>c.name);
 const out={rows:db.prepare(`SELECT COUNT(*) n FROM ${ident(name)}`).get().n};
 const statusCol=cols.find(c=>c==='status')||cols.find(c=>/_status$/.test(c));
 if(statusCol){out.byStatus={};for(const r of db.prepare(`SELECT ${ident(statusCol)} s,COUNT(*) n FROM ${ident(name)} GROUP BY 1`).all())out.byStatus[String(r.s)]=r.n;
  out.failures=Object.entries(out.byStatus).filter(([s])=>FAILURE.test(s)).reduce((a,[,n])=>a+n,0);}
 const sums={};for(const c of cols.filter(c=>/_drops$/.test(c)))sums[c]=String(db.prepare(`SELECT COALESCE(SUM(${ident(c)}),0) v FROM ${ident(name)}`).get().v);
 if(Object.keys(sums).length)out.sumsDrops=sums;
 return out;
}
function estateTreasuryMonitor(db,{status={}}={}){
 const sections={};let failures=0;
 for(const [k,tables] of Object.entries(SECTIONS)){sections[k]={};for(const t of tables){const s=tableSummary(db,t);if(s){sections[k][t]=s;failures+=s.failures||0;}}}
 return {asOfMs:Date.now(),readOnly:true,
  gates:{salesEnabled:!!status.salesEnabled,salesStatus:status.salesStatus||'unknown',distributionsEnabled:!!status.distributionsEnabled,imgRlusdFundingEnabled:!!status.imgRlusdFundingEnabled,
   activationBlocker:'Historical liquidity-custody reconciliation (#517) must be completed and approved before unpausing or accepting live payments.'},
  principalVsEarnings:'deposits = purchase principal (never profit); earnedRewards = verified realized earnings after fees/slippage only',
  failures,sections};
}
module.exports={estateTreasuryMonitor,SECTIONS};
