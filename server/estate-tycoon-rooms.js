'use strict';
// Private, owner-or-invited-guest rooms. Never infer authority from client unlocks.
const ROOMS=Object.freeze([
 {id:'home',title:'Your Home',upgradeId:null,description:'A furnished walkable home with free floor-plan choices'},
 {id:'bunker',title:'Underground Command Bunker',upgradeId:'underground-bunker',description:'Blast doors, operations desk and backup power'},
 {id:'lounge',title:'Hidden Garden Lounge',upgradeId:'grow-lounge',description:'Private neon conservatory and media lounge'},
 {id:'deluxe-lounge',title:'Deluxe Secret Lounge',upgradeId:'grow-lounge-deluxe',description:'Expanded planted lounge and aquarium wall'},
 {id:'workshop',title:'Hobby Workshop',upgradeId:'hobby-workshop',description:'Tool benches, assembly tables and parts racks'},
 {id:'arcade',title:'Private Arcade',upgradeId:'game-lounge',description:'Retro cabinets, sofa and a small game den'},
 {id:'vault',title:'Bunker Vault Arcade',upgradeId:'bunker-arcade',description:'A concealed game vault inside the upgraded bunker'}
].map(r=>Object.freeze(r)));
const ROOM_BY_ID=new Map(ROOMS.map(r=>[r.id,r]));
function privateRoomOptions({propertyId,acct,accessFor,tycoonStore}={}){
 if(typeof propertyId!=='string'||typeof acct!=='string'||!acct)return {ok:false,error:'sign_in_with_xaman'};
 // Do not expose unlocks to uninvited visitors.
 const access=accessFor(acct,propertyId);
 if(!access?.allowed||access.role==='tour'||!access.permissions?.includes('enter'))
  return {ok:false,error:access?.reason||'no_access'};
 let state;try{state=tycoonStore.state(propertyId);}catch(e){return {ok:false,error:e.message==='unknown_property'?'unknown_property':'private_room_unavailable'};}
 if(!state.owned)return {ok:false,error:'property_unowned'};
 const installed=new Set(state.unlockedItemIds);
 return {ok:true,propertyId,role:access.role,rooms:ROOMS.filter(r=>!r.upgradeId||installed.has(r.upgradeId)).map(r=>({...r,verified:true,free:r.upgradeId===null})),
  bonusRoomsOnly:false,ownerMayCustomize:access.role==='owner',canEnter:access.permissions.includes('enter')};
}
function privateRoomAccess(input={}){
 const options=privateRoomOptions(input);
 if(!options.ok)return options;
 const room=ROOM_BY_ID.get(input.roomId);
 if(!room)return {ok:false,error:'unknown_private_room'};
 if(!options.rooms.some(r=>r.id===room.id))return {ok:false,error:'room_not_unlocked'};
 return {ok:true,allowed:true,propertyId:options.propertyId,roomId:room.id,title:room.title,
  role:options.role,verifiedUnlock:true,guestsMayEnter:options.role==='guest'};
}
// Aircraft is not a public prop anyone can fly. Only the currently entitled owner
// can pilot, and the aircraft is attached to the property (including upon resale).
function estateHelicopterAccess({propertyId,acct,accessFor,tycoonStore}={}){
 if(typeof acct!=='string'||!acct)return {ok:false,error:'sign_in_with_xaman'};
 if(typeof propertyId!=='string')return {ok:false,error:'unknown_property'};
 const access=accessFor(acct,propertyId);
 if(!access?.allowed||access.role!=='owner'||!access.permissions?.includes('build'))
  return {ok:false,error:'property_owner_required'};
 let state;try{state=tycoonStore.state(propertyId);}catch(e){return {ok:false,error:e.message==='unknown_property'?'unknown_property':'helicopter_unavailable'};}
 if(!state.owned||!['family','mansion'].includes(state.tier))return {ok:false,error:'helicopter_tier_restricted'};
 if(!state.unlockedItemIds.includes('estate-helicopter'))return {ok:false,error:'helicopter_not_unlocked'};
 return {ok:true,propertyId,role:'owner',aircraft:'estate-helicopter',pilotAuthorized:true,flightNetworked:false,
  priceDrops:require('./estate-tycoon').ITEM_BY_ID.get('estate-helicopter').priceDrops,flightScope:'estates_island_local',rewardsGuaranteed:false};
}
module.exports={ROOMS,ROOM_BY_ID,privateRoomOptions,privateRoomAccess,estateHelicopterAccess};
