'use strict';
// RPG shared world: far-apart spawns, interest-managed snapshots (strangers only within range, party always),
// PvP between strangers, no friendly fire in a party, no PvP in Homefront, forged hits ignored.
const assert = require('node:assert/strict');
const { handle } = require('../server/homefront');
const World = require('../server/homefront-world');
const PvP = require('../server/homefront-pvp');

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
const W = '/api/homefront/world';
const edit = fn => { const w = files.get('homefront-world.json'); fn(w); files.set('homefront-world.json', w); };
const place = (acct, x, z) => edit(w => { Object.assign(w.players[acct], { x, z, lastMove: 0, lastPvpAt: 0, spawnedAt: 0, lastSeen: Date.now() }); });
const id = PvP.publicId;
// Every snapshot must satisfy the interest rule for its viewer.
function assertInterest(snap, viewer, label) {
  const w = files.get('homefront-world.json'), me = w.players[viewer];
  if (!me) return;
  const party = me.partyCode ? w.parties[me.partyCode]?.members || [] : [];
  for (const p of snap.players || []) {
    const acct = Object.keys(w.players).find(a => id(a) === p.id);
    assert.ok(acct, label + ': unknown explorer id ' + p.id);
    if (acct === viewer || party.includes(acct)) continue;
    assert.ok(Math.hypot(w.players[acct].x - me.x, w.players[acct].z - me.z) <= World.INTEREST_RADIUS + 1e-6, label + ': stranger ' + p.id + ' sent beyond interest range');
    assert.equal(p.party, false, label + ': strangers are never flagged party');
    assert.equal(p.spawn, undefined, label + ': stranger spawn ids are not sent');
  }
  for (const e of snap.encounters || []) assert.ok(e.id && Math.hypot(e.x - me.x, e.z - me.z) <= World.INTEREST_RADIUS + 10 + 1e-6 || w.encounters[viewer]?.id === e.id, label + ': far encounter leaked');
}
(async () => {
  const [A, B, C, D] = ['rPvpAlpha', 'rPvpBravo', 'rPvpCharlie', 'rPvpDelta'];
  for (const k of [A, B, C, D]) assert.equal((await call('GET', '/api/homefront', k)).status, 200);
  assert.equal((await call('POST', W + '/pvp', null, { targetId: 'survivor-abc', aimPoint: { x: 0, z: 0 } })).status, 401, 'PvP needs a bearer token');
  // 1. Four players spawn far apart.
  const spawns = [];
  for (const k of [A, B, C, D]) { const r = await call('POST', W + '/enter', k, {}); assert.equal(r.status, 200); spawns.push(r.data.self); assertInterest(r.data, k, 'enter ' + k); }
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(Math.hypot(spawns[i].x - spawns[j].x, spawns[i].z - spawns[j].z) >= World.MIN_SPAWN_DISTANCE, 'spawns ' + i + '/' + j + ' are ≥ ' + World.MIN_SPAWN_DISTANCE + ' apart');
  for (const k of [A, B, C, D]) assert.equal((await call('GET', W, k)).data.players.length, 1, k + ' sees only itself after a far spawn');
  // A crowded world falls back to the frontier rim and still maximises distance.
  const crowd = World.defaultWorld();
  for (let i = 0; i < 12; i++) crowd.players['crowd' + i] = { ...World.SPAWNS[i % 6], x: World.SPAWNS[i % 6].x, z: World.SPAWNS[i % 6].z, lastSeen: Date.now(), partyCode: null, spawn: World.SPAWNS[i % 6].id };
  const pick = World.chooseSafeSpawn(World.normalizeWorld(crowd), 'newcomer');
  assert.match(pick.spawn.id, /^frontier_/, 'authored spawns all occupied → frontier rim spawn');
  assert.ok(pick.nearest >= 30, 'frontier pick keeps distance from the crowd (' + pick.nearest.toFixed(1) + ')');
  // 2. Interest: A and B close (strangers), C far; A sees B, not C. Party A+C: C on A's map anyway.
  place(A, -20, 30); place(B, -10, 30); place(C, 60, -60); place(D, -20, 80);
  let snapA = (await call('GET', W, A)).data; assertInterest(snapA, A, 'A near B');
  assert.deepEqual(snapA.players.map(p => p.id).sort(), [id(A), id(B)].sort(), 'A sees B (in range) but not C or D');
  assert.equal(snapA.interest.radius, World.INTEREST_RADIUS);
  const code = (await call('POST', W + '/party/create', A, {})).data.party.code;
  assert.equal((await call('POST', W + '/party/join', C, { code })).status, 200);
  place(C, 60, -60); // joining snaps C to the leader; move C far away again
  snapA = (await call('GET', W, A)).data; assertInterest(snapA, A, 'A with far party member');
  const cOnMap = snapA.players.find(p => p.id === id(C));
  assert.ok(cOnMap && cOnMap.party === true, 'party member C is sent (map) even far away and flagged party');
  assert.equal(snapA.players.find(p => p.id === id(B)).party, false, 'stranger B is flagged non-party');
  const snapD = (await call('GET', W, D)).data; assertInterest(snapD, D, 'D alone');
  assert.deepEqual(snapD.players.map(p => p.id), [id(D)], 'D receives nobody');
  // Fuzz: 24 random placements × all viewers × GET/move snapshots never leak a stranger beyond range.
  let seed = 7; const r = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let round = 0; round < 24; round++) {
    for (const k of [A, B, C, D]) place(k, Math.round(r() * 160 - 80), Math.round(r() * 160 - 80));
    for (const k of [A, B, C, D]) assertInterest((await call('GET', W, k)).data, k, 'fuzz ' + round + ' ' + k);
  }
  // 3. PvP between strangers: A (party with C) attacks B at melee range with the starter pipe blade.
  place(A, -20, 30); place(B, -18, 30); place(C, -21, 31);
  const before = files.get('homefront-world.json').players[B].survival.health;
  const hit = await call('POST', W + '/pvp', A, { targetId: id(B), aimPoint: { x: -18, z: 30 }, damage: 9999, rounds: 50, killed: true });
  assert.equal(hit.status, 200, JSON.stringify(hit.data));
  assert.equal(hit.data.pvp.rounds, 1, 'melee is one swing'); assert.ok(hit.data.pvp.damage <= 14, 'forged damage/rounds fields ignored');
  const after = files.get('homefront-world.json').players[B].survival.health;
  assert.equal(before - after, hit.data.pvp.damage, 'server-resolved damage applied to the stranger');
  assert.equal((await call('POST', W + '/pvp', A, { targetId: id(B), aimPoint: { x: -18, z: 30 } })).data.error, 'pvp_cooldown', 'second swing inside the interval is rejected');
  // 4. No friendly fire inside a party.
  edit(w => { w.players[A].lastPvpAt = 0; });
  assert.equal((await call('POST', W + '/pvp', A, { targetId: id(C), aimPoint: { x: -21, z: 31 } })).data.error, 'friendly_fire_blocked');
  assert.equal(files.get('homefront-world.json').players[C].survival.health, 100, 'party member untouched');
  // 5. Forged hits: off-target aim misses, unseen/unknown targets do not resolve, bad payloads rejected.
  edit(w => { w.players[A].lastPvpAt = 0; });
  const miss = await call('POST', W + '/pvp', A, { targetId: id(B), aimPoint: { x: 40, z: 40 } });
  assert.equal(miss.data.pvp.damage, 0, 'aim point away from the target misses every round');
  edit(w => { w.players[A].lastPvpAt = 0; }); place(D, 70, 70);
  assert.equal((await call('POST', W + '/pvp', A, { targetId: id(D), aimPoint: { x: 70, z: 70 } })).data.error, 'target_not_found', 'a stranger outside interest range cannot be targeted');
  for (const bad of [{ targetId: '__proto__', aimPoint: { x: 0, z: 0 } }, { targetId: id(B) }, { targetId: id(B), aimPoint: { x: 'a', z: 1 } }, { targetId: { toString: 1 }, aimPoint: { x: 0, z: 0 } }]) assert.equal((await call('POST', W + '/pvp', A, bad)).status, 400, 'bad payload ' + JSON.stringify(bad));
  place(B, -18, 30); edit(w => { w.players[A].lastPvpAt = 0; w.players[B].spawnedAt = Date.now(); });
  assert.equal((await call('POST', W + '/pvp', A, { targetId: id(B), aimPoint: { x: -18, z: 30 } })).data.error, 'target_spawn_protected');
  place(B, -18, 30); place(A, -20, 30);
  place(B, -30, 30); edit(w => { w.players[A].lastPvpAt = 0; });
  assert.equal((await call('POST', W + '/pvp', A, { targetId: id(B), aimPoint: { x: -30, z: 30 } })).data.error, 'target_out_of_range', 'melee range enforced');
  // Firearm burst: SMG owned + equipped, magazine 2 → only 2 rounds spent; 900 ms+ cadence.
  edit(w => { w.players[B].weaponMagazine = { weaponId: 'smg', loaded: 2 }; Object.assign(w.players[B], { lastPvpAt: 0 }); });
  const bases = files.get('homefront.json'); bases[B].weapons = [...new Set([...(bases[B].weapons || []), 'smg'])]; bases[B].equippedWeapon = 'smg'; bases[B].day = 9; bases[B].level = 2; files.set('homefront.json', bases);
  place(A, -20, 30); place(B, -26, 30);
  const burst = await call('POST', W + '/pvp', B, { targetId: id(A), aimPoint: { x: -20, z: 30 } });
  assert.equal(burst.status, 200, JSON.stringify(burst.data)); assert.equal(burst.data.pvp.rounds, 2, 'burst limited by the loaded magazine');
  assert.equal(files.get('homefront-world.json').players[B].weaponMagazine.loaded, 0);
  edit(w => { w.players[B].lastPvpAt = 0; });
  assert.equal((await call('POST', W + '/pvp', B, { targetId: id(A), aimPoint: { x: -20, z: 30 } })).data.error, 'reload_required');
  assert.ok(PvP.weaponProfile('smg').interval >= 900 && PvP.weaponProfile('fifty_cal').interval >= 900 && PvP.weaponProfile('pipe_blade').interval >= 900, 'every weapon ≥ 900 ms');
  // Kill → far respawn at reduced health.
  place(A, -20, 30); place(B, -18, 30); edit(w => { w.players[B].survival.health = 5; w.players[A].lastPvpAt = 0; });
  let kill = null;
  for (let i = 0; i < 6 && !kill?.data?.pvp?.killed; i++) { edit(w => { w.players[A].lastPvpAt = 0; w.players[B].spawnedAt = 0; Object.assign(w.players[B], { x: -18, z: 30 }); }); kill = await call('POST', W + '/pvp', A, { targetId: id(B), aimPoint: { x: -18, z: 30 } }); }
  assert.equal(kill.data.pvp.killed, true, 'lethal hit downs the target');
  const nb = files.get('homefront-world.json').players[B];
  assert.equal(nb.survival.health, PvP.RESPAWN_HEALTH); assert.ok(Math.hypot(nb.x + 20, nb.z - 30) > 30, 'downed player respawns far away');
  // 6. PvP is off in Homefront: D travels home; nobody can hit D, and D cannot shoot from home.
  place(D, -19, 31);
  assert.equal((await call('POST', W + '/leave', D, { travel: true })).status, 200);
  edit(w => { w.players[A].lastPvpAt = 0; });
  assert.equal((await call('POST', W + '/pvp', A, { targetId: id(D), aimPoint: { x: -19, z: 31 } })).data.error, 'pvp_disabled_in_homefront', 'a player at home cannot be hit');
  assert.equal((await call('POST', W + '/pvp', D, { targetId: id(A), aimPoint: { x: -20, z: 30 } })).data.error, 'pvp_disabled_in_homefront', 'a player at home cannot shoot');
  // Perf: 400 explorers, one snapshot stays bounded and only nearby strangers are sent.
  const big = World.defaultWorld(); const now = Date.now();
  for (let i = 0; i < 400; i++) big.players['p' + i] = { x: (i % 20) * 9 - 90, z: Math.floor(i / 20) * 9 - 90, lastSeen: now, partyCode: null, spawn: 'north_gate' };
  const nw = World.normalizeWorld(big); const t0 = process.hrtime.bigint(); const s = World.snapshot(nw, 'p210', now); const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(s.players.length < 80, '400-player snapshot sends only nearby explorers (' + s.players.length + ')');
  console.log('Homefront PvP + interest sim passed (far spawns, interest radius ' + World.INTEREST_RADIUS + ', party map, PvP/party/Homefront rules, forged hits; 400-player snapshot ' + ms.toFixed(1) + ' ms, ' + s.players.length + ' sent).');
})().catch(error => { console.error(error); process.exit(1); });
