import assert from 'node:assert/strict';
import { ORIGINS,ACT_ONE,originPreview,availableOpeningQuests } from './story-origins.mjs';
assert.equal(Object.keys(ORIGINS).length,4);
assert.equal(new Set(Object.values(ORIGINS).map(o=>o.track)).size,4);
assert.equal(new Set(Object.values(ORIGINS).map(o=>o.openingQuest)).size,4);
for(const id of Object.keys(ORIGINS)) {
 const p=originPreview(id);
 assert.equal(p.startingBonus.xp,100);
 assert.equal(availableOpeningQuests(id).length,2);
 assert.deepEqual(availableOpeningQuests(id,[p.openingQuest]),[ACT_ONE.sharedQuest]);
}
assert.equal(originPreview('invalid'),null);
assert.deepEqual(availableOpeningQuests('__proto__'),[]);
console.log('BlackTide story origin tests passed');
