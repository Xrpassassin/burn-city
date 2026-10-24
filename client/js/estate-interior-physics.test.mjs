import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const estate = readFileSync(new URL('./estate.js', import.meta.url), 'utf8');
const app = readFileSync(new URL('./app.js', import.meta.url), 'utf8');
const catalog = JSON.parse(readFileSync(new URL('../data/estate-catalog.json', import.meta.url), 'utf8'));

// The island catalog (#224) grew past the nine city residences; the original nine IDs must stay stable.
for (const id of ['trailer-01','trailer-02','apartment-01','starter-01','starter-02','family-01','family-02','mansion-01','mansion-02']) assert.ok(catalog.properties.some(p => p.id === id), 'stable city property ' + id + ' remains available');
assert.equal(new Set(catalog.properties.map(p => p.id)).size, catalog.properties.length, 'property IDs stay unique');
assert.match(estate, /const doorPivot = new THREE\.Group\(\)/, 'each generated residence gets a hinged door pivot');
assert.match(estate, /r\.doorPivot\.rotation\.y\s*\+=\s*\(target-r\.doorPivot\.rotation\.y\)/, 'door rotation eases instead of snapping');
assert.match(estate, /active===r\.id\?1\.35:0/, 'door opens only for the active interior');
assert.match(estate, /const obstacles = \[\]/, 'interiors define local furniture collision footprints');
assert.match(estate, /for\(const o of r\.obstacles\)/, 'movement guard resolves furniture overlaps');
assert.match(estate, /const inEntryLane=Math\.abs\(p\.x\)<1\.85&&p\.z>r\.halfD-4\.4/, 'entry and exit corridor stays clear of furniture push-out');
assert.match(estate, /THREE\.MathUtils\.clamp\(p\.x,-r\.halfW,r\.halfW\)/, 'player remains inside the room bounds');
assert.match(app, /window\.__estateInteriorId=null/, 'exit clears the active interior state');
assert.match(app, /hud\.textContent='ESTATES · '\+propertyId\.toUpperCase\(\)\+' · E \/ USE TO EXIT'/, 'in-room HUD identifies the active residence and exit control');
assert.match(app, /getElementById\('estateInteriorHud'\)\?\.remove\(\)/, 'in-room HUD is removed on exit');
assert.match(estate, /const interiorRugs = \{[\s\S]*?mansion:new THREE\.MeshStandardMaterial/, 'each property tier has a distinct rug palette');
assert.match(estate, /const ceilingLight=new THREE\.PointLight\(ceilingColor/, 'interiors receive tier-tuned ambient lighting');
assert.match(estate, /window\.__estateCameraGuard=\(cameraPos\)=>/, 'third-person camera gets an interior-boundary guard');
assert.match(app, /window\.__estateCameraGuard&&window\.__estateCameraGuard\(want\)/, 'third-person camera applies the interior guard');
assert.match(estate, /if\(Math\.abs\(p\.x\)>r\.halfW\+3\|\|Math\.abs\(p\.z\)>r\.halfD\+3\|\|p\.y>r\.halfH\+6\)\{window\.__estateAutoExit\(\);return false;\}/, 'a player far from the active room auto-exits instead of being teleported back');
assert.doesNotMatch(estate.match(/window\.__estateAutoExit=\(\)=>\{[\s\S]*?\n  \};/)[0], /pos\.copy|P\.pos/, 'auto-exit never moves the player');
console.log('Estates interior regression checks: 18 assertions passed');
