'use strict';
// Contract: unique permanent Homefront sites within ONE authoritative public
// expedition. Starter bases are account-owned; roads, loot and nearby players
// are shared. Tests use fixture positioning ONLY to simulate the walk, not a
// production teleport route or a separate world instance.
const assert=require('node:assert/strict');
const World=require('../server/homefront-world');
const Loot=require('../server/homefront-loot');
const Inventory=require('../server/homefront-inventory');
const Collision=require('../server/homefront-collision');

let world=World.defaultWorld();
const survivors=['alpha','bravo','charlie','delta','echo'];
const homes={};
for(const [i,account] of survivors.entries()){
 const entered=World.enter(world,account,1000+i*50);
 world=entered.world;
 homes[account]=entered.result.refugeReturn;
 assert.ok(homes[account] && Collision.isSafePosition(homes[account].x,homes[account].z),
   'every survivor receives a reachable physical Homefront entry');
 if(i===0)assert.equal(entered.result.self.spawn,'north_gate',
   'first survivor starts in Pine Crossing');
 for(const other of survivors.slice(0,i))if(homes[other]){
  assert.ok(Math.hypot(homes[account].x-homes[other].x,homes[account].z-homes[other].z)>=14,
    'separate Homefront reservations must never share a footprint');
 }
}
assert.equal(Object.keys(world.refugeEntries).length,survivors.length);
assert.equal(new Set(Object.values(world.refugeEntries)).size,survivors.length);
const start=World.snapshot(world,'alpha',2000);
assert.equal(start.players.length,1,'distant strangers do not cost rendering bandwidth');
assert.equal(start.refugeEntries,undefined,'private Homefront assignments are never broadcast');
assert.deepEqual(start.refugeReturn,homes.alpha);

const node=Loot.NODES.find(v=>v.id==='loot_pine_logging_kit');
assert.ok(node);
const here=[node.x,node.z];
for(const account of ['alpha','bravo']){
 Object.assign(world.players[account],{x:here[0],z:here[1],lastSeen:3000});
}
const alpha=World.snapshot(world,'alpha',3000);
const bravo=World.snapshot(world,'bravo',3000);
assert.equal(alpha.players.length,2,'survivors encounter other players on foot in the same shared world');
assert.equal(bravo.players.length,2,'nearby-player interest is reciprocal');
assert.equal(alpha.players[0].x,bravo.players[0].x);
assert.deepEqual(alpha.world.pointsOfInterest,bravo.world.pointsOfInterest,
  'both view the same world map and landmarks');
assert.notDeepEqual(alpha.refugeReturn,bravo.refugeReturn,
  'meeting does not move or merge the distinct Homefront reservations');
assert.ok(alpha.self.risk < bravo.self.risk,
  'at the same salvage site, the survivor farther from their own Homefront faces higher risk');

const claim=Loot.claim(world.lootNodes,{
 account:'alpha',player:world.players.alpha,nodeId:node.id,now:3100,
 addItem:(inventory,item,amount)=>Inventory.add(inventory,item,amount)
});
world.lootNodes=claim.state;
assert.ok(claim.accepted.length>0,'shared-world scavenging grants only server-selected items');
assert.equal(World.snapshot(world,'bravo',3150).world.lootNodes.find(n=>n.id===node.id).available,false,
  'the other survivor immediately sees the same depleted cache');
assert.throws(()=>Loot.claim(world.lootNodes,{
 account:'bravo',player:world.players.bravo,nodeId:node.id,now:3200,
 addItem:(inventory,item,amount)=>Inventory.add(inventory,item,amount)
}),/loot_node_empty/,'a second account cannot loot a separate copy of the same crate');

const before=world.refugeEntries.bravo;
world=World.leave(world,'bravo',3500).world;
const back=World.enter(JSON.parse(JSON.stringify(world)),'bravo',3600);
world=back.world;
assert.equal(world.refugeEntries.bravo,before,
  'offline return retains the same Homefront gate in the persistent shared map');
assert.deepEqual(back.result.refugeReturn,homes.bravo);
assert.deepEqual({x:back.result.self.x,z:back.result.self.z},homes.bravo,
  'returning from a refuge never instantiates a new map or spawns at another player\'s home');
assert.equal(back.result.world.lootNodes.find(n=>n.id===node.id).available,false,
  'shared scavenging state survives a different player leaving and returning');
console.log('Homefront: five separate persistent player Homefronts inside one shared overworld; reciprocal presence and shared loot');
