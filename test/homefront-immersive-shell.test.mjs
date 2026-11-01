// Source-level regression guard for Homefront immersive game shell.
// Execute: node --test test/homefront-immersive-shell.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { homefrontBuildingLayout, homefrontOrganicLayoutPreview, HOMEFRONT_ORGANIC_LAYOUT_VERSION } from '../client/arena/homefront-building-layout.mjs';
import { homefrontRoadNetworkPreview } from '../client/arena/homefront-road-network-preview.mjs';
import { auditOrganicRoadClearance, roadBuildingClearance, buildableOrganicSitesPreview } from '../client/arena/homefront-road-clearance.mjs';
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

test('organic layout v2 is deterministic, bounded, and not activated in gameplay', () => {
  assert.equal(HOMEFRONT_ORGANIC_LAYOUT_VERSION, 2);
  const first=[...homefrontOrganicLayoutPreview()];
  assert.deepEqual(first,[...homefrontOrganicLayoutPreview()]);
  assert.ok(first.length > 20 && first.length < 250);
  assert.ok(first.every(b=>Number.isFinite(b.x)&&Number.isFinite(b.z)&&Math.abs(b.x)<=95&&Math.abs(b.z)<=95));
  const server=readFileSync(new URL('../server/homefront-collision.js',import.meta.url),'utf8');
  assert.doesNotMatch(server,/homefrontOrganicLayoutPreview/);
  assert.doesNotMatch(scene,/homefrontOrganicLayoutPreview/);
});

test('v2 winding roads deterministically connect the backbone and district spurs', () => {
  const first = homefrontRoadNetworkPreview();
  assert.deepEqual(first, homefrontRoadNetworkPreview());
  assert.equal(first.version, 2);
  assert.equal(first.nodes.length, 17);
  assert.equal(first.roads.filter(r => r.kind === 'arterial').length, 16);
  const nodeIds = new Set(first.nodes.map(n => n.id));
  assert.ok(first.roads.some(r => r.kind === 'district'));
  assert.ok(first.roads.every(r => r.from && r.to && r.width > 0 && [r.from.x,r.from.z,r.to.x,r.to.z].every(Number.isFinite)));
  assert.ok(first.roads.every(r => r.kind !== 'arterial' || (nodeIds.has(r.from.id) && nodeIds.has(r.to.id))));
  const server = readFileSync(new URL('../server/homefront-collision.js', import.meta.url), 'utf8');
  assert.doesNotMatch(server, /homefrontRoadNetworkPreview/);
  assert.doesNotMatch(scene, /homefrontRoadNetworkPreview/);
});

test('road clearance audit is reproducible and reports actionable conflicts', () => {
  const a = auditOrganicRoadClearance();
  assert.deepEqual(a, auditOrganicRoadClearance());
  assert.ok(a.roadCount >= 16 && a.buildingCount > 20);
  assert.equal(a.clear, a.conflicts.length === 0);
  assert.ok(a.conflicts.every(c => c.roadId && c.buildingId && Number.isFinite(c.clearance)));
  const road={from:{x:-10,z:0},to:{x:10,z:0},width:4};
  assert.ok(roadBuildingClearance(road,{x:0,z:0,w:4,d:4}) < 0);
  assert.ok(roadBuildingClearance(road,{x:0,z:30,w:4,d:4}) > 20);
});

test('v2 road-reserved buildable sites remain clear without altering the live v1 map', () => {
  const first = buildableOrganicSitesPreview();
  assert.deepEqual(first, buildableOrganicSitesPreview());
  assert.equal(first.version, 2);
  assert.ok(first.buildings.length > 0);
  assert.ok(first.clearance.clear, 'retained preview building footprints must clear proposed roads');
  assert.equal(first.buildings.length + first.excluded.length, [...homefrontOrganicLayoutPreview()].length);
  const retainedIds = new Set(first.buildings.map(b => b.id));
  assert.ok(first.excluded.every(e => !retainedIds.has(e.id) && e.roadIds.length > 0));
  assert.deepEqual([...homefrontBuildingLayout()], [...homefrontBuildingLayout()], 'persistent v1 remains deterministic');
});

test('all v2 district roads connect to an arterial and the arterial spine has no gaps', () => {
  const { nodes, roads } = homefrontRoadNetworkPreview();
  const seen = new Set([nodes[0].id]);
  for (const road of roads.filter(r=>r.kind === 'arterial')) {
    assert.ok(seen.has(road.from.id), 'spine must connect from prior node');
    seen.add(road.to.id);
  }
  assert.equal(seen.size, nodes.length);
  assert.ok(roads.filter(r=>r.kind==='district').every(r => seen.has(r.from.id)));
});
