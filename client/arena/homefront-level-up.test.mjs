import assert from 'node:assert/strict';
import {levelUpNotice} from './homefront-level-up.mjs';

assert.equal(levelUpNotice(null,{level:5}),null,
  'initial profile load must not announce levels already earned');
assert.equal(levelUpNotice(2,{level:2,skillPoints:1}),null,
  'duplicate sheet refreshes must never replay a level-up banner');
assert.equal(levelUpNotice(3,{level:2}),null,
  'a wallet or save change downward must not announce anything');
assert.equal(levelUpNotice(1,{level:31}),null,
  'invalid server levels must fail closed');
const normal=levelUpNotice(2,{level:3,skillPoints:2,attributePoints:7,perkPoints:1});
assert.deepEqual(normal,{level:3,gained:1,title:'🔥 LEVEL 3 REACHED',
  message:'1 level gained · 2 skill · 7 attribute · 1 Ember perk points unspent',
  action:'Open C.I.N.D.E.R.S. upgrades'});
const multiple=levelUpNotice(3,{level:6,skillPoints:5,attributePoints:8,perkPoints:2});
assert.equal(multiple.gained,3,'offline or delayed progression may cross multiple levels');
assert.ok(multiple.message.includes('3 levels gained'));
assert.equal(levelUpNotice(4,{level:5,skillPoints:'99',attributePoints:Infinity,perkPoints:-2})
  .message,'1 level gained · 0 skill · 0 attribute · 0 Ember perk points unspent',
  'malformed response values cannot invent upgrade claims');
assert.equal(levelUpNotice(2,null),null);
console.log('CINDERS level-up banner timing and server-bound points tests passed.');
