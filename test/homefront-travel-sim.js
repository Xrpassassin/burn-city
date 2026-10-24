'use strict';
// RPG travel: private Homefront instance <-> shared world, parties held at home,
// "Travel with party", "Join friend's Homefront" and private-refuge 404s, through the real route handler.
const assert = require('node:assert/strict');
const { handle } = require('../server/homefront');
const Travel = require('../server/homefront-travel');

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
const ok = (r, msg) => { assert.equal(r.status, 200, msg + ' → ' + JSON.stringify(r.data)); return r.data; };
(async () => {
  const [A, B, C, D] = ['rTravelAlpha', 'rTravelBravo', 'rTravelCharlie', 'rTravelDelta'];
  assert.equal((await call('GET', W + '/travel', null)).status, 401, 'travel needs a bearer token');
  assert.equal((await call('GET', W + '/refuge?owner=' + A, null)).status, 401, 'refuge view needs a bearer token');
  // Every account gets a saved refuge (private by default).
  for (const k of [A, B, C, D]) ok(await call('GET', '/api/homefront', k), 'refuge for ' + k);
  // At home: everyone starts in their own private Homefront instance.
  for (const k of [A, B, C, D]) { const t = ok(await call('GET', W + '/travel', k), 'travel state').travel; assert.equal(t.space, 'homefront'); assert.equal(t.instance, 'own'); }
  // Private refuges: a stranger gets 404 on both the public visit route and the party route.
  assert.equal((await call('GET', '/api/homefront/visit?owner=' + A, D)).status, 404, 'public visit of a private refuge is 404');
  assert.equal((await call('GET', W + '/refuge?owner=' + A, D)).status, 404, 'stranger is not invited → 404');
  assert.equal((await call('GET', W + '/refuge?owner=' + A, A)).status, 200, 'owner can always see their refuge');
  // A forms a party at home; B and C join with the code; D stays a stranger.
  const code = ok(await call('POST', W + '/travel', A, { action: 'party_create' }), 'party create').code;
  assert.match(code, /^[0-9A-F]{6}$/);
  ok(await call('POST', W + '/travel', B, { action: 'party_join', code }), 'B joins');
  ok(await call('POST', W + '/travel', C, { action: 'party_join', code: code.toLowerCase() }), 'C joins (code case-insensitive)');
  assert.equal((await call('POST', W + '/travel', D, { action: 'party_join', code: '__proto__' })).data.error, 'party_not_found');
  // Party members are invited: private refuge readable by B; D still 404.
  const seen = ok(await call('GET', W + '/refuge?owner=' + A, B), 'party member sees private refuge');
  assert.equal(seen.party, true); assert.equal(seen.base.owner, undefined, 'base never exposes the owner field');
  assert.equal((await call('GET', W + '/refuge?owner=' + A, D)).status, 404, 'non-party still 404');
  // Join friend's Homefront: B visits A's instance by A's public id.
  const tA = ok(await call('GET', W + '/travel', B), 'B travel').travel;
  const aId = tA.party.members.find(m => m.leader).id;
  const visit = ok(await call('POST', W + '/travel', B, { action: 'visit', member: aId }), 'B joins A\'s Homefront');
  assert.equal(visit.host, A); assert.equal(visit.travel.instance, 'friend');
  assert.equal((await call('POST', W + '/travel', D, { action: 'visit', member: aId })).data.error, 'refuge_private_or_not_found', 'a stranger cannot join A\'s Homefront');
  assert.equal((await call('GET', W + '/refuge?member=' + aId, D)).status, 404, 'member ids do not resolve for strangers');
  // Travel with party: A (leader, at home) heads out with withParty; B (in A's instance) and C (own home) are summoned.
  const out = ok(await call('POST', W + '/enter', A, { withParty: true }), 'A travels with party');
  assert.ok(out.self, 'A is in the world'); assert.equal(out.party?.code, code, 'party survives the trip out');
  const tB = ok(await call('GET', W + '/travel', B), 'B poll').travel;
  const tC = ok(await call('GET', W + '/travel', C), 'C poll').travel;
  assert.ok(tB.pendingTravel, 'B (in A\'s Homefront) is summoned'); assert.ok(tC.pendingTravel, 'C (own Homefront) is summoned');
  const bOut = ok(await call('POST', W + '/enter', B, {}), 'B completes the trip');
  assert.equal(bOut.party?.code, code, 'B rejoins the same party in the world');
  const a = files.get('homefront-world.json').players[A], b = files.get('homefront-world.json').players[B];
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 8, 'B regroups beside the leader');
  // A returns home with travel:true: the party is kept and A is at home again; B (follower) is not frozen.
  const back = ok(await call('POST', W + '/leave', A, { travel: true }), 'A returns home');
  assert.equal(back.self, null);
  const tA2 = ok(await call('GET', W + '/travel', A), 'A home').travel;
  assert.equal(tA2.space, 'homefront'); assert.equal(tA2.party?.code, code, 'party held while A is home');
  const wNow = files.get('homefront-world.json'); wNow.players[B].lastMove = 0;
  const bMove = await call('POST', W + '/move', B, { x: b.x + 4, z: b.z });
  assert.equal(bMove.status, 200, 'a follower can move while the leader is at home: ' + JSON.stringify(bMove.data));
  // Legacy leave (no travel flag) still drops the party like before.
  const bLeave = ok(await call('POST', W + '/leave', B, {}), 'B legacy leave');
  assert.equal(bLeave.self, null);
  assert.ok(!files.get('homefront-world.json').parties[code].members.includes(B), 'legacy leave removes party membership');
  // Unknown actions / prototype keys are rule errors, not 500s.
  assert.equal((await call('POST', W + '/travel', A, { action: 'constructor' })).data.error, 'unknown_travel_action');
  assert.equal((await call('GET', W + '/refuge?owner=__proto__', A)).status, 404);
  // Presence expiry: a stale Homefront presence drops out of the party after the TTL.
  const w2 = files.get('homefront-world.json'); w2.homefronts[C].lastSeen = Date.now() - Travel.HOME_TTL - 1000; files.set('homefront-world.json', w2);
  ok(await call('POST', W + '/enter', D, {}), 'D enters (world tick prunes presence)');
  assert.ok(!files.get('homefront-world.json').parties[code].members.includes(C), 'stale home presence leaves the party');
  assert.ok(files.get('homefront-world.json').parties[code].members.includes(A), 'fresh home presence keeps its seat');
  console.log('Homefront RPG travel sim passed (instances, party held at home, travel with party, join friend\'s Homefront, private 404s).');
})().catch(error => { console.error(error); process.exit(1); });
