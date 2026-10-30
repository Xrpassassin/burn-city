'use strict';
// Purchase principal earmarks, not reward receipts. No signing or pool transfers.
const POLICY=Object.freeze({version:1,imgPlxBps:7000,imgXrpBps:3000,automaticDepositsEnabled:false});
const HASH=/^[A-F0-9]{64}$/;
function splitEstateCapital(drops){
 if(typeof drops!=='string'||!/^[1-9]\d*$/.test(drops))throw new TypeError('positive_purchase_drops_required');
 const total=BigInt(drops),plx=total*7000n/10000n;
 return Object.freeze({purchaseDrops:total.toString(),imgPlxDrops:plx.toString(),imgXrpDrops:(total-plx).toString()});
}
function createEstateCapitalAllocation(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_capital_allocations(
  purchase_tx TEXT PRIMARY KEY,property_id TEXT NOT NULL UNIQUE,buyer TEXT NOT NULL,
  purchase_drops TEXT NOT NULL,img_plx_drops TEXT NOT NULL,img_xrp_drops TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK(policy_version=1),
  state TEXT NOT NULL CHECK(state='awaiting_liquidity_execution'),created_at INTEGER NOT NULL
 );`);
 const get=db.prepare('SELECT * FROM estate_capital_allocations WHERE purchase_tx=?');
 // Called inside the verified ownership settlement transaction. All values come
 // from the just-persisted ownership, not from quote/client input.
 function record(ownership){
  const hash=ownership?.purchase_tx;
  if(!HASH.test(hash||''))throw Error('settled_purchase_required');
  const saved=db.prepare('SELECT * FROM estate_property_ownership WHERE purchase_tx=?').get(hash);
  if(!saved||saved.property_id!==ownership.property_id||saved.acct!==ownership.acct||saved.purchase_amount_drops!==ownership.purchase_amount_drops)throw Error('settled_purchase_required');
  const split=splitEstateCapital(String(saved.purchase_amount_drops));
  const prior=get.get(hash);
  if(prior){if(prior.property_id!==saved.property_id||prior.buyer!==saved.acct||prior.purchase_drops!==split.purchaseDrops||prior.img_plx_drops!==split.imgPlxDrops||prior.img_xrp_drops!==split.imgXrpDrops)throw Error('capital_allocation_conflict');return prior;}
  db.prepare("INSERT INTO estate_capital_allocations VALUES(?,?,?,?,?,?,1,'awaiting_liquidity_execution',?)").run(hash,saved.property_id,saved.acct,split.purchaseDrops,split.imgPlxDrops,split.imgXrpDrops,saved.purchased_at);
  return get.get(hash);
 }
 function reservedDrops(){
  return db.prepare('SELECT purchase_drops FROM estate_capital_allocations').all().reduce((n,r)=>n+BigInt(r.purchase_drops),0n).toString();
 }
 function state(buyer){return {capitalAllocationPolicy:POLICY,capitalAllocations:buyer?db.prepare('SELECT property_id,purchase_drops,img_plx_drops,img_xrp_drops,state FROM estate_capital_allocations WHERE buyer=? ORDER BY property_id').all(buyer):[]};}
 return {record,reservedDrops,state};
}
module.exports={POLICY,splitEstateCapital,createEstateCapitalAllocation};
