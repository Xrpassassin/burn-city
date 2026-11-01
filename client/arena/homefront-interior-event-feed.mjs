// Display-only deduplication of the server's building-scoped event feed.
// A new entrant sees current room state without replaying old alarms; later
// events are shown once regardless of the two world/presence poll cadences.
export function nextInteriorEvent(previous = null, instance = null) {
  if (!instance?.id || !Array.isArray(instance?.mechanisms?.events))
    return { state:null,event:null };
  const entries=instance.mechanisms.events.filter(e=>e &&
    typeof e.id==='string' && e.landmarkId===instance.landmarkId &&
    Number.isSafeInteger(e.at) && e.at>0 && Number.isSafeInteger(Number(e.id.split(':').at(-1))) &&
    ['evidence','scavenge','power','alarm','mechanism'].includes(e.kind));
  const last=entries.reduce((max,e)=>Math.max(max,Number(e.id.split(':').at(-1))),0);
  if (previous?.instanceId!==instance.id) {
    return {state:{instanceId:instance.id,lastSeq:last},event:null};
  }
  const newest=entries.filter(e=>Number(e.id.split(':').at(-1))>(previous.lastSeq||0))
    .sort((a,b)=>Number(b.id.split(':').at(-1))-Number(a.id.split(':').at(-1)))[0]||null;
  return {state:{instanceId:instance.id,lastSeq:Math.max(previous.lastSeq||0,last)},event:newest};
}
