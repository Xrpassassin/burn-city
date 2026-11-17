'use strict';
// Estates allocation policy v4 (operator spec, Nov 15, 2026). OFF unless ESTATE_POLICY_V4_ENABLED=1.
//  - NEW purchases (settled after the v4 start snapshot) keep the 1% XRP operating reserve; the
//    principal is split 90% IMG/PLX, 5% IMG/XRP, 5% IMG/RLUSD (ESTATE_V4_*_BPS). A leg too small to
//    swap (< 2 x ESTATE_MIN_SWAP_DROPS) is folded into IMG/PLX and the fold is ledgered.
//  - IMG/PLX: XRP -> IMG (IMG/XRP AMM) and XRP -> PLX (PLX/XRP AMM), then a two-sided AMMDeposit.
//    IMG/XRP: XRP -> IMG for half, then a two-sided IMG + XRP AMMDeposit.
//    IMG/RLUSD: the existing monthly-plan deposit pipeline (estate_mp_deposits) for its 5% share.
//  - All three positions auto-compound: AMM fees stay in the pools, nothing is ever withdrawn
//    (the guard below has no AMMWithdraw case) and the monthly/daily fee harvest is skipped.
//  - Holders' income is Pollux's hourly IMG or XRP reward to IMG/PLX LPs (source r9DW7jqM...), recorded by
//    the existing validated-ledger scanner (estate-hourly-runtime.js) and allocated per hour by the
//    share units owned when each reward arrived. Each closed hour: ESTATE_POLLUX_BURN_BPS (default
//    322 = 3.22%) is reserved for batched IMG burns. Owners receive the balance in its incoming asset.
//    Amounts under ESTATE_POLLUX_DUST_IMG (default 0.05 IMG) or failing with tec carry forward.
const {N}=require('./estate-liquidity-ledger');
const IMG_PLX_POOL='rPDJ5BQxKQboHmaPEzy8n7D3RD5N7AwMiJ';
const IMG_XRP_POOL='rBcRRghoEuyvkUwL3DVaEJrcmPHf8DkTc6';
const PLX_ISSUER='rGLEgQdktoN4Be5thhk6seg1HifGPBxY5Q';
const POLLUX_SOURCE='r9DW7jqMXqa32TaTujSxdxcpwnPgJayG8V';
const TF_TWO_ASSET=0x00100000,TF_PARTIAL=0x00020000;
const DP=6;const fx=n=>new N(n).decimalPlaces(DP,N.ROUND_DOWN);
const int=(v,d,min,max)=>{if(v===undefined||v==='')return d;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_v4_setting');return n;};
function v4Config(env=process.env){
 const plxBps=int(env.ESTATE_V4_PLX_BPS,9000,0,10000),xrpBps=int(env.ESTATE_V4_XRP_BPS,500,0,10000),rlusdBps=int(env.ESTATE_V4_RLUSD_BPS,500,0,10000);
 if(plxBps+xrpBps+rlusdBps!==10000)throw Error('invalid_v4_setting');
 const dust=env.ESTATE_POLLUX_DUST_IMG||'0.05';if(!/^\d+(\.\d{1,6})?$/.test(dust))throw Error('invalid_v4_setting');
 const pool=env.ESTATE_IMG_PLX_POOL_ACCOUNT||'';
 const payoutAsset=env.ESTATE_POLLUX_PAYOUT_ASSET||'native';if(!['native','img'].includes(payoutAsset))throw Error('invalid_v4_setting');
 return Object.freeze({
  enabled:env.ESTATE_POLICY_V4_ENABLED==='1',
  plxBps,xrpBps,rlusdBps,
  imgPlxPool:pool,poolOk:pool===IMG_PLX_POOL,plxIssuer:env.PLX_ISSUER||PLX_ISSUER,plxCurrency:'PLX',
  polluxPayoutsEnabled:env.ESTATE_POLLUX_PAYOUTS_ENABLED==='1',
  burnBps:int(env.ESTATE_POLLUX_BURN_BPS,322,0,2000),
  dustImg:dust,
  maxPayoutsPerRun:int(env.ESTATE_POLLUX_MAX_PAYOUTS_PER_RUN,60,1,500),
  // Pollux XRP rewards (LP minimum / thin-inventory fallback): 'native' pays owners in XRP (#646),
  // 'img' converts the batch to IMG and pays IMG. Holder 'base' rewards on the LP's PLX are opt-in.
  polluxPayoutAsset:payoutAsset,
  polluxIncludeHolderBase:env.ESTATE_POLLUX_INCLUDE_HOLDER_BASE==='1',
  polluxBatchHours:int(env.ESTATE_POLLUX_BATCH_HOURS,payoutAsset==='img'?24:0,0,24*31),
  polluxMinPayoutDrops:int(env.ESTATE_POLLUX_MIN_PAYOUT_DROPS,1000,100,100000000),
 });
}
// Principal (XRP drops after the operating reserve) -> three legs. Integer drops, exact sum.
function splitV4(principalDrops,cfg,minSwapDrops){
 const p=BigInt(principalDrops);if(p<=0n)throw Error('positive_principal_required');
 let xrp=p*BigInt(cfg.xrpBps)/10000n,rl=p*BigInt(cfg.rlusdBps)/10000n,plx=p-xrp-rl;const folded=[];
 const min=BigInt(minSwapDrops)*2n;
 if(xrp>0n&&xrp<min){plx+=xrp;folded.push('img-xrp');xrp=0n;}
 if(rl>0n&&rl<min){plx+=rl;folded.push('img-rlusd');rl=0n;}
 return {plxDrops:plx.toString(),xrpDrops:xrp.toString(),rlusdDrops:rl.toString(),folded};
}
// Pollux hour: burn burnBps of the IMG (in micro units), the rest pro rata by entitlement.
function splitPolluxHour({entitlements,burnBps}){
 let total=0n,net=0n;const pay=[];
 for(const e of entitlements){const u=BigInt(e.amount_units);if(u<=0n)continue;total+=u;const n=u*BigInt(10000-burnBps)/10000n;net+=n;pay.push({acct:e.owner,units:n});}
 return {totalUnits:total,burnUnits:total-net,payouts:pay};
}
const micro=u=>{u=BigInt(u);return (u/1000000n).toString()+'.'+(u%1000000n).toString().padStart(6,'0');};
// Every v4 transaction passes here before signing. No AMMWithdraw exists in v4 (auto-compound).
function assertSafeV4Transaction(tx,ctx){
 const fail=e=>{throw Error('unsafe_v4_tx:'+e);};
 if(!tx||tx.Account!==ctx.treasury)fail('account');
 if(tx.Destination&&[IMG_PLX_POOL,IMG_XRP_POOL,ctx.rlusdPool].includes(tx.Destination))fail('payment_to_amm_forbidden');
 const same=(a,b)=>a&&b&&typeof a==='object'&&a.currency===b.currency&&a.issuer===b.issuer;
 const img={currency:ctx.imgCurrency,issuer:ctx.imgIssuer},plx={currency:'PLX',issuer:ctx.plxIssuer};
 const isXrp=a=>a&&a.currency==='XRP'&&!a.issuer;
 const flags=Number(tx.Flags||0);
 switch(tx.TransactionType){
  case 'AMMDeposit':{
   const plxPair=(same(tx.Asset,img)&&same(tx.Asset2,plx))||(same(tx.Asset,plx)&&same(tx.Asset2,img));
   const xrpPair=(same(tx.Asset,img)&&isXrp(tx.Asset2))||(isXrp(tx.Asset)&&same(tx.Asset2,img));
   if(!plxPair&&!xrpPair)fail('wrong_pool');
   if(flags!==TF_TWO_ASSET||tx.EPrice||tx.LPTokenOut)fail('two_sided_only');
   const amts=[tx.Amount,tx.Amount2];
   if(!amts.some(a=>same(a,img)&&+a.value>0))fail('two_sided_only');
   if(plxPair&&!amts.some(a=>same(a,plx)&&+a.value>0))fail('two_sided_only');
   if(xrpPair&&!amts.some(a=>typeof a==='string'&&/^[1-9]\d*$/.test(a)))fail('two_sided_only');
   return true;}
  case 'Payment':
   if(flags&TF_PARTIAL)fail('partial_payment_forbidden');
   if(tx.Destination===ctx.treasury){if(typeof tx.SendMax!=='string'||!(same(tx.Amount,img)||same(tx.Amount,plx)))fail('swap_shape');return true;}
   if(tx.Destination===ctx.imgIssuer){if(!same(tx.Amount,img)||tx.SendMax)fail('burn_shape');return true;}
   if(ctx.holders&&ctx.holders.has(tx.Destination)){if(tx.SendMax||!same(tx.Amount,img))fail('holder_payout_shape');return true;}
   return fail('destination_not_allowed');
  default:return fail('type_not_allowed');
 }
}
function createEstateV4Ledger(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_v4_program(id INTEGER PRIMARY KEY CHECK(id=1),started_ms INTEGER NOT NULL,plx_bps INTEGER NOT NULL,xrp_bps INTEGER NOT NULL,rlusd_bps INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_v4_splits(purchase_tx TEXT PRIMARY KEY,principal_drops TEXT NOT NULL,plx_drops TEXT NOT NULL,xrp_drops TEXT NOT NULL,rlusd_drops TEXT NOT NULL,
  folded_json TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_v4_deposits(id TEXT PRIMARY KEY,purchase_tx TEXT NOT NULL,pair TEXT NOT NULL CHECK(pair IN ('img-plx','img-xrp')),
  state TEXT NOT NULL CHECK(state IN ('queued','deposited')),xrp_drops TEXT NOT NULL,xrp_remaining_drops TEXT NOT NULL,
  held_img TEXT NOT NULL DEFAULT '0',held_plx TEXT NOT NULL DEFAULT '0',held_xrp_drops TEXT NOT NULL DEFAULT '0',
  img_in TEXT NOT NULL DEFAULT '0',counter_in TEXT NOT NULL DEFAULT '0',lp_out TEXT NOT NULL DEFAULT '0',
  chunk_json TEXT,note TEXT,created INTEGER NOT NULL,updated INTEGER NOT NULL,UNIQUE(purchase_tx,pair));
 CREATE TABLE IF NOT EXISTS estate_px_hours(epoch_start_ms INTEGER PRIMARY KEY,total_units TEXT NOT NULL,burn_units TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('split','paid')),created INTEGER NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS estate_px_payouts(epoch_start_ms INTEGER NOT NULL,acct TEXT NOT NULL,amount_units TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','paid','carried')),tx_hash TEXT,PRIMARY KEY(epoch_start_ms,acct));
 CREATE TABLE IF NOT EXISTS estate_px_carry(acct TEXT PRIMARY KEY,units TEXT NOT NULL,updated INTEGER NOT NULL);`);
 const now=()=>Date.now();
 return {
  program:()=>db.prepare('SELECT * FROM estate_v4_program WHERE id=1').get()||null,
  start(cfg,ms){db.prepare('INSERT OR IGNORE INTO estate_v4_program VALUES(1,?,?,?,?)').run(ms,cfg.plxBps,cfg.xrpBps,cfg.rlusdBps);},
  split:tx=>db.prepare('SELECT * FROM estate_v4_splits WHERE purchase_tx=?').get(tx)||null,
  queued:()=>db.prepare("SELECT * FROM estate_v4_deposits WHERE state='queued' ORDER BY created,id").all(),
  get:id=>db.prepare('SELECT * FROM estate_v4_deposits WHERE id=?').get(id),
  update(id,f){const k=Object.keys(f);db.prepare(`UPDATE estate_v4_deposits SET ${k.map(x=>x+'=?').join(',')},updated=? WHERE id=?`).run(...k.map(x=>f[x]),now(),id);},
  carry:a=>BigInt(db.prepare('SELECT units FROM estate_px_carry WHERE acct=?').get(a)?.units||'0'),
  setCarry(a,u){if(u>0n)db.prepare('INSERT INTO estate_px_carry VALUES(?,?,?) ON CONFLICT(acct) DO UPDATE SET units=excluded.units,updated=excluded.updated').run(a,u.toString(),now());else db.prepare('DELETE FROM estate_px_carry WHERE acct=?').run(a);},
  totals(){
   const s=(t,c,w='')=>db.prepare(`SELECT ${c} v FROM ${t} ${w}`).all().reduce((n,r)=>n.plus(r.v||'0'),new N(0)).toFixed();
   const su=(t,c,w='')=>db.prepare(`SELECT ${c} v FROM ${t} ${w}`).all().reduce((n,r)=>n+BigInt(r.v||'0'),0n);
   const hasTable=name=>db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name);
   const legacyBurned=hasTable('estate_mp_txs')?su('estate_px_hours h','burn_units',"WHERE EXISTS (SELECT 1 FROM estate_mp_txs t WHERE t.step='px:'||h.epoch_start_ms||':burn' AND t.state='validated')"):0n;
   const nativeBurns=hasTable('estate_pollux_burn_batches')?db.prepare("SELECT img_units FROM estate_pollux_burn_batches WHERE state='burned'").all():[];
   const burned=legacyBurned+nativeBurns.reduce((n,r)=>n+BigInt(r.img_units||'0'),0n);
   return {splits:db.prepare('SELECT COUNT(*) n FROM estate_v4_splits').get().n,
    xrpToImgPlx:su('estate_v4_splits','plx_drops').toString(),xrpToImgXrp:su('estate_v4_splits','xrp_drops').toString(),xrpToImgRlusd:su('estate_v4_splits','rlusd_drops').toString(),
    imgPlxLp:s('estate_v4_deposits','lp_out',"WHERE pair='img-plx'"),imgXrpLp:s('estate_v4_deposits','lp_out',"WHERE pair='img-xrp'"),
    queuedDeposits:db.prepare("SELECT COUNT(*) n FROM estate_v4_deposits WHERE state='queued'").get().n,
    polluxHours:db.prepare('SELECT COUNT(*) n FROM estate_px_hours').get().n,
    polluxImgReceived:micro(su('estate_px_hours','total_units')),polluxImgBurned:micro(burned),
    polluxImgPaid:micro(su('estate_px_payouts','amount_units',"WHERE state='paid'"))};
  },
 };
}
// XRP still waiting in v4 deposits is protected from game payouts (guard reserve).
function v4SpentXrpDrops(db){
 if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_v4_deposits'").get())return 0n;
 return db.prepare('SELECT xrp_drops,xrp_remaining_drops,held_xrp_drops FROM estate_v4_deposits').all().reduce((n,r)=>n+BigInt(r.xrp_drops)-BigInt(r.xrp_remaining_drops)-BigInt(r.held_xrp_drops),0n);
}
module.exports={IMG_PLX_POOL,IMG_XRP_POOL,PLX_ISSUER,POLLUX_SOURCE,v4Config,splitV4,splitPolluxHour,assertSafeV4Transaction,createEstateV4Ledger,v4SpentXrpDrops,micro,fx};
