'use strict';
const crypto=require('node:crypto');
const {createEstatePrestigeStore}=require('./estate-prestige');
const {verifyEstateSalePayment}=require('./estate-sale-payment-verifier');
const MEMO='burncity/estates/cosmetic';
const hex=s=>Buffer.from(s).toString('hex').toUpperCase();
function createEstatePrestigeRuntime({db,pay,config,env=process.env,paused=()=>true,clock=Date.now}={}){
 const store=createEstatePrestigeStore(db);
 const configured=env.ESTATE_COSMETIC_UPGRADES_ENABLED==='1'&&config.DRY_RUN===false&&config.NETWORK==='mainnet'&&!!config.XUMM_KEY&&!!config.XUMM_SECRET&&/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(config.ESTATE_TREASURY||'');
 const enabled=()=>configured&&!paused();
 const gate=()=>!configured?{ok:false,error:'cosmetic_upgrades_disabled'}:paused()?{ok:false,error:'estate_treasury_paused'}:null;
 function quote(input){try{return {ok:true,...store.quote(input),upgradesEnabled:enabled()};}catch(e){if(e.message==='unknown_property')return {ok:false,error:'unknown_property'};throw e;}}
 async function start({propertyId,buyer}){
  const blocked=gate();if(blocked)return blocked;
  const now=clock();let r;try{r=store.reserve({propertyId,buyer,upgradeId:'cosmetic_'+crypto.randomBytes(20).toString('hex'),now});}catch(e){if(['property_owner_required','property_at_max_prestige','upgrade_requires_review'].includes(e.message))return {ok:false,error:e.message};throw e;}
  if(r.expires_at-now<60000)return {ok:false,error:'upgrade_expired_requires_review',upgradeId:r.upgrade_id};
  const sdk=pay.sdk();
  if(r.payload_uuid){const p=await sdk.payload.get(r.payload_uuid);return {ok:true,upgradeId:r.upgrade_id,deeplink:p?.next?.always,reused:true};}
  // Persist a single creation claim across workers/restarts. An ambiguous remote
  // failure stays held rather than issuing a second payable request.
  const claim=db.prepare("UPDATE estate_cosmetic_upgrades SET payload_state='creating' WHERE upgrade_id=? AND payload_state='none'").run(r.upgrade_id);
  if(claim.changes!==1)return {ok:false,error:'upgrade_payload_pending',upgradeId:r.upgrade_id};
  try{
   const p=await sdk.payload.create({txjson:{TransactionType:'Payment',Account:buyer,Destination:config.ESTATE_TREASURY,Amount:String(r.price_drops),
    Memos:[{Memo:{MemoType:hex(MEMO),MemoData:hex(r.upgrade_id)}}]},options:{submit:true,expire:Math.max(1,Math.floor((r.expires_at-clock())/60000))},
    custom_meta:{identifier:r.upgrade_id,instruction:'BURN City cosmetic property upgrade. Changes appearance only; reward shares stay the same.'}});
   if(typeof p?.uuid!=='string'||!p.uuid||typeof p?.next?.always!=='string')throw new Error('upgrade_payload_incomplete');
   db.prepare("UPDATE estate_cosmetic_upgrades SET payload_state='bound',payload_uuid=? WHERE upgrade_id=? AND payload_state='creating'").run(p.uuid,r.upgrade_id);
   if(clock()>=r.expires_at)return {ok:false,error:'upgrade_expired_requires_review',upgradeId:r.upgrade_id};
   if(store.owner.get(r.property_id)?.acct!==buyer)return {ok:false,error:'property_owner_changed',upgradeId:r.upgrade_id};
   if(paused())return {ok:false,error:'estate_treasury_paused',upgradeId:r.upgrade_id};
   return {ok:true,upgradeId:r.upgrade_id,deeplink:p.next.always};
  }catch(e){return {ok:false,error:'upgrade_payload_requires_review',upgradeId:r.upgrade_id};}
 }
 async function confirm({upgradeId,buyer}){
  if(!configured)return {ok:false,error:'cosmetic_upgrades_disabled'};
  const r=store.get(upgradeId);if(!r||r.buyer!==buyer)return {ok:false,error:'upgrade_not_found'};
  if(r.status==='settled')return {ok:true,appearance:store.state(r.property_id),alreadySettled:true};
  if(store.owner.get(r.property_id)?.acct!==buyer)return {ok:false,error:'property_owner_changed'};
  if(!r.payload_uuid)return {ok:false,pending:true,error:'upgrade_payload_pending'};
  const p=await pay.sdk().payload.get(r.payload_uuid);
  const hash=p?.response?.txid;
  if(p?.meta?.signed!==true||p?.response?.account!==buyer||typeof hash!=='string'||!/^[a-fA-F0-9]{64}$/.test(hash))return {ok:false,pending:true,error:'upgrade_payment_pending'};
  let proof;try{
   // Late reconciliation is allowed only for an actual payment inside the
   // original quote window. Reuse the exact validated-ledger checks; its memo
   // namespace is separate from property sales and all reward transactions.
   proof=await verifyEstateSalePayment(await pay.ledger(),{...r,reservation_id:r.upgrade_id},{txHash:hash,treasury:config.ESTATE_TREASURY,now:clock(),reviewExpired:clock()>r.expires_at,memoType:MEMO});
  }catch(e){if(e.message==='payment_not_validated_success'||e.data?.error==='txnNotFound')return {ok:false,pending:true,error:'upgrade_payment_pending'};throw e;}
  return {ok:true,appearance:store.settle({upgradeId,buyer,txHash:proof.txHash,ledgerIndex:proof.ledgerIndex})};
 }
 return {publicState:store.all,quote,start,confirm};
}
module.exports={createEstatePrestigeRuntime};
