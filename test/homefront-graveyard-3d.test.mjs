import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const scene = readFileSync(new URL('../client/arena/homefront-graveyard-3d.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');

assert.match(scene, /from '\.\/vendor\/three\.module\.min\.js'/, 'reuse the vendored Three.js runtime');
assert.match(scene, /\/api\/homefront\/world/, 'read the shared Homefront world snapshot');
assert.match(scene, /\/api\/homefront\/world\/move/, 'send movement through the authoritative world API');
assert.match(scene, /data\.world\?\.pointsOfInterest/, 'render server-authored points of interest');
assert.match(scene, /data\.world\?\.bosses|data\.world\?\.caches/, 'bind interactive landmark visuals to shared encounter state');
assert.match(scene, /worldData\.party && !worldData\.party\.leader/, 'respect leader-controlled party movement');
assert.match(scene, /Math\.max\(-100, Math\.min\(100/, 'clamp client targets to the shared map bounds');
assert.match(scene, /server-limited/, 'explain that movement is server-limited');
assert.match(page, /id="graveyard3d"/, 'embed the 3D world in Homefront');
assert.match(page, /id="graveyardMap"/, 'preserve the existing 2D tactical map fallback');
assert.match(page, /homefront-graveyard-3d\.js/, 'load the 3D scene module');
console.log('Homefront 3D Graveyard integration checks passed.');
