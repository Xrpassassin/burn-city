'use strict';
const assert = require('node:assert/strict');
const W = require('../server/homefront-world');
const Combat = require('../server/homefront-combat');

let world = W.defaultWorld();
const a = W.enter(world, 'acct-a', 1000); world = a.world;
const b = W.enter(world, 'acct-b', 1000); world = b.world;
assert.notDeepEqual([a.result.self.x, a.result.self.z], [b.result.self.x, b.result.self.z], 'solo players spawn at different perimeter locations');
assert.equal(b.result.players.length, 1, 'far-apart strangers are outside each other\'s interest range');
assert.ok(Math.hypot(a.result.self.x - b.result.self.x, a.result.self.z - b.result.self.z) >= W.MIN_SPAWN_DISTANCE, 'solo players spawn at least MIN_SPAWN_DISTANCE apart');
assert.equal(a.result.self.risk, 1, 'perimeter spawn is low risk');
assert.ok(a.world.encounters['acct-a'], 'the authoritative director seeds an infected encounter when an explorer enters');
assert.ok(a.result.director && a.result.director.nextSpawnAt > 1000, 'world snapshot exposes the persisted local director schedule');
assert.equal(world.players['acct-a'].directorState.lastSpawnAt, 1000, 'director spawn cadence is persisted per player');
assert.equal(a.result.self.spawn, 'north_gate', 'the first Homefront claims the Pine Crossing trailhead');
assert.deepEqual(a.result.refugeReturn, { x: a.result.self.x, z: a.result.self.z });
assert.equal(b.result.refugeEntries, undefined, 'private gate assignments are not shared with clients');
{
  const expedition = structuredClone(b.world);
  const [first, second] = ['acct-a', 'acct-b'].map(id => expedition.players[id]);
  const north = { x: first.x, z: first.z };
  const east = { x: second.x, z: second.z };
  expedition.encounters = {};
  Object.assign(first, east, { spawn: second.spawn, lastSeen: 2000 });
  second.lastSeen = 2000;
  assert.equal(W.snapshot(expedition, 'acct-a', 2000).self.risk, 4, 'risk follows the permanent gate even after an expedition respawn');
  assert.equal(W.snapshot(expedition, 'acct-b', 2000).self.risk, 1, 'the same waypoint is low risk near the other player’s home');
  const near = W.spawnEncounter(expedition, 'acct-b', 2000).encounter;
  const far = W.spawnEncounter(expedition, 'acct-a', 2000).encounter;
  assert.equal(near.risk, 1);
  assert.equal(far.risk, 4);
  assert.ok(W.tickDirector(expedition, 'acct-a', 2000).spawnIntervalMs <
    W.tickDirector(expedition, 'acct-b', 2000).spawnIntervalMs, 'outbound exposure shortens reinforcement intervals');
  Object.assign(first, north);
  const home = W.snapshot(expedition, 'acct-a', 2000).self;
  assert.equal(home.homefrontDistance, 0);
  assert.equal(home.risk, 1, 'returning to the gate lowers risk');
  const party = W.createParty(expedition, 'acct-a', 2100);
  const grouped = W.joinParty(party.world, 'acct-b', party.result.party.code, 2200).world;
  assert.equal(W.tickDirector(grouped, 'acct-a', 2200).risk, 4, 'nearby teammates share the highest exposure');
  grouped.players['acct-b'].lastSeen = 0;
  grouped.players['acct-a'].lastSeen = 60000;
  assert.equal(W.tickDirector(grouped, 'acct-a', 60000).risk, 1, 'inactive teammates do not scale the active patrol');
}
{
  let saved = W.leave(a.world, 'acct-a', 2000).world;
  // Save/restore after every exit with nobody left online. Every subsequent
  // refuge still reserves a separate footprint.
  const gates = [a.result.refugeReturn];
  for (let i = 0; i < 24; i++) {
    const account = 'offline-refuge-' + i;
    const next = W.enter(JSON.parse(JSON.stringify(saved)), account, 3000 + i * 2000);
    const gate = next.result.refugeReturn;
    assert.ok(gates.every(other => Math.hypot(other.x - gate.x, other.z - gate.z) >= 14 - 1e-6),
      'a new gate has a separate footprint even if all earlier owners left');
    gates.push(gate);
    saved = W.leave(next.world, account, 4000 + i * 2000).world;
  }
  const returned = W.enter(JSON.parse(JSON.stringify(saved)), 'acct-a', 60000);
  assert.deepEqual(returned.result.refugeReturn, a.result.refugeReturn, 'returning Homefront keeps its reserved gate');
  assert.deepEqual({ x: returned.result.self.x, z: returned.result.self.z }, a.result.refugeReturn);
}
{
  const legacy = JSON.parse(JSON.stringify(a.world));
  delete legacy.refugeEntries;
  const newcomer = W.enter(legacy, 'new-refuge', 3000);
  assert.notEqual(newcomer.result.self.spawn, 'north_gate',
    'a new refuge cannot claim the return point of a pre-update active explorer');
  assert.deepEqual(W.snapshot(newcomer.world, 'acct-a', 3000).refugeReturn, a.result.refugeReturn);
}
const noisyWorld = W.recordNoise(world, 'acct-a', 95, 1500);
assert.equal(noisyWorld.players['acct-a'].noiseLevel, 95, 'server records gunfire noise intensity');
assert.equal(noisyWorld.players['acct-a'].lastNoiseAt, 1500, 'server records the authoritative noise timestamp');
const noisyTick = W.tickDirector(noisyWorld, 'acct-a', 2000);
assert.ok(['alert', 'assault', 'engaged', 'calm'].includes(noisyTick.phase), 'director evaluates current local threat phase');
assert.ok(noisyTick.noise > 0, 'recent gunfire remains audible to the director on the next world tick');
const Terrain = require('../server/homefront-terrain');
const Collision = require('../server/homefront-collision');
assert.equal(Collision.isSafePosition(a.result.self.x, a.result.self.z, { bounds: W.WORLD_SIZE }), true,
  'new players spawn on a grounded, traversable footprint');
const corruptSave = W.defaultWorld();
corruptSave.players['invalid-save'] = {
  x: 999, z: 999, spawn: 'north_gate', lastSeen: 1000, lastMove: 1000, partyCode: null,
  survival: require('../server/homefront-survival').normalize(null, 1000),
  inventory: {}, inventoryInitialized: true, weaponMagazine: { weaponId: 'pipe_blade', loaded: 0 }
};
const recoveredSave = W.normalizeWorld(corruptSave).players['invalid-save'];
assert.equal(Collision.isSafePosition(recoveredSave.x, recoveredSave.z, { bounds: W.WORLD_SIZE }), true,
  'unsafe legacy/saved coordinates recover to a safe position near the authored spawn');
assert.ok(Math.hypot(recoveredSave.x - W.SPAWNS[0].x, recoveredSave.z - W.SPAWNS[0].z) <= 20,
  'save recovery stays near the player\'s recorded spawn instead of teleporting across the map');
assert.ok(a.result.world.pointsOfInterest.some(p => p.type === 'cache'), 'shared world includes physical supply-cache landmarks');
assert.ok(Object.values(a.result.world.caches).every(cache => cache.readyAt === 0), 'shared supply caches begin available');
assert.ok(a.result.world.pointsOfInterest.some(p => p.type === 'rescue'), 'shared world includes survivor rescue sites');
const pineTrailLoot = a.result.world.lootNodes.filter(node => node.trail);
assert.deepEqual(pineTrailLoot.map(node => node.id), ['loot_pine_logging_kit', 'loot_pine_creek_pack', 'loot_pine_relay_spares']);
assert.ok(pineTrailLoot.every(node => require('../server/homefront-collision').isSafePosition(node.x, node.z)),
  'trail supplies can be reached on foot');
assert.ok(a.result.world.lootNodes.every(node => node.available && node.id.startsWith('loot_')), 'loot nodes start available and have stable IDs');
assert.ok(Object.values(a.result.world.rescues).every(site => site.readyAt === 0), 'shared rescue sites begin available');

const party = W.createParty(world, 'acct-a', 1100); world = party.world;
const code = party.result.party.code;
const joined = W.joinParty(world, 'acct-b', code, 1200); world = joined.world;
assert.equal(joined.result.party.members.length, 2, 'party roster is shared');
assert.deepEqual([joined.result.self.x, joined.result.self.z], [joined.result.party.members[0].x, joined.result.party.members[0].z], 'party members spawn together');
const c = W.enter(world, 'acct-c', 1250); world = c.world;
assert.throws(() => W.joinParty(world, 'acct-c', 'NOPE00', 1300), /party_not_found/);

assert.throws(() => W.move(world, 'acct-b', 0, 0, 2200), /party_leader_controls_movement/);
const before = world.players['acct-a'];
const needsBeforeMove = { hunger: before.survival.hunger, thirst: before.survival.thirst, stamina: before.survival.stamina };
const moved = W.move(world, 'acct-a', -100, -100, 2200);
world = moved.world;
assert.ok(Math.hypot(world.players['acct-a'].x - before.x, world.players['acct-a'].z - before.z) <= W.MOVE_STEP + 0.2, 'movement is server-clamped to a short step');
assert.ok(world.players['acct-a'].survival.hunger < needsBeforeMove.hunger, 'accepted travel consumes food reserves');
assert.ok(world.players['acct-a'].survival.thirst < needsBeforeMove.thirst, 'accepted travel consumes water reserves');
assert.ok(world.players['acct-a'].survival.stamina < needsBeforeMove.stamina, 'accepted travel consumes stamina');
assert.equal(world.players['acct-a'].inventory.food,0,'legacy active explorers do not receive duplicated starter rations');
assert.ok(Math.hypot(world.players['acct-b'].x - joined.result.self.x, world.players['acct-b'].z - joined.result.self.z) <= W.MOVE_STEP + 0.2,
  'party followers advance within a bounded movement budget instead of teleporting to the leader');
const followerBeforeRefresh = { x: world.players['acct-b'].x, z: world.players['acct-b'].z };
const followerRefresh = W.enter(world, 'acct-b', 2300);
world = followerRefresh.world;
assert.deepEqual([world.players['acct-b'].x, world.players['acct-b'].z], [followerBeforeRefresh.x, followerBeforeRefresh.z],
  'presence refresh preserves the follower position instead of snapping them to the leader');
assert.equal(Collision.isSafePosition(world.players['acct-b'].x, world.players['acct-b'].z, { bounds: W.WORLD_SIZE }), true,
  'party follower movement ends on a collision-safe terrain footprint');
assert.equal(W.districtAt(0, 0).risk, 5, 'deep city core is high risk');
assert.equal(W.frontierDepthAt(0, 0), 100, 'city core reports maximum frontier depth');
assert.equal(W.frontierDepthAt(-8, -82), 18, 'outer spawn reports shallow frontier depth');
assert.equal(W.districtAt(-8, -82).risk, 1, 'outer spawn is low risk');
assert.ok(a.result.self.frontierDepth < 25, 'outer spawn reports low frontier depth');
assert.equal(a.result.self.frontierBand, 'perimeter', 'outer spawn identifies the safer perimeter band');

const handlingEntry = W.enter(W.defaultWorld(), 'handling-player', 1000);
const aimedEntry = W.setAiming(handlingEntry.world, 'handling-player', true, 2000);
assert.equal(aimedEntry.result.selfWeaponHandling.aiming, true, 'aim stance is persisted and returned by the server');
const slowMove = W.move(aimedEntry.world, 'handling-player', 100, -82, 3000);
const slowDistance = Math.hypot(slowMove.result.self.x - aimedEntry.result.self.x, slowMove.result.self.z - aimedEntry.result.self.z);
assert.ok(slowDistance <= W.MOVE_STEP * W.AIM_MOVE_SCALE.pipe_blade + 0.2, 'aiming applies a server-side movement penalty');
assert.equal(slowMove.result.selfWeaponHandling.aiming, false, 'accepted movement lowers the weapon server-side');
const sprintMove = W.move(slowMove.world, 'handling-player', 100, -82, 4000, true);
const sprintDistance = Math.hypot(sprintMove.result.self.x - slowMove.result.self.x, sprintMove.result.self.z - slowMove.result.self.z);
assert.ok(sprintDistance <= W.SPRINT_STEP + 0.2, 'sprint movement remains server-clamped to its larger step budget');
assert.equal(sprintMove.world.players['handling-player'].lastSprintAt, 4000, 'server records sprint timing for accuracy recovery');
assert.equal(sprintMove.world.players['handling-player'].accuracyRecoverUntil, 4000 + W.SPRINT_RECOVERY_MS, 'sprint creates a bounded post-sprint accuracy recovery window');
assert.throws(() => W.move(W.setAiming(sprintMove.world, 'handling-player', true, 5000).world, 'handling-player', 100, -82, 6000, true), /lower_weapon_before_sprinting/);

const absent = W.snapshot(world, 'acct-a', 50000);
assert.equal(absent.players.length, 0, 'stale explorers expire from shared presence');

const aiNow = Date.now();
world.players['acct-a'].lastMove = aiNow - 1000;
world.players['acct-a'].lastSeen = aiNow;
const threat = Combat.spawn({ encounters: world.encounters, account: 'acct-a', player: world.players['acct-a'], now: aiNow });
world.encounters = threat.encounters;
const enemyBefore = world.encounters['acct-a'];
const safeEnemyStart = Collision.findSafePosition(world.players['acct-a'].x + 10, world.players['acct-a'].z, { bounds: W.WORLD_SIZE }) ||
  Collision.findSafePosition(world.players['acct-a'].x - 10, world.players['acct-a'].z, { bounds: W.WORLD_SIZE });
assert.ok(safeEnemyStart, 'AI regression fixture chooses an unoccupied infected position');
enemyBefore.x = safeEnemyStart.x;
enemyBefore.z = safeEnemyStart.z;
enemyBefore.lastAiAt = aiNow;
const distanceBefore = Math.hypot(world.players['acct-a'].x - enemyBefore.x, world.players['acct-a'].z - enemyBefore.z);
const chased = W.move(world, 'acct-a', world.players['acct-a'].x - 8, world.players['acct-a'].z, aiNow + 1500);
world = chased.world;
const enemyAfter = world.encounters['acct-a'];
const distanceAfter = Math.hypot(world.players['acct-a'].x - enemyAfter.x, world.players['acct-a'].z - enemyAfter.z);
assert.ok(enemyAfter.x !== enemyBefore.x || enemyAfter.z !== enemyBefore.z, 'authoritative movement advances infected AI');
assert.ok(distanceAfter < distanceBefore + 8, 'infected movement tracks the updated player position');
// Integration contract: player movement and infected pursuit must use the same
// terrain gate and recover through the pathfinder rather than crossing a blocked ridge.

const originalCanTraverse = Terrain.canTraverse;
const originalFindTerrainPath = Terrain.findTerrainPath;
const originalCollisionCanTraverse = Collision.canTraverse;
const originalCollisionFindPath = Collision.findPath;
const blockedRidge = (x0, z0, x1, z1) => {
  // Isolate this synthetic ridge test from unrelated authored terrain blockers.
  const crossesRidge = (x0 <= 0 && x1 >= 0) || (x1 <= 0 && x0 >= 0);
  if (!crossesRidge) return true;
  const denominator = x1 - x0;
  const t = Math.abs(denominator) < 1e-9 ? 0 : -x0 / denominator;
  const crossingZ = z0 + (z1 - z0) * t;
  return Math.abs(crossingZ) >= 8;
};
try {
  Terrain.canTraverse = blockedRidge;
  // Isolate this synthetic ridge contract from the separate authored-object collision layer.
  Collision.canTraverse = () => true;
  Terrain.findTerrainPath = (sx, sz, gx, gz) => [
    { x: sx, z: 8 },
    { x: gx, z: 8 },
    { x: gx, z: gz }
  ];
  Collision.findPath = (sx, sz, gx, gz) => [
    { x: sx, z: 8 },
    { x: gx, z: 8 },
    { x: gx, z: gz }
  ];

  const ridgeWorld = W.defaultWorld();
  ridgeWorld.players['ridge-player'] = {
    x: -12, z: 0, spawn: W.SPAWNS[0].id, lastSeen: 10000, lastMove: 9000,
    partyCode: null, survival: require('../server/homefront-survival').normalize(null, 10000),
    inventory: {}, inventoryInitialized: true,
    weaponMagazine: { weaponId: 'pipe_blade', loaded: 0 }
  };
  const ridgeMove = W.move(ridgeWorld, 'ridge-player', 12, 0, 11000);
  assert.ok(ridgeMove.world.players['ridge-player'].z > 0,
    'player movement follows a safe route around a blocked direct ridge crossing');
  assert.ok(blockedRidge(-12, 0, ridgeMove.world.players['ridge-player'].x, ridgeMove.world.players['ridge-player'].z),
    'accepted player step itself remains terrain-traversable');

  const pursuer = {
    id: 'ridge-infected', owner: 'ridge-player', event: 'wandering_infected', enemy: 'Stray Runner',
    district: 'outskirts', x: 2, z: 0, hp: 32, maxHp: 32, damage: 2, ammoCost: 1,
    range: 18, risk: 1, createdAt: 10000, lastAttackAt: 0, lastAiAt: 10000,
    expiresAt: 300000, defeated: false
  };
  const chasedAroundRidge = Combat.advance({
    encounters: { 'ridge-player': pursuer },
    players: { 'ridge-player': { x: -5, z: 0 } },
    now: 11000, speed: 2.8, maxElapsed: 2.5
  })['ridge-player'];
  assert.ok(Math.abs(chasedAroundRidge.z) > 0,
    'infected pursuit follows a safe route instead of crossing the blocked ridge');

  Terrain.findTerrainPath = () => null;
  Collision.findPath = () => null;
  const trappedPlayerWorld = W.defaultWorld();
  trappedPlayerWorld.players['trapped-player'] = {
    x: -12, z: 0, spawn: W.SPAWNS[0].id, lastSeen: 10000, lastMove: 9000,
    partyCode: null, survival: require('../server/homefront-survival').normalize(null, 10000),
    inventory: {}, inventoryInitialized: true,
    weaponMagazine: { weaponId: 'pipe_blade', loaded: 0 }
  };
  assert.throws(() => W.move(trappedPlayerWorld, 'trapped-player', 12, 0, 11000),
    /terrain_path_unreachable/, 'player movement refuses a blocked crossing when no safe route exists');
  const waitingInfected = Combat.advance({
    encounters: { 'ridge-player': pursuer },
    players: { 'ridge-player': { x: -5, z: 0 } },
    now: 11000, speed: 2.8, maxElapsed: 2.5
  })['ridge-player'];
  assert.deepEqual([waitingInfected.x, waitingInfected.z], [pursuer.x, pursuer.z],
    'infected waits rather than clipping through terrain when no safe route exists');
} finally {
  Terrain.canTraverse = originalCanTraverse;
  Terrain.findTerrainPath = originalFindTerrainPath;
  Collision.canTraverse = originalCollisionCanTraverse;
  Collision.findPath = originalCollisionFindPath;
}
console.log('Homefront shared Graveyard world and terrain-movement integration passed.');

{
  const account = 'contact-survivor';
  const start = 100000;
  const fixture = W.enter(W.defaultWorld(), account, start).world;
  const target = fixture.players[account];
  const direction = [[1,0], [-1,0], [0,1], [0,-1]].find(([dx, dz]) =>
    Collision.canTraverse(target.x, target.z, target.x + dx * 4, target.z + dz * 4) &&
    Terrain.canTraverse(target.x, target.z, target.x + dx * 4, target.z + dz * 4));
  assert.ok(direction, 'test spawn has a clear path for a pursuing infected');
  const [dx, dz] = direction;
  const encounter = fixture.encounters[account];
  const member = { ...encounter.members[0], x: target.x + dx * 4, z: target.z + dz * 4 };
  Object.assign(encounter, { x: member.x, z: member.z, hp: member.hp, maxHp: member.maxHp,
    members: [member], lastAiAt: start, damage: 5 });
  const observer = W.enter(fixture, 'contact-observer', start + 100).world;
  assert.equal(observer.players[account].survival.health, 100, "another player's refresh does not apply damage to this account");

  const distant = W.enter(observer, account, start + 400);
  assert.equal(distant.result.selfInfectedHit, null, 'pursuit outside melee reach leaves the survivor unharmed');
  const winding = W.enter(distant.world, account, start + 1700);
  assert.equal(winding.result.selfInfectedHit, null, 'a zombie must telegraph its bite before damage');
  assert.equal(winding.result.selfInfectedWindup.sourceId, member.id, 'windup identifies the attacker');
  const bitten = W.enter(winding.world, account, start + 2350);
  assert.equal(bitten.result.selfInfectedHit.sourceId, member.id, 'the same infected bites after its windup if the survivor remains in range');
  assert.equal(bitten.result.selfSurvival.health, 95);
  assert.equal(bitten.result.selfSurvival.infection, 1);
  const protectedTick = W.enter(JSON.parse(JSON.stringify(bitten.world)), account, start + 2400);
  assert.equal(protectedTick.result.selfSurvival.health, 95, 'persisted recovery window prevents repeat damage from rapid requests');
  assert.equal(protectedTick.result.selfInfectedHit.at, bitten.result.selfInfectedHit.at);
  const secondWindup = W.enter(protectedTick.world, account, start + 3500);
  assert.equal(secondWindup.result.selfSurvival.health, 95, 'recovery starts another windup rather than immediate damage');
  const secondBite = W.enter(secondWindup.world, account, start + 4150);
  assert.equal(secondBite.result.selfSurvival.health, 90, 'an infected still in reach can attack after recovery and a second windup');

  secondBite.world.players[account].survival.health = 3;
  secondBite.world.players[account].inventory = { ammo: 4 };
  const fatalWindup = W.enter(secondBite.world, account, start + 8000);
  const defeated = W.enter(fatalWindup.world, account, start + 8650);
  assert.equal(defeated.result.selfInfectedHit.defeated, true);
  assert.equal(defeated.result.selfSurvival.health, require('../server/homefront-survival').RESPAWN_HEALTH);
  assert.equal(defeated.result.selfInventory.ammo, 4, 'safe respawn keeps the field pack');
  assert.equal(defeated.result.selfEncounter, null, 'the defeated player is released from the encounter');
  assert.ok(Collision.isSafePosition(defeated.result.self.x, defeated.result.self.z));
  assert.deepEqual(
    {x:defeated.result.self.x,z:defeated.result.self.z}, defeated.result.refugeReturn,
    'infected defeat returns the player to their own permanently reserved gate, not another refuge'
  );
  assert.equal(defeated.world.refugeEntries[account], fixture.refugeEntries[account],
    'death preserves original refuge assignment across the same shared world');
  assert.equal(W.snapshot(defeated.world, account, start + 13000).selfInfectedHit, null, 'expired hit feedback is not replayed on reconnect');
}

{
  const account = 'pine-sprinter';
  const entered = W.enter(W.defaultWorld(), account, 1000);
  const start = W.moveInput(entered.world, account, { sequence: 0, x: -1, z: 0, sprint: true }, 2000);
  const sprint = W.moveInput(start.world, account, { sequence: 1, x: -1, z: 0, sprint: true }, 2100);
  const player = sprint.world.players[account];
  assert.equal(player.noiseLevel, 32, 'sprinting along the logging road makes gravel noise');
  assert.equal(player.noiseX, player.x, 'noise position comes from accepted movement');
  Object.assign(player, { lastNoiseAt: 2100, noiseLevel: 95, noiseX: -20, noiseZ: -81 });
  const resumed = W.moveInput(sprint.world, account, { sequence: 2, x: -1, z: 0, sprint: true }, 2900);
  const next = W.moveInput(resumed.world, account, { sequence: 3, x: -1, z: 0, sprint: true }, 3000);
  assert.ok(next.result.self.x < resumed.result.self.x, 'the explorer is actually sprinting after the shot');
  assert.equal(next.world.players[account].noiseX, -20, 'a sprint cannot move the origin of a recent gunshot');
}

{
  const now = 150000, owner = 'pine-owner', ally = 'pine-bite-ally';
  let patrolWorld = W.enter(W.defaultWorld(), owner, now).world;
  patrolWorld = W.enter(patrolWorld, ally, now).world;
  const patrol = patrolWorld.encounters[owner];
  delete patrolWorld.encounters[ally];
  const party = 'D00D11';
  patrolWorld.parties[party] = { leader: owner, members: [owner, ally] };
  Object.assign(patrolWorld.players[owner], { x: -43, z: -42, partyCode: party });
  Object.assign(patrolWorld.players[ally], { x: -38.2, z: -42, partyCode: party });
  const member = { ...patrol.members[0], x: -39, z: -42 };
  Object.assign(patrol, { x: member.x, z: member.z, members: [member], hp: member.hp, lastAiAt: now });
  const bitten = W.enter(patrolWorld, ally, now + 100);
  assert.equal(bitten.result.selfInfectedHit.encounterId, patrol.id, 'a shared patrol can bite a teammate');
  assert.equal(bitten.world.players[owner].survival.health, 100, 'a teammate refresh does not apply damage to another account');

  Object.assign(bitten.world.players[owner], { x: -38.3, z: -42 });
  const second = W.enter(JSON.parse(JSON.stringify(bitten.world)), owner, now + 180);
  assert.equal(second.result.selfSurvival.health, 100, 'one patrol does not double-strike on simultaneous refreshes');
}
