import assert from 'node:assert/strict';
import { createEstatesCityLakeGeometry, CITY_LAKE_DIMENSIONS } from './estates-city-lake-geometry.mjs';
import { PIER_START, SHIP_MODEL, SHIP_SCALES, findPartyBargeBerth, partyBargeBlocksBoat } from './pirate-party-barge-layout.mjs';

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
  assert.ok(SHIP_SCALES.includes(berth.scale) && berth.scale >= 8, 'cruise-ship scale galleon');
  assert.equal(pier.heightAt(PIER_START), 0);
  assert.equal(pier.heightAt(pier.v1), berth.deckY);
  // The gangway's top lands inside the rails at the main deck's height.
  const top = { x: pier.base.x + dir.x * pier.v1, z: pier.base.z + dir.z * pier.v1 };
  const tv = (top.x - deck.base.x) * deck.dir.x + (top.z - deck.base.z) * deck.dir.z;
  const tu = (top.x - deck.base.x) * deck.side.x + (top.z - deck.base.z) * deck.side.z;
  assert.ok(tv > deck.v0 && tv < deck.v1 && Math.abs(tu) < deck.hw, 'gangway meets the deck');
  assert.ok(Math.abs(deck.heightAt(tv) - berth.deckY) < 1e-6, 'level boarding');
  const steepest = Math.max(...Array.from({ length: Math.ceil(pier.v1 - PIER_START) }, (_, i) =>
    pier.heightAt(PIER_START + i + 1) - pier.heightAt(PIER_START + i)));
  assert.ok(steepest < .4, 'gangway is walkable (' + steepest.toFixed(2) + ')');
  assert.ok(partyBargeBlocksBoat(berth, berth.site.x, berth.site.z), 'hull stops a boat');
  const clear = (SHIP_MODEL.beam + 1.2) * berth.scale;
  const alongside = { x: berth.site.x + dir.x * clear, z: berth.site.z + dir.z * clear };
  assert.ok(inLake(alongside.x, alongside.z) && !partyBargeBlocksBoat(berth, alongside.x, alongside.z), 'open water past the beam');
  for (const v of [5, 20]) {
    const p = { x: pier.base.x + dir.x * v, z: pier.base.z + dir.z * v };
    assert.ok(partyBargeBlocksBoat(berth, p.x, p.z), 'gangway stops a boat');
  }
  const entryBlock = { ...shoreAt(-150), r: 5 };
  const alternate = findPartyBargeBerth({ ...args, colliders: [entryBlock] });
  assert.ok(alternate && Math.hypot(alternate.shore.x - entryBlock.x, alternate.shore.z - entryBlock.z) > 6);
  assert.equal(findPartyBargeBerth({ ...args, inLake: () => false }), null, 'skip placement without clear water');
}
console.log('party barge layout: ramp, dock clearance and boat collision passed');
