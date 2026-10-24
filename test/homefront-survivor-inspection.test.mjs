import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');

assert.match(page, /function inspectYardSurvivor\(e\)/, '3D refuge supports direct survivor inspection');
assert.match(page, /raycaster\.intersectObject\(survivorGroup,true\)/, 'inspection raycasts only against survivor actors');
assert.match(page, /model\.userData\.survivorId=String\(survivor\.id\|\|i\)/, 'animated survivor actors carry a stable inspection id');
assert.match(page, /g\.userData\.survivorId=String\(survivor\.id\|\|i\)/, 'procedural survivor actors carry a stable inspection id');
assert.match(page, /Current activity:/, 'inspection explains the survivor\'s current job');
assert.match(page, /Work target:/, 'inspection exposes a survivor\'s current work target');
assert.match(page, /survivor\.taskReason/, 'inspection includes the behavior reason when available');
assert.match(page, /survivorInspection/, 'inspection panel is accessible and dismissible');
console.log('Homefront survivor inspection tests passed');
