import assert from 'node:assert/strict';
import { explorationGuidance } from './homefront-exploration-guidance.mjs';

const depot = explorationGuidance({ x: -8, z: -65 }, []);
assert.equal(depot.nearest.id, 'north_bus_depot');
assert.equal(depot.discoveredNow, true);
assert.ok(depot.routeLeads.length > 0, 'nearby landmarks should reveal unexplored route leads');
assert.ok(depot.storyLead?.includes('The Last Convoy'), 'discovering the convoy start should reveal its next clue');

const knownDepot = explorationGuidance({ x: -8, z: -65 }, ['north_bus_depot']);
assert.equal(knownDepot.alreadyDiscovered, true);
assert.equal(knownDepot.discoveredNow, false);

const farAway = explorationGuidance({ x: 99, z: 99 }, []);
assert.equal(farAway.discoveredNow, false);
assert.equal(farAway.routeLeads.length, 0);

const invalid = explorationGuidance(null, []);
assert.equal(invalid.nearest, null);
console.log('Homefront exploration guidance checks passed.');
