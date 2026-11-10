'use strict';
// Authenticated opt-in Xaman flow for tycoon upgrades. Nothing is signed here.
const crypto=require('node:crypto');
const {createEstateTycoonStore}=require('./estate-tycoon');
const {verifyEstateSalePayment}=require('./estate-sale-payment-verifier');
const MEMO='burncity/estates/tycoon';
const hex=s=>Buffer.from(s,'utf8').toString('hex').toUpperCase();
function createEstateTycoonRuntime({db,pay,config,env=process.env,paused=()=>true,clock=Date.now}={}){
 const store=createEstateTycoonStore(db);
 const configured=env.ESTATE_TYCOON_UPGRADES_ENABLED==='1'&&config?.DRY_RUN===false&&config?.NETWORK==='mainnet'&&
  !!config?.XUMM_KEY&&!!config?.XUMM_SECRET&&/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(config?.ESTATE_TREASURY||'');
 const enabled=()=>configured&&!paused();
 const gate=()=>!configured?{ok:false,error:'tycoon_purchases_disabled'}:paused()?{ok:false,error:'estate_treasury_paused'}:null;
 function quote({propertyId,buyer,itemId}){
  try{return {ok:true,...store.quote({propertyId,buyer,itemId}),purchasesEnabled:enabled()};}
  catch(e){if(['unknown_property','unknown_upgrade_item'].includes(e.message))return {ok:false,error:e.message};throw e;}
 }
 async function start({propertyId,buyer,itemId}){
  const blocked=gate();if(blocked)return blocked;
  let r;try{r=store.reserve({propertyId,buyer,itemId,orderId:'tycoon_'+crypto.randomBytes(20).toString('hex'),now:clock()});}
  catch(e){if(['property_owner_required','unknown_property','unknown_upgrade_item','upgrade_already_owned','upgrade_prerequisites_missing','upgrade_tier_restricted','another_upgrade_pending'].includes(e.message))return {ok:false,error:e.message};throw e;}
  if(clock()>r.expires_at-60000)return {ok:false,error:'tycoon_order_requires_review',orderId:r.order_id};
  if(r.payload_uuid){
   const p=await pay.sdk().payload.get(r.payload_uuid);
   if(typeof p?.next?.always!=='string')return {ok:false,error:'tycoon_order_requires_review',orderId:r.order_id};
   return {ok:true,orderId:r.order_id,deeplink:p.next.always,reused:true};
  }
  // Persist creation claim before external call: ambiguous timeouts may have created a
  // payable payload; hold rather than creating duplicates.
  const claim=db.prepare("UPDATE estate_tycoon_orders SET payload_state='creating' WHERE order_id=? AND payload_state='none'").run(r.order_id);
  if(claim.changes!==1)return {ok:false,error:'tycoon_payload_pending',orderId:r.order_id};
  try{
   const p=await pay.sdk().payload.create({txjson:{
    TransactionType:'Payment',Account:buyer,Destination:config.ESTATE_TREASURY,Amount:String(r.price_drops),
    Memos:[{Memo:{MemoType:hex(MEMO),MemoData:hex(r.order_id)}}]
   },options:{submit:true,expire:Math.max(1,Math.floor((r.expires_at-clock())/60000))},
   custom_meta:{identifier:r.order_id,instruction:'BURN City Estates tycoon upgrade. Verify XRP price and treasury address. Shares recorded only; future payouts are not guaranteed.'}});
   if(typeof p?.uuid!=='string'||!p.uuid||typeof p?.next?.always!=='string')throw Error('invalid_payload');
   db.prepare("UPDATE estate_tycoon_orders SET payload_state='bound',payload_uuid=? WHERE order_id=? AND payload_state='creating'").run(p.uuid,r.order_id);
   if(clock()>r.expires_at)return {ok:false,error:'tycoon_order_requires_review',orderId:r.order_id};
   if(store.quote({propertyId,buyer,itemId}).ownerAuthorized!==true)return {ok:false,error:'property_owner_changed',orderId:r.order_id};
   if(paused())return {ok:false,error:'estate_treasury_paused',orderId:r.order_id};
   return {ok:true,orderId:r.order_id,deeplink:p.next.always};
  }catch{return {ok:false,error:'tycoon_order_requires_review',orderId:r.order_id};}
 }
 async function confirm({orderId,buyer}){
  if(!configured)return {ok:false,error:'tycoon_purchases_disabled'};
  const r=store.get(orderId);
  if(!r||r.buyer!==buyer)return {ok:false,error:'tycoon_order_not_found'};
  if(r.status==='settled')return {ok:true,property:store.state(r.property_id),alreadySettled:true};
  if(!store.quote({propertyId:r.property_id,buyer,itemId:r.item_id}).ownerAuthorized)return {ok:false,error:'property_owner_changed'};
  if(!r.payload_uuid)return {ok:false,pending:true,error:'tycoon_payload_pending'};
  const payload=await pay.sdk().payload.get(r.payload_uuid),hash=payload?.response?.txid;
  if(payload?.meta?.signed!==true||payload?.response?.account!==buyer||typeof hash!=='string'||!/^[a-fA-F0-9]{64}$/.test(hash))
   return {ok:false,pending:true,error:'tycoon_payment_pending'};
  let proof;try{
   proof=await verifyEstateSalePayment(await pay.ledger(),{...r,reservation_id:r.order_id,property_id:r.property_id},
    {txHash:hash,treasury:config.ESTATE_TREASURY,now:clock(),reviewExpired:clock()>r.expires_at,memoType:MEMO});
  }catch(e){
   if(e.message==='payment_not_validated_success'||e.data?.error==='txnNotFound')
    return {ok:false,pending:true,error:'tycoon_payment_pending'};
   throw e;
  }
  return {ok:true,property:store.settle({orderId,buyer,txHash:proof.txHash,ledgerIndex:proof.ledgerIndex,now:clock()})};
 }
 return {publicState:store.publicState,portfolio:store.ownerPortfolio,quote,start,confirm,enabled,store};
}
module.exports={createEstateTycoonRuntime};
