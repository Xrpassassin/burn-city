'use strict';
const assert = require('node:assert/strict');
const H = require('../server/homefront-core');
const a = H.createBase('acct-a', 1000);
assert.equal(a.owner, 'acct-a');
assert.equal(a.resources.wood, 40);
assert.equal(a.resources.water, 18, 'new refuges receive clean water for field survival');
assert.ok(a.cosmeticsOwned.includes('rusted_pipe'), 'new refuges receive a default cosmetic loadout');
const cosmeticPower = H.weaponPower(a);
const richCosmetics = H.validateBase({ ...a, embers: 200 }, 'acct-a');
const unlockedSkin = H.applyAction(richCosmetics, 'acct-a', { type: 'buy_cosmetic', skin: 'hazard_stripe' }, 1010);
const equippedSkin = H.applyAction(unlockedSkin, 'acct-a', { type: 'equip_cosmetic', skin: 'hazard_stripe' }, 1020);
assert.equal(equippedSkin.cosmeticsEquipped.weapon, 'hazard_stripe', 'owned weapon skin can be equipped in its matching slot');
assert.equal(H.weaponPower(equippedSkin), cosmeticPower, 'cosmetic skins never alter weapon power');
assert.throws(() => H.applyAction(a, 'acct-a', { type: 'equip_cosmetic', skin: 'ember_lanterns' }), /cosmetic_not_owned/);
assert.throws(() => H.applyAction(a, 'acct-a', { type: 'buy_cosmetic', skin: 'missing_skin' }), /unknown_cosmetic/);
const legacy = H.validateBase({ ...a, resources: Object.fromEntries(Object.entries(a.resources).filter(([key]) => key !== 'water')) }, 'acct-a');
assert.equal(legacy.resources.water, 18, 'older saves receive starter water during normalization');
assert.equal(a.visibility, 'private', 'new refuges are private by default');
assert.throws(() => H.applyAction(a, 'acct-a', { type: 'visibility', value: 'world' }), /invalid_visibility/);
const publicBase = H.applyAction(a, 'acct-a', { type: 'visibility', value: 'public' }, 1050);
assert.equal(publicBase.visibility, 'public');
assert.equal(H.validateBase({ ...publicBase, visibility: 'invalid' }, 'acct-a').visibility, 'private', 'unknown visibility values fail closed');
assert.throws(() => H.applyAction(a, 'acct-b', { type: 'build', building: 'wall' }), /invalid_or_foreign_base/);
const wall = H.applyAction(a, 'acct-a', { type: 'build', building: 'wall' }, 1100);
assert.equal(wall.structures.length, 1);
assert.equal(wall.structures[0].type, 'wall');
assert.equal(wall.resources.wood, 32);
assert.ok(Number.isFinite(wall.structures[0].x) && Number.isFinite(wall.structures[0].z));
assert.throws(() => H.applyAction(wall, 'acct-a', { type: 'build', building: 'wall', x: wall.structures[0].x, z: wall.structures[0].z }), /placement_occupied/);
assert.throws(() => H.applyAction(wall, 'acct-a', { type: 'build', building: 'wall', x: 11, z: 0 }), /placement_out_of_bounds/);
assert.throws(() => H.applyAction(wall, 'acct-a', { type: 'build', building: 'wall', x: 0, z: 0 }), /placement_occupied/);
assert.equal(wall.revision, a.revision + 1);
assert.throws(() => H.applyAction(wall, 'acct-a', { type: 'build', building: 'not-a-building' }), /unknown_building/);
const tower = H.applyAction(wall, 'acct-a', { type: 'build', building: 'watchtower' });
assert.equal(tower.structures.at(-1).type, 'watchtower');
let expedition = H.applyAction(tower, 'acct-a', { type: 'expedition' }, 1200);
assert.equal(expedition.expeditionCount, 1);
assert.equal(expedition.resources.food, 22);
assert.equal(expedition.resources.ammo, 17);
assert.ok(expedition.resources.scrap >= tower.resources.scrap);
assert.ok(expedition.resources.wood >= tower.resources.wood);
expedition.resources.food = 1000; expedition.resources.ammo = 1000;
// Establish the first crop before the survivor-recruitment loop, matching the player-led tutorial gate.
expedition = H.applyAction(expedition, 'acct-a', { type: 'farm_till', x: 8, z: -8 }, 1201);
expedition = H.applyAction(expedition, 'acct-a', { type: 'farm_plant', plotId: expedition.farmPlots[0].id, crop: 'potato' }, 1202);
for (let i = 0; i < 100 && expedition.survivors.length === 0; i++) expedition = H.applyAction(expedition, 'acct-a', { type: 'expedition' });
assert.ok(expedition.survivors.length > 0, 'seeded expeditions can recruit survivors');
const survivor = expedition.survivors[0];
expedition = H.applyAction(expedition, 'acct-a', { type: 'assign', survivorId: survivor.id, role: 'farmer' });
assert.equal(expedition.survivors[0].role, 'farmer');
expedition = H.applyAction(expedition, 'acct-a', { type: 'build', building: 'garden' });
const beforeFood = expedition.resources.food;
expedition = H.applyAction(expedition, 'acct-a', { type: 'workday' });
assert.ok(expedition.resources.food >= beforeFood - 1, 'farmer and garden contribute food after upkeep');
const cityScout = H.createBase('city-scout', 2190);
const firstMarketTrip = H.applyAction(cityScout, 'city-scout', { type: 'expedition', zone: 'commercial' }, 2191);
assert.ok(firstMarketTrip.exploration.discoveredZones.includes('commercial'), 'district discovery is persistent and based on visiting the site, not prior trip count');
assert.ok(firstMarketTrip.embers > cityScout.embers, 'first-time district survey pays a discovery bonus');
const repeatMarketTrip = H.applyAction(firstMarketTrip, 'city-scout', { type: 'expedition', zone: 'commercial' }, 2192);
assert.ok(repeatMarketTrip.embers - firstMarketTrip.embers < firstMarketTrip.embers - cityScout.embers, 'first-visit bonus is not repeatable');
const firstTrip = H.applyAction(cityScout, 'city-scout', { type: 'expedition', zone: 'outskirts' }, 2193);
assert.equal(firstTrip.expeditionCount, 1);
const secondTrip = H.applyAction(firstTrip, 'city-scout', { type: 'expedition', zone: 'residential' }, 2194);
assert.equal(secondTrip.expeditionCount, 2);
const marketTrip = H.applyAction(secondTrip, 'city-scout', { type: 'expedition', zone: 'commercial' }, 2195);
assert.ok(marketTrip.resources.meds >= secondTrip.resources.meds, 'market exploration can yield medicine');

// Perimeter defense threat is independent of the legacy wave field.
const lowCounter = H.createBase('fixed-threat-a', 2200);
const highCounter = H.createBase('fixed-threat-b', 2200);
highCounter.wave = 999;
const lowCounterResult = H.applyAction(lowCounter, 'fixed-threat-a', { type: 'defend' }, 2201);
const highCounterResult = H.applyAction(highCounter, 'fixed-threat-b', { type: 'defend' }, 2201);
assert.equal(lowCounterResult.baseHp, highCounterResult.baseHp, 'completed-round counter must not increase defense difficulty');
assert.equal(lowCounterResult.wave, 0, 'defense incidents do not advance a round counter');

// Embers form the tycoon loop: tougher expeditions pay better, then upgrades and supply packs spend that currency.
const standardBase = H.createBase('difficulty-standard', 2300); standardBase.expeditionCount = 4; standardBase.resources.food = 100; standardBase.resources.ammo = 100;
const veteranBase = H.createBase('difficulty-veteran', 2300); veteranBase.expeditionCount = 4; veteranBase.resources.food = 100; veteranBase.resources.ammo = 100;
const standardTrip = H.applyAction(standardBase, 'difficulty-standard', { type: 'expedition', zone: 'subway', difficulty: 'standard' }, 2301);
const veteranTrip = H.applyAction(veteranBase, 'difficulty-veteran', { type: 'expedition', zone: 'subway', difficulty: 'veteran' }, 2301);
assert.ok(veteranTrip.embers > standardTrip.embers, 'higher expedition difficulty pays more embers');
assert.ok(veteranTrip.resources.scrap > standardTrip.resources.scrap, 'higher expedition difficulty pays more salvage');
assert.ok(veteranTrip.resources.food < standardTrip.resources.food, 'higher expedition difficulty costs more supplies than Standard');
assert.throws(() => H.applyAction(standardBase, 'difficulty-standard', { type: 'expedition', zone: 'subway', difficulty: 'impossible' }), /unknown_difficulty/);
const rescueBase = H.createBase('rescue-test', 2303);
rescueBase.resources.food = 100; rescueBase.resources.ammo = 100;
const rescued = H.applyAction(rescueBase, 'rescue-test', { type: 'rescue_survivor', zone: 'hospital', difficulty: 'veteran' }, 2304);
assert.equal(rescued.survivors.length, 1, 'rescue operation adds a persistent survivor');
assert.equal(rescued.survivors[0].role, 'medic', 'higher-risk hospital rescue recruits a medic');
assert.ok(rescued.embers > rescueBase.embers, 'rescue operation pays difficulty-scaled Ember rewards');
assert.equal(rescued.expeditionCount, rescueBase.expeditionCount, 'rescue objectives do not advance expedition or round counters');
const fullRescueBase = H.createBase('full-rescue-test', 2304);
fullRescueBase.survivors = Array.from({length:H.MAX_SURVIVORS}, (_,i)=>({id:'full-'+i,name:'Survivor '+i,role:'guard',morale:70}));
assert.throws(() => H.applyAction(fullRescueBase, 'full-rescue-test', { type: 'rescue_survivor', zone: 'outskirts' }), /survivor_capacity/);

const armoryBase = H.createBase('armory-test', 2304);
armoryBase.resources.scrap = 100; armoryBase.embers = 100;
const shotgunCrafted = H.applyAction(armoryBase, 'armory-test', { type: 'craft_weapon', weapon: 'pump_shotgun' }, 2305);
assert.ok(shotgunCrafted.weapons.includes('pump_shotgun'), 'crafted weapons persist in the refuge armory');
assert.equal(shotgunCrafted.resources.scrap, 45);
assert.equal(shotgunCrafted.embers, 60);
const shotgunEquipped = H.applyAction(shotgunCrafted, 'armory-test', { type: 'equip_weapon', weapon: 'pump_shotgun' }, 2306);
assert.equal(shotgunEquipped.equippedWeapon, 'pump_shotgun', 'equipped weapon persists');
assert.equal(H.WEAPONS[shotgunEquipped.equippedWeapon].power, 3);
const moddedShotgun = H.applyAction(shotgunEquipped, 'armory-test', { type: 'craft_mod', mod: 'reinforced_grip' }, 2307);
assert.equal(moddedShotgun.weaponMods.pump_shotgun, 'reinforced_grip', 'installed weapon mods persist on their target weapon');
assert.equal(H.weaponPower(moddedShotgun), 4, 'weapon mods increase effective combat power');
assert.throws(() => H.applyAction(moddedShotgun, 'armory-test', { type: 'craft_mod', mod: 'shock_coil' }), /weapon_mod_slot_used/);
assert.throws(() => H.applyAction(shotgunEquipped, 'armory-test', { type: 'craft_weapon', weapon: 'pump_shotgun' }), /weapon_already_owned/);
assert.throws(() => H.applyAction(shotgunEquipped, 'armory-test', { type: 'equip_weapon', weapon: 'shock_maul' }), /weapon_not_owned/);

const bossCostBase = H.createBase('boss-cost-only', 2305);
bossCostBase.resources.food = 100; bossCostBase.resources.ammo = 100;
const bossCostBefore = { scrap: bossCostBase.resources.scrap, wood: bossCostBase.resources.wood, embers: bossCostBase.embers, survivors: bossCostBase.survivors.length, trips: bossCostBase.expeditionCount };
const bossCostAfter = H.applyAction(bossCostBase, 'boss-cost-only', { type: 'boss_attack', zone: 'subway', difficulty: 'nightmare' }, 2306);
assert.equal(bossCostAfter.resources.food, 91, 'Nightmare boss attack charges scaled food costs');
assert.equal(bossCostAfter.resources.ammo, 92, 'Nightmare boss attack charges scaled ammunition costs');
assert.equal(bossCostAfter.resources.scrap, bossCostBefore.scrap, 'boss attacks do not award normal expedition salvage');
assert.equal(bossCostAfter.resources.wood, bossCostBefore.wood, 'boss attacks do not award normal expedition wood');
assert.equal(bossCostAfter.embers, bossCostBefore.embers, 'boss attacks do not pay expedition Embers before the boss is defeated');
assert.equal(bossCostAfter.survivors.length, bossCostBefore.survivors, 'boss attacks do not trigger free survivor recruitment');
assert.equal(bossCostAfter.expeditionCount, bossCostBefore.trips, 'boss attacks do not count as scavenging expeditions');

const upgradeBase = H.createBase('tycoon-upgrade', 2310); upgradeBase.embers = 100;
const upgraded = H.applyAction(upgradeBase, 'tycoon-upgrade', { type: 'buy_upgrade', upgrade: 'scavenger_rig' }, 2311);
assert.equal(upgraded.embers, 0);
assert.equal(upgraded.upgrades.scavenger_rig, 1);
assert.throws(() => H.applyAction(upgraded, 'tycoon-upgrade', { type: 'buy_upgrade', upgrade: 'scavenger_rig' }), /insufficient_embers/);
const marketBase = H.createBase('tycoon-market', 2320);
const bought = H.applyAction(marketBase, 'tycoon-market', { type: 'buy_materials', resource: 'ammo' }, 2321);
assert.equal(bought.embers, 15);
assert.equal(bought.resources.ammo, 28);
assert.throws(() => H.applyAction(bought, 'tycoon-market', { type: 'buy_materials', resource: 'ammo' }), /insufficient_embers/);

// The location-aware Director can produce special-infected / horde pressure on a difficult boss-district trip.
let directorAmbush = null;
for (let i = 0; i < 100 && !directorAmbush; i++) {
  const candidate = H.createBase('director-test-' + i, 2400);
  candidate.expeditionCount = 5;
  candidate.resources.food = 100; candidate.resources.ammo = 100;
  candidate.survivors = [{ id: 's1', name: 'Mara', role: 'guard', morale: 90 }];
  const result = H.applyAction(candidate, candidate.owner, { type: 'expedition', zone: 'research_lab', difficulty: 'nightmare' }, 2401);
  if (/special infected ambushed|infected horde hit/.test(result.log.at(-1).text)) directorAmbush = { candidate, result };
}
assert.ok(directorAmbush, 'high-risk Nightmare expeditions can trigger a Director ambush');
assert.ok(directorAmbush.result.resources.ammo < 91, 'an ambush consumes additional ammunition beyond expedition cost');
assert.ok(directorAmbush.result.survivors[0].morale < 90, 'an ambush affects survivor morale');

// A campfire rally trades food for a server-authoritative morale recovery.
const rallyBase = H.createBase('rally-test', 2040);
rallyBase.resources.food = 10;
rallyBase.survivors = [
  { id: 's1', name: 'Mara', role: 'guard', morale: 10 },
  { id: 's2', name: 'Rook', role: 'farmer', morale: 90 },
  { id: 's3', name: 'Tess', role: 'idle', morale: 100 }
];
const rallied = H.applyAction(rallyBase, 'rally-test', { type: 'rally' }, 2041);
assert.equal(rallied.resources.food, 6, 'rally consumes four food');
assert.deepEqual(rallied.survivors.map(s => s.morale), [25, 100, 100], 'rally raises morale by up to fifteen without exceeding one hundred');
assert.throws(() => H.applyAction({ ...rallyBase, resources: { ...rallyBase.resources, food: 3 } }, 'rally-test', { type: 'rally' }), /rally_food_required/);
assert.throws(() => H.applyAction({ ...rallyBase, survivors: rallyBase.survivors.map(s => ({ ...s, morale: 100 })) }, 'rally-test', { type: 'rally' }), /morale_already_max/);
assert.throws(() => H.applyAction({ ...rallyBase, survivors: [] }, 'rally-test', { type: 'rally' }), /no_survivors_to_rally/);

// Guard morale changes defensive strength against the same first breach.
const steadyGuards = H.createBase('steady-guards', 2050);
steadyGuards.survivors = [{ id: 'g1', name: 'Rook', role: 'guard', morale: 90 }];
const shakenGuards = H.createBase('shaken-guards', 2050);
shakenGuards.survivors = [{ id: 'g1', name: 'Rook', role: 'guard', morale: 10 }];
const steadyDefense = H.applyAction(steadyGuards, 'steady-guards', { type: 'defend' });
const shakenDefense = H.applyAction(shakenGuards, 'shaken-guards', { type: 'defend' });
assert.ok(steadyDefense.baseHp > shakenDefense.baseHp, 'high-morale guards preserve more refuge integrity');

// Storage sheds improve scavenger output; destroyed sheds do not contribute.
const scavengerBase = H.createBase('scavenger-test', 2100);
scavengerBase.resources.food = 100;
scavengerBase.survivors = [{ id: 's1', name: 'Rook', role: 'scavenger', morale: 60 }];
const scavengerPlain = H.applyAction(scavengerBase, 'scavenger-test', { type: 'workday' });
const scavengerWithStorage = { ...scavengerBase, structures: [{ id: 'b1', type: 'storage', hp: 100, maxHp: 100, x: 4, z: 4 }] };
const scavengerStored = H.applyAction(scavengerWithStorage, 'scavenger-test', { type: 'workday' });
assert.ok(scavengerStored.resources.scrap > scavengerPlain.resources.scrap, 'an intact storage shed boosts scavenger scrap output');
const scavengerWithBrokenStorage = { ...scavengerBase, structures: [{ id: 'b1', type: 'storage', hp: 0, maxHp: 100, x: 4, z: 4 }] };
const scavengerBroken = H.applyAction(scavengerWithBrokenStorage, 'scavenger-test', { type: 'workday' });
assert.equal(scavengerBroken.resources.scrap, scavengerPlain.resources.scrap, 'destroyed storage gives no scavenging bonus');

// Morale changes actual production, so survivor care has a gameplay consequence.
const rested = H.createBase('rested', 2000);
rested.resources.food = 100;
rested.survivors = [{ id: 's1', name: 'Mara', role: 'farmer', morale: 90 }];
const tired = H.createBase('tired', 2000);
tired.resources.food = 100;
tired.survivors = [{ id: 's1', name: 'Mara', role: 'farmer', morale: 10 }];
const restedShift = H.applyAction(rested, 'rested', { type: 'workday' });
const tiredShift = H.applyAction(tired, 'tired', { type: 'workday' });
assert.ok(restedShift.resources.food > tiredShift.resources.food, 'high-morale workers produce more food than demoralized workers');
assert.ok(restedShift.resources.food >= 100 && tiredShift.resources.food >= 100, 'work shift charges upkeep before production');

const damaged = H.applyAction(expedition, 'acct-a', { type: 'defend' });
assert.equal(damaged.wave, 0, 'perimeter defense no longer advances rounds');
assert.ok(damaged.baseHp <= damaged.baseMaxHp);
const damagedBase = { ...damaged, baseHp: 200 };
const repaired = H.applyAction(damagedBase, 'acct-a', { type: 'repair', target: 'base' });
assert.equal(repaired.baseHp, 275);
assert.throws(() => H.applyAction({ ...a, owner: 'acct-b' }, 'acct-a', { type: 'workday' }), /invalid_or_foreign_base/);
assert.throws(() => H.applyAction(a, 'acct-a', { type: 'build', building: '../pause.json' }), /unknown_building/);
const corrupted = { ...a, resources: { wood: -500, scrap: Infinity, food: 1, meds: 0, ammo: 0 } };
const normalized = H.validateBase(corrupted, 'acct-a');
assert.equal(normalized.resources.wood, 0);
assert.equal(normalized.resources.scrap, 0);
console.log('Zombie Homefront settlement core simulation passed.');


// Server-authoritative return debrief accounting.
const { buildReturnDebrief, addSessionTotals } = require('../server/homefront');
const debrief = buildReturnDebrief(
  { at: 1000, embers: 50, repelledCount: 2, resources: { wood: 40, scrap: 30, food: 24, water: 18, meds: 5, ammo: 18 }, totals: { embersEarned: 50, resourcesCollected: { wood: 12, scrap: 9, food: 0, water: 0, meds: 2, ammo: 4 }, suppliesConsumed: { wood: 0, scrap: 0, food: 3, water: 0, meds: 0, ammo: 2 }, rewardEvents: 2, repels: 2 } },
  { embers: 83, repelledCount: 8, resources: { wood: 45, scrap: 26, food: 20, water: 17, meds: 6, ammo: 14 } },
  { stored: { food: 2, scrap: 3, ammo: 1 } },
  2000
);
assert.equal(debrief.embersNet, 33);
assert.deepEqual(debrief.resourceNet, { wood: 5, scrap: -4, food: -4, water: -1, meds: 1, ammo: -4 });
assert.equal(debrief.attacksRepelled, 2);
assert.equal(debrief.fieldSuppliesReturned, 6);
assert.equal(debrief.grossEmbersEarned, 50);
assert.deepEqual(debrief.grossResourcesCollected, { wood: 12, scrap: 9, food: 0, water: 0, meds: 2, ammo: 4 });
assert.deepEqual(debrief.suppliesConsumed, { wood: 0, scrap: 0, food: 3, water: 0, meds: 0, ammo: 2 });
assert.equal(debrief.attacksRepelled, 2, 'session-specific repel count takes precedence when available');
const liveSession = { homefrontSessionStart: { totals: { embersEarned: 0, resourcesCollected: { wood: 0, scrap: 0, food: 0, water: 0, meds: 0, ammo: 0 }, suppliesConsumed: { wood: 0, scrap: 0, food: 0, water: 0, meds: 0, ammo: 0 }, rewardEvents: 0, repels: 0 } } };
addSessionTotals(liveSession, { embers: 17, resources: { wood: 3, food: 2 }, consumed: { food: 1, water: 1, wood: 1 } });
assert.equal(liveSession.homefrontSessionStart.totals.embersEarned, 17);
assert.equal(liveSession.homefrontSessionStart.totals.resourcesCollected.wood, 3);
assert.equal(liveSession.homefrontSessionStart.totals.resourcesCollected.food, 2);
assert.equal(liveSession.homefrontSessionStart.totals.suppliesConsumed.food, 1);
assert.equal(liveSession.homefrontSessionStart.totals.suppliesConsumed.water, 1);
assert.equal(liveSession.homefrontSessionStart.totals.rewardEvents, 1);
console.log('Homefront return debrief accounting passed.');


// Customizable fortifications: rotation persists, trench hazards tier up, and manned turrets spend ammunition during defense.
const fortBase = H.createBase('fortification-test', 5000);
fortBase.resources = { ...fortBase.resources, wood: 200, scrap: 250, ammo: 80, meds: 30 };
let fortified = H.applyAction(fortBase, 'fortification-test', { type: 'build', building: 'entrance', x: 8, z: 8, rotation: Math.PI / 2 }, 5010);
const entrance = fortified.structures.find(x => x.type === 'entrance');
assert.equal(entrance.rotation, Math.PI / 2, 'placed entrance stores its facing');
fortified = H.applyAction(fortified, 'fortification-test', { type: 'build', building: 'trench', x: -7, z: 7 }, 5020);
const trench = fortified.structures.find(x => x.type === 'trench');
assert.equal(trench.trenchLevel, 0);
fortified = H.applyAction(fortified, 'fortification-test', { type: 'trench_upgrade', target: trench.id }, 5030);
assert.equal(fortified.structures.find(x => x.id === trench.id).trenchLevel, 1);
fortified = H.applyAction(fortified, 'fortification-test', { type: 'trench_upgrade', target: trench.id }, 5040);
assert.equal(fortified.structures.find(x => x.id === trench.id).trenchLevel, 2);
fortified = H.applyAction(fortified, 'fortification-test', { type: 'trench_upgrade', target: trench.id }, 5050);
assert.equal(fortified.structures.find(x => x.id === trench.id).trenchLevel, 3);
assert.throws(() => H.applyAction(fortified, 'fortification-test', { type: 'trench_upgrade', target: trench.id }, 5060), /trench_max_level/);
fortified = H.applyAction(fortified, 'fortification-test', { type: 'build', building: 'turret', x: -7, z: -7 }, 5070);
const turret = fortified.structures.find(x => x.type === 'turret');
fortified = H.applyAction(fortified, 'fortification-test', { type: 'turret_manning', target: turret.id, manned: true }, 5080);
assert.equal(fortified.structures.find(x => x.id === turret.id).manned, true);
const ammoBeforeTurretDefense = fortified.resources.ammo;
fortified = H.applyAction(fortified, 'fortification-test', { type: 'defend' }, 5090);
assert.ok(fortified.resources.ammo < ammoBeforeTurretDefense, 'manned turret consumes ammunition during a defense action');
assert.equal(fortified.structures.find(x => x.id === turret.id).manned, false, 'turret returns to unmanned after its defense burst');
const normalizedFortifications = H.validateBase(fortified, 'fortification-test');
assert.equal(normalizedFortifications.structures.find(x => x.id === trench.id).trenchLevel, 3, 'trench tier persists through save normalization');
assert.equal(normalizedFortifications.structures.find(x => x.id === entrance.id).rotation, Math.PI / 2, 'entrance rotation persists through save normalization');

const farmStart = H.createBase('farm-test', 6000);
assert.equal(farmStart.resources.seeds, 6, 'new refuge has a small starter seed reserve');
assert.deepEqual(farmStart.farmPlots, [], 'farm plots start empty; the player must establish the farm');
farmStart.resources.food = 100;
const soil = H.applyAction(farmStart, 'farm-test', { type: 'farm_till', x: 4, z: 4 }, 6010);
const plot = soil.farmPlots[0];
assert.equal(plot.crop, null, 'tilling only prepares soil; it does not auto-plant');
assert.throws(() => H.applyAction(soil, 'farm-test', { type: 'assign', survivorId: 'missing', role: 'farmer' }, 6020), /plant_crops_before_recruiting_farmers/, 'farmer assignment is gated until the player plants a crop');
let planted = H.applyAction(soil, 'farm-test', { type: 'farm_plant', plotId: plot.id, crop: 'potato' }, 6030);
assert.equal(planted.resources.seeds, 5, 'planting spends a seed');
assert.throws(() => H.applyAction(planted, 'farm-test', { type: 'farm_harvest', plotId: plot.id }, 6040), /crop_not_ready/);
for (let day = 0; day < 3; day++) {
  planted = H.applyAction(planted, 'farm-test', { type: 'farm_water', plotId: plot.id }, 6050 + day * 20);
  planted = H.applyAction(planted, 'farm-test', { type: 'workday' }, 6060 + day * 20);
}
assert.equal(planted.farmPlots[0].growth, H.CROPS.potato.days, 'watered crops advance through the server-authoritative workday clock');
const foodBeforeHarvest = planted.resources.food;
planted = H.applyAction(planted, 'farm-test', { type: 'farm_harvest', plotId: plot.id }, 6120);
assert.equal(planted.resources.food, foodBeforeHarvest + 5, 'mature potato harvest adds its configured food yield');
assert.equal(planted.farmPlots[0].crop, null, 'harvest resets the plot for replanting');
const savedFarm = H.validateBase(planted, 'farm-test');
assert.equal(savedFarm.farmPlots.length, 1, 'farm plot persists through save normalization');
assert.equal(savedFarm.resources.seeds, 5, 'seed inventory persists through save normalization');

console.log('Homefront fortification and farming simulation passed.');
