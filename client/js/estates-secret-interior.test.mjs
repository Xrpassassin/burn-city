import assert from 'node:assert/strict';
import {PRIVATE_ROOMS,createSecretRoomLayout,resolveSecretRoomMotion,secretRoomInteraction,PRIVATE_ROOM_ORIGIN} from './estates-secret-layout.mjs';
import {createEstatesSecretInteriorRenderer} from './estates-secret-interior-renderer.mjs';
assert(PRIVATE_ROOMS.length===6);
assert(PRIVATE_ROOM_ORIGIN.x>0);
for(const name of PRIVATE_ROOMS){
 const layout=createSecretRoomLayout(name);
 assert.equal(layout.roomId,name);
 assert(layout.items.length>=20,'rooms contain geometry beyond basic walls');
 assert.equal(layout.bounds.x,7.7);assert.equal(layout.bounds.z,7.15);
 assert(layout.items.some(x=>x.id==='entry-door'));
 assert(layout.items.some(x=>x.id==='side-door'));
 assert.equal(secretRoomInteraction(layout,{x:0,z:5.75})?.id,'exit');
 assert.equal(secretRoomInteraction(layout,{x:6.3,z:0})?.id,'portal');
 const spawn=layout.spawn;
 assert(!layout.obstacles.some(x=>Math.abs(spawn.x-x.x)<x.halfX+.35&&Math.abs(spawn.z-x.z)<x.halfZ+.35),'safe player spawn');
 let p={...spawn};
 for(let i=0;i<100;i++)p=resolveSecretRoomMotion(p,{x:0,z:1},layout);
 assert(p.z<=layout.bounds.z-.35,'outside walls are impassable');
 const outer=resolveSecretRoomMotion({x:0,z:-.3},{x:100,z:0},layout);
 assert(outer.x<1.1,'large movement packets are capped');
 assert.throws(()=>resolveSecretRoomMotion(p,{x:NaN,z:0},layout));
 assert.deepEqual(resolveSecretRoomMotion(p,{x:0,z:0},layout),{...p,blockedX:false,blockedZ:false});
}
assert(createSecretRoomLayout('bunker').items.some(i=>i.id==='generator'));
assert(createSecretRoomLayout('lounge').items.some(i=>i.id==='foliage--5.8--5.25'));
assert(createSecretRoomLayout('deluxe-lounge').items.some(i=>i.id==='aquarium-glass'));
assert(createSecretRoomLayout('workshop').items.some(i=>i.id==='workbench-main'));
assert(createSecretRoomLayout('arcade').items.some(i=>i.id.startsWith('arcade-cabinet-')));
assert(createSecretRoomLayout('vault').items.some(i=>i.id==='vault-door'));
assert.throws(()=>createSecretRoomLayout('fake'),/unknown_private_room/);
class Group{constructor(){this.children=[];this.position={set(x,y,z){this.x=x;this.y=y;this.z=z;}};this.name='';}add(v){v.parent=this;this.children.push(v);}remove(v){this.children=this.children.filter(x=>x!==v);}traverse(fn){fn(this);for(const x of this.children)x.traverse?x.traverse(fn):fn(x);}}
class Geometry{dispose(){this.disposed=true;}}
class Material{constructor(options){Object.assign(this,options);}dispose(){this.disposed=true;}}
class Mesh{constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={set(){}};}}
class PointLight{constructor(color,intensity){this.color=color;this.intensity=intensity;this.userData={};this.position={set(){}};}}
class HemisphereLight{constructor(sky,ground,intensity){this.color=sky;this.groundColor=ground;this.intensity=intensity;this.userData={};}}
const THREE={Group,Mesh,BoxGeometry:Geometry,MeshStandardMaterial:Material,PointLight,HemisphereLight};
const scene=new Group();
const interior=createEstatesSecretInteriorRenderer({THREE,scene});
assert.equal(scene.children.length,1);assert.equal(interior.active,false);assert.equal(interior.root.visible,false);
let layout=interior.setRoom('bunker');assert.equal(interior.active,true);assert.equal(interior.root.visible,true);
assert(interior.root.children.length>=layout.items.length+5);
assert.equal(interior.root.children.filter(x=>x instanceof PointLight).length,4,
 'private rooms have full-depth local lighting independent of city sunlight');
const fill=interior.root.children.find(x=>x instanceof HemisphereLight);
assert(fill,'private rooms need non-spatial fill lighting even when the city environment is hidden');
assert(fill.intensity>=.6,'bunker surfaces are readable with normal power');
const walls=interior.root.children.find(x=>x instanceof Mesh&&x.name==='secret-wall-z--7.15');
assert(walls?.material?.emissiveIntensity>=.55,
 'indirect reflected light keeps basement concrete surfaces legible across browsers');
interior.setPower(false);assert.equal(interior.powerOn,false);
assert(interior.root.children.filter(x=>x instanceof PointLight).every(x=>x.intensity===.08));
assert(fill.intensity>.15&&fill.intensity<.4,
 'emergency power keeps subtle indirect fill without pretending all lights are on');
assert(walls.material.emissiveIntensity<.2,
 'emergency mode dims reflected wall light rather than leaving a fully lit bunker');
interior.setPower(true);assert(interior.root.children.filter(x=>x instanceof PointLight).every(x=>x.intensity>.08));
const oldMeshes=interior.root.children.filter(x=>x instanceof Mesh);
layout=interior.setRoom('lounge');assert.equal(layout.roomId,'lounge');
assert(oldMeshes.every(x=>x.geometry.disposed===true),'room swap disposes old geometries');
assert.equal(interior.interaction({x:0,z:5.75})?.id,'exit');
assert.equal(interior.move({x:0,z:0},{x:0,z:0}).blockedX,false);
interior.hide();assert.equal(interior.active,false);assert.equal(interior.root.visible,false);
assert.equal(interior.dispose(),true);assert.equal(interior.dispose(),false);assert.equal(scene.children.length,0);
console.log('Estates secret interiors: six playable room layouts, collision, doors, lights, cleanup passed');
