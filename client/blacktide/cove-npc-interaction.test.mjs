import assert from 'node:assert/strict';
import {canTalkToMara} from './cove-npc-interaction.mjs';
const npc={x:-56,z:-87};
assert.equal(canTalkToMara(true,{x:-56,z:-87},npc),true);
assert.equal(canTalkToMara(true,{x:-56,z:-84},npc),true);
assert.equal(canTalkToMara(true,{x:-56,z:-80},npc),false);
assert.equal(canTalkToMara(false,{x:-56,z:-87},npc),false);
assert.equal(canTalkToMara(true,{x:NaN,z:-87},npc),false);
console.log('Cinder Cove NPC proximity tests passed');
