'use strict';
const {createEstateReservationApi}=require('./estate-sale-reservation-api');
const {createEstateXamanPaymentSession}=require('./estate-sale-xaman-session');
const {createEstateSaleFinalization}=require('./estate-sale-finalization');
const {createEstateSaleSessionRecovery}=require('./estate-sale-session-recovery');
const {createEstateLatePaymentReconciliation}=require('./estate-sale-late-reconciliation');
const {createEstateCapitalAllocation,POLICY}=require('./estate-capital-allocation');
const {monthlyConfig}=require('./estate-monthly-config');
const {estatePurchaseQuote}=require('./estate-sale-quote');
const {purchaseTerms,confirmPurchaseTerms}=require('./estate-purchase-terms-gate');
// Explicit opt-in, using the existing Xaman SDK and XRPL connection. Incoming
// sales do not enable distributions or supply earnings to the reward ledger.
function createEstateSalesRuntime({db,pay,config,env=process.env,paused=()=>true,onSettled=null}={}){
 const capital=createEstateCapitalAllocation(db);
 const terms=purchaseTerms(env);
 // Creating new XRP requests needs all sale, legal, treasury and terms
 // gates. Recovering a previously-bound/signed request is a different,
 // narrower operation: disabling new sales must not strand validated funds.
 const settlementConfigured=config.DRY_RUN===false&&config.NETWORK==='mainnet'&&
  !!config.XUMM_KEY&&!!config.XUMM_SECRET&&
  /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(config.ESTATE_TREASURY||'');
 const configured=!!terms&&env.ESTATE_SALES_ENABLED==='1'&&settlementConfigured;
 const reservations=createEstateReservationApi(db,{enabled:configured});
 // No SDK initialization for a fully disabled, empty installation. Existing
 // server-bound Xaman payloads are the sole exception when new sales are off.
 const boundPayloadExists=!!db.prepare('SELECT 1 FROM estate_xaman_payment_payloads LIMIT 1').get();
 const recoveryConfigured=settlementConfigured&&(configured||boundPayloadExists);
 const settlementOptions=recoveryConfigured?{enabled:true,sdk:pay.sdk(),
  treasury:config.ESTATE_TREASURY,
  client:{request:async q=>(await pay.ledger()).request(q)}}:{enabled:false};
 const saleOptions=configured?{...settlementOptions,requiredTerms:terms}:{enabled:false};
 const payments=createEstateXamanPaymentSession(db,saleOptions);
 // These paths do not create a Xaman payload, nor trust a client tx hash.
 // They only inspect an existing server-bound payload and validated ledger tx.
 const settlement=createEstateSaleFinalization(db,settlementOptions);
 const recovery=createEstateSaleSessionRecovery(db);
 const late=createEstateLatePaymentReconciliation(db,settlementOptions);
 const harvestCadence=(()=>{try{return monthlyConfig(env).harvestCadence;}catch{return 'monthly';}})();
 const status=()=>({salesEnabled:configured&&!paused(),
  preexistingPaymentReconciliationAvailable:recoveryConfigured,
  distributionsEnabled:false,
  salesStatus:!configured?'sales_not_enabled':paused()?'treasury_paused':'open',
  purchaseTerms:terms?{version:terms.version,digest:terms.digest,url:terms.url}:null,
  capitalAllocationPolicy:{...POLICY,cadence:harvestCadence},rewardsGuaranteed:false,imgXrpProfitDistributionsEnabled:false,
  distributionSchedule:harvestCadence,payoutCurrencies:['IMG','RLUSD'],currency:'XRP',treasury:config.ESTATE_TREASURY});
 const blocked=()=>!configured?{ok:false,error:'estate_sales_disabled'}:paused()?{ok:false,error:'estate_treasury_paused'}:null;
 const buyerBlock=input=>input?.buyer===config.ESTATE_TREASURY?{ok:false,error:'estate_treasury_cannot_purchase'}:null;
 function reserve(input){
  const error=blocked()||buyerBlock(input);if(error)return error;
  if(!confirmPurchaseTerms(input,terms))return {ok:false,error:'purchase_terms_acceptance_required'};
  return reservations.create({...input,termsVersion:terms.version,termsDigest:terms.digest,acceptedAt:Date.now()});
 }
 async function start(input){
  const error=blocked()||buyerBlock(input);if(error)return error;
  const saved=db.prepare('SELECT terms_version,terms_digest,terms_accepted_at FROM estate_sale_reservations WHERE reservation_id=?').get(input?.reservationId||'');
  if(saved&&(saved.terms_version!==terms.version||saved.terms_digest!==terms.digest||
     !Number.isSafeInteger(saved.terms_accepted_at)||saved.terms_accepted_at<1))
   return {ok:false,error:'purchase_terms_acceptance_required'};
  return payments.start(input);
 }
 async function finalize(input){
  if(!recoveryConfigured)return {ok:false,error:'estate_sales_disabled'};
  // A pause, legal terms rotation, or disabled new sales must not block the
  // validated completion of an already-bound incoming XRP payment.
  // already-authorized incoming payment or replay of settled ownership.
  try{
   const result=await settlement.finalize(input);
   // Instant deposit: hand the newly settled purchase to the monthly plan without
   // blocking the HTTP response. Replays (already_settled) also re-kick harmlessly.
   if(result?.ok&&(result.status==='settled'||result.status==='already_settled')&&typeof onSettled==='function')
    setImmediate(()=>{try{onSettled(result);}catch(e){console.error('[estate-sales] onSettled',e.message);}});
   return result;
  }catch(e){
   if(e.message==='payment_not_validated_success'||e.data?.error==='txnNotFound')return {ok:false,pending:true,error:'payment_pending_validation'};
   throw e;
  }
 }
 return {status,reserve,start,finalize,capitalState:capital.state,reservedCapitalDrops:capital.reservedDrops,inspectLate:late.inspect,
  recover:input=>({...recovery.get(input),salesEnabled:status().salesEnabled}),
  quote:input=>buyerBlock(input)||({...estatePurchaseQuote(db,input),...status()})};
}
module.exports={createEstateSalesRuntime};
