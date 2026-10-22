import assert from 'node:assert/strict';
import { previewLegacyCharacter } from './character-migration-preview.mjs';

const save = {
  v: 2, name: 'Test Hero', cls: 'warrior', classes: ['warrior', 'mage'],
  lvl: 12, xp: 87, race: 'human', gold: 1234, best: 8,
  eq: { primary: { id: 'sword' }, head: { id: 'helm' }, empty: null },
  gen: [{ id: 'bag' }, null, { id: 'bag2' }],
  mats: { ore: 4, shard: 2 }, pots: { hp: 3, mp: 1 }
};
const before = JSON.stringify(save);
const preview = previewLegacyCharacter(save, 'arcanist');
assert.equal(preview.previewOnly, true);
assert.equal(preview.selectedTarget.id, 'arcanist');
assert.deepEqual(preview.legacyClasses.map(x => x.id), ['warrior', 'mage']);
assert.deepEqual(preview.suggestions.map(x => x.id), ['vanguard', 'reaver', 'arcanist', 'binder']);
assert.equal(preview.preservedSummary.level, 12);
assert.equal(preview.preservedSummary.xp, 87);
assert.equal(preview.preservedSummary.equippedItems, 2);
assert.equal(preview.preservedSummary.occupiedBagSlots, 2);
assert.equal(preview.preservedSummary.gold, 1234);
assert.equal(JSON.stringify(save), before, 'preview must not mutate the input');
assert.throws(() => previewLegacyCharacter(null), /JSON object/);
assert.throws(() => previewLegacyCharacter({ lvl: 2 }), /recognized legacy class/);
assert.throws(() => previewLegacyCharacter(save, 'unknown'), /supported proposed target/);
console.log('Character migration preview tests passed.');
