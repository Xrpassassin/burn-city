// Browser preview checks mirror the server's authoritative whitelist/collider
// validation. Server always revalidates on Save; client checks are UX only.
export const HOME_FURNITURE_SIZE=Object.freeze({
 sofa:[1.6,.8],'coffee-table':[1,.7],chair:[.7,.7],
 'dining-table':[1.25,.85],desk:[1.35,.7],bookshelf:[1,.4],
 bed:[1.6,1.8],plant:[.55,.55],'floor-lamp':[.4,.4]
});
export function validateHomePlacement(furniture,dimensions){
 if(!Array.isArray(furniture)||!dimensions||furniture.length>24)return false;
 const boxes=[];
 for(const p of furniture){
  if(!p||typeof p.id!=='string'||!/^[a-zA-Z0-9-]{1,36}$/.test(p.id)||
   boxes.some(x=>x.id===p.id)||!HOME_FURNITURE_SIZE[p.type]||
   !Number.isFinite(p.x)||!Number.isFinite(p.z)||
   Math.abs(p.x*2-Math.round(p.x*2))>.000001||Math.abs(p.z*2-Math.round(p.z*2))>.000001||
   ![0,90,180,270].includes(p.rotation))return false;
  const [w0,d0]=HOME_FURNITURE_SIZE[p.type],turned=p.rotation%180!==0;
  const w=turned?d0:w0,d=turned?w0:d0;
  if(Math.abs(p.x)+w/2>.98*dimensions.halfX||Math.abs(p.z)+d/2>.98*dimensions.halfZ)return false;
  if(Math.abs(p.x)<1.08+w/2&&p.z+d/2>dimensions.halfZ-1.35)return false;
  if(boxes.some(o=>Math.abs(o.x-p.x)<(o.w+w)/2+.11&&Math.abs(o.z-p.z)<(o.d+d)/2+.11))return false;
  boxes.push({id:p.id,x:p.x,z:p.z,w,d});
 }
 return true;
}
export function nextFurnitureSlot(type,furniture,dimensions){
 if(!HOME_FURNITURE_SIZE[type])return null;
 for(let z=-Math.floor((dimensions.halfZ-.5)*2)/2;z<dimensions.halfZ-1.5;z+=.5){
  for(let x=-Math.floor((dimensions.halfX-.5)*2)/2;x<dimensions.halfX-.5;x+=.5){
   const candidate={id:'draft-'+(furniture.length+1),type,x,z,rotation:0};
   if(validateHomePlacement([...furniture,candidate],dimensions))return candidate;
  }
 }
 return null;
}
