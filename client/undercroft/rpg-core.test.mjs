// Undercroft RPG: rules + map tests (node client/undercroft/rpg-core.test.mjs)
import assert from 'node:assert/strict';
import * as R from './rpg-core.mjs';
import * as M from './ruin-map.mjs';

// races/classes/signs adapters
assert.ok(R.RACE_IDS.length >= 6, 'races adapted from Eternal Grind');
assert.equal(R.CLASS_IDS.length, 6); assert.equal(R.SIGN_IDS.length, 6);
for (const id of R.RACE_IDS) assert.ok(R.RACES[id].n && R.RACES[id].m.hp > 0);
// creation drives stats/skills/gear
const mem = new Map(), st = { getItem: k => mem.has(k) ? mem.get(k) : null, setItem: (k, v) => mem.set(k, String(v)) };
mem.set('egSave', '{"untouched":true}');
const s = R.load(st); assert.equal(s.hero, null); assert.equal(R.questState(s, 'lumen'), 'none');
s.hero = R.newHero({ name: 'Ash<b>', race: 'ashenborn', cls: 'arcanist', sign: 'kindled' });
assert.equal(s.hero.name, 'Ashb'); assert.equal(s.hero.skills.destruction.v, 35, 'major 25 + race 10');
const A = R.stats(s.hero), war = R.stats(R.newHero({ race: 'ironhide', cls: 'sentinel', sign: 'bulwark' }));
assert.ok(A.mp > war.mp && war.hp > A.hp && war.ar > A.ar, 'class/race shape stats');
assert.ok(A.fire > 22 * 1.25, 'kindled + destruction boosts firebolt');
assert.equal(R.equipped(s.hero, 'weapon').n, 'Oak Staff');
const cc = R.newHero({ cls: 'custom', custom: { major: ['security', 'security', 'block'], model: 'rogue' } });
assert.deepEqual(R.classOf(cc).major.length, 3); assert.equal(R.stats(cc).model, 'rogue');
// skill-use leveling (major faster) + XP curve from Eternal Grind
const before = s.hero.skills.destruction.v; let ups = 0; for (let i = 0; i < 40; i++) ups += R.useSkill(s.hero, 'destruction').up;
assert.ok(s.hero.skills.destruction.v > before && ups > 0);
assert.equal(R.xpFor(1), 60); const lv = R.gainXp(s.hero, 1000); assert.ok(lv.levels >= 2 && s.hero.pending >= 2);
assert.ok(R.spendLevel(s.hero, 'hp')); assert.equal(s.hero.boons.hp, 1); assert.ok(!R.spendLevel(s.hero, 'bogus'));
// inventory
R.addItem(s.hero, 'potion_hp', 2); const n = R.countItem(s.hero, 'potion_hp'); assert.ok(R.takeItem(s.hero, 'potion_hp')); assert.equal(R.countItem(s.hero, 'potion_hp'), n - 1);
const sw = R.addItem(s.hero, 'steel_longsword'); assert.ok(R.equip(s.hero, sw.u)); assert.equal(R.equipped(s.hero, 'weapon').n, 'Steel Longsword');
// quests: accept in hub, progress in ruin, turn in at hub
assert.ok(R.acceptQuest(s, 'tithe')); assert.ok(R.acceptQuest(s, 'lumen')); assert.ok(!R.acceptQuest(s, 'lumen'));
for (let i = 0; i < 8; i++) R.questEvent(s, { type: 'kill', undead: 1 });
assert.equal(R.questState(s, 'tithe'), 'ready'); assert.ok(R.canTurnIn(s, 'tithe'));
assert.ok(!R.canTurnIn(s, 'lumen')); R.questEvent(s, { type: 'heartstone' }); assert.equal(R.countItem(s.hero, 'heartstone'), 1); assert.ok(R.canTurnIn(s, 'lumen'));
const g0 = s.hero.gold, rw = R.turnIn(s, 'lumen'); assert.equal(rw.item, 'wardens_mail'); assert.equal(s.hero.gold, g0 + 120); assert.equal(R.countItem(s.hero, 'heartstone'), 0); assert.equal(R.questState(s, 'lumen'), 'done'); assert.equal(R.turnIn(s, 'lumen'), null);
// loot: deterministic, once per chest
assert.deepEqual(R.rollChest('vault'), R.rollChest('vault')); assert.ok(R.rollChest('throne').items.some(i => i[0] === 'hollow_cleaver'));
assert.ok(R.lootChest(s, 'hall')); assert.equal(R.lootChest(s, 'hall'), null);
// save roundtrip + validation; Eternal Grind save untouched
assert.ok(R.store(st, s)); const s2 = R.load(st); assert.equal(s2.hero.name, 'Ashb'); assert.equal(s2.quests.lumen.s, 'done'); assert.equal(s2.ruin.chests.hall, true);
assert.equal(mem.get('egSave'), '{"untouched":true}'); assert.deepEqual([...mem.keys()].sort(), ['bcUndercroftRPG', 'egSave']);
const bad = R.validate({ hero: { race: 'nope', cls: 'x', sign: 'y' }, quests: { lumen: { s: 'hacked' } } }); assert.equal(bad.hero, null); assert.equal(bad.quests.lumen.s, 'none');
const odd = R.validate({ hero: { ...s.hero, lvl: 9999, gold: -5, inv: [{ id: 'nope' }, { id: 'iron_sword', u: 'a' }], eq: { weapon: 'a', armor: 'zz' } } });
assert.equal(odd.hero.lvl, R.MAX_LVL); assert.equal(odd.hero.gold, 0); assert.equal(odd.hero.inv.length, 1); assert.equal(odd.hero.eq.weapon, 'a'); assert.equal(odd.hero.eq.armor, undefined);
// combat helpers
assert.equal(R.incoming(A, 20, { perfect: true }).amt, 0); assert.ok(R.incoming(A, 20, { blocking: true }).amt < R.incoming(A, 20).amt);
assert.ok(R.enemyStats('skeleton', 5).hp > R.enemyStats('skeleton', 1).hp);
// nothing here may touch payments or XRP
assert.ok(!/xrp|payout|wallet|treasury/i.test(JSON.stringify([R.ITEMS, R.QUESTS, R.CHESTS])));

// ---- map
const g = M.buildGrid(), ps = M.pillarSet();
const gate = new Set([...M.GATE.tiles, ...M.BOSS_DOOR.tiles].map(t => t.join(','))), blockGate = new Set([...ps, ...gate]);
const [sx, sz] = [Math.floor(M.SPAWN.x), Math.floor(M.SPAWN.z)];
const open = M.flowField(g, sx, sz, ps), shut = M.flowField(g, sx, sz, blockGate);
const at = (D, x, z) => D[Math.floor(z) * M.W + Math.floor(x)];
for (const e of M.ENEMIES) assert.ok(at(open, e.x, e.z) >= 0, 'enemy reachable ' + e.k + ' ' + e.x + ',' + e.z);
for (const c of M.CHESTS) assert.ok(at(open, c.x, c.z) >= 0, 'chest reachable ' + c.id);
assert.ok(at(shut, 19.5, 6) < 0, 'boss sealed behind the lumen gate');
for (const id of ['hall', 'vault', 'gallery']) { const c = M.CHESTS.find(c => c.id === id); assert.ok(at(shut, c.x, c.z) >= 0, 'pre-gate chest ' + id); }
for (const p of M.PEDESTALS) { let ok = false; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(shut, p[0] + dx, p[1] + dz) >= 0) ok = true; assert.ok(ok, 'pedestal reachable'); }
// puzzle solvable from the start state (press both ends)
assert.ok(M.solved(M.pressPedestal(M.pressPedestal(M.PED_START, 0), 2))); assert.ok(!M.solved(M.PED_START));
// collision keeps a circle out of rock; los blocked by walls
const [cx] = M.collide(g, 16 * 2 + .1, 58 * 2, .4, ps); assert.ok(cx >= 32.4 - 1e-6);
assert.ok(M.los(g, 39, 118, 39, 100)); assert.ok(!M.los(g, 39, 118, 10, 118));
assert.ok(M.TRAPS.length === 6 && M.TRAPS.some(t => M.trapUp(t, 2)) !== undefined);
console.log('undercroft rpg core + map ok');
