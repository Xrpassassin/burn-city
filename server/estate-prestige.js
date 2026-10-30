'use strict';
const {PROPERTY_BY_ID,TIER_BY_ID}=require('./estate-economy');
// Total verified XRP invested in this property, including its original purchase.
// These stages are cosmetic; they never enter reward/share calculations.
const STAGES=Object.freeze([
 {level:0,label:'Homestead',thresholdDrops:0,features:['Original architecture']},
 {level:1,label:'Garden',thresholdDrops:15000000,features:['Flower boxes','Layered entrance planting']},
 {level:2,label:'Crafted',thresholdDrops:75000000,features:['Window shutters','Stone facade trim']},
 {level:3,label:'Signature',thresholdDrops:150000000,features:['Copper roof details','Warm entry lanterns']},
 {level:4,label:'Grand',thresholdDrops:300000000,features:['Timber entrance pergola','Decorative facade columns']},
 {level:5,label:'Landmark',thresholdDrops:600000000,features:['Ivory facade','Gold inlay','Rooftop crest']}
].map(s=>Object.freeze({...s,features:Object.freeze(s.features)})));
function prestigeFor(amountDrops=0){
 if(!Number.isSafeInteger(amountDrops)||amountDrops<0)throw new TypeError('invalid_verified_property_spend');
 const stage=[...STAGES].reverse().find(s=>amountDrops>=s.thresholdDrops),next=STAGES[stage.level+1]||null;
 return {...stage,totalSpentDrops:amountDrops,next:next?{...next,remainingDrops:next.thresholdDrops-amountDrops}:null};
}
function createEstatePrestigeStore(db){
 db.exec(`CREATE TABLE IF NOT EXISTS estate_cosmetic_upgrades(
 upgrade_id TEXT PRIMARY KEY,property_id TEXT NOT NULL,buyer TEXT NOT NULL,
 before_drops INTEGER NOT NULL,price_drops INTEGER NOT NULL CHECK(price_drops>0),
 target_level INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','settled')),
 created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,payload_state TEXT NOT NULL DEFAULT 'none',
 payload_uuid TEXT UNIQUE,payment_tx TEXT UNIQUE,ledger_index INTEGER,
 FOREIGN KEY(property_id) REFERENCES estate_property_ownership(property_id));
 CREATE UNIQUE INDEX IF NOT EXISTS estate_one_pending_cosmetic ON estate_cosmetic_upgrades(property_id) WHERE status='reserved';`);
 const owner=db.prepare('SELECT property_id,acct,purchase_amount_drops,purchase_tx FROM estate_property_ownership WHERE property_id=?');
 const credits=db.prepare("SELECT COALESCE(SUM(price_drops),0) n FROM estate_cosmetic_upgrades WHERE property_id=? AND status='settled'");
 function state(propertyId){
  if(!PROPERTY_BY_ID.has(propertyId))throw new Error('unknown_property');
  const row=owner.get(propertyId),total=(row?.purchase_amount_drops||0)+credits.get(propertyId).n;
  const tier=TIER_BY_ID.get(PROPERTY_BY_ID.get(propertyId).tier);
  return {propertyId,owned:!!row,...prestigeFor(total),shareUnits:tier.shareUnits,purchaseAppearance:prestigeFor(tier.price*1000000)};
 }
 function all(){return {stages:STAGES,properties:[...PROPERTY_BY_ID.keys()].map(state)};}
 function quote({propertyId,buyer}){
  const s=state(propertyId),row=owner.get(propertyId),pending=db.prepare("SELECT upgrade_id AS upgradeId,expires_at AS expiresAt FROM estate_cosmetic_upgrades WHERE property_id=? AND status='reserved'").get(propertyId);
  const tier=TIER_BY_ID.get(PROPERTY_BY_ID.get(propertyId).tier);
  return {...s,canUpgrade:row?.acct===buyer&&!!s.next,shareUnits:tier.shareUnits,
   previewPurchase:row?null:prestigeFor(tier.price*1000000),
   pending:row?.acct===buyer?pending||null:null};
 }
 function reserve({propertyId,buyer,upgradeId,now}){
  db.exec('BEGIN IMMEDIATE');try{
   const row=owner.get(propertyId);if(!row||row.acct!==buyer)throw new Error('property_owner_required');
   const s=state(propertyId);if(!s.next)throw new Error('property_at_max_prestige');
   const prior=db.prepare("SELECT * FROM estate_cosmetic_upgrades WHERE property_id=? AND status='reserved'").get(propertyId);
   if(prior){if(prior.buyer!==buyer)throw new Error('upgrade_requires_review');db.exec('COMMIT');return prior;}
   db.prepare('INSERT INTO estate_cosmetic_upgrades(upgrade_id,property_id,buyer,before_drops,price_drops,target_level,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(upgradeId,propertyId,buyer,s.totalSpentDrops,s.next.remainingDrops,s.next.level,now,now+600000);
   db.exec('COMMIT');return get(upgradeId);
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 const get=id=>db.prepare('SELECT * FROM estate_cosmetic_upgrades WHERE upgrade_id=?').get(id);
 function settle({upgradeId,buyer,txHash,ledgerIndex}){
  db.exec('BEGIN IMMEDIATE');try{
   const r=get(upgradeId);if(!r||r.buyer!==buyer)throw new Error('upgrade_not_found');
   if(r.status==='settled'){db.exec('COMMIT');return state(r.property_id);}
   if(owner.get(r.property_id)?.acct!==buyer)throw new Error('property_owner_changed');
   if(state(r.property_id).totalSpentDrops!==r.before_drops)throw new Error('property_spend_changed');
   if(db.prepare('SELECT 1 FROM estate_property_ownership WHERE purchase_tx=?').get(txHash))throw new Error('payment_already_used');
   db.prepare("UPDATE estate_cosmetic_upgrades SET status='settled',payment_tx=?,ledger_index=? WHERE upgrade_id=? AND status='reserved'").run(txHash,ledgerIndex,upgradeId);
   const result=state(r.property_id);db.exec('COMMIT');return result;
  }catch(e){db.exec('ROLLBACK');throw e;}
 }
 return {all,state,quote,reserve,get,settle,owner};
}
module.exports={STAGES,prestigeFor,createEstatePrestigeStore};
