// Tier-true walk-in homes: authored floor plans (estates-home-plans.mjs) plus the
// owner's free furniture. Uses the existing live indoor controller, camera and
// collider system; access and saved layouts are owned/authorized by the server.
import {createHomePlan,HOME_FOOTPRINT} from './estates-home-plans.mjs';
export {HOME_FOOTPRINT};
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
const ownerHalf=(f,parts)=>parts.filter(p=>p.solid).map(p=>{const c=Math.abs(Math.cos(p.ry||0)),n=Math.abs(Math.sin(p.ry||0));
 return {x:p.x,z:p.z,halfX:(c*p.w+n*p.d)/2,halfZ:(n*p.w+c*p.d)/2};});
const hit=(a,b,m=0)=>Math.abs(a.x-b.x)<a.halfX+b.halfX+m&&Math.abs(a.z-b.z)<a.halfZ+b.halfZ+m;
export function createEstateHomeLayout({tier='trailer',layoutId='cozy',furniture=[],upgrades=[],floor=0}={}){
 const plan=createHomePlan({tier,layoutId,upgrades,floor});
 const items=[...plan.items],hiddenFurniture=[];
 // Owner furniture (free home editor) belongs to the ground floor. A piece that
 // would block a doorway, the stairs or sit inside an authored fixture is not drawn
 // (the saved layout is untouched; the editor can move it).
 if(plan.floor===0){
  const fixed=[...plan.obstacles,...plan.keepClear];
  for(const f of Array.isArray(furniture)?furniture:[]){
   const parts=homeFurnitureParts(f),boxes=ownerHalf(f,parts);
   if(boxes.some(b=>fixed.some(o=>hit(b,o,.02))))hiddenFurniture.push(f.id);else items.push(...parts);
  }
 }
 const obstacles=items.filter(p=>p.solid===true).map(p=>({
  id:p.id,x:p.x,z:p.z,halfX:(p.ry?Math.abs(Math.cos(p.ry))*p.w+Math.abs(Math.sin(p.ry))*p.d:p.w)/2,
  halfZ:(p.ry?Math.abs(Math.sin(p.ry))*p.w+Math.abs(Math.cos(p.ry))*p.d:p.d)/2
 }));
 return Object.freeze({roomId:'home',title:HOME_LAYOUT_NAMES[layoutId]||HOME_LAYOUT_NAMES.cozy,theme:'residence',
  items,obstacles,interactions:plan.interactions,spawn:plan.spawn,arrival:plan.arrival,bounds:plan.bounds,
  walkHeight:.16,tier:plan.tier,layoutId:HOME_LAYOUT_NAMES[layoutId]?layoutId:'cozy',floor:plan.floor,floors:plan.floors,
  height:plan.height,lights:plan.lights,rooms:plan.rooms,doorX:plan.doorX,hiddenFurniture});
}
