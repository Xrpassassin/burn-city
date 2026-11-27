// Undercroft RPG: rules + map tests (node client/undercroft/rpg-core.test.mjs)
import assert from 'node:assert/strict';
import * as R from './rpg-core.mjs';
import * as M from './ruin-map.mjs';

// races/classes/signs adapters
assert.ok(R.RACE_IDS.length >= 6, 'races adapted from Eternal Grind');
assert.equal(R.CLASS_IDS.length, 8); assert.equal(R.SIGN_IDS.length, 6);
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
const sw = R.addItem(s.hero, 'steel_longsword'); assert.ok(R.equip(s.hero, sw.u)); assert.equal(R.equipped(s.hero, 'weapon').n, 'Bloodsteel Greatsword');
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
// character look (sex, skin, hair, hair colour) is clamped and survives a save roundtrip
assert.deepEqual(R.cleanLook({ sex: 'f', skin: 99, hair: -3, hairCol: 2.7 }), { sex: 'f', skin: 7, hair: 0, hairCol: 2 }); assert.deepEqual(R.cleanLook(null), { sex: 'm', skin: 0, hair: 0, hairCol: 0 });
{ const lh = R.newHero({ name: 'Lk', race: 'wildkin', cls: 'cutpurse', sign: 'kindled', look: { sex: 'f', skin: 2, hair: 1, hairCol: 1 } }); assert.equal(lh.look.sex, 'f'); const ls = R.emptySave(); ls.hero = lh; assert.deepEqual(R.validate(JSON.parse(JSON.stringify(ls))).hero.look, { sex: 'f', skin: 2, hair: 1, hairCol: 1 });
  // shown level waits for pending level-ups to be spent
  lh.lvl = 4; lh.pending = 2; assert.equal(R.shownLevel(lh), 2); assert.ok(R.spendLevel(lh, 'hp')); assert.equal(R.shownLevel(lh), 3); lh.pending = 0; assert.equal(R.shownLevel(lh), 4);
  // the boss stays dead even if the Heartstone is left on the throne
  R.questEvent(ls, { type: 'boss' }); assert.equal(ls.ruin.slain, true); assert.equal(ls.ruin.boss, false); assert.equal(R.validate(JSON.parse(JSON.stringify(ls))).ruin.slain, true);
  const old = R.validate({ ruin: { boss: true } }); assert.equal(old.ruin.slain, true); }
console.log('undercroft rpg core + map ok');

// arsenal: every weapon has a kind/model/skill and sane stats; ranged weapons have ammo items
for (const [id, D] of Object.entries(R.ITEMS)) {
  if (D.t === 'weapon') { assert.ok(['one', 'two', 'dagger', 'spear', 'staff', 'bow', 'crossbow', 'thrown'].includes(D.kind), id + ' kind'); assert.ok(D.model && R.SKILLS[D.sk] && D.dmg > 0 && D.spd > 0 && D.reach > 0 && D.st > 0, id + ' stats');
    if (R.RANGED[D.kind]) assert.equal(R.ITEMS[D.ammo] && R.ITEMS[D.ammo].t, 'ammo', id + ' ammo'); }
  if (D.t === 'shield') assert.ok(D.model && D.ar > 0 && D.blk > 0, id + ' shield');
}
assert.ok(R.SKILLS.blunt && R.SKILLS.marksman, 'blunt + marksman skills');
// classes start with fitting weapons: the thief gets a dagger and a bow with arrows; sentinels a sword and shield
{ const th = R.newHero({ cls: 'cutpurse' }), S = R.stats(th); assert.equal(S.kind, 'dagger'); assert.equal(R.equipped(th, 'alt').kind, 'bow'); assert.ok(R.countItem(th, 'arrows') >= 20);
  assert.ok(R.swapWeapon(th)); assert.equal(R.stats(th).kind, 'bow'); assert.equal(R.stats(th).wsk, 'marksman'); assert.ok(R.swapWeapon(th)); assert.equal(R.stats(th).kind, 'dagger');
  const se = R.newHero({ cls: 'sentinel' }), SS = R.stats(se); assert.ok(SS.shield && SS.shModel === 'shield_round'); assert.ok(SS.blockRed > R.stats(R.newHero({ cls: 'vanguard' })).blockRed, 'shield blocks better than a parry');
  // two-handed weapons drop the shield from stats, equipping a weapon makes the old one the swap weapon
  const gs = R.addItem(se, 'quarry_maul'); const old = se.eq.weapon; assert.ok(R.equip(se, gs.u)); assert.equal(se.eq.alt, old); assert.equal(R.stats(se).shield, false); assert.equal(R.stats(se).wsk, 'blunt');
  // blunt skill raises blunt damage only
  const d0 = R.stats(se).dmg; se.skills.blunt.v += 30; assert.ok(R.stats(se).dmg > d0); const r0 = R.rangedDamage(R.stats(th), .2, .99).amt, r1 = R.rangedDamage(R.stats(th), 1, .99).amt; assert.ok(r1 > r0 * 2, 'full draw hits harder');
  // custom marksman builds get a bow
  const cm = R.newHero({ cls: 'custom', custom: { major: ['marksman', 'security', 'acrobatics'] } }); assert.ok(R.stats(cm).ranged || R.equipped(cm, 'alt').kind === 'bow');
  // old saves (before the arsenal) get the class shield + kit once and keep their gear
  const raw = JSON.parse(JSON.stringify({ v: 1, hero: { ...R.newHero({ cls: 'sentinel' }), ars: undefined } })); raw.hero.inv = raw.hero.inv.filter(i => i.id !== 'round_shield'); delete raw.hero.eq.shield; delete raw.hero.skills.blunt;
  const v = R.validate(raw); assert.ok(v.hero.eq.shield && R.equipped(v.hero, 'shield').model === 'shield_round'); assert.ok(v.hero.skills.blunt.v >= 1); const v2 = R.validate(JSON.parse(JSON.stringify(v))); assert.equal(v2.hero.inv.filter(i => i.id === 'round_shield').length, 1); }
// chests and enemies drop the new weapons
{ const all = new Set(); for (const id of Object.keys(R.CHESTS)) for (let k = 0; k < 40; k++) for (const [it] of R.rollChest(id, 's' + k).items) all.add(it);
  for (const w of ['light_crossbow', 'gilded_bow', 'gilded_aegis', 'hunting_bow', 'ashwood_longbow']) assert.ok(all.has(w), w + ' in a chest');
  let got = 0; const rr = (() => { let x = 1; return () => (x = (x * 16807) % 2147483647) / 2147483647; })(); for (let k = 0; k < 300; k++) got += R.rollDrops('skeleton', rr).length; assert.ok(got > 30, 'skeletons drop gear/ammo');
  for (const k of Object.keys(R.DROPS)) for (const [, id] of R.DROPS[k]) assert.ok(R.ITEMS[id], 'drop ' + id); }
console.log('arsenal tests ok');
