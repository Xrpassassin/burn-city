// BlackTide voyage event previews. Pure rules; no client-issued rewards or combat outcomes.
export const EVENTS = Object.freeze([
  { id:'merchant-distress', title:'Merchant in Distress', track:'commerce', minLevel:1, weight:4, options:['escort','ignore'] },
  { id:'uncharted-wreck', title:'Uncharted Wreck', track:'exploration', minLevel:1, weight:3, options:['investigate','mark-chart'] },
  { id:'rough-seas', title:'Rough Seas', track:'sailing', minLevel:1, weight:4, options:['navigate','shelter'] },
  { id:'pirate-patrol', title:'Hostile Patrol', track:'combat', minLevel:4, weight:2, options:['engage','evade'] },
  { id:'rare-cargo', title:'Rare Cargo Rumor', track:'commerce', minLevel:3, weight:2, options:['follow-lead','ignore'] }
]);
function hash(seed) {
  let n=2166136261;
  for (const ch of String(seed)) n=Math.imul(n ^ ch.charCodeAt(0),16777619);
  return n>>>0;
}
export function voyageEvent({ seed, level=1, protectedWaters=true }={}) {
  if (typeof seed !== 'string' && typeof seed !== 'number') return null;
  const eligible=EVENTS.filter(e=>e.minLevel<=level && (!protectedWaters || e.id!=='pirate-patrol'));
  const total=eligible.reduce((n,e)=>n+e.weight,0);
  if (!total) return null;
  let pick=hash(seed)%total;
  for (const e of eligible) { if(pick<e.weight) return {id:e.id,title:e.title,track:e.track,options:[...e.options]};pick-=e.weight; }
  return null;
}
export function validVoyageChoice(eventId, choice) {
  return EVENTS.some(e=>e.id===eventId && e.options.includes(choice));
}
