import assert from 'node:assert/strict';
import { resolveFightTap } from './fishing-rules.mjs';

const clean = resolveFightTap({ position: 0.5, zoneStart: 0.4, zoneWidth: 0.2 });
assert.deepEqual(clean, { hit: true, miss: false, tension: 0, broke: false });
const miss = resolveFightTap({ position: 0.9, zoneStart: 0.4, zoneWidth: 0.2, rarity: 4 });
assert.equal(miss.hit, false);
assert.equal(miss.tension, 0.21);
const run = resolveFightTap({ position: 0.5, zoneStart: 0.4, zoneWidth: 0.2, running: true, rarity: 4 });
assert.equal(run.hit, false, 'reeling during a fish run never counts as a clean hit');
assert.equal(run.tension, 0.38);
const betterRod = resolveFightTap({ position: 0.9, zoneStart: 0.4, zoneWidth: 0.2, rarity: 4, rodTier: 3 });
assert.ok(betterRod.tension < miss.tension, 'better rods reduce tension from a missed reel');
const snapped = resolveFightTap({ position: 0.9, zoneStart: 0.4, zoneWidth: 0.2, running: true, tension: 0.8, rarity: 4 });
assert.equal(snapped.broke, true);
assert.equal(snapped.tension, 1.18);
console.log('Fishing fight rules: 6 assertions passed');
