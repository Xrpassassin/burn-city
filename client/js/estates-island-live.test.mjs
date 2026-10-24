import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { installEstatesIslandLive } from './estates-island-live.mjs';

assert.equal(typeof installEstatesIslandLive, 'function');
const app = await readFile(new URL('./app.js', import.meta.url), 'utf8');
const sw = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
assert(app.includes("import { installEstatesIslandLive } from './estates-island-live.mjs';"), 'app imports live integration');
assert(app.includes('window.__estatesIslandLive.tick(dt,f,s,run)'), 'live controller is called from explore frame loop');
assert(app.includes('installEstatesIslandLive({THREE,scene:S,player:P,avatar,camera:C'), 'integration receives real host objects');
assert(sw.includes("'js/estates-island-live.mjs'"), 'service worker precaches live integration');
assert(sw.includes('bc-v107-estates-island-live'), 'service worker cache version is refreshed');
console.log('estates-island-live: host wiring smoke tests passed');
