// Regression guard: the near-LOD pool in citizens.mjs must actually add each rigged clone to the scene and the
// slot list. #635 accidentally pulled those statements into a trailing // comment, so getSlot() returned undefined,
// no near model was ever drawn, and everyone up close showed the 1.2k-tri far mesh (smeared, purple, blocky).
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('./citizens.mjs', import.meta.url), 'utf8');
const code = src.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');   // drop line comments
const body = code.slice(code.indexOf('const getSlot'), code.indexOf('\n  };', code.indexOf('const getSlot')));
assert.ok(body.length > 0, 'getSlot found');
for (const need of ['c.S.add(root)', 'slots.push(s)', 'return s']) assert.ok(body.includes(need), 'getSlot must run: ' + need);
console.log('citizens near-LOD guard ok');
