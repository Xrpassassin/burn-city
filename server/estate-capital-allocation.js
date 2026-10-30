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
  return require('./estate-liquidity-runtime').estateGuardReserve(db);
 }
 function state(buyer){
  const rows=buyer?db.prepare('SELECT property_id,purchase_tx,purchase_drops,img_plx_drops,img_xrp_drops,state FROM estate_capital_allocations WHERE buyer=? ORDER BY property_id').all(buyer):[];
  const hasJobs=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_liquidity_jobs'").get();
  return {capitalAllocationPolicy:POLICY,capitalAllocations:rows.map(({purchase_tx,...r})=>{
   const positions=hasJobs?db.prepare('SELECT state,note,data_json FROM estate_liquidity_jobs WHERE purchase_tx=?').all(purchase_tx):[];
   return {...r,fundingState:positions.some(p=>p.note)?'review_needed':positions.length===2&&positions.every(p=>p.state==='invested')?'invested':positions.length?'in_progress':'pending',
    uninvestedXrpDrops:positions.length?positions.reduce((n,p)=>n+BigInt(JSON.parse(p.data_json).cash),0n).toString():r.purchase_drops};
  })};
 }
 return {record,reservedDrops,state};
}
module.exports={POLICY,splitEstateCapital,createEstateCapitalAllocation};
