import assert from 'node:assert/strict';
import {validateEstateModelRegistry} from './estates-island-model-pilot.mjs';
assert.deepEqual(Object.keys(validateEstateModelRegistry({})),[]);
assert.equal(validateEstateModelRegistry({starter:{url:'./assets/estates/starter-house.glb',license:'CC0',attribution:'Creator'}}).starter.license,'CC0');
assert.throws(()=>validateEstateModelRegistry({starter:{url:'https://remote.example/model.glb',license:'CC0',attribution:'Creator'}}),/local reviewed GLB/);
assert.throws(()=>validateEstateModelRegistry({starter:{url:'./assets/estates/home.glb'}}),/license and attribution/);
assert.throws(()=>validateEstateModelRegistry({unlisted:{url:'./assets/estates/home.glb',license:'CC0',attribution:'Creator'}}),/Unsupported/);
console.log('Estate model registry validation passed');
