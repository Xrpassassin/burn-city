// Diegetic survivor vignettes. Existing shared-world rescue POIs and the
// server's /world/rescue endpoint remain authoritative for ownership, costs,
// cooldown, rarity, companions and loot. No per-client generated rewards.
export const SURVIVOR_SCENES=Object.freeze({
 stranded_bus:Object.freeze({
  role:'Stranded driver',
  call:'A survivor waves from behind a stranded bus. "Can you spare supplies? The road is crawling."',
  prompt:'Help the stranded driver · 2 food + 1 ammo'
 }),
 collapsed_apartments:Object.freeze({
  role:'Apartment survivor',
  call:'A desperate voice rises from the apartments. "There are more people out there. Please help."',
  prompt:'Help the apartment survivor · 2 food + 1 ammo'
 }),
 quarantine_shelter:Object.freeze({
  role:'Quarantine survivor',
  call:'A masked survivor peers from the shelter. "I can help your camp. Get me away from here."',
  prompt:'Help the shelter survivor · 2 food + 1 ammo'
 })
});
export const SURVIVOR_APPROACH_RADIUS=12;
export const SURVIVOR_INTERACT_RADIUS=5;
export const SURVIVOR_REPEAT_DELAY_MS=90000;
export function closestStrandedSurvivor(world,self,now=Date.now(),radius=SURVIVOR_APPROACH_RADIUS){
 if(!self||!Number.isFinite(self.x)||!Number.isFinite(self.z)||
   !Number.isFinite(now)||!Array.isArray(world?.pointsOfInterest))return null;
 let best=null;
 for(const poi of world.pointsOfInterest){
  if(!poi||poi.type!=='rescue'||!SURVIVOR_SCENES[poi.id]||
    !Number.isFinite(poi.x)||!Number.isFinite(poi.z)||
    (world.rescues?.[poi.id]?.readyAt||0)>now)continue;
  const x=poi.x+2.2,z=poi.z+0.35;
  const distance=Math.hypot(x-self.x,z-self.z);
  if(distance>radius||best&&distance>=best.distance)continue;
  best={id:poi.id,x,z,distance,
    ...SURVIVOR_SCENES[poi.id]};
 }
 return best;
}
export function survivorApproachCue(scene,seenAt,now=Date.now()){
 if(!scene||!Number.isFinite(now)||seenAt&&Number.isFinite(seenAt)&&now-seenAt<SURVIVOR_REPEAT_DELAY_MS)return null;
 return {id:scene.id,message:scene.call,at:now};
}
export function survivorInteraction(scene){
 if(!scene||scene.distance>SURVIVOR_INTERACT_RADIUS)return null;
 return {id:'rescue-survivor',targetId:scene.id,label:scene.prompt};
}
