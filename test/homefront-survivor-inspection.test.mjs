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
assert.match(page, /Assign survivor role/, 'inspection exposes a direct role assignment control');
assert.match(page, /act\(\{type:'assign',survivorId:survivor\.id,role\}\)/, 'role orders use the existing server-authoritative action');
assert.match(page, /if\(!visiting\)\{const orderLabel/, 'read-only visitor mode does not expose assignment controls');
assert.match(page, /role==='farmer'&&!\(base\.farmPlots\|\|\[\]\)\.some\(plot=>plot\.crop\)/, 'farmer assignment is disabled until crops are planted');
console.log('Homefront survivor inspection tests passed');
