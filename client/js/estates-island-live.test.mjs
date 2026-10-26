import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installEstatesIslandLive } from './estates-island-live.mjs';

assert.equal(typeof installEstatesIslandLive, 'function');
const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert(app.includes("import { installEstatesIslandLive } from './estates-island-live.mjs';"), 'app imports live integration');
assert(app.includes('window.__estatesIslandLive.tick(dt,f,s,run)'), 'live controller is called from explore frame loop');
const live = await readFile(new URL('./estates-island-live.mjs', import.meta.url), 'utf8');
assert(live.includes('exitPressed:edge'), 'keyboard interaction edge reaches the exit-gate controller');
assert(live.includes('active=false; hidePanel(); controllerRef.dispose();'), 'exit disposes the current controller, not the original one');
assert(!live.includes('active=false; hidePanel(); controller.dispose();'), 'stale controller disposal regression');
assert(live.includes('Catalog mapping:'), 'lot inspection labels catalog mapping rather than implying owner assignment');
assert(live.includes('That record does not prove ownership'), 'catalog membership must never be presented as verified ownership');
assert(live.includes('updateLandmarkInteraction(edge,Boolean(result.property))'), 'public landmark interactions are checked in the live exploration loop');
assert(live.includes('showLandmarkDetails(nearest)'), 'pressing E opens a landmark detail panel');
assert(live.includes('no ownership or transaction is implied'), 'landmark interactions cannot imply ownership or a live transaction');
assert(live.includes('if(property.confirmedInteraction){showLotInspection(property);return;}'), 'E-key interaction opens the lot inspection directly');
assert.equal((live.match(/onPropertyPrompt:property=>\{lastProperty=property;lastLandmarkId=null;showLotPrompt\(property\);\}/g)||[]).length,2,'initial and recreated island controllers share the same lot prompt behavior');
assert.equal((live.match(/if\(event\.confirmedInteraction\)\{leaveIsland\(\);return;\}/g) || []).length, 2, 'both initial and recreated controllers honor confirmed keyboard exit');
assert(app.includes('installEstatesIslandLive({THREE,scene:S,player:P,avatar,camera:C'), 'integration receives real host objects');
assert(sw.includes("'js/estates-island-live.mjs'"), 'service worker precaches live integration');
assert(/const VERSION = 'bc-v\d+-/.test(sw), 'service worker cache version is set');   // exact number moves with every merge
console.log('estates-island-live: host wiring smoke tests passed');
