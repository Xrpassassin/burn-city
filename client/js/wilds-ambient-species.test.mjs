import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AMBIENT_SPECIES, withAmbientSpecies } from './wilds-ambient-species.mjs';

const data = JSON.parse(readFileSync(new URL('../data/wilds/creatures.json', import.meta.url)));
const before = data.creatures.length;
withAmbientSpecies(data);
for (const id of ['mirehare', 'ashfang']) assert.ok(data.creatures.some(c => c.id === id), id + ' is available');
assert.equal(data.creatures.length, before + AMBIENT_SPECIES.filter(s => !JSON.stringify(data.creatures.slice(0, before)).includes('"' + s.id + '"')).length);
const n = data.creatures.length; withAmbientSpecies(data); assert.equal(data.creatures.length, n, 'merge is idempotent');
const ids = new Set(data.creatures.map(c => c.id));
for (const sp of ['mirehare', 'ashfang', 'veilwing', 'shardmole']) assert.ok(ids.has(sp), 'ambient spawn species ' + sp + ' exists');
console.log('wilds-ambient-species: all tests passed');
