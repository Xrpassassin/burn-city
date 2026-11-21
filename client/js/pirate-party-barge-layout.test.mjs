import assert from 'node:assert/strict';
import { createEstatesCityLakeGeometry, CITY_LAKE_DIMENSIONS } from './estates-city-lake-geometry.mjs';
import { BARGE_DECK_Y, PIER_START, findPartyBargeBerth, partyBargeBlocksBoat } from './pirate-party-barge-layout.mjs';

const { depthRadius, widthRadius, islandRadiusX, islandRadiusZ } = CITY_LAKE_DIMENSIONS;
const island = createEstatesCityLakeGeometry({ islandRadiusX, islandRadiusZ, waterWidth: 20 });
for (const yaw of [0, .35, -.85]) {
  const dir = { x: Math.sin(yaw), z: Math.cos(yaw) }, side = { x: -dir.z, z: dir.x };
  const point = (u, v) => ({ x: 30 + side.x * u + dir.x * v, z: 80 + side.z * u + dir.z * v });
  const inLake = (x, z) => {
    const u = (x - 30) * side.x + (z - 80) * side.z;
    const v = (x - 30) * dir.x + (z - 80) * dir.z;
    return Math.hypot(u / widthRadius, v / depthRadius) < 1 && !island.isIsland(u, v);
  };
  const shoreAt = u => {
    for (let v = -depthRadius; v < 0; v++) {
      const p = point(u, v);
      if (inLake(p.x, p.z)) return p;
    }
  };
  const decks = [
    { base: point(0, -139), dir, side, v0: -2, v1: 51, hw: 4 },
    { base: shoreAt(-55), dir, side, v0: -3, v1: 22, hw: 2.1 },
    { base: shoreAt(-95), dir, side, v0: -3, v1: 16, hw: 1.8 },
  ];
  const args = { shoreAt, inLake, dir, side, decks, colliders: [] };
  const berth = findPartyBargeBerth(args);
  assert.ok(berth, 'a berth fits beyond the existing docks and bridge');
  const [pier, deck] = berth.decks;
  assert.equal(pier.heightAt(PIER_START), 0);
  assert.equal(pier.heightAt(pier.v1), BARGE_DECK_Y);
  const reach = (pier.base.x - deck.base.x) * dir.x + (pier.base.z - deck.base.z) * dir.z + pier.v1;
  assert.ok(reach > deck.v0, 'pier and deck overlap at the boarding opening');
  assert.ok(partyBargeBlocksBoat(berth, deck.base.x, deck.base.z), 'hull stops a boat');
  const alongside = { x: deck.base.x + side.x * 16, z: deck.base.z + side.z * 16 };
  assert.ok(inLake(alongside.x, alongside.z) && !partyBargeBlocksBoat(berth, alongside.x, alongside.z));
  const entryBlock = { ...shoreAt(-150), r: 5 };
  const alternate = findPartyBargeBerth({ ...args, colliders: [entryBlock] });
  assert.ok(alternate && Math.hypot(alternate.shore.x - entryBlock.x, alternate.shore.z - entryBlock.z) > 6);
  assert.equal(findPartyBargeBerth({ ...args, inLake: () => false }), null, 'skip placement without clear water');
}
console.log('party barge layout: ramp, dock clearance and boat collision passed');
