import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { DISTRICTS, LANDMARKS, ROUTES, STORY_THREADS, WORLD_BOUNDS, districtForLandmark, landmarkById, landmarksInDistrict, routeBetween } from './homefront-exploration-content.mjs';

const require = createRequire(import.meta.url);
const ServerWorld = require('../../server/homefront-world.js');
const serverById = new Map(ServerWorld.POINTS_OF_INTEREST.map(point => [point.id, point]));
const authoredById = new Map(LANDMARKS.map(point => [point.id, point]));

assert.equal(Object.keys(DISTRICTS).length, 7, 'all established expedition zones have authored district content');
assert.equal(LANDMARKS.length, ServerWorld.POINTS_OF_INTEREST.length, 'authored content covers every server-authored point of interest');
assert.equal(authoredById.size, LANDMARKS.length, 'landmark ids are unique');
assert.equal(serverById.size, ServerWorld.POINTS_OF_INTEREST.length, 'server point ids are unique');
for (const source of ServerWorld.POINTS_OF_INTEREST) {
  const authored = authoredById.get(source.id);
  assert.ok(authored, 'missing authored content for server point ' + source.id);
  assert.deepEqual([authored.x, authored.z, authored.risk], [source.x, source.z, source.risk], 'authored content must match authoritative server coordinates and risk for ' + source.id);
  assert.ok(DISTRICTS[authored.district], 'landmark district must exist for ' + source.id);
  assert.ok(authored.title && authored.objective && authored.story, 'landmark needs title, objective, and story for ' + source.id);
  assert.ok(authored.interactables.length >= 2, 'landmark needs multiple interactions for ' + source.id);
  assert.ok(authored.interior.length >= 1, 'landmark needs an explorable interior/space list for ' + source.id);
  assert.ok(authored.x >= WORLD_BOUNDS.minX && authored.x <= WORLD_BOUNDS.maxX, 'landmark X must be in world bounds for ' + source.id);
  assert.ok(authored.z >= WORLD_BOUNDS.minZ && authored.z <= WORLD_BOUNDS.maxZ, 'landmark Z must be in world bounds for ' + source.id);
  for (const target of authored.routeTo) assert.ok(authoredById.has(target), 'route target must exist: ' + source.id + ' -> ' + target);
}
for (const route of ROUTES) {
  assert.ok(authoredById.has(route.from) && authoredById.has(route.to), 'route endpoints must exist: ' + route.id);
  assert.ok(route.risk >= 1 && route.risk <= 5, 'route risk must be bounded');
  assert.ok(routeBetween(route.from, route.to).some(candidate => candidate.id === route.id), 'route lookup must find its route');
}
for (const thread of STORY_THREADS) {
  assert.ok(authoredById.has(thread.startAt) && authoredById.has(thread.payoffAt), 'story thread endpoints must exist');
  for (const clue of thread.clues) assert.ok(authoredById.has(clue), 'story clue location must exist');
}
assert.equal(landmarkById('buried_subway').district, 'subway');
assert.equal(districtForLandmark('research_annex').id, 'research_lab');
assert.ok(landmarksInDistrict('hospital').length >= 3, 'hospital district contains a multi-stop exploration loop');
assert.equal(landmarkById('unknown-site'), null, 'unknown landmark lookup is safe');
console.log('Homefront exploration content checks passed.');
