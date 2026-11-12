import assert from 'node:assert/strict';
import {cityFoliageTriangles} from './city-nature-shapes.mjs';
for(const flower of [false,true]){
 const a=cityFoliageTriangles({flower}),b=cityFoliageTriangles({flower});
 assert.deepEqual(a,b,'fixed authored geometry must be deterministic');
 assert(a.positions instanceof Float32Array);
 assert.equal(a.positions.length,a.colors.length);
 assert(a.positions.length>=90&&a.positions.length%9===0);
 assert([...a.positions,...a.colors].every(Number.isFinite));
 const ys=a.positions.filter((_,i)=>i%3===1);
 assert(ys.some(y=>y===0),'foliage must remain grounded');
 assert(ys.every(y=>y>=0&&y<=1.05),'tallest local mesh is bounded');
 assert([...a.colors].every(x=>x>=0&&x<=1),'vertex colors must be normalized');
}
const grass=cityFoliageTriangles(),flowers=cityFoliageTriangles({flower:true});
assert.notDeepEqual(grass.positions,flowers.positions);
assert(grass.positions.length<1000&&flowers.positions.length<1000,'stay tiny for instancing');
console.log('city nature visual shapes: all tests passed');
