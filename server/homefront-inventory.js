'use strict';
// Small server-authoritative carried inventory for Homefront field expeditions.
// Inspired by common survival-RPG patterns; this implementation is original.
const ITEMS = Object.freeze({
  food:{label:'Food ration',weight:1,maxStack:8}, water:{label:'Clean water',weight:1,maxStack:8},
  meds:{label:'Medical supplies',weight:1,maxStack:5}, ammo:{label:'Ammunition',weight:1,maxStack:12},
  scrap:{label:'Scrap',weight:2,maxStack:8}, wood:{label:'Wood',weight:2,maxStack:8}
});
const CAPACITY = 24;
const clamp = (n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?Math.floor(n):min));
function normalize(input){
 const out={}; for(const [id,spec] of Object.entries(ITEMS)) out[id]=clamp(input?.[id],0,spec.maxStack);
 return out;
}
function used(input){const i=normalize(input);return Object.entries(i).reduce((n,[id,count])=>n+count*ITEMS[id].weight,0);}
function add(input,id,amount){
 if(!ITEMS[id])throw Error('unknown_item'); const inventory=normalize(input); let left=clamp(amount,0,999999);
 const byStack=Math.min(left,ITEMS[id].maxStack-inventory[id]);
 const byWeight=Math.floor((CAPACITY-used(inventory))/ITEMS[id].weight);
 const accepted=Math.max(0,Math.min(byStack,byWeight));
 inventory[id]+=accepted; return {inventory,accepted,rejected:left-accepted,used:used(inventory),capacity:CAPACITY};
}
function remove(input,id,amount=1){
 if(!ITEMS[id])throw Error('unknown_item'); const inventory=normalize(input),qty=clamp(amount,1,ITEMS[id].maxStack);
 if(inventory[id]<qty)throw Error('not_carrying_'+id);
 inventory[id]-=qty;return {inventory,removed:qty,used:used(inventory),capacity:CAPACITY};
}
function stash(input,resources){
 const inventory=normalize(input),stored={}; for(const id of Object.keys(ITEMS)){const room=Math.max(0,999999-clamp(resources?.[id],0,999999));stored[id]=Math.min(inventory[id],room);}
 const remaining={...inventory};for(const id of Object.keys(ITEMS))remaining[id]-=stored[id];
 return {inventory:remaining,stored,used:used(remaining),capacity:CAPACITY};
}
function withdraw(input,resources,id,amount=1){
 if(!ITEMS[id])throw Error('unknown_item');const qty=clamp(amount,1,ITEMS[id].maxStack);
 if(clamp(resources?.[id],0,999999)<qty)throw Error('insufficient_'+id);
 const result=add(input,id,qty);if(result.accepted!==qty)throw Error('inventory_full');
 return {inventory:result.inventory,resources:{...resources,[id]:clamp(resources[id],0,999999)-qty},taken:qty,used:result.used,capacity:CAPACITY};
}
module.exports={ITEMS,CAPACITY,normalize,used,add,remove,stash,withdraw};
