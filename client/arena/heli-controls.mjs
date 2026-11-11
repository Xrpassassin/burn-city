// Original Zombies' helicopter: pure audio attenuation and gun-seat UI state.
// Remains separate from Homefront and the rest of the Zombies audio mixer.
export function helicopterAudioGain(distance,{volume=0.3,muted=false,visible=true}={}) {
 if(!visible||muted)return 0;
 const d=Number.isFinite(distance)?Math.max(0,distance):170;
 const master=Number.isFinite(volume)?Math.max(0,Math.min(1,volume)):0.3;
 const proximity=Math.max(0,1-d/170);
 // Helicopter rotor is a background cue, not louder than weapons/teammates.
 return Math.min(.12,proximity*proximity*.12)*master;
}
export function helicopterGunnerControls(snapshot,me) {
 if(!Array.isArray(snapshot)||snapshot.length<11||snapshot[0]<2||snapshot[0]>3)
   return {aboard:false,mounted:false,available:false,seat:-1,canInteract:false};
 const aboard=Array.isArray(snapshot[2])&&snapshot[2].includes(me);
 const slots=Array.isArray(snapshot[5])?snapshot[5]:[];
 const seat=slots.indexOf(me);
 const mounted=aboard&&seat>=0;
 const available=slots.includes(0);
 return {aboard,mounted,available,seat:mounted?seat:-1,canInteract:aboard&&(mounted||available)};
}
