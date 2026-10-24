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
{id:'lot',kind:'property-lot',position:{x:10,y:0,z:12},dimensions:{width:20,depth:18},material:'lot-boundary',tier:'starter',buildingFootprint:{width:8,depth:7,height:5}},
{id:'gate',kind:'entrance-trigger',position:{x:0,y:0,z:30},dimensions:{radius:5,height:4},destinationId:'estates-island'}
]};
let interactions=0;
const renderer=createEstatesIslandRenderer({THREE,scene,manifest,onInteract:()=>interactions++});
assert.equal(scene.children.length,1);
assert.equal(renderer.objectCount,4);
assert.ok(renderer.getObject('lot').length>=3);
const gate=renderer.getObject('gate')[0];
gate.userData.interact();assert.equal(interactions,1);
assert.equal(renderer.dispose(),true);
assert.equal(renderer.dispose(),false);
assert.equal(scene.children.length,0);
assert.throws(()=>createEstatesIslandRenderer({scene,manifest}),/Three.js constructor required/);
console.log('estates-island-renderer: all tests passed');
