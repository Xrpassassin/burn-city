import assert from 'node:assert/strict';
import { buildMigrationPlan, migrationTargetOptions, MIGRATION_RULESET_ID } from './migration-plan.mjs';

const save = {
  v: 2, name: 'Ashwalker', cls: 'warrior', classes: ['warrior', 'mage'],
  lvl: 18, xp: 340, race: 'human', gold: 582, best: 11,
  eq: { primary: { id: 'sword' }, head: { id: 'helm' }, charm: null },
  gen: [{ id: 'bag-a' }, null, { id: 'bag-b' }],
  mats: { ore: 7, shard: 3 }, pots: { hp: 2, mp: 4 }
};
const before = JSON.stringify(save);
const a = buildMigrationPlan(save, 'arcanist');
const b = buildMigrationPlan(save, 'arcanist');
assert.deepEqual(a, b, 'same source and target must yield deterministic plan');
assert.equal(a.planType, 'preview-only');
assert.equal(a.readyForCommit, false);
assert.equal(a.rulesetId, MIGRATION_RULESET_ID);
assert.equal(a.proposed.targetClass.id, 'arcanist');
assert.equal(a.proposed.specializationChoiceRequired, true);
assert.deepEqual(a.proposed.availableSpecializations, ['Spellfire', 'Runeseer']);
assert.equal(a.sourceSummary.level, 18);
assert.equal(a.sourceSummary.xp, 340);
assert.equal(a.sourceSummary.equippedItems, 2);
assert.equal(a.sourceSummary.occupiedBagSlots, 2);
assert.equal(a.sourceIntegrity.inputMutated, false);
assert.equal(a.sourceIntegrity.storageAccessed, false);
assert.equal(JSON.stringify(save), before, 'source save must remain unchanged');
assert.equal(migrationTargetOptions().length, 6);
assert.throws(() => buildMigrationPlan(null, 'arcanist'), /JSON object/);
assert.throws(() => buildMigrationPlan({ ...save, v: 999 }, 'arcanist'), /version is not supported/);
assert.throws(() => buildMigrationPlan({ ...save, lvl: 0 }, 'arcanist'), /positive integer/);
assert.throws(() => buildMigrationPlan(save, 'not-a-class'), /supported proposed target/);
assert.throws(() => buildMigrationPlan(save, 'arcanist', '   '), /ruleset ID/);
console.log('Migration plan tests passed.');
