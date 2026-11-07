'use strict';
const assert = require('node:assert/strict');
const Homefront = require('../server/homefront');
const { createGuestHandler } = require('../server/homefront-guest');
const { createOverworld } = require('../server/homefront-overworld');
const Loot = require('../server/homefront-loot');
const PvP = require('../server/homefront-pvp');
const World = require('../server/homefront-world');
const files = new Map();
const disk = {
  load: (name, fallback) => structuredClone(files.get(name) ?? fallback),
  save: (name, value) => files.set(name, structuredClone(value))
};
let now = Date.now();
const world = createOverworld({ store: disk });
const guests = createGuestHandler({ overworld: world, now: () => now });
const wallet = 'rSavedSurvivor';
async function call(token, path = '', method = 'GET', payload = {}) {
  let response;
  const context = { json: (_res, status, data) => { response = { status, data }; },
    gate: () => false, ip: token || 'new', body: async () => payload,
    who: () => ({ acct: wallet }), store: world.store };
  const req = { method, headers: { 'x-homefront-guest': token } };
  const url = new URL('http://local/api/homefront' + (token === null ? '' : '/guest') + path);
  await (token === null ? Homefront : guests).handle(req, {}, url, context);
  assert(response, path);
  return response;
}
function place(accounts, x, z) {
  const state = world.store.load('homefront-world.json', {});
  for (const account of accounts) Object.assign(state.players[account], { x, z, lastSeen: Date.now() });
  world.store.save('homefront-world.json', state);
}
(async () => {
  const a = await call('', '/start', 'POST');
  const b = await call('', '/start', 'POST');
  assert.equal(a.data.multiplayer, true);
  assert.equal(a.data.persistent, false);
  const tokens = [a.data.token, b.data.token];
  await call(null); // actual saved base
  const identities = [];
  for (const token of tokens) {
    const base = await call(token);
    identities.push(base.data.base.owner);
    assert.equal((await call(token, '/world/enter', 'POST', { account: wallet, x: 0, z: 0 })).status, 200);
  }
  const savedEntry = await call(null, '/world/enter', 'POST');
  assert.equal(savedEntry.status, 200);
  const savedBase = structuredClone(files.get('homefront.json'));
  const accounts = [...identities, wallet];
  let state = world.store.load('homefront-world.json', {});
  assert.equal(new Set(accounts.map(acct => state.refugeEntries[acct])).size, 3,
    'two visitors and one saved survivor receive distinct physical Homefront gates');
  const node = Loot.NODES.find(n => n.id === 'loot_pine_logging_kit');
  place(accounts, node.x, node.z);
  for (const token of [...tokens, null]) {
    const view = await call(token, '/world');
    assert.equal(view.data.players.length, 3, 'nearby presence is reciprocal across both authentication paths');
    assert(!JSON.stringify(view.data.players).includes('guest_'), 'public avatars hide private identities');
  }
  const claims = await Promise.all(tokens.map(token => call(token, '/world/loot', 'POST',
    { nodeId: node.id, account: wallet, reward: { scrap: 999999 } })));
  assert.equal(claims.filter(c => c.status === 200).length, 1, 'concurrent guests cannot duplicate public loot');
  assert.equal((await call(null, '/world/loot', 'POST', { nodeId: node.id })).data.error, 'loot_node_empty');
  assert.equal((await call(null, '/world')).data.world.lootNodes.find(n => n.id === node.id).available, false);
  assert.deepEqual(files.get('homefront.json'), savedBase, 'guest rewards never reach saved base inventories');
  assert(!JSON.stringify([...files]).includes('guest_'), 'disk contains no guest identity or personal progress');
  for (const path of ['/world/party/create', '/world/party/join', '/world/pvp', '/world/travel'])
    assert.equal((await call(tokens[0], path, 'POST', { code: 'AAAAAA', action: 'visit', member: wallet })).status, 403);
  assert.equal((await call(tokens[0], '/world/refuge?owner=' + wallet)).status, 404,
    'a guest cannot read a saved private base');
  // Same public building and room, without a party or separate guest instance.
  place(accounts, -9.1, -73.6);
  for (const token of [...tokens, null])
    assert.equal((await call(token, '/world/interior/enter', 'POST', { landmarkId: 'north_bus_depot' })).status, 200);
  for (const token of [...tokens, null]) {
    const view = await call(token, '/world/interior/presence');
    assert.equal(view.data.players.length, 3, 'guest and saved survivors can meet inside a common building');
  }
  state = world.store.load('homefront-world.json', {});
  assert.throws(() => PvP.attack(state, wallet, { targetId: World.snapshot(state, identities[0]).self.id,
    aimPoint: { x: -9.1, z: -73.6 }, base: savedEntry.data.base,
    visibleAccounts: World.visibleAccounts }), /guest_pvp_disabled/);
  const savedGate = state.refugeEntries[wallet];
  now += 90 * 60000 + 1;
  guests.sweep();
  state = world.store.load('homefront-world.json', {});
  for (const identity of identities) {
    assert(!state.players[identity]);
    assert(!state.refugeEntries[identity]);
    assert(!state.interiors[identity]);
  }
  assert.equal(state.refugeEntries[wallet], savedGate, 'guest expiry never relocates a saved Homefront');
  assert.equal((await call(tokens[0], '/world')).status, 401);
  const reboot = createOverworld({ store: disk });
  assert.equal(Object.keys(reboot.store.load('homefront-world.json', {}).players).length, 1);
  assert.equal(reboot.store.load('homefront-world.json', {}).lootNodes[node.id].readyAt,
    state.lootNodes[node.id].readyAt, 'shared cooldown persists across restart while guest progress does not');
  console.log('Homefront shared guest/wallet overworld: unique gates, reciprocal presence, common interiors, atomic loot, privacy and expiry passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
