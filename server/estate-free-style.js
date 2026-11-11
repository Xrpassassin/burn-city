'use strict';
// Free property finishes. This is deliberately independent of the XRP/tycoon
// purchase and payout ledgers. Choices follow the physical estate on resale.
const ARCHITECTURES=Object.freeze(['classic','modern','rustic']);
const PALETTES=Object.freeze(['original','coastal','forest','charcoal']);
const DEFAULT=Object.freeze({architecture:'classic',palette:'original'});
function createEstateFreeStyleStore({db,clock=Date.now}={}){
 if(typeof db?.prepare!=='function'||typeof db?.exec!=='function'||typeof clock!=='function')throw TypeError('estate_free_style_dependencies_required');
 db.exec("CREATE TABLE IF NOT EXISTS estate_free_styles("+
   "property_id TEXT PRIMARY KEY,architecture TEXT NOT NULL,palette TEXT NOT NULL,updated_at INTEGER NOT NULL)");
 const owner=db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?');
 const get=db.prepare('SELECT architecture,palette FROM estate_free_styles WHERE property_id=?');
 const list=db.prepare('SELECT f.property_id AS propertyId,f.architecture,f.palette FROM estate_free_styles f '+
   'JOIN estate_property_ownership o ON o.property_id=f.property_id ORDER BY f.property_id');
 const upsert=db.prepare('INSERT INTO estate_free_styles(property_id,architecture,palette,updated_at) VALUES(?,?,?,?) '+
   'ON CONFLICT(property_id) DO UPDATE SET architecture=excluded.architecture,palette=excluded.palette,updated_at=excluded.updated_at');
 const styleFor=propertyId=>{const row=get.get(propertyId);return row?{architecture:row.architecture,palette:row.palette}:{...DEFAULT};};
 const choices=()=>({architectures:[...ARCHITECTURES],palettes:[...PALETTES]});
 function state({propertyId,acct}={}){
  if(typeof propertyId!=='string'||propertyId.length>80||!propertyId)return {ok:false,error:'unknown_property'};
  const current=owner.get(propertyId);
  if(!current)return {ok:false,error:'property_owner_required'};
  if(!acct||current.acct!==acct)return {ok:false,error:'property_owner_required'};
  return {ok:true,propertyId,style:styleFor(propertyId),choices:choices(),costXrp:0,financialRewards:false};
 }
 function save({propertyId,acct,architecture,palette}={}){
  const allowed=state({propertyId,acct});if(!allowed.ok)return allowed;
  if(!ARCHITECTURES.includes(architecture)||!PALETTES.includes(palette))
   return {ok:false,error:'invalid_free_style'};
  const now=clock();
  if(!Number.isSafeInteger(now)||now<1)return {ok:false,error:'invalid_style_clock'};
  // Compare-and-write against current ownership; no client can take control
  // after resale with an old wallet token.
  const changed=db.prepare('SELECT acct FROM estate_property_ownership WHERE property_id=?').get(propertyId);
  if(changed?.acct!==acct)return {ok:false,error:'property_owner_required'};
  upsert.run(propertyId,architecture,palette,now);
  return state({propertyId,acct});
 }
 function publicState(){
  const properties=list.all().filter(row=>ARCHITECTURES.includes(row.architecture)&&PALETTES.includes(row.palette));
  return {properties,choices:choices(),costXrp:0,financialRewards:false};
 }
 return Object.freeze({state,save,publicState});
}
module.exports={createEstateFreeStyleStore,ARCHITECTURES,PALETTES,DEFAULT};
