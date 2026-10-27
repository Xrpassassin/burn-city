import assert from 'node:assert/strict';
import {createEstatesCityLakeGeometry} from './estates-city-lake-geometry.mjs';
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
console.log('Estates city lake geometry: all tests passed');
