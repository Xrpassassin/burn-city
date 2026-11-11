// Tier-true, private home shells and furniture. Uses the existing live indoor
// controller, camera and collider system; layouts are owned/authorized by server.
export const HOME_FOOTPRINT=Object.freeze({
 trailer:[6,5],apartment:[7,8],starter:[8,7],family:[10,9],mansion:[13,11]
});
export const HOME_LAYOUT_NAMES=Object.freeze({
 cozy:'Cozy Home',open:'Open Living',split:'Defined Rooms',
 'arcade-suite':'Arcade Social Suite','maker-suite':'Workshop Maker Suite','bunker-suite':'Command Suite'
});
const FINISH=Object.freeze({
 sofa:'home-fabric',chair:'home-fabric',bed:'home-fabric',
 'coffee-table':'home-wood','dining-table':'home-wood',desk:'home-wood',bookshelf:'home-wood',
 plant:'home-plant','floor-lamp':'home-metal'
});
function homeFurnitureParts(f){
 const out=[],phi=(f.rotation||0)*Math.PI/180;
 const cos=Math.cos(phi),sin=Math.sin(phi);
 const part=(key,dx,y,dz,w,h,d,mat,shape='box',solid=false)=>{
  const x=f.x+dx*cos-dz*sin,z=f.z+dx*sin+dz*cos;
  out.push({id:'furnish-'+f.id+'-'+key,x,y,z,w,h,d,mat,shape,ry:phi,solid});
 };
 const t=f.type;
 if(t==='sofa'){
  part('base',0,.48,0,1.55,.39,.77,'home-fabric','box',true);
  part('back',0,.96,-.3,1.6,.79,.18,'home-fabric');
  for(const s of [-1,1]){
   part('arm-'+s,s*.71,.68,0,.16,.61,.82,'home-leather');
   part('cushion-'+s,s*.36,.74,.12,.67,.17,.54,'home-cream','sphere');
  }
 }else if(t==='chair'){
  part('seat',0,.54,0,.64,.16,.63,'home-fabric','box',true);
  part('back',0,.93,-.25,.64,.75,.14,'home-fabric');
  for(const s of [-1,1])part('leg-'+s,s*.24,.26,.15,.085,.49,.085,'home-wood');
 }else if(t==='bed'){
  part('frame',0,.32,0,1.58,.42,1.75,'home-wood','box',true);
  part('mattress',0,.62,0,1.48,.2,1.64,'home-cream');
  part('headboard',0,.94,-.83,1.55,1.0,.13,'home-wood');
  for(const s of [-1,1])part('pillow-'+s,s*.38,.76,-.48,.62,.12,.39,'home-fabric','sphere');
 }else if(t==='plant'){
  part('pot',0,.35,0,.44,.65,.44,'home-ceramic','cylinder',true);
  part('soil',0,.69,0,.38,.04,.38,'home-earth','cylinder');
  part('leaves',0,1.2,0,.67,1.0,.61,'home-plant','sphere');
  for(const s of [-1,1])part('leaf-'+s,s*.2,1.0,.07,.22,.53,.21,'home-plant','sphere');
 }else if(t==='floor-lamp'){
  part('foot',0,.085,0,.35,.16,.35,'home-metal','cylinder',true);
  part('pole',0,.78,0,.07,1.36,.07,'home-metal','cylinder');
  part('shade',0,1.48,0,.47,.35,.47,'home-cream','cylinder');
  part('glow',0,1.27,0,.23,.06,.23,'home-warm','cylinder');
 }else if(t==='bookshelf'){
  part('carcass',0,1.0,0,.98,1.95,.37,'home-wood','box',true);
  for(let i=0;i<4;i++){
   part('shelf-'+i,0,.32+i*.45,.22,.87,.07,.045,'home-trim');
   for(const s of [-1,1])part('book-'+i+'-'+s,s*.2,.49+i*.45,.215,.13,.29,.09,
    i%2?'home-plant':'home-leather');
  }
 }else{
  const size=t==='desk'?[1.32,.68]:t==='dining-table'?[1.23,.83]:[1,.66];
  part('top',0,.68,0,size[0],.13,size[1],'home-wood','box',true);
  for(const sx of [-1,1])for(const sz of [-1,1])
   part('leg-'+sx+'-'+sz,sx*(size[0]/2-.13),.34,sz*(size[1]/2-.11),.085,.62,.09,'home-metal');
  if(t==='desk')part('desktop-trim',0,.82,-.19,.75,.05,.13,'home-metal');
 }
 return out;
}
export function createEstateHomeLayout({tier='trailer',layoutId='cozy',furniture=[]}={}){
 const exterior=HOME_FOOTPRINT[tier]||HOME_FOOTPRINT.trailer,halfX=(exterior[0]-.8)/2,halfZ=(exterior[1]-.8)/2;
 const wallHeight=tier==='trailer'?2.65:3.1;
 const items=[],add=(id,x,y,z,w,h,d,mat,solid=false,shape='box')=>items.push({id,x,y,z,w,h,d,mat,solid,shape});
 const W=2*halfX,D=2*halfZ;
 add('home-floor',0,-.2,0,W,.32,D,'home-floor');
 add('home-ceiling',0,wallHeight+.12,0,W,.24,D,'home-ceiling');
 for(const side of [-1,1]){
  add('home-wall-x-'+side,side*halfX,wallHeight/2,0,.15,wallHeight,D,'home-wall');
  add('home-wall-z-'+side,0,wallHeight/2,side*halfZ,W,wallHeight,.15,'home-wall');
  add('home-baseboard-x-'+side,side*(halfX-.1),.13,0,.06,.23,D,'home-trim');
  add('home-baseboard-z-'+side,0,.13,side*(halfZ-.1),W,.23,.07,'home-trim');
 }
 // Accessible exit door; mirrored home windows contain bright but opaque
 // glass, with durable trim and deep sills to avoid "box-room" appearance.
 add('home-exit-frame',0,1.28,halfZ-.08,1.38,2.38,.2,'home-wood');
 add('home-exit-panel',0,1.25,halfZ-.2,1.12,2.2,.12,'home-door');
 add('home-exit-handle',.35,1.24,halfZ-.27,.08,.2,.06,'home-metal');
 for(const side of [-1,1]){
  add('window-trim-'+side,side*(halfX-.12),1.76,-halfZ*.38,.1,1.2,1.15,'home-trim');
  add('window-glass-'+side,side*(halfX-.19),1.76,-halfZ*.38,.055,.92,.92,'home-glass');
  add('window-sill-'+side,side*(halfX-.23),1.12,-halfZ*.38,.19,.1,1.22,'home-wood');
 }
 add('home-rug',0,.01,-.15,Math.min(W-1,2.7),.045,Math.min(D-1.1,2),'home-rug');
 add('home-ceiling-rose',0,wallHeight-.08,0,.62,.12,.62,'home-trim','false','cylinder');
 add('home-light',0,wallHeight-.25,0,.49,.21,.49,'home-warm',false,'sphere');
 if(layoutId==='open'||layoutId==='maker-suite'){
  add('open-breakfast-counter',0,.45,-halfZ+.36,Math.min(W-1,2.25),.9,.44,'home-wood',true);
  add('open-counter-top',0,.93,-halfZ+.36,Math.min(W-1,2.33),.09,.52,'home-ceramic');
 }else if(layoutId==='split'||layoutId==='bunker-suite'){
  const bx=-halfX*.34,bz=-halfZ*.28;
  add('partition',bx,1.02,bz,.13,2.04,Math.min(1.25,D*.28),'home-wall',true);
  add('partition-coping',bx,2.08,bz,.22,.08,Math.min(1.3,D*.29),'home-wood');
 }else{
  add('cozy-wall-shelf',0,1.78,-halfZ+.13,Math.min(W-1,1.75),.1,.22,'home-wood');
 }
 if(layoutId==='arcade-suite'){
  add('arcade-console',halfX-.52,1.05,-halfZ+.9,.65,2.1,.74,'home-metal',true);
  add('arcade-display',halfX-.12,1.48,-halfZ+.9,.08,.83,.51,'home-glass');
 }
 if(layoutId==='maker-suite'){
  add('maker-storage',-halfX+.45,1.15,-halfZ+.8,.6,2.3,.75,'home-metal',true);
  add('maker-shelf',-halfX+.45,1.58,-halfZ+.8,.64,.11,.72,'home-wood');
 }
 if(layoutId==='bunker-suite'){
  add('command-panel',0,1.65,-halfZ+.14,Math.min(1.6,W-1),1.22,.12,'home-metal');
  add('command-display',0,1.65,-halfZ+.07,Math.min(1.4,W-1.2),.89,.07,'home-glass');
 }
 for(const f of Array.isArray(furniture)?furniture:[])items.push(...homeFurnitureParts(f));
 const obstacles=items.filter(p=>p.solid===true).map(p=>({
  id:p.id,x:p.x,z:p.z,halfX:(p.ry?Math.abs(Math.cos(p.ry))*p.w+Math.abs(Math.sin(p.ry))*p.d:p.w)/2,
  halfZ:(p.ry?Math.abs(Math.sin(p.ry))*p.w+Math.abs(Math.cos(p.ry))*p.d:p.d)/2
 }));
 const interactions=[
  {id:'exit',x:0,z:halfZ-.85,radius:.85,title:'Leave this residence'},
  {id:'portal',x:halfX-.48,z:0,radius:.8,title:'Other private rooms'},
  {id:'terminal',x:-halfX+.45,z:halfZ-1.03,radius:.85,title:'Customize home furnishing'}
 ];
 return Object.freeze({roomId:'home',title:HOME_LAYOUT_NAMES[layoutId]||HOME_LAYOUT_NAMES.cozy,theme:'residence',
  items,obstacles,interactions,spawn:{x:0,z:halfZ-.92},bounds:{x:halfX,z:halfZ},
  walkHeight:.16,tier,layoutId});
}
