import assert from 'node:assert/strict';
import {estateFurnitureQuality,estateFurnitureQualityName,dressSecretRoom} from './estates-furniture-quality.mjs';
import {createHomePlan} from './estates-home-plans.mjs';
import {createSecretRoomLayout} from './estates-secret-layout.mjs';

assert.equal(estateFurnitureQuality({tour:true,upgrades:['a','b','c','d','e']}),0);
assert.equal(estateFurnitureQuality({upgrades:[]}),0);
assert.equal(estateFurnitureQuality({upgrades:['porch-lights']}),0);
assert.equal(estateFurnitureQuality({upgrades:['porch-lights','flower-garden']}),1);
assert.equal(estateFurnitureQuality({upgrades:['a','b','c','d','e']}),2);
assert.equal(estateFurnitureQualityName(0),'basic');
assert.equal(estateFurnitureQualityName(1),'furnished');
assert.equal(estateFurnitureQualityName(2),'premium');

const basic=createHomePlan({tier:'trailer'});
const mid=createHomePlan({tier:'trailer',upgrades:['porch-lights','flower-garden']});
const prem=createHomePlan({tier:'trailer',upgrades:['a','b','c','d','e']});
const tour=createHomePlan({tier:'trailer',upgrades:['a','b','c','d','e'],tour:true});
assert.equal(basic.quality,0);
assert.equal(mid.quality,1);
assert.equal(prem.quality,2);
assert.equal(tour.quality,0);
assert(prem.items.filter(i=>String(i.id).startsWith('quality-')).length>basic.items.filter(i=>String(i.id).startsWith('quality-')).length,
 'premium trailer receives extra quality furnishings');
assert(!basic.items.some(i=>String(i.id).startsWith('upgrade-')),'basic plans still ship no typoon upgrade geometry');
assert(prem.items.some(i=>i.model?.id==='armchair'||i.id.includes('case')||i.id.includes('rug')||i.model?.id==='snake'),
 'premium dressing uses shipped CC BY models or glass cases, not a new hero mesh');
assert.equal(createHomePlan({tier:'starter',tour:true,upgrades:['a','b','c','d','e']}).quality,0);

const startPrem=createHomePlan({tier:'starter',upgrades:['a','b','c','d','e']});
assert.equal(startPrem.quality,2);
assert(startPrem.items.some(i=>i.model?.id==='chandelier'),'premium starter homes tall enough for a chandelier get one');

const bunker=createSecretRoomLayout('bunker',{upgrades:['a','b','c','d','e']});
assert(bunker.quality===2);
assert(bunker.items.some(i=>String(i.id).startsWith('quality-')),'premium bunkers gain extra dressing');
const tourBunker=createSecretRoomLayout('bunker',{upgrades:['a','b','c','d','e'],tour:true});
assert.equal(tourBunker.quality,0);
assert(!tourBunker.items.some(i=>String(i.id).startsWith('quality-')),'tours do not get premium secret-room dressing');

// Dressing helper on an empty list should not crash.
dressSecretRoom([], 'lounge', 2, {low:true});
console.log('Estates furniture quality: upgrade-count tiers, tour stays basic, premium dressing uses shipped models passed');
