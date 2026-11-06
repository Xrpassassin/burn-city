'use strict';
const assert = require('node:assert/strict');
const { createGuestHandler } = require('../server/homefront-guest.js');
let now = 0;
const hits = new Map();
const gate = (key, limit, window) => {
  const values = (hits.get(key) || []).filter(time => now - time < window);
  values.push(now); hits.set(key, values);
  return values.length > limit;
};
function harness(handler = createGuestHandler({ now: () => now })) {
  return async (ip, suffix = '/start', token = '') => {
    let result;
    const handled = await handler.handle({ method: suffix === '/start' ? 'POST' : 'GET',
      headers: { 'x-homefront-guest': token } }, {}, new URL('http://local/api/homefront/guest' + suffix), {
      json: (_res, status, data) => { result = { status, data }; },
      gate, ip, body: async () => ({})
    });
    assert(handled);
    return result;
  };
}
(async () => {
  const ask = harness();
  let previous = '';
  for (let minute = 0; minute < 15; minute++) {
    now = minute * 60001;
    for (let i = 0; i < 12; i++) {
      const result = await ask('reloader', '/start', i % 2 ? previous : '');
      assert.equal(result.status, 200);
      previous = result.data.token;
    }
  }
  assert.equal((await ask('new-player')).status, 200,
    'one IP cannot consume the whole global session budget through reloads');

  // Only the caller's oldest slots are replaced; a different caller survives.
  const bounded = harness(createGuestHandler({ now: () => now, maxSessions: 4, maxPerIp: 2 }));
  const other = (await bounded('other')).data.token;
  const old = (await bounded('same-ip')).data.token;
  await bounded('same-ip');
  const latest = (await bounded('same-ip')).data.token;
  assert.equal((await bounded('same-ip', '', old)).status, 401);
  assert.equal((await bounded('same-ip', '', latest)).status, 200);
  assert.equal((await bounded('other', '', other)).status, 200);

  // Unused credentials cannot hold capacity for the full 90-minute play TTL.
  const ttl = harness(createGuestHandler({ now: () => now, maxSessions: 2 }));
  const unclaimed = (await ttl('unclaimed')).data.token;
  const active = (await ttl('active')).data.token;
  assert.equal((await ttl('active', '', active)).status, 200);
  now += 5 * 60000;
  assert.equal((await ttl('unclaimed', '', unclaimed)).status, 401);
  assert.equal((await ttl('active', '', active)).status, 200);
  assert.equal((await ttl('replacement')).status, 200);
  console.log('Homefront guest bounded admission, reloads and unclaimed expiry passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
