'use strict';
// Authored, short-lived, server-owned shared interior events.
// Only catalog actions may create events; inputs never come from the client.
// Saved events are capped and contain no account identity or untrusted text.
const Catalog = require('../client/arena/homefront-interior-world.mjs');
const MAX_EVENTS = 6;
const EVENT_TTL_MS = 30_000;
const KINDS = Object.freeze({
  clue: Object.freeze({kind:'evidence',noise:0,prefix:'Evidence examined'}),
  inspect: Object.freeze({kind:'evidence',noise:0,prefix:'A detail was inspected'}),
  search: Object.freeze({kind:'scavenge',noise:18,prefix:'Someone searched'}),
  power: Object.freeze({kind:'power',noise:32,prefix:'Power controls activated'}),
  toggle: Object.freeze({kind:'alarm',noise:70,prefix:'LOUD ALARM: mechanism activated'}),
  unlock: Object.freeze({kind:'mechanism',noise:25,prefix:'Mechanical latch released'})
});
const validInt = v => Number.isSafeInteger(v) && v > 0;
function itemFor(landmarkId,actionId) {
  const site=Catalog.interiorForLandmark(landmarkId);
  return site?.interactables.find(item=>item.id===actionId) || null;
}
function sanitize(input,landmarkId) {
  const entry = input && typeof input==='object' && !Array.isArray(input) ? input : {};
  const eventSeq = validInt(entry.eventSeq) ? entry.eventSeq : 0;
  const saved = Array.isArray(entry.events) ? entry.events : [];
  const events = saved.filter(x => x && typeof x === 'object' && !Array.isArray(x) &&
    validInt(x.seq) && x.seq <= eventSeq && validInt(x.at) &&
    typeof x.actionId === 'string' && itemFor(landmarkId,x.actionId))
    .slice(-MAX_EVENTS).map(x=>({seq:x.seq,at:x.at,actionId:x.actionId}));
  return {eventSeq,events};
}
function record(sharedState,{landmarkId,actionId,now=Date.now()}={}) {
  const item=itemFor(landmarkId,actionId);
  if (!item || !KINDS[item.action] || !validInt(now)) throw new Error('invalid_interior_event');
  const saved=sanitize(sharedState,landmarkId);
  if (saved.eventSeq >= Number.MAX_SAFE_INTEGER-1) throw new Error('interior_event_sequence_exhausted');
  const seq=saved.eventSeq+1;
  const events=[...saved.events,{seq,actionId,at:now}].slice(-MAX_EVENTS);
  return { state:{...sharedState,eventSeq:seq,events}, event:publicEvent(landmarkId,events[events.length-1]) };
}
function publicEvent(landmarkId,saved) {
  const item=itemFor(landmarkId,saved?.actionId);
  const type=KINDS[item?.action];
  if (!type || !validInt(saved?.seq) || !validInt(saved?.at)) return null;
  return { id:landmarkId+':'+saved.seq,kind:type.kind,landmarkId,roomId:item.roomId,
    label:item.label,message:type.prefix+' — '+item.label,noise:type.noise,at:saved.at };
}
function recent(input,landmarkId,now=Date.now()) {
  const data=sanitize(input,landmarkId);
  if(!validInt(now))return [];
  return data.events.filter(e=>e.at<=now && now-e.at<=EVENT_TTL_MS)
    .map(e=>publicEvent(landmarkId,e)).filter(Boolean);
}
module.exports={MAX_EVENTS,EVENT_TTL_MS,normalize:sanitize,record,recent};
