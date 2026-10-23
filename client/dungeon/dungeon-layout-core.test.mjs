import assert from 'node:assert/strict';
import { generateDungeonLayout } from './dungeon-layout-core.mjs';

function reachableCount(layout) {
  const links = Array.from({ length: layout.rooms.length }, () => []);
  for (const { a, b } of layout.corridors) {
    links[a].push(b);
    links[b].push(a);
  }
  const seen = new Set([layout.entranceId]);
  const queue = [layout.entranceId];
  for (let i = 0; i < queue.length; i += 1) {
    for (const next of links[queue[i]]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen.size;
}

const first = generateDungeonLayout({ seed: 'ashen-depths-001' });
const repeat = generateDungeonLayout({ seed: 'ashen-depths-001' });
assert.deepEqual(first, repeat, 'same seed and options must yield identical layout');
assert.notDeepEqual(first, generateDungeonLayout({ seed: 'ashen-depths-002' }), 'different seeds should normally vary the layout');
assert.equal(first.rooms.length, 25);
assert.equal(reachableCount(first), first.rooms.length, 'every room must be reachable');
assert.equal(first.rooms[first.entranceId].type, 'entrance');
assert.equal(first.rooms[first.bossId].type, 'boss');
assert.ok(first.mainPathLength >= 1);
assert.equal(first.corridors.length >= first.rooms.length - 1, true);

for (const options of [
  { seed: '' },
  { seed: 'x', columns: 1 },
  { seed: 'x', rows: 21 },
  { seed: 'x', columns: 2.5 },
  { seed: 'x', loopChance: -0.1 },
  { seed: 'x', loopChance: 1.1 }
]) assert.throws(() => generateDungeonLayout(options));

for (let i = 0; i < 100; i += 1) {
  const layout = generateDungeonLayout({ seed: 'seed-' + i, columns: 7, rows: 6, loopChance: i / 100 });
  assert.equal(reachableCount(layout), 42, 'generated layouts must remain connected');
  assert.equal(layout.rooms.filter(room => room.type === 'entrance').length, 1);
  assert.equal(layout.rooms.filter(room => room.type === 'boss').length, 1);
}
console.log('Eternal Grind seeded dungeon layout core: all tests passed');
