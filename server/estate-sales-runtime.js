'use strict';
const {createEstateReservationApi}=require('./estate-sale-reservation-api');
const {createEstateXamanPaymentSession}=require('./estate-sale-xaman-session');
const {createEstateSaleFinalization}=require('./estate-sale-finalization');
const {createEstateSaleSessionRecovery}=require('./estate-sale-session-recovery');
const {createEstateLatePaymentReconciliation}=require('./estate-sale-late-reconciliation');
const {createEstateCapitalAllocation,POLICY}=require('./estate-capital-allocation');
const {estatePurchaseQuote}=require('./estate-sale-quote');
// Explicit opt-in, using the existing Xaman SDK and XRPL connection. Incoming
// sales do not enable distributions or supply earnings to the reward ledger.
function createEstateSalesRuntime({db,pay,config,env=process.env,paused=()=>true}={}){
 const capital=createEstateCapitalAllocation(db);
 const configured=env.ESTATE_SALES_ENABLED==='1'&&config.DRY_RUN===false&&config.NETWORK==='mainnet'&&
  !!config.XUMM_KEY&&!!config.XUMM_SECRET&&/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(config.ESTATE_TREASURY||'');
 const options=configured?{enabled:true,sdk:pay.sdk(),treasury:config.ESTATE_TREASURY,
  client:{request:async q=>(await pay.ledger()).request(q)}}:{enabled:false};
 const reservations=createEstateReservationApi(db,{enabled:configured});
 const payments=createEstateXamanPaymentSession(db,options);
 const settlement=createEstateSaleFinalization(db,options);
 const recovery=createEstateSaleSessionRecovery(db);
 const late=createEstateLatePaymentReconciliation(db,options);
 const status=()=>({salesEnabled:configured&&!paused(),distributionsEnabled:false,
  salesStatus:!configured?'sales_not_enabled':paused()?'treasury_paused':'open',
  capitalAllocationPolicy:POLICY,rewardsGuaranteed:false,imgXrpProfitDistributionsEnabled:false,
  distributionSchedule:'hourly',payoutCurrencies:['IMG','XRP'],currency:'XRP',treasury:config.ESTATE_TREASURY});
 const blocked=()=>!configured?{ok:false,error:'estate_sales_disabled'}:paused()?{ok:false,error:'estate_treasury_paused'}:null;
 function reserve(input){return blocked()||reservations.create(input);}
 async function start(input){return blocked()||payments.start(input);}
 async function finalize(input){
  if(!configured)return {ok:false,error:'estate_sales_disabled'};
  // A pause blocks new money requests, but never prevents reconciliation of an
  // already-authorized incoming payment or replay of settled ownership.
  try{return await settlement.finalize(input);}catch(e){
   if(e.message==='payment_not_validated_success'||e.data?.error==='txnNotFound')return {ok:false,pending:true,error:'payment_pending_validation'};
   throw e;
  }
 }
 return {status,reserve,start,finalize,capitalState:capital.state,reservedCapitalDrops:capital.reservedDrops,inspectLate:late.inspect,
  recover:input=>({...recovery.get(input),salesEnabled:status().salesEnabled}),
  quote:input=>({...estatePurchaseQuote(db,input),...status()})};
}
module.exports={createEstateSalesRuntime};
