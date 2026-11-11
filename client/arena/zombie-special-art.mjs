// New body-horror skins are staged for ORIGINAL Zombies only, never Homefront.
// A model is playable only after its locally bundled GLB and animation profile
// have been inspected and explicitly enabled in community-art-intake.mjs.
import {enabledCommunityArt} from './community-art-intake.mjs';

const ROLES=Object.freeze(['Idle','Walk','Run','Idle_Attack','HitReact','Death']);
export function enabledZombieSpecials(entries){
 return enabledCommunityArt('zombies',entries).map(spec=>Object.freeze({
  ...spec,special:true,id:spec.id,kind:spec.id==='living-flesh-blob'?'pulsing-crawler':'mutant-nurse'
 }));
}
export function zombieSpecialModelForType(type,readySpecs){
 const preferred=type===8?'mutant-nurse':type===5?'living-flesh-blob':null;
 return preferred&&readySpecs.some(spec=>spec.id===preferred)?preferred:null;
}
export function zombieSpecialClipAliases(spec,clipNames=[]){
 const clips=clipNames.filter(name=>typeof name==='string');
 const find=(pattern)=>clips.find(name=>pattern.test(name));
 const idle=find(/idle|rest|breathe|pulse|breath/i)||clips[0];
 const walk=find(/walk|crawl|move|creep|run/i);
 const attack=find(/attack|hit|slash|melee|bite|swing/i);
 const death=find(/dead|death|die|fall/i);
 if(!idle)return new Map();
 // Flesh growths never have human leg locomotion: use the real PBR pulsing
 // clip at the same time as server-authoritative crawling movement.
 const isBlob=spec?.id==='living-flesh-blob';
 const aliases={
  Idle:idle,Walk:isBlob?idle:walk,Run:isBlob?idle:walk,
  Idle_Attack:isBlob?idle:attack,HitReact:find(/hurt|react|flinch/i),Death:death
 };
 return new Map(ROLES.filter(role=>aliases[role]).map(role=>[role,aliases[role]]));
}
export function zombieSpecialModelHeight(spec,normalHeight){
 const desired=Number(spec?.targetHeight);
 return Number.isFinite(desired)?Math.max(.7,Math.min(3.2,desired)):normalHeight;
}
