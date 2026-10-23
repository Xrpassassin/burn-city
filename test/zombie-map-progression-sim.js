// Map progression guard: players may start on the Refinery, but cannot request Map 2 directly.
const assert = require('node:assert/strict');
const { Room } = require('../server/game');
const first = new Room('map-progression-first', 'zombie', 'refinery');
const bypass = new Room('map-progression-bypass', 'zombie', 'cosmodrome');
assert.equal(first.mapId, 'refinery', 'Free Play can explicitly start on Map 1');
assert.equal(bypass.mapId, null, 'a client-supplied Cosmodrome selection is rejected at room creation');
const Heli = require('../server/heli');
const rnd = new Room('map-progression-random', 'zombie');
assert.equal(Heli.advances(first), true, 'Refinery Free Play advances to the Cosmodrome');
assert.equal(Heli.advances(rnd), true, 'random-map Free Play advances to the Cosmodrome');
const ranked = new Room('map-progression-ranked', 'zombie'); ranked.ranked = { state: 'lobby' };
const daily = new Room('map-progression-daily', 'zombie'); daily.daily = { day: 1 };
assert.equal(Heli.advances(ranked), false, 'ranked rooms keep the fixed map');
assert.equal(Heli.advances(daily), false, 'daily rooms keep the fixed map');
rnd.mapId = 'cosmodrome'; assert.equal(Heli.advances(rnd), false, 'the Cosmodrome does not advance again');
rnd.reset(); assert.equal(rnd.M?.kind, 'cosmodrome', 'reset after transition builds the Cosmodrome');
console.log('Zombie map progression guard passed.');
