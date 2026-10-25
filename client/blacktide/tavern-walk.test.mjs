import assert from 'node:assert/strict';
import {nextTavernPosition,nearSilas} from './tavern-walk.mjs';
assert.deepEqual(nextTavernPosition({x:0,z:-3},0,-1,1),{x:0,z:-3.27});
assert.equal(nextTavernPosition({x:0,z:1.4},0,1,1).z,1.45);
assert.deepEqual(nextTavernPosition({x:-1.2,z:-1},-1,0,.1),{x:-1.2,z:-1});
assert.equal(nearSilas({x:0,z:1.2}),true);
assert.equal(nearSilas({x:0,z:-3}),false);
console.log('Tavern freewalk rules passed');
