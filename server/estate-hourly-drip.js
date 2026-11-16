'use strict';
// Estates hourly holder drip (operator decision, Nov 15, 2026). OFF unless ESTATE_HOURLY_DRIP_ENABLED=1.
// Brings back the hourly payout to property holders, funded from the treasury's IMG/RLUSD LP:
//  - On the first enabled run the program snapshots a fixed LP budget:
//      budget = min(on-ledger treasury IMG/RLUSD LP x ESTATE_HOURLY_DRIP_BUDGET_BPS (default 90%),
//                   ESTATE_HOURLY_DRIP_MAX_LP (operator-approved hard cap; required)).
//    The rest (default 10%) stays in the pool as principal under the existing monthly/daily plan.
//  - Each UTC hour (key YYYY-MM-DDTHH) at most ONE slice is withdrawn: budget / ESTATE_HOURLY_DRIP_HOURS
//    (default 2160 h = 90 days; the last slice takes the remainder). A missed hour is NOT caught up;
//    the program simply runs longer, so a pause or outage never dumps a large withdrawal.
//  - The slice is a proportional AMMWithdraw (tfLPToken, both assets). ESTATE_HOURLY_BURN_BPS (default
//    322 = 3.22%) of the slice VALUE is burned in IMG (Payment to the IMG issuer). A proportional
//    withdrawal is equal value per side, so that is 2 x 3.22% = 6.44% of the IMG withdrawn.
//    100% of the remaining IMG and all RLUSD go to holders pro rata by current share_units
//    (snapshot at the split, like the monthly plan). Under-dust amounts and validated tec failures
//    (no trust line) carry forward per holder in estate_hd_carry.
//  - Bookkeeping: each drip withdrawal reduces the monthly plan's tracked LP and principal pro rata
//    to the start snapshot, so the daily/monthly fee harvest keeps working on what stays in the pool.
// Pure math + SQLite ledger here. Signing/submitting is in estate-monthly-executor.js (same single-flight
// tick, same estate_mp_txs journal that watch.js already treats as known treasury transactions).
const {N}=require('./estate-liquidity-ledger');
const DP=6;const fx=n=>new N(n).decimalPlaces(DP,N.ROUND_DOWN);
const LPDP=12;const lpfx=n=>new N(n).decimalPlaces(LPDP,N.ROUND_DOWN);
const int=(v,d,min,max)=>{if(v===undefined||v==='')return d;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_hourly_drip_setting');return n;};
function hdConfig(env=process.env){
 const dust=env.ESTATE_HOURLY_DUST_RLUSD||'0.01';
 if(!/^\d+(\.\d{1,6})?$/.test(dust))throw Error('invalid_hourly_drip_setting');
 const maxLp=env.ESTATE_HOURLY_DRIP_MAX_LP||'';
 if(maxLp&&!/^\d+(\.\d{1,15})?$/.test(maxLp))throw Error('invalid_hourly_drip_setting');
 return Object.freeze({
  enabled:env.ESTATE_HOURLY_DRIP_ENABLED==='1',
  budgetBps:int(env.ESTATE_HOURLY_DRIP_BUDGET_BPS,9000,1,10000),
  maxLp,                                                           // required to start (approval pin)
  hours:int(env.ESTATE_HOURLY_DRIP_HOURS,2160,24,87600),          // 90 days by default
  burnBps:int(env.ESTATE_HOURLY_BURN_BPS,322,0,2000),             // 3.22% of each payout's value, in IMG
  dust,
  maxPayoutsPerRun:int(env.ESTATE_HOURLY_MAX_PAYOUTS_PER_RUN,60,1,500),
 });
}
const hourKey=ms=>new Date(ms).toISOString().slice(0,13);
function budgetFor({onLedgerLp,budgetBps,maxLp}){
 if(!maxLp||!new N(maxLp).gt(0))throw Error('hourly_drip_max_lp_required');
 const share=lpfx(new N(onLedgerLp).times(budgetBps).div(10000));
 return lpfx(N.minimum(share,new N(maxLp))).toFixed();
}
// One slice per processed hour; never more than what is left of the budget.
function sliceLp({budgetLp,hours,withdrawnLp,slicesDone}){
 const left=new N(budgetLp).minus(withdrawnLp);
 if(!left.gt(0))return '0';
 if(slicesDone>=hours-1)return lpfx(left).toFixed();
 const s=lpfx(new N(budgetLp).div(hours));
 return lpfx(N.minimum(s,left)).toFixed();
}
// Burn burnBps of the slice VALUE, taken from the IMG side (equal value per side => 2x on IMG).
function splitSlice({img,rlusd,burnBps}){
 const i=fx(img),r=fx(rlusd);
 let burn=fx(i.times(2*burnBps).div(10000));if(burn.gt(i))burn=i;
 return {burnImg:burn.toFixed(),holdersImg:i.minus(burn).toFixed(),holdersRlusd:r.toFixed()};
}
// Pro-rata reduction of the monthly plan's tracked LP / principal for LP the drip has withdrawn.
function planAdjustment(program,withdrawnLp){
 if(!program||!new N(program.onledger_lp_at_start).gt(0))return {trackedLp:new N(0),principalK:new N(0)};
 const f=new N(withdrawnLp).div(program.onledger_lp_at_start);
 return {trackedLp:f.times(program.tracked_lp_at_start),principalK:f.times(program.principal_k_at_start)};
}
function createEstateHourlyDripLedger(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_hd_program(id INTEGER PRIMARY KEY CHECK(id=1),budget_lp TEXT NOT NULL,hours INTEGER NOT NULL,burn_bps INTEGER NOT NULL,
  budget_bps INTEGER NOT NULL,max_lp TEXT NOT NULL,onledger_lp_at_start TEXT NOT NULL,tracked_lp_at_start TEXT NOT NULL,principal_k_at_start TEXT NOT NULL,
  rlusd_per_img_at_start TEXT,started_ms INTEGER NOT NULL,completed_ms INTEGER);
 CREATE TABLE IF NOT EXISTS estate_hd_runs(hour TEXT PRIMARY KEY,slice INTEGER NOT NULL,state TEXT NOT NULL CHECK(state IN ('withdrawn','split','paid')),
  lp_in TEXT NOT NULL DEFAULT '0',img_out TEXT NOT NULL DEFAULT '0',rlusd_out TEXT NOT NULL DEFAULT '0',burn_img TEXT NOT NULL DEFAULT '0',
  split_json TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_hd_payouts(hour TEXT NOT NULL,acct TEXT NOT NULL,currency TEXT NOT NULL CHECK(currency IN ('IMG','RLUSD')),amount TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','paid','carried')),tx_hash TEXT,PRIMARY KEY(hour,acct,currency));
 CREATE TABLE IF NOT EXISTS estate_hd_carry(acct TEXT PRIMARY KEY,img TEXT NOT NULL,rlusd TEXT NOT NULL,updated INTEGER NOT NULL);`);
 const now=()=>Date.now();
 return {
  program:()=>db.prepare('SELECT * FROM estate_hd_program WHERE id=1').get()||null,
  start(p){db.prepare('INSERT INTO estate_hd_program(id,budget_lp,hours,burn_bps,budget_bps,max_lp,onledger_lp_at_start,tracked_lp_at_start,principal_k_at_start,rlusd_per_img_at_start,started_ms) VALUES(1,?,?,?,?,?,?,?,?,?,?)')
   .run(p.budgetLp,p.hours,p.burnBps,p.budgetBps,p.maxLp,p.onLedgerLp,p.trackedLp,p.principalK,p.rlusdPerImg||null,p.startedMs);},
  complete(ms){db.prepare('UPDATE estate_hd_program SET completed_ms=? WHERE id=1 AND completed_ms IS NULL').run(ms);},
  run:h=>db.prepare('SELECT * FROM estate_hd_runs WHERE hour=?').get(h)||null,
  open:()=>db.prepare("SELECT * FROM estate_hd_runs WHERE state IN ('withdrawn','split') ORDER BY hour").get()||null,
  withdrawnLp:()=>db.prepare('SELECT lp_in v FROM estate_hd_runs').all().reduce((n,r)=>n.plus(r.v||'0'),new N(0)).toFixed(),
  slicesDone:()=>db.prepare('SELECT COUNT(*) n FROM estate_hd_runs').get().n,
  totals(){const r=db.prepare('SELECT lp_in,img_out,rlusd_out,burn_img FROM estate_hd_runs').all();const s=k=>r.reduce((n,x)=>n.plus(x[k]||'0'),new N(0)).toFixed();
   const paid=c=>db.prepare("SELECT amount v FROM estate_hd_payouts WHERE state='paid' AND currency=?").all(c).reduce((n,x)=>n.plus(x.v),new N(0)).toFixed();
   return {lpWithdrawn:s('lp_in'),imgWithdrawn:s('img_out'),rlusdWithdrawn:s('rlusd_out'),imgBurned:s('burn_img'),imgPaid:paid('IMG'),rlusdPaid:paid('RLUSD'),runs:r.length};},
  carry(){const o={};for(const r of db.prepare('SELECT * FROM estate_hd_carry').all())o[r.acct]={img:r.img,rlusd:r.rlusd};return o;},
  setCarry(c){db.exec('DELETE FROM estate_hd_carry');const s=db.prepare('INSERT INTO estate_hd_carry(acct,img,rlusd,updated) VALUES(?,?,?,?)');for(const [a,v] of Object.entries(c))if(new N(v.img).gt(0)||new N(v.rlusd).gt(0))s.run(a,v.img,v.rlusd,now());},
  hashes:()=>db.prepare("SELECT hash FROM estate_mp_txs WHERE step LIKE 'hd:%' AND hash IS NOT NULL").all().map(r=>r.hash),
 };
}
// Monthly-plan bookkeeping hook: zero unless a drip program exists.
function dripPlanAdjustment(db){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_hd_program'").get())return {trackedLp:new N(0),principalK:new N(0)};
 const p=db.prepare('SELECT * FROM estate_hd_program WHERE id=1').get();if(!p)return {trackedLp:new N(0),principalK:new N(0)};
 const w=db.prepare('SELECT lp_in v FROM estate_hd_runs').all().reduce((n,r)=>n.plus(r.v||'0'),new N(0));
 return planAdjustment(p,w);
}
module.exports={hdConfig,hourKey,budgetFor,sliceLp,splitSlice,planAdjustment,dripPlanAdjustment,createEstateHourlyDripLedger,fx,lpfx};
