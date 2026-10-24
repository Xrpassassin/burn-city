// Homefront RPG HUD shell: party-only minimap + the Workshop/build panel only showing in build mode.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { minimapPoints, HUD_TABS, NOT_MANAGED } from './homefront-hud.mjs';

const world = { self: { x: 10, z: 10 }, players: [
  { id: 'me', label: 'You', x: 10, z: 10 }, { id: 'p1', label: 'Ally', party: true, x: 40, z: 10 },
  { id: 's1', label: 'Stranger', party: false, x: 12, z: 12 }, { id: 'p2', label: 'Far ally', party: true, x: 900, z: -900 }] };
const pts = minimapPoints(world, 88, 120);
assert.deepEqual(pts.map(p => p.kind), ['self', 'party', 'party'], 'strangers never reach the minimap');
assert.ok(pts.every(p => p.x >= 0 && p.x <= 88 && p.y >= 0 && p.y <= 88), 'far party members are clamped to the map edge');
assert.deepEqual(minimapPoints({ players: [] }), [], 'no self → no points');
assert.ok(HUD_TABS.includes('build') && NOT_MANAGED.includes('buildPanel'));

const html = fs.readFileSync(new URL('./homefront.html', import.meta.url), 'utf8');
const hud = fs.readFileSync(new URL('./homefront-hud.mjs', import.meta.url), 'utf8');
assert.ok(html.includes('body:not(.rpg-mode-workshop) #buildPanel{display:none!important}'), 'page hides the build panel outside workshop mode');
assert.ok(/getElementById\('buildPanel'\)\?\.classList\.toggle\('hf-tab-off', mode !== 'workshop'\)/.test(hud), 'HUD hides the build panel outside workshop mode');
assert.ok(hud.includes('.hf-mtabs[hidden]{display:none}'), 'manage tab strip honours [hidden] (display:flex would override it)');
// Every top-level panel must sit inside .grid, or the page's mode rules (.grid>.panel) miss it (the stray </div> bug).
const grid = html.slice(html.indexOf('<div class="grid">'));
let depth = 0, closedAt = -1;
for (const m of grid.matchAll(/<(\/?)div\b[^>]*>/g)) { depth += m[1] ? -1 : 1; if (depth === 0) { closedAt = m.index; break; } }
assert.ok(closedAt > 0, 'grid closes');
const inside = grid.slice(0, closedAt);
for (const id of ['refugeWorldPanel', 'graveyardPanel', 'survivalPanel', 'privacyPanel', 'liveSiegePanel', 'buildPanel', 'tycoonPanel', 'logPanel']) assert.ok(inside.includes('id="' + id + '"'), id + ' is inside .grid');
console.log('Homefront HUD tests passed (party-only minimap, build panel only in build mode, panels inside .grid).');
