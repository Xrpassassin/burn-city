// Walk-up front doors for Estates homes, same pattern as the Ember Bar: walk to
// the door, press E (or tap) to go in; after leaving, the door stays quiet until
// the player has stepped away, so exiting never re-triggers an entry.
// Pure (no DOM/three); positions are island-local (lot.position + door offset).
export function homeDoorSpots(lots=[]){
 const out=[];
 for(const lot of lots){
  const f=lot?.buildingFootprint;if(!lot?.propertyId||!f)continue;
  const W=f.width-.6,D=f.depth-.6,doorX=lot.tier==='apartment'?0:-W*.24;
  out.push({propertyId:lot.propertyId,tier:lot.tier,address:lot.address||lot.propertyId,
   x:lot.position.x+doorX,z:lot.position.z+D/2+.75,
   outside:{x:lot.position.x+doorX,z:lot.position.z+D/2+1.45}});
 }
 return out;
}
export function createHomeDoorPrompt({radius=1.35,rearm=2.4,quietMs=4000,now=()=>Date.now()}={}){
 let current=null,armed=true,exitSpot=null,quietUntil=0;
 function update(position,spots){
  if(!position||!Array.isArray(spots))return {spot:null,changed:current!==null&&!(current=null)};
  let best=null,bestD=Infinity;
  for(const s of spots){const d=Math.hypot(position.x-s.x,position.z-s.z);if(d<bestD){bestD=d;best=s;}}
  if(!armed&&exitSpot&&Math.hypot(position.x-exitSpot.x,position.z-exitSpot.z)>rearm){armed=true;exitSpot=null;}
  const spot=armed&&now()>=quietUntil&&best&&bestD<=radius?best:null;
  const changed=(spot?.propertyId??null)!==(current?.propertyId??null);
  current=spot;
  return {spot,changed};
 }
 // Call when the player leaves a home through its front door.
 function exitedThrough(spot){armed=false;exitSpot=spot||null;quietUntil=now()+quietMs;current=null;}
 return {update,exitedThrough,get armed(){return armed;},get current(){return current;}};
}
