// Pure room layouts and third-person collision contract for private Estates Tycoon interiors.
// This does not authenticate a wallet. Server /interior-access is mandatory before entry.
export const ROOM_HALF=Object.freeze({x:7.7,z:7.15});
export const PRIVATE_ROOM_ORIGIN=Object.freeze({x:1040,y:0.16,z:440});
const P={bunker:{title:'Underground Command Bunker',theme:'industrial'},
 lounge:{title:'Hidden Garden Lounge',theme:'lounge'},
 'deluxe-lounge':{title:'Deluxe Secret Lounge',theme:'lounge'},
 workshop:{title:'Hobby Workshop',theme:'industrial'},
 arcade:{title:'Private Arcade',theme:'arcade'},
 vault:{title:'Bunker Vault Arcade',theme:'arcade'}};
export const PRIVATE_ROOMS=Object.freeze(Object.keys(P));
function box(id,x,y,z,w,h,d,mat,solid=false){return {id,x,y,z,w,h,d,mat,solid};}
function layoutFor(roomId){
 const room=P[roomId];if(!room)throw Error('unknown_private_room');
 const items=[],put=(...args)=>items.push(box(...args));
 // Shared load-bearing shell, segmented wall lighting and a clearly marked return door.
 put('floor',0,-.22,0,15.4,.38,14.3,'concrete');
 put('ceiling',0,4.75,0,15.4,.3,14.3,'ceiling');
 for(const z of [-7.15,7.15])put('wall-z-'+z,0,2.3,z,15.4,4.6,.32,'wall');
 for(const x of [-7.7,7.7])put('wall-x-'+x,x,2.3,0,.32,4.6,14.3,'wall');
 put('entry-door',0,2,6.94,2.1,3.8,.2,'steel');
 put('entry-arch',0,4.14,6.86,3.1,.32,.45,'accent');
 put('entry-threshold',0,.08,5.95,2.6,.16,1.3,'accent');
 put('side-door',7.4,2.2,0,.2,3.7,2.25,'steel');
 put('side-door-frame',7.32,4.17,0,.45,.25,3.1,'accent');
 for(let i=-2;i<=2;i++)put('ceiling-light-'+i,i*2.7,4.55,-1,1.25,.13,.28,'emissive');
 for(const x of [-6.8,6.8])for(const z of [-5.7,5.7])put('wall-lamp-'+x+'-'+z,x,2.55,z,.2,.5,.48,'emissive');
 if(roomId==='bunker'){
  put('floor-trim',0,.018,-2.5,11.5,.04,.24,'accent');
  put('command-console',3.6,.76,-4.8,3.3,1.48,1.05,'steel',true);
  put('command-screens',3.6,2.05,-5.2,3,.92,.18,'emissive');
  put('map-desk',0,.55,-2.4,3.25,1.05,1.65,'metal',true);
  put('map-surface',0,1.12,-2.4,2.9,.08,1.3,'screen');
  put('generator',-5.45,.78,-4.8,2.6,1.5,1.8,'red',true);
  put('generator-warning',-5.45,1.62,-4.8,1.4,.11,.28,'emissive');
  put('bunks',-5.6,.53,1.2,2.65,1.05,2.2,'steel',true);
  put('bunk-mattress',-5.6,1.09,1.2,2.3,.2,1.85,'fabric');
  put('supply-locker',5.6,1.4,2.5,1.65,2.8,1.45,'steel',true);
  put('vent-pipe',-4,4.2,-6.2,5.3,.27,.38,'metal');
 }else if(roomId==='lounge'||roomId==='deluxe-lounge'){
  put('lounge-rug',0,.035,-1.8,8.1,.07,5.6,'rug');
  put('sectional',-3.25,.65,-2.3,2.3,1.3,4.2,'fabric',true);
  put('sofa-back',-4.48,1.4,-2.3,.25,1.4,4.2,'velvet');
  put('coffee-table',.05,.44,-2,2.4,.85,1.3,'wood',true);
  put('media-console',3.9,.71,-5.5,3.5,1.42,.9,'wood',true);
  put('media-screen',3.9,2,-6.08,2.5,1.25,.2,'screen');
  put('neon-wall',-7.33,3,0,.14,.23,9.9,'emissive');
  for(const x of [-5.8,5.8])for(const z of [-5.25,4]){
   put('plant-pot-'+x+'-'+z,x,.38,z,.88,.76,.88,'wood',true);
   put('foliage-'+x+'-'+z,x,1.35,z,.78,1.55,.78,'green');
  }
  put('game-table',3.9,.55,2.5,2.1,1.05,1.8,'wood',true);
  if(roomId==='deluxe-lounge'){
   put('aquarium-frame',0,2.2,-6.8,5.8,2.4,.42,'metal');
   put('aquarium-glass',0,2.2,-6.5,5.1,1.85,.19,'water');
   put('aquarium-glow',0,3.1,-6.36,4.8,.12,.12,'emissive');
   put('planted-alcove',-5.5,2,-6.7,3,2.6,.45,'green');
  }
 }else if(roomId==='workshop'){
  put('workbench-main',-4.45,.72,-4.65,4.35,1.43,1.7,'wood',true);
  put('workbench-vise',-4.45,1.53,-4.75,.6,.2,.65,'steel');
  put('rack',5.6,1.5,-4.7,2.5,3,1.2,'steel',true);
  for(let i=0;i<3;i++)put('rack-shelf-'+i,5.6,.55+i*.75,-4.5,2.35,.14,1.05,'accent');
  put('assembly-table',0,.6,-1.9,3.2,1.2,2,'metal',true);
  put('parts-bin',-5.35,.55,2.75,2.5,1.1,1.6,'red',true);
  put('plans-board',-3.2,2,-6.86,3.3,1.5,.15,'screen');
 }else{
  put('arcade-rug',0,.04,-2.05,8.7,.08,5.9,'rug');
  for(let i=0;i<4;i++){
   const x=-5.7+i*3.2;
   put('arcade-cabinet-'+i,x,1.05,-4.85,1.5,2.1,1.7,'steel',true);
   put('arcade-marquee-'+i,x,2.11,-5.65,1.3,.38,.14,'emissive');
   put('arcade-screen-'+i,x,1.43,-5.73,1.17,.8,.08,'screen');
  }
  put('booth',-4.75,.62,2.15,3.4,1.24,1.55,'fabric',true);
  put('game-table',.35,.55,-.3,2.6,1.1,1.6,'wood',true);
  if(roomId==='vault'){
   put('vault-door',4.9,2.1,5.85,2.6,4.2,.55,'gold');
   put('vault-lock',4.9,2.1,5.5,.5,.6,.18,'emissive');
  }
 }
 const obstacles=items.filter(i=>i.solid).map(({id,x,z,w,d})=>({id,x,z,halfX:w/2,halfZ:d/2}));
 const interactions=[
  {id:'exit',x:0,z:5.75,radius:1.6,title:'Return to your property'},
  {id:'portal',x:6.3,z:0,radius:1.25,title:'Choose another unlocked room'},
  {id:'power',x:-5.2,z:-4.3,radius:1.5,title:'Toggle emergency lighting'},
  {id:'terminal',x:3.5,z:-4.15,radius:1.25,title:'Inspect room console'}
 ];
 return Object.freeze({roomId,title:room.title,theme:room.theme,items,obstacles,interactions,
  spawn:{x:0,z:4.1},bounds:ROOM_HALF,walkHeight:.15});
}
export function createSecretRoomLayout(roomId){return layoutFor(roomId);}
export function resolveSecretRoomMotion(position,delta,layout,radius=.35){
 if(!layout||!Array.isArray(layout.obstacles))throw TypeError('room_layout_required');
 if(![position?.x,position?.z,delta?.x,delta?.z,radius].every(Number.isFinite)||radius<=0||radius>.9)
  throw TypeError('invalid_room_movement');
 // A single frame is capped; the island input stream is already time clamped.
 const length=Math.hypot(delta.x,delta.z);
 const scale=length>1?1/length:1,dx=delta.x*scale,dz=delta.z*scale;
 const clip=(v,max)=>Math.max(-max+radius,Math.min(max-radius,v));
 const collides=(x,z)=>layout.obstacles.some(o=>Math.abs(x-o.x)<o.halfX+radius&&Math.abs(z-o.z)<o.halfZ+radius);
 let x=position.x,z=position.z,blockedX=false,blockedZ=false;
 const nextX=clip(x+dx,layout.bounds.x),nextZ=clip(z+dz,layout.bounds.z);
 if(nextX!==x+dx||collides(nextX,z))blockedX=true;else x=nextX;
 if(nextZ!==z+dz||collides(x,nextZ))blockedZ=true;else z=nextZ;
 return {x,z,blockedX,blockedZ};
}
export function secretRoomInteraction(layout,position){
 if(!layout||![position?.x,position?.z].every(Number.isFinite))return null;
 return layout.interactions.find(i=>Math.hypot(position.x-i.x,position.z-i.z)<=i.radius)||null;
}
