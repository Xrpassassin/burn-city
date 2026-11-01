// Source-level regression guard for Homefront immersive game shell.
// Execute: node --test test/homefront-immersive-shell.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homefrontBuildingLayout } from '../client/arena/homefront-building-layout.mjs';
const html = readFileSync(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');
const scene = readFileSync(new URL('../client/arena/homefront-graveyard-3d.js', import.meta.url), 'utf8');

test('immersive game shell fills available viewport without removing classic fallback', () => {
  assert.match(html, /body\.rpg-hud\.rpg-mode-expedition #graveyardPanel #graveyard3d\{position:absolute!important;inset:0!important;width:100%!important;height:100%!important/);
  assert.match(html, /get\('classic'\)==='1'\?null:createHud/);
});
test('continuous movement is preferred but requires server handshake', () => {
  assert.match(scene, /movementParams\.get\('movement'\) !== 'legacy'/);
  assert.match(scene, /continuousInput\.sync\(data\.inputProtocol, data\.self/);
  assert.match(scene, /if \(continuousInput\.enabled\) return false/);
});
test('empty ground cannot issue click-to-move in immersive mode', () => {
  assert.match(scene, /if \(wantsContinuous\) return;\s*if \(worldData\.party && !worldData\.party\.leader\) return;\s*const hits = raycaster\.intersectObject\(groundHit, false\)/);
});
test('fullscreen renderer accepts actual host height', () => {
  assert.match(scene, /Math\.max\(1, host\.clientHeight\)/);
});

test('unsupported movement is surfaced in the game view rather than silently returning to point-and-click', () => {
  assert.match(scene, /movementNotice\.setAttribute\('role', 'status'\)/);
  assert.match(scene, /setMovementAvailability\(continuousInput\.enabled, data\.inputProtocol\?\.enabled/);
  assert.match(scene, /setMovementAvailability\(false, reason\)/);
});

test('inventory and modal overlays block avatar movement and jumping', () => {
  const view = readFileSync(new URL('../client/arena/homefront-view.mjs', import.meta.url), 'utf8');
  assert.match(view, /const menuOpen = \(\) =>/);
  assert.match(view, /state\.move = \(\) => \{ if \(menuOpen\(\)\) return \{ x: 0, y: 0 \}/);
  assert.match(view, /state\.running = \(\) => !menuOpen\(\)/);
  assert.match(view, /state\.takeJump = \(\) => \{ const j = !menuOpen\(\)/);
});

test('wastes pavement is segmented cosmetic geometry, not uninterrupted grid strips', () => {
  assert.match(scene, /const pavementHash = \(a, b, axis\) =>/);
  assert.match(scene, /for \(let k = -95; k < 95; k \+= 10\)/);
  assert.doesNotMatch(scene, /addBox\(cityGroup, 4\.2, 0\.04, 196/);
});

test('road fragments are streamed and grounded without changing authoritative collision', () => {
  assert.match(scene, /const roadChunk = cityChunkAt\(rx, rz\)/);
  assert.match(scene, /const roadY = terrainElevation\(rx, rz\) \+ 0\.012/);
  assert.match(scene, /addBox\(roadChunk, width, 0\.045, length, rx, roadY, rz, material\)/);
});

test('roadside erosion stays cosmetic, deterministic, and terrain grounded', () => {
  assert.match(scene, /const edge = pavementHash\(k, n, axis \+ 11\)/);
  assert.match(scene, /const patchY = terrainElevation\(patchX, patchZ\) \+ 0\.006/);
  assert.match(scene, /addBox\(cityChunkAt\(patchX, patchZ\), patchWidth/);
});

test('roof silhouettes vary without consuming authoritative building RNG', () => {
  assert.match(scene, /const roofStyle = Math\.floor\(pavementHash\(x, z, 27\) \* 5\)/);
  assert.match(scene, /new THREE\.CylinderGeometry\(0\.75, 0\.75, 1\.15, 8\)/);
  const roof = scene.slice(scene.indexOf('const roofStyle ='), scene.indexOf('chunk.add(structure);', scene.indexOf('const roofStyle =')));
  assert.doesNotMatch(roof, /rand\(\)/, 'extra RNG calls would desynchronize building collision with the server');
});

test('client and server import exactly the same versioned building-layout generator', () => {
  const collision = readFileSync(new URL('../server/homefront-collision.js', import.meta.url), 'utf8');
  const layout = readFileSync(new URL('../client/arena/homefront-building-layout.mjs', import.meta.url), 'utf8');
  assert.match(scene, /import \{ homefrontBuildingLayout \} from '\.\/homefront-building-layout\.mjs'/);
  assert.match(collision, /require\('\.\.\/client\/arena\/homefront-building-layout\.mjs'\)/);
  assert.match(layout, /HOMEFRONT_LAYOUT_VERSION = 1/);
  assert.match(layout, /HOMEFRONT_LAYOUT_SEED = 8675309/);
});

test('version 1 building layout preserves legacy generated footprints and random stream', () => {
  let seed = 8675309;
  const rand = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  const expected = [];
  for (let x=-90;x<=90;x+=10) for(let z=-90;z<=90;z+=10){
    if(rand()<0.27||Math.abs(x%20)<5||Math.abs(z%20)<5)continue;
    const bx=x+(rand()-0.5)*2.2,bz=z+(rand()-0.5)*2.2;
    if(Math.hypot(bx,bz)<13)continue;
    const w=3.4+rand()*3.4,d=3.4+rand()*3.4;
    const h=3+rand()*(Math.hypot(bx,bz)>65?11:6);
    const materialIndex=Math.floor(rand()*4);
    const rotation=(rand()-0.5)*0.16;
    const roof=rand()>0.45?{xOffset:rand()-.5,zOffset:rand()-.5}:null;
    const emberHeight=rand()>0.7?1.2+rand():null;
    expected.push({id:'building:'+x+','+z,x:bx,z:bz,w,d,h,materialIndex,rotation,roof,emberHeight});
  }
  assert.deepEqual([...homefrontBuildingLayout()], expected);
});
