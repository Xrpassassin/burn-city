// BlackTide faction lore and pure reputation rules.
// Reputation updates must be awarded by authenticated server-side quest outcomes.
export const FACTIONS=Object.freeze({
 'iron-crown':{name:'The Iron Crown',ethos:'order',rivals:['freewater','ashen-veil'],origin:'A navy fractured by its own blockade.',home:'fort-ironwake'},
 'freewater':{name:'Freewater Brotherhood',ethos:'freedom',rivals:['iron-crown','gilded-exchange'],origin:'Independent captains united after the Broken Fleet betrayal.',home:'freewater-anchorage'},
 'gilded-exchange':{name:'The Gilded Exchange',ethos:'commerce',rivals:['freewater'],origin:'Merchant houses that financed both the blockade and resistance.',home:'saltmere'},
 'ashen-veil':{name:'The Ashen Veil',ethos:'secrecy',rivals:['iron-crown'],origin:'Smugglers and informants who witnessed the fleet disappear.',home:'cinder-cove'},
 'tidebound':{name:'The Tidebound Order',ethos:'discovery',rivals:[],origin:'Navigators preserving maps older than the royal charts.',home:'hidden-atoll'}
});
export const MIN_REPUTATION=-100;
export const MAX_REPUTATION=100;
export function reputationTier(value) {
 const v=Number.isFinite(value)?Math.max(MIN_REPUTATION,Math.min(MAX_REPUTATION,value)):0;
 return v<=-60?'hunted':v<=-20?'hostile':v<20?'neutral':v<60?'trusted':'allied';
}
export function factionStanding(reputation={}) {
 return Object.fromEntries(Object.entries(FACTIONS).map(([id,f])=>{
   const raw=reputation[id];
   const score=Number.isFinite(raw)?Math.max(MIN_REPUTATION,Math.min(MAX_REPUTATION,Math.trunc(raw))):0;
   return [id,{name:f.name,score,tier:reputationTier(score)}];
 }));
}
export function previewFactionChange(reputation,factionId,delta) {
 if(!Object.hasOwn(FACTIONS,factionId)||!Number.isSafeInteger(delta)||Math.abs(delta)>25)return null;
 const current=factionStanding(reputation)[factionId].score;
 const next=Math.max(MIN_REPUTATION,Math.min(MAX_REPUTATION,current+delta));
 return {factionId,before:current,after:next,tier:reputationTier(next)};
}
