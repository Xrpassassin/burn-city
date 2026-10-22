import assert from 'node:assert/strict';
import { getZombieVisualPreset, isZombieVisualPreset, listZombieVisualPresets } from './zombie-visual-presets.mjs';
assert.deepEqual(listZombieVisualPresets(), ['refinery', 'ashfall', 'blacktide']);
assert.equal(isZombieVisualPreset('ashfall'), true);
assert.equal(isZombieVisualPreset('nope'), false);
assert.equal(getZombieVisualPreset('nope'), getZombieVisualPreset('refinery'));
assert.equal(getZombieVisualPreset('blacktide').wall.trim, '#48e0d0');
console.log('zombie visual preset tests passed');
