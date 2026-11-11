'use strict';
// Free editable owner home interiors, reusing verified Tycoon unlocks for three
// premium themes. No invoices or XRP handling happens in this module.
const {PROPERTY_BY_ID}=require('./estate-economy');
const {ITEM_BY_ID}=require('./estate-tycoon');
const FOOTPRINT=Object.freeze({
 trailer:[6,5],apartment:[7,8],starter:[8,7],family:[10,9],mansion:[13,11]
});
const LAYOUTS=Object.freeze([
 {id:'cozy',name:'Cozy Home',priceXrp:0,upgradeId:null},
 {id:'open',name:'Open Living',priceXrp:0,upgradeId:null},
 {id:'split',name:'Defined Rooms',priceXrp:0,upgradeId:null},
 {id:'arcade-suite',name:'Arcade Social Suite',priceXrp:9,upgradeId:'game-lounge'},
 {id:'maker-suite',name:'Workshop Maker Suite',priceXrp:12,upgradeId:'hobby-workshop'},
 {id:'bunker-suite',name:'Command Suite',priceXrp:30,upgradeId:'underground-bunker'}
 ].map(x=>Object.freeze(x)));
const LAYOUT_BY_ID=new Map(LAYOUTS.map(x=>[x.id,x]));
const FURNITURE=Object.freeze([
 {id:'sofa',label:'Fabric Sofa',width:1.6,depth:.8},
 {id:'coffee-table',label:'Coffee Table',width:1,depth:.7},
 {id:'chair',label:'Accent Chair',width:.7,depth:.7},
 {id:'dining-table',label:'Dining Table',width:1.25,depth:.85},
 {id:'desk',label:'Work Desk',width:1.35,depth:.7},
 {id:'bookshelf',label:'Bookshelf',width:1,depth:.4},
 {id:'bed',label:'Bed',width:1.6,depth:1.8},
 {id:'plant',label:'Potted Plant',width:.55,depth:.55},
 {id:'floor-lamp',label:'Floor Lamp',width:.4,depth:.4}
 ].map(x=>Object.freeze(x)));
const FURNITURE_BY_ID=new Map(FURNITURE.map(x=>[x.id,x]));
const MAX_FURNITURE=24;
function dimensions(tier){
 const [w,d]=FOOTPRINT[tier]||FOOTPRINT.trailer;
 return {halfX:(w-.8)/2,halfZ:(d-.8)/2,height:tier==='trailer'?2.65:3.1};
}
const validHalf=n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n*2-Math.round(n*2))<1e-7;
function validateFurniture(items,tier){
 if(!Array.isArray(items)||items.length>MAX_FURNITURE)return {ok:false,error:'invalid_home_furniture'};
 const {halfX,halfZ}=dimensions(tier),ids=new Set(),boxes=[];
 for(const item of items){
  if(!item||typeof item.id!=='string'||!/^[a-zA-Z0-9-]{1,36}$/.test(item.id)||ids.has(item.id)||
   !FURNITURE_BY_ID.has(item.type)||!validHalf(item.x)||!validHalf(item.z)||
   ![0,90,180,270].includes(item.rotation))return {ok:false,error:'invalid_home_furniture'};
  ids.add(item.id);const f=FURNITURE_BY_ID.get(item.type),turn=item.rotation%180!==0;
  const w=(turn?f.depth:f.width),d=(turn?f.width:f.depth);
  if(Math.abs(item.x)+w/2>.98*halfX||Math.abs(item.z)+d/2>.98*halfZ)
   return {ok:false,error:'furniture_outside_home'};
  // Reserve a usable front-door entrance for third-person walk-in.
  if(Math.abs(item.x)<1.08+w/2&&item.z+d/2>halfZ-1.35)
   return {ok:false,error:'furniture_blocks_entrance'};
  for(const box of boxes)if(Math.abs(box.x-item.x)<(box.w+w)/2+.11&&Math.abs(box.z-item.z)<(box.d+d)/2+.11)
   return {ok:false,error:'furniture_overlaps'};
  boxes.push({x:item.x,z:item.z,w,d});
 }
 return {ok:true,furniture:items.map(({id,type,x,z,rotation})=>({id,type,x,z,rotation}))};
}
function initialFurniture(tier){
 const {halfX,halfZ}=dimensions(tier);
 const candidates=[
  {id:'f-sofa',type:'sofa',x:-Math.floor((halfX-1.05)*2)/2,z:-.5,rotation:0},
  {id:'f-plant',type:'plant',x:Math.floor((halfX-.55)*2)/2,z:-Math.floor((halfZ-.55)*2)/2,rotation:0}
 ];
 const out=[];for(const item of candidates)if(validateFurniture([...out,item],tier).ok)out.push(item);
 return out;
}
function createEstateHomeInteriorStore({db,accessFor,tycoonStore,clock=Date.now}={}){
 if(!db?.prepare||!db?.exec||typeof accessFor!=='function'||!tycoonStore?.state)throw TypeError('estate_home_dependencies_required');
 db.exec("CREATE TABLE IF NOT EXISTS estate_home_interiors("+
  "property_id TEXT PRIMARY KEY,layout_id TEXT NOT NULL,furniture_json TEXT NOT NULL,updated_at INTEGER NOT NULL)");
 const get=db.prepare('SELECT layout_id,furniture_json FROM estate_home_interiors WHERE property_id=?');
 const put=db.prepare('INSERT INTO estate_home_interiors(property_id,layout_id,furniture_json,updated_at) '+
  'SELECT ?,?,?,? FROM estate_property_ownership WHERE property_id=? AND acct=? '+
  'ON CONFLICT(property_id) DO UPDATE SET layout_id=excluded.layout_id,'+
  'furniture_json=excluded.furniture_json,updated_at=excluded.updated_at');
 function state(propertyId,acct){
  const known=PROPERTY_BY_ID.get(propertyId);
  if(!known)return {ok:false,error:'unknown_property'};
  const access=accessFor(acct,propertyId);
  if(!access?.allowed||access.role==='tour'||!access.permissions?.includes('enter'))
   return {ok:false,error:'property_owner_or_invitation_required'};
  const tycoon=tycoonStore.state(propertyId);
  if(!tycoon.owned)return {ok:false,error:'property_unowned'};
  const purchased=new Set(tycoon.unlockedItemIds||[]);
  const choices=LAYOUTS.map(l=>({...l,unlocked:!l.upgradeId||purchased.has(l.upgradeId)}));
  const row=get.get(propertyId);
  let layoutId=row?.layout_id||'cozy';
  if(!choices.find(c=>c.id===layoutId)?.unlocked)layoutId='cozy';
  let items;try{items=row?JSON.parse(row.furniture_json):initialFurniture(known.tier);}catch{items=initialFurniture(known.tier);}
  if(!validateFurniture(items,known.tier).ok)items=initialFurniture(known.tier);
  return {ok:true,propertyId,tier:known.tier,role:access.role,editable:access.role==='owner'&&access.permissions.includes('build'),
   layoutId,furniture:items,layouts:choices,catalog:FURNITURE,dimensions:dimensions(known.tier),
   costXrp:0,financialRewards:false,privateRoomNetworked:false};
 }
 function save({propertyId,acct,layoutId,furniture}={}){
  const current=state(propertyId,acct);if(!current.ok)return current;
  if(!current.editable)return {ok:false,error:'property_owner_required'};
  const preset=current.layouts.find(l=>l.id===layoutId);
  if(!preset)return {ok:false,error:'invalid_home_layout'};
  if(!preset.unlocked)return {ok:false,error:'home_layout_requires_verified_upgrade'};
  const checked=validateFurniture(furniture,current.tier);if(!checked.ok)return checked;
  const now=clock();if(!Number.isSafeInteger(now)||now<1)return {ok:false,error:'invalid_clock'};
  const update=put.run(propertyId,layoutId,JSON.stringify(checked.furniture),now,propertyId,acct);
  if(update.changes!==1)return {ok:false,error:'property_owner_required'};
  return state(propertyId,acct);
 }
 return Object.freeze({state,save});
}
module.exports={createEstateHomeInteriorStore,LAYOUTS,FURNITURE,FOOTPRINT,dimensions,validateFurniture,initialFurniture,MAX_FURNITURE};
