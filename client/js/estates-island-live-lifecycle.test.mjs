import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../client/js/estates-island-live.mjs', import.meta.url), 'utf8');
const leave = source.match(/function leaveIsland\(\)\s*\{([\s\S]*?)\n  \}/)?.[1];
assert.ok(leave, 'Estates exit function must exist');
assert.match(leave, /controllerRef\.dispose\(\)/, 'exit must dispose the currently active controller');
assert.doesNotMatch(leave, /\bcontroller\.dispose\(\)/, 'exit must not dispose a stale initial controller');
assert.match(source, /if\(!controllerRef\.isActive\)/, 're-entry must rebuild a disposed controller');
console.log('Estates controller re-entry lifecycle regression checks passed.');
