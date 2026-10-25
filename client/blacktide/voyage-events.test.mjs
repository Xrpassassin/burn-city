import assert from 'node:assert/strict';
import { voyageEvent, validVoyageChoice } from './voyage-events.mjs';
assert.equal(voyageEvent({}),null);
assert.equal(voyageEvent({seed:'captain-1',level:1,protectedWaters:true}).id,voyageEvent({seed:'captain-1',level:1,protectedWaters:true}).id);
for(let i=0;i<100;i++) {
  const e=voyageEvent({seed:i,level:1,protectedWaters:true});
  assert.ok(e);assert.notEqual(e.id,'pirate-patrol');
  assert.equal(validVoyageChoice(e.id,e.options[0]),true);
}
assert.equal(validVoyageChoice('merchant-distress','steal-gold'),false);
assert.equal(validVoyageChoice('__proto__','ignore'),false);
console.log('BlackTide voyage event rules passed');
