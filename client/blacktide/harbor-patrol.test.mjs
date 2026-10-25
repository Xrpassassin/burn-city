import assert from 'node:assert/strict';
import {HARBOR_ROUTES,samplePatrol} from './harbor-patrol.mjs';
assert.equal(HARBOR_ROUTES.length,3);
assert.deepEqual(samplePatrol([[0,0],[2,0]],1),{x:1,z:0,heading:Math.PI/2});
assert.equal(samplePatrol([[0,0],[2,0]],4).x,0);
assert.equal(samplePatrol([[0,0],[0,0]],1),null);
console.log('Harbor patrol tests passed');
