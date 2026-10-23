'use strict';
// Homefront physical scavenging nodes. Original implementation using authored locations
// and server-side weighted tables; presentation clients never supply loot quantities.
const NODES = Object.freeze([
  {id:'loot_bus_depot',label:'Bus Depot Supply Crate',x:-8,z:-65,district:'outskirts',risk:1,kind:'supplies'},
  {id:'loot_river_checkpoint',label:'River Checkpoint Backpack',x:62,z:-20,district:'outskirts',risk:1,kind:'medical'},
  {id:'loot_wrecked_depot',label:'Wrecked Depot Cache',x:14,z:72,district:'outskirts',risk:1,kind:'materials'},
  {id:'loot_old_rail_yard',label:'Rail Yard Tool Case',x:-73,z:17,district:'outskirts',risk:2,kind:'materials'},
  {id:'loot_exchange_market',label:'Market Ration Crate',x:-38,z:32,district:'commercial',risk:3,kind:'supplies'},
  {id:'loot_mercy_hospital',label:'St. Mercy Medical Case',x:24,z:30,district:'hospital',risk:3,kind:'medical'},
  {id:'loot_ironworks',label:'Ironworks Salvage Bin',x:-16,z:22,district:'industrial',risk:4,kind:'materials'},
  {id:'loot_research_annex',label:'Research Annex Field Locker',x:-4,z:6,district:'research_lab',risk:5,kind:'highrisk'}
]);
const COOLDOWN_MS = 180000;
const RADIUS = 9;
const TABLES = Object.freeze({
 supplies:[['food',2,4,5],['water',1,3,4],['ammo',1,3,3],['scrap',1,2,2]],
 medical:[['meds',1,3,5],['water',1,2,3],['food',1,2,2],['ammo',1,2,1]],
 materials:[['scrap',2,5,5],['wood',1,4,4],['ammo',1,3,2],['food',1,2,1]],
 highrisk:[['scrap',3,6,5],['meds',1,3,4],['ammo',2,5,4],['water',1,3,3],['food',1,3,2],['wood',1,3,1]]
});
const clamp=(n,min,max)=>Math.max(min,Math.min(max,Number.isFinite(n)?Math.floor(n):min));
function normalize(input={}) {
 const out={};
 for(const node of NODES) {
  const value=input && input[node.id];
  out[node.id]={readyAt:clamp(value?.readyAt,0,Number.MAX_SAFE_INTEGER),claimedBy:typeof value?.claimedBy==='string'?value.claimedBy.slice(0,24):null};
 }
 return out;
}
function publicNodes(state,now=Date.now()) {
 const s=normalize(state);
 return NODES.map(({id,label,x,z,district,risk,kind})=>({id,label,x,z,district,risk,kind,available:s[id].readyAt<=now,readyAt:s[id].readyAt}));
}
function claim(input,{account,player,nodeId,now=Date.now(),addItem}) {
 if(!player) throw Error('not_in_expedition');
 const node=NODES.find(n=>n.id===nodeId);
 if(!node) throw Error('unknown_loot_node');
 if(Math.hypot(player.x-node.x,player.z-node.z)>RADIUS) throw Error('too_far_from_loot');
 const state=normalize(input), current=state[node.id];
 if(current.readyAt>now) throw Error('loot_node_empty');
 // Deterministic per-player roll avoids client-controlled randomness and makes retries inspectable.
 let seed=2166136261;
 for(const ch of account+':'+node.id+':'+Math.floor(now/COOLDOWN_MS)) seed=Math.imul(seed^ch.charCodeAt(0),16777619)>>>0;
 const table=TABLES[node.kind];
 const roll=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const drops=[];
 const count=node.risk>=4?3:2;
 for(let i=0;i<count;i++){
  const total=table.reduce((n,row)=>n+row[3],0);let r=roll()*total, chosen=table[0];
  for(const row of table){r-=row[3];if(r<0){chosen=row;break;}}
  const amount=chosen[1]+Math.floor(roll()*(chosen[2]-chosen[1]+1));
  if(!drops.some(d=>d.item===chosen[0])) drops.push({item:chosen[0],amount});
  else drops.find(d=>d.item===chosen[0]).amount+=amount;
 }
 const accepted=[],overflow=[];
 for(const drop of drops){
  const result=addItem(player.inventory,drop.item,drop.amount);
  player.inventory=result.inventory;
  if(result.accepted)accepted.push({item:drop.item,amount:result.accepted});
  if(result.rejected)overflow.push({item:drop.item,amount:result.rejected});
 }
 state[node.id]={readyAt:now+COOLDOWN_MS,claimedBy:String(account).slice(0,24)};
 return {state,node:{id:node.id,label:node.label,readyAt:state[node.id].readyAt},accepted,overflow,inventory:player.inventory};
}
module.exports={NODES,COOLDOWN_MS,RADIUS,normalize,publicNodes,claim};
