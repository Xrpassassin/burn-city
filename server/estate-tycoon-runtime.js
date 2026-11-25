'use strict';
// Authenticated opt-in Xaman flow for tycoon upgrades. Nothing is signed here.
const crypto=require('node:crypto');
const {createEstateTycoonStore,cartKey,orderItems}=require('./estate-tycoon');
const {verifyEstateSalePayment}=require('./estate-sale-payment-verifier');
const MEMO='burncity/estates/tycoon';
const ABANDON_GRACE_MS=5*60000;
const hex=s=>Buffer.from(s,'utf8').toString('hex').toUpperCase();
// Xaman rejects custom_meta.identifier longer than 40 chars (HTTP 413). Order ids are
// 'tycoon_'+40 hex = 47 chars, so the payload identifier is just the 40 hex chars (lossless).
const xamanIdentifier=orderId=>String(orderId).replace(/^tycoon_/,'');
// Accept a JSON array or a comma-separated list (GET quote / older clients). Empty → null.
function parseItemIds(value){
 if(Array.isArray(value))return value.map(v=>String(v)).map(v=>v.trim()).filter(Boolean).slice(0,32);
 if(typeof value==='string'&&value.trim())return value.split(',').map(v=>v.trim()).filter(Boolean).slice(0,32);
 return null;
}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// One Payment for the exact total; the instruction lists what the single signature buys.
function instructionFor(r){
 let items;try{items=orderItems(r.item_id);}catch{items=[];}
 const what=items.length>1?items.length+' upgrades in one payment ('+items.map(i=>i.name+' '+i.priceXrp).join(', ')+' XRP)':'tycoon upgrade';
 return ('BURN City Estates '+what+'. Verify the XRP total and treasury address. Future payouts are not guaranteed.').slice(0,280);
}
const qrFor=uuid=>UUID.test(uuid||'')?'https://xumm.app/sign/'+uuid.toLowerCase()+'_q.png':null;
function createEstateTycoonRuntime({db,pay,config,env=process.env,paused=()=>true,clock=Date.now,onSettled=null}={}){
 const store=createEstateTycoonStore(db);
 const configured=env.ESTATE_TYCOON_UPGRADES_ENABLED==='1'&&config?.DRY_RUN===false&&config?.NETWORK==='mainnet'&&
  !!config?.XUMM_KEY&&!!config?.XUMM_SECRET&&/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(config?.ESTATE_TREASURY||'');
 const purchaseStatus=()=>!configured?'not_activated':paused()?'treasury_paused':'available';
 const enabled=()=>purchaseStatus()==='available';
 const gate=()=>!configured?{ok:false,error:'tycoon_purchases_disabled'}:paused()?{ok:false,error:'estate_treasury_paused'}:null;
 // A cart arrives as itemIds (2+ distinct catalogue ids for one property); it is priced and keyed
 // server-side. A single id (itemId or a one-element itemIds) keeps the original single-item flow.
 // HTTP clients should send a JSON array; a comma-separated string is also accepted so a missing
 // array (or a query-string quote) still opens one Payment instead of failing before reserve.
 const CLIENT_ERRORS=['unknown_property','unknown_upgrade_item','invalid_upgrade_cart'];
 const resolveItem=({itemId,itemIds})=>{const ids=parseItemIds(itemIds);return ids?cartKey(ids):itemId;};
 function quote({propertyId,buyer,itemId,itemIds}){
  try{return {ok:true,...store.quote({propertyId,buyer,itemId:resolveItem({itemId,itemIds})}),purchasesEnabled:enabled(),purchaseStatus:purchaseStatus()};}
  catch(e){if(CLIENT_ERRORS.includes(e.message))return {ok:false,error:e.message};throw e;}
 }
 // An expired request that was never paid would otherwise hold the property's single pending
 // slot forever. Release it only with positive evidence that nothing can still be paid:
 // either no Xaman payload was ever created, or Xaman reports it expired/cancelled unsigned.
 // 'creating' (ambiguous remote create) and anything signed stay held for manual review.
 async function releaseAbandoned(r){
  if(!r||r.status!=='reserved'||clock()<=r.expires_at+ABANDON_GRACE_MS)return false;
  let reason='payload_never_created';
  if(r.payload_state==='creating'){
   // An ambiguous create. Ask Xaman by our custom identifier: a definitive 404 proves no
   // payable request exists; a found payload is bound (if signed, confirm can settle it).
   const found=await lookupByIdentifier(r);
   if(found===undefined)return false;
   if(found){
    db.prepare("UPDATE estate_tycoon_orders SET payload_state='bound',payload_uuid=? WHERE order_id=? AND payload_state='creating'").run(found.meta.uuid,r.order_id);
    r={...r,payload_state:'bound',payload_uuid:found.meta.uuid};
   }else db.prepare("UPDATE estate_tycoon_orders SET payload_state='none' WHERE order_id=? AND payload_state='creating'").run(r.order_id);
   if(!found)r={...r,payload_state:'none'};
  }
  if(r.payload_state==='bound'){
   let p;try{p=await pay.sdk().payload.get(r.payload_uuid);}catch{return false;}
   const m=p?.meta||{};
   if(m.signed===true||p?.response?.txid)return false;
   if(!(m.expired===true||m.cancelled===true||(m.resolved===true&&m.signed===false)))return false;
   reason='payload_unsigned_expired';
  }else if(r.payload_state!=='none')return false;
  return store.voidAbandoned({orderId:r.order_id,now:clock(),graceMs:ABANDON_GRACE_MS,reason});
 }
 // undefined = unknown (network/other error: keep holding), null = definitively not found.
 async function lookupByIdentifier(r){
  try{const p=await pay.sdk().payload.get('ci/'+xamanIdentifier(r.order_id),true);
   return typeof p?.meta?.uuid==='string'&&p.meta.uuid?p:undefined;}
  catch(e){return /\bError code 404\b/.test(String(e?.message))?null:undefined;}
 }
 async function start({propertyId,buyer,itemId,itemIds}){
  const blocked=gate();if(blocked)return blocked;
  try{itemId=resolveItem({itemId,itemIds});}catch(e){if(CLIENT_ERRORS.includes(e.message))return {ok:false,error:e.message};throw e;}
  const held=store.pendingRow(propertyId);
  if(held&&held.buyer===buyer)await releaseAbandoned(held);
  let r;try{r=store.reserve({propertyId,buyer,itemId,orderId:'tycoon_'+crypto.randomBytes(20).toString('hex'),now:clock()});}
  catch(e){if(['property_owner_required','unknown_property','unknown_upgrade_item','invalid_upgrade_cart','upgrade_already_owned','upgrade_prerequisites_missing','upgrade_tier_restricted','another_upgrade_pending'].includes(e.message))return {ok:false,error:e.message};throw e;}
  if(clock()>r.expires_at-60000)return {ok:false,error:'tycoon_order_requires_review',orderId:r.order_id};
  if(r.payload_uuid){
   const p=await pay.sdk().payload.get(r.payload_uuid);
   if(typeof p?.next?.always!=='string')return {ok:false,error:'tycoon_order_requires_review',orderId:r.order_id};
   return {ok:true,orderId:r.order_id,deeplink:p.next.always,qr:qrFor(r.payload_uuid),reused:true};
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
   custom_meta:{identifier:xamanIdentifier(r.order_id),instruction:instructionFor(r)}});
   if(typeof p?.uuid!=='string'||!p.uuid||typeof p?.next?.always!=='string')throw Error('invalid_payload');
   db.prepare("UPDATE estate_tycoon_orders SET payload_state='bound',payload_uuid=? WHERE order_id=? AND payload_state='creating'").run(p.uuid,r.order_id);
   if(clock()>r.expires_at)return {ok:false,error:'tycoon_order_requires_review',orderId:r.order_id};
   if(store.quote({propertyId,buyer,itemId}).ownerAuthorized!==true)return {ok:false,error:'property_owner_changed',orderId:r.order_id};
   if(paused())return {ok:false,error:'estate_treasury_paused',orderId:r.order_id};
   return {ok:true,orderId:r.order_id,deeplink:p.next.always,qr:qrFor(p.uuid)};
  }catch(e){console.warn('[estate-tycoon] Xaman payload create failed for',xamanIdentifier(r.order_id)+':',String(e?.message||e).slice(0,160));return {ok:false,error:'tycoon_order_requires_review',orderId:r.order_id};}
 }
 async function confirm({orderId,buyer}){
  if(!configured)return {ok:false,error:'tycoon_purchases_disabled'};
  const r=store.get(orderId);
  if(!r||r.buyer!==buyer)return {ok:false,error:'tycoon_order_not_found'};
  if(r.status==='settled')return {ok:true,property:store.state(r.property_id),alreadySettled:true};
  if(!store.quote({propertyId:r.property_id,buyer,itemId:r.item_id}).ownerAuthorized)return {ok:false,error:'property_owner_changed'};
  if(!r.payload_uuid){
   if(await releaseAbandoned(r))return {ok:false,error:'tycoon_order_expired',released:true};
   return {ok:false,pending:true,error:'tycoon_payload_pending'};
  }
  const payload=await pay.sdk().payload.get(r.payload_uuid),hash=payload?.response?.txid;
  if(payload?.meta?.signed!==true||payload?.response?.account!==buyer||typeof hash!=='string'||!/^[a-fA-F0-9]{64}$/.test(hash)){
   if(await releaseAbandoned(r))return {ok:false,error:'tycoon_order_expired',released:true};
   return {ok:false,pending:true,error:'tycoon_payment_pending'};
  }
  let proof;try{
   proof=await verifyEstateSalePayment(await pay.ledger(),{...r,reservation_id:r.order_id,property_id:r.property_id},
    {txHash:hash,treasury:config.ESTATE_TREASURY,now:clock(),reviewExpired:clock()>r.expires_at,memoType:MEMO});
  }catch(e){
   if(e.message==='payment_not_validated_success'||e.data?.error==='txnNotFound')
    return {ok:false,pending:true,error:'tycoon_payment_pending'};
   throw e;
  }
  const property=store.settle({orderId,buyer,txHash:proof.txHash,ledgerIndex:proof.ledgerIndex,now:clock()});
  // Upgrade payouts (#664): hand the freshly settled upgrade to the estate capital service right away
  // (same instant kick as an estate purchase) instead of waiting up to 15 min for its next wake.
  // The kick only queues the idempotent route + 90/5/5 split keyed by the payment tx (DB only) and
  // schedules the single-flight deposit pass; it never sends anything itself. Fresh settles only.
  if(typeof onSettled==='function')setImmediate(()=>{try{onSettled({orderId,txHash:proof.txHash});}catch(e){console.error('[estate-tycoon] onSettled',e.message);}});
  return {ok:true,property};
 }
 return {publicState:store.publicState,portfolio:store.ownerPortfolio,quote,start,confirm,enabled,purchaseStatus,store};
}
module.exports={createEstateTycoonRuntime,xamanIdentifier,parseItemIds};
