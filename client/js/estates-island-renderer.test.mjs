import assert from 'node:assert/strict';
import {createEstatesIslandRenderer} from './estates-island-renderer.mjs';
class Geometry { constructor(...args){this.args=args;this.disposed=false;} dispose(){this.disposed=true;} }
class Group { constructor(){this.children=[];this.name='';this.position={set(){}};this.rotation={x:0};this.scale={set(){}};} add(x){this.children.push(x);x.parent=this;} remove(x){this.children=this.children.filter(y=>y!==x);} traverse(fn){fn(this);for(const x of this.children)x.traverse?x.traverse(fn):fn(x);} }
class Mesh { constructor(geometry,material){this.geometry=geometry;this.material=material;this.position={set:(x,y,z)=>{this.xyz=[x,y,z];}};this.rotation={x:0};this.scale={set(){}};this.userData={};this.name='';} }
class LineSegments extends Mesh {}
class Mat { constructor(options){this.options=options;this.disposed=false;} dispose(){this.disposed=true;} }
const THREE={Group,Mesh,LineSegments,MeshStandardMaterial:Mat,LineBasicMaterial:Mat,BoxGeometry:Geometry,CylinderGeometry:Geometry,ConeGeometry:Geometry,CircleGeometry:Geometry,RingGeometry:Geometry,EdgesGeometry:Geometry,DoubleSide:2};
const scene=new Group();
const manifest={objects:[
{id:'ground',kind:'terrain',position:{x:0,y:0,z:0},dimensions:{width:100,depth:120},material:'grass'},
{id:'lake',kind:'water',position:{x:0,y:-1,z:0},dimensions:{width:200,depth:220},material:'lake-water'},
{id:'road-x',kind:'road',orientation:'x',position:{x:0,y:0,z:0},dimensions:{width:3,length:40,height:.2},material:'asphalt'},
{id:'road-z',kind:'road',orientation:'z',position:{x:0,y:0,z:0},dimensions:{width:4,length:30,height:.2},material:'asphalt'},
{id:'bridge',kind:'bridge',position:{x:0,y:0,z:0},dimensions:{width:8,length:24,height:.8},material:'weathered-concrete'},
{id:'bridge-z',kind:'bridge',orientation:'z',position:{x:0,y:0,z:0},dimensions:{width:8,length:24,height:.8},material:'weathered-concrete'},
{id:'lot',kind:'property-lot',position:{x:10,y:0,z:12},dimensions:{width:20,depth:18},material:'lot-boundary',tier:'starter',buildingFootprint:{width:8,depth:7,height:5}},
{id:'gate',kind:'entrance-trigger',position:{x:0,y:0,z:30},dimensions:{radius:5,height:4},destinationId:'estates-island'},
{id:'welcome-kiosk',kind:'landmark',style:'kiosk',position:{x:0,y:0,z:40},dimensions:{width:4,depth:3,height:2.5},material:'timber'}
]};
let interactions=0;
const renderer=createEstatesIslandRenderer({THREE,scene,manifest,onInteract:()=>interactions++});
assert.equal(scene.children.length,1);
assert.equal(renderer.objectCount,9,'renderer registers every manifest object, including each blockout type');
assert(renderer.getObject('welcome-kiosk').length>=6,'public kiosk renders a counter, posts, roof, and sign as separate meshes');
assert.ok(renderer.getObject('lot').length>=3);
assert.deepEqual(renderer.getObject('road-x')[0].geometry.args,[40,.2,3],'X-oriented road must put length on X and width on Z');
assert.deepEqual(renderer.getObject('road-z')[0].geometry.args,[4,.2,30],'Z-oriented road must put width on X and length on Z');
assert.deepEqual(renderer.getObject('bridge')[0].geometry.args,[24,.8,8],'bridge length must run along X');
assert.deepEqual(renderer.getObject('bridge-z')[0].geometry.args,[8,.8,24],'explicit Z-oriented bridge must put its length along Z');
const gate=renderer.getObject('gate')[0];
gate.userData.interact();assert.equal(interactions,1);
const savedCount=renderer.setSavedPlacements([
 {propertyId:'starter-01',placementId:'workshop-1',buildingType:'workshop',x:-4,z:2,width:5,depth:4,height:3.2,rotationY:0},
 {propertyId:'starter-01',placementId:'bad-size',buildingType:'workshop',x:0,z:0,width:99,depth:4,height:3.2,rotationY:0},
 {propertyId:'starter-01',placementId:'unknown',buildingType:'spaceship',x:0,z:0,width:2,depth:2,height:2,rotationY:0},
 {propertyId:'starter-01',placementId:'workshop-1',buildingType:'workshop',x:-4,z:2,width:5,depth:4,height:3.2,rotationY:0}
]);
assert.equal(savedCount,1,'only valid unique server placements render');
assert.equal(renderer.savedPlacementCount,1);
assert.equal(renderer.setSavedPlacements([]),0,'refresh clears stale saved placements');
assert.equal(renderer.savedPlacementCount,0);
assert.equal(renderer.setSavedPlacements([{propertyId:'starter-01',placementId:'workshop-2',buildingType:'workshop',x:-4,z:2,width:5,depth:4,height:3.2,rotationY:Math.PI/2}]),1,'quarter-turn placements render');
assert.throws(()=>renderer.setSavedPlacements({}),/array/,'malformed layout payloads are rejected');
assert.equal(renderer.dispose(),true);
assert.equal(renderer.dispose(),false);
assert.equal(renderer.savedPlacementCount,0,'disposal releases saved placement group references');
assert.equal(scene.children.length,0);
assert.throws(()=>createEstatesIslandRenderer({scene,manifest}),/Three.js constructor required/);
console.log('estates-island-renderer: all tests passed');
