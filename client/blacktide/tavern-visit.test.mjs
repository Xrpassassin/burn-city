import assert from 'node:assert/strict';
import {canEnterTavern} from './tavern-visit.mjs';
assert.equal(canEnterTavern(true,{x:-61,z:-85.5}),true);
assert.equal(canEnterTavern(false,{x:-61,z:-85.5}),false);
assert.equal(canEnterTavern(true,{x:-50,z:-85.5}),false);
assert.equal(canEnterTavern(true,{x:NaN,z:-85.5}),false);
console.log('Tavern entry tests passed');
