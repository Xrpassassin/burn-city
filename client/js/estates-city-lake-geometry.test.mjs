import assert from 'node:assert/strict';
import {createEstatesCityLakeGeometry} from './estates-city-lake-geometry.mjs';
import * as THREE from '../vendor/three/build/three.module.min.js';
const g=createEstatesCityLakeGeometry({islandX:100,islandZ:-30,islandRadiusX:80,islandRadiusZ:60,waterWidth:40});
for(let i=0;i<360;i++){
 const a=i*Math.PI/180, x=100+100*Math.cos(a), z=-30+75*Math.sin(a);
 assert(g.isWater(x,z),`water must surround island at ${i} degrees`);
 assert(!g.isIsland(x,z));
}
assert(g.isIsland(100,-30));
assert(!g.isWater(100,-30));
assert(!g.isWater(100+121,-30));
assert(!g.isWater(NaN,0));
assert(!g.mayEnterProxy());
assert.throws(()=>createEstatesCityLakeGeometry({waterWidth:0}),TypeError);
// The same Three.js shape operation used in the city must actually leave dry
// land in the middle rather than drawing a transparent island over solid water.
const outer=[];for(let i=0;i<96;i++){const a=i*Math.PI*2/96;outer.push(new THREE.Vector2(210*Math.cos(a),78*Math.sin(a)));}
const inner=[];for(let i=0;i<96;i++){const a=-i*Math.PI*2/96;inner.push(new THREE.Vector2(40*Math.cos(a),22*Math.sin(a)));}
const shape=new THREE.Shape(outer);shape.holes.push(new THREE.Path(inner));
const mesh=new THREE.ShapeGeometry(shape),p=mesh.attributes.position,indices=mesh.index;
const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
for(let i=0;i<indices.count;i+=3){
 const vertices=[0,1,2].map(n=>{const k=indices.getX(i+n);return [p.getX(k),p.getY(k)];});
 const [a,b,c]=vertices, signs=[cross(a,b),cross(b,c),cross(c,a)];
 assert(!(signs.every(v=>v>=0)||signs.every(v=>v<=0)),'lake surface must not cover island center');
}
mesh.dispose();
console.log('Estates city lake geometry: all tests passed');
