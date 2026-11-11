// Deterministic, renderer-independent animated-zombie visual policy.
// Visual presentation only. No hitbox, combat, networking or server rules.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function zombieModelPolicy({
 low=false,search='',hardwareConcurrency,deviceMemory,userAgent='',
 saveData=false,reducedMotion=false
}={}){
 const params=new URLSearchParams(String(search).replace(/^\?/,'')),
  override=params.get('zombieModels');
 const explicitlyOn=override==='1',explicitlyOff=override==='0';
 const mobile=/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent);
 const cores=Number.isFinite(hardwareConcurrency)?hardwareConcurrency:mobile?2:4;
 // Safari does not expose deviceMemory. Do not mistake a modern 6-core
 // iPhone for a 2GB budget and force its entire horde into goblin fallbacks.
 // Unknown-memory mobiles with at least six cores get a conservative TWO rigs.
 const unknownMobileMemory=mobile&&!Number.isFinite(deviceMemory);
 const ram=Number.isFinite(deviceMemory)?deviceMemory:mobile?2:4;
 const capable=mobile?cores>=6&&(ram>=4||unknownMobileMemory):cores>=4&&ram>=4;
 const enabled=!explicitlyOff&&(explicitlyOn||(!low&&!saveData&&!reducedMotion&&capable));
 const maxModels=enabled?clamp(mobile?(low||saveData||unknownMobileMemory?2:3):low?3:8,1,8):0;
 const maxDistance=enabled?(mobile&&unknownMobileMemory?16:mobile?20:28):0;
 return Object.freeze({
  enabled,explicit:explicitlyOn,reason:explicitlyOff?'manual_off':
   !enabled?'performance_or_accessibility':explicitlyOn?'manual_on':'capable_device',
  maxModels,maxDistance,
  proceduralHordeFallback:true
 });
}
