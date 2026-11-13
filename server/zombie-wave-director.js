'use strict';
// Pure encounter composition for unranked, non-daily Zombies only.
// No entities, networking, combat, rewards, or mutable RNG state.
const STYLES=Object.freeze(['runner_surge','crawler_ambush','brute_push','mixed_pressure']);
const LABELS=Object.freeze({
 runner_surge:'Fast movement detected. Watch the flanks.',
 crawler_ambush:'Movement near the floor. Check the corners.',
 brute_push:'Heavy footsteps approaching. Hold your ground.',
 mixed_pressure:'Multiple infected signatures approaching.'
});
function hash(value){
 let h=2166136261;
 for(const c of String(value)){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}
 return h>>>0;
}
function bounded(n,min,max,fallback){
 return Number.isSafeInteger(n)?Math.max(min,Math.min(max,n)):fallback;
}
function planFreeplayWave({roomId='',mapId='refinery',wave=1,partySize=1}={}){
 const w=bounded(wave,1,1000,1),players=bounded(partySize,1,8,1);
 const map=mapId==='cosmodrome'?'cosmodrome':'refinery';
 const style=w<4?'early_pressure':STYLES[hash(map+':'+roomId+':'+w)%STYLES.length];
 // Preserve the authoritative 2.5s initial wave delay and existing population cap.
 // Alter only freeplay inter-spawn pacing modestly; never bank a backlog.
 const multiplier=style==='runner_surge'?0.88:
  style==='brute_push'?1.10:style==='crawler_ambush'?1.04:1;
 const warning=w>=4?LABELS[style]:null;
 return Object.freeze({
  wave:w,partySize:players,mapId:map,style,spawnGapMultiplier:multiplier,
  warning,initialSpawnDelaySeconds:2.5,
  rankedOrDailyAllowed:false,combatOrHitboxChanges:false
 });
}
function chooseFreeplayZombieType({plan,baseType,spawnIndex}={}){
 if(!plan||!Number.isSafeInteger(baseType)||baseType<0||baseType>8)
  throw Error('valid_wave_plan_and_archetype_required');
 if(!Number.isSafeInteger(spawnIndex)||spawnIndex<1)throw Error('valid_spawn_index_required');
 // Never change the original special-type selection: flyers (6), ranged (7)
 // and Warden (8) retain their existing map/wave/boss legality.
 if(baseType>=3||plan.wave<4)return baseType;
 const n=spawnIndex;
 if(plan.style==='runner_surge'&&n%5===2)return 1;
 if(plan.style==='crawler_ambush'&&plan.wave>=6&&n%7===3)return 5;
 if(plan.style==='brute_push'&&plan.wave>=5&&n%8===4)return 2;
 if(plan.style==='mixed_pressure'){
  if(n%10===2)return 1;
  if(n%10===5&&plan.wave>=6)return 5;
  if(n%10===8&&plan.wave>=5)return 2;
 }
 return baseType;
}
// Preview a single containment infected at the start of select late Cosmodrome waves.
function isContainmentWave({ mapId, wave, ranked, daily, enabled } = {}) {
 return enabled === true && mapId === 'cosmodrome' && !ranked && !daily
  && Number.isSafeInteger(wave) && wave >= 10 && wave % 4 === 2;
}
module.exports={planFreeplayWave,chooseFreeplayZombieType,isContainmentWave,STYLES};
