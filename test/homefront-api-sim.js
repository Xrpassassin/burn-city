'use strict';
const assert = require('node:assert/strict');
const { handle } = require('../server/homefront');

const files = new Map();
const store = {
  load(name, fallback) {
    if (!files.has(name)) return fallback;
    return JSON.parse(JSON.stringify(files.get(name)));
  },
  save(name, value) { files.set(name, JSON.parse(JSON.stringify(value))); }
};
async function call(method, pathname, acct, payload = {}) {
  const response = {};
  await handle({ method }, response, new URL('http://local' + pathname), {
    json: (_res, status, data) => Object.assign(response, { status, data }),
    gate: () => false,
    ip: '127.0.0.1',
    body: async () => payload,
    who: () => acct ? { acct } : null,
    store
  });
  return response;
}
(async () => {
  const unauth = await call('GET', '/api/homefront', null);
  assert.equal(unauth.status, 401, 'save API requires a verified account');
  assert.equal(files.size, 0, 'unauthenticated request cannot create a base');

  const a0 = await call('GET', '/api/homefront', 'acct-a');
  assert.equal(a0.status, 200);
  assert.equal(a0.data.base.owner, 'acct-a');
  assert.equal(a0.data.base.structures.length, 0);
  assert.equal(a0.data.base.visibility, 'private');
  const privateVisit = await call('GET', '/api/homefront/visit?owner=acct-a', null);
  assert.equal(privateVisit.status, 404, 'private refuges must not be visitable');

  const opened = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'visibility', value: 'public' } });
  assert.equal(opened.status, 200);
  assert.equal(opened.data.base.visibility, 'public');
  const publicVisit = await call('GET', '/api/homefront/visit?owner=acct-a', null);
  assert.equal(publicVisit.status, 200, 'public refuge can be visited without signing in');
  assert.equal(publicVisit.data.mode, 'homefront-visit');
  assert.equal(publicVisit.data.base.visibility, 'public');
  assert.equal(publicVisit.data.base.owner, undefined, 'visitor response does not expose owner field');
  const a1 = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'build', building: 'wall' } });
  assert.equal(a1.status, 200);
  assert.equal(a1.data.base.structures.length, 1);
  assert.equal(a1.data.base.resources.wood, 32);
  const overlap = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'build', building: 'wall', x: a1.data.base.structures[0].x, z: a1.data.base.structures[0].z } });
  assert.equal(overlap.status, 400, 'invalid placement is a client error, not a server failure');
  assert.equal(overlap.data.error, 'placement_occupied');

  const b0 = await call('GET', '/api/homefront', 'acct-b');
  assert.equal(b0.status, 200);
  assert.equal(b0.data.base.owner, 'acct-b');
  assert.equal(b0.data.base.structures.length, 0, 'one account cannot see another account base');

  const crossAccount = await call('POST', '/api/homefront/action', 'acct-b', { action: { type: 'assign', survivorId: 's1', role: 'guard' } });
  assert.equal(crossAccount.status, 400);
  assert.equal(crossAccount.data.error, 'unknown_survivor');

  const closed = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'visibility', value: 'private' } });
  assert.equal(closed.status, 200);
  assert.equal(closed.data.base.visibility, 'private');
  const closedVisit = await call('GET', '/api/homefront/visit?owner=acct-a', null);
  assert.equal(closedVisit.status, 404, 'private setting immediately blocks future visits');

  const aReload = await call('GET', '/api/homefront', 'acct-a');
  assert.equal(aReload.data.base.structures.length, 1, 'account base survives a subsequent load');
  assert.equal(aReload.data.base.revision, closed.data.base.revision, 'latest privacy change persists across reloads');
  const revisionBeforeConcurrent = aReload.data.base.revision;
  const concurrent = await Promise.all([
    call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'visibility', value: 'public' } }),
    call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'visibility', value: 'public' } })
  ]);
  assert.ok(concurrent.every(x => x.status === 200), 'concurrent valid actions should both succeed');
  const afterConcurrent = await call('GET', '/api/homefront', 'acct-a');
  assert.equal(afterConcurrent.data.base.revision, revisionBeforeConcurrent + 2, 'concurrent actions must not overwrite each other');
  assert.equal(afterConcurrent.data.base.resources.food, aReload.data.base.resources.food, 'concurrent visibility actions do not mutate expedition supplies');

  const malformed = await call('POST', '/api/homefront/action', 'acct-a', { action: [] });
  assert.equal(malformed.status, 400);
  const bypassTrip = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'expedition', zone: 'research_lab' } });
  assert.equal(bypassTrip.status, 400, 'direct API calls cannot bypass physical Graveyard exploration');
  assert.equal(bypassTrip.data.error, 'use_shared_expedition_map');
  const worldA = await call('GET', '/api/homefront/world', 'acct-a');
  assert.equal(worldA.status, 200, 'authenticated player can inspect the shared Graveyard map');
  assert.equal(worldA.data.mode, 'homefront-world');
  assert.equal(worldA.data.self, null, 'players do not leave the refuge until they explicitly enter an expedition');
  assert.ok(worldA.data.world.pointsOfInterest.some(p => p.type === 'boss'), 'shared map advertises boss territories');
  const enteredA = await call('POST', '/api/homefront/world/enter', 'acct-a');
  assert.equal(enteredA.status, 200, 'player can explicitly enter the shared Graveyard');
  assert.equal(enteredA.data.selfSurvival.health, 100, 'new explorers begin with full field condition');
  const fieldState = files.get('homefront-world.json');
  fieldState.players['acct-a'].survival.thirst = 40;
  files.set('homefront-world.json', fieldState);
  const waterBefore = (await call('GET', '/api/homefront', 'acct-a')).data.base.resources.water;
  const drink = await call('POST', '/api/homefront/world/survival', 'acct-a', { action: 'drink' });
  assert.equal(drink.status, 200, 'authenticated explorer can drink water in the field');
  assert.ok(drink.data.selfSurvival.thirst > 40, 'drinking restores thirst on the server');
  assert.equal(drink.data.base.resources.water, waterBefore - 1, 'field hydration consumes persistent refuge water');
  const worldB = await call('GET', '/api/homefront/world', 'acct-b');
  assert.equal(worldB.status, 200);
  const enteredB = await call('POST', '/api/homefront/world/enter', 'acct-b');
  assert.equal(enteredB.status, 200);
  assert.equal(enteredB.data.players.length, 2, 'active explorers share one map snapshot');
  const partyCreated = await call('POST', '/api/homefront/world/party/create', 'acct-a');
  assert.equal(partyCreated.status, 200);
  const partyCode = partyCreated.data.party.code;
  const partyJoined = await call('POST', '/api/homefront/world/party/join', 'acct-b', { code: partyCode });
  assert.equal(partyJoined.status, 200);
  assert.equal(partyJoined.data.party.members.length, 2, 'party join synchronizes the shared roster');
  assert.equal(partyJoined.data.self.x, partyJoined.data.party.members[0].x, 'party members enter together');

  const threat = await call('POST', '/api/homefront/world/encounter', 'acct-a');
  assert.equal(threat.status, 200, 'explorers can initiate a server-authoritative infected encounter');
  assert.ok(threat.data.encounter.id.startsWith('enc-'));
  assert.ok(threat.data.selfEncounter || threat.data.encounter, 'active encounter is exposed to the player');
  const combatBaseBefore = (await call('GET', '/api/homefront', 'acct-a')).data.base;
  const attack = await call('POST', '/api/homefront/world/attack', 'acct-a');
  assert.equal(attack.status, 200, 'nearby infected can be attacked through the authoritative combat endpoint');
  assert.ok(attack.data.combat.damage > 0);
  assert.ok(attack.data.base.resources.ammo < combatBaseBefore.resources.ammo, 'attacks consume persisted ammunition');
  assert.ok(attack.data.encounter.hp < threat.data.encounter.hp, 'attacks reduce server-owned enemy health');
if (attack.data.combat.enemyDamage > 0) {
  assert.ok(attack.data.selfSurvival.health < 100, 'infected retaliation damages the player through server-owned survival state');
  assert.ok(attack.data.selfSurvival.infection > 0, 'infected retaliation adds treatment pressure');
}

  const scavenge = await call('POST', '/api/homefront/world/scavenge', 'acct-a');
  assert.equal(scavenge.status, 200, 'a player can scavenge at a nearby shared landmark');
  assert.ok(scavenge.data.base.expeditionCount >= 1, 'shared-map scavenging advances personal expedition progress');
  const extraTrip = await call('POST', '/api/homefront/world/scavenge', 'acct-a');
  assert.equal(extraTrip.status, 200);
  const sharedWorld = files.get('homefront-world.json');
  sharedWorld.players['acct-a'].x = -32;
  sharedWorld.players['acct-a'].z = 24;
  sharedWorld.players['acct-b'].x = -32;
  sharedWorld.players['acct-b'].z = 24;
  files.set('homefront-world.json', sharedWorld);
  const cacheOpen = await call('POST', '/api/homefront/world/cache', 'acct-a', { pointId: 'cache_exchange', difficulty: 'standard' });
  assert.equal(cacheOpen.status, 200, 'player can open a nearby shared supply cache');
  assert.equal(cacheOpen.data.encounter.cacheOpened, true);
  assert.ok(cacheOpen.data.encounter.bonus.embers > 0, 'supply cache awards difficulty-scaled bonus Embers');
  assert.ok(cacheOpen.data.world.caches.cache_exchange.readyAt > Date.now(), 'opening a cache persists a shared respawn timer');
  const duplicateCache = await call('POST', '/api/homefront/world/cache', 'acct-b', { pointId: 'cache_exchange', difficulty: 'standard' });
  assert.equal(duplicateCache.status, 400, 'another explorer cannot claim a cache during its shared cooldown');
  assert.equal(duplicateCache.data.error, 'cache_empty');
  const survivorsBeforeRescue = cacheOpen.data.base.survivors.length;
  const rescueWorld = files.get('homefront-world.json');
  rescueWorld.players['acct-a'].x = 35;
  rescueWorld.players['acct-a'].z = -42;
  rescueWorld.players['acct-b'].x = 35;
  rescueWorld.players['acct-b'].z = -42;
  files.set('homefront-world.json', rescueWorld);
  const rescue = await call('POST', '/api/homefront/world/rescue', 'acct-a', { pointId: 'stranded_bus', difficulty: 'standard' });
  assert.equal(rescue.status, 200, 'explorer can rescue a nearby stranded survivor');
  assert.equal(rescue.data.encounter.rescued, true);
  assert.equal(rescue.data.base.survivors.length, survivorsBeforeRescue + 1, 'rescued survivor joins the persistent refuge roster');
  assert.ok(rescue.data.encounter.survivor?.id, 'rescue response identifies the newly recruited survivor');
  const duplicateRescue = await call('POST', '/api/homefront/world/rescue', 'acct-b', { pointId: 'stranded_bus', difficulty: 'standard' });
  assert.equal(duplicateRescue.status, 400, 'another explorer cannot claim the same shared rescue during cooldown');
  assert.equal(duplicateRescue.data.error, 'rescue_unavailable');
  const craftedWeapon = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'craft_weapon', weapon: 'pump_shotgun' } });
  assert.equal(craftedWeapon.status, 200, 'cache earnings can be invested into persistent weapons');
  const equippedWeapon = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'equip_weapon', weapon: 'pump_shotgun' } });
  assert.equal(equippedWeapon.status, 200, 'crafted weapons can be equipped');
  assert.equal(equippedWeapon.data.base.equippedWeapon, 'pump_shotgun');
  const bossWorld = files.get('homefront-world.json');
  bossWorld.players['acct-a'].x = 6;
  bossWorld.players['acct-a'].z = -8;
  files.set('homefront-world.json', bossWorld);
  const bossHit = await call('POST', '/api/homefront/world/boss-hunt', 'acct-a', { pointId: 'buried_subway' });
  assert.equal(bossHit.status, 200, 'boss hunts resolve at the shared boss landmark');
  assert.equal(bossHit.data.encounter.hp, 136, 'equipped weapon increases shared boss damage and health remains server-authoritative');
  assert.equal(bossHit.data.encounter.maxHp, 180);

  console.log('Homefront authenticated save API simulation passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
