import assert from 'node:assert/strict';
import { burnIssuerMarker } from './amm-lock.js';
const key='rwgNTwrsZKPe7xYCy4emjFAYpgnuioHSkd-4255524E00000000000000000000000000000000';
assert.equal(burnIssuerMarker(key,true,true),true);
assert.equal(burnIssuerMarker(key,false,true),false);
assert.equal(burnIssuerMarker(key,true,false),false);
assert.equal(burnIssuerMarker('rOther-BURN',true,true),false);
assert.equal(burnIssuerMarker(key,null,true),false);
console.log('BURN issuer marker verification passed');
