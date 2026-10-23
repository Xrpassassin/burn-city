// Map progression guard: players may start on the Refinery, but cannot request Map 2 directly.
const assert = require('node:assert/strict');
const { Room } = require('../server/game');
const first = new Room('map-progression-first', 'zombie', 'refinery');
const bypass = new Room('map-progression-bypass', 'zombie', 'cosmodrome');
assert.equal(first.mapId, 'refinery', 'Free Play can explicitly start on Map 1');
assert.equal(bypass.mapId, null, 'a client-supplied Cosmodrome selection is rejected at room creation');
console.log('Zombie map progression guard passed.');
