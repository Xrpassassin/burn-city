import assert from 'node:assert/strict';
import { nextInteriorEvent } from './homefront-interior-event-feed.mjs';

const base={id:'homefront:building:exchange_market',landmarkId:'exchange_market'};
const event=(seq,kind='alarm',landmarkId='exchange_market')=>({
  id:landmarkId+':'+seq,at:1800000000000+seq,landmarkId,kind,
  message:'Shared building event '+seq,noise:kind==='alarm'?70:0
});
const instance=(events,props={})=>({...base,mechanisms:{events},...props});
const initial=nextInteriorEvent(null,instance([event(1)]));
assert.equal(initial.event,null,'joining a building must not replay an earlier alarm');
assert.equal(initial.state.lastSeq,1);
const shared=nextInteriorEvent(initial.state,instance([event(1),event(2)]));
assert.equal(shared.event.id,'exchange_market:2','new live event appears exactly once');
assert.equal(nextInteriorEvent(shared.state,instance([event(1),event(2)])).event,null,
  'full-world poll must not replay a presence-poll event');
assert.equal(nextInteriorEvent(shared.state,instance([event(3),event(4)])).event.id,'exchange_market:4',
  'latest event is shown if short polling gaps skip some actions');
assert.equal(nextInteriorEvent(shared.state,instance([event(3,'power','mercy_hospital')])).event,null,
  'forged cross-building event never appears');
assert.equal(nextInteriorEvent(shared.state,instance([{...event(7),at:Infinity}])).event,null,
  'bad timestamps do not create audiovisual effects');
assert.equal(nextInteriorEvent(shared.state,instance([{...event(7),kind:'client_defined'}])).event,null,
  'arbitrary client event types are excluded');
assert.equal(nextInteriorEvent(shared.state,instance([],{id:'homefront:building:ashfall_station',landmarkId:'ashfall_station'})).event,null,
  'switching buildings resets the per-instance seen sequence');
assert.equal(nextInteriorEvent(shared.state,null).state,null,'leaving clears event state');
assert.equal(nextInteriorEvent(null,{...base,mechanisms:{events:null}}).state,null);
console.log('Homefront multiplayer building event deduplication and room isolation tests passed.');
