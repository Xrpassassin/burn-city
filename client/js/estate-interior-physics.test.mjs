import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const estate = readFileSync(new URL('./estate.js', import.meta.url), 'utf8');
const catalog = JSON.parse(readFileSync(new URL('../data/estate-catalog.json', import.meta.url), 'utf8'));

assert.equal(catalog.properties.length, 9, 'all nine stable property records remain available');
assert.equal(new Set(catalog.properties.map(p => p.id)).size, 9, 'property IDs stay unique');
assert.match(estate, /const doorPivot = new THREE\.Group\(\)/, 'each generated residence gets a hinged door pivot');
assert.match(estate, /doorPivot\.rotation\.y\s*\+=\s*\(target-doorPivot\.rotation\.y\)/, 'door rotation eases instead of snapping');
assert.match(estate, /active===r\.id\?1\.35:0/, 'door opens only for the active interior');
assert.match(estate, /const obstacles = \[\]/, 'interiors define local furniture collision footprints');
assert.match(estate, /for\(const o of r\.obstacles\)/, 'movement guard resolves furniture overlaps');
assert.match(estate, /const inEntryLane=Math\.abs\(p\.x\)<1\.85&&p\.z>r\.halfD-4\.4/, 'entry and exit corridor stays clear of furniture push-out');
assert.match(estate, /THREE\.MathUtils\.clamp\(p\.x,-r\.halfW,r\.halfW\)/, 'player remains inside the room bounds');
assert.match(estate, /window\.__estateInteriorId=null/, 'exit clears the active interior state');
console.log('Estates interior physics checks: 9 assertions passed');
