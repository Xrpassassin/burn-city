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
 const ram=Number.isFinite(deviceMemory)?deviceMemory:mobile?2:4;
 // Never load 4 skinned GLB rigs on an automatically selected low-end phone.
 // A user opt-in enables a small preview even on constrained devices.
 const capable=mobile?cores>=6&&ram>=4:cores>=4&&ram>=4;
 const enabled=!explicitlyOff&&(explicitlyOn||(!low&&!saveData&&!reducedMotion&&capable));
 const maxModels=enabled?clamp(mobile?(low||saveData?2:3):low?3:8,1,8):0;
 const maxDistance=enabled?(mobile?20:28):0;
 return Object.freeze({
  enabled,explicit:explicitlyOn,reason:explicitlyOff?'manual_off':
   !enabled?'performance_or_accessibility':explicitlyOn?'manual_on':'capable_device',
  maxModels,maxDistance,
  proceduralHordeFallback:true
 });
}
