import assert from 'node:assert/strict';
import { buildCinderCove } from './cinder-cove.mjs';
class Obj {constructor(){this.children=[];this.position={set(){}};this.rotation={};this.scale={setScalar(){}};}add(c){this.children.push(c);}}
class Mesh extends Obj {constructor(g,m){super();this.geometry=g;this.material=m;}}
const THREE={Group:Obj,Mesh,MeshStandardMaterial:class {constructor(o){Object.assign(this,o)}},BoxGeometry:class{},CylinderGeometry:class{},ConeGeometry:class{},SphereGeometry:class{}};
const g=buildCinderCove(THREE);
assert.equal(g.name,'cinder-cove-landmarks');
assert.ok(g.children.length>=20);
assert.equal(g.children.filter(c=>c instanceof Mesh).length>10,true);
console.log('Cinder Cove visual landmark tests passed');
