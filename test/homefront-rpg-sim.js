'use strict';
// RPG character sheet: old-save normalization + backfill, server-only XP, skills, equipment slots,
// quest journal stub, loot-pickup gear hook, forged/prototype payloads, concurrent spends.
const assert = require('node:assert/strict');
const { handle } = require('../server/homefront');
const Rpg = require('../server/homefront-rpg');

const files = new Map();
const store = {
  load(name, fallback) { return files.has(name) ? JSON.parse(JSON.stringify(files.get(name))) : fallback; },
  save(name, value) { files.set(name, JSON.parse(JSON.stringify(value))); }
};
async function call(method, pathname, acct, payload = {}) {
  const response = {};
  await handle({ method }, response, new URL('http://local' + pathname), {
    json: (_res, status, data) => Object.assign(response, { status, data }), gate: () => false, ip: '127.0.0.1',
    body: async () => payload, who: () => acct ? { acct } : null, store
  });
  return response;
}
const R = '/api/homefront/world/rpg';
(async () => {
  const [A, B, V] = ['rRpgSheetA', 'rRpgSheetB', 'rRpgVeteran'];
  assert.equal((await call('GET', R, null)).status, 401, 'sheet needs a bearer token');
  // Fresh account: level 1, starter gear equipped, first quest tracked.
  await call('GET', '/api/homefront', A);
  let s = (await call('GET', R, A)).data.sheet;
  assert.equal(s.level, 1); assert.equal(s.skillPoints, 0); assert.equal(s.equipment.back, 'field_pack'); assert.equal(s.equipment.weapon, 'pipe_blade');
  assert.ok(s.quests.find(q => q.id === 'first_steps').tracked);
  // Veteran (old save, no RPG profile): back-filled once from refuge days + surveyed zones.
  await call('GET', '/api/homefront', V);
  const bases = files.get('homefront.json'); bases[V].day = 11; bases[V].exploration = { ...(bases[V].exploration || {}), discoveredZones: ['industrial'] }; files.set('homefront.json', bases);
  s = (await call('GET', R, V)).data.sheet;
  const zones = (await call('GET', '/api/homefront', V)).data.base.exploration.discoveredZones.filter(z => z !== 'outskirts').length;
  assert.ok(zones >= 1); assert.equal(s.xp, 10 * Rpg.XP.workday + zones * Rpg.XP.discover, 'back-fill = 10 workdays + surveyed zones');
  assert.equal((await call('GET', R, V)).data.sheet.xp, s.xp, 'back-fill happens once');
  // Corrupt/legacy profile shapes normalize.
  files.set(Rpg.FILE, { ...files.get(Rpg.FILE), [B]: { xp: 'lots', skills: { marksman: 99, __proto__: { x: 1 } }, equipment: { head: 'riot_vest', back: 'nope' }, items: ['riot_vest', 'constructor', 7], quests: { first_steps: 'done', bogus: 'done' }, log: 'x' } });
  s = (await call('GET', R, B)).data.sheet;
  assert.equal(s.xp, 0); assert.equal(s.skills.find(k => k.id === 'marksman').rank, 0, 'unearned ranks are removed');
  assert.equal(s.equipment.head, null, 'an item can only sit in its own slot'); assert.deepEqual(s.items.map(i => i.id), ['riot_vest']);
  // XP is server-only: no route grants XP/items/quests, forged fields are ignored.
  for (const bad of [{ action: 'award', source: 'boss' }, { action: 'learn', skill: '__proto__' }, { action: 'learn', skill: 'constructor' }, { action: 'equip', item: 'toString' }, { action: 'equip', item: 'riot_vest' }, { action: 'unequip', slot: 'weapon' }, { action: 'track', quest: '__proto__' }, { xp: 99999 }]) {
    const r = await call('POST', R, A, bad);
    assert.equal(r.status, 400, 'rejected ' + JSON.stringify(bad) + ' → ' + JSON.stringify(r.data));
  }
  assert.equal((await call('GET', R, A)).data.sheet.xp, 0, 'forged payloads never add XP');
  assert.equal((await call('POST', R, A, { action: 'learn', skill: 'marksman' })).data.error, 'no_skill_points');
  // Server events award XP; entering the world completes the first quest.
  assert.equal((await call('POST', '/api/homefront/world/enter', A, {})).status, 200);
  s = (await call('GET', R, A)).data.sheet;
  assert.ok(s.quests.find(q => q.id === 'first_steps').done, 'travelling out completes First steps'); assert.equal(s.xp, Rpg.QUESTS.first_steps.xp);
  for (let i = 0; i < 6; i++) Rpg.award(store, A, 'kill_infected');
  s = (await call('GET', R, A)).data.sheet;
  assert.equal(s.xp, 20 + 6 * 12 + Rpg.QUESTS.infected_down.xp); assert.equal(s.level, Rpg.levelFor(s.xp)); assert.ok(s.level >= 2 && s.skillPoints === s.level - 1);
  // Concurrent skill spends can never exceed earned points.
  const pts = s.skillPoints;
  const runs = await Promise.all(Array.from({ length: 6 }, () => call('POST', R, A, { action: 'learn', skill: 'scavenger' })));
  assert.equal(runs.filter(r => r.status === 200).length, Math.min(pts, Rpg.SKILL_MAX), 'one rank per earned point');
  s = (await call('GET', R, A)).data.sheet; assert.equal(s.skillPoints, 0);
  // Loot pickup hook: deterministic gear drops land in the inventory; equip moves them into their slot.
  let found = null;
  for (let i = 0; i < 80 && !found; i++) found = Rpg.award(store, A, 'loot', { lootKey: 'crate-' + i, now: 1e12 })?.item || null;
  assert.ok(found, 'some crate in 80 holds gear (15%)');
  const eq = await call('POST', R, A, { action: 'equip', item: found });
  assert.equal(eq.status, 200); assert.equal(eq.data.sheet.equipment[Rpg.ITEMS[found].slot], found);
  assert.ok(eq.data.sheet.armor >= Rpg.ITEMS[found].armor);
  assert.equal((await call('POST', R, A, { action: 'unequip', slot: Rpg.ITEMS[found].slot })).data.sheet.equipment[Rpg.ITEMS[found].slot], null);
  assert.equal(Rpg.award(store, A, '__proto__'), null, 'unknown sources award nothing');
  assert.equal(Rpg.award(store, A, 'constructor'), null);
  // Jetpacks are catalog items that only grantItem (purchase/exemption, PR d) can add.
  assert.equal((await call('POST', R, A, { action: 'equip', item: 'homefront_jetpack' })).data.error, 'item_not_owned');
  Rpg.grantItem(store, A, 'homefront_jetpack', { note: 'test' }); Rpg.grantItem(store, A, 'homefront_jetpack');
  s = (await call('POST', R, A, { action: 'equip', item: 'homefront_jetpack' })).data.sheet;
  assert.equal(s.equipment.back, 'homefront_jetpack'); assert.equal(s.items.filter(i => i.id === 'homefront_jetpack').length, 1, 'grant is idempotent');
  // Workday through the normal action route grants XP.
  const before = (await call('GET', R, B)).data.sheet.xp;
  const wd = await call('POST', '/api/homefront/action', B, { action: { type: 'workday' } });
  if (wd.status === 200) assert.equal((await call('GET', R, B)).data.sheet.xp, before + Rpg.XP.workday, 'workday grants XP');
  assert.equal(Rpg.levelFor(Rpg.xpForLevel(Rpg.MAX_LEVEL) + 1e6), Rpg.MAX_LEVEL);
  console.log('Homefront RPG sheet sim passed (normalize/back-fill, server-only XP, skills, slots, quests, loot gear hook, forged + concurrent).');
})().catch(error => { console.error(error); process.exit(1); });
