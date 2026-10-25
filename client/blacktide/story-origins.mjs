// BlackTide story and character origin rules.
// Origin choice must be validated and persisted by the authenticated server before any rewards.
export const ORIGINS = Object.freeze({
  deserter: Object.freeze({name:'The Deserter',track:'sailing',openingQuest:'orders-in-ashes',description:'A naval officer who refused an unjust order.'}),
  smuggler: Object.freeze({name:'The Smuggler',track:'trade',openingQuest:'the-broken-ledger',description:'A trader betrayed by the merchant guild.'}),
  privateer: Object.freeze({name:'The Privateer',track:'combat',openingQuest:'letters-of-blood',description:'A Crown hunter abandoned by the Crown.'}),
  castaway: Object.freeze({name:'The Castaway',track:'exploration',openingQuest:'the-fractured-chart',description:'A survivor carrying a fragment of a lost map.'})
});
export const ORIGIN_START_XP=100;
export const ACT_ONE=Object.freeze({
  id:'the-broken-crown',
  name:'The Broken Crown',
  startPort:'cinder-cove',
  sharedQuest:'the-cove-conspiracy',
  chapters:Object.freeze(['Arrival at Cinder Cove','The Missing Fleet','A Price on Freedom'])
});
export function originPreview(id) {
  if(!Object.hasOwn(ORIGINS,id)) return null;
  const o=ORIGINS[id];
  return {id,name:o.name,description:o.description,openingQuest:o.openingQuest,startingBonus:{track:o.track,xp:ORIGIN_START_XP},sharedQuest:ACT_ONE.sharedQuest};
}
export function availableOpeningQuests(originId,completed=[]) {
  const origin=originPreview(originId);
  if(!origin) return [];
  const done=new Set(Array.isArray(completed)?completed:[]);
  return [origin.openingQuest,ACT_ONE.sharedQuest].filter(id=>!done.has(id));
}
