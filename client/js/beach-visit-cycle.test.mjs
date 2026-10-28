import assert from 'node:assert/strict';
import {beachVisitState} from './beach-visit-cycle.mjs';
for(const [t,stage] of [[0,'arrive'],[19,'arrive'],[20,'exit'],[30,'beach'],[76,'return'],[85,'depart'],[100,'arrive']])assert.equal(beachVisitState(t)?.stage,stage);
assert.equal(beachVisitState(50).visitor,1);
assert.equal(beachVisitState(90).progress,.5);
assert.deepEqual(beachVisitState(12),beachVisitState(112));
assert.equal(beachVisitState(NaN),null);
console.log('beach visit cycle tests passed');
