import assert from 'node:assert/strict';
import { MARITIME_BIOMES, getMaritimeCell, nearbyMaritimeCells } from './maritime-biomes.js';
const a = getMaritimeCell(120, -310);
assert.deepEqual(a, getMaritimeCell(120, -310), 'same coordinates yield same biome');
assert.deepEqual(a, getMaritimeCell(121, -309), 'same cell stays stable');
assert.ok(MARITIME_BIOMES[a.biome]);
assert.equal(nearbyMaritimeCells(0, 0, 1).length, 9);
assert.equal(nearbyMaritimeCells(0, 0, 0).length, 1);
assert.throws(() => nearbyMaritimeCells(0, 0, 4), RangeError);
assert.throws(() => getMaritimeCell(NaN, 0), TypeError);
for (const cell of nearbyMaritimeCells(0, 0, 3)) {
  const biome = MARITIME_BIOMES[cell.biome];
  assert.ok(!cell.hazard || biome.hazards.includes(cell.hazard));
  assert.ok(!cell.discovery || biome.discoveries.includes(cell.discovery));
}
console.log('BlackTide maritime biome tests passed');
