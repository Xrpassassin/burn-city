import assert from 'node:assert/strict';
import fs from 'node:fs';
const src=fs.readFileSync(new URL('./estates-island-renderer.mjs',import.meta.url),'utf8');
assert.match(src,/function addEstateFacade\(/);
assert.match(src,/function addEstateLandscaping\(/);
assert.match(src,/made\.push\(\.\.\.addEstateLandscaping\(THREE,root,item\)\)/);
for(const feature of ['-front-path','-planter-','-shrub-','-garden-wall-']) assert.ok(src.includes(feature),feature);
console.log('Estate landscaping wiring checks passed');
