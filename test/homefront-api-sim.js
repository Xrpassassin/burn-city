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
  const unownedSkin = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'equip_cosmetic', skin: 'hazard_stripe' } });
  assert.equal(unownedSkin.status, 400, 'cannot equip a cosmetic that the account does not own');
  assert.equal(unownedSkin.data.error, 'cosmetic_not_owned');
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
  assert.equal(drink.data.base.resources.water, waterBefore, 'drinking uses carried water rather than silently pulling from refuge stores');
  assert.equal(drink.data.selfInventory.water, 1, 'drinking consumes one carried water item');
  const supplies = files.get('homefront-world.json');
  supplies.players['acct-a'].inventory = { food: 0, rawFood: 2, water: 0, dirtyWater: 2, meds: 1, ammo: 4, scrap: 0, wood: 2 };
  supplies.players['acct-a'].survival.hunger = 20;
  supplies.players['acct-a'].survival.thirst = 20;
  files.set('homefront-world.json', supplies);
  const cooked = await call('POST', '/api/homefront/world/survival', 'acct-a', { action: 'cook_food' });
  assert.equal(cooked.status, 200, 'field cooking is an authenticated server-side survival action');
  assert.equal(cooked.data.selfInventory.rawFood, 1, 'cooking consumes one raw food');
  assert.equal(cooked.data.selfInventory.food, 1, 'cooking produces one carried ration');
  assert.equal(cooked.data.selfInventory.wood, 1, 'cooking consumes one wood as fuel');
  const noFuelState = files.get('homefront-world.json');
  noFuelState.players['acct-a'].inventory.wood = 0;
  files.set('homefront-world.json', noFuelState);
  const noFuel = await call('POST', '/api/homefront/world/survival', 'acct-a', { action: 'purify_water' });
  assert.equal(noFuel.status, 400, 'purification cannot happen without fuel');
  assert.equal(noFuel.data.error, 'missing_fuel');
  const fuelState = files.get('homefront-world.json');
  fuelState.players['acct-a'].inventory.wood = 1;
  files.set('homefront-world.json', fuelState);
  const purified = await call('POST', '/api/homefront/world/survival', 'acct-a', { action: 'purify_water' });
  assert.equal(purified.status, 200, 'dirty water can be purified when the player carries fuel');
  assert.equal(purified.data.selfInventory.dirtyWater, 1, 'purification consumes dirty water');
  assert.equal(purified.data.selfInventory.water, 1, 'purification creates clean water');
  assert.equal(purified.data.selfInventory.wood, 0, 'purification consumes one wood');
  const restoreFieldKit = files.get('homefront-world.json');
  restoreFieldKit.players['acct-a'].inventory = { food: 2, rawFood: 1, water: 1, dirtyWater: 1, meds: 1, ammo: 4, scrap: 0, wood: 0 };
  files.set('homefront-world.json', restoreFieldKit);

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

  const combatSetupWorld = files.get('homefront-world.json');
  combatSetupWorld.players['acct-a'].weaponMagazine = { weaponId: 'pump_shotgun', loaded: 3 };
  files.set('homefront-world.json', combatSetupWorld);
  const combatSetupBases = files.get('homefront.json');
  combatSetupBases['acct-a'].equippedWeapon = 'pump_shotgun';
  files.set('homefront.json', combatSetupBases);

  const threat = await call('POST', '/api/homefront/world/encounter', 'acct-a');
  assert.equal(threat.status, 200, 'explorers can initiate a server-authoritative infected encounter');
  assert.ok(threat.data.encounter.id.startsWith('enc-'));
  assert.ok(threat.data.selfEncounter || threat.data.encounter, 'active encounter is exposed to the player');
  const combatBaseBefore = (await call('GET', '/api/homefront', 'acct-a')).data.base;
  const attack = await call('POST', '/api/homefront/world/attack', 'acct-a');
  assert.equal(attack.status, 200, 'nearby infected can be attacked through the authoritative combat endpoint');
  assert.ok(attack.data.combat.damage > 0);
  assert.equal(attack.data.base.resources.ammo, combatBaseBefore.resources.ammo, 'combat does not silently consume refuge ammunition');
  assert.equal(attack.data.selfInventory.ammo, threat.data.selfInventory.ammo, 'firing consumes loaded magazine rounds, not reserve inventory');
  assert.ok(attack.data.selfWeaponMagazine.loaded < threat.data.selfWeaponMagazine.loaded, 'firearm attacks consume server-persisted magazine rounds');
  assert.ok(attack.data.encounter.hp < threat.data.encounter.hp, 'attacks reduce server-owned enemy health');
if (attack.data.combat.enemyDamage > 0) {
  assert.ok(attack.data.selfSurvival.health < 100, 'infected retaliation damages the player through server-owned survival state');
  assert.ok(attack.data.selfSurvival.infection > 0, 'infected retaliation adds treatment pressure');
}

  const scavenge = await call('POST', '/api/homefront/world/scavenge', 'acct-a');
  assert.equal(scavenge.status, 200, 'a player can scavenge at a nearby shared landmark');
  assert.ok(scavenge.data.base.expeditionCount >= 1, 'shared-map scavenging advances personal expedition progress');
  assert.equal(scavenge.data.selfInventory.food, 0, 'scavenging spends carried food, not refuge food');
  assert.ok(scavenge.data.selfInventory.scrap > 0 || scavenge.data.selfInventory.wood > 0, 'scavenged materials are packed when capacity permits');
  const beforeExtraTripStash = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'stash' });
  assert.equal(beforeExtraTripStash.status, 200);
  const packedFood = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'take', item: 'food', amount: 2 });
  assert.equal(packedFood.status, 200, 'explorers can pack extra rations from refuge stores');
  const packedAmmo = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'take', item: 'ammo', amount: 2 });
  assert.equal(packedAmmo.status, 200, 'explorers can pack extra ammunition from refuge stores');
  const extraTrip = await call('POST', '/api/homefront/world/scavenge', 'acct-a');
  assert.equal(extraTrip.status, 200);
  const sharedWorld = files.get('homefront-world.json');
  sharedWorld.players['acct-a'].x = -35;
  sharedWorld.players['acct-a'].z = 24;
  sharedWorld.players['acct-b'].x = -35;
  sharedWorld.players['acct-b'].z = 24;
  files.set('homefront-world.json', sharedWorld);
  const beforeCacheStash = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'stash' });
  assert.equal(beforeCacheStash.status, 200);
  const cachePackFood = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'take', item: 'food', amount: 3 });
  assert.equal(cachePackFood.status, 200);
  const cachePackAmmo = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'take', item: 'ammo', amount: 3 });
  assert.equal(cachePackAmmo.status, 200);
  const cacheOpen = await call('POST', '/api/homefront/world/cache', 'acct-a', { pointId: 'cache_exchange', difficulty: 'standard' });
  assert.equal(cacheOpen.status, 200, 'player can open a nearby shared supply cache');
  assert.equal(cacheOpen.data.encounter.cacheOpened, true);
  assert.equal(cacheOpen.data.tacticalNoise?.level, 47, 'risk-two secure cache returns its authored noise level');
  assert.ok(files.get('homefront-world.json').players['acct-a'].lastNoiseAt > 0, 'cache opening records noise in authoritative world state');
  assert.ok(cacheOpen.data.encounter.bonus.embers > 0, 'supply cache awards difficulty-scaled bonus Embers');
  assert.ok(cacheOpen.data.world.caches.cache_exchange.readyAt > Date.now(), 'opening a cache persists a shared respawn timer');
  const duplicateCache = await call('POST', '/api/homefront/world/cache', 'acct-b', { pointId: 'cache_exchange', difficulty: 'standard' });
  assert.equal(duplicateCache.status, 400, 'another explorer cannot claim a cache during its shared cooldown');
  assert.equal(duplicateCache.data.error, 'cache_empty');
  const survivorsBeforeRescue = cacheOpen.data.base.survivors.length;
  const rescueWorld = files.get('homefront-world.json');
  rescueWorld.players['acct-a'].x = 31;
  rescueWorld.players['acct-a'].z = -42;
  rescueWorld.players['acct-b'].x = 31;
  rescueWorld.players['acct-b'].z = -42;
  files.set('homefront-world.json', rescueWorld);
  const beforeRescueStash = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'stash' });
  assert.equal(beforeRescueStash.status, 200);
  const rescuePackFood = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'take', item: 'food', amount: 2 });
  assert.equal(rescuePackFood.status, 200);
  const rescuePackAmmo = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'take', item: 'ammo', amount: 1 });
  assert.equal(rescuePackAmmo.status, 200);
  const rescue = await call('POST', '/api/homefront/world/rescue', 'acct-a', { pointId: 'stranded_bus', difficulty: 'standard' });
  assert.equal(rescue.status, 200, 'explorer can rescue a nearby stranded survivor');
  assert.equal(rescue.data.encounter.rescued, true);
  assert.equal(rescue.data.tacticalNoise?.level, 35, 'risk-one rescue returns its authored noise level');
  assert.ok(files.get('homefront-world.json').players['acct-a'].lastNoiseAt > 0, 'rescue records noise in authoritative world state');
  assert.equal(rescue.data.base.survivors.length, survivorsBeforeRescue + 1, 'rescued survivor joins the persistent refuge roster');
  assert.ok(rescue.data.encounter.survivor?.id, 'rescue response identifies the newly recruited survivor');
  assert.ok(['common','uncommon','rare','epic','legendary'].includes(rescue.data.encounter.survivor?.rarity), 'server returns the recruited survivor rarity');
  assert.ok(rescue.data.base.survivors.some(s => s.id === rescue.data.encounter.survivor.id && s.rarity === rescue.data.encounter.survivor.rarity), 'rarity persists in the saved roster');
  const duplicateRescue = await call('POST', '/api/homefront/world/rescue', 'acct-b', { pointId: 'stranded_bus', difficulty: 'standard' });
  assert.equal(duplicateRescue.status, 400, 'another explorer cannot claim the same shared rescue during cooldown');
  assert.equal(duplicateRescue.data.error, 'rescue_unavailable');
  const craftedWeapon = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'craft_weapon', weapon: 'pump_shotgun' } });
  assert.equal(craftedWeapon.status, 200, 'cache earnings can be invested into persistent weapons');
  const equippedWeapon = await call('POST', '/api/homefront/action', 'acct-a', { action: { type: 'equip_weapon', weapon: 'pump_shotgun' } });
  assert.equal(equippedWeapon.status, 200, 'crafted weapons can be equipped');
  assert.equal(equippedWeapon.data.base.equippedWeapon, 'pump_shotgun');
  const returnedPack = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'stash' });
  assert.equal(returnedPack.status, 200, 'carried supplies can be safely returned to the refuge before a new run');
  const bossPackFood = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'take', item: 'food', amount: 5 });
  assert.equal(bossPackFood.status, 200, 'boss expeditions require packing field rations');
  const bossPackAmmo = await call('POST', '/api/homefront/world/inventory', 'acct-a', { action: 'take', item: 'ammo', amount: 4 });
  assert.equal(bossPackAmmo.status, 200, 'boss expeditions require packing field ammunition');
  const bossWorld = files.get('homefront-world.json');
  bossWorld.players['acct-a'].x = 6;
  bossWorld.players['acct-a'].z = -8;
  files.set('homefront-world.json', bossWorld);
  const bossHit = await call('POST', '/api/homefront/world/boss-hunt', 'acct-a', { pointId: 'buried_subway' });
  assert.equal(bossHit.status, 200, 'boss hunts resolve at the shared boss landmark');
  assert.equal(bossHit.data.encounter.hp, 136, 'equipped weapon increases shared boss damage and health remains server-authoritative');
  assert.equal(bossHit.data.encounter.maxHp, 180);
  const reloadSetup = files.get('homefront-world.json');
  reloadSetup.players['acct-a'].inventory.ammo = 4;
  reloadSetup.players['acct-a'].weaponMagazine = { weaponId: 'pump_shotgun', loaded: 2 };
  files.set('homefront-world.json', reloadSetup);
  const reloaded = await call('POST', '/api/homefront/world/reload', 'acct-a');
  assert.equal(reloaded.status, 200, 'firearms reload from carried reserve ammunition through an authenticated endpoint: ' + JSON.stringify(reloaded.data));
  assert.equal(reloaded.data.selfWeaponMagazine.loaded, 6, 'reload fills the server-persisted magazine to its capacity');
  assert.equal(reloaded.data.selfInventory.ammo, 0, 'reloading transfers rounds from reserve into the magazine');
  const reloadFull = await call('POST', '/api/homefront/world/reload', 'acct-a');
  assert.equal(reloadFull.status, 400, 'a full magazine cannot be reloaded again');
  assert.equal(reloadFull.data.error, 'magazine_full');
  const shellSetup = files.get('homefront-world.json');
  shellSetup.players['acct-a'].inventory.ammo = 3;
  shellSetup.players['acct-a'].weaponMagazine = { weaponId: 'pump_shotgun', loaded: 2 };
  files.set('homefront-world.json', shellSetup);
  const oneShell = await call('POST', '/api/homefront/world/reload', 'acct-a', { rounds: 1 });
  assert.equal(oneShell.status, 200, 'shotgun can commit a single inserted shell during an interruptible reload');
  assert.equal(oneShell.data.selfWeaponMagazine.loaded, 3, 'single-shell reload increments the magazine by exactly one');
  assert.equal(oneShell.data.selfInventory.ammo, 2, 'single-shell reload spends exactly one reserve round');

  // Interior actions are authenticated, persistent, proximity-checked, and inventory-authoritative.
  const interiorWorld = files.get('homefront-world.json');
  interiorWorld.players['acct-a'].x = 24; interiorWorld.players['acct-a'].z = 30;
  files.set('homefront-world.json', interiorWorld);
  const interiorEnter = await call('POST', '/api/homefront/world/interior/enter', 'acct-a', { landmarkId: 'mercy_hospital' });
  assert.equal(interiorEnter.status, 200, 'nearby player can enter a server-authored interior');
  assert.equal(interiorEnter.data.interior.roomId, 'emergency_lobby');
  assert.equal(interiorEnter.data.interior.landmarkId, 'mercy_hospital');
  const generator = await call('POST', '/api/homefront/world/interior/action', 'acct-a', { actionId: 'generator_switch' });
  assert.equal(generator.status, 200, 'power switches are processed by the authenticated server');
  assert(generator.data.interior.flags.includes('emergency_power'));
  const duplicateGenerator = await call('POST', '/api/homefront/world/interior/action', 'acct-a', { actionId: 'generator_switch' });
  assert.equal(duplicateGenerator.status, 400, 'one-use interior controls cannot be replayed');
  const wrongRoom = await call('POST', '/api/homefront/world/interior/action', 'acct-a', { actionId: 'patient_chart' });
  assert.equal(wrongRoom.status, 400, 'server rejects actions from a different room');
  const wardDoor = await call('POST', '/api/homefront/world/interior/door', 'acct-a', { doorId: 'ward_door' });
  assert.equal(wardDoor.status, 200, 'server authorizes traversal through a connected doorway');
  assert.equal(wardDoor.data.interior.roomId, 'ward_corridor');
  const chartWorld = files.get('homefront-world.json');
  chartWorld.players['acct-a'].x = 30.1; chartWorld.players['acct-a'].z = 30.8;
  files.set('homefront-world.json', chartWorld);
  const chart = await call('POST', '/api/homefront/world/interior/action', 'acct-a', { actionId: 'patient_chart' });
  assert.equal(chart.status, 200);
  assert(chart.data.interior.flags.includes('incident_clue'), 'story clues persist on the server');
  const pharmacyDoor = await call('POST', '/api/homefront/world/interior/door', 'acct-a', { doorId: 'pharmacy_door' });
  assert.equal(pharmacyDoor.status, 200, 'power and clue gates allow entry to the pharmacy');
  assert.equal(pharmacyDoor.data.interior.roomId, 'pharmacy');
  const pharmacyWorld = files.get('homefront-world.json');
  pharmacyWorld.players['acct-a'].x = 30.1; pharmacyWorld.players['acct-a'].z = 23.8;
  files.set('homefront-world.json', pharmacyWorld);
  const medsBeforeInterior = pharmacyWorld.players['acct-a'].inventory.meds || 0;
  const searchedLocker = await call('POST', '/api/homefront/world/interior/action', 'acct-a', { actionId: 'emergency_locker' });
  assert.equal(searchedLocker.status, 200);
  assert(searchedLocker.data.interiorReward.some(drop => drop.item === 'meds' && drop.amount > 0), 'interior searches grant real carried loot');
  assert(searchedLocker.data.selfInventory.meds > medsBeforeInterior);
  assert(searchedLocker.data.interior.used.includes('emergency_locker'), 'searched containers are saved to prevent duplication');
  const duplicateLocker = await call('POST', '/api/homefront/world/interior/action', 'acct-a', { actionId: 'emergency_locker' });
  assert.equal(duplicateLocker.status, 400, 'a searched container cannot pay out twice');
  const leftHospital = await call('POST', '/api/homefront/world/interior/leave', 'acct-a');
  assert.equal(leftHospital.status, 200);
  assert.equal(leftHospital.data.interior, null);
  const persistentInterior = files.get('homefront-world.json').interiors['acct-a'].interiors.mercy_hospital;
  assert(persistentInterior.flags.includes('emergency_power') && persistentInterior.used.includes('emergency_locker'), 'interior state persists after leaving the building');

  // A full pack sends search overflow back to refuge stores rather than deleting the salvage.
  const depotWorld = files.get('homefront-world.json');
  depotWorld.players['acct-a'].x = -8; depotWorld.players['acct-a'].z = -65;
  depotWorld.players['acct-a'].inventory = { food: 8, rawFood: 8, water: 8, dirtyWater: 0, meds: 0, ammo: 0, scrap: 0, wood: 0 };
  files.set('homefront-world.json', depotWorld);
  const depotEnter = await call('POST', '/api/homefront/world/interior/enter', 'acct-a', { landmarkId: 'north_bus_depot' });
  assert.equal(depotEnter.status, 200);
  const depotPosition = files.get('homefront-world.json');
  depotPosition.players['acct-a'].x = -9.1; depotPosition.players['acct-a'].z = -65.7;
  files.set('homefront-world.json', depotPosition);
  const baseBeforeOverflow = (await call('GET', '/api/homefront', 'acct-a')).data.base;
  const depotSearch = await call('POST', '/api/homefront/world/interior/action', 'acct-a', { actionId: 'dispatch_drawer' });
  assert.equal(depotSearch.status, 200);
  assert.equal(depotSearch.data.overflowDestination, 'refuge', 'overflow has an explicit, persistent destination');
  const baseAfterOverflow = (await call('GET', '/api/homefront', 'acct-a')).data.base;
  assert(baseAfterOverflow.resources.scrap > baseBeforeOverflow.resources.scrap || baseAfterOverflow.resources.ammo > baseBeforeOverflow.resources.ammo, 'full-pack salvage overflow is deposited into refuge resources');
  const leftDepot = await call('POST', '/api/homefront/world/interior/leave', 'acct-a');
  assert.equal(leftDepot.status, 200);

  console.log('Homefront authenticated save API simulation passed.');
})().catch(e => { console.error(e); process.exitCode = 1; });
