import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../client/arena/homefront.html', import.meta.url), 'utf8');

assert.match(page, /function inspectYardSurvivor\(e,directSurvivor=null\)/, '3D refuge supports direct survivor inspection');
assert.match(page, /function updateNearbyInteraction\(constructionView\)/, 'nearby survivors create a proximity-based interaction prompt');
assert.match(page, /closestDistance=2\.5/, 'survivor interaction requires close physical proximity');
assert.match(page, /e\.key==='e'\|\|e\.key==='E'/, 'keyboard users can interact with a nearby survivor');
assert.match(page, /Talk \/ inspect · E/, 'interaction prompt explains the contextual action and key');
assert.match(page, /function inspectNearbySurvivor\(survivor\)/, 'touch prompt opens the same survivor inspection panel');
assert.match(page, /raycaster\.intersectObject\(survivorGroup,true\)/, 'inspection raycasts only against survivor actors');
assert.match(page, /model\.userData\.survivorId=String\(survivor\.id\|\|i\)/, 'animated survivor actors carry a stable inspection id');
assert.match(page, /g\.userData\.survivorId=String\(survivor\.id\|\|i\)/, 'procedural survivor actors carry a stable inspection id');
assert.match(page, /Current activity:/, 'inspection explains the survivor\'s current job');
assert.match(page, /data-survivor-dialogue/, 'talk interaction provides contextual survivor dialogue');
assert.match(page, /const lines=hp<40\?/, 'dialogue reflects survivor health, morale, and role');
assert.match(page, /Work target:/, 'inspection exposes a survivor\'s current work target');
assert.match(page, /survivor\.taskReason/, 'inspection includes the behavior reason when available');
assert.match(page, /survivorInspection/, 'inspection panel is accessible and dismissible');
assert.match(page, /Assign survivor role/, 'inspection exposes a direct role assignment control');
assert.match(page, /act\(\{type:'assign',survivorId:survivor\.id,role\}\)/, 'role orders use the existing server-authoritative action');
assert.match(page, /if\(!visiting\)\{const orderLabel/, 'read-only visitor mode does not expose assignment controls');
assert.match(page, /role==='farmer'&&!\(base\.farmPlots\|\|\[\]\)\.some\(plot=>plot\.crop\)/, 'farmer assignment is disabled until crops are planted');
console.log('Homefront survivor inspection tests passed');

assert.match(page, /function inspectYardStructure\(e,directStructure=null\)/, '3D yard supports direct inspection of built structures');
assert.match(page, /function showStructureInspection\(structure\)/, 'structure inspection exposes integrity and contextual actions');
assert.match(page, /userData\.structureId=s\.id/, 'rendered structures carry a stable server object id');
assert.match(page, /function inspectYardFarmPlot\(plot\)/, 'farm plots expose contextual planting, watering, and harvest actions');
assert.match(page, /type:'turret_manning',target:structure\.id,manned:!structure\.manned/, 'turret crew interaction uses the server-authoritative action');
assert.match(page, /type:'trench_upgrade',target:structure\.id/, 'trench upgrades use the server-authoritative action');
assert.match(page, /nearbyStructure=best\?\.kind==='structure'/, 'nearby structures participate in proximity prompts');
assert.match(page, /promptButton\.textContent=best\.kind==='survivor'\?/, 'interaction prompt adapts to survivors, farm plots, and structures');
assert.match(page, /host\.append\(renderer\.domElement\);renderer\.domElement\.addEventListener\('pointerup',inspectYardSurvivor\);renderer\.domElement\.addEventListener\('pointerup',inspectYardStructure\);/, '3D inspection handlers are registered only after the renderer exists');
assert.doesNotMatch(page, /\\\\nfunction initWorld/, 'module code uses a real line break before world initialization');
