import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const fx=readFileSync(new URL('./fx.js', import.meta.url),'utf8');
const pilot=readFileSync(new URL('./zombie-model-pilot.mjs',import.meta.url),'utf8');
assert.match(fx,/import \{ zombieModelPolicy \} from '\.\/zombie-model-policy\.mjs'/);
assert.match(fx,/if \(modelPolicy\.enabled\)/);
assert.match(fx,/maxModels: modelPolicy\.maxModels/);
assert.match(fx,/maxDistance: modelPolicy\.maxDistance/);
assert.match(fx,/\.catch\(\(\) => \{ zombieModelPilot = null;/);
assert.match(fx,/zombieModelPilot\?\.react\(e\.id, 'Death'\)/);
assert.match(fx,/zombieModelPilot\?\.react\(e\.id, 'HitReact'\)/);
assert.match(fx,/if \(modeled\.has\(z\.id\)\)/);
assert.match(pilot,/selectZombieModelCandidates\(zombies, me, maxModels, maxDistance\)/);
assert.match(pilot,/if \(item\.deadUntil > now\) chosen\.add\(id\)/);
assert.match(pilot,/setAnimation\(item,\s*kind,\s*true\)/); // unchanged one-shot animation, formatting-insensitive
assert.match(pilot,/proceduralDeath=true/,'Aiden and Hazmat death fallback remains visible');
assert.match(pilot,/proceduralHit=true/,'Aiden and Hazmat hit fallback remains visible');
console.log('Zombie detailed-model integration: adaptive LOD, procedural fallback, reaction and death lifetime checks passed');
