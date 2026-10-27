// Fishing location policy for the shared Estates Lake.
// Describes accessible fishing stations; casting and catches remain owned by the existing fishing system.
// Private permissions MUST be resolved server-side using authenticated property rights/invitations.
const point=(x,z)=>Object.freeze({x,y:0.2,z});
export function buildEstatesLakeFishingSpots(manifest){
 if(!manifest||!Array.isArray(manifest.lots))throw new TypeError('island manifest required');
 const spots=[
  {id:'estates-public-dock',name:'Estates Public Fishing Dock',shore:'island',kind:'public-dock',position:point(75,112),access:'public'},
  {id:'estates-north-bank',name:'North Shore Fishing Bank',shore:'island',kind:'bank',position:point(0,-130),access:'public'},
  {id:'estates-west-bank',name:'Woodland Fishing Bank',shore:'island',kind:'bank',position:point(-128,0),access:'public'},
  {id:'estates-outer-bank-east',name:'Outer Lake East Fishing Pier',shore:'outer',kind:'public-dock',position:point(190,0),access:'public'},
  {id:'estates-outer-bank-west',name:'Outer Lake West Fishing Pier',shore:'outer',kind:'public-dock',position:point(-190,0),access:'public'}
 ];
 // Only shoreline mansions qualify for a private dock. Never place docks on inland lots.
 for(const lot of manifest.lots){
  if(lot.tier!=='mansion'||!lot.propertyId)continue;
  const {x,z}=lot.position;
  const rx=x/140,rz=z/150;
  const shoreDistance=Math.hypot(rx,rz);
  if(shoreDistance<0.63)continue;
  const norm=Math.hypot(x,z);
  if(norm<1)continue;
  spots.push({id:'estates-private-dock-'+lot.propertyId,name:lot.address+' Private Dock',shore:'island',kind:'private-dock',position:point(x/norm*136,z/norm*145),access:'property-rights',propertyId:lot.propertyId});
 }
 return Object.freeze(spots.map(s=>Object.freeze(s)));
}
export function canUseEstatesFishingSpot(spot,{hasVerifiedPropertyAccess=false}={}){
 if(!spot||typeof spot!=='object')throw new TypeError('fishing spot required');
 return spot.access==='public'||(spot.access==='property-rights'&&hasVerifiedPropertyAccess===true);
}
