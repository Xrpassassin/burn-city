'use strict';
// Purchase principal earmarks, not reward receipts. No signing or pool transfers.
const LEGACY_POLICY=Object.freeze({version:1,imgPlxBps:7000,imgXrpBps:3000});
const POLICY=Object.freeze({version:2,pair:'IMG/RLUSD',imgPlxBps:0,imgXrpBps:0,imgRlusdBps:9900,operatingReserveBps:100,automaticDepositsEnabled:false});
const HASH=/^[A-F0-9]{64}$/;
function splitEstateCapital(drops,version=POLICY.version){
 if(typeof drops!=='string'||!/^[1-9]\d*$/.test(drops))throw new TypeError('positive_purchase_drops_required');
 const total=BigInt(drops);
 if(version===2){const reserve=(total*100n+9999n)/10000n;return Object.freeze({purchaseDrops:drops,imgPlxDrops:'0',imgXrpDrops:'0',imgRlusdDrops:(total-reserve).toString(),operatingReserveDrops:reserve.toString()});}
 if(version!==1)throw Error('unsupported_capital_policy');
 const plx=total*7000n/10000n;
 return Object.freeze({purchaseDrops:total.toString(),imgPlxDrops:plx.toString(),imgXrpDrops:(total-plx).toString()});
}
function createEstateCapitalAllocation(db,{policyVersion=POLICY.version}={}){
 if(![1,2].includes(policyVersion))throw Error('unsupported_capital_policy');
 db.exec(`CREATE TABLE IF NOT EXISTS estate_capital_allocations(
  purchase_tx TEXT PRIMARY KEY,property_id TEXT NOT NULL UNIQUE,buyer TEXT NOT NULL,
  purchase_drops TEXT NOT NULL,img_plx_drops TEXT NOT NULL,img_xrp_drops TEXT NOT NULL,
  policy_version INTEGER NOT NULL CHECK(policy_version IN (1,2)),
  state TEXT NOT NULL CHECK(state='awaiting_liquidity_execution'),created_at INTEGER NOT NULL
 );`);
 require('./estate-schema-upgrade').extendCheck(db,'estate_capital_allocations','CHECK(policy_version=1)','CHECK(policy_version IN (1,2))');
 for(const name of ['img_rlusd_drops','operating_reserve_drops'])if(!db.prepare('PRAGMA table_info(estate_capital_allocations)').all().some(r=>r.name===name))db.exec(`ALTER TABLE estate_capital_allocations ADD COLUMN ${name} TEXT NOT NULL DEFAULT '0'`);
 const get=db.prepare('SELECT * FROM estate_capital_allocations WHERE purchase_tx=?');
 // Called inside the verified ownership settlement transaction. All values come
 // from the just-persisted ownership, not from quote/client input.
 function record(ownership){
  const hash=ownership?.purchase_tx;
  if(!HASH.test(hash||''))throw Error('settled_purchase_required');
  const saved=db.prepare('SELECT * FROM estate_property_ownership WHERE purchase_tx=?').get(hash);
  if(!saved||saved.property_id!==ownership.property_id||saved.acct!==ownership.acct||saved.purchase_amount_drops!==ownership.purchase_amount_drops)throw Error('settled_purchase_required');
  const prior=get.get(hash);
  const split=splitEstateCapital(String(saved.purchase_amount_drops),prior?.policy_version||policyVersion);
  if(prior){if(prior.property_id!==saved.property_id||prior.buyer!==saved.acct||prior.purchase_drops!==split.purchaseDrops||prior.img_plx_drops!==split.imgPlxDrops||prior.img_xrp_drops!==split.imgXrpDrops||(prior.img_rlusd_drops||'0')!==(split.imgRlusdDrops||'0')||(prior.operating_reserve_drops||'0')!==(split.operatingReserveDrops||'0'))throw Error('capital_allocation_conflict');return prior;}
  db.prepare("INSERT INTO estate_capital_allocations(purchase_tx,property_id,buyer,purchase_drops,img_plx_drops,img_xrp_drops,policy_version,state,created_at,img_rlusd_drops,operating_reserve_drops) VALUES(?,?,?,?,?,?,?,'awaiting_liquidity_execution',?,?,?)").run(hash,saved.property_id,saved.acct,split.purchaseDrops,split.imgPlxDrops,split.imgXrpDrops,policyVersion,saved.purchased_at,split.imgRlusdDrops||'0',split.operatingReserveDrops||'0');
  return get.get(hash);
 }
 function reservedDrops(){
  return require('./estate-liquidity-runtime').estateGuardReserve(db);
 }
 function state(buyer){
  const rows=buyer?db.prepare('SELECT property_id,purchase_tx,purchase_drops,img_plx_drops,img_xrp_drops,img_rlusd_drops,operating_reserve_drops,policy_version,state FROM estate_capital_allocations WHERE buyer=? ORDER BY property_id').all(buyer):[];
  const hasJobs=!!db.prepare("SELECT 1 FROM sqlite_master WHERE name='estate_liquidity_jobs'").get();
  return {capitalAllocationPolicy:POLICY,capitalAllocations:rows.map(({purchase_tx,...r})=>{
   const positions=hasJobs?db.prepare('SELECT state,note,data_json FROM estate_liquidity_jobs WHERE purchase_tx=?').all(purchase_tx):[];
   return {...r,fundingState:positions.some(p=>p.note==='img_rlusd_activation_required')?'awaiting_pool':positions.some(p=>p.note)?'review_needed':positions.length===(r.policy_version===2?1:2)&&positions.every(p=>p.state==='invested')?'invested':positions.length?'in_progress':'pending',
    pool:r.policy_version===2?'IMG/RLUSD':'Legacy IMG/PLX + IMG/XRP',
    uninvestedXrpDrops:positions.length?positions.reduce((n,p)=>n+BigInt(JSON.parse(p.data_json).cash),0n).toString():(BigInt(r.purchase_drops)-BigInt(r.operating_reserve_drops)).toString()};
  })};
 }
 return {record,reservedDrops,state};
}
module.exports={POLICY,LEGACY_POLICY,splitEstateCapital,createEstateCapitalAllocation};
