import assert from 'node:assert/strict';
const pending = [];
let starts = 0;
const priorFetch = globalThis.fetch;
globalThis.fetch = async url => {
  if (url.endsWith('/start')) return new Response(JSON.stringify({ token: (++starts % 16).toString(16).repeat(64) }), { status: 200 });
  return new Promise(resolve => pending.push(() => resolve(new Response(JSON.stringify({ error: 'guest_session_expired' }), { status: 401 }))));
};
const guest = await import('../client/arena/homefront-guest.mjs');
try {
  await Promise.all([guest.startGuest(''), guest.startGuest('')]);
  assert.equal(starts, 1, 'concurrent start calls share a single session');
  const a = guest.fetchHomefront('', '/api/homefront/world');
  const b = guest.fetchHomefront('', '/api/homefront/action', { method: 'POST' });
  guest.endGuest();
  await guest.startGuest('');
  const replacement = guest.getGuestToken();
  pending[0](); pending[1]();
  await Promise.all([a, b]);
  assert.equal(guest.getGuestToken(), replacement, 'two stale responses never clear a replacement guest');

  // Also cover restart AFTER the stale handler begins asynchronous JSON parsing.
  let finishParsing;
  let parsingStarted;
  const parsing = new Promise(resolve => { parsingStarted = resolve; });
  globalThis.fetch = async () => ({ status: 401, clone: () => ({ json: () => {
    parsingStarted();
    return new Promise(resolve => { finishParsing = resolve; });
  } }) });
  const delayed = guest.fetchHomefront('', '/api/homefront/world');
  await parsing;
  guest.endGuest();
  globalThis.fetch = priorFetch;
  // Supply another purely synthetic start; no network is involved.
  globalThis.fetch = async () => new Response(JSON.stringify({ token: 'f'.repeat(64) }), { status: 200 });
  await guest.startGuest('');
  finishParsing({ error: 'guest_session_expired' });
  await delayed;
  assert.equal(guest.getGuestToken(), 'f'.repeat(64), 'equality must be rechecked after response parsing');

  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'guest_session_expired' }), { status: 401 });
  await guest.fetchHomefront('', '/api/homefront/world');
  assert.equal(guest.getGuestToken(), '', 'current-session expiry still clears its own capability');
  console.log('Homefront concurrent starts and stale 401 ordering passed');
} finally {
  guest.endGuest();
  globalThis.fetch = priorFetch;
}
