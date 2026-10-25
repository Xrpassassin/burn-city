import assert from 'node:assert/strict';
import { createCandidateBuildPlan, candidatePlanCanShip } from './nft-avatar-candidate-adapter.mjs';

const catalog = {
  status: 'research-only',
  candidates: [
    { id: 'humanoid-base', intendedCollection: '589', sourceUrl: 'https://example.org/base', purpose: 'base', reportedLicense: 'CC0' },
    { id: 'shared-animation', intendedCollection: 'shared-technical', sourceUrl: 'https://example.org/anim', purpose: 'animation', reportedLicense: 'CC0' },
    { id: 'racc-base', intendedCollection: 'racc', sourceUrl: '', purpose: 'creature', reportedLicense: 'unknown' }
  ]
};
const plan = createCandidateBuildPlan(catalog, 'humanoid-base', '589');
assert.equal(plan.ok, true);
assert.equal(plan.status, 'research-plan');
assert.equal(plan.runtimeEligible, false);
assert.ok(Object.values(plan.gates).every(value => value === false));
assert.equal(candidatePlanCanShip(plan), false);
const wrongCollection = createCandidateBuildPlan(catalog, 'humanoid-base', 'racc');
assert.equal(wrongCollection.ok, false);
assert.equal(wrongCollection.reason, 'collection-mismatch');
const shared = createCandidateBuildPlan(catalog, 'shared-animation', 'fk');
assert.equal(shared.ok, true, 'shared technical assets may be evaluated across collection pipelines');
assert.throws(() => createCandidateBuildPlan(catalog, 'missing', '589'), /Unknown model candidate/);
assert.throws(() => createCandidateBuildPlan({ status: 'approved', candidates: [] }, 'x', '589'), /research-only/);
assert.throws(() => createCandidateBuildPlan(catalog, 'humanoid-base', 'other'), /Unknown target collection/);
console.log('NFT avatar candidate adapter: 7 assertions passed');
