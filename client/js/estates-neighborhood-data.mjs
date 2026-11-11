// Site-measured, non-economic street furniture. All coordinates are island-local metres.
const fixture=(id,kind,x,z,w,h,d,extra={})=>Object.freeze({
 id,kind,position:Object.freeze({x,y:.13,z}),dimensions:Object.freeze({width:w,height:h,depth:d}),...extra
});
export function buildEstateNeighborhoodFurniture(lots=[]){
 const furniture=[];let n=0;
 for(const z of [-80,-32,35,83])for(const side of [-1,1])
  furniture.push(fixture('estates-streetlamp-'+(++n),'street-light',side*5.4,z,.34,5.1,.34,
   {roadId:'road-main-north-south',collisionRadius:.18}));
 for(const x of [-64,-29,29,64])
  furniture.push(fixture('estates-streetlamp-'+(++n),'street-light',x,13.5,.34,5.1,.34,
   {roadId:'road-main-east-west',collisionRadius:.18}));
 for(const side of [-1,1])for(const z of [-28,26])
  furniture.push(fixture('estates-streetlamp-'+(++n),'street-light',side*59.7,z,.34,5.1,.34,
   {roadId:side<0?'road-west-loop':'road-east-loop',collisionRadius:.18}));
 for(const lot of lots)if(lot.propertyId)
  furniture.push(fixture('estates-mailbox-'+lot.propertyId,'mailbox',
   lot.position.x+8.5,lot.position.z+7.65,.42,1.34,.65,
   {propertyId:lot.propertyId,lotId:lot.id,tier:lot.tier,collisionRadius:.25}));
 for(const [id,x,z] of [['north',5.5,-89],['east',44,13.5],['south',5.5,91]])
  furniture.push(fixture('estates-district-sign-'+id,'street-sign',x,z,2.15,2.85,.2,{collisionRadius:.19}));
 for(const [id,x,z] of [['plaza',6.8,30],['market',83,30],['kiosk',5.2,105]])
  furniture.push(fixture('estates-waste-bin-'+id,'waste-bin',x,z,.65,1.13,.65,{collisionRadius:.32}));
 return Object.freeze(furniture);
}
