'use strict';
const assert = require('node:assert/strict');
const Exploration = require('./homefront-exploration');

const depot = { x: -8, z: -65 };
let result = Exploration.discover({}, { account: 'explorer-a', player: depot, landmarkId: 'north_bus_depot', now: 100 });
assert.equal(result.newlyDiscovered, true);
assert.deepEqual(result.progress.discoveredIds, ['north_bus_depot']);
assert.equal(result.progress.intel.length, 1);
assert(result.progress.storyLeads.some(lead => lead.threadId === 'evacuation_route' && lead.nextLandmarkId === 'river_checkpoint'),
  'discovering the convoy depot should reveal the next route clue');
assert.throws(() => Exploration.discover(result.state, { account: 'explorer-a', player: { x: 80, z: 80 }, landmarkId: 'north_bus_depot', now: 101 }), /too_far_to_discover/);
const duplicate = Exploration.discover(result.state, { account: 'explorer-a', player: depot, landmarkId: 'north_bus_depot', now: 102 });
assert.equal(duplicate.newlyDiscovered, false);
assert.equal(duplicate.progress.intel.length, 1, 'retries must not duplicate field notes');

const polluted = { 'explorer-b': { discovered: ['north_bus_depot', 'constructor', 'north_bus_depot'], firstDiscoveredAt: { north_bus_depot: 20 }, intel: [{ id: 'x', landmarkId: 'north_bus_depot', text: 'Found a clue', at: 20 }, { id: 'bad', landmarkId: 'constructor', text: 'bad', at: 20 }] } };
const normalized = Exploration.normalize(polluted);
assert.deepEqual(normalized['explorer-b'].discovered, ['north_bus_depot']);
assert.equal(Exploration.snapshot(normalized, 'explorer-b').intel.length, 1);
assert.deepEqual(Exploration.snapshot({}, 'new-account').discoveredIds, []);

// Surveying every location is not the same as completing the narrative objective.
const content = require('../client/arena/homefront-exploration-content.mjs');
for (const thread of content.STORY_THREADS) {
  const surveyed = Exploration.storyLeads([thread.startAt, ...thread.clues, thread.payoffAt]);
  const lead = surveyed.find(item => item.threadId === thread.id);
  assert(lead, 'fully surveyed story route should remain visible in the journal');
  assert.equal(lead.status, 'route_surveyed');
  assert.notEqual(lead.complete, true, 'location visits alone must not award story completion');
  assert.equal(lead.nextLandmarkId, undefined, 'all surveyed stops should direct players toward clue interactions, not another location');
}
console.log('Homefront server-authoritative exploration tests passed.');
