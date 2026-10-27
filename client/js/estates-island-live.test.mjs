import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installEstatesIslandLive, islandMoveDelta } from './estates-island-live.mjs';

assert.equal(typeof installEstatesIslandLive, 'function');
const straight=islandMoveDelta({dt:1/60,yaw:0,moveX:1,moveZ:0},4.5);
const diagonal=islandMoveDelta({dt:1/60,yaw:0,moveX:1,moveZ:1},4.5);
assert(Math.abs(Math.hypot(straight.x,straight.z)-Math.hypot(diagonal.x,diagonal.z))<1e-10,'diagonal travel must not be faster');
const resume=islandMoveDelta({dt:5,yaw:0,moveX:1,moveZ:0},7.2);
assert(Math.hypot(resume.x,resume.z)<=0.720000001,'resume after a background pause must not jump across island');
const idle=islandMoveDelta({dt:1,yaw:0,moveX:0,moveZ:0},7.2);
assert.equal(Math.hypot(idle.x,idle.z),0,'idle input must not drift');

for (const bad of [
  {dt:NaN,yaw:0,moveX:1,moveZ:0},
  {dt:Infinity,yaw:0,moveX:1,moveZ:0},
  {dt:1/60,yaw:NaN,moveX:1,moveZ:0},
  {dt:1/60,yaw:0,moveX:Infinity,moveZ:0},
  {dt:1/60,yaw:0,moveX:1e308,moveZ:1e308}
]) {
  assert.deepEqual(islandMoveDelta(bad,4.5),{x:0,y:0,z:0},'invalid input must not move avatar');
}
assert.deepEqual(islandMoveDelta({dt:1/60,yaw:0,moveX:1,moveZ:0},-1),{x:0,y:0,z:0},'negative speed must not move avatar');

const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert(app.includes("import { installEstatesIslandLive } from './estates-island-live.mjs';"), 'app imports live integration');
assert(app.includes('window.__estatesIslandLive.tick(dt,f,s,run)'), 'live controller is called from explore frame loop');
assert(app.includes('cityGate:ESTATE.islandEntrance'), 'walk-up entry uses the actual Estates sign');
const estate = await readFile(new URL('./estate.js', import.meta.url), 'utf8');
assert(estate.includes('ENTER ISLAND HERE'), 'the city sign identifies the island entrance');
assert(estate.includes('lotC.clone().addScaledVector(dir, -LD/2+8)'), 'entry follows the sign position in the generated district');
const live = await readFile(new URL('./estates-island-live.mjs', import.meta.url), 'utf8');
assert(live.includes('exitPressed:edge'), 'keyboard interaction edge reaches the exit-gate controller');
assert(live.includes('Math.hypot(player.pos.x-gate.x,player.pos.z-gate.z)'), 'entry proximity follows the configured sign');
assert(live.includes("await leaseRequest('enter',{clientId})"), 'island activation requests server admission');
assert(live.includes("leaseRequest('heartbeat',{leaseToken:token})"), 'active admission is refreshed');
assert(live.includes("leaseRequest('leave',{leaseToken:token},true)"), 'exit releases the admission');
assert(live.indexOf("await leaseRequest('enter',{clientId})") < live.indexOf('active=true; root.visible=true'), 'the island is revealed only after admission');
assert(live.includes('active=false; root.visible=false; hidePanel(); controllerRef.dispose();'), 'exit hides island and disposes active controller');
assert(live.includes('root.visible = false'), 'island should be hidden in city');
assert(live.includes('active=true; root.visible=true'), 'entering island must reveal scene');
assert(live.includes('enterFromCity(){'), 'city landmark must expose entry action');
assert(app.includes("if(u.kind==='estate' && window.__estatesIslandLive?.enterFromCity)"), 'city Estates landmark routes to island');
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
