'use strict';
// Authoritative, opt-in Estates tycoon upgrade ledger. No token transfers here.
// An upgrade adds documented development spend and recorded property share units.
// Live payout weights are deliberately unchanged until the future-only
// distribution policy and legal/treasury review have been approved.
const {PROPERTY_BY_ID,TIER_BY_ID}=require('./estate-economy');
const ITEMS=Object.freeze([
 {id:'porch-lights',name:'Porch & path lights',category:'decor',priceXrp:3,scene:'lamps'},
 {id:'flower-garden',name:'Flower garden',category:'decor',priceXrp:3,scene:'garden'},
 {id:'custom-sign',name:'Custom property sign',category:'decor',priceXrp:3,scene:'sign'},
 {id:'cozy-awning',name:'Covered porch awning',category:'exterior',priceXrp:6,scene:'awning'},
 {id:'privacy-fence',name:'Privacy fence',category:'exterior',priceXrp:6,scene:'fence'},
 {id:'fire-pit',name:'Backyard fire pit',category:'decor',priceXrp:6,scene:'firepit'},
 {id:'game-lounge',name:'Arcade & gaming lounge',category:'interior',priceXrp:9,scene:'arcade'},
 {id:'garden-pond',name:'Garden pond',category:'decor',priceXrp:9,scene:'pond',requires:['flower-garden']},
 {id:'reinforced-floor',name:'Reinforced hidden floor',category:'underground',priceXrp:9,scene:'hatch-foundation'},
 {id:'grow-lounge',name:'Secret cannabis-themed lounge',category:'underground',priceXrp:9,scene:'grow-lounge',requires:['reinforced-floor']},
 {id:'hobby-workshop',name:'Compact hobby workshop',category:'interior',priceXrp:12,scene:'workshop'},
 {id:'roof-garden',name:'Rooftop garden',category:'decor',priceXrp:15,scene:'roof-garden',requires:['flower-garden']},
 {id:'hidden-hatch',name:'Hidden bunker entrance',category:'underground',priceXrp:18,scene:'hatch',requires:['reinforced-floor']},
 {id:'grow-lounge-deluxe',name:'Deluxe grow-themed lounge',category:'underground',priceXrp:18,scene:'grow-lounge-deluxe',requires:['grow-lounge']},
 {id:'security-upgrade',name:'Security doors & cameras',category:'utility',priceXrp:21,scene:'security',requires:['privacy-fence']},
 {id:'underground-bunker',name:'Secret underground bunker',category:'underground',priceXrp:30,scene:'bunker',requires:['hidden-hatch']},
 {id:'bunker-arcade',name:'Bunker arcade & vault decor',category:'underground',priceXrp:36,scene:'bunker-arcade',requires:['underground-bunker']},
 // A prestige aircraft includes its own compact helipad. Restricted to upper property tiers.
 {id:'estate-helicopter',name:'Estate helicopter & private helipad',category:'aviation',priceXrp:60,scene:'helicopter',eligibleTiers:['family','mansion']}
].map(item=>Object.freeze({...item,priceDrops:item.priceXrp*1000000,shareUnitsDelta:item.priceXrp/3,requires:Object.freeze(item.requires||[]),eligibleTiers:Object.freeze(item.eligibleTiers||[])})));
const ITEM_BY_ID=new Map(ITEMS.map(x=>[x.id,x]));
const WALLET=/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const HASH=/^[A-Fa-f0-9]{64}$/;
function itemCatalog(){return ITEMS.map(({id,name,category,priceXrp,priceDrops,shareUnitsDelta,requires,eligibleTiers,scene})=>({id,name,category,priceXrp,priceDrops,shareUnitsDelta,requires,eligibleTiers,scene}));}
function createEstateTycoonStore(db){
 if(!db||typeof db.prepare!=='function'||typeof db.exec!=='function')throw new TypeError('sqlite_db_required');
 db.exec('CREATE TABLE IF NOT EXISTS estate_tycoon_orders ('+
  'order_id TEXT PRIMARY KEY,property_id TEXT NOT NULL,buyer TEXT NOT NULL,item_id TEXT NOT NULL,'+
  'price_drops INTEGER NOT NULL CHECK(price_drops>0),share_delta INTEGER NOT NULL CHECK(share_delta>0),'+
  'before_upgrade_drops INTEGER NOT NULL,created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,'+
  "status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','settled')),"+
  "payload_state TEXT NOT NULL DEFAULT 'none',payload_uuid TEXT UNIQUE,payment_tx TEXT UNIQUE,"+
  'ledger_index INTEGER,settled_at INTEGER,FOREIGN KEY(property_id) REFERENCES estate_property_ownership(property_id))');
 db.exec("CREATE UNIQUE INDEX IF NOT EXISTS estate_tycoon_one_pending ON estate_tycoon_orders(property_id) WHERE status='reserved'");
 db.exec("CREATE UNIQUE INDEX IF NOT EXISTS estate_tycoon_one_owned_item ON estate_tycoon_orders(property_id,item_id) WHERE status='settled'");
 const owner=db.prepare('SELECT property_id,acct,purchase_amount_drops,purchase_tx,share_units FROM estate_property_ownership WHERE property_id=?');
 const upgraded=db.prepare("SELECT item_id,price_drops,share_delta,settled_at FROM estate_tycoon_orders WHERE property_id=? AND status='settled' ORDER BY settled_at,order_id");
 const pending=db.prepare("SELECT order_id AS orderId,item_id AS itemId,expires_at AS expiresAt FROM estate_tycoon_orders WHERE property_id=? AND status='reserved'");
 const get=id=>db.prepare('SELECT * FROM estate_tycoon_orders WHERE order_id=?').get(id);
 function state(propertyId){
  if(!PROPERTY_BY_ID.has(propertyId))throw new Error('unknown_property');
  const property=PROPERTY_BY_ID.get(propertyId),tier=TIER_BY_ID.get(property.tier),ownership=owner.get(propertyId);
  const bought=upgraded.all(propertyId),ownedIds=new Set(bought.map(x=>x.item_id));
  const extraDrops=bought.reduce((n,x)=>n+x.price_drops,0),extraUnits=bought.reduce((n,x)=>n+x.share_delta,0);
  const baseDrops=ownership?.purchase_amount_drops??tier.price*1000000;
  if(!Number.isSafeInteger(baseDrops+extraDrops)||!Number.isSafeInteger(tier.shareUnits+extraUnits))throw new Error('upgrade_totals_overflow');
  return {propertyId,tier:property.tier,owned:!!ownership,baseValueDrops:baseDrops,
   upgradeValueDrops:extraDrops,recordedValueDrops:baseDrops+extraDrops,
   baseShareUnits:tier.shareUnits,upgradeShareUnits:extraUnits,
   recordedShareUnits:tier.shareUnits+extraUnits,liveRewardShareUnits:ownership?.share_units??tier.shareUnits,
   unlockedItemIds:bought.map(x=>x.item_id),
   items:ITEMS.map(item=>({...item,unlocked:ownedIds.has(item.id),
    tierEligible:!item.eligibleTiers.length||item.eligibleTiers.includes(property.tier),
    prerequisitesMet:item.requires.every(id=>ownedIds.has(id))})),
   sharePolicy:'recorded_only_not_active_for_distributions',
   marketValueEstimated:false,rewardsGuaranteed:false};
 }
 function publicState(){return {catalog:itemCatalog(),properties:[...PROPERTY_BY_ID.keys()].map(id=>{
  const s=state(id);return {propertyId:id,tier:s.tier,owned:s.owned,unlockedItemIds:s.unlockedItemIds,
   upgradeValueDrops:s.upgradeValueDrops,recordedValueDrops:s.recordedValueDrops,
   recordedShareUnits:s.recordedShareUnits,sharePolicy:s.sharePolicy};
 }),sharePolicy:'recorded_only_not_active_for_distributions'};}
 function quote({propertyId,buyer,itemId}){
  const s=state(propertyId),item=ITEM_BY_ID.get(itemId);
  if(!item)throw new Error('unknown_upgrade_item');
  const ownership=owner.get(propertyId),available=s.items.find(x=>x.id===itemId);
  const pendingOrder=pending.get(propertyId);
  return {propertyId,itemId,item,owned:s.owned,ownerAuthorized:!!ownership&&ownership.acct===buyer,
   alreadyUnlocked:available.unlocked,tierEligible:available.tierEligible,prerequisitesMet:available.prerequisitesMet,
   missingPrerequisites:item.requires.filter(id=>!s.unlockedItemIds.includes(id)),
   canPurchase:!!ownership&&ownership.acct===buyer&&available.tierEligible&&!available.unlocked&&available.prerequisitesMet&&!pendingOrder,
   pending:ownership?.acct===buyer?pendingOrder||null:null,
   baseValueDrops:s.baseValueDrops,upgradeValueDrops:s.upgradeValueDrops,recordedValueDrops:s.recordedValueDrops,
   baseShareUnits:s.baseShareUnits,upgradeShareUnits:s.upgradeShareUnits,
   recordedShareUnits:s.recordedShareUnits,liveRewardShareUnits:s.liveRewardShareUnits,
   projectedValueDrops:s.recordedValueDrops+item.priceDrops,
   projectedShareUnits:s.recordedShareUnits+item.shareUnitsDelta,
   sharePolicy:s.sharePolicy,rewardsGuaranteed:false};
 }
 function reserve({propertyId,buyer,itemId,orderId,now}){
  if(!WALLET.test(buyer||'')||!Number.isSafeInteger(now)||now<1||!/^tycoon_[a-f0-9]{40}$/.test(orderId||''))throw new Error('invalid_tycoon_reservation');
  db.exec('BEGIN IMMEDIATE');
  try{
   if(owner.get(propertyId)?.acct!==buyer)throw new Error('property_owner_required');
   const q=quote({propertyId,buyer,itemId});
   if(q.alreadyUnlocked)throw new Error('upgrade_already_owned');
   if(!q.tierEligible)throw new Error('upgrade_tier_restricted');
   if(!q.prerequisitesMet)throw new Error('upgrade_prerequisites_missing');
   const existing=pending.get(propertyId);
   if(existing){
    if(existing.itemId!==itemId)throw new Error('another_upgrade_pending');
    db.exec('COMMIT');return get(existing.orderId);
   }
   db.prepare('INSERT INTO estate_tycoon_orders(order_id,property_id,buyer,item_id,price_drops,share_delta,before_upgrade_drops,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(orderId,propertyId,buyer,itemId,q.item.priceDrops,q.item.shareUnitsDelta,q.upgradeValueDrops,now,now+600000);
   db.exec('COMMIT');return get(orderId);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function settle({orderId,buyer,txHash,ledgerIndex,now}){
  if(!HASH.test(txHash||'')||!Number.isSafeInteger(ledgerIndex)||ledgerIndex<1||!Number.isSafeInteger(now)||now<1)throw new Error('verified_upgrade_proof_required');
  db.exec('BEGIN IMMEDIATE');
  try{
   const r=get(orderId);
   if(!r||r.buyer!==buyer)throw new Error('tycoon_order_not_found');
   if(r.status==='settled'){if(r.payment_tx!==txHash.toUpperCase())throw new Error('payment_hash_conflict');db.exec('COMMIT');return state(r.property_id);}
   if(owner.get(r.property_id)?.acct!==buyer)throw new Error('property_owner_changed');
   if(db.prepare('SELECT 1 FROM estate_property_ownership WHERE UPPER(purchase_tx)=?').get(txHash.toUpperCase()))throw new Error('payment_already_used');
   const prestigeTable=db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='estate_cosmetic_upgrades'").get();
   if(prestigeTable&&db.prepare("SELECT 1 FROM estate_cosmetic_upgrades WHERE UPPER(payment_tx)=? AND status='settled'").get(txHash.toUpperCase()))throw new Error('payment_already_used');
   const s=state(r.property_id),item=ITEM_BY_ID.get(r.item_id);
   if(!item||r.price_drops!==item.priceDrops||r.share_delta!==item.shareUnitsDelta||s.upgradeValueDrops!==r.before_upgrade_drops||
     s.unlockedItemIds.includes(r.item_id)||
     (item.eligibleTiers.length&&!item.eligibleTiers.includes(s.tier))||
     !item.requires.every(id=>s.unlockedItemIds.includes(id)))throw new Error('upgrade_state_changed');
   db.prepare("UPDATE estate_tycoon_orders SET status='settled',payment_tx=?,ledger_index=?,settled_at=? WHERE order_id=? AND status='reserved'")
    .run(txHash.toUpperCase(),ledgerIndex,now,orderId);
   const updated=state(r.property_id);db.exec('COMMIT');return updated;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 function ownerPortfolio(buyer){
  if(!WALLET.test(buyer||''))throw new Error('invalid_wallet');
  const owned=db.prepare('SELECT property_id FROM estate_property_ownership WHERE acct=? ORDER BY property_id').all(buyer);
  const list=owned.map(x=>state(x.property_id));
  return {properties:list,recordedShareUnits:list.reduce((n,p)=>n+p.recordedShareUnits,0),
   upgradeShareUnits:list.reduce((n,p)=>n+p.upgradeShareUnits,0),
   recordedValueDrops:list.reduce((n,p)=>n+p.recordedValueDrops,0),
   sharePolicy:'recorded_only_not_active_for_distributions',rewardsGuaranteed:false};
 }
 return {state,publicState,quote,reserve,settle,get,ownerPortfolio};
}
module.exports={ITEMS,ITEM_BY_ID,itemCatalog,createEstateTycoonStore};
