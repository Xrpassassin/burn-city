import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {
  PINE_CROSSING_ROUTES, PINE_ROADSIDE_SITES, PINE_PATROLS,
  pineRouteDistance, pineSurfaceAt, pineAmbienceAt, inPineCrossing
} from '../client/arena/homefront-pine-crossing.mjs';
const require=createRequire(import.meta.url);
const Collision=require('../server/homefront-collision.js');
const Loot=require('../server/homefront-loot.js');

const relay=PINE_ROADSIDE_SITES.find(site=>site.id==='pine-relay-station');
const spur=PINE_CROSSING_ROUTES.find(route=>route.id==='relay-spur');
const watch=PINE_PATROLS.find(site=>site.id==='relay-watch');
const cache=Loot.NODES.find(node=>node.id==='loot_pine_relay_spares');
assert.ok(relay&&spur&&watch&&cache,'relay scenery, trail, infected patrol and salvage must share authored world');
assert.equal(relay.kind,'relay');
assert.equal(spur.surface,'gravel');
assert.equal(cache.kind,'highrisk');
assert.equal(cache.risk,4);
assert.equal(cache.trail,true);
assert.ok(inPineCrossing(relay.x,relay.z));
assert.ok(Math.hypot(cache.x-relay.x,cache.z-relay.z)<Loot.RADIUS);
assert.ok(pineRouteDistance(cache.x,cache.z)<=0,'the relay spares must sit on the walkable spur');
assert.equal(pineSurfaceAt(cache.x,cache.z),'gravel','relay has audible gravel footsteps');
assert.equal(Collision.isSafePosition(relay.x,relay.z),false,'radio hut base is physical cover');
assert.equal(Collision.isSafePosition(cache.x,cache.z),true,'do not spawn salvage inside solid cover or trees');
assert.equal(Collision.isSafePosition(watch.points[0][0],watch.points[0][1]),true,'relay patrol must spawn on reachable terrain');
assert.ok(watch.points.every(([x,z])=>inPineCrossing(x,z)));
assert.equal(pineAmbienceAt(relay.x,relay.z)?.kind,'metal','relay has a distinct spatial metal rattle');

const account='relay-scout',now=250000;
const addItem=(inventory,item,amount)=>({
  inventory:{...inventory,[item]:(inventory[item]||0)+amount},
  accepted:amount,rejected:0
});
const player={x:cache.x,z:cache.z,inventory:{}};
assert.throws(()=>Loot.claim({}, {account,player:{...player,x:0,z:0},nodeId:cache.id,now,addItem}),/too_far_from_loot/);
assert.throws(()=>Loot.claim({}, {account,player,nodeId:'loot_fake_relays',now,addItem}),/unknown_loot_node/);
const found=Loot.claim({}, {account,player,nodeId:cache.id,now,addItem});
assert.equal(found.node.id,cache.id);
assert.equal(found.accepted.length>0,true,'the longer route grants usable supplies');
assert.equal(found.accepted.reduce((sum,drop)=>sum+drop.amount,0)>0,true);
assert.equal(found.noise.level,Loot.noiseForRisk(4).level,'server controls higher noise at the risky salvage node');
assert.ok(found.noise.level>Loot.noiseForRisk(1).level,'radio search is more conspicuous than starter-route kits');
assert.equal(found.node.readyAt,now+Loot.COOLDOWN_MS);
assert.throws(()=>Loot.claim(found.state,{account:'other-scout',player,nodeId:cache.id,now:now+100,addItem}),/loot_node_empty/,
  'the shared cache cannot be claimed twice by changing account');
const again=Loot.claim(found.state,{account,player:{...player,inventory:{}},nodeId:cache.id,now:now+Loot.COOLDOWN_MS,addItem});
assert.ok(again.accepted.length>0,'the relay remains a renewable journey destination on server cooldown');
console.log('Pine relay: connected route, terrain/collision parity, spatial sound, patrol and server-authoritative high-risk salvage');
