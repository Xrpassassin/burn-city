// Low-poly, dependency-free Three.js estate helicopter. No third-party assets copied.
// Verifiable installation: only server-supplied settled upgrade IDs are used.
import {estateHelipadPosition,createEstateHelicopterFlight} from './estates-helicopter-flight.mjs';
const C={body:0x223b4b,bodyAccent:0xb49b67,steel:0x4b5661,glass:0x25749a,pad:0x303b3b,
 white:0xf3d38a,red:0xe86243,green:0x4ecbb0,rotor:0x19262f};
export function createEstateHelicopterWorld({THREE,parent,lots}={}){
 if(!THREE?.Group||!THREE?.Mesh||!THREE?.BoxGeometry||!THREE?.MeshStandardMaterial||
    !THREE?.CylinderGeometry||!parent?.add||!Array.isArray(lots))throw TypeError('three_helicopter_dependencies_required');
 const root=new THREE.Group();root.name='estates-verified-aviation';parent.add(root);
 const byId=new Map(lots.filter(l=>l.propertyId&&['family','mansion'].includes(l.tier)).map(l=>[l.propertyId,l]));
 let installed=new Map(),disposed=false,activeProperty=null;
 function box(parent,id,w,h,d,x,y,z,color,metalness=0){
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial({color,roughness:.52,metalness}));
  mesh.name=id;mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 }
 function cylinder(parent,id,rTop,rBottom,h,x,y,z,color,segments=22){
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(rTop,rBottom,h,segments),new THREE.MeshStandardMaterial({color,roughness:.8}));
  mesh.name=id;mesh.position.set(x,y,z);parent.add(mesh);return mesh;
 }
 function build(lot){
  const point=estateHelipadPosition(lot),g=new THREE.Group();g.name='estate-aircraft-'+lot.propertyId;
  g.position.set(point.x,lot.position.y,point.z);root.add(g);
  cylinder(g,'private-helipad',4.3,4.3,.18,0,.07,0,C.pad,32);
  box(g,'helipad-h-left',.28,.05,2.55,-.74,.2,0,C.white);
  box(g,'helipad-h-right',.28,.05,2.55,.74,.2,0,C.white);
  box(g,'helipad-h-cross',1.72,.05,.27,0,.2,0,C.white);
  for(const x of [-3.1,3.1])for(const z of [-3.1,3.1]){
    cylinder(g,'pad-light',.23,.23,.21,x,.22,z,x*z>0?C.green:C.red,8);
  }
  const craft=new THREE.Group();craft.name='luxury-utility-helicopter';g.add(craft);
  box(craft,'fuselage',2.55,1.25,3.5,0,1.95,-.3,C.body,.28);
  box(craft,'nose',2.12,.95,1.25,0,1.95,-2.25,C.glass,.18);
  box(craft,'windshield',1.85,.64,.14,0,2.18,-2.93,C.glass,.08);
  box(craft,'roof',1.86,.2,2.05,0,2.68,-.55,C.bodyAccent,.35);
  box(craft,'tail-boom',.55,.45,4.9,0,2.0,3.55,C.body,.25);
  box(craft,'tail-fin',.2,1.9,1.0,0,2.65,5.72,C.bodyAccent,.15);
  for(const x of [-1.13,1.13]){
    box(craft,'landing-skid',.15,.17,4.7,x,.61,.1,C.steel,.6);
    for(const z of [-.85,1.05])box(craft,'skid-strut',.12,.83,.16,x,1.06,z,C.steel,.6);
    box(craft,'cabin-door',.09,.9,1.5,x*1.15,1.97,-.65,C.bodyAccent,.18);
  }
  cylinder(craft,'main-rotor-mast',.17,.18,.5,0,3.03,-.32,C.steel,8);
  const top=new THREE.Group();top.name='main-rotor';top.position.set(0,3.35,-.32);craft.add(top);
  box(top,'main-blade-a',8.2,.1,.2,0,0,0,C.rotor,.35);
  box(top,'main-blade-b',.2,.1,8.2,0,0,0,C.rotor,.35);
  const tail=new THREE.Group();tail.name='tail-rotor';tail.position.set(.33,2.66,5.77);craft.add(tail);
  box(tail,'tail-blade-a',.12,1.55,.15,0,0,0,C.rotor,.4);
  box(tail,'tail-blade-b',.12,.15,1.55,0,0,0,C.rotor,.4);
  return {lot,g,craft,top,tail,model:createEstateHelicopterFlight(lot)};
 }
 function clear(){
  root.traverse?.(n=>{n.geometry?.dispose?.();if(Array.isArray(n.material))for(const m of n.material)m?.dispose?.();else n.material?.dispose?.();});
  for(const child of [...root.children])root.remove(child);
  installed=new Map();activeProperty=null;
 }
 function setVerified(properties=[]){
  if(disposed)return false;
  const ids=new Set();
  for(const s of properties){
   if(!byId.has(s?.propertyId)||!Array.isArray(s?.unlockedItemIds))continue;
   if(s.unlockedItemIds.includes('estate-helicopter'))ids.add(s.propertyId);
  }
  const next=[...ids].sort().join('|'),previous=[...installed.keys()].sort().join('|');
  if(next===previous)return false;
  clear();
  for(const id of ids){const obj=build(byId.get(id));installed.set(id,obj);}
  return true;
 }
 function hasHelicopter(id){return installed.has(id);}
 function flightModel(id){return installed.get(id)?.model||null;}
 function board(id){
  if(!hasHelicopter(id)||activeProperty)return null;
  activeProperty=id;const o=installed.get(id);o.model.reset();o.craft.visible=true;return o.model;
 }
 function tick({propertyId,position,rotor=0,heading=0,dt=0,bank=0}={}){
  for(const [id,o] of installed){
   if(id===activeProperty&&id===propertyId&&position){
    const pad=estateHelipadPosition(o.lot);
    o.craft.position.set(position.x-pad.x,position.altitude-.5,position.z-pad.z);
    o.craft.rotation.y=heading;o.craft.rotation.z=Math.max(-.18,Math.min(.18,bank));
    o.top.rotation.y=rotor;o.tail.rotation.x=rotor*2;
   }else{
    o.craft.position.set(0,0,0);o.craft.rotation.y=0;o.craft.rotation.z=0;
    o.top.rotation.y+=Math.min(.05,Math.max(0,dt))*.45;
    o.tail.rotation.x+=Math.min(.05,Math.max(0,dt))*.9;
   }
  }
 }
 function park(){
  if(!activeProperty)return false;
  const o=installed.get(activeProperty);
  if(o){o.model.reset();o.craft.position.set(0,0,0);o.craft.rotation.y=0;o.craft.rotation.z=0;}
  activeProperty=null;return true;
 }
 function dispose(){if(disposed)return false;disposed=true;clear();parent.remove(root);return true;}
 return Object.freeze({root,setVerified,hasHelicopter,flightModel,board,tick,park,dispose,
  get activeProperty(){return activeProperty},get properties(){return [...installed.keys()]}});
}
