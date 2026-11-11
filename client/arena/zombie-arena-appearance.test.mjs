import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ARENA_ZOMBIE_SKINS,ARENA_ZOMBIE_EYES,ARENA_ZOMBIE_CLOTH,ARENA_ZOMBIE_PANTS,zombieEyeIntensity,zombieHumanShape} from './zombie-arena-appearance.mjs';
const fx=readFileSync(new URL('./fx.js',import.meta.url),'utf8');
const model=readFileSync(new URL('./zombie-model-pilot.mjs',import.meta.url),'utf8');
const base=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const home=readFileSync(new URL('./homefront-graveyard-3d.js',import.meta.url),'utf8');
assert.equal(ARENA_ZOMBIE_SKINS.length,9,'preserve all nine original gameplay enemy types');
assert.equal(ARENA_ZOMBIE_EYES.length,9);
assert(ARENA_ZOMBIE_SKINS.every(x=>x.length>=2));
assert(ARENA_ZOMBIE_CLOTH.length>=5&&ARENA_ZOMBIE_PANTS.length>=3);
for(let type=0;type<6;type++){
 assert.equal(zombieEyeIntensity(type),0,'normal zombies are humans with dim eyes, not goblin LEDs');
}
for(const type of [6,7,8])assert(zombieEyeIntensity(type)>0,'elemental and boss identities remain legible');
assert(zombieEyeIntensity(8,{dead:true})===0);
assert(zombieEyeIntensity(8,{low:true})===0);
assert(zombieEyeIntensity(0,{burning:true})>0,'flame still has visual feedback');
assert(zombieHumanShape(2)>zombieHumanShape(0));
assert(zombieHumanShape(3)>zombieHumanShape(2));
assert(zombieHumanShape(5)<zombieHumanShape(0));
assert(zombieHumanShape(8)>zombieHumanShape(0));
assert.match(fx,/function zombieRoundedBox\(/,'fallback uses actual softened humanoid geometry');
assert.match(fx,/new THREE\.BoxGeometry\(w,h,d,3,3,3\)/,'original instanced mesh geometry has rounded vertex subdivisions');
assert.match(fx,/zombieRoundedBox\(0\.43, 0\.44, 0\.39/,'old square head replaced');
assert.match(fx,/const eyeGlow=zombieEyeIntensity\(/,'only appropriate special infected glow');
assert.match(fx,/const modeled = zombieModelPilot\?\.update/,'original animation pilot still replaces the nearby procedural meshes');
assert.match(fx,/for \(const mesh of Object\.values\(Z\)\) put\(/,'procedural double-rendering remains prevented');
assert.match(fx,/zombieModelPilot\?\.react\(e\.id, 'Death'\)/,'original Death reaction preserved');
assert.match(fx,/zombieModelPilot\?\.react\(e\.id, 'HitReact'\)/,'original HitReact preserved');
assert.match(model,/Promise\.allSettled\(ZOMBIE_SKETCHFAB_MODELS/,'one corrupt GLB cannot wipe out other original models');
assert.match(model,/model\.scale \* zombieHumanShape\(z\.ty\)/,'bosses and shamblers keep their original relative scales');
assert.match(model,/material\.color\.lerp\(tint, 0\.025\)/,'original skin and suit textures retain their full character');
assert(model.includes("import {ZOMBIE_SKETCHFAB_MODELS,zombieVisualModelId,zombieClipAliases}"),
 'original Zombies mode casts only verified Sketchfab infected models');
assert(!/zombie-(?:ash|frost|rust|quaternius)\.glb/.test(model),
 'robotic or cartoon GLBs are still preserved in repo but no longer default');
assert(!/from [\x27\x22][^\x27\x22]*homefront/i.test(fx+model),
 'Zombies must NEVER import Homefront enemy, world, UI or player rendering');
assert(base.includes("import { createZombieFX } from './fx.js'"),'old Zombies arena entry point is untouched');
assert(home.length>10000,'separate Homefront game remains present; no overwrite');
console.log('Original Zombies model fidelity: 9 existing archetypes, human silhouette, no goblin default, working GLB fallback, death/hit feedback and complete Homefront isolation passed');
