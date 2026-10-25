import assert from 'node:assert/strict';
import {MARA_CHOICES,maraChoice} from './mara-dialogue.mjs';
assert.equal(MARA_CHOICES.length,3);
assert.equal(new Set(MARA_CHOICES.map(c=>c.id)).size,3);
assert.equal(maraChoice('find-truth').faction,'ashen-veil');
assert.equal(maraChoice('bogus'),null);
console.log('Mara branching dialogue tests passed');
