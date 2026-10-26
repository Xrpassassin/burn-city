import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./estates-island-renderer.mjs',import.meta.url),'utf8');
assert.match(source,/function addRoadFixtures\(THREE,parent,item\)/);
assert.match(source,/item\.kind==='road' && length>=40/);
assert.match(source,/addRoadFixtures\(THREE,root,item\)/);
assert.match(source,/key\+'-lantern'/);
assert.doesNotMatch(source,/new THREE\.PointLight/);
console.log('Estates roadside fixture wiring checks passed');
