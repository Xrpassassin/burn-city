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

assert.ok(hud.includes("import { createFieldPackGrid, fieldPackKey } from './homefront-pack-grid.mjs'"),
  'HUD uses the existing world inventory rather than duplicating server item storage');
assert.ok(hud.includes('createFieldPackGrid(document,carried,actionButtonId =>'),
  'the inventory tab renders a slot-based field pack from server world snapshots');
assert.ok(hud.includes("document.getElementById(actionButtonId)?.click()"),
  'quick-use buttons use established authenticated survival actions');
assert.ok(hud.includes("packButton.setAttribute('aria-label', 'Open field backpack')"),
  'mobile players have an accessible backpack toggle alongside the existing HUD');
assert.ok(hud.includes("if (!sheet.hidden && tab === 'inventory' && lastPackKey !== fieldPackKey(world?.selfInventory)) draw();"),
  'open backpack updates on authoritative loot or survival changes without per-frame redraws');
assert.ok(hud.includes("if (!sheet.hidden && tab === 'inventory') hide();"),
  'I keyboard toggle and backpack button can close the same single overlay');

assert.match(hud, /C\.I\.N\.D\.E\.R\.S\. · Level /,
  'Character tab introduces the original seven-attribute C.I.N.D.E.R.S. system');
assert.match(hud, /rpg\.attributePoints \+ ' attribute · ' \+ rpg\.skillPoints/,
  'attribute, skill and ember perk budgets appear in one existing HUD overlay');
assert.match(hud, /for \(const a of rpg\.attributes \|\| \[\]\)/,
  'attributes display directly from authenticated RPG sheet');
assert.match(hud, /action:'train-attribute',attribute:a\.id/,
  'attribute allocation uses authenticated RPG endpoint');
assert.match(hud, /action:'learn-perk',perk:perk\.id/,
  'perk unlocks use authenticated RPG endpoint');
assert.match(hud, /train\.disabled=!perk\.canLearn/,
  'locked perks cannot issue purchase requests');
assert.match(hud, /const practice=skill\.practice/,
  'skill mastery comes from verified play and tracked practice');
assert.match(hud, /if \(\(e\.key === 'c' \|\| e\.key === 'C'\)/,
  'desktop C toggles the single Character overlay without changing movement');
assert.match(hud, /@media\(max-width:560px\)/,
  'attribute and perk grids collapse to one column on narrow mobile screens');


assert.match(hud, /from '\.\/homefront-level-up\.mjs'/,
  'the HUD uses a pure level-change announcement model');
assert.match(hud, /const RPG_REFRESH_MS = 18000/,
  'RPG snapshots refresh at a bounded cadence instead of every animation frame');
assert.match(hud, /const upgrade = levelUpNotice\(knownLevel,next\)/,
  'only a higher server-confirmed level can trigger the upgrade notice');
assert.match(hud, /levelNotice\.onclick = \(\) => \{ levelNotice\.hidden = true; void open\('character'\); \}/,
  'level-up notice takes the player into the existing CINDERS upgrade screen');
assert.match(hud, /\.hf-level-up-notice\[hidden\]\{display:none!important\}/,
  'hidden announcements cannot overlap the mobile joystick or other controls');
assert.match(hud, /lastProfileFetchAt = 0;/,
  'signing out resets old profile poll state');

assert.match(hud,/if \(rpg\.gameplayEffects\)/,
  'active gameplay bonuses are shown only from server RPG sheet');
assert.match(hud,/bonuses\.searchNoiseReductionPct/,
  'Instinct effect is visible without inventing a new stealth UI');
assert.match(hud,/bonuses\.repairBonusHp/,
  'Engineering repair benefit shows actual server-validated integrity');
assert.match(hud,/bonuses\.aimStabilityBonusPct/,
  'Nerve is labelled as PvE-only steadiness');
